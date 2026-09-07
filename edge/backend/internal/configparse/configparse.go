package configparse

// Config-file parsers (spec.config_files).
//
// Pterodactyl/Pelican eggs carry `config.files: { "<path>": { parser, find } }`
// applied by Wings before boot (properties/yaml/json/ini/xml/file). KS had no
// equivalent (score 20) — every game reinvented file writes via page actions.
//
// This file implements the KS superset (score 100):
//   - spec.config_files[] array (native): {file, parser, find, create_if_missing?, description?}
//   - Ptero-compat reads: spec.config.files object + spec.config_files object map
//   - parsers: properties, yaml/yml, json, ini, xml, file, toml (toml is KS-only, beats Ptero)
//   - key paths: dot notation + [index] + * wildcard (yaml/json), section.key (ini/toml),
//     tag.attr / tag paths (xml), key (properties), line-prefix (file)
//   - find values: scalar (exact set) or map (multi find/replace within the resolved string)
//   - {{VAR}}/${VAR} substitution happens upstream (deploy substitutes via env scopes);
//
// Validation fails closed at template save time; pure Apply functions power the
// preview endpoint and are mirrored in edge/backend/internal/configparse for
// real in-workload execution.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// validConfigParsers is the set of accepted parser names (lowercased).
var validConfigParsers = map[string]bool{
	"properties": true,
	"yaml":       true,
	"yml":        true,
	"json":       true,
	"ini":        true,
	"xml":        true,
	"file":       true,
	"toml":       true,
}

// configFileMaxEntries caps spec.config_files length; 32 files × 100 keys is
// already far beyond any real game egg (minecraft needs 1-2).
const (
	configFileMaxEntries  = 32
	configFindMaxEntries  = 100
	configFilePathMaxLen  = 500
	configFindKeyMaxLen   = 500
	configFindValueMaxLen = 8192
)

// ConfigFileEntry is the normalized form of one spec.config_files row.
type ConfigFileEntry struct {
	File            string         `json:"file"`
	Parser          string         `json:"parser"`
	Find            map[string]any `json:"find"`
	CreateIfMissing bool           `json:"create_if_missing,omitempty"`
	Description     string         `json:"description,omitempty"`
}

// normalizeConfigFiles extracts spec.config_files in all accepted shapes:
//   - array (native KS): [{file, parser, find, ...}]
//   - object map (hand-written / Ptero-style): {"server.properties": {parser, find}}
//   - nested Ptero PTDL_v2: spec.config.files object
//
// Returns the normalized array (in stable sorted order for maps). Empty spec =
// nil, nil error. Validation errors are returned (caller wraps as 400).
func normalizeConfigFiles(spec map[string]any) ([]ConfigFileEntry, error) {
	if spec == nil {
		return nil, nil
	}
	// Collect candidates: top-level config_files (array or object) + nested config.files.
	var out []ConfigFileEntry
	seen := map[string]bool{}
	appendEntry := func(e ConfigFileEntry) {
		key := strings.ToLower(e.Parser) + "\x00" + e.File
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, e)
	}

	if raw, present := spec["config_files"]; present && raw != nil {
		switch v := raw.(type) {
		case []any:
			for i, item := range v {
				m, ok := item.(map[string]any)
				if !ok {
					return nil, fmt.Errorf("spec.config_files[%d] must be an object", i)
				}
				e, err := parseConfigFileEntry(m, fmt.Sprintf("spec.config_files[%d]", i))
				if err != nil {
					return nil, err
				}
				appendEntry(e)
			}
		case map[string]any:
			// Object-map shape: keys are file paths.
			keys := make([]string, 0, len(v))
			for k := range v {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, file := range keys {
				mv, ok := v[file].(map[string]any)
				if !ok {
					return nil, fmt.Errorf("spec.config_files[%q] must be an object {parser, find}", file)
				}
				// Inject file key so parseConfigFileEntry sees it.
				clone := make(map[string]any, len(mv)+1)
				for k2, v2 := range mv {
					clone[k2] = v2
				}
				if _, has := clone["file"]; !has {
					clone["file"] = file
				}
				e, err := parseConfigFileEntry(clone, fmt.Sprintf("spec.config_files[%q]", file))
				if err != nil {
					return nil, err
				}
				appendEntry(e)
			}
		default:
			return nil, fmt.Errorf("spec.config_files must be an array or object")
		}
	}
	// Ptero PTDL_v2 nested shape: spec.config.files
	if rawCfg, present := spec["config"]; present && rawCfg != nil {
		if cfgMap, ok := rawCfg.(map[string]any); ok {
			if rawFiles, present := cfgMap["files"]; present && rawFiles != nil {
				switch v := rawFiles.(type) {
				case map[string]any:
					keys := make([]string, 0, len(v))
					for k := range v {
						keys = append(keys, k)
					}
					sort.Strings(keys)
					for _, file := range keys {
						mv, ok := v[file].(map[string]any)
						if !ok {
							return nil, fmt.Errorf("spec.config.files[%q] must be an object {parser, find}", file)
						}
						clone := make(map[string]any, len(mv)+1)
						for k2, v2 := range mv {
							clone[k2] = v2
						}
						if _, has := clone["file"]; !has {
							clone["file"] = file
						}
						e, err := parseConfigFileEntry(clone, fmt.Sprintf("spec.config.files[%q]", file))
						if err != nil {
							return nil, err
						}
						appendEntry(e)
					}
				case []any:
					for i, item := range v {
						m, ok := item.(map[string]any)
						if !ok {
							return nil, fmt.Errorf("spec.config.files[%d] must be an object", i)
						}
						e, err := parseConfigFileEntry(m, fmt.Sprintf("spec.config.files[%d]", i))
						if err != nil {
							return nil, err
						}
						appendEntry(e)
					}
				case string:
					// Ptero default export uses "files": "{}" (empty JSON string).
					s := strings.TrimSpace(v)
					if s != "" && s != "{}" && s != "[]" && s != "null" {
						return nil, fmt.Errorf("spec.config.files must be an object or array")
					}
				default:
					return nil, fmt.Errorf("spec.config.files must be an object or array")
				}
			}
		}
	}
	return out, nil
}

