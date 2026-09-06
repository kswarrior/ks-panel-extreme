package handlers

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// AI streaming + threads + usage (plan/ai.md, docs/vs.md#24).
//
// AIChatStreamHandler is the SSE twin of AIChatHandler: same request shape,
// same 50-message thread window, same 5-round tool loop and confirmation
// tickets. Pure answers stream token-by-token (OpenAI stream:true SSE deltas
// / Ollama stream:true NDJSON); tool rounds run through the same aiRunTool
// plumbing and a write proposal is emitted as a ticket event the ConfirmCard
// approves via the non-streaming endpoint. Any SSE problem → the client
// falls back to POST /api/ai/chat.
//
// AIThreadsHandler (GET list / POST create) + AIThreadHandler (GET messages
// / PUT rename / DELETE) persist per-user history; every lookup is scoped
// by user_id so users can never touch each other's threads.
//
// AIUsageHandler aggregates the ai/category usage audit rows aiLogUsage
// writes (model/provider/in/out/cost) for the admin dashboard in
// AIConfigCard. Prompts and replies are never stored, so there is nothing
// sensitive to leak here.

// ---------------------------------------------------------------------------
// SSE streaming.
// ---------------------------------------------------------------------------

// aiSSEWrite emits one SSE data frame and flushes. A write error means the
// browser went away; callers abort the provider loop on false.
func aiSSEWrite(w http.ResponseWriter, v any) bool {
	raw, err := json.Marshal(v)
	if err != nil {
		return true
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", raw); err != nil {
		return false
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	return true
}

// aiStreamProviderTokens streams one provider round, forwarding content
// deltas to onToken as they arrive. It returns the assembled text, any tool
// calls the model requested, and the round's token usage.
func aiStreamProviderTokens(ctx context.Context, cfg *repository.AIConfig, msgs []aiMsg, tools []aiToolDef, onToken func(string)) (string, []aiToolCall, aiUsage, error) {
	if cfg.OllamaMode {
		return aiStreamOllama(ctx, cfg, msgs, tools, onToken)
	}
	return aiStreamOpenAI(ctx, cfg, msgs, tools, onToken)
}

// aiStreamWithFallback streams one round against the primary provider and
// fails over to the configured fallback triple on ANY primary error,
// mirroring aiProviderChatWithFallback for the non-streaming path.
func aiStreamWithFallback(ctx context.Context, cfg *repository.AIConfig, model string, msgs []aiMsg, tools []aiToolDef, onToken func(string)) (string, []aiToolCall, aiUsage, error) {
	eff := *cfg
	if strings.TrimSpace(model) != "" {
		eff.ModelID = strings.TrimSpace(model)
	}
	text, calls, usage, err := aiStreamProviderTokens(ctx, &eff, msgs, tools, onToken)
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
	text2, calls2, usage2, err2 := aiStreamProviderTokens(ctx, &fb, msgs, tools, onToken)
	usage2.Provider = "fallback"
	if err2 != nil {
		return "", nil, usage2, fmt.Errorf("primary failed (%s); fallback failed (%s)",
			aiCap(err.Error(), 200), aiCap(err2.Error(), 200))
	}
	return text2, calls2, usage2, nil
}

// aiStreamPost opens a streaming POST and hands the body scanner to parse.
// Caps the stream at 2 MiB so a runaway provider can't OOM the panel.
func aiStreamPost(ctx context.Context, url, apiKey string, body any, parse func(*bufio.Scanner) (string, []aiToolCall, aiUsage, error)) (string, []aiToolCall, aiUsage, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return "", nil, aiUsage{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return "", nil, aiUsage{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}
	// No total Timeout: this client streams SSE/NDJSON token deltas, and a
	// total deadline would kill a healthy stream that emits for longer than
	// the cap even while data flows. The passed ctx (per-round deadline +
	// client disconnect) bounds the whole call; the transport only bounds
	// dial/TLS/first-byte so a wedged provider fails fast.
	client := &http.Client{Transport: &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConnsPerHost:   4,
	}}
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, aiUsage{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		// Keep the provider's error snippet (matching aiPostJSON) plus any
		// Retry-After hint, so the UI can show "Too Many Requests" and
		// back off instead of surfacing a bare "provider HTTP 429".
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		msg := fmt.Sprintf("provider HTTP %d", resp.StatusCode)
		if s := strings.TrimSpace(string(data)); s != "" {
			msg += ": " + aiCap(s, 300)
		}
		if ra := strings.TrimSpace(resp.Header.Get("Retry-After")); ra != "" {
			if n, err := strconv.Atoi(ra); err == nil && n > 0 && n <= 3600 {
				msg += fmt.Sprintf(" (retry after %ds)", n)
			} else {
				msg += " (retry after 60s)"
			}
		} else if resp.StatusCode == http.StatusTooManyRequests {
			msg += " (retry after 60s)"
		}
		return "", nil, aiUsage{}, fmt.Errorf("%s", msg)
	}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64*1024), 1<<21)
	return parse(sc)
}

