package models

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Template is a reusable deploy blueprint (PufferPanel-style). The panel
// only stores the spec; ksedge interprets it through the matching driver.
type Template struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	// Kind selects the ksedge driver: "docker" | "lxd" | "kvm" | "multipass".
	Kind string `json:"kind"`
	// Image is the driver-specific base (e.g. "alpine:3.19", "ubuntu/22.04",
	// "debian-12"). Forwarded verbatim to the driver.
	Image string `json:"image"`
	// Spec is the JSON blob of driver-specific config (env, ports, limits,
	// mounts, command…). Treated as opaque by the panel beyond validation of
	// being well-formed JSON.
	Spec string `json:"spec"`
	// Icon is raw SVG markup for the template tile (same convention as
	// instances: full <svg>…</svg> block or inner markup, empty = driver
	// kind glyph). Migration 059.
	Icon string `json:"icon,omitempty"`
	// Color is an optional #rrggbb accent tinting the tile on cards.
	// Empty = theme default. Migration 059.
	Color     string    `json:"color,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// OwnerID ties the template to the user that created it. Migration
	// 054 wires the TEMPLATES_OWN/TEMPLATES_ALL scope keys: an Own
	// role only sees rows where OwnerID = caller; All / umbrella keep
	// the full library view. Zero = pre-054 row (orphan).
	OwnerID int64 `json:"owner_id,omitempty"`
	// OwnerName is the denormalised username joined from users so the
	// admin template list can render "alice" instead of just the int id.
	OwnerName string `json:"owner_name,omitempty"`
}

// InstancePage is a reusable page definition for instance templates.
// Admins create these to provide custom documentation, dashboards, or
// configuration UIs within the instance panel sidebar.
type InstancePage struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	Slug            string `json:"slug"`
	Kind            string `json:"kind"` // "custom" (legacy "builtin" rows were purged by migration 046 and are rejected by the API)
	Category        string `json:"category"`
	// PageType (API/JSON key "type", column page_type) classifies the page
	// flavor — dashboard, status, docs, admin-panel, widget, … — mirroring
	// the Category/Type pickers in the template editor. Free-form; "" == unset.
	PageType        string `json:"type"`
	Description     string `json:"description"`
	ContentType     string `json:"content_type"` // "html" | "markdown" | "blocks"
	ContentHTML     string `json:"content_html"`
	ContentMarkdown string `json:"content_markdown"`
	ContentBlocks   string `json:"content_blocks"`
	// Actions is a JSON array of executable page actions (shell, file ops,
	// docker/kvm/lxd) authored in the Instance Page Studio. Empty string ==
	// no actions. Validated server-side to be a well-formed JSON array.
	Actions string `json:"actions"`
	// SubPages is a JSON array of extra page definitions that ship with this
	// page ({path,name,content_type,content_html,content_markdown,
	// content_blocks}). Each entry becomes a spec.pages row with slug
	// "<slug>/<path>" when the page is linked/imported (multi-page support:
	// e.g. Files → files/edit). Empty string == no sub-pages.
	SubPages string `json:"sub_pages"`
	// Components is a JSON array of reusable UI blocks
	// ({name,type,description,content}) authored in the Instance Page Studio's
	// Components tab. Page content references them with {{component:name}};
	// linking a page copies them into spec.pages so the runtime can
	// substitute the tokens when rendering. Empty string == no components.
	Components string `json:"components"`
	// Configure is a JSON array of page-level EnvVariable-style definitions
	// ({name,label,description,default,user_viewable,user_editable,required,
	// rule,display,options,append,prepend,append_value}) authored in the
	// Studio's Configure tab (like the template editor's Env Variables).
	// Stored with the page so linking copies definitions into spec.pages
	// for the template editor's per-page Configure values.
	Configure string `json:"configure"`
	IconSVG    string `json:"icon_svg"`
	// IconColor is an optional #rrggbb accent tinting the icon_svg tile on
	// library cards. Empty = theme default. Migration 060.
	IconColor string `json:"icon_color,omitempty"`
	// Source tracks page provenance for the library badges: "studio" (own
	// pages incl. Studio/file/URL creates), "market" (fresh marketplace
	// import, unmodified), "edited" (market import later modified).
	// "" from old rows is treated as "studio".
	Source string `json:"source"`
	// MarketID is the marketplace catalog id the row was imported from
	// ("" == not a market page). MarketVersion is the catalog version at
	// import time ("" == unknown).
	MarketID      string `json:"market_id"`
	MarketVersion string `json:"market_version"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// OwnerID ties the page to the user that authored it. Migration 054
	// wires the INSTANCE_PAGES_OWN / INSTANCE_PAGES_ALL scope keys; see
	// Template.OwnerID for the full contract.
	OwnerID int64 `json:"owner_id,omitempty"`
	// OwnerName is the denormalised username so the admin library list
	// can render "alice" instead of just the integer id.
	OwnerName string `json:"owner_name,omitempty"`
}

