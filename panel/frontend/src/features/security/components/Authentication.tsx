import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAuthority,
  updateAuthority,
  type AuthorityConfig,
  type AuthorityRegistrationMode,
} from '@/features/authority/api/authority';
import { listRoles, securityGetLockout, securityUnlockAccount, securityRecoveryCodesStatus, securityGenerateRecoveryCodes } from '@/shared/api/admin';
import type { LockoutStatus, RecoveryCodesStatus, SecuritySnapshot } from '@/features/security/types/security';
import type { Role } from '@/shared/types/user';
import GlassCard from '@/shared/components/ui/Card';
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import NumberInput from '@/shared/components/ui/NumberInput';
import ToggleRow from '@/shared/components/ui/ToggleRow';
import TextInput from '@/shared/components/ui/TextInput';
import { useConfirm } from '@/shared/stores/confirmStore';

// Authentication — Security page tab owning every authentication POLICY
// setting: password policy + history, login protection (account lockout),
// registration security, MFA/TOTP behaviour, OTP policy and recovery
// codes. Provider credentials/secrets stay on the Authority tab — both
// tabs write through the same /api/authority round-trip, each patching
// only its own fields so nothing is duplicated or clobbered.

interface AuthenticationProps {
  initialSnapshot?: SecuritySnapshot | null;
  onConfigChange?: () => void;
}

const SectionTitle: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => (
  <div className="mb-3">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
    {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
  </div>
);

const StatTile: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
  <div className="ks-stat-card rounded-md">
    <div className="text-lg font-semibold text-white">{value}</div>
    <div className="text-[11px] text-gray-500 uppercase tracking-wide mt-0.5">{label}</div>
  </div>
);

