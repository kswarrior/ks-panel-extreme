package models

// AiProvider describes one LLM provider the admin has configured.
// The ApiKey is never serialized with its real value to the frontend;
// GetAiConfig masks it as "*" so the SPA's round-trip doesn't wipe it.
type AiProvider struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Type      string   `json:"type"`       // openai | anthropic | openai-compatible | custom
	BaseURL   string   `json:"base_url"`   // e.g. https://api.openai.com/v1
	ApiKey    string   `json:"api_key"`    // masked as "*" on read; blank means unchanged on write
	Models    []string `json:"models"`     // model ids, e.g. ["gpt-4o", "gpt-4o-mini"]
	Enabled   bool     `json:"enabled"`
}

// AiConfig is the global AI assistant config stored as a single JSON blob
// in the settings table under key "ai_chat_config". Providers holds the
// admin-curated list; SystemPrompt is injected as the system message for
// every chat turn. DefaultProvider/DefaultModel are the pre-selected values
// the widget uses when the user hasn't picked explicitly.
type AiConfig struct {
	SystemPrompt    string       `json:"system_prompt"`
	Providers       []AiProvider `json:"providers"`
	DefaultProvider string       `json:"default_provider"`
	DefaultModel    string       `json:"default_model"`
}

// DefaultAiConfig returns a fresh empty config (no providers, empty prompt)
// so callers can safely read without nil checks.
func DefaultAiConfig() *AiConfig {
	return &AiConfig{
		SystemPrompt:    "You are a helpful assistant for KS Panel.",
		Providers:       []AiProvider{},
		DefaultProvider: "",
		DefaultModel:    "",
	}
}

// AiChatMessage is one turn in the conversation the frontend sends to
// POST /api/ai/chat. The backend may prepend the configured system prompt
// before proxying to the provider.
type AiChatMessage struct {
	Role    string `json:"role"`    // system | user | assistant
	Content string `json:"content"`
}

// AiChatRequest is the frontend → backend payload for a chat completion.
type AiChatRequest struct {
	ProviderID string          `json:"provider_id"`
	Model      string          `json:"model"`
	Messages   []AiChatMessage `json:"messages"`
}

// AiChatResponse is the backend → frontend reply (plus echoed provider/model).
type AiChatResponse struct {
	ProviderID string `json:"provider_id"`
	Model      string `json:"model"`
	Reply      string `json:"reply"`
}