func parseConfigFileEntry(m map[string]any, where string) (ConfigFileEntry, error) {
	var e ConfigFileEntry
	file := strings.TrimSpace(getString(m, "file"))
	if file == "" {
		// Ptero import may carry the path under "path".
		file = strings.TrimSpace(getString(m, "path"))
	}
	if file == "" {
		return e, fmt.Errorf("%s: file is required (relative path inside the workload, e.g. server.properties)", where)
	}
	if len(file) > configFilePathMaxLen {
		return e, fmt.Errorf("%s: file too long (max %d)", where, configFilePathMaxLen)
	}
	if err := validateConfigFilePath(file); err != nil {
		return e, fmt.Errorf("%s: %w", where, err)
	}
	parser := strings.ToLower(strings.TrimSpace(getString(m, "parser")))
	if parser == "" {
		return e, fmt.Errorf("%s: parser is required (one of: properties, yaml, json, ini, xml, file, toml)", where)
	}
	if !validConfigParsers[parser] {
		return e, fmt.Errorf("%s: unknown parser %q (want one of: properties, yaml, json, ini, xml, file, toml)", where, getString(m, "parser"))
	}
	if parser == "yml" {
		parser = "yaml"
	}
	rawFind, present := m["find"]
	if !present || rawFind == nil {
		return e, fmt.Errorf("%s: find is required (object of key-path -> value)", where)
	}
	findMap, ok := rawFind.(map[string]any)
	if !ok {
		return e, fmt.Errorf("%s: find must be an object", where)
	}
	if len(findMap) == 0 {
		return e, fmt.Errorf("%s: find must not be empty", where)
	}
	if len(findMap) > configFindMaxEntries {
		return e, fmt.Errorf("%s: find holds at most %d entries", where, configFindMaxEntries)
	}
	for k, v := range findMap {
		if strings.TrimSpace(k) == "" {
			return e, fmt.Errorf("%s: find keys must be non-empty", where)
		}
		if len(k) > configFindKeyMaxLen {
			return e, fmt.Errorf("%s: find key %q too long (max %d)", where, k, configFindKeyMaxLen)
		}
		switch tv := v.(type) {
		case nil:
			return e, fmt.Errorf("%s: find[%q] must not be null (use empty string)", where, k)
		case string:
			if len(tv) > configFindValueMaxLen {
				return e, fmt.Errorf("%s: find[%q] value too long (max %d)", where, k, configFindValueMaxLen)
			}
		case float64, bool:
			// scalars OK
		case map[string]any:
			// Multi find/replace: {old: new, ...} — each old/new must be scalar-ish.
			if len(tv) == 0 {
				return e, fmt.Errorf("%s: find[%q] multi-replace map must not be empty", where, k)
			}
			if len(tv) > configFindMaxEntries {
				return e, fmt.Errorf("%s: find[%q] multi-replace holds at most %d entries", where, k, configFindMaxEntries)
			}
			for ok2, nv := range tv {
				if len(ok2) > configFindKeyMaxLen || len(configScalarString(nv)) > configFindValueMaxLen {
					return e, fmt.Errorf("%s: find[%q] multi-replace entry too long", where, k)
				}
				switch nv.(type) {
				case string, float64, bool, nil:
				default:
					return e, fmt.Errorf("%s: find[%q]: multi-replace values must be scalars", where, k)
				}
			}
		case []any:
			return e, fmt.Errorf("%s: find[%q] must be a scalar or multi-replace object (arrays go in the key path via [index])", where, k)
		default:
			return e, fmt.Errorf("%s: find[%q] must be a string, number, boolean or multi-replace object", where, k)
		}
	}
	e = ConfigFileEntry{
		File:            file,
		Parser:          parser,
		Find:            findMap,
		CreateIfMissing: getBool(m, "create_if_missing"),
		Description:     getString(m, "description"),
	}
	if len(e.Description) > 500 {
		return e, fmt.Errorf("%s: description too long (max 500)", where)
	}
	// Alias: Ptero eggs sometimes use create_if_missing as createIfMissing.
	if !e.CreateIfMissing {
		if bv, ok := m["createIfMissing"].(bool); ok && bv {
			e.CreateIfMissing = true
		}
	}
	return e, nil
}

// validateConfigFilePath rejects absolute paths, parent traversal and
// control characters. Paths are relative to the workload root
// (/home/container equivalent): e.g. "server.properties", "config/app.yml".
func validateConfigFilePath(p string) error {
	if p == "" {
		return fmt.Errorf("file is required")
	}
	if strings.Contains(p, "\x00") || strings.Contains(p, "\n") || strings.Contains(p, "\r") {
		return fmt.Errorf("file %q must not contain control characters", p)
	}
	if strings.HasPrefix(p, "/") || strings.HasPrefix(p, "\\") {
		return fmt.Errorf("file %q must be relative (no leading /)", p)
	}
	// Drive-letter / UNC / home shortcuts are never valid inside a workload.
	if len(p) >= 2 && p[1] == ':' {
		return fmt.Errorf("file %q must be relative (no drive letter)", p)
	}
	if strings.HasPrefix(p, "~") {
		return fmt.Errorf("file %q must be relative (no ~)", p)
	}
	for _, seg := range strings.Split(strings.ReplaceAll(p, "\\", "/"), "/") {
		if seg == ".." {
			return fmt.Errorf("file %q must not contain .. traversal", p)
		}
	}
	if strings.TrimSpace(p) == "" {
		return fmt.Errorf("file must not be blank")
	}
	return nil
}

// validateConfigFiles validates all accepted shapes via normalizeConfigFiles
// plus the top-level count cap.
func validateConfigFiles(spec map[string]any) error {
	entries, err := normalizeConfigFiles(spec)
	if err != nil {
		return err
	}
	if len(entries) > configFileMaxEntries {
		return fmt.Errorf("spec.config_files holds at most %d files", configFileMaxEntries)
	}
	return nil
}

func configScalarString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		return string(t)
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

// ---------------------------------------------------------------------------
// Pure apply (shared algorithm with edge/backend/internal/configparse).
// ApplyConfigContent parses content with parser, sets every find key-path to
// its value (scalars) or multi-replaces (maps), and re-serializes.
// Returns the new content + whether anything changed.
// ---------------------------------------------------------------------------

