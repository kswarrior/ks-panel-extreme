import React, { useCallback, useState } from 'react';
import { securitySnapshot, securityDDOSReset, securityDDOSManualStop, securityGetConfig, securityUpdateConfig } from '@/shared/api/admin';
import type { SecuritySnapshot as SecuritySnapshotT, SecurityConfig } from '@/features/security/types/security';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import NumberInput from '@/shared/components/ui/NumberInput';
import ToggleRow from '@/shared/components/ui/ToggleRow';

interface DDoSProps {
  initialSnapshot?: SecuritySnapshotT | null;
  initialConfig?: SecurityConfig | null;
  onConfigChange?: () => void;
}

const DDoS: React.FC<DDoSProps> = ({
  initialSnapshot,
  initialConfig,
  onConfigChange,
}) => {
  const [snap, setSnap] = useState<SecuritySnapshotT | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [configLoading, setConfigLoading] = useState(!initialConfig);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSuccess, setConfigSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const [ddosAutoStopEnabled, setDdosAutoStopEnabled] = useState(initialConfig?.ddos_auto_stop_enabled ?? false);
  const [ddosStopMinutes, setDdosStopMinutes] = useState(initialConfig?.ddos_stop_minutes ?? 5);
  const [ddosMaxStopCount, setDdosMaxStopCount] = useState(initialConfig?.ddos_max_stop_count ?? 0);

  const loadSnapshot = useCallback(async () => {
    if (initialSnapshot) return;
    try {
      const s = await securitySnapshot();
      setSnap(s);
    } catch {
      // Silent fail - snapshot is loaded by parent
    } finally {
      setLoading(false);
    }
  }, [initialSnapshot]);

  const loadConfig = useCallback(async () => {
    if (initialConfig) return;
    setConfigLoading(true);
    setConfigError('');
    try {
      const cfg = await securityGetConfig();
      setDdosAutoStopEnabled(cfg.ddos_auto_stop_enabled);
      setDdosStopMinutes(cfg.ddos_stop_minutes);
      setDdosMaxStopCount(cfg.ddos_max_stop_count);
    } catch (e: any) {
      setConfigError(e?.response?.data || 'Failed to load DDoS config');
    } finally {
      setConfigLoading(false);
    }
  }, [initialConfig]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigError('');
    setConfigSuccess('');
    try {
      const cfg: SecurityConfig = {
        requests_per_minute_limit: 600,
        window_seconds_limit: 60,
        global_rpm_limit: 0,
        block_unknown_ua: false,
        ddos_auto_stop_enabled: ddosAutoStopEnabled,
        ddos_stop_minutes: ddosStopMinutes,
        ddos_max_stop_count: ddosMaxStopCount,
      };
      await securityUpdateConfig(cfg);
      const s = await securitySnapshot();
      setSnap(s);
      setConfigSuccess('Saved.');
      onConfigChange?.();
    } catch (e: any) {
      setConfigError(e?.response?.data || 'Failed to save DDoS config');
    } finally {
      setConfigSaving(false);
    }
  };

  const handleDDOSReset = async () => {
    if (!confirm('Reset DDoS auto-stop count and cooldown? This will re-enable auto-stop if it was disabled due to max count reached.')) {
      return;
    }
    setActionError('');
    setActionSuccess('');
    try {
      await securityDDOSReset();
      const s = await securitySnapshot();
      setSnap(s);
      loadConfig();
      setActionSuccess('DDoS state reset.');
    } catch (e: any) {
      setActionError(e?.response?.data || 'Failed to reset DDoS state');
    }
  };

  const handleDDOSManualStop = async () => {
    if (!confirm('Manually trigger DDoS auto-stop? This will stop the panel from accepting new requests for the configured cooldown period.')) {
      return;
    }
    setActionError('');
    setActionSuccess('');
    try {
      const res = await securityDDOSManualStop();
      const s = await securitySnapshot();
      setSnap(s);
      loadConfig();
      setActionSuccess(`DDoS auto-stop triggered. Stop count: ${res.stop_count}, cooldown until: ${res.cooldown_until}`);
    } catch (e: any) {
      setActionError(e?.response?.data || 'Failed to trigger DDoS stop');
    }
  };

  if (loading) return <SkeletonGrid count={4} />;

  return (
    <div>
      {actionError && <p className="text-sm text-red-400 mb-4">{actionError}</p>}
      {actionSuccess && <p className="text-sm text-green-400 mb-4">{actionSuccess}</p>}

      <form onSubmit={saveConfig} className="glass-card rounded-xl space-y-6 max-w-2xl">
        {configLoading ? (
          <SkeletonGrid count={4} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  snap?.ddos_active ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'
                }`}>
                  {snap?.ddos_active ? 'ACTIVE — Panel Stopped' : 'Normal'}
                </span>
                {snap?.ddos_cooldown_until && (
                  <span className="text-xs text-gray-400 font-mono">
                    Cooldown until: {new Date(snap.ddos_cooldown_until).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Auto-Stop Configuration
              </h3>
              <ToggleRow
                id="ddos-auto-stop"
                label="Enable DDoS Auto-Stop"
                description="Automatically stop accepting new requests when DDoS is detected."
                checked={ddosAutoStopEnabled}
                onChange={setDdosAutoStopEnabled}
              />
              <div className={ddosAutoStopEnabled ? '' : 'opacity-50 pointer-events-none mt-4 space-y-4'}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberInput
                    id="ddos-stop-minutes"
                    label="Cooldown Minutes"
                    value={ddosStopMinutes}
                    onChange={setDdosStopMinutes}
                    min={1}
                    max={1440}
                  />
                  <NumberInput
                    id="ddos-max-stop-count"
                    label="Max Auto-Stop Count (0 = unlimited)"
                    value={ddosMaxStopCount}
                    onChange={setDdosMaxStopCount}
                    min={0}
                    max={100}
                  />
                </div>
              </div>
            </section>

            <div className="flex justify-start">
              <button
                type="button"
                onClick={handleDDOSManualStop}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="6" y1="10" x2="18" y2="10"/></svg>
                Test
              </button>
            </div>

            {configError && <p className="text-sm text-red-400">{configError}</p>}
            {configSuccess && <p className="text-sm text-green-400">{configSuccess}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={configSaving}
                className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12" /></svg>
                {configSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
};

export default DDoS;