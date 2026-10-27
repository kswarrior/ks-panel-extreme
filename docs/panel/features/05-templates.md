# Templates

Backend: `template_handler.go`, `template_images_test.go`, `template_manifest_test.go`.
Repo: `template_repo.go`. Models in `models.go`. Migrations: 006,027?, 059 (icon/color).

## Concepts
- Blueprint for instance: runtime (docker/lxd/kvm/multipass/host), env, ports, install steps
  (workflow), healthcheck, labels, pages, icon/color.
- Template spec YAML parsing (`internal/specyaml/`).
- Install engine deploys spec.
- Template schedules, stats, detail.

## Frontend
`features/templates/`: Templates, TemplateForm (sections: runtime, env, actions, healthcheck,
labels, pages), TemplateStats, TemplateDetail, TemplateSchedules.

## Pages link
Instance pages can be linked to template (`template.spec.pages[]`) → snapshot into instance.config.
