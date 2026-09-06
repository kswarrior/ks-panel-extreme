import React, { useCallback, useEffect, useState } from 'react';
import { securitySnapshot, securityToggleAttack, securityDDOSReset, securityGetConfig, securityUpdateConfig, ddosBackground } from '@/shared/api/admin';
import type { SecuritySnapshot as SecuritySnapshotT, SecurityConfig, DDOSBackgroundResponse } from '@/features/security/types/security';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import NumberInput from '@/shared/components/ui/NumberInput';
import ToggleRow from '@/shared/components/ui/ToggleRow';
import { useConfirm } from '@/shared/stores/confirmStore';

interface DDoSProps {
  initialSnapshot?: SecuritySnapshotT | null;
  initialConfig?: SecurityConfig | null;
  onConfigChange?: () => void;
  onAttackToggle?: (next: boolean) => void;
}

// Reaction modes offered by the DDoS tab. Mirrors models.DDOSMode* on the
// backend: "stop" refuses new requests during cooldown, "port_switch"
// moves the panel onto ddos_alt_port so attackers keep hitting a dead
// port while the panel stays reachable on the alternate one.
const DDOS_MODES: Array<{ id: 'stop' | 'port_switch'; title: string; desc: string }> = [
  {
    id: 'stop',
    title: 'Stop Requests',
    desc: 'Refuse new requests for the cooldown window. Strongest shedding; the admin page stays reachable for reset.',
  },
  {
    id: 'port_switch',
    title: 'Port Switcher',
    desc: 'Close the attacked panel port and reopen the panel on the alternate port, so even a massive flood cannot take the panel down.',
  },
];

