// Copyright (C), 2026 Quartz Systems. Some rights reserved. This work is
// licensed under the terms of the MIT license which can be found in the
// root directory of this project.

use anyhow::{anyhow, Result};
use regex::Regex;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, info, warn};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct DeviceCreds {
    pub ip: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub timeout_secs: u64,
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

// ─── REST client helpers ──────────────────────────────────────────────────────

const REST_PATH: &str = "/api/running/dell/_operations/cli";
const YANG_ROOT: &str = "/api/running/dell";

// ─── YANG RESTCONF helpers ────────────────────────────────────────────────────

const YANG_IFACE_BASE: &str = "/api/running/dell/interfaces/interface";

/// Convert a CLI-style interface name to the Dell YANG key format.
/// "HundredGig 1/1" → "hundredgig-1-1", "Te 1/33" → "tengig-1-33", "Vlan 10" → "vlan-10"
fn cli_iface_to_yang(name: &str) -> Option<String> {
    let s = name.trim().to_lowercase();
    let mut parts = s.splitn(2, char::is_whitespace);
    let prefix = parts.next()?;
    let num = parts.next()?.trim().replace('/', "-");
    let yang = match prefix {
        "hundredgig" | "hundredgigabitethernet" | "hu" => "hundredgig",
        "tengig" | "tengigabitethernet" | "te" => "tengig",
        "fortygig" | "fortygigabitethernet" | "fo" => "fortygig",
        "gigabitethernet" | "gi" => "gigabit",
        "management" | "managementethernet" | "ma" | "mg" => "mgmt",
        "vlan" | "vl" => "vlan",
        "port-channel" | "portchannel" | "po" => "port-channel",
        _ => return None,
    };
    Some(format!("{}-{}", yang, num))
}

async fn yang_patch(client: &Client, creds: &DeviceCreds, path: &str, body: Value) -> Result<()> {
    let url = format!("http://{}:{}{}", creds.ip, creds.port, path);
    info!("[{}] YANG PATCH {} {}", creds.ip, path, body);
    let resp = client
        .patch(&url)
        .basic_auth(&creds.username, Some(&creds.password))
        .header("Content-Type", "application/vnd.yang.data+json")
        .header("Accept", "application/vnd.yang.data+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow!("YANG PATCH {path}: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("YANG PATCH {path} → {status}: {}", &text[..text.len().min(300)]));
    }
    Ok(())
}

async fn yang_put(client: &Client, creds: &DeviceCreds, path: &str, body: Value) -> Result<()> {
    let url = format!("http://{}:{}{}", creds.ip, creds.port, path);
    info!("[{}] YANG PUT {} {}", creds.ip, path, body);
    let resp = client
        .put(&url)
        .basic_auth(&creds.username, Some(&creds.password))
        .header("Content-Type", "application/vnd.yang.data+json")
        .header("Accept", "application/vnd.yang.data+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow!("YANG PUT {path}: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("YANG PUT {path} → {status}: {}", &text[..text.len().min(300)]));
    }
    Ok(())
}

async fn yang_delete_path(client: &Client, creds: &DeviceCreds, path: &str) -> Result<()> {
    let url = format!("http://{}:{}{}", creds.ip, creds.port, path);
    info!("[{}] YANG DELETE {}", creds.ip, path);
    let resp = client
        .delete(&url)
        .basic_auth(&creds.username, Some(&creds.password))
        .send()
        .await
        .map_err(|e| anyhow!("YANG DELETE {path}: {e}"))?;
    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(()); // already absent — desired state achieved
    }
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!("YANG DELETE {path} → {status}: {}", &text[..text.len().min(300)]));
    }
    Ok(())
}

