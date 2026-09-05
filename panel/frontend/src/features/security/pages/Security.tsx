import React, { useCallback, useEffect, useState } from 'react';
import { securitySnapshot, securityToggleAttack, securityGetConfig } from '@/shared/api/admin';
import type { SecuritySnapshot as SecuritySnapshotT, SecurityConfig } from '@/features/security/types/security';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import SectionRailTabs from '@/shared/components/ui/SectionRailTabs';
import Firewall from '@/features/security/components/Firewall';
import DDoS from '@/features/security/components/DDoS';
import Authority from '@/features/security/components/Authority';
import Authentication from '@/features/security/components/Authentication';
import Sessions from '@/features/security/components/Sessions';

const REFRESH_MS = 15_000;

type SecurityTabId = 'firewall' | 'ddos' | 'authority' | 'authentication' | 'sessions';

interface SecurityTabDef {
  id: SecurityTabId;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

const SECURITY_TABS: SecurityTabDef[] = [
  { id: 'firewall', label: 'Firewall', hint: 'IP lists, rate limits, WAF', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
  )},
  { id: 'ddos', label: 'DDoS', hint: 'Under attack, auto-stop, port switch', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
  )},
  { id: 'authority', label: 'Authority', hint: 'App secrets & providers', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  )},
  { id: 'authentication', label: 'Authentication', hint: 'Password, lockout, MFA policy', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  )},
  { id: 'sessions', label: 'Sessions', hint: 'Devices, lifetime, revocation', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
  )},
];

const Security: React.FC = () => {
  const [snap, setSnap] = useState<SecuritySnapshotT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rpsHistory, setRpsHistory] = useState<number[]>([]);
  const [underAttack, setUnderAttack] = useState(false);
  const [tab, setTab] = useState<SecurityTabId>('firewall');

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

  const [configLoaded, setConfigLoaded] = useState(false);

  const loadFirewallConfig = useCallback(async () => {
    try {
      const cfg = await securityGetConfig();
      setFwConfig(cfg);
      setConfigLoaded(true);
    } catch (e: any) {
      console.error('Failed to load firewall config', e);
      setConfigLoaded(true);
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

  const handleConfigChange = useCallback(async () => {
    setConfigVersion((v) => v + 1);
    await Promise.all([loadFirewallConfig(), load()]);
  }, [loadFirewallConfig, load]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    loadFirewallConfig();
  }, [loadFirewallConfig]);

  if (!snap && loading) return <SkeletonGrid count={8} />;

  if (snap && !configLoaded) return <SkeletonGrid count={8} />;

  return (
    <div>
      {error && <p className="text-red-400 mb-3 text-sm">{error}</p>}

      {snap && configLoaded && (
        <div className="space-y-6">
          {/* Title lives in the app header ("Security"); internal sections use
              the shared section rail (same style as Database): one
              icon+label+hint strip on every breakpoint — phones scroll it
              horizontally. */}
          <SectionRailTabs
            ariaLabel="Security sections"
            active={tab}
            onChange={(id) => setTab(id as SecurityTabId)}
            tabs={SECURITY_TABS}
          />

          <div>
              {tab === 'firewall' && (
                <Firewall
                  key={`${tab}-${configVersion}`}
                  initialConfig={fwConfig}
                  onConfigChange={handleConfigChange}
                />
              )}

              {tab === 'ddos' && (
                <DDoS
                  key={`${tab}-${configVersion}`}
                  initialSnapshot={snap}
                  initialConfig={fwConfig}
                  onConfigChange={handleConfigChange}
                  onAttackToggle={(next) => {
                    setUnderAttack(next);
                    if (snap) setSnap({ ...snap, under_attack: next });
                  }}
                />
              )}

              {tab === 'authority' && (
                <Authority
                  key={tab}
                  onConfigChange={handleConfigChange}
                />
              )}

              {tab === 'authentication' && (
                <Authentication
                  key={tab}
                  initialSnapshot={snap}
                  onConfigChange={handleConfigChange}
                />
              )}

              {tab === 'sessions' && (
                <Sessions
                  key={`${tab}-${configVersion}`}
                  initialConfig={fwConfig}
                  onConfigChange={handleConfigChange}
                />
              )}
            </div>
        </div>
      )}
    </div>
  );
};

export default Security;