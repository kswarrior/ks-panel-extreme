package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/edge"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
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
	probe := cfg
	probe.MaxTokens = 16
	if probe.MaxTokens > cfg.MaxTokens {
		probe.MaxTokens = cfg.MaxTokens
	}
	content, _, _, err := aiProviderChat(ctx, probe, []aiMsg{
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
	b.WriteString("\n\nRules: only use the tools you were given; call a list tool before acting on any named resource; never invent IDs — if the user names something, look it up first; keep answers short. Write tools (instance_action, update_settings, create_theme, create_template, create_instance_page, create_user, deploy_instance) do NOT execute immediately: calling one returns a confirmation ticket that the user must approve in the UI. After calling a write tool, briefly summarise what will happen and ask the user to approve it in the confirmation card.")
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
		mk("get_docs", "Read the built-in panel documentation for a topic.", obj(map[string]any{
			"topic": aiStrProp("one of: index, instances, templates, nodes, mods, applications, tickets, backups, security, database, automation, sftp, updates, ai. Default index."),
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
// and fails over to the configured fallback triple on ANY primary error.
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
	if !cfg.FallbackConfigured() {
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
}

// aiReadTools are the fleet-inspection tools gated by AI_CHAT_TOOLS (writes
// holders may also read so they can look up IDs before proposing).
var aiReadTools = map[string]bool{
	"list_instances": true, "get_instance": true, "list_nodes": true,
	"list_templates": true, "get_system_status": true,
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

var aiDocs = map[string]string{
	"index":        "Topics: instances, templates, nodes, mods, applications, tickets, backups, security, database, automation, sftp, updates, ai. Ask get_docs for one to read it.",
	"instances":    "Instances are deployed workloads (game servers, apps) running on edge nodes. Each instance is created from a Template, lives on exactly one Node, and has a lifecycle: creating → running ⇄ stopped, plus installing/install_failed while its template install workflow runs. Operators manage them from the Instances pages (start/stop/restart, terminal, files, backups). Suspend/unsuspend is wired for moderation holds, and every mutating action lands in the instance audit timeline.",
	"templates":    "Templates are reusable blueprints (docker, lxd, kvm or multipass) stored as a JSON spec: image, env vars with validation rules, install steps, actions and custom pages. Deploying a template onto a node creates an instance. Operators define them on the Templates page, which ships a 10-tab builder (Runtime, Install, Environment, EnvVariables, Healthcheck, Labels&Devices, Pages, Actions, Spec Preview) with 40+ spec fields.",
	"nodes":        "Nodes are edge machines running the ksedge agent. The panel registers each node (address + token), receives heartbeats with telemetry, and proxies lifecycle RPCs (deploy/start/stop/destroy), terminal, files and install workflows through it. A node lists which drivers (docker/lxd/kvm) it has available; deploys are refused when the driver is missing. Connection modes are direct, reverse_tunnel, local_port and local_wss, with TLS options and probe/rotate/purge operations on the NodeDetail page.",
	"mods":         "Mods are admin-uploaded add-on packages that extend the panel (extra pages, tools, integrations). They install inactive and only activate after the admin approves every capability the mod requested. The sandboxed mod engine v2 runs them in a Goja VM with pre/post event hooks and a slot registry. Applications are the user-facing sibling: admin-curated bot/service templates that users install under their own account with the same capability-approval gate.",
	"applications": "Applications are admin-curated bot/service templates (Discord, WhatsApp, Telegram, …) that users install under their own account. Like mods they activate only after capability approval. Each install can run on a node, the panel, locally or directly, in host, docker, lxd, kvm or multipass exec mode, and every run is recorded in application_runs. Installing from a URL is SSRF-hardened (public-IP only, DNS-pinned, size/time capped).",
	"tickets":      "Tickets are user-opened support requests (general, billing, technical, feature, bug, abuse) triaged by staff with status, priority, assignment and comments. The API covers list/get/create/update/delete plus stats, comments and staff assignment, with owner-vs-staff visibility rules. Attachments, SLA tracking and notification preferences extend the base tables. Users work them from the Tickets pages with filters and a per-ticket chat composer.",
	"backups":      "Backups cover database snapshots on a cron schedule, per-instance snapshots, and file-level tar backups, with optional push to an S3-compatible remote. Schedules live in backup_schedules with a scheduler sweep, retention keep_last_n/max_age_days pruning, gzip/zstd compression and SHA256/size verification. Database dumps use pg_dump/mysqldump with a datamove fallback, and file tars transfer chunked via Content-Range. Docker restores stop the container, load the tar, and reconcile ports and volumes.",
	"security":     "Security is managed from the Security page with five tabs: Firewall, DDoS, Authority, Authentication and Sessions. Every request is logged to security_requests (24h window) feeding an RPS/top-IPs/blocked/4xx/5xx snapshot, and suspicious probe paths plus automatic DDoS mitigation can stop traffic for 5 minutes. Authentication hardens logins with MFA recovery codes, 5-failures/15-minute lockout, password policy plus history, HttpOnly SameSite-Strict session cookies, per-endpoint rate limits and five OAuth providers. Secrets are sealed with AES-256-GCM and every reveal is audited.",
	"database":     "The panel runs on SQLite, PostgreSQL or MySQL behind a transparent repository layer, switchable live from the Database page with a parents-first batched datamove (500 rows per batch). Schema is versioned as numbered migrations triplicated across all three dialects via regen.sh, so every feature ships identical tables everywhere. Maintenance offers VACUUM INTO snapshots plus native pg_dump/mysqldump exports with a datamove fallback for cross-engine moves. Connection health, engine version and row counts are visible before any move runs.",
	"automation":   "Automation runs cron schedules with 5-field expressions that trigger instance actions or shell workflows on their edge node. Each firing is recorded in automation_runs with status, output and timing for later inspection. Triggered runs dial the edge exec channel with secrets resolved server-side, so secret values never reach the browser and secret_refs stay masked in specs. Operators create and monitor schedules from the instance Automation tab alongside one-shot manual triggers.",
	"sftp":         "SFTP gives per-instance file access through a chrooted SSH server on the edge node (port 2222), provisioned automatically on deploy. Credentials are per-instance bcrypt passwords with 5-failures/15-minute lockout, managed from the instance SFTP card. Paths are jailed to the instance filesystem so users can never escape to the host. The panel API exposes get-or-provision and credential rotation endpoints gated by instance file permissions.",
	"updates":      "Panel and edge self-updates ship from the System page via check/apply/reinstall flows gated by MANAGE_PANEL_UPDATE. The updater streams the new binary to a temp file (never the live path), verifies it, then swaps it into place with cosign signature checks when enabled. A single-round-trip system snapshot reports versions, node counts and resource tiles so operators see fleet state before rolling out. Failed updates leave the running binary untouched and record the error for retry.",
	"ai":           "This AI assistant is a panel-wide chat bubble backed by a server-side proxy, so the provider key never reaches the browser. It answers with OpenAI-compatible or Ollama providers, falls back to a secondary provider when the primary fails, and streams replies with SSE (the client falls back to plain JSON automatically). It can list and inspect instances, nodes, templates, docs and system status directly, and proposes writes (start/stop instances, branding, themes, templates, pages, users, deploys) as confirmation tickets you approve in the chat. Chats persist per-user in threads (last 50 messages of context), every write and every token-usage/cost line lands in activity_logs, and admins configure providers, pricing and the writes kill-switch in Settings.",
}

func aiToolGetDocs(topic string) string {
	topic = strings.ToLower(strings.TrimSpace(topic))
	if topic == "" {
		topic = "index"
	}
	if d, ok := aiDocs[topic]; ok {
		return d
	}
	return aiDocs["index"]
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
