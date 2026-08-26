package models

import "time"

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
	Spec      string    `json:"spec"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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
	SubPages  string    `json:"sub_pages"`
	IconSVG   string    `json:"icon_svg"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
