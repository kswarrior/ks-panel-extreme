package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/config"
)

// SettingsRepository persists simple key/value runtime settings.
type SettingsRepository struct {
	db *sql.DB
}

func NewSettingsRepository(db *sql.DB) *SettingsRepository {
	return &SettingsRepository{db: db}
}

// DefaultPanelName is the fallback used if the database has no setting row.
// Kept here (not in the SQL seed) so wiring/UI code can reference it without
// duplicating the string in many places.
const DefaultPanelName = "KS Panel"

// PanelNameKey is the settings-table key that stores the user's panel brand.
const PanelNameKey = "panel_name"

// New key/value settings the auth + registration flow needs. Stored as
// separate rows in the settings table (logo_mime/logo_filename remain
// columns on the panel_name row, those are special-cased by the Logo path).
const (
	RegisterAllowKey      = "register_allow"
	RegisterRoleKey       = "register_role"
	DeviceAccountLimitKey = "device_account_limit"
	VerifyRequiredKey     = "verify_required"
	SMTPHostKey           = "smtp_host"
	SMTPPortKey           = "smtp_port"
	SMTPUserKey           = "smtp_user"
	SMTPPasswordKey       = "smtp_password"
	SMTPFromKey           = "smtp_from"
	PanelPortKey          = "panel_port"
)

// Panel brand-style keys (Settings > General > Panel Name styling).
// All stored as plain strings in the settings KV table so no schema
// migration is needed — a fresh install simply falls back to the defaults
// below via getString.
const (
	PanelNameColorKey       = "panel_name_color"        // hex, e.g. "#ffffff"
	PanelNameFontKey        = "panel_name_font"         // inter|system|poppins|montserrat|roboto|outfit|space|playfair|mono
	PanelNameWeightKey      = "panel_name_weight"       // 400|500|600|700|800|900
	PanelNameSizeKey        = "panel_name_size"         // sm|md|lg|xl
	PanelNameEffectKey      = "panel_name_effect"       // none|shadow|outline|3d|neon|gradient
	PanelNameShadowKey      = "panel_name_shadow"       // none|sm|md|lg|glow
	PanelNameGradientFromKey = "panel_name_gradient_from" // hex
	PanelNameGradientToKey   = "panel_name_gradient_to"   // hex
	PanelNameGradientDirKey  = "panel_name_gradient_dir"  // 90deg|135deg|180deg
	PanelNameItalicKey      = "panel_name_italic"       // "1"/"0"
	PanelNameUppercaseKey   = "panel_name_uppercase"    // "1"/"0"
	PanelNameSpacingKey     = "panel_name_spacing"      // tight|normal|wide
)

// Panel logo-display keys (Settings > General > Panel Logo presentation).
// These only change HOW the stored logo bytes are rendered (size/shape/fit
// /background/shadow) — the bytes themselves still live under logos/.
const (
	PanelLogoSizeKey   = "panel_logo_size"   // sm|md|lg|xl (scale multiplier)
	PanelLogoShapeKey  = "panel_logo_shape"  // rounded|large|circle|square
	PanelLogoFitKey    = "panel_logo_fit"    // contain|cover|fill
	PanelLogoBgKey     = "panel_logo_bg"     // dark|transparent|light
	PanelLogoShadowKey = "panel_logo_shadow" // none|sm|md|lg|glow
	PanelLogoRingKey   = "panel_logo_ring"   // "1"/"0" (border ring on/off)
)

// Defaults for the brand-style + logo-display keys. Kept next to the keys
// so the snapshot reader and the validators share one source of truth.
const (
	DefaultPanelNameColor       = "#ffffff"
	DefaultPanelNameFont        = "inter"
	DefaultPanelNameWeight      = "800"
	DefaultPanelNameSize        = "lg"
	DefaultPanelNameEffect      = "shadow"
	DefaultPanelNameShadow      = "sm"
	DefaultPanelNameGradientFrom = "#ffffff"
	DefaultPanelNameGradientTo   = "#a5b4fc"
	DefaultPanelNameGradientDir  = "90deg"
	DefaultPanelNameItalic      = "0"
	DefaultPanelNameUppercase   = "0"
	DefaultPanelNameSpacing     = "normal"

	DefaultPanelLogoSize   = "md"
	DefaultPanelLogoShape  = "large"
	DefaultPanelLogoFit    = "contain"
	DefaultPanelLogoBg     = "dark"
	DefaultPanelLogoShadow = "md"
	DefaultPanelLogoRing   = "1"
)