// ApplyConfigContent applies find replacements to content per parser.
// Unknown placeholders are NOT resolved here (deploy already substituted
// {{VAR}}); values are used verbatim.
func ApplyConfigContent(parser, content string, find map[string]any) (string, bool, error) {
	p := strings.ToLower(strings.TrimSpace(parser))
	if p == "yml" {
		p = "yaml"
	}
	if !validConfigParsers[p] {
		return "", false, fmt.Errorf("unknown parser %q", parser)
	}
	if len(find) == 0 {
		return content, false, nil
	}
	// Stable key order so multi-key applies are deterministic.
	keys := make([]string, 0, len(find))
	for k := range find {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	switch p {
	case "properties":
		return applyProperties(content, keys, find)
	case "ini":
		return applyINI(content, keys, find)
	case "json":
		return applyJSON(content, keys, find)
	case "yaml":
		return applyYAML(content, keys, find)
	case "xml":
		return applyXML(content, keys, find)
	case "file":
		return applyFileLines(content, keys, find)
	case "toml":
		return applyTOML(content, keys, find)
	default:
		return "", false, fmt.Errorf("unknown parser %q", parser)
	}
}

// --- properties: key=value / key: value / key value, # ! comments, \ escapes ---
func applyProperties(content string, keys []string, find map[string]any) (string, bool, error) {
	lines := strings.Split(content, "\n")
	// Index: normalized key -> line idx (last wins, like java.util.Properties).
	idx := map[string]int{}
	for i, ln := range lines {
		k, _, ok := splitPropertyLine(ln)
		if !ok {
			continue
		}
		idx[normalizePropKey(k)] = i
	}
	changed := false
	for _, k := range keys {
		v := find[k]
		if _, isMap := v.(map[string]any); isMap {
			// Multi-replace within the resolved line value.
			li, ok := idx[normalizePropKey(k)]
			if !ok {
				continue
			}
			ck, cv, ok2 := splitPropertyLine(lines[li])
			if !ok2 {
				continue
			}
			newVal, did := multiReplaceString(cv, v.(map[string]any))
			if did {
				lines[li] = formatPropertyLine(ck, newVal)
				changed = true
			}
			continue
		}
		newVal := configScalarString(v)
		if li, ok := idx[normalizePropKey(k)]; ok {
			ck, cv, _ := splitPropertyLine(lines[li])
			if cv == newVal {
				continue
			}
			lines[li] = formatPropertyLine(ck, newVal)
			changed = true
		} else {
			lines = append(lines, formatPropertyLine(k, newVal))
			idx[normalizePropKey(k)] = len(lines) - 1
			changed = true
		}
	}
	return strings.Join(lines, "\n"), changed, nil
}

func normalizePropKey(k string) string { return strings.TrimSpace(k) }

func splitPropertyLine(ln string) (key, val string, ok bool) {
	trimmed := strings.TrimLeft(ln, " \t\f")
	if trimmed == "" || trimmed[0] == '#' || trimmed[0] == '!' {
		return "", "", false
	}
	// Find first unescaped = : or whitespace separator.
	esc := false
	for i := 0; i < len(ln); i++ {
		c := ln[i]
		if esc {
			esc = false
			continue
		}
		if c == '\\' {
			esc = true
			continue
		}
		if c == '=' || c == ':' {
			key = unescapeProp(strings.TrimSpace(ln[:i]))
			val = strings.TrimSpace(ln[i+1:])
			return key, unescapePropValue(val), true
		}
		if c == ' ' || c == '\t' || c == '\f' {
			// Whitespace separator: key, then skip spaces, optional =/:, value.
			key = unescapeProp(strings.TrimSpace(ln[:i]))
			rest := strings.TrimLeft(ln[i:], " \t\f")
			if rest != "" && (rest[0] == '=' || rest[0] == ':') {
				rest = strings.TrimLeft(rest[1:], " \t\f")
			}
			return key, unescapePropValue(strings.TrimSpace(rest)), true
		}
	}
	return "", "", false
}

func unescapeProp(s string) string {
	r := strings.NewReplacer(`\ `, " ", `\t`, "\t", `\n`, "\n", `\r`, "\r", `\f`, "\f", `\\`, "\\", `\=`, "=", `\:`, ":", `\#`, "#", `\!`, "!")
	return r.Replace(s)
}

func unescapePropValue(s string) string {
	// Strip surrounding quotes if the author quoted the value (lenient).
	if len(s) >= 2 && ((s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'')) {
		s = s[1 : len(s)-1]
	}
	return unescapeProp(s)
}

func formatPropertyLine(key, val string) string {
	// Escape backslash first, then the separators a bare reader would split on.
	esc := strings.NewReplacer("\\", `\\`, "\n", `\n`, "\r", `\r`, "\t", `\t`, "=", `\=`, ":", `\:`, "#", `\#`, "!", `\!`, " ", `\ `)
	_ = esc
	// Keys with spaces must escape them; values stay human-readable (only
	// escape newlines/backslashes) so server.properties stays reviewable.
	ek := strings.NewReplacer("\\", `\\`, " ", `\ `, "=", `\=`, ":", `\:`, "#", `\#`, "!", `\!`, "\n", `\n`, "\r", `\r`, "\t", `\t`).Replace(key)
	ev := strings.NewReplacer("\\", `\\`, "\n", `\n`, "\r", `\r`, "\t", `\t`).Replace(val)
	return ek + "=" + ev
}

func multiReplaceString(cur string, m map[string]any) (string, bool) {
	out := cur
	did := false
	olds := make([]string, 0, len(m))
	for o := range m {
		olds = append(olds, o)
	}
	sort.Strings(olds)
	for _, o := range olds {
		n := configScalarString(m[o])
		if o == "" {
			continue
		}
		if strings.Contains(out, o) {
			out = strings.ReplaceAll(out, o, n)
			did = true
		} else if out == o {
			out = n
			did = true
		}
	}
	// Exact-match fallback: if nothing contained, but one old equals cur, set it.
	if !did {
		for _, o := range olds {
			if cur == o {
				return configScalarString(m[o]), true
			}
		}
	}
	return out, did
}

// --- file parser: match beginning of lines (Ptero `file` semantics) ---
func applyFileLines(content string, keys []string, find map[string]any) (string, bool, error) {
	lines := strings.Split(content, "\n")
	changed := false
	for _, k := range keys {
		v := find[k]
		if _, isMap := v.(map[string]any); isMap {
			// Multi-replace across every line containing an old token.
			olds := v.(map[string]any)
			for i, ln := range lines {
				nv, did := multiReplaceString(ln, olds)
				if did {
					lines[i] = nv
					changed = true
				}
			}
			continue
		}
		newVal := configScalarString(v)
		// Replace every line whose first non-space token starts with the key.
		matched := false
		for i, ln := range lines {
			trimmed := strings.TrimLeft(ln, " \t")
			if trimmed == "" {
				continue
			}
			if strings.HasPrefix(trimmed, k) {
				// Preserve leading indent; replace the whole line with key+value?
				// Ptero `file` replaces the matched line's value portion. We
				// keep it simple + reviewable: "<key><sep><newVal>" where sep
				// reuses the original separator when detectable.
				indent := ln[:len(ln)-len(trimmed)]
				sep := " "
				rest := trimmed[len(k):]
				if rest != "" && (rest[0] == '=' || rest[0] == ':') {
					sep = string(rest[0])
					if len(rest) > 1 && (rest[1] == ' ' || rest[1] == '\t') {
						sep += " "
					} else {
						sep += ""
					}
					// If original had "key = old", emit "key = new".
					if strings.Contains(rest, " ") && !strings.HasSuffix(sep, " ") {
						sep += " "
					}
				} else if strings.HasPrefix(rest, " ") || strings.HasPrefix(rest, "\t") {
					sep = " "
				}
				// Avoid churn when the value already matches.
				curVal := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(rest, "="), ":"))
				if curVal == newVal {
					matched = true
					continue
				}
				lines[i] = indent + k + sep + newVal
				changed = true
				matched = true
			}
		}
		if !matched {
			lines = append(lines, k+" "+newVal)
			changed = true
		}
	}
	return strings.Join(lines, "\n"), changed, nil
}