// aiStreamOpenAI consumes an OpenAI-compatible SSE stream (stream:true):
// "data: {choices:[{delta:{content,tool_calls},finish_reason}]}" frames
// until "data: [DONE]". Tool-call argument fragments are accumulated per
// index and normalised through the same aiParseCalls shape as the
// non-streaming path. Usage arrives in the terminal frame when the
// provider honours stream_options.include_usage.
func aiStreamOpenAI(ctx context.Context, cfg *repository.AIConfig, msgs []aiMsg, tools []aiToolDef, onToken func(string)) (string, []aiToolCall, aiUsage, error) {
	base := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	usage := aiUsage{Model: cfg.ModelID}
	body := map[string]any{
		"model":          cfg.ModelID,
		"messages":       aiWireMessages(msgs, true),
		"temperature":    cfg.Temperature,
		"max_tokens":     cfg.MaxTokens,
		"stream":         true,
		"stream_options": map[string]any{"include_usage": true},
	}
	if len(tools) > 0 {
		body["tools"] = tools
		body["tool_choice"] = "auto"
	}
	type frag struct {
		id   string
		name string
		args strings.Builder
	}
	frags := map[int]*frag{}
	order := []int{}
	var text strings.Builder
	parse := func(sc *bufio.Scanner) (string, []aiToolCall, aiUsage, error) {
		for sc.Scan() {
			if ctx.Err() != nil {
				return text.String(), nil, usage, ctx.Err()
			}
			line := strings.TrimSpace(sc.Text())
			if line == "" || strings.HasPrefix(line, ":") {
				continue
			}
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if payload == "[DONE]" {
				break
			}
			var chunk struct {
				Choices []struct {
					Delta struct {
						Content   string `json:"content"`
						ToolCalls []struct {
							Index    int    `json:"index"`
							ID       string `json:"id"`
							Function struct {
								Name      string `json:"name"`
								Arguments string `json:"arguments"`
							} `json:"function"`
						} `json:"tool_calls"`
					} `json:"delta"`
					FinishReason string `json:"finish_reason"`
				} `json:"choices"`
				Usage struct {
					PromptTokens     int `json:"prompt_tokens"`
					CompletionTokens int `json:"completion_tokens"`
					TotalTokens      int `json:"total_tokens"`
				} `json:"usage"`
			}
			if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
				continue
			}
			if chunk.Usage.TotalTokens > 0 || chunk.Usage.PromptTokens > 0 || chunk.Usage.CompletionTokens > 0 {
				usage.In, usage.Out, usage.Total =
					chunk.Usage.PromptTokens, chunk.Usage.CompletionTokens, chunk.Usage.TotalTokens
			}
			if len(chunk.Choices) == 0 {
				continue
			}
			d := chunk.Choices[0].Delta
			if d.Content != "" {
				text.WriteString(d.Content)
				if onToken != nil {
					onToken(d.Content)
				}
			}
			for _, tc := range d.ToolCalls {
				f, ok := frags[tc.Index]
				if !ok {
					f = &frag{}
					frags[tc.Index] = f
					order = append(order, tc.Index)
				}
				if tc.ID != "" {
					f.id = tc.ID
				}
				if tc.Function.Name != "" {
					f.name = tc.Function.Name
				}
				f.args.WriteString(tc.Function.Arguments)
			}
		}
		if err := sc.Err(); err != nil {
			return text.String(), nil, usage, err
		}
		var calls []aiToolCall
		for i, idx := range order {
			f := frags[idx]
			if strings.TrimSpace(f.name) == "" {
				continue
			}
			id := f.id
			if id == "" {
				id = "call_" + strconv.Itoa(i)
			}
			argRaw := json.RawMessage(strings.TrimSpace(f.args.String()))
			if len(argRaw) == 0 {
				argRaw = json.RawMessage("{}")
			}
			args := map[string]any{}
			_ = json.Unmarshal(argRaw, &args)
			calls = append(calls, aiToolCall{ID: id, Name: strings.TrimSpace(f.name), Args: args, RawArgs: argRaw})
		}
		return text.String(), calls, usage, nil
	}
	return aiStreamPost(ctx, base+"/chat/completions", cfg.APIKey, body, parse)
}

