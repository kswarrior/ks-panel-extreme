import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { securitySnapshot, securityToggleAttack, securityGetConfig, securityUpdateConfig, securityDDOSReset, securityDDOSManualStop } from '@/shared/api/admin';
import type { SecuritySnapshot as SecuritySnapshotT, SecurityConfig } from '@/features/security/types/security';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import Firewall from '@/features/security/components/Firewall';
import DDoS from '@/features/security/components/DDoS';
import Authority from '@/features/security/components/Authority';
import {
  AUTHORITY_SECRET_KEEP,
  getAuthority,
  regenerateAppSecret,
  secretKeepOr,
  updateAuthority,
  type AuthorityConfig,
  type AuthorityProvider,
  type AuthorityRegistrationMode,
} from '@/features/authority/api/authority';
import { listRoles } from '@/shared/api/admin';
import type { Role } from '@/shared/types/user';

const REFRESH_MS = 15_000;

const SECURITY_TABS: Array<{ id: 'firewall' | 'ddos' | 'authority'; label: string }> = [
  { id: 'firewall', label: 'Fire Wall' },
  { id: 'ddos', label: 'DDoS' },
  { id: 'authority', label: 'Authority' },
];

const Security: React.FC = () => {
  const [snap, setSnap] = useState<SecuritySnapshotT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rpsHistory, setRpsHistory] = useState<number[]>([]);
  const [underAttack, setUnderAttack] = useState(false);
  const [tab, setTab] = useState<'firewall' | 'ddos' | 'authority'>('firewall');

  const [fwConfig, setFwConfig] = useState<SecurityConfig | null>(null);
  const [configVersion, setConfigVersion] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      const s = await securitySnapshot();
      setSnap(s);
      setUnderAttack(s.under_attack);
      const now = new Date();
      setLastUpdated(now);
      const avg = s.requests_per_second || 0;
      const cur = s.requests_per_second || 0;
      const peak = s.peak_rps || 0;
      setRpsHistory([avg * 0.7, avg * 0.9, avg * 1.1, avg * 0.8, cur, peak]);
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to load security snapshot');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFirewallConfig = useCallback(async () => {
    try {
      const cfg = await securityGetConfig();
      setFwConfig(cfg);
    } catch (e: any) {
      console.error('Failed to load firewall config', e);
    }
  }, []);

  const toggleAttack = useCallback(async (next: boolean) => {
    try {
      const res = await securityToggleAttack(next);
      setUnderAttack(res.under_attack);
      if (snap) setSnap({ ...snap, under_attack: res.under_attack });
    } catch (e: any) {
      setError(e?.response?.data || 'Failed to toggle attack status');
    }
  }, [snap]);

  const handleConfigChange = useCallback(() => {
    setConfigVersion((v) => v + 1);
    loadFirewallConfig();
  }, [loadFirewallConfig]);

  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    loadFirewallConfig().then(() => setConfigLoaded(true));
  }, [loadFirewallConfig]);

  if (!snap && loading) return <SkeletonGrid count={8} />;

  if (snap && !configLoaded) return <SkeletonGrid count={8} />;

  return (
    <div>
      {error && <p className="text-red-400 mb-3 text-sm">{error}</p>}

      {snap && configLoaded && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-xl font-semibold text-white shrink-0">Security</h2>
            <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
              {SECURITY_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`ks-tab shrink-0 transition-colors ${
                    tab === t.id ? 'ks-tab-active' : ''
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'firewall' && (
            <>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <span className="w-1 h-5 rounded bg-sky-400" />
                Fire Wall
              </h3>
              <Firewall
                key={tab}
                initialSnapshot={snap}
                initialConfig={fwConfig}
                onConfigChange={handleConfigChange}
              />
            </>
          )}

          {tab === 'ddos' && (
            <>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <span className="w-1 h-5 rounded bg-sky-400" />
                DDoS Protection
              </h3>
              <DDoS
                key={tab}
                initialSnapshot={snap}
                initialConfig={fwConfig}
                onConfigChange={handleConfigChange}
              />
            </>
          )}

          {tab === 'authority' && (
            <>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <span className="w-1 h-5 rounded bg-sky-400" />
                Authority
              </h3>
              <Authority
                key={tab}
                onConfigChange={handleConfigChange}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Security;