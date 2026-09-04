import React, { useState } from 'react';
import { startInstance, stopInstance, restartInstance } from '@/shared/api/admin';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey, hasPermissionAny } from '@/shared/types/permissions';
import type { Instance } from '@/shared/types/instance';

interface InstancePowerBarProps {
  instance: Instance | null;
  loading?: boolean;
  onChanged?: () => void;
}

const COLLAPSED_KEY = 'ks-instance-power-collapsed';

// InstancePowerBar — small rectangular power dock pinned to the top-left of
// the instance details shell.
//
//   [ Start | Stop | Restart ] [ < ]
//
// Clicking [ < ] slides the three power buttons out to the left so only the
// toggle stays visible (and it flips to [ > ]). Clicking again slides them
// back in. The box reuses the NodeForm phone tab-bar surface
// (ks-card rounded-md p-1.5 flex gap-1) and the wrapper is sticky so the dock
// stays in the top-left while the page scrolls underneath.
const InstancePowerBar: React.FC<InstancePowerBarProps> = ({ instance, loading, onChanged }) => {
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
      onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data || e?.message || `Failed to ${action}`);
    } finally {
      setBusy(null);
    }
  };

  if (!canControl) return null;

  const status = instance?.status ?? '';
  const isRunning = status === 'running';
  const isStopped = status === 'stopped' || status === 'destroyed';
  const busyAny = busy !== null || loading;

  const btnBase =
    'ks-tab shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm whitespace-nowrap transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="sticky top-0 z-30 flex justify-start" aria-label="Instance power controls">
      <div className="flex flex-col items-start gap-1">
        {/* Rectangular box — same surface as the NodeForm phone tab bar:
            ks-card rounded-md p-1.5 flex gap-1 */}
        <div className="ks-card rounded-md p-1.5 flex items-center gap-1 max-w-full">
          {/* Collapsible power buttons — slide left + fade when collapsed */}
          <div
            className="flex items-center gap-1 overflow-hidden transition-all duration-300 ease-in-out"
            style={
              collapsed
                ? { maxWidth: 0, opacity: 0, transform: 'translateX(-12px)', pointerEvents: 'none' }
                : { maxWidth: 480, opacity: 1, transform: 'translateX(0)' }
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
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
            className={`${btnBase} !px-2 text-gray-200`}
          >
            {collapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            )}
          </button>
        </div>
        {error && (
          <p className="text-[11px] text-red-300 bg-red-900/20 border border-red-900/30 rounded px-2 py-1 max-w-[280px] truncate" title={error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default InstancePowerBar;
