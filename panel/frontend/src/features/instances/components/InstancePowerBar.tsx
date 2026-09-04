import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { startInstance, stopInstance, restartInstance } from '@/shared/api/admin';
import { useInstance } from '@/shared/hooks/useInstance';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';

const COLLAPSED_KEY = 'ks-instance-power-collapsed';

// InstancePowerBar — self-contained collapsible power dock for the instance
// details shell (same pattern as InstanceTabs: no props, resolves everything
// itself from the route + stores).
//
//   [ Start | Stop | Restart ] [ < ]
//
// Clicking [ < ] slides the three buttons left so only [ > ] stays visible.
// Compact + floating: minimal padding/margin, `sticky` + negative margins so
// the box sits in the top-left-most corner of the scrolling content and
// floats OVER page content (high z) instead of pushing it down.
const InstancePowerBar: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const { instance, loading, reload } = useInstance(instanceId);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState<'start' | 'stop' | 'restart' | null>(null);
  const [error, setError] = useState('');
  const permissions = useAuthStore((s) => s.permissions);

  const canControl = hasPermissionAny(
    permissions,
    PermissionKey.MANAGE_INSTANCES,
    PermissionKey.INSTANCES_ALL,
    PermissionKey.INSTANCES_EDIT,
  );

  if (!canControl || !Number.isFinite(instanceId)) return null;

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const run = async (action: 'start' | 'stop' | 'restart') => {
    if (!instance || busy) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'start') await startInstance(instance.id);
      else if (action === 'stop') await stopInstance(instance.id);
      else await restartInstance(instance.id);
      await reload(true);
    } catch (e: any) {
      setError(e?.response?.data || e?.message || `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  const status = instance?.status ?? '';
  const isRunning = status === 'running';
  const isStopped = status === 'stopped' || status === 'destroyed';
  const busyAny = busy !== null || loading;

  // Compact sizing: tiny padding + xs text + small icons => low height/width.
  const btnBase =
    'ks-tab shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs leading-none whitespace-nowrap transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    // Overlay row: sticky so it stays on scroll, negative margins pull it
    // into the main's top-left-most corner (cancelling main p-4/sm:p-6).
    // Zero padding/margin — flush to the very corner. Negative bottom margin
    // lets page content slide UNDER the dock instead of being pushed down.
    <div
      className="sticky top-0 left-0 z-40 flex justify-start pointer-events-none -mt-4 -ml-4 sm:-mt-6 sm:-ml-6 p-0 mb-[-24px]"
      aria-label="Instance power controls"
    >
      <div className="pointer-events-auto flex flex-col items-start p-0 m-0">
        {/* Rectangular box — zero padding/gap, flush. */}
        <div className="ks-card rounded-none p-0 m-0 flex items-center gap-0 w-fit max-w-full">
          {/* Collapsible buttons — slide left + fade when collapsed */}
          <div
            className="flex items-center gap-0 p-0 m-0 overflow-hidden transition-all duration-300 ease-in-out"
            style={
              collapsed
                ? { maxWidth: 0, opacity: 0, transform: 'translateX(-8px)', pointerEvents: 'none' }
                : { maxWidth: 320, opacity: 1, transform: 'translateX(0)' }
            }
            aria-hidden={collapsed}
          >
            <button
              type="button"
              onClick={() => run('start')}
              disabled={collapsed || busyAny || isRunning}
              tabIndex={collapsed ? -1 : undefined}
              title="Start instance"
              className={`${btnBase} text-emerald-300 hover:!bg-emerald-900/30`}
            >
              {busy === 'start' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
              <span>Start</span>
            </button>
            <button
              type="button"
              onClick={() => run('stop')}
              disabled={collapsed || busyAny || isStopped}
              tabIndex={collapsed ? -1 : undefined}
              title="Stop instance"
              className={`${btnBase} text-yellow-300 hover:!bg-yellow-900/30`}
            >
              {busy === 'stop' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              )}
              <span>Stop</span>
            </button>
            <button
              type="button"
              onClick={() => run('restart')}
              disabled={collapsed || busyAny || !isRunning}
              tabIndex={collapsed ? -1 : undefined}
              title="Restart instance"
              className={`${btnBase} text-sky-300 hover:!bg-sky-900/30`}
            >
              {busy === 'restart' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              )}
              <span>Restart</span>
            </button>
          </div>

          {/* Collapse toggle — [<] when open, [>] when collapsed */}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand power controls' : 'Collapse power controls'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Show power buttons' : 'Hide power buttons'}
            className={`${btnBase} !px-1.5 text-gray-200`}
          >
            {collapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            )}
          </button>
        </div>
        {error && (
          <p className="m-0 p-0 text-[11px] leading-tight text-red-300 bg-red-900/20 border border-red-900/30 rounded-none max-w-[220px] truncate" title={error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default InstancePowerBar;
