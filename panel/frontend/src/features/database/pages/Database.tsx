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
import { MetaRow, StatTile, DeltaPill, Meter, Sparkline, PragmaTile, ChangeDatabaseCard } from '../components/DatabaseComponents';
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

      {info && !info.engine_not_supported && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-xl font-semibold text-white shrink-0">Database</h2>
            <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
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
            </div>
          </div>

          {tab === 'overview' && (
          <>
          <div className="mb-4">
            <div className="text-xl font-semibold text-white capitalize">{info.engine}</div>
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
          </>
          )}



          {tab === 'change' && (
          <>
          <ChangeDatabaseCard currentEngine={info.engine} currentPath={info.path} />
          </>
          )}
        </div>
      )}

      {info && info.engine_not_supported && (
        <div className="space-y-4">
          <div className="glass-card rounded-xl">
            <h3 className="text-sm font-semibold text-white mb-1 inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              {info.engine} — live SQLite monitor unavailable
            </h3>
            <p className="text-sm text-gray-400">
              The Database page's live tables / PRAGMA monitor is SQLite-specific. For <span className="font-mono text-gray-300">{info.engine}</span>, introspect with <code className="font-mono text-gray-300">{info.engine === 'postgres' ? 'psql' : 'mysql'}</code> or switch engines below.
            </p>
            <div className="mt-2 text-xs text-gray-500 font-mono">
              connected to: <span className="text-gray-300">{info.path}</span> <span className="text-gray-600">· captured {ago(secondsSince || 0)} ago</span>
            </div>
          </div>

          <ChangeDatabaseCard currentEngine={info.engine} currentPath={info.path} />
        </div>
      )}
    </div>
  );
};

export default DatabasePage;