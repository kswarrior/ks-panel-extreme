package repository

import (
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/oauth"
)

type AuthorityRepository struct {
	db *sql.DB
}

const AuthorityConfigKey = "authority_config"

func NewAuthorityRepository(db *sql.DB) *AuthorityRepository {
	return &AuthorityRepository{db: db}
}

func (r *AuthorityRepository) readBlob(key string) (string, bool, error) {
	var raw string
	err := r.db.QueryRow(
		`SELECT COALESCE((SELECT value FROM settings WHERE `+qKey()+` = ?), '')`,
		key,
	).Scan(&raw)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("authority config read: %w", err)
	}
	if strings.TrimSpace(raw) == "" {
		return "", false, nil
	}
	return raw, true, nil
}

func (r *AuthorityRepository) Get() (*models.AuthorityConfig, error) {
	cfg := models.DefaultAuthorityConfig()
	raw, ok, err := r.readBlob(AuthorityConfigKey)
	if err != nil {
		return nil, err
	}
	if !ok || strings.TrimSpace(raw) == "" {
		return maskSecrets(cfg), nil
	}
	if err := json.Unmarshal([]byte(raw), cfg); err != nil {
		return maskSecrets(models.DefaultAuthorityConfig()), nil
	}
	cfg = backfillDefaults(cfg)
	return maskSecrets(cfg), nil
}

func (r *AuthorityRepository) GetRaw() (*models.AuthorityConfig, error) {
	cfg := models.DefaultAuthorityConfig()
	raw, ok, err := r.readBlob(AuthorityConfigKey)
	if err != nil {
		return nil, err
	}
	if !ok || strings.TrimSpace(raw) == "" {
		return cfg, nil
	}
	if err := json.Unmarshal([]byte(raw), cfg); err != nil {
		return models.DefaultAuthorityConfig(), nil
	}
	return backfillDefaults(cfg), nil
}

func (r *AuthorityRepository) Update(cfg *models.AuthorityConfig) error {
	if cfg == nil {
		return fmt.Errorf("nothing to update")
	}
	prev, err := r.GetRaw()
	if err != nil {
		return err
	}
	preserveSecrets(prev, cfg)
	if err := enforceProviderRequirements(prev, cfg); err != nil {
		return err
	}
	// Configured is a read-time computation only — never persist what the
	// client echoed back.
	for i := range cfg.Providers {
		cfg.Providers[i].Configured = false
	}
	cfg.RegistrationMinimumN = clampInt(cfg.RegistrationMinimumN, 1)
	if cfg.OTP.CodeLength < 4 {
		cfg.OTP.CodeLength = 6
	}
	if cfg.OTP.TTLSeconds < 10 {
		cfg.OTP.TTLSeconds = 300
	}
	if cfg.AppConnect.PinSize < 4 || cfg.AppConnect.PinSize > 10 {
		cfg.AppConnect.PinSize = 6
	}
	if cfg.AppConnect.RotationSeconds < 5 {
		cfg.AppConnect.RotationSeconds = 30
	}
	if cfg.AppConnect.DigitsInWindow < 1 {
		cfg.AppConnect.DigitsInWindow = 1
	}
	if cfg.PasswordHistory != nil {
		if cfg.PasswordHistory.MaxHistory < 1 {
			cfg.PasswordHistory.MaxHistory = 5
		}
		if cfg.PasswordHistory.MaxHistory > 24 {
			cfg.PasswordHistory.MaxHistory = 24
		}
	}
	blob, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("authority marshal: %w", err)
	}
	if err := r.setString(AuthorityConfigKey, string(blob)); err != nil {
		return err
	}
	if cfg.RegisterAllow != "" {
		_ = r.setString(RegisterAllowKey, normalizeToggle(cfg.RegisterAllow))
	}
	if cfg.VerifyRequired != "" {
		_ = r.setString(VerifyRequiredKey, normalizeToggle(cfg.VerifyRequired))
	}
	if cfg.RegisterRole != "" {
		_ = r.setString(RegisterRoleKey, cfg.RegisterRole)
	}
	if cfg.DeviceAccountLimit != "" {
		_ = r.setString(DeviceAccountLimitKey, cfg.DeviceAccountLimit)
	}
	if cfg.SMTPHost != "" {
		_ = r.setString(SMTPHostKey, cfg.SMTPHost)
	}
	if cfg.SMTPPort != "" {
		_ = r.setString(SMTPPortKey, cfg.SMTPPort)
	}
	if cfg.SMTPUser != "" {
		_ = r.setString(SMTPUserKey, cfg.SMTPUser)
	}
	if cfg.SMTPPassword != "" && cfg.SMTPPassword != "*" {
		_ = r.setString(SMTPPasswordKey, cfg.SMTPPassword)
	}
	if cfg.SMTPFrom != "" {
		_ = r.setString(SMTPFromKey, cfg.SMTPFrom)
	}
	return nil
}

