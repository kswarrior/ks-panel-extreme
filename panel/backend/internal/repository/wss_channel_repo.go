package repository

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/example/kspanel/internal/models"
)

// WssChannelRepository manages the `node_wss_channels` table (migration 062):
// the named WSS bindings the NodeForm's WSS box edits (top-right Add button).
type WssChannelRepository struct {
	db *sql.DB
}

func NewWssChannelRepository(db *sql.DB) *WssChannelRepository {
	return &WssChannelRepository{db: db}
}

// WssChannelInput is the validated shape handlers pass for one channel row.
type WssChannelInput struct {
	Name      string
	Task      string
	Transport string
	Fallback  bool
	Position  int
}

// ValidWssTasks is the fixed task taxonomy the form offers. `all` is the
// catch-all (handles every WSS payload); exact-task rows win over `all`
// rows when routing. Multiple rows may share a task — the panel divides
// that task's data across them round-robin.
var ValidWssTasks = map[string]bool{
	"all":      true,
	"files":    true,
	"node":     true,
	"instance": true,
}

// ValidWssTransports is the per-task preferred transport for both/local_both
// modes: force WSS, force direct HTTP (port), or auto (WSS when connected
// else HTTP, with emergency fallback on overload/disconnect).
var ValidWssTransports = map[string]bool{
	"wss":  true,
	"port": true,
	"auto": true,
}

// NormalizeWssTask lowercases/trims and defaults empty to "all".
func NormalizeWssTask(t string) string {
	t = strings.TrimSpace(strings.ToLower(t))
	if t == "" {
		return "all"
	}
	return t
}

// NormalizeWssTransport lowercases/trims and defaults empty to "auto".
func NormalizeWssTransport(t string) string {
	t = strings.TrimSpace(strings.ToLower(t))
	if t == "" {
		return "auto"
	}
	return t
}

// ValidateWssChannel enforces the fail-closed rules for one channel row.
// Returns a user-facing error string or "" when acceptable.
func ValidateWssChannel(name, task, transport string) string {
	if strings.TrimSpace(name) == "" {
		return "channel name is required"
	}
	if len(name) > 100 {
		return "channel name must be 100 characters or fewer"
	}
	if !ValidWssTasks[NormalizeWssTask(task)] {
		return "invalid channel task (want all|files|node|instance)"
	}
	if !ValidWssTransports[NormalizeWssTransport(transport)] {
		return "invalid channel transport (want wss|port|auto)"
	}
	return ""
}

// isMissingChannelsTable reports whether err is the pre-062 "no such table"
// case so readers can degrade to "no channels" instead of a hard 500 while
// the migration is still rolling out.
func isMissingChannelsTable(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "no such table") && strings.Contains(msg, "node_wss_channels")
}

// ListChannels returns a node's channels ordered by position then id.
func (r *WssChannelRepository) ListChannels(nodeID int64) ([]models.WssChannel, error) {
	rows, err := r.db.Query(
		`SELECT id, node_id, name, task, transport, fallback, position
		 FROM node_wss_channels WHERE node_id = ? ORDER BY position ASC, id ASC`, nodeID)
	if err != nil {
		if isMissingChannelsTable(err) {
			return []models.WssChannel{}, nil
		}
		return nil, err
	}
	defer rows.Close()
	out := []models.WssChannel{}
	for rows.Next() {
		var c models.WssChannel
		var fallbackInt int
		if err := rows.Scan(&c.ID, &c.NodeID, &c.Name, &c.Task, &c.Transport, &fallbackInt, &c.Position); err != nil {
			return nil, err
		}
		c.Fallback = fallbackInt != 0
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		if isMissingChannelsTable(err) {
			return []models.WssChannel{}, nil
		}
		return nil, err
	}
	return out, nil
}