// --- JSON: dot + [i] + * ---
func applyJSON(content string, keys []string, find map[string]any) (string, bool, error) {
	var root any
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		root = map[string]any{}
	} else if err := json.Unmarshal([]byte(content), &root); err != nil {
		return "", false, fmt.Errorf("json parse: %w", err)
	}
	changed := false
	for _, k := range keys {
		v := find[k]
		did, err := setPath(root, parseKeyPath(k), v)
		if err != nil {
			return "", false, fmt.Errorf("json find[%q]: %w", k, err)
		}
		if did {
			changed = true
		}
	}
	if !changed {
		return content, false, nil
	}
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return "", false, err
	}
	return string(out) + "\n", true, nil
}

// --- YAML subset (indent maps, "- " lists, scalars) ---
func applyYAML(content string, keys []string, find map[string]any) (string, bool, error) {
	root, err := parseSimpleYAML(content)
	if err != nil {
		return "", false, fmt.Errorf("yaml parse: %w", err)
	}
	if root == nil {
		root = map[string]any{}
	}
	changed := false
	for _, k := range keys {
		v := find[k]
		did, err := setPath(root, parseKeyPath(k), v)
		if err != nil {
			return "", false, fmt.Errorf("yaml find[%q]: %w", k, err)
		}
		if did {
			changed = true
		}
	}
	if !changed {
		return content, false, nil
	}
	return dumpSimpleYAML(root), true, nil
}

// --- INI: [section] key=value; key paths "section.key" or "key" ---
func applyINI(content string, keys []string, find map[string]any) (string, bool, error) {
	// Preserve line order/comments; index section -> key -> line.
	type loc struct {
		sec string
		idx int
	}
	lines := strings.Split(content, "\n")
	curSec := ""
	pos := map[string]int{} // sec\x00key -> line idx
	for i, ln := range lines {
		t := strings.TrimSpace(ln)
		if t == "" || t[0] == '#' || t[0] == ';' {
			continue
		}
		if strings.HasPrefix(t, "[") && strings.HasSuffix(t, "]") {
			curSec = strings.TrimSpace(t[1 : len(t)-1])
			continue
		}
		if eq := strings.IndexAny(t, "=:"); eq > 0 {
			k := strings.TrimSpace(t[:eq])
			if k == "" {
				continue
			}
			pos[curSec+"\x00"+strings.ToLower(k)] = i
		}
	}
	changed := false
	for _, k := range keys {
		v := find[k]
		sec, key := splitINIKey(k)
		if _, isMap := v.(map[string]any); isMap {
			li, ok := pos[sec+"\x00"+strings.ToLower(key)]
			if !ok {
				continue
			}
			_, cv := splitINILine(lines[li])
			nv, did := multiReplaceString(cv, v.(map[string]any))
			if did {
				lines[li] = key + " = " + nv
				changed = true
			}
			continue
		}
		nv := configScalarString(v)
		if li, ok := pos[sec+"\x00"+strings.ToLower(key)]; ok {
			_, cv := splitINILine(lines[li])
			if cv == nv {
				continue
			}
			lines[li] = key + " = " + nv
			changed = true
		} else {
			// Append under the right section (or create it).
			if sec == "" {
				lines = append(lines, key+" = "+nv)
				pos[sec+"\x00"+strings.ToLower(key)] = len(lines) - 1
			} else {
				secIdx := -1
				for i, ln := range lines {
					if strings.TrimSpace(ln) == "["+sec+"]" {
						secIdx = i
					}
				}
				if secIdx == -1 {
					lines = append(lines, "", "["+sec+"]", key+" = "+nv)
					pos[sec+"\x00"+strings.ToLower(key)] = len(lines) - 1
				} else {
					// Insert after last line of the section.
					ins := secIdx + 1
					for ins < len(lines) {
						t := strings.TrimSpace(lines[ins])
						if strings.HasPrefix(t, "[") && strings.HasSuffix(t, "]") {
							break
						}
						ins++
					}
					lines = append(lines[:ins], append([]string{key + " = " + nv}, lines[ins:]...)...)
					// Rebuild index cheaply (small files).
					pos = map[string]int{}
					cs := ""
					for i, ln := range lines {
						t := strings.TrimSpace(ln)
						if strings.HasPrefix(t, "[") && strings.HasSuffix(t, "]") {
							cs = strings.TrimSpace(t[1 : len(t)-1])
							continue
						}
						if t == "" || (len(t) > 0 && (t[0] == '#' || t[0] == ';')) {
							continue
						}
						if eq := strings.IndexAny(t, "=:"); eq > 0 {
							pos[cs+"\x00"+strings.ToLower(strings.TrimSpace(t[:eq]))] = i
						}
					}
				}
			}
			changed = true
		}
	}
	return strings.Join(lines, "\n"), changed, nil
}

func splitINIKey(k string) (sec, key string) {
	if i := strings.Index(k, "."); i >= 0 {
		return strings.TrimSpace(k[:i]), strings.TrimSpace(k[i+1:])
	}
	return "", strings.TrimSpace(k)
}

func splitINILine(ln string) (key, val string) {
	t := strings.TrimSpace(ln)
	if i := strings.IndexAny(t, "=:"); i >= 0 {
		key = strings.TrimSpace(t[:i])
		val = strings.TrimSpace(t[i+1:])
		// Strip inline ; # comments (unquoted).
		if ci := strings.Index(val, " ;"); ci >= 0 {
			val = strings.TrimSpace(val[:ci])
		}
		if ci := strings.Index(val, " #"); ci >= 0 {
			val = strings.TrimSpace(val[:ci])
		}
		val = strings.Trim(val, `"'`)
		return key, val
	}
	return t, ""
}

