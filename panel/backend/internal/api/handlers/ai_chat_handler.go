package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// GetAiConfigHandler serves GET /api/ai/config — the floating AI widget's
// provider list, model ids and system prompt (api keys masked as "*").
// Requires any authenticated user; the frontend hides the widget when the
// caller lacks AI_CHAT_USE, but the config itself is not secret except for
// the keys (which are masked).
func GetAiConfigHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, `{"error":"server error"}`, http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewAiChatRepository(con)
	cfg, err := repo.Get()
	if err != nil {
		http.Error(w, `{"error":"failed to read ai config"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cfg)
}

// UpdateAiConfigHandler serves PUT /api/ai/config — admin write path for
// providers, model ids and system prompt. Requires MANAGE_AI_CHAT or
// AI_CHAT_MANAGE (enforced at router layer).
func UpdateAiConfigHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, `{"error":"server error"}`, http.StatusInternalServerError)
		return
	}
	defer con.Close()

	var in models.AiConfig
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	// Validate: provider ids unique, names non-empty if any provider present
	seen := make(map[string]struct{}, len(in.Providers))
	for _, p := range in.Providers {
		id := strings.TrimSpace(p.ID)
		if id == "" {
			id = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(p.Name), " ", "-"))
		}
		if id == "" {
			http.Error(w, `{"error":"each provider needs an id or name"}`, http.StatusBadRequest)
			return
		}
		if _, ok := seen[id]; ok {
			http.Error(w, fmt.Sprintf(`{"error":"duplicate provider id %q"}`, id), http.StatusBadRequest)
			return
		}
		seen[id] = struct{}{}
		// base_url if set must look like a URL (light check)
		if p.BaseURL != "" && !strings.HasPrefix(p.BaseURL, "http://") && !strings.HasPrefix(p.BaseURL, "https://") {
			http.Error(w, fmt.Sprintf(`{"error":"provider %q base_url must start with http:// or https://"}`, id), http.StatusBadRequest)
			return
		}
		if len(p.Models) > 50 {
			http.Error(w, fmt.Sprintf(`{"error":"provider %q has too many models (max 50)"}`, id), http.StatusBadRequest)
			return
		}
	}
	if len(in.SystemPrompt) > 8000 {
		http.Error(w, `{"error":"system prompt too long (max 8000 chars)"}`, http.StatusBadRequest)
		return
	}
	if len(in.Providers) > 20 {
		http.Error(w, `{"error":"too many providers (max 20)"}`, http.StatusBadRequest)
		return
	}

	repo := repository.NewAiChatRepository(con)
	if err := repo.Update(&in); err != nil {
		http.Error(w, `{"error":"failed to save ai config"}`, http.StatusInternalServerError)
		return
	}
	cfg, _ := repo.Get()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cfg)
}

// AiChatHandler serves POST /api/ai/chat — the chat completion proxy.
// Body: {provider_id, model, messages: [{role,content}]}.
// Requires AI_CHAT_USE (enforced at router layer).
// Behaviour:
//   - Loads raw config (real api keys) server-side.
//   - Validates provider/model exist and are enabled.
//   - Prepends the stored system prompt (if any) as a system message when
//     the caller didn't already include one.
//   - If provider has no api key / base_url or network fails, falls back to
//     a deterministic echo/mock so the widget stays useful in dev/offline.
func AiChatHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, `{"error":"server error"}`, http.StatusInternalServerError)
		return
	}
	defer con.Close()

	var req models.AiChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json: need provider_id, model, messages"}`, http.StatusBadRequest)
		return
	}
	req.ProviderID = strings.TrimSpace(req.ProviderID)
	req.Model = strings.TrimSpace(req.Model)
	if req.ProviderID == "" {
		http.Error(w, `{"error":"provider_id required"}`, http.StatusBadRequest)
		return
	}
	if req.Model == "" {
		http.Error(w, `{"error":"model required"}`, http.StatusBadRequest)
		return
	}
	if len(req.Messages) == 0 {
		http.Error(w, `{"error":"messages required"}`, http.StatusBadRequest)
		return
	}
	if len(req.Messages) > 50 {
		http.Error(w, `{"error":"too many messages (max 50)"}`, http.StatusBadRequest)
		return
	}
	for i, m := range req.Messages {
		if m.Content == "" {
			http.Error(w, fmt.Sprintf(`{"error":"message %d content empty"}`, i), http.StatusBadRequest)
			return
		}
		if len(m.Content) > 8000 {
			http.Error(w, fmt.Sprintf(`{"error":"message %d too long (max 8000)"}`, i), http.StatusBadRequest)
			return
		}
		if m.Role != "user" && m.Role != "assistant" && m.Role != "system" {
			http.Error(w, fmt.Sprintf(`{"error":"message %d invalid role %q"}`, i, m.Role), http.StatusBadRequest)
			return
		}
	}

	repo := repository.NewAiChatRepository(con)
	cfg, err := repo.GetRaw()
	if err != nil {
		http.Error(w, `{"error":"failed to read ai config"}`, http.StatusInternalServerError)
		return
	}
	// find provider
	var prov *models.AiProvider
	for i := range cfg.Providers {
		if cfg.Providers[i].ID == req.ProviderID {
			prov = &cfg.Providers[i]
			break
		}
	}
	if prov == nil {
		http.Error(w, fmt.Sprintf(`{"error":"unknown provider %q"}`, req.ProviderID), http.StatusBadRequest)
		return
	}
	if !prov.Enabled {
		http.Error(w, fmt.Sprintf(`{"error":"provider %q is disabled"}`, req.ProviderID), http.StatusBadRequest)
		return
	}
	// validate model belongs to provider (if provider declares models)
	if len(prov.Models) > 0 {
		found := false
		for _, m := range prov.Models {
			if m == req.Model {
				found = true
				break
			}
		}
		if !found {
			http.Error(w, fmt.Sprintf(`{"error":"model %q not configured for provider %q"}`, req.Model, req.ProviderID), http.StatusBadRequest)
			return
		}
	}

	// prepend system prompt if caller didn't already send one
	hasSystem := false
	for _, m := range req.Messages {
		if m.Role == "system" {
			hasSystem = true
			break
		}
	}
	messages := req.Messages
	if !hasSystem && strings.TrimSpace(cfg.SystemPrompt) != "" {
		messages = append([]models.AiChatMessage{{Role: "system", Content: cfg.SystemPrompt}}, messages...)
	}

	// Try to proxy to the provider if it looks configured; otherwise fall back
	// to a mock reply so the widget still demonstrates the flow without a live key.
	reply, err := proxyToProvider(r, prov, req.Model, messages)
	if err != nil {
		// fallback mock – echo last user message with context
		lastUser := ""
		for i := len(req.Messages) - 1; i >= 0; i-- {
			if req.Messages[i].Role == "user" {
				lastUser = req.Messages[i].Content
				break
			}
		}
		reply = mockReply(lastUser, req.Model, prov.Name)
	}

	resp := models.AiChatResponse{
		ProviderID: prov.ID,
		Model:      req.Model,
		Reply:      reply,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func proxyToProvider(r *http.Request, prov *models.AiProvider, model string, messages []models.AiChatMessage) (string, error) {
	if strings.TrimSpace(prov.ApiKey) == "" || strings.TrimSpace(prov.BaseURL) == "" {
		return "", fmt.Errorf("provider not configured")
	}
	base := strings.TrimRight(prov.BaseURL, "/")
	// OpenAI-compatible path
	url := base + "/chat/completions"
	if prov.Type == "anthropic" {
		url = base + "/v1/messages"
	}

	// Build OpenAI-compatible payload
	type msg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	msgs := make([]msg, 0, len(messages))
	for _, m := range messages {
		msgs = append(msgs, msg{Role: m.Role, Content: m.Content})
	}

	var body []byte
	var err error
	if prov.Type == "anthropic" {
		// Anthropic expects {model, system?, messages: [{role,content}], max_tokens}
		system := ""
		filtered := msgs
		if len(msgs) > 0 && msgs[0].Role == "system" {
			system = msgs[0].Content
			filtered = msgs[1:]
		}
		anthMessages := make([]msg, 0, len(filtered))
		for _, m := range filtered {
			// anthropic doesn't accept system role in messages
			if m.Role == "system" {
				continue
			}
			anthMessages = append(anthMessages, m)
		}
		payload := map[string]any{
			"model":      model,
			"messages":   anthMessages,
			"max_tokens": 1024,
		}
		if system != "" {
			payload["system"] = system
		}
		body, err = json.Marshal(payload)
	} else {
		payload := map[string]any{
			"model":    model,
			"messages": msgs,
		}
		body, err = json.Marshal(payload)
	}
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if prov.Type == "anthropic" {
		req.Header.Set("x-api-key", prov.ApiKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	} else {
		req.Header.Set("Authorization", "Bearer "+prov.ApiKey)
	}

	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("provider http %d: %s", resp.StatusCode, string(respBody))
	}
	// Parse response
	if prov.Type == "anthropic" {
		var out struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		}
		if err := json.Unmarshal(respBody, &out); err != nil {
			return "", err
		}
		if len(out.Content) > 0 {
			return out.Content[0].Text, nil
		}
		return "", fmt.Errorf("empty anthropic response")
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return "", err
	}
	if len(out.Choices) > 0 && out.Choices[0].Message.Content != "" {
		return out.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("empty openai response")
}

func mockReply(lastUser, model, providerName string) string {
	if lastUser == "" {
		lastUser = "Hello"
	}
	// Deterministic mock so the widget is demonstrably working even without a live key.
	// The reply is short + friendly and mentions the provider/model so the admin sees
	// the wiring is correct. The system prompt would normally steer this, but we keep
	// the mock provider-agnostic.
	return fmt.Sprintf("🤖 [%s · %s]\n\nYou said: %q\n\nThis is a mock reply — configure a provider API key and base URL to get live completions. Your message was received and the chat UI is working.", providerName, model, lastUser)
}
