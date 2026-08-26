-- 017_device_registration.sql: per-device account-creation accounting.
--
-- The "Accounts per device" limit lives in settings (key
-- 'device_account_limit', value "0" = unlimited). To enforce it we record
-- each successful self-registration against a device id minted by the
-- register handler and stored on the client as a long-lived cookie, so the
-- same browser/device is recognizable across registrations. Admin-created
-- accounts are intentionally NOT tracked here (only self registrations).

CREATE TABLE IF NOT EXISTS device_registrations (
    id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL,
    user_id      INTEGER,
    email        TEXT    NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX devreg_device_idx ON device_registrations(device_id);
