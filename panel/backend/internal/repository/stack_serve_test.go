package repository

import (
	"testing"

	_ "modernc.org/sqlite"
)

// TestUpdateStackServePortValidation covers the dedicated serve-port
// rules: usable ports only, an app to serve (loopback or remote), no
// cross-stack clashes, and upstream-only dial config without a /<root>
// mount.
func TestUpdateStackServePortValidation(t *testing.T) {
	db := openAnnounceTestDB(t)
	r := NewStackRepository(db)
	mk := func(name, slug string) int64 {
		s, _, err := r.CreateStack(CreateStackInput{Name: name, Slug: slug})
		if err != nil {
			t.Fatalf("CreateStack %s: %v", slug, err)
		}
		return s.ID
	}
	base := func() UpdateStackInput {
		return UpdateStackInput{Name: "Dash", Category: "dashboard", Version: "1.0.0"}
	}
	a, b := mk("A", "serve-a"), mk("B", "serve-b")

	// Serve port without any app to serve is rejected.
	in := base()
	in.ServePort = 6901
	if _, err := r.UpdateStack(a, in); err == nil {
		t.Fatal("serve port without a loopback port or remote address must be rejected")
	}

	// Unusable serve ports are rejected.
	in = base()
	in.ProxyPort = 6600
	in.ProxyRootURL = "dash"
	in.ServePort = 99999
	if _, err := r.UpdateStack(a, in); err == nil {
		t.Fatal("out-of-range serve port must be rejected")
	}

	// Loopback upstream without a root mount is allowed as serve feed.
	in = base()
	in.ProxyPort = 6600
	in.ServePort = 6901
	in.ServeAuth = true
	got, err := r.UpdateStack(a, in)
	if err != nil {
		t.Fatalf("serve with loopback upstream: %v", err)
	}
	if got.ServePort != 6901 || !got.ServeAuth {
		t.Fatalf("serve fields not stored: %+v", got)
	}

	// Same serve port on another stack clashes (409 upstream).
	in = base()
	in.ProxyPort = 6601
	in.ServePort = 6901
	if _, err := r.UpdateStack(b, in); err == nil {
		t.Fatal("duplicate serve port must be rejected")
	}

	// Same stack re-saving its own port is fine (exclude-self).
	in = base()
	in.ProxyPort = 6600
	in.ServePort = 6901
	if _, err := r.UpdateStack(a, in); err != nil {
		t.Fatalf("re-saving own serve port: %v", err)
	}

	// Remote upstream without a root mount is allowed as serve feed.
	in = base()
	in.RemoteAddress = "10.0.0.9:7700"
	in.ServePort = 6902
	if _, err := r.UpdateStack(b, in); err != nil {
		t.Fatalf("serve with remote upstream: %v", err)
	}

	// Remote stack with neither mount nor serve port stays rejected.
	in = base()
	in.RemoteAddress = "10.0.0.9:7700"
	if _, err := r.UpdateStack(b, in); err == nil {
		t.Fatal("remote stack with no mount and no serve port must be rejected")
	}

	// Clearing the serve port works.
	in = base()
	in.ProxyPort = 6600
	in.ProxyRootURL = "dash"
	in.ServePort = 0
	if _, err := r.UpdateStack(a, in); err != nil {
		t.Fatalf("clearing serve port: %v", err)
	}

	// ServePortTaken: 0 is never taken, unknown ports are free.
	if taken, err := r.ServePortTaken(0, 0); err != nil || taken {
		t.Fatalf("ServePortTaken(0) = %v, %v; want false, nil", taken, err)
	}
	if taken, err := r.ServePortTaken(46901, 0); err != nil || taken {
		t.Fatalf("ServePortTaken(free) = %v, %v; want false, nil", taken, err)
	}
}

// TestListActiveServeStacks scoping: only active, serve-configured rows
// are returned for the listener reconciler.
func TestListActiveServeStacks(t *testing.T) {
	db := openAnnounceTestDB(t)
	r := NewStackRepository(db)
	s, _, err := r.CreateStack(CreateStackInput{Name: "Dash", Slug: "serve-list"})
	if err != nil {
		t.Fatalf("CreateStack: %v", err)
	}
	in := UpdateStackInput{Name: "Dash", Category: "dashboard", Version: "1.0.0", ProxyPort: 6600, ServePort: 46902}
	if _, err := r.UpdateStack(s.ID, in); err != nil {
		t.Fatalf("UpdateStack: %v", err)
	}
	got, err := r.ListActiveServeStacks()
	if err != nil {
		t.Fatalf("ListActiveServeStacks: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("inactive stack must not be listed, got %d", len(got))
	}
	if err := r.Activate(s.ID); err != nil {
		t.Fatalf("Activate: %v", err)
	}
	got, err = r.ListActiveServeStacks()
	if err != nil {
		t.Fatalf("ListActiveServeStacks: %v", err)
	}
	if len(got) != 1 || got[0].ID != s.ID || got[0].ServePort != 46902 {
		t.Fatalf("active serve stack must be listed, got %+v", got)
	}
	if err := r.Deactivate(s.ID); err != nil {
		t.Fatalf("Deactivate: %v", err)
	}
	got, err = r.ListActiveServeStacks()
	if err != nil {
		t.Fatalf("ListActiveServeStacks: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("deactivated stack must not be listed, got %d", len(got))
	}
}
