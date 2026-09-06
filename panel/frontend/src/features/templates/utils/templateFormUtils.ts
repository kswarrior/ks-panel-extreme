// TemplateForm utilities - extracted from TemplateForm.tsx

import type { TemplateFormState, PortMapping, Mount, ResourceLimits, FeatureCaps, EnvVariable, InstallStep, TemplateAction, ActionStep, Label, Device, Healthcheck, Advanced, KvRuntime, MpRuntime, LxdRuntime, PageOverride, RestartPolicy, NetworkMode, LogLevel, InstallAction } from '../types/templateForm';
import { parsePageActions, parsePageComponents, parsePageConfigure } from '@/features/instance-pages/types/instancePage';
import { DEFAULT_INSTANCE_CONTROLS, isControlsCustom, resolveInstanceControls } from '@/features/instances/utils/instanceControls';
// emptyForm is a runtime value (not a type) — it seeds every partial
// `advanced` produced below so serializeSpec can keep assuming the full
// Advanced shape (it reads e.g. f.advanced.dns.split(',') unguarded).
import { emptyForm } from '../types/templateForm';

function stripUnit(v: string): string {
  // Mirror templateForm.stripUnit: handle decimals + trailing time suffix
  // so "1.5G" -> "1536" and "30s" -> "30" instead of corrupting to
  // "1.5GM" / "30ss" on the next serialize.
  const s = (v ?? '').trim();
  if (s === '') return '';
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([MGmg]?)(?:[Bb])?(?:[Ii][Bb]?)?\s*[Ss]?$/);
  if (!m) return v;
  if (/s$/i.test(s) && !m[2]) {
    return String(m[1].includes('.') ? Math.round(parseFloat(m[1])) : parseInt(m[1], 10));
  }
  let n = parseFloat(m[1]);
  if (m[2].toLowerCase() === 'g') n *= 1024;
  return String(Math.round(n));
}

