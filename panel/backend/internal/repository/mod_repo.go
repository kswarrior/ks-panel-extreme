package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/models"
)

// ModRepository persists Mods (admin-uploaded add-on packages) and the
// per-capability permission rows the admin must approve before a mod can be
// activated. The lifecycle is upload -> (admin reviews requested caps) ->
// grant each -> activate. Deactivate keeps the rows so the admin can re-grant
// and reactivate later.
type ModRepository struct {
	db *sql.DB
}

func NewModRepository(db *sql.DB) *ModRepository {
	return &ModRepository{db: db}
}

// ErrModNotFound is the sentinel every "no such mod" path returns so handlers
// can map it to 404 while surfacing real DB failures as 500 instead of a
// misleading "mod not found".
var ErrModNotFound = errors.New("mod not found")

// ModsEngineSettingKey is the settings-KV key backing the mod engine kill
// switch ("1" = engine enabled, default; "0" = engine disabled). It reuses the
// existing settings table, so no migration is required.
const ModsEngineSettingKey = "mods_engine_enabled"

// ModsEnabled reports whether the mod engine is enabled. A missing row (fresh
// install) or an unreadable settings table both default to enabled=true — the
// kill switch must fail open for reads only in the sense of preserving the
// panel's historical behaviour; writes are explicit admin actions.
// Fail-closed would silently disable every existing active mod after any DB
// hiccup, which is a worse failure mode than keeping the previous state.
func (r *ModRepository) ModsEnabled() bool {
	var v string
	err := r.db.QueryRow(`SELECT value FROM settings WHERE `+qKey()+` = ?`, ModsEngineSettingKey).Scan(&v)
	if err != nil {
		return true
	}
	return v != "0"
}

// SetModsEnabled persists the kill switch. UPDATE-then-fallback-INSERT works
// across SQLite / PostgreSQL / MySQL (their upsert syntaxes differ).
func (r *ModRepository) SetModsEnabled(enabled bool) error {
	val := "0"
	if enabled {
		val = "1"
	}
	res, err := r.db.Exec(`UPDATE settings SET value = ? WHERE `+qKey()+` = ?`, val, ModsEngineSettingKey)
	if err != nil {
		return err
	}
	if n, e := res.RowsAffected(); e == nil && n > 0 {
		return nil
	}
	_, err = r.db.Exec(`INSERT INTO settings (`+qKey()+`, value) VALUES (?, ?)`, ModsEngineSettingKey, val)
	return err
}

const modColumns = "id, name, slug, version, description, manifest, spec, active, uploaded_by, engine_version, source, source_url, package_size, created_at, updated_at"

func scanMod(scanner interface{ Scan(...any) error }) (*models.Mod, error) {
	var m models.Mod
	var manifest, spec string
	var uploadedBy sql.NullInt64
	var active, engineVersion int
	var created, updated string
	var source, sourceURL string
	var packageSize int64
	if err := scanner.Scan(&m.ID, &m.Name, &m.Slug, &m.Version, &m.Description, &manifest, &spec, &active, &uploadedBy, &engineVersion, &source, &sourceURL, &packageSize, &created, &updated); err != nil {
		return nil, err
	}
	m.Manifest = json.RawMessage(manifest)
	if spec != "" {
		m.Spec = json.RawMessage(spec)
	}
	m.Active = active != 0
	m.EngineVersion = engineVersion
	if m.EngineVersion == 0 {
		m.EngineVersion = 1 // pre-020 rows / NULL-ish default collapse to v1
	}
	if source == "" {
		source = models.ModSourceFile // pre-027 rows collapse to file
	}
	m.Source = source
	m.SourceURL = sourceURL
	m.PackageSize = packageSize
	if uploadedBy.Valid {
		v := uploadedBy.Int64
		m.UploadedBy = &v
	}
	m.CreatedAt, _ = parseSQLiteTime(created)
	m.UpdatedAt, _ = parseSQLiteTime(updated)
	return &m, nil
}

