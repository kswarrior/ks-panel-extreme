// Cross-instance-page shared helpers. The built-in instance pages
// (Home/Files/Network/Terminal/Settings/Env/Automation/Processes/Metrics/
// Ports/Backups/Audit) each live in their own self-contained file under
// src/lib/builtin/ and import the common UI primitives, skeletons, error
// boundary, instance hook, and error/formatters from THIS module so the
// two legacy monoliths (pages/panel/InstanceDetail.tsx +
// InstanceAdvancedPages.tsx) no longer hold duplicate copies of the same
// helpers.
//
// Everything here is page-agnostic and free of business logic — the per-page
// files own their own state, API calls, and rendering.

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInstance } from '@/shared/hooks/useInstance';
import type { DriverKind } from '@/features/instances/types/instance';

// ---------------------------------------------------------------------------
//  Numeric / string helpers
// ---------------------------------------------------------------------------

// parseBytes turns "2g" / "512m" / "20G" / "1024" into a byte count.
// Returns null for unparseable/empty input so callers can distinguish
// "no data" from a real zero (used by the Home page disk-limit resolver).
export function parseBytes(raw: string | number | undefined): number | null {
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

// joinPath concats two posix path segments without collapsing ".." — we
// trust the operator browsing files (the edge resolves paths inside the
// container namespace anyway). The leading-slash handling keeps absolute
// container paths tidy for the breadcrumb URL builder.
export function joinPath(base: string, name: string): string {
  if (!base) return '/' + name;
  const sep = base.endsWith('/') ? '' : '/';
  return base + sep + name;
}

// timeAgo renders an ISO timestamp as a relative "3m ago" / "2h ago" string,
// falling back to a locale string for anything older than a day. Used by
// every advanced page that lists rows (secrets, automation runs, audit,
// snapshots).
export function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
//  Instance kind / status presentation
// ---------------------------------------------------------------------------

export const KIND_BADGE: Record<DriverKind, string> = {
  docker: 'bg-sky-900/60 text-sky-200 border-sky-700/60',
  lxd: 'bg-indigo-900/60 text-indigo-200 border-indigo-700/60',
  kvm: 'bg-orange-900/60 text-orange-200 border-orange-700/60',
  multipass: 'bg-fuchsia-900/60 text-fuchsia-200 border-fuchsia-700/60',
};
export const kindBadgeClass = (k: string) => KIND_BADGE[k as DriverKind] || 'bg-neutral-800 text-gray-300 border-neutral-700';

export const STATUS_META: Record<string, { badge: string; dot: string; label: string }> = {
  running: { badge: 'bg-emerald-900/50 text-emerald-200 border-emerald-700/50', dot: 'bg-emerald-400', label: 'Running' },
  stopped: { badge: 'bg-neutral-800 text-gray-300 border-neutral-700', dot: 'bg-gray-500', label: 'Stopped' },
  creating: { badge: 'bg-yellow-900/50 text-yellow-200 border-yellow-700/50', dot: 'bg-yellow-400 animate-pulse', label: 'Creating' },
  // 'installing' = the container is up but the post-deploy install workflow
  // (spec.install[]) is still running; installSweepLoop owns the transition
  // to 'running' / 'install_failed'. Mirrors InstanceCard STATUS_META.
  installing: { badge: 'bg-sky-900/50 text-sky-200 border-sky-700/50', dot: 'bg-sky-400 animate-pulse', label: 'Installing' },
  errored: { badge: 'bg-red-900/50 text-red-200 border-red-700/50', dot: 'bg-red-400', label: 'Errored' },
  install_failed: { badge: 'bg-red-900/50 text-red-200 border-red-700/50', dot: 'bg-red-400', label: 'Install failed' },
  destroyed: { badge: 'bg-neutral-800 text-gray-500 border-neutral-700', dot: 'bg-gray-600', label: 'Destroyed' },
};
export const statusMeta = (s: string) =>
  STATUS_META[s] || { badge: 'bg-neutral-800 text-gray-400 border-neutral-700', dot: 'bg-gray-500', label: s };

export function KindIcon({ kind, className = '' }: { kind: string; className?: string }) {
  const common = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  switch (kind) {
    case 'docker': return <svg {...common}><path d="M3 5h7v5H3z" /><path d="M10 8h5a3 3 0 0 1 3 3v1h2a2 2 0 0 1 2 2 4 4 0 0 1-4 4h-2" /><path d="M3 8v8h7V8" /><path d="M3 12h7" /> </svg>;
    case 'lxd': return <svg {...common}><path d="M4 7 12 3l8 4v10l-8 4-8-4z" /><path d="M4 7l8 4 8-4" /><path d="M12 11v10" /> </svg>;
    case 'kvm': return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M7 20h10" /><path d="M9 8l4 3-4 3z" /> </svg>;
    case 'multipass': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /> </svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 9h.01M15 9h.01M9 15h6" /> </svg>;
  }
}

// cleanExternalId trims the docker/log noise that older deploys recorded as
// the external id. The noisy "Unable to find image … Pulling fs layer …
// <containerID>" output bleeds into docker run -d's captured stdout, so we
// surface only the actual container-id line (last 12..64-char hex token).
export function cleanExternalId(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const m = trimmed.match(/[0-9a-f]{12,64}/gi);
  if (m && m.length) return m[m.length - 1];
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return (lines[lines.length - 1] || trimmed).slice(0, 64);
}

// INSTANCE_NAV kept exported so the global Sidebar renders the per-instance
// Home/Files/Network/Terminal/Settings dropdown. TemplateForm's INSTANCE_NAV
// comment mirrors these labels; the spec persists only the slug.
export const INSTANCE_NAV = [
  { to: '.', label: 'Home', icon: 'Home', end: true },
  { to: 'files', label: 'Files', icon: 'Files', end: false },
  { to: 'network', label: 'Network', icon: 'Network', end: false },
  { to: 'terminal', label: 'Terminal', icon: 'Terminal', end: false },
  { to: 'env', label: 'Env', icon: 'Env', end: false },
  { to: 'automation', label: 'Automation', icon: 'Automation', end: false },
  { to: 'processes', label: 'Processes', icon: 'Processes', end: false },
  { to: 'metrics', label: 'Metrics', icon: 'Metrics', end: false },
  { to: 'ports', label: 'Ports', icon: 'Ports', end: false },
  { to: 'backups', label: 'Backups', icon: 'Backups', end: false },
  { to: 'audit', label: 'Audit', icon: 'Audit', end: false },
  { to: 'settings', label: 'Settings', icon: 'Settings', end: false },
];

// ---------------------------------------------------------------------------
//  Shared UI primitives (Section / EmptyRow / InfoRow)
// ---------------------------------------------------------------------------

export const Section: React.FC<{ title?: string; description?: string; children: React.ReactNode; className?: string }> = ({ title, description, children, className = '' }) => (
  <div className={`glass-card rounded-xl ${className}`}>
    {title && <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>}
    {description && <p className="text-xs text-gray-400 mb-3">{description}</p>}
    {children}
  </div>
);

export const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-xs text-gray-500 px-3 py-2">{text}</p>
);