export function serializeSpec(f: TemplateFormState): string {
  const spec: Record<string, unknown> = {
    category: f.category,
    type: f.type,
    ports: f.ports.filter((p) => p.host || p.guest).map((p) => ({
      host: p.host,
      container: p.guest,
      protocol: p.protocol,
    })),
    mounts: f.mounts.filter((m) => m.source || m.target).map((m) => ({
      source: m.source,
      target: m.target,
      mode: m.mode,
    })),
    command: f.advanced.startup_command
      ? ['sh', '-c', f.advanced.startup_command]
      : undefined,
    restart: f.advanced.restart_policy || undefined,
    limits: {
      memory: f.limits.ram_mb ? `${f.limits.ram_mb}M` : '',
      cpus: f.limits.cpu_pct,
      disk: f.limits.disk_mb ? `${f.limits.disk_mb}M` : '',
      'memory-swap': f.limits.swap_mb ? `${f.limits.swap_mb}M` : '',
    },
    caps: {
      databases: f.caps.databases,
      backups: f.caps.backups,
      networks: f.caps.networks,
    },
    env: f.env,
    install: f.install.map((s) => ({
      action: s.action,
      command: s.command,
      url: s.url,
      filename: s.filename,
      archive: s.archive,
      dest: s.dest,
      from: s.from,
      to: s.to,
      path: s.path,
      content: s.content,
      branch: s.branch,
      retries: s.retries,
      ignore_errors: !!s.ignore_errors,
    })),
    // Whole-workflow budget for the edge's install runner (seconds). The
    // panel forwards it as InstallStartRequest.timeout_sec; empty = the
    // edge's 30-minute default, so templates that don't set it are
    // unaffected.
    install_timeout_sec: f.install_timeout_s ? Number(f.install_timeout_s) : undefined,
    actions: f.actions.filter((a) => a.id.trim() !== '').map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon_svg: (a.icon_svg || '').trim(),
      icon_color: (a.icon_color || '').trim().toUpperCase(),
      allowed_states: a.allowed_states.split(',').map((x) => x.trim()).filter(Boolean),
      requires_online: !!a.requires_online,
      async_run: !!a.async_run,
      run_on_create: !!a.run_on_create,
      cooldown_s: a.cooldown_s,
      user_invokable: !!a.user_invokable,
      session: a.session,
      auto_start_instance: !!a.auto_start_instance,
      auto_stop_on_exit: !!a.auto_stop_on_exit,
      restart_on_failure: !!a.restart_on_failure,
      allowed_commands: a.allowed_commands.split('\n').map((x) => x.trim()).filter(Boolean),
      blocked_commands: a.blocked_commands.split(',').map((x) => x.trim()).filter(Boolean),
      max_runtime_s: a.max_runtime_s,
      stop_command: a.stop_command,
      stop_mode: a.stop_mode,
      steps: a.steps.map((s) => ({
        action: s.action,
        command: s.command,
        url: s.url,
        filename: s.filename,
        archive: s.archive,
        dest: s.dest,
        from: s.from,
        to: s.to,
        path: s.path,
        content: s.content,
        branch: s.branch,
        retries: s.retries,
        ignore_errors: !!s.ignore_errors,
      })),
    })),
    labels: f.labels.filter((l) => l.key).map((l) => ({ key: l.key, value: l.value })),
    devices: f.devices.filter((d) => d.host || d.container).map((d) => ({
      host: d.host,
      container: d.container,
      cgroup: !!d.cgroup,
    })),
    healthcheck: f.healthcheck.enabled ? {
      test: f.healthcheck.test_command,
      interval: f.healthcheck.interval_s ? `${f.healthcheck.interval_s}s` : '',
      timeout: f.healthcheck.timeout_s ? `${f.healthcheck.timeout_s}s` : '',
      retries: f.healthcheck.retries,
      start_period: f.healthcheck.start_period_s ? `${f.healthcheck.start_period_s}s` : '',
    } : undefined,
    // Every page row is a CUSTOM page (html/markdown/blocks) imported from
    // the Instance Pages library. Rows are written back verbatim so the
    // template spec keeps exactly what the author picked — label and icon
    // are always persisted because there is no built-in default to diff
    // against anymore.
    pages: f.pages.map((p) => {
      const out: Record<string, unknown> = {
        slug: p.slug,
        kind: 'custom',
      };
      if (!p.enabled) out.enabled = false;
      if (p.label.trim() !== '') out.label = p.label.trim();
      if (p.icon_svg.trim() !== '') out.icon_svg = p.icon_svg.trim();
      if ((p.icon_color || '').trim() !== '') out.icon_color = (p.icon_color || '').trim().toUpperCase();
      if (p.content_type) out.content_type = p.content_type;
      if (p.content_html) out.content_html = p.content_html;
      if (p.content_markdown) out.content_markdown = p.content_markdown;
      if (p.content_blocks) out.content_blocks = p.content_blocks;
      // Saved actions are part of the row — persist them or the runtime
      // allow-list ends up empty and every action 403s on the instance.
      if (p.actions && p.actions.length > 0) out.actions = p.actions;
      // Components: persist reusable UI blocks so {{component:name}} tokens
      // resolve on both main page and sub-pages (React-like reusability).
      if (p.components && p.components.length > 0) out.components = p.components;
      // Configure: persist page-level env-style var definitions (Studio Configure tab).
      if (p.configure && p.configure.length > 0) out.configure = p.configure;
      // Per-template values for those vars (entered via Configure button).
      if (p.config && Object.keys(p.config).length > 0) out.config = p.config;
      // Multi-page support: nested sub-pages ride on the parent row.
      if (p.sub_pages && p.sub_pages.length > 0) {
        out.sub_pages = p.sub_pages.map((s) => ({
          path: s.path,
          name: s.name,
          content_type: s.content_type,
          ...(s.content_html ? { content_html: s.content_html } : {}),
          ...(s.content_markdown ? { content_markdown: s.content_markdown } : {}),
          ...(s.content_blocks ? { content_blocks: s.content_blocks } : {}),
        }));
      }
      return out;
    }),
    // Built-in Instance controls allow-list. Persisted only when the author
    // changed something off the allow-all default, so old templates (no
    // key) and untouched new ones both resolve to allow-all.
    ...(isControlsCustom(f.instance_controls)
      ? { instance_controls: { ...f.instance_controls } }
      : {}),
    advanced: {
      startup_command: f.advanced.startup_command,
      stop_command: f.advanced.stop_command,
      stop_signal: f.advanced.stop_signal,
      working_dir: f.advanced.working_dir,
      user: f.advanced.user,
      hostname: f.advanced.hostname,
      privileged: f.advanced.privileged,
      readonly_rootfs: f.advanced.readonly_rootfs,
      enable_tty: f.advanced.enable_tty,
      dns: f.advanced.dns.split(',').map((x) => x.trim()).filter(Boolean),
      extra_hosts: f.advanced.extra_hosts.split('\n').map((x) => x.trim()).filter(Boolean),
      network_mode: f.advanced.network_mode,
      restart_policy: f.advanced.restart_policy,
      shm_size: f.advanced.shm_size_mb ? `${f.advanced.shm_size_mb}M` : '',
      pids_limit: f.advanced.pid_limit,
      ulimits: {
        nofiles: f.advanced.ulimit_nofiles,
        nproc: f.advanced.ulimit_nproc,
      },
      logging: {
        driver: f.advanced.log_driver,
        max_size: f.advanced.log_max_size_mb ? `${f.advanced.log_max_size_mb}M` : '',
        max_files: f.advanced.log_max_files,
        level: f.advanced.log_level,
      },
      oom_kill_disable: f.advanced.oom_kill_disable,
      cpu_quota_period: f.advanced.cpu_quota_period,
      io_weight: f.advanced.io_weight,
      environment_template: f.advanced.environment_template,
      kvm: {
        vcpus: f.advanced.kvm.vcpus, cpu_model: f.advanced.kvm.cpu_model, machine: f.advanced.kvm.machine,
        uefi: f.advanced.kvm.uefi, secure_boot: f.advanced.kvm.secure_boot, tpm: f.advanced.kvm.tpm,
        vga: f.advanced.kvm.vga, video_memory: f.advanced.kvm.video_memory_mb, boot_order: f.advanced.kvm.boot_order,
        kernel_args: f.advanced.kvm.kernel_args, extra_args: f.advanced.kvm.extra_args,
        vnc_port: f.advanced.kvm.vnc_port, vnc_password: f.advanced.kvm.vnc_password,
        spice_port: f.advanced.kvm.spice_port, install_iso: f.advanced.kvm.install_iso,
        disk_bus: f.advanced.kvm.disk_bus, disk_cache: f.advanced.kvm.disk_cache,
        io_thread: f.advanced.kvm.io_thread, discard: f.advanced.kvm.discard,
        numa: f.advanced.kvm.numa, hugepages: f.advanced.kvm.hugepages, rdm_reservation: f.advanced.kvm.rdm_reservation,
      },
      multipass: {
        cpus: f.advanced.multipass.cpus, disk: f.advanced.multipass.disk_mb ? `${f.advanced.multipass.disk_mb}M` : '',
        memory: f.advanced.multipass.mem_mb ? `${f.advanced.multipass.mem_mb}M` : '',
        cloud_init_userdata: f.advanced.multipass.cloud_init_userdata, cloud_init_metadata: f.advanced.multipass.cloud_init_metadata,
        image_alias: f.advanced.multipass.image_alias,
        bridges: f.advanced.multipass.bridges.split('\n').map((x) => x.trim()).filter(Boolean),
        bridged: f.advanced.multipass.bridged, launch_argument: f.advanced.multipass.launch_argument,
        autorecovery: f.advanced.multipass.autorecovery,
      },
      lxd: {
        profiles: f.advanced.lxd.profiles.split(',').map((x) => x.trim()).filter(Boolean),
        storage_pool: f.advanced.lxd.storage_pool, storage_volume_size: f.advanced.lxd.storage_volume_size,
        config: f.advanced.lxd.config.split('\n').reduce<Record<string, string>>((acc, line) => {
          const m = line.match(/^\s*([\w.]+)\s*=\s*(.+)\s*$/);
          if (m) acc[m[1]] = m[2];
          return acc;
        }, {}),
        devices: f.advanced.lxd.devices.split('\n').reduce<Record<string, Record<string, unknown>>>((acc, line) => {
          const trimmed = line.trim();
          if (!trimmed) return acc;
          const [name, body] = trimmed.split(/\s+/, 2);
          if (!body) return acc;
          try { acc[name] = JSON.parse(body); } catch { /* ignore malformed */ }
          return acc;
        }, {}),
        limits_cpu_allowance: f.advanced.lxd.limits_cpu_allowance, limits_cpu_priority: f.advanced.lxd.limits_cpu_priority,
        security_protection: f.advanced.lxd.security_protection, security_privileged: f.advanced.lxd.security_privileged,
        raw_idmap: f.advanced.lxd.raw_idmap, boot_autostart: f.advanced.lxd.boot_autostart,
        snapshot_pattern: f.advanced.lxd.snapshot_pattern,
      },
    },
  };
  Object.keys(spec).forEach((k) => {
    const v = spec[k];
    if (v === '' || (Array.isArray(v) && v.length === 0) ||
      (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).every((kk) => (v as Record<string, unknown>)[kk] === ''))) {
      delete spec[k];
    }
  });
  return JSON.stringify(spec, null, 2);
}

