use anyhow::Result;
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::models::*;
use crate::ssh::PollResult;

// ─── Settings ────────────────────────────────────────────────────────────────

pub async fn get_settings(db: &SqlitePool) -> Result<DbSettings> {
    let row = sqlx::query_as::<_, DbSettings>(
        "SELECT poll_interval_secs, poll_concurrency, ssh_connect_timeout_secs,
                ssh_read_timeout_secs, jwt_expiry_hours, updated_at
         FROM system_settings WHERE id = 1",
    )
    .fetch_optional(db)
    .await?;
    Ok(row.unwrap_or_else(|| DbSettings {
        poll_interval_secs: 300,
        poll_concurrency: 5,
        ssh_connect_timeout_secs: 15,
        ssh_read_timeout_secs: 30,
        jwt_expiry_hours: 8,
        updated_at: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    }))
}

pub async fn seed_settings(db: &SqlitePool, config: &crate::config::Config) -> Result<()> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM system_settings")
        .fetch_one(db)
        .await?;
    if count.0 == 0 {
        sqlx::query(
            "INSERT INTO system_settings
             (id, poll_interval_secs, poll_concurrency, ssh_connect_timeout_secs,
              ssh_read_timeout_secs, jwt_expiry_hours, updated_at)
             VALUES (1, ?, ?, ?, ?, ?, datetime('now'))",
        )
        .bind(config.poll_interval_secs as i64)
        .bind(config.poll_concurrency as i64)
        .bind(config.ssh_connect_timeout_secs as i64)
        .bind(config.ssh_read_timeout_secs as i64)
        .bind(config.jwt_expiry_hours)
        .execute(db)
        .await?;
    }
    Ok(())
}

pub async fn update_settings(db: &SqlitePool, req: &UpdateSettingsRequest) -> Result<DbSettings> {
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if let Some(v) = req.poll_interval_secs {
        sqlx::query("UPDATE system_settings SET poll_interval_secs = ?, updated_at = ? WHERE id = 1")
            .bind(v).bind(&now).execute(db).await?;
    }
    if let Some(v) = req.poll_concurrency {
        sqlx::query("UPDATE system_settings SET poll_concurrency = ?, updated_at = ? WHERE id = 1")
            .bind(v).bind(&now).execute(db).await?;
    }
    if let Some(v) = req.ssh_connect_timeout_secs {
        sqlx::query("UPDATE system_settings SET ssh_connect_timeout_secs = ?, updated_at = ? WHERE id = 1")
            .bind(v).bind(&now).execute(db).await?;
    }
    if let Some(v) = req.ssh_read_timeout_secs {
        sqlx::query("UPDATE system_settings SET ssh_read_timeout_secs = ?, updated_at = ? WHERE id = 1")
            .bind(v).bind(&now).execute(db).await?;
    }
    if let Some(v) = req.jwt_expiry_hours {
        sqlx::query("UPDATE system_settings SET jwt_expiry_hours = ?, updated_at = ? WHERE id = 1")
            .bind(v).bind(&now).execute(db).await?;
    }
    get_settings(db).await
}