// --- TOML subset: key = value, [section], [[array]] minimal ---
func applyTOML(content string, keys []string, find map[string]any) (string, bool, error) {
	lines := strings.Split(content, "\n")
	curSec := ""
	pos := map[string]int{}
	for i, ln := range lines {
		t := strings.TrimSpace(ln)
		if t == "" || t[0] == '#' {
			continue
		}
		if strings.HasPrefix(t, "[[") && strings.HasSuffix(t, "]]") {
			curSec = strings.TrimSpace(t[2 : len(t)-2])
			continue
		}
		if strings.HasPrefix(t, "[") && strings.HasSuffix(t, "]") {
			curSec = strings.TrimSpace(t[1 : len(t)-1])
			continue
		}
		if eq := strings.Index(t, "="); eq > 0 {
			k := strings.TrimSpace(t[:eq])
			pos[curSec+"\x00"+strings.ToLower(k)] = i
		}
	}
	changed := false
	for _, k := range keys {
		v := find[k]
		sec, key := splitINIKey(k)
		if _, isMap := v.(map[string]any); isMap {
			li, ok := pos[sec+"\x00"+strings.ToLower(key)]
			if !ok {
				continue
			}
			cv := tomlLineValue(lines[li])
			nv, did := multiReplaceString(cv, v.(map[string]any))
			if did {
				lines[li] = key + " = " + tomlQuote(nv)
				changed = true
			}
			continue
		}
		nv := configScalarString(v)
		if li, ok := pos[sec+"\x00"+strings.ToLower(key)]; ok {
			if tomlLineValue(lines[li]) == nv {
				continue
			}
			lines[li] = key + " = " + tomlQuote(nv)
			changed = true
		} else {
			if sec == "" {
				lines = append(lines, key+" = "+tomlQuote(nv))
			} else {
				found := false
				for _, ln := range lines {
					if strings.TrimSpace(ln) == "["+sec+"]" {
						found = true
						break
					}
				}
				if !found {
					lines = append(lines, "", "["+sec+"]", key+" = "+tomlQuote(nv))
				} else {
					// Append at end of section.
					ins := len(lines)
					for i, ln := range lines {
						if strings.TrimSpace(ln) == "["+sec+"]" {
							ins = i + 1
						}
					}
					for ins < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[ins]), "[") {
						ins++
					}
					lines = append(lines[:ins], append([]string{key + " = " + tomlQuote(nv)}, lines[ins:]...)...)
				}
			}
			changed = true
		}
	}
	return strings.Join(lines, "\n"), changed, nil
}

func tomlLineValue(ln string) string {
	t := strings.TrimSpace(ln)
	if i := strings.Index(t, "="); i >= 0 {
		v := strings.TrimSpace(t[i+1:])
		if ci := strings.Index(v, " #"); ci >= 0 {
			v = strings.TrimSpace(v[:ci])
		}
		return strings.Trim(v, `"`)
	}
	return ""
}

func tomlQuote(s string) string {
	// Numbers/bools stay bare so game TOMLs keep types; else quote.
	if s == "true" || s == "false" {
		return s
	}
	if _, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
}

// --- XML: dot tag paths + @attr, text() leaf ---
func applyXML(content string, keys []string, find map[string]any) (string, bool, error) {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return "", false, fmt.Errorf("xml is empty (use create_if_missing with a скелет or ship the file via install write step)")
	}
	type node struct {
		name     string
		attr     map[string]string
		text     string
		children []*node
	}
	// Minimal XML tree via manual scan (stdlib encoding/xml verbatim
	// round-trip loses comments/formatting; this keeps it simple + working
	// for game configs which are shallow).
	_ = trimmed
	// Use a tolerant approach: operate with string replacement on
	// <tag>old</tag> and attr="old" patterns. Full DOM would need external
	// deps; game XMLs (e.g. config.xml) are flat enough that targeted
	// replacement is the honest, working subset.
	out := content
	changed := false
	for _, k := range keys {
		v := find[k]
		if _, isMap := v.(map[string]any); isMap {
			nv, did := multiReplaceString(out, v.(map[string]any))
			if did {
				out = nv
				changed = true
			}
			continue
		}
		nv := configScalarString(v)
		// Attribute path: "server.port@value" or "tag@attr".
		if at := strings.LastIndex(k, "@"); at >= 0 && at < len(k)-1 {
			tagPath := strings.TrimSpace(k[:at])
			attr := strings.TrimSpace(k[at+1:])
			_ = tagPath
			// Replace attr="..." first occurrence after the tag (or anywhere).
			// Find attr="old" patterns.
			needle := attr + `="`
			idx := strings.Index(out, needle)
			if idx == -1 {
				needle = attr + `='`
				idx = strings.Index(out, needle)
				if idx == -1 {
					return "", false, fmt.Errorf("xml find[%q]: attribute %q not found", k, attr)
				}
				end := strings.Index(out[idx+len(needle):], "'")
				if end == -1 {
					return "", false, fmt.Errorf("xml find[%q]: unterminated attribute", k)
				}
				cur := out[idx+len(needle) : idx+len(needle)+end]
				if cur == nv {
					continue
				}
				out = out[:idx+len(needle)] + xmlEscape(nv) + out[idx+len(needle)+end:]
				changed = true
				continue
			}
			end := strings.Index(out[idx+len(needle):], `"`)
			if end == -1 {
				return "", false, fmt.Errorf("xml find[%q]: unterminated attribute", k)
			}
			cur := out[idx+len(needle) : idx+len(needle)+end]
			if cur == nv {
				continue
			}
			out = out[:idx+len(needle)] + xmlEscape(nv) + out[idx+len(needle)+end:]
			changed = true
			continue
		}
		// Tag path: last segment is the tag name.
		segs := strings.Split(k, ".")
		tag := strings.TrimSpace(segs[len(segs)-1])
		tag = strings.TrimSuffix(strings.TrimSuffix(tag, "()"), "text()")
		if tag == "" || strings.Contains(tag, "*") || strings.Contains(tag, "[") {
			return "", false, fmt.Errorf("xml find[%q]: use tag or tag@attr (wildcards unsupported for xml)", k)
		}
		open := "<" + tag
		// Find <tag>value</tag> (no attrs) or <tag ...>value</tag>.
		// Simplest: locate "<tag" then ">" then "</tag>".
		search := 0
		replaced := false
		for {
			oi := strings.Index(out[search:], open)
			if oi == -1 {
				break
			}
			oi += search
			// Ensure tag boundary (next char is > / space / /).
			after := ""
			if oi+len(open) < len(out) {
				after = string(out[oi+len(open)])
			}
			if after != "" && after != ">" && after != " " && after != "\t" && after != "\n" && after != "/" {
				search = oi + len(open)
				continue
			}
			gt := strings.Index(out[oi:], ">")
			if gt == -1 {
				break
			}
			gt += oi
			closeTag := "</" + tag + ">"
			ci := strings.Index(out[gt:], closeTag)
			if ci == -1 {
				search = gt + 1
				continue
			}
			ci += gt
			cur := out[gt+1 : ci]
			// Skip nested markup (only touch leaf text).
			if strings.Contains(cur, "<") {
				search = ci + len(closeTag)
				continue
			}
			if cur == nv {
				replaced = true
				break
			}
			out = out[:gt+1] + xmlEscape(nv) + out[ci:]
			changed = true
			replaced = true
			break
		}
		if !replaced {
			return "", false, fmt.Errorf("xml find[%q]: tag <%s> not found", k, tag)
		}
	}
	return out, changed, nil
}

func xmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;")
	return r.Replace(s)
}

// ---------------------------------------------------------------------------
// Key-path machinery (dot + [index] + *)
// ---------------------------------------------------------------------------

type pathSeg struct {
	key      string
	idx      *int
	wildcard bool // key == "*"
	idxWild  bool // [*]
}

