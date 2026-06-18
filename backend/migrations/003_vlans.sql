CREATE TABLE IF NOT EXISTS device_vlans (
    id            TEXT PRIMARY KEY NOT NULL,
    device_id     TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    vlan_id       INTEGER NOT NULL,
    name          TEXT,
    status        TEXT NOT NULL DEFAULT 'active',
    tagged_ports  TEXT,
    untagged_ports TEXT,
    updated_at    TEXT NOT NULL,
    UNIQUE(device_id, vlan_id)
);

CREATE INDEX IF NOT EXISTS idx_device_vlans_device ON device_vlans(device_id);