pub async fn apply_config_ops(creds: DeviceCreds, ops: &[crate::models::ConfigOp]) -> Result<String> {
    use crate::models::ConfigOp;
    let client = make_client(creds.timeout_secs)?;
    let mut log: Vec<String> = Vec::new();

    for op in ops {
        match op {
            ConfigOp::IfaceShutdown { iface, shutdown } => {
                let yang = cli_iface_to_yang(iface)
                    .ok_or_else(|| anyhow!("Unknown interface: {iface}"))?;
                let path = format!("{}/{}", YANG_IFACE_BASE, yang);
                yang_patch(&client, &creds, &path, json!({"dell:interface": {"shutdown": shutdown}})).await?;
                log.push(format!("OK: {} {}", if *shutdown { "shutdown" } else { "no shutdown" }, iface));
            }
            ConfigOp::IfaceDescription { iface, description } => {
                let yang = cli_iface_to_yang(iface)
                    .ok_or_else(|| anyhow!("Unknown interface: {iface}"))?;
                let path = format!("{}/{}", YANG_IFACE_BASE, yang);
                yang_patch(&client, &creds, &path, json!({"dell:interface": {"description": description}})).await?;
                log.push(format!("OK: description → {:?} on {}", description, iface));
            }
            ConfigOp::IfacePortmode { iface, mode } => {
                let yang = cli_iface_to_yang(iface)
                    .ok_or_else(|| anyhow!("Unknown interface: {iface}"))?;
                let path = format!("{}/{}", YANG_IFACE_BASE, yang);
                yang_patch(&client, &creds, &path, json!({"dell:interface": {"portmode": {}}})).await?;
                log.push(format!("OK: portmode → {} on {}", mode, iface));
            }
            ConfigOp::VlanCreate { vlan_id, name } => {
                let yang = format!("vlan-{}", vlan_id);
                let path = format!("{}/{}", YANG_IFACE_BASE, yang);
                let mut body = json!({"dell:interface": {"name": yang}});
                if let Some(n) = name {
                    if !n.is_empty() {
                        body["dell:interface"]["description"] = json!(n);
                    }
                }
                yang_put(&client, &creds, &path, body).await?;
                log.push(format!("OK: created VLAN {}", vlan_id));
            }
            ConfigOp::VlanDelete { vlan_id } => {
                let path = format!("{}/vlan-{}", YANG_IFACE_BASE, vlan_id);
                yang_delete_path(&client, &creds, &path).await?;
                log.push(format!("OK: deleted VLAN {}", vlan_id));
            }
            ConfigOp::VlanDescription { vlan_id, description } => {
                let path = format!("{}/vlan-{}", YANG_IFACE_BASE, vlan_id);
                yang_patch(&client, &creds, &path, json!({"dell:interface": {"description": description}})).await?;
                log.push(format!("OK: VLAN {} name → {:?}", vlan_id, description));
            }
            ConfigOp::VlanTaggedAdd { vlan_id, iface } => {
                if *vlan_id == 1 {
                    log.push(format!("SKIP: VLAN 1 tagged is the default on Dell OS9"));
                } else {
                    let iface_yang = cli_iface_to_yang(iface)
                        .ok_or_else(|| anyhow!("Unknown interface: {iface}"))?;
                    let path = format!("{}/vlan-{}/tagged/{}", YANG_IFACE_BASE, vlan_id, iface_yang);
                    yang_put(&client, &creds, &path, json!({"dell:tagged": {"name": iface_yang}})).await?;
                    log.push(format!("OK: VLAN {} tagged += {}", vlan_id, iface));
                }
            }
            ConfigOp::VlanTaggedRemove { vlan_id, iface } => {
                if *vlan_id == 1 {
                    log.push(format!("SKIP: VLAN 1 tagged is the default on Dell OS9"));
                } else {
                    let iface_yang = cli_iface_to_yang(iface)
                        .ok_or_else(|| anyhow!("Unknown interface: {iface}"))?;
                    let path = format!("{}/vlan-{}/tagged/{}", YANG_IFACE_BASE, vlan_id, iface_yang);
                    yang_delete_path(&client, &creds, &path).await?;
                    log.push(format!("OK: VLAN {} tagged -= {}", vlan_id, iface));
                }
            }
            ConfigOp::VlanUntaggedAdd { vlan_id, iface } => {
                if *vlan_id == 1 {
                    log.push(format!("SKIP: VLAN 1 untagged is the default on Dell OS9"));
                } else {
                    let iface_yang = cli_iface_to_yang(iface)
                        .ok_or_else(|| anyhow!("Unknown interface: {iface}"))?;
                    let path = format!("{}/vlan-{}/untagged/{}", YANG_IFACE_BASE, vlan_id, iface_yang);
                    yang_put(&client, &creds, &path, json!({"dell:untagged": {"name": iface_yang}})).await?;
                    log.push(format!("OK: VLAN {} untagged := {}", vlan_id, iface));
                }
            }
            ConfigOp::VlanUntaggedRemove { vlan_id, iface } => {
                if *vlan_id == 1 {
                    log.push(format!("SKIP: VLAN 1 untagged is the default on Dell OS9"));
                } else {
                    let iface_yang = cli_iface_to_yang(iface)
                        .ok_or_else(|| anyhow!("Unknown interface: {iface}"))?;
                    let path = format!("{}/vlan-{}/untagged/{}", YANG_IFACE_BASE, vlan_id, iface_yang);
                    yang_delete_path(&client, &creds, &path).await?;
                    log.push(format!("OK: VLAN {} untagged -= {}", vlan_id, iface));
                }
            }
        }
    }

    // Persist running config to startup (single-line exec works fine)
    match exec(&client, &creds, "write memory").await {
        Ok(_)  => log.push("OK: write memory".to_string()),
        Err(e) => { warn!("[{}] write memory failed: {e}", creds.ip); log.push(format!("WARN: write memory: {e}")); }
    }

    Ok(log.join("\n"))
}

