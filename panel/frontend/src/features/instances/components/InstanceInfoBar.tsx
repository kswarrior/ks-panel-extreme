import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInstance } from '@/shared/hooks/useInstance';
import { useAutoHidePill } from '@/shared/components/ui/PageActionsPill';
import { KindIcon } from './InstanceFormComponents';
import { KIND_META, kindKey } from '../types/instanceForm';

const INFO_COLLAPSED_KEY = 'ks-instance-info-collapsed';

// Status dot + label — mirrors InstanceCard's STATUS_META so the dock
// agrees with the fleet cards.
const STATUS_META: Record<string, { dot: string; label: string; ping?: boolean }> = {
  running: { dot: 'bg-emerald-400', label: 'Running', ping: true },
  stopped: { dot: 'bg-gray-500', label: 'Stopped' },
  creating: { dot: 'bg-yellow-400 animate-pulse', label: 'Creating' },
  installing: { dot: 'bg-sky-400 animate-pulse', label: 'Installing' },
  errored: { dot: 'bg-red-400', label: 'Errored' },
  install_failed: { dot: 'bg-red-400', label: 'Install failed' },
  destroyed: { dot: 'bg-gray-600', label: 'Destroyed' },
};

// Live uptime since the instance last entered "running" (started_at).
// Same shape as InstanceCard's useUptime: ticks every second while running,
// '—' otherwise (stopped rows, missing/invalid timestamps).
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

// InstanceInfoBar — self-contained right-side info dock for an instance.
//
// Mirrors InstancePowerBar's pattern (own useInstance fetch, localStorage
// collapse) but shows read-only facts instead of controls:
//   • Status — colored dot + label (Running pulses like the fleet cards)
//   • Uptime  — live-ticking since started_at while running, '—' otherwise
//   • Type    — driver badge (docker / kvm / multipass / lxd) with its glyph
//
// Fixed to the top-right edge (below the PageActionsPill slot) and
// auto-dims after 1.5s idle — same behavior as the Cancel/Deploy pill,
// faster delay. Dim-only: never goes invisible, just "off" (low opacity);
// hover restores full brightness.
const InstanceInfoBar: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const { instance, loading } = useInstance(instanceId);
  const { visible, ref, show } = useAutoHidePill(1500);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INFO_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(INFO_COLLAPSED_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const uptime = useUptime(
    instance?.started_at || instance?.updated_at || instance?.created_at,
    instance?.status ?? '',
  );

  if (!Number.isFinite(instanceId)) return null;
  if (!instance && !loading) return null;

  const sm = (instance && STATUS_META[instance.status]) ||
    { dot: 'bg-gray-500', label: instance?.status || '—' };
  const k = instance ? kindKey(instance.kind) : 'unknown';
  const typeLabel = (instance && KIND_META[k]?.label) || instance?.kind || '—';
  const typeBadge = (instance && KIND_META[k]?.badge) || '';

  return (
    <div
      className="fixed right-4 sm:right-6 top-[max(8rem,calc(env(safe-area-inset-top)+3.5rem))] z-40"
      aria-label="Instance info"
      onMouseEnter={show}
    >
      <div
        ref={ref}
        className={`ks-card ks-pill-anim rounded-md shadow-lg shadow-black/40 overflow-hidden transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-40'
        }`}
        style={{ '--ks-card-padding': '8px' } as React.CSSProperties}
      >
        {loading && !instance ? (
          <div className="flex flex-col gap-2 p-1 min-w-[132px] animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="h-2.5 w-10 rounded bg-neutral-800" />
                <div className="h-3.5 w-14 rounded bg-neutral-800" />
              </div>
            ))}
          </div>
        ) : collapsed ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Show instance info"
            aria-expanded={false}
            title="Show instance info"
            className="flex items-center justify-center w-6 h-16 text-gray-300 hover:text-white hover:bg-white/5 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-1 min-w-[132px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">Status</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-200">
                <span className="relative flex w-2 h-2">
                  {sm.ping && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
                  <span className={`relative inline-flex rounded-full w-2 h-2 ${sm.dot}`} />
                </span>
                {sm.label}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">Uptime</span>
              <span className="text-xs text-gray-200 tabular-nums">{uptime}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">Type</span>
              <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${typeBadge}`}>
                <KindIcon kind={k} className="w-3.5 h-3.5" />
                {typeLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={toggle}
              aria-label="Hide instance info"
              aria-expanded={true}
              title="Hide instance info"
              className="mt-0.5 flex items-center justify-center w-full py-0.5 text-gray-500 hover:text-white hover:bg-white/5 rounded transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstanceInfoBar;