func parseKeyPath(k string) []pathSeg {
	var segs []pathSeg
	for _, part := range strings.Split(k, ".") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		// Split "name[0][*]" suffixes.
		name := part
		var idxs []string
		for {
			o := strings.Index(name, "[")
			if o == -1 {
				break
			}
			c := strings.Index(name[o:], "]")
			if c == -1 {
				break
			}
			idxs = append(idxs, name[o+1:o+c])
			name = name[:o] + name[o+c+1:]
		}
		if name == "" && len(idxs) > 0 {
			// Pure "[0]" continues the previous segment's index.
			for _, ix := range idxs {
				if ix == "*" {
					segs = append(segs, pathSeg{idxWild: true})
				} else if n, err := strconv.Atoi(strings.TrimSpace(ix)); err == nil {
					nn := n
					segs = append(segs, pathSeg{idx: &nn})
				}
			}
			continue
		}
		seg := pathSeg{key: name}
		if name == "*" {
			seg.wildcard = true
		}
		segs = append(segs, seg)
		for _, ix := range idxs {
			if ix == "*" {
				segs = append(segs, pathSeg{idxWild: true})
			} else if n, err := strconv.Atoi(strings.TrimSpace(ix)); err == nil {
				nn := n
				segs = append(segs, pathSeg{idx: &nn})
			}
		}
	}
	return segs
}

// setPath sets find value v at path segs inside root (map/slice tree).
// Map values in v mean multi-replace on the resolved scalar string.
func setPath(root any, segs []pathSeg, v any) (bool, error) {
	if len(segs) == 0 {
		return false, fmt.Errorf("empty key path")
	}
	return setPathRec(root, segs, v)
}

func setPathRec(cur any, segs []pathSeg, v any) (bool, error) {
	seg := segs[0]
	last := len(segs) == 1
	// Wildcard over map keys.
	if seg.wildcard {
		m, ok := cur.(map[string]any)
		if !ok {
			return false, fmt.Errorf("wildcard * needs a map")
		}
		anyDid := false
		for _, kv := range configSortedKeys(m) {
			did, err := setPathRec(m[kv], segs[1:], v)
			if err != nil {
				continue
			}
			if did {
				anyDid = true
			}
		}
		if !anyDid {
			return false, fmt.Errorf("wildcard * matched nothing")
		}
		return true, nil
	}
	if seg.idxWild {
		arr, ok := cur.([]any)
		if !ok {
			return false, fmt.Errorf("[*] needs a list")
		}
		anyDid := false
		for i := range arr {
			if last {
				nv, did := applyScalarValue(arr[i], v)
				if did {
					arr[i] = nv
					anyDid = true
				}
				continue
			}
			did, err := setPathRec(arr[i], segs[1:], v)
			if err == nil && did {
				anyDid = true
			}
		}
		if !anyDid {
			return false, fmt.Errorf("[*] matched nothing")
		}
		return true, nil
	}
	if seg.idx != nil {
		arr, ok := cur.([]any)
		if !ok {
			return false, fmt.Errorf("[%d] needs a list", *seg.idx)
		}
		if *seg.idx < 0 || *seg.idx >= len(arr) {
			return false, fmt.Errorf("index [%d] out of range (len %d)", *seg.idx, len(arr))
		}
		if last {
			nv, did := applyScalarValue(arr[*seg.idx], v)
			if did {
				arr[*seg.idx] = nv
				return true, nil
			}
			return false, nil
		}
		return setPathRec(arr[*seg.idx], segs[1:], v)
	}
	// Named key over a map.
	m, ok := cur.(map[string]any)
	if !ok {
		return false, fmt.Errorf("key %q needs a map", seg.key)
	}
	if last {
		old, exists := m[seg.key]
		nv, did := applyScalarValue(old, v)
		if !exists {
			// Create missing leaf (scalar or multi-replace on empty = set if exact?).
			if _, isMap := v.(map[string]any); isMap {
				return false, fmt.Errorf("key %q not found (multi-replace needs an existing value)", seg.key)
			}
			m[seg.key] = nv
			return true, nil
		}
		if did {
			m[seg.key] = nv
			return true, nil
		}
		return false, nil
	}
	next, exists := m[seg.key]
	if !exists {
		// Auto-create intermediate maps (game configs gain new keys).
		nm := map[string]any{}
		m[seg.key] = nm
		next = nm
	}
	// Descend; if next is scalar but more path remains, replace with map.
	if _, isMap := next.(map[string]any); !isMap {
		if _, isArr := next.([]any); !isArr {
			// Only auto-replace nil/missing; never clobber a real scalar mid-path.
			if next != nil {
				return false, fmt.Errorf("key %q is a scalar (no deeper path)", seg.key)
			}
			nm := map[string]any{}
			m[seg.key] = nm
			next = nm
		}
	}
	return setPathRec(next, segs[1:], v)
}

func applyScalarValue(old, v any) (any, bool) {
	if m, ok := v.(map[string]any); ok {
		cur := configScalarString(old)
		nv, did := multiReplaceString(cur, m)
		if !did {
			return old, false
		}
		// Preserve the old JSON type when the replacement looks typed.
		return coerceScalar(old, nv), true
	}
	nv := configScalarString(v)
	if old == nil {
		return coerceScalar(nil, nv), true
	}
	cur := configScalarString(old)
	if cur == nv {
		return old, false
	}
	return coerceScalar(old, nv), true
}

func coerceScalar(old any, nv string) any {
	switch old.(type) {
	case bool:
		if nv == "true" {
			return true
		}
		if nv == "false" {
			return false
		}
		return nv
	case float64:
		if n, err := strconv.ParseFloat(nv, 64); err == nil {
			return n
		}
		return nv
	default:
		// Keep strings as strings; typed-looking replacements for new keys
		// still become real types when they parse cleanly (ports stay numbers).
		if nv == "true" {
			return true
		}
		if nv == "false" {
			return false
		}
		if n, err := strconv.ParseFloat(nv, 64); err == nil && nv != "" && isNumericToken(nv) {
			return n
		}
		return nv
	}
}

func isNumericToken(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	_, err := strconv.ParseFloat(s, 64)
	return err == nil
}

func configSortedKeys(m map[string]any) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

// --- minimal YAML (maps via indent, "- " lists, scalars, # comments) ---

func parseSimpleYAML(content string) (any, error) {
	lines := strings.Split(content, "\n")
	// Strip trailing \r (windows-authored eggs).
	for i := range lines {
		lines[i] = strings.TrimSuffix(lines[i], "\r")
	}
	pos := 0
	// Skip leading blanks/comments/---.
	for pos < len(lines) {
		t := strings.TrimSpace(lines[pos])
		if t == "" || strings.HasPrefix(t, "#") || t == "---" || t == "..." {
			pos++
			continue
		}
		break
	}
	if pos >= len(lines) {
		return map[string]any{}, nil
	}
	return parseYAMLBlock(lines, &pos, 0)
}

func yamlIndent(s string) int {
	n := 0
	for _, c := range s {
		if c == ' ' {
			n++
		} else if c == '\t' {
			n += 2
		} else {
			break
		}
	}
	return n
}