pub async fn yang_fetch(creds: &DeviceCreds, path: &str) -> Result<Value> {
    let client = make_client(creds.timeout_secs)?;
    let url = format!("http://{}:{}{}", creds.ip, creds.port, path);
    let resp = client
        .get(&url)
        .basic_auth(&creds.username, Some(&creds.password))
        .header("Accept", "application/vnd.yang.data+json")
        .send()
        .await
        .map_err(|e| anyhow!("yang_fetch {path}: {e}"))?;
    let status = resp.status().as_u16();
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    Ok(json!({"status": status, "body": body}))
}

pub async fn discover_yang(creds: &DeviceCreds) -> Result<Value> {
    let client = make_client(creds.timeout_secs)?;

    let probe_paths = [
        "/api",
        "/api/running",
        "/api/running/dell",
        "/api/running/dell/interface",
        "/api/running/dell/interfaces",
        "/api/running/dell/vlan-interface",
        "/api/running/dell/VlanInterface",
        "/api/config",
        "/api/config/dell",
        "/api/config/dell/interface",
    ];

    let mut results = serde_json::Map::new();

    for path in &probe_paths {
        let url = format!("http://{}:{}{}", creds.ip, creds.port, path);
        let resp = client
            .get(&url)
            .basic_auth(&creds.username, Some(&creds.password))
            .header("Accept", "application/vnd.yang.data+json")
            .send()
            .await;

        let entry = match resp {
            Err(e) => json!({"error": e.to_string()}),
            Ok(r) => {
                let status = r.status().as_u16();
                let body: Value = r.json().await.unwrap_or(Value::Null);
                json!({"status": status, "body": body})
            }
        };
        info!("YANG probe {}: {}", path, entry);
        results.insert(path.to_string(), entry);
    }

    Ok(Value::Object(results))
}

fn make_client(timeout_secs: u64) -> Result<Client> {
    reqwest::ClientBuilder::new()
        .timeout(Duration::from_secs(timeout_secs))
        // Switches commonly use self-signed TLS certificates
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| anyhow!("HTTP client build: {e}"))
}

// The switch's ConfD-based REST API requires YANG operation MIME types.
// Request/response bodies use YANG operation JSON (RFC 7951).
// Content-Type and Accept must be "application/vnd.yang.operation+json".

