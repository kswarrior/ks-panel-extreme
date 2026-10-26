package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/example/kspanel/internal/models"
	panelversion "github.com/example/kspanel/internal/version"
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
	err := r.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, ModsEngineSettingKey).Scan(&v)
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
	res, err := r.db.Exec(`UPDATE settings SET value = ? WHERE key = ?`, val, ModsEngineSettingKey)
	if err != nil {
		return err
	}
	if n, e := res.RowsAffected(); e == nil && n > 0 {
		return nil
	}
	_, err = r.db.Exec(`INSERT INTO settings (key, value) VALUES (?, ?)`, ModsEngineSettingKey, val)
	return err
}

const modColumns = "id, name, slug, version, description, manifest, spec, active, uploaded_by, COALESCE(owner_id, 0), engine_version, source, source_url, package_size, created_at, updated_at"

func scanMod(scanner interface{ Scan(...any) error }) (*models.Mod, error) {
	var m models.Mod
	var manifest, spec string
	var uploadedBy sql.NullInt64
	var ownerID sql.NullInt64
	var active, engineVersion int
	var created, updated string
	var source, sourceURL string
	var packageSize int64
	if err := scanner.Scan(&m.ID, &m.Name, &m.Slug, &m.Version, &m.Description, &manifest, &spec, &active, &uploadedBy, &ownerID, &engineVersion, &source, &sourceURL, &packageSize, &created, &updated); err != nil {
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
	if ownerID.Valid {
		m.OwnerID = ownerID.Int64
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
type PermissionReq = models.PermissionReqV2

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
	return models.ValidatePermissionRequests(perms)
}

// modManifestValidationOptions supplies the running panel's compatibility
// versions to the central manifest validator. RequireIdentity is false for
// CreateMod because the repository already validates the resolved Name/Slug
// fields; upload parsers set it true so the manifest itself must carry them.
func modManifestValidationOptions(requireIdentity bool) models.ManifestValidationOptions {
	return models.ManifestValidationOptions{
		PanelVersion:    panelversion.Version,
		EngineVersion:   models.CurrentEngineVersion,
		SDKVersion:      models.CurrentSDKVersion,
		RequireIdentity: requireIdentity,
	}
}

// modDeclaredPermCap bounds how many custom permissions one manifest may
// declare. The grant checklist renders them inline; an unbounded list would
// bloat the mod row and the approval modal.
const modDeclaredPermCap = 16

// validateDeclaredPermissions rejects malformed / excessive custom permission
// declarations before any rows are seeded. Keys arrive already normalised to
// "<slug>:<key>" by models.ParseV2Manifest; we re-check the shape so a
// manifest that skipped normalisation (blank slug edge cases) can't slip a
// bare or hostile code into the UNIQUE(mod_id, capability) index.
func validateDeclaredPermissions(declared []models.CustomPermission) error {
	return models.ValidateCustomPermissions(declared)
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

	// Central manifest validation. Every install path (file, URL, Studio,
	// JSON, sample and future registry installs) funnels through CreateMod, so
	// this is the one choke point for schema, capability, dependency,
	// compatibility and ownership-token validation. ParseManifest runs the same
	// validator earlier with RequireIdentity=true; CreateMod re-runs it with
	// the resolved Name/Slug fields so direct repository callers cannot bypass
	// it.
	validated, err := models.ValidateManifest([]byte(manifest), modManifestValidationOptions(false))
	if err != nil {
		return nil, err
	}
	engineVersion := validated.EngineVersion
	if engineVersion == 0 {
		engineVersion = 1
	}

	// Custom (manifest-declared) permissions ride the same grant table as the
	// fixed capabilities — namespaced under the mod slug by ParseV2Manifest —
	// so the admin approves them in the same checklist and a running mod reads
	// them via ks.permissions.has. Validate the resolved request list too:
	// handlers pass it separately from the raw manifest.
	declared := validated.PermissionsDeclared
	if err := validateDeclaredPermissions(declared); err != nil {
		return nil, err
	}
	if err := validatePermissionRequests(in.PermissionsRequested); err != nil {
		return nil, err
	}

	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var res sql.Result
	if in.UploadedBy != 0 {
		res, err = tx.Exec(
			`INSERT INTO mods (name, slug, version, description, manifest, spec, active, uploaded_by, owner_id, engine_version, source, source_url, package_size, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
			in.Name, in.Slug, in.Version, in.Description, manifest, spec, in.UploadedBy, in.UploadedBy, engineVersion, source, in.SourceURL, in.PackageSize, now, now,
		)
	} else {
		res, err = tx.Exec(
			`INSERT INTO mods (name, slug, version, description, manifest, spec, active, engine_version, source, source_url, package_size, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
			in.Name, in.Slug, in.Version, in.Description, manifest, spec, engineVersion, source, in.SourceURL, in.PackageSize, now, now,
		)
	}
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
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
	// Custom permission rows: capability = "<slug>:<key>" (already normalised
	// by ParseV2Manifest), access_level = "custom" so the grant UI can tell
	// them apart from host capabilities without a schema change. Seeded
	// granted = 0 like every other request — activation waits for approval.
	for _, p := range declared {
		if _, err := tx.Exec(
			`INSERT INTO mod_permissions (mod_id, capability, access_level, granted) VALUES (?, ?, 'custom', 0)`,
			id, p.Key,
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

// UpgradeModInput replaces a mod's manifest + package metadata. The slug is
// immutable; an upgrade may add/remove permissions, but newly requested
// capabilities are always seeded granted=0 (re-approval required) and removed
// capabilities lose their grant row. Upgrading an active mod is refused so the
// admin deactivates it explicitly before swapping code.
type UpgradeModInput struct {
	Name        string
	Version     string
	Description string
	Manifest    json.RawMessage
	Spec        json.RawMessage
	Source      string
	SourceURL   string
	PackageSize int64
}

// ErrModActive is returned by UpgradeMod when the target is currently active.
var ErrModActive = errors.New("deactivate the mod before upgrading it")

// UpgradeMod validates and atomically replaces a mod's manifest, spec and
// permission request set. The slug must match the existing row. Existing
// grants are preserved only when the capability + access level are unchanged;
// new/changed capabilities start pending so the admin explicitly re-approves
// the new power surface.
func (r *ModRepository) UpgradeMod(id int64, in UpgradeModInput) (*models.Mod, error) {
	existing, err := r.GetMod(id)
	if err != nil {
		return nil, err
	}
	if existing.Active {
		return nil, ErrModActive
	}
	manifest := in.Manifest
	if len(manifest) == 0 {
		manifest = existing.Manifest
	}
	validated, err := models.ValidateManifest(manifest, modManifestValidationOptions(false))
	if err != nil {
		return nil, err
	}
	if validated.Slug != "" && validated.Slug != existing.Slug {
		return nil, fmt.Errorf("manifest slug %q does not match installed slug %q", validated.Slug, existing.Slug)
	}
	name := in.Name
	if name == "" {
		name = validated.Name
	}
	if name == "" {
		name = existing.Name
	}
	version := in.Version
	if version == "" {
		version = validated.Version
	}
	if version == "" {
		version = existing.Version
	}
	description := in.Description
	if description == "" {
		description = validated.Description
	}
	spec := in.Spec
	if len(spec) == 0 {
		spec = validated.Spec
	}
	if len(spec) == 0 {
		spec = existing.Spec
	}
	if len(spec) == 0 {
		spec = json.RawMessage("{}")
	}
	source := in.Source
	if source == "" {
		source = existing.Source
	}
	if source == "" {
		source = models.ModSourceFile
	}
	sourceURL := in.SourceURL
	if sourceURL == "" {
		sourceURL = existing.SourceURL
	}

	requested := make(map[string]string, len(validated.PermissionsRequested)+len(validated.PermissionsDeclared))
	for _, p := range validated.PermissionsRequested {
		requested[p.Capability] = p.AccessLevel
	}
	for _, p := range validated.PermissionsDeclared {
		requested[p.Key] = "custom"
	}

	oldRows, err := r.ListModPermissions(id)
	if err != nil {
		return nil, err
	}
	oldByCap := make(map[string]models.ModPermission, len(oldRows))
	for _, p := range oldRows {
		oldByCap[p.Capability] = p
	}

	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := tx.Exec(
		`UPDATE mods SET name = ?, version = ?, description = ?, manifest = ?, spec = ?, engine_version = ?, source = ?, source_url = ?, package_size = ?, updated_at = ? WHERE id = ?`,
		name, version, description, string(manifest), string(spec), validated.EngineVersion, source, sourceURL, in.PackageSize, now, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrModNotFound
	}

	for capability, access := range requested {
		if old, ok := oldByCap[capability]; ok {
			if old.AccessLevel == access {
				continue // unchanged -> keep the existing grant decision
			}
			if _, err := tx.Exec(
				`UPDATE mod_permissions SET access_level = ?, granted = 0 WHERE mod_id = ? AND capability = ?`,
				access, id, capability,
			); err != nil {
				return nil, err
			}
			continue
		}
		if _, err := tx.Exec(
			`INSERT INTO mod_permissions (mod_id, capability, access_level, granted) VALUES (?, ?, ?, 0)`,
			id, capability, access,
		); err != nil {
			return nil, err
		}
	}
	for capability := range oldByCap {
		if _, keep := requested[capability]; keep {
			continue
		}
		if _, err := tx.Exec(`DELETE FROM mod_permissions WHERE mod_id = ? AND capability = ?`, id, capability); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetMod(id)
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
		SELECT m.id, m.name, m.slug, m.version, m.description, m.manifest, m.spec, m.active, m.uploaded_by, COALESCE(m.owner_id, 0), m.engine_version, m.source, m.source_url, m.package_size, m.created_at, m.updated_at, u.username
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
		var ownerID sql.NullInt64
		var active, engineVersion int
		var created, updated string
		var source, sourceURL string
		var packageSize int64
		var owner sql.NullString
		if err := rows.Scan(&m.ID, &m.Name, &m.Slug, &m.Version, &m.Description, &manifest, &spec, &active, &uploadedBy, &ownerID, &engineVersion, &source, &sourceURL, &packageSize, &created, &updated, &owner); err != nil {
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
		if ownerID.Valid {
			m.OwnerID = ownerID.Int64
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

// Activate flips a mod's active flag to 1 after enforcing the full activation
// contract: manifest compatibility, installed+active dependencies, provides/
// conflicts ownership, and the per-capability approval gate. Returning typed
// errors lets the handler render actionable 409 diagnostics instead of a
// generic server error.
func (r *ModRepository) Activate(modID int64) error {
	mod, err := r.GetMod(modID)
	if err != nil {
		return err
	}
	if _, err := models.ValidateManifest(mod.Manifest, modManifestValidationOptions(false)); err != nil {
		return err
	}
	all, err := r.ListMods()
	if err != nil {
		return err
	}
	installed := make([]*models.Mod, len(all))
	for i := range all {
		installed[i] = &all[i]
	}
	if issues := models.CheckDependencies(mod, installed, true); len(issues) > 0 {
		return &models.DependencyError{Slug: mod.Slug, Issues: issues}
	}
	if conflicts := models.CheckConflicts(mod, installed); len(conflicts) > 0 {
		return &models.ConflictError{Slug: mod.Slug, Conflicts: conflicts}
	}
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
// It refuses when an active mod still requires this one — deactivation never
// silently cascades and strands a running dependent.
func (r *ModRepository) Deactivate(modID int64) error {
	mod, err := r.GetMod(modID)
	if err != nil {
		return err
	}
	all, err := r.ListMods()
	if err != nil {
		return err
	}
	active := make([]*models.Mod, 0, len(all))
	for i := range all {
		if all[i].Active {
			active = append(active, &all[i])
		}
	}
	if dependents := models.ActiveDependents(mod, active); len(dependents) > 0 {
		return &models.DependentsError{Slug: mod.Slug, Dependents: dependents}
	}
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
	man, err := models.ValidateManifest(raw, modManifestValidationOptions(true))
	if err != nil {
		return in, err
	}
	in.Name = man.Name
	in.Slug = man.Slug
	in.Version = man.Version
	in.Description = man.Description
	in.Spec = man.Spec
	in.PermissionsRequested = man.PermissionsRequested
	return in, nil
}
