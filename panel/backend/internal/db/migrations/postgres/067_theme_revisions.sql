-- 067_theme_revisions.sql: per-theme version history for rollback.
--
-- Every UpdateThemeHandler overwrite first snapshots the CURRENT row into
-- theme_revisions (next rev = max+1) so an admin can list prior specs and
-- roll a theme back to any earlier revision via
-- POST /api/themes/{id}/rollback/{rev}. Rows cascade-delete with their
-- theme (ON DELETE CASCADE) so deleting a theme never orphans history.
--
-- `spec` is the same opaque JSON blob as themes.spec (the full Theme
-- appearance object); name/description are snapshotted alongside so a
-- rollback restores the full row, not just the appearance tokens.
-- `created_by` records the admin whose edit produced the revision (nullable
-- like themes.created_by so a deleted user never orphans history).

CREATE TABLE IF NOT EXISTS theme_revisions (
    theme_id    TEXT     NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    rev         INTEGER  NOT NULL,
    name        TEXT     NOT NULL DEFAULT '',
    description TEXT     NOT NULL DEFAULT '',
    spec        TEXT     NOT NULL,
    created_by  INTEGER  REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (theme_id, rev)
);

CREATE INDEX IF NOT EXISTS idx_theme_revisions_theme ON theme_revisions(theme_id, rev);