// logoDirName is the subdirectory under the data directory that stores
// uploaded panel logos. Kept private so callers always go through
// SetPanelLogo / ClearPanelLogo.
const logoDirName = "logos"

// LogoFilenamePrefix is the on-disk filename prefix. The full filename is
// "panel-<random>.ext", generated per upload so concurrent uploads don't
// collide and so the browser cache busts when the admin replaces the image.
const LogoFilenamePrefix = "panel-"

// GetPanelName returns the configured panel name, falling back to the default.
func (r *SettingsRepository) GetPanelName() (string, error) {
	var v string
	err := r.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, PanelNameKey).Scan(&v)
	if err == sql.ErrNoRows {
		return DefaultPanelName, nil
	}
	if err != nil {
		return "", fmt.Errorf("read panel name: %w", err)
	}
	if v == "" {
		return DefaultPanelName, nil
	}
	return v, nil
}

// SetPanelName updates the panel name. Empty values are ignored so the
// default never gets wiped.
func (r *SettingsRepository) SetPanelName(name string) error {
	if name == "" {
		return fmt.Errorf("panel name cannot be empty")
	}
	_, err := r.db.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		PanelNameKey, name,
	)
	return err
}

// PanelLogo describes the configured panel logo, if any. Both fields are
// empty when no logo has been uploaded. The HTTP layer turns these into a
// 200 with a sensible Content-Type, or a 404 when neither field is set.
type PanelLogo struct {
	Mime     string // e.g. "image/png"
	Filename string // basename on disk, served back to the browser for cache busting
}

// GetPanelLogo returns the configured logo's metadata. The "ok" flag is
// false when no logo is configured – callers can short-circuit to 404 in
// that case without touching the disk.
func (r *SettingsRepository) GetPanelLogo() (PanelLogo, bool, error) {
	var mime, filename sql.NullString
	err := r.db.QueryRow(`SELECT logo_mime, logo_filename FROM settings WHERE key = ?`, PanelNameKey).
		Scan(&mime, &filename)
	if err == sql.ErrNoRows {
		return PanelLogo{}, false, nil
	}
	if err != nil {
		return PanelLogo{}, false, fmt.Errorf("read panel logo: %w", err)
	}
	if !mime.Valid || !filename.Valid || mime.String == "" || filename.String == "" {
		return PanelLogo{}, false, nil
	}
	return PanelLogo{Mime: mime.String, Filename: filename.String}, true, nil
}

// SetPanelLogo stores a new logo file on disk and records its metadata in
// the settings row. The data is the raw encoded file (e.g. PNG bytes).
// Returns the final PanelLogo (mime + filename) written to disk so the
// caller can include it in the API response without a round trip to Get().
//
// The previous logo file (if any) is removed AFTER the DB write succeeds,
// so an interrupted write doesn't leave the panel in a state that points at
// a missing file.
func (r *SettingsRepository) SetPanelLogo(data []byte, mime string) (PanelLogo, error) {
	if len(data) == 0 {
		return PanelLogo{}, fmt.Errorf("logo file is empty")
	}
	if mime == "" {
		return PanelLogo{}, fmt.Errorf("logo mime type is required")
	}
	if err := os.MkdirAll(filepath.Join(config.DataDir(), logoDirName), 0o755); err != nil {
		return PanelLogo{}, fmt.Errorf("create logo dir: %w", err)
	}
	ext := extensionForMime(mime)
	if ext == "" {
		return PanelLogo{}, fmt.Errorf("unsupported logo mime type %q", mime)
	}
	filename := LogoFilenamePrefix + randHex(8) + ext
	dst := filepath.Join(config.DataDir(), logoDirName, filename)
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		return PanelLogo{}, fmt.Errorf("write logo file: %w", err)
	}

	// Snapshot the previously stored logo BEFORE we overwrite the columns,
	// so we can garbage-collect the old file at the end (otherwise we'd
	// see the new filename and short-circuit the cleanup).
	prev, _, _ := r.GetPanelLogo()

	// Persist the new reference. If we hit an error, roll back the just-written
	// file so the on-disk state and DB stay in lock-step.
	res, err := r.db.Exec(
		`UPDATE settings SET logo_mime = ?, logo_filename = ? WHERE key = ?`,
		mime, filename, PanelNameKey,
	)
	if err != nil {
		_ = os.Remove(dst)
		return PanelLogo{}, fmt.Errorf("persist logo meta: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		// The settings row doesn't exist yet (very fresh DB) – create the
		// panel_name row on the fly so the logo metadata has a home.
		if _, err := r.db.Exec(
			`INSERT INTO settings (key, value, logo_mime, logo_filename) VALUES (?, ?, ?, ?)`,
			PanelNameKey, DefaultPanelName, mime, filename,
		); err != nil {
			_ = os.Remove(dst)
			return PanelLogo{}, fmt.Errorf("insert settings row: %w", err)
		}
	}
	// Best-effort cleanup of the previous file (if there was one and it's
	// different from what we just wrote). Errors are intentionally
	// swallowed: the worst case is a small orphan file in the logos dir.
	if prev.Filename != "" && prev.Filename != filename {
		_ = os.Remove(filepath.Join(config.DataDir(), logoDirName, prev.Filename))
	}
	return PanelLogo{Mime: mime, Filename: filename}, nil
}

