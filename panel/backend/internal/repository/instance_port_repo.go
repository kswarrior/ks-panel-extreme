package repository

import (
	"database/sql"
	"fmt"
)

// InstancePort is one host->container binding for an instance.
type InstancePort struct {
	ID            int64  `json:"id"`
	InstanceID    int64  `json:"instance_id"`
	HostPort      int    `json:"host_port"`
	ContainerPort int    `json:"container_port"`
	Protocol      string `json:"protocol"`
	IP            string `json:"ip"`
	CreatedAt     string `json:"created_at"`
}

// InstancePortInput is the validated PUT payload entry.
type InstancePortInput struct {
	Host      int    `json:"host"`
	Container int    `json:"container"`
	Protocol  string `json:"protocol"`
	IP        string `json:"ip"`
}

// InstancePortRepository owns the instance_ports table (055).
type InstancePortRepository struct {
	db *sql.DB
}

func NewInstancePortRepository(db *sql.DB) *InstancePortRepository {
	return &InstancePortRepository{db: db}
}

// List returns all allocations for an instance in id order.
func (r *InstancePortRepository) List(instanceID int64) ([]InstancePort, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM instance_ports WHERE instance_id = ?`, instanceID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]InstancePort, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, instance_id, host_port, container_port, protocol, ip, created_at
		FROM instance_ports WHERE instance_id = ? ORDER BY id ASC`, instanceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p InstancePort
		var created sql.NullString
		if err := rows.Scan(&p.ID, &p.InstanceID, &p.HostPort, &p.ContainerPort, &p.Protocol, &p.IP, &created); err != nil {
			return nil, err
		}
		p.CreatedAt = created.String
		out = append(out, p)
	}
	return out, rows.Err()
}

// Replace atomically replaces the whole allocation set for an instance.
// It deletes existing rows and inserts the new set in one transaction.
func (r *InstancePortRepository) Replace(instanceID int64, ports []InstancePortInput) ([]InstancePort, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	if _, err = tx.Exec(`DELETE FROM instance_ports WHERE instance_id = ?`, instanceID); err != nil {
		return nil, fmt.Errorf("instance_ports delete: %w", err)
	}
	for _, p := range ports {
		if _, err = tx.Exec(`INSERT INTO instance_ports (instance_id, host_port, container_port, protocol, ip)
			VALUES (?, ?, ?, ?, ?)`, instanceID, p.Host, p.Container, p.Protocol, p.IP); err != nil {
			return nil, fmt.Errorf("instance_ports insert: %w", err)
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return r.List(instanceID)
}
