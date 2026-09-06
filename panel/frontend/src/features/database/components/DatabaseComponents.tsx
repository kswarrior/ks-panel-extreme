// Database UI components - extracted from Database.tsx

import React, { useState, useEffect } from 'react';
import type { DatabaseEngineInfo, DatabaseEngineSwitchResponse } from '../types/database';
import type { DatabaseTableSyncResult } from '@/shared/api/admin';
import type { DatabaseInfo } from '@/features/system/types/system';
import { formatBytes, formatSigned, tableTypeLabel, tableTypeBadge } from '../utils/databaseUtils';
import { listDatabaseEngines, switchDatabaseEngine, runDatabaseVerify, updateDatabaseVerifyConfig } from '@/shared/api/admin';
import { glassFieldClass } from '@/shared/components/ui/Field';

// MetaRow renders one labelled key+value line
export const MetaRow: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-start justify-between gap-4 py-1.5">
    <span className="text-xs uppercase tracking-wide text-gray-500 shrink-0">{label}</span>
    <span className={`text-sm text-gray-200 text-right break-all min-w-0 ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);

// Stat block
export const StatTile: React.FC<{ value: React.ReactNode; label: string; accent?: string }> = ({ value, label, accent }) => (
  <div className="flex flex-col">
    <div className={`text-2xl font-semibold tabular-nums ${accent || 'text-white'}`}>{value}</div>
    <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
  </div>
);

// DeltaPill is the small +/- chip
export const DeltaPill: React.FC<{ delta: number; mono?: boolean }> = ({ delta, mono }) => {
  if (!delta) return <span className="text-xs text-gray-600">·</span>;
  const cls = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-amber-300' : 'text-gray-500';
  return (
    <span className={`text-xs tabular-nums ${cls} inline-flex items-center ${mono ? 'font-mono' : ''}`}>
      {delta > 0 ? '▲' : '▼'} {formatSigned(delta)}
    </span>
  );
};
export { tableTypeLabel, tableTypeBadge } from '../utils/databaseUtils';

// Meter: a horizontal progress bar
export const Meter: React.FC<{ pct: number; color?: string }> = ({ pct, color }) => {
  const c = color || 'bg-emerald-500/70';
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full ${c}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
};

// Sparkline
export const Sparkline: React.FC<{ values: number[]; color: string }> = ({ values, color }) => {
  const W = 100, H = 24, PAD = 2;
  const max = values.length === 0 ? 1 : Math.max(...values, 1);
  const min = values.length === 0 ? 0 : Math.min(...values);
  const span = Math.max(1, max - min);
  const xstep = (W - PAD * 2) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => {
    const x = PAD + i * xstep;
    const y = PAD + (1 - (v - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-6" preserveAspectRatio="none">
      {d && <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
     </svg>
  );
};
// PragmaTile
export const PragmaTile: React.FC<{ label: string; value: React.ReactNode; mono?: boolean; accent?: string }> = ({ label, value, mono, accent }) => (
  <div className="glass-card rounded-xl">
    <div className={`text-base font-semibold tabular-nums ${accent || 'text-white'} ${mono ? 'font-mono' : ''}`}>{value}</div>
    <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
  </div>
);

// OptionToggle is one labelled checkbox row of the sync-options grid.
const OptionToggle: React.FC<{
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ label, hint, checked, onChange, disabled }) => (
  <label className={`flex items-start gap-2 rounded-md p-2 ${disabled ? 'opacity-40' : 'hover:bg-white/5'} cursor-pointer`}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="mt-0.5 h-3.5 w-3.5 accent-emerald-600"
    />
    <span className="min-w-0">
      <span className="block text-xs text-gray-200">{label}</span>
      <span className="block text-[10px] text-gray-500">{hint}</span>
    </span>
  </label>
);

// SyncResultDetails renders everything the backend reported about the sync
// pipeline: step log, per-table copy results, backup coordinates and the
// post-sync recheck outcome.
const SyncResultDetails: React.FC<{ result: DatabaseEngineSwitchResponse }> = ({ result }) => {
  if (!result.synced && !result.rolled_back && !result.backup_id) return null;
  const warnTables = (result.tables || []).filter((t) => t.status !== 'ok');
  return (
    <div className="mt-2 space-y-2">
      {(result.rows_copied > 0 || result.tables?.length > 0) && (
        <div className="text-xs text-gray-300">
          synced <span className="font-semibold text-emerald-300 tabular-nums">{(result.rows_copied ?? 0).toLocaleString()}</span> rows across{' '}
          <span className="font-semibold text-emerald-300 tabular-nums">{result.tables?.length ?? 0}</span> tables
          {result.duration_ms > 0 && <span className="text-gray-500"> · {(result.duration_ms / 1000).toFixed(1)}s</span>}
          {result.verified && <span className="ml-2 text-emerald-300">✓ recheck passed</span>}
        </div>
      )}

      {result.backup_id && (
        <div className="text-[11px] text-gray-400 font-mono break-all">
          backup: {result.backup_id} · {formatBytes(result.backup_bytes || 0)} · <span className="text-gray-500">{result.backup_path}</span>
        </div>
      )}

      {!!result.verify_warnings?.length && (
        <div className="rounded-md bg-amber-900/20 border border-amber-700/40 p-2 text-[11px] text-amber-200 space-y-0.5">
          {result.verify_warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}
      {warnTables.length > 0 && (
        <div className="rounded-md bg-amber-900/20 border border-amber-700/40 p-2 text-[11px] text-amber-200 space-y-0.5">
          {warnTables.map((t) => (
            <div key={t.table}>
              ⚠ {t.table}: source {t.source_rows} vs target {t.target_rows} rows (panel kept writing during sync)
            </div>
          ))}
        </div>
      )}

      {!!result.tables?.length && (
        <details className="group">
          <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wide text-gray-500 hover:text-gray-300">
            Per-table results ({result.tables.length})
          </summary>
          <div className="mt-1 max-h-48 overflow-auto rounded-md border border-white/10">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-neutral-900/95 text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-2 py-1 font-medium">Table</th>
                  <th className="text-right px-2 py-1 font-medium">Copied</th>
                  <th className="text-right px-2 py-1 font-medium">Target</th>
                  <th className="text-right px-2 py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {result.tables.map((t: DatabaseTableSyncResult) => (
                  <tr key={t.table} className="border-t border-white/5">
                    <td className="px-2 py-1 text-gray-300 truncate max-w-[14rem]" title={t.table}>{t.table}</td>
                    <td className="px-2 py-1 text-right text-gray-400">{t.rows_copied.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-gray-400">{t.target_rows.toLocaleString()}</td>
                    <td className={`px-2 py-1 text-right ${t.status === 'ok' ? 'text-emerald-400' : 'text-amber-300'}`}>
                      {t.status === 'ok' ? 'ok' : 'drift'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {!!result.steps?.length && (
        <details>
          <summary className="cursor-pointer select-none text-[11px] uppercase tracking-wide text-gray-500 hover:text-gray-300">
            Step log ({result.steps.length})
          </summary>
          <pre className="mt-1 max-h-40 overflow-y-auto rounded-md bg-black/30 p-2 text-[10px] leading-relaxed text-gray-400 whitespace-pre-wrap">{result.steps.join('\n')}</pre>
        </details>
      )}
    </div>
  );
};

// ChangeDatabaseCard
export const ChangeDatabaseCard: React.FC<{ currentEngine?: string; currentPath?: string }> = ({ currentEngine, currentPath }) => {
  const [engines, setEngines] = useState<DatabaseEngineInfo[]>([]);
  const [engine, setEngine] = useState<string>(currentEngine || 'sqlite');
  const [usingURL, setUsingURL] = useState(true);
  const [dsn, setDsn] = useState('');
  const [url, setUrl] = useState('localhost:5432');
  const [user, setUser] = useState('kspanel');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('kspanel');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DatabaseEngineSwitchResponse | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // ── Sync pipeline options (all operator-configurable) ──
  const [syncData, setSyncData] = useState(true);
  const [createBackup, setCreateBackup] = useState(true);
  const [verifyAfter, setVerifyAfter] = useState(true);
  const [clearTarget, setClearTarget] = useState(true);
  const [batchSize, setBatchSize] = useState(500);
  const [tablesFilter, setTablesFilter] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await listDatabaseEngines();
        if (mounted) setEngines(list);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const engineMeta = engines.find((e) => e.name === engine);

  // Keep the Host:Port default in step with the selected engine so switching
  // postgres → mysql doesn't silently submit the previous engine's port.
  const defaultPort = engineMeta?.default_port;
  useEffect(() => {
    if (!defaultPort) return;
    setUrl((u) => {
      const i = u.lastIndexOf(':');
      return i > 0 ? `${u.slice(0, i)}:${defaultPort}` : `${u}:${defaultPort}`;
    });
  }, [defaultPort]);

  const submit = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const payload: Parameters<typeof switchDatabaseEngine>[0] = {
        engine,
        sync_data: syncData,
        create_backup: createBackup,
        verify: verifyAfter,
        clear_target: clearTarget,
      };
      if (engineMeta?.supports_url && usingURL) {
        payload.url = url;
        payload.user = user;
        payload.password = password;
        payload.database = database;
      } else if (dsn.trim()) {
        payload.dsn = dsn.trim();
      }
      if (batchSize > 0) payload.batch_size = batchSize;
      const tables = tablesFilter.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      if (tables.length > 0) payload.tables = tables;
      const resp = await switchDatabaseEngine(payload);
      setResult(resp);
    } catch (e: any) {
      const msg =
        typeof e?.response?.data === 'string'
          ? e.response.data
          : e?.response?.data?.message || e?.message || 'Request failed';
      setResult({
        ok: false,
        engine,
        dsn: '',
        message: msg,
        requires_restart: false,
        synced: false,
        rows_copied: 0,
        tables: [],
        steps: [],
        duration_ms: 0,
        rolled_back: false,
        verified: false,
        verify_issues: [],
        verify_warnings: [],
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-card ks-form-card rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-300">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" />
             </svg>
            Change Database
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Switch the panel's backing engine. Takes effect on the next <code className="font-mono text-gray-300">kspanel launch</code> — the running panel keeps its current pool.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          current: <span className="font-mono text-gray-300 capitalize">{currentEngine || 'sqlite'}</span>
          {currentPath && <span className="font-mono text-gray-500 ml-2 truncate max-w-[12rem] inline-block align-bottom" title={currentPath}>{currentPath}</span>}
        </div>
      </div>

      <div className="ks-card-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="text-[11px] uppercase tracking-wide text-gray-500">Engine</label>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
            disabled={submitting || engines.length === 0}
            className={glassFieldClass + ' disabled:opacity-50'}
          >
            {engines.length === 0 && <option value={engine}>{engine}</option>}
            {engines.map((e) => (
              <option key={e.name} value={e.name} className="bg-neutral-900">{e.label}</option>
            ))}
          </select>
        </div>

        {engineMeta?.supports_url && (
          <div className="lg:col-span-4 flex items-end">
            <div className="inline-flex rounded-md border border-white/10 overflow-hidden text-xs">
              <button
                onClick={() => setUsingURL(true)}
                disabled={submitting}
                className={`px-3 py-1.5 ${usingURL ? 'bg-emerald-700/60 text-white' : 'text-gray-400 hover:bg-white/5'}`}
              >Host : Port</button>
              <button
                onClick={() => setUsingURL(false)}
                disabled={submitting}
                className={`px-3 py-1.5 ${!usingURL ? 'bg-emerald-700/60 text-white' : 'text-gray-400 hover:bg-white/5'}`}
              >Full DSN</button>
            </div>
          </div>
        )}
      </div>

      {(!engineMeta?.supports_url || !usingURL) ? (
        <div className="mt-3">
          <label className="text-[11px] uppercase tracking-wide text-gray-500">
            {engineMeta?.supports_url ? 'Full DSN' : 'File path'}
            {!engineMeta?.supports_url && <span className="text-gray-600 ml-1 normal-case">(SQLite — uses default if blank)</span>}
          </label>
          <input
            type="text"
            value={dsn}
            onChange={(e) => setDsn(e.target.value)}
            disabled={submitting}
            placeholder={
              engineMeta?.supports_url
                ? engine === 'postgres'
                  ? "postgres://user:pass@host:5432/dbname?sslmode=disable"
                  : "kspanel:pass@tcp(host:3306)/kspanel?parseTime=true&loc=UTC"
                : currentPath || "/var/lib/kspanel/kspanel.db"
            }
            className={glassFieldClass + ' font-mono disabled:opacity-50'}
          />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500">Host : Port</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={submitting}
              placeholder={engine === 'mysql' ? 'localhost:3306' : 'localhost:5432'}
              className={glassFieldClass + ' font-mono disabled:opacity-50'}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500">User</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              disabled={submitting}
              placeholder="kspanel"
              className={glassFieldClass + ' disabled:opacity-50'}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500">Password</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                placeholder="••••••••"
                className={glassFieldClass + ' disabled:opacity-50'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                title={showPassword ? 'Hide' : 'Show'}
              >{showPassword ? '👁' : '🕶'}</button>
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500">Database</label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              disabled={submitting}
              placeholder="kspanel"
              className={glassFieldClass + ' disabled:opacity-50'}
            />
          </div>
        </div>
      )}

      {/* ── Sync & safety options ─────────────────────────────────────── */}
      <div className={`ks-card rounded-lg p-3 space-y-2 ${submitting ? 'opacity-70 pointer-events-none' : ''}`}>
        <div className="text-[11px] uppercase tracking-wide text-gray-500">Sync &amp; Safety Options</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          <OptionToggle
            label="Sync all data into the new database"
            hint="Copy every table's rows before switching (otherwise the new DB starts empty)"
            checked={syncData}
            onChange={setSyncData}
            disabled={submitting}
          />
          <OptionToggle
            label="Backup before switching"
            hint="Snapshot the current database first — restorable from this page"
            checked={createBackup}
            onChange={setCreateBackup}
            disabled={submitting || !syncData}
          />
          <OptionToggle
            label="Recheck everything after sync"
            hint="Compare row counts per table and run integrity checks on the target"
            checked={verifyAfter}
            onChange={setVerifyAfter}
            disabled={submitting || !syncData}
          />
          <OptionToggle
            label="Clear target tables before copying"
            hint="Avoids primary-key collisions with freshly seeded rows (recommended)"
            checked={clearTarget}
            onChange={setClearTarget}
            disabled={submitting || !syncData}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500">Insert batch size</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={submitting || !syncData}
              className={glassFieldClass + ' font-mono disabled:opacity-50'}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-gray-500">
              Tables <span className="text-gray-600 normal-case">(comma-separated — blank = all)</span>
            </label>
            <input
              type="text"
              value={tablesFilter}
              onChange={(e) => setTablesFilter(e.target.value)}
              disabled={submitting || !syncData}
              placeholder="users, roles, instances"
              className={glassFieldClass + ' font-mono disabled:opacity-50'}
            />
          </div>
        </div>
        {syncData && (
          <p className="text-[10px] text-gray-500">
            On any error the new database is restored to its previous state and your current setup stays active.
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-gray-500 max-w-xl">
          The panel tests connectivity against the target engine before persisting.
          {engineMeta?.supports_url && usingURL && ' Coordinates are stored in '}
          {engineMeta?.supports_url && usingURL && <code className="font-mono text-gray-400">kspanel.env</code>}
          {engineMeta?.supports_url && usingURL && ' next to your SQLite file; passwords travel as part of the DSN.'}
        </p>
        <button
          onClick={submit}
          disabled={submitting}
          className="ks-primary-btn inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm disabled:opacity-40"
          title="Test the new database connection, optionally sync all data, then persist it"
        >
          {submitting && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 animate-spin">
              <path d="M21 12a9 9 0 1 1-6.22-8.55" strokeLinecap="round" />
             </svg>
          )}
          {syncData ? 'Test, Sync & Save' : 'Test & Save'}
        </button>
      </div>

      {result && (
        <div
          className={`mt-3 rounded-md p-3 text-sm border ${
            result.ok
              ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-200'
              : 'bg-red-900/20 border-red-700/40 text-red-200'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {result.ok ? '✓' : '✕'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {result.ok
                  ? result.synced ? 'Database switched & data synced' : 'Database updated'
                  : result.rolled_back ? 'Switch failed — restored' : 'Switch failed'}
              </div>
              <div className="text-xs opacity-90 mt-0.5 break-words">{result.message}</div>
              {result.ok && (
                <div className="text-xs mt-1 font-mono opacity-80">
                  engine: {result.engine} · dsn: {result.dsn}
                  {result.requires_restart && (
                    <span className="ml-2 text-amber-300">— restart <code>kspanel launch</code> to apply</span>
                  )}
                </div>
              )}
              <SyncResultDetails result={result} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// VerifyStatusCard surfaces the scheduled integrity verification: last-run
// outcome (PRAGMA quick_check on SQLite + probe + table-count sanity on all
// engines; failures audit-log + notify admins) with a Run-now button and an
// editable daily cron (default "0 3 * * *"). The parent reloads DatabaseInfo
// after each mutation via onRefresh so the overview badges stay in sync.
export const VerifyStatusCard: React.FC<{ info: DatabaseInfo; onRefresh: () => void }> = ({ info, onRefresh }) => {
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cron, setCron] = useState(info.verify_cron || '0 3 * * *');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (info.verify_cron) setCron(info.verify_cron);
  }, [info.verify_cron]);

  const lastOk = info.verify_last_ok;
  const dot = lastOk === undefined ? 'bg-gray-500' : lastOk ? 'bg-emerald-400' : 'bg-red-400';
  const label = lastOk === undefined ? 'never verified' : lastOk ? 'healthy' : 'failed';

  const runNow = async () => {
    setRunning(true);
    setMsg(null);
    try {
      const r = await runDatabaseVerify();
      setMsg({
        tone: r.ok ? 'ok' : 'err',
        text: r.ok
          ? `Verified ${r.table_count} tables in ${r.duration_ms}ms — healthy.`
          : `Verification failed: ${(r.issues || []).join('; ') || 'unknown error'}`,
      });
      onRefresh();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Verify failed' });
    } finally {
      setRunning(false);
    }
  };

  const saveCron = async () => {
    const c = cron.trim();
    if (!c) { setMsg({ tone: 'err', text: 'Cron is required (5-field, e.g. "0 3 * * *").' }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const r = await updateDatabaseVerifyConfig(c);
      setMsg({ tone: 'ok', text: `Schedule saved (${r.cron}, next ${r.next_run_at}).` });
      onRefresh();
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.response?.data || e?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const issues = info.verify_last_issues || [];
  const warnings = info.verify_last_warnings || [];

  return (
    <div className="glass-card ks-form-card rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <h3 className="text-sm font-semibold text-white">Integrity verification</h3>
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-gray-500 ml-auto font-mono">
          {info.verify_cron ? `cron ${info.verify_cron}` : 'cron 0 3 * * *'}
          {info.verify_next_run ? ` · next ${new Date(info.verify_next_run).toLocaleString()}` : ''}
        </span>
        <button
          onClick={runNow}
          disabled={running}
          className="ks-primary-btn px-3 py-1.5 rounded-md text-xs disabled:opacity-40"
          title="Run verification now (GET /api/database/verify)"
        >
          {running ? 'Verifying…' : 'Run now'}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Daily sweep runs <code className="font-mono text-gray-300">PRAGMA quick_check</code> (SQLite) + connection probe + table-count sanity (all engines).
        Failures write <code className="font-mono text-gray-300">activity_logs</code> + notify admins.
        {info.verify_last_at && (
          <span className="text-gray-500"> Last run {new Date(info.verify_last_at).toLocaleString()} · {info.verify_table_count ?? 0} tables · {info.verify_duration_ms ?? 0}ms.</span>
        )}
      </p>
      {msg && (
        <div className={`rounded-md p-2 text-xs border ${msg.tone === 'ok' ? 'bg-emerald-900/20 border-emerald-700/40 text-emerald-200' : 'bg-red-900/20 border-red-700/40 text-red-200'}`}>
          {msg.text}
        </div>
      )}
      {!!issues.length && (
        <div className="rounded-md bg-red-900/20 border border-red-700/40 p-2 text-[11px] text-red-200 space-y-0.5">
          {issues.map((w, i) => <div key={i}>✕ {w}</div>)}
        </div>
      )}
      {!!warnings.length && (
        <div className="rounded-md bg-amber-900/20 border border-amber-700/40 p-2 text-[11px] text-amber-200 space-y-0.5">
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1 border-t border-white/10">
        <span className="text-xs text-gray-400">Schedule (5-field cron):</span>
        <input
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="0 3 * * *"
          disabled={saving}
          className={glassFieldClass + ' font-mono text-sm flex-1 min-w-[10rem] disabled:opacity-50'}
        />
        <button onClick={saveCron} disabled={saving} className="px-3 py-1.5 rounded-md text-xs border border-white/10 hover:bg-white/5 disabled:opacity-40">
          Save
        </button>
      </div>
    </div>
  );
};
