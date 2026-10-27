# Threat Model (Reference)

Canonical: `docs/THREAT_MODEL.md`. Covers assets, actors, attack surfaces, mitigations.
Panel-specific notes:
- Assets: DB, secrets, node tokens, sessions, panel binary, instance data.
- Actors: anonymous, authenticated user, moderator, admin, node, mod code.
- Surfaces: auth, permissions, edge RPC, file access, terminal, page actions, mod sandbox.
See backend security doc for implementation.
EOF