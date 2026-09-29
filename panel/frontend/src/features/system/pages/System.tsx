import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { systemSnapshot } from '@/shared/api/admin';
import type {
  SystemSnapshot,
  LocalHost,
  DiskMount,
  NetInterface,
  SeriesSample,
  UpdateInfoResponse,
  UpdateCheckResponse,
  UpdateApplyResponse,
  ReinstallBackgroundResponse,
} from '@/features/system/types/system';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import ErrorState from '@/shared/components/ui/ErrorState';
import GlassModal from '@/shared/components/ui/Modal';
import { useUpdateInfo } from '../hooks/useUpdateInfo';
import HostPanel from '../components/HostPanel';
import PanelTab from '../components/PanelTab';
import IdentityCard from '../components/IdentityCard';
import {
  fmtGB, fmtMB, fmtBytes, fmtUptime, fmtPct,
  Donut, Gauge, LineChart, Sparkline, BarChart,
  instanceDot,
} from '../components/SystemCharts';

const REFRESH_MS = 15_000;

const System: React.FC = () => {
  const [snap, setSnap] = useState<SystemSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [recentCPU, setRecentCPU] = useState<number[]>([]);
  const [recentRAM, setRecentRAM] = useState<number[]>([]);
  const [recentLoad, setRecentLoad] = useState<number[]>([]);
  // Scope selection moved to the sidebar (System › Host / Panel). The tab
  // is URL-driven (?tab=panel) so sub-links, refresh and back-button agree.
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'panel' ? 'panel' : 'host';

  const { info, infoLoading, infoErr, reload } = useUpdateInfo();

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await systemSnapshot();
      setSnap(s);
      const now = new Date();
      setLastUpdated(now);
      // Update history arrays for sparklines (keep last 20 points)
      const addPoint = (arr: number[], val: number) => {
        const next = [...arr, val];
        return next.length > 20 ? next.slice(-20) : next;
      };
      setRecentCPU((prev) => addPoint(prev, s.local?.cpu_percent || 0));
      setRecentRAM((prev) => addPoint(prev, s.local?.ram_used_pct || 0));
      setRecentLoad((prev) => addPoint(prev, s.local?.load1 || 0));
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load system snapshot');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonGrid count={4} />
        <SkeletonGrid count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        variant="error"
        title="Failed to load system snapshot"
        description={error}
        retryLabel="Retry"
        onRetry={() => void load()}
      />
    );
  }

  if (!snap) {
    return (
      <div className="space-y-4">
        <SkeletonGrid count={4} />
        <SkeletonGrid count={3} />
      </div>
    );
  }

  const host: LocalHost = snap.local || {};

  const hostMeta = host.hostname
    ? `${host.hostname} · CPU ${(host.cpu_percent || 0).toFixed(0)}% · MEM ${(host.ram_used_pct || 0).toFixed(0)}%`
    : `CPU ${(host.cpu_percent || 0).toFixed(0)}% · MEM ${(host.ram_used_pct || 0).toFixed(0)}% · Load ${(host.load1 || 0).toFixed(2)}`;
  const panelMeta = info?.local?.version
    ? `v${info.local.version} · pid ${snap?.local?.pid || '—'} · ${snap?.local?.go_version || 'go'}`
    : snap?.local?.pid
      ? `pid ${snap.local.pid} · up ${fmtUptime(snap.local.process_uptime || 0)}`
      : 'Binary + update channel';

  return (
    <div className="space-y-6">
      {/* Section header — the Scope switcher cards now live in the sidebar
          (System › Host / Panel). This row keeps the live footnote plus the
          manual refresh that used to sit in the Scope bar toolbar. */}
      <div className="flex items-center gap-2">
        <span className="relative flex w-2 h-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
        </span>
        <span id="system-section-title" className="text-sm font-semibold text-gray-100">
          {tab === 'host' ? 'Host' : 'Panel'}
        </span>
        <span className="text-xs text-gray-500 truncate">
          {tab === 'host' ? hostMeta : panelMeta}
        </span>
        <span className="flex-1" />
        {lastUpdated && (
          <span className="hidden sm:inline text-[11px] text-gray-500 font-mono" title={lastUpdated.toLocaleString()}>
            {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        <button
          type="button"
          onClick={() => void load()}
          title="Refresh snapshot now"
          aria-label="Refresh snapshot now"
          className="ks-icon-btn inline-flex items-center justify-center w-7 h-7 rounded-md border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        {tab === 'host' && (
          <div role="tabpanel" id="system-panel-host" aria-labelledby="system-section-title">
            {/* Host section */}
            <div>
              {host && (
                <HostPanel
                  host={host}
                  samples={snap.series?.samples || []}
                  recentCPU={recentCPU}
                  recentRAM={recentRAM}
                  recentLoad={recentLoad}
                />
              )}
            </div>
          </div>
        )}

        {tab === 'panel' && (
          <div role="tabpanel" id="system-panel-panel" aria-labelledby="system-section-title">
            <PanelTab
              snap={snap}
              info={info}
              infoErr={infoErr}
              infoLoading={infoLoading}
              reload={reload}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default System;