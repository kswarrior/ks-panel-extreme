package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
)

// StackRepository persists Stacks (admin-uploaded full-stack isolated apps)
// and the per-capability permission rows the admin must approve before a
// stack can be activated. Lifecycle mirrors mods: upload -> review requested
// caps -> grant each -> activate. Deactivate keeps grants for re-activation.
type StackRepository struct {
	db *sql.DB
}

func NewStackRepository(db *sql.DB) *StackRepository {
	return &StackRepository{db: db}
}

// ErrStackNotFound is the sentinel every "no such stack" path returns so
// handlers map it to 404 while real DB failures surface as 500.
var ErrStackNotFound = errors.New("stack not found")

// ErrStackPermissionsNotGranted is returned by Activate when grants are
// pending. The handler maps it to HTTP 409 with the checklist.
var ErrStackPermissionsNotGranted = errors.New("not all requested stack permissions have been granted")

// StacksEngineSettingKey is the settings-KV key backing the stacks kill
// switch ("1" = enabled, default; "0" = disabled). Reuses the settings
// table so no migration is required (mirrors ModsEngineSettingKey).
const StacksEngineSettingKey = "stacks_engine_enabled"

// StacksEnabled reports whether the stacks supervisor may run sidecars.
// Missing row defaults to enabled (same fail-open-for-reads contract as mods).
func (r *StackRepository) StacksEnabled() bool {
	var v string
	err := r.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, StacksEngineSettingKey).Scan(&v)
	if err != nil {
		return true
	}
	return v != "0"
}

// SetStacksEnabled persists the kill switch (UPDATE-then-INSERT works on all
// three engines since their upsert syntaxes differ).
func (r *StackRepository) SetStacksEnabled(enabled bool) error {
	val := "0"
	if enabled {
		val = "1"
	}
	res, err := r.db.Exec(`UPDATE settings SET value = ? WHERE key = ?`, val, StacksEngineSettingKey)
	if err != nil {
		return err
	}
	if n, e := res.RowsAffected(); e == nil && n > 0 {
		return nil
	}
	_, err = r.db.Exec(`INSERT INTO settings (key, value) VALUES (?, ?)`, StacksEngineSettingKey, val)
	return err
}

const stackColumns = "id, name, slug, category, version, description, icon, color, runtime, entrypoint, manifest, spec, frontend_theme_mode, page_style, active, uploaded_by, COALESCE(owner_id, 0), source, source_url, package_size, proxy_port, COALESCE(proxy_root_url, ''), created_at, updated_at"

func scanStack(scanner interface{ Scan(...any) error }) (*models.Stack, error) {
	var s models.Stack
	var manifest, spec string
	var uploadedBy sql.NullInt64
	var ownerID sql.NullInt64
	var active int
	var created, updated string
	var source, sourceURL string
	var packageSize int64
	var proxyRootURL sql.NullString
	if err := scanner.Scan(&s.ID, &s.Name, &s.Slug, &s.Category, &s.Version, &s.Description, &s.Icon, &s.Color, &s.Runtime, &s.Entrypoint, &manifest, &spec, &s.ThemeMode, &s.PageStyle, &active, &uploadedBy, &ownerID, &source, &sourceURL, &packageSize, &s.ProxyPort, &proxyRootURL, &created, &updated); err != nil {
		return nil, err
	}
	s.Manifest = json.RawMessage(manifest)
	if spec != "" {
		s.Spec = json.RawMessage(spec)
	}
	if s.ThemeMode == "" {
		s.ThemeMode = models.StackThemePanel
	}
	if s.PageStyle == "" {
		s.PageStyle = models.StackPageSPA
	}
	if s.Runtime == "" {
		s.Runtime = models.StackRuntimeStatic
	}
	s.Active = active != 0
	if source == "" {
		source = models.StackSourceFile
	}
	s.Source = source
	s.SourceURL = sourceURL
	s.PackageSize = packageSize
	// Proxy mount (migration 072): clamp defensively so a hand-edited row
	// can never route the panel at a bad port or path.
	if !models.ValidStackProxyPort(s.ProxyPort) {
		s.ProxyPort = 0
	}
	if proxyRootURL.Valid {
		s.ProxyRootURL = proxyRootURL.String
	}
	if !models.ValidStackProxyRoot(s.ProxyRootURL) || models.IsReservedStackProxyRoot(s.ProxyRootURL) {
		s.ProxyRootURL = ""
	}
	if uploadedBy.Valid {
		v := uploadedBy.Int64
		s.UploadedBy = &v
	}
	if ownerID.Valid {
		s.OwnerID = ownerID.Int64
	}
	s.CreatedAt, _ = parseSQLiteTime(created)
	s.UpdatedAt, _ = parseSQLiteTime(updated)
	return &s, nil
}