// ClearPanelLogo removes the on-disk logo file and clears the metadata
// columns on the settings row. No-op when no logo is set.
func (r *SettingsRepository) ClearPanelLogo() error {
	prev, ok, err := r.GetPanelLogo()
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	if _, err := r.db.Exec(
		`UPDATE settings SET logo_mime = NULL, logo_filename = NULL WHERE key = ?`,
		PanelNameKey,
	); err != nil {
		return fmt.Errorf("clear logo meta: %w", err)
	}
	_ = os.Remove(filepath.Join(config.DataDir(), logoDirName, prev.Filename))
	return nil
}

// LogoDiskPath returns the absolute path to the configured logo file on
// disk. Callers should only invoke this when GetPanelLogo returned ok=true.
func (r *SettingsRepository) LogoDiskPath(logo PanelLogo) string {
	return filepath.Join(config.DataDir(), logoDirName, logo.Filename)
}

// SettingsSnapshot holds the current settings for the GET endpoint and the
// bootstrap endpoint used by the SPA at startup.
type SettingsSnapshot struct {
	PanelName string `json:"panel_name"`
	PanelLogo *Logo  `json:"panel_logo,omitempty"`

	// Panel-name brand styling (Settings > General). Plain strings so they
	// round-trip through the KV store with no migration.
	PanelNameColor       string `json:"panel_name_color"`
	PanelNameFont        string `json:"panel_name_font"`
	PanelNameWeight      string `json:"panel_name_weight"`
	PanelNameSize        string `json:"panel_name_size"`
	PanelNameEffect      string `json:"panel_name_effect"`
	PanelNameShadow      string `json:"panel_name_shadow"`
	PanelNameGradientFrom string `json:"panel_name_gradient_from"`
	PanelNameGradientTo   string `json:"panel_name_gradient_to"`
	PanelNameGradientDir  string `json:"panel_name_gradient_dir"`
	PanelNameItalic      string `json:"panel_name_italic"`
	PanelNameUppercase   string `json:"panel_name_uppercase"`
	PanelNameSpacing     string `json:"panel_name_spacing"`

	// Panel-logo presentation (how the stored bytes are rendered).
	PanelLogoSize   string `json:"panel_logo_size"`
	PanelLogoShape  string `json:"panel_logo_shape"`
	PanelLogoFit    string `json:"panel_logo_fit"`
	PanelLogoBg     string `json:"panel_logo_bg"`
	PanelLogoShadow string `json:"panel_logo_shadow"`
	PanelLogoRing   string `json:"panel_logo_ring"`

	// Auth – registration gate + email-verification toggle. "1"/"0" string
	// booleans match the storage shape used by other key/value settings so
	// the UI doesn't have to coerce between Go bools and the wire format.
	RegisterAllow  string `json:"register_allow"`
	VerifyRequired string `json:"verify_required"`

	// Auth – self-registration policy. RegisterRole is the role name (not
	// id) assigned to freshly self-registered accounts. DeviceAccountLimit
	// caps how many self-registered accounts a single device may spawn;
	// "0" means unlimited.
	RegisterRole       string `json:"register_role"`
	DeviceAccountLimit string `json:"device_account_limit"`

	// Auth – SMTP server the panel uses to send the verification email.
	// All five fields are strings so they round-trip through the existing
	// key/value store without schema migrations on the settings table.
	SMTPHost     string `json:"smtp_host"`
	SMTPPort     string `json:"smtp_port"`
	SMTPUser     string `json:"smtp_user"`
	SMTPPassword string `json:"smtp_password"`
	SMTPFrom     string `json:"smtp_from"`
	// SMTPTLS is auto|implicit|starttls|off (065 seed "auto").
	SMTPTLS string `json:"smtp_tls"`
}