func (r *AuthorityRepository) RegenerateAppSecret() (string, error) {
	cfg, err := r.GetRaw()
	if err != nil {
		return "", err
	}
	secret, err := randBase32(20)
	if err != nil {
		return "", err
	}
	cfg.AppConnect.Secret = secret
	if err := r.persistRaw(cfg); err != nil {
		return "", err
	}
	return secret, nil
}

func (r *AuthorityRepository) persistRaw(cfg *models.AuthorityConfig) error {
	blob, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	return r.setString(AuthorityConfigKey, string(blob))
}

// preserveSecrets restores the previously stored values for every secret
// the caller sent blank or as the keep-marker "*", so a masked read
// round-trip never wipes a credential. Includes Apple's .p8 private key.
func preserveSecrets(prev *models.AuthorityConfig, cfg *models.AuthorityConfig) {
	if cfg.SMTPPassword == "" || cfg.SMTPPassword == "*" {
		cfg.SMTPPassword = prev.SMTPPassword
	}
	if cfg.OTP.SMSAPIToken == "" || cfg.OTP.SMSAPIToken == "*" {
		cfg.OTP.SMSAPIToken = prev.OTP.SMSAPIToken
	}
	if cfg.AppConnect.Secret == "" || cfg.AppConnect.Secret == "*" {
		cfg.AppConnect.Secret = prev.AppConnect.Secret
	}
	for i := range cfg.Providers {
		p := &cfg.Providers[i]
		prevP := prev.ProviderByID(p.ID)
		if p.ClientSecret == "" || p.ClientSecret == "*" {
			if prevP != nil {
				p.ClientSecret = prevP.ClientSecret
			}
		}
		// Apple's .p8 private key follows the same keep-blank contract as
		// every other secret on this page.
		if p.PrivateKey == "" || p.PrivateKey == "*" {
			if prevP != nil {
				p.PrivateKey = prevP.PrivateKey
			}
		}
	}
}

// enforceProviderRequirements rejects a save that turns an OAuth provider ON
// without its full credential set (the Security UI's "Config" modal collects
// exactly these fields). Enforcement is transition-only: a provider that was
// ALREADY enabled in the stored blob keeps working so legacy installs and
// sibling-tab saves never get bricked — but you cannot NEWLY enable a
// half-configured provider, failing closed at the gate that matters.
func enforceProviderRequirements(prev *models.AuthorityConfig, cfg *models.AuthorityConfig) error {
	for _, p := range cfg.Providers {
		if !p.Enabled || !oauth.Known(p.ID) {
			continue
		}
		var wasEnabled bool
		if prevP := prev.ProviderByID(p.ID); prevP != nil {
			wasEnabled = prevP.Enabled
		}
		if wasEnabled {
			continue
		}
		if missing := oauth.MissingRequired(p); len(missing) > 0 {
			return fmt.Errorf(
				"cannot enable %s: missing %s",
				oauth.Label(p.ID), strings.Join(missing, ", "),
			)
		}
	}
	return nil
}

