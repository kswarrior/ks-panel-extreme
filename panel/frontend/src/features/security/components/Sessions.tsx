import React, { useCallback, useEffect, useState } from 'react';
import {
  securityGetConfig,
  securityGetStatus,
  securityUpdateConfig,
  securityListSessions,
  securityRevokeSession,
  securityRevokeAllSessions,
} from '@/shared/api/admin';
import type {
  SecurityConfig,
  SecuritySessionEntry,
  SecurityStatusResponse,
} from '@/features/security/types/security';
import GlassCard from '@/shared/components/ui/Card';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import NumberInput from '@/shared/components/ui/NumberInput';
import { useConfirm } from '@/shared/stores/confirmStore';

// Sessions — Security page tab: session lifetime / idle timeout /
// per-user cap policy, cookie-security status, and every active tracked
// session across all users with per-session and bulk revocation.

interface SessionsProps {
  initialConfig?: SecurityConfig | null;
  onConfigChange?: () => void;
}

const Sessions: React.FC<SessionsProps> = ({ initialConfig, onConfigChange }) => {
  const confirm = useConfirm();
  const [configLoading, setConfigLoading] = useState(!initialConfig);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [configSuccess, setConfigSuccess] = useState('');

  // Session policy
  const [lifetimeMin, setLifetimeMin] = useState(initialConfig?.session_lifetime_minutes ?? 480);
  const [idleMinutes, setIdleMinutes] = useState(initialConfig?.session_idle_timeout_minutes ?? 1440);
  const [maxPerUser, setMaxPerUser] = useState(initialConfig?.session_max_per_user ?? 0);

  const [status, setStatus] = useState<SecurityStatusResponse | null>(null);
  const [sessions, setSessions] = useState<SecuritySessionEntry[] | null>(null);
  const [listError, setListError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (initialConfig) {
      setLifetimeMin(initialConfig.session_lifetime_minutes);
      setIdleMinutes(initialConfig.session_idle_timeout_minutes);
      setMaxPerUser(initialConfig.session_max_per_user);
      setConfigLoading(false);
    } else {
      securityGetConfig()
        .then((cfg) => {
          setLifetimeMin(cfg.session_lifetime_minutes);
          setIdleMinutes(cfg.session_idle_timeout_minutes);
          setMaxPerUser(cfg.session_max_per_user);
        })
        .catch((e: any) =>
          setConfigError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to load session config'),
        )
        .finally(() => setConfigLoading(false));
    }
    securityGetStatus().then(setStatus).catch(() => {});
  }, [initialConfig]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await securityListSessions();
      setSessions(res.sessions || []);
      setListError('');
    } catch (e: any) {
      setListError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to load sessions');
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const id = window.setInterval(loadSessions, 15_000);
    return () => window.clearInterval(id);
  }, [loadSessions]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigError('');
    setConfigSuccess('');
    if (lifetimeMin < 1 || lifetimeMin > 10080) {
      setConfigError('Session lifetime must be between 1 minute and 7 days (10080 minutes).');
      setConfigSaving(false);
      return;
    }
    if (idleMinutes < 1 || idleMinutes > 43200) {
      setConfigError('Idle timeout must be between 1 minute and 30 days (43200 minutes).');
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
      // Preserve every non-session field from the loaded config — each
      // tab owns its slice of the shared security config.
      const cfg: SecurityConfig = {
        requests_per_minute_limit: base?.requests_per_minute_limit ?? 600,
        window_seconds_limit: base?.window_seconds_limit ?? 60,
        global_rpm_limit: base?.global_rpm_limit ?? 0,
        ip_allowlist: base?.ip_allowlist ?? [],
        ip_denylist: base?.ip_denylist ?? [],
        max_body_size_mb: base?.max_body_size_mb ?? 10,
        allowed_http_methods: base?.allowed_http_methods ?? '',
        block_suspicious_paths: base?.block_suspicious_paths ?? false,
        block_unknown_ua: base?.block_unknown_ua ?? false,
        ddos_auto_stop_enabled: base?.ddos_auto_stop_enabled ?? false,
        ddos_stop_minutes: base?.ddos_stop_minutes ?? 5,
        ddos_max_stop_count: base?.ddos_max_stop_count ?? 0,
        ddos_mode: base?.ddos_mode ?? 'stop',
        ddos_alt_port: base?.ddos_alt_port ?? 5050,
        ddos_global_trigger_hits: base?.ddos_global_trigger_hits ?? 0,
        ddos_global_trigger_window: base?.ddos_global_trigger_window ?? 10,
        session_lifetime_minutes: Math.floor(lifetimeMin),
        session_idle_timeout_minutes: Math.floor(idleMinutes),
        session_max_per_user: maxPerUser < 0 ? 0 : Math.floor(maxPerUser),
      };
      const saved = await securityUpdateConfig(cfg);
      setLifetimeMin(saved.session_lifetime_minutes);
      setIdleMinutes(saved.session_idle_timeout_minutes);
      setMaxPerUser(saved.session_max_per_user);
      setConfigSuccess('Saved.');
      onConfigChange?.();
    } catch (e: any) {
      setConfigError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to save session config');
    } finally {
      setConfigSaving(false);
    }
  };

  const revoke = async (s: SecuritySessionEntry) => {
    if (
      !(await confirm(
        {
          title: 'Terminate session',
          message: `Terminate the ${s.current ? 'CURRENT ' : ''}session of ${s.username || `user #${s.user_id}`}? Their next request will require a fresh login.`,
          tone: s.current ? 'danger' : 'warning',
          confirmLabel: 'Terminate',
        },
      ))
    ) {
      return;
    }
    setBusyId(s.id);
    try {
      await securityRevokeSession(s.id);
      await loadSessions();
      onConfigChange?.();
    } catch (e: any) {
      setListError(e?.response?.status === 404 ? 'Session already gone.' : typeof e?.response?.data === 'string' ? e.response.data : 'Failed to revoke session');
    } finally {
      setBusyId(null);
    }
  };

  const revokeAll = async () => {
    if (!(await confirm({ title: 'Terminate all sessions', message: 'Terminate EVERY active session for ALL users (including this browser)?', tone: 'danger', confirmLabel: 'Terminate all' }))) return;
    setBusyId('__all__');
    try {
      await securityRevokeAllSessions();
      await loadSessions();
      onConfigChange?.();
    } catch (e: any) {
      setListError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to revoke all sessions');
    } finally {
      setBusyId(null);
    }
  };

  if (configLoading) return <SkeletonGrid count={6} />;

  const cookie = status?.cookie;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Session policy */}
      <form onSubmit={saveConfig} className="glass-card ks-form-card rounded-xl space-y-5 p-5">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">Session Lifetime</h3>
          <p className="text-xs text-gray-500 mb-4">
            How long a session stays valid regardless of activity — drives the cookie expiry, bearer max-age and sliding rotation window.
          </p>
          <NumberInput id="sess-lifetime" label="Lifetime (minutes)" value={lifetimeMin} onChange={setLifetimeMin} min={1} max={10080} />
        </div>

        <div className="border-t border-white/[0.06] pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">Idle Timeout</h3>
          <p className="text-xs text-gray-500 mb-4">
            Tracked sessions unused for this long are invalidated automatically. Applies to panel logins and account-switcher tokens.
          </p>
          <NumberInput id="sess-idle" label="Idle timeout (minutes)" value={idleMinutes} onChange={setIdleMinutes} min={1} max={43200} />
        </div>

        <div className="border-t border-white/[0.06] pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">Maximum Active Sessions</h3>
          <p className="text-xs text-gray-500 mb-4">
            Cap concurrent sessions per user. When a new login would exceed the cap, the oldest session is evicted first. Set to 0 for unlimited.
          </p>
          <NumberInput id="sess-max-per-user" label="Max sessions per user (0 = unlimited)" value={maxPerUser} onChange={setMaxPerUser} min={0} max={100} />
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
      </form>

      {/* Cookie security status */}
      {cookie && (
        <GlassCard>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">Cookie Security</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-gray-500">Name</div>
              <code className="text-gray-200 break-all">{cookie.name}</code>
            </div>
            <div>
              <div className="text-gray-500">HttpOnly</div>
              <span className={cookie.http_only ? 'text-emerald-300' : 'text-red-300'}>{cookie.http_only ? 'yes' : 'no'}</span>
            </div>
            <div>
              <div className="text-gray-500">SameSite</div>
              <span className="text-emerald-300">{cookie.same_site}</span>
            </div>
            <div>
              <div className="text-gray-500">Secure</div>
              <span className={cookie.secure ? 'text-emerald-300' : 'text-amber-300'}>
                {cookie.secure ? 'yes' : 'no (non-TLS request)'}
              </span>
            </div>
            <div>
              <div className="text-gray-500">__Host- prefix</div>
              <span className={cookie.host_prefix ? 'text-emerald-300' : 'text-amber-300'}>{cookie.host_prefix ? 'yes' : 'no'}</span>
            </div>
            <div>
              <div className="text-gray-500">Path</div>
              <span className="text-gray-200">{cookie.path}</span>
            </div>
            <div>
              <div className="text-gray-500">Lifetime</div>
              <span className="text-gray-200">{cookie.lifetime_min} min</span>
            </div>
            <div>
              <div className="text-gray-500">Idle timeout</div>
              <span className="text-gray-200">{cookie.idle_timeout_min} min</span>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Active sessions / devices */}
      <GlassCard className="overflow-x-auto">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="text-lg font-semibold text-white">Active sessions ({sessions?.length ?? 0})</h3>
          <button
            type="button"
            onClick={revokeAll}
            disabled={busyId === '__all__' || !sessions || sessions.length === 0}
            className="px-3 py-1.5 text-sm rounded border border-red-700/50 bg-red-900/30 text-red-200 hover:bg-red-900/50 disabled:opacity-40"
          >
            {busyId === '__all__' ? 'Revoking…' : 'Revoke all'}
          </button>
        </div>
        {listError && <p className="text-red-400 text-sm mb-2">{listError}</p>}
        {sessions === null ? (
          <SkeletonGrid count={2} />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400">No active tracked sessions.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-white/10">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">IP address</th>
                <th className="py-2 pr-3 hidden md:table-cell">User agent</th>
                <th className="py-2 pr-3">Issued</th>
                <th className="py-2 pr-3">Last used</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-3 text-gray-200 whitespace-nowrap">
                    {s.username || `user #${s.user_id}`}
                    {s.current && (
                      <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-700/60">you</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-300 font-mono text-xs whitespace-nowrap">{s.ip_address || '—'}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs max-w-[220px] truncate hidden md:table-cell" title={s.user_agent}>{s.user_agent || '—'}</td>
                  <td className="py-2 pr-3 text-gray-400 text-xs whitespace-nowrap">{new Date(s.issued_at).toLocaleString()}</td>
                  <td className="py-2 pr-3 text-gray-400 text-xs whitespace-nowrap">{new Date(s.last_used).toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => revoke(s)}
                      disabled={busyId === s.id}
                      className="ks-btn-ghost text-xs px-2 py-1 rounded border border-white/10 text-red-300 hover:bg-red-900/30 disabled:opacity-40"
                    >
                      {busyId === s.id ? '…' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
};

export default Sessions;
