package repository

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/secretbox"
)

// AI config keys in the settings KV table (seeded by migration 064).
const (
	AIEnabledKey     = "ai_enabled"
	AIBaseURLKey     = "ai_base_url"
	AIAPIKeyEncKey   = "ai_api_key_enc"
	AIModelIDKey     = "ai_model_id"
	AIOllamaModeKey  = "ai_ollama_mode"
	AITemperatureKey = "ai_temperature"
	AIMaxTokensKey   = "ai_max_tokens"
	AIAllowWritesKey = "ai_allow_writes"
	AISystemExtraKey = "ai_system_extra"
	HostingNameKey   = "hosting_name"
	HostingAboutKey  = "hosting_about"
)

// AIConfig is the full runtime config for the panel-wide AI assistant.
// APIKey is cleartext and must never be logged or returned to the browser.
type AIConfig struct {
	Enabled      bool
	BaseURL      string
	APIKey       string // cleartext; sealed at rest in ai_api_key_enc
	ModelID      string
	OllamaMode   bool
	Temperature  float64
	MaxTokens    int
	AllowWrites  bool
	SystemExtra  string
	HostingName  string
	HostingAbout string
}

// AIConfigView is the browser-safe shape: the secret is replaced by a
// configured flag so the admin UI can render "key set" without reading it.
type AIConfigView struct {
	Enabled          bool    `json:"enabled"`
	BaseURL          string  `json:"base_url"`
	APIKeyConfigured bool    `json:"api_key_configured"`
	ModelID          string  `json:"model_id"`
	OllamaMode       bool    `json:"ollama_mode"`
	Temperature      float64 `json:"temperature"`
	MaxTokens        int     `json:"max_tokens"`
	AllowWrites      bool    `json:"allow_writes"`
	SystemExtra      string  `json:"system_extra"`
	HostingName      string  `json:"hosting_name"`
	HostingAbout     string  `json:"hosting_about"`
}

// AIConfigRepository persists the assistant config in the settings KV.
type AIConfigRepository struct {
	db *sql.DB
}

func NewAIConfigRepository(db *sql.DB) *AIConfigRepository {
	return &AIConfigRepository{db: db}
}

func (r *AIConfigRepository) get(key, fallback string) string {
	var v string
	if err := r.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&v); err != nil {
		return fallback
	}
	return v
}

// set upserts a single KV pair. Implemented as UPDATE-then-INSERT so it
// works across SQLite / Postgres / MySQL (ON CONFLICT / ON DUPLICATE KEY
// UPDATE differ per engine) — same pattern as S3ConfigRepository.Put.
func (r *AIConfigRepository) set(key, value string) error {
	res, err := r.db.Exec(`UPDATE settings SET value = ? WHERE key = ?`, value, key)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	_, err = r.db.Exec(`INSERT INTO settings (key, value) VALUES (?, ?)`, key, value)
	return err
}