// Logo is the public, JSON-friendly view of the configured panel logo. The
// only field the SPA needs is URL + mime so <img> elements can render it
// without further round trips.
type Logo struct {
	URL      string `json:"url"`
	Mime     string `json:"mime"`
	Filename string `json:"filename"`
}

// logoURLBuilder is the function used to build the public URL pointing at
// the panel logo. The HTTP layer injects it once at startup so the
// repository stays transport-agnostic. Kept lowercase so callers have to go
// through SetLogoURLBuilder; this avoids accidental writes from tests.
var logoURLBuilder func(PanelLogo) string

// SetLogoURLBuilder installs the URL builder used by Get() when building
// the SettingsSnapshot. Call this once at server startup.
func SetLogoURLBuilder(b func(PanelLogo) string) {
	logoURLBuilder = b
}

// LogoURL returns the public URL that streams the logo bytes. Public so
// callers (notably the brand-injection helper in server.go) can render the
// same payload the JSON API exposes, without taking a DB dependency.
// The filename is appended as a cache-busting query (?v=...) so replacing
// the logo instantly invalidates the browser's 300s cache — previously the
// URL was static and admins kept seeing the OLD (often blurrier) bytes.
func LogoURL(logo PanelLogo) string {
	if logo.Filename != "" {
		return "/api/settings/panel-logo?v=" + logo.Filename
	}
	return "/api/settings/panel-logo"
}

// Get reads the full settings snapshot (panel_name + panel_logo + auth
// gating toggles + SMTP server block).
func (r *SettingsRepository) Get() (*SettingsSnapshot, error) {
	name, err := r.GetPanelName()
	if err != nil {
		return nil, err
	}
	snap := &SettingsSnapshot{PanelName: name}
	logo, ok, err := r.GetPanelLogo()
	if err != nil {
		return nil, err
	}
	if ok {
		url := ""
		if logoURLBuilder != nil {
			url = logoURLBuilder(logo)
		} else {
			url = LogoURL(logo)
		}
		snap.PanelLogo = &Logo{
			URL:      url,
			Mime:     logo.Mime,
			Filename: logo.Filename,
		}
	}
	snap.RegisterAllow = r.getString(RegisterAllowKey, "0")
	snap.VerifyRequired = r.getString(VerifyRequiredKey, "0")
	snap.RegisterRole = r.getString(RegisterRoleKey, "user")
	snap.DeviceAccountLimit = r.getString(DeviceAccountLimitKey, "0")
	snap.SMTPHost = r.getString(SMTPHostKey, "")
	snap.SMTPPort = r.getString(SMTPPortKey, "")
	snap.SMTPUser = r.getString(SMTPUserKey, "")
	snap.SMTPPassword = r.getString(SMTPPasswordKey, "")
	snap.SMTPFrom = r.getString(SMTPFromKey, "")
	snap.SMTPTLS = r.getString(SMTPTLSKey, "auto")
	// Panel-name brand styling + logo presentation. Every read falls back
	// to the compiled default so old installs (rows absent) render the
	// same as a fresh one, and the values are sanitized so a hostile/
	// corrupt row can never break the SPA's CSS.
	snap.PanelNameColor = normalizeBrandHex(r.getString(PanelNameColorKey, DefaultPanelNameColor), DefaultPanelNameColor)
	snap.PanelNameFont = normalizeBrandEnum(r.getString(PanelNameFontKey, DefaultPanelNameFont), panelNameFonts, DefaultPanelNameFont)
	snap.PanelNameWeight = normalizeBrandEnum(r.getString(PanelNameWeightKey, DefaultPanelNameWeight), panelNameWeights, DefaultPanelNameWeight)
	snap.PanelNameSize = normalizeBrandEnum(r.getString(PanelNameSizeKey, DefaultPanelNameSize), brandSizes, DefaultPanelNameSize)
	snap.PanelNameEffect = normalizeBrandEnum(r.getString(PanelNameEffectKey, DefaultPanelNameEffect), panelNameEffects, DefaultPanelNameEffect)
	snap.PanelNameShadow = normalizeBrandEnum(r.getString(PanelNameShadowKey, DefaultPanelNameShadow), brandShadows, DefaultPanelNameShadow)
	snap.PanelNameGradientFrom = normalizeBrandHex(r.getString(PanelNameGradientFromKey, DefaultPanelNameGradientFrom), DefaultPanelNameGradientFrom)
	snap.PanelNameGradientTo = normalizeBrandHex(r.getString(PanelNameGradientToKey, DefaultPanelNameGradientTo), DefaultPanelNameGradientTo)
	snap.PanelNameGradientDir = normalizeBrandEnum(r.getString(PanelNameGradientDirKey, DefaultPanelNameGradientDir), gradientDirs, DefaultPanelNameGradientDir)
	snap.PanelNameItalic = normalizeToggle(r.getString(PanelNameItalicKey, DefaultPanelNameItalic))
	snap.PanelNameUppercase = normalizeToggle(r.getString(PanelNameUppercaseKey, DefaultPanelNameUppercase))
	snap.PanelNameSpacing = normalizeBrandEnum(r.getString(PanelNameSpacingKey, DefaultPanelNameSpacing), brandSpacings, DefaultPanelNameSpacing)
	snap.PanelLogoSize = normalizeBrandEnum(r.getString(PanelLogoSizeKey, DefaultPanelLogoSize), brandSizes, DefaultPanelLogoSize)
	snap.PanelLogoShape = normalizeBrandEnum(r.getString(PanelLogoShapeKey, DefaultPanelLogoShape), logoShapes, DefaultPanelLogoShape)
	snap.PanelLogoFit = normalizeBrandEnum(r.getString(PanelLogoFitKey, DefaultPanelLogoFit), logoFits, DefaultPanelLogoFit)
	snap.PanelLogoBg = normalizeBrandEnum(r.getString(PanelLogoBgKey, DefaultPanelLogoBg), logoBgs, DefaultPanelLogoBg)
	snap.PanelLogoShadow = normalizeBrandEnum(r.getString(PanelLogoShadowKey, DefaultPanelLogoShadow), brandShadows, DefaultPanelLogoShadow)
	snap.PanelLogoRing = normalizeToggle(r.getString(PanelLogoRingKey, DefaultPanelLogoRing))
	return snap, nil
}

