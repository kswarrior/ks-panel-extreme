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

  return (
    <div className="space-y-6">
      {/* Title lives in the app header ("System"); internal Host/Panel tabs stay in-page.
          Desktop row only — phones get the bottom tabs pill (same `>` / `<`
          toggle + auto-off system as the actions pill). */}
      <div className="hidden lg:flex items-center gap-2 overflow-x-auto pb-1 mb-4">
        <button
          type="button"
          onClick={() => setTab('host')}
          className={`ks-tab shrink-0 transition-colors ${tab === 'host' ? 'ks-tab-active' : ''}`}
        >
          Host
        </button>
        <button
          type="button"
          onClick={() => setTab('panel')}
          className={`ks-tab shrink-0 transition-colors ${tab === 'panel' ? 'ks-tab-active' : ''}`}
        >
          Panel
        </button>
      </div>

      <div className="space-y-4">
        {tab === 'host' && (
          <>
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
        </>
      )}

      {tab === 'panel' && (
        <div>
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

      {/* Phone tabs — bottom pill with the same `>` / `<` toggle + auto-off
          system as the actions pill (PageTabsPill). */}
      <PageTabsPill
        ariaLabel="System sections"
        activeLabel={tab === 'host' ? 'Host' : 'Panel'}
      >
        {(['host', 'panel'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`ks-tab shrink-0 flex-1 px-3 py-1.5 rounded text-sm text-center transition flex items-center justify-center gap-1.5 ${tab === id ? 'ks-tab-active' : ''}`}
          >
            {id === 'host' ? 'Host' : 'Panel'}
          </button>
        ))}
      </PageTabsPill>
    </div>
  );
};

export default System;