async fn send_cli(client: &Client, creds: &DeviceCreds, body: Value) -> Result<String> {
    let url = format!("http://{}:{}{}", creds.ip, creds.port, REST_PATH);
    debug!("REST POST {}: {}", url, body);

    let resp = client
        .post(&url)
        .basic_auth(&creds.username, Some(&creds.password))
        .header("Content-Type", "application/vnd.yang.operation+json")
        .header("Accept", "application/vnd.yang.operation+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow!("REST request to {}: {e}", creds.ip))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow!(
            "REST API {} returned HTTP {}: {}",
            creds.ip,
            status,
            text.chars().take(300).collect::<String>()
        ));
    }

    let response: Value = resp
        .json()
        .await
        .map_err(|e| anyhow!("Response parse from {}: {e}", creds.ip))?;

    debug!("REST response from {}: {}", creds.ip, response);

    // Dell OS9 ConfD YANG operation output.
    // The namespace-qualified key "dell:output" is used by this firmware.
    let output = response["dell:output"]["command"]
        .as_str()
        .or_else(|| response["output"]["command"].as_str())
        .or_else(|| response["output"]["result"].as_str())
        .unwrap_or_else(|| {
            warn!("[{}] Unexpected REST response structure: {}", creds.ip, response);
            ""
        })
        .to_string();
    Ok(output)
}

async fn show(client: &Client, creds: &DeviceCreds, args: &str) -> Result<String> {
    send_cli(client, creds, json!({"input": {"show-command": args}})).await
}

async fn show_optional(client: &Client, creds: &DeviceCreds, args: &str) -> String {
    match show(client, creds, args).await {
        Ok(out) => out,
        Err(e) => {
            warn!("show {} on {}: {e}", args, creds.ip);
            String::new()
        }
    }
}

async fn exec(client: &Client, creds: &DeviceCreds, cmd: &str) -> Result<String> {
    send_cli(client, creds, json!({"input": {"exec-command": cmd}})).await
}

// ─── Config block normaliser ─────────────────────────────────────────────────
// ConfD's exec-command RPC processes the entire string as one CLI session but
// chokes on multiple "configure terminal" … "end" pairs in a single call.
// This function merges them into one session:
//   • replaces every intermediate "end" (followed by another "configure …") with "exit"
//     so we stay in global config mode rather than returning to exec mode
//   • skips the redundant "configure terminal" that followed
//
// "exit" from interface sub-mode → global config (one level up on OS9)
// "end"  from anywhere          → exec mode
// So "exit" is the right replacement to stay inside the configure session.

fn collapse_configure_blocks(input: &str) -> String {
    let lines: Vec<&str> = input.lines().collect();
    let mut out: Vec<&str> = Vec::with_capacity(lines.len());
    let mut i = 0;

    while i < lines.len() {
        let t = lines[i].trim().to_ascii_lowercase();

        if t == "end" {
            // Look ahead past blank lines to the next non-empty line
            let mut j = i + 1;
            while j < lines.len() && lines[j].trim().is_empty() {
                j += 1;
            }
            let next = lines.get(j).map(|l| l.trim().to_ascii_lowercase()).unwrap_or_default();
            if next == "configure terminal" || next == "configure" {
                // Replace this "end" with "exit" (back to global config, not exec mode)
                // and skip the upcoming "configure terminal"
                out.push("exit");
                i = j + 1; // skip "configure terminal"
                continue;
            }
        }

        out.push(lines[i]);
        i += 1;
    }

    out.join("\n")
}

// ─── Poll entry point ─────────────────────────────────────────────────────────

