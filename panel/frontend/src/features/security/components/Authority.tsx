import React, { useEffect, useRef, useState } from 'react';
import {
  getAuthority,
  regenerateAppSecret,
  updateAuthority,
  type AuthorityConfig,
  type AuthorityProvider,
} from '@/features/authority/api/authority';
import TextInput from '@/shared/components/ui/TextInput';
import ToggleRow from '@/shared/components/ui/ToggleRow';
import { useConfirm } from '@/shared/stores/confirmStore';

// Authority tab: application secrets and external authentication/message
// providers ONLY. Authentication POLICY (password rules, lockout,
// registration, MFA/TOTP behaviour, OTP policy) lives on the Security
// page's Authentication tab; both write through the same /api/authority
// round-trip, each patching only its own fields.
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
    description: 'RFC 6238 auto-rotating PIN backed by the Authority app connection shared secret below.',
    kind: 'channel',
  },
  {
    id: 'password',
    label: 'Password',
    description: 'Classic username + password. Keeping this enabled preserves the legacy sign-in flow.',
    kind: 'channel',
  },
];

// ── Per-provider OAuth configuration schema ────────────────────────────
// Each provider needs a DIFFERENT set of credentials; this table is what
// the "Config" modal renders field-by-field. Secret fields follow the
// page-wide keep-blank contract: blank input = keep the stored value.
type OAuthFieldKey =
  | 'client_id'
  | 'client_secret'
  | 'tenant'
  | 'team_id'
  | 'key_id'
  | 'private_key'
  | 'scopes'
  | 'redirect_uri';

interface OAuthFieldDef {
  key: OAuthFieldKey;
  label: string;
  placeholder?: string;
  secret?: boolean;
  area?: boolean;
  hint?: string;
}

const REDIRECT_HINT = 'Leave blank to auto-derive from the panel address';

const OAUTH_CONFIG_FIELDS: Record<string, OAuthFieldDef[]> = {
  google: [
    { key: 'client_id', label: 'Client ID', placeholder: '…apps.googleusercontent.com' },
    { key: 'client_secret', label: 'Client Secret', secret: true },
    { key: 'scopes', label: 'Scopes (space-separated)', placeholder: 'openid email profile' },
    { key: 'redirect_uri', label: 'Redirect URI override', placeholder: REDIRECT_HINT },
  ],
  microsoft: [
    { key: 'client_id', label: 'Application (client) ID', placeholder: 'Azure app registration id' },
    { key: 'client_secret', label: 'Client Secret', secret: true },
    { key: 'tenant', label: 'Tenant', placeholder: 'common / organizations / consumers / tenant id' },
    { key: 'scopes', label: 'Scopes (space-separated)', placeholder: 'openid email profile' },
    { key: 'redirect_uri', label: 'Redirect URI override', placeholder: REDIRECT_HINT },
  ],
  apple: [
    { key: 'client_id', label: 'Services ID', placeholder: 'e.g. com.example.panel.signin' },
    { key: 'team_id', label: 'Team ID', placeholder: '10-character Apple developer team id' },
    { key: 'key_id', label: 'Key ID', placeholder: '10-character key id for the .p8 key' },
    {
      key: 'private_key',
      label: 'Private Key (.p8 contents)',
      area: true,
      hint: 'Paste the full .p8 file including BEGIN/END lines. The client secret is minted server-side per sign-in — none is stored.',
    },
    { key: 'redirect_uri', label: 'Redirect URI override', placeholder: REDIRECT_HINT },
  ],
  discord: [
    { key: 'client_id', label: 'Client ID', placeholder: 'Discord application id' },
    { key: 'client_secret', label: 'Client Secret', secret: true },
    { key: 'scopes', label: 'Scopes (space-separated)', placeholder: 'identify email' },
    { key: 'redirect_uri', label: 'Redirect URI override', placeholder: REDIRECT_HINT },
  ],
  github: [
    { key: 'client_id', label: 'Client ID', placeholder: 'GitHub OAuth App Client ID' },
    { key: 'client_secret', label: 'Client Secret', secret: true },
    { key: 'scopes', label: 'Scopes (space-separated)', placeholder: 'read:user user:email' },
    { key: 'redirect_uri', label: 'Redirect URI override', placeholder: REDIRECT_HINT },
  ],
};

// Required-for-signin keys, mirrored from the backend's MissingRequired —
// used for the live badge when the server-side `configured` flag is absent.
const OAUTH_REQUIRED_KEYS: Record<string, OAuthFieldKey[]> = {
  google: ['client_id', 'client_secret'],
  microsoft: ['client_id', 'client_secret'],
  apple: ['client_id', 'team_id', 'key_id', 'private_key'],
  discord: ['client_id', 'client_secret'],
  github: ['client_id', 'client_secret'],
};

