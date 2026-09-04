package handlers

import (
	"errors"
	"testing"
	"time"

	"github.com/example/kspanel/internal/models"
)

func rollingTestNodes(n int) []models.Node {
	out := make([]models.Node, 0, n)
	for i := 1; i <= n; i++ {
		out = append(out, models.Node{ID: int64(i * 10), Name: string(rune('a' + i - 1))})
	}
	return out
}

func rollingTestPlans(nodes []models.Node) []rollingNodePlan {
	plans := make([]rollingNodePlan, 0, len(nodes))
	for _, nd := range nodes {
		plans = append(plans, rollingNodePlan{Node: nd, Token: "tok"})
	}
	return plans
}

func TestOrderRollingNodesSequentialByID(t *testing.T) {
	nodes := []models.Node{{ID: 30}, {ID: 10}, {ID: 20}}
	got := orderRollingNodes(nodes, "sequential", 0)
	for i, want := range []int64{10, 20, 30} {
		if got[i].ID != want {
			t.Fatalf("position %d: got %d want %d", i, got[i].ID, want)
		}
	}
}

func TestOrderRollingNodesCanaryFirst(t *testing.T) {
	nodes := []models.Node{{ID: 30}, {ID: 10}, {ID: 20}, {ID: 40}}
	got := orderRollingNodes(nodes, "canary", 2)
	for i, want := range []int64{10, 20, 30, 40} {
		if got[i].ID != want {
			t.Fatalf("position %d: got %d want %d", i, got[i].ID, want)
		}
	}
	// Canary subset = first 2 in ID order.
	if got[0].ID != 10 || got[1].ID != 20 {
		t.Fatalf("canary subset wrong: %+v", got)
	}
}

// TestRunRollingUpdateStopsOnFirstFailure: 3 nodes, middle apply fails —
// the third must be reported skipped (untouched), never applied.
func TestRunRollingUpdateStopsOnFirstFailure(t *testing.T) {
	plans := rollingTestPlans(rollingTestNodes(3))
	applied := map[int64]bool{}
	polled := map[int64]bool{}
	deps := rollingDeps{
		check: func(nd models.Node, token string) (bool, string, string, error) {
			return true, "0.1.0", "0.2.0", nil
		},
		apply: func(nd models.Node, token string) error {
			applied[nd.ID] = true
			if nd.ID == 20 {
				return errors.New("edge refused")
			}
			return nil
		},
		pollHealthy: func(nd models.Node, token, before string, timeout time.Duration) error {
			polled[nd.ID] = true
			return nil
		},
	}
	results, stopped := runRollingUpdate(plans, time.Minute, true, deps)
	if !stopped {
		t.Fatal("expected stoppedEarly on first failure")
	}
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}
	if results[0].Status != rollStatusUpdated {
		t.Fatalf("node 1: got %q want updated", results[0].Status)
	}
	if results[1].Status != rollStatusFailed {
		t.Fatalf("node 2: got %q want failed", results[1].Status)
	}
	if results[2].Status != rollStatusSkipped {
		t.Fatalf("node 3: got %q want skipped (untouched)", results[2].Status)
	}
	if applied[30] {
		t.Fatal("skipped node must never be applied")
	}
	if polled[30] {
		t.Fatal("skipped node must never be health-polled")
	}
}

// TestRunRollingUpdateSkipsUpToDate: no available update means no apply
// and no restart of a healthy edge.
func TestRunRollingUpdateSkipsUpToDate(t *testing.T) {
	plans := rollingTestPlans(rollingTestNodes(2))
	applied := 0
	deps := rollingDeps{
		check: func(nd models.Node, token string) (bool, string, string, error) {
			return false, "0.2.0", "0.2.0", nil
		},
		apply: func(nd models.Node, token string) error {
			applied++
			return nil
		},
		pollHealthy: func(nd models.Node, token, before string, timeout time.Duration) error {
			return nil
		},
	}
	results, stopped := runRollingUpdate(plans, time.Minute, true, deps)
	if stopped {
		t.Fatal("no failure — must not stop early")
	}
	for _, r := range results {
		if r.Status != rollStatusUpToDate {
			t.Fatalf("got %q want up_to_date", r.Status)
		}
	}
	if applied != 0 {
		t.Fatalf("up-to-date nodes must not be applied (%d applies)", applied)
	}
}

// TestRunRollingUpdateContinuesWhenNotPaused: pause_on_failure=false runs
// every node and reports each outcome.
func TestRunRollingUpdateContinuesWhenNotPaused(t *testing.T) {
	plans := rollingTestPlans(rollingTestNodes(3))
	deps := rollingDeps{
		check: func(nd models.Node, token string) (bool, string, string, error) {
			return true, "0.1.0", "0.2.0", nil
		},
		apply: func(nd models.Node, token string) error {
			if nd.ID == 20 {
				return errors.New("boom")
			}
			return nil
		},
		pollHealthy: func(nd models.Node, token, before string, timeout time.Duration) error {
			return nil
		},
	}
	results, stopped := runRollingUpdate(plans, time.Minute, false, deps)
	if stopped {
		t.Fatal("pause disabled — must not stop early")
	}
	want := []string{rollStatusUpdated, rollStatusFailed, rollStatusUpdated}
	for i, w := range want {
		if results[i].Status != w {
			t.Fatalf("node %d: got %q want %q", i, results[i].Status, w)
		}
	}
}

// TestRunRollingUpdateMissingTokenFailsFast: a node without a usable
// token fails without any edge call.
func TestRunRollingUpdateMissingTokenFailsFast(t *testing.T) {
	plans := []rollingNodePlan{{Node: models.Node{ID: 7, Name: "tok-less"}}}
	called := false
	deps := rollingDeps{
		check: func(nd models.Node, token string) (bool, string, string, error) {
			called = true
			return true, "0.1.0", "0.2.0", nil
		},
		apply: func(nd models.Node, token string) error {
			called = true
			return nil
		},
		pollHealthy: func(nd models.Node, token, before string, timeout time.Duration) error {
			called = true
			return nil
		},
	}
	results, _ := runRollingUpdate(plans, time.Minute, true, deps)
	if called {
		t.Fatal("token-less node must not trigger any edge call")
	}
	if results[0].Status != rollStatusFailed {
		t.Fatalf("got %q want failed", results[0].Status)
	}
}