// StackPermissionReq is one capability request inside a stack manifest's
// `permissionsRequested[]`.
type StackPermissionReq struct {
	Capability  string `json:"capability"`
	AccessLevel string `json:"access_level"`
}

// StackManifestInput is the validated shape the upload handler extracts from
// the stack's JSON manifest. Only the enumerated fields are structurally
// known; everything else rides the raw manifest/spec pass-through.
type StackManifestInput struct {
	Name                 string              `json:"name"`
	Slug                 string              `json:"slug"`
	Category             string              `json:"category"`
	Version              string              `json:"version"`
	Description          string              `json:"description"`
	Icon                 string              `json:"icon"`
	Color                string              `json:"color"`
	Runtime              string              `json:"runtime"`
	Entrypoint           string              `json:"entrypoint"`
	ThemeMode            string              `json:"themeMode"`
	PageStyle            string              `json:"pageStyle"`
	Spec                 json.RawMessage     `json:"spec"`
	PermissionsRequested []StackPermissionReq `json:"permissionsRequested"`
}

// stackFrontendBlock mirrors manifest.frontend{page_style,theme{mode}} so a
// manifest may declare `frontend: {page_style, theme: {mode}}` alongside (or
// instead of) the flat pageStyle/themeMode keys. Flat keys win on conflict.
type stackFrontendBlock struct {
	PageStyle string `json:"page_style"`
	Theme     struct {
		Mode string `json:"mode"`
	} `json:"theme"`
}

// stackBackendBlock mirrors manifest.backend{runtime, entrypoint} so a
// manifest may declare the sidecar under `backend` alongside (or instead of)
// the flat runtime/entrypoint keys. Flat keys win on conflict.
type stackBackendBlock struct {
	Runtime    string `json:"runtime"`
	Entrypoint string `json:"entrypoint"`
}

