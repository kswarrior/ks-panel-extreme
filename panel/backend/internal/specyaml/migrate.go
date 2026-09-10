package specyaml

import (
	"database/sql"
	"log"
	"strings"
)

// MigrateTemplateSpecsToYAML rewrites every templates.spec row that still
// carries the legacy JSON encoding into canonical YAML. JSON parses as
// YAML, so unmigrated rows keep working without this — the rewrite is
// purely canonicalization so the whole template system speaks one format.
//
// Rows that are already YAML, empty, or unparseable are left untouched
// (unparseable rows are skipped, never deleted). It returns the number of
// rows rewritten. Placeholders are bare `?`, matching the template
// repository's convention on every engine.
//
// Callers should treat an error as advisory (log it, keep booting): old
// rows parse identically either way, so a failed rewrite must never wedge
// panel startup.
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
		if strings.TrimSpace(s) == "" || !IsJSON(s) {
			continue
		}
		normalised, nerr := NormalizeToYAML(s)
		if nerr != nil {
			log.Printf("template spec YAML migration: skipping id %d (unparseable, left as-is): %v", id, nerr)
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
	if converted > 0 {
		log.Printf("template spec YAML migration: converted %d row(s) from JSON to YAML", converted)
	}
	return converted, nil
}