func backfillDefaults(cfg *models.AuthorityConfig) *models.AuthorityConfig {
	if cfg == nil {
		return models.DefaultAuthorityConfig()
	}
	if len(cfg.Providers) == 0 {
		cfg.Providers = models.DefaultAuthorityProviders()
		return cfg
	}
	seen := make(map[string]struct{}, len(cfg.Providers))
	for _, p := range cfg.Providers {
		seen[p.ID] = struct{}{}
	}
	for _, p := range models.DefaultAuthorityProviders() {
		if _, ok := seen[p.ID]; !ok {
			cfg.Providers = append(cfg.Providers, p)
		}
	}
	if cfg.RegistrationMode == "" {
		cfg.RegistrationMode = models.AuthorityDefaultRegistrationMode
	}
	if cfg.RegistrationMinimumN < 1 {
		cfg.RegistrationMinimumN = 1
	}
	if cfg.OTP.CodeLength < 4 {
		cfg.OTP.CodeLength = 6
	}
	if cfg.OTP.TTLSeconds < 10 {
		cfg.OTP.TTLSeconds = 300
	}
	if cfg.AppConnect.PinSize < 4 {
		cfg.AppConnect.PinSize = 6
	}
	if cfg.AppConnect.RotationSeconds < 5 {
		cfg.AppConnect.RotationSeconds = 30
	}
	if cfg.AppConnect.DigitsInWindow < 1 {
		cfg.AppConnect.DigitsInWindow = 1
	}
	if cfg.AppConnect.Issuer == "" {
		cfg.AppConnect.Issuer = "KS Panel"
	}
	if cfg.PasswordPolicy == nil {
		cfg.PasswordPolicy = &models.AuthorityPasswordPolicy{
			MinLength:     12,
			MaxLength:     128,
			RequireUpper:  true,
			MinUpper:      1,
			RequireLower:  true,
			MinLower:      1,
			RequireNumber: true,
			MinNumber:     1,
			RequireSymbol: true,
			MinSymbol:     1,
			NoCommon:      true,
			NoPersonal:    true,
		}
	}
	if cfg.PasswordHistory == nil {
		cfg.PasswordHistory = &models.AuthorityPasswordHistory{
			Enabled:    true,
			MaxHistory: 5,
		}
	}
	if cfg.PasswordHistory.MaxHistory < 1 {
		cfg.PasswordHistory.MaxHistory = 5
	}
	if cfg.PasswordHistory.MaxHistory > 24 {
		cfg.PasswordHistory.MaxHistory = 24
	}
	return cfg
}

func maskSecrets(cfg *models.AuthorityConfig) *models.AuthorityConfig {
	if cfg == nil {
		return nil
	}
	cfg.SMTPPassword = ""
	cfg.OTP.SMSAPIToken = ""
	cfg.AppConnect.Secret = ""
	for i := range cfg.Providers {
		// Compute the configured badge while the secrets are still in
		// memory — this is the only place that can see both halves.
		cfg.Providers[i].Configured = oauth.Configured(cfg.Providers[i])
		cfg.Providers[i].ClientSecret = ""
		cfg.Providers[i].PrivateKey = ""
	}
	return cfg
}

func (r *AuthorityRepository) setString(key, value string) error {
	_, err := r.db.Exec(
		`INSERT INTO settings (`+qKey()+`, value) VALUES (?, ?)`+upsertSet("(key)", []string{"value"}),
		key, value,
	)
	return err
}

func clampInt(v, min int) int {
	if v < min {
		return min
	}
	return v
}

func randBase32(n int) (string, error) {
	if n <= 0 {
		return "", fmt.Errorf("randBase32: n must be > 0")
	}
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return strings.TrimRight(base32.StdEncoding.EncodeToString(buf), "="), nil
}