// ParseStackManifest decodes a raw manifest blob into StackManifestInput,
// validating slug, runtime, theme mode, page style and capability codes.
// Shared by every install path (file/URL/studio/JSON/sample) so hostile
// manifests fail identically everywhere.
func ParseStackManifest(raw []byte) (StackManifestInput, error) {
	var in StackManifestInput
	if len(raw) == 0 || len(strings.TrimSpace(string(raw))) == 0 {
		return in, fmt.Errorf("empty manifest")
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return in, fmt.Errorf("invalid manifest JSON: %w", err)
	}
	// Nested backend/frontend blocks fill flat fields the manifest omitted.
	var aux struct {
		Backend  stackBackendBlock  `json:"backend"`
		Frontend stackFrontendBlock `json:"frontend"`
	}
	_ = json.Unmarshal(raw, &aux)
	if in.Runtime == "" {
		in.Runtime = aux.Backend.Runtime
	}
	if in.Entrypoint == "" {
		in.Entrypoint = aux.Backend.Entrypoint
	}
	if in.PageStyle == "" {
		in.PageStyle = aux.Frontend.PageStyle
	}
	if in.ThemeMode == "" {
		in.ThemeMode = aux.Frontend.Theme.Mode
	}
	if in.Name == "" || in.Slug == "" {
		return in, fmt.Errorf("manifest must declare name and slug")
	}
	if !models.ValidStackSlug(in.Slug) {
		return in, fmt.Errorf("invalid slug %q: use lowercase letters, digits and hyphens (max 64 chars)", in.Slug)
	}
	if in.Runtime == "" {
		in.Runtime = models.StackRuntimeStatic
	}
	if !models.ValidStackRuntime(in.Runtime) {
		return in, fmt.Errorf("unknown runtime %q (want static|nodejs|python)", in.Runtime)
	}
	if in.ThemeMode == "" {
		in.ThemeMode = models.StackThemePanel
	}
	if !models.ValidStackThemeMode(in.ThemeMode) {
		return in, fmt.Errorf("unknown theme mode %q (want panel|custom|none)", in.ThemeMode)
	}
	if in.PageStyle == "" {
		in.PageStyle = models.StackPageSPA
	}
	if !models.ValidStackPageStyle(in.PageStyle) {
		return in, fmt.Errorf("unknown page style %q (want spa|simple)", in.PageStyle)
	}
	if in.Category == "" {
		in.Category = "dashboard"
	}
	if in.Version == "" {
		in.Version = "1.0.0"
	}
	if err := validateStackPermissionRequests(in.PermissionsRequested); err != nil {
		return in, err
	}
	return in, nil
}

