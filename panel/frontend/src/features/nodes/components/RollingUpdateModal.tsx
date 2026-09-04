import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkNodeUpdate,
  applyNodeUpdate,
  getNodeUpdateInfo,
} from '@/shared/api/admin';
import type { Node } from '@/features/nodes/types/node';
import GlassModal from '@/shared/components/ui/Modal';

interface RollingUpdateModalProps {
  open: boolean;
  onClose: () => void;
  nodes: Node[];
}

type RowPhase =
  | 'pending'
  | 'checking'
  | 'up-to-date'
  | 'applying'
  | 'waiting'
  | 'updated'
  | 'failed'
  | 'skipped';

interface RollingRow {
  node: Node;
  canary: boolean;
  phase: RowPhase;
  detail: string;
  before?: string;
  after?: string;
}

const PHASE_DOT: Record<RowPhase, string> = {
  pending: 'bg-gray-500',
  checking: 'bg-sky-400 animate-pulse',
  'up-to-date': 'bg-sky-400',
  applying: 'bg-amber-400 animate-pulse',
  waiting: 'bg-amber-400 animate-pulse',
  updated: 'bg-emerald-400',
  failed: 'bg-red-400',
  skipped: 'bg-gray-600',
};

const PHASE_LABEL: Record<RowPhase, string> = {
  pending: 'Pending',
  checking: 'Checking…',
  'up-to-date': 'Up to date',
  applying: 'Applying…',
  waiting: 'Waiting healthy…',
  updated: 'Updated',
  failed: 'Failed',
  skipped: 'Skipped',
};

