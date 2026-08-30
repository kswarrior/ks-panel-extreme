package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/example/kspanel/internal/models"
)

const AiChatConfigKey = "ai_chat_config"

// AiChatRepository persists the floating AI assistant config as a single
// JSON blob in the settings table (key = ai_chat_config). This keeps the
// storage dialect-agnostic (no migration) and mirrors the AuthorityRepository
// pattern the codebase already uses for JSON-blob settings.
type AiChatRepository struct {
	db *sql.DB
}

func NewAiChatRepository(db *sql.DB) *AiChatRepository {
	return &AiChatRepository{db: db}
}

// Get returns the masked config (ApiKey -> "*") suitable for the frontend.
func (r *AiChatRepository) Get() (*models.AiConfig, error) {
	raw, err := r.GetRaw()
	if err != nil {
		return nil, err
	}
	return maskAiSecrets(raw), nil
}

// GetRaw returns the unmasked config (real ApiKeys) for server-side use
// (proxying to the provider). Never send this directly to the client.
func (r *AiChatRepository) GetRaw() (*models.AiConfig, error) {
	var raw string
	err := r.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, AiChatConfigKey).Scan(&raw)
	if err == sql.ErrNoRows || strings.TrimSpace(raw) == "" {
		return models.DefaultAiConfig(), nil
	}
	if err != nil {
		return nil, fmt.Errorf("read ai config: %w", err)
	}
	cfg := models.DefaultAiConfig()
	if err := json.Unmarshal([]byte(raw), cfg); err != nil {
		// corrupted blob -> reset to defaults rather than 500
		return models.DefaultAiConfig(), nil
	}
	// backfill defaults for missing fields on old blobs
	if cfg.SystemPrompt == "" {
		cfg.SystemPrompt = models.DefaultAiConfig().SystemPrompt
	}
	if cfg.Providers == nil {
		cfg.Providers = []models.AiProvider{}
	}
	return cfg, nil
}

// Update persists the supplied config. Blank ApiKey fields ("" or "*") keep
// the previously stored secret so a masked round-trip doesn't wipe credentials.
func (r *AiChatRepository) Update(in *models.AiConfig) error {
	if in == nil {
		return fmt.Errorf("nothing to update")
	}
	prev, err := r.GetRaw()
	if err != nil {
		return err
	}
	// Build provider lookup for secret preservation
	prevByID := make(map[string]string, len(prev.Providers))
	for _, p := range prev.Providers {
		prevByID[p.ID] = p.ApiKey
	}
	for i := range in.Providers {
		p := &in.Providers[i]
		// normalize id/name
		p.ID = strings.TrimSpace(p.ID)
		p.Name = strings.TrimSpace(p.Name)
		if p.ID == "" {
			// auto-generate id from name if missing
			p.ID = strings.ToLower(strings.ReplaceAll(p.Name, " ", "-"))
			if p.ID == "" {
				p.ID = fmt.Sprintf("provider-%d", i+1)
			}
		}
		if p.ApiKey == "" || p.ApiKey == "*" {
			if prevKey, ok := prevByID[p.ID]; ok {
				p.ApiKey = prevKey
			}
		}
		// normalize models: trim, drop empties
		clean := make([]string, 0, len(p.Models))
		for _, m := range p.Models {
			m = strings.TrimSpace(m)
			if m != "" {
				clean = append(clean, m)
			}
		}
		p.Models = clean
		if p.Type == "" {
			p.Type = "openai"
		}
	}
	// normalize defaults
	in.SystemPrompt = strings.TrimSpace(in.SystemPrompt)
	if in.SystemPrompt == "" {
		in.SystemPrompt = prev.SystemPrompt
		if in.SystemPrompt == "" {
			in.SystemPrompt = models.DefaultAiConfig().SystemPrompt
		}
	}

	blob, err := json.Marshal(in)
	if err != nil {
		return fmt.Errorf("marshal ai config: %w", err)
	}
	_, err = r.db.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		AiChatConfigKey, string(blob),
	)
	return err
}

func maskAiSecrets(cfg *models.AiConfig) *models.AiConfig {
	if cfg == nil {
		return nil
	}
	for i := range cfg.Providers {
		if cfg.Providers[i].ApiKey != "" {
			cfg.Providers[i].ApiKey = "*"
		}
	}
	return cfg
}
