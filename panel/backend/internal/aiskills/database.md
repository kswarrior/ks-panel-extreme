# Database skill

The panel runs on SQLite, PostgreSQL or MySQL behind a transparent repository layer, switchable live from the Database page with a parents-first batched datamove (500 rows per batch). Schema is versioned as numbered migrations triplicated across all three dialects via regen.sh, so every feature ships identical tables everywhere. Maintenance offers VACUUM INTO snapshots plus native pg_dump/mysqldump exports with a datamove fallback for cross-engine moves. Connection health, engine version and row counts are visible before any move runs.

Assistant coverage is read-only here: there are no database tools, so answer from this guide and walk the operator through the Database page. Never claim to move, dump or prune the database.
