// Database UI components - extracted from Database.tsx

import React, { useState, useEffect } from 'react';
import type { DatabaseInfo, DatabaseTable, DatabaseEngineInfo, DatabaseEngineSwitchResponse, DatabaseTabId } from '../types/database';
import { formatBytes, formatSigned, ago, autoVacuumLabel, tableTypeLabel, tableTypeBadge, HISTORY_WINDOW } from '../utils/databaseUtils';
import { listDatabaseEngines, switchDatabaseEngine } from '@/shared/api/admin';

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

  return (
    <div className="glass-card rounded-xl p-4 space-y-4">
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
            className="glass w-full text-sm rounded-md text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
          >
            {engines.length === 0 && <option value={engine}>{engine}</option>}
            {engines.map((e) => (
              <option key={e.name} value={e.name} className="bg-neutral-900">{e.label}</option>
            ))}
          </select>
        </div>

        {engines.find((e) => e.name === engine)?.supports_url && (
          <div className="lg:col-span-4 flex items-end">
            <div className="inline-flex rounded-md border border-white/10 overflow-hidden text-xs">
              <button
                onClick={() => setUsingURL(true)}
                className={`px-3 py-1.5 ${usingURL ? 'bg-emerald-700/60 text-white' : 'text-gray-400 hover:bg-white/5'}`}
              >Host : Port</button>
              <button
                onClick={() => setUsingURL(false)}
                className={`px-3 py-1.5 ${!usingURL ? 'bg-emerald-700/60 text-white' : 'text-gray-400 hover:bg-white/5'}`}
              >Full DSN</button>
            </div>
          </div>
        )}
      </div>

      {(!engines.find((e) => e.name === engine)?.supports_url || !usingURL) ? (
        <div className="mt-3">
          <label className="text-[11px] uppercase tracking-wide text-gray-500">
            {engines.find((e) => e.name === engine)?.supports_url ? 'Full DSN' : 'File path'}
            {!engines.find((e) => e.name === engine)?.supports_url && <span className="text-gray-600 ml-1 normal-case">(SQLite — uses default if blank)</span>}
          </label>
          <input
            type="text"
            value={dsn}
            onChange={(e) => setDsn(e.target.value)}
            disabled={submitting}
            placeholder={
              engines.find((e) => e.name === engine)?.supports_url
                ? engine === 'postgres'
                  ? "postgres://user:pass@host:5432/dbname?sslmode=disable"
                  : "kspanel:pass@tcp(host:3306)/kspanel?parseTime=true&loc=UTC"
                : currentPath || "/var/lib/kspanel/kspanel.db"
            }
            className="glass w-full text-sm rounded-md text-white font-mono placeholder-gray-600 focus:outline-none focus:border-white/30 disabled:opacity-50"
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
              placeholder="localhost:5432"
              className="glass w-full text-sm rounded-md text-white font-mono placeholder-gray-600 focus:outline-none focus:border-white/30 disabled:opacity-50"
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
              className="glass w-full text-sm rounded-md text-white placeholder-gray-600 focus:outline-none focus:border-white/30 disabled:opacity-50"
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
                className="glass w-full text-sm rounded-md text-white placeholder-gray-600 focus:outline-none focus:border-white/30 disabled:opacity-50"
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
              className="glass w-full text-sm rounded-md text-white placeholder-gray-600 focus:outline-none focus:border-white/30 disabled:opacity-50"
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-gray-500 max-w-xl">
          The panel tests connectivity against the target engine before persisting.
          {engines.find((e) => e.name === engine)?.supports_url && usingURL && ' Coordinates are stored in '}
          {engines.find((e) => e.name === engine)?.supports_url && usingURL && <code className="font-mono text-gray-400">kspanel.env</code>}
          {engines.find((e) => e.name === engine)?.supports_url && usingURL && ' next to your SQLite file; passwords travel as part of the DSN.'}
        </p>
        <button
          onClick={() => {}} // submit function would go here
          disabled={submitting}
          className="inline-flex items-center gap-2 bg-emerald-700/70 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-md text-sm disabled:opacity-40"
          title="Test the new database connection and persist it"
        >
          {submitting && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 animate-spin">
              <path d="M21 12a9 9 0 1 1-6.22-8.55" strokeLinecap="round" />
             </svg>
          )}
          Test & Save
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
              <div className="font-medium">{result.ok ? 'Database updated' : 'Switch failed'}</div>
              <div className="text-xs opacity-90 mt-0.5 break-words">{result.message}</div>
              {result.ok && (
                <div className="text-xs mt-1 font-mono opacity-80">
                  engine: {result.engine} · dsn: {result.dsn}
                  {result.requires_restart && (
                    <span className="ml-2 text-amber-300">— restart <code>kspanel launch</code> to apply</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
