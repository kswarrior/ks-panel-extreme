# Add a Feature

1. Classify: Add/Modify. Name affected parts + blast radius (API/DB/frontend/edge).
2. Backend: handlers + repo + models + routes + permissions + migrations.
3. Frontend: feature folder `src/features/<domain>/{pages,components,api,types,hooks}`; routes in
   `router.tsx`; sidebar/header titles; shared UI reuse.
4. Edge: if node execution needed, add `edge/backend/internal/<domain>/` + panel `internal/edge/` client.
5. Instance pages: if custom tabs, author YAML + marketplace entry + pagelib sync.
6. Tests + CHECKLIST V + rebuild.sh.
7. Update `map.md` if new main part/folder/flow.
EOF