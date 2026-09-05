import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInstance } from '@/shared/hooks/useInstance';
import { useLiveMetrics } from '../hooks/useLiveMetrics';
import { KindIcon } from './InstanceFormComponents';
import { KIND_META, kindKey } from '../types/instanceForm';

// InstanceInfoRow — read-only instance facts as a menu row (no pill
// chrome). Rendered first in the floating instance menu, in its own box:
// line 1 is the merged status/uptime slot + type badge, line 2 is the
// live RAM / CPU / disk stats.
//
// Merged slot (phone + desktop share the same rule):
//   • running → uptime only, emerald/green (no status label)
//   • any other state → status dot + label only (no uptime)
//
// RAM / CPU / disk are SVG icon + live value only (no word labels); the
// values poll the instance's live metrics endpoint while running and show
// '—' when the instance isn't running or metrics are unavailable.

// Status dot + label — mirrors InstanceCard's STATUS_META so the menu
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

// fmtBytesShort renders bytes compactly for the narrow menu row.
function fmtBytesShort(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(v) : v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

function fmtPctShort(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return `${Number.isInteger(n) ? n : Math.round(n * 10) / 10}%`;
}

const InstanceInfoRow: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const { instance, loading } = useInstance(instanceId);

  const uptime = useUptime(
    instance?.started_at || instance?.updated_at || instance?.created_at,
    instance?.status ?? '',
  );
  const isRunning = instance?.status === 'running';

  // Live resource stats — only polled while running; anything missing
  // renders as '—'. Hooks stay above the early returns so hook order is
  // stable across loading → loaded renders.
  const { latest: metrics } = useLiveMetrics(instanceId, isRunning);

  if (!Number.isFinite(instanceId)) return null;
  if (!instance && !loading) return null;

  const sm = (instance && STATUS_META[instance.status]) ||
    { dot: 'bg-gray-500', label: instance?.status || '—' };
  const k = instance ? kindKey(instance.kind) : 'unknown';
  const typeLabel = (instance && KIND_META[k]?.label) || instance?.kind || '—';
  const typeBadge = (instance && KIND_META[k]?.badge) || '';
  const cpuV = metrics?.cpu ?? null;
  const memUsed = metrics?.memUsed ?? null;
  const memTotal = metrics?.memTotal ?? null;
  const diskUsed = metrics?.diskUsed ?? null;
  const diskTotal = metrics?.diskTotal ?? null;

  return (
    <div className="shrink-0 px-3 pt-2">
      {loading && !instance ? (
        <div className="flex items-center gap-2 animate-pulse" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-3.5 w-14 rounded bg-neutral-800" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-2">
          {/* Line 1: status / uptime + type. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {isRunning ? (
              <span
                className="inline-flex items-center gap-1.5 text-emerald-300 tabular-nums"
                title={`Uptime: ${uptime}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-300" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <span className="text-[13px] font-medium">{uptime}</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 text-gray-200"
                title={`Status: ${sm.label}`}
              >
                <span className="relative flex w-2 h-2">
                  {(sm as any).ping && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
                  <span className={`relative inline-flex rounded-full w-2 h-2 ${sm.dot}`} />
                </span>
                <span className="text-[13px] font-medium">{sm.label}</span>
              </span>
            )}
            <span className="w-px h-4 bg-white/10 shrink-0" aria-hidden="true" />
            <span
              className="inline-flex items-center"
              title={`Type: ${typeLabel}`}
            >
              <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${typeBadge}`}>
                <KindIcon kind={k} className="w-3.5 h-3.5" />
                {typeLabel}
              </span>
            </span>
          </div>
          {/* Line 2: live resource stats — SVG icon + value only, no word labels. */}
          <div className="border-t border-white/5" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className="inline-flex items-center gap-1 text-sky-300"
              title={cpuV !== null ? `CPU (live): ${fmtPctShort(cpuV)}` : 'CPU (live): unavailable'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></svg>
              <span className="text-[11px] tabular-nums text-gray-200">{fmtPctShort(cpuV)}</span>
            </span>
            <span
              className="inline-flex items-center gap-1 text-emerald-300"
              title={memUsed !== null ? `RAM (live): ${fmtBytesShort(memUsed)}${memTotal !== null ? ` / ${fmtBytesShort(memTotal)}` : ''}` : 'RAM (live): unavailable'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><rect x="2" y="8" width="20" height="9" rx="1.5" /><path d="M6 8v3M10 8v3M14 8v3M18 8v3" /></svg>
              <span className="text-[11px] tabular-nums text-gray-200">{fmtBytesShort(memUsed)}</span>
            </span>
            <span
              className="inline-flex items-center gap-1 text-amber-300"
              title={diskUsed !== null ? `Disk (live): ${fmtBytesShort(diskUsed)}${diskTotal !== null ? ` / ${fmtBytesShort(diskTotal)}` : ''}` : 'Disk (live): unavailable'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /></svg>
              <span className="text-[11px] tabular-nums text-gray-200">{fmtBytesShort(diskUsed)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstanceInfoRow;