export function parseSpec(raw: string): Partial<TemplateFormState> {
  const out: Partial<TemplateFormState> = {};
  if (!raw) return out;
  try {
    const s = JSON.parse(raw) as Record<string, any>;
    if (s.category) out.category = String(s.category);
    if (s.type) out.type = String(s.type);
    if (Array.isArray(s.command)) {
      let script = '';
      const argv = (s.command as unknown[]).map((x) => String(x));
      if (argv.length >= 3 && argv[0] === 'sh' && argv[1] === '-c') {
        script = argv.slice(2).join(' ');
      } else {
        script = argv.join(' ');
      }
      out.advanced = {
        ...(out.advanced ?? emptyForm.advanced),
        startup_command: script,
      };
    }
    if (typeof s.restart === 'string' && s.restart) {
      out.advanced = {
        ...(out.advanced ?? emptyForm.advanced),
        restart_policy: s.restart as RestartPolicy,
      };
    }
    if (Array.isArray(s.ports)) {
      out.ports = s.ports.map((p: any) => ({
        host: String(p.host ?? p.host_port ?? ''),
        guest: String(p.guest ?? p.container ?? ''),
        protocol: (p.protocol === 'udp' ? 'udp' : 'tcp') as 'tcp' | 'udp',
      }));
    }
    if (Array.isArray(s.mounts)) {
      out.mounts = s.mounts.map((m: any) => {
        if (typeof m === 'string') {
          const idx = m.indexOf(':');
          const source = idx >= 0 ? m.slice(0, idx) : m;
          const rest = idx >= 0 ? m.slice(idx + 1) : '';
          const mode: 'rw' | 'ro' = rest.endsWith(':ro') ? 'ro' : 'rw';
          return { source, target: rest.replace(/:ro$/, ''), mode };
        }
        const obj = m ?? {};
        const source = String(obj.source ?? obj.host ?? '');
        const target = String(obj.target ?? obj.container ?? obj.destination ?? '');
        const mode: 'rw' | 'ro' = (obj.mode === 'ro' || obj.read_only === true) ? 'ro' : 'rw';
        return { source, target, mode };
      });
    }
    if (s.limits) {
      const l = s.limits as Record<string, any>;
      const cpu = String(l.cpus ?? l.cpu ?? l.cpu_pct ?? '');
      const swap = String(l['memory-swap'] ?? l.swap ?? l.swap_mb ?? '');
      out.limits = {
        ram_mb: stripUnit(String(l.memory ?? l.ram_mb ?? '')),
        cpu_pct: cpu,
        disk_mb: stripUnit(String(l.disk ?? l.disk_mb ?? '')),
        swap_mb: stripUnit(swap),
      };
    }
    if (s.caps) {
      const c = s.caps as Record<string, any>;
      out.caps = {
        databases: String(c.databases ?? ''),
        backups: String(c.backups ?? ''),
        networks: String(c.networks ?? ''),
      };
    }
    if (Array.isArray(s.env)) {
      out.env = s.env.map((e: any) => ({
        name: String(e.name ?? ''),
        label: String(e.label ?? ''),
        description: String(e.description ?? ''),
        default: String(e.default ?? ''),
        user_viewable: !!e.user_viewable,
        user_editable: !!e.user_editable,
        required: !!e.required,
        rule: String(e.rule ?? ''),
        display: (['text', 'number', 'select', 'checkbox'].includes(e.display) ? e.display : 'text') as 'text' | 'number' | 'select' | 'checkbox',
        options: String(e.options ?? ''),
        append: !!e.append,
        prepend: String(e.prepend ?? ''),
        append_value: String(e.append_value ?? ''),
      }));
    }
    if (Array.isArray(s.install)) {
      out.install = s.install.map((st: any) => ({
        action: (st.action ?? 'shell') as InstallAction,
        command: String(st.command ?? ''),
        url: String(st.url ?? ''),
        filename: String(st.filename ?? ''),
        archive: String(st.archive ?? ''),
        dest: String(st.dest ?? ''),
        from: String(st.from ?? ''),
        to: String(st.to ?? ''),
        path: String(st.path ?? ''),
        content: String(st.content ?? ''),
        branch: String(st.branch ?? ''),
        retries: String(st.retries ?? ''),
        ignore_errors: !!st.ignore_errors,
      }));
    }
    if (s.install_timeout_sec !== undefined && s.install_timeout_sec !== null) {
      out.install_timeout_s = String(s.install_timeout_sec);
    }
    if (Array.isArray(s.actions)) {
      out.actions = s.actions.map((a: any) => {
        const baseSession: TemplateAction['session'] = (['long_running', 'console_session', 'vm_full'].includes(a.session) ? a.session : 'long_running');
        return {
          id: String(a.id ?? ''),
          name: String(a.name ?? ''),
          description: String(a.description ?? ''),
          icon_svg: String(a.icon_svg ?? ''),
          icon_color: String(a.icon_color ?? ''),
          allowed_states: Array.isArray(a.allowed_states) ? (a.allowed_states as string[]).join(', ') : String(a.allowed_states ?? ''),
          requires_online: !!a.requires_online,
          async_run: !!a.async_run,
          run_on_create: !!a.run_on_create,
          cooldown_s: String(a.cooldown_s ?? ''),
          // Fail-closed defaults: a minimal hand-written action ({id,name,
          // steps}) must NOT silently gain auto-start/auto-stop/user access
          // on load. Matches the "Add action" defaults in TemplateForm.tsx
          // (all false) — explicit true in the spec is preserved via !!.
          user_invokable: !!a.user_invokable,
          session: baseSession,
          auto_start_instance: !!a.auto_start_instance,
          auto_stop_on_exit: !!a.auto_stop_on_exit,
          restart_on_failure: !!a.restart_on_failure,
          allowed_commands: Array.isArray(a.allowed_commands) ? (a.allowed_commands as string[]).join('\n') : String(a.allowed_commands ?? ''),
          blocked_commands: Array.isArray(a.blocked_commands) ? (a.blocked_commands as string[]).join(', ') : String(a.blocked_commands ?? ''),
          max_runtime_s: String(a.max_runtime_s ?? ''),
          stop_command: String(a.stop_command ?? ''),
          stop_mode: (['same', 'different'].includes(a.stop_mode) ? a.stop_mode : 'different') as 'same' | 'different',
          steps: Array.isArray(a.steps) ? a.steps.map((st: any) => ({
            action: (st.action ?? 'shell') as InstallAction,
            command: String(st.command ?? ''),
            url: String(st.url ?? ''),
            filename: String(st.filename ?? ''),
            archive: String(st.archive ?? ''),
            dest: String(st.dest ?? ''),
            from: String(st.from ?? ''),
            to: String(st.to ?? ''),
            path: String(st.path ?? ''),
            content: String(st.content ?? ''),
            branch: String(st.branch ?? ''),
            retries: String(st.retries ?? ''),
            ignore_errors: !!st.ignore_errors,
          })) : [],
        };
      });
    }
    if (Array.isArray(s.labels)) {
      out.labels = s.labels.map((l: any) => ({ key: String(l.key ?? ''), value: String(l.value ?? '') }));
    }
    if (Array.isArray(s.pages)) {
      // Every row is treated as a custom page. Legacy rows that predate the
      // conversion (kind: 'builtin' or no kind) are loaded as custom rows
      // with whatever content fields they carry — empty content renders the
      // "re-import this page" card until the author re-links it.
      const pages: PageOverride[] = [];
      const consumed = new Set<string>();
      s.pages.forEach((p: any) => {
        if (!p || typeof p !== 'object' || !p.slug) return;
        const slug = String(p.slug);
        if (consumed.has(slug)) return;
        consumed.add(slug);
        pages.push({
          slug,
          original_slug: '',
          enabled: p.enabled !== false,
          label: String(p.label ?? p.slug ?? ''),
          icon_svg: String(p.icon_svg ?? ''),
          icon_color: String((p as any).icon_color ?? ''),
          kind: 'custom',
          content_type: (['html', 'markdown', 'blocks'].includes(p.content_type) ? p.content_type : 'markdown') as PageOverride['content_type'],
          content_html: typeof p.content_html === 'string' ? p.content_html : '',
          content_markdown: typeof p.content_markdown === 'string' ? p.content_markdown : '',
          content_blocks: typeof p.content_blocks === 'string' ? p.content_blocks : '',
          // Saved actions survive the round-trip (inline array or legacy
          // JSON-encoded string) — dropping them broke every action button.
          ...(parsePageActions(
            Array.isArray(p.actions)
              ? JSON.stringify(p.actions)
              : typeof p.actions === 'string'
                ? p.actions
                : null,
          ).length > 0
            ? {
                actions: parsePageActions(
                  Array.isArray(p.actions)
                    ? JSON.stringify(p.actions)
                    : typeof p.actions === 'string'
                      ? p.actions
                      : null,
                ),
              }
            : {}),
          // Components: preserve reusable UI blocks (inline array or JSON string).
          ...(() => {
            let comps: ReturnType<typeof parsePageComponents> = [];
            if (typeof p.components === 'string' && p.components.trim()) {
              comps = parsePageComponents(p.components);
            } else if (Array.isArray(p.components) && p.components.length > 0) {
              try {
                comps = parsePageComponents(JSON.stringify(p.components));
                if (comps.length === 0) comps = p.components as any;
              } catch { comps = p.components as any; }
            }
            return comps.length > 0 ? { components: comps } : {};
          })(),
          // Multi-page support: keep nested sub-pages attached to the row.
          ...(Array.isArray(p.sub_pages)
            ? {
                sub_pages: p.sub_pages
                  .filter((s: any) => !!s && typeof s === 'object' && typeof s.path === 'string' && String(s.path).trim() !== '')
                  .map((s: any) => ({
                    path: String(s.path),
                    name: String(s.name ?? s.path),
                    content_type: (['html', 'markdown', 'blocks'].includes(s.content_type) ? s.content_type : 'html') as 'html' | 'markdown' | 'blocks',
                    content_html: typeof s.content_html === 'string' ? s.content_html : '',
                    content_markdown: typeof s.content_markdown === 'string' ? s.content_markdown : '',
                    content_blocks: typeof s.content_blocks === 'string' ? s.content_blocks : '',
                  })),
              }
            : {}),
          // Configure vars (Studio Configure tab) — page-level env definitions.
          ...(() => {
            let cfg: ReturnType<typeof parsePageConfigure> = [];
            if (typeof p.configure === 'string' && (p.configure as string).trim()) {
              cfg = parsePageConfigure(p.configure as string);
            } else if (Array.isArray(p.configure) && (p.configure as any[]).length > 0) {
              try {
                cfg = parsePageConfigure(JSON.stringify(p.configure));
                if (cfg.length === 0) cfg = p.configure as any;
              } catch { cfg = p.configure as any; }
            }
            return cfg.length > 0 ? { configure: cfg } : {};
          })(),
          // Per-template values for those vars (Configure button).
          ...(() => {
            const src = (p as any).config ?? (p as any).configure_values;
            if (src && typeof src === 'object' && !Array.isArray(src)) {
              const vals: Record<string, string> = {};
              Object.entries(src as Record<string, unknown>).forEach(([k, v]) => { vals[k] = String(v ?? ''); });
              return Object.keys(vals).length > 0 ? { config: vals } : {};
            }
            return {};
          })(),
        });
      });
      out.pages = pages;
    }
    // Built-in Instance controls: missing = allow-all default (old specs).
    out.instance_controls = resolveInstanceControls(s as Record<string, any>);
    if (Array.isArray(s.devices)) {
      out.devices = s.devices.map((d: any) => ({
        host: String(d.host ?? ''),
        container: String(d.container ?? ''),
        cgroup: !!d.cgroup,
      }));
    }
    if (s.healthcheck && typeof s.healthcheck === 'object') {
      const h = s.healthcheck as Record<string, any>;
      out.healthcheck = {
        enabled: !!h.test || !!h.enabled,
        test_command: String(h.test ?? ''),
        interval_s: stripUnit(String(h.interval ?? h.interval_s ?? '')),
        timeout_s: stripUnit(String(h.timeout ?? h.timeout_s ?? '')),
        retries: String(h.retries ?? ''),
        start_period_s: stripUnit(String(h.start_period ?? h.start_period_s ?? '')),
      };
    }
    if (s.advanced && typeof s.advanced === 'object') {
      const a = s.advanced as Record<string, any>;
      const dns = Array.isArray(a.dns) ? (a.dns as string[]).join(', ') : String(a.dns ?? '');
      const extra = Array.isArray(a.extra_hosts) ? (a.extra_hosts as string[]).join('\n') : String(a.extra_hosts ?? '');
      const log = (a.logging ?? {}) as Record<string, any>;
      const outA: Advanced = {
        startup_command: String(a.startup_command ?? ''),
        stop_command: String(a.stop_command ?? ''),
        stop_signal: String(a.stop_signal ?? ''),
        working_dir: String(a.working_dir ?? ''),
        user: String(a.user ?? ''),
        hostname: String(a.hostname ?? ''),
        privileged: !!a.privileged,
        readonly_rootfs: !!a.readonly_rootfs,
        enable_tty: !!a.enable_tty,
        dns,
        extra_hosts: extra,
        network_mode: (a.network_mode ?? 'bridge') as NetworkMode,
        restart_policy: (a.restart_policy ?? 'unless-stopped') as RestartPolicy,
        shm_size_mb: stripUnit(String((a.shm_size ?? ''))),
        pid_limit: String(a.pids_limit ?? a.pid_limit ?? ''),
        ulimit_nofiles: String(a.ulimits?.nofiles ?? ''),
        ulimit_nproc: String(a.ulimits?.nproc ?? ''),
        log_driver: (['json-file', 'syslog', 'journald', 'none'].includes(log.driver) ? log.driver : 'json-file') as Advanced['log_driver'],
        log_max_size_mb: stripUnit(String(log.max_size ?? '')),
        log_max_files: String(log.max_files ?? ''),
        log_level: (log.level ?? 'info') as LogLevel,
        oom_kill_disable: !!a.oom_kill_disable,
        cpu_quota_period: String(a.cpu_quota_period ?? ''),
        io_weight: String(a.io_weight ?? ''),
        environment_template: String(a.environment_template ?? ''),
        kvm: emptyForm.advanced.kvm,
        multipass: emptyForm.advanced.multipass,
        lxd: emptyForm.advanced.lxd,
      };
      if (a.kvm && typeof a.kvm === 'object') {
        const k = a.kvm as Record<string, any>;
        outA.kvm = {
          vcpus: String(k.vcpus ?? '2'),
          cpu_model: (['host-passthrough', 'host-model', 'kvm64', ''].includes(k.cpu_model) ? k.cpu_model : 'host-passthrough') as KvRuntime['cpu_model'],
          machine: (['pc', 'q35', 'virt'].includes(k.machine) ? k.machine : 'q35') as KvRuntime['machine'],
          uefi: !!k.uefi,
          secure_boot: !!k.secure_boot,
          tpm: !!k.tpm,
          vga: (['virtio', 'std', 'qxl', 'none'].includes(k.vga) ? k.vga : 'virtio') as KvRuntime['vga'],
          video_memory_mb: stripUnit(String(k.video_memory_mb ?? k.video_memory ?? '')),
          boot_order: (['cd', 'hd', 'net'].includes(k.boot_order) ? k.boot_order : 'hd') as KvRuntime['boot_order'],
          kernel_args: String(k.kernel_args ?? ''), extra_args: String(k.extra_args ?? ''),
          vnc_port: String(k.vnc_port ?? ''), vnc_password: String(k.vnc_password ?? ''),
          spice_port: String(k.spice_port ?? ''), install_iso: String(k.install_iso ?? ''),
          disk_bus: (['virtio', 'sata', 'ide', 'nvme', 'scsi'].includes(k.disk_bus) ? k.disk_bus : 'virtio') as KvRuntime['disk_bus'],
          disk_cache: (['writeback', 'none', 'writethrough', 'directsync'].includes(k.disk_cache) ? k.disk_cache : 'writeback') as KvRuntime['disk_cache'],
          io_thread: k.io_thread !== false, discard: k.discard !== false, numa: !!k.numa,
          hugepages: !!k.hugepages, rdm_reservation: !!k.rdm_reservation,
        };
      }
      if (a.multipass && typeof a.multipass === 'object') {
        const m = a.multipass as Record<string, any>;
        outA.multipass = {
          cpus: String(m.cpus ?? '2'),
          disk_mb: stripUnit(String(m.disk ?? '')),
          mem_mb: stripUnit(String(m.memory ?? m.mem_mb ?? '')),
          cloud_init_userdata: String(m.cloud_init_userdata ?? ''),
          cloud_init_metadata: String(m.cloud_init_metadata ?? ''),
          image_alias: String(m.image_alias ?? ''),
          bridges: Array.isArray(m.bridges) ? (m.bridges as string[]).join('\n') : String(m.bridges ?? ''),
          bridged: String(m.bridged ?? ''), launch_argument: String(m.launch_argument ?? ''),
          autorecovery: m.autorecovery !== false,
        };
      }
      if (a.lxd && typeof a.lxd === 'object') {
        const l = a.lxd as Record<string, any>;
        const configLines = l.config && typeof l.config === 'object'
          ? Object.entries(l.config as Record<string, string>).map(([k, v]) => `${k}=${v}`).join('\n')
          : '';
        const deviceLines = l.devices && typeof l.devices === 'object'
          ? Object.entries(l.devices as Record<string, Record<string, unknown>>).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join('\n')
          : '';
        outA.lxd = {
          profiles: Array.isArray(l.profiles) ? (l.profiles as string[]).join(', ') : String(l.profiles ?? 'default'),
          storage_pool: String(l.storage_pool ?? 'default'),
          storage_volume_size: String(l.storage_volume_size ?? ''),
          config: configLines,
          devices: deviceLines,
          limits_cpu_allowance: String(l.limits_cpu_allowance ?? ''),
          limits_cpu_priority: String(l.limits_cpu_priority ?? '0'),
          security_protection: l.security_protection !== false,
          security_privileged: !!l.security_privileged,
          raw_idmap: String(l.raw_idmap ?? ''),
          boot_autostart: l.boot_autostart !== false,
          snapshot_pattern: String(l.snapshot_pattern ?? ''),
        };
      }
      out.advanced = outA;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export { emptyForm, stripUnit } from '../types/templateForm';