// aiStreamOllama consumes an Ollama /api/chat stream (stream:true): one JSON
// object per line with message.content deltas; tool calls and eval counts
// ride on the final done:true chunk.
func aiStreamOllama(ctx context.Context, cfg *repository.AIConfig, msgs []aiMsg, tools []aiToolDef, onToken func(string)) (string, []aiToolCall, aiUsage, error) {
	base := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	usage := aiUsage{Model: cfg.ModelID}
	body := map[string]any{
		"model":    cfg.ModelID,
		"messages": aiWireMessages(msgs, false),
		"stream":   true,
		"options":  map[string]any{"temperature": cfg.Temperature, "num_predict": cfg.MaxTokens},
	}
	if len(tools) > 0 {
		body["tools"] = tools
	}
	var text strings.Builder
	var lastCalls []aiToolCall
	parse := func(sc *bufio.Scanner) (string, []aiToolCall, aiUsage, error) {
		for sc.Scan() {
			if ctx.Err() != nil {
				return text.String(), nil, usage, ctx.Err()
			}
			line := strings.TrimSpace(sc.Text())
			if line == "" {
				continue
			}
			var chunk struct {
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
				Done            bool   `json:"done"`
				PromptEvalCount int    `json:"prompt_eval_count"`
				EvalCount       int    `json:"eval_count"`
				Error           string `json:"error"`
			}
			if err := json.Unmarshal([]byte(line), &chunk); err != nil {
				continue
			}
			if chunk.Error != "" {
				return text.String(), nil, usage, fmt.Errorf("%s", chunk.Error)
			}
			if chunk.Message.Content != "" {
				text.WriteString(chunk.Message.Content)
				if onToken != nil {
					onToken(chunk.Message.Content)
				}
			}
			if len(chunk.Message.ToolCalls) > 0 {
				tcRaw, _ := json.Marshal(chunk.Message.ToolCalls)
				lastCalls = aiParseCalls(tcRaw)
			}
			if chunk.Done {
				usage.In, usage.Out = chunk.PromptEvalCount, chunk.EvalCount
				usage.Total = usage.In + usage.Out
				break
			}
		}
		if err := sc.Err(); err != nil {
			return text.String(), nil, usage, err
		}
		return text.String(), lastCalls, usage, nil
	}
	return aiStreamPost(ctx, base+"/api/chat", cfg.APIKey, body, parse)
}

