package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/aiskills"
	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/version"
)

// AI assistant (plan/ai.md): panel-wide chat FAB backed by a server-side
// proxy. The provider key never reaches the browser; the server builds the
// system prompt per request, runs read tools directly (max 5 loops, 60s
// timeout) and turns write tools into confirmation tickets the user must
// approve in the ConfirmCard before anything executes.

// ---------------------------------------------------------------------------
// Per-user rate limiter (sliding window, same pattern as
// security.IPRateLimiter but keyed by user id so one abusive account can't
// burn the shared provider quota / bill).
// ---------------------------------------------------------------------------

type aiUserLimiter struct {
	mu   sync.Mutex
	hits map[int64][]time.Time
}

var aiChatLimiter = &aiUserLimiter{hits: make(map[int64][]time.Time)}

const aiChatMaxPerMinute = 20

// aiRateLimitReply is the 429 body shared by the JSON + SSE chat endpoints.
const aiRateLimitReply = "rate limit exceeded (20 chats/min) — slow down and retry"

// aiWriteRateLimit answers 429 with a Retry-After hint so clients can back
// off instead of hammering the endpoint.
func aiWriteRateLimit(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "60")
	http.Error(w, aiRateLimitReply, http.StatusTooManyRequests)
}

// aiIsRateLimitErr reports provider rate-limit failures (HTTP 429 /
// "too many requests" / "rate limit" from either provider, or our own
// limiter reply echoed back through the fallback chain).
func aiIsRateLimitErr(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "429") ||
		strings.Contains(s, "too many requests") ||
		strings.Contains(s, "rate limit")
}

// aiProviderHTTPStatus extracts the HTTP status from provider errors shaped
// as "provider HTTP NNN..." by aiPostJSON/aiStreamPost. It returns 0 when
// the error carries no HTTP status (transport failures, timeouts, malformed
// bodies, inline provider error strings).
func aiProviderHTTPStatus(err error) int {
	if err == nil {
		return 0
	}
	s := err.Error()
	idx := strings.Index(s, "provider HTTP ")
	if idx < 0 {
		return 0
	}
	rest := s[idx+len("provider HTTP "):]
	n, digits := 0, 0
	for _, ch := range rest {
		if ch < '0' || ch > '9' {
			break
		}
		n = n*10 + int(ch-'0')
		digits++
	}
	if digits == 0 {
		return 0
	}
	return n
}

// aiShouldFallbackToProvider reports whether a primary provider error
// warrants failing over to the fallback triple: transport errors (no HTTP
// status), HTTP 5xx, or rate limits (HTTP 429 / "rate limit" text via
// aiIsRateLimitErr). Primary 4xx (bad request, auth, forbidden, not found)
// is a config/credential problem the fallback cannot fix, so the primary
// error must return directly without double-invoking providers.
func aiShouldFallbackToProvider(err error) bool {
	if err == nil {
		return false
	}
	if aiIsRateLimitErr(err) {
		return true
	}
	code := aiProviderHTTPStatus(err)
	if code == 0 {
		return true
	}
	return code >= 500
}

// aiRetryAfterSecs extracts the "(retry after Ns)" hint aiStreamPost appends
// to provider errors. Falls back to 60s for rate-limit errors without a
// hint, 0 when the error is not rate-limit related.
func aiRetryAfterSecs(err error) int {
	if err == nil {
		return 0
	}
	s := strings.ToLower(err.Error())
	idx := strings.Index(s, "retry after ")
	if idx >= 0 {
		rest := s[idx+len("retry after "):]
		n := 0
		for _, ch := range rest {
			if ch < '0' || ch > '9' {
				break
			}
			n = n*10 + int(ch-'0')
		}
		if n > 0 && n <= 3600 {
			return n
		}
	}
	if aiIsRateLimitErr(err) {
		return 60
	}
	return 0
}

func (l *aiUserLimiter) allow(uid int64) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	bucket := l.hits[uid]
	i := 0
	for i < len(bucket) && bucket[i].Before(cutoff) {
		i++
	}
	bucket = append(bucket[i:], now)
	// Sweep occasionally so idle users don't accumulate state.
	if len(l.hits) > 4096 {
		for id, b := range l.hits {
			if len(b) == 0 || b[len(b)-1].Before(cutoff) {
				delete(l.hits, id)
			}
		}
	}
	l.hits[uid] = bucket
	return len(bucket) <= aiChatMaxPerMinute
}

// ---------------------------------------------------------------------------
// Confirmation tickets: write tools never execute during chat. They produce
// a ticket the user approves/denies in the ConfirmCard; approval executes
// via the same endpoint with approve_ticket_id. Tickets live in the
// ai_confirmation_tickets table (migration 066) so a pending approval
// survives panel restarts; they are bound to the requesting user and
// expire after 10 minutes.
// ---------------------------------------------------------------------------

type aiTicket struct {
	ID      string          `json:"id"`
	UserID  int64           `json:"-"`
	Tool    string          `json:"tool"`
	Args    json.RawMessage `json:"-"`
	Summary string          `json:"summary"`
	Diff    string          `json:"diff"`
	Expires time.Time       `json:"-"`
}

func aiNewTicketID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func aiStoreTicket(con *sql.DB, t *aiTicket) error {
	repo := repository.NewAITicketRepository(con)
	return repo.Store(&repository.AITicketRow{
		ID: t.ID, UserID: t.UserID, Tool: t.Tool, ArgsJSON: string(t.Args),
		Summary: t.Summary, Diff: t.Diff, ExpiresAt: t.Expires,
	})
}

func aiTakeTicket(con *sql.DB, id string, uid int64) (*aiTicket, bool) {
	row, ok := repository.NewAITicketRepository(con).Take(id, uid)
	if !ok {
		return nil, false
	}
	return &aiTicket{
		ID: row.ID, UserID: row.UserID, Tool: row.Tool,
		Args: json.RawMessage(row.ArgsJSON), Summary: row.Summary,
		Diff: row.Diff, Expires: row.ExpiresAt,
	}, true
}

// ---------------------------------------------------------------------------
// Config endpoints.
// ---------------------------------------------------------------------------