pub async fn poll_device(creds: DeviceCreds) -> Result<PollResult> {
    let client = make_client(creds.timeout_secs)?;
    let c = &client;
    let cr = &creds;

    // Run poll commands in batches of 4 to stay within the switch's concurrent
    // connection limit (Dell OS9 ConfD typically allows 3-5 simultaneous connections).
    // Batch 1: identity + health
    let (ver_out, cpu_out, mem_out, iface_out) = tokio::try_join!(
        show(c, cr, "version"),
        show(c, cr, "processes cpu"),
        show(c, cr, "memory"),
        show(c, cr, "interfaces status"),
    )?;
    // Batch 2: topology + table data
    let (rc_out, arp_out, mac_out, vlan_out) = tokio::try_join!(
        show(c, cr, "running-config"),
        show(c, cr, "arp"),
        show(c, cr, "mac-address-table"),
        show(c, cr, "vlan"),
    )?;
    // Batch 3: supplementary (failures are non-fatal)
    let (env_out, inv_out) = tokio::join!(
        show_optional(c, cr, "environment"),
        show_optional(c, cr, "inventory"),
    );

    for (cmd, out) in [
        ("show version",            &ver_out),
        ("show processes cpu",      &cpu_out),
        ("show memory",             &mem_out),
        ("show interfaces status",  &iface_out),
        ("show running-config",     &rc_out),
        ("show arp",                &arp_out),
        ("show mac-address-table",  &mac_out),
        ("show vlan",               &vlan_out),
        ("show environment",        &env_out),
        ("show inventory",          &inv_out),
    ] {
        debug!(
            "REST poll [{}] ({} bytes):\n{}",
            cmd,
            out.len(),
            &out[..out.len().min(1200)]
        );
    }

    let mut result = PollResult::default();

    let (os_version, model, serial, uptime) = parse_show_version(&ver_out);
    result.os_version    = os_version;
    result.model         = model;
    result.serial_number = serial;
    result.uptime        = uptime;
    result.manufacturer  = detect_manufacturer(&ver_out);

    // Inventory overrides with more precise values when available
    let (inv_os, inv_svc_tag, inv_mfr) = parse_show_inventory(&inv_out);
    if inv_os.is_some()      { result.os_version    = inv_os; }
    if inv_svc_tag.is_some() { result.serial_number = inv_svc_tag; }
    if inv_mfr.is_some()     { result.manufacturer  = inv_mfr; }

    result.cpu_pct = parse_cpu(&cpu_out);
    if result.cpu_pct.is_none() {
        warn!(
            "[{}] CPU parse failed. show processes cpu output ({} bytes): {}",
            creds.ip,
            cpu_out.len(),
            &cpu_out[..cpu_out.len().min(400)]
        );
    }

    result.mem_pct = parse_memory(&mem_out);
    if result.mem_pct.is_none() {
        warn!(
            "[{}] Memory parse failed. show memory output ({} bytes): {}",
            creds.ip,
            mem_out.len(),
            &mem_out[..mem_out.len().min(400)]
        );
    }

    if result.uptime.is_none() {
        warn!(
            "[{}] Uptime parse failed. show version tail ({} bytes): {}",
            creds.ip,
            ver_out.len(),
            &ver_out[ver_out.len().saturating_sub(400)..]
        );
    }

    result.interfaces = parse_interfaces(&iface_out);

    let rc_data = parse_running_config_interfaces(&rc_out);
    for iface in &mut result.interfaces {
        let key = canon_iface(&iface.name);
        if let Some(data) = rc_data.get(&key) {
            if let Some(d) = &data.0 { iface.description = Some(d.clone()); }
            if let Some(d) = &data.1 { iface.duplex      = Some(d.clone()); }
        }
    }

    result.arp_entries = parse_arp(&arp_out);
    result.mac_entries = parse_mac(&mac_out);
    result.vlans       = parse_vlans(&vlan_out);

    let (psus, fans, temps) = parse_environment(&env_out);
    result.psus  = psus;
    result.fans  = fans;
    result.temps = temps;

    Ok(result)
}

// ─── Exec entry point ─────────────────────────────────────────────────────────