// AIChatStreamHandler streams the assistant reply as SSE. Request and auth
// mirror AIChatHandler (AI_CHAT_USE, 20/min per-user limit, optional
// thread_id window, admin-only model override); approvals stay on the
// non-streaming endpoint. Event frames:
//
//	data: {"token":"..."}            — one content delta (append to bubble)
//	data: {"ticket":{...}}           — write proposal, then a done frame
//	data: {"done":true,"reply":"...","thread_id":7}
//	data: {"error":"..."}            — terminal provider failure
func AIChatStreamHandler(w http.ResponseWriter, r *http.Request) {
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
	if strings.TrimSpace(req.ApproveTicketID) != "" {
		http.Error(w, "approvals use POST /api/ai/chat", http.StatusBadRequest)
		return
	}

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
	maxClient := 20
	if threadID != 0 {
		maxClient = 10
	}
	history, newUserTurns, herr := aiBuildHistory(stored, req.Messages, maxClient)
	if herr != nil {
		http.Error(w, herr.Error(), http.StatusBadRequest)
		return
	}

	cfg, err := repository.NewAIConfigRepository(con).Get()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if !cfg.Enabled {
		http.Error(w, "the AI assistant is disabled by the administrator", http.StatusServiceUnavailable)
		return
	}
	if strings.TrimSpace(cfg.BaseURL) == "" || strings.TrimSpace(cfg.ModelID) == "" {
		http.Error(w, "the AI assistant is not configured yet", http.StatusServiceUnavailable)
		return
	}

	username, role, _ := resolvedActor(r)
	perms, _ := checker.ListUserPermissions(uid)
	actx := &aiCallCtx{con: con, uid: uid, username: username, role: role, perms: perms, checker: checker, r: r, cfg: cfg}

	ctx, cancel := context.WithTimeout(r.Context(), 110*time.Second)
	defer cancel()

	sysPrompt, err := aiBuildSystemPrompt(con, cfg, uid, username, role, perms)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	msgs := append([]aiMsg{{Role: "system", Content: sysPrompt}}, history...)
	model := aiModelOverride(checker, uid, req.Model)
	_, canRead, canWrite := aiCaps(checker, uid)
	defs := aiToolDefsForCaps(canRead, canWrite)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	var acc aiUsageAcc
	emitDone := func(reply string, ticket map[string]any) {
		aiLogUsage(r, cfg, acc)
		aiThreadPersist(uid, req.ThreadID, newUserTurns, reply)
		frame := map[string]any{"done": true, "reply": reply, "thread_id": threadID}
		if ticket != nil {
			frame["confirmation_ticket"] = ticket
		}
		aiSSEWrite(w, frame)
	}

	var lastText string
	for loop := 0; loop < 5; loop++ {
		if ctx.Err() != nil || r.Context().Err() != nil {
			aiSSEWrite(w, map[string]any{"error": "chat cancelled"})
			return
		}
		onToken := func(tok string) {
			aiSSEWrite(w, map[string]any{"token": tok})
		}
		// Per-round deadline from the client connection, same rationale
		// as aiRunChatLoop: one slow round must not starve the rest.
		roundCtx, roundCancel := context.WithTimeout(r.Context(), 55*time.Second)
		text, calls, usage, serr := aiStreamWithFallback(roundCtx, cfg, model, msgs, defs, onToken)
		roundCancel()
		acc.add(usage)
		if serr != nil {
			if lastText != "" {
				reply := lastText + "\n\n(provider error on follow-up: " + aiCap(serr.Error(), 300) + ")"
				emitDone(reply, nil)
				return
			}
			// Structured rate-limit frame so the UI can offer retry/backoff
			// instead of a dead-end error.
			if aiIsRateLimitErr(serr) {
				aiSSEWrite(w, map[string]any{
					"error": "AI provider error: " + aiCap(serr.Error(), 500),
					"code":  "rate_limited", "retry_after": aiRetryAfterSecs(serr),
				})
				return
			}
			aiSSEWrite(w, map[string]any{"error": "AI provider error: " + aiCap(serr.Error(), 500)})
			return
		}
		if len(calls) == 0 {
			reply := strings.TrimSpace(text)
			if reply == "" {
				reply = "I couldn't produce an answer for that. Try rephrasing?"
			}
			emitDone(reply, nil)
			return
		}
		lastText = text
		msgs = append(msgs, aiMsg{Role: "assistant", Content: text, ToolCalls: calls})
		// Tool rounds reuse the non-streaming executor: read tools append
		// results and the next round streams again; the first write
		// proposal stops the loop as a ticket event (same contract as
		// POST /api/ai/chat).
		advanced := false
		for _, c := range calls {
			result, proposal, terr := aiRunTool(actx, c.Name, c.Args)
			if terr != nil {
				msgs = append(msgs, aiMsg{Role: "tool", ToolCallID: c.ID, Name: c.Name, Content: "error: " + aiCap(terr.Error(), 1000)})
				advanced = true
				continue
			}
			if proposal != nil {
				t := &aiTicket{
					ID: proposal.ID, UserID: uid, Tool: c.Name, Args: c.RawArgs,
					Summary: proposal.Summary, Diff: proposal.Diff, Expires: time.Now().Add(10 * time.Minute),
				}
				if err := aiStoreTicket(con, t); err != nil {
					aiSSEWrite(w, map[string]any{"error": "server error"})
					return
				}
				reply := strings.TrimSpace(text)
				if reply == "" {
					reply = "I need your approval before I do that:"
				}
				aiSSEWrite(w, map[string]any{"ticket": map[string]any{
					"id": t.ID, "tool": t.Tool, "summary": t.Summary, "diff": t.Diff,
				}})
				emitDone(reply, map[string]any{
					"id": t.ID, "tool": t.Tool, "summary": t.Summary, "diff": t.Diff,
				})
				return
			}
			msgs = append(msgs, aiMsg{Role: "tool", ToolCallID: c.ID, Name: c.Name, Content: aiCap(result, 4000)})
			advanced = true
		}
		if !advanced {
			break
		}
	}
	reply := strings.TrimSpace(lastText)
	if reply == "" {
		reply = "I ran out of tool rounds before finishing. Try asking for something smaller?"
	} else {
		reply += "\n\n(Stopped after 5 tool rounds.)"
	}
	emitDone(reply, nil)
}

