import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';

interface LoginResponse {
  user: any;
  permissions: string[];
  // Real signed session token returned by the backend so the SPA can keep it
  // for the multi-account switcher (and send it as Authorization: Bearer).
  session_token: string;
}

const Login: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth, addAccount } = useAuthStore();
  const panelName = useSettingsStore((s) => s.panelName);
  const panelLogo = useSettingsStore((s) => s.panelLogo);
  const setPanelName = useSettingsStore((s) => s.setPanelName);
  // Whether self-registration is enabled — fetched from the public
  // /api/auth/flags endpoint (no auth) so the login page can show the
  // "Create new account" link when the operator turned the toggle on.
  const [registerAllowed, setRegisterAllowed] = useState(false);
  // Enabled+configured OAuth providers (ids/labels only) so the login
  // page renders one "Continue with …" button per provider.
  const [oauthProviders, setOauthProviders] = useState<{ id: string; label: string }[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    // Surface an OAuth callback failure (redirected back with ?oauth_error)
    // in the same banner password login uses, then strip the query so a
    // refresh doesn't replay the message.
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('oauth_error');
    if (oauthError) {
      setError(oauthError);
      params.delete('oauth_error');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
    }
    (async () => {
      try {
        // Settings fetch is intentionally redundant with the index.html
        // bootstrap splice on the server side – belt-and-braces for the
        // case where the SPA isn't served from our Go binary (e.g. dev
        // mode with vite, or behind a proxy that mangles the HTML).
        const snap = await client.get<{ panel_name: string; panel_logo: { url: string; mime: string } | null }>('/api/settings/panel-name');
        if (!cancelled) {
          if (snap.data?.panel_name) {
            setPanelName(snap.data.panel_name);
            document.title = snap.data.panel_name;
          }
          // Hydrate the logo too, even though the bootstrap script usually
          // covers this – keep both stores in sync.
          const store = useSettingsStore.getState();
          if (snap.data?.panel_logo) {
            store.setPanelLogo(snap.data.panel_logo);
          } else {
            store.setPanelLogo(null);
          }
        }
        // Pull the gating toggles so we know whether to render the
        // "Create new account" link below the form. The flags endpoint is
        // public (no auth) and tolerant of failures — both flags default to
        // false when the fetch throws, so a transiently-unavailable server
        // can't open the register page as a 404.
        const flags = await client.get<{
          register_allow: boolean;
          verify_required: boolean;
          oauth_providers?: { id: string; label: string }[];
        }>('/api/auth/flags');
        if (!cancelled) {
          setRegisterAllowed(!!flags.data?.register_allow);
          setOauthProviders(flags.data?.oauth_providers ?? []);
        }
      } catch {
        /* fallback to default name silently */
      }
    })();
    return () => { cancelled = true };
  }, [setPanelName]);

  const from = (location.state as any)?.from?.pathname || '/instances';
  // The "add account" mode is requested by the multi-account switcher: the
  // user is already logged in as someone else and is adding a second
  // profile. In that mode we hit the cookieless switch-login endpoint so
  // the primary account's cookie stays intact, then record the new account
  // in the switcher list rather than replacing the active session.
  const addAccountMode = !!(location.state as any)?.addAccount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (addAccountMode) {
        // Cookieless login — the token comes back in the body, no cookie set.
        const resp = await client.post<LoginResponse>('/api/auth/switch-login', {
          identifier,
          username: identifier,
          email: identifier,
          password,
        });
        addAccount(resp.data.session_token, resp.data.user, resp.data.permissions);
        // Return to where the switcher was opened from (default: /instances).
        const back = (location.state as any)?.returnTo || '/instances';
        navigate(back, { replace: true });
      } else {
        const resp = await client.post<LoginResponse>('/api/auth/login', {
          identifier,
          username: identifier,
          email: identifier,
          password,
        });
        setAuth(resp.data.user, 'authenticated', resp.data.permissions);
        // Record the freshly-minted token in the multi-account list so the
        // switcher knows about this profile. setAuth already keeps the slot
        // in sync; addAccount upgrades it with the real token + makes it
        // active, which is harmless on first login.
        if (resp.data.session_token) {
          addAccount(resp.data.session_token, resp.data.user, resp.data.permissions);
        }
        navigate(from, { replace: true });
      }
    } catch (e: any) {
      // A 403 from the backend with this message means the install has
      // verify_required on and the account is still unverified. Push them
      // to the verify page pre-filled with their identifier so they can
      // request a fresh code without re-typing their email.
      const msg = e?.response?.data || '';
      if (e?.response?.status === 403 && typeof msg === 'string' && msg.includes('verified')) {
        setSubmitting(false);
        navigate('/auth/verify-email', { state: { email: identifier } });
        return;
      }
      setError('Invalid credentials');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center overflow-hidden kspanel-bg-overlay">
      {/* ── Themed background media layer ────────────────────────
          Auth pages render outside <Layout>, so they mount their own
          #ks-theme-layer for the theme store to paint into. Without this,
          a background assigned to the auth area never shows here. */}
      <ThemedBackground />

      {/* ── Card container ───────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md px-4 animate-fade-in">
        {/* Brand header */}
        <div className="flex flex-col items-center justify-center mb-7 animate-scale-in">
          <div className="flex items-center gap-3 mb-3">
            {/* Configured logo (when present) replaces the default shield.
                object-contain so non-square assets don't get cropped. */}
            {panelLogo ? (
              <img
                src={panelLogo.url}
                alt={panelName}
                className="w-10 h-10 rounded-xl object-contain
 bg-neutral-900 border border-neutral-700
 backdrop-blur-sm animate-pulse-glow"
              />
            ) : (
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl
 bg-neutral-900 border border-neutral-700
 backdrop-blur-sm animate-pulse-glow">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                  strokeLinejoin="round" className="w-6 h-6 text-white">
                  <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
                 </svg>
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white
 hover:brightness-125 transition-all duration-300">
              {panelName || 'KS Panel'}
            </h1>
          </div>
          <p className="text-sm text-gray-400 tracking-wide">
            Sign in to your account
          </p>
        </div>

        {/* Form card – solid (opaque) panel */}
        <form onSubmit={handleSubmit} className="relative overflow-hidden" autoComplete="on">
            <div className="
 bg-transparent rounded-xl
 p-6 sm:p-7 space-y-8
 ">
            {/* Error banner – slides in with shake animation when visible */}
            {error && (
              <div className="animate-shake px-3 py-2 text-sm text-red-300 bg-red-900/25 border border-red-800/60 rounded-lg flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0 mt-0.5 text-red-400">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                 </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Username / Email field */}
            <div className="animate-slide-up [animation-delay:0.1s] [animation-fill-mode:backwards] relative">
              <div className="relative group">
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
                  required
                  autoComplete="username"
                  placeholder=" "
                  className="peer w-full bg-transparent ks-auth-input placeholder-transparent
 border-b pl-10 pr-3 py-2.5 text-sm
 transition-all duration-200"
                />
                <label className="absolute left-10 top-2.5 text-xs font-medium text-gray-500 
 transition-all duration-200 pointer-events-none
 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-white peer-focus:scale-90
 peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white peer-[:not(:placeholder-shown)]:scale-90"
                  htmlFor="identifier">
                  Username or Email
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none
 text-gray-500 group-focus-within:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                   </svg>
                </div>
              </div>
            </div>

            {/* Password field */}
            <div className="animate-slide-up [animation-delay:0.2s] [animation-fill-mode:backwards] relative">
              <div className="relative group">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  required
                  autoComplete="current-password"
                  placeholder=" "
                  className="peer w-full bg-transparent ks-auth-input placeholder-transparent
 border-b pl-10 pr-10 py-2.5 text-sm
 transition-all duration-200"
                />
                <label className="absolute left-10 top-2.5 text-xs font-medium text-gray-500 
 transition-all duration-200 pointer-events-none
 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-white peer-focus:scale-90
 peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white peer-[:not(:placeholder-shown)]:scale-90"
                  htmlFor="password">
                  Password
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none
 text-gray-500 group-focus-within:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                   </svg>
                </div>
                {/* Eye toggle – show/hide password */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center
 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                     </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                     </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              className="animate-slide-up [animation-delay:0.3s] [animation-fill-mode:backwards]
 relative w-full py-2.5 rounded-lg font-semibold text-sm tracking-wide
 transition-all duration-300 active:scale-[0.97]
 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-neutral-900
 disabled:opacity-100 disabled:cursor-wait overflow-hidden"
            >
              {/* Button background layer */}
              <span className={`absolute inset-0 rounded-lg transition-all duration-500 ${
                submitting
                  ? 'bg-neutral-800/80'
                  : 'bg-white hover:bg-gray-200'
              }`} />
              {/* Button shimmer overlay */}
              {!submitting && (
                <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/0 via-white/5 to-white/0
 animate-[shimmer_2s_ease-in-out_infinite]" />
              )}
              {/* Button content */}
              <span className={`relative z-10 flex items-center justify-center gap-2 ${submitting ? 'text-white' : 'text-black'}`}>
                {submitting ? (
                  <>
                    {/* Spinning loader */}
<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
  <circle cx="12" cy="12" r="10" strokeWidth="3"
    strokeDasharray="30 30" strokeLinecap="round" opacity="0.3" />
  <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" strokeLinecap="round" />
 </svg>
                    Authenticating…
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      strokeLinejoin="round" className="w-4 h-4">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                     </svg>
                    Sign In
                  </>
                )}
              </span>
            </button>

            {/* OAuth "Continue with ..." — one button per provider the
                admin enabled AND fully configured on the Security page.
                Plain anchors: they leave for the provider and come back
                through /api/auth/oauth/{id}/callback, which lands here or
                straight into the panel with a session cookie. */}
            {oauthProviders.length > 0 && (
              <>
                <div className="animate-slide-up [animation-delay:0.35s] [animation-fill-mode:backwards] flex items-center gap-3 pt-1">
                  <span className="flex-1 h-px bg-neutral-700/70" />
                  <span className="text-[11px] uppercase tracking-wider text-gray-500">or continue with</span>
                  <span className="flex-1 h-px bg-neutral-700/70" />
                </div>
                <div className="animate-slide-up [animation-delay:0.4s] [animation-fill-mode:backwards] space-y-2">
                  {oauthProviders.map((p) => (
                    <a
                      key={p.id}
                      href={`/api/auth/oauth/${p.id}/start`}
                      className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-neutral-700 bg-black/30 hover:bg-white/10 hover:border-neutral-500 text-gray-200 text-sm transition-all duration-200"
                    >
                      Continue with {p.label}
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* Footer hint */}
            <p className="text-center text-xs text-gray-600 pt-1">
              Powered by{' '}
              <span className="font-medium text-gray-300">
                KS Warrior
              </span>
            </p>

            {/* Register link — only rendered when the operator enabled
                "Allow Registration" in Settings. Clicking it opens the
                /auth/register page; the back-link from there returns here. */}
            {registerAllowed && (
              <p className="text-center text-xs text-gray-400 pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/auth/register')}
                  className="text-gray-200 underline decoration-gray-500 hover:text-white hover:decoration-white transition-colors"
                >
                  Create new account
                </button>
              </p>
            )}
          </div>
        </form>
      </div>

      {/* Custom shimmer keyframes injected via style tag – Tailwind doesn't
          do custom @keyframes without config, but we only need this here. */}
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