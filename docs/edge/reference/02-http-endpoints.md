# Edge HTTP Endpoints (from cli.go)

| Path | Handler |
|---|---|
| `/health` | health.Handler(cfg.Name, port) |
| `/api/edge/lifecycle` | lifecycle.Handler(cfg.Token) |
| `/api/edge/exec` | exec.Handler(cfg.Token) |
| `/api/edge/exec-rpc` | execrpc.Handler(cfg.Token) |
| `/api/edge/host-exec` | hostexec.Handler(cfg.Token) |
| `/api/edge/files` | files.Handler(cfg.Token) |
| `/api/edge/hostfiles` | files.HostFilesHandler(cfg.Token, cfg.InstancesDirOr("")) |
| `/api/edge/inspect` | inspect.Handler(cfg.Token) |
| `/api/edge/install` | installHandler |
| `/api/edge/install/stop` | installHandler |
| `/api/edge/install/stdin` | installHandler |
| `/api/edge/install/stream` | installHandler |
| `/api/edge/attach` | attach.Handler(cfg.Token) |
| `/api/edge/page-action` | pageaction.Handler(cfg.Token) |
| `/api/edge/snapshot` | snapshot.Handler(cfg.Token) |
| `/api/edge/ports/update` | ports.Handler(cfg.Token) |
| `/api/edge/sftp/provision` | sftpHandler |
| `/api/edge/sftp/delete` | sftpHandler |
| `/api/edge/update-info` | updateHandler |
| `/api/edge/update-check` | updateHandler |
| `/api/edge/update-apply` | updateHandler |
| `/api/edge/reinstall` | updateHandler |
| `/api/edge/reinstall-background` | updateHandler |
