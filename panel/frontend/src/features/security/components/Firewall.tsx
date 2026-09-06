import React, { useCallback, useEffect, useState } from 'react';
import { securityGetConfig, securityGetStatus, securityUpdateConfig } from '@/shared/api/admin';
import type { SecurityConfig, SecurityStatusResponse } from '@/features/security/types/security';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import NumberInput from '@/shared/components/ui/NumberInput';
import ToggleRow from '@/shared/components/ui/ToggleRow';

interface FirewallProps {
  initialConfig?: SecurityConfig | null;
  onConfigChange?: () => void;
}

const listToText = (list: string[] | undefined): string => (list ?? []).join('\n');

const textToList = (text: string): string[] =>
  text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');

// Small read-only status card for the CORS / CSRF / headers tiles.
const StatusCard: React.FC<{ title: string; ok: boolean; lines: string[] }> = ({ title, ok, lines }) => (
  <div className="ks-stat-card rounded-md">
    <div className="flex items-center gap-2 mb-2">
      <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      <span className="text-sm font-medium text-gray-200">{title}</span>
      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
        ok ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'
      }`}>
        {ok ? 'Active' : 'Partial'}
      </span>
    </div>
    <ul className="space-y-1">
      {lines.map((l) => (
        <li key={l} className="text-xs text-gray-500">{l}</li>
      ))}
    </ul>
  </div>
);

const Firewall: React.FC<FirewallProps> = ({
  initialConfig,
  onConfigChange,
}) => {
  const [configLoading, setConfigLoading] = useState(!initialConfig);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSuccess, setConfigSuccess] = useState('');

  const [fwReqPerMin, setFwReqPerMin] = useState(initialConfig?.requests_per_minute_limit ?? 600);
  const [fwWindowSec, setFwWindowSec] = useState(initialConfig?.window_seconds_limit ?? 60);

  // IP allow / deny lists
  const [allowText, setAllowText] = useState(listToText(initialConfig?.ip_allowlist));
  const [denyText, setDenyText] = useState(listToText(initialConfig?.ip_denylist));

  // WAF / request filtering
  const [blockUnknownUa, setBlockUnknownUa] = useState(initialConfig?.block_unknown_ua ?? false);
  const [blockSuspicious, setBlockSuspicious] = useState(initialConfig?.block_suspicious_paths ?? false);
  const [allowedMethods, setAllowedMethods] = useState(initialConfig?.allowed_http_methods ?? '');
  const [maxBodyMb, setMaxBodyMb] = useState(initialConfig?.max_body_size_mb ?? 10);

  const [status, setStatus] = useState<SecurityStatusResponse | null>(null);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    if (initialConfig) {
      setFwReqPerMin(initialConfig.requests_per_minute_limit);
      setFwWindowSec(initialConfig.window_seconds_limit);
      setAllowText(listToText(initialConfig.ip_allowlist));
      setDenyText(listToText(initialConfig.ip_denylist));
      setBlockUnknownUa(initialConfig.block_unknown_ua);
      setBlockSuspicious(initialConfig.block_suspicious_paths);
      setAllowedMethods(initialConfig.allowed_http_methods ?? '');
      setMaxBodyMb(initialConfig.max_body_size_mb);
      setConfigLoading(false);
      return;
    }
    securityGetConfig()
      .then((cfg) => {
        setFwReqPerMin(cfg.requests_per_minute_limit);
        setFwWindowSec(cfg.window_seconds_limit);
        setAllowText(listToText(cfg.ip_allowlist));
        setDenyText(listToText(cfg.ip_denylist));
        setBlockUnknownUa(cfg.block_unknown_ua);
        setBlockSuspicious(cfg.block_suspicious_paths);
        setAllowedMethods(cfg.allowed_http_methods);
        setMaxBodyMb(cfg.max_body_size_mb);
      })
      .catch((e: any) => setConfigError(e?.response?.data || 'Failed to load firewall config'))
      .finally(() => setConfigLoading(false));
  }, [initialConfig]);

  useEffect(() => {
    securityGetStatus()
      .then(setStatus)
      .catch(() => setStatusError('Could not load protection status.'));
  }, []);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigError('');
    setConfigSuccess('');

    // Validate IP/CIDR entries client-side; the backend parses them into
    // networks and silently drops invalid entries, so warn early instead.
    for (const entry of [...textToList(allowText), ...textToList(denyText)]) {
      if (!/^[\w.:\-/]+$/.test(entry)) {
        setConfigError(`Invalid IP or CIDR entry: "${entry}"`);
        setConfigSaving(false);
        return;
      }
    }

    try {
      // Re-fetch the freshest config before merging so we don't clobber
      // fields owned by other tabs with a stale initialConfig snapshot.
      let latest: SecurityConfig | null = null;
      try {
        latest = await securityGetConfig();
      } catch {
        latest = initialConfig ?? null;
      }
      const base = latest ?? initialConfig;
      const cfg: SecurityConfig = {
        requests_per_minute_limit: fwReqPerMin,
        window_seconds_limit: fwWindowSec,
        // Global traffic limit is owned by the DDoS tab now.
        global_rpm_limit: base?.global_rpm_limit ?? 0,
        ip_allowlist: textToList(allowText),
        ip_denylist: textToList(denyText),
        max_body_size_mb: maxBodyMb < 1 ? 1 : Math.floor(maxBodyMb),
        allowed_http_methods: allowedMethods.trim(),
        block_suspicious_paths: blockSuspicious,
        // User-Agent filtering lives under WAF / Request Filtering here.
        block_unknown_ua: blockUnknownUa,
        // DDoS-owned fields are preserved from the loaded config —
        // hardcoding them here used to silently disable DDoS protection
        // every time this form was saved.
        ddos_auto_stop_enabled: base?.ddos_auto_stop_enabled ?? false,
        ddos_stop_minutes: base?.ddos_stop_minutes ?? 5,
        ddos_max_stop_count: base?.ddos_max_stop_count ?? 0,
        ddos_mode: base?.ddos_mode ?? 'stop',
        ddos_alt_port: base?.ddos_alt_port ?? 5050,
        ddos_global_trigger_hits: base?.ddos_global_trigger_hits ?? 0,
        ddos_global_trigger_window: base?.ddos_global_trigger_window ?? 10,
        // Session-owned fields are preserved (Sessions tab owns them).
        session_lifetime_minutes: base?.session_lifetime_minutes ?? 480,
        session_idle_timeout_minutes: base?.session_idle_timeout_minutes ?? 1440,
        session_max_per_user: base?.session_max_per_user ?? 0,
      };
      const saved = await securityUpdateConfig(cfg);
      // Sync local state to what the server actually persisted (handles
      // clamping / normalization the backend applied).
      setFwReqPerMin(saved.requests_per_minute_limit);
      setFwWindowSec(saved.window_seconds_limit);
      setAllowText(listToText(saved.ip_allowlist));
      setDenyText(listToText(saved.ip_denylist));
      setBlockUnknownUa(saved.block_unknown_ua);
      setBlockSuspicious(saved.block_suspicious_paths);
      setAllowedMethods(saved.allowed_http_methods ?? '');
      setMaxBodyMb(saved.max_body_size_mb);
      setConfigSuccess('Saved.');
      onConfigChange?.();
    } catch (e: any) {
      setConfigError(e?.response?.data || 'Failed to save firewall config');
    } finally {
      setConfigSaving(false);
    }
  };

  if (configLoading) return <SkeletonGrid count={4} />;

  return (
    <div className="space-y-6 max-w-2xl">
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatusCard
            title="CORS"
            ok={true}
            lines={[
              status.cors.development_mode ? 'Mode: development (any origin)' : 'Mode: origin allowlist',
              `Credentials: ${status.cors.credentials ? 'allowed' : 'denied'}`,
              `${status.cors.allowed_origins.length} allowlisted origin(s)`,
            ]}
          />
          <StatusCard
            title="CSRF"
            ok={status.csrf.session_cookie_same_site === 'Strict'}
            lines={[
              `Session cookie SameSite=${status.csrf.session_cookie_same_site}`,
              status.csrf.token_middleware_enforced ? 'Token middleware enforced' : 'Token middleware not wired',
            ]}
          />
          <StatusCard
            title="Security Headers"
            ok={status.security_headers.enforced}
            lines={
              status.security_headers.enforced
                ? status.security_headers.applied_headers.slice(0, 3)
                : ['Global header middleware not wired', 'CORS headers applied by router']
            }
          />
        </div>
      )}
      {statusError && <p className="text-xs text-amber-400">{statusError}</p>}

      <form onSubmit={saveConfig} className="glass-card ks-form-card rounded-xl space-y-6">
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
            IP Allow / Deny Lists
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            One IP address or CIDR per line (e.g. <code className="text-gray-400">10.0.0.5</code>,{' '}
            <code className="text-gray-400">192.168.1.0/24</code>). Deny-listed addresses are rejected
            with 403 before every other check; allow-listed addresses bypass the per-IP rate limit.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fw-ip-allow" className="block text-sm font-medium text-emerald-300 mb-1">
                Allowlist
              </label>
              <textarea
                id="fw-ip-allow"
                value={allowText}
                onChange={(e) => setAllowText(e.target.value)}
                rows={5}
                placeholder={'203.0.113.7\n198.51.100.0/24'}
                className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-600 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
              />
            </div>
            <div>
              <label htmlFor="fw-ip-deny" className="block text-sm font-medium text-red-300 mb-1">
                Denylist
              </label>
              <textarea
                id="fw-ip-deny"
                value={denyText}
                onChange={(e) => setDenyText(e.target.value)}
                rows={5}
                placeholder={'192.0.2.44\n10.9.0.0/16'}
                className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-600 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
            WAF / Request Filtering
          </h3>
          <div className="space-y-4">
            <ToggleRow
              id="fw-block-unknown-ua"
              label="User-Agent Filtering — Block Unknown User-Agent"
              description="When enabled, requests without a User-Agent header are rejected with 403 Forbidden (common for scripted probes and headless scrapers)."
              checked={blockUnknownUa}
              onChange={setBlockUnknownUa}
            />
            <ToggleRow
              id="fw-block-suspicious"
              label="Suspicious Request Blocking"
              description="Reject known scanner/probe paths (/.env, /.git, /wp-admin, /phpmyadmin, ...) with 403."
              checked={blockSuspicious}
              onChange={setBlockSuspicious}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label htmlFor="fw-allowed-methods" className="block text-sm font-medium text-gray-300 mb-1">
                  HTTP Method Restrictions
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Comma-separated allowlist of HTTP methods. Leave blank to allow all methods.
                </p>
                <input
                  id="fw-allowed-methods"
                  type="text"
                  value={allowedMethods}
                  onChange={(e) => setAllowedMethods(e.target.value)}
                  placeholder="GET, POST, PUT, DELETE, PATCH"
                  className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
                />
              </div>
              <NumberInput
                id="fw-max-body-mb"
                label="Request Size Limit (MB)"
                value={maxBodyMb}
                onChange={setMaxBodyMb}
                min={1}
                max={1024}
              />
            </div>
          </div>
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
      </form>
    </div>
  );
};

export default Firewall;
