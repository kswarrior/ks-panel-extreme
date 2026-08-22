import React, { useCallback, useState } from 'react';
import { securitySnapshot, securityToggleAttack, securityGetConfig, securityUpdateConfig } from '@/shared/api/admin';
import type { SecuritySnapshot as SecuritySnapshotT, SecurityConfig } from '@/features/security/types/security';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import NumberInput from '@/shared/components/ui/NumberInput';
import ToggleRow from '@/shared/components/ui/ToggleRow';

interface FirewallProps {
  initialSnapshot?: SecuritySnapshotT | null;
  initialConfig?: SecurityConfig | null;
  onConfigChange?: () => void;
}

const Firewall: React.FC<FirewallProps> = ({
  initialSnapshot,
  initialConfig,
  onConfigChange,
}) => {
  const [snap, setSnap] = useState<SecuritySnapshotT | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [error, setError] = useState('');
  const [underAttack, setUnderAttack] = useState(initialSnapshot?.under_attack ?? false);
  const [configLoading, setConfigLoading] = useState(!initialConfig);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSuccess, setConfigSuccess] = useState('');

  const [fwReqPerMin, setFwReqPerMin] = useState(initialConfig?.requests_per_minute_limit ?? 600);
  const [fwWindowSec, setFwWindowSec] = useState(initialConfig?.window_seconds_limit ?? 60);
  const [fwGlobalRpm, setFwGlobalRpm] = useState(initialConfig?.global_rpm_limit ?? 0);
  const [fwBlockUnknownUa, setFwBlockUnknownUa] = useState(initialConfig?.block_unknown_ua ?? false);

  const loadSnapshot = useCallback(async () => {
    if (initialSnapshot) return;
    setError('');
    try {
      const s = await securitySnapshot();
      setSnap(s);
      setUnderAttack(s.under_attack);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load security snapshot');
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
      setFwReqPerMin(cfg.requests_per_minute_limit);
      setFwWindowSec(cfg.window_seconds_limit);
      setFwGlobalRpm(cfg.global_rpm_limit);
      setFwBlockUnknownUa(cfg.block_unknown_ua);
    } catch (e: any) {
      setConfigError(e?.response?.data || 'Failed to load firewall config');
    } finally {
      setConfigLoading(false);
    }
  }, [initialConfig]);

  const toggleAttack = useCallback(async (next: boolean) => {
    try {
      const res = await securityToggleAttack(next);
      setUnderAttack(res.under_attack);
      if (snap) setSnap({ ...snap, under_attack: res.under_attack });
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to toggle attack status');
    }
  }, [snap]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigError('');
    setConfigSuccess('');
    try {
      const cfg: SecurityConfig = {
        requests_per_minute_limit: fwReqPerMin,
        window_seconds_limit: fwWindowSec,
        global_rpm_limit: fwGlobalRpm,
        block_unknown_ua: fwBlockUnknownUa,
        ddos_auto_stop_enabled: false,
        ddos_stop_minutes: 5,
        ddos_max_stop_count: 0,
      };
      await securityUpdateConfig(cfg);
      const s = await securitySnapshot();
      setSnap(s);
      setConfigSuccess('Saved.');
      onConfigChange?.();
    } catch (e: any) {
      setConfigError(e?.response?.data || 'Failed to save firewall config');
    } finally {
      setConfigSaving(false);
    }
  };

  if (loading) return <SkeletonGrid count={4} />;

  return (
    <form onSubmit={saveConfig} className="glass-card rounded-xl space-y-6 max-w-2xl">
      {configLoading ? (
        <SkeletonGrid count={4} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={underAttack}
                  onChange={(e) => toggleAttack(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span className="text-sm text-gray-300">Under Attack Mode</span>
              </label>
            </div>
          </div>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Per-IP Rate Limit
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Maximum requests a single client IP may make within the rolling window.
              Set to 0 to disable per-IP throttling.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput
                id="fw-req-per-min"
                label="Requests Per Minute Limit"
                value={fwReqPerMin}
                onChange={setFwReqPerMin}
                min={0}
                max={10000}
              />
              <NumberInput
                id="fw-window-sec"
                label="Window (seconds)"
                value={fwWindowSec}
                onChange={setFwWindowSec}
                min={1}
                max={3600}
              />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Global Rate Limit (Under Attack Only)
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Total requests-per-minute across the whole panel. Only enforced when
              Under Attack mode is enabled above. Set to 0 to disable.
            </p>
            <NumberInput
              id="fw-global-rpm"
              label="Global RPM Limit"
              value={fwGlobalRpm}
              onChange={setFwGlobalRpm}
              min={0}
              max={100000}
            />
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Request Filtering
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Block requests with empty or missing User-Agent headers (common for
              scripted probes and headless scrapers).
            </p>
            <ToggleRow
              id="fw-block-unknown-ua"
              label="Block Unknown User-Agent"
              description="When enabled, requests without a User-Agent header are rejected with 403 Forbidden."
              checked={fwBlockUnknownUa}
              onChange={setFwBlockUnknownUa}
            />
          </section>

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
  );
};

export default Firewall;