func parseYAMLBlock(lines []string, pos *int, indent int) (any, error) {
	// Decide map vs list by first meaningful line.
	i := *pos
	for i < len(lines) {
		t := strings.TrimSpace(lines[i])
		if t == "" || strings.HasPrefix(t, "#") {
			i++
			continue
		}
		break
	}
	if i >= len(lines) || yamlIndent(lines[i]) < indent {
		return nil, nil
	}
	if strings.HasPrefix(strings.TrimSpace(lines[i]), "- ") || strings.TrimSpace(lines[i]) == "-" {
		return parseYAMLList(lines, pos, indent)
	}
	return parseYAMLMap(lines, pos, indent)
}

func parseYAMLMap(lines []string, pos *int, indent int) (map[string]any, error) {
	out := map[string]any{}
	for *pos < len(lines) {
		raw := lines[*pos]
		t := strings.TrimSpace(raw)
		if t == "" || strings.HasPrefix(t, "#") || t == "---" || t == "..." {
			*pos++
			continue
		}
		ind := yamlIndent(raw)
		if ind < indent {
			break
		}
		if ind > indent {
			return out, fmt.Errorf("unexpected indent at line %d: %q", *pos+1, raw)
		}
		// List item at map level ends the map.
		if strings.HasPrefix(t, "- ") || t == "-" {
			break
		}
		ci := strings.Index(t, ":")
		if ci <= 0 {
			return out, fmt.Errorf("yaml line %d: want key: value, got %q", *pos+1, raw)
		}
		key := strings.TrimSpace(t[:ci])
		key = strings.Trim(key, `"'`)
		rest := strings.TrimSpace(t[ci+1:])
		// Strip inline comment (unquoted #).
		rest = stripInlineComment(rest)
		*pos++
		if rest != "" {
			// Inline value — but handle flow lists/maps minimally.
			out[key] = parseYAMLScalarFlow(rest)
			continue
		}
		// Nested block or null.
		j := *pos
		for j < len(lines) {
			tj := strings.TrimSpace(lines[j])
			if tj == "" || strings.HasPrefix(tj, "#") {
				j++
				continue
			}
			break
		}
		if j >= len(lines) || yamlIndent(lines[j]) <= indent {
			out[key] = nil
			continue
		}
		child, err := parseYAMLBlock(lines, pos, yamlIndent(lines[j]))
		if err != nil {
			return out, err
		}
		out[key] = child
	}
	return out, nil
}

func parseYAMLList(lines []string, pos *int, indent int) ([]any, error) {
	var out []any
	for *pos < len(lines) {
		raw := lines[*pos]
		t := strings.TrimSpace(raw)
		if t == "" || strings.HasPrefix(t, "#") {
			*pos++
			continue
		}
		ind := yamlIndent(raw)
		if ind < indent {
			break
		}
		if ind > indent {
			return out, fmt.Errorf("unexpected indent at line %d", *pos+1)
		}
		if !strings.HasPrefix(t, "- ") && t != "-" {
			break
		}
		item := strings.TrimSpace(strings.TrimPrefix(t, "-"))
		item = stripInlineComment(item)
		*pos++
		if item == "" {
			// Nested block under the dash.
			j := *pos
			for j < len(lines) {
				tj := strings.TrimSpace(lines[j])
				if tj == "" || strings.HasPrefix(tj, "#") {
					j++
					continue
				}
				break
			}
			if j < len(lines) && yamlIndent(lines[j]) > indent {
				child, err := parseYAMLBlock(lines, pos, yamlIndent(lines[j]))
				if err != nil {
					return out, err
				}
				out = append(out, child)
				continue
			}
			out = append(out, nil)
			continue
		}
		// "- key: value" inline map start.
		if ci := strings.Index(item, ":"); ci > 0 && !strings.HasPrefix(item, "[") && !strings.HasPrefix(item, "{") {
			// Treat as a single-pair map + consume following deeper lines.
			m := map[string]any{}
			k := strings.Trim(strings.TrimSpace(item[:ci]), `"'`)
			v := stripInlineComment(strings.TrimSpace(item[ci+1:]))
			if v == "" {
				j := *pos
				for j < len(lines) {
					tj := strings.TrimSpace(lines[j])
					if tj == "" || strings.HasPrefix(tj, "#") {
						j++
						continue
					}
					break
				}
				if j < len(lines) && yamlIndent(lines[j]) > indent {
					child, err := parseYAMLBlock(lines, pos, yamlIndent(lines[j]))
					if err != nil {
						return out, err
					}
					m[k] = child
				} else {
					m[k] = nil
				}
			} else {
				m[k] = parseYAMLScalarFlow(v)
			}
			// Consume sibling keys at deeper indent belonging to this item.
			for {
				j := *pos
				for j < len(lines) {
					tj := strings.TrimSpace(lines[j])
					if tj == "" || strings.HasPrefix(tj, "#") {
						j++
						continue
					}
					break
				}
				if j >= len(lines) || yamlIndent(lines[j]) <= indent || strings.HasPrefix(strings.TrimSpace(lines[j]), "- ") {
					break
				}
				// Must be key: value at deeper indent.
				tj := strings.TrimSpace(lines[j])
				ci2 := strings.Index(tj, ":")
				if ci2 <= 0 {
					break
				}
				k2 := strings.Trim(strings.TrimSpace(tj[:ci2]), `"'`)
				v2 := stripInlineComment(strings.TrimSpace(tj[ci2+1:]))
				*pos = j + 1
				if v2 == "" {
					jj := *pos
					for jj < len(lines) {
						tt := strings.TrimSpace(lines[jj])
						if tt == "" || strings.HasPrefix(tt, "#") {
							jj++
							continue
						}
						break
					}
					if jj < len(lines) && yamlIndent(lines[jj]) > yamlIndent(lines[j]) {
						child, err := parseYAMLBlock(lines, pos, yamlIndent(lines[jj]))
						if err != nil {
							return out, err
						}
						m[k2] = child
					} else {
						m[k2] = nil
					}
				} else {
					m[k2] = parseYAMLScalarFlow(v2)
				}
			}
			out = append(out, m)
			continue
		}
		out = append(out, parseYAMLScalarFlow(item))
	}
	return out, nil
}

func stripInlineComment(s string) string {
	// Cut " # comment" outside quotes.
	inS, inD := false, false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\'' && !inD {
			inS = !inS
		} else if c == '"' && !inS {
			inD = !inD
		} else if c == '#' && !inS && !inD && i > 0 && (s[i-1] == ' ' || s[i-1] == '\t') {
			return strings.TrimSpace(s[:i])
		}
	}
	return s
}

