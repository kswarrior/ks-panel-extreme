package models

import (
	"fmt"
	"sort"
	"strings"
)

// DependencyIssue is one reason a mod cannot activate (or cannot boot). It is
// JSON-serialisable so the activate handler can return the full blocked list
// and the UI can show actionable diagnostics instead of a generic 409.
type DependencyIssue struct {
	Mod              string `json:"mod"`                         // dependent mod slug
	Requires         string `json:"requires"`                    // required mod slug
	Constraint       string `json:"constraint,omitempty"`        // declared constraint
	InstalledVersion string `json:"installed_version,omitempty"` // present dependency version
	Reason           string `json:"reason"`                      // missing|inactive|version|self|cycle|dependency_blocked|invalid_constraint
}

// DependencyError bundles every unsatisfied dependency for one activation.
type DependencyError struct {
	Slug   string            `json:"slug"`
	Issues []DependencyIssue `json:"issues"`
}

func (e *DependencyError) Error() string {
	if len(e.Issues) == 0 {
		return "mod dependencies are not satisfied"
	}
	parts := make([]string, 0, len(e.Issues))
	for _, i := range e.Issues {
		switch i.Reason {
		case "missing":
			parts = append(parts, fmt.Sprintf("%s is not installed", i.Requires))
		case "inactive":
			parts = append(parts, fmt.Sprintf("%s is installed but inactive", i.Requires))
		case "version":
			parts = append(parts, fmt.Sprintf("%s %s does not satisfy %s", i.Requires, i.InstalledVersion, i.Constraint))
		case "cycle":
			parts = append(parts, "dependency cycle")
		case "dependency_blocked":
			parts = append(parts, fmt.Sprintf("%s is blocked", i.Requires))
		default:
			parts = append(parts, fmt.Sprintf("%s: %s", i.Requires, i.Reason))
		}
	}
	return fmt.Sprintf("mod %q has unsatisfied dependencies: %s", e.Slug, strings.Join(parts, "; "))
}

// DependentsError is returned when deactivating a mod would strand active
// dependents. Deactivation never cascades silently.
type DependentsError struct {
	Slug       string   `json:"slug"`
	Dependents []string `json:"dependents"`
}

func (e *DependentsError) Error() string {
	return fmt.Sprintf("mod %q is required by active mod(s): %s", e.Slug, strings.Join(e.Dependents, ", "))
}

// ConflictError reports a provides/conflicts collision. The string form is
// human-readable; handlers return Conflicts as JSON.
type ConflictError struct {
	Slug      string   `json:"slug"`
	Conflicts []string `json:"conflicts"`
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf("mod %q conflicts with: %s", e.Slug, strings.Join(e.Conflicts, ", "))
}

// CheckDependencies returns every unsatisfied dependency for target. When
// requireActive is true (activation + boot), a dependency must be installed,
// active and satisfy the declared version constraint. When false (install-time
// diagnostics), only presence + version are checked.
func CheckDependencies(target *Mod, installed []*Mod, requireActive bool) []DependencyIssue {
	if target == nil {
		return nil
	}
	man := ParseV2Manifest(target.Manifest)
	if len(man.Requires.Mods) == 0 {
		return nil
	}
	bySlug := make(map[string]*Mod, len(installed))
	for _, m := range installed {
		if m != nil {
			bySlug[m.Slug] = m
		}
	}
	slugs := make([]string, 0, len(man.Requires.Mods))
	for slug := range man.Requires.Mods {
		slugs = append(slugs, slug)
	}
	sort.Strings(slugs)
	issues := make([]DependencyIssue, 0, len(slugs))
	for _, slug := range slugs {
		constraintText := man.Requires.Mods[slug]
		issue := DependencyIssue{
			Mod:        target.Slug,
			Requires:   slug,
			Constraint: constraintText,
		}
		constraint, err := ParseConstraint(constraintText)
		if err != nil {
			issue.Reason = "invalid_constraint"
			issues = append(issues, issue)
			continue
		}
		dep, ok := bySlug[slug]
		if !ok {
			issue.Reason = "missing"
			issues = append(issues, issue)
			continue
		}
		issue.InstalledVersion = dep.Version
		if dep.ID == target.ID || dep.Slug == target.Slug {
			issue.Reason = "self"
			issues = append(issues, issue)
			continue
		}
		if requireActive && !dep.Active {
			issue.Reason = "inactive"
			issues = append(issues, issue)
			continue
		}
		if !constraint.Matches(dep.Version) {
			issue.Reason = "version"
			issues = append(issues, issue)
		}
	}
	return issues
}