const RollingUpdateModal: React.FC<RollingUpdateModalProps> = ({ open, onClose, nodes }) => {
  const [mode, setMode] = useState<'sequential' | 'canary'>('sequential');
  const [canaryCount, setCanaryCount] = useState(1);
  const [healthTimeoutS, setHealthTimeoutS] = useState(120);
  const [pauseOnFailure, setPauseOnFailure] = useState(true);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<RollingRow[]>([]);
  const [summary, setSummary] = useState('');
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (open) {
      setRunning(false);
      setRows([]);
      setSummary('');
      setStoppedEarly(false);
      cancelRef.current = false;
    } else {
      cancelRef.current = true;
    }
  }, [open ]);

  const setRow = useCallback((id: number, patch: Partial<RollingRow>) => {
    setRows((prev) => prev.map((r) => (r.node.id === id ? { ...r, ...patch } : r)));
  }, []);

  const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

  const waitHealthy = useCallback(async (nodeId: number, before: string, timeoutS: number): Promise<string> => {
    const deadline = Date.now() + timeoutS * 1000;
    for (;;) {
      if (cancelRef.current) throw new Error('cancelled');
      try {
        const fresh = await getNodeUpdateInfo(nodeId);
        const after = fresh?.local?.version?.trim() || '';
        if (after && after !== before) return after;
      } catch {
        // Edge is mid-restart — keep polling until the deadline.
      }
      if (Date.now() >= deadline) throw new Error(`edge did not report a new version within ${timeoutS}s`);
      await sleep(2000);
    }
  }, []);

  const start = useCallback(async () => {
    const ordered = [...nodes].sort((a, b) => a.id - b.id);
    const cc = mode === 'canary' ? Math.max(1, Math.min(canaryCount || 1, ordered.length)) : ordered.length;
    const initial: RollingRow[] = ordered.map((n, i) => ({
      node: n,
      canary: mode === 'canary' && i < cc,
      phase: 'pending' as RowPhase,
      detail: mode === 'canary' && i < cc ? 'canary subset' : 'queued',
    }));
    setRows(initial);
    setSummary('');
    setStoppedEarly(false);
    setRunning(true);
    cancelRef.current = false;

    const counts: Record<string, number> = { updated: 0, up_to_date: 0, failed: 0, skipped: 0 };
    let stopped = false;
    for (const row of initial) {
      if (cancelRef.current) break;
      const id = row.node.id;
      setRow(id, { phase: 'checking', detail: 'fetching remote manifest…' });
      let check;
      try {
        check = await checkNodeUpdate(id);
      } catch (e: any) {
        const msg = typeof e?.response?.data === 'string' && e.response.data.trim()
          ? e.response.data
          : (e?.message || 'update check failed');
        setRow(id, { phase: 'failed', detail: msg });
        counts.failed++;
        if (pauseOnFailure) { stopped = true; break; }
        continue;
      }
      if (cancelRef.current) break;
      if (check.error) {
        setRow(id, { phase: 'failed', detail: check.error });
        counts.failed++;
        if (pauseOnFailure) { stopped = true; break; }
        continue;
      }
      const before = check.local?.version || '';
      if (!check.available) {
        setRow(id, { phase: 'up-to-date', detail: `already on latest (${before || 'unknown'})`, before, after: before });
        counts.up_to_date++;
        continue;
      }
      setRow(id, { phase: 'applying', detail: `downloading ${check.remote?.version || 'latest'}…`, before });
      try {
        await applyNodeUpdate(id);
      } catch (e: any) {
        const msg = typeof e?.response?.data === 'string' && e.response.data.trim()
          ? e.response.data
          : (e?.message || 'update apply failed');
        setRow(id, { phase: 'failed', detail: msg, before });
        counts.failed++;
        if (pauseOnFailure) { stopped = true; break; }
        continue;
      }
      if (cancelRef.current) break;
      setRow(id, { phase: 'waiting', detail: 'edge restarting — polling for new version…', before });
      try {
        const after = await waitHealthy(id, before, Math.min(Math.max(healthTimeoutS || 120, 10), 600));
        setRow(id, { phase: 'updated', detail: `updated ${before} → ${after}`, before, after });
        counts.updated++;
      } catch (e: any) {
        setRow(id, { phase: 'failed', detail: e?.message || 'edge did not become healthy', before });
        counts.failed++;
        if (pauseOnFailure) { stopped = true; break; }
      }
    }

    if (stopped) {
      const skipped = initial.length - counts.updated - counts.up_to_date - counts.failed;
      counts.skipped = skipped;
      setStoppedEarly(true);
      setRows((prev) => prev.map((r) => (r.phase === 'pending'
        ? { ...r, phase: 'skipped' as RowPhase, detail: 'not attempted (stopped on earlier failure)' }
        : r)));
    }
    const modeLabel = mode === 'canary' ? `canary (first ${cc})` : 'sequential';
    setSummary(`Rolling update (${modeLabel}): ${counts.updated} updated, ${counts.up_to_date} up-to-date, ${counts.failed} failed, ${counts.skipped} skipped${stopped ? ' — stopped early on first failure' : ''}`);
    setRunning(false);
  }, [nodes, mode, canaryCount, healthTimeoutS, pauseOnFailure, setRow, waitHealthy]);

  const close = useCallback(() => {
    cancelRef.current = true;
    setRunning(false);
    onClose();
  }, [onClose]);

  return (
    <GlassModal
      open={open}
      onClose={close}
      title="Fleet rolling update"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button onClick={close} className="ks-ghost-btn px-3 py-1.5 rounded text-sm">
            {running ? 'Cancel' : 'Close'}
          </button>
          <button
            onClick={start}
            disabled={running || nodes.length === 0}
            className="ks-primary-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {running ? 'Rolling…' : rows.length > 0 ? 'Run again' : 'Start rolling update'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          Nodes update one at a time in ID order — check → apply → poll edge
          /health until the new version answers. The previous binary stays as{' '}
          <code className="text-gray-300">ksedge.old</code> on every edge. Stopping
          early leaves the remaining nodes untouched.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Mode</span>
            <select
              value={mode}
              disabled={running}
              onChange={(e) => setMode(e.target.value as 'sequential' | 'canary')}
              className="w-full glass-field text-sm"
            >
              <option value="sequential">Sequential</option>
              <option value="canary">Canary</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Canary count</span>
            <input
              type="number"
              min={1}
              max={Math.max(nodes.length, 1)}
              value={canaryCount}
              disabled={running || mode !== 'canary'}
              onChange={(e) => setCanaryCount(Number(e.target.value))}
              className="w-full glass-field text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Health timeout (s)</span>
            <input
              type="number"
              min={10}
              max={600}
              value={healthTimeoutS}
              disabled={running}
              onChange={(e) => setHealthTimeoutS(Number(e.target.value))}
              className="w-full glass-field text-sm"
            />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={pauseOnFailure}
              disabled={running}
              onChange={(e) => setPauseOnFailure(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs text-gray-300">Stop on first failure</span>
          </label>
        </div>

        {rows.length > 0 && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.node.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PHASE_DOT[r.phase]}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">
                    {r.node.name}
                    {r.canary && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300 border border-amber-300/30 rounded px-1">canary</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{r.detail}</div>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{PHASE_LABEL[r.phase]}</span>
              </div>
            ))}
          </div>
        )}

        {summary && (
          <div className={`rounded-lg border p-3 text-sm ${stoppedEarly ? 'border-red-400/30 text-red-200' : 'border-emerald-400/30 text-emerald-200'}`}>
            {summary}
          </div>
        )}

        {nodes.length === 0 && (
          <p className="text-sm text-gray-500">No nodes registered — nothing to roll.</p>
        )}
      </div>
    </GlassModal>
  );
};

export default RollingUpdateModal;