// getString reads a single key from the settings table. Returns the stored
// value or `fallback` when the row is missing; never errors so a brand-new
// install that hasn't seeded the row defaults sensibly rather than 500ing
// the GET.
func (r *SettingsRepository) getString(key, fallback string) string {
	var v string
	err := r.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows || err != nil {
		return fallback
	}
	return v
}

// setString upserts a single key/value pair in the settings table.
func (r *SettingsRepository) setString(key, value string) error {
	_, err := r.db.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	return err
}

// Update applies the supplied settings to the database. Empty fields are
// skipped rather than wiped, so the SPA can't accidentally blank out values
// it doesn't care about.
func (r *SettingsRepository) Update(s *SettingsSnapshot) error {
	if s == nil {
		return fmt.Errorf("nothing to update")
	}
	if s.PanelName != "" {
		if err := r.SetPanelName(s.PanelName); err != nil {
			return err
		}
	}
	// Auth toggles + SMTP server block. These use the generic key/value
	// store, so the caller's snapshot values (strings) flow straight through.
	// Note: an empty passwfield clears the key only when SMTPPassword is
	// passed as a sentinel "" — we still store "" since admins sometimes set
	// unauthenticated relays with an empty password. Use distinct keys above.
	if s.RegisterAllow != "" {
		if err := r.setString(RegisterAllowKey, normalizeToggle(s.RegisterAllow)); err != nil {
			return err
		}
	}
	if s.VerifyRequired != "" {
		if err := r.setString(VerifyRequiredKey, normalizeToggle(s.VerifyRequired)); err != nil {
			return err
		}
	}
	// RegisterRole can legitimately be set to "" (admin cleared the picker),
	// so we persist it whenever the caller supplied a non-nil value — which
	// the HTTP layer expresses as a non-empty snapshot field. The repo
	// always re-default to "user" on read when the stored value is empty.
	if s.RegisterRole != "" {
		if err := r.setString(RegisterRoleKey, s.RegisterRole); err != nil {
			return err
		}
	}
	// DeviceAccountLimit: persist whenever supplied. normalizeToggle isn't
	// used because this is a number, not a boolean; the handler validates it
	// as a non-negative integer. "0" = unlimited.
	if s.DeviceAccountLimit != "" {
		if err := r.setString(DeviceAccountLimitKey, s.DeviceAccountLimit); err != nil {
			return err
		}
	}
	if s.SMTPHost != "" {
		if err := r.setString(SMTPHostKey, s.SMTPHost); err != nil {
			return err
		}
	}
	if s.SMTPPort != "" {
		if err := r.setString(SMTPPortKey, s.SMTPPort); err != nil {
			return err
		}
	}
	if s.SMTPUser != "" {
		if err := r.setString(SMTPUserKey, s.SMTPUser); err != nil {
			return err
		}
	}
	// SMTPPassword is the one field the SPA may intentionally set to "" to
	// clear it, so persist it whenever the snapshot carries a non-nil value.
	// Because the snapshot is a plain struct we use a sentinel: an "*" means
	// "leave unchanged" (no-op), anything else is stored as-is.
	if s.SMTPPassword != "" && s.SMTPPassword != "*" {
		if err := r.setString(SMTPPasswordKey, s.SMTPPassword); err != nil {
			return err
		}
	}
	if s.SMTPFrom != "" {
		if err := r.setString(SMTPFromKey, s.SMTPFrom); err != nil {
			return err
		}
	}
	if s.SMTPTLS != "" {
		switch strings.ToLower(strings.TrimSpace(s.SMTPTLS)) {
		case "auto", "implicit", "starttls", "off":
			if err := r.setString(SMTPTLSKey, strings.ToLower(strings.TrimSpace(s.SMTPTLS))); err != nil {
				return err
			}
		default:
			return fmt.Errorf("invalid smtp_tls (want auto|implicit|starttls|off)")
		}
	}
	// Panel-name brand styling + logo presentation. Empty means "not sent"
	// (skip); every non-empty value is validated so a bad enum/hex 400s
	// with a clear message instead of poisoning the brand render.
	if s.PanelNameColor != "" {
		v, err := validatedBrandHex(s.PanelNameColor)
		if err != nil {
			return fmt.Errorf("invalid panel_name_color: %w", err)
		}
		if err := r.setString(PanelNameColorKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameFont != "" {
		v, err := validatedBrandEnum(s.PanelNameFont, panelNameFonts)
		if err != nil {
			return fmt.Errorf("invalid panel_name_font: %w", err)
		}
		if err := r.setString(PanelNameFontKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameWeight != "" {
		v, err := validatedBrandEnum(s.PanelNameWeight, panelNameWeights)
		if err != nil {
			return fmt.Errorf("invalid panel_name_weight: %w", err)
		}
		if err := r.setString(PanelNameWeightKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameSize != "" {
		v, err := validatedBrandEnum(s.PanelNameSize, brandSizes)
		if err != nil {
			return fmt.Errorf("invalid panel_name_size: %w", err)
		}
		if err := r.setString(PanelNameSizeKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameEffect != "" {
		v, err := validatedBrandEnum(s.PanelNameEffect, panelNameEffects)
		if err != nil {
			return fmt.Errorf("invalid panel_name_effect: %w", err)
		}
		if err := r.setString(PanelNameEffectKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameShadow != "" {
		v, err := validatedBrandEnum(s.PanelNameShadow, brandShadows)
		if err != nil {
			return fmt.Errorf("invalid panel_name_shadow: %w", err)
		}
		if err := r.setString(PanelNameShadowKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameGradientFrom != "" {
		v, err := validatedBrandHex(s.PanelNameGradientFrom)
		if err != nil {
			return fmt.Errorf("invalid panel_name_gradient_from: %w", err)
		}
		if err := r.setString(PanelNameGradientFromKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameGradientTo != "" {
		v, err := validatedBrandHex(s.PanelNameGradientTo)
		if err != nil {
			return fmt.Errorf("invalid panel_name_gradient_to: %w", err)
		}
		if err := r.setString(PanelNameGradientToKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameGradientDir != "" {
		v, err := validatedBrandEnum(s.PanelNameGradientDir, gradientDirs)
		if err != nil {
			return fmt.Errorf("invalid panel_name_gradient_dir: %w", err)
		}
		if err := r.setString(PanelNameGradientDirKey, v); err != nil {
			return err
		}
	}
	if s.PanelNameItalic != "" {
		if err := r.setString(PanelNameItalicKey, normalizeToggle(s.PanelNameItalic)); err != nil {
			return err
		}
	}
	if s.PanelNameUppercase != "" {
		if err := r.setString(PanelNameUppercaseKey, normalizeToggle(s.PanelNameUppercase)); err != nil {
			return err
		}
	}
	if s.PanelNameSpacing != "" {
		v, err := validatedBrandEnum(s.PanelNameSpacing, brandSpacings)
		if err != nil {
			return fmt.Errorf("invalid panel_name_spacing: %w", err)
		}
		if err := r.setString(PanelNameSpacingKey, v); err != nil {
			return err
		}
	}
	if s.PanelLogoSize != "" {
		v, err := validatedBrandEnum(s.PanelLogoSize, brandSizes)
		if err != nil {
			return fmt.Errorf("invalid panel_logo_size: %w", err)
		}
		if err := r.setString(PanelLogoSizeKey, v); err != nil {
			return err
		}
	}
	if s.PanelLogoShape != "" {
		v, err := validatedBrandEnum(s.PanelLogoShape, logoShapes)
		if err != nil {
			return fmt.Errorf("invalid panel_logo_shape: %w", err)
		}
		if err := r.setString(PanelLogoShapeKey, v); err != nil {
			return err
		}
	}
	if s.PanelLogoFit != "" {
		v, err := validatedBrandEnum(s.PanelLogoFit, logoFits)
		if err != nil {
			return fmt.Errorf("invalid panel_logo_fit: %w", err)
		}
		if err := r.setString(PanelLogoFitKey, v); err != nil {
			return err
		}
	}
	if s.PanelLogoBg != "" {
		v, err := validatedBrandEnum(s.PanelLogoBg, logoBgs)
		if err != nil {
			return fmt.Errorf("invalid panel_logo_bg: %w", err)
		}
		if err := r.setString(PanelLogoBgKey, v); err != nil {
			return err
		}
	}
	if s.PanelLogoShadow != "" {
		v, err := validatedBrandEnum(s.PanelLogoShadow, brandShadows)
		if err != nil {
			return fmt.Errorf("invalid panel_logo_shadow: %w", err)
		}
		if err := r.setString(PanelLogoShadowKey, v); err != nil {
			return err
		}
	}
	if s.PanelLogoRing != "" {
		if err := r.setString(PanelLogoRingKey, normalizeToggle(s.PanelLogoRing)); err != nil {
			return err
		}
	}
	return nil
}

// normalizeToggle coerces common truthy/falsy strings into the canonical
// "1"/"0" pair the settings store uses for boolean toggles. Accepts true/
// false/yes/no/on/off and the raw "1"/"0" the SPA already sends. Anything not
// recognized as truthy is treated as "0" so the default always stays a safe
// disabled state.
func normalizeToggle(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return "1"
	case "0", "false", "no", "off":
		return "0"
	}
	return "0"
}

// ── Brand-style allow-lists + validators ────────────────────────────────
// The frontend renders exactly these enum values; the repo is the source of
// truth so a corrupt row can never inject an arbitrary CSS string.

var (
	panelNameFonts   = []string{"inter", "system", "poppins", "montserrat", "roboto", "outfit", "space", "playfair", "mono"}
	panelNameWeights = []string{"400", "500", "600", "700", "800", "900"}
	brandSizes       = []string{"sm", "md", "lg", "xl"}
	panelNameEffects = []string{"none", "shadow", "outline", "3d", "neon", "gradient"}
	brandShadows     = []string{"none", "sm", "md", "lg", "glow"}
	gradientDirs     = []string{"90deg", "135deg", "180deg"}
	brandSpacings    = []string{"tight", "normal", "wide"}
	logoShapes       = []string{"rounded", "large", "circle", "square"}
	logoFits         = []string{"contain", "cover", "fill"}
	logoBgs          = []string{"dark", "transparent", "light"}
)

// validatedBrandEnum lower-cases/trims v and ensures it is one of allow.
// Returns the canonical value or an error naming the accepted set.
func validatedBrandEnum(v string, allow []string) (string, error) {
	norm := strings.ToLower(strings.TrimSpace(v))
	for _, a := range allow {
		if norm == a {
			return norm, nil
		}
	}
	return "", fmt.Errorf("want one of %s", strings.Join(allow, "|"))
}

// normalizeBrandEnum is the fail-soft read-path twin: unknown/empty values
// fall back to def instead of erroring so old/corrupt rows still render.
func normalizeBrandEnum(v string, allow []string, def string) string {
	norm := strings.ToLower(strings.TrimSpace(v))
	if norm == "" {
		return def
	}
	for _, a := range allow {
		if norm == a {
			return norm
		}
	}
	return def
}

// validatedBrandHex ensures v is #rgb or #rrggbb (with or without the hash
// the SPA always sends it with). Returns the canonical lowercase #rrggbb/#rgb.
func validatedBrandHex(v string) (string, error) {
	s := strings.TrimSpace(v)
	if s == "" {
		return "", fmt.Errorf("empty color")
	}
	if !strings.HasPrefix(s, "#") {
		s = "#" + s
	}
	if len(s) != 4 && len(s) != 7 {
		return "", fmt.Errorf("want #rgb or #rrggbb")
	}
	for _, c := range s[1:] {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
		default:
			return "", fmt.Errorf("want #rgb or #rrggbb")
		}
	}
	return strings.ToLower(s), nil
}

// normalizeBrandHex is the fail-soft read-path twin: garbage falls back to
// def so the brand never renders an invalid CSS color.
func normalizeBrandHex(v, def string) string {
	if _, err := validatedBrandHex(v); err != nil {
		return def
	}
	s := strings.TrimSpace(v)
	if !strings.HasPrefix(s, "#") {
		s = "#" + s
	}
	return strings.ToLower(s)
}

// IsRegisterAllowed reports whether public self-registration is enabled.
// Defaults to false (a brand-new DB that hasn't seeded the row stays safe).
func (r *SettingsRepository) IsRegisterAllowed() bool {
	return r.getString(RegisterAllowKey, "0") == "1"
}

// IsVerifyRequired reports whether freshly-registered users must verify
// their email before they can log in. Defaults to false.
func (r *SettingsRepository) IsVerifyRequired() bool {
	return r.getString(VerifyRequiredKey, "0") == "1"
}

// RegisterRoleName returns the role NAME self-registered accounts land in.
// Defaults to "user" (the built-in unprivileged role) so a brand-new install
// can't accidentally hand out admin via self-registration.
func (r *SettingsRepository) RegisterRoleName() string {
	v := r.getString(RegisterRoleKey, "user")
	if v == "" {
		return "user"
	}
	return v
}

// DeviceAccountLimit returns the max self-registered accounts per device.
// Returns 0 for unlimited (default / unconfigured / invalid).
func (r *SettingsRepository) DeviceAccountLimit() int {
	v := r.getString(DeviceAccountLimitKey, "0")
	n := 0
	for _, c := range v {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// SMTPConfig returns the configured SMTP server block so the email-sender
// helper can dial it without re-implementing the key/value reads.
func (r *SettingsRepository) SMTPConfig() (host, port, user, password, from string) {
	return r.getString(SMTPHostKey, ""),
		r.getString(SMTPPortKey, ""),
		r.getString(SMTPUserKey, ""),
		r.getString(SMTPPasswordKey, ""),
		r.getString(SMTPFromKey, "")
}

// PanelPort returns the last port the panel was launched on, or 0 when the
// value is missing/invalid so callers can fall through to their default
// chain (CLI flag → env → DefaultPort). We intentionally don't return the
// fallback port here — the launch command's precedence list owns that
// decision so the CLI flag and env-var behaviour stays in one place.
func (r *SettingsRepository) PanelPort() int {
	v := strings.TrimSpace(r.getString(PanelPortKey, ""))
	if v == "" {
		return 0
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > 65535 {
		return 0
	}
	return n
}

// SetPanelPort persists the port the panel just bound to so the next
// `kspanel launch` (no flags) reuses it. Out-of-range / non-numeric values
// are rejected so a typo in the API layer can't poison the launch chain.
func (r *SettingsRepository) SetPanelPort(port int) error {
	if port < 1 || port > 65535 {
		return fmt.Errorf("invalid port %d (1-65535)", port)
	}
	return r.setString(PanelPortKey, strconv.Itoa(port))
}

// extensionForMime returns a normalized file extension (including the dot)
// for the given MIME type, or "" when unsupported. The allow-list keeps the
// on-disk filename predictable and prevents surprising types from being
// stored (e.g. SVG is intentionally excluded by default; supply a future
// flag if you want it).
func extensionForMime(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	default:
		return ""
	}
}

func randHex(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}
