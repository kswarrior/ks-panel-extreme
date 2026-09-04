// Database page - main component

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  databaseInfo,
  listDatabaseEngines,
  switchDatabaseEngine,
} from '@/shared/api/admin';
import type { DatabaseEngineInfo, DatabaseEngineSwitchResponse } from '@/shared/api/admin';
import type { DatabaseInfo, DatabaseTable } from '@/features/system/types/system';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import { MetaRow, StatTile, DeltaPill, Meter, Sparkline, PragmaTile, ChangeDatabaseCard, VerifyStatusCard } from '../components/DatabaseComponents';
import DatabaseBackupTab from '../components/DatabaseBackupTab';
import type { DatabaseTabId } from '../types/database';
import { DATABASE_TABS } from '../types/database';
// HISTORY_WINDOW / REFRESH_MS live once in utils — types/database.ts must not
// re-declare them (a duplicated copy drifted here before).
import { HISTORY_WINDOW, REFRESH_MS } from '../utils/databaseUtils';
import { formatBytes, ago } from '../utils/databaseUtils';

const DatabasePage: React.FC = () => {
  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [live, setLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsSince, setSecondsSince] = useState(0);
  const [tab, setTab] = useState<DatabaseTabId>('overview');
  const inFlight = useRef(false);
  const history = useRef<Record<string, number[]>>({});

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await databaseInfo();
      setInfo(r);
      for (const t of r.tables) {
        const arr = history.current[t.name] || [];
        arr.push(t.size_bytes);
        if (arr.length > HISTORY_WINDOW) arr.shift();
        history.current[t.name] = arr;
      }
      setLastUpdated(new Date());
      setSecondsSince(0);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load database info');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!live || tab !== 'overview') return;
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load, live, tab]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (lastUpdated) setSecondsSince(Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [lastUpdated]);

  const filteredTables: DatabaseTable[] =
    info?.tables?.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())) || [];

  const hasSizes = !!info && info.tables.some((t) => t.size_bytes > 0);

  const maxSize = useMemo(
    () => Math.max(1, ...(info?.tables?.map((t) => t.size_bytes) || [1])),
    [info],
  );

  const writing = !!info && (info.size_delta !== 0 || info.row_delta_since_last !== 0 || info.wal_delta !== 0);

  const totals = useMemo(() => {
    if (!info) return { rows: 0, tableBytes: 0, indexBytes: 0 };
    return info.tables.reduce(
      (acc, t) => {
        acc.rows += t.row_count;
        acc.tableBytes += t.size_bytes;
        acc.indexBytes += t.index_bytes;
        return acc;
      },
      { rows: 0, tableBytes: 0, indexBytes: 0 },
    );
  }, [info]);

  return (
    <div>
      {error && <p className="text-red-400 mb-3 text-sm">{error}</p>}

      {loading && !info && <SkeletonGrid count={4} />}

      {info && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-xl font-semibold text-white shrink-0">Database</h2>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
              {DATABASE_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`ks-tab shrink-0 transition-colors ${tab === t.id ? 'ks-tab-active' : ''}`}
                >
                  {t.label}
                </button>
              ))}
              {tab === 'backup' && (
                <>
                  <div className="w-px h-6 bg-white/10 mx-1 shrink-0" />
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('backup:create'))}
                    className="ks-btn-header ks-icon-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white shrink-0"
                    title="Create a new backup"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('backup:upload'))}
                    className="ks-btn-header ks-icon-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white shrink-0"
                    title="Upload a backup"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    Upload
                  </button>
                </>
              )}
            </div>
          </div>

          {tab === 'overview' && !info.engine_not_supported && (
          <>
          <div className="mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-xl font-semibold text-white capitalize">{info.engine}</div>
              {writing && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-900/30 border border-emerald-700/40 text-emerald-200">writing</span>}
              <label className="ml-auto text-xs text-gray-400 flex items-center gap-1.5">
                <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
                live ({ago(secondsSince || 0)})
              </label>
            </div>
            <div className="text-xs text-gray-400 font-mono">v{info.version || '—'}</div>
            <div className="text-xs text-gray-500 font-mono truncate mt-1" title={info.path}>{info.path}</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">On Disk</div>
              <div className="text-xl font-semibold text-white tabular-nums">{formatBytes(info.size_bytes)}</div>
              <div className="text-[11px] text-gray-500"><DeltaPill delta={info.size_delta} mono /></div>
            </div>
            <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">WAL</div>
              <div className={`text-xl font-semibold tabular-nums ${info.wal_bytes > 0 ? 'text-amber-300' : 'text-gray-400'}`}>{formatBytes(info.wal_bytes)}</div>
            </div>
            <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Tables</div>
              <div className="text-xl font-semibold text-white tabular-nums">{info.tables.length}</div>
            </div>
            <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Total Rows</div>
              <div className="text-xl font-semibold text-white tabular-nums">{totals.rows.toLocaleString()}</div>
              <div className="text-[11px] text-gray-500"><DeltaPill delta={info.row_delta_since_last} mono /></div>
            </div>
            <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Table Storage</div>
              <div className="text-xl font-semibold text-emerald-300 tabular-nums">{formatBytes(totals.tableBytes)}</div>
            </div>
            <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Index Storage</div>
              <div className="text-xl font-semibold text-sky-300 tabular-nums">{formatBytes(totals.indexBytes)}</div>
            </div>
          </div>

          <VerifyStatusCard info={info} onRefresh={load} />

          <div className="glass-card rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white inline-flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${info.integrity_ok && info.foreign_key_ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
              Health
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-gray-400 uppercase tracking-wide text-[10px]">Integrity {info.integrity_ok ? '✓' : '✕'}</div>
                {(info.integrity_issues || []).length > 0 ? (
                  <div className="mt-1 rounded-md bg-red-900/20 border border-red-700/40 p-2 text-red-200 space-y-0.5">
                    {(info.integrity_issues || []).map((m, i) => <div key={i}>✕ {m}</div>)}
                  </div>
                ) : (
                  <div className="text-gray-500 mt-1">no issues reported</div>
                )}
                {info.integrity_note && <div className="text-[11px] text-gray-500 mt-1">{info.integrity_note}</div>}
              </div>
              <div>
                <div className="text-gray-400 uppercase tracking-wide text-[10px]">Foreign keys {info.foreign_key_ok ? '✓' : '✕'}</div>
                {(info.foreign_key_issues || []).length > 0 ? (
                  <div className="mt-1 rounded-md bg-red-900/20 border border-red-700/40 p-2 text-red-200 space-y-0.5">
                    {(info.foreign_key_issues || []).map((m, i) => <div key={i}>✕ {m}</div>)}
                  </div>
                ) : (
                  <div className="text-gray-500 mt-1">no violations reported</div>
                )}
                {info.foreign_key_note && <div className="text-[11px] text-gray-500 mt-1">{info.foreign_key_note}</div>}
              </div>
            </div>
            {info.health_note && <div className="text-[11px] text-gray-500">{info.health_note}</div>}
            <div className="divide-y divide-white/5">
              <MetaRow label="Connections" value={info.total_connections || '—'} mono />
              <MetaRow label="Encoding" value={info.encoding || '—'} mono />
              <MetaRow label="Journal" value={info.journal_mode || '—'} mono />
              <MetaRow label="Page size" value={info.page_size ? formatBytes(info.page_size) : '—'} mono />
            </div>
          </div>

          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white">Tables</h3>
              <span className="text-xs text-gray-500">{filteredTables.length} of {info.tables.length}</span>
              {!hasSizes && <span className="text-[11px] text-gray-500">sizes unavailable on this engine</span>}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filter tables…"
                className="ml-auto bg-black/30 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-200 font-mono min-w-[10rem]"
              />
            </div>
            {filteredTables.length === 0 ? (
              <div className="text-sm text-gray-500">No tables match.</div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-gray-500">
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 pr-2 font-medium">Table</th>
                      <th className="text-right py-2 px-2 font-medium">Rows</th>
                      <th className="text-right py-2 px-2 font-medium">Size</th>
                      <th className="text-right py-2 px-2 font-medium">Indexes</th>
                      <th className="text-left py-2 pl-2 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredTables.map((t) => (
                      <tr key={t.name} className="hover:bg-white/[0.03]">
                        <td className="py-2 pr-2 align-top">
                          <div className="font-mono text-gray-200 text-xs break-all">{t.name}</div>
                          <div className="text-[10px] text-gray-500 font-mono">{t.column_count} cols · {t.index_count} idx</div>
                        </td>
                        <td className="py-2 px-2 align-top text-right tabular-nums text-gray-300 whitespace-nowrap">
                          {t.row_count.toLocaleString()} <DeltaPill delta={t.row_delta} mono />
                        </td>
                        <td className="py-2 px-2 align-top text-right tabular-nums text-gray-300 whitespace-nowrap">
                          <div>{formatBytes(t.size_bytes)}</div>
                          <div className="mt-1 w-24 ml-auto"><Meter pct={(t.size_bytes / maxSize) * 100} /></div>
                        </td>
                        <td className="py-2 px-2 align-top text-right tabular-nums text-gray-300 whitespace-nowrap">{formatBytes(t.index_bytes)}</td>
                        <td className="py-2 pl-2 align-top min-w-[6rem]">
                          <Sparkline values={history.current[t.name] || []} color="#34d399" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
          )}

          {tab === 'overview' && info.engine_not_supported && (
          <>
          <div className="glass-card rounded-xl">
            <h3 className="text-sm font-semibold text-white mb-1 inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              {info.engine} — live monitor unavailable
            </h3>
            <p className="text-sm text-gray-400">
              No inspector is implemented for <span className="font-mono text-gray-300">{info.engine}</span> yet. Switch engines below to return to a supported backend.
            </p>
            <div className="mt-2 text-xs text-gray-500 font-mono">
              connected to: <span className="text-gray-300">{info.path}</span> <span className="text-gray-600">· captured {ago(secondsSince || 0)} ago</span>
            </div>
          </div>
          </>
          )}

          {tab === 'change' && (
          <>
          <ChangeDatabaseCard currentEngine={info.engine} currentPath={info.path} />
          </>
          )}

          {tab === 'backup' && (
          <>
          <DatabaseBackupTab />
          </>
          )}
        </div>
      )}
    </div>
  );
};

export default DatabasePage;