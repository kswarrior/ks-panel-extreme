package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/permissions"
	"github.com/example/kspanel/internal/repository"
)

// Per-page server KV store (plan item 7): sdk.kv.get/set/delete persisted
// server-side per instance + page family, so page state survives
// browsers/profiles (unlike sdk.storage, which is localStorage).
//
// Security model (fail closed, mirrors ExecuteCustomPageActionHandler):
//   - Routes carry the same VIEW_INSTANCES-family gate at registration
//     (server.go, inside the existing /api/instance-pages group).
//   - Every call stamps instance_id + page_slug. The slug must resolve
//     against THIS instance's own deploy-time config via
//     findSpecPageRow(parseSpecRows(instance.Config), pageSlug) — exact
//     slug, legacy original_slug, or a nested "<parent>/<sub>" sub-page of
//     an enabled parent row. Sub-pages share the parent family: the SDK
//     stamps sdk.pageSlug verbatim (e.g. "files/edit") and the owning row
//     carries the keys. Anything else 403s.
//   - Ownership scope: Own without All may only reach own instances.
//   - Strict JSON on PUT (unknown fields rejected — no mass assignment).
//
// KV is NOT a secrets store: values sit in the clear in page_kv and are
// returned to anyone who can view the instance's page. Never put
// tokens/passwords here — use the secrets vault instead.
//
// Quotas (anti-abuse, enforced below): <= 100 keys per
// (instance_id, page_slug), key ^[A-Za-z0-9_.-]{1,128}$, value <= 64KiB.

const (
	// maxPageKVKeys caps the keys one instance + page family may hold.
	maxPageKVKeys = 100
	// maxPageKVValueBytes caps one value (bytes, not runes).
	maxPageKVValueBytes = 64 * 1024
	// maxPageKVSlugLen caps the stored page_slug (VARCHAR(128) column).
	maxPageKVSlugLen = 128
	// maxPageKVBodyBytes caps the PUT body (64KiB value + JSON overhead).
	maxPageKVBodyBytes = 128 * 1024
)

// pageKVKeyRe is the positive key charset: 1-128 of A-Za-z0-9_.- .
var pageKVKeyRe = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,128}$`)

// validatePageKVKey rejects keys outside the allow-listed charset/length.
func validatePageKVKey(k string) error {
	if !pageKVKeyRe.MatchString(k) {
		return newErrString("invalid key (allowed: 1-128 characters of A-Za-z0-9_.-)")
	}
	return nil
}

// validatePageKVValue rejects oversized values.
func validatePageKVValue(v string) error {
	if len(v) > maxPageKVValueBytes {
		return newErrString(fmt.Sprintf("value too large (%d bytes, max %d)", len(v), maxPageKVValueBytes))
	}
	return nil
}

// pageKVScope resolves instance_id + page_slug from the query string and
// enforces instance existence, ownership scope and the page-family gate.
// On success it returns the open handle (the caller MUST Close it); on
// denial it writes the error and returns ok=false, and the caller MUST
// `return` immediately.
func pageKVScope(w http.ResponseWriter, r *http.Request) (con *sql.DB, instance *models.Instance, pageSlug string, ok bool) {
	q := r.URL.Query()
	id, err := strconv.ParseInt(strings.TrimSpace(q.Get("instance_id")), 10, 64)
	pageSlug = strings.TrimSpace(q.Get("page_slug"))
	if err != nil || id <= 0 || pageSlug == "" {
		http.Error(w, "instance_id and page_slug are required", http.StatusBadRequest)
		return nil, nil, "", false
	}
	if len(pageSlug) > maxPageKVSlugLen {
		http.Error(w, "page_slug too long (max 128 characters)", http.StatusBadRequest)
		return nil, nil, "", false
	}
	con, err = repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return nil, nil, "", false
	}
	instance, gerr := repository.NewInstanceRepository(con).Get(id)
	if gerr != nil || instance == nil {
		con.Close()
		http.Error(w, "instance not found", http.StatusNotFound)
		return nil, nil, "", false
	}
	// Ownership scope: Own without All may only reach own instances.
	if uid, uerr := UserIDFromContext(r); uerr == nil && uid != 0 {
		chk := permissions.NewChecker(con)
		hasOwn, hasAll, serr := chk.HasScope(uid, permissions.InstancesOwnKey, permissions.InstancesAllKey, permissions.ManageInstancesKey)
		if serr != nil {
			con.Close()
			http.Error(w, "forbidden", http.StatusForbidden)
			return nil, nil, "", false
		}
		if !hasAll && hasOwn && instance.OwnerID != uid {
			con.Close()
			http.Error(w, "forbidden", http.StatusForbidden)
			return nil, nil, "", false
		}
	}
	// Page-bound gate: the calling page family must be enabled in THIS
	// instance's deploy-time config snapshot (EMPTY-BY-DEFAULT semantics).
	if row := findSpecPageRow(parseSpecRows(instance.Config), pageSlug); row == nil {
		con.Close()
		http.Error(w, "page not enabled for this instance", http.StatusForbidden)
		return nil, nil, "", false
	}
	return con, instance, pageSlug, true
}

// ListPageKVHandler returns every key for one instance + page family.
// GET /api/instance-pages/kv?instance_id=&page_slug= — full values (the
// quota keeps them small).
func ListPageKVHandler(w http.ResponseWriter, r *http.Request) {
	con, instance, pageSlug, ok := pageKVScope(w, r)
	if !ok {
		return
	}
	defer con.Close()
	entries, err := repository.NewPageKVRepository(con).List(instance.ID, pageSlug)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{
		"instance_id": instance.ID,
		"page_slug":   pageSlug,
		"entries":     entries,
	})
}

// UpsertPageKVHandler creates or replaces one key.
// PUT /api/instance-pages/kv?instance_id=&page_slug= {k, v} — unknown
// fields rejected, inserts past the per-page quota rejected.
func UpsertPageKVHandler(w http.ResponseWriter, r *http.Request) {
	con, instance, pageSlug, ok := pageKVScope(w, r)
	if !ok {
		return
	}
	defer con.Close()
	var req struct {
		K string  `json:"k"`
		V *string `json:"v"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxPageKVBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	if err := validatePageKVKey(req.K); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.V == nil {
		http.Error(w, "k and v are required", http.StatusBadRequest)
		return
	}
	if err := validatePageKVValue(*req.V); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	repo := repository.NewPageKVRepository(con)
	existing, err := repo.Get(instance.ID, pageSlug, req.K)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if existing == nil {
		n, err := repo.CountKeys(instance.ID, pageSlug)
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		if n >= maxPageKVKeys {
			http.Error(w, fmt.Sprintf("page kv quota exceeded (max %d keys per page)", maxPageKVKeys), http.StatusBadRequest)
			return
		}
	}
	stamp := time.Now().UTC().Format("2006-01-02 15:04:05")
	if err := repo.Put(instance.ID, pageSlug, req.K, *req.V, stamp); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"ok": true, "k": req.K, "updated_at": stamp})
}

// DeletePageKVHandler removes one key (idempotent: missing keys still
// answer ok, mirroring sdk.storage.delete).
// DELETE /api/instance-pages/kv?instance_id=&page_slug=&k=
func DeletePageKVHandler(w http.ResponseWriter, r *http.Request) {
	con, instance, pageSlug, ok := pageKVScope(w, r)
	if !ok {
		return
	}
	defer con.Close()
	k := strings.TrimSpace(r.URL.Query().Get("k"))
	if err := validatePageKVKey(k); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := repository.NewPageKVRepository(con).Delete(instance.ID, pageSlug, k); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"ok": true, "k": k})
}
