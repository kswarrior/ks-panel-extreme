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
  // Transitional states (deploy/install in flight) — no power action is valid,
  // so render no buttons rather than clickable-then-failing ones.
  const isTransitional = status === 'creating' || status === 'installing';
  // State-aware buttons: stopped/errored/etc → Start only;
  // running → Stop + Restart (Start hidden); transitional → none.
  const showStart = !isRunning && !isTransitional;
  const busyAny = busy !== null || loading;

  // NOTE: buttons deliberately do NOT use the `ks-tab` class. The theme
  // system forces ks-tab padding/font/border via `!important`
  // (padding-left/right/top/bottom, font-size), so any Tailwind px/py on a
  // ks-tab never shrinks. Plain buttons + inline-style padding below are
  // immune to the theme and stay truly compact.
  const btnBase =
    'shrink-0 inline-flex items-center whitespace-nowrap transition disabled:opacity-40 disabled:cursor-not-allowed';
  // Inline style beats every non-`!important` stylesheet rule, and no theme
  // rule targets these plain buttons — padding really is 1px/5px now.
  const btnStyle: React.CSSProperties = {
    padding: '0 4px',
    margin: 0,
    gap: 2,
    fontSize: 10,
    lineHeight: '12px',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
  };
  // Collapsed toggle style — ultra-narrow so the shut `>` dock is only a
  // few px wide (tighter padding + smaller chevron than the open state).
  const toggleCollapsedStyle: React.CSSProperties = {
    ...btnStyle,
    padding: '0 1px',
    gap: 0,
  };

  return (
    // Plain left-aligned dock — placement/stickiness comes from the parent
    // (Header renders it in a row below the header bar, left). Zero
    // padding/margin — flush.
    <div className="flex justify-start p-0 m-0" aria-label="Instance power controls">
      <div className="pointer-events-auto flex flex-col items-start p-0 m-0">
        {/* Rectangular box — ks-card kept for the themed glass surface only;
            zero box metrics enforced inline so theme radius/padding can't win. */}
        <div
          className="ks-card flex items-center w-fit max-w-full"
          style={{
            padding: 0,
            margin: 0,
            gap: 0,
            borderRadius: 0,
            // Shut state: hard-cap the whole box at ~25px wide, centered.
            ...(collapsed
              ? { maxWidth: 25, overflow: 'hidden', justifyContent: 'center' as const }
              : {}),
          }}
        >
          {/* Collapsible buttons — slide left + fade when collapsed */}
          <div
            className="flex items-center overflow-hidden transition-all duration-300 ease-in-out"
            style={
              collapsed
                ? { maxWidth: 0, opacity: 0, transform: 'translateX(-8px)', pointerEvents: 'none', padding: 0, margin: 0, gap: 0 }
                : { maxWidth: 220, opacity: 1, transform: 'translateX(0)', padding: 0, margin: 0, gap: 0 }
            }
            aria-hidden={collapsed}
          >
            {showStart && (
            <button
              type="button"
              onClick={() => run('start')}
              disabled={collapsed || busyAny}
              tabIndex={collapsed ? -1 : undefined}
              title="Start instance"
              style={btnStyle}
              className={`${btnBase} text-emerald-300 hover:bg-emerald-900/30`}
            >
              {busy === 'start' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              )}
              <span>Start</span>
            </button>
            )}
            {isRunning && (
            <button
              type="button"
              onClick={() => run('stop')}
              disabled={collapsed || busyAny}
              tabIndex={collapsed ? -1 : undefined}
              title="Stop instance"
              style={btnStyle}
              className={`${btnBase} text-yellow-300 hover:bg-yellow-900/30`}
            >
              {busy === 'stop' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              )}
              <span>Stop</span>
            </button>
            )}
            {isRunning && (
            <button
              type="button"
              onClick={() => run('restart')}
              disabled={collapsed || busyAny}
              tabIndex={collapsed ? -1 : undefined}
              title="Restart instance"
              style={btnStyle}
              className={`${btnBase} text-sky-300 hover:bg-sky-900/30`}
            >
              {busy === 'restart' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              )}
              <span>Restart</span>
            </button>
            )}
          </div>

          {/* Collapse toggle — [<] when open, [>] when collapsed */}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand power controls' : 'Collapse power controls'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Show power buttons' : 'Hide power buttons'}
            style={collapsed ? toggleCollapsedStyle : btnStyle}
            className={`${btnBase} text-gray-200 hover:bg-white/10`}
          >
            {collapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
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
