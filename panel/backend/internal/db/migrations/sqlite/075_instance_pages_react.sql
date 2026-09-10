-- 075_instance_pages_react.sql: React source + built bundle per instance page.
--
-- React pages are authored as JS (React.createElement, no JSX in v1) in the
-- Studio React tab and compiled via POST /api/instance-pages/:id/build:
--
--   source_tsx  TEXT (nullable, author JS source, NULL/'' = non-React page)
--   bundle_js   TEXT (nullable, validated build output served to the renderer)
--   bundle_css  TEXT (nullable, optional page CSS served alongside the bundle)
--   build_status VARCHAR(16) NOT NULL DEFAULT '' (''|building|ok|error)
--   build_log   TEXT (nullable, last build output, capped 64KiB by handler)
--
-- NULL (not '') keeps the file MySQL-safe up front (regen.sh check: no
-- TEXT DEFAULT). The Go runner guards each ALTER individually (see db.go
-- 075 case) so reruns converge on every engine. Postgres derives
-- ADD COLUMN IF NOT EXISTS via regen.sh.

ALTER TABLE instance_pages ADD COLUMN source_tsx TEXT;
ALTER TABLE instance_pages ADD COLUMN bundle_js TEXT;
ALTER TABLE instance_pages ADD COLUMN bundle_css TEXT;
ALTER TABLE instance_pages ADD COLUMN build_status VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE instance_pages ADD COLUMN build_log TEXT;
