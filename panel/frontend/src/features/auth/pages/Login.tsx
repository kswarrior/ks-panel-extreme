import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
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
  const footerText = useSettingsStore((s) => s.footerText);
  const setPanelName = useSettingsStore((s) => s.setPanelName);
  const token = useAuthStore((s) => s.token);
  const initialized = useAuthStore((s) => s.initialized);
  const [registerAllowed, setRegisterAllowed] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<{ id: string; label: string }[]>([]);

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
      // Fetch brand and auth flags independently so one failing doesn't block the other.
      const panelReq = client.get<{ panel_name: string; panel_logo: { url: string; mime: string } | null }>('/api/settings/panel-name');
      const flagsReq = client.get<{
        register_allow: boolean;
        verify_required: boolean;
        oauth_providers?: { id: string; label: string }[];
      }>('/api/auth/flags');

      const [panelRes, flagsRes] = await Promise.allSettled([panelReq, flagsReq]);

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
      }

      if (flagsRes.status === 'fulfilled') {
        setRegisterAllowed(!!flagsRes.value.data?.register_allow);
        setOauthProviders(flagsRes.value.data?.oauth_providers ?? []);
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
        <div className="flex items-center gap-4 mb-6 animate-scale-in w-full text-left">
          {panelLogo ? (
            <img
              src={panelLogo.url}
              alt={`${panelName} logo`}
              className="w-16 h-16 rounded-2xl object-contain bg-neutral-900 border border-neutral-700 backdrop-blur-sm animate-pulse-glow shadow-lg shrink-0"
              loading="eager"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-700 backdrop-blur-sm animate-pulse-glow shadow-lg shrink-0" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-white" aria-hidden="true">
                <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
              </svg>
            </div>
          )}
          <div className="flex flex-col items-start text-left min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-sm leading-tight">
              {panelName || 'KS Panel'}
            </h1>
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
                  className={`peer w-full h-14 bg-black/20 ks-auth-input placeholder-transparent border rounded-lg pl-10 pr-3 py-4 text-sm text-white transition-all duration-200 focus:bg-black/30 focus:border-white/30 focus:ring-2 focus:ring-white/10 outline-none ${
                    identifierError ? '!border-red-500/60 focus:!border-red-500 focus:!ring-red-500/20' : 'border-white/10'
                  }`}
                />
                <label
                  className="absolute left-10 top-[18px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[18px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-neutral-900 peer-focus:px-1.5 peer-focus:rounded peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-neutral-900 peer-[:not(:placeholder-shown)]:px-1.5 peer-[:not(:placeholder-shown)]:rounded"
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
                  className={`peer w-full h-14 bg-black/20 ks-auth-input placeholder-transparent border rounded-lg pl-10 pr-11 py-4 text-sm text-white transition-all duration-200 focus:bg-black/30 focus:border-white/30 focus:ring-2 focus:ring-white/10 outline-none ${
                    passwordError ? '!border-red-500/60 focus:!border-red-500 focus:!ring-red-500/20' : 'border-white/10'
                  }`}
                />
                <label
                  className="absolute left-10 top-[18px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[18px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-neutral-900 peer-focus:px-1.5 peer-focus:rounded peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:px-1.5 peer-[:not(:placeholder-shown)]:rounded"
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

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className={`animate-slide-up [animation-delay:0.3s] [animation-fill-mode:backwards] relative w-full h-14 rounded-xl font-semibold text-sm tracking-wide transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed overflow-hidden ${
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

              {registerAllowed && !addAccountMode && (
                <p className="text-center text-sm text-gray-400">
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/auth/register')}
                    className="font-medium text-white underline decoration-white/20 underline-offset-4 hover:decoration-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm px-0.5"
                  >
                    Create new account
                  </button>
                </p>
              )}
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

        <p className="mt-6 text-center text-[11px] text-gray-500/70">
          Secure authentication • Session protected with HMAC
        </p>
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
