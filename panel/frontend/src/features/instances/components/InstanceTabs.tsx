import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useInstanceNav } from '@/shared/components/layout/InstanceNavContext';
import { isPageAllowed } from '@/shared/utils/instancePages';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';

// InstanceTabs — inline instance page tabs in the header. The main thing
// of an instance (power, actions, status) lives in the floating draggable
// menu (InstanceMenuFab), so this is just the scrollable tab row.

// INSTANCE_TOOL_SLUGS are utility pages that never render as tabs — they
// live in the InstanceToolsDock below (icon cards with their own look) so
// the tab row stays reserved for content pages. Direct URLs keep working:
// this only affects nav presentation, never the route guards.
export const INSTANCE_TOOL_SLUGS = ['files', 'terminal', 'ports'];

// useEffectiveInstanceNav — instance content pages plus the synthetic
// built-in tabs (Snapshots), permission-gated. Tool slugs (Files /
// Terminal / Ports) are excluded here — they render in the Tools dock.
export function useEffectiveInstanceNav() {
  const { nav, instanceId } = useInstanceNav();
  const permissions = useAuthStore((s) => s.permissions);
  const canViewSnapshots = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES, PermissionKey.VIEW_INSTANCES);
  return useMemo(() => {
    // Content tabs only — tools get their own dock, never the tab row.
    let out = nav.filter((n) => !INSTANCE_TOOL_SLUGS.includes(n.to));
    if (instanceId && canViewSnapshots && !out.some((n) => n.to === 'snapshots')) {
      // Native Snapshots tab (built-in, like SFTP). The legacy
      // backups.json custom page keeps working under slug 'backups'.
      out = [
        ...out,
        {
          to: 'snapshots',
          label: 'Snapshots',
          iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></svg>',
          iconKind: 'svg' as const,
          end: false,
        },
      ];
    }
    return out;
  }, [nav, instanceId, canViewSnapshots]);
}

const InstanceTabs: React.FC = () => {
  const { instanceId, loading } = useInstanceNav();
  const effectiveNav = useEffectiveInstanceNav();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  // checkOverflow + the resize effect must be declared BEFORE the early
  // return below. Declaring a hook after a conditional return makes it
  // conditional: the first render (nav empty) skips it, then the moment the
  // instance nav context populates the hook appears, and React throws
  // Error 310 ("Rendered more hooks than during the previous render"),
  // unmounting the whole app into a blank black page.
  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      setShowFade(el.scrollWidth > el.clientWidth + 4);
    }
  }, []);

  useEffect(() => {
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [effectiveNav, checkOverflow]);

  if (!instanceId) {
    return null;
  }

  // While the instance fetch is in flight render a shimmering skeleton
  // placeholder instead of `null`. After loading, an empty nav (empty-by-
  // default instance with no pages) renders nothing — the InstanceDynamicPage
  // shows the NoPagesState guidance instead of a perpetual skeleton.
  if (loading) {
    return (
      <div className="flex-1 min-w-0 relative bg-transparent">
        <div className="relative">
          <nav
            className="flex items-center gap-1 px-0 py-2 overflow-x-auto"
            aria-label="Instance pages"
            aria-busy="true"
          >
            <div className="shrink-0 w-8 h-8 rounded bg-neutral-800/60 animate-pulse" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 h-7 w-20 rounded-md bg-neutral-800/60 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </nav>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-t from-white/10 via-transparent to-transparent pointer-events-none instance-tabs-scroll-indicator"
          aria-hidden="true"
        />
      </div>
    );
  }
  if (effectiveNav.length === 0) {
    return null;
  }

return (
    <div className="flex-1 min-w-0 relative bg-transparent">
      <div className="relative">
        <nav
          ref={scrollRef}
          className="flex items-center gap-1 px-0 py-2 overflow-x-auto"
          aria-label="Instance pages"
          onScroll={checkOverflow}
        >
          {effectiveNav.map((item) => {
            const absTo =
              item.to === '.' || item.to === ''
                ? `/instances/${instanceId}`
                : `/instances/${instanceId}/${item.to}`;
            const sanitized = item.iconKind === 'svg' && item.iconSvg ? sanitizeSvgIcon(item.iconSvg) : '';
            const isFullSvg = sanitized.trim().toLowerCase().startsWith('<svg');
            const tabColor = (item as any).iconColor || '';
            const iconEl =
              item.iconKind === 'svg' && sanitized
                ? isFullSvg
                  ? (
                      <span
                        className="w-4 h-4 flex-shrink-0 block [&>svg]:w-4 [&>svg]:h-4 [&>svg]:block"
                        style={tabColor ? { color: tabColor } : undefined}
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: sanitized }}
                      />
                    )
                  : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4 flex-shrink-0"
                        style={tabColor ? { color: tabColor } : undefined}
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: sanitized }}
                      />
                    )
                : null;
            return (
              <NavLink
                key={item.to}
                to={absTo}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {iconEl}
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
      {/* Bottom scroll indicator line - visible scrollbar for horizontal scrolling */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-t from-white/10 via-transparent to-transparent pointer-events-none instance-tabs-scroll-indicator"
        aria-hidden="true"
      />
    </div>
  );
};

