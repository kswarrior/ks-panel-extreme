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

// Wave-2 repro: hung primary (exceeds round ctx) + healthy fallback.
// Transport/timeout errors are retryable per aiShouldFallbackToProvider,
// so fallback should answer. Guard `ctx.Err() != nil` vetoes it.
func TestWave2ReproTimeoutSuppressesFallback(t *testing.T) {
	fallbackHits := 0
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackHits++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fb-ok"}}]}`)
	}))
	defer fallbackSrv.Close()
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond) // hung provider
		fmt.Fprint(w, `{}`)
	}))
	defer primarySrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, _, _, err := aiProviderChatWithFallback(ctx, cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil)
	t.Logf("err=%v fallbackHits=%d", err, fallbackHits)
	if fallbackHits != 1 {
		t.Fatalf("REPRO: timeout should fall back, fallbackHits=%d err=%v", fallbackHits, err)
	}
}

// Wave-2 repro 2: slow-failing primary depletes the shared round budget,
// starving a healthy-but-slower fallback that a fresh budget would allow.
func TestWave2ReproDepletedBudgetStarvesFallback(t *testing.T) {
	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fb-ok"}}]}`)
	}))
	defer fallbackSrv.Close()
	primarySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `boom`)
	}))
	defer primarySrv.Close()
	cfg := &repository.AIConfig{
		BaseURL: primarySrv.URL, ModelID: "m", MaxTokens: 16,
		FallbackBaseURL: fallbackSrv.URL, FallbackModelID: "m2",
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	text, _, _, err := aiProviderChatWithFallback(ctx, cfg, "", []aiMsg{{Role: "user", Content: "hi"}}, nil)
	t.Logf("text=%q err=%v", text, err)
	if err != nil {
		t.Fatalf("REPRO: fallback starved by depleted budget, err=%v", err)
	}
}