func aiParseBool(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// Get reads the full config including the unsealed API key. Callers must
// never log the key or send it to the browser — use View for that.
func (r *AIConfigRepository) Get() (*AIConfig, error) {
	cfg := &AIConfig{
		Enabled:      aiParseBool(r.get(AIEnabledKey, "0")),
		BaseURL:      strings.TrimSpace(r.get(AIBaseURLKey, "")),
		ModelID:      strings.TrimSpace(r.get(AIModelIDKey, "")),
		OllamaMode:   aiParseBool(r.get(AIOllamaModeKey, "0")),
		Temperature:  0.7,
		MaxTokens:    1024,
		AllowWrites:  aiParseBool(r.get(AIAllowWritesKey, "0")),
		SystemExtra:  r.get(AISystemExtraKey, ""),
		HostingName:  r.get(HostingNameKey, ""),
		HostingAbout: r.get(HostingAboutKey, ""),
	}
	if t, err := strconv.ParseFloat(strings.TrimSpace(r.get(AITemperatureKey, "0.7")), 64); err == nil {
		if t < 0 {
			t = 0
		}
		if t > 2 {
			t = 2
		}
		cfg.Temperature = t
	}
	if n, err := strconv.Atoi(strings.TrimSpace(r.get(AIMaxTokensKey, "1024"))); err == nil {
		if n < 1 {
			n = 1
		}
		if n > 8192 {
			n = 8192
		}
		cfg.MaxTokens = n
	}
	enc := strings.TrimSpace(r.get(AIAPIKeyEncKey, ""))
	if enc != "" {
		raw, derr := base64.StdEncoding.DecodeString(enc)
		if derr != nil {
			return nil, fmt.Errorf("ai api key decode failed")
		}
		clear, oerr := secretbox.Open(raw)
		if oerr != nil {
			return nil, fmt.Errorf("ai api key open failed")
		}
		cfg.APIKey = string(clear)
	}
	return cfg, nil
}

// View reads the browser-safe shape (secret replaced by a flag).
func (r *AIConfigRepository) View() (*AIConfigView, error) {
	cfg, err := r.Get()
	if err != nil {
		return nil, err
	}
	return &AIConfigView{
		Enabled:          cfg.Enabled,
		BaseURL:          cfg.BaseURL,
		APIKeyConfigured: cfg.APIKey != "",
		ModelID:          cfg.ModelID,
		OllamaMode:       cfg.OllamaMode,
		Temperature:      cfg.Temperature,
		MaxTokens:        cfg.MaxTokens,
		AllowWrites:      cfg.AllowWrites,
		SystemExtra:      cfg.SystemExtra,
		HostingName:      cfg.HostingName,
		HostingAbout:     cfg.HostingAbout,
	}, nil
}

// AIConfigUpdate carries optional admin-supplied fields. APIKey semantics
// mirror the SMTP password sentinel: nil/"" = leave unchanged, "*" = leave
// unchanged, any other value (sealed) replaces the stored secret.
type AIConfigUpdate struct {
	Enabled     *bool
	BaseURL     *string
	APIKey      *string
	ModelID     *string
	OllamaMode  *bool
	Temperature *float64
	MaxTokens   *int
	AllowWrites *bool
	SystemExtra *string
	HostingName *string
	HostingAbout *string
}

func aiBoolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

// Update validates and persists the supplied fields. Unknown/empty values
// are handled per-field; the API key is sealed with secretbox before it
// touches the DB (same wire as the S3 remote secret).
func (r *AIConfigRepository) Update(u *AIConfigUpdate) error {
	if u == nil {
		return fmt.Errorf("nothing to update")
	}
	if u.Enabled != nil {
		if err := r.set(AIEnabledKey, aiBoolStr(*u.Enabled)); err != nil {
			return err
		}
	}
	if u.BaseURL != nil {
		v := strings.TrimSpace(*u.BaseURL)
		if v != "" && !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
			return fmt.Errorf("base_url must start with http:// or https://")
		}
		v = strings.TrimRight(v, "/")
		if len(v) > 512 {
			return fmt.Errorf("base_url is too long (max 512 chars)")
		}
		if err := r.set(AIBaseURLKey, v); err != nil {
			return err
		}
	}
	if u.APIKey != nil && *u.APIKey != "" && *u.APIKey != "*" {
		if len(*u.APIKey) > 4096 {
			return fmt.Errorf("api key is too long (max 4096 chars)")
		}
		sealed, err := secretbox.Seal([]byte(*u.APIKey))
		if err != nil {
			return err
		}
		if err := r.set(AIAPIKeyEncKey, base64.StdEncoding.EncodeToString(sealed)); err != nil {
			return err
		}
	}
	if u.ModelID != nil {
		v := strings.TrimSpace(*u.ModelID)
		if len(v) > 256 {
			return fmt.Errorf("model id is too long (max 256 chars)")
		}
		if err := r.set(AIModelIDKey, v); err != nil {
			return err
		}
	}
	if u.OllamaMode != nil {
		if err := r.set(AIOllamaModeKey, aiBoolStr(*u.OllamaMode)); err != nil {
			return err
		}
	}
	if u.Temperature != nil {
		t := *u.Temperature
		if t < 0 || t > 2 {
			return fmt.Errorf("temperature must be between 0 and 2")
		}
		if err := r.set(AITemperatureKey, strconv.FormatFloat(t, 'f', -1, 64)); err != nil {
			return err
		}
	}
	if u.MaxTokens != nil {
		n := *u.MaxTokens
		if n < 1 || n > 8192 {
			return fmt.Errorf("max tokens must be between 1 and 8192")
		}
		if err := r.set(AIMaxTokensKey, strconv.Itoa(n)); err != nil {
			return err
		}
	}
	if u.AllowWrites != nil {
		if err := r.set(AIAllowWritesKey, aiBoolStr(*u.AllowWrites)); err != nil {
			return err
		}
	}
	if u.SystemExtra != nil {
		if len(*u.SystemExtra) > 8000 {
			return fmt.Errorf("custom instructions are too long (max 8000 chars)")
		}
		if err := r.set(AISystemExtraKey, *u.SystemExtra); err != nil {
			return err
		}
	}
	if u.HostingName != nil {
		if len(*u.HostingName) > 256 {
			return fmt.Errorf("hosting name is too long (max 256 chars)")
		}
		if err := r.set(HostingNameKey, strings.TrimSpace(*u.HostingName)); err != nil {
			return err
		}
	}
	if u.HostingAbout != nil {
		if len(*u.HostingAbout) > 4000 {
			return fmt.Errorf("hosting about is too long (max 4000 chars)")
		}
		if err := r.set(HostingAboutKey, *u.HostingAbout); err != nil {
			return err
		}
	}
	return nil
}