// ---------------------------------------------------------------------------
// Threads.
// ---------------------------------------------------------------------------

// AIThreadsHandler serves GET (list uid's threads, newest first) and POST
// (open a thread, optional {"title"}) for the ChatPanel thread switcher.
func AIThreadsHandler(w http.ResponseWriter, r *http.Request) {
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
	if err := permissions.NewChecker(con).EnsureAIChatAccess(uid); err != nil {
		http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
		return
	}
	repo := repository.NewAIThreadRepository(con)
	switch r.Method {
	case http.MethodGet:
		list, err := repo.List(uid)
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		if list == nil {
			list = []repository.AIThread{}
		}
		writeJSON(w, map[string]any{"threads": list})
	case http.MethodPost:
		var body struct {
			Title string `json:"title"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		id, err := repo.Create(uid, body.Title)
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		th, err := repo.Owned(uid, id)
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		writeJSONStatus(w, http.StatusCreated, map[string]any{"thread": th})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// AIThreadHandler serves one thread: GET messages (last 50, oldest first),
// PUT rename ({"title"}), DELETE remove. Unknown or foreign ids are 404 so
// a user can never probe another user's threads (IDOR-safe by construction:
// every repository call re-checks user_id).
func AIThreadHandler(w http.ResponseWriter, r *http.Request) {
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
	if err := permissions.NewChecker(con).EnsureAIChatAccess(uid); err != nil {
		http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id == 0 {
		http.Error(w, "invalid thread id", http.StatusBadRequest)
		return
	}
	repo := repository.NewAIThreadRepository(con)
	switch r.Method {
	case http.MethodGet:
		th, err := repo.Owned(uid, id)
		if err != nil {
			http.Error(w, "chat thread not found", http.StatusNotFound)
			return
		}
		msgs, err := repo.LastMessages(uid, id, 50)
		if err != nil {
			http.Error(w, "chat thread not found", http.StatusNotFound)
			return
		}
		if msgs == nil {
			msgs = []repository.AIMessage{}
		}
		th.MsgCount = len(msgs)
		writeJSON(w, map[string]any{"thread": th, "messages": msgs})
	case http.MethodPut:
		var body struct {
			Title string `json:"title"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		if err := repo.Rename(uid, id, body.Title); err != nil {
			http.Error(w, "chat thread not found", http.StatusNotFound)
			return
		}
		th, _ := repo.Owned(uid, id)
		writeJSON(w, map[string]any{"thread": th})
	case http.MethodDelete:
		if err := repo.Delete(uid, id); err != nil {
			http.Error(w, "chat thread not found", http.StatusNotFound)
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ---------------------------------------------------------------------------
// Usage dashboard.
// ---------------------------------------------------------------------------

// aiUsageRow is one aggregated dashboard line.
type aiUsageRow struct {
	Model    string  `json:"model"`
	Provider string  `json:"provider"`
	Requests int     `json:"requests"`
	In       int     `json:"in_tokens"`
	Out      int     `json:"out_tokens"`
	Cost     float64 `json:"cost_usd"`
}

// AIUsageHandler aggregates the ai/chat audit rows for the admin usage
// dashboard in AIConfigCard. Gated by SETTINGS view at the route table;
// re-checked here so the endpoint fails closed even if the route gate is
// ever loosened. Only exposes model/provider/counters — prompts, replies
// and keys are never written to the audit log in the first place.
func AIUsageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
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
	if err := permissions.NewChecker(con).EnsureAny(uid, permissions.ViewSettingsKey, permissions.SettingsEditKey); err != nil {
		http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)
		return
	}
	rows, err := con.Query(`SELECT username, message, created_at FROM activity_logs WHERE category = 'ai' AND action = 'chat' ORDER BY id DESC LIMIT 200`)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	type recent struct {
		User     string  `json:"user"`
		Model    string  `json:"model"`
		Provider string  `json:"provider"`
		In       int     `json:"in_tokens"`
		Out      int     `json:"out_tokens"`
		Cost     float64 `json:"cost_usd"`
		At       string  `json:"at"`
	}
	byKey := map[string]*aiUsageRow{}
	recentOut := []recent{}
	var totalReq, totalIn, totalOut int
	var totalCost float64
	for rows.Next() {
		var user, msg, at sql.NullString
		if err := rows.Scan(&user, &msg, &at); err != nil {
			continue
		}
		model, provider, in, out, cost, ok := aiUsageSummary(msg.String)
		if !ok {
			continue
		}
		totalReq++
		totalIn += in
		totalOut += out
		totalCost += cost
		key := model + "\x00" + provider
		agg, ok := byKey[key]
		if !ok {
			agg = &aiUsageRow{Model: model, Provider: provider}
			byKey[key] = agg
		}
		agg.Requests++
		agg.In += in
		agg.Out += out
		agg.Cost += cost
		if len(recentOut) < 50 {
			recentOut = append(recentOut, recent{
				User: user.String, Model: model, Provider: provider,
				In: in, Out: out, Cost: cost, At: at.String,
			})
		}
	}
	byModel := []aiUsageRow{}
	for _, v := range byKey {
		byModel = append(byModel, *v)
	}
	if byModel == nil {
		byModel = []aiUsageRow{}
	}
	if recentOut == nil {
		recentOut = []recent{}
	}
	_ = models.ActivityCategoryAI
	writeJSON(w, map[string]any{
		"totals": map[string]any{
			"requests": totalReq, "in_tokens": totalIn,
			"out_tokens": totalOut, "cost_usd": totalCost,
		},
		"by_model": byModel,
		"recent":   recentOut,
	})
}
