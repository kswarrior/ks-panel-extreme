package repository

import (
	"database/sql"
)

// SFTPConfig is one row of instance_sftp (migration 058). The cleartext
// password is NEVER here — it lives in instance_secrets under key
// SFTPSecretKey, sealed with the panel's secretbox vault.
type SFTPConfig struct {
	InstanceID int64  `json:"instance_id"`
	Enabled    int    `json:"enabled"`
	Username   string `json:"username"`
	Port       int    `json:"port"`
	Root       string `json:"root"`
	UpdatedAt  string `json:"updated_at"`
}

// SFTPSecretKey is the instance_secrets key holding the SFTP password.
const SFTPSecretKey = "sftp_password"

// SFTPRepository owns the instance_sftp table (058).
type SFTPRepository struct {
	db *sql.DB
}

func NewSFTPRepository(db *sql.DB) *SFTPRepository {
	return &SFTPRepository{db: db}
}

// Get returns the SFTP row for an instance, or (nil, nil) when none exists.
//
// The COUNT(*) pre-pass mirrors SecretRepository.ListByInstance: modernc.org
// sqlite occasionally surfaces a phantom all-NULL row for genuinely empty
// result sets, and scanning straight into int64 then crashes with
// "converting NULL to int64".
func (r *SFTPRepository) Get(instanceID int64) (*SFTPConfig, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instance_sftp WHERE instance_id = ?`, instanceID).Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, nil
	}
	var c SFTPConfig
	var updated sql.NullString
	err := r.db.QueryRow(
		`SELECT instance_id, enabled, username, port, root, updated_at
		 FROM instance_sftp WHERE instance_id = ?`, instanceID,
	).Scan(&c.InstanceID, &c.Enabled, &c.Username, &c.Port, &c.Root, &updated)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	c.UpdatedAt = updated.String
	return &c, nil
}

// Upsert creates or replaces the SFTP row for an instance.
func (r *SFTPRepository) Upsert(c SFTPConfig) error {
	_, err := r.db.Exec(
		`INSERT INTO instance_sftp (instance_id, enabled, username, port, root, updated_at)
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(instance_id) DO UPDATE SET enabled = excluded.enabled,
		     username = excluded.username, port = excluded.port,
		     root = excluded.root, updated_at = CURRENT_TIMESTAMP`,
		c.InstanceID, c.Enabled, c.Username, c.Port, c.Root,
	)
	return err
}

// SetEnabled flips the enabled flag without touching the dial parameters.
// Used by Suspend (0) / Unsuspend (1) so the credentials survive the block.
func (r *SFTPRepository) SetEnabled(instanceID int64, enabled int) error {
	_, err := r.db.Exec(
		`UPDATE instance_sftp SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE instance_id = ?`,
		enabled, instanceID,
	)
	return err
}

// Delete removes the SFTP row for an instance. Called on Destroy; the vault
// secret is deleted separately via SecretRepository.
func (r *SFTPRepository) Delete(instanceID int64) error {
	_, err := r.db.Exec(`DELETE FROM instance_sftp WHERE instance_id = ?`, instanceID)
	return err
}
