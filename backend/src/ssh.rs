use anyhow::{anyhow, Result};
use async_trait::async_trait;
use regex::Regex;
use russh::client;
use russh::ChannelMsg;
use russh_keys::PublicKey;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::time::{timeout, Duration};
use tracing::debug;

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
pub struct VlanInfo {
    pub vlan_id: i64,
    pub name: Option<String>,
    pub status: String,
    pub tagged_ports: Option<String>,
    pub untagged_ports: Option<String>,
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
    pub vlans: Vec<VlanInfo>,
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
        Ok(true)
    }
}

// ─── Poll entry point ─────────────────────────────────────────────────────────

const POLL_COMMANDS: &[&str] = &[
    "show version",               // 0
    "show processes cpu",         // 1
    "show memory",                // 2
    "show interfaces status",     // 3
    "show running-config",        // 4
    "show arp",                   // 5
    "show mac-address-table",     // 6
    "show vlan",                  // 7
];

pub async fn poll_device(creds: DeviceCreds) -> Result<PollResult> {
    let connect_timeout = Duration::from_secs(creds.connect_timeout_secs);
    let read_timeout = Duration::from_secs(creds.read_timeout_secs);

    let mut session = connect_ssh(&creds, connect_timeout, read_timeout).await?;
    let outputs = run_commands(&mut session, read_timeout, POLL_COMMANDS).await?;

    // Debug-log raw outputs so operators can see exactly what the switch returns
    for (cmd, out) in POLL_COMMANDS.iter().zip(outputs.iter()) {
        debug!(
            "SSH poll [{}] ({} bytes):\n{}",
            cmd,
            out.len(),
            &out[..out.len().min(1200)]
        );
    }

    let mut result = PollResult::default();

    if let Some(ver_out) = outputs.first() {
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
    if let Some(rc_out) = outputs.get(4) {
        let rc_data = parse_running_config_interfaces(rc_out);
        for iface in &mut result.interfaces {
            let key = canon_iface(&iface.name);
            if let Some(data) = rc_data.get(&key) {
                if let Some(d) = &data.0 {
                    iface.description = Some(d.clone());
                }
                if let Some(d) = &data.1 {
                    iface.duplex = Some(d.clone());
                }
            }
        }
    }
    if let Some(arp_out) = outputs.get(5) {
        result.arp_entries = parse_arp(arp_out);
    }
    if let Some(mac_out) = outputs.get(6) {
        result.mac_entries = parse_mac(mac_out);
    }
    if let Some(vlan_out) = outputs.get(7) {
        result.vlans = parse_vlans(vlan_out);
    }

    Ok(result)
}

// ─── Exec entry point ─────────────────────────────────────────────────────────

pub async fn exec_command(creds: DeviceCreds, command: &str) -> Result<String> {
    let connect_timeout = Duration::from_secs(creds.connect_timeout_secs);
    // Use a longer timeout for exec (user is waiting interactively)
    let read_timeout = Duration::from_secs(creds.read_timeout_secs.max(60));

    let mut session = connect_ssh(&creds, connect_timeout, read_timeout).await?;

    let lines: Vec<&str> = command.lines().filter(|l| !l.trim().is_empty()).collect();
    let outputs = run_commands(&mut session, read_timeout, &lines).await?;

    Ok(outputs.join("\n").trim().to_string())
}

// ─── SSH helpers ──────────────────────────────────────────────────────────────

async fn connect_ssh(
    creds: &DeviceCreds,
    connect_timeout: Duration,
    read_timeout: Duration,
) -> Result<client::Handle<SshHandler>> {
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
        return Err(anyhow!("SSH authentication failed for {}", creds.ip));
    }

    Ok(session)
}