// ActiveDependents returns the slugs of active mods that require target. Used
// by Deactivate to refuse a change that would strand a running dependent.
func ActiveDependents(target *Mod, active []*Mod) []string {
	if target == nil {
		return nil
	}
	out := make([]string, 0)
	for _, m := range active {
		if m == nil || m.ID == target.ID || !m.Active {
			continue
		}
		man := ParseV2Manifest(m.Manifest)
		if _, ok := man.Requires.Mods[target.Slug]; ok {
			out = append(out, m.Slug)
		}
	}
	sort.Strings(out)
	return out
}

// CheckConflicts returns explicit conflicts (against every installed mod) and
// one-owner provides collisions (against active mods). Explicit conflicts block
// even when the other side is inactive so two mutually exclusive mods cannot be
// installed as an apparently-valid pair.
func CheckConflicts(target *Mod, installed []*Mod) []string {
	if target == nil {
		return nil
	}
	targetMan := ParseV2Manifest(target.Manifest)
	targetConflicts := toSet(targetMan.Conflicts)
	targetProvides := toSet(targetMan.Provides)
	conflicts := map[string]bool{}
	for _, other := range installed {
		if other == nil || other.ID == target.ID || other.Slug == target.Slug {
			continue
		}
		otherMan := ParseV2Manifest(other.Manifest)
		otherProvides := toSet(otherMan.Provides)
		otherConflicts := toSet(otherMan.Conflicts)

		if targetConflicts[other.Slug] {
			conflicts["conflicts with "+other.Slug] = true
		}
		for _, token := range otherMan.Provides {
			if targetConflicts[token] {
				conflicts["conflicts with "+other.Slug+" ("+token+")"] = true
			}
		}
		if otherConflicts[target.Slug] {
			conflicts[other.Slug+" conflicts with this mod"] = true
		}
		for _, token := range targetMan.Provides {
			if otherConflicts[token] {
				conflicts[other.Slug+" conflicts with "+token] = true
			}
		}
		if other.Active {
			for token := range targetProvides {
				if otherProvides[token] {
					conflicts["one-owner token "+token+" already provided by "+other.Slug] = true
				}
			}
		}
	}
	out := make([]string, 0, len(conflicts))
	for c := range conflicts {
		out = append(out, c)
	}
	sort.Strings(out)
	return out
}

// SortModsByDependency returns active mods in dependency order plus the map of
// mods that cannot boot (missing/inactive/version/cycle/dependency-blocked).
// Deterministic slug ordering keeps boot reproducible across map iteration.
func SortModsByDependency(mods []*Mod) ([]*Mod, map[string][]DependencyIssue) {
	bySlug := make(map[string]*Mod, len(mods))
	for _, m := range mods {
		if m != nil {
			bySlug[m.Slug] = m
		}
	}
	direct := make(map[string][]DependencyIssue, len(bySlug))
	for slug, m := range bySlug {
		direct[slug] = CheckDependencies(m, mods, true)
	}
	remaining := make(map[string]*Mod, len(bySlug))
	for slug, m := range bySlug {
		remaining[slug] = m
	}
	blocked := map[string][]DependencyIssue{}
	ordered := make([]*Mod, 0, len(mods))

	for len(remaining) > 0 {
		progress := false

		// Mark direct failures, then propagate a blocked dependency.
		for _, slug := range sortedSlugs(remaining) {
			if issues := direct[slug]; len(issues) > 0 {
				blocked[slug] = issues
				delete(remaining, slug)
				progress = true
				continue
			}
			man := ParseV2Manifest(remaining[slug].Manifest)
			for depSlug := range man.Requires.Mods {
				if _, isBlocked := blocked[depSlug]; isBlocked {
					blocked[slug] = []DependencyIssue{{
						Mod:      slug,
						Requires: depSlug,
						Reason:   "dependency_blocked",
					}}
					delete(remaining, slug)
					progress = true
					break
				}
			}
		}

		ready := make([]string, 0)
		for _, slug := range sortedSlugs(remaining) {
			man := ParseV2Manifest(remaining[slug].Manifest)
			ok := true
			for depSlug := range man.Requires.Mods {
				if _, waiting := remaining[depSlug]; waiting {
					ok = false
					break
				}
			}
			if ok {
				ready = append(ready, slug)
			}
		}
		sort.Strings(ready)
		for _, slug := range ready {
			ordered = append(ordered, remaining[slug])
			delete(remaining, slug)
			progress = true
		}

		if !progress {
			// Everything left participates in (or depends on) a cycle.
			for _, slug := range sortedSlugs(remaining) {
				blocked[slug] = []DependencyIssue{{
					Mod:    slug,
					Reason: "cycle",
				}}
				delete(remaining, slug)
			}
		}
	}
	return ordered, blocked
}

func sortedSlugs(mods map[string]*Mod) []string {
	out := make([]string, 0, len(mods))
	for slug := range mods {
		out = append(out, slug)
	}
	sort.Strings(out)
	return out
}

func toSet(values []string) map[string]bool {
	out := make(map[string]bool, len(values))
	for _, v := range values {
		out[v] = true
	}
	return out
}
