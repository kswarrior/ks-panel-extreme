import { useEffect, useState } from 'react';
import { getMetrics } from '@/features/instances/api/instanceAdvanced';
import type { MetricsSnapshot } from '@/shared/types/instanceAdvanced';

// num coerces a metrics blob field to a finite non-negative number or null.
export function metricsNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && (n as number) >= 0 ? (n as number) : null;
}

export interface LivePoint {
  t: number;
  cpu: number | null;
  ramPct: number | null;
  diskPct: number | null;
  memUsed: number | null;
  memTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
}

function toPoint(m: MetricsSnapshot): LivePoint {
  const memUsed = metricsNum(m?.mem_used ?? m?.mem);
  const memTotal = metricsNum(m?.mem_total);
  const diskUsed = metricsNum(m?.disk_used ?? m?.disk);
  const diskTotal = metricsNum(m?.disk_total);
  return {
    t: Date.now(),
    cpu: metricsNum(m?.cpu_pct ?? m?.cpu),
    ramPct:
      memUsed !== null && memTotal !== null && memTotal > 0
        ? (memUsed / memTotal) * 100
        : metricsNum(m?.mem_pct),
    diskPct:
      diskUsed !== null && diskTotal !== null && diskTotal > 0
        ? (diskUsed / diskTotal) * 100
        : metricsNum(m?.disk_pct),
    memUsed,
    memTotal,
    diskUsed,
    diskTotal,
  };
}

// useLiveMetrics polls the instance's live metrics endpoint (the same feed
// the Home page tiles read) while `live`, keeping a history ring for
// graphs plus the latest point for tiles.
//
// Failure policy: transient errors keep the last snapshot (reads as '—'
// only when nothing ever arrived). A 403 — the backend's answer when the
// instance exposes no metrics/home page — stops polling until `live`
// flips, instead of hammering a guaranteed denial every few seconds.
export function useLiveMetrics(
  instanceId: number,
  live: boolean,
  opts?: { intervalMs?: number; keep?: number },
): { latest: LivePoint | null; history: LivePoint[] } {
  const intervalMs = opts?.intervalMs ?? 4000;
  const keep = opts?.keep ?? 60;
  const [denied, setDenied] = useState(false);
  const [history, setHistory] = useState<LivePoint[]>([]);

  // A fresh live window (e.g. stopped → running) re-arms after a denial.
  useEffect(() => {
    if (!live) setDenied(false);
  }, [live]);

  useEffect(() => {
    if (!Number.isFinite(instanceId) || !live || denied) {
      if (!live) setHistory([]);
      return;
    }
    let dead = false;
    const poll = async () => {
      try {
        const m = await getMetrics(instanceId);
        if (dead) return;
        const pt = toPoint(m ?? {});
        setHistory((h) => [...h.slice(-(Math.max(1, keep) - 1)), pt]);
      } catch (e: any) {
        if (!dead && e?.response?.status === 403) setDenied(true);
        /* otherwise keep last snapshot */
      }
    };
    void poll();
    const t = window.setInterval(() => {
      void poll();
    }, intervalMs);
    return () => {
      dead = true;
      window.clearInterval(t);
    };
  }, [instanceId, live, denied, intervalMs, keep]);

  return { latest: history.length > 0 ? history[history.length - 1] : null, history };
}