async fn run_commands(
    session: &mut client::Handle<SshHandler>,
    read_timeout: Duration,
    commands: &[&str],
) -> Result<Vec<String>> {
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| anyhow!("open session channel: {e}"))?;

    channel
        .request_pty(false, "vt100", 220, 50, 0, 0, &[])
        .await
        .map_err(|e| anyhow!("PTY request: {e}"))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| anyhow!("shell request: {e}"))?;

    read_to_prompt(&mut channel, read_timeout).await?;

    send_line(&mut channel, "terminal length 0").await?;
    read_to_prompt(&mut channel, read_timeout).await?;

    let mut results = Vec::with_capacity(commands.len());
    for &cmd in commands {
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
    // Strip ANSI escape sequences, carriage returns, and stray control chars
    let re = Regex::new(
        r"\x1b\[[0-9;]*[A-Za-z]|\x1b[()][A-B]|\r|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]",
    )
    .unwrap();
    re.replace_all(s, "").into_owned()
}

fn strip_echo_and_prompt(raw: &str, cmd: &str) -> String {
    let clean = strip_ansi(raw);
    let mut lines: Vec<&str> = clean.lines().collect();

    if lines.first().map(|l| l.trim().contains(cmd.trim())).unwrap_or(false) {
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
    // OS Version — try multiple patterns in preference order
    let os_version = [
        // "Dell [EMC] Networking OS[10], Version X.Y.Z"
        r"(?i)Dell\s+(?:EMC\s+)?Networking\s+OS(?:10)?\s*,\s*Version\s+([0-9]\S+)",
        // "Dell Networking OS Version : X.Y.Z"
        r"(?i)Dell\s+(?:EMC\s+)?Networking\s+OS(?:10)?\s+Version\s*:\s*([0-9]\S+)",
        // "Version : X.Y.Z"  (fallback — any line with Version:)
        r"(?i)\bVersion\s*:\s*([0-9][0-9.a-zA-Z_-]+)",
    ]
    .iter()
    .find_map(|pat| {
        Regex::new(pat)
            .ok()?
            .captures(output)
            .map(|c| c[1].trim().to_string())
    });

    // Model — "System Type: Z9100-ON"
    let model = [
        r"(?i)System\s+Type\s*:\s*(\S+)",
        r"(?i)Platform\s*:\s*(\S+)",
        r"(?i)Chassis\s+Type\s*:\s*(\S+)",
    ]
    .iter()
    .find_map(|pat| {
        Regex::new(pat)
            .ok()?
            .captures(output)
            .map(|c| c[1].trim().to_string())
    });

    // Serial number
    let serial = [
        r"(?i)Serial\s+Number\s*:\s*(\S+)",
        r"(?i)Chassis\s+Serial\s+Num\w*\s*:\s*(\S+)",
        r"(?i)System\s+Serial\s+Num\w*\s*:\s*(\S+)",
        r"(?i)Service\s+Tag\s*:\s*(\S+)",
    ]
    .iter()
    .find_map(|pat| {
        Regex::new(pat).ok()?.captures(output).and_then(|c| {
            let s = c[1].trim().to_string();
            // Skip placeholder-looking values
            if s.to_uppercase() == "N/A" || s == "-" || s.is_empty() {
                None
            } else {
                Some(s)
            }
        })
    });

    // Uptime
    let uptime = [
        r"(?i)Uptime\s*:\s*(.+)",
        r"(?i)System\s+[Uu]ptime\s*:\s*(.+)",
        r"(?i)uptime\s+is\s+(.+)",
    ]
    .iter()
    .find_map(|pat| {
        Regex::new(pat)
            .ok()?
            .captures(output)
            .map(|c| c[1].trim().to_string())
    });

    (os_version, model, serial, uptime)
}

fn parse_cpu(output: &str) -> Option<u8> {
    [
        r"(?i)CPU\s+utilization[^:]*:\s*(\d+)%",
        r"(?i)CPU\s+Usage\s*:\s*(\d+)%",
        r"(?i)5\s+Secs\s*:\s*(\d+)%",
    ]
    .iter()
    .find_map(|pat| {
        Regex::new(pat)
            .ok()?
            .captures(output)
            .and_then(|c| c[1].parse::<u8>().ok())
    })
}

fn parse_memory(output: &str) -> Option<u8> {
    // Format 1 — "Total(KB)  Used(KB)  Free(KB)" header, then numbers on next line(s)
    if let Some(caps) = Regex::new(
        r"(?i)Total\(KB\)\s+Used\(KB\)\s+Free\(KB\)\s+(\d+)\s+(\d+)\s+(\d+)",
    )
    .ok()?
    .captures(output)
    {
        let total: u64 = caps[1].parse().ok()?;
        let used: u64 = caps[2].parse().ok()?;
        if total > 0 {
            return Some(((used as f64 / total as f64) * 100.0).round() as u8);
        }
    }

    // Format 2 — "Total  Used  Free  ..." header then "In bytes: N N N ..."
    if let Some(caps) =
        Regex::new(r"(?i)In bytes:\s+(\d{5,})\s+(\d{5,})\s+(\d{5,})")
            .ok()?
            .captures(output)
    {
        let total: u64 = caps[1].parse().ok()?;
        let used: u64 = caps[2].parse().ok()?;
        if total > 0 {
            return Some(((used as f64 / total as f64) * 100.0).round() as u8);
        }
    }

    // Format 3 — "Total : N  Used : N  Free : N"
    if let Some(caps) =
        Regex::new(r"(?i)Total\s*:\s*(\d+)\s+Used\s*:\s*(\d+)\s+Free\s*:\s*(\d+)")
            .ok()?
            .captures(output)
    {
        let total: u64 = caps[1].parse().ok()?;
        let used: u64 = caps[2].parse().ok()?;
        if total > 0 {
            return Some(((used as f64 / total as f64) * 100.0).round() as u8);
        }
    }

    // Format 4 — "Total  Used  Free" without (KB), values follow on same or next line
    // Match three large consecutive digit groups after the header
    if let Some(caps) = Regex::new(
        r"(?i)Total\s+Used\s+Free(?:\s+\S+)*\s+(\d{4,})\s+(\d{4,})\s+(\d{4,})",
    )
    .ok()?
    .captures(output)
    {
        let total: u64 = caps[1].parse().ok()?;
        let used: u64 = caps[2].parse().ok()?;
        if total > 0 {
            return Some(((used as f64 / total as f64) * 100.0).round() as u8);
        }
    }

    None
}

fn parse_interfaces(output: &str) -> Vec<InterfaceInfo> {
    let port_re =
        Regex::new(r"(?i)^((?:Te|Fo|Hu|Gi|Mg|Ma|Po|Vl|Eth)\s+[\d/:]+)(.*)").unwrap();
    let status_re = Regex::new(r"(?i)\b(Up|Down)\b").unwrap();

    output
        .lines()
        .filter_map(|line| {
            let caps = port_re.captures(line.trim_start())?;
            let name = caps[1].trim().to_string();
            let rest = caps[2].to_string();

            let status_match = status_re.find(&rest)?;
            let status = status_match.as_str().to_string();

            let desc_raw = rest[..status_match.start()].trim().to_string();
            let description = if desc_raw.is_empty() { None } else { Some(desc_raw) };

            let after = rest[status_match.end()..].trim().to_string();
            let tokens: Vec<&str> = after.split_whitespace().collect();
            let mut idx = 0;

            // Dell OS9 shows two state columns (admin + oper) on no-description lines;
            // skip any extra Up/Down tokens so we land on the actual speed value.
            while idx < tokens.len()
                && (tokens[idx].eq_ignore_ascii_case("up")
                    || tokens[idx].eq_ignore_ascii_case("down"))
            {
                idx += 1;
            }

            // Speed may be two tokens: "10000 Mbit/s" or "100000 Mbit" — combine them
            let speed = if idx < tokens.len() {
                let s = tokens[idx];
                idx += 1;
                if idx < tokens.len() && tokens[idx].to_ascii_lowercase().starts_with("mbit") {
                    let combined = format!("{} {}", s, tokens[idx]);
                    idx += 1;
                    Some(combined)
                } else {
                    Some(s.to_string())
                }
            } else {
                None
            };

            // Duplex is the next token after speed (Full, Half, Auto, etc.)
            let duplex = tokens.get(idx).map(|s| s.to_string());

            Some(InterfaceInfo {
                name,
                description,
                status,
                speed,
                duplex,
            })
        })
        .collect()
}

/// Normalize a full or abbreviated interface name to lowercase abbreviated form,
/// e.g. "TenGigabitEthernet 1/33" → "te 1/33", "Te 1/33" → "te 1/33".
fn canon_iface(name: &str) -> String {
    let s = name.trim().to_lowercase();
    let s = s
        .replace("tengigabitethernet", "te")
        .replace("hundredgigabitethernet", "hu")
        .replace("fortygigabitethernet", "fo")
        .replace("gigabitethernet", "gi")
        .replace("managementethernet", "ma")
        .replace("portchannel", "po")
        .replace("vlan", "vl");
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Parse `show running-config` and return a map of canonicalized interface name →
/// (description, configured_duplex).  Both values are optional.
fn parse_running_config_interfaces(
    output: &str,
) -> HashMap<String, (Option<String>, Option<String>)> {
    let iface_re = Regex::new(
        r"(?i)^interface\s+((?:TenGigabitEthernet|HundredGigabitEthernet|FortyGigabitEthernet|GigabitEthernet|ManagementEthernet|PortChannel|Vlan)\s+[\d/:]+)"
    ).unwrap();

    let mut result: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();
    let mut cur_name: Option<String> = None;
    let mut cur_desc: Option<String> = None;
    let mut cur_duplex: Option<String> = None;

    for line in output.lines() {
        if let Some(caps) = iface_re.captures(line) {
            if let Some(n) = cur_name.take() {
                result.insert(n, (cur_desc.take(), cur_duplex.take()));
            }
            cur_name = Some(canon_iface(caps[1].trim()));
        } else if cur_name.is_some() {
            let trimmed = line.trim();
            if trimmed == "!" {
                if let Some(n) = cur_name.take() {
                    result.insert(n, (cur_desc.take(), cur_duplex.take()));
                }
            } else if let Some(desc) = trimmed.strip_prefix("description ") {
                cur_desc = Some(desc.trim().to_string());
            } else if trimmed.eq_ignore_ascii_case("auto-negotiation") {
                cur_duplex = Some("Auto".to_string());
            } else if trimmed.eq_ignore_ascii_case("no auto-negotiation") {
                cur_duplex = Some("Full".to_string());
            } else if let Some(val) = trimmed.strip_prefix("duplex ") {
                cur_duplex = Some(match val.trim().to_lowercase().as_str() {
                    "full" => "Full".to_string(),
                    "half" => "Half".to_string(),
                    _      => "Auto".to_string(),
                });
            }
        }
    }
    if let Some(n) = cur_name.take() {
        result.insert(n, (cur_desc.take(), cur_duplex.take()));
    }
    result
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
                age_minutes: if &caps[2] == "-" {
                    None
                } else {
                    Some(caps[2].to_string())
                },
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

fn parse_vlans(output: &str) -> Vec<VlanInfo> {
    // Match a VLAN entry line: optional * prefix, VLAN ID, status, rest
    let vlan_re =
        Regex::new(r"(?i)^\*?\s*(\d+)\s+(Active|Inactive|Suspend)\s*(.*)").unwrap();
    // Match continuation qualifier line: "   T Te 1/1, Te 1/2"
    let qual_re = Regex::new(r"^\s+([TU])\s+(.+)").unwrap();

    let mut vlans: Vec<VlanInfo> = Vec::new();
    let mut current: Option<VlanInfo> = None;
    let mut last_qualifier = 'U';

    for line in output.lines() {
        if let Some(caps) = vlan_re.captures(line) {
            if let Some(v) = current.take() {
                vlans.push(v);
            }

            let vlan_id: i64 = caps[1].parse().unwrap_or(0);
            let status = caps[2].to_lowercase();
            let rest = caps[3].trim().to_string();

            let mut v = VlanInfo {
                vlan_id,
                status,
                ..Default::default()
            };

            // Rest format: "Description  Q Ports" or "Description" or empty
            // Look for tagged/untagged qualifier embedded in the rest
            parse_vlan_rest(&mut v, &rest, &mut last_qualifier);
            current = Some(v);
        } else if let Some(caps) = qual_re.captures(line) {
            if let Some(v) = current.as_mut() {
                let q = caps[1].chars().next().unwrap_or('U');
                last_qualifier = q;
                append_ports(v, q, caps[2].trim());
            }
        }
    }

    if let Some(v) = current {
        vlans.push(v);
    }

    vlans
}

fn parse_vlan_rest(v: &mut VlanInfo, rest: &str, last_qualifier: &mut char) {
    // Find a " T " or " U " qualifier embedded in the description+ports field
    if let Some(t_pos) = find_qualifier(rest) {
        let desc = rest[..t_pos].trim();
        v.name = if desc.is_empty() { None } else { Some(desc.to_string()) };
        let after = &rest[t_pos..].trim_start();
        let q_char = after.chars().next().unwrap_or('U');
        *last_qualifier = q_char;
        let ports = after.get(1..).unwrap_or("").trim();
        append_ports(v, q_char, ports);
    } else {
        v.name = if rest.is_empty() { None } else { Some(rest.to_string()) };
    }
}

fn find_qualifier(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    for i in 0..s.len() {
        let c = bytes[i] as char;
        if c == 'T' || c == 'U' {
            let after = bytes.get(i + 1).copied();
            if after == Some(b' ') || after == Some(b'\t') {
                // At position 0, no leading space required; otherwise require a space before
                if i == 0 {
                    return Some(0);
                }
                let before = bytes[i - 1];
                if before == b' ' || before == b'\t' {
                    return Some(i - 1);
                }
            }
        }
    }
    None
}

// Expand a port range like "1/1-1/32" or "1/1-32" into individual port strings.
// Returns vec of strings like ["Hu 1/1", "Hu 1/2", ...] or ["Hu 1/1"] if not a range.
fn expand_port_range(prefix: &str, range_str: &str) -> Vec<String> {
    let range_str = range_str.trim();
    if let Some(dash) = range_str.find('-') {
        let start_str = &range_str[..dash];
        let end_str = &range_str[dash + 1..];
        if let Some(slash) = start_str.find('/') {
            let slot = &start_str[..slash];
            if let Ok(start_port) = start_str[slash + 1..].parse::<u32>() {
                let end_port: Option<u32> = if let Some(end_slash) = end_str.find('/') {
                    end_str[end_slash + 1..].parse().ok()
                } else {
                    end_str.parse().ok()
                };
                if let Some(end_port) = end_port {
                    if end_port >= start_port && (end_port - start_port) < 256 {
                        return (start_port..=end_port)
                            .map(|p| format!("{} {}/{}", prefix, slot, p))
                            .collect();
                    }
                }
            }
        }
    }
    vec![format!("{} {}", prefix, range_str)]
}

fn append_ports(v: &mut VlanInfo, qualifier: char, ports_str: &str) {
    let mut port_list: Vec<String> = Vec::new();
    for part in ports_str.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some(space_pos) = part.find(' ') {
            let prefix = &part[..space_pos];
            let rest = &part[space_pos + 1..];
            port_list.extend(expand_port_range(prefix, rest));
        } else {
            port_list.push(part.to_string());
        }
    }

    let cleaned = port_list.join(", ");
    if cleaned.is_empty() {
        return;
    }

    if qualifier == 'T' {
        v.tagged_ports = Some(match &v.tagged_ports {
            Some(existing) => format!("{}, {}", existing, cleaned),
            None => cleaned,
        });
    } else {
        v.untagged_ports = Some(match &v.untagged_ports {
            Some(existing) => format!("{}, {}", existing, cleaned),
            None => cleaned,
        });
    }
}