// validateStackPermissionRequests rejects unknown capability codes and
// duplicate requests (duplicates would trip the insert loop with an obscure
// SQL error, so fail early with an actionable message).
func validateStackPermissionRequests(perms []StackPermissionReq) error {
	allowed := map[string]struct{}{}
	for _, c := range models.AllowedStackCapabilities() {
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

// CreateStackInput is the fully-resolved payload CreateStack accepts.
type CreateStackInput struct {
	Name                 string
	Slug                 string
	Category             string
	Version              string
	Description          string
	Icon                 string
	Color                string
	Runtime              string
	Entrypoint           string
	ThemeMode            string
	PageStyle            string
	Manifest             json.RawMessage
	Spec                 json.RawMessage
	PermissionsRequested []StackPermissionReq
	UploadedBy           int64
	Source               string
	SourceURL            string
	PackageSize          int64
}

// CreateStack inserts a new stack with its requested-capability rows seeded
// granted = 0 (pending admin approval). Duplicate slug surfaces as a UNIQUE
// error the handler turns into 409.
func (r *StackRepository) CreateStack(in CreateStackInput) (*models.Stack, error) {
	if in.Name == "" || in.Slug == "" {
		return nil, fmt.Errorf("name and slug are required")
	}
	if !models.ValidStackSlug(in.Slug) {
		return nil, fmt.Errorf("invalid slug %q: use lowercase letters, digits and hyphens (max 64 chars)", in.Slug)
	}
	if in.Runtime == "" {
		in.Runtime = models.StackRuntimeStatic
	}
	if !models.ValidStackRuntime(in.Runtime) {
		return nil, fmt.Errorf("unknown runtime %q", in.Runtime)
	}
	if in.ThemeMode == "" {
		in.ThemeMode = models.StackThemePanel
	}
	if in.PageStyle == "" {
		in.PageStyle = models.StackPageSPA
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
		source = models.StackSourceFile
	}
	if in.Category == "" {
		in.Category = "dashboard"
	}
	if in.Version == "" {
		in.Version = "1.0.0"
	}
	if err := validateStackPermissionRequests(in.PermissionsRequested); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")

	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	cols := `INSERT INTO stacks (name, slug, category, version, description, icon, color, runtime, entrypoint, manifest, spec, frontend_theme_mode, page_style, active, uploaded_by, owner_id, source, source_url, package_size, created_at, updated_at)`
	var execRes sql.Result
	if in.UploadedBy != 0 {
		execRes, err = tx.Exec(
			cols+` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
			in.Name, in.Slug, in.Category, in.Version, in.Description, in.Icon, in.Color, in.Runtime, in.Entrypoint, manifest, spec, in.ThemeMode, in.PageStyle, in.UploadedBy, in.UploadedBy, source, in.SourceURL, in.PackageSize, now, now,
		)
	} else {
		execRes, err = tx.Exec(
			cols+` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?, ?, ?)`,
			in.Name, in.Slug, in.Category, in.Version, in.Description, in.Icon, in.Color, in.Runtime, in.Entrypoint, manifest, spec, in.ThemeMode, in.PageStyle, source, in.SourceURL, in.PackageSize, now, now,
		)
	}
	if err != nil {
		return nil, err
	}
	id, err := execRes.LastInsertId()
	if err != nil {
		return nil, err
	}
	for _, p := range in.PermissionsRequested {
		if _, err := tx.Exec(
			`INSERT INTO stack_permissions (stack_id, capability, access_level, granted) VALUES (?, ?, ?, 0)`,
			id, p.Capability, p.AccessLevel,
		); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetStack(id)
}

// UpdateStackInput is the editable overlay: human-facing fields + spec only.
// Requested caps are NOT mutable (re-declaring caps is a re-upload).
type UpdateStackInput struct {
	Name         string
	Category     string
	Version      string
	Description  string
	Icon         string
	Color        string
	Spec         json.RawMessage
	ProxyPort    int
	ProxyRootURL string
}

func (r *StackRepository) UpdateStack(id int64, in UpdateStackInput) (*models.Stack, error) {
	if id == 0 {
		return nil, fmt.Errorf("stack id is required")
	}
	if !models.ValidStackProxyPort(in.ProxyPort) {
		return nil, fmt.Errorf("invalid proxy port %d (want 0 or 1-65535)", in.ProxyPort)
	}
	if !models.ValidStackProxyRoot(in.ProxyRootURL) {
		return nil, fmt.Errorf("invalid proxy root URL %q (want empty or lowercase letters, digits and hyphens, max 32)", in.ProxyRootURL)
	}
	if models.IsReservedStackProxyRoot(in.ProxyRootURL) {
		return nil, fmt.Errorf("proxy root URL %q is reserved by the panel", in.ProxyRootURL)
	}
	if in.ProxyRootURL != "" && in.ProxyPort == 0 {
		return nil, fmt.Errorf("proxy root URL requires a proxy port (1-65535)")
	}
	if in.ProxyPort != 0 && in.ProxyRootURL == "" {
		return nil, fmt.Errorf("proxy port requires a proxy root URL")
	}
	taken, err := r.ProxyRootTaken(in.ProxyRootURL, id)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, fmt.Errorf("proxy root URL %q is already used by another stack", in.ProxyRootURL)
	}
	spec := string(in.Spec)
	if spec == "" {
		spec = "{}"
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(
		`UPDATE stacks SET name = ?, category = ?, version = ?, description = ?, icon = ?, color = ?, spec = ?, proxy_port = ?, proxy_root_url = ?, updated_at = ? WHERE id = ?`,
		in.Name, in.Category, in.Version, in.Description, in.Icon, in.Color, spec, in.ProxyPort, in.ProxyRootURL, now, id,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrStackNotFound
	}
	return r.GetStack(id)
}

// ProxyRootTaken reports whether a non-empty proxy root URL is already
// claimed by another stack (excludeID skips the row being edited; 0 skips
// nothing). Empty roots are never "taken" — every unconfigured stack
// shares "".
func (r *StackRepository) ProxyRootTaken(root string, excludeID int64) (bool, error) {
	if root == "" {
		return false, nil
	}
	var n int
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM stacks WHERE proxy_root_url = ? AND id != ?`, root, excludeID,
	).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

// GetActiveStackByProxyRoot returns the active, proxy-configured stack
// mounted at root ("" never matches), or ErrStackNotFound. The panel's
// reverse proxy resolves mounts through this single query.
func (r *StackRepository) GetActiveStackByProxyRoot(root string) (*models.Stack, error) {
	if root == "" {
		return nil, ErrStackNotFound
	}
	row := r.db.QueryRow(`SELECT `+stackColumns+` FROM stacks WHERE proxy_root_url = ? AND active = 1 AND proxy_port > 0`, root)
	s, err := scanStack(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrStackNotFound
		}
		return nil, err
	}
	return s, nil
}

// ListStacks returns every stack with the uploader's username.
func (r *StackRepository) ListStacks() ([]models.Stack, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM stacks`).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.Stack, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`
		SELECT s.id, s.name, s.slug, s.category, s.version, s.description, s.icon, s.color, s.runtime, s.entrypoint, s.manifest, s.spec, s.frontend_theme_mode, s.page_style, s.active, s.uploaded_by, COALESCE(s.owner_id, 0), s.source, s.source_url, s.package_size, s.proxy_port, COALESCE(s.proxy_root_url, ''), s.created_at, s.updated_at, u.username
		FROM stacks s
		LEFT JOIN users u ON u.id = s.uploaded_by
		ORDER BY s.updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s models.Stack
		var manifest, spec string
		var uploadedBy sql.NullInt64
		var ownerID sql.NullInt64
		var active int
		var created, updated string
		var source, sourceURL string
		var packageSize int64
		var proxyRootURL sql.NullString
		var owner sql.NullString
		if err := rows.Scan(&s.ID, &s.Name, &s.Slug, &s.Category, &s.Version, &s.Description, &s.Icon, &s.Color, &s.Runtime, &s.Entrypoint, &manifest, &spec, &s.ThemeMode, &s.PageStyle, &active, &uploadedBy, &ownerID, &source, &sourceURL, &packageSize, &s.ProxyPort, &proxyRootURL, &created, &updated, &owner); err != nil {
			return nil, err
		}
		s.Manifest = json.RawMessage(manifest)
		if spec != "" {
			s.Spec = json.RawMessage(spec)
		}
		if s.ThemeMode == "" {
			s.ThemeMode = models.StackThemePanel
		}
		if s.PageStyle == "" {
			s.PageStyle = models.StackPageSPA
		}
		s.Active = active != 0
		if source == "" {
			source = models.StackSourceFile
		}
		s.Source = source
		s.SourceURL = sourceURL
		s.PackageSize = packageSize
		if !models.ValidStackProxyPort(s.ProxyPort) {
			s.ProxyPort = 0
		}
		if proxyRootURL.Valid {
			s.ProxyRootURL = proxyRootURL.String
		}
		if !models.ValidStackProxyRoot(s.ProxyRootURL) || models.IsReservedStackProxyRoot(s.ProxyRootURL) {
			s.ProxyRootURL = ""
		}
		if uploadedBy.Valid {
			v := uploadedBy.Int64
			s.UploadedBy = &v
		}
		if ownerID.Valid {
			s.OwnerID = ownerID.Int64
		}
		s.CreatedAt, _ = parseSQLiteTime(created)
		s.UpdatedAt, _ = parseSQLiteTime(updated)
		s.OwnerName = owner.String
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetStack returns a single stack by id, or ErrStackNotFound.
func (r *StackRepository) GetStack(id int64) (*models.Stack, error) {
	row := r.db.QueryRow(`SELECT `+stackColumns+` FROM stacks WHERE id = ?`, id)
	s, err := scanStack(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrStackNotFound
		}
		return nil, err
	}
	if s.UploadedBy != nil {
		var nm sql.NullString
		_ = r.db.QueryRow(`SELECT username FROM users WHERE id = ?`, *s.UploadedBy).Scan(&nm)
		s.OwnerName = nm.String
	}
	return s, nil
}

// GetStackBySlug returns a single stack by slug, or ErrStackNotFound. Used
// by the ui/api proxy + nav endpoints which address stacks by slug.
func (r *StackRepository) GetStackBySlug(slug string) (*models.Stack, error) {
	row := r.db.QueryRow(`SELECT `+stackColumns+` FROM stacks WHERE slug = ?`, slug)
	s, err := scanStack(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrStackNotFound
		}
		return nil, err
	}
	return s, nil
}

// ListStackPermissions returns the requested-capability rows in manifest order.
func (r *StackRepository) ListStackPermissions(stackID int64) ([]models.StackPermission, error) {
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM stack_permissions WHERE stack_id = ?`, stackID).Scan(&n); err != nil {
		return nil, err
	}
	out := make([]models.StackPermission, 0, n)
	if n == 0 {
		return out, nil
	}
	rows, err := r.db.Query(`SELECT id, stack_id, capability, access_level, granted FROM stack_permissions WHERE stack_id = ? ORDER BY id ASC`, stackID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p models.StackPermission
		var granted int
		if err := rows.Scan(&p.ID, &p.StackID, &p.Capability, &p.AccessLevel, &granted); err != nil {
			return nil, err
		}
		p.Granted = granted != 0
		out = append(out, p)
	}
	return out, rows.Err()
}

// StackGrantDecision is one (capability -> approved) decision.
type StackGrantDecision struct {
	Capability string
	Granted    bool
}

// SetGrants upserts granted flags for listed capabilities. Unknown
// capabilities (never requested) are skipped so "approve all" keeps working
// on a superset.
func (r *StackRepository) SetGrants(stackID int64, decisions []StackGrantDecision) error {
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
			`UPDATE stack_permissions SET granted = ? WHERE stack_id = ? AND capability = ?`,
			flag, stackID, d.Capability,
		)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			continue
		}
	}
	return tx.Commit()
}

// ResetStackGrants flips every requested capability back to pending
// (granted = 0) so a reinstall starts a fresh approval cycle. Zero rows is
// a no-op, never an error.
func (r *StackRepository) ResetStackGrants(stackID int64) error {
	if _, err := r.db.Exec(`UPDATE stack_permissions SET granted = 0 WHERE stack_id = ?`, stackID); err != nil {
		return err
	}
	return nil
}

// AllGranted reports whether every requested capability is approved. Zero
// requested caps is trivially granted.
func (r *StackRepository) AllGranted(stackID int64) (bool, error) {
	var pending int
	if err := r.db.QueryRow(
		`SELECT COUNT(*) FROM stack_permissions WHERE stack_id = ? AND granted = 0`,
		stackID,
	).Scan(&pending); err != nil {
		return false, err
	}
	return pending == 0, nil
}

// Activate flips active = 1, refusing while grants are pending.
func (r *StackRepository) Activate(stackID int64) error {
	ok, err := r.AllGranted(stackID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrStackPermissionsNotGranted
	}
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(`UPDATE stacks SET active = 1, updated_at = ? WHERE id = ?`, now, stackID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrStackNotFound
	}
	return nil
}

// Deactivate flips active = 0, keeping grant rows for re-activation.
func (r *StackRepository) Deactivate(stackID int64) error {
	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	res, err := r.db.Exec(`UPDATE stacks SET active = 0, updated_at = ? WHERE id = ?`, now, stackID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrStackNotFound
	}
	return nil
}

// DeleteStack removes a stack; permission/env rows cascade via FK.
// Ports, KV and shared-table registry rows are keyed by slug and removed
// here explicitly (no FK); stack-data files are removed by the handler.
func (r *StackRepository) DeleteStack(id int64) error {
	s, err := r.GetStack(id)
	if err != nil {
		return err
	}
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM stack_ports WHERE stack_slug = ?`, s.Slug); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM stack_kv WHERE stack_slug = ?`, s.Slug); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM stack_tables WHERE stack_slug = ?`, s.Slug); err != nil {
		return err
	}
	res, err := tx.Exec(`DELETE FROM stacks WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrStackNotFound
	}
	return tx.Commit()
}