// AIConfigHandler serves the masked config (any authenticated user — the
// secret is never included) and accepts admin updates (SETTINGS_EDIT).
func AIConfigHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewAIConfigRepository(con)

	switch r.Method {
	case http.MethodGet:
		view, err := repo.View()
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, view)
	case http.MethodPut:
		var body struct {
			Enabled     *bool    `json:"enabled"`
			BaseURL     *string  `json:"base_url"`
			APIKey      *string  `json:"api_key"`
			ModelID     *string  `json:"model_id"`
			OllamaMode  *bool    `json:"ollama_mode"`
			Temperature *float64 `json:"temperature"`
			MaxTokens   *int     `json:"max_tokens"`
			AllowWrites *bool    `json:"allow_writes"`
			SystemExtra *string  `json:"system_extra"`
			HostingName *string  `json:"hosting_name"`
			HostingAbout *string `json:"hosting_about"`

			FallbackBaseURL    *string  `json:"fallback_base_url"`
			FallbackAPIKey     *string  `json:"fallback_api_key"`
			FallbackModelID    *string  `json:"fallback_model_id"`
			FallbackOllamaMode *bool    `json:"fallback_ollama_mode"`
			CostPer1KIn        *float64 `json:"cost_per_1k_in"`
			CostPer1KOut       *float64 `json:"cost_per_1k_out"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		u := &repository.AIConfigUpdate{
			Enabled: body.Enabled, BaseURL: body.BaseURL, APIKey: body.APIKey,
			ModelID: body.ModelID, OllamaMode: body.OllamaMode,
			Temperature: body.Temperature, MaxTokens: body.MaxTokens,
			AllowWrites: body.AllowWrites, SystemExtra: body.SystemExtra,
			HostingName: body.HostingName, HostingAbout: body.HostingAbout,

			FallbackBaseURL: body.FallbackBaseURL, FallbackAPIKey: body.FallbackAPIKey,
			FallbackModelID: body.FallbackModelID, FallbackOllamaMode: body.FallbackOllamaMode,
			CostPer1KIn: body.CostPer1KIn, CostPer1KOut: body.CostPer1KOut,
		}
		if err := repo.Update(u); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		RecordActivity(r, repository.ActivityInput{
			Category: models.ActivityCategorySettings,
			Action:   "update",
			Message:  "updated AI assistant configuration",
		})
		view, _ := repo.View()
		writeJSON(w, view)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// aiProbeTokens bounds the connectivity-probe budget to 16 tokens without
// ever exceeding the admin's configured MaxTokens (pure, unit-tested).
func aiProbeTokens(maxTokens int) int {
	if maxTokens < 1 {
		return 1
	}
	if maxTokens < 16 {
		return maxTokens
	}
	return 16
}

// AITestHandler sends one tiny probe message through the configured
// provider so the admin can verify base URL / key / model before saving
// it for the whole panel. POST {"target":"fallback"} probes the fallback
// triple instead. The probe accepts optional unsaved-form overrides
// (base_url/api_key/model_id/ollama_mode): when present they replace the
// stored values for this probe only, so "Test connection" checks what the
// admin just typed instead of what is already saved. Blank api_key (""
// or "*") keeps the stored secret. Never logs or returns any key.
func AITestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var tReq struct {
		Target     string  `json:"target"`
		BaseURL    *string `json:"base_url"`
		APIKey     *string `json:"api_key"`
		ModelID    *string `json:"model_id"`
		OllamaMode *bool   `json:"ollama_mode"`
	}
	_ = json.NewDecoder(r.Body).Decode(&tReq)
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	cfg, err := repository.NewAIConfigRepository(con).Get()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if strings.TrimSpace(tReq.Target) == "fallback" {
		if !cfg.FallbackConfigured() && tReq.BaseURL == nil && tReq.ModelID == nil {
			writeJSONStatus(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "fallback provider is not configured"})
			return
		}
		fb := *cfg
		fb.BaseURL, fb.APIKey, fb.ModelID, fb.OllamaMode =
			cfg.FallbackBaseURL, cfg.FallbackAPIKey, cfg.FallbackModelID, cfg.FallbackOllamaMode
		cfg = &fb
	}
	// Overlay any unsaved-form values supplied by the caller. Pointers
	// distinguish "field absent" (keep stored) from "field present".
	if tReq.BaseURL != nil {
		cfg.BaseURL = strings.TrimRight(strings.TrimSpace(*tReq.BaseURL), "/")
	}
	if tReq.ModelID != nil {
		cfg.ModelID = strings.TrimSpace(*tReq.ModelID)
	}
	if tReq.APIKey != nil && *tReq.APIKey != "" && *tReq.APIKey != "*" {
		cfg.APIKey = *tReq.APIKey
	}
	if tReq.OllamaMode != nil {
		cfg.OllamaMode = *tReq.OllamaMode
	}
	if v := strings.TrimSpace(cfg.BaseURL); v != "" && !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
		writeJSONStatus(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "base_url must start with http:// or https://"})
		return
	}
	if strings.TrimSpace(cfg.BaseURL) == "" || strings.TrimSpace(cfg.ModelID) == "" {
		writeJSONStatus(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "base URL and model ID are required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	// Probe on a value copy bounded to 16 tokens without ever exceeding
	// the admin's configured MaxTokens (probe := cfg would alias the
	// pointer, making the min() branch dead and mutating cfg).
	probe := *cfg
	probe.MaxTokens = aiProbeTokens(cfg.MaxTokens)
	content, _, _, err := aiProviderChat(ctx, &probe, []aiMsg{
		{Role: "system", Content: "You are a connectivity probe. Reply with exactly: ok"},
		{Role: "user", Content: "ping"},
	}, nil)
	if err != nil {
		writeJSON(w, map[string]any{"ok": false, "error": aiCap(err.Error(), 500)})
		return
	}
	writeJSON(w, map[string]any{"ok": true, "model": cfg.ModelID, "reply": aiCap(content, 500)})
}

// ---------------------------------------------------------------------------
// Chat endpoint.
// ---------------------------------------------------------------------------

type aiChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type aiChatRequest struct {
	Messages        []aiChatMessage `json:"messages"`
	ApproveTicketID string          `json:"approve_ticket_id"`
	// ThreadID binds the turn to a persisted thread: the server prepends
	// the thread's last 50 messages and persists the new turns. The client
	// then sends only the new turn(s) in Messages.
	ThreadID *int64 `json:"thread_id"`
	// Model is a per-request override honoured for admins (SETTINGS_EDIT)
	// only; everyone else's value is ignored.
	Model string `json:"model"`
}

// aiModelOverride returns the per-request model when the caller holds
// SETTINGS_EDIT; anyone else's "model" field is silently ignored so a
// narrowed role can never steer the panel at a pricier model.
func aiModelOverride(checker *permissions.Checker, uid int64, raw string) string {
	m := strings.TrimSpace(raw)
	if m == "" || len(m) > 256 {
		return ""
	}
	if err := checker.Ensure(uid, permissions.SettingsEditKey); err != nil {
		return ""
	}
	return m
}

// aiThreadTitle derives a thread title from the first user turn.
func aiThreadTitle(s string) string {
	s = strings.Join(strings.Fields(strings.TrimSpace(s)), " ")
	if s == "" {
		return "New chat"
	}
	if len(s) > 60 {
		s = s[:60] + "…"
	}
	return s
}

// AIChatHandler runs the assistant loop. Two modes:
//  1. approve_ticket_id set → execute that confirmation ticket (write path).
//  2. messages set → LLM loop with read tools + write-ticket proposals.
func AIChatHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	checker := permissions.NewChecker(con)
	// Chat entry: umbrella or Q&A / Tools / Writes (threads-only holders
	// manage history via /threads but cannot send new turns).
	if err := checker.EnsureAny(uid, permissions.AIChatUseKey, permissions.AIChatQAKey, permissions.AIChatToolsKey, permissions.AIChatWritesKey); err != nil {
		http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
		return
	}
	if !aiChatLimiter.allow(uid) {
		aiWriteRateLimit(w)
		return
	}

	var req aiChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}

	username, role, _ := resolvedActor(r)
	perms, _ := checker.ListUserPermissions(uid)
	actx := &aiCallCtx{con: con, uid: uid, username: username, role: role, perms: perms, checker: checker, r: r}

	// Mode 1: approve a pending write ticket.
	if strings.TrimSpace(req.ApproveTicketID) != "" {
		if err := checker.EnsureAICapability(uid, permissions.AIChatWritesKey); err != nil {
			http.Error(w, "your role cannot approve AI write actions (needs AI Chat Writes)", http.StatusForbidden)
			return
		}
		t, ok := aiTakeTicket(con, strings.TrimSpace(req.ApproveTicketID), uid)
		if !ok {
			http.Error(w, "confirmation ticket is unknown, expired or belongs to someone else", http.StatusGone)
			return
		}
		cfg, err := repository.NewAIConfigRepository(con).Get()
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		// Fail closed: an approval must not execute when the admin has
		// since disabled the assistant or its writes kill-switch.
		if !cfg.Enabled || !cfg.AllowWrites {
			http.Error(w, "AI writes are currently disabled by the administrator", http.StatusForbidden)
			return
		}
		actx.cfg = cfg
		var args map[string]any
		if err := json.Unmarshal(t.Args, &args); err != nil {
			http.Error(w, "confirmation ticket is corrupt", http.StatusBadRequest)
			return
		}
		result, err := aiExecuteWrite(actx, t.Tool, args)
		if err != nil {
			aiThreadPersist(uid, req.ThreadID, nil, "The approved action failed: "+aiCap(err.Error(), 800))
			writeJSON(w, map[string]any{
				"reply":    "The approved action failed: " + aiCap(err.Error(), 800),
				"executed": map[string]any{"tool": t.Tool, "summary": t.Summary, "ok": false, "error": aiCap(err.Error(), 800)},
			})
			return
		}
		aiThreadPersist(uid, req.ThreadID, nil, "Done — "+t.Summary+"\n\n"+aiCap(result, 1500))
		writeJSON(w, map[string]any{
			"reply":    "Done — " + t.Summary + "\n\n" + aiCap(result, 1500),
			"executed": map[string]any{"tool": t.Tool, "summary": t.Summary, "ok": true, "result": aiCap(result, 1500)},
		})
		return
	}

	// Mode 2: chat loop.
	model := aiModelOverride(checker, uid, req.Model)
	threadRepo := repository.NewAIThreadRepository(con)
	var threadID int64
	var stored []repository.AIMessage
	if req.ThreadID != nil && *req.ThreadID != 0 {
		th, err := threadRepo.Owned(uid, *req.ThreadID)
		if err != nil {
			http.Error(w, "chat thread not found", http.StatusNotFound)
			return
		}
		threadID = th.ID
		stored, err = threadRepo.LastMessages(uid, threadID, 50)
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
	}

	// Bound thread: history is the persisted window plus the client's new
	// turns (cap 10). Unbound: legacy client-supplied history (cap 20).
	maxClient := 20
	if threadID != 0 {
		maxClient = 10
	}
	if len(req.Messages) == 0 || len(req.Messages) > maxClient {
		http.Error(w, fmt.Sprintf("1 to %d messages are required", maxClient), http.StatusBadRequest)
		return
	}
	var newUserTurns []string
	history := make([]aiMsg, 0, len(stored)+len(req.Messages))
	for _, m := range stored {
		history = append(history, aiMsg{Role: m.Role, Content: m.Content})
	}
	for _, m := range req.Messages {
		role := strings.ToLower(strings.TrimSpace(m.Role))
		if role != "user" && role != "assistant" {
			http.Error(w, "message role must be user or assistant", http.StatusBadRequest)
			return
		}
		content := aiCap(strings.TrimSpace(m.Content), 4000)
		if content == "" {
			continue
		}
		history = append(history, aiMsg{Role: role, Content: content})
		if role == "user" {
			newUserTurns = append(newUserTurns, content)
		}
	}
	if len(history) == 0 {
		http.Error(w, "messages are required", http.StatusBadRequest)
		return
	}

	cfg, err := repository.NewAIConfigRepository(con).Get()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if !cfg.Enabled {
		writeJSONStatus(w, http.StatusServiceUnavailable, map[string]any{"error": "the AI assistant is disabled by the administrator"})
		return
	}
	if strings.TrimSpace(cfg.BaseURL) == "" || strings.TrimSpace(cfg.ModelID) == "" {
		writeJSONStatus(w, http.StatusServiceUnavailable, map[string]any{"error": "the AI assistant is not configured yet"})
		return
	}
	actx.cfg = cfg

	ctx, cancel := context.WithTimeout(r.Context(), 110*time.Second)
	defer cancel()

	sysPrompt, err := aiBuildSystemPrompt(con, cfg, uid, username, role, perms)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	msgs := append([]aiMsg{{Role: "system", Content: sysPrompt}}, history...)

	var acc aiUsageAcc
	reply, ticket, err := aiRunChatLoop(ctx, actx, cfg, model, msgs, &acc)
	if err != nil {
		// Surface provider rate limits as 429 (with Retry-After) so the
		// chat UI can offer auto-retry instead of a dead-end 502.
		if aiIsRateLimitErr(err) {
			ra := aiRetryAfterSecs(err)
			if ra <= 0 {
				ra = 60
			}
			w.Header().Set("Retry-After", strconv.Itoa(ra))
			writeJSONStatus(w, http.StatusTooManyRequests, map[string]any{
				"error": "AI provider error: " + aiCap(err.Error(), 500),
				"code":  "rate_limited", "retry_after": ra,
			})
			return
		}
		writeJSONStatus(w, http.StatusBadGateway, map[string]any{"error": "AI provider error: " + aiCap(err.Error(), 500)})
		return
	}
	aiLogUsage(r, cfg, acc)
	if ticket != nil {
		if err := aiStoreTicket(con, &aiTicket{
			ID: ticket.ID, UserID: uid, Tool: ticket.Tool, Args: ticket.Args,
			Summary: ticket.Summary, Diff: ticket.Diff, Expires: time.Now().Add(10 * time.Minute),
		}); err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		aiThreadPersist(uid, req.ThreadID, newUserTurns, reply)
		writeJSON(w, map[string]any{
			"reply": reply,
			"confirmation_ticket": map[string]any{
				"id": ticket.ID, "tool": ticket.Tool,
				"summary": ticket.Summary, "diff": ticket.Diff,
			},
			"thread_id": threadID,
		})
		return
	}
	aiThreadPersist(uid, req.ThreadID, newUserTurns, reply)
	writeJSON(w, map[string]any{"reply": reply, "thread_id": threadID})
}

// aiBuildHistory merges persisted thread context with the client's new
// turns. maxClient bounds abuse (bound threads: 10 new turns; unbound
// legacy history: 20). Every turn is capped at 4000 chars. It also
// returns the new user turns for thread persistence.
func aiBuildHistory(stored []repository.AIMessage, clientMsgs []aiChatMessage, maxClient int) (history []aiMsg, newUserTurns []string, err error) {
	if len(clientMsgs) == 0 || len(clientMsgs) > maxClient {
		return nil, nil, fmt.Errorf("1 to %d messages are required", maxClient)
	}
	history = make([]aiMsg, 0, len(stored)+len(clientMsgs))
	for _, m := range stored {
		history = append(history, aiMsg{Role: m.Role, Content: m.Content})
	}
	for _, m := range clientMsgs {
		role := strings.ToLower(strings.TrimSpace(m.Role))
		if role != "user" && role != "assistant" {
			return nil, nil, fmt.Errorf("message role must be user or assistant")
		}
		content := aiCap(strings.TrimSpace(m.Content), 4000)
		if content == "" {
			continue
		}
		history = append(history, aiMsg{Role: role, Content: content})
		if role == "user" {
			newUserTurns = append(newUserTurns, content)
		}
	}
	if len(history) == 0 {
		return nil, nil, fmt.Errorf("messages are required")
	}
	return history, newUserTurns, nil
}

// aiThreadPersist appends the new user turns + the assistant reply to a
// bound thread (no-op when threadID is nil/zero). Failures are logged, not
// fatal: history loss must never break a chat reply.
func aiThreadPersist(uid int64, threadID *int64, userTurns []string, assistantReply string) {
	if threadID == nil || *threadID == 0 {
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("ai thread persist: open db:", err)
		return
	}
	defer con.Close()
	repo := repository.NewAIThreadRepository(con)
	if _, err := repo.Owned(uid, *threadID); err != nil {
		return
	}
	stored, _ := repo.LastMessages(uid, *threadID, 1)
	if len(stored) == 0 && len(userTurns) > 0 {
		_ = repo.Rename(uid, *threadID, aiThreadTitle(userTurns[0]))
	}
	for _, u := range userTurns {
		_ = repo.AddMessage(uid, *threadID, "user", u)
	}
	if strings.TrimSpace(assistantReply) != "" {
		_ = repo.AddMessage(uid, *threadID, "assistant", assistantReply)
	}
}

// aiRunChatLoop runs the 5-round tool loop used by the JSON chat endpoint.
// It returns the final reply text, or a write-ticket proposal (with tool +
// raw args attached) when the model requested a write.
func aiRunChatLoop(ctx context.Context, actx *aiCallCtx, cfg *repository.AIConfig, model string, msgs []aiMsg, acc *aiUsageAcc) (string, *aiTicket, error) {
	_, canRead, canWrite := aiCaps(actx.checker, actx.uid)
	defs := aiToolDefsForCaps(canRead, canWrite)
	var lastText string
	for loop := 0; loop < 5; loop++ {
		if ctx.Err() != nil {
			return lastText, nil, ctx.Err()
		}
		// Per-round deadline from the client connection (not the shared
		// outer ctx): round 1 consuming 40s must not starve rounds 2-5
		// into spurious ctx.Err. The outer ctx still gates the total via
		// the check above; the server WriteTimeout (120s) caps the worst
		// case. Client disconnect cancels both (r.Context parent).
		roundCtx, roundCancel := context.WithTimeout(actx.r.Context(), 50*time.Second)
		text, calls, usage, err := aiProviderChatWithFallback(roundCtx, cfg, model, msgs, defs)
		roundCancel()
		acc.add(usage)
		if err != nil {
			if lastText != "" {
				return lastText + "\n\n(provider error on follow-up: " + aiCap(err.Error(), 300) + ")", nil, nil
			}
			return "", nil, err
		}
		if len(calls) == 0 {
			if strings.TrimSpace(text) == "" {
				text = "I couldn't produce an answer for that. Try rephrasing?"
			}
			return text, nil, nil
		}
		lastText = text
		// Echo the assistant turn (with its tool calls) back into history
		// so the provider keeps the full tool transcript.
		msgs = append(msgs, aiMsg{Role: "assistant", Content: text, ToolCalls: calls})
		for _, c := range calls {
			result, proposal, err := aiRunTool(actx, c.Name, c.Args)
			if err != nil {
				msgs = append(msgs, aiMsg{Role: "tool", ToolCallID: c.ID, Name: c.Name, Content: "error: " + aiCap(err.Error(), 1000)})
				continue
			}
			if proposal != nil {
				reply := strings.TrimSpace(text)
				if reply == "" {
					reply = "I need your approval before I do that:"
				}
				return reply, &aiTicket{
					ID: proposal.ID, Tool: c.Name, Args: c.RawArgs,
					Summary: proposal.Summary, Diff: proposal.Diff,
				}, nil
			}
			msgs = append(msgs, aiMsg{Role: "tool", ToolCallID: c.ID, Name: c.Name, Content: aiCap(result, 4000)})
		}
	}
	if strings.TrimSpace(lastText) == "" {
		lastText = "I ran out of tool rounds before finishing. Try asking for something smaller?"
	}
	return lastText + "\n\n(Stopped after 5 tool rounds.)", nil, nil
}

// ---------------------------------------------------------------------------
// System prompt (built server-side per request).
// ---------------------------------------------------------------------------

func aiBuildSystemPrompt(con *sql.DB, cfg *repository.AIConfig, uid int64, username, role string, perms []string) (string, error) {
	panelName := repository.DefaultPanelName
	if sr := repository.NewSettingsRepository(con); sr != nil {
		if n, err := sr.GetPanelName(); err == nil && n != "" {
			panelName = n
		}
	}
	hosting := strings.TrimSpace(cfg.HostingName)
	if hosting == "" {
		hosting = panelName
	}
	var b strings.Builder
	b.WriteString("You are " + panelName + " Assistant for " + hosting + ".")
	if strings.TrimSpace(cfg.HostingAbout) != "" {
		b.WriteString(" About this hosting: " + strings.TrimSpace(cfg.HostingAbout))
	}
	b.WriteString("\n\nPanel knowledge: this panel manages game servers and app workloads. Architecture: a central Panel plus Edge agents (ksedge) on each node. Instances are deployed from Templates (blueprints for docker, lxd, kvm or multipass drivers) onto Nodes (edge machines). Mods extend the panel, Applications are user-installable services, Tickets are support requests. You can inspect the fleet with your tools; you know instance, node and template IDs only from tool output.")
	b.WriteString("\n\nLive context: the user is " + strconv.Quote(username) + " (role " + strconv.Quote(role) + ") with permissions [" + strings.Join(perms, ", ") + "].")
	var instN, nodeN, tmplN int64
	_ = con.QueryRow(`SELECT COUNT(*) FROM instances`).Scan(&instN)
	_ = con.QueryRow(`SELECT COUNT(*) FROM nodes`).Scan(&nodeN)
	_ = con.QueryRow(`SELECT COUNT(*) FROM templates`).Scan(&tmplN)
	fmt.Fprintf(&b, " Fleet counts: %d instances, %d nodes, %d templates (counts only — no rows are preloaded).", instN, nodeN, tmplN)
	b.WriteString("\n\nRules: only use the tools you were given; call a list tool before acting on any named resource; never invent IDs — if the user names something, look it up first (list_instances/list_nodes/list_templates/list_instance_pages/list_users/list_themes/list_tickets/list_roles, then get_* for details; check_panel_update before any panel reinstall); keep answers short. Act, don't interrogate: when the user names a template workflow step or action, read get_template (section=steps for install steps, section=runtime for startup command + action buttons) and propose the edit — never ask them to paste the workflow or dictate exact text. Template edits: install-workflow changes use edit_template_steps; startup-command changes use set_template_command; action-button removal uses remove_template_action; description text changes read section=description first and use edit_template. Autostart pattern: gate the new command on files the install workflow guarantees (e.g. server.jar), never on a deleted sentinel; warn that the panel still stops the container once right after install (by design) and every later container start then launches the service. Tickets: staff sees all, others own/assigned; only staff triages or posts internal notes. Write tools (instance_action, edit_instance, reinstall_instance, delete_instance, suspend_instance, unsuspend_instance, update_settings, create_theme, edit_theme, delete_theme, create_template, edit_template, delete_template, edit_template_steps, set_template_command, remove_template_action, create_node, edit_node, delete_node, create_instance_page, edit_instance_page, delete_instance_page, create_user, edit_user, delete_user, create_ticket, reply_ticket, update_ticket, broadcast_notification, deploy_instance, reinstall_panel) do NOT execute immediately: calling one returns a confirmation ticket that the user must approve in the UI. After calling a write tool, briefly summarise what will happen and ask the user to approve it in the confirmation card. Every write re-checks the caller's area permission (instances/templates/nodes/pages/themes/users/tickets/notifications/panel-update) plus the AI Chat Writes grant — if either is missing, explain which permission an admin must grant. reinstall_panel restarts the whole panel (brief downtime, the chat disconnects) — always run check_panel_update first and warn about the restart.")
	// Capability line so the model respects the caller's AI Chat sub-perms.
	if actxChecker, actxUID, ok := aiPromptCaps(con, uid); ok {
		_, canRead, canWrite := aiCaps(actxChecker, actxUID)
		b.WriteString("\n\nCapability: " + aiCapabilityNote(true, canRead, canWrite, cfg.AllowWrites))
	}
	if strings.TrimSpace(cfg.SystemExtra) != "" {
		b.WriteString("\n\nAdministrator instructions: " + strings.TrimSpace(cfg.SystemExtra))
	}
	return b.String(), nil
}

// aiPromptCaps re-opens the caller's checker for the system-prompt path.
// aiBuildSystemPrompt only receives con+uid, so it builds a short-lived
// checker here; failures fall back to full tools (fail open matches the
// legacy umbrella behaviour for seeded roles).
func aiPromptCaps(con *sql.DB, uid int64) (*permissions.Checker, int64, bool) {
	if con == nil {
		return nil, uid, false
	}
	return permissions.NewChecker(con), uid, true
}

// ---------------------------------------------------------------------------
// Provider client: one client, two modes.
// OpenAI-compatible: POST {base_url}/chat/completions
// Ollama:           POST {base_url}/api/chat  (ollama_mode=true)
// ---------------------------------------------------------------------------

type aiMsg struct {
	Role      string       `json:"role"`
	Content   string       `json:"content"`
	ToolCallID string      `json:"tool_call_id,omitempty"`
	Name      string       `json:"name,omitempty"`
	ToolCalls []aiToolCall `json:"tool_calls,omitempty"`
}

type aiToolCall struct {
	ID      string         `json:"id"`
	Name    string         `json:"name"`
	Args    map[string]any `json:"args"`
	RawArgs json.RawMessage `json:"-"`
}

type aiToolDef struct {
	Type     string     `json:"type"`
	Function aiFuncDef  `json:"function"`
}

type aiFuncDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

func aiStrProp(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
func aiIntProp(desc string) map[string]any { return map[string]any{"type": "integer", "description": desc} }

func aiToolDefs() []aiToolDef {
	obj := func(props map[string]any, req ...string) map[string]any {
		return map[string]any{"type": "object", "properties": props, "required": req}
	}
	mk := func(name, desc string, params map[string]any) aiToolDef {
		return aiToolDef{Type: "function", Function: aiFuncDef{Name: name, Description: desc, Parameters: params}}
	}
	return []aiToolDef{
		mk("list_instances", "List instances on the panel (id, name, kind, status, node). Respects the caller's ownership scope.", obj(map[string]any{
			"limit": aiIntProp("max rows, default 20, max 50"),
		})),
		mk("get_instance", "Get one instance by id (safe fields only, secrets redacted).", obj(map[string]any{
			"instance_id": aiIntProp("instance id from list_instances — never guess"),
		}, "instance_id")),
		mk("list_nodes", "List edge nodes (id, name, address). No tokens are ever exposed.", obj(map[string]any{
			"limit": aiIntProp("max rows, default 20, max 50"),
		})),
		mk("list_templates", "List deployment templates (id, name, kind, description).", obj(map[string]any{
			"limit": aiIntProp("max rows, default 20, max 50"),
		})),
		mk("get_node", "Get one edge node by id (name, address, status — tokens are never exposed).", obj(map[string]any{
			"node_id": aiIntProp("node id from list_nodes — never guess"),
		}, "node_id")),
		mk("get_template", "Get one deployment template by id (fields, description, numbered install-workflow steps, startup command + action buttons).", obj(map[string]any{
			"template_id": aiIntProp("template id from list_templates — never guess"),
			"section":     aiStrProp("one of: all (default), summary, steps, runtime, description. Steps for workflow edits, runtime for startup-command/action-button edits, description for text edits."),
		}, "template_id")),
		mk("list_instance_pages", "List reusable instance pages (id, name, slug, description).", obj(map[string]any{
			"limit": aiIntProp("max rows, default 20, max 50"),
		})),
		mk("get_instance_page", "Get one instance page by id (name, slug, description, content type).", obj(map[string]any{
			"page_id": aiIntProp("page id from list_instance_pages — never guess"),
		}, "page_id")),
		mk("check_panel_update", "Check whether a newer panel release is available (local vs remote version). Read-only, no download.", obj(map[string]any{})),
		mk("list_users", "List user accounts (id, username, email, role). Own-scope callers see only themselves.", obj(map[string]any{
			"limit": aiIntProp("max rows, default 20, max 50"),
		})),
		mk("get_user", "Get one user by id (never includes password data).", obj(map[string]any{
			"user_id": aiIntProp("user id from list_users — never guess"),
		}, "user_id")),
		mk("list_roles", "List roles (id, name) for account admin — use the exact name in create_user/edit_user.", obj(map[string]any{})),
		mk("list_themes", "List global themes (id, name, description).", obj(map[string]any{
			"limit": aiIntProp("max rows, default 20, max 50"),
		})),
		mk("list_tickets", "List support tickets (staff sees all, others see own/assigned).", obj(map[string]any{
			"limit":  aiIntProp("max rows, default 20, max 50"),
			"status": aiStrProp("optional filter: open, pending, in_progress, resolved, closed"),
		})),
		mk("get_ticket", "Get one ticket with its comments (staff sees all incl. internal notes, others see own/assigned).", obj(map[string]any{
			"ticket_id": aiIntProp("ticket id from list_tickets — never guess"),
		}, "ticket_id")),
		mk("get_docs", "Read the built-in panel documentation for a topic.", obj(map[string]any{
			"topic": aiStrProp("one of: index, instances, templates, nodes, instance_pages, users, mods, applications, tickets, backups, security, database, automation, sftp, updates, themes, notifications, ai. Default index."),
		})),
		mk("get_system_status", "Fleet counts only (instances, nodes, templates, instances by status). No sensitive data.", obj(map[string]any{})),
		mk("instance_action", "APPROVAL REQUIRED: start, stop or restart an instance on its edge node.", obj(map[string]any{
			"instance_id": aiIntProp("instance id from list_instances — never guess"),
			"action":      aiStrProp("one of: start, stop, restart"),
		}, "instance_id", "action")),
		mk("update_settings", "APPROVAL REQUIRED: change panel branding (panel_name, hosting_name, hosting_about only).", obj(map[string]any{
			"panel_name":   aiStrProp("new panel brand name"),
			"hosting_name": aiStrProp("hosting brand shown in the assistant identity"),
			"hosting_about": aiStrProp("short about-us blurb"),
		})),
		mk("create_theme", "APPROVAL REQUIRED: publish a new global theme.", obj(map[string]any{
			"name":        aiStrProp("theme name (required)"),
			"description": aiStrProp("short description"),
			"spec":        aiStrProp("theme spec as a JSON object string; default {}"),
		}, "name")),
		mk("create_template", "APPROVAL REQUIRED: create a deployment template (docker, lxd, kvm or multipass).", obj(map[string]any{
			"name":        aiStrProp("template name (required)"),
			"kind":        aiStrProp("one of: docker, lxd, kvm, multipass (required)"),
			"description": aiStrProp("short description"),
			"image":       aiStrProp("container image / os image"),
			"spec":        aiStrProp("template spec as a JSON object string; default {}"),
		}, "name", "kind")),
		mk("create_instance_page", "APPROVAL REQUIRED: create a reusable instance page (docs/dashboard/config UI).", obj(map[string]any{
			"name":             aiStrProp("page name (required)"),
			"slug":             aiStrProp("url slug; auto-derived from name when omitted"),
			"description":      aiStrProp("short description"),
			"content_markdown": aiStrProp("markdown body (preferred for docs pages)"),
			"content_html":     aiStrProp("raw HTML body (alternative to markdown)"),
		}, "name")),
		mk("create_user", "APPROVAL REQUIRED: create a user account.", obj(map[string]any{
			"username": aiStrProp("login name (required)"),
			"email":    aiStrProp("email address (required)"),
			"password": aiStrProp("initial password, must satisfy the panel password policy (required)"),
			"role":     aiStrProp("role name, default user"),
		}, "username", "email", "password")),
		mk("deploy_instance", "APPROVAL REQUIRED: deploy a new instance from a template onto a node, using the template defaults.", obj(map[string]any{
			"name":        aiStrProp("instance name 1-63 chars [a-zA-Z0-9_-] (required)"),
			"node_id":     aiIntProp("node id from list_nodes — never guess"),
			"template_id": aiIntProp("template id from list_templates — never guess"),
		}, "name", "node_id", "template_id")),
		mk("edit_instance", "APPROVAL REQUIRED: rename an instance's display name (human label only — the edge workload name never changes).", obj(map[string]any{
			"instance_id":  aiIntProp("instance id from list_instances — never guess"),
			"display_name": aiStrProp("new display name, max 128 chars (required)"),
		}, "instance_id", "display_name")),
		mk("reinstall_instance", "APPROVAL REQUIRED: wipe an instance's edge workload and redeploy it from its stored spec (ALL data inside is lost, install workflow re-runs).", obj(map[string]any{
			"instance_id": aiIntProp("instance id from list_instances — never guess"),
		}, "instance_id")),
		mk("delete_instance", "APPROVAL REQUIRED: destroy an instance's edge workload and delete the panel row (irreversible).", obj(map[string]any{
			"instance_id": aiIntProp("instance id from list_instances — never guess"),
		}, "instance_id")),
		mk("suspend_instance", "APPROVAL REQUIRED: suspend an instance with a moderation reason (blocks start/reinstall until unsuspended).", obj(map[string]any{
			"instance_id":    aiIntProp("instance id from list_instances — never guess"),
			"reason":         aiStrProp("suspension reason (required)"),
			"duration_hours": aiIntProp("auto-unsuspend after N hours; omit for indefinite"),
		}, "instance_id", "reason")),
		mk("unsuspend_instance", "APPROVAL REQUIRED: lift a suspension so the instance can run again.", obj(map[string]any{
			"instance_id": aiIntProp("instance id from list_instances — never guess"),
		}, "instance_id")),
		mk("edit_template", "APPROVAL REQUIRED: edit a deployment template (name, description, image and/or spec JSON).", obj(map[string]any{
			"template_id": aiIntProp("template id from list_templates — never guess"),
			"name":        aiStrProp("new template name"),
			"description": aiStrProp("new short description"),
			"image":       aiStrProp("new container / os image"),
			"spec":        aiStrProp("new template spec as a JSON object string"),
		}, "template_id")),
		mk("delete_template", "APPROVAL REQUIRED: delete a deployment template (running instances keep running, they just lose the back-link).", obj(map[string]any{
			"template_id": aiIntProp("template id from list_templates — never guess"),
		}, "template_id")),
		mk("edit_template_steps", "APPROVAL REQUIRED: surgically edit a template's install workflow (op remove/add/move) without rewriting the whole spec. Read get_template section=steps first for 1-based numbers.", obj(map[string]any{
			"template_id": aiIntProp("template id from list_templates — never guess"),
			"op":          aiStrProp("one of: remove, add, move (required)"),
			"step_number": aiIntProp("1-based step number from get_template (required for remove/move)"),
			"position":    aiIntProp("1-based insert position for add/move; omit to append"),
			"step":        aiStrProp(`new step as a JSON object string for add (required), e.g. {"action":"shell","command":"echo hi"}`),
		}, "template_id", "op")),
		mk("set_template_command", "APPROVAL REQUIRED: set a template's container startup command (exec-form JSON array). Use this to auto-start a service when the container starts. Read get_template section=runtime first.", obj(map[string]any{
			"template_id": aiIntProp("template id from list_templates — never guess"),
			"command":     aiStrProp(`startup command as a JSON array string (required), e.g. ["sh","-c","cd /mc && exec java -jar server.jar"]`),
		}, "template_id", "command")),
		mk("remove_template_action", "APPROVAL REQUIRED: remove an action button (by id) from a template, e.g. dropping a manual Start button once the service autostarts. Read get_template section=runtime first for ids.", obj(map[string]any{
			"template_id": aiIntProp("template id from list_templates — never guess"),
			"action_id":   aiStrProp("action id from get_template runtime (required) — never guess"),
		}, "template_id", "action_id")),
		mk("create_node", "APPROVAL REQUIRED: register a new edge node (direct address dial). The edge token is returned once — tell the user to save it.", obj(map[string]any{
			"name":    aiStrProp("node name (required)"),
			"address": aiStrProp("dial address host:port, e.g. 10.0.0.5:8443 (required)"),
		}, "name", "address")),
		mk("edit_node", "APPROVAL REQUIRED: rename / re-address an edge node.", obj(map[string]any{
			"node_id": aiIntProp("node id from list_nodes — never guess"),
			"name":    aiStrProp("new node name"),
			"address": aiStrProp("new dial address host:port"),
		}, "node_id")),
		mk("delete_node", "APPROVAL REQUIRED: delete an edge node (refused while instances still live on it).", obj(map[string]any{
			"node_id": aiIntProp("node id from list_nodes — never guess"),
		}, "node_id")),
		mk("edit_instance_page", "APPROVAL REQUIRED: edit a reusable instance page (name, description and/or markdown/html body).", obj(map[string]any{
			"page_id":          aiIntProp("page id from list_instance_pages — never guess"),
			"name":             aiStrProp("new page name"),
			"description":      aiStrProp("new short description"),
			"content_markdown": aiStrProp("new markdown body"),
			"content_html":     aiStrProp("new raw HTML body"),
		}, "page_id")),
		mk("delete_instance_page", "APPROVAL REQUIRED: delete a reusable instance page (irreversible).", obj(map[string]any{
			"page_id": aiIntProp("page id from list_instance_pages — never guess"),
		}, "page_id")),
		mk("reinstall_panel", "APPROVAL REQUIRED: reinstall the panel itself to the latest release binary (same flow as System → Reinstall). The panel restarts — brief downtime, chat disconnects.", obj(map[string]any{})),
		mk("edit_user", "APPROVAL REQUIRED: edit a user account (username, email and/or role by name). Password resets stay on the Users page.", obj(map[string]any{
			"user_id":  aiIntProp("user id from list_users — never guess"),
			"username": aiStrProp("new login name"),
			"email":    aiStrProp("new email address"),
			"role":     aiStrProp("new role name from list_roles"),
		}, "user_id")),
		mk("delete_user", "APPROVAL REQUIRED: delete a user account (irreversible, cannot delete yourself).", obj(map[string]any{
			"user_id": aiIntProp("user id from list_users — never guess"),
		}, "user_id")),
		mk("edit_theme", "APPROVAL REQUIRED: edit a global theme (name, description and/or spec JSON). A revision snapshot is kept automatically.", obj(map[string]any{
			"theme_id":    aiStrProp("theme id from list_themes — never guess"),
			"name":        aiStrProp("new theme name"),
			"description": aiStrProp("new short description"),
			"spec":        aiStrProp("new theme spec as a JSON object string"),
		}, "theme_id")),
		mk("delete_theme", "APPROVAL REQUIRED: delete a global theme (pages using it fall back to default).", obj(map[string]any{
			"theme_id": aiStrProp("theme id from list_themes — never guess"),
		}, "theme_id")),
		mk("create_ticket", "APPROVAL REQUIRED: open a support ticket for the caller.", obj(map[string]any{
			"subject":     aiStrProp("short subject, max 200 chars (required)"),
			"description": aiStrProp("full details"),
			"category":    aiStrProp("one of: general, billing, technical, feature, bug, abuse, other (default general)"),
			"priority":    aiStrProp("one of: low, medium, high, urgent, critical (default medium)"),
		}, "subject")),
		mk("reply_ticket", "APPROVAL REQUIRED: reply to a ticket thread (staff see any ticket, others own/assigned; closed tickets refuse).", obj(map[string]any{
			"ticket_id": aiIntProp("ticket id from list_tickets — never guess"),
			"message":   aiStrProp("reply body (required)"),
			"internal":  aiStrProp("set to 'true' for a staff-only note (staff only, hidden from reporter)"),
		}, "ticket_id", "message")),
		mk("update_ticket", "APPROVAL REQUIRED: triage a ticket (status/priority/assignee for staff; owners may edit subject/description/category only).", obj(map[string]any{
			"ticket_id":   aiIntProp("ticket id from list_tickets — never guess"),
			"status":      aiStrProp("staff only, one of: open, pending, in_progress, resolved, closed"),
			"priority":    aiStrProp("staff only for high/urgent/critical, one of: low, medium, high, urgent, critical"),
			"assigned_to": aiStrProp("staff only: username or id to assign (empty clears)"),
			"subject":     aiStrProp("new subject"),
			"description": aiStrProp("new description"),
			"category":    aiStrProp("one of: general, billing, technical, feature, bug, abuse, other"),
		}, "ticket_id")),
		mk("broadcast_notification", "APPROVAL REQUIRED: send an announcement notification to every user (shows in their inbox + realtime push).", obj(map[string]any{
			"title":   aiStrProp("announcement title (required)"),
			"message": aiStrProp("announcement body (required)"),
		}, "title", "message")),
	}
}

func aiCap(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// aiUsage carries per-round token counts for the usage/cost audit log.
// OpenAI reports usage.{prompt,completion,total}_tokens; Ollama reports
// prompt_eval_count / eval_count on the final chunk.
type aiUsage struct {
	Model    string
	Provider string // "primary" | "fallback" — set by the caller
	In       int
	Out      int
	Total    int
}

// aiProviderChat sends one non-streaming chat round and returns the reply
// text, any tool calls the model requested, and the round's token usage.
func aiProviderChat(ctx context.Context, cfg *repository.AIConfig, msgs []aiMsg, tools []aiToolDef) (string, []aiToolCall, aiUsage, error) {
	base := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	client := &http.Client{Timeout: 50 * time.Second}
	usage := aiUsage{Model: cfg.ModelID}
	if cfg.OllamaMode {
		body := map[string]any{
			"model":   cfg.ModelID,
			"messages": aiWireMessages(msgs, false),
			"stream":  false,
			"options": map[string]any{"temperature": cfg.Temperature, "num_predict": cfg.MaxTokens},
		}
		if len(tools) > 0 {
			body["tools"] = tools
		}
		var out struct {
			Message struct {
				Content   string `json:"content"`
				ToolCalls []struct {
					ID       string          `json:"id"`
					Function struct {
						Name      string          `json:"name"`
						Arguments json.RawMessage `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
			PromptEvalCount int    `json:"prompt_eval_count"`
			EvalCount       int    `json:"eval_count"`
			Error           string `json:"error"`
		}
		if err := aiPostJSON(ctx, client, base+"/api/chat", cfg.APIKey, body, &out); err != nil {
			return "", nil, usage, err
		}
		if out.Error != "" {
			return "", nil, usage, fmt.Errorf("%s", out.Error)
		}
		usage.In, usage.Out = out.PromptEvalCount, out.EvalCount
		usage.Total = usage.In + usage.Out
		tcRaw, _ := json.Marshal(out.Message.ToolCalls)
		return out.Message.Content, aiParseCalls(tcRaw), usage, nil
	}
	body := map[string]any{
		"model":       cfg.ModelID,
		"messages":    aiWireMessages(msgs, true),
		"temperature": cfg.Temperature,
		"max_tokens":  cfg.MaxTokens,
	}
	if len(tools) > 0 {
		body["tools"] = tools
		body["tool_choice"] = "auto"
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content   string `json:"content"`
				ToolCalls []struct {
					ID       string `json:"id"`
					Function struct {
						Name      string          `json:"name"`
						Arguments json.RawMessage `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
		Error any `json:"error"`
	}
	if err := aiPostJSON(ctx, client, base+"/chat/completions", cfg.APIKey, body, &out); err != nil {
		return "", nil, usage, err
	}
	if out.Error != nil {
		raw, _ := json.Marshal(out.Error)
		return "", nil, usage, fmt.Errorf("%s", aiCap(string(raw), 300))
	}
	if len(out.Choices) == 0 {
		return "", nil, usage, fmt.Errorf("provider returned no choices")
	}
	usage.In, usage.Out, usage.Total =
		out.Usage.PromptTokens, out.Usage.CompletionTokens, out.Usage.TotalTokens
	tcRaw, _ := json.Marshal(out.Choices[0].Message.ToolCalls)
	return out.Choices[0].Message.Content, aiParseCalls(tcRaw), usage, nil
}

// aiProviderChatWithFallback runs one round against the primary provider
// and fails over to the configured fallback triple only on retryable
// primary errors (transport failures, HTTP 5xx, 429/rate limits via
// aiShouldFallbackToProvider). Primary 4xx (auth/config) returns directly
// so bad credentials are surfaced instead of masked by a fallback round.
// The answering provider is reported in the usage for the audit log.
func aiProviderChatWithFallback(ctx context.Context, cfg *repository.AIConfig, model string, msgs []aiMsg, tools []aiToolDef) (string, []aiToolCall, aiUsage, error) {
	eff := *cfg
	if strings.TrimSpace(model) != "" {
		eff.ModelID = strings.TrimSpace(model)
	}
	text, calls, usage, err := aiProviderChat(ctx, &eff, msgs, tools)
	usage.Provider = "primary"
	if err == nil {
		return text, calls, usage, nil
	}
	if ctx.Err() != nil || !aiShouldFallbackToProvider(err) || !cfg.FallbackConfigured() {
		return "", nil, usage, err
	}
	fb := *cfg
	fb.BaseURL, fb.APIKey, fb.ModelID, fb.OllamaMode =
		cfg.FallbackBaseURL, cfg.FallbackAPIKey, cfg.FallbackModelID, cfg.FallbackOllamaMode
	text2, calls2, usage2, err2 := aiProviderChat(ctx, &fb, msgs, tools)
	usage2.Provider = "fallback"
	if err2 != nil {
		return "", nil, usage2, fmt.Errorf("primary failed (%s); fallback failed (%s)",
			aiCap(err.Error(), 200), aiCap(err2.Error(), 200))
	}
	return text2, calls2, usage2, nil
}

// aiUsageAcc sums token usage across the rounds of one chat request.
type aiUsageAcc struct {
	model    string
	provider string // "primary" unless any round answered via fallback
	in       int
	out      int
}

func (a *aiUsageAcc) add(u aiUsage) {
	if a.model == "" {
		a.model = u.Model
	}
	if u.Provider == "fallback" {
		a.provider = "primary+fallback"
	} else if a.provider == "" {
		a.provider = "primary"
	}
	a.in += u.In
	a.out += u.Out
}

// aiLogUsage writes one audit row per chat/stream request (category "ai",
// action "chat"). The message is machine-shaped (model/provider/in/out/
// cost) so the admin usage dashboard can aggregate it without parsing
// prose. The model is %q-quoted because ids may contain spaces. Never
// includes prompts, replies or keys.
func aiLogUsage(r *http.Request, cfg *repository.AIConfig, acc aiUsageAcc) {
	cost := float64(acc.in)/1000*cfg.CostPer1KIn + float64(acc.out)/1000*cfg.CostPer1KOut
	msg := fmt.Sprintf("model=%q provider=%s in=%d out=%d cost=%.4f",
		acc.model, acc.provider, acc.in, acc.out, cost)
	RecordActivity(r, repository.ActivityInput{
		Category: models.ActivityCategoryAI, Action: "chat",
		TargetLabel: aiCap(acc.model, 120), Message: aiCap(msg, 255),
	})
}

// aiUsageSummary parses an aiLogUsage message back into parts for the
// admin dashboard. Returns ok=false for rows it doesn't recognise.
func aiUsageSummary(msg string) (model, provider string, in, out int, cost float64, ok bool) {
	n, err := fmt.Sscanf(msg, "model=%q provider=%s in=%d out=%d cost=%f",
		&model, &provider, &in, &out, &cost)
	if err != nil || n != 5 {
		return "", "", 0, 0, 0, false
	}
	return model, provider, in, out, cost, true
}

func aiParseCalls(raw json.RawMessage) []aiToolCall {
	// Normalise both providers' tool-call shapes. Arguments may arrive as
	// a JSON string (OpenAI) or an already-decoded object (Ollama).
	var norm []struct {
		ID       string `json:"id"`
		Function struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		} `json:"function"`
	}
	if err := json.Unmarshal(raw, &norm); err != nil {
		return nil
	}
	var out []aiToolCall
	for i, c := range norm {
		if strings.TrimSpace(c.Function.Name) == "" {
			continue
		}
		argRaw := c.Function.Arguments
		args := map[string]any{}
		if len(argRaw) > 0 {
			// OpenAI sends arguments as a JSON-encoded string.
			var asStr string
			if err := json.Unmarshal(argRaw, &asStr); err == nil {
				argRaw = json.RawMessage(asStr)
			}
			_ = json.Unmarshal(argRaw, &args)
		}
		id := c.ID
		if id == "" {
			id = "call_" + strconv.Itoa(i)
		}
		out = append(out, aiToolCall{ID: id, Name: strings.TrimSpace(c.Function.Name), Args: args, RawArgs: argRaw})
	}
	return out
}

func aiWireMessages(msgs []aiMsg, openAI bool) []map[string]any {
	out := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		w := map[string]any{"role": m.Role, "content": m.Content}
		if m.Role == "assistant" && len(m.ToolCalls) > 0 {
			tcs := make([]map[string]any, 0, len(m.ToolCalls))
			for _, c := range m.ToolCalls {
				args := string(c.RawArgs)
				if args == "" {
					args = "{}"
				}
				tcs = append(tcs, map[string]any{
					"id": c.ID, "type": "function",
					"function": map[string]any{"name": c.Name, "arguments": args},
				})
			}
			w["tool_calls"] = tcs
		}
		if m.Role == "tool" {
			if openAI {
				w["tool_call_id"] = m.ToolCallID
			}
			if m.Name != "" {
				w["name"] = m.Name
			}
		}
		out = append(out, w)
	}
	return out
}

func aiPostJSON(ctx context.Context, client *http.Client, url, apiKey string, body any, out any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		msg := fmt.Sprintf("provider HTTP %d", resp.StatusCode)
		if s := strings.TrimSpace(string(data)); s != "" {
			msg += ": " + aiCap(s, 300)
		}
		// Mirror aiStreamPost: surface the Retry-After hint so
		// aiRetryAfterSecs honors the provider's backoff instead of the
		// 60s default on every non-streaming 429.
		if ra := strings.TrimSpace(resp.Header.Get("Retry-After")); ra != "" {
			if n, err := strconv.Atoi(ra); err == nil && n > 0 && n <= 3600 {
				msg += fmt.Sprintf(" (retry after %ds)", n)
			} else {
				msg += " (retry after 60s)"
			}
		} else if resp.StatusCode == http.StatusTooManyRequests {
			msg += " (retry after 60s)"
		}
		return fmt.Errorf("%s", msg)
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("bad provider response: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Tool plumbing.
// ---------------------------------------------------------------------------

type aiCallCtx struct {
	con     *sql.DB
	uid     int64
	username string
	role    string
	perms   []string
	checker *permissions.Checker
	r       *http.Request
	cfg     *repository.AIConfig
}

func (a *aiCallCtx) hasAny(keys ...string) bool {
	set := make(map[string]struct{}, len(a.perms))
	for _, p := range a.perms {
		set[p] = struct{}{}
	}
	for _, k := range keys {
		if _, ok := set[k]; ok {
			return true
		}
	}
	return false
}

type aiTicketProposal struct {
	ID      string
	Summary string
	Diff    string
}

var aiWriteTools = map[string]bool{
	"instance_action": true, "update_settings": true, "create_theme": true,
	"create_template": true, "create_instance_page": true, "create_user": true,
	"deploy_instance": true,
	"edit_instance": true, "reinstall_instance": true, "delete_instance": true,
	"suspend_instance": true, "unsuspend_instance": true,
	"edit_template": true, "delete_template": true,
	"edit_template_steps": true, "set_template_command": true,
	"remove_template_action": true,
	"create_node": true, "edit_node": true, "delete_node": true,
	"edit_instance_page": true, "delete_instance_page": true,
	"reinstall_panel": true,
	"edit_user": true, "delete_user": true,
	"edit_theme": true, "delete_theme": true,
	"create_ticket": true, "reply_ticket": true, "update_ticket": true,
	"broadcast_notification": true,
}

// aiReadTools are the fleet-inspection tools gated by AI_CHAT_TOOLS (writes
// holders may also read so they can look up IDs before proposing).
var aiReadTools = map[string]bool{
	"list_instances": true, "get_instance": true, "list_nodes": true,
	"list_templates": true, "get_system_status": true,
	"get_node": true, "get_template": true,
	"list_instance_pages": true, "get_instance_page": true,
	"check_panel_update": true,
	"list_users": true, "get_user": true, "list_roles": true,
	"list_themes": true, "list_tickets": true, "get_ticket": true,
}

// aiCaps resolves the caller's AI sub-capabilities. The umbrella
// AI_CHAT_USE implies everything, so legacy roles keep full access.
func aiCaps(checker *permissions.Checker, uid int64) (canQA, canRead, canWrite bool) {
	if checker == nil {
		return true, true, true
	}
	canQA, _ = checker.HasAICapability(uid, permissions.AIChatQAKey)
	canRead, _ = checker.HasAICapability(uid, permissions.AIChatToolsKey)
	canWrite, _ = checker.HasAICapability(uid, permissions.AIChatWritesKey)
	// Writes imply reads (you must look up IDs before proposing).
	if canWrite {
		canRead = true
	}
	// Anyone who reached the chat gate can at least do Q&A.
	if !canQA && !canRead && !canWrite {
		canQA = true
	}
	return canQA, canRead, canWrite
}

// aiToolDefsForCaps filters the advertised tool set to what the caller may
// actually use: QA-only roles see get_docs alone, readers see all read
// tools, writers additionally see the approval-gated write tools.
func aiToolDefsForCaps(canRead, canWrite bool) []aiToolDef {
	all := aiToolDefs()
	if canRead && canWrite {
		return all
	}
	out := make([]aiToolDef, 0, len(all))
	for _, d := range all {
		name := d.Function.Name
		if aiWriteTools[name] {
			if canWrite {
				out = append(out, d)
			}
			continue
		}
		if aiReadTools[name] {
			if canRead {
				out = append(out, d)
			}
			continue
		}
		// get_docs and any future QA-level tool are always advertised.
		out = append(out, d)
	}
	return out
}

// aiCapabilityNote renders the capability line injected into the system
// prompt so the model never promises tools the caller's role lacks.
func aiCapabilityNote(canQA, canRead, canWrite bool, allowWrites bool) string {
	switch {
	case canRead && canWrite && allowWrites:
		return "This user has full assistant tools: Q&A, fleet read tools and write proposals (each write still needs their confirmation in the UI)."
	case canRead && canWrite && !allowWrites:
		return "This user has Q&A + read tools, but the administrator disabled AI writes globally — do not call write tools, explain writes are off."
	case canRead:
		return "This user has Q&A + read tools only — do not call write tools, explain they need the AI Chat Writes permission plus an admin enabling writes."
	default:
		return "This user is limited to Q&A only (get_docs) — do not call fleet or write tools, explain they need the AI Chat Tools / Writes permissions."
	}
}

func aiStr(args map[string]any, key string) string {
	v, _ := args[key].(string)
	return strings.TrimSpace(v)
}

func aiInt(args map[string]any, key string) int64 {
	switch v := args[key].(type) {
	case float64:
		return int64(v)
	case int64:
		return v
	case int:
		return int64(v)
	case string:
		n, _ := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		return n
	}
	return 0
}

func aiLimit(args map[string]any) int {
	n := aiInt(args, "limit")
	if n <= 0 {
		return 20
	}
	if n > 50 {
		return 50
	}
	return int(n)
}

// aiRunTool executes one model-requested tool call. Read tools run at once;
// write tools return a ticket proposal (validated, never executed here).
func aiRunTool(a *aiCallCtx, name string, args map[string]any) (string, *aiTicketProposal, error) {
	if args == nil {
		args = map[string]any{}
	}
	if aiWriteTools[name] {
		if ok, _ := a.checker.HasAICapability(a.uid, permissions.AIChatWritesKey); !ok {
			return "", nil, fmt.Errorf("denied: your role lacks AI Chat Writes (AI_CHAT_WRITES) — explain that an admin must grant it first")
		}
		if a.cfg == nil || !a.cfg.AllowWrites {
			return "", nil, fmt.Errorf("writes are disabled by the administrator (allow_writes is off) — explain that the request needs an admin to enable AI writes first")
		}
		summary, diff, err := aiProposeWrite(a, name, args)
		if err != nil {
			return "", nil, err
		}
		id, err := aiNewTicketID()
		if err != nil {
			return "", nil, fmt.Errorf("server error")
		}
		return "", &aiTicketProposal{ID: id, Summary: summary, Diff: diff}, nil
	}
	if aiReadTools[name] {
		if ok, _ := a.checker.HasAICapability(a.uid, permissions.AIChatToolsKey); !ok {
			// Writes imply reads, so check that too before denying.
			if okW, _ := a.checker.HasAICapability(a.uid, permissions.AIChatWritesKey); !okW {
				return "", nil, fmt.Errorf("denied: your role is limited to Q&A (needs AI Chat Tools AI_CHAT_TOOLS for fleet lookups) — answer from general knowledge or docs instead")
			}
		}
	}
	switch name {
	case "list_instances":
		return aiToolListInstances(a, aiLimit(args))
	case "get_instance":
		return aiToolGetInstance(a, aiInt(args, "instance_id"))
	case "list_nodes":
		return aiToolListNodes(a, aiLimit(args))
	case "list_templates":
		return aiToolListTemplates(a, aiLimit(args))
	case "get_node":
		return aiToolGetNode(a, aiInt(args, "node_id"))
	case "get_template":
		return aiToolGetTemplate(a, aiInt(args, "template_id"), aiStr(args, "section"))
	case "list_instance_pages":
		return aiToolListInstancePages(a, aiLimit(args))
	case "get_instance_page":
		return aiToolGetInstancePage(a, aiInt(args, "page_id"))
	case "check_panel_update":
		return aiToolCheckPanelUpdate(a)
	case "list_users":
		return aiToolListUsers(a, aiLimit(args))
	case "get_user":
		return aiToolGetUser(a, aiInt(args, "user_id"))
	case "list_roles":
		return aiToolListRoles(a)
	case "list_themes":
		return aiToolListThemes(a, aiLimit(args))
	case "list_tickets":
		return aiToolListTickets(a, aiLimit(args), aiStr(args, "status"))
	case "get_ticket":
		return aiToolGetTicket(a, aiInt(args, "ticket_id"))
	case "get_docs":
		return aiToolGetDocs(aiStr(args, "topic")), nil, nil
	case "get_system_status":
		return aiToolSystemStatus(a)
	default:
		return "", nil, fmt.Errorf("unknown tool %q", name)
	}
}

// aiRedact walks decoded JSON and masks secret-bearing keys so tool output
// never leaks passwords, tokens or hashes into the chat transcript.
func aiRedact(v any) any {
	switch t := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, val := range t {
			lk := strings.ToLower(k)
			if strings.Contains(lk, "password") || strings.Contains(lk, "token") ||
				strings.Contains(lk, "secret") || strings.Contains(lk, "api_key") ||
				strings.Contains(lk, "apikey") || strings.Contains(lk, "hash") ||
				strings.Contains(lk, "credential") {
				out[k] = "***"
				continue
			}
			out[k] = aiRedact(val)
		}
		return out
	case []any:
		for i, val := range t {
			t[i] = aiRedact(val)
		}
		return t
	default:
		return v
	}
}

func aiJSON(v any) string {
	raw, _ := json.Marshal(aiRedact(v))
	return string(raw)
}

// --- read tools ---

func aiToolListInstances(a *aiCallCtx, limit int) (string, *aiTicketProposal, error) {
	repo := repository.NewInstanceRepository(a.con)
	var list []models.Instance
	var err error
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
	if !hasAll && hasOwn {
		list, err = repo.ListByOwner(a.uid)
	} else {
		list, err = repo.List()
	}
	if err != nil {
		return "", nil, fmt.Errorf("list instances failed")
	}
	out := make([]map[string]any, 0, limit)
	for i, inst := range list {
		if i >= limit {
			break
		}
		out = append(out, map[string]any{
			"id": inst.ID, "name": inst.Name, "kind": inst.Kind,
			"status": inst.Status, "node": inst.NodeName,
		})
	}
	return aiJSON(out), nil, nil
}

func aiCheckInstanceScope(a *aiCallCtx, ownerID int64) error {
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
	if !hasAll && hasOwn && ownerID != a.uid {
		return fmt.Errorf("forbidden: that instance belongs to someone else")
	}
	return nil
}

func aiToolGetInstance(a *aiCallCtx, id int64) (string, *aiTicketProposal, error) {
	if id == 0 {
		return "", nil, fmt.Errorf("instance_id is required (use list_instances first — never guess)")
	}
	inst, err := repository.NewInstanceRepository(a.con).Get(id)
	if err != nil {
		return "", nil, fmt.Errorf("instance %d not found", id)
	}
	if err := aiCheckInstanceScope(a, inst.OwnerID); err != nil {
		return "", nil, err
	}
	return aiJSON(map[string]any{
		"id": inst.ID, "name": inst.Name, "kind": inst.Kind, "status": inst.Status,
		"node": inst.NodeName, "template": inst.TemplateName, "external_id": inst.ExternalID,
		"install_state": inst.InstallState, "error": inst.Error,
	}), nil, nil
}

func aiToolListNodes(a *aiCallCtx, limit int) (string, *aiTicketProposal, error) {
	repo := repository.NewNodeRepository(a.con)
	var list []models.Node
	var err error
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.NodesOwnKey, permissions.NodesAllKey, permissions.ManageNodesKey)
	if !hasAll && hasOwn {
		list, err = repo.ListNodesByOwner(a.uid)
	} else {
		list, err = repo.ListNodes()
	}
	if err != nil {
		return "", nil, fmt.Errorf("list nodes failed")
	}
	out := make([]map[string]any, 0, limit)
	for i, n := range list {
		if i >= limit {
			break
		}
		out = append(out, map[string]any{"id": n.ID, "name": n.Name, "address": n.Address})
	}
	return aiJSON(out), nil, nil
}

func aiToolListTemplates(a *aiCallCtx, limit int) (string, *aiTicketProposal, error) {
	repo := repository.NewTemplateRepository(a.con)
	var list []models.Template
	var err error
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
	if !hasAll && hasOwn {
		list, err = repo.ListByOwner(a.uid)
	} else {
		list, err = repo.List()
	}
	if err != nil {
		return "", nil, fmt.Errorf("list templates failed")
	}
	out := make([]map[string]any, 0, limit)
	for i, t := range list {
		if i >= limit {
			break
		}
		out = append(out, map[string]any{
			"id": t.ID, "name": t.Name, "kind": t.Kind,
			"description": t.Description, "image": t.Image,
		})
	}
	return aiJSON(out), nil, nil
}

func aiToolGetNode(a *aiCallCtx, id int64) (string, *aiTicketProposal, error) {
	if id == 0 {
		return "", nil, fmt.Errorf("node_id is required (use list_nodes first — never guess)")
	}
	n, err := repository.NewNodeRepository(a.con).GetNode(id)
	if err != nil || n == nil {
		return "", nil, fmt.Errorf("node %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.NodesOwnKey, permissions.NodesAllKey, permissions.ManageNodesKey)
	if !hasAll && hasOwn && n.OwnerID != a.uid {
		return "", nil, fmt.Errorf("forbidden: that node belongs to someone else")
	}
	return aiJSON(map[string]any{
		"id": n.ID, "name": n.Name, "address": n.Address,
		"status": n.Status, "allowed_kinds": n.AllowedKinds,
		"connection_mode": n.ConnectionMode,
	}), nil, nil
}

func aiToolGetTemplate(a *aiCallCtx, id int64, section string) (string, *aiTicketProposal, error) {
	if id == 0 {
		return "", nil, fmt.Errorf("template_id is required (use list_templates first — never guess)")
	}
	t, err := repository.NewTemplateRepository(a.con).Get(id)
	if err != nil || t == nil {
		return "", nil, fmt.Errorf("template %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
	if !hasAll && hasOwn && t.OwnerID != a.uid {
		return "", nil, fmt.Errorf("forbidden: that template belongs to someone else")
	}
	steps := aiTemplateInstallSteps(t)
	cmd, actions := aiTemplateRuntime(t)
	section = strings.ToLower(strings.TrimSpace(section))
	switch section {
	case "summary":
		return aiJSON(map[string]any{
			"id": t.ID, "name": t.Name, "kind": t.Kind, "image": t.Image,
			"description_chars": len(t.Description),
			"install_step_count": len(steps),
			"command":            cmd,
			"actions":            actions,
		}), nil, nil
	case "steps":
		out := map[string]any{"id": t.ID, "name": t.Name, "install_steps": steps, "actions": actions}
		if len(steps) == 0 {
			out["install_steps"] = []string{"(no install workflow — deploys start the container directly)"}
		}
		return aiJSON(out), nil, nil
	case "description":
		return aiJSON(map[string]any{
			"id": t.ID, "name": t.Name, "description": t.Description,
		}), nil, nil
	case "runtime":
		return aiJSON(map[string]any{
			"id": t.ID, "name": t.Name, "command": cmd, "actions": actions,
			"install_step_count": len(steps),
		}), nil, nil
	default:
		return aiJSON(map[string]any{
			"id": t.ID, "name": t.Name, "kind": t.Kind,
			"description": t.Description, "image": t.Image,
			"command": cmd, "actions": actions,
			"install_steps": steps,
		}), nil, nil
	}
}

// aiTemplateRuntime extracts the container startup command and the action
// buttons (id + name) from a template spec. Command is rendered compactly
// (arrays joined); over-long values are capped so the transcript stays
// small. Actions are what the user clicks on the instance page — distinct
// from install[] workflow steps.
func aiTemplateRuntime(t *models.Template) (string, []string) {
	var cmd string
	actions := []string{}
	if strings.TrimSpace(t.Spec) != "" {
		var spec map[string]any
		if err := json.Unmarshal([]byte(t.Spec), &spec); err == nil {
			switch c := spec["command"].(type) {
			case string:
				cmd = c
			case []any:
				parts := make([]string, 0, len(c))
				for _, p := range c {
					if s, ok := p.(string); ok {
						parts = append(parts, s)
					}
				}
				cmd = strings.Join(parts, " ")
			}
			if raw, ok := spec["actions"].([]any); ok {
				for _, a := range raw {
					m, _ := a.(map[string]any)
					if m == nil {
						continue
					}
					id := aiStr(m, "id")
					if id == "" {
						continue
					}
					label := aiStr(m, "name")
					if label == "" {
						label = id
					}
					actions = append(actions, id+": "+label)
				}
			}
		}
	}
	return aiCap(cmd, 300), actions
}

// aiTemplateStepSummary renders one spec.install entry as a numbered
// one-liner ("#3 shell: touch /mc/.install-complete") using the 1-based
// numbering users count with. Long values are capped; write-step bodies
// are never inlined (length only) so giant file contents can't flood the
// transcript.
func aiTemplateStepSummary(i int, m map[string]any) string {
	action := strings.ToLower(strings.TrimSpace(aiStr(m, "action")))
	if action == "" {
		action = "(no action)"
	}
	var detail string
	switch action {
	case "shell", "pip_install", "npm_install":
		detail = aiStr(m, "command")
	case "download":
		detail = aiStr(m, "url") + " → " + aiStr(m, "filename")
	case "extract":
		detail = aiStr(m, "archive") + " → " + aiStr(m, "dest")
	case "move":
		detail = aiStr(m, "from") + " → " + aiStr(m, "to")
	case "write":
		detail = aiStr(m, "path")
		if c := aiStr(m, "content"); c != "" {
			detail += fmt.Sprintf(" (%d chars)", len(c))
		}
	case "mkdir":
		detail = aiStr(m, "path")
	case "chmod":
		detail = strings.TrimSpace(aiStr(m, "path") + " " + aiStr(m, "command"))
	case "git_clone":
		detail = aiStr(m, "url") + " → " + aiStr(m, "dest")
	case "http_check":
		detail = aiStr(m, "url")
	default:
		detail = aiCap(strings.TrimSpace(fmt.Sprintf("%v", m)), 100)
	}
	return aiCap(fmt.Sprintf("#%d %s: %s", i+1, action, strings.TrimSpace(detail)), 160)
}

// aiTemplateInstallSteps parses spec.install into numbered summaries.
// Returns nil when the template has no workflow (or an unreadable spec).
func aiTemplateInstallSteps(t *models.Template) []string {
	if t == nil || strings.TrimSpace(t.Spec) == "" {
		return nil
	}
	var spec map[string]any
	if err := json.Unmarshal([]byte(t.Spec), &spec); err != nil {
		return nil
	}
	raw, ok := spec["install"].([]any)
	if !ok || len(raw) == 0 {
		return nil
	}
	out := make([]string, 0, len(raw))
	for i, s := range raw {
		if i >= 40 {
			out = append(out, fmt.Sprintf("…and %d more steps", len(raw)-i))
			break
		}
		m, _ := s.(map[string]any)
		if m == nil {
			m = map[string]any{}
		}
		out = append(out, aiTemplateStepSummary(i, m))
	}
	return out
}

func aiToolListInstancePages(a *aiCallCtx, limit int) (string, *aiTicketProposal, error) {
	list, err := repository.NewInstancePageRepository(a.con).List()
	if err != nil {
		return "", nil, fmt.Errorf("list instance pages failed")
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
	if !hasAll && hasOwn {
		filtered := make([]models.InstancePage, 0, len(list))
		for _, p := range list {
			if p.OwnerID == a.uid {
				filtered = append(filtered, p)
			}
		}
		list = filtered
	}
	out := make([]map[string]any, 0, limit)
	for i, p := range list {
		if i >= limit {
			break
		}
		out = append(out, map[string]any{
			"id": p.ID, "name": p.Name, "slug": p.Slug,
			"description": p.Description,
		})
	}
	return aiJSON(out), nil, nil
}

func aiToolGetInstancePage(a *aiCallCtx, id int64) (string, *aiTicketProposal, error) {
	if id == 0 {
		return "", nil, fmt.Errorf("page_id is required (use list_instance_pages first — never guess)")
	}
	p, err := repository.NewInstancePageRepository(a.con).Get(id)
	if err != nil || p == nil {
		return "", nil, fmt.Errorf("instance page %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
	if !hasAll && hasOwn && p.OwnerID != a.uid {
		return "", nil, fmt.Errorf("forbidden: that page belongs to someone else")
	}
	return aiJSON(map[string]any{
		"id": p.ID, "name": p.Name, "slug": p.Slug,
		"description": p.Description, "content_type": p.ContentType,
	}), nil, nil
}

// aiToolCheckPanelUpdate reports the local build vs the remote release
// manifest (same data as System → Updates → "check"). Read-only: no
// download, no restart. Mirrors the route gate (MANAGE_PANEL_UPDATE) so a
// role without panel-update rights can't even see the check.
func aiToolCheckPanelUpdate(a *aiCallCtx) (string, *aiTicketProposal, error) {
	if err := a.checker.Ensure(a.uid, permissions.ManagePanelUpdateKey); err != nil {
		return "", nil, fmt.Errorf("denied: checking panel updates needs MANAGE_PANEL_UPDATE — explain that the user lacks permission")
	}
	local := version.Snapshot()
	manifest, err := fetchUpdateManifest()
	if err != nil {
		return aiJSON(map[string]any{
			"available": false, "local_version": local.Version,
			"error": aiCap(err.Error(), 300),
		}), nil, nil
	}
	return aiJSON(map[string]any{
		"available":      semverGreater(manifest.Version, local.Version),
		"local_version":  local.Version,
		"remote_version": manifest.Version,
		"notes":          aiCap(manifest.Notes, 500),
		"checked_at":     time.Now().UTC().Format(time.RFC3339),
	}), nil, nil
}

// aiUserScope resolves the Users-area ownership scope like
// ListUsersHandler: own-scope callers see only themselves.
func aiUserScope(a *aiCallCtx) (ownOnly bool) {
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.UsersOwnKey, permissions.UsersAllKey, permissions.ManageUsersKey)
	return !hasAll && hasOwn
}

func aiUserPublic(u *models.User, roleName string) map[string]any {
	m := map[string]any{
		"id": u.ID, "username": u.Username, "email": u.Email,
		"role_id": u.RoleID, "suspended": u.Suspended,
	}
	if roleName != "" {
		m["role"] = roleName
	}
	return m
}

func aiRoleName(con *sql.DB, roleID int64) string {
	if r, err := repository.NewRoleRepository(con).GetRoleByID(roleID); err == nil && r != nil {
		return r.Name
	}
	return ""
}

func aiToolListUsers(a *aiCallCtx, limit int) (string, *aiTicketProposal, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageUsersKey, permissions.UsersViewKey); err != nil {
		return "", nil, fmt.Errorf("denied: listing users needs MANAGE_USERS or USERS_VIEW — explain that the user lacks permission")
	}
	repo := repository.NewUserRepository(a.con)
	if aiUserScope(a) {
		u, err := repo.GetByID(a.uid)
		if err != nil {
			return "", nil, fmt.Errorf("server error")
		}
		return aiJSON([]map[string]any{aiUserPublic(u, aiRoleName(a.con, u.RoleID))}), nil, nil
	}
	users, err := repo.ListUsers()
	if err != nil {
		return "", nil, fmt.Errorf("list users failed")
	}
	out := make([]map[string]any, 0, limit)
	for i, u := range users {
		if i >= limit {
			break
		}
		u := u
		out = append(out, aiUserPublic(&u, aiRoleName(a.con, u.RoleID)))
	}
	return aiJSON(out), nil, nil
}

func aiToolGetUser(a *aiCallCtx, id int64) (string, *aiTicketProposal, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageUsersKey, permissions.UsersViewKey); err != nil {
		return "", nil, fmt.Errorf("denied: viewing users needs MANAGE_USERS or USERS_VIEW — explain that the user lacks permission")
	}
	if id == 0 {
		return "", nil, fmt.Errorf("user_id is required (use list_users first — never guess)")
	}
	if aiUserScope(a) && id != a.uid {
		return "", nil, fmt.Errorf("forbidden: that account belongs to someone else")
	}
	u, err := repository.NewUserRepository(a.con).GetByID(id)
	if err != nil || u == nil {
		return "", nil, fmt.Errorf("user %d not found", id)
	}
	return aiJSON(aiUserPublic(u, aiRoleName(a.con, u.RoleID))), nil, nil
}

func aiToolListRoles(a *aiCallCtx) (string, *aiTicketProposal, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageRolesKey, permissions.RolesViewKey, permissions.ManageUsersKey, permissions.UsersViewKey); err != nil {
		return "", nil, fmt.Errorf("denied: listing roles needs a Roles or Users view grant — explain that the user lacks permission")
	}
	roles, err := repository.NewRoleRepository(a.con).ListRoles(0)
	if err != nil {
		return "", nil, fmt.Errorf("list roles failed")
	}
	out := make([]map[string]any, 0, len(roles))
	for _, r := range roles {
		out = append(out, map[string]any{"id": r.ID, "name": r.Name, "display_name": r.DisplayName})
	}
	return aiJSON(out), nil, nil
}

func aiToolListThemes(a *aiCallCtx, limit int) (string, *aiTicketProposal, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageThemesKey, permissions.UseGlobalThemesKey); err != nil {
		return "", nil, fmt.Errorf("denied: listing themes needs MANAGE_THEMES or USE_GLOBAL_THEMES — explain that the user lacks permission")
	}
	list, err := repository.NewThemeRepository(a.con).ListThemes()
	if err != nil {
		return "", nil, fmt.Errorf("list themes failed")
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.ThemesOwnKey, permissions.ThemesAllKey, permissions.ManageThemesKey)
	out := make([]map[string]any, 0, limit)
	for _, t := range list {
		if len(out) >= limit {
			break
		}
		// Mirror the admin list: builtins are visible to all, own-scope
		// callers otherwise see only themes they authored.
		if !hasAll && hasOwn && !t.Builtin && t.OwnerID != a.uid {
			continue
		}
		out = append(out, map[string]any{
			"id": t.ID, "name": t.Name,
			"description": t.Description, "builtin": t.Builtin,
		})
	}
	return aiJSON(out), nil, nil
}

func aiTicketBrief(t *models.Ticket) map[string]any {
	return map[string]any{
		"id": t.ID, "ticket_no": t.TicketNo, "subject": t.Subject,
		"status": t.Status, "priority": t.Priority, "category": t.Category,
	}
}

func aiToolListTickets(a *aiCallCtx, limit int, status string) (string, *aiTicketProposal, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageTicketsKey, permissions.TicketsViewKey); err != nil {
		return "", nil, fmt.Errorf("denied: listing tickets needs MANAGE_TICKETS or TICKETS_VIEW — explain that the user lacks permission")
	}
	status = strings.ToLower(strings.TrimSpace(status))
	if status != "" && !models.ValidTicketStatuses[status] {
		return "", nil, fmt.Errorf("invalid status (one of: open, pending, in_progress, resolved, closed)")
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	repo := repository.NewTicketRepository(a.con)
	list, _, err := repo.List("", "", status, "", false, a.uid, limit, 0, isTicketStaff(a.con, a.uid))
	if err != nil {
		return "", nil, fmt.Errorf("list tickets failed")
	}
	out := make([]map[string]any, 0, len(list))
	for _, t := range list {
		t := t
		out = append(out, aiTicketBrief(&t))
	}
	return aiJSON(out), nil, nil
}

// aiTicketAccess mirrors the ticket handlers: staff sees any ticket,
// everyone else only their own or assigned ones.
func aiTicketAccess(a *aiCallCtx, t *models.Ticket) error {
	if isTicketStaff(a.con, a.uid) {
		return nil
	}
	if t.CreatedBy == a.uid {
		return nil
	}
	if t.AssignedTo != nil && *t.AssignedTo == a.uid {
		return nil
	}
	return fmt.Errorf("forbidden: that ticket belongs to someone else")
}

func aiToolGetTicket(a *aiCallCtx, id int64) (string, *aiTicketProposal, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageTicketsKey, permissions.TicketsViewKey); err != nil {
		return "", nil, fmt.Errorf("denied: viewing tickets needs MANAGE_TICKETS or TICKETS_VIEW — explain that the user lacks permission")
	}
	if id == 0 {
		return "", nil, fmt.Errorf("ticket_id is required (use list_tickets first — never guess)")
	}
	repo := repository.NewTicketRepository(a.con)
	t, err := repo.Get(id)
	if err != nil || t == nil {
		return "", nil, fmt.Errorf("ticket %d not found", id)
	}
	if err := aiTicketAccess(a, t); err != nil {
		return "", nil, err
	}
	comments, _ := repo.ListComments(id, canSeeInternal(a.con, a.uid))
	out := aiTicketBrief(t)
	out["description"] = aiCap(t.Description, 1500)
	out["created_by"] = t.CreatedBy
	if t.AssignedTo != nil {
		out["assigned_to"] = *t.AssignedTo
	}
	cl := make([]map[string]any, 0, len(comments))
	for i, c := range comments {
		if i >= 20 {
			break
		}
		cl = append(cl, map[string]any{
			"author": c.AuthorName, "internal": c.IsInternal,
			"body": aiCap(c.Body, 500),
		})
	}
	out["comments"] = cl
	return aiJSON(out), nil, nil
}

// aiDocsFallback is the last-resort get_docs answer when the embedded
// skill bundle is unavailable (should never happen — go:embed ships it).
const aiDocsFallback = "Topics: instances, templates, nodes, instance_pages, users, updates, mods, applications, tickets, backups, security, database, automation, sftp, themes, notifications, ai. Ask get_docs for one to read its skill playbook."

// aiToolGetDocs serves the per-area skill guides from the embedded
// aiskills bundle (panel/backend/internal/aiskills/*.md — one file per
// topic, each also a readable repo doc). Unknown topics fall back to the
// index so the model always gets something useful.
func aiToolGetDocs(topic string) string {
	if d, ok := aiskills.Get(topic); ok {
		return d
	}
	return aiDocsFallback
}

func aiToolSystemStatus(a *aiCallCtx) (string, *aiTicketProposal, error) {
	var instN, nodeN, tmplN int64
	_ = a.con.QueryRow(`SELECT COUNT(*) FROM instances`).Scan(&instN)
	_ = a.con.QueryRow(`SELECT COUNT(*) FROM nodes`).Scan(&nodeN)
	_ = a.con.QueryRow(`SELECT COUNT(*) FROM templates`).Scan(&tmplN)
	rows, err := a.con.Query(`SELECT status, COUNT(*) FROM instances GROUP BY status`)
	byStatus := map[string]int64{}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			var n int64
			if err := rows.Scan(&s, &n); err == nil {
				byStatus[s] = n
			}
		}
	}
	return aiJSON(map[string]any{
		"instances": instN, "nodes": nodeN, "templates": tmplN,
		"instances_by_status": byStatus,
	}), nil, nil
}

// --- write tools: propose (validate only) + execute ---

func aiProposeWrite(a *aiCallCtx, name string, args map[string]any) (string, string, error) {
	switch name {
	case "instance_action":
		return aiProposeInstanceAction(a, args)
	case "update_settings":
		return aiProposeUpdateSettings(a, args)
	case "create_theme":
		return aiProposeCreateTheme(a, args)
	case "create_template":
		return aiProposeCreateTemplate(a, args)
	case "create_instance_page":
		return aiProposeCreateInstancePage(a, args)
	case "create_user":
		return aiProposeCreateUser(a, args)
	case "deploy_instance":
		return aiProposeDeploy(a, args)
	case "edit_instance":
		return aiProposeEditInstance(a, args)
	case "reinstall_instance":
		return aiProposeReinstallInstance(a, args)
	case "delete_instance":
		return aiProposeDeleteInstance(a, args)
	case "suspend_instance":
		return aiProposeSuspendInstance(a, args)
	case "unsuspend_instance":
		return aiProposeUnsuspendInstance(a, args)
	case "edit_template":
		return aiProposeEditTemplate(a, args)
	case "delete_template":
		return aiProposeDeleteTemplate(a, args)
	case "edit_template_steps":
		return aiProposeEditTemplateSteps(a, args)
	case "set_template_command":
		return aiProposeSetTemplateCommand(a, args)
	case "remove_template_action":
		return aiProposeRemoveTemplateAction(a, args)
	case "create_node":
		return aiProposeCreateNode(a, args)
	case "edit_node":
		return aiProposeEditNode(a, args)
	case "delete_node":
		return aiProposeDeleteNode(a, args)
	case "edit_instance_page":
		return aiProposeEditInstancePage(a, args)
	case "delete_instance_page":
		return aiProposeDeleteInstancePage(a, args)
	case "reinstall_panel":
		return aiProposeReinstallPanel(a, args)
	case "edit_user":
		return aiProposeEditUser(a, args)
	case "delete_user":
		return aiProposeDeleteUser(a, args)
	case "edit_theme":
		return aiProposeEditTheme(a, args)
	case "delete_theme":
		return aiProposeDeleteTheme(a, args)
	case "create_ticket":
		return aiProposeCreateTicket(a, args)
	case "reply_ticket":
		return aiProposeReplyTicket(a, args)
	case "update_ticket":
		return aiProposeUpdateTicket(a, args)
	case "broadcast_notification":
		return aiProposeBroadcast(a, args)
	default:
		return "", "", fmt.Errorf("unknown tool %q", name)
	}
}

func aiExecuteWrite(a *aiCallCtx, name string, args map[string]any) (string, error) {
	// Belt-and-braces alongside the handler-level kill-switch check: never
	// execute a write when the assistant or its writes switch is off.
	if a.cfg == nil || !a.cfg.Enabled || !a.cfg.AllowWrites {
		return "", fmt.Errorf("AI writes are currently disabled by the administrator")
	}
	// Re-validate first so an approval can't execute something the propose
	// step would now reject (permissions revoked, resource deleted, …).
	if _, _, err := aiProposeWrite(a, name, args); err != nil {
		return "", err
	}
	switch name {
	case "instance_action":
		return aiExecInstanceAction(a, args)
	case "update_settings":
		return aiExecUpdateSettings(a, args)
	case "create_theme":
		return aiExecCreateTheme(a, args)
	case "create_template":
		return aiExecCreateTemplate(a, args)
	case "create_instance_page":
		return aiExecCreateInstancePage(a, args)
	case "create_user":
		return aiExecCreateUser(a, args)
	case "deploy_instance":
		return aiExecDeploy(a, args)
	case "edit_instance":
		return aiExecEditInstance(a, args)
	case "reinstall_instance":
		return aiExecReinstallInstance(a, args)
	case "delete_instance":
		return aiExecDeleteInstance(a, args)
	case "suspend_instance":
		return aiExecSuspendInstance(a, args)
	case "unsuspend_instance":
		return aiExecUnsuspendInstance(a, args)
	case "edit_template":
		return aiExecEditTemplate(a, args)
	case "delete_template":
		return aiExecDeleteTemplate(a, args)
	case "edit_template_steps":
		return aiExecEditTemplateSteps(a, args)
	case "set_template_command":
		return aiExecSetTemplateCommand(a, args)
	case "remove_template_action":
		return aiExecRemoveTemplateAction(a, args)
	case "create_node":
		return aiExecCreateNode(a, args)
	case "edit_node":
		return aiExecEditNode(a, args)
	case "delete_node":
		return aiExecDeleteNode(a, args)
	case "edit_instance_page":
		return aiExecEditInstancePage(a, args)
	case "delete_instance_page":
		return aiExecDeleteInstancePage(a, args)
	case "reinstall_panel":
		return aiExecReinstallPanel(a, args)
	case "edit_user":
		return aiExecEditUser(a, args)
	case "delete_user":
		return aiExecDeleteUser(a, args)
	case "edit_theme":
		return aiExecEditTheme(a, args)
	case "delete_theme":
		return aiExecDeleteTheme(a, args)
	case "create_ticket":
		return aiExecCreateTicket(a, args)
	case "reply_ticket":
		return aiExecReplyTicket(a, args)
	case "update_ticket":
		return aiExecUpdateTicket(a, args)
	case "broadcast_notification":
		return aiExecBroadcast(a, args)
	default:
		return "", fmt.Errorf("unknown tool %q", name)
	}
}

func aiPretty(v any) string {
	raw, _ := json.MarshalIndent(aiRedact(v), "", "  ")
	return string(raw)
}

// instance_action

func aiProposeInstanceAction(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancesKey, permissions.InstancesEditKey); err != nil {
		return "", "", fmt.Errorf("denied: instance actions need MANAGE_INSTANCES or INSTANCES_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "instance_id")
	action := aiStr(args, "action")
	if id == 0 {
		return "", "", fmt.Errorf("instance_id is required (use list_instances first — never guess)")
	}
	if action != "start" && action != "stop" && action != "restart" {
		return "", "", fmt.Errorf("action must be one of: start, stop, restart")
	}
	inst, err := repository.NewInstanceRepository(a.con).Get(id)
	if err != nil {
		return "", "", fmt.Errorf("instance %d not found", id)
	}
	if err := aiCheckInstanceScope(a, inst.OwnerID); err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("%s instance %q (%s) on %q", action, inst.Name, inst.Kind, inst.NodeName)
	diff := aiPretty(map[string]any{"tool": "instance_action", "instance_id": id, "name": inst.Name, "action": action})
	return summary, diff, nil
}

func aiExecInstanceAction(a *aiCallCtx, args map[string]any) (string, error) {
	id := aiInt(args, "instance_id")
	action := aiStr(args, "action")
	instRepo := repository.NewInstanceRepository(a.con)
	nodeRepo := repository.NewNodeRepository(a.con)
	inst, err := instRepo.Get(id)
	if err != nil {
		return "", fmt.Errorf("instance %d not found", id)
	}
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		return "", fmt.Errorf("owning node not found")
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		return "", fmt.Errorf("node has no usable edge token (rotate it first)")
	}
	actions := []string{action}
	if action == "restart" {
		actions = []string{"stop", "start"}
	}
	for _, act := range actions {
		ec := edge.NewWithTimeout(*node, token, 45*time.Second)
		resp, err := ec.Lifecycle(edge.LifecycleRequest{Action: act, Kind: inst.Kind, Name: inst.Name})
		if err != nil {
			_ = instRepo.SetStatus(id, "errored", inst.ExternalID, err.Error())
			return "", fmt.Errorf("edge rejected %s: %s", act, aiCap(err.Error(), 300))
		}
		status := resp.Status
		if status == "" {
			status = act + "ed"
		}
		if action == "restart" && act == "stop" {
			continue // report the final start status only
		}
		if err := instRepo.SetStatus(id, status, inst.ExternalID, ""); err != nil {
			return "", fmt.Errorf("edge accepted %s but the panel failed to store it", act)
		}
	}
	fresh, _ := instRepo.Get(id)
	final := action + "ed"
	if fresh != nil {
		final = fresh.Status
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: action,
		TargetID: &id, TargetLabel: inst.Name,
		Message: fmt.Sprintf("AI assistant %sed instance %q (%s) on %q for %s", action, inst.Name, inst.Kind, inst.NodeName, a.username),
	})
	return fmt.Sprintf("instance %q is now %q", inst.Name, final), nil
}

// update_settings

func aiProposeUpdateSettings(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ViewSettingsKey, permissions.SettingsEditKey); err != nil {
		return "", "", fmt.Errorf("denied: settings changes need SETTINGS_EDIT — explain that the user lacks permission")
	}
	allowed := []string{"panel_name", "hosting_name", "hosting_about"}
	changes := map[string]any{}
	for _, k := range allowed {
		if v, ok := args[k]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				changes[k] = strings.TrimSpace(s)
			}
		}
	}
	if len(changes) == 0 {
		return "", "", fmt.Errorf("nothing to change: only panel_name, hosting_name and hosting_about can be edited here")
	}
	for k := range args {
		known := false
		for _, ak := range allowed {
			if k == ak {
				known = true
			}
		}
		if !known {
			return "", "", fmt.Errorf("setting %q can't be edited here (allowed: panel_name, hosting_name, hosting_about)", k)
		}
	}
	if v, ok := changes["panel_name"]; ok {
		if s, _ := v.(string); s == "" {
			return "", "", fmt.Errorf("panel name cannot be empty")
		}
	}
	summary := "update panel branding"
	diff := aiPretty(map[string]any{"tool": "update_settings", "changes": changes})
	return summary, diff, nil
}

func aiExecUpdateSettings(a *aiCallCtx, args map[string]any) (string, error) {
	sr := repository.NewSettingsRepository(a.con)
	ar := repository.NewAIConfigRepository(a.con)
	applied := []string{}
	if v := aiStr(args, "panel_name"); v != "" {
		if err := sr.SetPanelName(v); err != nil {
			return "", err
		}
		applied = append(applied, "panel_name="+strconv.Quote(v))
	}
	if v, ok := args["hosting_name"]; ok {
		s := aiStr(map[string]any{"v": v}, "v")
		if err := ar.Update(&repository.AIConfigUpdate{HostingName: &s}); err != nil {
			return "", err
		}
		applied = append(applied, "hosting_name="+strconv.Quote(s))
	}
	if v, ok := args["hosting_about"]; ok {
		s := aiStr(map[string]any{"v": v}, "v")
		if err := ar.Update(&repository.AIConfigUpdate{HostingAbout: &s}); err != nil {
			return "", err
		}
		applied = append(applied, "hosting_about updated")
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySettings, Action: "update",
		Message: fmt.Sprintf("AI assistant updated branding (%s) for %s", strings.Join(applied, ", "), a.username),
	})
	return "applied: " + strings.Join(applied, ", "), nil
}

// create_theme

func aiProposeCreateTheme(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageThemesKey, permissions.CreateGlobalThemesKey); err != nil {
		return "", "", fmt.Errorf("denied: theme publishing needs MANAGE_THEMES or CREATE_GLOBAL_THEMES — explain that the user lacks permission")
	}
	name := aiStr(args, "name")
	if name == "" {
		return "", "", fmt.Errorf("theme name is required")
	}
	if len(name) > 128 {
		return "", "", fmt.Errorf("theme name is too long (max 128 chars)")
	}
	spec := aiStr(args, "spec")
	if spec == "" {
		spec = "{}"
	}
	var js map[string]any
	if err := json.Unmarshal([]byte(spec), &js); err != nil {
		return "", "", fmt.Errorf("spec must be a valid JSON object string")
	}
	summary := fmt.Sprintf("publish global theme %q", name)
	diff := aiPretty(map[string]any{"tool": "create_theme", "name": name, "description": aiStr(args, "description")})
	return summary, diff, nil
}

func aiExecCreateTheme(a *aiCallCtx, args map[string]any) (string, error) {
	name := aiStr(args, "name")
	spec := aiStr(args, "spec")
	if spec == "" {
		spec = "{}"
	}
	id, err := aiNewTicketID()
	if err != nil {
		return "", fmt.Errorf("server error")
	}
	id = "ai-" + id[:12]
	t, err := repository.NewThemeRepository(a.con).CreateTheme(repository.UpsertThemeInput{
		ID: id, Name: name, Description: aiStr(args, "description"),
		Spec: json.RawMessage(spec), Builtin: false, CreatedBy: a.uid,
	})
	if err != nil {
		return "", fmt.Errorf("create theme failed: %s", aiCap(err.Error(), 300))
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "create",
		TargetLabel: name,
		Message: fmt.Sprintf("AI assistant published global theme %q for %s", name, a.username),
	})
	return fmt.Sprintf("published global theme %q (id %s)", t.Name, t.ID), nil
}

// create_template

var aiValidKinds = map[string]bool{"docker": true, "lxd": true, "kvm": true, "multipass": true}

func aiProposeCreateTemplate(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageTemplatesKey, permissions.TemplatesCreateKey); err != nil {
		return "", "", fmt.Errorf("denied: template creation needs MANAGE_TEMPLATES or TEMPLATES_CREATE — explain that the user lacks permission")
	}
	name := aiStr(args, "name")
	kind := strings.ToLower(aiStr(args, "kind"))
	if name == "" || kind == "" {
		return "", "", fmt.Errorf("template name and kind are required")
	}
	if !aiValidKinds[kind] {
		return "", "", fmt.Errorf("kind must be one of: docker, lxd, kvm, multipass")
	}
	spec := aiStr(args, "spec")
	if spec == "" {
		spec = "{}"
	}
	var js map[string]any
	if err := json.Unmarshal([]byte(spec), &js); err != nil {
		return "", "", fmt.Errorf("spec must be a valid JSON object string")
	}
	summary := fmt.Sprintf("create %s template %q", kind, name)
	diff := aiPretty(map[string]any{"tool": "create_template", "name": name, "kind": kind, "description": aiStr(args, "description"), "image": aiStr(args, "image")})
	return summary, diff, nil
}

func aiExecCreateTemplate(a *aiCallCtx, args map[string]any) (string, error) {
	spec := aiStr(args, "spec")
	if spec == "" {
		spec = "{}"
	}
	id, err := repository.NewTemplateRepository(a.con).Create(repository.TemplateInput{
		Name: aiStr(args, "name"), Description: aiStr(args, "description"),
		Kind: strings.ToLower(aiStr(args, "kind")), Image: aiStr(args, "image"),
		Spec: spec, OwnerID: a.uid,
	})
	if err != nil {
		return "", fmt.Errorf("create template failed: %s", aiCap(err.Error(), 300))
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryTemplate, Action: "create",
		TargetID: &id, TargetLabel: aiStr(args, "name"),
		Message: fmt.Sprintf("AI assistant created template %q for %s", aiStr(args, "name"), a.username),
	})
	return fmt.Sprintf("created template %q (id %d)", aiStr(args, "name"), id), nil
}

// create_instance_page

var aiSlugRe = regexp.MustCompile(`[^a-z0-9-]+`)

func aiSlugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = aiSlugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	for strings.Contains(s, "--") {
		s = strings.ReplaceAll(s, "--", "-")
	}
	return s
}

func aiProposeCreateInstancePage(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancePagesKey, permissions.InstancePagesCreateKey); err != nil {
		return "", "", fmt.Errorf("denied: instance page creation needs MANAGE_INSTANCE_PAGES or INSTANCE_PAGES_CREATE — explain that the user lacks permission")
	}
	name := aiStr(args, "name")
	if name == "" {
		return "", "", fmt.Errorf("page name is required")
	}
	slug := aiStr(args, "slug")
	if slug == "" {
		slug = aiSlugify(name)
	} else {
		slug = aiSlugify(slug)
	}
	if slug == "" {
		return "", "", fmt.Errorf("slug is empty after cleanup — provide an explicit ascii slug")
	}
	if len(name) > 256 || len(slug) > 128 {
		return "", "", fmt.Errorf("name (max 256) or slug (max 128) too long")
	}
	if aiStr(args, "content_markdown") == "" && aiStr(args, "content_html") == "" {
		return "", "", fmt.Errorf("one of content_markdown or content_html is required")
	}
	summary := fmt.Sprintf("create instance page %q (/%s)", name, slug)
	diff := aiPretty(map[string]any{"tool": "create_instance_page", "name": name, "slug": slug, "description": aiStr(args, "description")})
	return summary, diff, nil
}

func aiExecCreateInstancePage(a *aiCallCtx, args map[string]any) (string, error) {
	slug := aiStr(args, "slug")
	if slug == "" {
		slug = aiSlugify(aiStr(args, "name"))
	} else {
		slug = aiSlugify(slug)
	}
	html := aiStr(args, "content_html")
	md := aiStr(args, "content_markdown")
	ctype := "markdown"
	if html != "" {
		ctype = "html"
	}
	id, err := repository.NewInstancePageRepository(a.con).Create(repository.InstancePageInput{
		Name: aiStr(args, "name"), Slug: slug, Kind: "custom",
		Description: aiStr(args, "description"), ContentType: ctype,
		ContentHTML: html, ContentMarkdown: md, OwnerID: a.uid, Source: "studio",
	})
	if err != nil {
		return "", fmt.Errorf("create instance page failed: %s", aiCap(err.Error(), 300))
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "create",
		TargetID: &id, TargetLabel: aiStr(args, "name"),
		Message: fmt.Sprintf("AI assistant created instance page %q for %s", aiStr(args, "name"), a.username),
	})
	return fmt.Sprintf("created instance page %q (id %d)", aiStr(args, "name"), id), nil
}

// create_user

func aiProposeCreateUser(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageUsersKey, permissions.UsersCreateKey); err != nil {
		return "", "", fmt.Errorf("denied: user creation needs MANAGE_USERS or USERS_CREATE — explain that the user lacks permission")
	}
	username := aiStr(args, "username")
	email := aiStr(args, "email")
	password := aiStr(args, "password")
	if username == "" || email == "" || password == "" {
		return "", "", fmt.Errorf("username, email and password are all required")
	}
	roleName := aiStr(args, "role")
	if roleName == "" {
		roleName = "user"
	}
	if _, err := repository.NewRoleRepository(a.con).GetRoleByName(roleName); err != nil {
		return "", "", fmt.Errorf("role %q does not exist", roleName)
	}
	policy := resolvePasswordPolicy()
	if err := auth.ValidatePassword(password, policy, username, email); err != nil {
		return "", "", fmt.Errorf("password rejected by policy: %s", aiCap(err.Error(), 300))
	}
	summary := fmt.Sprintf("create user %q (role %q)", username, roleName)
	diff := aiPretty(map[string]any{"tool": "create_user", "username": username, "email": email, "role": roleName, "password": "***"})
	return summary, diff, nil
}

func aiExecCreateUser(a *aiCallCtx, args map[string]any) (string, error) {
	roleName := aiStr(args, "role")
	if roleName == "" {
		roleName = "user"
	}
	role, err := repository.NewRoleRepository(a.con).GetRoleByName(roleName)
	if err != nil {
		return "", fmt.Errorf("role %q does not exist", roleName)
	}
	hash, err := auth.HashPassword(aiStr(args, "password"))
	if err != nil {
		return "", fmt.Errorf("server error")
	}
	u := models.User{
		Username: aiStr(args, "username"), Email: aiStr(args, "email"),
		PasswordHash: hash, RoleID: role.ID,
	}
	if err := repository.NewUserRepository(a.con).AdminCreateUser(u); err != nil {
		log.Println("AI AdminCreateUser error:", err)
		return "", fmt.Errorf("could not create user (username/email may already exist)")
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryUser, Action: "create",
		TargetLabel: u.Username,
		Message: fmt.Sprintf("AI assistant created user %q (<%s>, role=%s) for %s", u.Username, u.Email, roleName, a.username),
	})
	return fmt.Sprintf("created user %q with role %q", u.Username, roleName), nil
}

// deploy_instance (template defaults only — mirrors DeployInstanceHandler's
// create-row + async edge deploy; no custom env/overrides via chat).

type aiDeployPlan struct {
	tmpl     *models.Template
	node     *models.Node
	cfg      map[string]any
	cfgStore string
	envSpecs []aiEnvSpec
	finalEnv map[string]string
	steps    []aiInstallStep
	ownerID  int64
}

type aiEnvSpec struct {
	Name         string
	Default      string
	Required     bool
	IsSecret     bool
	Description  string
}

type aiInstallStep struct {
	Action       string `json:"action"`
	Command      string `json:"command"`
	URL          string `json:"url"`
	Filename     string `json:"filename"`
	Archive      string `json:"archive"`
	Dest         string `json:"dest"`
	From         string `json:"from"`
	To           string `json:"to"`
	Path         string `json:"path"`
	Content      string `json:"content"`
	Branch       string `json:"branch"`
	Retries      string `json:"retries"`
	IgnoreErrors bool   `json:"ignore_errors"`
}

func aiPlanDeploy(a *aiCallCtx, args map[string]any) (*aiDeployPlan, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancesKey, permissions.InstancesCreateKey); err != nil {
		return nil, fmt.Errorf("denied: deploying needs MANAGE_INSTANCES or INSTANCES_CREATE — explain that the user lacks permission")
	}
	name := aiStr(args, "name")
	nodeID := aiInt(args, "node_id")
	tmplID := aiInt(args, "template_id")
	if name == "" || nodeID == 0 || tmplID == 0 {
		return nil, fmt.Errorf("name, node_id and template_id are all required (use list_nodes / list_templates first — never guess)")
	}
	if !validInstanceName(name) {
		return nil, fmt.Errorf("instance name %q is invalid (1-63 chars, [a-zA-Z0-9_-], must start with alphanumeric)", name)
	}
	ownerID := a.uid
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
	if !hasAll && hasOwn {
		ownerID = a.uid // own-scope may only create for self
	}
	tmpl, err := repository.NewTemplateRepository(a.con).Get(tmplID)
	if err != nil {
		return nil, fmt.Errorf("template %d not found", tmplID)
	}
	node, err := repository.NewNodeRepository(a.con).GetNode(nodeID)
	if err != nil {
		return nil, fmt.Errorf("node %d not found", nodeID)
	}
	if !repository.KindAllowed(node.AllowedKinds, tmpl.Kind) {
		return nil, fmt.Errorf("node %q does not allow %q instances", node.Name, tmpl.Kind)
	}
	if missing := driverMissingOn(*node, tmpl.Kind); missing != "" {
		return nil, fmt.Errorf("node %q hasn't reported the %q driver as available", node.Name, tmpl.Kind)
	}
	if _, err := repository.NewNodeRepository(a.con).PlainToken(nodeID); err != nil {
		return nil, fmt.Errorf("node has no usable edge token (rotate it first)")
	}
	var spec map[string]any
	if tmpl.Spec != "" {
		_ = json.Unmarshal([]byte(tmpl.Spec), &spec)
	}
	if spec == nil {
		spec = map[string]any{}
	}
	// Env defaults only (no per-deploy overrides via chat).
	var envSpecs []aiEnvSpec
	if rawEnv, ok := spec["env"].([]any); ok {
		for _, e := range rawEnv {
			if m, ok := e.(map[string]any); ok {
				s := aiEnvSpec{
					Name: aiStr(m, "name"), Default: aiStr(m, "default"),
					Description: aiStr(m, "description"),
				}
				if b, ok := m["required"].(bool); ok {
					s.Required = b
				}
				if b, ok := m["is_secret"].(bool); ok {
					s.IsSecret = b
				}
				if s.Name != "" {
					envSpecs = append(envSpecs, s)
				}
			}
		}
	}
	finalEnv := map[string]string{}
	for _, s := range envSpecs {
		if s.Required && strings.TrimSpace(s.Default) == "" {
			return nil, fmt.Errorf("template needs a value for required variable %q — deploys of this template need the Instances page instead", s.Name)
		}
		finalEnv[s.Name] = s.Default
	}
	var cfg map[string]any
	if tmpl.Spec != "" {
		_ = json.Unmarshal([]byte(tmpl.Spec), &cfg)
	}
	if cfg == nil {
		cfg = map[string]any{}
	}
	cfg["image"] = tmpl.Image
	envMap, ok := cfg["env"].(map[string]any)
	if !ok {
		envMap = map[string]any{}
		cfg["env"] = envMap
	}
	for k, v := range finalEnv {
		envMap[k] = v
	}
	substituteInstanceName(cfg, name)
	substituteEnvVars(cfg, finalEnv)
	// Redacted copy for the row: strip secret defaults at rest.
	cfgForStore := cfg
	if len(envSpecs) > 0 {
		clone := make(map[string]any, len(cfg))
		for k, v := range cfg {
			clone[k] = v
		}
		emClone := make(map[string]any, len(envMap))
		for k, v := range envMap {
			emClone[k] = v
		}
		for _, s := range envSpecs {
			if s.IsSecret {
				delete(emClone, s.Name)
			}
		}
		clone["env"] = emClone
		cfgForStore = clone
	}
	storeBytes, _ := json.Marshal(cfgForStore)
	var steps []aiInstallStep
	if rawInstall, ok := spec["install"].([]any); ok {
		for _, s := range rawInstall {
			if m, ok := s.(map[string]any); ok {
				steps = append(steps, aiInstallStep{
					Action: aiStr(m, "action"), Command: aiStr(m, "command"),
					URL: aiStr(m, "url"), Filename: aiStr(m, "filename"),
					Archive: aiStr(m, "archive"), Dest: aiStr(m, "dest"),
					From: aiStr(m, "from"), To: aiStr(m, "to"),
					Path: aiStr(m, "path"), Content: aiStr(m, "content"),
					Branch: aiStr(m, "branch"), Retries: aiStr(m, "retries"),
				})
				if b, ok := m["ignore_errors"].(bool); ok && len(steps) > 0 {
					steps[len(steps)-1].IgnoreErrors = b
				}
			}
		}
	}
	return &aiDeployPlan{
		tmpl: tmpl, node: node, cfg: cfg, cfgStore: string(storeBytes),
		envSpecs: envSpecs, finalEnv: finalEnv, steps: steps, ownerID: ownerID,
	}, nil
}

func aiProposeDeploy(a *aiCallCtx, args map[string]any) (string, string, error) {
	plan, err := aiPlanDeploy(a, args)
	if err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("deploy instance %q (%s from template %q) on node %q using template defaults",
		aiStr(args, "name"), plan.tmpl.Kind, plan.tmpl.Name, plan.node.Name)
	diff := aiPretty(map[string]any{
		"tool": "deploy_instance", "name": aiStr(args, "name"),
		"node": plan.node.Name, "template": plan.tmpl.Name, "kind": plan.tmpl.Kind,
		"install_steps": len(plan.steps),
	})
	return summary, diff, nil
}

func aiExecDeploy(a *aiCallCtx, args map[string]any) (string, error) {
	plan, err := aiPlanDeploy(a, args)
	if err != nil {
		return "", err
	}
	name := aiStr(args, "name")
	nodeID := aiInt(args, "node_id")
	id, err := repository.NewInstanceRepository(a.con).Create(repository.InstanceCreateInput{
		NodeID: nodeID, TemplateID: plan.tmpl.ID, OwnerID: plan.ownerID,
		Name: name, Kind: plan.tmpl.Kind, Status: "creating",
		Config: plan.cfgStore, InstallStep: -1,
	})
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "UNIQUE") || strings.Contains(msg, "unique") ||
			strings.Contains(msg, "Duplicate entry") || strings.Contains(msg, "duplicate key") {
			return "", fmt.Errorf("an instance named %q already exists on this node", name)
		}
		return "", fmt.Errorf("panel failed to store instance")
	}
	// Async edge deploy — same pattern as DeployInstanceHandler: the HTTP
	// response returns immediately, the goroutine drives deploy → status →
	// secrets → SFTP → install workflow on its own connection.
	instID := id
	username := a.username
	go func() {
		con2, err := repository.OpenDB()
		if err != nil {
			log.Printf("ai deploy async: db open failed: %v", err)
			return
		}
		defer con2.Close()
		instRepo2 := repository.NewInstanceRepository(con2)
		nodeRepo2 := repository.NewNodeRepository(con2)
		node2, err := nodeRepo2.GetNode(nodeID)
		if err != nil {
			_ = instRepo2.SetStatus(instID, "errored", "", "node not found: "+err.Error())
			return
		}
		token2, err := nodeRepo2.PlainToken(nodeID)
		if err != nil || token2 == "" {
			_ = instRepo2.SetStatus(instID, "errored", "", "node token missing")
			return
		}
		ec2 := edge.NewWithTimeout(*node2, token2, 5*time.Minute)
		resp, err := ec2.Lifecycle(edge.LifecycleRequest{
			Action: "deploy", Kind: plan.tmpl.Kind, Name: name, Config: plan.cfg,
		})
		if err != nil {
			_ = instRepo2.SetStatus(instID, "errored", "", err.Error())
			return
		}
		status := resp.Status
		if status == "" {
			status = "running"
		}
		if len(plan.steps) > 0 && status != "running" {
			failMsg := fmt.Sprintf("container exited before install workflow could start (status=%q)", status)
			stepsJSON, _ := json.Marshal(plan.steps)
			_ = instRepo2.UpdateInstallStatus(instID, "failed", plan.tmpl.Kind+":"+name, 0, failMsg, string(stepsJSON))
			_ = instRepo2.SetStatus(instID, "install_failed", resp.ExternalID, failMsg)
			return
		}
		if len(plan.steps) > 0 {
			status = "installing"
		}
		if err := instRepo2.SetStatus(instID, status, resp.ExternalID, ""); err != nil {
			return
		}
		secRepo := repository.NewSecretRepository(con2)
		for _, s := range plan.envSpecs {
			if s.IsSecret && plan.finalEnv[s.Name] != "" {
				_, _ = secRepo.Set(instID, s.Name, plan.finalEnv[s.Name], true, s.Description)
			}
		}
		autoProvisionSFTPOnDeploy(con2, instID)
		if len(plan.steps) > 0 {
			stepsJSON, _ := json.Marshal(plan.steps)
			_ = instRepo2.UpdateInstallStatus(instID, "running", plan.tmpl.Kind+":"+name, 0, "", string(stepsJSON))
			edgeSteps := make([]edge.InstallStep, len(plan.steps))
			for i, s := range plan.steps {
				edgeSteps[i] = edge.InstallStep{
					Action: s.Action, Command: s.Command, URL: s.URL,
					Filename: s.Filename, Archive: s.Archive, Dest: s.Dest,
					From: s.From, To: s.To, Path: s.Path, Content: s.Content,
					Branch: s.Branch, Retries: s.Retries, IgnoreErrors: s.IgnoreErrors,
				}
			}
			_, _ = ec2.InstallStart(edge.InstallStartRequest{
				Kind: plan.tmpl.Kind, Name: name, Steps: edgeSteps, EnvVars: plan.finalEnv,
			})
		}
	}()
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "deploy",
		TargetID: &id, TargetLabel: name,
		Message: fmt.Sprintf("AI assistant started deploy of %q (%s) on %q for %s", name, plan.tmpl.Kind, plan.node.Name, username),
	})
	return fmt.Sprintf("deploy of %q started (id %d) — watch its status on the Instances page", name, id), nil
}

// ---------------------------------------------------------------------------
// Admin-parity writes: everything an admin can do in the UI is also
// proposable here. Every propose re-checks the caller's area permission
// (MANAGE_* umbrella or the matching granular verb) plus ownership scope;
// every execute re-validates first, so a revoked grant or a deleted row
// fails closed. Approval still happens in the ConfirmCard — nothing here
// ever runs without the user pressing Approve.
// ---------------------------------------------------------------------------

// edit_instance (display rename only — no edge call, no recreate).

func aiProposeEditInstance(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancesKey, permissions.InstancesEditKey); err != nil {
		return "", "", fmt.Errorf("denied: renaming instances needs MANAGE_INSTANCES or INSTANCES_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "instance_id")
	name := aiStr(args, "display_name")
	if id == 0 {
		return "", "", fmt.Errorf("instance_id is required (use list_instances first — never guess)")
	}
	if name == "" {
		return "", "", fmt.Errorf("display_name is required")
	}
	if len(name) > 128 {
		return "", "", fmt.Errorf("display_name too long (max 128 chars)")
	}
	inst, err := repository.NewInstanceRepository(a.con).Get(id)
	if err != nil {
		return "", "", fmt.Errorf("instance %d not found", id)
	}
	if err := aiCheckInstanceScope(a, inst.OwnerID); err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("rename instance %q display name to %q", inst.Name, name)
	diff := aiPretty(map[string]any{"tool": "edit_instance", "instance_id": id, "name": inst.Name, "display_name": name})
	return summary, diff, nil
}

func aiExecEditInstance(a *aiCallCtx, args map[string]any) (string, error) {
	instRepo := repository.NewInstanceRepository(a.con)
	inst, err := instRepo.Get(aiInt(args, "instance_id"))
	if err != nil {
		return "", fmt.Errorf("instance %d not found", aiInt(args, "instance_id"))
	}
	name := aiStr(args, "display_name")
	if err := instRepo.UpdateIdentity(inst.ID, name, inst.Icon, inst.Color); err != nil {
		return "", fmt.Errorf("rename failed: %s", aiCap(err.Error(), 300))
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "rename",
		TargetID: &inst.ID, TargetLabel: inst.Name,
		Message:  fmt.Sprintf("AI assistant renamed instance %q display name to %q for %s", inst.Name, name, a.username),
	})
	return fmt.Sprintf("renamed instance %q display name to %q", inst.Name, name), nil
}

// reinstall_instance (wipe + redeploy from stored spec).

func aiCheckReinstallable(a *aiCallCtx, id int64) (*models.Instance, map[string]any, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancesKey, permissions.InstancesEditKey); err != nil {
		return nil, nil, fmt.Errorf("denied: reinstalling needs MANAGE_INSTANCES or INSTANCES_EDIT — explain that the user lacks permission")
	}
	if id == 0 {
		return nil, nil, fmt.Errorf("instance_id is required (use list_instances first — never guess)")
	}
	instRepo := repository.NewInstanceRepository(a.con)
	inst, err := instRepo.Get(id)
	if err != nil {
		return nil, nil, fmt.Errorf("instance %d not found", id)
	}
	if err := aiCheckInstanceScope(a, inst.OwnerID); err != nil {
		return nil, nil, err
	}
	if suspended, until, _ := instRepo.IsInstanceSuspended(id); suspended {
		msg := "instance is suspended indefinitely"
		if until != nil {
			msg = fmt.Sprintf("instance is suspended until %s", until.Format("2006-01-02 15:04"))
		}
		return nil, nil, fmt.Errorf("%s — unsuspend it first", msg)
	}
	if inst.Status == "creating" || inst.Status == "installing" {
		return nil, nil, fmt.Errorf("instance is %q — wait for the deploy to finish before reinstalling", inst.Status)
	}
	cfg := map[string]any{}
	if inst.Config != "" {
		if err := json.Unmarshal([]byte(inst.Config), &cfg); err != nil {
			return nil, nil, fmt.Errorf("stored config is corrupt, cannot reinstall")
		}
	}
	node, err := repository.NewNodeRepository(a.con).GetNode(inst.NodeID)
	if err != nil {
		return nil, nil, fmt.Errorf("reinstall aborted: owning node not found")
	}
	token, err := repository.NewNodeRepository(a.con).PlainToken(inst.NodeID)
	if err != nil || token == "" {
		return nil, nil, fmt.Errorf("reinstall aborted: node has no usable edge token (rotate it first)")
	}
	_ = node
	_ = token
	return inst, cfg, nil
}

func aiProposeReinstallInstance(a *aiCallCtx, args map[string]any) (string, string, error) {
	inst, _, err := aiCheckReinstallable(a, aiInt(args, "instance_id"))
	if err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("reinstall instance %q (%s on %q) — ALL data inside will be lost", inst.Name, inst.Kind, inst.NodeName)
	diff := aiPretty(map[string]any{"tool": "reinstall_instance", "instance_id": inst.ID, "name": inst.Name, "kind": inst.Kind, "node": inst.NodeName})
	return summary, diff, nil
}

func aiExecReinstallInstance(a *aiCallCtx, args map[string]any) (string, error) {
	inst, cfg, err := aiCheckReinstallable(a, aiInt(args, "instance_id"))
	if err != nil {
		return "", err
	}
	instRepo := repository.NewInstanceRepository(a.con)
	nodeRepo := repository.NewNodeRepository(a.con)
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		return "", fmt.Errorf("reinstall aborted: owning node not found")
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		return "", fmt.Errorf("reinstall aborted: node has no usable edge token (rotate it first)")
	}
	var destroyErr error
	for i := 0; i < 3; i++ {
		ec := edge.NewWithTimeout(*node, token, 60*time.Second)
		_, destroyErr = ec.Lifecycle(edge.LifecycleRequest{Action: "destroy", Kind: inst.Kind, Name: inst.Name})
		if destroyErr == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if destroyErr != nil {
		return "", fmt.Errorf("reinstall aborted: edge refused destroy after 3 retries: %s", aiCap(destroyErr.Error(), 300))
	}
	_ = instRepo.UpdateInstallStatus(inst.ID, "", "", -1, "", "")
	_ = instRepo.SetStatus(inst.ID, "creating", "", "")
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "reinstall",
		TargetID: &inst.ID, TargetLabel: inst.Name,
		Message:  fmt.Sprintf("AI assistant reinstalled instance %q (%s on %q) for %s — workload wiped and redeployed", inst.Name, inst.Kind, node.Name, a.username),
	})
	go reinstallAsync(inst.ID, inst.NodeID, inst.Kind, inst.Name, cfg)
	return fmt.Sprintf("reinstall of %q started — watch its status on the Instances page", inst.Name), nil
}

// delete_instance (edge destroy + row delete).

func aiProposeDeleteInstance(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancesKey, permissions.InstancesDeleteKey); err != nil {
		return "", "", fmt.Errorf("denied: deleting instances needs MANAGE_INSTANCES or INSTANCES_DELETE — explain that the user lacks permission")
	}
	id := aiInt(args, "instance_id")
	if id == 0 {
		return "", "", fmt.Errorf("instance_id is required (use list_instances first — never guess)")
	}
	inst, err := repository.NewInstanceRepository(a.con).Get(id)
	if err != nil {
		return "", "", fmt.Errorf("instance %d not found", id)
	}
	if err := aiCheckInstanceScope(a, inst.OwnerID); err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("delete instance %q (%s on %q) — irreversible", inst.Name, inst.Kind, inst.NodeName)
	diff := aiPretty(map[string]any{"tool": "delete_instance", "instance_id": id, "name": inst.Name})
	return summary, diff, nil
}

func aiExecDeleteInstance(a *aiCallCtx, args map[string]any) (string, error) {
	instRepo := repository.NewInstanceRepository(a.con)
	nodeRepo := repository.NewNodeRepository(a.con)
	inst, err := instRepo.Get(aiInt(args, "instance_id"))
	if err != nil {
		return "", fmt.Errorf("instance %d not found", aiInt(args, "instance_id"))
	}
	node, err := nodeRepo.GetNode(inst.NodeID)
	if err != nil {
		return "", fmt.Errorf("owning node not found")
	}
	token, err := nodeRepo.PlainToken(inst.NodeID)
	if err != nil || token == "" {
		return "", fmt.Errorf("node has no usable edge token (rotate it first)")
	}
	var loopErr error
	for i := 0; i < 3; i++ {
		ec := edge.NewWithTimeout(*node, token, 60*time.Second)
		_, loopErr = ec.Lifecycle(edge.LifecycleRequest{Action: "destroy", Kind: inst.Kind, Name: inst.Name})
		if loopErr == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if loopErr != nil {
		_ = instRepo.SetStatus(inst.ID, "errored", inst.ExternalID, loopErr.Error())
		return "", fmt.Errorf("edge refused destroy after 3 retries: %s", aiCap(loopErr.Error(), 300))
	}
	removeSFTPFromEdge(a.con, inst)
	_ = repository.NewSFTPRepository(a.con).Delete(inst.ID)
	_ = repository.NewSecretRepository(a.con).Delete(inst.ID, repository.SFTPSecretKey)
	if err := instRepo.Delete(inst.ID); err != nil {
		return "", fmt.Errorf("edge confirmed destroy but the panel failed to delete the row")
	}
	id := inst.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "destroy",
		TargetID: &id, TargetLabel: inst.Name,
		Message:  fmt.Sprintf("AI assistant destroyed instance %q (%s) on %q for %s", inst.Name, inst.Kind, inst.NodeName, a.username),
	})
	return fmt.Sprintf("deleted instance %q", inst.Name), nil
}

// suspend / unsuspend.

func aiProposeSuspendInstance(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancesKey, permissions.InstancesEditKey); err != nil {
		return "", "", fmt.Errorf("denied: suspending needs MANAGE_INSTANCES or INSTANCES_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "instance_id")
	reason := aiStr(args, "reason")
	if id == 0 {
		return "", "", fmt.Errorf("instance_id is required (use list_instances first — never guess)")
	}
	if reason == "" {
		return "", "", fmt.Errorf("reason is required")
	}
	inst, err := repository.NewInstanceRepository(a.con).Get(id)
	if err != nil {
		return "", "", fmt.Errorf("instance %d not found", id)
	}
	if err := aiCheckInstanceScope(a, inst.OwnerID); err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("suspend instance %q (reason: %s)", inst.Name, reason)
	diff := aiPretty(map[string]any{"tool": "suspend_instance", "instance_id": id, "name": inst.Name, "reason": reason})
	return summary, diff, nil
}

func aiExecSuspendInstance(a *aiCallCtx, args map[string]any) (string, error) {
	instRepo := repository.NewInstanceRepository(a.con)
	inst, err := instRepo.Get(aiInt(args, "instance_id"))
	if err != nil {
		return "", fmt.Errorf("instance %d not found", aiInt(args, "instance_id"))
	}
	reason := aiStr(args, "reason")
	var until *time.Time
	if h := aiInt(args, "duration_hours"); h > 0 {
		t := time.Now().Add(time.Duration(h) * time.Hour)
		until = &t
	}
	count, err := instRepo.SuspendInstance(inst.ID, until, reason, a.uid, a.username)
	if err != nil {
		return "", fmt.Errorf("suspend failed: %s", aiCap(err.Error(), 300))
	}
	_ = repository.NewSFTPRepository(a.con).SetEnabled(inst.ID, 0)
	removeSFTPFromEdge(a.con, inst)
	id := inst.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "suspend",
		TargetID: &id, TargetLabel: inst.Name,
		Message:  fmt.Sprintf("AI assistant suspended instance %q (count: %d, reason: %s) for %s", inst.Name, count, reason, a.username),
	})
	return fmt.Sprintf("suspended instance %q (count: %d)", inst.Name, count), nil
}

func aiProposeUnsuspendInstance(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancesKey, permissions.InstancesEditKey); err != nil {
		return "", "", fmt.Errorf("denied: unsuspending needs MANAGE_INSTANCES or INSTANCES_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "instance_id")
	if id == 0 {
		return "", "", fmt.Errorf("instance_id is required (use list_instances first — never guess)")
	}
	inst, err := repository.NewInstanceRepository(a.con).Get(id)
	if err != nil {
		return "", "", fmt.Errorf("instance %d not found", id)
	}
	if err := aiCheckInstanceScope(a, inst.OwnerID); err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("unsuspend instance %q", inst.Name)
	diff := aiPretty(map[string]any{"tool": "unsuspend_instance", "instance_id": id, "name": inst.Name})
	return summary, diff, nil
}

func aiExecUnsuspendInstance(a *aiCallCtx, args map[string]any) (string, error) {
	instRepo := repository.NewInstanceRepository(a.con)
	inst, err := instRepo.Get(aiInt(args, "instance_id"))
	if err != nil {
		return "", fmt.Errorf("instance %d not found", aiInt(args, "instance_id"))
	}
	if _, err := instRepo.UnsuspendInstance(inst.ID); err != nil {
		return "", fmt.Errorf("unsuspend failed: %s", aiCap(err.Error(), 300))
	}
	if cfg, _ := repository.NewSFTPRepository(a.con).Get(inst.ID); cfg != nil {
		_ = repository.NewSFTPRepository(a.con).SetEnabled(inst.ID, 1)
		if fresh, gerr := instRepo.Get(inst.ID); gerr == nil && fresh != nil {
			_ = provisionSFTPForInstance(a.con, fresh)
		}
	}
	id := inst.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryInstance, Action: "unsuspend",
		TargetID: &id, TargetLabel: inst.Name,
		Message:  fmt.Sprintf("AI assistant unsuspended instance %q for %s", inst.Name, a.username),
	})
	return fmt.Sprintf("unsuspended instance %q", inst.Name), nil
}

// edit / delete template.

func aiProposeEditTemplate(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageTemplatesKey, permissions.TemplatesEditKey); err != nil {
		return "", "", fmt.Errorf("denied: editing templates needs MANAGE_TEMPLATES or TEMPLATES_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "template_id")
	if id == 0 {
		return "", "", fmt.Errorf("template_id is required (use list_templates first — never guess)")
	}
	tmpl, err := repository.NewTemplateRepository(a.con).Get(id)
	if err != nil || tmpl == nil {
		return "", "", fmt.Errorf("template %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
	if !hasAll && hasOwn && tmpl.OwnerID != a.uid {
		return "", "", fmt.Errorf("forbidden: that template belongs to someone else")
	}
	changes := map[string]any{}
	for _, k := range []string{"name", "description", "image", "spec"} {
		if v := aiStr(args, k); v != "" {
			changes[k] = v
		}
	}
	if len(changes) == 0 {
		return "", "", fmt.Errorf("nothing to change: provide at least one of name, description, image, spec")
	}
	if spec, ok := changes["spec"]; ok {
		var js map[string]any
		if err := json.Unmarshal([]byte(spec.(string)), &js); err != nil {
			return "", "", fmt.Errorf("spec must be a valid JSON object string")
		}
	}
	summary := fmt.Sprintf("edit template %q", tmpl.Name)
	diff := aiPretty(map[string]any{"tool": "edit_template", "template_id": id, "name": tmpl.Name, "changes": changes})
	return summary, diff, nil
}

func aiExecEditTemplate(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewTemplateRepository(a.con)
	tmpl, err := repo.Get(aiInt(args, "template_id"))
	if err != nil || tmpl == nil {
		return "", fmt.Errorf("template %d not found", aiInt(args, "template_id"))
	}
	name, desc, image, spec := tmpl.Name, tmpl.Description, tmpl.Image, tmpl.Spec
	if v := aiStr(args, "name"); v != "" {
		name = v
	}
	if v, ok := args["description"]; ok {
		desc = aiStr(map[string]any{"v": v}, "v")
	}
	if v, ok := args["image"]; ok {
		image = aiStr(map[string]any{"v": v}, "v")
	}
	if v := aiStr(args, "spec"); v != "" {
		spec = v
	}
	if err := repo.Update(tmpl.ID, repository.TemplateInput{
		Name: name, Description: desc, Kind: tmpl.Kind, Image: image,
		Spec: spec, Icon: tmpl.Icon, Color: tmpl.Color,
	}); err != nil {
		return "", fmt.Errorf("edit template failed: %s", aiCap(err.Error(), 300))
	}
	id := tmpl.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryTemplate, Action: "update",
		TargetID: &id, TargetLabel: name,
		Message:  fmt.Sprintf("AI assistant edited template %q for %s", name, a.username),
	})
	return fmt.Sprintf("edited template %q (id %d)", name, tmpl.ID), nil
}

func aiProposeDeleteTemplate(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageTemplatesKey, permissions.TemplatesDeleteKey); err != nil {
		return "", "", fmt.Errorf("denied: deleting templates needs MANAGE_TEMPLATES or TEMPLATES_DELETE — explain that the user lacks permission")
	}
	id := aiInt(args, "template_id")
	if id == 0 {
		return "", "", fmt.Errorf("template_id is required (use list_templates first — never guess)")
	}
	tmpl, err := repository.NewTemplateRepository(a.con).Get(id)
	if err != nil || tmpl == nil {
		return "", "", fmt.Errorf("template %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
	if !hasAll && hasOwn && tmpl.OwnerID != a.uid {
		return "", "", fmt.Errorf("forbidden: that template belongs to someone else")
	}
	summary := fmt.Sprintf("delete template %q — running instances keep running", tmpl.Name)
	diff := aiPretty(map[string]any{"tool": "delete_template", "template_id": id, "name": tmpl.Name})
	return summary, diff, nil
}

func aiExecDeleteTemplate(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewTemplateRepository(a.con)
	tmpl, err := repo.Get(aiInt(args, "template_id"))
	if err != nil || tmpl == nil {
		return "", fmt.Errorf("template %d not found", aiInt(args, "template_id"))
	}
	name := tmpl.Name
	if err := repo.Delete(tmpl.ID); err != nil {
		return "", fmt.Errorf("delete template failed: %s", aiCap(err.Error(), 300))
	}
	id := tmpl.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryTemplate, Action: "delete",
		TargetID: &id, TargetLabel: name,
		Message:  fmt.Sprintf("AI assistant deleted template %q for %s", name, a.username),
	})
	return fmt.Sprintf("deleted template %q", name), nil
}

// create / edit / delete node.

func aiProposeCreateNode(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageNodesKey, permissions.NodesCreateKey); err != nil {
		return "", "", fmt.Errorf("denied: registering nodes needs MANAGE_NODES or NODES_CREATE — explain that the user lacks permission")
	}
	name := aiStr(args, "name")
	addr := aiStr(args, "address")
	if name == "" || addr == "" {
		return "", "", fmt.Errorf("name and address are both required (address like 10.0.0.5:8443)")
	}
	if err := validateNodeAddress(addr); err != nil {
		return "", "", fmt.Errorf("address invalid: %s", aiCap(err.Error(), 200))
	}
	if taken, _ := repository.NewNodeRepository(a.con).NameLabelTaken(name, "", 0); taken {
		return "", "", fmt.Errorf("a node with this name and label pair already exists")
	}
	summary := fmt.Sprintf("register edge node %q at %s", name, addr)
	diff := aiPretty(map[string]any{"tool": "create_node", "name": name, "address": addr})
	return summary, diff, nil
}

func aiExecCreateNode(a *aiCallCtx, args map[string]any) (string, error) {
	name := aiStr(args, "name")
	addr := aiStr(args, "address")
	node, token, err := repository.NewNodeRepository(a.con).CreateNode(repository.CreateNodeInput{
		Name: name, Address: addr, ConnectionMode: "direct",
		HealthEnabled: true, OwnerID: a.uid,
	})
	if err != nil {
		return "", fmt.Errorf("create node failed: %s", aiCap(err.Error(), 300))
	}
	nid := node.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryNode, Action: "create",
		TargetID: &nid, TargetLabel: name,
		Message:  fmt.Sprintf("AI assistant registered edge %q at %s for %s", name, addr, a.username),
	})
	return fmt.Sprintf("registered edge %q (id %d) at %s — edge token (show once, save it now): %s", name, node.ID, addr, token), nil
}

func aiProposeEditNode(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageNodesKey, permissions.NodesEditKey); err != nil {
		return "", "", fmt.Errorf("denied: editing nodes needs MANAGE_NODES or NODES_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "node_id")
	if id == 0 {
		return "", "", fmt.Errorf("node_id is required (use list_nodes first — never guess)")
	}
	n, err := repository.NewNodeRepository(a.con).GetNode(id)
	if err != nil || n == nil {
		return "", "", fmt.Errorf("node %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.NodesOwnKey, permissions.NodesAllKey, permissions.ManageNodesKey)
	if !hasAll && hasOwn && n.OwnerID != a.uid {
		return "", "", fmt.Errorf("forbidden: that node belongs to someone else")
	}
	changes := map[string]any{}
	if v := aiStr(args, "name"); v != "" {
		changes["name"] = v
	}
	if v := aiStr(args, "address"); v != "" {
		if err := validateNodeAddress(v); err != nil {
			return "", "", fmt.Errorf("address invalid: %s", aiCap(err.Error(), 200))
		}
		changes["address"] = v
	}
	if len(changes) == 0 {
		return "", "", fmt.Errorf("nothing to change: provide name and/or address")
	}
	summary := fmt.Sprintf("edit edge node %q", n.Name)
	diff := aiPretty(map[string]any{"tool": "edit_node", "node_id": id, "name": n.Name, "changes": changes})
	return summary, diff, nil
}

func aiExecEditNode(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewNodeRepository(a.con)
	n, err := repo.GetNode(aiInt(args, "node_id"))
	if err != nil || n == nil {
		return "", fmt.Errorf("node %d not found", aiInt(args, "node_id"))
	}
	name, addr := n.Name, n.Address
	if v := aiStr(args, "name"); v != "" {
		name = v
	}
	if v := aiStr(args, "address"); v != "" {
		addr = v
	}
	if taken, _ := repo.NameLabelTaken(name, n.LocationNode, n.ID); taken {
		return "", fmt.Errorf("a node with this name and label pair already exists")
	}
	if err := repo.UpdateNode(n.ID, repository.UpdateNodeInput{
		Name: name, Address: addr, UseTLS: n.UseTLS,
		ConnectionMode: n.ConnectionMode, HealthEnabled: n.HealthEnabled,
		HealthInterval: n.HealthInterval, HealthTimeout: n.HealthTimeout,
		HealthRetries: n.HealthRetries, SkipTLSVerify: n.SkipTLSVerify,
		Notes: n.Notes, InstallDir: n.InstallDir, AllowedKinds: n.AllowedKinds,
		AllocMemMiB: n.AllocMemMiB, MemOvercommitPct: n.MemOvercommitPct,
		AllocDiskMiB: n.AllocDiskMiB, DiskOvercommitPct: n.DiskOvercommitPct,
		InstancesDir: n.InstancesDir, Category: n.Category,
		LocationCountry: n.LocationCountry, LocationNode: n.LocationNode,
		Icon: n.Icon, Color: n.Color,
	}); err != nil {
		return "", fmt.Errorf("edit node failed: %s", aiCap(err.Error(), 300))
	}
	id := n.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryNode, Action: "update",
		TargetID: &id, TargetLabel: name,
		Message:  fmt.Sprintf("AI assistant updated edge %q -> %s for %s", name, addr, a.username),
	})
	return fmt.Sprintf("updated edge %q -> %s", name, addr), nil
}

func aiProposeDeleteNode(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageNodesKey, permissions.NodesDeleteKey); err != nil {
		return "", "", fmt.Errorf("denied: deleting nodes needs MANAGE_NODES or NODES_DELETE — explain that the user lacks permission")
	}
	id := aiInt(args, "node_id")
	if id == 0 {
		return "", "", fmt.Errorf("node_id is required (use list_nodes first — never guess)")
	}
	n, err := repository.NewNodeRepository(a.con).GetNode(id)
	if err != nil || n == nil {
		return "", "", fmt.Errorf("node %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.NodesOwnKey, permissions.NodesAllKey, permissions.ManageNodesKey)
	if !hasAll && hasOwn && n.OwnerID != a.uid {
		return "", "", fmt.Errorf("forbidden: that node belongs to someone else")
	}
	var instN int64
	_ = a.con.QueryRow(`SELECT COUNT(*) FROM instances WHERE node_id = ?`, id).Scan(&instN)
	if instN > 0 {
		return "", "", fmt.Errorf("node %q still hosts %d instance(s) — move or delete them first", n.Name, instN)
	}
	summary := fmt.Sprintf("delete edge node %q", n.Name)
	diff := aiPretty(map[string]any{"tool": "delete_node", "node_id": id, "name": n.Name})
	return summary, diff, nil
}

func aiExecDeleteNode(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewNodeRepository(a.con)
	n, err := repo.GetNode(aiInt(args, "node_id"))
	if err != nil || n == nil {
		return "", fmt.Errorf("node %d not found", aiInt(args, "node_id"))
	}
	var instN int64
	_ = a.con.QueryRow(`SELECT COUNT(*) FROM instances WHERE node_id = ?`, n.ID).Scan(&instN)
	if instN > 0 {
		return "", fmt.Errorf("node %q still hosts %d instance(s) — move or delete them first", n.Name, instN)
	}
	name := n.Name
	if err := repo.DeleteNode(n.ID); err != nil {
		return "", fmt.Errorf("delete node failed: %s", aiCap(err.Error(), 300))
	}
	id := n.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryNode, Action: "delete",
		TargetID: &id, TargetLabel: name,
		Message:  fmt.Sprintf("AI assistant deleted edge %q for %s", name, a.username),
	})
	return fmt.Sprintf("deleted edge %q", name), nil
}

// edit / delete instance page.

func aiProposeEditInstancePage(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancePagesKey, permissions.InstancePagesEditKey); err != nil {
		return "", "", fmt.Errorf("denied: editing instance pages needs MANAGE_INSTANCE_PAGES or INSTANCE_PAGES_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "page_id")
	if id == 0 {
		return "", "", fmt.Errorf("page_id is required (use list_instance_pages first — never guess)")
	}
	p, err := repository.NewInstancePageRepository(a.con).Get(id)
	if err != nil || p == nil {
		return "", "", fmt.Errorf("instance page %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
	if !hasAll && hasOwn && p.OwnerID != a.uid {
		return "", "", fmt.Errorf("forbidden: that page belongs to someone else")
	}
	changes := map[string]any{}
	for _, k := range []string{"name", "description", "content_markdown", "content_html"} {
		if v := aiStr(args, k); v != "" {
			changes[k] = v
		}
	}
	if len(changes) == 0 {
		return "", "", fmt.Errorf("nothing to change: provide at least one of name, description, content_markdown, content_html")
	}
	summary := fmt.Sprintf("edit instance page %q", p.Name)
	diff := aiPretty(map[string]any{"tool": "edit_instance_page", "page_id": id, "name": p.Name, "changes": changes})
	return summary, diff, nil
}

func aiExecEditInstancePage(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewInstancePageRepository(a.con)
	p, err := repo.Get(aiInt(args, "page_id"))
	if err != nil || p == nil {
		return "", fmt.Errorf("instance page %d not found", aiInt(args, "page_id"))
	}
	name, desc, md, html := p.Name, p.Description, p.ContentMarkdown, p.ContentHTML
	if v := aiStr(args, "name"); v != "" {
		name = v
	}
	if v, ok := args["description"]; ok {
		desc = aiStr(map[string]any{"v": v}, "v")
	}
	if v := aiStr(args, "content_markdown"); v != "" {
		md = v
	}
	if v := aiStr(args, "content_html"); v != "" {
		html = v
	}
	if md == "" && html == "" {
		return "", fmt.Errorf("one of content_markdown or content_html is required")
	}
	ctype := p.ContentType
	if html != "" {
		ctype = "html"
	} else if md != "" {
		ctype = "markdown"
	}
	slug := p.Slug
	if aiStr(args, "name") != "" && aiStr(args, "slug") == "" {
		// Keep the existing slug stable so linked instances don't break.
		slug = p.Slug
	}
	if err := repo.Update(p.ID, repository.InstancePageInput{
		Name: name, Slug: slug, Kind: p.Kind, Category: p.Category,
		PageType: p.PageType, Description: desc, ContentType: ctype,
		ContentHTML: html, ContentMarkdown: md, ContentBlocks: p.ContentBlocks,
		IconSVG: p.IconSVG, IconColor: p.IconColor, Actions: p.Actions,
		SubPages: p.SubPages, Components: p.Components, Configure: p.Configure,
		OwnerID: p.OwnerID, Source: p.Source, MarketID: p.MarketID,
		MarketVersion: p.MarketVersion,
	}); err != nil {
		return "", fmt.Errorf("edit instance page failed: %s", aiCap(err.Error(), 300))
	}
	id := p.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "update",
		TargetID: &id, TargetLabel: name,
		Message:  fmt.Sprintf("AI assistant edited instance page %q for %s", name, a.username),
	})
	return fmt.Sprintf("edited instance page %q (id %d)", name, p.ID), nil
}

func aiProposeDeleteInstancePage(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageInstancePagesKey, permissions.InstancePagesDeleteKey); err != nil {
		return "", "", fmt.Errorf("denied: deleting instance pages needs MANAGE_INSTANCE_PAGES or INSTANCE_PAGES_DELETE — explain that the user lacks permission")
	}
	id := aiInt(args, "page_id")
	if id == 0 {
		return "", "", fmt.Errorf("page_id is required (use list_instance_pages first — never guess)")
	}
	p, err := repository.NewInstancePageRepository(a.con).Get(id)
	if err != nil || p == nil {
		return "", "", fmt.Errorf("instance page %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.InstancePagesOwnKey, permissions.InstancePagesAllKey, permissions.ManageInstancePagesKey)
	if !hasAll && hasOwn && p.OwnerID != a.uid {
		return "", "", fmt.Errorf("forbidden: that page belongs to someone else")
	}
	summary := fmt.Sprintf("delete instance page %q — irreversible", p.Name)
	diff := aiPretty(map[string]any{"tool": "delete_instance_page", "page_id": id, "name": p.Name})
	return summary, diff, nil
}

func aiExecDeleteInstancePage(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewInstancePageRepository(a.con)
	p, err := repo.Get(aiInt(args, "page_id"))
	if err != nil || p == nil {
		return "", fmt.Errorf("instance page %d not found", aiInt(args, "page_id"))
	}
	name := p.Name
	if err := repo.Delete(p.ID); err != nil {
		return "", fmt.Errorf("delete instance page failed: %s", aiCap(err.Error(), 300))
	}
	id := p.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "delete",
		TargetID: &id, TargetLabel: name,
		Message:  fmt.Sprintf("AI assistant deleted instance page %q for %s", name, a.username),
	})
	return fmt.Sprintf("deleted instance page %q", name), nil
}

// ---------------------------------------------------------------------------
// Panel self-reinstall: same flow as System → Reinstall (POST
// /api/system/reinstall) — download the latest release binary into a temp
// file, verify it, swap it over the running executable (keeping .old for
// rollback), then restart. Nothing runs until the user presses Approve in
// the ConfirmCard, and the caller needs MANAGE_PANEL_UPDATE on top of
// AI Chat Writes.
// ---------------------------------------------------------------------------

func aiProposeReinstallPanel(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.Ensure(a.uid, permissions.ManagePanelUpdateKey); err != nil {
		return "", "", fmt.Errorf("denied: reinstalling the panel needs MANAGE_PANEL_UPDATE — explain that the user lacks permission")
	}
	local := version.Snapshot()
	summary := fmt.Sprintf("reinstall the panel itself to the latest release (now v%s) — the panel WILL restart, expect brief downtime and a chat disconnect", local.Version)
	diff := aiPretty(map[string]any{
		"tool": "reinstall_panel", "local_version": local.Version,
		"source": kspanelBinaryURL, "restart": true,
	})
	return summary, diff, nil
}

func aiExecReinstallPanel(a *aiCallCtx, args map[string]any) (string, error) {
	local := version.Snapshot()
	// Identical staging to ReinstallHandler (download → verify → swap,
	// .old rollback kept). Any failure leaves the live binary untouched
	// and the error lands back in the chat.
	exe, logLines, serr := stagePanelBinary("reinstall")
	if serr != nil {
		var sf *stageFailure
		if errors.As(serr, &sf) {
			return "", fmt.Errorf("panel reinstall failed: %s", aiCap(sf.Msg, 500))
		}
		return "", fmt.Errorf("panel reinstall failed: %s", aiCap(serr.Error(), 500))
	}
	go recordReinstallActivity(local.Version, filepath.Base(exe))
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "self_reinstall",
		TargetLabel: filepath.Base(exe),
		Message:     fmt.Sprintf("AI assistant reinstalled the panel from v%s for %s", local.Version, a.username),
	})
	// Respond FIRST (the approval JSON + thread persist flush before we
	// exit), then relaunch exactly like the System → Reinstall endpoint.
	go func() {
		time.Sleep(600 * time.Millisecond)
		if err := relaunchPanel(exe, logLines); err != nil {
			log.Printf("panel relaunch failed: %v", err)
			os.Exit(1)
		}
		os.Exit(0)
	}()
	return fmt.Sprintf("panel reinstall staged from v%s — restarting now. The chat will disconnect; reload the page in ~30s.", local.Version), nil
}

// ---------------------------------------------------------------------------
// Template install-workflow surgery: remove/add/move a single numbered
// step without rewriting the whole spec. This is what "remove #3 step"
// means — the model reads get_template section=steps (1-based numbers,
// same as users count), proposes the op, the user approves, and only then
// does the spec change. The resulting spec always passes through
// validateTemplateSpec, so an invalid add/move fails closed with the same
// message the Templates page would show.
// ---------------------------------------------------------------------------

// aiTemplateStepsPlan is one validated install-step op applied to a
// template's spec, ready to save.
type aiTemplateStepsPlan struct {
	tmpl    *models.Template
	spec    map[string]any
	summary string
	diff    map[string]any
}

func aiPlanTemplateSteps(a *aiCallCtx, args map[string]any) (*aiTemplateStepsPlan, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageTemplatesKey, permissions.TemplatesEditKey); err != nil {
		return nil, fmt.Errorf("denied: editing template workflows needs MANAGE_TEMPLATES or TEMPLATES_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "template_id")
	if id == 0 {
		return nil, fmt.Errorf("template_id is required (use list_templates first — never guess)")
	}
	op := strings.ToLower(aiStr(args, "op"))
	if op != "remove" && op != "add" && op != "move" {
		return nil, fmt.Errorf("op must be one of: remove, add, move")
	}
	tmpl, err := repository.NewTemplateRepository(a.con).Get(id)
	if err != nil || tmpl == nil {
		return nil, fmt.Errorf("template %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
	if !hasAll && hasOwn && tmpl.OwnerID != a.uid {
		return nil, fmt.Errorf("forbidden: that template belongs to someone else")
	}
	var spec map[string]any
	if strings.TrimSpace(tmpl.Spec) != "" {
		if err := json.Unmarshal([]byte(tmpl.Spec), &spec); err != nil {
			return nil, fmt.Errorf("stored spec is corrupt, cannot edit steps")
		}
	}
	if spec == nil {
		spec = map[string]any{}
	}
	var install []any
	if raw, ok := spec["install"].([]any); ok {
		install = append([]any{}, raw...)
	}
	// at converts a 1-based step number (as shown by get_template) to a
	// slice index, failing closed on out-of-range numbers.
	at := func(n int64) (int, error) {
		if n < 1 || n > int64(len(install)) {
			return 0, fmt.Errorf("step %d is out of range (the workflow has %d steps — see get_template section=steps)", n, len(install))
		}
		return int(n - 1), nil
	}
	stepMap := func(v any) map[string]any {
		m, _ := v.(map[string]any)
		if m == nil {
			m = map[string]any{}
		}
		return m
	}
	var summary string
	diff := map[string]any{"tool": "edit_template_steps", "template_id": id, "name": tmpl.Name, "op": op}
	switch op {
	case "remove":
		idx, err := at(aiInt(args, "step_number"))
		if err != nil {
			return nil, err
		}
		removed := aiTemplateStepSummary(idx, stepMap(install[idx]))
		install = append(install[:idx], install[idx+1:]...)
		summary = fmt.Sprintf("remove install step %s from template %q (%d steps remain)", removed, tmpl.Name, len(install))
		diff["removed"] = removed
	case "add":
		rawStep := aiStr(args, "step")
		if rawStep == "" {
			return nil, fmt.Errorf("step is required for add (a JSON object string like {\"action\":\"shell\",\"command\":\"...\"})")
		}
		var step map[string]any
		if err := json.Unmarshal([]byte(rawStep), &step); err != nil {
			return nil, fmt.Errorf("step must be a valid JSON object: %s", aiCap(err.Error(), 200))
		}
		idx := len(install)
		if pos := aiInt(args, "position"); pos != 0 {
			if pos < 1 || pos > int64(len(install)+1) {
				return nil, fmt.Errorf("position %d is out of range (1-%d for this workflow)", pos, len(install)+1)
			}
			idx = int(pos - 1)
		}
		install = append(install, nil)
		copy(install[idx+1:], install[idx:])
		install[idx] = step
		added := aiTemplateStepSummary(idx, step)
		summary = fmt.Sprintf("add install step %s to template %q at position %d", added, tmpl.Name, idx+1)
		diff["added"] = added
		diff["position"] = idx + 1
	case "move":
		idx, err := at(aiInt(args, "step_number"))
		if err != nil {
			return nil, err
		}
		pos := aiInt(args, "position")
		if pos == 0 {
			return nil, fmt.Errorf("position is required for move (1-based target position)")
		}
		if pos < 1 || pos > int64(len(install)) {
			return nil, fmt.Errorf("position %d is out of range (1-%d for this workflow)", pos, len(install))
		}
		step := install[idx]
		install = append(install[:idx], install[idx+1:]...)
		to := int(pos - 1)
		if to > len(install) {
			to = len(install)
		}
		install = append(install, nil)
		copy(install[to+1:], install[to:])
		install[to] = step
		moved := aiTemplateStepSummary(to, stepMap(step))
		summary = fmt.Sprintf("move install step to position %d in template %q (now %s)", to+1, tmpl.Name, moved)
		diff["moved"] = moved
		diff["position"] = to + 1
	}
	spec["install"] = install
	if err := validateTemplateSpec(spec); err != nil {
		return nil, fmt.Errorf("resulting workflow is invalid: %s", aiCap(err.Error(), 300))
	}
	diff["resulting_step_count"] = len(install)
	return &aiTemplateStepsPlan{tmpl: tmpl, spec: spec, summary: summary, diff: diff}, nil
}

func aiProposeEditTemplateSteps(a *aiCallCtx, args map[string]any) (string, string, error) {
	plan, err := aiPlanTemplateSteps(a, args)
	if err != nil {
		return "", "", err
	}
	return plan.summary, aiPretty(plan.diff), nil
}

func aiExecEditTemplateSteps(a *aiCallCtx, args map[string]any) (string, error) {
	plan, err := aiPlanTemplateSteps(a, args)
	if err != nil {
		return "", err
	}
	specBytes, err := json.Marshal(plan.spec)
	if err != nil {
		return "", fmt.Errorf("server error")
	}
	tmpl := plan.tmpl
	if err := repository.NewTemplateRepository(a.con).Update(tmpl.ID, repository.TemplateInput{
		Name: tmpl.Name, Description: tmpl.Description, Kind: tmpl.Kind,
		Image: tmpl.Image, Spec: string(specBytes), Icon: tmpl.Icon, Color: tmpl.Color,
	}); err != nil {
		return "", fmt.Errorf("edit workflow failed: %s", aiCap(err.Error(), 300))
	}
	id := tmpl.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryTemplate, Action: "update",
		TargetID: &id, TargetLabel: tmpl.Name,
		Message:  fmt.Sprintf("AI assistant edited install workflow of template %q for %s: %s", tmpl.Name, a.username, plan.summary),
	})
	return plan.summary, nil
}

// ---------------------------------------------------------------------------
// Template runtime surgery: startup command + action buttons. Setting the
// command is how a service autostarts when its container starts (e.g. run
// java directly instead of idling); removing the action button drops the
// manual Start the autostart replaces. Both re-validate the full spec and
// preserve every other field.
// ---------------------------------------------------------------------------

func aiLoadTemplateSpec(a *aiCallCtx, id int64) (*models.Template, map[string]any, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageTemplatesKey, permissions.TemplatesEditKey); err != nil {
		return nil, nil, fmt.Errorf("denied: editing templates needs MANAGE_TEMPLATES or TEMPLATES_EDIT — explain that the user lacks permission")
	}
	if id == 0 {
		return nil, nil, fmt.Errorf("template_id is required (use list_templates first — never guess)")
	}
	tmpl, err := repository.NewTemplateRepository(a.con).Get(id)
	if err != nil || tmpl == nil {
		return nil, nil, fmt.Errorf("template %d not found", id)
	}
	hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.TemplatesOwnKey, permissions.TemplatesAllKey, permissions.ManageTemplatesKey)
	if !hasAll && hasOwn && tmpl.OwnerID != a.uid {
		return nil, nil, fmt.Errorf("forbidden: that template belongs to someone else")
	}
	var spec map[string]any
	if strings.TrimSpace(tmpl.Spec) != "" {
		if err := json.Unmarshal([]byte(tmpl.Spec), &spec); err != nil {
			return nil, nil, fmt.Errorf("stored spec is corrupt, cannot edit")
		}
	}
	if spec == nil {
		spec = map[string]any{}
	}
	return tmpl, spec, nil
}

func aiSaveTemplateSpec(a *aiCallCtx, tmpl *models.Template, spec map[string]any, what string) (string, error) {
	if err := validateTemplateSpec(spec); err != nil {
		return "", fmt.Errorf("resulting template is invalid: %s", aiCap(err.Error(), 300))
	}
	specBytes, err := json.Marshal(spec)
	if err != nil {
		return "", fmt.Errorf("server error")
	}
	if err := repository.NewTemplateRepository(a.con).Update(tmpl.ID, repository.TemplateInput{
		Name: tmpl.Name, Description: tmpl.Description, Kind: tmpl.Kind,
		Image: tmpl.Image, Spec: string(specBytes), Icon: tmpl.Icon, Color: tmpl.Color,
	}); err != nil {
		return "", fmt.Errorf("edit failed: %s", aiCap(err.Error(), 300))
	}
	id := tmpl.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryTemplate, Action: "update",
		TargetID: &id, TargetLabel: tmpl.Name,
		Message:  fmt.Sprintf("AI assistant %s for %s", what, a.username),
	})
	return what, nil
}

// aiParseTemplateCommand validates the exec-form startup command: a JSON
// array of 1-20 non-empty strings, 2000 chars total. Pure (unit-tested).
func aiParseTemplateCommand(raw string) ([]any, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("command is required (a JSON array string like [\"sh\",\"-c\",\"...\"])")
	}
	var arr []any
	if err := json.Unmarshal([]byte(raw), &arr); err != nil {
		return nil, fmt.Errorf("command must be a valid JSON array: %s", aiCap(err.Error(), 200))
	}
	if len(arr) == 0 || len(arr) > 20 {
		return nil, fmt.Errorf("command must hold 1-20 elements")
	}
	total := 0
	for i, e := range arr {
		s, ok := e.(string)
		if !ok || strings.TrimSpace(s) == "" {
			return nil, fmt.Errorf("command[%d] must be a non-empty string", i)
		}
		total += len(s)
	}
	if total > 2000 {
		return nil, fmt.Errorf("command is too long (max 2000 chars total)")
	}
	return arr, nil
}

func aiProposeSetTemplateCommand(a *aiCallCtx, args map[string]any) (string, string, error) {
	tmpl, _, err := aiLoadTemplateSpec(a, aiInt(args, "template_id"))
	if err != nil {
		return "", "", err
	}
	if _, err := aiParseTemplateCommand(aiStr(args, "command")); err != nil {
		return "", "", err
	}
	old, _ := aiTemplateRuntime(tmpl)
	summary := fmt.Sprintf("set startup command of template %q (container start will run it directly)", tmpl.Name)
	diff := aiPretty(map[string]any{
		"tool": "set_template_command", "template_id": tmpl.ID, "name": tmpl.Name,
		"old_command": old, "new_command": aiCap(aiStr(args, "command"), 500),
	})
	return summary, diff, nil
}

func aiExecSetTemplateCommand(a *aiCallCtx, args map[string]any) (string, error) {
	tmpl, spec, err := aiLoadTemplateSpec(a, aiInt(args, "template_id"))
	if err != nil {
		return "", err
	}
	arr, err := aiParseTemplateCommand(aiStr(args, "command"))
	if err != nil {
		return "", err
	}
	spec["command"] = arr
	return aiSaveTemplateSpec(a, tmpl, spec, fmt.Sprintf("set startup command of template %q — new containers (and restarts) run it on start", tmpl.Name))
}

func aiProposeRemoveTemplateAction(a *aiCallCtx, args map[string]any) (string, string, error) {
	tmpl, spec, err := aiLoadTemplateSpec(a, aiInt(args, "template_id"))
	if err != nil {
		return "", "", err
	}
	want := strings.TrimSpace(aiStr(args, "action_id"))
	if want == "" {
		return "", "", fmt.Errorf("action_id is required (see get_template section=runtime — never guess)")
	}
	raw, _ := spec["actions"].([]any)
	idx := -1
	var label string
	for i, v := range raw {
		m, _ := v.(map[string]any)
		if m == nil {
			continue
		}
		if aiStr(m, "id") == want {
			idx, label = i, aiStr(m, "name")
			break
		}
	}
	if idx < 0 {
		ids := []string{}
		for _, v := range raw {
			if m, ok := v.(map[string]any); ok && aiStr(m, "id") != "" {
				ids = append(ids, aiStr(m, "id"))
			}
		}
		if len(ids) == 0 {
			return "", "", fmt.Errorf("template %q has no action buttons at all", tmpl.Name)
		}
		return "", "", fmt.Errorf("no action %q (available: %s)", want, strings.Join(ids, ", "))
	}
	if label == "" {
		label = want
	}
	summary := fmt.Sprintf("remove action button %q (%s) from template %q", label, want, tmpl.Name)
	diff := aiPretty(map[string]any{"tool": "remove_template_action", "template_id": tmpl.ID, "name": tmpl.Name, "removed_action": want, "label": label})
	return summary, diff, nil
}

func aiExecRemoveTemplateAction(a *aiCallCtx, args map[string]any) (string, error) {
	tmpl, spec, err := aiLoadTemplateSpec(a, aiInt(args, "template_id"))
	if err != nil {
		return "", err
	}
	want := strings.TrimSpace(aiStr(args, "action_id"))
	raw, _ := spec["actions"].([]any)
	kept := make([]any, 0, len(raw))
	found := ""
	for _, v := range raw {
		m, _ := v.(map[string]any)
		if m != nil && aiStr(m, "id") == want {
			found = aiStr(m, "name")
			continue
		}
		kept = append(kept, v)
	}
	if found == "" && len(kept) == len(raw) {
		return "", fmt.Errorf("no action %q on template %q", want, tmpl.Name)
	}
	if found == "" {
		found = want
	}
	spec["actions"] = kept
	return aiSaveTemplateSpec(a, tmpl, spec, fmt.Sprintf("removed action button %q (%s) from template %q", found, want, tmpl.Name))
}

// ---------------------------------------------------------------------------
// Users & roles: full account admin (create_user already existed).
// Password data never appears in tool output (models.User hides the hash;
// edit covers username/email/role only — resets stay on the Users page so
// no secret ever lands in a persisted approval ticket).
// ---------------------------------------------------------------------------

type aiUserEdit struct {
	user     *models.User
	username string
	email    string
	roleID   int64
	roleName string
}

func aiPlanUserEdit(a *aiCallCtx, args map[string]any) (*aiUserEdit, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageUsersKey, permissions.UsersEditKey); err != nil {
		return nil, fmt.Errorf("denied: editing users needs MANAGE_USERS or USERS_EDIT — explain that the user lacks permission")
	}
	id := aiInt(args, "user_id")
	if id == 0 {
		return nil, fmt.Errorf("user_id is required (use list_users first — never guess)")
	}
	u, err := repository.NewUserRepository(a.con).GetByID(id)
	if err != nil || u == nil {
		return nil, fmt.Errorf("user %d not found", id)
	}
	if aiUserScope(a) && id != a.uid {
		return nil, fmt.Errorf("forbidden: that account belongs to someone else")
	}
	username, email, roleID, roleName := u.Username, u.Email, u.RoleID, aiRoleName(a.con, u.RoleID)
	if v := aiStr(args, "username"); v != "" {
		username = v
	}
	if v, ok := args["email"]; ok {
		email = aiStr(map[string]any{"v": v}, "v")
		if email == "" {
			return nil, fmt.Errorf("email cannot be empty")
		}
	}
	if v := aiStr(args, "role"); v != "" {
		role, err := repository.NewRoleRepository(a.con).GetRoleByName(v)
		if err != nil {
			return nil, fmt.Errorf("role %q does not exist (use list_roles first — never guess)", v)
		}
		roleID, roleName = role.ID, role.Name
	}
	if username == u.Username && email == u.Email && roleID == u.RoleID {
		return nil, fmt.Errorf("nothing to change: provide username, email and/or role")
	}
	return &aiUserEdit{user: u, username: username, email: email, roleID: roleID, roleName: roleName}, nil
}

func aiProposeEditUser(a *aiCallCtx, args map[string]any) (string, string, error) {
	plan, err := aiPlanUserEdit(a, args)
	if err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("edit user %q → username=%q email=%q role=%q", plan.user.Username, plan.username, plan.email, plan.roleName)
	diff := aiPretty(map[string]any{"tool": "edit_user", "user_id": plan.user.ID, "username": plan.username, "email": plan.email, "role": plan.roleName})
	return summary, diff, nil
}

func aiExecEditUser(a *aiCallCtx, args map[string]any) (string, error) {
	plan, err := aiPlanUserEdit(a, args)
	if err != nil {
		return "", err
	}
	if err := repository.NewUserRepository(a.con).UpdateUser(plan.user.ID, plan.username, plan.email, plan.roleID, ""); err != nil {
		return "", fmt.Errorf("could not update user (username/email may already exist)")
	}
	id := plan.user.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryUser, Action: "update",
		TargetID: &id, TargetLabel: plan.username,
		Message:  fmt.Sprintf("AI assistant updated user %q (role=%s) for %s", plan.username, plan.roleName, a.username),
	})
	return fmt.Sprintf("updated user %q (role %q)", plan.username, plan.roleName), nil
}

func aiProposeDeleteUser(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageUsersKey, permissions.UsersDeleteKey); err != nil {
		return "", "", fmt.Errorf("denied: deleting users needs MANAGE_USERS or USERS_DELETE — explain that the user lacks permission")
	}
	id := aiInt(args, "user_id")
	if id == 0 {
		return "", "", fmt.Errorf("user_id is required (use list_users first — never guess)")
	}
	if id == a.uid {
		return "", "", fmt.Errorf("you cannot delete your own account")
	}
	u, err := repository.NewUserRepository(a.con).GetByID(id)
	if err != nil || u == nil {
		return "", "", fmt.Errorf("user %d not found", id)
	}
	if aiUserScope(a) {
		return "", "", fmt.Errorf("forbidden: that account belongs to someone else")
	}
	summary := fmt.Sprintf("delete user %q (<%s>) — irreversible", u.Username, u.Email)
	diff := aiPretty(map[string]any{"tool": "delete_user", "user_id": id, "username": u.Username})
	return summary, diff, nil
}

func aiExecDeleteUser(a *aiCallCtx, args map[string]any) (string, error) {
	id := aiInt(args, "user_id")
	u, err := repository.NewUserRepository(a.con).GetByID(id)
	if err != nil || u == nil {
		return "", fmt.Errorf("user %d not found", id)
	}
	name := u.Username
	if err := repository.NewUserRepository(a.con).DeleteUser(id, a.uid); err != nil {
		return "", fmt.Errorf("delete failed: %s", aiCap(err.Error(), 300))
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryUser, Action: "delete",
		TargetID: &id, TargetLabel: name,
		Message:  fmt.Sprintf("AI assistant deleted user %q for %s", name, a.username),
	})
	return fmt.Sprintf("deleted user %q", name), nil
}

// ---------------------------------------------------------------------------
// Themes: list/edit/delete to complete create_theme. Mirrors the route
// gates (EDIT for update/delete) plus the handler's own-scope rule, and
// snapshots a revision before every overwrite like UpdateThemeHandler.
// ---------------------------------------------------------------------------

func aiCheckThemeScope(a *aiCallCtx, t *models.Theme) error {
	if t.Builtin || t.OwnerID != a.uid {
		hasOwn, hasAll, _ := a.checker.HasScope(a.uid, permissions.ThemesOwnKey, permissions.ThemesAllKey, permissions.ManageThemesKey)
		if !hasAll && hasOwn {
			return fmt.Errorf("forbidden: own-scope may only edit themes you authored")
		}
	}
	return nil
}

func aiProposeEditTheme(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageThemesKey, permissions.EditThemesKey); err != nil {
		return "", "", fmt.Errorf("denied: editing themes needs MANAGE_THEMES or EDIT_THEMES — explain that the user lacks permission")
	}
	id := aiStr(args, "theme_id")
	if id == "" {
		return "", "", fmt.Errorf("theme_id is required (use list_themes first — never guess)")
	}
	t, err := repository.NewThemeRepository(a.con).GetTheme(id)
	if err != nil || t == nil {
		return "", "", fmt.Errorf("theme %q not found", id)
	}
	if err := aiCheckThemeScope(a, t); err != nil {
		return "", "", err
	}
	changes := map[string]any{}
	if v := aiStr(args, "name"); v != "" {
		changes["name"] = v
	}
	if v, ok := args["description"]; ok {
		changes["description"] = aiStr(map[string]any{"v": v}, "v")
	}
	if v := aiStr(args, "spec"); v != "" {
		var js map[string]any
		if err := json.Unmarshal([]byte(v), &js); err != nil {
			return "", "", fmt.Errorf("spec must be a valid JSON object string")
		}
		changes["spec"] = "(new spec JSON)"
	}
	if len(changes) == 0 {
		return "", "", fmt.Errorf("nothing to change: provide at least one of name, description, spec")
	}
	summary := fmt.Sprintf("edit global theme %q", t.Name)
	diff := aiPretty(map[string]any{"tool": "edit_theme", "theme_id": id, "name": t.Name, "changes": changes})
	return summary, diff, nil
}

func aiExecEditTheme(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewThemeRepository(a.con)
	id := aiStr(args, "theme_id")
	t, err := repo.GetTheme(id)
	if err != nil || t == nil {
		return "", fmt.Errorf("theme %q not found", id)
	}
	name, desc, spec := t.Name, t.Description, string(t.Spec)
	if v := aiStr(args, "name"); v != "" {
		name = v
	}
	if v, ok := args["description"]; ok {
		desc = aiStr(map[string]any{"v": v}, "v")
	}
	if v := aiStr(args, "spec"); v != "" {
		spec = v
	}
	if name == "" || !json.Valid([]byte(spec)) {
		return "", fmt.Errorf("name and a valid JSON spec are required")
	}
	// Revision snapshot first (mirrors UpdateThemeHandler) so the
	// overwrite stays reversible from the theme version history.
	if next, nerr := repo.NextRevision(id); nerr == nil {
		_, _ = repo.CreateRevision(id, next, t.Name, t.Description, t.Spec, a.uid)
	}
	if _, err := repo.UpdateTheme(id, name, desc, json.RawMessage(spec)); err != nil {
		return "", fmt.Errorf("edit theme failed: %s", aiCap(err.Error(), 300))
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "update",
		TargetLabel: name,
		Message:     fmt.Sprintf("AI assistant edited global theme %q for %s", name, a.username),
	})
	return fmt.Sprintf("edited global theme %q", name), nil
}

func aiProposeDeleteTheme(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageThemesKey, permissions.EditThemesKey); err != nil {
		return "", "", fmt.Errorf("denied: deleting themes needs MANAGE_THEMES or EDIT_THEMES — explain that the user lacks permission")
	}
	id := aiStr(args, "theme_id")
	if id == "" {
		return "", "", fmt.Errorf("theme_id is required (use list_themes first — never guess)")
	}
	t, err := repository.NewThemeRepository(a.con).GetTheme(id)
	if err != nil || t == nil {
		return "", "", fmt.Errorf("theme %q not found", id)
	}
	if err := aiCheckThemeScope(a, t); err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("delete global theme %q — pages using it fall back to default", t.Name)
	diff := aiPretty(map[string]any{"tool": "delete_theme", "theme_id": id, "name": t.Name})
	return summary, diff, nil
}

func aiExecDeleteTheme(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewThemeRepository(a.con)
	id := aiStr(args, "theme_id")
	t, err := repo.GetTheme(id)
	if err != nil || t == nil {
		return "", fmt.Errorf("theme %q not found", id)
	}
	name := t.Name
	if err := repo.DeleteTheme(id); err != nil {
		return "", fmt.Errorf("delete theme failed: %s", aiCap(err.Error(), 300))
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "delete",
		TargetLabel: name,
		Message:     fmt.Sprintf("AI assistant deleted global theme %q for %s", name, a.username),
	})
	return fmt.Sprintf("deleted global theme %q", name), nil
}

// ---------------------------------------------------------------------------
// Tickets: full support lifecycle (list/get/create/reply/update). Mirrors
// the route + handler policy: staff sees everything, everyone else only
// their own/assigned tickets; only staff triages (status/assign/escalate)
// or posts internal notes; closed tickets refuse replies.
// ---------------------------------------------------------------------------

func aiTicketWriteGate(a *aiCallCtx, keys ...string) error {
	if err := a.checker.EnsureAny(a.uid, keys...); err != nil {
		return fmt.Errorf("denied: this ticket action needs a Tickets grant (ask an admin for MANAGE_TICKETS or the matching TICKETS_* permission)")
	}
	return nil
}

func aiProposeCreateTicket(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := aiTicketWriteGate(a, permissions.ManageTicketsKey, permissions.TicketsCreateKey); err != nil {
		return "", "", err
	}
	subject := aiStr(args, "subject")
	if subject == "" {
		return "", "", fmt.Errorf("subject is required")
	}
	if len(subject) > 200 {
		return "", "", fmt.Errorf("subject must be 200 characters or fewer")
	}
	category := aiStr(args, "category")
	if category == "" {
		category = "general"
	}
	if !models.ValidTicketCategories[category] {
		return "", "", fmt.Errorf("invalid category (one of: general, billing, technical, feature, bug, abuse, other)")
	}
	priority := aiStr(args, "priority")
	if priority == "" {
		priority = "medium"
	}
	if !models.ValidTicketPriorities[priority] {
		return "", "", fmt.Errorf("invalid priority (one of: low, medium, high, urgent, critical)")
	}
	if len(aiStr(args, "description")) > 10000 {
		return "", "", fmt.Errorf("description must be 10000 characters or fewer")
	}
	summary := fmt.Sprintf("open %s-priority %s ticket %q", priority, category, subject)
	diff := aiPretty(map[string]any{"tool": "create_ticket", "subject": subject, "category": category, "priority": priority})
	return summary, diff, nil
}

func aiExecCreateTicket(a *aiCallCtx, args map[string]any) (string, error) {
	category, priority := aiStr(args, "category"), aiStr(args, "priority")
	if category == "" {
		category = "general"
	}
	if priority == "" {
		priority = "medium"
	}
	tk, err := repository.NewTicketRepository(a.con).Create(repository.CreateTicketInput{
		Subject: aiStr(args, "subject"), Description: aiStr(args, "description"),
		Category: category, Priority: priority, CreatedBy: a.uid, Tags: "[]",
	})
	if err != nil {
		return "", fmt.Errorf("could not open ticket: %s", aiCap(err.Error(), 300))
	}
	notifyTicketCreated(a.r, a.con, tk, a.uid)
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryTicket, Action: "create",
		TargetID: &tk.ID, TargetLabel: tk.TicketNo,
		Message:  fmt.Sprintf("AI assistant opened ticket %s %q for %s", tk.TicketNo, tk.Subject, a.username),
	})
	return fmt.Sprintf("opened ticket %s %q", tk.TicketNo, tk.Subject), nil
}

func aiProposeReplyTicket(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := aiTicketWriteGate(a, permissions.ManageTicketsKey, permissions.TicketsViewKey, permissions.TicketsCreateKey, permissions.TicketsEditKey); err != nil {
		return "", "", err
	}
	id := aiInt(args, "ticket_id")
	msg := aiStr(args, "message")
	if id == 0 {
		return "", "", fmt.Errorf("ticket_id is required (use list_tickets first — never guess)")
	}
	if msg == "" {
		return "", "", fmt.Errorf("message is required")
	}
	if len(msg) > 10000 {
		return "", "", fmt.Errorf("message must be 10000 characters or fewer")
	}
	tk, err := repository.NewTicketRepository(a.con).Get(id)
	if err != nil || tk == nil {
		return "", "", fmt.Errorf("ticket %d not found", id)
	}
	if err := aiTicketAccess(a, tk); err != nil {
		return "", "", err
	}
	if tk.Status == "closed" {
		return "", "", fmt.Errorf("ticket %s is closed — reopen it first (update_ticket status)", tk.TicketNo)
	}
	internal := aiStr(args, "internal") == "true"
	if internal && !canSeeInternal(a.con, a.uid) {
		return "", "", fmt.Errorf("only staff can post internal notes")
	}
	kind := "reply"
	if internal {
		kind = "internal note"
	}
	summary := fmt.Sprintf("post %s on ticket %s %q", kind, tk.TicketNo, tk.Subject)
	diff := aiPretty(map[string]any{"tool": "reply_ticket", "ticket_id": id, "ticket_no": tk.TicketNo, "internal": internal, "message": aiCap(msg, 500)})
	return summary, diff, nil
}

func aiExecReplyTicket(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewTicketRepository(a.con)
	tk, err := repo.Get(aiInt(args, "ticket_id"))
	if err != nil || tk == nil {
		return "", fmt.Errorf("ticket %d not found", aiInt(args, "ticket_id"))
	}
	msg := aiStr(args, "message")
	internal := aiStr(args, "internal") == "true"
	if _, err := repo.AddComment(tk.ID, a.uid, msg, internal); err != nil {
		return "", fmt.Errorf("could not post reply: %s", aiCap(err.Error(), 300))
	}
	// First staff reply stamps SLA first-response (mirrors the handler).
	if canSeeInternal(a.con, a.uid) {
		_ = repo.MarkFirstResponse(tk.ID, time.Now().UTC())
	}
	notifyTicketReplied(a.r, a.con, tk, a.uid, msg, internal)
	id := tk.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryTicket, Action: "comment",
		TargetID: &id, TargetLabel: tk.TicketNo,
		Message:  fmt.Sprintf("AI assistant replied to ticket %s for %s", tk.TicketNo, a.username),
	})
	return fmt.Sprintf("replied to ticket %s", tk.TicketNo), nil
}

type aiTicketUpdate struct {
	tk   *models.Ticket
	in   repository.UpdateTicketInput
	note []string
}

func aiPlanTicketUpdate(a *aiCallCtx, args map[string]any) (*aiTicketUpdate, error) {
	if err := aiTicketWriteGate(a, permissions.ManageTicketsKey, permissions.TicketsViewKey, permissions.TicketsCreateKey, permissions.TicketsEditKey, permissions.TicketsDeleteKey); err != nil {
		return nil, err
	}
	id := aiInt(args, "ticket_id")
	if id == 0 {
		return nil, fmt.Errorf("ticket_id is required (use list_tickets first — never guess)")
	}
	repo := repository.NewTicketRepository(a.con)
	tk, err := repo.Get(id)
	if err != nil || tk == nil {
		return nil, fmt.Errorf("ticket %d not found", id)
	}
	isOwner := tk.CreatedBy == a.uid
	isStaff := canSeeInternal(a.con, a.uid)
	if !isOwner && !isStaff {
		if tk.AssignedTo == nil || *tk.AssignedTo != a.uid {
			return nil, fmt.Errorf("forbidden: that ticket belongs to someone else")
		}
	}
	var in repository.UpdateTicketInput
	var note []string
	if v, ok := args["subject"]; ok {
		s := aiStr(map[string]any{"v": v}, "v")
		if s == "" {
			return nil, fmt.Errorf("subject cannot be empty")
		}
		if len(s) > 200 {
			return nil, fmt.Errorf("subject must be 200 characters or fewer")
		}
		in.Subject = &s
		note = append(note, "subject updated")
	}
	if v, ok := args["description"]; ok {
		s := aiStr(map[string]any{"v": v}, "v")
		if len(s) > 10000 {
			return nil, fmt.Errorf("description must be 10000 characters or fewer")
		}
		in.Description = &s
		note = append(note, "description updated")
	}
	if v := aiStr(args, "category"); v != "" {
		if !models.ValidTicketCategories[v] {
			return nil, fmt.Errorf("invalid category (one of: general, billing, technical, feature, bug, abuse, other)")
		}
		in.Category = &v
		note = append(note, "category → "+v)
	}
	if v := aiStr(args, "priority"); v != "" {
		if !models.ValidTicketPriorities[v] {
			return nil, fmt.Errorf("invalid priority (one of: low, medium, high, urgent, critical)")
		}
		if !isStaff && (v == "high" || v == "urgent" || v == "critical") {
			return nil, fmt.Errorf("only staff can escalate priority to %q", v)
		}
		in.Priority = &v
		note = append(note, "priority → "+v)
	}
	if v := aiStr(args, "status"); v != "" {
		if !models.ValidTicketStatuses[v] {
			return nil, fmt.Errorf("invalid status (one of: open, pending, in_progress, resolved, closed)")
		}
		if !isStaff {
			return nil, fmt.Errorf("only staff can change status")
		}
		in.Status = &v
		note = append(note, "status → "+v)
	}
	if v, ok := args["assigned_to"]; ok {
		if !isStaff {
			return nil, fmt.Errorf("only staff can assign tickets")
		}
		raw := aiStr(map[string]any{"v": v}, "v")
		in.AssignedSet = true
		if raw == "" || raw == "0" || strings.EqualFold(raw, "none") {
			note = append(note, "unassigned")
		} else {
			var uid int64
			if n, err := strconv.ParseInt(raw, 10, 64); err == nil {
				uid = n
			} else if u, gerr := repository.NewUserRepository(a.con).GetByUsername(raw); gerr == nil && u != nil {
				uid = u.ID
			} else {
				return nil, fmt.Errorf("assignee %q not found (use a user id or username from list_users)", raw)
			}
			if _, gerr := repository.NewUserRepository(a.con).GetByID(uid); gerr != nil {
				return nil, fmt.Errorf("assignee %d not found", uid)
			}
			in.AssignedTo = &uid
			note = append(note, "assigned → "+raw)
		}
	}
	if len(note) == 0 {
		return nil, fmt.Errorf("nothing to change: provide status, priority, assigned_to, subject, description and/or category")
	}
	return &aiTicketUpdate{tk: tk, in: in, note: note}, nil
}

func aiProposeUpdateTicket(a *aiCallCtx, args map[string]any) (string, string, error) {
	plan, err := aiPlanTicketUpdate(a, args)
	if err != nil {
		return "", "", err
	}
	summary := fmt.Sprintf("triage ticket %s %q: %s", plan.tk.TicketNo, plan.tk.Subject, strings.Join(plan.note, ", "))
	diff := aiPretty(map[string]any{"tool": "update_ticket", "ticket_id": plan.tk.ID, "ticket_no": plan.tk.TicketNo, "changes": plan.note})
	return summary, diff, nil
}

func aiExecUpdateTicket(a *aiCallCtx, args map[string]any) (string, error) {
	plan, err := aiPlanTicketUpdate(a, args)
	if err != nil {
		return "", err
	}
	updated, err := repository.NewTicketRepository(a.con).Update(plan.tk.ID, plan.in)
	if err != nil {
		return "", fmt.Errorf("could not update ticket: %s", aiCap(err.Error(), 300))
	}
	id := plan.tk.ID
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategoryTicket, Action: "update",
		TargetID: &id, TargetLabel: plan.tk.TicketNo,
		Message:  fmt.Sprintf("AI assistant triaged ticket %s for %s: %s", plan.tk.TicketNo, a.username, strings.Join(plan.note, ", ")),
	})
	return fmt.Sprintf("ticket %s updated (%s, now %s)", updated.TicketNo, strings.Join(plan.note, ", "), updated.Status), nil
}

// ---------------------------------------------------------------------------
// Notifications: admin announcements to every inbox. Mirrors the broadcast
// path of the notification API (fan-out + realtime push + activity log).
// ---------------------------------------------------------------------------

func aiProposeBroadcast(a *aiCallCtx, args map[string]any) (string, string, error) {
	if err := a.checker.EnsureAny(a.uid, permissions.ManageNotificationsKey, permissions.NotificationsCreateKey); err != nil {
		return "", "", fmt.Errorf("denied: broadcasting needs MANAGE_NOTIFICATIONS or NOTIFICATIONS_CREATE — explain that the user lacks permission")
	}
	title, msg := aiStr(args, "title"), aiStr(args, "message")
	if title == "" || msg == "" {
		return "", "", fmt.Errorf("title and message are both required")
	}
	var n int64
	_ = a.con.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	summary := fmt.Sprintf("broadcast announcement %q to %d user(s)", title, n)
	diff := aiPretty(map[string]any{"tool": "broadcast_notification", "title": title, "message": aiCap(msg, 500), "recipients": n})
	return summary, diff, nil
}

func aiExecBroadcast(a *aiCallCtx, args map[string]any) (string, error) {
	repo := repository.NewNotificationRepository(a.con)
	ids, err := repo.ListAllUserIDs()
	if err != nil {
		return "", fmt.Errorf("server error")
	}
	actor := a.uid
	fanned, err := repo.CreateBroadcast(repository.CreateNotificationInput{
		ActorID: &actor, ActorName: a.username,
		Category: models.NotificationCategoryGeneral, Priority: models.NotificationPriorityNormal,
		Title: aiStr(args, "title"), Message: aiStr(args, "message"), IsBroadcast: true,
	}, ids)
	if err != nil {
		return "", fmt.Errorf("broadcast failed: %s", aiCap(err.Error(), 300))
	}
	for i, uid := range ids {
		if i < len(fanned) {
			pushAndMailNotification(a.con, repo, uid, fanned[i])
		}
	}
	RecordActivity(a.r, repository.ActivityInput{
		Category: models.ActivityCategorySystem, Action: "notify_broadcast",
		TargetLabel: aiStr(args, "title"),
		Message:     fmt.Sprintf("AI assistant broadcast %q to %d user(s) for %s", aiStr(args, "title"), len(fanned), a.username),
	})
	return fmt.Sprintf("broadcast %q to %d user(s)", aiStr(args, "title"), len(fanned)), nil
}
