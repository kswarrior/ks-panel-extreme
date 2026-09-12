package handlers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/example/kspanel/internal/repository"
)

func wave2AttemptTimeout(t *testing.T, d time.Duration) func() {
	t.Helper()
	old := aiProviderAttemptTimeout
	aiProviderAttemptTimeout = d
	return func() { aiProviderAttemptTimeout = old }
}

// Hung primary (exceeds the per-attempt budget) + healthy instant fallback,
// outer ctx alive: fallback must answer with provider=fallback.
func TestWave2ReproTimeoutFallsBack(t *testing.T) {
	defer wave2AttemptTimeout(t, 150*time.Millisecond)()
	fallbackHits := 0
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackHits++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fb-ok"}}]}`)
	}))
	defer fallbackSrv.Close()
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(time.Second) // hung provider
		fmt.Fprint(w, `{}`)
	}))
	defer primarySrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	text, _, usage, err := aiProviderChatWithFallback(context.Background(), cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil)
	t.Logf("text=%q provider=%q hits=%d err=%v", text, usage.Provider, fallbackHits, err)
	if err != nil || text != "fb-ok" || usage.Provider != "fallback" || fallbackHits != 1 {
		t.Fatalf("timeout must fall back, got text=%q provider=%q hits=%d err=%v", text, usage.Provider, fallbackHits, err)
	}
}

// Slow-failing primary (200ms then 500) + healthy 100ms fallback, attempt
// budget 250ms: a shared/depleted budget would starve the fallback, a
// fresh per-attempt budget lets it succeed.
func TestWave2ReproFreshBudgetForFallback(t *testing.T) {
	defer wave2AttemptTimeout(t, 250*time.Millisecond)()
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fb-ok"}}]}`)
	}))
	defer fallbackSrv.Close()
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `boom`)
	}))
	defer primarySrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	text, _, usage, err := aiProviderChatWithFallback(context.Background(), cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil)
	t.Logf("text=%q provider=%q err=%v", text, usage.Provider, err)
	if err != nil || text != "fb-ok" || usage.Provider != "fallback" {
		t.Fatalf("fallback must get a fresh budget, got text=%q provider=%q err=%v", text, usage.Provider, err)
	}
}

// Streaming twin: hung OpenAI primary + healthy instant fallback.
func TestWave2ReproStreamTimeoutFallsBack(t *testing.T) {
	defer wave2AttemptTimeout(t, 150*time.Millisecond)()
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"FB\"}}]}\n\ndata: [DONE]\n\n")
	}))
	defer fallbackSrv.Close()
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(time.Second) // hung provider, headers never sent
	}))
	defer primarySrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	var toks []string
	text, _, usage, err := aiStreamWithFallback(context.Background(), cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil, func(s string) { toks = append(toks, s) })
	t.Logf("text=%q provider=%q toks=%q err=%v", text, usage.Provider, toks, err)
	if err != nil || text != "FB" || usage.Provider != "fallback" {
		t.Fatalf("stream timeout must fall back, got text=%q provider=%q err=%v", text, usage.Provider, err)
	}
}

// Cancelled outer ctx must NOT spend a fallback call (Stop button /
// client disconnect stays free of extra provider billing).
func TestWave2ReproCancelledOuterSkipsFallback(t *testing.T) {
	defer wave2AttemptTimeout(t, 150*time.Millisecond)()
	fallbackHits := 0
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackHits++
		fmt.Fprint(w, `{}`)
	}))
	defer fallbackSrv.Close()
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `boom`)
	}))
	defer primarySrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // client already gone
	_, _, _, err := aiProviderChatWithFallback(ctx, cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil)
	t.Logf("err=%v hits=%d", err, fallbackHits)
	if err == nil {
		t.Fatal("cancelled outer must return an error")
	}
	if fallbackHits != 0 {
		t.Fatalf("cancelled outer must not call fallback, hits=%d", fallbackHits)
	}
}
