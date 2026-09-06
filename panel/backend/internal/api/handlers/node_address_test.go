package handlers

import "testing"

func TestPortFromAddress(t *testing.T) {
	cases := []struct{ addr, fallback, want string }{
		{"127.0.0.1:4040", "4040", "4040"},
		{"example.com:8080", "4040", "8080"},
		{"example.com", "4040", "4040"},
		{"[::1]", "4040", "4040"},
		{"[::1]:4040", "4040", "4040"},
		{"[2001:db8::1]:8080", "4040", "8080"},
		{"[::1]:abc", "4040", "4040"},
		{"host:abc", "4040", "4040"},
		{"", "4040", "4040"},
	}
	for _, c := range cases {
		if got := portFromAddress(c.addr, c.fallback); got != c.want {
			t.Errorf("portFromAddress(%q) = %q, want %q", c.addr, got, c.want)
		}
	}
}