const Authentication: React.FC<AuthenticationProps> = ({ initialSnapshot, onConfigChange }) => {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const cfgRef = useRef<AuthorityConfig | null>(null);

  // ── Password complexity policy (drives backend ValidatePassword) ──
  const [pwMinLength, setPwMinLength] = useState(12);
  const [pwMaxLength, setPwMaxLength] = useState(128);
  const [pwRequireUpper, setPwRequireUpper] = useState(true);
  const [pwMinUpper, setPwMinUpper] = useState(1);
  const [pwRequireLower, setPwRequireLower] = useState(true);
  const [pwMinLower, setPwMinLower] = useState(1);
  const [pwRequireNumber, setPwRequireNumber] = useState(true);
  const [pwMinNumber, setPwMinNumber] = useState(1);
  const [pwRequireSymbol, setPwRequireSymbol] = useState(true);
  const [pwMinSymbol, setPwMinSymbol] = useState(1);
  const [pwNoCommon, setPwNoCommon] = useState(true);
  const [pwNoPersonal, setPwNoPersonal] = useState(true);

  // ── Password history (reuse rejection on change) ──
  const [phEnabled, setPhEnabled] = useState(true);
  const [phMaxHistory, setPhMaxHistory] = useState(5);

  // ── Registration security ──
  const [registerAllow, setRegisterAllow] = useState(false);
  const [verifyRequired, setVerifyRequired] = useState(false);
  const [registerRole, setRegisterRole] = useState('user');
  const [deviceAccountLimit, setDeviceAccountLimit] = useState('0');
  const [roles, setRoles] = useState<Role[]>([]);
  const [registrationMode, setRegistrationMode] = useState<AuthorityRegistrationMode>('any');
  const [registrationN, setRegistrationN] = useState(1);
  const [registrationAllowed, setRegistrationAllowed] = useState<string[]>([]);

  // ── MFA / TOTP policy ──
  const [appEnabled, setAppEnabled] = useState(false);
  const [appIssuer, setAppIssuer] = useState('KS Panel');
  const [appPinSize, setAppPinSize] = useState(6);
  const [appRotationSeconds, setAppRotationSeconds] = useState(30);
  const [appDigitsInWindow, setAppDigitsInWindow] = useState(1);

  // ── OTP policy (delivery credentials live on the Authority tab) ──
  const [otpEmailEnabled, setOtpEmailEnabled] = useState(false);
  const [otpPhoneEnabled, setOtpPhoneEnabled] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState(false);
  const [codeLength, setCodeLength] = useState(6);
  const [ttlSeconds, setTtlSeconds] = useState(300);

  // ── Login protection / recovery codes status ──
  const [lockout, setLockout] = useState<LockoutStatus | null>(null);
  const [lockBusy, setLockBusy] = useState('');
  const [recovery, setRecovery] = useState<RecoveryCodesStatus | null>(null);
  const [recoveryUser, setRecoveryUser] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryError, setRecoveryError] = useState('');

  function hydrate(cfg: AuthorityConfig) {
    cfgRef.current = cfg;
    if (cfg.password_policy) {
      setPwMinLength(Number(cfg.password_policy.min_length) || 12);
      setPwMaxLength(Number(cfg.password_policy.max_length) || 128);
      setPwRequireUpper(!!cfg.password_policy.require_upper);
      setPwMinUpper(Number(cfg.password_policy.min_upper) || 0);
      setPwRequireLower(!!cfg.password_policy.require_lower);
      setPwMinLower(Number(cfg.password_policy.min_lower) || 0);
      setPwRequireNumber(!!cfg.password_policy.require_number);
      setPwMinNumber(Number(cfg.password_policy.min_number) || 0);
      setPwRequireSymbol(!!cfg.password_policy.require_symbol);
      setPwMinSymbol(Number(cfg.password_policy.min_symbol) || 0);
      setPwNoCommon(!!cfg.password_policy.no_common);
      setPwNoPersonal(!!cfg.password_policy.no_personal);
    }
    if (cfg.password_history) {
      setPhEnabled(!!cfg.password_history.enabled);
      setPhMaxHistory(Number(cfg.password_history.max_history) || 5);
    }
    setRegisterAllow(cfg.register_allow === '1');
    setVerifyRequired(cfg.verify_required === '1');
    setRegisterRole(cfg.register_role || 'user');
    setDeviceAccountLimit(String(cfg.device_account_limit ?? '0'));
    setRegistrationMode(cfg.registration_mode ?? 'any');
    setRegistrationN(Number(cfg.registration_minimum_n) || 1);
    setRegistrationAllowed(cfg.registration_allowed_providers ?? []);
    setAppEnabled(!!cfg.app_connect?.enabled);
    setAppIssuer(cfg.app_connect?.issuer || 'KS Panel');
    setAppPinSize(Number(cfg.app_connect?.pin_size) || 6);
    setAppRotationSeconds(Number(cfg.app_connect?.rotation_seconds) || 30);
    setAppDigitsInWindow(Number(cfg.app_connect?.digits_in_window) || 1);
    setOtpEmailEnabled(!!cfg.otp?.email_enabled);
    setOtpPhoneEnabled(!!cfg.otp?.phone_enabled);
    setMagicLinkEmail(!!cfg.otp?.magic_link_email);
    setCodeLength(Number(cfg.otp?.code_length) || 6);
    setTtlSeconds(Number(cfg.otp?.ttl_seconds) || 300);
  }

  const load = useCallback(async () => {
    setError('');
    try {
      hydrate(await getAuthority());
    } catch (e: any) {
      setError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to load authentication settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    listRoles().then((rs) => setRoles(rs.filter((r) => r.name !== 'admin'))).catch(() => {});
    securityGetLockout().then(setLockout).catch(() => {});
    securityRecoveryCodesStatus().then(setRecovery).catch(() => {});
  }, [load]);

  function toggleInAllowed(id: string) {
    setRegistrationAllowed((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    let fresh: AuthorityConfig | null = null;
    try {
      fresh = await getAuthority();
      cfgRef.current = fresh;
    } catch {
      // Fall back to stale ref on transient failure.
    }
    const base = fresh ?? cfgRef.current;
    if (!base) {
      setError('Configuration not loaded yet.');
      setSaving(false);
      return;
    }
    const limitStr = (deviceAccountLimit || '0').trim();
    if (!/^\d+$/.test(limitStr)) {
      setError('Accounts per device must be a non-negative number (0 = unlimited)');
      setSaving(false);
      return;
    }

    // Patch ONLY authentication-policy fields onto the freshly loaded
    // config; provider credentials / SMTP / SMS secrets flow through
    // untouched so this save cannot clobber the Authority tab.
    const body: AuthorityConfig = {
      ...base,
      register_allow: registerAllow ? '1' : '0',
      register_role: registerRole,
      device_account_limit: limitStr,
      verify_required: verifyRequired ? '1' : '0',
      registration_mode: registrationMode,
      registration_minimum_n: registrationN,
      registration_allowed_providers: registrationAllowed,
      app_connect: {
        ...base.app_connect!,
        enabled: appEnabled,
        issuer: appIssuer.trim() || 'KS Panel',
        pin_size: appPinSize,
        rotation_seconds: appRotationSeconds,
        digits_in_window: appDigitsInWindow,
      },
      otp: {
        ...base.otp!,
        email_enabled: otpEmailEnabled,
        phone_enabled: otpPhoneEnabled,
        magic_link_email: magicLinkEmail,
        code_length: codeLength,
        ttl_seconds: ttlSeconds,
      },
      password_policy: {
        min_length: pwMinLength,
        max_length: pwMaxLength,
        require_upper: pwRequireUpper,
        min_upper: pwMinUpper,
        require_lower: pwRequireLower,
        min_lower: pwMinLower,
        require_number: pwRequireNumber,
        min_number: pwMinNumber,
        require_symbol: pwRequireSymbol,
        min_symbol: pwMinSymbol,
        no_common: pwNoCommon,
        no_personal: pwNoPersonal,
      },
      password_history: {
        enabled: phEnabled,
        max_history: phMaxHistory < 1 ? 5 : Math.floor(phMaxHistory),
      },
    };

    try {
      hydrate(await updateAuthority(body));
      setSuccess('Saved.');
      onConfigChange?.();
    } catch (e: any) {
      setError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to save authentication settings');
    } finally {
      setSaving(false);
    }
  }

  async function unlock(username: string) {
    if (!(await confirm({ title: 'Unlock account', message: `Unlock account "${username}" and clear its failed attempts?`, tone: 'default', confirmLabel: 'Unlock' }))) return;
    setLockBusy(username);
    try {
      await securityUnlockAccount(username);
      await securityGetLockout().then(setLockout);
    } catch (e: any) {
      setRecoveryError(typeof e?.response?.data === 'string' ? e.response.data : 'Failed to unlock account');
    } finally {
      setLockBusy('');
    }
  }

  async function generateCodes() {
    setRecoveryError('');
    setRecoveryCodes([]);
    const username = recoveryUser.trim();
    if (!username) {
      setRecoveryError('Enter a username first.');
      return;
    }
    if (!(await confirm({ title: 'Generate recovery codes', message: `Generate a NEW recovery-code set for "${username}"? All previous codes for this user stop working.`, tone: 'warning', confirmLabel: 'Generate' }))) {
      return;
    }
    try {
      const res = await securityGenerateRecoveryCodes(username);
      setRecoveryCodes(res.codes);
      setRecoveryUser('');
      securityRecoveryCodesStatus().then(setRecovery).catch(() => {});
    } catch (e: any) {
      setRecoveryError(
        typeof e?.response?.data === 'string' && e.response.data
          ? e.response.data
          : e?.response?.status === 404
            ? 'User not found.'
            : 'Failed to generate recovery codes',
      );
    }
  }

  if (loading) return <SkeletonGrid count={8} />;

  return (
    <form onSubmit={submit} className="space-y-6 max-w-3xl">
      {recoveryCodes.length > 0 && (
        <GlassCard>
          <div className="text-sm font-semibold text-emerald-300">New Recovery Codes</div>
          <div className="text-xs text-emerald-400 mt-1 mb-2">
            Copy these now — they are shown once and stored only as hashes.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs text-emerald-200 break-all">
            {recoveryCodes.map((c) => (
              <code key={c} className="bg-black/40 px-2 py-1 rounded">{c}</code>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ── Password policy ─────────────────────────────────────────── */}
      <GlassCard variant="form">
        <SectionTitle
          title="Password Policy"
          sub="Rules for every password set via the password provider — new accounts, admin resets and self-service changes. Leave a toggle off to skip that character class."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NumberInput id="pw-min-length" label="Minimum length" value={pwMinLength} onChange={setPwMinLength} min={1} max={256} />
          <NumberInput id="pw-max-length" label="Maximum length" value={pwMaxLength} onChange={setPwMaxLength} min={1} max={512} />
        </div>

        <div className="space-y-3 border-t border-white/10 pt-4 mt-4">
          <ToggleRow id="pw-require-upper" label="Require uppercase letter" description="Reject passwords with no A–Z characters." checked={pwRequireUpper} onChange={setPwRequireUpper} />
          {pwRequireUpper && <NumberInput id="pw-min-upper" label="Minimum uppercase characters" value={pwMinUpper} onChange={setPwMinUpper} min={1} max={32} />}
          <ToggleRow id="pw-require-lower" label="Require lowercase letter" description="Reject passwords with no a–z characters." checked={pwRequireLower} onChange={setPwRequireLower} />
          {pwRequireLower && <NumberInput id="pw-min-lower" label="Minimum lowercase characters" value={pwMinLower} onChange={setPwMinLower} min={1} max={32} />}
          <ToggleRow id="pw-require-number" label="Require number" description="Reject passwords with no 0–9 characters." checked={pwRequireNumber} onChange={setPwRequireNumber} />
          {pwRequireNumber && <NumberInput id="pw-min-number" label="Minimum number characters" value={pwMinNumber} onChange={setPwMinNumber} min={1} max={32} />}
          <ToggleRow id="pw-require-symbol" label="Require symbol" description="Reject passwords with no punctuation / symbol characters." checked={pwRequireSymbol} onChange={setPwRequireSymbol} />
          {pwRequireSymbol && <NumberInput id="pw-min-symbol" label="Minimum symbol characters" value={pwMinSymbol} onChange={setPwMinSymbol} min={1} max={32} />}
          <ToggleRow id="pw-no-common" label="Block common passwords" description="Reject passwords from the bundled common-password list and obvious keyboard / sequential patterns." checked={pwNoCommon} onChange={setPwNoCommon} />
          <ToggleRow id="pw-no-personal" label="Block personal info" description="Reject passwords that contain the user's username or email." checked={pwNoPersonal} onChange={setPwNoPersonal} />
        </div>

        <div className="border-t border-white/[0.06] pt-4 mt-4 space-y-4">
          <ToggleRow
            id="pw-history-enabled"
            label="Password History"
            description="Reject new passwords that match any of the user's recent previous passwords (checked on every change)."
            checked={phEnabled}
            onChange={setPhEnabled}
          />
          <div className={phEnabled ? '' : 'opacity-50 pointer-events-none'}>
            <NumberInput
              id="pw-history-max"
              label="Remembered Previous Passwords"
              value={phMaxHistory}
              onChange={setPhMaxHistory}
              min={1}
              max={24}
            />
          </div>
        </div>
      </GlassCard>

      {/* ── Login protection / account lockout ─────────────────────── */}
      <GlassCard>
        <SectionTitle
          title="Login Protection — Account Lockout"
          sub="Repeated failed logins temporarily lock the identifier. Thresholds are fixed per process; locked accounts can be released manually below."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatTile value={lockout?.max_attempts ?? '—'} label="Attempts before lock" />
          <StatTile value={lockout ? `${lockout.window_minutes}m` : '—'} label="Attempt reset window" />
          <StatTile value={lockout ? `${lockout.lockout_minutes}m` : '—'} label="Lock duration" />
        </div>
        {(initialSnapshot?.failed_login_attempts ?? 0) > 0 && (
          <p className="text-xs text-gray-500 mb-3">
            {initialSnapshot?.failed_login_attempts} failed login(s) recorded in the current telemetry window.
          </p>
        )}
        {lockout && lockout.locked.length > 0 && (
          <ul className="divide-y divide-white/5">
            {lockout.locked.map((l) => (
              <li key={l.username} className="flex items-center gap-3 py-2">
                <span className="text-sm text-gray-200 truncate">{l.username}</span>
                <span className="text-[11px] text-gray-500">since {new Date(l.locked_at).toLocaleTimeString()}</span>
                <button
                  type="button"
                  onClick={() => unlock(l.username)}
                  disabled={lockBusy === l.username}
                  className="ml-auto ks-btn-ghost text-xs px-2 py-1 rounded border border-white/10 text-amber-300 hover:bg-white/10 disabled:opacity-40"
                >
                  {lockBusy === l.username ? 'Unlocking…' : 'Unlock'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {lockout && lockout.locked.length === 0 && (
          <p className="text-xs text-gray-400">No accounts are currently locked.</p>
        )}
      </GlassCard>

      {/* ── Registration security ───────────────────────────────────── */}
      <GlassCard variant="form">
        <SectionTitle
          title="Registration Security"
          sub="Control who can create accounts, which role they land in, how many accounts a single device may spawn, and whether new accounts must confirm their email before signing in."
        />
        <div className="space-y-4">
          <ToggleRow
            id="register-allow"
            label="Allow Registration"
            description="When enabled the login page shows a 'Create new account' link and self-service accounts can be registered."
            checked={registerAllow}
            onChange={setRegisterAllow}
          />
          <div className={registerAllow ? '' : 'opacity-50 pointer-events-none'}>
            <label htmlFor="register-role" className="block text-sm font-medium text-gray-300 mb-1">Default Role for New Accounts</label>
            <p className="text-xs text-gray-500 mb-2">
              The "admin" role is intentionally hidden — admins are minted through the Users admin page.
            </p>
            <select
              id="register-role"
              value={registerRole}
              onChange={(e) => setRegisterRole(e.target.value)}
              className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            >
              <option value="user">user</option>
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}{r.display_name ? ` — ${r.display_name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className={registerAllow ? '' : 'opacity-50 pointer-events-none'}>
            <label htmlFor="device-account-limit" className="block text-sm font-medium text-gray-300 mb-1">Accounts per Device</label>
            <p className="text-xs text-gray-500 mb-2">
              Max self-registered accounts per browser/device cookie. <code className="text-gray-400">0</code> = unlimited.
            </p>
            <input
              id="device-account-limit"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={deviceAccountLimit}
              onChange={(e) => setDeviceAccountLimit(e.target.value)}
              placeholder="0 (unlimited)"
              className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            />
          </div>
          <ToggleRow
            id="verify-required"
            label="Email Verification Required"
            description="Freshly-registered accounts must verify their email before signing in. Requires SMTP on the Authority tab."
            checked={verifyRequired}
            onChange={setVerifyRequired}
          />

          <div className="pt-2 border-t border-white/[0.06] space-y-3">
            <label htmlFor="registration-mode" className="block text-sm font-medium text-gray-300">Registration Mode</label>
            <select
              id="registration-mode"
              value={registrationMode}
              onChange={(e) => setRegistrationMode(e.target.value as AuthorityRegistrationMode)}
              className="w-full max-w-xs bg-black/30 backdrop-blur-md text-white border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            >
              <option value="any">Any enabled provider (default)</option>
              <option value="n">N of allowed providers</option>
              <option value="all">All allowed providers</option>
            </select>

            {(registrationMode === 'n' || registrationMode === 'all') && (
              <>
                <label htmlFor="registration-n" className="block text-sm font-medium text-gray-300">Minimum N (for "N of allowed")</label>
                <input
                  id="registration-n"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={registrationN}
                  onChange={(e) => setRegistrationN(Number(e.target.value))}
                  className="w-full max-w-xs bg-black/30 backdrop-blur-md text-white border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
                />
                <div className="ks-card ks-form-card rounded">
                  <p className="text-xs text-gray-400 mb-2">
                    Select which enabled providers (managed on the Authority tab) count toward the requirement.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(cfgRef.current?.providers ?? [])
                      .filter((p) => p.enabled)
                      .map((p) => (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer select-none transition-colors ${
                            registrationAllowed.includes(p.id)
                              ? 'border-emerald-600/60 bg-emerald-800/20 text-emerald-200'
                              : 'border-white/[0.06] bg-black/20 text-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={registrationAllowed.includes(p.id)}
                            onChange={() => toggleInAllowed(p.id)}
                            className="accent-emerald-500"
                          />
                          <span className="truncate capitalize">{p.id}</span>
                        </label>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ── MFA / TOTP ──────────────────────────────────────────────── */}
      <GlassCard variant="form">
        <SectionTitle
          title="MFA / TOTP"
          sub="Built-in RFC 6238 TOTP for authenticator apps (Google Authenticator, 2FAS, Aegis, …). The shared secret is issued under App Secrets on the Authority tab."
        />
        <div className="space-y-4">
          <ToggleRow
            id="app-enabled"
            label="Enable Authenticator App (TOTP)"
            description="When on, users can link an authenticator app from their profile page."
            checked={appEnabled}
            onChange={setAppEnabled}
          />
          <div className={appEnabled ? 'space-y-4' : 'opacity-50 pointer-events-none space-y-4'}>
            <TextInput
              id="app-issuer"
              label="Issuer Name"
              value={appIssuer}
              onChange={setAppIssuer}
              placeholder="KS Panel"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumberInput id="app-pin-size" label="PIN Size (digits)" value={appPinSize} onChange={setAppPinSize} min={6} max={8} />
              <NumberInput id="app-rotation-seconds" label="Rotation Interval (seconds)" value={appRotationSeconds} onChange={setAppRotationSeconds} min={15} max={120} />
              <NumberInput id="app-digits-in-window" label="Valid Digits in Window (±N rotations)" value={appDigitsInWindow} onChange={setAppDigitsInWindow} min={1} max={3} />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── OTP policy ──────────────────────────────────────────────── */}
      <GlassCard variant="form">
        <SectionTitle
          title="OTP Policy"
          sub="One-time passcode behaviour for email and SMS channels. Delivery credentials (SMTP / SMS gateway) live on the Authority tab."
        />
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ToggleRow id="otp-email-enabled" label="Email OTP Enabled" description="Allow one-time codes to be sent via email." checked={otpEmailEnabled} onChange={setOtpEmailEnabled} />
            <ToggleRow id="otp-phone-enabled" label="Phone (SMS) OTP Enabled" description="Allow one-time codes to be sent via SMS." checked={otpPhoneEnabled} onChange={setOtpPhoneEnabled} />
          </div>
          <ToggleRow id="magic-link-email" label="Email Magic Links" description="Send clickable magic links instead of numeric codes for email OTP." checked={magicLinkEmail} onChange={setMagicLinkEmail} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberInput id="otp-code-length" label="Code Length" value={codeLength} onChange={setCodeLength} min={4} max={10} />
            <NumberInput id="otp-ttl-seconds" label="Code TTL (seconds)" value={ttlSeconds} onChange={setTtlSeconds} min={30} max={3600} />
          </div>
        </div>
      </GlassCard>

      {/* ── Recovery codes ──────────────────────────────────────────── */}
      <GlassCard variant="form">
        <SectionTitle
          title="Recovery Codes"
          sub="Single-use backup codes stored only as bcrypt hashes. Generating a new set invalidates all of the user's previous codes."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <StatTile value={recovery?.users_with_codes ?? 0} label="Users with codes" />
          <StatTile value={recovery?.unused_codes ?? 0} label="Unused codes remaining" />
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <TextInput
              id="recovery-user"
              label="Username or email"
              value={recoveryUser}
              onChange={setRecoveryUser}
              placeholder="user to (re)generate codes for"
            />
          </div>
          <button
            type="button"
            onClick={generateCodes}
            className="ks-primary-btn inline-flex items-center gap-2 px-4 py-2 rounded text-sm"
          >
            Generate Codes
          </button>
        </div>
        {recoveryError && <p className="text-sm text-red-400 mt-2">{recoveryError}</p>}
      </GlassCard>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">{success}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-60"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12" /></svg>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
};

export default Authentication;