pub async fn exec_command(creds: DeviceCreds, command: &str) -> Result<String> {
    let client = make_client(creds.timeout_secs)?;

    let lines: Vec<&str> = command
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    if lines.is_empty() {
        return Ok(String::new());
    }

    // Single show command — use the dedicated show-command YANG operation.
    if lines.len() == 1 {
        let cmd = lines[0].trim();
        if let Some(args) = cmd.strip_prefix("show ") {
            return Ok(show(&client, &creds, args).await?.trim().to_string());
        }
        return Ok(exec(&client, &creds, cmd).await?.trim().to_string());
    }

    // Multi-line block: collapse multiple configure…end sections into one session,
    // then send the entire script as one exec-command with embedded newlines.
    let raw = lines.join("\n");
    let block = collapse_configure_blocks(&raw);
    info!("[{}] exec_command ({} lines after collapse):\n{}", creds.ip, block.lines().count(), &block[..block.len().min(800)]);
    let out = exec(&client, &creds, &block).await.map_err(|e| {
        warn!("[{}] exec_command failed: {e}\nCommand was:\n{}", creds.ip, &block[..block.len().min(600)]);
        e
    })?;
    info!("[{}] exec_command response ({} bytes): {}", creds.ip, out.len(), &out[..out.len().min(400)]);
    Ok(out.trim().to_string())
}

// ─── Output parsers ───────────────────────────────────────────────────────────
// The Dell OS9 REST API returns the same CLI text as SSH — parsers are unchanged.

fn parse_show_version(
    output: &str,
) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    let os_version = [
        // "Dell EMC Application Software Version:  9.14(2.21)"
        r"(?i)Application\s+Software\s+Version\s*:\s*(\S+)",
        // "Dell Networking OS, Version 9.x"
        r"(?i)Dell\s+(?:EMC\s+)?Networking\s+OS(?:10)?\s*,\s*Version\s+([0-9]\S+)",
        r"(?i)Dell\s+(?:EMC\s+)?Networking\s+OS(?:10)?\s+Version\s*:\s*([0-9]\S+)",
        // generic fallback — use \S+ to capture "9.14(2.21)" including parens
        r"(?i)\bVersion\s*:\s*([0-9]\S+)",
    ]
    .iter()
    .find_map(|pat| {
        Regex::new(pat)
            .ok()?
            .captures(output)
            .map(|c| c[1].trim().to_string())
    });

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
            if s.to_uppercase() == "N/A" || s == "-" || s.is_empty() {
                None
            } else {
                Some(s)
            }
        })
    });

    let uptime = [
        r"(?i)Uptime\s*:\s*(.+)",
        r"(?i)System\s+Uptime\s*:\s*(.+)",
        r"(?i)uptime\s+is\s+(.+)",
        r"(?i)Up\s+Time\s*:\s*(.+)",
        r"(?i)Switch\s+uptime\s*:\s*(.+)",
        r"(?i)uptime\s*=\s*(.+)",
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
    // "Overall      15.04           14.08            12.69" — aggregate across all cores
    if let Some(caps) = Regex::new(r"(?i)\bOverall\s+([\d]+(?:\.\d+)?)").ok().and_then(|re| re.captures(output)) {
        if let Ok(f) = caps[1].parse::<f32>() {
            return Some(f.round().min(100.0) as u8);
        }
    }

    [
        // "CPU utilization of sysdlp for five seconds: 23%/7%; ..."
        r"(?i)CPU\s+utilization[^:]*:\s*(\d+)%",
        r"(?i)CPU\s+Usage\s*:\s*(\d+)%",
        r"(?i)5\s+Secs\s*:\s*(\d+)%",
        r"(?i)1.second\s+avg\s*:\s*(\d+)%",
        r"(?i)Processor\s+utilization[^:]*:\s*(\d+)%",
        r"(?i)\butilization\s*:\s*(\d+)%",
        r"(?i)System\s+CPU\s*:\s*(\d+)%",
        r"(?m)^\s*(\d{1,3})%\s",
    ]
    .iter()
    .find_map(|pat| {
        Regex::new(pat)
            .ok()?
            .captures(output)
            .and_then(|c| c[1].parse::<u8>().ok().filter(|&v| v <= 100))
    })
}

