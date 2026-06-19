-- PSU health per device (upserted each poll cycle)
CREATE TABLE IF NOT EXISTS device_psus (
    id          TEXT PRIMARY KEY NOT NULL,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    slot        TEXT NOT NULL,
    status      TEXT NOT NULL,
    present     INTEGER NOT NULL DEFAULT 1,
    updated_at  TEXT NOT NULL,
    UNIQUE(device_id, slot)
);

-- Fan health per device (upserted each poll cycle)
CREATE TABLE IF NOT EXISTS device_fans (
    id          TEXT PRIMARY KEY NOT NULL,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    slot        TEXT NOT NULL,
    status      TEXT NOT NULL,
    present     INTEGER NOT NULL DEFAULT 1,
    updated_at  TEXT NOT NULL,
    UNIQUE(device_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_device_psus_device ON device_psus(device_id);
CREATE INDEX IF NOT EXISTS idx_device_fans_device ON device_fans(device_id);