fn now() -> String {
    Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

// ─── Users ───────────────────────────────────────────────────────────────────

pub async fn get_all_users(db: &SqlitePool) -> Result<Vec<User>> {
    let rows = sqlx::query_as::<_, User>(
        "SELECT * FROM users ORDER BY created_at ASC",
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn get_user_by_id(db: &SqlitePool, id: &str) -> Result<Option<User>> {
    let row = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?;
    Ok(row)
}

pub async fn get_user_by_username(db: &SqlitePool, username: &str) -> Result<Option<User>> {
    let row = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = ?")
        .bind(username)
        .fetch_optional(db)
        .await?;
    Ok(row)
}

pub async fn count_users(db: &SqlitePool) -> Result<i64> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(db)
        .await?;
    Ok(row.0)
}

pub async fn create_user(
    db: &SqlitePool,
    req: &CreateUserRequest,
    password_hash: &str,
) -> Result<User> {
    let id = new_id();
    let now = now();
    sqlx::query(
        "INSERT INTO users (id, username, email, display_name, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
    )
    .bind(&id)
    .bind(&req.username)
    .bind(&req.email)
    .bind(&req.display_name)
    .bind(password_hash)
    .bind(&req.role)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;
    Ok(get_user_by_id(db, &id).await?.unwrap())
}

pub async fn update_user(
    db: &SqlitePool,
    id: &str,
    req: &UpdateUserRequest,
    new_hash: Option<&str>,
) -> Result<Option<User>> {
    let now = now();
    if let Some(name) = &req.display_name {
        sqlx::query("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?")
            .bind(name)
            .bind(&now)
            .bind(id)
            .execute(db)
            .await?;
    }
    if let Some(email) = &req.email {
        sqlx::query("UPDATE users SET email = ?, updated_at = ? WHERE id = ?")
            .bind(email)
            .bind(&now)
            .bind(id)
            .execute(db)
            .await?;
    }
    if let Some(role) = &req.role {
        sqlx::query("UPDATE users SET role = ?, updated_at = ? WHERE id = ?")
            .bind(role)
            .bind(&now)
            .bind(id)
            .execute(db)
            .await?;
    }
    if let Some(status) = &req.status {
        sqlx::query("UPDATE users SET status = ?, updated_at = ? WHERE id = ?")
            .bind(status)
            .bind(&now)
            .bind(id)
            .execute(db)
            .await?;
    }
    if let Some(hash) = new_hash {
        sqlx::query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
            .bind(hash)
            .bind(&now)
            .bind(id)
            .execute(db)
            .await?;
    }
    get_user_by_id(db, id).await
}

pub async fn delete_user(db: &SqlitePool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(res.rows_affected() > 0)
}

pub async fn update_last_login(db: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("UPDATE users SET last_login = ? WHERE id = ?")
        .bind(now())
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

// ─── Devices ─────────────────────────────────────────────────────────────────

pub async fn get_all_devices(db: &SqlitePool) -> Result<Vec<Device>> {
    let rows = sqlx::query_as::<_, Device>("SELECT * FROM devices ORDER BY hostname ASC")
        .fetch_all(db)
        .await?;
    Ok(rows)
}

pub async fn get_device_by_id(db: &SqlitePool, id: &str) -> Result<Option<Device>> {
    let row = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?;
    Ok(row)
}

pub async fn create_device(db: &SqlitePool, req: &CreateDeviceRequest) -> Result<Device> {
    let id = new_id();
    let now = now();
    let port = req.ssh_port.unwrap_or(22);
    sqlx::query(
        "INSERT INTO devices (id, hostname, ip_address, location, role, status, ssh_username, ssh_password, ssh_port, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'unknown', ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&req.hostname)
    .bind(&req.ip_address)
    .bind(&req.location)
    .bind(&req.role)
    .bind(&req.ssh_username)
    .bind(&req.ssh_password)
    .bind(port)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await?;
    Ok(get_device_by_id(db, &id).await?.unwrap())
}

pub async fn update_device(
    db: &SqlitePool,
    id: &str,
    req: &UpdateDeviceRequest,
) -> Result<Option<Device>> {
    let now = now();
    if let Some(v) = &req.hostname {
        sqlx::query("UPDATE devices SET hostname = ?, updated_at = ? WHERE id = ?")
            .bind(v).bind(&now).bind(id).execute(db).await?;
    }
    if let Some(v) = &req.ip_address {
        sqlx::query("UPDATE devices SET ip_address = ?, updated_at = ? WHERE id = ?")
            .bind(v).bind(&now).bind(id).execute(db).await?;
    }
    if let Some(v) = &req.location {
        sqlx::query("UPDATE devices SET location = ?, updated_at = ? WHERE id = ?")
            .bind(v).bind(&now).bind(id).execute(db).await?;
    }
    if let Some(v) = &req.role {
        sqlx::query("UPDATE devices SET role = ?, updated_at = ? WHERE id = ?")
            .bind(v).bind(&now).bind(id).execute(db).await?;
    }
    if let Some(v) = &req.ssh_username {
        sqlx::query("UPDATE devices SET ssh_username = ?, updated_at = ? WHERE id = ?")
            .bind(v).bind(&now).bind(id).execute(db).await?;
    }
    if let Some(v) = &req.ssh_password {
        sqlx::query("UPDATE devices SET ssh_password = ?, updated_at = ? WHERE id = ?")
            .bind(v).bind(&now).bind(id).execute(db).await?;
    }
    if let Some(v) = &req.ssh_port {
        sqlx::query("UPDATE devices SET ssh_port = ?, updated_at = ? WHERE id = ?")
            .bind(v).bind(&now).bind(id).execute(db).await?;
    }
    get_device_by_id(db, id).await
}

pub async fn delete_device(db: &SqlitePool, id: &str) -> Result<bool> {
    let res = sqlx::query("DELETE FROM devices WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(res.rows_affected() > 0)
}

pub async fn apply_poll_result(db: &SqlitePool, device_id: &str, result: &PollResult) -> Result<()> {
    let now = now();

    // Update device main record
    sqlx::query(
        "UPDATE devices SET
            status = ?, os_version = COALESCE(?, os_version), model = COALESCE(?, model),
            serial_number = COALESCE(?, serial_number), uptime = ?,
            cpu_pct = ?, mem_pct = ?, last_seen = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind("online")
    .bind(&result.os_version)
    .bind(&result.model)
    .bind(&result.serial_number)
    .bind(&result.uptime)
    .bind(result.cpu_pct.map(|v| v as i64))
    .bind(result.mem_pct.map(|v| v as i64))
    .bind(&now)
    .bind(&now)
    .bind(device_id)
    .execute(db)
    .await?;

    // Replace interface entries
    sqlx::query("DELETE FROM device_interfaces WHERE device_id = ?")
        .bind(device_id)
        .execute(db)
        .await?;
    for iface in &result.interfaces {
        sqlx::query(
            "INSERT OR REPLACE INTO device_interfaces (id, device_id, name, description, status, speed, duplex, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id())
        .bind(device_id)
        .bind(&iface.name)
        .bind(&iface.description)
        .bind(&iface.status)
        .bind(&iface.speed)
        .bind(&iface.duplex)
        .bind(&now)
        .execute(db)
        .await?;
    }

    // Replace ARP entries
    sqlx::query("DELETE FROM device_arp_entries WHERE device_id = ?")
        .bind(device_id)
        .execute(db)
        .await?;
    for entry in &result.arp_entries {
        sqlx::query(
            "INSERT OR REPLACE INTO device_arp_entries (id, device_id, ip_address, mac_address, interface, age_minutes, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id())
        .bind(device_id)
        .bind(&entry.ip_address)
        .bind(&entry.mac_address)
        .bind(&entry.interface)
        .bind(&entry.age_minutes)
        .bind(&now)
        .execute(db)
        .await?;
    }

    // Replace MAC table entries
    sqlx::query("DELETE FROM device_mac_entries WHERE device_id = ?")
        .bind(device_id)
        .execute(db)
        .await?;
    for entry in &result.mac_entries {
        sqlx::query(
            "INSERT OR REPLACE INTO device_mac_entries (id, device_id, mac_address, vlan, interface, entry_type, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(new_id())
        .bind(device_id)
        .bind(&entry.mac_address)
        .bind(&entry.vlan)
        .bind(&entry.interface)
        .bind(&entry.entry_type)
        .bind(&now)
        .execute(db)
        .await?;
    }

    Ok(())
}

pub async fn mark_device_offline(db: &SqlitePool, device_id: &str, reason: &str) -> Result<()> {
    let now = now();
    sqlx::query("UPDATE devices SET status = 'offline', updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(device_id)
        .execute(db)
        .await?;
    add_device_event(db, device_id, "error", reason).await
}

pub async fn add_device_event(db: &SqlitePool, device_id: &str, severity: &str, message: &str) -> Result<()> {
    sqlx::query(
        "INSERT INTO device_events (id, device_id, severity, message, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(device_id)
    .bind(severity)
    .bind(message)
    .bind(now())
    .execute(db)
    .await?;
    Ok(())
}

// ─── Sub-resources ────────────────────────────────────────────────────────────

pub async fn get_device_interfaces(db: &SqlitePool, device_id: &str) -> Result<Vec<DeviceInterface>> {
    let rows = sqlx::query_as::<_, DeviceInterface>(
        "SELECT * FROM device_interfaces WHERE device_id = ? ORDER BY name ASC",
    )
    .bind(device_id)
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn get_device_arp(db: &SqlitePool, device_id: &str) -> Result<Vec<ArpEntry>> {
    let rows = sqlx::query_as::<_, ArpEntry>(
        "SELECT * FROM device_arp_entries WHERE device_id = ? ORDER BY ip_address ASC",
    )
    .bind(device_id)
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn get_device_mac(db: &SqlitePool, device_id: &str) -> Result<Vec<MacEntry>> {
    let rows = sqlx::query_as::<_, MacEntry>(
        "SELECT * FROM device_mac_entries WHERE device_id = ? ORDER BY vlan ASC, mac_address ASC",
    )
    .bind(device_id)
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn get_device_events(db: &SqlitePool, device_id: &str, limit: i64) -> Result<Vec<DeviceEvent>> {
    let rows = sqlx::query_as::<_, DeviceEvent>(
        "SELECT * FROM device_events WHERE device_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(device_id)
    .bind(limit)
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn get_recent_events(db: &SqlitePool, limit: i64) -> Result<Vec<DeviceEvent>> {
    let rows = sqlx::query_as::<_, DeviceEvent>(
        "SELECT * FROM device_events ORDER BY created_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(db)
    .await?;
    Ok(rows)
}

// ─── Summary ─────────────────────────────────────────────────────────────────

pub async fn get_summary(db: &SqlitePool) -> Result<Summary> {
    let counts: Vec<(String, i64)> =
        sqlx::query_as("SELECT status, COUNT(*) FROM devices GROUP BY status")
            .fetch_all(db)
            .await?;
    let mut total = 0i64;
    let mut online = 0i64;
    let mut offline = 0i64;
    let mut warning = 0i64;
    for (status, n) in &counts {
        total += n;
        match status.as_str() {
            "online" => online += n,
            "offline" => offline += n,
            "warning" => warning += n,
            _ => {}
        }
    }
    let user_counts: Vec<(String, i64)> =
        sqlx::query_as("SELECT status, COUNT(*) FROM users GROUP BY status")
            .fetch_all(db)
            .await?;
    let mut total_users = 0i64;
    let mut active_users = 0i64;
    for (status, n) in &user_counts {
        total_users += n;
        if status == "active" {
            active_users += n;
        }
    }
    let recent_events = get_recent_events(db, 20).await?;
    Ok(Summary {
        total_devices: total,
        online_devices: online,
        offline_devices: offline,
        warning_devices: warning,
        total_users,
        active_users,
        recent_events,
    })
}
