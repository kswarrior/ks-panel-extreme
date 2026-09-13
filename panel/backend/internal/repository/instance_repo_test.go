package repository

import (
	"encoding/json"
	"fmt"
	"sync"
	"testing"

	_ "modernc.org/sqlite"
)

// TestSuspendInstanceConcurrentNoLostUpdate is the Wave 1-Suspend reproducer:
// N concurrent SuspendInstance calls must yield suspension_count == N and N
// history entries. The pre-fix Get->unmarshal->append->Exec sequence lets two
// callers read the same base row, so the last writer silently drops the
// other's entry (lost update).
func TestSuspendInstanceConcurrentNoLostUpdate(t *testing.T) {
	conn := newInstanceTimeTestDB(t)
	// Pin to one conn: :memory: is per-connection, and this also mirrors the
	// production SQLite single-conn pool (interleaving still happens because
	// Get and Exec are separate pool acquisitions).
	conn.SetMaxOpenConns(1)
	if _, err := conn.Exec(`INSERT INTO instances (node_id, template_id, owner_id, name, kind, status)
		VALUES (1, 1, 1, 'race', 'docker', 'running')`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	var id int64
	if err := conn.QueryRow(`SELECT id FROM instances WHERE name = 'race'`).Scan(&id); err != nil {
		t.Fatalf("seed id: %v", err)
	}
	repo := NewInstanceRepository(conn)

	const N = 10
	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make([]error, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, errs[i] = repo.SuspendInstance(id, nil, fmt.Sprintf("reason-%d", i), 1, "alice")
		}(i)
	}
	close(start)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("SuspendInstance[%d]: %v", i, err)
		}
	}

	got, err := repo.Get(id)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	var hist []InstanceSuspensionRecord
	if got.SuspensionHistory != "" {
		if err := json.Unmarshal([]byte(got.SuspensionHistory), &hist); err != nil {
			t.Fatalf("history unmarshal: %v", err)
		}
	}
	t.Logf("count=%d history=%d (want %d)", got.SuspensionCount, len(hist), N)
	if got.SuspensionCount != N {
		t.Fatalf("LOST UPDATE: suspension_count = %d, want %d", got.SuspensionCount, N)
	}
	if len(hist) != N {
		t.Fatalf("DROPPED ENTRY: history entries = %d, want %d", len(hist), N)
	}
}