// ManifestInput is the validated shape the upload handler extracts from the
// mod's JSON manifest. Only `permissionsRequested` is structurally known to
// the backend — the rest is passed through as raw JSON so the frontend can
// enrich the manifest later without a schema change.
type ManifestInput struct {
	Name                 string          `json:"name"`
	Slug                 string          `json:"slug"`
	Version              string          `json:"version"`
	Description          string          `json:"description"`
	Spec                 json.RawMessage `json:"spec"`
	PermissionsRequested []PermissionReq `json:"permissionsRequested"`
}

// PermissionReq is one capability request inside a manifest's
// `permissionsRequested[]`. Capability must be one of the AllowedCapabilties;
// AccessLevel is an optional human-facing description the shows up next to the
// capability (e.g. "read_only" / "read_write").
type PermissionReq struct {
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
}

// CreateModInput is the fully-resolved payload CreateMod accepts. The handler
// parses the manifest bytes into ManifestInput then forwards the resolved
// fields + raw manifest JSON here.
type CreateModInput struct {
	Name                 string
	Slug                 string
	Version              string
	Description          string
	Manifest             json.RawMessage
	Spec                 json.RawMessage
	PermissionsRequested []PermissionReq
	UploadedBy           int64
	// Source / SourceURL track the install provenance for the audit
	// timeline + mod card ("url", "file", "studio", "json"). SourceURL is
	// only meaningful when Source == "url".
	Source    string
	SourceURL string
	// PackageSize records the byte size of the .kspm zip the panel stored on
	// disk for this mod; 0 means no on-disk package (synthesize on download).
	// The handler sets it after persisting the package file.
	PackageSize int64
}

// validatePermissionRequests rejects unknown capability codes and duplicate
// requests for the same capability. Duplicates would violate the
// UNIQUE(mod_id, capability) constraint mid-transaction with an obscure SQL
// error, so we fail early with a message the admin can act on.
func validatePermissionRequests(perms []PermissionReq) error {
	allowed := map[string]struct{}{}
	for _, c := range models.AllowedCapabilties() {
		allowed[c] = struct{}{}
	}
	seen := map[string]struct{}{}
	for _, p := range perms {
		if _, ok := allowed[p.Capability]; !ok {
			return fmt.Errorf("unknown capability %q", p.Capability)
		}
		if _, ok := seen[p.Capability]; ok {
			return fmt.Errorf("duplicate permission request for capability %q", p.Capability)
		}
		seen[p.Capability] = struct{}{}
	}
	return nil
}

