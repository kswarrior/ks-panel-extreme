package handlers

import (
	"fmt"
	"strings"
)

// envFileMaxBytes caps the template-level `.env` file content (spec.env_file).
// 64 KiB holds thousands of variables; anything larger is a pasted accident.
const envFileMaxBytes = 64 << 10

// parseDotEnv parses docker-compose-style `.env` content into KEY=VALUE
// pairs: blank lines and `#` comments skipped, `export KEY=…` accepted,
// single/double quotes stripped (double quotes honour \\ \" \n \r \t),
// trailing ` # comment` cut from unquoted values. Names must be POSIX
// identifiers (same rule as spec.env[]). Malformed lines fail with the line
// number so the template author can fix them at save time, not at deploy.
func parseDotEnv(content string) (map[string]string, error) {
	out := map[string]string{}
	for i, raw := range strings.Split(content, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if rest, ok := strings.CutPrefix(line, "export "); ok {
			line = strings.TrimSpace(rest)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
		}
		eq := strings.Index(line, "=")
		if eq <= 0 {
			return nil, fmt.Errorf("line %d: want KEY=VALUE, got %q", i+1, raw)
		}
		key := strings.TrimSpace(line[:eq])
		if !isAppEnvName(key) {
			return nil, fmt.Errorf("line %d: invalid variable name %q", i+1, key)
		}
		val := strings.TrimSpace(line[eq+1:])
		if len(val) >= 2 {
			if q := val[0]; (q == '"' || q == '\'') && val[len(val)-1] == q {
				val = val[1 : len(val)-1]
				if q == '"' {
					val = strings.NewReplacer(
						`\\`, "\\",
						`\"`, "\"",
						`\n`, "\n",
						`\r`, "\r",
						`\t`, "\t",
					).Replace(val)
				}
			} else if idx := strings.Index(val, " #"); idx >= 0 {
				val = strings.TrimSpace(val[:idx])
			}
		}
		out[key] = val
	}
	return out, nil
}

// resolveEnvWithFile substitutes {{KEY}}/${KEY} refs inside the template's
// raw `env_file` content using finalEnv, parses the result as dotenv, and
// merges it UNDER finalEnv (explicit per-variable definitions win — the
// docker-compose `environment` beats `env_file` rule). File-declared names
// are unscoped (no spec entry), so they substitute everywhere downstream.
// Empty content is a no-op returning finalEnv unchanged.
func resolveEnvWithFile(rawContent string, finalEnv map[string]string) (map[string]string, error) {
	if strings.TrimSpace(rawContent) == "" {
		return finalEnv, nil
	}
	if len(rawContent) > envFileMaxBytes {
		return nil, fmt.Errorf("env_file exceeds %d bytes", envFileMaxBytes)
	}
	allowed := finalEnv
	if allowed == nil {
		allowed = map[string]string{}
	}
	rendered := substituteOne(rawContent, allowed)
	fileEnv, err := parseDotEnv(rendered)
	if err != nil {
		return nil, err
	}
	merged := make(map[string]string, len(fileEnv)+len(finalEnv))
	for k, v := range fileEnv {
		merged[k] = v
	}
	for k, v := range finalEnv {
		merged[k] = v
	}
	return merged, nil
}
