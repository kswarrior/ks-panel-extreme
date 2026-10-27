# What is KS Panel

KS Panel is a self-hosted control panel for managing edge nodes and the workloads (instances)
running on them. It ships as a single Go binary (`kspanel`) that embeds a React SPA and talks
to lightweight Go agents (`ksedge`) installed on each node.

## Core concepts
- **Panel**: central API server + web UI + database. Hosts users, roles, permissions, catalog
  (templates, mods, applications, stacks, themes, instance pages), and orchestration logic.
- **Node (Edge)**: a host registered with the panel running `ksedge`. Exposes drivers
  (docker/lxd/kvm/multipass/host), files, exec, telemetry, lifecycle, snapshots, page actions.
- **Template**: blueprint for an instance (runtime docker/lxd/kvm/multipass/host, env, ports,
  install steps, healthcheck, pages). Templates are reusable; instances are deployed from them.
- **Instance**: a live workload on a node, deployed from a template, with its own config/env/ports/
  secrets/automation/backups/snapshots and custom tabs (instance pages).
- **Mod**: Goja-scripted panel plugin running inside the panel process (eventbus/sandbox).
- **Application**: admin-curated bot/service catalog executed as one-shot runs.
- **Stack**: self-hosted web app with sidecar supervisor + reverse proxy.
- **Instance Page**: custom tab (html/markdown/blocks/react) authored as YAML/Studio, rendered in
  instance detail, actions executed on edge via allow-list.
- **Theme**: global/local theme tokens (accent, background, card, typography, sidebar, etc.).
- **Role/Permission**: granular capability keys grouped by area with umbrella + CRUD + scope.

## Audience
Operators (self-host), admins (manage users/nodes/catalog), moderators, end users (own instances),
and developers extending the panel. Agent rules live in `loop.md`/`map.md`.
