package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
)

// DeviceRegistrationRepository records which self-registered accounts came
// from which device id so the "accounts per device" limit in settings can
// be enforced. Admin-created accounts are NOT recorded here — only the
// public /api/auth/register flow writes rows.
type DeviceRegistrationRepository struct {
	db *sql.DB
}

func NewDeviceRegistrationRepository(db *sql.DB) *DeviceRegistrationRepository {
	return &DeviceRegistrationRepository{db: db}
}

// NewDeviceID returns a fresh, URL-safe random device identifier (32 hex
// chars). Used the first time a browser hits the register page to mint a
// long-lived cookie so subsequent registrations from the same browser are
// recognized.
func NewDeviceID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// CountForDevice returns how many self-registered accounts are attributed
// to the given device id. Returns 0 (never errors) when the device is
// unknown or when the read fails, so a transient DB hiccup degrades to
// "treat as unlimited" rather than blocking registration entirely.
func (r *DeviceRegistrationRepository) CountForDevice(deviceID string) int {
	if deviceID == "" {
		return 0
	}
	var n int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM device_registrations WHERE device_id = ?`, deviceID).Scan(&n)
	if err != nil {
		return 0
	}
	return n
}

// Record inserts a row linking a freshly-registered account to its device
// id. The user_id may be 0 when the caller doesn't have it yet (the
// register flow resolves it after CreateUser); the email is always known.
func (r *DeviceRegistrationRepository) Record(deviceID string, userID int64, email string) error {
	if deviceID == "" {
		return nil
	}
	_, err := r.db.Exec(
		`INSERT INTO device_registrations (device_id, user_id, email) VALUES (?, ?, ?)`,
		deviceID, userID, email)
	if err != nil {
		return fmt.Errorf("record device registration: %w", err)
	}
	return nil
}
