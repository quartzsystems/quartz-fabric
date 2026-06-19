-- Audit log: records user-initiated configuration changes
CREATE TABLE IF NOT EXISTS audit_log (
    id               TEXT    PRIMARY KEY,
    user_id          TEXT    NOT NULL,
    username         TEXT    NOT NULL,
    device_id        TEXT    NOT NULL,
    device_hostname  TEXT    NOT NULL,
    action           TEXT    NOT NULL,
    details          TEXT,
    created_at       TEXT    NOT NULL
);

-- Display timezone for the UI (IANA tz name, e.g. "America/New_York")
ALTER TABLE system_settings ADD COLUMN display_timezone TEXT NOT NULL DEFAULT 'UTC';
