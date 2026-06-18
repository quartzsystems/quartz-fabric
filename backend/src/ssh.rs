use anyhow::{anyhow, Result};
use async_trait::async_trait;
use regex::Regex;
use russh::client;
use russh::ChannelMsg;
use russh_keys::PublicKey;
use std::sync::Arc;
use tokio::time::{timeout, Duration};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct DeviceCreds {
    pub ip: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub connect_timeout_secs: u64,
    pub read_timeout_secs: u64,
}

#[derive(Debug, Default)]
pub struct InterfaceInfo {
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub speed: Option<String>,
    pub duplex: Option<String>,
}

#[derive(Debug, Default)]
pub struct ArpInfo {
    pub ip_address: String,
    pub mac_address: String,
    pub interface: Option<String>,
    pub age_minutes: Option<String>,
}

#[derive(Debug, Default)]
pub struct MacInfo {
    pub mac_address: String,
    pub vlan: Option<String>,
    pub interface: Option<String>,
    pub entry_type: Option<String>,
}

#[derive(Debug, Default)]
pub struct PollResult {
    pub os_version: Option<String>,
    pub model: Option<String>,
    pub serial_number: Option<String>,
    pub uptime: Option<String>,
    pub cpu_pct: Option<u8>,
    pub mem_pct: Option<u8>,
    pub interfaces: Vec<InterfaceInfo>,
    pub arp_entries: Vec<ArpInfo>,
    pub mac_entries: Vec<MacInfo>,
}

// ─── russh client handler ────────────────────────────────────────────────────

struct SshHandler;

#[async_trait]
impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO: persist and verify fingerprints in production
        Ok(true)
    }
}

// ─── Public entry point ───────────────────────────────────────────────────────

pub async fn poll_device(creds: DeviceCreds) -> Result<PollResult> {
    let connect_timeout = Duration::from_secs(creds.connect_timeout_secs);
    let read_timeout = Duration::from_secs(creds.read_timeout_secs);

    let config = Arc::new(client::Config {
        inactivity_timeout: Some(read_timeout),
        ..<client::Config as Default>::default()
    });

    let addr = format!("{}:{}", creds.ip, creds.port);
    let mut session = timeout(
        connect_timeout + Duration::from_secs(5),
        client::connect(config, addr.as_str(), SshHandler),
    )
    .await
    .map_err(|_| anyhow!("SSH connect to {} timed out", creds.ip))?
    .map_err(|e| anyhow!("SSH connect to {}: {e}", creds.ip))?;

    let authenticated = session
        .authenticate_password(creds.username.clone(), creds.password.clone())
        .await
        .map_err(|e| anyhow!("SSH auth for {}: {e}", creds.ip))?;

    if !authenticated {
        return Err(anyhow!(
            "SSH authentication failed for {} — check credentials",
            creds.ip
        ));
    }

    let outputs = run_shell_commands(&mut session, read_timeout).await?;

    let mut result = PollResult::default();

    if let Some(ver_out) = outputs.get(0) {
        let (os_version, model, serial, uptime) = parse_show_version(ver_out);
        result.os_version = os_version;
        result.model = model;
        result.serial_number = serial;
        result.uptime = uptime;
    }
    if let Some(cpu_out) = outputs.get(1) {
        result.cpu_pct = parse_cpu(cpu_out);
    }
    if let Some(mem_out) = outputs.get(2) {
        result.mem_pct = parse_memory(mem_out);
    }
    if let Some(iface_out) = outputs.get(3) {
        result.interfaces = parse_interfaces(iface_out);
    }
    if let Some(arp_out) = outputs.get(4) {
        result.arp_entries = parse_arp(arp_out);
    }
    if let Some(mac_out) = outputs.get(5) {
        result.mac_entries = parse_mac(mac_out);
    }

    Ok(result)
}

// ─── SSH shell session ────────────────────────────────────────────────────────

const COMMANDS: &[&str] = &[
    "show version",
    "show processes cpu",
    "show memory",
    "show interfaces status",
    "show arp",
    "show mac-address-table",
];

async fn run_shell_commands(
    session: &mut client::Handle<SshHandler>,
    read_timeout: Duration,
) -> Result<Vec<String>> {
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| anyhow!("open session channel: {e}"))?;

    channel
        .request_pty(false, "vt100", 200, 50, 0, 0, &[])
        .await
        .map_err(|e| anyhow!("PTY request: {e}"))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| anyhow!("shell request: {e}"))?;

    // Drain initial banner/MOTD and wait for first prompt
    read_to_prompt(&mut channel, read_timeout).await?;

    // Disable CLI pagination
    send_line(&mut channel, "terminal length 0").await?;
    read_to_prompt(&mut channel, read_timeout).await?;

    let mut results = Vec::with_capacity(COMMANDS.len());
    for &cmd in COMMANDS {
        send_line(&mut channel, cmd).await?;
        let raw = read_to_prompt(&mut channel, read_timeout).await?;
        results.push(strip_echo_and_prompt(&raw, cmd));
    }

    send_line(&mut channel, "exit").await.ok();
    channel.eof().await.ok();

    Ok(results)
}

async fn send_line(channel: &mut russh::Channel<client::Msg>, cmd: &str) -> Result<()> {
    let payload = format!("{}\n", cmd);
    channel
        .data(payload.as_bytes())
        .await
        .map_err(|e| anyhow!("SSH write: {e}"))
}

