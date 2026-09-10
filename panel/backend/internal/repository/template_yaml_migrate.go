package repository

import (
	"database/sql"
	"strings"

	"github.com/example/kspanel/internal/specyaml"
)

// MigrateTemplateSpecsToYAML rewrites every templates.spec row that still
// carries the legacy JSON encoding into canonical YAML. JSON parses as
// YAML, so unmigrated rows keep working without this — the rewrite is
// purely canonicalization so the whole template system speaks one format.
//
// Rows that are already YAML, empty, or unparseable are left untouched
// (unparseable rows are skipped, never deleted). It returns the number of
// rows rewritten. Placeholders follow template_repo.go convention (bare
// `?`, same as every other query in this table's repository).
func MigrateTemplateSpecsToYAML(db *sql.DB) (int, error) {
	rows, err := db.Query(`SELECT id, spec FROM templates`)
	if err != nil {
		return 0, err
	}
	type pending struct {
		id   int64
		spec string
	}
	var work []pending
	for rows.Next() {
		var id int64
		var spec sql.NullString
		if err := rows.Scan(&id, &spec); err != nil {
			rows.Close()
			return 0, err
		}
		s := ""
		if spec.Valid {
			s = spec.String
		}
		if strings.TrimSpace(s) == "" || !specyaml.IsJSON(s) {
			continue
		}
		normalised, nerr := specyaml.NormalizeToYAML(s)
		if nerr != nil {
			continue
		}
		if normalised == s {
			continue
		}
		work = append(work, pending{id: id, spec: normalised})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	converted := 0
	for _, w := range work {
		if _, uerr := db.Exec(`UPDATE templates SET spec = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, w.spec, w.id); uerr != nil {
			return converted, uerr
		}
		converted++
	}
	return converted, nil
}
