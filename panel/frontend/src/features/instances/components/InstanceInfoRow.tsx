import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInstance } from '@/shared/hooks/useInstance';
import { KindIcon } from './InstanceFormComponents';
import { KIND_META, kindKey } from '../types/instanceForm';

// InstanceInfoRow — read-only instance facts as a menu row (no pill
// chrome). Rendered in the floating instance menu below the power
// controls, in its own row: merged status/uptime slot + type badge.
//
// Merged slot (phone + desktop share the same rule):
//   • running → uptime only, emerald/green (no status label)
//   • any other state → status dot + label only (no uptime)

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

const InstanceInfoRow: React.FC = () => {
  const { id } = useParams();
  const instanceId = Number(id);
  const { instance, loading } = useInstance(instanceId);

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
  const isRunning = instance?.status === 'running';

  return (
    <div className="shrink-0 px-3 pt-2">
      {loading && !instance ? (
        <div className="flex items-center gap-2 animate-pulse" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-3.5 w-14 rounded bg-neutral-800" />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-2">
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
      )}
    </div>
  );
};

export default InstanceInfoRow;
