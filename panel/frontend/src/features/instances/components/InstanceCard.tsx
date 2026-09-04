import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Instance, DriverKind } from '@/shared/types/instance';
import { parseConfig } from '@/shared/hooks/useInstance';
import CardMediaLayer from '@/shared/components/ui/CardMediaLayer';
import { useThemeStore } from '@/shared/stores/themeStore';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { listCachedResources, type CachedResource } from '@/features/instances/api/instanceAdvanced';
import CardMenu, { type RichMenuItem } from '@/shared/components/ui/CardMenu/CardMenu';

// ---- helpers --------------------------------------------------------------

const KIND_BADGE: Record<DriverKind, string> = {
  docker: 'bg-sky-900/60 text-sky-200 border-sky-700/60',
  lxd: 'bg-indigo-900/60 text-indigo-200 border-indigo-700/60',
  kvm: 'bg-orange-900/60 text-orange-200 border-orange-700/60',
  multipass: 'bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-700/60',
};
const kindBadgeClass = (k: string) =>
  KIND_BADGE[k as DriverKind] || 'bg-neutral-800 text-gray-300 border-neutral-700';

const KIND_TILE: Record<DriverKind, string> = {
  docker: 'bg-sky-900/50 border-sky-700/50 text-sky-200',
  lxd: 'bg-indigo-900/50 border-indigo-700/50 text-indigo-200',
  kvm: 'bg-orange-900/50 border-orange-700/50 text-orange-200',
  multipass: 'bg-fuchsia-900/50 border-fuchsia-700/50 text-fuchsia-200',
};
const kindTileClass = (k: string) =>
  KIND_TILE[k as DriverKind] || 'bg-neutral-800 border-neutral-700 text-gray-300';

const STATUS_META: Record<string, { pill: string; dot: string; label: string; ring: string }> = {
  running: { pill: 'bg-emerald-900/50 text-emerald-200 border-emerald-700/50', dot: 'bg-emerald-400', label: 'Running', ring: '#34d399' },
  stopped: { pill: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', label: 'Stopped', ring: '#6b7280' },
  creating: { pill: 'bg-yellow-900/50 text-yellow-200 border-yellow-700/50', dot: 'bg-yellow-400 animate-pulse', label: 'Creating', ring: '#facc15' },
  installing: { pill: 'bg-sky-900/50 text-sky-200 border-sky-700/50', dot: 'bg-sky-400 animate-pulse', label: 'Installing', ring: '#38bdf8' },
  errored: { pill: 'bg-red-900/50 text-red-200 border-red-700/50', dot: 'bg-red-400', label: 'Errored', ring: '#f87171' },
  install_failed: { pill: 'bg-red-900/50 text-red-200 border-red-700/50', dot: 'bg-red-400', label: 'Install failed', ring: '#f87171' },
  destroyed: { pill: 'bg-neutral-800 text-gray-500 border-neutral-700', dot: 'bg-gray-600', label: 'Destroyed', ring: '#4b5563' },
};
const statusMeta = (s: string) =>
  STATUS_META[s] || { pill: 'bg-neutral-800 text-gray-400 border-neutral-700', dot: 'bg-gray-500', label: s, ring: '#6b7280' };

function KindIcon({ kind, className = '' }: { kind: string; className?: string }) {
  const common = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  switch (kind) {
    case 'docker': return <svg {...common}><path d="M3 5h7v5H3z" /><path d="M10 8h5a3 3 0 0 1 3 3v1h2a2 2 0 0 1 2 2 4 4 0 0 1-4 4h-2" /><path d="M3 8v8h7V8" /><path d="M3 12h7" /> </svg>;
    case 'lxd': return <svg {...common}><path d="M4 7 12 3l8 4v10l-8 4-8-4z" /><path d="M4 7l8 4 8-4" /><path d="M12 11v10" /> </svg>;
    case 'kvm': return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M7 20h10" /><path d="M9 8l4 3-4 3z" /> </svg>;
    case 'multipass': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /> </svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 9h.01M15 9h.01M9 15h6" /> </svg>;
  }
}

// Try "2g", "512m", "20G", "1024"  -> bytes.
function parseBytes(raw: string | number | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([kmgt]?)b?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] || 'b';
  const mul: Record<string, number> = { '': 1, b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 };
  return n * (mul[unit] || 1);
}

