import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import GlassModal from '@/shared/components/ui/Modal';
import SystemTabs from '../components/SystemTabs';
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
  const [tab, setTab] = useState<'host' | 'panel'>('host');

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
    return <p className="text-red-400 text-sm">{error}</p>;
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
      {/* System scope switcher — this page's own tab style (scope cards, not
          the generic ks-tab strip / bottom pill): Host = machine health,
          Panel = app + updates. One tap on every breakpoint, with a live
          footnote so the choice is obvious at a glance. */}
      <SystemTabs
        tab={tab}
        onChange={setTab}
        hostMeta={hostMeta}
        panelMeta={panelMeta}
        lastUpdated={lastUpdated}
        onRefresh={load}
      />

      <div className="space-y-4">
        {tab === 'host' && (
          <div role="tabpanel" id="system-panel-host" aria-labelledby="system-tab-host">
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
          <div role="tabpanel" id="system-panel-panel" aria-labelledby="system-tab-panel">
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