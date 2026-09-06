package handlers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/example/kspanel/internal/repository"
)

// Primary 401 must NOT trigger fallback: auth/config errors return directly.
func TestAIProviderFallback401NoFallback(t *testing.T) {
	fallbackHits := 0
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackHits++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fallback"}}]}`)
	}))
	defer fallbackSrv.Close()
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"error":{"message":"invalid_api_key","code":401}}`)
	}))
	defer primarySrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	_, _, _, err := aiProviderChatWithFallback(context.Background(), cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil)
	if err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("want primary 401 error, got %v", err)
	}
	if fallbackHits != 0 {
		t.Fatalf("fallback must not run on 401, hits=%d", fallbackHits)
	}
}

// Primary 500 MUST trigger fallback and report provider=fallback.
func TestAIProviderFallback500UsesFallback(t *testing.T) {
	fallbackHits := 0
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackHits++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fallback-ok"}}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}`)
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
	text, _, usage, err := aiProviderChatWithFallback(context.Background(), cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil)
	if err != nil {
		t.Fatalf("fallback must succeed, got %v", err)
	}
	if text != "fallback-ok" || usage.Provider != "fallback" || fallbackHits != 1 {
		t.Fatalf("want fallback-ok/fallback/1 hit, got %q/%q/%d", text, usage.Provider, fallbackHits)
	}
}

// Streaming: primary 401 must not invoke fallback and must emit no tokens.
func TestAIStreamFallback401NoFallback(t *testing.T) {
	fallbackHits := 0
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackHits++
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"FB\"}}]}\n\ndata: [DONE]\n\n")
	}))
	defer fallbackSrv.Close()
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `bad key`)
	}))
	defer primarySrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	var toks []string
	_, _, _, err := aiStreamWithFallback(context.Background(), cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil, func(s string) { toks = append(toks, s) })
	if err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("want primary 401 error, got %v", err)
	}
	if fallbackHits != 0 {
		t.Fatalf("fallback must not run on streaming 401, hits=%d", fallbackHits)
	}
	if len(toks) != 0 {
		t.Fatalf("no tokens may flush on failed primary, got %q", toks)
	}
}

// Streaming interleave: Ollama primary emits a partial delta then an error;
// the partial must be discarded so only fallback tokens reach onToken.
func TestAIStreamFallbackInterleaveDiscardsPrimary(t *testing.T) {
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/x-ndjson")
		fmt.Fprint(w, "{\"message\":{\"content\":\"PRIMARY-\"}}\n{\"error\":\"boom\"}\n")
	}))
	defer primarySrv.Close()
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"FALLBACK\"}}]}\n\ndata: [DONE]\n\n")
	}))
	defer fallbackSrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", OllamaMode: true, MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	var toks []string
	text, _, usage, err := aiStreamWithFallback(context.Background(), cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil, func(s string) { toks = append(toks, s) })
	if err != nil {
		t.Fatalf("fallback must succeed, got %v", err)
	}
	if text != "FALLBACK" || usage.Provider != "fallback" {
		t.Fatalf("want FALLBACK/fallback, got %q/%q", text, usage.Provider)
	}
	joined := strings.Join(toks, "")
	if joined != "FALLBACK" {
		t.Fatalf("tokens must be exactly fallback stream, got %q", joined)
	}
}

// Gate table: 4xx (non-429) never falls back; 5xx/429/transport do.
func TestAIFallbackRetryableGate(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{fmt.Errorf("provider HTTP 400: bad request"), false},
		{fmt.Errorf("provider HTTP 401: bad key"), false},
		{fmt.Errorf("provider HTTP 403: forbidden"), false},
		{fmt.Errorf("provider HTTP 404: not found"), false},
		{fmt.Errorf("provider HTTP 429: too many requests (retry after 60s)"), true},
		{fmt.Errorf("provider HTTP 500: boom"), true},
		{fmt.Errorf("provider HTTP 503: unavailable"), true},
		{fmt.Errorf(`Post "http://x": connection refused`), true},
		{fmt.Errorf("boom"), true},
	}
	for _, c := range cases {
		if got := aiShouldFallbackToProvider(c.err); got != c.want {
			t.Fatalf("aiShouldFallbackToProvider(%q) = %v, want %v", c.err, got, c.want)
		}
	}
	if aiShouldFallbackToProvider(nil) {
		t.Fatal("nil error must not fall back")
	}
}