fn parse_memory(output: &str) -> Option<u8> {
    fn parse_mem_num(s: &str) -> Option<u64> {
        let s = s.trim();
        let core = s.trim_end_matches(|c: char| c.is_ascii_alphabetic());
        let core = core.replace(',', "");
        core.parse::<u64>().ok().filter(|&n| n > 0)
    }

    let pct = |total: u64, used: u64| -> u8 {
        ((used as f64 / total as f64) * 100.0).round().min(100.0) as u8
    };

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

    if let Some(caps) = Regex::new(r"(?i)In bytes:\s+([\d,]{5,})\s+([\d,]{5,})\s+([\d,]{5,})")
        .ok()
        .and_then(|re| re.captures(output))
    {
        if let (Some(t), Some(u)) = (parse_mem_num(&caps[1]), parse_mem_num(&caps[2])) {
            if t > 0 { return Some(pct(t, u)); }
        }
    }

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

            while idx < tokens.len()
                && (tokens[idx].eq_ignore_ascii_case("up")
                    || tokens[idx].eq_ignore_ascii_case("down"))
            {
                idx += 1;
            }

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

            let duplex = tokens.get(idx).map(|s| s.to_string());

            Some(InterfaceInfo { name, description, status, speed, duplex })
        })
        .collect()
}

fn canon_iface(name: &str) -> String {
    let s = name.trim().to_lowercase();
    let s = s
        .replace("tengigabitethernet",    "te")
        .replace("hundredgigabitethernet","hu")
        .replace("fortygigabitethernet",  "fo")
        .replace("gigabitethernet",       "gi")
        .replace("managementethernet",    "ma")
        .replace("portchannel",           "po")
        .replace("vlan",                  "vl");
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_running_config_interfaces(
    output: &str,
) -> HashMap<String, (Option<String>, Option<String>)> {
    let iface_re = Regex::new(
        r"(?i)^interface\s+((?:TenGigabitEthernet|HundredGigabitEthernet|FortyGigabitEthernet|GigabitEthernet|ManagementEthernet|PortChannel|Vlan)\s+[\d/:]+)"
    ).unwrap();

    let mut result: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();
    let mut cur_name:   Option<String> = None;
    let mut cur_desc:   Option<String> = None;
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
                ip_address:  caps[1].to_string(),
                age_minutes: if &caps[2] == "-" { None } else { Some(caps[2].to_string()) },
                mac_address: caps[3].to_lowercase(),
                interface:   Some(caps[4].trim().to_string()),
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
                vlan:        Some(caps[1].to_string()),
                mac_address: caps[2].to_lowercase(),
                entry_type:  Some(caps[3].to_string()),
                interface:   Some(caps[4].trim().to_string()),
            })
        })
        .collect()
}

fn parse_vlans(output: &str) -> Vec<VlanInfo> {
    let vlan_re =
        Regex::new(r"(?i)^\*?\s*(\d+)\s+(Active|Inactive|Suspend)\s*(.*)").unwrap();
    let qual_re = Regex::new(r"^\s+([TU])\s+(.+)").unwrap();

    let mut vlans: Vec<VlanInfo> = Vec::new();
    let mut current: Option<VlanInfo> = None;
    let mut last_qualifier = 'U';

    for line in output.lines() {
        if let Some(caps) = vlan_re.captures(line) {
            if let Some(v) = current.take() { vlans.push(v); }
            let vlan_id: i64 = caps[1].parse().unwrap_or(0);
            let status = caps[2].to_lowercase();
            let rest = caps[3].trim().to_string();
            let mut v = VlanInfo { vlan_id, status, ..Default::default() };
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
    if let Some(v) = current { vlans.push(v); }
    vlans
}

fn parse_vlan_rest(v: &mut VlanInfo, rest: &str, last_qualifier: &mut char) {
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
                if i == 0 { return Some(0); }
                let before = bytes[i - 1];
                if before == b' ' || before == b'\t' { return Some(i - 1); }
            }
        }
    }
    None
}