func parseYAMLScalarFlow(s string) any {
	t := strings.TrimSpace(s)
	if t == "" || t == "~" || t == "null" || t == "Null" || t == "NULL" {
		return nil
	}
	if t == "true" || t == "True" || t == "TRUE" {
		return true
	}
	if t == "false" || t == "False" || t == "FALSE" {
		return false
	}
	if len(t) >= 2 && ((t[0] == '"' && t[len(t)-1] == '"') || (t[0] == '\'' && t[len(t)-1] == '\'')) {
		inner := t[1 : len(t)-1]
		if t[0] == '"' {
			inner = strings.NewReplacer(`\"`, `"`, `\\`, "\\", `\n`, "\n", `\t`, "\t").Replace(inner)
		} else {
			inner = strings.ReplaceAll(inner, `''`, `'`)
		}
		return inner
	}
	// Flow list [a, b].
	if strings.HasPrefix(t, "[") && strings.HasSuffix(t, "]") {
		inner := strings.TrimSpace(t[1 : len(t)-1])
		if inner == "" {
			return []any{}
		}
		var arr []any
		for _, p := range splitFlow(inner) {
			arr = append(arr, parseYAMLScalarFlow(strings.TrimSpace(p)))
		}
		return arr
	}
	// Flow map {a: b}.
	if strings.HasPrefix(t, "{") && strings.HasSuffix(t, "}") {
		inner := strings.TrimSpace(t[1 : len(t)-1])
		m := map[string]any{}
		if inner == "" {
			return m
		}
		for _, p := range splitFlow(inner) {
			ci := strings.Index(p, ":")
			if ci <= 0 {
				continue
			}
			m[strings.Trim(strings.TrimSpace(p[:ci]), `"'`)] = parseYAMLScalarFlow(strings.TrimSpace(p[ci+1:]))
		}
		return m
	}
	if n, err := strconv.ParseFloat(t, 64); err == nil && isNumericToken(t) {
		return n
	}
	return t
}

func splitFlow(s string) []string {
	var parts []string
	depth := 0
	inS, inD := false, false
	start := 0
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\'' && !inD {
			inS = !inS
		} else if c == '"' && !inS {
			inD = !inD
		} else if !inS && !inD {
			if c == '[' || c == '{' {
				depth++
			} else if c == ']' || c == '}' {
				depth--
			} else if c == ',' && depth == 0 {
				parts = append(parts, s[start:i])
				start = i + 1
			}
		}
	}
	parts = append(parts, s[start:])
	return parts
}

func dumpSimpleYAML(root any) string {
	var b strings.Builder
	dumpYAMLNode(&b, root, 0)
	return b.String()
}

func dumpYAMLNode(b *strings.Builder, v any, indent int) {
	pad := strings.Repeat("  ", indent)
	switch t := v.(type) {
	case map[string]any:
		ks := configSortedKeys(t)
		if len(ks) == 0 {
			b.WriteString(pad + "{}\n")
			return
		}
		for _, k := range ks {
			val := t[k]
			qk := yamlKey(k)
			switch c := val.(type) {
			case map[string]any, []any:
				if c == nil {
					b.WriteString(pad + qk + ":\n")
					continue
				}
				if m, ok := val.(map[string]any); ok && len(m) == 0 {
					b.WriteString(pad + qk + ": {}\n")
					continue
				}
				if a, ok := val.([]any); ok && len(a) == 0 {
					b.WriteString(pad + qk + ": []\n")
					continue
				}
				b.WriteString(pad + qk + ":\n")
				dumpYAMLNode(b, val, indent+1)
			default:
				b.WriteString(pad + qk + ": " + yamlScalar(c) + "\n")
			}
		}
	case []any:
		if len(t) == 0 {
			b.WriteString(pad + "[]\n")
			return
		}
		for _, item := range t {
			switch c := item.(type) {
			case map[string]any:
				ks := configSortedKeys(c)
				if len(ks) == 0 {
					b.WriteString(pad + "- {}\n")
					continue
				}
				// First pair inline after "- ".
				b.WriteString(pad + "- " + yamlKey(ks[0]) + ": " + yamlScalarInline(c[ks[0]]) + "\n")
				for _, k := range ks[1:] {
					vv := c[k]
					if isComposite(vv) {
						b.WriteString(pad + "  " + yamlKey(k) + ":\n")
						dumpYAMLNode(b, vv, indent+2)
					} else {
						b.WriteString(pad + "  " + yamlKey(k) + ": " + yamlScalar(vv) + "\n")
					}
				}
			case []any:
				b.WriteString(pad + "-\n")
				dumpYAMLNode(b, c, indent+1)
			default:
				b.WriteString(pad + "- " + yamlScalar(c) + "\n")
			}
		}
	default:
		b.WriteString(pad + yamlScalar(v) + "\n")
	}
}

func isComposite(v any) bool {
	switch t := v.(type) {
	case map[string]any:
		return len(t) > 0
	case []any:
		return len(t) > 0
	default:
		return false
	}
}

func yamlKey(k string) string {
	if k == "" {
		return `""`
	}
	// Quote when the key needs it.
	needs := false
	for _, c := range k {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-' || c == '.' || c == '/') {
			needs = true
			break
		}
	}
	if needs {
		return `"` + strings.ReplaceAll(k, `"`, `\"`) + `"`
	}
	return k
}

func yamlScalar(v any) string {
	return yamlScalarInline(v)
}

func yamlScalarInline(v any) string {
	switch t := v.(type) {
	case nil:
		return "null"
	case string:
		return yamlQuoteString(t)
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		return configScalarString(t)
	case json.Number:
		return string(t)
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

func yamlQuoteString(s string) string {
	if s == "" {
		return `""`
	}
	// Bare when simple: alnum + _ - . / only. Anything else forces quoting
	// (covers spaces, colons, hashes, brackets, quotes, backslash, etc.).
	simple := true
	for _, c := range s {
		isBare := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '.' || c == '/'
		if !isBare {
			simple = false
			break
		}
	}
	// Leading/trailing space or colon-space forces quoting.
	if strings.HasPrefix(s, " ") || strings.HasSuffix(s, " ") || strings.Contains(s, ": ") || strings.Contains(s, " #") {
		simple = false
	}
	// Reserved words must quote.
	switch strings.ToLower(s) {
	case "null", "~", "true", "false", "yes", "no", "on", "off":
		simple = false
	}
	if simple {
		if _, err := strconv.ParseFloat(s, 64); err == nil && isNumericToken(s) {
			// Numeric strings stay strings → quote so 8080 doesn't become int
			// when the game expects a string port.
			return `"` + s + `"`
		}
		return s
	}
	return `"` + strings.NewReplacer("\\", `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`, "\t", `\t`).Replace(s) + `"`
}


// getString safely extracts a string from a map.
func getString(m map[string]any, key string) string {
    if v, ok := m[key]; ok {
        if s, ok := v.(string); ok {
            return s
        }
    }
    return ""
}

// getBool safely extracts a bool from a map.
func getBool(m map[string]any, key string) bool {
    if v, ok := m[key]; ok {
        if b, ok := v.(bool); ok {
            return b
        }
    }
    return false
}
