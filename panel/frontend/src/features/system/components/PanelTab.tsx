import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  checkUpdate,
  applyUpdate,
  reinstallBackground,
} from '@/shared/api/admin';
import type {
  SystemSnapshot,
  UpdateInfoResponse,
  UpdateCheckResponse,
  UpdateApplyResponse,
  ReinstallBackgroundResponse,
  SeriesSample,
} from '@/features/system/types/system';
import GlassModal from '@/shared/components/ui/Modal';
import UpdateWindowsCard from './UpdateWindowsCard';
import { Donut, Gauge, fmtPct, fmtMB, fmtUptime, fmtGB } from './SystemCharts';
import { AreaChart, type MetricSample } from '@/shared/components/ui/MetricsChart';

interface PanelTabProps {
  snap: SystemSnapshot | null;
  info: UpdateInfoResponse | null;
  infoErr: string;
  infoLoading: boolean;
  reload: () => Promise<UpdateInfoResponse>;
}

const PanelTab: React.FC<PanelTabProps> = ({ snap, info, infoErr, infoLoading, reload }) => {
  const [check, setCheck] = useState<UpdateCheckResponse | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkErr, setCheckErr] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyResult, setApplyResult] = useState<UpdateApplyResponse | null>(null);
  const [applyErr, setApplyErr] = useState('');
  const [applyBusy, setApplyBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartSeconds, setRestartSeconds] = useState(0);
  const [reinstallConfirmOpen, setReinstallConfirmOpen] = useState(false);
  const [reinstallBackgroundBusy, setReinstallBackgroundBusy] = useState(false);
  const [reinstallBackgroundErr, setReinstallBackgroundErr] = useState('');
  const [reinstallBackgroundResult, setReinstallBackgroundResult] = useState<ReinstallBackgroundResponse | null>(null);

  const doCheck = useCallback(async () => {
    setCheckLoading(true);
    setCheckErr('');
    try {
      const r = await checkUpdate();
      setCheck(r);
    } catch (e: any) {
      setCheckErr(e?.response?.data || e?.message || 'Update check failed');
    } finally {
      setCheckLoading(false);
    }
  }, []);

  const doApply = useCallback(async () => {
    setConfirmOpen(false);
    setApplyBusy(true);
    setApplyErr('');
    try {
      const r = await applyUpdate();
      setApplyResult(r);
      setRestarting(true);
      const startedAt = Date.now();
      const tick = window.setInterval(() => {
        setRestartSeconds(Math.round((Date.now() - startedAt) / 1000));
      }, 1000);
      const prevVersion = info?.local?.version;
      let attempts = 0;
      let sawDown = false;
      const poll = window.setInterval(async () => {
        attempts++;
        try {
          const fresh = await reload();
          if (fresh?.local?.version && prevVersion && fresh.local.version !== prevVersion) {
            window.clearInterval(poll);
            window.clearInterval(tick);
            window.location.reload();
          }
          if (fresh?.local?.version && sawDown) {
            window.clearInterval(poll);
            window.clearInterval(tick);
            window.location.reload();
          }
          if (attempts >= 240) {
            window.clearInterval(poll);
          }
        } catch {
          sawDown = true;
        }
      }, 2000);
    } catch (e: any) {
      setApplyErr(e?.response?.data || e?.message || 'Update apply failed');
    } finally {
      setApplyBusy(false);
    }
  }, [info, reload]);

  const doReinstallBackground = useCallback(async () => {
    setReinstallConfirmOpen(false);
    setReinstallBackgroundBusy(true);
    setReinstallBackgroundErr('');
    setReinstallBackgroundResult(null);
    try {
      const r = await reinstallBackground();
      setReinstallBackgroundResult(r);
      setRestarting(true);
      const startedAt = Date.now();
      const tick = window.setInterval(() => {
        setRestartSeconds(Math.round((Date.now() - startedAt) / 1000));
      }, 1000);
      const prevVersion = info?.local?.version;
      let attempts = 0;
      let sawDown = false;
      const poll = window.setInterval(async () => {
        attempts++;
        try {
          const fresh = await reload();
          if (fresh?.local?.version && prevVersion && fresh.local.version !== prevVersion) {
            window.clearInterval(poll);
            window.clearInterval(tick);
            window.location.reload();
          }
          if (fresh?.local?.version && sawDown) {
            window.clearInterval(poll);
            window.clearInterval(tick);
            window.location.reload();
          }
          if (attempts >= 240) {
            window.clearInterval(poll);
          }
        } catch {
          sawDown = true;
        }
      }, 2000);
    } catch (e: any) {
      setReinstallBackgroundErr(e?.response?.data || e?.message || 'Background reinstall failed');
    } finally {
      setReinstallBackgroundBusy(false);
    }
  }, [info, reload]);

  if (infoLoading && !info) {
    return (
      <div className="space-y-3">
        <div className="glass-card rounded-xl animate-pulse h-24" />
        <div className="glass-card rounded-xl animate-pulse h-32" />
      </div>
    );
  }

  if (infoErr && !info) {
    return <p className="text-red-400 text-sm">{infoErr}</p>;
  }
  if (!info) {
    return (
      <div className="space-y-3">
        <div className="glass-card rounded-xl animate-pulse h-24" />
        <div className="glass-card rounded-xl animate-pulse h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Restarting overlay */}
      {restarting && (
        <div className="glass-card rounded-xl border border-amber-300/30">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-300 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">Panel is restarting…</div>
              <div className="text-xs text-gray-400">
                The new binary is launching in the background. This page will reload automatically
                once it answers ({restartSeconds}s elapsed).
             </div>
           </div>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-xs rounded border border-white/10 text-gray-200 hover:bg-white/10"
            >
              Reload now
            </button>
          </div>
        </div>
      )}

      {/* Panel Information */}
      <div className="mb-2">
        <div className="text-lg font-semibold text-white">Panel Information</div>
        <div className="text-[10px] text-gray-500 font-mono break-all">binary {info.binary_path || '—'}</div>
      </div>

      {/* Stats cards */}
      <div className="ks-card-grid grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ks-stat-card rounded-xl flex flex-col gap-2 p-4 animate-slide-up">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Uptime</div>
          <div className="text-2xl font-semibold text-white tabular-nums">{fmtUptime(snap?.local?.process_uptime || 0)}</div>
        </div>
        <div className="ks-stat-card rounded-xl flex flex-col gap-2 p-4 animate-slide-up">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Version</div>
          <div className="text-2xl font-semibold text-white tabular-nums break-all">{info.local.version || '—'}</div>
        </div>
        <div className="ks-stat-card rounded-xl flex flex-col gap-2 p-4 animate-slide-up">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">PID</div>
          <div className="text-2xl font-semibold text-white tabular-nums break-all">{snap?.local?.pid || '—'}</div>
        </div>
        <div className="ks-stat-card rounded-xl flex flex-col gap-2 p-4 animate-slide-up">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Go Version</div>
          <div className="text-2xl font-semibold text-white tabular-nums">{snap?.local?.go_version || '—'}</div>
        </div>
      </div>

      {/* Panel resource usage */}
      {snap?.series?.samples && snap.series.samples.length > 0 && (
        <div className="ks-card-grid grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
          <div className="glass-card rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-white">Panel CPU</h3>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">{snap?.local?.panel_cpu_percent != null ? `${snap.local.panel_cpu_percent.toFixed(1)}%` : '—'}</span>
            </div>
            <AreaChart
              samples={snap.series.samples.map(s => ({ t: s.unix_sec * 1000, v: s.panel_cpu_percent } as MetricSample))}
              max={100}
              color="#7dd3fc"
              unit="%"
              label=""
              threshold={80}
              heightClass="h-48"
            />
            <div className="mt-2 text-[10px] text-gray-500 font-mono">{snap?.local?.panel_cpu_percent != null ? `${snap.local.panel_cpu_percent.toFixed(1)}%` : '—'}</div>
          </div>
          <div className="glass-card rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-white">Panel Memory</h3>
                <p className="text-[11px] text-gray-500">Warning at 85% · danger at 95%</p>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">{snap?.local?.panel_ram_used_mb ? fmtMB(snap.local.panel_ram_used_mb) : '—'}</span>
            </div>
            <AreaChart
              samples={snap.series.samples.map(s => ({ t: s.unix_sec * 1000, v: s.panel_ram_used_pct } as MetricSample))}
              max={100}
              color="#6ee7b7"
              unit="%"
              label=""
              threshold={85}
              heightClass="h-48"
            />
            <div className="mt-2 text-[10px] text-gray-500 font-mono">{snap?.local?.panel_ram_used_mb ? fmtMB(snap.local.panel_ram_used_mb) : '—'}</div>
          </div>
        </div>
      )}

      {/* Platform and Commit */}
      <div className="space-y-1">
        <div className="text-sm text-gray-300">Platform: {snap?.local?.platform || '—'} / {snap?.local?.arch || '—'}</div>
        <div className="text-sm text-gray-300 font-mono">Commit: {info.local.commit || '—'}</div>
        <div className="text-sm text-gray-300 font-mono">Build Date: {info.local.build_date || '—'}</div>
      </div>

      {/* Update Channel */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-1 h-5 rounded bg-sky-400" />
            Update Channel
          </h3>
          <button
            onClick={doCheck}
            disabled={checkLoading || restarting}
            aria-label="Check for updates"
            className="ks-icon-btn inline-flex items-center justify-center w-9 h-9 rounded border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 ${checkLoading ? 'animate-spin' : ''}`}>
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
        <div className="text-[10px] text-gray-500 font-mono break-all">{info.version_url}</div>

        <div className="flex items-center gap-2 mb-2">
          {check?.checked_at && (
            <span className="text-xs text-gray-500">last checked {new Date(check.checked_at).toLocaleString()}</span>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setReinstallConfirmOpen(true)}
            disabled={reinstallBackgroundBusy || restarting}
            className="ks-primary-btn inline-flex items-center gap-2 px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M13 2L3 14h9l-1 8 10-12-10-12z" />
            </svg>
            Reinstall
          </button>
        </div>

        {checkErr && <p className="text-red-400 text-sm mb-3">{checkErr}</p>}

        {check && !check.error && (
          <div className={`ks-card ks-form-card rounded-lg ${check.available ? 'border-emerald-400/30' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2.5 h-2.5 rounded-full ${check.available ? 'bg-emerald-400' : 'bg-sky-400'}`} />
              <span className="text-sm font-medium text-white">
                {check.available ? 'Update available' : 'You are on the latest version'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Installed</div>
                <div className="text-white font-mono">{check.local.version}</div>
                {check.local.commit && <div className="text-[11px] text-gray-500 font-mono">{check.local.commit}</div>}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Latest</div>
                <div className="text-white font-mono">{check.remote.version || '—'}</div>
                {check.remote.commit && <div className="text-[11px] text-gray-500 font-mono">{check.remote.commit}</div>}
              </div>
            </div>
            {check.remote.notes && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Release notes</div>
                <pre className="text-xs text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
                  {check.remote.notes}
                </pre>
              </div>
            )}
            <div className="mt-3 text-[11px] font-mono">
              {check.remote.sha256 ? (
                <span className="text-emerald-300">
                  SHA-256 published ({check.remote.sha256.slice(0, 12)}…) — download verified before install
                </span>
              ) : (
                <span className="text-amber-300">
                  No checksum published — install will proceed unverified
                </span>
              )}
            </div>
            {check.available && (
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={applyBusy || restarting}
                  className="ks-primary-btn inline-flex items-center gap-2 px-4 py-2 rounded text-sm disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {applyBusy ? 'Starting…' : 'Download and install'}
                </button>
                <span className="text-[11px] text-gray-500">
                  Current binary is backed up to <code className="text-gray-300">{info.binary_path}.old</code> for rollback.
                </span>
              </div>
            )}
          </div>
        )}

        {check?.error && (
          <div className="ks-card ks-form-card rounded-lg border-amber-400/30">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-sm font-medium text-white">Could not reach update server</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{check.error}</p>
          </div>
        )}

        {applyErr && (
          <p className="text-red-400 text-sm mt-3">{applyErr}</p>
        )}
        {applyResult && !restarting && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
            <pre className="text-[11px] text-gray-300 whitespace-pre-wrap font-mono">{applyResult.log}</pre>
          </div>
        )}
      </section>

      {/* Scheduled panel updates — cron + maintenance-window guard */}
      <UpdateWindowsCard
        target="panel"
        title="Update Schedules"
        description="Cron schedules that self-update the panel binary inside a daily maintenance window (UTC). Outside the window the run is skipped and logged — never executed."
      />

      {/* Confirmation modal — Apply update */}
      <GlassModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Apply panel update?"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              onClick={() => setConfirmOpen(false)}
              className="ks-ghost-btn px-3 py-1.5 rounded text-sm"
            >
              Cancel
            </button>
            <button
              onClick={doApply}
              className="ks-primary-btn px-3 py-1.5 rounded text-sm"
            >
              Apply update
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-200">
          The panel will download{' '}
          <code className="text-gray-300">{check?.remote.version || 'the latest'}</code>,
          swap the running binary at{' '}
          <code className="text-gray-300 break-all">{info?.binary_path}</code>,
          and restart itself. The web UI will reload once the new build answers.
        </p>
        <ul className="mt-3 text-xs text-gray-400 space-y-1.5 list-disc list-inside">
          <li>The previous binary is kept as <code className="text-gray-300">kspanel.old</code> for rollback</li>
          <li>The download + swap typically takes a few seconds, then the panel reboots</li>
          <li>Any open SSH / process connections to running instances stay up; only the panel process restarts</li>
        </ul>
      </GlassModal>

      {/* Reinstall confirmation modal */}
      <GlassModal
        open={reinstallConfirmOpen}
        onClose={() => {
          if (!reinstallBackgroundBusy) {
            setReinstallConfirmOpen(false);
            setReinstallBackgroundErr('');
            setReinstallBackgroundResult(null);
          }
        }}
        title="Reinstall panel binary?"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              onClick={() => {
                if (reinstallBackgroundBusy) return;
                setReinstallConfirmOpen(false);
                setReinstallBackgroundErr('');
                setReinstallBackgroundResult(null);
              }}
              className="ks-ghost-btn px-3 py-1.5 rounded text-sm"
            >
              Cancel
            </button>
            <button
              onClick={doReinstallBackground}
              disabled={reinstallBackgroundBusy || restarting}
              className="ks-primary-btn px-3 py-1.5 rounded text-sm disabled:opacity-50"
            >
              {reinstallBackgroundBusy ? 'Starting…' : 'Reinstall'}
            </button>
          </>
        }
      >
        <div className="ks-card ks-form-card rounded-lg border-blue-400/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-sm font-medium text-white">Background reinstall</span>
          </div>
          <p className="text-xs text-gray-300">
            Stops the panel, downloads the new binary, starts it on the same port, and rolls back on failure.
          </p>
          {reinstallBackgroundErr && (
            <p className="text-red-400 text-sm mt-3">{reinstallBackgroundErr}</p>
          )}
          {reinstallBackgroundResult && (
            <p className="text-green-400 text-sm mt-3">Script: <code className="text-gray-200">{reinstallBackgroundResult.script_path}</code></p>
          )}
        </div>
      </GlassModal>
    </div>
  );
};

export default PanelTab;