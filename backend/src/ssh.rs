// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

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

#[derive(Debug, Default, Clone)]
pub struct PsuInfo {
    pub slot: String,
    pub status: String,
    pub present: bool,
    pub power_watts: Option<u32>,
    pub avg_power_watts: Option<u32>,
    pub fan_speed_rpm: Option<u32>,
}

#[derive(Debug, Default, Clone)]
pub struct FanInfo {
    pub slot: String,
    pub status: String,
    pub present: bool,
    pub speed_rpm: Option<String>,
}

#[derive(Debug, Default, Clone)]
pub struct TempInfo {
    pub slot: String,
    pub temp_c: i32,
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
    pub psus: Vec<PsuInfo>,
    pub fans: Vec<FanInfo>,
    pub temps: Vec<TempInfo>,
    pub manufacturer: Option<String>,
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
    "show environment",           // 8
    "show inventory",             // 9
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
        result.manufacturer = detect_manufacturer(ver_out);
    }
    // show inventory overrides os_version and serial_number with more precise values
    if let Some(inv_out) = outputs.get(9) {
        let (inv_os, inv_svc_tag, inv_mfr) = parse_show_inventory(inv_out);
        if inv_os.is_some()      { result.os_version    = inv_os; }
        if inv_svc_tag.is_some() { result.serial_number = inv_svc_tag; }
        if inv_mfr.is_some()     { result.manufacturer  = inv_mfr; }
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
    if let Some(env_out) = outputs.get(8) {
        let (psus, fans, temps) = parse_environment(env_out);
        result.psus = psus;
        result.fans = fans;
        result.temps = temps;
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
    // Strip commas (thousands separator), trailing unit letters, then parse.
    // Returns None for zero or non-numeric tokens.
    fn parse_mem_num(s: &str) -> Option<u64> {
        let s = s.trim();
        let core = s.trim_end_matches(|c: char| c.is_ascii_alphabetic());
        let core = core.replace(',', "");
        core.parse::<u64>().ok().filter(|&n| n > 0)
    }

    let pct = |total: u64, used: u64| -> u8 {
        ((used as f64 / total as f64) * 100.0).round().min(100.0) as u8
    };

    // Capture groups use [\d,]+ to include comma-formatted numbers like 3,906,304.

    // ── Format 1: "Total(UNIT)  Used(UNIT)  Free(UNIT)" — any unit in parens ──
    if let Some(caps) = Regex::new(
        r"(?i)Total\(\w+\)\s+Used\(\w+\)\s+Free\(\w+\)[\s\S]*?([\d,]{3,})\s+([\d,]{3,})\s+([\d,]{3,})",
    )
    .ok()
    .and_then(|re| re.captures(output))
    {
        if let (Some(t), Some(u)) = (parse_mem_num(&caps[1]), parse_mem_num(&caps[2])) {
            if t > 0 { return Some(pct(t, u)); }
        }
    }

    // ── Format 2: "Total  Used  Free" plain whitespace-separated header ──
    if let Some(caps) = Regex::new(
        r"(?i)Total\s+Used\s+Free(?:\s+\S+)*\s+([\d,]{3,})\s+([\d,]{3,})\s+([\d,]{3,})",
    )
    .ok()
    .and_then(|re| re.captures(output))
    {
        if let (Some(t), Some(u)) = (parse_mem_num(&caps[1]), parse_mem_num(&caps[2])) {
            if t > 0 { return Some(pct(t, u)); }
        }
    }

    // ── Format 3: "Total  Free …" header (no Used column) — used = total - free ──
    if let Some(caps) = Regex::new(
        r"(?i)Total(?:\(\w+\))?\s+Free(?:\(\w+\))?(?:\s+\S+)*\s+([\d,]{3,})\s+([\d,]{3,})",
    )
    .ok()
    .and_then(|re| re.captures(output))
    {
        if let (Some(t), Some(f)) = (parse_mem_num(&caps[1]), parse_mem_num(&caps[2])) {
            if t > 0 && f <= t { return Some(pct(t, t.saturating_sub(f))); }
        }
    }

    // ── Format 4: "In bytes: TOTAL USED FREE" ──
    if let Some(caps) = Regex::new(r"(?i)In bytes:\s+([\d,]{5,})\s+([\d,]{5,})\s+([\d,]{5,})")
        .ok()
        .and_then(|re| re.captures(output))
    {
        if let (Some(t), Some(u)) = (parse_mem_num(&caps[1]), parse_mem_num(&caps[2])) {
            if t > 0 { return Some(pct(t, u)); }
        }
    }

    // ── Format 5: per-line "Total : N" / "Used : N" or "Free : N" ──
    {
        let get = |pat: &str| -> Option<u64> {
            Regex::new(pat).ok()?.captures(output)
                .and_then(|c| parse_mem_num(&c[1]))
        };
        if let Some(t) = get(r"(?i)\bTotal\s*:\s*([\d,]+)") {
            if t > 0 {
                if let Some(u) = get(r"(?i)\bUsed\s*:\s*([\d,]+)") {
                    return Some(pct(t, u));
                }
                if let Some(f) = get(r"(?i)\bFree\s*:\s*([\d,]+)") {
                    if f <= t { return Some(pct(t, t.saturating_sub(f))); }
                }
            }
        }
    }

    // ── Format 6: "Processor  TOTAL  USED  FREE …" tabular data row ──
    if let Some(caps) = Regex::new(
        r"(?i)(?:Control\s+)?Processor\s+([\d,]{3,})\s+([\d,]{3,})\s+([\d,]{3,})",
    )
    .ok()
    .and_then(|re| re.captures(output))
    {
        if let (Some(t), Some(u)) = (parse_mem_num(&caps[1]), parse_mem_num(&caps[2])) {
            if t > 0 { return Some(pct(t, u)); }
        }
    }

    // ── Format 7: broad fallback — any "Processor" line with 2+ large numbers ──
    for line in output.lines() {
        if !line.to_ascii_lowercase().contains("processor") { continue; }
        let nums: Vec<u64> = line.split_whitespace()
            .filter_map(|t| parse_mem_num(t))
            .filter(|&n| n >= 1_000)
            .collect();
        if nums.len() >= 2 {
            let (total, second) = (nums[0], nums[1]);
            if total > 0 && second <= total {
                return Some(pct(total, second));
            } else if total > 0 && nums.len() >= 3 && nums[1] <= total {
                return Some(pct(total, total.saturating_sub(nums[1])));
            }
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

fn detect_manufacturer(ver_output: &str) -> Option<String> {
    let lower = ver_output.to_ascii_lowercase();
    if lower.contains("dell") {
        Some("Dell".to_string())
    } else if lower.contains("cisco") {
        Some("Cisco".to_string())
    } else if lower.contains("juniper") || lower.contains("junos") {
        Some("Juniper".to_string())
    } else if lower.contains("arista") {
        Some("Arista".to_string())
    } else {
        None
    }
}

/// Parse `show inventory` output.
/// Returns (os_version, service_tag, manufacturer).
///
/// Inventory header section example:
///   Software Version : 9.14(2.21)
///
/// Table row for the management unit (marked with `*`):
///   * 1  Z9100-ON-01-FE-34  NA  07MF5P  A00  CN-07MF5P-CES00-978-0011  A00  JF2SG02  422 705 433 62
///   ^[0] ^[1] ^[2]          ^[3]^[4]   ^[5] ^[6]                       ^[7] ^[8]=svc_tag
fn parse_show_inventory(output: &str) -> (Option<String>, Option<String>, Option<String>) {
    let mut os_version:  Option<String> = None;
    let mut service_tag: Option<String> = None;
    let manufacturer: Option<String> = detect_manufacturer(output);

    for line in output.lines() {
        let trimmed = line.trim();
        let lower   = trimmed.to_lowercase();

        if lower.starts_with("software version") {
            if let Some(colon) = trimmed.find(':') {
                let val = trimmed[colon + 1..].trim();
                if !val.is_empty() {
                    os_version = Some(val.to_string());
                }
            }
        }

        // Management unit row starts with "*"; service tag is token[8]
        if trimmed.starts_with('*') && service_tag.is_none() {
            let tokens: Vec<&str> = trimmed.split_whitespace().collect();
            if let Some(&tag) = tokens.get(8) {
                if tag != "N/A" && tag != "NA" && tag.len() >= 5 {
                    service_tag = Some(tag.to_string());
                }
            }
        }
    }

    (os_version, service_tag, manufacturer)
}

fn parse_environment(output: &str) -> (Vec<PsuInfo>, Vec<FanInfo>, Vec<TempInfo>) {
    #[derive(PartialEq, Clone, Copy)]
    enum Section { None, Fan, Psu, UnitTemp, ThermalSensor }

    let mut section = Section::None;
    let mut psus: Vec<PsuInfo> = Vec::new();
    let mut fans: Vec<FanInfo> = Vec::new();
    let mut temps: Vec<TempInfo> = Vec::new();
    // Column names captured from the thermal-sensor header row (excludes "Unit" column)
    let mut thermal_cols: Vec<String> = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let dash_count = trimmed.chars().filter(|&c| c == '-' || c == '=').count();
        let has_alpha  = trimmed.chars().any(|c| c.is_ascii_alphabetic());

        if dash_count >= 3 {
            if has_alpha {
                let lower = trimmed.to_lowercase();
                thermal_cols.clear();
                if lower.contains("thermal") || lower.contains("sensor") {
                    section = Section::ThermalSensor;
                } else if lower.contains("environment") || lower.contains("unit env") {
                    section = Section::UnitTemp;
                } else if lower.contains("fan") && !lower.contains("power") {
                    section = Section::Fan;
                } else if lower.contains("power") || lower.contains("psu") {
                    section = Section::Psu;
                } else {
                    section = Section::None;
                }
            }
            // Always skip separator/ruler lines.
            // Unnamed rulers (---- ---) do NOT reset `section` so tabular data rows
            // that follow remain in the correct section.
            continue;
        }

        if section == Section::None {
            continue;
        }

        // Skip standalone "Unit N:" sub-headers (single colon or no colon)
        {
            let l = trimmed.to_lowercase();
            if let Some(rest) = l.strip_prefix("unit") {
                let rest = rest.trim_start();
                if rest.starts_with(|c: char| c.is_ascii_digit())
                    && trimmed.chars().filter(|&c| c == ':').count() <= 1
                {
                    continue;
                }
            }
        }

        // ── Key : Value format (older Dell OS9 style) ──────────────────────
        // Skip the colon check when we're already in a tabular section and the
        // line starts with a number — timestamps in trailing columns (e.g.
        // AvgPowerStartTime "00:00:00") would otherwise steal the whole row.
        let first_word_is_int = trimmed
            .split_whitespace()
            .next()
            .map(|w| w.parse::<u32>().is_ok())
            .unwrap_or(false);
        let in_tabular_section = matches!(section, Section::Fan | Section::Psu);
        if !(in_tabular_section && first_word_is_int) {
        if let Some(colon_pos) = trimmed.find(':') {
            let key   = trimmed[..colon_pos].trim();
            let value = trimmed[colon_pos + 1..].trim();

            if !key.is_empty() && !value.is_empty() {
                let key_lower   = key.to_lowercase();
                let value_lower = value.to_lowercase();

                let eff_section = match section {
                    Section::None => {
                        if key_lower.contains("fan") && !key_lower.contains("power") {
                            Section::Fan
                        } else if key_lower.contains("power") || key_lower.contains("psu")
                            || key_lower.contains("bay") || key_lower.contains("module")
                        {
                            Section::Psu
                        } else {
                            Section::None
                        }
                    }
                    other => other,
                };

                let present = !value_lower.starts_with("absent")
                    && !value_lower.contains("not present")
                    && !value_lower.contains("not installed");
                let status = normalize_env_status(value);

                // Skip pure-numeric values (e.g. RPM speed readings like "6400")
                if status.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ' ') {
                    continue;
                }

                match eff_section {
                    Section::Fan => {
                        let base = strip_fan_suffix(key);
                        if let Some(existing) = fans.iter_mut().find(|f| f.slot == base) {
                            if !present || status == "Fault" {
                                existing.present = present;
                                existing.status  = status;
                            }
                        } else {
                            fans.push(FanInfo { slot: base, status, present, speed_rpm: None });
                        }
                    }
                    Section::Psu => {
                        if let Some(existing) = psus.iter_mut().find(|p| p.slot == key) {
                            if !present || status == "Fault" {
                                existing.present = present;
                                existing.status  = status;
                            }
                        } else {
                            psus.push(PsuInfo {
                                slot: key.to_string(),
                                status,
                                present,
                                power_watts: None,
                                avg_power_watts: None,
                                fan_speed_rpm: None,
                            });
                        }
                    }
                    _ => {}
                }
                continue;
            }
        }
        } // end !in_tabular_section || !first_word_is_int guard

        // ── Tabular format (Dell OS9 Z-series) ────────────────────────────
        let tokens: Vec<&str> = trimmed.split_whitespace().collect();
        if tokens.is_empty() { continue; }

        // ── Thermal sensor column-header row: "Unit  Bcm_Int  CpuOnBoard …" ──
        if section == Section::ThermalSensor && tokens[0].eq_ignore_ascii_case("unit") {
            thermal_cols = tokens[1..].iter().map(|s| s.to_string()).collect();
            continue;
        }

        // Determine the "effective first token" — UnitTemp rows may start with '*'
        let (tok_offset, unit_tok) = if section == Section::UnitTemp
            && tokens.first() == Some(&"*")
        {
            if tokens.len() >= 2 { (1, tokens[1]) } else { continue }
        } else {
            (0, tokens[0])
        };

        // Skip column-header rows (first effective token is not a number)
        if unit_tok.parse::<u32>().is_err() {
            continue;
        }

        match section {
            // ── PSU tabular row ──────────────────────────────────────────────
            // Columns: Unit Bay Status Type FanStatus FanSpeed Power AvgPower AvgPowerStartTime
            Section::Psu if tokens.len() >= 3 => {
                let unit       = tokens[0];
                let bay        = tokens[1];
                let raw_status = tokens[2];
                let psu_type   = tokens.get(3).copied().unwrap_or("");

                let sl = raw_status.to_lowercase();
                // "down" with an UNKNOWN type means the bay is empty/uninstalled
                let type_unknown = psu_type.eq_ignore_ascii_case("unknown");
                let present = !(sl == "down" && type_unknown)
                    && sl != "absent"
                    && !sl.contains("not present");
                let status = if sl == "up" || sl == "online" || sl == "ok" || sl.contains("good") {
                    "OK".to_string()
                } else if sl == "absent" || sl.contains("not present")
                    || (sl == "down" && type_unknown)
                {
                    "Absent".to_string()
                } else if sl == "down" || sl == "offline" || sl.contains("fail") || sl.contains("fault") {
                    "Fault".to_string()
                } else {
                    normalize_env_status(raw_status)
                };

                // PSU columns: Unit Bay Status Type FanStatus FanSpeed Power AvgPower …
                let fan_speed_rpm   = tokens.get(5).and_then(|t| t.parse::<u32>().ok()).filter(|&v| v > 0);
                let power_watts     = tokens.get(6).and_then(|t| t.parse::<u32>().ok());
                let avg_power_watts = tokens.get(7).and_then(|t| t.parse::<u32>().ok());

                let slot = format!("PSU {}/{}", unit, bay);
                if psus.iter().all(|p| p.slot != slot) {
                    psus.push(PsuInfo { slot, status, present, power_watts, avg_power_watts, fan_speed_rpm });
                }
            }

            // ── Fan tray tabular row ─────────────────────────────────────────
            // Columns: Unit Bay TrayStatus Fan1 Speed Fan2 Speed …
            Section::Fan if tokens.len() >= 3 => {
                let unit           = tokens[0];
                let bay            = tokens[1];
                let tray_status    = tokens[2];

                let tsl     = tray_status.to_lowercase();
                let present = tsl != "absent" && !tsl.contains("not present") && tsl != "offline" && tsl != "down";
                let status  = if tsl == "up" || tsl == "online" || tsl == "ok" {
                    "OK".to_string()
                } else if tsl == "absent" || tsl.contains("not present") {
                    "Absent".to_string()
                } else if tsl == "down" || tsl == "offline" || tsl.contains("fail") || tsl.contains("fault") {
                    "Fault".to_string()
                } else {
                    normalize_env_status(tray_status)
                };

                // Remaining tokens alternate: Fan1Status Fan1Speed Fan2Status Fan2Speed …
                // Speeds are at odd positions within tokens[3..] (i.e. tokens[4], tokens[6], …)
                let speeds: Vec<u32> = (4..tokens.len())
                    .step_by(2)
                    .filter_map(|i| tokens.get(i).and_then(|t| t.parse::<u32>().ok()))
                    .collect();

                let any_fan_fault = (3..tokens.len())
                    .step_by(2)
                    .filter_map(|i| tokens.get(i))
                    .any(|&t| {
                        let tl = t.to_lowercase();
                        tl == "down" || tl == "offline" || tl.contains("fail") || tl.contains("fault")
                    });

                let speed_rpm = if speeds.is_empty() { None } else {
                    Some(speeds.iter().map(|s| s.to_string()).collect::<Vec<_>>().join(","))
                };
                let final_status  = if any_fan_fault { "Fault".to_string() } else { status };
                let final_present = present && !any_fan_fault;

                let slot = format!("Fan Tray {}/{}", unit, bay);
                if fans.iter().all(|f| f.slot != slot) {
                    fans.push(FanInfo { slot, status: final_status, present: final_present, speed_rpm });
                }
            }

            // ── Unit ambient temperature row ──────────────────────────────────
            // Columns (after optional '*'): Unit Status Temp Voltage
            Section::UnitTemp => {
                let unit_tokens = &tokens[tok_offset..];
                if unit_tokens.len() < 2 { continue; }
                let unit = unit_tokens[0];
                // Find a token that ends with 'C' and has a numeric prefix
                if let Some(t) = unit_tokens.iter().find_map(|&t| parse_temp_celsius(t)) {
                    let slot = format!("Unit {}", unit);
                    if temps.iter().all(|e| e.slot != slot) {
                        temps.push(TempInfo { slot, temp_c: t });
                    }
                }
            }

            // ── Thermal sensor data row ───────────────────────────────────────
            // Columns: Unit Sensor0 Sensor1 … (names come from thermal_cols)
            Section::ThermalSensor if !thermal_cols.is_empty() && tokens.len() >= 2 => {
                for (col_name, &val_str) in thermal_cols.iter().zip(tokens[1..].iter()) {
                    if let Ok(temp_c) = val_str.parse::<i32>() {
                        let slot = col_name.clone();
                        if temps.iter().all(|e| e.slot != slot) {
                            temps.push(TempInfo { slot, temp_c });
                        }
                    }
                }
            }

            _ => {}
        }
    }

    (psus, fans, temps)
}

fn parse_temp_celsius(s: &str) -> Option<i32> {
    s.strip_suffix(['C', 'c'])?.parse::<i32>().ok()
}

fn strip_fan_suffix(name: &str) -> String {
    const SUFFIXES: &[&str] = &[" Speed", " Rotate", " Rotation", " Status", " Presence"];
    let lower = name.to_lowercase();
    for suffix in SUFFIXES {
        if lower.ends_with(&suffix.to_lowercase()) {
            return name[..name.len() - suffix.len()].trim().to_string();
        }
    }
    name.to_string()
}

fn normalize_env_status(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.starts_with("absent") || lower.contains("not present") || lower.contains("not installed") {
        return "Absent".to_string();
    }
    if lower == "offline" || lower.contains("no rotate") || lower.contains("not rotating")
        || lower.contains("fault") || lower.contains("failed") || lower.contains("fail")
        || lower.contains("error")
    {
        return "Fault".to_string();
    }
    if lower == "online" || lower == "ok" || lower.contains("normal") || lower.contains("rotate")
        || lower.contains(", ac") || lower.contains(", dc") || lower.starts_with("present")
        || lower.contains("good")
    {
        return "OK".to_string();
    }
    // Return as-is with first letter uppercased
    let mut chars = raw.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
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
