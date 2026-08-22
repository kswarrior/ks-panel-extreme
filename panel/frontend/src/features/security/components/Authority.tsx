import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import SkeletonGrid from '@/shared/components/ui/SkeletonGrid';
import NumberInput from '@/shared/components/ui/NumberInput';
import ToggleRow from '@/shared/components/ui/ToggleRow';
import TextInput from '@/shared/components/ui/TextInput';

const SMTP_PASSWORD_KEEP = AUTHORITY_SECRET_KEEP;

type ProviderKind = 'oauth' | 'channel';
interface ProviderDef {
  id: string;
  label: string;
  description: string;
  kind: ProviderKind;
}

const PROVIDER_DEFS: ProviderDef[] = [
  {
    id: 'google',
    label: 'Google',
    description: 'Email link OAuth ("Sign in with Google"). Pairs with a Google Cloud project client ID + secret.',
    kind: 'oauth',
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    description: 'Microsoft / Azure AD ("Sign in with Microsoft"). Verify the redirect URI matches the Azure app registration.',
    kind: 'oauth',
  },
  {
    id: 'apple',
    label: 'Apple',
    description: 'Apple "Sign in with Apple". Requires an Apple Developer Service ID + private key.',
    kind: 'oauth',
  },
  {
    id: 'discord',
    label: 'Discord',
    description: 'Discord OAuth. Set the OAuth2 redirect in the Discord developer portal to the Redirect URI below.',
    kind: 'oauth',
  },
  {
    id: 'github',
    label: 'GitHub',
    description: 'GitHub OAuth ("Continue with GitHub"). Add the OAuth callback URL to your GitHub App.',
    kind: 'oauth',
  },
  {
    id: 'email',
    label: 'Email OTP',
    description: 'Passwordless email magic-link or one-time code. Uses the SMTP server config below to send codes.',
    kind: 'channel',
  },
  {
    id: 'phone',
    label: 'Phone (SMS OTP)',
    description: 'SMS-delivered one-time code to a phone number. Requires the SMS gateway credentials below.',
    kind: 'channel',
  },
  {
    id: 'totp',
    label: 'TOTP / Authenticator app',
    description: 'RFC 6238 auto-rotating PIN backed by the Authority app connection shared secret. Pairs with Google / 2FAS / Aegis.',
    kind: 'channel',
  },
  {
    id: 'password',
    label: 'Password',
    description: 'Classic username + password. Keeping this enabled preserves the legacy sign-in flow.',
    kind: 'channel',
  },
];

function providerLabel(id: string): string {
  const def = PROVIDER_DEFS.find((p) => p.id === id);
  return def ? def.label : id;
}

interface AuthorityProps {
  onConfigChange?: () => void;
}