const OAUTH_SECRET_KEYS: ReadonlySet<string> = new Set(['client_secret', 'private_key']);

function oauthMissingFields(p: AuthorityProvider): string[] {
  const required = OAUTH_REQUIRED_KEYS[p.id];
  if (!required) return [];
  return required.filter((k) => {
    const v = String((p as unknown as Record<string, unknown>)[k] ?? '').trim();
    if (v) return false;
    // A stored secret the server refuses to echo still counts as present.
    return !OAUTH_SECRET_KEYS.has(k) || !p.configured;
  });
}

function providerLabel(id: string): string {
  const def = PROVIDER_DEFS.find((p) => p.id === id);
  return def ? def.label : id;
}

interface AuthorityProps {
  onConfigChange?: () => void;
}

const Authority: React.FC<AuthorityProps> = ({ onConfigChange }) => {
  const confirm = useConfirm();
  const [authLoading, setAuthLoading] = useState(true);
  const [authSaving, setAuthSaving] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [appSecretToast, setAppSecretToast] = useState('');

  // SMTP delivery credentials.
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTls, setSmtpTls] = useState('auto');

  // Provider inventory + OAuth credentials.
  const [providers, setProviders] = useState<AuthorityProvider[]>([]);
  // Which OAuth provider's config modal is open (id), if any.
  const [configProviderId, setConfigProviderId] = useState<string | null>(null);
  const [copiedRedirect, setCopiedRedirect] = useState(false);

  // SMS gateway credentials (SMS Providers).
  const [smsGateway, setSmsGateway] = useState('');
  const [smsAccountSid, setSmsAccountSid] = useState('');
  const [smsApiToken, setSmsApiToken] = useState('');
  const [smsFromNumber, setSmsFromNumber] = useState('');

  // Authority App shared secret (App Secrets).
  const [appSecretDraft, setAppSecretDraft] = useState('');
  const [appSecretMasked, setAppSecretMasked] = useState('');

  const cfgRef = useRef<AuthorityConfig | null>(null);

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
    })();
  }, []);

  function hydrate(cfg: AuthorityConfig) {
    cfgRef.current = cfg;
    setSmtpHost(cfg.smtp_host || '');
    setSmtpPort(cfg.smtp_port || '');
    setSmtpUser(cfg.smtp_user || '');
    setSmtpFrom(cfg.smtp_from || '');
    setSmtpTls((cfg as any).smtp_tls || 'auto');
    setSmtpPassword('');
    setProviders(sanitizeProviders(cfg.providers ?? []));
    setSmsGateway(cfg.otp?.sms_gateway || '');
    setSmsAccountSid(cfg.otp?.sms_account_sid || '');
    setSmsApiToken('');
    setSmsFromNumber(cfg.otp?.sms_from_number || '');
    setAppSecretMasked(cfg.app_connect?.secret || '');
    setAppSecretDraft('');
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAuthSaving(true);
    setAuthError('');
    setAuthSuccess('');
    setAppSecretToast('');

    // Re-fetch the freshest config before merging so we don't clobber
    // fields owned by the sibling Authentication tab with a stale snapshot.
    let fresh: AuthorityConfig | null = null;
    try {
      fresh = await getAuthority();
      cfgRef.current = fresh;
    } catch {
      // Fall back to the last hydrated ref if the re-fetch fails (e.g. transient network).
    }
    const base = fresh ?? cfgRef.current;
    if (!base) {
      setAuthError('Configuration not loaded yet.');
      setAuthSaving(false);
      return;
    }

    // Patch ONLY secrets/providers fields onto the freshly loaded config;
    // authentication-policy settings flow through untouched so this save
    // cannot clobber what the Authentication tab owns.
    const body: AuthorityConfig = {
      ...base,
      smtp_host: smtpHost.trim(),
      smtp_port: smtpPort.trim(),
      smtp_user: smtpUser.trim(),
      smtp_password: smtpPassword ? smtpPassword : base.smtp_password ?? '',
      smtp_from: smtpFrom.trim(),
      smtp_tls: smtpTls.trim() || 'auto',
      providers: providers.map((p) => ({
        ...p,
        // Blank secret = keep stored value (server-side preserveSecrets).
        client_secret: p.client_secret || '',
      })),
      otp: {
        ...base.otp!,
        sms_gateway: smsGateway.trim(),
        sms_account_sid: smsAccountSid.trim(),
        sms_api_token: smsApiToken ? smsApiToken : base.otp?.sms_api_token ?? '',
        sms_from_number: smsFromNumber.trim(),
      },
      app_connect: {
        ...base.app_connect!,
        secret: appSecretDraft ? appSecretDraft : base.app_connect?.secret ?? '',
      },
    };

    try {
      const cfg = await updateAuthority(body);
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
    if (!(await confirm({ title: 'Regenerate app secret', message: 'Regenerate the Authority app secret? Existing authenticator apps will need to be re-scanned.', tone: 'warning', confirmLabel: 'Regenerate' }))) {
      return;
    }
    setAuthError('');
    setAuthSuccess('');
    try {
      const newSecret = await regenerateAppSecret();
      setAppSecretDraft('');
      setAppSecretMasked('configured');
      setAppSecretToast(newSecret);
    } catch (e: any) {
      setAuthError(e?.response?.data || 'Failed to regenerate app secret');
    }
  }

  return (
    <form
      onSubmit={submit}
      className="glass-card ks-form-card rounded-xl space-y-10 max-w-3xl"
    >
      {appSecretToast && (
        <div className="ks-card ks-form-card rounded-xl border-emerald-600/50 p-4">
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
          SMTP
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          The mail server the panel uses to send email verification codes
          and email OTP magic links. Configure this before enabling Email
          Verification or Email OTP (Authentication tab).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput id="smtp-host" label="SMTP Host" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.example.com" />
          <TextInput id="smtp-port-v" label="SMTP Port" value={smtpPort} onChange={setSmtpPort} placeholder="587 (or 465 for implicit TLS)" />
          <TextInput id="smtp-user" label="SMTP Username" value={smtpUser} onChange={setSmtpUser} placeholder="apikey or username (leave blank for no auth)" />
          <TextInput id="smtp-password" label="SMTP Password" type="password" value={smtpPassword} onChange={setSmtpPassword} placeholder="leave blank to keep current" />
          <div className="sm:col-span-2">
            <TextInput id="smtp-from" label="From Address" value={smtpFrom} onChange={setSmtpFrom} placeholder="KSPANEL <kspanel@example.com>" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-1" htmlFor="smtp-tls">TLS Mode</label>
            <select id="smtp-tls" value={smtpTls} onChange={(e) => setSmtpTls(e.target.value)} className="w-full glass-field text-sm">
              <option value="auto">Auto (465 = implicit TLS, else STARTTLS)</option>
              <option value="implicit">Implicit TLS (always)</option>
              <option value="starttls">STARTTLS (require upgrade)</option>
              <option value="off">Off (plain LAN relay only)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Ticket + notification mail honours per-user delivery prefs (realtime / digest / off) and opt-out; credentials are never logged.</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          OAuth Providers &amp; Channels
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Toggle on each provider you want to expose on the registration
          and login pages, then use the gear button on its right to enter
          everything that provider requires — a provider can only be
          enabled once its full credential set is saved. Once configured,
          it shows up as a &quot;Continue with …&quot; button on the login page.
          Secrets are never echoed back; leave those fields blank to keep
          the stored value. Behaviour policies for these channels live on
          the Authentication tab.
        </p>
        <div className="space-y-3">
          {providers.map((p) => {
            const def = PROVIDER_DEFS.find((d) => d.id === p.id);
            const label = providerLabel(p.id);
            // NOTE: /api/authority does NOT echo a `kind` field — derive it
            // from PROVIDER_DEFS (falling back to any server-sent kind) or
            // the config gear/button would never render after load.
            const isOAuth = (def?.kind ?? p.kind) === 'oauth';
            const missing = isOAuth ? oauthMissingFields(p) : [];
            const configured = missing.length === 0;
            return (
              <div
                key={p.id}
                className="ks-card ks-form-card rounded-md space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <ToggleRow
                      id={`provider-${p.id}-enable`}
                      label={label}
                      description={def?.description ?? ''}
                      checked={p.enabled}
                      onChange={(v) => setProviderField(p.id, { enabled: v })}
                    />
                  </div>
                  {isOAuth && p.enabled && (
                    <button
                      type="button"
                      aria-label={`Configure ${label}`}
                      title={`Configure ${label}`}
                      aria-expanded={configProviderId === p.id}
                      onClick={() => {
                        setConfigProviderId(configProviderId === p.id ? null : p.id);
                        setCopiedRedirect(false);
                      }}
                      className={`shrink-0 grid place-items-center w-8 h-8 rounded border transition-colors mt-0.5 ${
                        configProviderId === p.id
                          ? 'bg-white/[0.15] border-white/25 text-white'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/10 text-gray-300 hover:text-white'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </button>
                  )}
                </div>
                {isOAuth && p.enabled && (
                  <div
                    className={`flex items-center gap-2 text-xs pt-2 border-t border-white/[0.03] ${
                      configured ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        configured ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    {configured ? (
                      <>Configured — sign-in enabled on the login page</>
                    ) : (
                      <>Setup required: missing {missing.join(', ')}</>
                    )}
                  </div>
                )}
                {/* Dropped-down config panel: every field THIS provider
                    needs, inline under its row. Secret fields follow the
                    page-wide keep-blank contract; edits bind into the same
                    providers state the Save button persists. */}
                {isOAuth && p.enabled && configProviderId === p.id && (
                  <div className="space-y-3 pt-3">
                    <div className="ks-card ks-form-card rounded-md space-y-1">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                        Redirect URI — paste this into your {label} app settings
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 min-w-0 bg-black/40 px-2 py-1 rounded font-mono text-[11px] text-gray-300 break-all select-all">
                          {`${window.location.origin}/api/auth/oauth/${p.id}/callback`}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(p.redirect_uri || `${window.location.origin}/api/auth/oauth/${p.id}/callback`).then(() => {
                              setCopiedRedirect(true);
                              window.setTimeout(() => setCopiedRedirect(false), 1500);
                            }).catch(() => {});
                          }}
                          className="shrink-0 text-[11px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 px-2 py-1 rounded transition-colors"
                        >
                          {copiedRedirect ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      {p.redirect_uri && (
                        <div className="text-[11px] text-amber-400/90">
                          An override below takes precedence over this URL.
                        </div>
                      )}
                    </div>

                    {(OAUTH_CONFIG_FIELDS[p.id] ?? []).map((f) => {
                      const id = `provider-${p.id}-${f.key}`;
                      const value = String(
                        (p as unknown as Record<string, unknown>)[f.key] ?? '',
                      );
                      const isSecret = !!f.secret;
                      const placeholder = isSecret && (p.configured || value)
                        ? 'leave blank to keep current'
                        : f.placeholder;
                      return (
                        <div key={f.key}>
                          <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">
                            {f.label}
                          </label>
                          {f.area ? (
                            <textarea
                              id={id}
                              rows={6}
                              value={value}
                              onChange={(e) =>
                                setProviderField(p.id, {
                                  [f.key]: e.target.value,
                                } as Partial<AuthorityProvider>)
                              }
                              placeholder={placeholder}
                              spellCheck={false}
                              className="ks-input w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
                            />
                          ) : (
                            <input
                              id={id}
                              type={isSecret ? 'password' : 'text'}
                              value={value}
                              autoComplete="off"
                              onChange={(e) =>
                                setProviderField(p.id, {
                                  [f.key]: e.target.value,
                                } as Partial<AuthorityProvider>)
                              }
                              placeholder={placeholder}
                              className="w-full bg-black/30 backdrop-blur-md text-white border border-white/10 placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/60 focus:border-white/40 transition-colors duration-150"
                            />
                          )}
                          {f.hint && (
                            <p className="text-[11px] text-gray-500 mt-1">{f.hint}</p>
                          )}
                        </div>
                      );
                    })}

                    <p className={`text-xs ${missing.length ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {missing.length
                        ? `Still missing: ${missing.join(', ')}`
                        : 'All required fields are in — press Save to persist.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          SMS Providers
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Gateway credentials for SMS-delivered one-time codes. Twilio /
          Plivo / Vonage use their official SDKs; Custom sends a POST to your
          URL with JSON: {'{to, code, ttl}'}. Enable the Phone channel above
          and tune code behaviour on the Authentication tab.
        </p>
        <div className="space-y-3">
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
          <div className="space-y-3 mt-3">
            <TextInput id="sms-account-sid" label="Account SID / Key" value={smsAccountSid} onChange={setSmsAccountSid} placeholder="Your provider account identifier" />
            <TextInput id="sms-api-token" label="Auth Token / Secret" type="password" value={smsApiToken} onChange={setSmsApiToken} placeholder="leave blank to keep current" />
            <TextInput id="sms-from-number" label="From Number" value={smsFromNumber} onChange={setSmsFromNumber} placeholder="+15551234567" />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          App Secrets
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Shared secret behind the built-in TOTP authenticator-app connection.
          Regenerate rotates it — existing linked authenticator apps must be
          re-scanned. TOTP behaviour (PIN size, rotation, issuer) is tuned on
          the Authentication tab.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-300 shrink-0">Authority App Secret</span>
          <code className="flex-1 min-w-[160px] bg-black/40 px-3 py-2 rounded font-mono text-xs text-gray-300 break-all">
            {appSecretMasked || 'not configured'}
          </code>
          <button
            type="button"
            onClick={regenerateSecret}
            className="ks-primary-btn inline-flex items-center gap-2 px-4 py-2 rounded text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/></svg>
            Regenerate
          </button>
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
