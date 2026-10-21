package models

import (
	"fmt"
	"strconv"
	"strings"
)

// Version constraint grammar for mod-to-mod dependencies (manifest
// `requires: {"other-slug": ">=1.2.3"}`). Supported forms:
//
//	*            any installed version
//	>=1.2.3      installed version at least 1.2.3
//	^1.2.3       same major, at least 1.2.3
//	1.2.3        exact match
//
// Versions are numeric dot triples; missing components read as 0 so "1.2"
// and "1.2.0" are the same version.
type VersionConstraint struct {
	op          string
	major       int
	minor       int
	patch       int
	original    string
	wildcard    bool
}

// ParseConstraint parses a version constraint string. A blank constraint is
// treated as "*" so a manifest can list a dependency without pinning it.
func ParseConstraint(s string) (VersionConstraint, error) {
	raw := strings.TrimSpace(s)
	c := VersionConstraint{original: raw}
	if raw == "" || raw == "*" {
		c.op = "*"
		c.wildcard = true
		return c, nil
	}
	op := "="
	switch {
	case strings.HasPrefix(raw, ">="):
		op, raw = ">=", strings.TrimSpace(raw[2:])
	case strings.HasPrefix(raw, "^"):
		op, raw = "^", strings.TrimSpace(raw[1:])
	}
	major, minor, patch, err := parseVersion(raw)
	if err != nil {
		return VersionConstraint{}, fmt.Errorf("invalid version constraint %q: %w", c.original, err)
	}
	c.op, c.major, c.minor, c.patch = op, major, minor, patch
	return c, nil
}

// Matches reports whether an installed version satisfies the constraint. An
// unparseable installed version fails every constraint except "*".
func (c VersionConstraint) Matches(version string) bool {
	if c.wildcard {
		return true
	}
	major, minor, patch, err := parseVersion(strings.TrimSpace(version))
	if err != nil {
		return false
	}
	cmp := compareVersions(major, minor, patch, c.major, c.minor, c.patch)
	switch c.op {
	case ">=":
		return cmp >= 0
	case "^":
		return major == c.major && cmp >= 0
	default:
		return cmp == 0
	}
}

// String returns the constraint in canonical form.
func (c VersionConstraint) String() string {
	if c.wildcard {
		return "*"
	}
	v := fmt.Sprintf("%d.%d.%d", c.major, c.minor, c.patch)
	if c.op == "=" {
		return v
	}
	return c.op + v
}

// parseVersion parses "x", "x.y" or "x.y.z" into a numeric triple.
func parseVersion(s string) (int, int, int, error) {
	if s == "" {
		return 0, 0, 0, fmt.Errorf("empty version")
	}
	parts := strings.Split(s, ".")
	if len(parts) > 3 {
		return 0, 0, 0, fmt.Errorf("version has too many components")
	}
	nums := [3]int{}
	for i, p := range parts {
		if p == "" {
			return 0, 0, 0, fmt.Errorf("empty version component")
		}
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return 0, 0, 0, fmt.Errorf("non-numeric version component %q", p)
		}
		nums[i] = n
	}
	return nums[0], nums[1], nums[2], nil
}

func compareVersions(aMajor, aMinor, aPatch, bMajor, bMinor, bPatch int) int {
	switch {
	case aMajor != bMajor:
		if aMajor < bMajor {
			return -1
		}
		return 1
	case aMinor != bMinor:
		if aMinor < bMinor {
			return -1
		}
		return 1
	case aPatch != bPatch:
		if aPatch < bPatch {
			return -1
		}
		return 1
	}
	return 0
}