const Authority: React.FC<AuthorityProps> = ({ onConfigChange }) => {
  const [authLoading, setAuthLoading] = useState(true);
  const [authSaving, setAuthSaving] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [appSecretToast, setAppSecretToast] = useState('');

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');

  const [registerAllow, setRegisterAllow] = useState(false);
  const [verifyRequired, setVerifyRequired] = useState(false);
  const [registerRole, setRegisterRole] = useState('user');
  const [deviceAccountLimit, setDeviceAccountLimit] = useState('0');
  const [roles, setRoles] = useState<Role[]>([]);

  const [providers, setProviders] = useState<AuthorityProvider[]>([]);

  const [registrationMode, setRegistrationMode] = useState<AuthorityRegistrationMode>('any');
  const [registrationN, setRegistrationN] = useState(1);
  const [registrationAllowed, setRegistrationAllowed] = useState<string[]>([]);

  const [otpEmailEnabled, setOtpEmailEnabled] = useState(false);
  const [otpPhoneEnabled, setOtpPhoneEnabled] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState(false);
  const [codeLength, setCodeLength] = useState(6);
  const [ttlSeconds, setTtlSeconds] = useState(300);
  const [smsGateway, setSmsGateway] = useState('');
  const [smsAccountSid, setSmsAccountSid] = useState('');
  const [smsApiToken, setSmsApiToken] = useState('');
  const [smsFromNumber, setSmsFromNumber] = useState('');

  const [appEnabled, setAppEnabled] = useState(false);
  const [appSecretMasked, setAppSecretMasked] = useState('');
  const [appSecretDraft, setAppSecretDraft] = useState('');
  const [appIssuer, setAppIssuer] = useState('KS Panel');
  const [appPinSize, setAppPinSize] = useState(6);
  const [appRotationSeconds, setAppRotationSeconds] = useState(30);
  const [appDigitsInWindow, setAppDigitsInWindow] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getAuthority();
        hydrate(cfg);
      } catch (e: any) {
        setAuthError(e?.response?.data || 'Failed to load authority settings');
      } finally {
        setAuthLoading(false);
      }
      try {
        const rs = await listRoles();
        setRoles(rs.filter((r) => r.name !== 'admin'));
      } catch {
      }
    })();
  }, []);

  function hydrate(cfg: AuthorityConfig) {
    setSmtpHost(cfg.smtp_host || '');
    setSmtpPort(cfg.smtp_port || '');
    setSmtpUser(cfg.smtp_user || '');
    setSmtpFrom(cfg.smtp_from || '');
    setSmtpPassword('');
    setRegisterAllow(cfg.register_allow === '1');
    setVerifyRequired(cfg.verify_required === '1');
    setRegisterRole(cfg.register_role || 'user');
    setDeviceAccountLimit(String(cfg.device_account_limit ?? '0'));
    setProviders(sanitizeProviders(cfg.providers ?? []));
    setRegistrationMode(cfg.registration_mode ?? 'any');
    setRegistrationN(Number(cfg.registration_minimum_n) || 1);
    setRegistrationAllowed(cfg.registration_allowed_providers ?? []);
    setOtpEmailEnabled(!!cfg.otp?.email_enabled);
    setOtpPhoneEnabled(!!cfg.otp?.phone_enabled);
    setMagicLinkEmail(!!cfg.otp?.magic_link_email);
    setCodeLength(Number(cfg.otp?.code_length) || 6);
    setTtlSeconds(Number(cfg.otp?.ttl_seconds) || 300);
    setSmsGateway(cfg.otp?.sms_gateway || '');
    setSmsAccountSid(cfg.otp?.sms_account_sid || '');
    setSmsApiToken('');
    setSmsFromNumber(cfg.otp?.sms_from_number || '');
    setAppEnabled(!!cfg.app_connect?.enabled);
    setAppSecretMasked(cfg.app_connect?.secret || '');
    setAppSecretDraft('');
    setAppIssuer(cfg.app_connect?.issuer || 'KS Panel');
    setAppPinSize(Number(cfg.app_connect?.pin_size) || 6);
    setAppRotationSeconds(Number(cfg.app_connect?.rotation_seconds) || 30);
    setAppDigitsInWindow(Number(cfg.app_connect?.digits_in_window) || 1);
  }

  function sanitizeProviders(src: AuthorityProvider[]): AuthorityProvider[] {
    if (src.length === 0) {
      return PROVIDER_DEFS.map((def) => ({
        id: def.id,
        enabled: def.id === 'password',
        client_id: '',
        client_secret: '',
        scopes: '',
        redirect_uri: '',
      }));
    }
    const seen = new Set(src.map((p) => p.id));
    const merged = [...src];
    for (const def of PROVIDER_DEFS) {
      if (!seen.has(def.id)) {
        merged.push({
          id: def.id,
          enabled: def.id === 'password',
          client_id: '',
          client_secret: '',
          scopes: '',
          redirect_uri: '',
        });
      }
    }
    return merged.sort(
      (a, b) =>
        PROVIDER_DEFS.findIndex((p) => p.id === a.id) -
        PROVIDER_DEFS.findIndex((p) => p.id === b.id),
    );
  }

  function setProviderField(
    id: string,
    patch: Partial<AuthorityProvider>,
  ) {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  const enabledProviders = useMemo(
    () => providers.filter((p) => p.enabled),
    [providers],
  );

  function toggleInAllowed(id: string) {
    setRegistrationAllowed((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function collectBody(): AuthorityConfig {
    const body: AuthorityConfig = {
      smtp_host: smtpHost.trim(),
      smtp_port: smtpPort.trim(),
      smtp_user: smtpUser.trim(),
      smtp_password: smtpPassword ? smtpPassword : SMTP_PASSWORD_KEEP,
      smtp_from: smtpFrom.trim(),
      register_allow: registerAllow ? '1' : '0',
      register_role: registerRole,
      device_account_limit: (deviceAccountLimit || '0').trim(),
      verify_required: verifyRequired ? '1' : '0',
      providers: providers.map((p) => ({
        ...p,
        client_secret: p.client_secret ? p.client_secret : secretKeepOr(p.client_secret),
      })),
      registration_mode: registrationMode,
      registration_minimum_n: registrationN,
      registration_allowed_providers: registrationAllowed,
      otp: {
        email_enabled: otpEmailEnabled,
        phone_enabled: otpPhoneEnabled,
        magic_link_email: magicLinkEmail,
        code_length: codeLength,
        ttl_seconds: ttlSeconds,
        sms_gateway: smsGateway.trim(),
        sms_account_sid: smsAccountSid.trim(),
        sms_api_token: smsApiToken ? smsApiToken : secretKeepOr(smsApiToken),
        sms_from_number: smsFromNumber.trim(),
      },
      app_connect: {
        enabled: appEnabled,
        secret: appSecretDraft ? appSecretDraft : AUTHORITY_SECRET_KEEP,
        issuer: appIssuer.trim() || 'KS Panel',
        pin_size: appPinSize,
        rotation_seconds: appRotationSeconds,
        digits_in_window: appDigitsInWindow,
      },
    };
    return body;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAuthSaving(true);
    setAuthError('');
    setAuthSuccess('');
    setAppSecretToast('');
    try {
      const limitStr = (deviceAccountLimit || '0').trim();
      if (!/^\d+$/.test(limitStr)) {
        setAuthError('Accounts per device must be a non-negative number (0 = unlimited)');
        setAuthSaving(false);
        return;
      }
      if (registrationMode === 'n') {
        const allowedCount =
          registrationAllowed.length || enabledProviders.length;
        if (registrationN < 1 || registrationN > allowedCount) {
          setAuthError(
            `When "N of allowed" is selected, the count must be between 1 and ${allowedCount}.`,
          );
          setAuthSaving(false);
          return;
        }
      }
      const cfg = await updateAuthority(collectBody());
      hydrate(cfg);
      setAuthSuccess('Saved.');
      onConfigChange?.();
    } catch (e: any) {
      setAuthError(e?.response?.data || 'Failed to save authority settings');
    } finally {
      setAuthSaving(false);
    }
  }

  async function regenerateSecret() {
    if (!confirm('Regenerate the Authority app secret? Existing authenticator apps will need to be re-scanned.')) {
      return;
    }
    setAuthError('');
    setAuthSuccess('');
    try {
      const newSecret = await regenerateAppSecret();
      setAppSecretDraft('');
      setAppSecretMasked('configured');
      setAppSecretToast(newSecret);
      setAppEnabled(true);
    } catch (e: any) {
      setAuthError(e?.response?.data || 'Failed to regenerate app secret');
    }
  }

  if (authLoading) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Authority</h2>
        <SkeletonGrid count={6} />
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="glass-card rounded-xl space-y-10 max-w-3xl"
    >
      {appSecretToast && (
        <div className="ks-card ks-form-card rounded-xl bg-emerald-900/30 border-emerald-600/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-300">New App Secret Generated</div>
              <div className="text-xs text-emerald-400 mt-1">Copy this now — it will not be shown again.</div>
            </div>
            <code className="bg-black/40 px-3 py-1 rounded font-mono text-xs text-emerald-200 break-all max-w-xs">
              {appSecretToast}
            </code>
          </div>
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Auth — SMTP
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          The mail server the panel uses to send email verification codes
          and email OTP magic links. Configure this before enabling
          "Email Verification Required" or email OTP below.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput id="smtp-host" label="SMTP Host" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.example.com" />
          <TextInput id="smtp-port" label="SMTP Port" value={smtpPort} onChange={setSmtpPort} placeholder="587 (or 465 for implicit TLS)" />
          <TextInput id="smtp-user" label="SMTP Username" value={smtpUser} onChange={setSmtpUser} placeholder="apikey or username (leave blank for no auth)" />
          <TextInput id="smtp-password" label="SMTP Password" type="password" value={smtpPassword} onChange={setSmtpPassword} placeholder="leave blank to keep current" />
          <div className="sm:col-span-2">
            <TextInput id="smtp-from" label="From Address" value={smtpFrom} onChange={setSmtpFrom} placeholder="KSPANEL <kspanel@example.com>" />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Registration & access
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Control who can create accounts, which role they land in, how
          many accounts a single device may spawn, and whether new
          accounts must confirm their email before signing in.
        </p>
        <div className="space-y-4">
          <ToggleRow
            id="register-allow"
            label="Allow Registration"
            description="When enabled the login page shows a 'Create new account' link and self-service accounts can be registered. Provider gates below further restrict who can land an account."
            checked={registerAllow}
            onChange={setRegisterAllow}
          />
          <div className={registerAllow ? '' : 'opacity-50 pointer-events-none'}>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="register-role">
              Default Role for New Accounts
            </label>
            <p className="text-xs text-gray-500 mb-2">
              The role self-registered users are assigned. The "admin" role is intentionally hidden — admins can only be minted through the Users admin page.
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
                  {r.name}
                  {r.display_name ? ` — ${r.display_name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className={registerAllow ? '' : 'opacity-50 pointer-events-none'}>
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="device-account-limit">
              Accounts per Device
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Max self-registered accounts a single browser/device may create. Set to <code className="text-gray-400">0</code> for unlimited. A device is identified by a cookie the panel sets on first registration, so wiping cookies resets the count.
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
              className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            />
          </div>
          <ToggleRow
            id="verify-required"
            label="Email Verification Required"
            description="When enabled, freshly-registered accounts must verify the email they signed up with before they can sign in. Requires SMTP to be configured above."
            checked={verifyRequired}
            onChange={setVerifyRequired}
          />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Identity providers & channels
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Toggle on each provider you want to expose on the registration
          and login pages. OAuth providers (Google / Microsoft / Apple /
          Discord / GitHub) ship client ID + secret; the channel rows
          (Email OTP / Phone / TOTP / Password) just need an enable.
          Secrets are never echoed back; send them once when wiring,
          afterwards leave the field blank to keep the stored value.
        </p>
        <div className="space-y-3">
          {providers.map((p) => {
            const def = PROVIDER_DEFS.find((d) => d.id === p.id);
            const label = providerLabel(p.id);
            const secretPlaceholder = p.client_id
              ? 'leave blank to keep current secret'
              : 'paste your OAuth client secret';
            return (
              <div
                key={p.id}
                className="rounded-md border border-white/[0.06] bg-black/20 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-white">{label}</h4>
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          p.enabled
                            ? 'bg-emerald-800/40 text-emerald-300'
                            : 'bg-neutral-800 text-gray-400'
                        }`}
                      >
                        {p.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {def?.description ?? ''}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => setProviderField(p.id, { enabled: e.target.checked })}
                      className="accent-emerald-500"
                    />
                    <span className="text-sm text-gray-300">Enable</span>
                  </label>
                </div>
                {p.kind === 'oauth' && p.enabled && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.03]">
                    <TextInput
                      id={`provider-${p.id}-client-id`}
                      label="Client ID"
                      value={p.client_id || ''}
                      onChange={(v) => setProviderField(p.id, { client_id: v })}
                      placeholder="OAuth client ID"
                    />
                    <TextInput
                      id={`provider-${p.id}-client-secret`}
                      label="Client Secret"
                      type="password"
                      value={p.client_secret || ''}
                      onChange={(v) => setProviderField(p.id, { client_secret: v })}
                      placeholder={secretPlaceholder}
                    />
                    <TextInput
                      id={`provider-${p.id}-scopes`}
                      label="Scopes (space-separated)"
                      value={p.scopes || ''}
                      onChange={(v) => setProviderField(p.id, { scopes: v })}
                      placeholder="openid email profile"
                    />
                    <TextInput
                      id={`provider-${p.id}-redirect-uri`}
                      label="Redirect URI"
                      value={p.redirect_uri || ''}
                      onChange={(v) => setProviderField(p.id, { redirect_uri: v })}
                      placeholder="https://your-panel.com/auth/callback"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Registration policy
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          When registration is allowed, control how many identity providers
          a new account must complete, and which providers are permitted.
        </p>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="registration-mode">
            Registration Mode
          </label>
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
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="registration-n">
                Minimum N (for "N of allowed")
              </label>
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
              <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="registration-allowed">
                Allowed Providers
              </label>
              <div className="rounded border border-white/[0.06] bg-black/20 p-3">
                <p className="text-xs text-gray-400 mb-2">
                  Select which enabled providers count toward the requirement. Unselected providers are ignored for registration but may still be available for existing users.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {enabledProviders.map((p) => (
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
                      <span className="truncate">{providerLabel(p.id)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          OTP / One-time codes
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Configure one-time passcode behavior for email and SMS channels.
          TOTP / Authenticator app uses the Authority app connection below.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ToggleRow
              id="otp-email-enabled"
              label="Email OTP Enabled"
              description="Allow one-time codes to be sent via email (requires SMTP above)."
              checked={otpEmailEnabled}
              onChange={setOtpEmailEnabled}
            />
            <ToggleRow
              id="otp-phone-enabled"
              label="Phone (SMS) OTP Enabled"
              description="Allow one-time codes to be sent via SMS (requires gateway below)."
              checked={otpPhoneEnabled}
              onChange={setOtpPhoneEnabled}
            />
          </div>
          <ToggleRow
            id="magic-link-email"
            label="Email Magic Links"
            description="Send clickable magic links instead of numeric codes for email OTP."
            checked={magicLinkEmail}
            onChange={setMagicLinkEmail}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <NumberInput
              id="code-length"
              label="Code Length"
              value={codeLength}
              onChange={setCodeLength}
              min={4}
              max={10}
            />
            <NumberInput
              id="ttl-seconds"
              label="TTL (seconds)"
              value={ttlSeconds}
              onChange={setTtlSeconds}
              min={30}
              max={3600}
            />
          </div>
          <div className="pt-2 border-t border-white/[0.03]">
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="sms-gateway">
              SMS Gateway
            </label>
            <select
              id="sms-gateway"
              value={smsGateway}
              onChange={(e) => setSmsGateway(e.target.value)}
              className="w-full max-w-xs bg-black/30 backdrop-blur-md text-white border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
            >
              <option value="">None / Disabled</option>
              <option value="twilio">Twilio</option>
              <option value="plivo">Plivo</option>
              <option value="vonage">Vonage (Nexmo)</option>
              <option value="custom">Custom HTTP</option>
            </select>
<p className="text-xs text-gray-500 mt-1">
              Twilio / Plivo / Vonage use their official SDKs. Custom sends a POST to your URL with JSON: {'{to, code, ttl}'}.
           </p>
            <div className="space-y-3 mt-3">
              <TextInput id="sms-account-sid" label="Account SID / Key" value={smsAccountSid} onChange={setSmsAccountSid} placeholder="Your provider account identifier" />
              <TextInput id="sms-api-token" label="Auth Token / Secret" type="password" value={smsApiToken} onChange={setSmsApiToken} placeholder="leave blank to keep current" />
              <TextInput id="sms-from-number" label="From Number" value={smsFromNumber} onChange={setSmsFromNumber} placeholder="+15551234567" />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Authority App (TOTP)
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Built-in RFC 6238 TOTP for authenticator apps (Google Authenticator, 2FAS, Aegis, etc.).
          Users scan the QR code from their profile to link the app.
        </p>
        <div className="space-y-4">
          <ToggleRow
            id="app-enabled"
            label="Enable Authority App"
            description="When on, users can link an authenticator app from their profile page."
            checked={appEnabled}
            onChange={setAppEnabled}
          />
          <div className={appEnabled ? '' : 'opacity-50 pointer-events-none space-y-4'}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput
                id="app-pin-size"
                label="PIN Size (digits)"
                value={appPinSize}
                onChange={setAppPinSize}
                min={6}
                max={8}
              />
              <NumberInput
                id="app-rotation-seconds"
                label="Rotation Interval (seconds)"
                value={appRotationSeconds}
                onChange={setAppRotationSeconds}
                min={15}
                max={120}
              />
            </div>
            <NumberInput
              id="app-digits-in-window"
              label="Valid Digits in Window (±N rotations)"
              value={appDigitsInWindow}
              onChange={setAppDigitsInWindow}
              min={1}
              max={3}
            />
            <TextInput
              id="app-issuer"
              label="Issuer Name"
              value={appIssuer}
              onChange={setAppIssuer}
              placeholder="KS Panel"
            />
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-300">Shared Secret</span>
              <code className="flex-1 bg-black/40 px-3 py-2 rounded font-mono text-xs text-gray-300 break-all">
                {appSecretMasked || 'not configured'}
              </code>
              <button
                type="button"
                onClick={regenerateSecret}
                className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded text-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/></svg>
                Regenerate
              </button>
            </div>
          </div>
        </div>
      </section>

      {authError && <p className="text-sm text-red-400">{authError}</p>}
      {authSuccess && <p className="text-sm text-green-400">{authSuccess}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={authSaving}
          className="ks-primary-btn inline-flex items-center gap-2 bg-white text-black px-4 py-2 rounded hover:bg-gray-200 text-sm disabled:opacity-60"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="20 6 9 17 4 12" /></svg>
          {authSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
};

export default Authority;