// ReplaceChannels atomically swaps a node's full channel set (delete + insert
// in one transaction). Used by Create/Update node so a fresh node can ship
// its channels in the same payload without a second round-trip.
func (r *WssChannelRepository) ReplaceChannels(nodeID int64, channels []WssChannelInput) error {
	// Validate + enforce per-node name uniqueness (trimmed, case-insensitive)
	// before touching the DB so a bad payload never half-lands.
	seen := map[string]bool{}
	for i := range channels {
		channels[i].Task = NormalizeWssTask(channels[i].Task)
		channels[i].Transport = NormalizeWssTransport(channels[i].Transport)
		if msg := ValidateWssChannel(channels[i].Name, channels[i].Task, channels[i].Transport); msg != "" {
			return fmt.Errorf("%s", msg)
		}
		key := strings.ToLower(strings.TrimSpace(channels[i].Name))
		if seen[key] {
			return fmt.Errorf("duplicate channel name %q", channels[i].Name)
		}
		seen[key] = true
		channels[i].Position = i
	}
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM node_wss_channels WHERE node_id = ?`, nodeID); err != nil {
		if !isMissingChannelsTable(err) {
			return err
		}
		// Pre-062 DB without the table: nothing to replace yet. The
		// migration will create it on next launch; report success so node
		// saves keep working during rollout.
		return nil
	}
	for _, c := range channels {
		fb := 0
		if c.Fallback {
			fb = 1
		}
		if _, err := tx.Exec(
			`INSERT INTO node_wss_channels (node_id, name, task, transport, fallback, position)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			nodeID, strings.TrimSpace(c.Name), c.Task, c.Transport, fb, c.Position); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// CreateChannel inserts one channel and returns its id.
func (r *WssChannelRepository) CreateChannel(nodeID int64, in WssChannelInput) (int64, error) {
	in.Task = NormalizeWssTask(in.Task)
	in.Transport = NormalizeWssTransport(in.Transport)
	if msg := ValidateWssChannel(in.Name, in.Task, in.Transport); msg != "" {
		return 0, fmt.Errorf("%s", msg)
	}
	// Enforce per-node name uniqueness.
	existing, err := r.ListChannels(nodeID)
	if err != nil {
		return 0, err
	}
	key := strings.ToLower(strings.TrimSpace(in.Name))
	for _, c := range existing {
		if strings.ToLower(strings.TrimSpace(c.Name)) == key {
			return 0, fmt.Errorf("a channel named %q already exists on this node", in.Name)
		}
	}
	fb := 0
	if in.Fallback {
		fb = 1
	}
	// Next position appends to the end.
	maxPos := -1
	for _, c := range existing {
		if c.Position > maxPos {
			maxPos = c.Position
		}
	}
	res, err := r.db.Exec(
		`INSERT INTO node_wss_channels (node_id, name, task, transport, fallback, position)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		nodeID, strings.TrimSpace(in.Name), in.Task, in.Transport, fb, maxPos+1)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdateChannel patches one channel row (must belong to nodeID).
func (r *WssChannelRepository) UpdateChannel(nodeID, id int64, in WssChannelInput) error {
	in.Task = NormalizeWssTask(in.Task)
	in.Transport = NormalizeWssTransport(in.Transport)
	if msg := ValidateWssChannel(in.Name, in.Task, in.Transport); msg != "" {
		return fmt.Errorf("%s", msg)
	}
	existing, err := r.ListChannels(nodeID)
	if err != nil {
		return err
	}
	found := false
	key := strings.ToLower(strings.TrimSpace(in.Name))
	for _, c := range existing {
		if c.ID == id {
			found = true
			continue
		}
		if strings.ToLower(strings.TrimSpace(c.Name)) == key {
			return fmt.Errorf("a channel named %q already exists on this node", in.Name)
		}
	}
	if !found {
		return fmt.Errorf("channel not found")
	}
	fb := 0
	if in.Fallback {
		fb = 1
	}
	res, err := r.db.Exec(
		`UPDATE node_wss_channels SET name = ?, task = ?, transport = ?, fallback = ?
		 WHERE id = ? AND node_id = ?`,
		strings.TrimSpace(in.Name), in.Task, in.Transport, fb, id, nodeID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("channel not found")
	}
	return nil
}

// DeleteChannel removes one channel row (must belong to nodeID).
func (r *WssChannelRepository) DeleteChannel(nodeID, id int64) error {
	res, err := r.db.Exec(`DELETE FROM node_wss_channels WHERE id = ? AND node_id = ?`, id, nodeID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("channel not found")
	}
	return nil
}