// CreateMod inserts a new mod together with its requested-capability rows
// (all seeded granted = 0, i.e. pending admin approval). Returns the new row.
// A duplicate slug surfaces as a UNIQUE error the handler turns into 409.
func (r *ModRepository) CreateMod(in CreateModInput) (*models.Mod, error) {
	if in.Name == "" || in.Slug == "" {
		return nil, fmt.Errorf("name and slug are required")
	}
	if !models.ValidModSlug(in.Slug) {
		return nil, fmt.Errorf("invalid slug %q: use lowercase letters, digits and hyphens (max 64 chars)", in.Slug)
	}
	manifest := string(in.Manifest)
	if manifest == "" {
		manifest = "{}"
	}
	spec := string(in.Spec)
	if spec == "" {
		spec = "{}"
	}
	source := in.Source
	if source == "" {
		source = models.ModSourceFile
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")

	// Resolve the manifest's engine version so the mods.engine_version column
	// reflects what the mod actually ships. Without this the row would keep
	// the column default (1) even for a v2 manifest, so the admin UI and any
	// DB-only consumer would misreport a v2 mod as v1. The runtime re-parses
	// the manifest itself (ParseV2Manifest), so activation is unaffected,
	// but the stored column must agree for the panel-wide report to be honest.
	engineVersion := models.ParseV2Manifest(in.Manifest).EngineVersion
	if engineVersion == 0 {
		engineVersion = 1
	}

	// Validate requested capabilities so a malformed / hostile manifest
	// can't insert an unknown capability string (which the admin modal would
	// happily render as a checkbox the panel doesn't actually implement),
	// and reject duplicates that would trip the UNIQUE constraint.
	if err := validatePermissionRequests(in.PermissionsRequested); err != nil {
		return nil, err
	}

	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	id, err := insertReturningID(tx,
		`INSERT INTO mods (name, slug, version, description, manifest, spec, active, uploaded_by, engine_version, source, source_url, package_size, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
		in.Name, in.Slug, in.Version, in.Description, manifest, spec, in.UploadedBy, engineVersion, source, in.SourceURL, in.PackageSize, now, now,
	)
	if err != nil {
		return nil, err
	}

	for _, p := range in.PermissionsRequested {
		if _, err := tx.Exec(
			`INSERT INTO mod_permissions (mod_id, capability, access_level, granted) VALUES (?, ?, ?, 0)`,
			id, p.Capability, p.AccessLevel,
		); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetMod(id)
}

// UpdateModInput is the editable overlay: the admin can edit the human-facing
// fields + spec in place. The manifest's permission-request set is NOT touched
// here (changing requested caps is a re-upload); only the friendly metadata +
// spec blob are mutable, keeping the grant contract stable.
type UpdateModInput struct {
	Name        string
	Version     string
	Description string
	Spec        json.RawMessage
}

func (r *ModRepository) UpdateMod(id int64, in UpdateModInput) (*models.Mod, error) {
	if id == 0 {
		return nil, fmt.Errorf("mod id is required")
	}
	spec := string(in.Spec)
	if spec == "" {
		spec = "{}"
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(
		`UPDATE mods SET name = ?, version = ?, description = ?, spec = ?, updated_at = ? WHERE id = ?`,
		in.Name, in.Version, in.Description, spec, now, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrModNotFound
	}
	return r.GetMod(id)
}

// ListMods returns every mod with the uploader's username (empty when the
// uploader was since deleted — mods.uploaded_by is ON DELETE SET NULL).
func (r *ModRepository) ListMods() ([]models.Mod, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM mods`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.Mod, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`
		SELECT m.id, m.name, m.slug, m.version, m.description, m.manifest, m.spec, m.active, m.uploaded_by, m.engine_version, m.source, m.source_url, m.package_size, m.created_at, m.updated_at, u.username
		FROM mods m
		LEFT JOIN users u ON u.id = m.uploaded_by
		ORDER BY m.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var m models.Mod
		var manifest, spec string
		var uploadedBy sql.NullInt64
		var active, engineVersion int
		var created, updated string
		var source, sourceURL string
		var packageSize int64
		var owner sql.NullString
		if err := rows.Scan(&m.ID, &m.Name, &m.Slug, &m.Version, &m.Description, &manifest, &spec, &active, &uploadedBy, &engineVersion, &source, &sourceURL, &packageSize, &created, &updated, &owner); err != nil {
			return nil, err
		}
		m.Manifest = json.RawMessage(manifest)
		if spec != "" {
			m.Spec = json.RawMessage(spec)
		}
		m.Active = active != 0
		m.EngineVersion = engineVersion
		if m.EngineVersion == 0 {
			m.EngineVersion = 1
		}
		if source == "" {
			source = models.ModSourceFile
		}
		m.Source = source
		m.SourceURL = sourceURL
		m.PackageSize = packageSize
		if uploadedBy.Valid {
			v := uploadedBy.Int64
			m.UploadedBy = &v
		}
		m.CreatedAt, _ = parseSQLiteTime(created)
		m.UpdatedAt, _ = parseSQLiteTime(updated)
		m.OwnerName = owner.String
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetMod returns a single mod by id, or ErrModNotFound.
func (r *ModRepository) GetMod(id int64) (*models.Mod, error) {
	row := r.db.QueryRow(`SELECT `+modColumns+` FROM mods WHERE id = ?`, id)
	m, err := scanMod(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrModNotFound
		}
		return nil, err
	}
	if m.UploadedBy != nil {
		var nm sql.NullString
		_ = r.db.QueryRow(`SELECT username FROM users WHERE id = ?`, *m.UploadedBy).Scan(&nm)
		m.OwnerName = nm.String
	}
	return m, nil
}

// ListModPermissions returns the requested-capability rows for a mod, in the
// order the manifest declared them. The activation handler uses this to build
// the checklist the admin approves before flipping the mod active.
func (r *ModRepository) ListModPermissions(modID int64) ([]models.ModPermission, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM mod_permissions WHERE mod_id = ?`, modID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.ModPermission, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, mod_id, capability, access_level, granted FROM mod_permissions WHERE mod_id = ? ORDER BY id ASC`, modID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p models.ModPermission
		var granted int
		if err := rows.Scan(&p.ID, &p.ModID, &p.Capability, &p.AccessLevel, &granted); err != nil {
			return nil, err
		}
		p.Granted = granted != 0
		out = append(out, p)
	}
	return out, rows.Err()
}

// GrantDecision is one (capability -> approved) decision the activation
// handler applies. An empty decision list means "deny all / leave pending".
type GrantDecision struct {
	Capability string
	Granted    bool
}

// SetGrants upserts the granted flag for the listed capabilities. Only
// capabilities that already have a row for this mod are accepted (the row set
// is fixed by the manifest at upload), so the admin can't grant a capability
// the mod never requested.
func (r *ModRepository) SetGrants(modID int64, decisions []GrantDecision) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, d := range decisions {
		flag := 0
		if d.Granted {
			flag = 1
		}
		res, err := tx.Exec(
			`UPDATE mod_permissions SET granted = ? WHERE mod_id = ? AND capability = ?`,
			flag, modID, d.Capability,
		)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			// capability wasn't requested by this mod — skip rather than error
			// so the frontend's "approve all" button keeps working even when
			// the caller passes a superset of the mod's caps.
			continue
		}
	}
	return tx.Commit()
}

// AllGranted reports whether every requested capability for the mod has been
// explicitly approved. Activation refuses to flip the flag until this is true.
func (r *ModRepository) AllGranted(modID int64) (bool, error) {
	var pending int
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM mod_permissions WHERE mod_id = ? AND granted = 0`,
		modID,
	).Scan(&pending); err != nil {
		return false, err
	}
	// A mod that requested zero caps is trivially "all granted" — being
	// harmless is a valid state and activation should be allowed.
	return pending == 0, nil
}

// Activate flips a mod's active flag to 1. It refuses if any requested
// capability is still pending admin approval (AllGranted == false), so the
// admin can't accidentally run a mod that hasn't been reviewed.
func (r *ModRepository) Activate(modID int64) error {
	ok, err := r.AllGranted(modID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrPermissionsNotGranted
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(`UPDATE mods SET active = 1, updated_at = ? WHERE id = ?`, now, modID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrModNotFound
	}
	return nil
}

// Deactivate flips a mod's active flag back to 0 without touching the grant
// rows, so the admin can re-activate later without re-approving everything.
func (r *ModRepository) Deactivate(modID int64) error {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(`UPDATE mods SET active = 0, updated_at = ? WHERE id = ?`, now, modID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrModNotFound
	}
	return nil
}

// DeleteMod removes a mod and its requested-capability rows (cascade deletes
// the latter via the FK on mod_permissions.mod_id).
func (r *ModRepository) DeleteMod(id int64) error {
	res, err := r.db.Exec(`DELETE FROM mods WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrModNotFound
	}
	return nil
}

// ErrPermissionsNotGranted is returned by Activate when the admin hasn't yet
// approved every requested capability. The handler maps it to HTTP 409 so the
// frontend can render a clear "approve the N pending permissions first".
var ErrPermissionsNotGranted = fmt.Errorf("not all requested permissions have been granted")

// ParseManifest decodes a raw manifest blob into ManifestInput, validating
// that every capability string is one the panel knows and that no capability
// is requested twice. It is shared by the upload handler and the (optional)
// re-import path.
func ParseManifest(raw []byte) (ManifestInput, error) {
	var in ManifestInput
	if len(raw) == 0 {
		return in, fmt.Errorf("empty manifest")
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return in, fmt.Errorf("invalid manifest JSON: %w", err)
	}
	if in.Name == "" || in.Slug == "" {
		return in, fmt.Errorf("manifest must declare name and slug")
	}
	if !models.ValidModSlug(in.Slug) {
		return in, fmt.Errorf("invalid slug %q: use lowercase letters, digits and hyphens (max 64 chars)", in.Slug)
	}
	if err := validatePermissionRequests(in.PermissionsRequested); err != nil {
		return in, err
	}
	return in, nil
}