export const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 px-4 py-3">
    <dt className="text-sm text-gray-400">{label}</dt>
    <dd className="text-sm text-right">{value}</dd>
  </div>
);

// Btn / Field / inputCls — the small form vocabulary shared by the
// advanced pages' modals (Env/Automation/Backups create/edit forms).
export const inputCls = 'w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-white/30';

export const Btn: React.FC<{
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  className?: string;
  title?: string;
}> = ({ onClick, disabled, children, variant = 'ghost', className = '', title }) => {
  const base = 'inline-flex items-center gap-1.5 border px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const tones = {
    primary: 'ks-primary-btn bg-white text-black border-white hover:bg-gray-100',
    ghost: 'ks-ghost-btn border-white/10 text-gray-200 hover:bg-white/10 hover:text-white',
    danger: 'border-red-700/60 text-red-300 hover:bg-red-900/40',
  } as const;
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${tones[variant]} ${className}`}>
      {children}
    </button>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="block">
    <span className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-gray-500 mt-1">{hint}</span>}
  </label>
);

// ---------------------------------------------------------------------------
//  Instance hook
// ---------------------------------------------------------------------------

// useInstanceFromParams reads the :id route param and resolves the instance
// row. The canonical hook every instance sub-page uses; returns the loaded
// instance + instanceId so callers don't each re-read useParams.
export const useInstanceFromParams = () => {
  const { id } = useParams();
  const r = useInstance(Number(id));
  return { ...r, instanceId: Number(id) };
};

// ---------------------------------------------------------------------------
//  Error boundary + bound-page wrapper
// ---------------------------------------------------------------------------

// PageErrorBoundary catches a render-time throw inside any instance sub-page
// so a single broken page can't blank out the whole SPA. The instance shell
// stays mounted; only the failing sub-page is replaced with a visible crash
// card that surfaces the JS error message + a fragment of the stack.
export class PageErrorBoundary extends React.Component<
  { children: React.ReactNode; name?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error('[Instance page crash]', error, info);
  }
  render() {
    if (this.state.error) {
      const msg = this.state.error.message || String(this.state.error);
      const stack = (this.state.error.stack || '').split('\n').slice(0, 6).join('\n');
      return (
        <div className="glass-card rounded-xl space-y-3 border border-red-700/40">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-red-300"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /> </svg>
            <h3 className="text-sm font-semibold text-red-200">
              {this.props.name ? `${this.props.name} page crashed` : 'This page crashed'}
            </h3>
          </div>
          <p className="text-xs text-red-300 font-mono break-all">{msg}</p>
          {stack && <pre className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap break-all">{stack}</pre>}
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="text-xs border border-white/10 text-gray-200 px-3 py-1.5 rounded hover:bg-white/10"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// withBoundary wraps a page component in PageErrorBoundary. Each built-in
// page exports BOTH its raw component and a `*Page` boundary-wrapped version
// (the router mounts the wrapped one so a render-time throw becomes a
// visible crash card instead of blanking the SPA).
export function withBoundary(name: string, Comp: React.ComponentType): React.FC {
  const Wrapped: React.FC = (props) => (
    <PageErrorBoundary name={name}><Comp {...props} /></PageErrorBoundary>
  );
  Wrapped.displayName = `WithBoundary(${name})`;
  return Wrapped;
}

// ---------------------------------------------------------------------------
//  Skeletons + LoadingOrError
// ---------------------------------------------------------------------------

// LoadingKind enumerates the skeleton variants `LoadingOrError` can render.
// Each entry mirrors the shape of the actual sub-page so the layout doesn't
// jump once the real data lands.
export type LoadingKind = 'panel' | 'home' | 'files' | 'network' | 'terminal' | 'settings';

const SkeletonShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-4">{children}</div>
);

// Bar is the atomic placeholder building block: a soft rectangular
// `bg-neutral-800` slab with optional width + height, used to compose the
// per-page skeletons.
const Bar: React.FC<{ w?: string; h?: string; className?: string }> = ({ w = 'w-full', h = 'h-3', className = '' }) => (
  <div className={`${w} ${h} bg-neutral-800 rounded animate-pulse ${className}`} />
);

const SectionCardSkeleton: React.FC<{ title?: boolean; rows?: number }> = ({ title = true, rows = 4 }) => (
  <div className="glass-card rounded-xl animate-pulse">
    {title && <Bar w="w-1/4" h="h-4" className="mb-3" />}
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <Bar w="w-1/3" h="h-3" />
          <Bar w="w-1/4" h="h-3" />
        </div>
      ))}
    </div>
  </div>
);

const HomeSkeleton: React.FC = () => (
  <SkeletonShell>
    <div className="glass-card rounded-xl flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 rounded-xl bg-neutral-800 shrink-0" />
      <div className="flex-1 space-y-2">
        <Bar w="w-1/3" h="h-5" />
        <Bar w="w-1/2" h="h-3" />
      </div>
      <div className="hidden md:block space-y-2">
        <Bar w="w-16" h="h-3" />
        <Bar w="w-12" h="h-4" />
      </div>
    </div>
    <div className="ks-card-grid grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="glass-card rounded-xl flex items-center gap-4 animate-pulse">
          <div className="w-10 h-10 rounded-lg bg-neutral-800 shrink-0" />
          <div className="flex-1 space-y-2">
            <Bar w="w-1/2" h="h-5" />
            <Bar w="w-2/3" h="h-3" />
          </div>
        </div>
      ))}
    </div>
    <div className="ks-card-grid grid grid-cols-1 lg:grid-cols-2">
      <SectionCardSkeleton rows={4} />
      <SectionCardSkeleton rows={4} />
    </div>
  </SkeletonShell>
);

const FilesSkeleton: React.FC = () => (
  <SkeletonShell>
    <div className="space-y-1">
      <Bar w="w-1/4" h="h-5" />
      <Bar w="w-1/2" h="h-3" />
    </div>
    <div className="glass-card rounded-xl animate-pulse">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-1">
          <Bar w="w-8" h="h-3" />
          <Bar w="w-20" h="h-3" />
        </div>
        <Bar w="w-20" h="h-6" />
      </div>
      <div className="rounded-md border border-white/10 bg-black/30 overflow-hidden">
        <div className="divide-y divide-white/[0.06]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="w-4 h-4 rounded bg-neutral-800 shrink-0" />
              <Bar w="w-1/3" h="h-3" />
              <div className="flex-1" />
              <Bar w="w-16" h="h-3" />
              <Bar w="w-24" h="h-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </SkeletonShell>
);

const NetworkSkeleton: React.FC = () => (
  <SkeletonShell>
    <div className="space-y-1">
      <Bar w="w-1/4" h="h-5" />
      <Bar w="w-2/3" h="h-3" />
    </div>
    <div className="ks-card-grid grid grid-cols-2 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="glass-card rounded-xl flex items-center gap-4 animate-pulse">
          <div className="w-10 h-10 rounded-lg bg-neutral-800 shrink-0" />
          <div className="flex-1 space-y-2">
            <Bar w="w-1/3" h="h-6" />
            <Bar w="w-1/2" h="h-3" />
          </div>
        </div>
      ))}
    </div>
    <div>
      <div className="flex items-center justify-between mb-2">
        <Bar w="w-1/4" h="h-3" />
        <Bar w="w-16" h="h-3" />
      </div>
      <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card rounded-xl space-y-3 animate-pulse">
            <div className="flex items-center justify-between gap-2">
              <Bar w="w-20" h="h-3" />
              <Bar w="w-12" h="h-6" />
            </div>
            <div className="flex items-center justify-between">
              <Bar w="w-12" h="h-3" />
              <Bar w="w-6" h="h-5" />
              <Bar w="w-12" h="h-3" />
            </div>
            <Bar w="w-full" h="h-3" />
          </div>
        ))}
      </div>
    </div>
  </SkeletonShell>
);

const TerminalSkeleton: React.FC = () => (
  <SkeletonShell>
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-1">
        <Bar w="w-1/4" h="h-5" />
        <Bar w="w-1/2" h="h-3" />
      </div>
      <Bar w="w-24" h="h-7" />
    </div>
    <div className="rounded-lg overflow-hidden border border-white/10 bg-[#1e1e1e] animate-pulse">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#323233] border-b border-black/40">
        <span className="w-3 h-3 rounded-full bg-neutral-700" />
        <span className="w-3 h-3 rounded-full bg-neutral-700" />
        <span className="w-3 h-3 rounded-full bg-neutral-700" />
        <Bar w="w-1/3" h="h-3" className="ml-2 bg-neutral-700" />
      </div>
      <div className="flex items-center bg-[#252526] border-b border-black/30">
        <Bar w="w-40" h="h-3" className="ml-3 my-1.5 bg-neutral-700" />
      </div>
      <div className="bg-[#1e1e1e] px-2 pt-2 pb-1 h-[28rem] flex flex-col gap-3">
        <Bar w="w-2/3" h="h-3" className="bg-neutral-700" />
        <Bar w="w-1/2" h="h-3" className="bg-neutral-700" />
        <Bar w="w-3/4" h="h-3" className="bg-neutral-700" />
      </div>
      <Bar w="w-full" h="h-6" className="bg-[#007acc]/40" />
    </div>
  </SkeletonShell>
);

const SettingsSkeleton: React.FC = () => (
  <SkeletonShell>
    <div className="space-y-1">
      <Bar w="w-1/4" h="h-5" />
      <Bar w="w-2/3" h="h-3" />
    </div>
    <SectionCardSkeleton rows={3} />
    <SectionCardSkeleton rows={4} />
    <SectionCardSkeleton rows={2} />
  </SkeletonShell>
);

const PanelSkeleton: React.FC = () => (
  <SkeletonShell>
    <div className="glass-card rounded-xl flex items-center gap-4 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-neutral-800 shrink-0" />
      <Bar w="w-1/3" h="h-5" />
    </div>
  </SkeletonShell>
);

export const LoadingOrError: React.FC<{ loading: boolean; error: string; kind?: LoadingKind }> = ({ loading, error, kind = 'panel' }) => {
  if (loading) {
    switch (kind) {
      case 'home':     return <HomeSkeleton />;
      case 'files':    return <FilesSkeleton />;
      case 'network':  return <NetworkSkeleton />;
      case 'terminal': return <TerminalSkeleton />;
      case 'settings': return <SettingsSkeleton />;
      case 'panel':
      default:         return <PanelSkeleton />;
    }
  }
  if (error) return <div className="glass-card rounded-xl text-red-400 text-sm">{error}</div>;
  return null;
};

// ---------------------------------------------------------------------------
//  Skeletons used by the advanced (lazy) pages
// ---------------------------------------------------------------------------

// tableSkeleton renders `rows` shimmering placeholder rows inside the same
// table layout the live data uses, so the row geometry stays stable while
// the edge's inspect endpoint answers.
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 6, cols = 5 }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <tbody className="divide-y divide-white/[0.06]">
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="bg-white/[0.02]">
            {Array.from({ length: cols }).map((_, j) => (
              <td key={j} className="px-3 py-2.5">
                <div className="h-3 bg-neutral-800 rounded animate-pulse" style={{ width: `${70 - j * 10}%` }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// CardGridSkeleton renders a shimmering card grid (used by every advanced
// page that shows a card-per-row: Env, Automation, Processes, Ports, Audit,
// Snapshots). `count` is the number of placeholder cards.
export const CardGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="ks-card-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="glass-card rounded-xl animate-pulse">
        <div className="h-4 w-1/2 bg-neutral-800 rounded mb-3" />
        <div className="h-3 w-2/3 bg-neutral-800 rounded mb-2" />
        <div className="h-3 w-1/3 bg-neutral-800 rounded" />
      </div>
    ))}
  </div>
);

// TilesSkeleton mirrors the Metrics grid (2 cols on mobile → 6 on xl) so the
// auto-refreshed 5s polling has a stable layout placeholder before the first
// inspect payload lands.
export const TilesSkeleton: React.FC<{ tiles?: number }> = ({ tiles = 6 }) => (
  <div className="ks-card-grid grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
    {Array.from({ length: tiles }).map((_, i) => (
      <div key={i} className="glass-card rounded-xl animate-pulse">
        <div className="h-6 w-2/3 bg-neutral-800 rounded mb-3" />
        <div className="h-3 w-1/2 bg-neutral-800 rounded" />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
//  Response/error normalisers (used by every list-loading page)
// ---------------------------------------------------------------------------

// asArray normalises a list-API response that came back as anything but an
// array. The panel's repos can emit `null` (not `[]`) on some paths; feeding
// that straight into `list.map(...)`/`list.length` throws a render-time
// TypeError that blanks the whole page. Every loader returns a guaranteed
// array so `<x>.length`/`.map` can never throw.
export const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// errText flattens an axios error payload into a render-safe string. Reverse
// proxies (e.g. Cloudflare) surface failures as a structured JSON body
// ({type,title,status,detail,instance,error_code,ray_id,...}) instead of
// plain text; passing that object straight into React state and rendering it
// throws React error #31 ("Objects are not valid as a React child") which
// blanks the page. Every catch funnels through errText so the banners/modal
// errors are always strings.
export const errText = (e: unknown, fallback: string): string => {
  const anyE = e as { response?: { data?: unknown }; message?: unknown } | undefined;
  const data = anyE?.response?.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of ['detail', 'error', 'message', 'title', 'error_code']) {
      const v = d[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    try {
      const s = JSON.stringify(d);
      return s && s !== '{}' ? s : fallback;
    } catch {
      return fallback;
    }
  }
  if (typeof anyE?.message === 'string' && anyE.message.trim()) return anyE.message;
  return fallback;
};

// ---------------------------------------------------------------------------
//  NOTE: the legacy InstanceDetail.tsx / InstanceAdvancedPages.tsx each
//  implemented their own `useEffect` + `setInterval` + cancelled-flag
//  polling inline. This module deliberately does NOT introduce a shared
//  usePollingLoader helper — each page keeps its own minimal pattern so the
//  refactor preserves existing abstractions 1:1. If a real abstraction is
//  warranted later, it can be added in a follow-up.
// ---------------------------------------------------------------------------