const DDoS: React.FC<DDoSProps> = ({
  initialSnapshot,
  initialConfig,
  onConfigChange,
  onAttackToggle,
}) => {
  const confirm = useConfirm();
  const [snap, setSnap] = useState<SecuritySnapshotT | null>(initialSnapshot ?? null);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [configLoading, setConfigLoading] = useState(!initialConfig);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSuccess, setConfigSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  // ddos.sh background-run result (triggered by "Test Reaction").
  const [ddosScriptResult, setDdosScriptResult] = useState<DDOSBackgroundResponse | null>(null);

  const [underAttack, setUnderAttack] = useState(initialSnapshot?.under_attack ?? false);

  const [ddosAutoStopEnabled, setDdosAutoStopEnabled] = useState(initialConfig?.ddos_auto_stop_enabled ?? false);
  const [ddosStopMinutes, setDdosStopMinutes] = useState(initialConfig?.ddos_stop_minutes ?? 5);
  const [ddosMaxStopCount, setDdosMaxStopCount] = useState(initialConfig?.ddos_max_stop_count ?? 0);
  const [ddosMode, setDdosMode] = useState<'stop' | 'port_switch'>(initialConfig?.ddos_mode ?? 'stop');
  const [ddosAltPort, setDdosAltPort] = useState(initialConfig?.ddos_alt_port ?? 5050);
  const [ddosGlobalHits, setDdosGlobalHits] = useState(initialConfig?.ddos_global_trigger_hits ?? 0);
  const [ddosGlobalWindow, setDdosGlobalWindow] = useState(initialConfig?.ddos_global_trigger_window ?? 10);
  // Global traffic limit (RPM ceiling enforced while Under Attack is on).
  const [globalRpmLimit, setGlobalRpmLimit] = useState(initialConfig?.global_rpm_limit ?? 0);

  // Sync local state when parent passes fresh snapshot/config (e.g. after save+reload or browser refresh).
  useEffect(() => {
    if (initialSnapshot) {
      setSnap(initialSnapshot);
      setUnderAttack(initialSnapshot.under_attack);
      setLoading(false);
    }
  }, [initialSnapshot]);

  useEffect(() => {
    if (initialConfig) {
      setDdosAutoStopEnabled(initialConfig.ddos_auto_stop_enabled);
      setDdosStopMinutes(initialConfig.ddos_stop_minutes);
      setDdosMaxStopCount(initialConfig.ddos_max_stop_count);
      setDdosMode(initialConfig.ddos_mode);
      setDdosAltPort(initialConfig.ddos_alt_port);
      setDdosGlobalHits(initialConfig.ddos_global_trigger_hits);
      setDdosGlobalWindow(initialConfig.ddos_global_trigger_window);
      setGlobalRpmLimit(initialConfig.global_rpm_limit);
      setConfigLoading(false);
      return;
    }
  }, [initialConfig]);

  const loadSnapshot = useCallback(async () => {
    if (initialSnapshot) return;
    try {
      const s = await securitySnapshot();
      setSnap(s);
      setUnderAttack(s.under_attack);
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
      setDdosMode(cfg.ddos_mode);
      setDdosAltPort(cfg.ddos_alt_port);
      setDdosGlobalHits(cfg.ddos_global_trigger_hits);
      setDdosGlobalWindow(cfg.ddos_global_trigger_window);
      setGlobalRpmLimit(cfg.global_rpm_limit);
    } catch (e: any) {
      setConfigError(e?.response?.data || 'Failed to load DDoS config');
    } finally {
      setConfigLoading(false);
    }
  }, [initialConfig]);

  const toggleAttack = useCallback(async (next: boolean) => {
    try {
      const res = await securityToggleAttack(next);
      setUnderAttack(res.under_attack);
      if (snap) setSnap({ ...snap, under_attack: res.under_attack });
      onAttackToggle?.(res.under_attack);
    } catch (e: any) {
      setActionError(e?.response?.data || 'Failed to toggle attack status');
    }
  }, [snap, onAttackToggle]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigError('');
    setConfigSuccess('');
    if (ddosMode === 'port_switch' && (ddosAltPort < 1 || ddosAltPort > 65535)) {
      setConfigError('Alternate port must be between 1 and 65535.');
      setConfigSaving(false);
      return;
    }
    try {
      let latest: SecurityConfig | null = null;
      try {
        latest = await securityGetConfig();
      } catch {
        latest = initialConfig ?? null;
      }
      const base = latest ?? initialConfig;
      const cfg: SecurityConfig = {
        // Firewall-owned fields are preserved from the loaded config —
        // hardcoding them here used to silently reset the firewall
        // limits every time this form was saved.
        requests_per_minute_limit: base?.requests_per_minute_limit ?? 600,
        window_seconds_limit: base?.window_seconds_limit ?? 60,
        ip_allowlist: base?.ip_allowlist ?? [],
        ip_denylist: base?.ip_denylist ?? [],
        max_body_size_mb: base?.max_body_size_mb ?? 10,
        allowed_http_methods: base?.allowed_http_methods ?? '',
        block_suspicious_paths: base?.block_suspicious_paths ?? false,
        block_unknown_ua: base?.block_unknown_ua ?? false,
        ddos_auto_stop_enabled: ddosAutoStopEnabled,
        ddos_stop_minutes: ddosStopMinutes,
        ddos_max_stop_count: ddosMaxStopCount,
        ddos_mode: ddosMode,
        ddos_alt_port: ddosAltPort,
        ddos_global_trigger_hits: ddosGlobalHits,
        ddos_global_trigger_window: ddosGlobalWindow,
        global_rpm_limit: globalRpmLimit < 0 ? 0 : Math.floor(globalRpmLimit),
        // Session-owned fields are preserved (Sessions tab owns them).
        session_lifetime_minutes: base?.session_lifetime_minutes ?? 480,
        session_idle_timeout_minutes: base?.session_idle_timeout_minutes ?? 1440,
        session_max_per_user: base?.session_max_per_user ?? 0,
      };
      const saved = await securityUpdateConfig(cfg);
      // Sync to what the server persisted (handles clamping).
      setDdosAutoStopEnabled(saved.ddos_auto_stop_enabled);
      setDdosStopMinutes(saved.ddos_stop_minutes);
      setDdosMaxStopCount(saved.ddos_max_stop_count);
      setDdosMode(saved.ddos_mode);
      setDdosAltPort(saved.ddos_alt_port);
      setDdosGlobalHits(saved.ddos_global_trigger_hits);
      setDdosGlobalWindow(saved.ddos_global_trigger_window);
      setGlobalRpmLimit(saved.global_rpm_limit);
      const s = await securitySnapshot();
      setSnap(s);
      setUnderAttack(s.under_attack);
      setConfigSuccess('Saved.');
      onConfigChange?.();
    } catch (e: any) {
      setConfigError(e?.response?.data || 'Failed to save DDoS config');
    } finally {
      setConfigSaving(false);
    }
  };

  const handleDDOSReset = async () => {
    if (!(await confirm({ title: 'Reset DDoS state', message: 'Reset DDoS auto-stop count and cooldown? This will re-enable auto-stop if it was disabled due to max count reached.', tone: 'warning', confirmLabel: 'Reset' }))) {
      return;
    }
    setActionError('');
    setActionSuccess('');
    try {
      await securityDDOSReset();
      const s = await securitySnapshot();
      setSnap(s);
      setUnderAttack(s.under_attack);
      onAttackToggle?.(s.under_attack);
      loadConfig();
      setActionSuccess('DDoS state reset — panel resumed.');
    } catch (e: any) {
      setActionError(e?.response?.data || 'Failed to reset DDoS state');
    }
  };

  // handleTestReaction runs the emergency port-switch script (ddos.sh):
  // it stops the panel and restarts it on ddos_alt_port via
  // `launch --port <alt> --type ddos`, so that port is NOT saved as the
  // last port and a normal restart returns to the original one.
  const handleTestReaction = async () => {
    if (!(await confirm({ title: 'Run ddos.sh', message: `Run ddos.sh? The panel will STOP and come back on :${ddosAltPort}. The alternate port is temporary — a normal restart returns to the original port.`, tone: 'warning', confirmLabel: 'Run' }))) {
      return;
    }
    setActionError('');
    setActionSuccess('');
    setDdosScriptResult(null);
    try {
      const r = await ddosBackground();
      setDdosScriptResult(r);
      setActionSuccess(`ddos.sh started — panel is switching to :${ddosAltPort}. Reopen this page there once it is back.`);
      // Best-effort snapshot refresh; the panel may already be going down
      // mid-switch, in which case this silently fails and that's fine.
      try {
        const s = await securitySnapshot();
        setSnap(s);
        setUnderAttack(s.under_attack);
        onAttackToggle?.(s.under_attack);
        loadConfig();
      } catch {
        // Panel restarting — expected.
      }
    } catch (e: any) {
      setActionError(e?.response?.data || e?.message || 'Failed to start ddos.sh');
    }
  };

  if (loading) return <SkeletonGrid count={4} />;

  const statusLabel = snap?.ddos_active
    ? snap.ddos_port_switched
      ? `ACTIVE — Panel moved to :${snap.ddos_active_port}`
      : 'ACTIVE — Panel Stopped'
    : 'Normal';

  return (
    <div>
      {actionError && <p className="text-sm text-red-400 mb-4">{actionError}</p>}
      {actionSuccess && <p className="text-sm text-green-400 mb-4">{actionSuccess}</p>}

      <form onSubmit={saveConfig} className="glass-card ks-form-card rounded-xl space-y-6 max-w-2xl">
        {configLoading ? (
          <SkeletonGrid count={4} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  snap?.ddos_active ? 'bg-red-900/50 text-red-300' : 'bg-emerald-900/50 text-emerald-300'
                }`}>
                  {statusLabel}
                </span>
                {snap?.ddos_cooldown_until && (
                  <span className="text-xs text-gray-400 font-mono">
                    Cooldown until: {new Date(snap.ddos_cooldown_until).toLocaleString()}
                  </span>
                )}
                {typeof snap?.ddos_active_port === 'number' && snap.ddos_active_port > 0 && (
                  <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                    snap.ddos_port_switched ? 'bg-amber-900/50 text-amber-300' : 'bg-neutral-800/80 text-gray-300'
                  }`}>
                    Serving on :{snap.ddos_active_port}
                  </span>
                )}
              </div>
            </div>

            {snap?.ddos_port_error && (
              <p className="text-xs text-red-400">
                Port switch problem: {snap.ddos_port_error}
              </p>
            )}

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Under Attack Mode
              </h3>
              <ToggleRow
                id="ddos-under-attack"
                label="Under Attack Mode"
                description="Challenges every inbound request against the global traffic limit below. Enable while an attack is in progress; leave off during normal operation so the panel doesn't self-throttle."
                checked={underAttack}
                onChange={toggleAttack}
              />
              <div className="mt-4">
                <NumberInput
                  id="ddos-global-rpm"
                  label="Global Traffic Limit (requests/min, 0 = off)"
                  value={globalRpmLimit}
                  onChange={setGlobalRpmLimit}
                  min={0}
                  max={100000}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Total requests-per-minute across the whole panel. Only enforced while Under Attack
                  Mode is enabled above; extra requests get a 429 and are counted as blocked.
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Reaction Mode
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Choose what happens automatically the moment a DDoS attack is detected.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DDOS_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDdosMode(m.id)}
                    aria-pressed={ddosMode === m.id}
                    className={`ks-card text-left rounded-xl p-4 transition-colors duration-150 ${
                      ddosMode === m.id ? 'ring-2 ring-white/50' : 'opacity-75'
                    }`}
                  >
                    <span className="block text-sm font-medium text-gray-100">{m.title}</span>
                    <span className="block text-xs text-gray-500 mt-1">{m.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Detection &amp; Cooldown
              </h3>
              <ToggleRow
                id="ddos-auto-stop"
                label="Enable DDoS Protection"
                description="Automatically apply the reaction mode above when an attack is detected (per-IP limit breach or global burst)."
                checked={ddosAutoStopEnabled}
                onChange={setDdosAutoStopEnabled}
              />
              <div className={ddosAutoStopEnabled ? '' : 'opacity-50 pointer-events-none mt-4 space-y-4'}>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberInput
                    id="ddos-stop-minutes"
                    label="Auto-stop Cooldown Minutes"
                    value={ddosStopMinutes}
                    onChange={setDdosStopMinutes}
                    min={1}
                    max={1440}
                  />
                  <NumberInput
                    id="ddos-max-stop-count"
                    label="Maximum Auto-stop Count (0 = unlimited)"
                    value={ddosMaxStopCount}
                    onChange={setDdosMaxStopCount}
                    min={0}
                    max={100}
                  />
                </div>

                {ddosMode === 'port_switch' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <NumberInput
                      id="ddos-alt-port"
                      label="Alternate Panel Port"
                      value={ddosAltPort}
                      onChange={setDdosAltPort}
                      min={1}
                      max={65535}
                    />
                    <div className="flex items-end">
                      <p className="text-xs text-gray-500 pb-2">
                        While under attack the panel closes its current port and serves here instead. Bookmark it — must differ from the current panel port.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/5 mt-2">
                  <NumberInput
                    id="ddos-global-trigger-hits"
                    label="Traffic Threshold (requests, 0 = off)"
                    value={ddosGlobalHits}
                    onChange={setDdosGlobalHits}
                    min={0}
                    max={1000000}
                  />
                  <NumberInput
                    id="ddos-global-trigger-window"
                    label="Threshold Window (seconds)"
                    value={ddosGlobalWindow}
                    onChange={setDdosGlobalWindow}
                    min={5}
                    max={60}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Global burst detector catches distributed floods spread over many IPs that no single-IP limit would trip.
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Attack History
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="ks-stat-card rounded-md">
                  <div className="text-lg font-semibold text-white">{snap?.ddos_stop_count ?? 0}</div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">Reactions triggered</div>
                </div>
                <div className="ks-stat-card rounded-md">
                  <div className="text-lg font-semibold text-white">{snap?.ddos_tcp_dropped ?? 0}</div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">TCP connections dropped</div>
                </div>
                <div className="ks-stat-card rounded-md">
                  <div className="text-lg font-semibold text-white">
                    {snap?.blocked_requests ?? 0}
                  </div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-wide">Blocked requests (window)</div>
                </div>
              </div>
            </section>

            <div className="flex justify-start gap-2">
              <button
                type="button"
                onClick={handleTestReaction}
                className="ks-primary-btn inline-flex items-center gap-2 px-4 py-2 rounded text-sm disabled:opacity-60"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="6" y1="10" x2="18" y2="10"/></svg>
                Test Reaction
              </button>
              <button
                type="button"
                onClick={handleDDOSReset}
                className="ks-ghost-btn inline-flex items-center gap-2 px-4 py-2 rounded text-sm disabled:opacity-60"
              >
                Resume / Reset State
              </button>
            </div>

            {ddosScriptResult && (
              <p className="text-xs text-gray-400">
                ddos.sh: <code className="text-gray-200">{ddosScriptResult.script_path}</code>
              </p>
            )}

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
