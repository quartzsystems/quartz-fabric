CREATE TABLE IF NOT EXISTS system_settings (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    poll_interval_secs       INTEGER NOT NULL DEFAULT 300,
    poll_concurrency         INTEGER NOT NULL DEFAULT 5,
    ssh_connect_timeout_secs INTEGER NOT NULL DEFAULT 15,
    ssh_read_timeout_secs    INTEGER NOT NULL DEFAULT 30,
    jwt_expiry_hours         INTEGER NOT NULL DEFAULT 8,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