// CPU units are fractional cores (e.g. --cpus 0.5 / 2).
function parseCpu(raw: string | number | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

interface Res {
  ramBytes: number | null;
  cpu: number | null;
  diskBytes: number | null;
}
function parseLimits(
  cfg: ReturnType<typeof parseConfig>,
  cached?: CachedResource | null,
): Res {
  const limits = (cfg.limits || {}) as Record<string, string | number | undefined>;
  const advanced = (cfg.advanced || {}) as Record<string, any>;
  const pick = (keys: string[]): string | number | undefined => {
    for (const k of keys) {
      const v = limits[k];
      if (v != null && v !== '') return v;
    }
    for (const k of keys) {
      const v = cfg[k];
      if (v != null && v !== '') return v;
    }
    for (const k of keys) {
      const v = advanced?.kvm?.[k];
      if (v != null && v !== '') return v;
    }
    for (const k of keys) {
      const v = advanced?.multipass?.[k];
      if (v != null && v !== '') return v;
    }
    for (const k of keys) {
      const v = advanced?.lxd?.[k];
      if (v != null && v !== '') return v;
    }
    return undefined;
  };
  const ramFromCfg = parseBytes(pick(['memory', 'mem', 'ram', 'mem_mb', 'memory_mb']));
  const diskFromCfg = parseBytes(pick(['disk', 'disk_size', 'disk-size', 'storage', 'disk_mb', 'disk']));
  const ramFromCache = cached && cached.mem_total > 0 ? cached.mem_total : null;
  const diskFromCache = cached && cached.disk_total > 0 ? cached.disk_total : null;
  return {
    ramBytes: ramFromCfg ?? ramFromCache,
    cpu: parseCpu(pick(['cpus', 'cpu', 'cpu_limit', 'vcpus', 'limits_cpu_allowance'])),
    diskBytes: diskFromCfg ?? diskFromCache,
  };
}

export function formatBytes(bytes: number | null | string): string {
  let num: number | null = null;
  if (bytes === null) {
    num = null;
  } else if (typeof bytes === 'string') {
    const parsed = Number(bytes);
    num = Number.isFinite(parsed) ? parsed : null;
  } else if (typeof bytes === 'number') {
    num = Number.isFinite(bytes) ? bytes : null;
  }
  if (num == null) return '0 B';
  if (num >= 1024 ** 3) return `${(num / 1024 ** 3).toFixed(num >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (num >= 1024 ** 2) return `${(num / 1024 ** 2).toFixed(0)} MB`;
  if (num >= 1024) return `${(num / 1024).toFixed(0)} KB`;
  return `${num} B`;
}

export function formatCpu(cpu: number | null): string {
  if (cpu == null) return '—';
  return Number.isInteger(cpu) ? `${cpu} vCPU` : `${cpu.toFixed(1)} vCPU`;
}

// Friendly one-liner for instance.error on the fleet card. The backend stores
// the edge's raw CLI dump verbatim (edge asExec: "docker exited exit status
// 125: <combined output>"), which leaks internals + full container IDs into
// the card. The card shows this short form; the full raw text stays in the
// title tooltip so nothing is hidden.
export function formatInstanceError(raw: string | undefined | null): string {
  if (raw == null) return '';
  let s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // Strip panel "edge rejected …: " wrapper so the card shows the driver
  // error itself ("edge rejected start: docker exited …" → "docker exited …").
  s = s.replace(/^edge rejected:\s*/i, '');
  s = s.replace(/^edge rejected\s+[^:]+:\s*/i, '');
  // "docker exited exit status 125: <detail>" → "Docker error (exit 125): <detail>".
  const m = s.match(/^([a-z][a-z0-9_-]*) exited (exit status \d+):\s*(.*)$/i);
  if (m) {
    const driver = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    const code = (m[2].match(/\d+/) || [])[0] || m[2];
    const exitLabel = `exit ${code}`;
    let detail = (m[3] || '').trim();
    detail = shortenHexIds(detail);
    if (!detail) return `${driver} error (${exitLabel})`;
    // Bare container ID with no daemon message is meaningless on its own —
    // keep the short ID and point at the tooltip/logs for the full output.
    if (/^[0-9a-f]{12,64}$/i.test(detail)) {
      return `${driver} error (${exitLabel}): container ${detail.slice(0, 12)}`;
    }
    return truncateOneLine(`${driver} error (${exitLabel}): ${detail}`, 160);
  }
  return truncateOneLine(shortenHexIds(s), 160);
}

function shortenHexIds(s: string): string {
  // Docker full IDs are 64 hex chars; the card only needs the familiar
  // 12-char short form. Also collapse 16–63 char runs (truncated IDs).
  return s.replace(/\b[0-9a-f]{16,64}\b/gi, (id) => id.slice(0, 12));
}

function truncateOneLine(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd() + '…';
}

// Uptime since the instance last entered "running" (started_at).
// Falls back to updated_at / created_at for rows that pre-date the
// started_at column (migration 051). Updated every second while mounted.
function useUptime(sinceISO: string | undefined | null, status: string): string {
  const [, force] = useState(0);
  useEffect(() => {
    if (!sinceISO || status !== 'running') return;
    const t = setInterval(() => force((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [sinceISO, status]);
  if (!sinceISO) return '—';
  const start = new Date(sinceISO).getTime();
  if (!Number.isFinite(start)) return '—';
  if (status !== 'running') return '—';
  let s = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export interface CardAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  tone: 'start' | 'stop' | 'restart' | 'destroy' | 'edit';
  icon?: React.ReactNode;
}

interface InstanceCardProps {
  instance: Instance;
  actions?: CardAction[];
  showOwner?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onSuspend?: (instance: Instance, durationHours?: number) => void;
  onUnsuspend?: (instance: Instance) => void;
  suspendingId?: number | null;
  deleteDisabled?: boolean;
  id?: string;
}

const InstanceCard: React.FC<InstanceCardProps> = ({ instance, actions, showOwner, onEdit, onDelete, onSuspend, onUnsuspend, suspendingId, deleteDisabled, id }) => {
  const navigate = useNavigate();
  const sm = statusMeta(instance.status);
  const [cachedById, setCachedById] = useState<Record<number, CachedResource>>({});
  const cached = cachedById[instance.id] || null;
  useEffect(() => {
    let cancelled = false;
    listCachedResources()
      .then((rows) => {
        if (cancelled) return;
        const m: Record<number, CachedResource> = {};
        for (const r of rows) m[r.id] = r;
        setCachedById(m);
      })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, []);
  let cfg: any = { advanced: { kvm: {}, multipass: {}, lxd: {} } };
  try {
    const parsed = parseConfig(instance.config);
    cfg = {
      raw: parsed?.raw || parsed || {},
      limits: parsed?.limits || parsed?.raw?.limits || {},
      advanced: parsed?.advanced || parsed?.raw?.advanced || {},
      image: parsed?.image || parsed?.raw?.image || '',
      ports: parsed?.ports || parsed?.raw?.ports || [],
      mounts: parsed?.mounts || parsed?.raw?.mounts || [],
      env: parsed?.env || parsed?.raw?.env || [],
      command: parsed?.command || parsed?.raw?.command || [],
      install: parsed?.install || parsed?.raw?.install || [],
      restart: parsed?.restart || parsed?.raw?.restart || '',
      category: parsed?.category || parsed?.raw?.category || '',
      type: parsed?.type || parsed?.raw?.type || '',
      storage: parsed?.storage || parsed?.raw?.storage || '',
    };
  } catch (e) {
    console.error('Error parsing config:', e);
  }
  const res = parseLimits(parseConfig(instance.config), cached);
  const uptime = useUptime(instance.started_at || instance.updated_at || instance.created_at, instance.status);
  const glassModifier = useThemeStore((s) => {
    const g = s.active().card.glass_style;
    if (!g || g === 'frosted') return '';
    return g === 'solid' ? 'ks-card-glass-solid' : 'ks-card-glass-strong';
  });

  const open = () => navigate(`/instances/${instance.id}`);

  const actionTone: Record<string, string> = {
    start: 'text-emerald-300 hover:bg-emerald-900/30 border-emerald-700/50',
    stop: 'text-yellow-300 hover:bg-yellow-900/30 border-yellow-700/50',
    restart: 'text-sky-300 hover:bg-sky-900/30 border-sky-700/50',
    destroy: 'text-red-300 hover:bg-red-900/30 border-red-700/50',
    edit: 'text-violet-300 hover:bg-violet-900/30 border-violet-700/50',
  };

  const actionIcons: Record<string, React.ReactNode> = {
    edit: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    start: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
    stop: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    ),
    restart: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M23 4v6h-6" />
        <path d="M1 20v-6h6" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
    destroy: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  };

  const isRunning = instance.status === 'running';
  const isErrorState = ['errored', 'install_failed', 'destroyed'].includes(instance.status);

  // Suspension status
  const isSuspended = instance.suspended === 1;
  const suspensionCount = instance.suspension_count || 0;

  // Display name falls back to name
  const displayName = instance.display_name || instance.name;

  // Custom icon/color from instance fields
  const customIcon = instance.icon;
  const customColor = instance.color;

  // Status display: green with uptime when running, otherwise status label
  const renderStatus = () => {
    if (isRunning) {
      return (
        <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-md border bg-emerald-900/30 border-emerald-700/50 text-emerald-200">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
          </span>
          {uptime}
        </span>
      );
    }
    return (
      <span
        className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-md border backdrop-blur-md ${sm.pill}`}
        title={`Status: ${sm.label}`}
      >
        <span className="relative flex w-2 h-2">
          <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 ${isRunning ? 'animate-ping' : ''}`} style={{ backgroundColor: sm.ring }} />
          <span className={`relative inline-flex rounded-full w-2 h-2 ${sm.dot}`} />
        </span>
        {sm.label}
      </span>
    );
  };

  return (
    <div
      id={id}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      className={`ks-card ks-list-card glass-card ${glassModifier} group relative flex flex-col gap-3 cursor-pointer transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-white/60 overflow-hidden hover:-translate-y-0.5 hover:border-white/20`}
    >
      <CardMediaLayer />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="p-3 flex flex-col gap-3">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex items-start gap-3 min-w-0">
          <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border bg-white/[0.05] border-white/10 ${kindTileClass(instance.kind)}`}>
            {customIcon ? (
              <span
                dangerouslySetInnerHTML={{
                  __html: sanitizeSvgIcon(customIcon).replace(/<svg /, `<svg width="24" height="24" stroke="${customColor || 'currentColor'}" `),
                }}
              />
            ) : (
              <KindIcon kind={instance.kind} className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white truncate leading-tight">{displayName}</h3>
            <p className="text-[11px] text-gray-500 truncate font-mono mt-0.5">
              #{instance.id} · {instance.external_id || instance.kind}
            </p>
          </div>
          {renderStatus()}
        </header>

        {/* ── Meta: node / template ─────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 text-gray-300" title="Node">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /> </svg>
            {instance.node_name || `#${instance.node_id}`}
          </span>
          {instance.template_name && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 text-gray-300" title="Template">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /> </svg>
              {instance.template_name}
            </span>
          )}
          {showOwner && instance.owner_name && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 text-gray-300" title="Owner">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3 h-3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /> </svg>
              {instance.owner_name}
            </span>
          )}
          {suspensionCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-amber-900/40 border-amber-700/40 text-amber-200 text-[10px] uppercase tracking-wide">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {suspensionCount} suspension{suspensionCount > 1 ? 's' : ''}
            </span>
          )}
          {isSuspended && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-red-900/40 border-red-700/40 text-red-200 text-[10px] uppercase tracking-wide">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              Suspended
            </span>
          )}
        </div>

        {instance.error && (
          <p className="text-[11px] text-red-300 truncate bg-red-900/20 border border-red-900/30 rounded px-2 py-1" title={instance.error}>
            ⚠ {formatInstanceError(instance.error)}
          </p>
        )}

        {/* ── Footer: uptime/created + action buttons ───────────────── */}
        <footer className="mt-auto pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-gray-500 truncate">
            {instance.created_at ? (
              <>Created {new Date(instance.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</>
            ) : (
              <>id {instance.id}</>
            )}
          </span>
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {actions && actions.length > 0 ? (
              actions.map((a) => (
                <button
                  key={a.label}
                  onClick={(e) => { e.stopPropagation(); a.onClick(); }}
                  disabled={a.disabled || a.busy}
                  className={`p-1.5 rounded-md border ${actionTone[a.tone]} disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center`}
                  title={a.label}
                >
                  {a.busy ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 animate-spin">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
                    </svg>
                  ) : (
                    a.icon || actionIcons[a.tone]
                  )}
                </button>
              ))
            ) : (onEdit || onDelete || onSuspend || onUnsuspend ? (
              <CardMenu
                ariaLabel={`Actions for instance ${instance.name}`}
                items={[
                  ...(onEdit ? [{
                    kind: 'action' as const,
                    key: 'edit',
                    label: 'Edit',
                    tone: 'default' as const,
                    icon: (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /> </svg>
                    ),
                  }] : []),
                  ...(onSuspend || onUnsuspend ? [{
                    kind: 'submenu' as const,
                    key: 'suspend',
                    label: isSuspended ? 'Unsuspend instance' : 'Suspend instance…',
                    icon: (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                        {isSuspended ? (
                          <><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></>
                        ) : (
                          <><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></>
                        )}
                      </svg>
                    ),
                    children: isSuspended
                      ? [
                          {
                            kind: 'action' as const,
                            key: 'unsuspend',
                            label: 'Unsuspend',
                            tone: 'default' as const,
                            icon: (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                              </svg>
                            ),
                          },
                        ]
                      : [
                          {
                            kind: 'action' as const,
                            key: 'suspend-indefinite',
                            label: 'Until admin unsuspends',
                            tone: 'danger' as const,
                            icon: (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                              </svg>
                            ),
                          },
                          {
                            kind: 'action' as const,
                            key: 'suspend-1h',
                            label: '1 hour',
                            tone: 'danger' as const,
                          },
                          {
                            kind: 'action' as const,
                            key: 'suspend-24h',
                            label: '24 hours',
                            tone: 'danger' as const,
                          },
                          {
                            kind: 'action' as const,
                            key: 'suspend-7d',
                            label: '7 days',
                            tone: 'danger' as const,
                          },
                          {
                            kind: 'action' as const,
                            key: 'suspend-30d',
                            label: '30 days',
                            tone: 'danger' as const,
                          },
                        ],
                  }] : []),
                  ...(onDelete ? [{
                    kind: 'action' as const,
                    key: 'delete',
                    label: 'Delete',
                    tone: 'danger' as const,
                    disabled: deleteDisabled,
                    icon: (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /> </svg>
                    ),
                  }] : []),
                ] as RichMenuItem[]}
                onSelect={(key) => {
                  if (key === 'edit') onEdit?.();
                  else if (key === 'delete') onDelete?.();
                  else if (key === 'unsuspend') onUnsuspend?.(instance);
                  else if (key === 'suspend-indefinite') onSuspend?.(instance);
                  else if (key === 'suspend-1h') onSuspend?.(instance, 1);
                  else if (key === 'suspend-24h') onSuspend?.(instance, 24);
                  else if (key === 'suspend-7d') onSuspend?.(instance, 24 * 7);
                  else if (key === 'suspend-30d') onSuspend?.(instance, 24 * 30);
                }}
              />
            ) : (
              <span className="text-[11px] text-gray-500">Open</span>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default InstanceCard;