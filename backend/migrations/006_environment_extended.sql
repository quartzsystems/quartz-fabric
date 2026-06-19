-- Extended environment data: PSU power draw, fan speeds, and temperature readings

ALTER TABLE device_psus ADD COLUMN power_watts     INTEGER;
ALTER TABLE device_psus ADD COLUMN avg_power_watts INTEGER;
ALTER TABLE device_psus ADD COLUMN fan_speed_rpm   INTEGER;

ALTER TABLE device_fans ADD COLUMN speed_rpm TEXT;

-- Per-sensor temperature readings (ambient unit temp + thermal sensor values)
CREATE TABLE IF NOT EXISTS device_temps (
    id          TEXT    PRIMARY KEY NOT NULL,
    device_id   TEXT    NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    slot        TEXT    NOT NULL,
    temp_c      INTEGER NOT NULL,
    updated_at  TEXT    NOT NULL,
    UNIQUE(device_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_device_temps_device ON device_temps(device_id);
