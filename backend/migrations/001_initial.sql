-- Users
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY NOT NULL,
    username    TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'operator', 'viewer')),
    status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    last_login  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Devices (switches)
CREATE TABLE IF NOT EXISTS devices (
    id              TEXT PRIMARY KEY NOT NULL,
    hostname        TEXT NOT NULL,
    ip_address      TEXT NOT NULL UNIQUE,
    model           TEXT,
    location        TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('core', 'distribution', 'access', 'edge')),
    status          TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('online', 'offline', 'warning', 'unknown')),
    os_version      TEXT,
    serial_number   TEXT,
    port_count      INTEGER,
    uptime          TEXT,
    cpu_pct         INTEGER,
    mem_pct         INTEGER,
    last_seen       TEXT,
    ssh_username    TEXT NOT NULL,
    ssh_password    TEXT NOT NULL,
    ssh_port        INTEGER NOT NULL DEFAULT 22,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Per-device interface state (refreshed each poll cycle)
CREATE TABLE IF NOT EXISTS device_interfaces (
    id          TEXT PRIMARY KEY NOT NULL,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL,
    speed       TEXT,
    duplex      TEXT,
    updated_at  TEXT NOT NULL,
    UNIQUE(device_id, name)
);

-- Per-device ARP table
CREATE TABLE IF NOT EXISTS device_arp_entries (
    id          TEXT PRIMARY KEY NOT NULL,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ip_address  TEXT NOT NULL,
    mac_address TEXT NOT NULL,
    interface   TEXT,
    age_minutes TEXT,
    updated_at  TEXT NOT NULL,
    UNIQUE(device_id, ip_address)
);

-- Per-device MAC address table
CREATE TABLE IF NOT EXISTS device_mac_entries (
    id          TEXT PRIMARY KEY NOT NULL,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    mac_address TEXT NOT NULL,
    vlan        TEXT,
    interface   TEXT,
    entry_type  TEXT,
    updated_at  TEXT NOT NULL,
    UNIQUE(device_id, mac_address, vlan)
);

-- Device event log
CREATE TABLE IF NOT EXISTS device_events (
    id          TEXT PRIMARY KEY NOT NULL,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    severity    TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'error')),
    message     TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_events_device ON device_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_interfaces_device ON device_interfaces(device_id);
CREATE INDEX IF NOT EXISTS idx_device_arp_device ON device_arp_entries(device_id);
CREATE INDEX IF NOT EXISTS idx_device_mac_device ON device_mac_entries(device_id);
