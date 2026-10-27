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
import { useVisibleInterval } from '@/shared/hooks/useVisibleInterval';
import ErrorState from '@/shared/components/ui/ErrorState';
import GlassModal from '@/shared/components/ui/Modal';
import { useUpdateInfo } from '../hooks/useUpdateInfo';
import HostPanel from '../components/HostPanel';
import PanelTab from '../components/PanelTab';


const REFRESH_MS = 15_000;

const System: React.FC = () => {
  const [snap, setSnap] = useState<SystemSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  }, [load]);
  useVisibleInterval(() => { void load(); }, REFRESH_MS);

  const refreshPanel = useCallback(() => {
    void load();
    void reload().catch(() => {});
  }, [load, reload]);

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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {tab === 'host' && (
          <div role="tabpanel" id="system-panel-host" aria-labelledby="system-host-title">
            {/* Host section */}
            <div>
              {host && (
                <HostPanel
                  host={host}
                  samples={snap.series?.samples || []}
                  recentCPU={recentCPU}
                  recentRAM={recentRAM}
                  recentLoad={recentLoad}
                  onRefresh={() => void load()}
                />
              )}
            </div>
          </div>
        )}

        {tab === 'panel' && (
          <div role="tabpanel" id="system-panel-panel" aria-label="Panel">
            <PanelTab
              snap={snap}
              info={info}
              infoErr={infoErr}
              infoLoading={infoLoading}
              reload={reload}
              onRefresh={refreshPanel}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default System;