// Instance is one deployed workload living on an edge node.
type Instance struct {
	ID         int64  `json:"id"`
	NodeID     int64  `json:"node_id"`
	NodeName   string `json:"node_name,omitempty"`
	TemplateID int64  `json:"template_id"`
	// TemplateName is denormalised for the UI listing so a deleted template
	// still shows a readable label.
	TemplateName string `json:"template_name,omitempty"`
	// OwnerID is the user that "owns" this instance — admins deploy on
	// behalf of an owner; the user-facing Instances page filters by it.
	// Zero means "unattributed" (pre-owner instances from before the
	// column existed).
	OwnerID int64 `json:"owner_id,omitempty"`
	// OwnerName is the denormalised username — joined from users so the
	// admin table can show "alice" instead of just the integer id.
	OwnerName string `json:"owner_name,omitempty"`
	Name      string `json:"name"`
	// DisplayName is the human-readable label shown in the UI.
	// Falls back to Name when empty.
	DisplayName string `json:"display_name,omitempty"`
	// Icon is an optional SVG string rendered on the instance card.
	Icon string `json:"icon,omitempty"`
	// Color is an optional hex colour for the icon/accent on the card.
	Color      string `json:"color,omitempty"`
	Kind       string `json:"kind"`
	Status     string `json:"status"`
	ExternalID string `json:"external_id,omitempty"`
	Config     string `json:"config,omitempty"`
	Error      string `json:"error,omitempty"`
	// Install workflow tracking (set by the edge install poller after deploy).
	InstallState string `json:"install_state,omitempty"` // "" | "running" | "done" | "failed"
	InstallID    string `json:"install_id,omitempty"`    // "<kind>:<name>" key for edge poll
	// InstallStep has NO omitempty on purpose: step index 0 is a real,
	// meaningful value ("step #0 running / failed") and omitting it made the
	// SPA read it as -1 ("not started") for exactly the first workflow step.
	// -1 remains the explicit "not started" sentinel.
	InstallStep      int    `json:"install_step"`                 // current step index (-1 = not started)
	InstallError     string `json:"install_error,omitempty"`      // short failure message from edge
	InstallStepsJSON string `json:"install_steps_json,omitempty"` // full transcript JSON
	// InstallKind: '' = the template's spec.install[] workflow kicked off
	// at deploy time; 'action' = a template.spec.actions[] entry the
	// operator invoked from the home-page Actions card. installSweepLoop
	// uses this to decide what to do with the container after the workflow
	// completes (the install workflow always stops the container; an action
	// respects its auto_stop_on_exit flag).
	InstallKind string `json:"install_kind,omitempty"`
	// InstallAutoStop: when InstallKind=='action', 1 means the sweep loop
	// should stop the container after the action's process exits (the action's
	// auto_stop_on_exit flag). 0 means leave the container running.
	InstallAutoStop int `json:"install_auto_stop,omitempty"`
	// InstallActionID: when InstallKind=='action', the spec.actions[].id of
	// the action currently in flight. Lets the home-page Actions card morph
	// only the matching action's button to a "Stop" button. Empty for the
	// template install workflow and once the workflow resolves.
	InstallActionID string `json:"install_action_id,omitempty"`

	// ── Suspension fields (migration 038) ─────────────────────────────────
	// Suspended indicates if the instance is currently suspended (0 = no, 1 = yes).
	Suspended int `json:"suspended"`
	// SuspendedUntil is the timestamp when the suspension automatically expires.
	// NULL means suspended until admin manually unsuspends.
	SuspendedUntil *time.Time `json:"suspended_until,omitempty"`
	// SuspensionCount is the total number of times this instance has been suspended.
	SuspensionCount int `json:"suspension_count"`
	// SuspensionHistory is a JSON array of suspension records for audit trail.
	SuspensionHistory string `json:"-"`

	// StartedAt is when the instance last transitioned to "running" (deploy/start/restart).
	// NULL = never started or stopped. Used for uptime display in InstanceCard.
	StartedAt *time.Time `json:"started_at,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// parseQuotaBytes parses "10240M", "20G", "512m", "2GB", "1024" to bytes
// (1024-based, case-insensitive, optional trailing B). Mirrors the frontend
// parseBytes in InstanceCard.tsx so the panel and SPA agree on quota math.
// Returns 0 on any unparsable input.
func parseQuotaBytes(raw any) int64 {
	if raw == nil {
		return 0
	}
	var s string
	switch v := raw.(type) {
	case string:
		s = strings.TrimSpace(v)
	case float64:
		if v > 0 && v == float64(int64(v)) {
			return int64(v)
		}
		if v > 0 {
			return int64(v)
		}
		return 0
	case float32:
		if v > 0 {
			return int64(v)
		}
		return 0
	case int:
		if v > 0 {
			return int64(v)
		}
		return 0
	case int64:
		if v > 0 {
			return v
		}
		return 0
	default:
		s = strings.TrimSpace(strings.ToLower(strings.TrimSpace(anyToStr(v))))
	}
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return 0
	}
	// Split numeric prefix from unit suffix.
	i := 0
	for i < len(s) && ((s[i] >= '0' && s[i] <= '9') || s[i] == '.') {
		i++
	}
	if i == 0 {
		return 0
	}
	num, err := strconv.ParseFloat(s[:i], 64)
	if err != nil || num <= 0 {
		return 0
	}
	unit := strings.TrimSpace(s[i:])
	// Strip a single trailing "b" ("mb" → "m", "gb" → "g") and an optional
	// "ib" ("mib" → "m") so every spelling maps to its k/m/g/t prefix.
	unit = strings.TrimSuffix(unit, "b")
	unit = strings.TrimSuffix(unit, "i")
	var mul float64 = 1
	if len(unit) > 0 {
		switch unit[0] {
		case 'k':
			mul = 1024
		case 'm':
			mul = 1024 * 1024
		case 'g':
			mul = 1024 * 1024 * 1024
		case 't':
			mul = 1024 * 1024 * 1024 * 1024
		case 'b', '\x00':
			mul = 1
		default:
			return 0
		}
	}
	return int64(num * mul)
}

func anyToStr(v any) string {
	switch x := v.(type) {
	case string:
		return x
	default:
		return fmt.Sprintf("%v", v)
	}
}

// DiskQuotaBytes extracts the configured disk quota in bytes from an
// instance.Config / template Spec JSON blob. It mirrors the frontend
// parseLimits key order (limits → top-level → advanced.multipass/kvm/lxd)
// so the Overview shows the same 10240M the template declares. Keys ending
// in _mb are interpreted as mebibytes. Returns 0 when no quota is set.
func DiskQuotaBytes(configJSON string) int64 {
	configJSON = strings.TrimSpace(configJSON)
	if configJSON == "" {
		return 0
	}
	var cfg map[string]any
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil || cfg == nil {
		return 0
	}
	limits, _ := cfg["limits"].(map[string]any)
	adv, _ := cfg["advanced"].(map[string]any)
	var mpAdv, kvmAdv, lxdAdv map[string]any
	if adv != nil {
		mpAdv, _ = adv["multipass"].(map[string]any)
		kvmAdv, _ = adv["kvm"].(map[string]any)
		lxdAdv, _ = adv["lxd"].(map[string]any)
	}
	// Candidate sources in priority order. Each entry notes whether its key
	// is an _mb number (mebibytes) rather than a size string.
	type cand struct {
		m    map[string]any
		key  string
		isMB bool
	}
	cands := []cand{}
	for _, k := range []string{"disk", "disk_size", "disk-size", "storage"} {
		if limits != nil {
			cands = append(cands, cand{limits, k, false})
		}
	}
	if limits != nil {
		cands = append(cands, cand{limits, "disk_mb", true})
	}
	for _, k := range []string{"disk", "disk_size", "storage"} {
		cands = append(cands, cand{cfg, k, false})
	}
	cands = append(cands, cand{cfg, "disk_mb", true})
	if mpAdv != nil {
		cands = append(cands, cand{mpAdv, "disk", false}, cand{mpAdv, "disk_mb", true})
	}
	if kvmAdv != nil {
		cands = append(cands, cand{kvmAdv, "disk", false}, cand{kvmAdv, "disk_size", false})
	}
	if lxdAdv != nil {
		cands = append(cands, cand{lxdAdv, "storage_volume_size", false})
	}
	for _, c := range cands {
		if c.m == nil {
			continue
		}
		raw, ok := c.m[c.key]
		if !ok || raw == nil {
			continue
		}
		if s, ok := raw.(string); ok && strings.TrimSpace(s) == "" {
			continue
		}
		var b int64
		if c.isMB {
			// _mb keys are plain numbers in mebibytes ("10240" or 10240).
			// A size string with a unit ("10G") still parses via the
			// generic path so hand-written specs don't silently drop.
			if s, ok := raw.(string); ok {
				ts := strings.TrimSpace(strings.ToLower(s))
				hasUnit := strings.ContainsAny(ts, "kmgtb")
				if !hasUnit {
					if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil && f > 0 {
						b = int64(f * 1024 * 1024)
					}
				} else {
					b = parseQuotaBytes(raw)
				}
			} else if f, ok := toFloat(raw); ok && f > 0 {
				b = int64(f * 1024 * 1024)
			}
		} else {
			b = parseQuotaBytes(raw)
		}
		if b > 0 {
			return b
		}
	}
	return 0
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		if f, err := n.Float64(); err == nil {
			return f, true
		}
	}
	return 0, false
}

// EnrichMetricsWithDiskQuota injects the configured disk quota into a live
// metrics blob as disk_total so the Overview shows limits.disk (e.g. 10240M)
// instead of the host filesystem size df reports inside a docker container
// (e.g. 144GB). disk_used is left untouched (the edge owns accounting,
// including bind-mounts). No quota → blob returned unchanged. Never fails:
// unparsable inputs return the original blob verbatim.
func EnrichMetricsWithDiskQuota(metricsJSON, configJSON string) string {
	quota := DiskQuotaBytes(configJSON)
	if quota <= 0 {
		return metricsJSON
	}
	trimmed := strings.TrimSpace(metricsJSON)
	if trimmed == "" || trimmed == "{}" {
		return metricsJSON
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(metricsJSON), &m); err != nil || m == nil {
		return metricsJSON
	}
	m["disk_total"] = quota
	if b, err := json.Marshal(m); err == nil {
		return string(b)
	}
	return metricsJSON
}
