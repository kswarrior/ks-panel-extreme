import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useInstanceNav } from '@/shared/components/layout/InstanceNavContext';
import { sanitizeSvgIcon } from '@/shared/utils/sanitizeSvgIcon';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';

// InstanceTabs — inline instance page tabs in the header. The main thing
// of an instance (power, actions, status) lives in the floating draggable
// menu (InstanceMenuFab), so this is just the scrollable tab row.

// useEffectiveInstanceNav — instance pages plus the synthetic built-in tabs
// (Ports, Snapshots), permission-gated. Shared by the inline tab row and
// the floating menu so both list exactly the same pages.
export function useEffectiveInstanceNav() {
  const { nav, instanceId } = useInstanceNav();
  const permissions = useAuthStore((s) => s.permissions);
  const canEditPorts = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES);
  const canViewSnapshots = hasPermissionAny(permissions, PermissionKey.INSTANCES_EDIT, PermissionKey.MANAGE_INSTANCES, PermissionKey.VIEW_INSTANCES);
  return useMemo(() => {
    let out = nav;
    if (instanceId && canEditPorts && !out.some((n) => n.to === 'ports')) {
      // Append synthetic Ports tab unless a custom page already uses slug 'ports'
      out = [
        ...out,
        {
          to: 'ports',
          label: 'Ports',
          iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="8" rx="2"/><path d="M6 7v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M6 15v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2"/></svg>',
          iconKind: 'svg' as const,
          end: false,
        },
      ];
    }
    if (instanceId && canViewSnapshots && !out.some((n) => n.to === 'snapshots')) {
      // Native Snapshots tab (built-in, like Ports/SFTP). The legacy
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
  }, [nav, instanceId, canEditPorts, canViewSnapshots]);
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