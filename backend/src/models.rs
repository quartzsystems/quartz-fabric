use serde::{Deserialize, Serialize};

// ─── User ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
    pub display_name: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub role: String,
    pub status: String,
    pub last_login: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub email: String,
    pub display_name: String,
    pub password: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub status: Option<String>,
    pub password: Option<String>,
}

// ─── Device ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Device {
    pub id: String,
    pub hostname: String,
    pub ip_address: String,
    pub model: Option<String>,
    pub location: String,
    pub role: String,
    pub status: String,
    pub os_version: Option<String>,
    pub serial_number: Option<String>,
    pub port_count: Option<i64>,
    pub uptime: Option<String>,
    pub cpu_pct: Option<i64>,
    pub mem_pct: Option<i64>,
    pub last_seen: Option<String>,
    #[serde(skip_serializing)]
    pub ssh_username: String,
    #[serde(skip_serializing)]
    pub ssh_password: String,
    pub ssh_port: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDeviceRequest {
    pub hostname: String,
    pub ip_address: String,
    pub location: String,
    pub role: String,
    pub ssh_username: String,
    pub ssh_password: String,
    pub ssh_port: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDeviceRequest {
    pub hostname: Option<String>,
    pub ip_address: Option<String>,
    pub location: Option<String>,
    pub role: Option<String>,
    pub ssh_username: Option<String>,
    pub ssh_password: Option<String>,
    pub ssh_port: Option<i64>,
}

// ─── Interface ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DeviceInterface {
    pub id: String,
    pub device_id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub speed: Option<String>,
    pub duplex: Option<String>,
    pub updated_at: String,
}

// ─── ARP entry ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ArpEntry {
    pub id: String,
    pub device_id: String,
    pub ip_address: String,
    pub mac_address: String,
    pub interface: Option<String>,
    pub age_minutes: Option<String>,
    pub updated_at: String,
}

// ─── MAC entry ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MacEntry {
    pub id: String,
    pub device_id: String,
    pub mac_address: String,
    pub vlan: Option<String>,
    pub interface: Option<String>,
    pub entry_type: Option<String>,
    pub updated_at: String,
}

// ─── Event ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DeviceEvent {
    pub id: String,
    pub device_id: String,
    pub severity: String,
    pub message: String,
    pub created_at: String,
}

// ─── Auth ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: User,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>,
}

// ─── Settings ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DbSettings {
    pub poll_interval_secs: i64,
    pub poll_concurrency: i64,
    pub ssh_connect_timeout_secs: i64,
    pub ssh_read_timeout_secs: i64,
    pub jwt_expiry_hours: i64,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub poll_interval_secs: Option<i64>,
    pub poll_concurrency: Option<i64>,
    pub ssh_connect_timeout_secs: Option<i64>,
    pub ssh_read_timeout_secs: Option<i64>,
    pub jwt_expiry_hours: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct SystemSettings {
    pub poll_interval_secs: i64,
    pub poll_concurrency: i64,
    pub ssh_connect_timeout_secs: i64,
    pub ssh_read_timeout_secs: i64,
    pub jwt_expiry_hours: i64,
    pub listen_addr: String,
    pub cors_origin: String,
    pub updated_at: String,
}

// ─── Summary ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct Summary {
    pub total_devices: i64,
    pub online_devices: i64,
    pub offline_devices: i64,
    pub warning_devices: i64,
    pub total_users: i64,
    pub active_users: i64,
    pub recent_events: Vec<DeviceEvent>,
}