fn expand_port_range(prefix: &str, range_str: &str) -> Vec<String> {
    let range_str = range_str.trim();
    if let Some(dash) = range_str.find('-') {
        let start_str = &range_str[..dash];
        let end_str   = &range_str[dash + 1..];
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
    if lower.contains("dell")    { return Some("Dell".to_string()); }
    if lower.contains("cisco")   { return Some("Cisco".to_string()); }
    if lower.contains("juniper") || lower.contains("junos") {
        return Some("Juniper".to_string());
    }
    if lower.contains("arista")  { return Some("Arista".to_string()); }
    None
}

fn parse_show_inventory(output: &str) -> (Option<String>, Option<String>, Option<String>) {
    let mut os_version:  Option<String> = None;
    let mut service_tag: Option<String> = None;
    let manufacturer = detect_manufacturer(output);

    for line in output.lines() {
        let trimmed = line.trim();
        let lower   = trimmed.to_lowercase();

        if lower.starts_with("software version") {
            if let Some(colon) = trimmed.find(':') {
                let val = trimmed[colon + 1..].trim();
                if !val.is_empty() { os_version = Some(val.to_string()); }
            }
        }

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
    let mut psus:  Vec<PsuInfo>  = Vec::new();
    let mut fans:  Vec<FanInfo>  = Vec::new();
    let mut temps: Vec<TempInfo> = Vec::new();
    let mut thermal_cols: Vec<String> = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }

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
            continue;
        }

        if section == Section::None { continue; }

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
        }

        let tokens: Vec<&str> = trimmed.split_whitespace().collect();
        if tokens.is_empty() { continue; }

        if section == Section::ThermalSensor && tokens[0].eq_ignore_ascii_case("unit") {
            thermal_cols = tokens[1..].iter().map(|s| s.to_string()).collect();
            continue;
        }

        let (tok_offset, unit_tok) = if section == Section::UnitTemp
            && tokens.first() == Some(&"*")
        {
            if tokens.len() >= 2 { (1, tokens[1]) } else { continue }
        } else {
            (0, tokens[0])
        };

        if unit_tok.parse::<u32>().is_err() { continue; }

        match section {
            Section::Psu if tokens.len() >= 3 => {
                let unit       = tokens[0];
                let bay        = tokens[1];
                let raw_status = tokens[2];
                let psu_type   = tokens.get(3).copied().unwrap_or("");

                let sl = raw_status.to_lowercase();
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

                let fan_speed_rpm   = tokens.get(5).and_then(|t| t.parse::<u32>().ok()).filter(|&v| v > 0);
                let power_watts     = tokens.get(6).and_then(|t| t.parse::<u32>().ok());
                let avg_power_watts = tokens.get(7).and_then(|t| t.parse::<u32>().ok());

                let slot = format!("PSU {}/{}", unit, bay);
                if psus.iter().all(|p| p.slot != slot) {
                    psus.push(PsuInfo { slot, status, present, power_watts, avg_power_watts, fan_speed_rpm });
                }
            }

            Section::Fan if tokens.len() >= 3 => {
                let unit        = tokens[0];
                let bay         = tokens[1];
                let tray_status = tokens[2];

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

            Section::UnitTemp => {
                let unit_tokens = &tokens[tok_offset..];
                if unit_tokens.len() < 2 { continue; }
                let unit = unit_tokens[0];
                if let Some(t) = unit_tokens.iter().find_map(|&t| parse_temp_celsius(t)) {
                    let slot = format!("Unit {}", unit);
                    if temps.iter().all(|e| e.slot != slot) {
                        temps.push(TempInfo { slot, temp_c: t });
                    }
                }
            }

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
    let mut chars = raw.chars();
    match chars.next() {
        None    => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

fn append_ports(v: &mut VlanInfo, qualifier: char, ports_str: &str) {
    let mut port_list: Vec<String> = Vec::new();
    for part in ports_str.split(',') {
        let part = part.trim();
        if part.is_empty() { continue; }
        if let Some(space_pos) = part.find(' ') {
            let prefix = &part[..space_pos];
            let rest   = &part[space_pos + 1..];
            port_list.extend(expand_port_range(prefix, rest));
        } else {
            port_list.push(part.to_string());
        }
    }

    let cleaned = port_list.join(", ");
    if cleaned.is_empty() { return; }

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