export default InstanceTabs;

// InstanceToolsDock — quick-access cards for the three utility pages
// (Files / Terminal / Ports). Deliberately NOT tabs: big icon tiles with
// a name + one-line hint, grouped under a "Tools" label, so operators
// spot them instantly instead of hunting the tab row. Routing and guards
// are untouched — each card links to the same route the tab used to, and
// a card renders dimmed with an explanatory tooltip when its page isn't
// available (page not imported, or missing permission).
export const InstanceToolsDock: React.FC<{
  instanceId: number;
  spec: Record<string, any> | null;
  loading?: boolean;
}> = ({ instanceId, spec, loading }) => {
  const location = useLocation();
  const permissions = useAuthStore((s) => s.permissions);
  const canEditPorts = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);

  if (!instanceId || loading) return null;

  const filesOk = isPageAllowed('files', spec);
  const terminalOk = isPageAllowed('terminal', spec);

  const tools = [
    {
      slug: 'files',
      label: 'Files',
      hint: filesOk ? 'Browse & manage files' : 'Import a Files page (Pages tab) to enable',
      enabled: filesOk,
      tile: 'bg-amber-500/15 border-amber-400/30 text-amber-300',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
      ),
    },
    {
      slug: 'terminal',
      label: 'Terminal',
      hint: terminalOk ? 'Live shell session' : 'Enable the Terminal page (Pages tab) to open a shell',
      enabled: terminalOk,
      tile: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      ),
    },
    {
      slug: 'ports',
      label: 'Ports',
      hint: canEditPorts ? 'Port mappings' : 'Requires instance edit permission',
      enabled: canEditPorts,
      tile: 'bg-sky-500/15 border-sky-400/30 text-sky-300',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <rect x="2" y="7" width="20" height="8" rx="2" />
          <path d="M6 7v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
          <path d="M6 15v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="ks-card ks-form-card rounded-xl px-3 py-2.5 flex items-center gap-2 flex-wrap"
      aria-label="Instance tools"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 shrink-0 mr-1">
        Tools
      </span>
      {tools.map((t) => {
        const to = `/instances/${instanceId}/${t.slug}`;
        const active = location.pathname === to || location.pathname === `${to}/`;
        const cls = `flex items-center gap-2.5 rounded-xl border px-3 py-1.5 transition min-w-0 ${
          t.enabled
            ? active
              ? 'border-sky-400/60 bg-sky-500/10 shadow-[0_0_12px_rgba(56,189,248,0.15)]'
              : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
            : 'border-white/[0.06] bg-transparent opacity-45 cursor-not-allowed'
        }`;
        const body = (
          <>
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${t.tile}`}>
              {t.icon}
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-medium text-white leading-tight">{t.label}</span>
              <span className="block text-[11px] text-gray-500 leading-tight truncate">{t.hint}</span>
            </span>
          </>
        );
        return t.enabled ? (
          <NavLink key={t.slug} to={to} title={`${t.label} — ${t.hint}`} aria-label={t.label} className={cls}>
            {body}
          </NavLink>
        ) : (
          <span key={t.slug} title={`${t.label} — ${t.hint}`} aria-label={`${t.label} (unavailable)`} aria-disabled="true" className={cls}>
            {body}
          </span>
        );
      })}
    </div>
  );
};