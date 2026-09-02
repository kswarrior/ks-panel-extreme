package models

import (
	"encoding/json"
	"time"
)

// Theme mirrors the frontend's Theme appearance spec (see web/src/types/theme.ts).
//
// The backend treats the spec as an opaque JSON blob on purpose: it stores +
// returns it verbatim and never inspects individual tokens. That keeps the
// theme HTTP API a pure pass-through so the Theme Studio can add fields later
// without a backend migration — the column + the Go struct stay the same.
//
// Go's json package decodes into a json.RawMessage (not a fixed struct) so the
// full fidelity of the client-supplied spec survives the round-trip — unknown
// fields aren't dropped, and an empty spec can't accidentally marshal to "{}"
// and clobber the client's defaults.
type Theme struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Builtin     bool            `json:"builtin"`
	Spec        json.RawMessage `json:"spec,omitempty"` // the full Theme object
	CreatedBy   *int64          `json:"created_by,omitempty"`
	// OwnerID ties the theme to the user that authored it. Migration 054
	// wires the THEMES_OWN / THEMES_ALL scope keys: an Own role only sees
	// rows where OwnerID = caller; All / umbrella see the full library.
	// Zero = pre-054 row (orphan). Built-in themes (Builtin == true)
	// stay visible to every role because they ship with the panel and
	// are not really owned by anyone.
	OwnerID int64 `json:"owner_id,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// ThemeAssignment maps a single scope (an area id like "admin" or a page id
// like "admin.users") to the global theme that should paint it.
type ThemeAssignment struct {
	Scope   string `json:"scope"`
	ThemeID string `json:"theme_id"`
}

// ThemeWithOwner extends Theme with the username of its creator, used by the
// admin's Theme Studio management view. Empty when the creator was deleted.
type ThemeWithOwner struct {
	Theme
	OwnerName string `json:"owner_name,omitempty"`
}
