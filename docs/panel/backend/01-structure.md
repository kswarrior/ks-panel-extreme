# Backend Structure

Root: `panel/backend/`. Module: `github.com/example/kspanel`, Go 1.25.

```
panel/backend/
├── cmd/kspanel/main.go        # entrypoint
├── internal/
│   ├── api/                   # router, server, middleware, handlers/
│   ├── auth/                  # sessions, MFA, password policy/history, lockout
│   ├── backup/                # backup scheduling
│   ├── banner/                # banner helpers
│   ├── cli/                   # cobra commands
│   ├── config/                # DB config, env
│   ├── cron/ + scheduler/     # scheduled jobs
│   ├── datamove/              # DB engine migration helpers
│   ├── db/                    # db open + migrations/{mysql,postgres,sqlite}
│   ├── dist/                  # static helpers
│   ├── edge/                  # panel-side client to edge nodes
│   ├── edgeconfig/            # node pairing config
│   ├── health/ + probe/ + sysinfo/ + telemetry/ + version/
│   ├── heartbeat/             # node heartbeat ingest
│   ├── install/               # template install engine
│   ├── models/                # shared DB structs
│   ├── modengine/             # Goja mod runtime
│   ├── mod_samples/           # sample mods
│   ├── oauth/                 # OAuth providers
│   ├── pagelib/               # instance-page library loader + embed
│   ├── permissions/           # permission engine + keys
│   ├── repository/            # DB access (one repo per domain)
│   ├── secretbox/ + security/  # secrets, rate-limit state
│   ├── specyaml/              # template spec YAML parsing
│   ├── stackstore/            # external stack registry
│   ├── themelib/              # theme library loader + embed
│   ├── tunnel/                # tunnel
│   ├── ui/                    # embedded frontend (generated)
│   └── updatewin/             # update windows
├── internal/aiskills/         # AI assistant skill guides
└── mod_samples/, panel/, release/
```

## Layering rule
Handlers never write SQL; repositories never know HTTP. Models shared. Cross-node work goes through `internal/edge/`.