async fn read_to_prompt(
    channel: &mut russh::Channel<client::Msg>,
    read_timeout: Duration,
) -> Result<String> {
    let mut accumulated: Vec<u8> = Vec::new();

    loop {
        let msg = match timeout(read_timeout, channel.wait()).await {
            Ok(Some(m)) => m,
            Ok(None) | Err(_) => break,
        };

        match msg {
            ChannelMsg::Data { data } => {
                accumulated.extend_from_slice(&data);
                let text = String::from_utf8_lossy(&accumulated);
                let clean = strip_ansi(&text);

                if clean.contains("--More--") {
                    channel.data(&b" "[..]).await.ok();
                }

                if is_at_prompt(&clean) {
                    break;
                }
            }
            ChannelMsg::Eof | ChannelMsg::Close => break,
            _ => {}
        }
    }

    Ok(String::from_utf8_lossy(&accumulated).into_owned())
}

fn is_at_prompt(text: &str) -> bool {
    if let Some(last) = text.lines().filter(|l| !l.trim().is_empty()).last() {
        let t = last.trim();
        return t.ends_with('#') || t.ends_with('>');
    }
    false
}

fn strip_ansi(s: &str) -> String {
    let re = Regex::new(r"\x1b\[[0-9;]*[A-Za-z]|\x1b[()][A-B]|\r").unwrap();
    re.replace_all(s, "").into_owned()
}

fn strip_echo_and_prompt(raw: &str, cmd: &str) -> String {
    let clean = strip_ansi(raw);
    let mut lines: Vec<&str> = clean.lines().collect();

    if lines.first().map(|l| l.trim().contains(cmd)).unwrap_or(false) {
        lines.remove(0);
    }
    if lines
        .last()
        .map(|l| {
            let t = l.trim();
            !t.is_empty() && (t.ends_with('#') || t.ends_with('>'))
        })
        .unwrap_or(false)
    {
        lines.pop();
    }

    lines.join("\n")
}

// ─── Output parsers ───────────────────────────────────────────────────────────

fn parse_show_version(
    output: &str,
) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    let re_ver = Regex::new(r"(?i)Dell Networking OS Version\s*:\s*(.+)").unwrap();
    let re_type = Regex::new(r"(?i)System Type\s*:\s*(.+)").unwrap();
    let re_serial = Regex::new(r"(?i)Serial [Nn]umber\s*:\s*(.+)").unwrap();
    let re_uptime = Regex::new(r"(?i)Uptime\s*:\s*(.+)").unwrap();

    (
        re_ver.captures(output).map(|c| c[1].trim().to_string()),
        re_type.captures(output).map(|c| c[1].trim().to_string()),
        re_serial.captures(output).map(|c| c[1].trim().to_string()),
        re_uptime.captures(output).map(|c| c[1].trim().to_string()),
    )
}

fn parse_cpu(output: &str) -> Option<u8> {
    let re = Regex::new(r"(?i)CPU utilization[^:]*:\s*(\d+)%").unwrap();
    re.captures(output).and_then(|c| c[1].parse::<u8>().ok())
}

fn parse_memory(output: &str) -> Option<u8> {
    let re =
        Regex::new(r"Total\s*:\s*(\d+)\s+Used\s*:\s*(\d+)\s+Free\s*:\s*(\d+)").unwrap();
    re.captures(output).and_then(|c| {
        let total: u64 = c[1].parse().ok()?;
        let used: u64 = c[2].parse().ok()?;
        if total == 0 {
            return None;
        }
        Some(((used as f64 / total as f64) * 100.0).round() as u8)
    })
}

fn parse_interfaces(output: &str) -> Vec<InterfaceInfo> {
    let re = Regex::new(
        r"(?x)
        ^((?:Te|Fo|Hu|Gi|Mg|Po|Vl|Ma|Eth)\s+[\d/]+)
        \s{2,}(\S+)
        \s+(\S+)
        \s+(Up|Down|Error|!\+?|\+)
        \s*(.*)$
        ",
    )
    .unwrap();

    output
        .lines()
        .filter_map(|line| {
            let caps = re.captures(line)?;
            Some(InterfaceInfo {
                name: caps[1].trim().to_string(),
                speed: if &caps[2] == "-" { None } else { Some(caps[2].to_string()) },
                duplex: if &caps[3] == "-" { None } else { Some(caps[3].to_string()) },
                status: caps[4].trim().to_string(),
                description: {
                    let d = caps[5].trim().to_string();
                    if d.is_empty() { None } else { Some(d) }
                },
            })
        })
        .collect()
}

fn parse_arp(output: &str) -> Vec<ArpInfo> {
    let re = Regex::new(
        r"(?x)
        ^Internet\s+
        ([\d.]+)\s+
        (\S+)\s+
        ([\da-fA-F:]+)\s+
        (.+)$
        ",
    )
    .unwrap();

    output
        .lines()
        .filter_map(|line| {
            let caps = re.captures(line.trim())?;
            Some(ArpInfo {
                ip_address: caps[1].to_string(),
                age_minutes: if &caps[2] == "-" { None } else { Some(caps[2].to_string()) },
                mac_address: caps[3].to_lowercase(),
                interface: Some(caps[4].trim().to_string()),
            })
        })
        .collect()
}

fn parse_mac(output: &str) -> Vec<MacInfo> {
    let re = Regex::new(
        r"(?x)
        ^(\d+)\s+
        ([\da-fA-F:]+)\s+
        (\S+)\s+
        (.+)$
        ",
    )
    .unwrap();

    output
        .lines()
        .filter_map(|line| {
            let caps = re.captures(line.trim())?;
            Some(MacInfo {
                vlan: Some(caps[1].to_string()),
                mac_address: caps[2].to_lowercase(),
                entry_type: Some(caps[3].to_string()),
                interface: Some(caps[4].trim().to_string()),
            })
        })
        .collect()
}
