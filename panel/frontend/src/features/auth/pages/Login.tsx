import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import { fetchAuthorityBranding, isSafeAuthorityLogoUrl } from '@/shared/api/authorityBranding';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { PanelBrandLogo, PanelBrandName } from '@/shared/components/brand/PanelBrand';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';

interface LoginResponse {
  user: any;
  permissions: string[];
  session_token: string;
}

const Login: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<{ identifier: boolean; password: boolean }>({ identifier: false, password: false });
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth, addAccount } = useAuthStore();
  const panelName = useSettingsStore((s) => s.panelName);
  const panelLogo = useSettingsStore((s) => s.panelLogo);
  const nameStyle = useSettingsStore((s) => s.nameStyle);
  const logoStyle = useSettingsStore((s) => s.logoStyle);
  const footerText = useSettingsStore((s) => s.footerText);
  const setPanelName = useSettingsStore((s) => s.setPanelName);
  const token = useAuthStore((s) => s.token);
  const initialized = useAuthStore((s) => s.initialized);
  const [registerAllowed, setRegisterAllowed] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<{ id: string; label: string }[]>([]);
  const [sessionLifetime, setSessionLifetime] = useState<number | null>(null);
  const [sessionIdle, setSessionIdle] = useState<number | null>(null);
  const [sessionMaxPerUser, setSessionMaxPerUser] = useState<number | null>(null);


  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('oauth_error');
    if (oauthError) {
      setError(oauthError);
      params.delete('oauth_error');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
    }
    (async () => {
      // Fetch brand, authority branding and auth flags independently so one
      // failing doesn't block the others.
      const panelReq = client.get<{
        panel_name: string;
        panel_logo: { url: string; mime: string } | null;
        panel_name_color?: string;
        panel_name_font?: string;
        panel_name_weight?: string;
        panel_name_size?: string;
        panel_name_effect?: string;
        panel_name_shadow?: string;
        panel_name_gradient_from?: string;
        panel_name_gradient_to?: string;
        panel_name_gradient_dir?: string;
        panel_name_italic?: string;
        panel_name_uppercase?: string;
        panel_name_spacing?: string;
        panel_logo_size?: string;
        panel_logo_shape?: string;
        panel_logo_fit?: string;
        panel_logo_bg?: string;
        panel_logo_shadow?: string;
        panel_logo_ring?: string;
      }>('/api/settings/panel-name');
      const brandingReq = fetchAuthorityBranding();
      const flagsReq = client.get<{
        register_allow: boolean;
        verify_required: boolean;
        oauth_providers?: { id: string; label: string }[];
        session_lifetime_minutes?: number;
        session_idle_timeout_minutes?: number;
        session_max_per_user?: number;
      }>('/api/auth/flags');

      const [panelRes, brandingRes, flagsRes] = await Promise.allSettled([panelReq, brandingReq, flagsReq]);

      if (cancelled) return;

      if (panelRes.status === 'fulfilled') {
        const snap = panelRes.value;
        if (snap.data?.panel_name) {
          setPanelName(snap.data.panel_name);
          document.title = snap.data.panel_name;
        }
        const store = useSettingsStore.getState();
        if (snap.data?.panel_logo) {
          store.setPanelLogo(snap.data.panel_logo);
        } else {
          store.setPanelLogo(null);
        }
        // Brand styling rides the same public payload — apply it so the
        // logged-out brand matches the admin's Settings preview exactly.
        const { brandNameStyleFromWire, brandLogoStyleFromWire } = await import(
          '@/features/settings/api/settings'
        );
        store.setNameStyle(brandNameStyleFromWire(snap.data || {}));
        store.setLogoStyle(brandLogoStyleFromWire(snap.data || {}));
      }

      // Authority branding wins over the global panel brand when present
      // (logo + backdrop); otherwise the panel-name/logo fallback above
      // stays in effect untouched.
      if (brandingRes.status === 'fulfilled') {
        const b = brandingRes.value;
        const store = useSettingsStore.getState();
        store.setBranding({
          panel_name: b.panel_name,
          logo_url: b.logo_url,
          logo_source: b.logo_source,
          background_url: b.background_url,
          background_type: b.background_type,
          background_source: b.background_source,
        });
        if (b.panel_name) {
          setPanelName(b.panel_name);
          document.title = b.panel_name;
        }
        if (b.logo_url && isSafeAuthorityLogoUrl(b.logo_url)) {
          store.setPanelLogo({ url: b.logo_url, mime: '' });
        }
      } else {
        useSettingsStore.getState().setBranding(null);
      }

      if (flagsRes.status === 'fulfilled') {
        setRegisterAllowed(!!flagsRes.value.data?.register_allow);
        setOauthProviders(flagsRes.value.data?.oauth_providers ?? []);
        if (flagsRes.value.data?.session_lifetime_minutes != null) setSessionLifetime(Number(flagsRes.value.data.session_lifetime_minutes));
        if (flagsRes.value.data?.session_idle_timeout_minutes != null) setSessionIdle(Number(flagsRes.value.data.session_idle_timeout_minutes));
        if (flagsRes.value.data?.session_max_per_user != null) setSessionMaxPerUser(Number(flagsRes.value.data.session_max_per_user));
      }
    })().catch(() => {
      /* silent: defaults keep login usable */
    });
    return () => {
      cancelled = true;
    };
  }, [setPanelName]);

  // If already authenticated and not in "add account" mode, bounce away.
  React.useEffect(() => {
    const addAccountMode = !!(location.state as any)?.addAccount;
    if (initialized && token && !addAccountMode) {
      const from = (location.state as any)?.from?.pathname || '/instances';
      navigate(from, { replace: true });
    }
  }, [initialized, token, location, navigate]);

  const from = (location.state as any)?.from?.pathname || '/instances';
  const addAccountMode = !!(location.state as any)?.addAccount;

  const identifierTrimmed = identifier.trim();
  const identifierError = touched.identifier && !identifierTrimmed ? 'Username or email is required' : '';
  const passwordError = touched.password && !password ? 'Password is required' : '';
  const hasFieldError = !!identifierError || !!passwordError;

  const formatMinutes = (m: number | null) => {
    if (m == null) return null;
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (rem === 0) {
      if (h % 24 === 0) {
        const d = h / 24;
        return d === 1 ? '1d' : `${d}d`;
      }
      return `${h}h`;
    }
    return `${h}h ${rem}m`;
  };
  const sessionText = (() => {
    const life = formatMinutes(sessionLifetime);
    const idle = formatMinutes(sessionIdle);
    if (!life && !idle) return null;
    // Real data from Security -> Sessions tab (SecurityConfig)
    // Shows absolute lifetime and idle timeout; max per user only if capped
    if (life && idle) return `Session ${life} • Idle ${idle}`;
    if (life) return `Session ${life}`;
    return `Idle ${idle}`;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ identifier: true, password: true });

    const id = identifier.trim();
    const pw = password;

    if (!id) {
      setError('Please enter your username or email.');
      return;
    }
    if (!pw) {
      setError('Please enter your password.');
      return;
    }

    setError('');
    setSubmitting(true);

    const payload = {
      identifier: id,
      username: id,
      email: id,
      password: pw,
    };

    try {
      if (addAccountMode) {
        const resp = await client.post<LoginResponse>('/api/auth/switch-login', payload);
        addAccount(resp.data.session_token, resp.data.user, resp.data.permissions);
        const back = (location.state as any)?.returnTo || '/instances';
        navigate(back, { replace: true });
      } else {
        const resp = await client.post<LoginResponse>('/api/auth/login', payload);
        setAuth(resp.data.user, 'authenticated', resp.data.permissions);
        if (resp.data.session_token) {
          addAccount(resp.data.session_token, resp.data.user, resp.data.permissions);
        }
        navigate(from, { replace: true });
      }
    } catch (e: any) {
      const raw = e?.response?.data;
      const status = e?.response?.status;
      if (status === 403 && typeof raw === 'string' && raw.includes('verified')) {
        const isEmail = id.includes('@');
        navigate('/auth/verify-email', { state: { email: isEmail ? id : '' } });
        return;
      }
      if (status === 429) {
        const retry = e?.response?.headers?.['retry-after'] || e?.response?.headers?.['Retry-After'];
        const hint = retry ? ` Try again in ${retry}.` : '';
        const msg = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Too many attempts. Please wait and try again.';
        setError(msg + hint);
      } else {
        const displayMsg = typeof raw === 'string' && raw.trim() ? raw.trim() : (e?.message === 'Network Error' ? 'Cannot reach server. Check your connection.' : 'Invalid credentials');
        setError(displayMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center overflow-hidden kspanel-bg-overlay px-4 py-8">
      <ThemedBackground />

      <div className="relative z-10 w-full max-w-sm sm:max-w-md animate-fade-in">
        {/* Brand header - logo left, name + subtitle stacked right */}
        <div className="flex items-center gap-4 mb-6 animate-scale-in w-full text-left px-6 sm:px-7">
          <PanelBrandLogo logo={panelLogo} style={logoStyle} baseSize={64} alt={`${panelName} logo`} eager />
          <div className="flex flex-col items-start text-left min-w-0">
            <PanelBrandName name={panelName} style={nameStyle} basePx={28} />
            <p className="text-sm text-gray-300/80 tracking-wide mt-0.5">
              {addAccountMode ? 'Add another account' : 'Sign in to your account'}
            </p>
            {addAccountMode && (
              <p className="mt-1 text-xs text-gray-400">
                Your current session will stay active
              </p>
            )}
          </div>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="relative" noValidate autoComplete="on" aria-labelledby="login-heading">
          <h2 id="login-heading" className="sr-only">Login form</h2>
          <div className="rounded-2xl p-6 sm:p-7 space-y-6 bg-transparent border border-transparent shadow-none backdrop-blur-none">
            {/* Global error banner */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="animate-shake px-3.5 py-3 text-sm text-red-200 bg-red-900/30 border border-red-700/50 rounded-lg flex items-start gap-2.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 shrink-0 mt-0.5 text-red-400" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="leading-snug break-words">{error}</span>
              </div>
            )}

            {/* Username / Email field */}
            <div className="animate-slide-up [animation-delay:0.1s] [animation-fill-mode:backwards]">
              <div className="relative group">
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (error) setError('');
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, identifier: true }))}
                  required
                  autoComplete="username"
                  autoFocus
                  aria-required="true"
                  aria-invalid={!!identifierError || (touched.identifier && !!error)}
                  aria-describedby={identifierError ? 'identifier-error' : undefined}
                  placeholder=" "
                  className={`peer w-full h-[45px] bg-transparent ks-auth-input placeholder-transparent border-0 border-b rounded-none pl-10 pr-3 py-3 text-sm text-white transition-colors duration-200 focus:bg-transparent focus:ring-0 outline-none ${
                    identifierError ? '!border-red-500/60 focus:!border-red-500' : 'border-white/15 focus:border-white/40'
                  }`}
                />
                <label
                  className="absolute left-10 top-[13px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[13px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-transparent peer-focus:px-1 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-transparent peer-[:not(:placeholder-shown)]:px-1"
                  htmlFor="identifier"
                >
                  Username or Email
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-white transition-colors" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>
              {identifierError && (
                <p id="identifier-error" role="alert" className="mt-1.5 text-xs text-red-300 flex items-center gap-1">
                  <span aria-hidden="true">•</span> {identifierError}
                </p>
              )}
            </div>

            {/* Password field */}
            <div className="animate-slide-up [animation-delay:0.2s] [animation-fill-mode:backwards]">
              <div className="relative group">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                  required
                  autoComplete="current-password"
                  aria-required="true"
                  aria-invalid={!!passwordError || (touched.password && !!error)}
                  aria-describedby={passwordError ? 'password-error' : 'password-help'}
                  placeholder=" "
                  className={`peer w-full h-[45px] bg-transparent ks-auth-input placeholder-transparent border-0 border-b rounded-none pl-10 pr-11 py-3 text-sm text-white transition-colors duration-200 focus:bg-transparent focus:ring-0 outline-none ${
                    passwordError ? '!border-red-500/60 focus:!border-red-500' : 'border-white/15 focus:border-white/40'
                  }`}
                />
                <label
                  className="absolute left-10 top-[13px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[13px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-transparent peer-focus:px-1 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-transparent peer-[:not(:placeholder-shown)]:px-1"
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-white transition-colors" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white active:text-gray-200 transition-colors rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError ? (
                <p id="password-error" role="alert" className="mt-1.5 text-xs text-red-300 flex items-center gap-1">
                  <span aria-hidden="true">•</span> {passwordError}
                </p>
              ) : (
                <p id="password-help" className="mt-1.5 text-[11px] text-gray-500">
                  {addAccountMode ? 'Verify your identity to add this account.' : ' '}
                </p>
              )}
            </div>

            {/* Session (real data from Security -> Sessions) on left, Create account on right - between password and Sign In */}
            <div className="flex items-center justify-between gap-3 -mt-2 animate-slide-up [animation-delay:0.25s] [animation-fill-mode:backwards]">
              <span className="text-xs text-gray-400 flex items-center gap-1.5 min-w-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="truncate" title={sessionText ? `Lifetime ${formatMinutes(sessionLifetime) ?? '-'} • Idle ${formatMinutes(sessionIdle) ?? '-'}${sessionMaxPerUser ? ` • Max ${sessionMaxPerUser}/user` : ''}` : undefined}>
                  {sessionText ?? 'Session • fetching...'}
                </span>
              </span>
              {registerAllowed && !addAccountMode ? (
                <button
                  type="button"
                  onClick={() => navigate('/auth/register')}
                  className="shrink-0 text-xs font-medium text-white underline decoration-white/20 underline-offset-4 hover:decoration-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm px-0.5"
                >
                  Create new account
                </button>
              ) : (
                <span className="shrink-0 text-xs text-transparent select-none" aria-hidden="true">.</span>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className={`animate-slide-up [animation-delay:0.3s] [animation-fill-mode:backwards] relative w-full h-[45px] rounded-xl font-semibold text-sm tracking-wide transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed overflow-hidden ${
                submitting
                  ? 'bg-neutral-800 text-white cursor-wait opacity-90'
                  : 'bg-white hover:bg-gray-100 active:bg-gray-200 text-black shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 disabled:opacity-60 disabled:hover:bg-white disabled:hover:shadow-lg disabled:active:scale-100'
              }`}
            >
              {!submitting && (
                <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/0 via-white/5 to-white/0 animate-[shimmer_2s_ease-in-out_infinite]" aria-hidden="true" />
              )}
              <span className="relative z-10 flex items-center justify-center gap-2">
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Authenticating…
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    {addAccountMode ? 'Add Account' : 'Sign In'}
                  </>
                )}
              </span>
            </button>

            {/* OAuth */}
            {oauthProviders.length > 0 && (
              <>
                <div className="animate-slide-up [animation-delay:0.35s] [animation-fill-mode:backwards] flex items-center gap-3 pt-1">
                  <span className="flex-1 h-px bg-white/10" aria-hidden="true" />
                  <span className="text-[11px] uppercase tracking-widest text-gray-400 font-medium">or continue with</span>
                  <span className="flex-1 h-px bg-white/10" aria-hidden="true" />
                </div>
                <div className="animate-slide-up [animation-delay:0.4s] [animation-fill-mode:backwards] space-y-2.5">
                  {oauthProviders.map((p) => (
                    <a
                      key={p.id}
                      href={`/api/auth/oauth/${p.id}/start`}
                      className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 active:bg-white/[0.07] text-gray-100 text-sm font-medium transition-all duration-200 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 opacity-70" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 12h8M12 8v8" />
                      </svg>
                      Continue with {p.label}
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* Footer links */}
            <div className="space-y-3 pt-1">
              <p className="text-center text-xs text-gray-500">
                Powered by <span className="font-medium text-gray-300">{footerText || 'KS Warrior'}</span>
              </p>


              {addAccountMode && (
                <p className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate((location.state as any)?.returnTo || '/instances')}
                    className="text-sm text-gray-400 hover:text-white underline decoration-white/20 hover:decoration-white/40 underline-offset-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-sm px-1"
                  >
                    Cancel and go back
                  </button>
                </p>
              )}
            </div>
          </div>
        </form>

      </div>

      <style>{`
        @keyframes shimmer {
          0%, 100% { transform: translateX(-100%); }
          50%      { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default Login;
