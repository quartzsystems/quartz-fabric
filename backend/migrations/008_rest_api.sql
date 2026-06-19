-- Migrate from SSH credentials to Dell OS9 REST API credentials.
-- SQLite does not support DROP COLUMN portably, so the old ssh_* columns
-- remain in the table but are no longer used by application code.

-- Add REST API credential columns to devices
ALTER TABLE devices ADD COLUMN rest_username TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN rest_password TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN rest_port     INTEGER NOT NULL DEFAULT 8008;

-- Seed from existing SSH values so current devices stay connected
UPDATE devices SET rest_username = ssh_username, rest_password = ssh_password;

-- Add unified REST timeout to settings (replaces two separate SSH timeouts)
ALTER TABLE system_settings ADD COLUMN rest_timeout_secs INTEGER NOT NULL DEFAULT 30;
UPDATE system_settings
   SET rest_timeout_secs = MAX(ssh_connect_timeout_secs, ssh_read_timeout_secs);
