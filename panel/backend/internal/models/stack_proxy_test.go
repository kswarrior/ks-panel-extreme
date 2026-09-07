package models

import "testing"

// Table tests for the stack-app proxy mount validators (migration 072).
// Pure unit tests — no DB needed.
func TestValidStackProxyPort(t *testing.T) {
	for _, tc := range []struct {
		port int
		ok   bool
	}{
		{0, true}, // proxy off
		{1, true},
		{6600, true},
		{65535, true},
		{-1, false},
		{65536, false},
		{1 << 30, false},
	} {
		if got := ValidStackProxyPort(tc.port); got != tc.ok {
			t.Errorf("ValidStackProxyPort(%d) = %v, want %v", tc.port, got, tc.ok)
		}
	}
}

func TestValidStackProxyRoot(t *testing.T) {
	for _, tc := range []struct {
		root string
		ok   bool
	}{
		{"", true}, // proxy off
		{"dash", true},
		{"my-dash2", true},
		{"a", true},
		{"UPPER", false},
		{"has space", false},
		{"has/slash", false},
		{"-lead", false},
		{"/dash", false},
		{"dash/", false},
		{"a_underscore", false},
		{"0123456789012345678901234567890123", false}, // 34 chars
	} {
		if got := ValidStackProxyRoot(tc.root); got != tc.ok {
			t.Errorf("ValidStackProxyRoot(%q) = %v, want %v", tc.root, got, tc.ok)
		}
	}
}

func TestIsReservedStackProxyRoot(t *testing.T) {
	for _, r := range []string{"api", "health", "favicon.ico", "assets"} {
		if !IsReservedStackProxyRoot(r) {
			t.Errorf("IsReservedStackProxyRoot(%q) = false, want true", r)
		}
	}
	for _, r := range []string{"", "dash", "panel", "apiary"} {
		if IsReservedStackProxyRoot(r) {
			t.Errorf("IsReservedStackProxyRoot(%q) = true, want false", r)
		}
	}
}
