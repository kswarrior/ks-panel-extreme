import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import { register } from '@/features/auth/api/auth';
import { useAuthStore } from '@/shared/stores/authStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';

interface RegisterState {
  email?: string;
}

// Register mirrors the Login page's layout but collects username + email +
// password, then hands off to the verify-email page when verify_required is
// enabled on the install (the backend's /api/auth/register reply tells us).
const Register: React.FC = () => {
  const prefillEmail = (useLocation().state as RegisterState | null)?.email || '';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Enabled+configured OAuth providers (ids/labels only) so the register
  // page mirrors the login page's "Continue with ..." section.
  const [oauthProviders, setOauthProviders] = useState<{ id: string; label: string }[]>([]);
  const [sessionLifetime, setSessionLifetime] = useState<number | null>(null);
  const [sessionIdle, setSessionIdle] = useState<number | null>(null);
  const [sessionMaxPerUser, setSessionMaxPerUser] = useState<number | null>(null);
  const [pwdPolicy, setPwdPolicy] = useState<{ min_length: number; max_length: number; require_upper: boolean; require_lower: boolean; require_number: boolean; require_symbol: boolean; no_common?: boolean; no_personal?: boolean } | null>(null);
  const navigate = useNavigate();
  const authedToken = useAuthStore((s) => s.token);
  const authedInit = useAuthStore((s) => s.initialized);
  React.useEffect(() => {
    if (authedInit && authedToken) navigate('/instances', { replace: true });
  }, [authedInit, authedToken, navigate]);
  const panelName = useSettingsStore((s) => s.panelName);
  const panelLogo = useSettingsStore((s) => s.panelLogo);
  const footerText = useSettingsStore((s) => s.footerText);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flags = await client.get<{
          oauth_providers?: { id: string; label: string }[];
          session_lifetime_minutes?: number;
          session_idle_timeout_minutes?: number;
          session_max_per_user?: number;
          password_policy?: { min_length: number; max_length: number; require_upper: boolean; require_lower: boolean; require_number: boolean; require_symbol: boolean; no_common?: boolean; no_personal?: boolean };
        }>('/api/auth/flags');
        if (!cancelled) {
          setOauthProviders(flags.data?.oauth_providers ?? []);
          if (flags.data?.session_lifetime_minutes != null) setSessionLifetime(Number(flags.data.session_lifetime_minutes));
          if (flags.data?.session_idle_timeout_minutes != null) setSessionIdle(Number(flags.data.session_idle_timeout_minutes));
          if (flags.data?.session_max_per_user != null) setSessionMaxPerUser(Number(flags.data.session_max_per_user));
          if (flags.data?.password_policy) setPwdPolicy(flags.data.password_policy);
        }
      } catch {
        /* provider list stays empty on failure — form still works */
      }
    })();
    return () => { cancelled = true };
  }, []);

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
    if (life && idle) return `Session ${life} • Idle ${idle}`;
    if (life) return `Session ${life}`;
    return `Idle ${idle}`;
  })();

  // Live password checklist — uses real policy from backend (fallback to secure defaults)
  const policy = pwdPolicy ?? { min_length: 12, max_length: 128, require_upper: true, require_lower: true, require_number: true, require_symbol: true, no_common: true, no_personal: true };
  const checks = (() => {
    const pwd = password;
    const user = username.trim().toLowerCase();
    const mail = email.trim().toLowerCase();
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
    const unique = new Set(pwd).size;
    const commonList = ["password","123456","12345678","qwerty","abc123","letmein","monkey","password1","admin","welcome"];
    const isCommon = commonList.includes(pwd.toLowerCase());
    const containsPersonal = !!((user && pwd.toLowerCase().includes(user)) || (mail && pwd.toLowerCase().includes(mail)));
    const list: { label: string; pass: boolean; show: boolean }[] = [];
    list.push({ label: `At least ${policy.min_length} characters`, pass: pwd.length >= policy.min_length, show: true });
    if (policy.max_length) list.push({ label: `No more than ${policy.max_length} characters`, pass: pwd.length <= policy.max_length, show: pwd.length > policy.max_length });
    if (policy.require_upper) list.push({ label: `At least one uppercase letter`, pass: hasUpper, show: true });
    if (policy.require_lower) list.push({ label: `At least one lowercase letter`, pass: hasLower, show: true });
    if (policy.require_number) list.push({ label: `At least one number`, pass: hasNumber, show: true });
    if (policy.require_symbol) list.push({ label: `At least one special character`, pass: hasSpecial, show: true });
    // Unique chars (default 8, but policy may not expose; keep if pwd long enough to hint)
    if (pwd.length >= 8) list.push({ label: `At least 8 unique characters`, pass: unique >= 8, show: true });
    if (policy.no_common) list.push({ label: `Not a common password`, pass: !isCommon && pwd.length > 0, show: true });
    if (policy.no_personal && (user || mail)) list.push({ label: `Not containing personal info`, pass: !containsPersonal, show: true });
    return list;
  })();
  const confirmPass = confirm.length > 0 ? password === confirm : false;
  const confirmShow = confirm.length > 0 || password.length > 0;


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !email.trim() || !password) {
      setError('All fields are required');
      return;
    }
    if (password.length < policy.min_length) {
      setError(`Password must be at least ${policy.min_length} characters`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await register({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      if (res.verify) {
        // verify_required is on: the account exists but is unverified. Send
        // the user to the verify page so they can enter the code from the
        // email the backend already mailed during register.
        navigate('/auth/verify-email', { state: { email: res.email } });
      } else {
        // No verification gate: log straight in by bouncing to the login
        // page (we intentionally don't auto-issue a session here; the SPA
        // never stores the password once registration completes).
        navigate('/auth/login');
      }
    } catch (e: any) {
      const msg = e?.response?.data || 'Registration failed';
      setError(typeof msg === 'string' ? msg : 'Registration failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center overflow-hidden kspanel-bg-overlay px-4 py-8">
      <ThemedBackground />

      <div className="relative z-10 w-full max-w-sm sm:max-w-md animate-fade-in">
        {/* Brand header - logo left, name + subtitle stacked right */}
        <div className="flex items-center gap-4 mb-6 animate-scale-in w-full text-left px-6 sm:px-7">
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
              Create your account
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="relative" noValidate autoComplete="on" aria-labelledby="register-heading">
          <h2 id="register-heading" className="sr-only">Register form</h2>
          <div className="rounded-2xl p-6 sm:p-7 space-y-6 bg-transparent border border-transparent shadow-none backdrop-blur-none">
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

            {/* Username */}
            <div className="animate-slide-up [animation-delay:0.1s] [animation-fill-mode:backwards]">
              <div className="relative group">
                <input
                  id="reg-username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  required
                  autoComplete="username"
                  placeholder=" "
                  className="peer w-full h-[45px] bg-transparent ks-auth-input placeholder-transparent border-0 border-b rounded-none pl-10 pr-3 py-3 text-sm text-white transition-colors duration-200 focus:bg-transparent focus:ring-0 outline-none border-white/15 focus:border-white/40"
                />
                <label className="absolute left-10 top-[13px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[13px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-transparent peer-focus:px-1 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-transparent peer-[:not(:placeholder-shown)]:px-1" htmlFor="reg-username">
                  Username
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-white transition-colors" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Email */}
            <div className="animate-slide-up [animation-delay:0.15s] [animation-fill-mode:backwards]">
              <div className="relative group">
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  required
                  autoComplete="email"
                  placeholder=" "
                  className="peer w-full h-[45px] bg-transparent ks-auth-input placeholder-transparent border-0 border-b rounded-none pl-10 pr-3 py-3 text-sm text-white transition-colors duration-200 focus:bg-transparent focus:ring-0 outline-none border-white/15 focus:border-white/40"
                />
                <label className="absolute left-10 top-[13px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[13px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-transparent peer-focus:px-1 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-transparent peer-[:not(:placeholder-shown)]:px-1" htmlFor="reg-email">
                  Email
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-white transition-colors" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 6L2 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="animate-slide-up [animation-delay:0.2s] [animation-fill-mode:backwards]">
              <div className="relative group">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  required
                  autoComplete="new-password"
                  placeholder=" "
                  className="peer w-full h-[45px] bg-transparent ks-auth-input placeholder-transparent border-0 border-b rounded-none pl-10 pr-11 py-3 text-sm text-white transition-colors duration-200 focus:bg-transparent focus:ring-0 outline-none border-white/15 focus:border-white/40"
                />
                <label className="absolute left-10 top-[13px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[13px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-transparent peer-focus:px-1 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-transparent peer-[:not(:placeholder-shown)]:px-1" htmlFor="reg-password">
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
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
            </div>

            {/* Live password checklist - below password input while typing */}
            {password.length > 0 && (
              <div className="-mt-1 space-y-1.5 animate-slide-up [animation-delay:0.22s] [animation-fill-mode:backwards]">
                {checks.map((c, i) => (
                  c.show ? (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-200 ${c.pass ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
                      <span className={`text-xs leading-none transition-colors duration-200 ${c.pass ? 'text-emerald-300' : 'text-gray-400'}`}>{c.label}</span>
                    </div>
                  ) : null
                ))}
              </div>
            )}

            {/* Confirm password */}
            <div className="animate-slide-up [animation-delay:0.25s] [animation-fill-mode:backwards]">
              <div className="relative group">
                <input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                  required
                  autoComplete="new-password"
                  placeholder=" "
                  className="peer w-full h-[45px] bg-transparent ks-auth-input placeholder-transparent border-0 border-b rounded-none pl-10 pr-3 py-3 text-sm text-white transition-colors duration-200 focus:bg-transparent focus:ring-0 outline-none border-white/15 focus:border-white/40"
                />
                <label className="absolute left-10 top-[13px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[13px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-transparent peer-focus:px-1 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-transparent peer-[:not(:placeholder-shown)]:px-1" htmlFor="reg-confirm">
                  Confirm Password
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-white transition-colors" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              </div>
            </div>
            {confirmShow && (
              <div className="-mt-1 animate-slide-up [animation-delay:0.27s] [animation-fill-mode:backwards]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-200 ${confirmPass ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
                  <span className={`text-xs leading-none transition-colors duration-200 ${confirmPass ? 'text-emerald-300' : 'text-gray-400'}`}>Passwords match</span>
                </div>
              </div>
            )}

            {/* Session (real data) on left, Sign in on right - between confirm and Create Account */}
            <div className="flex items-center justify-between gap-3 -mt-2 animate-slide-up [animation-delay:0.3s] [animation-fill-mode:backwards]">
              <span className="text-xs text-gray-400 flex items-center gap-1.5 min-w-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="truncate" title={sessionText ? `Lifetime ${formatMinutes(sessionLifetime) ?? '-'} • Idle ${formatMinutes(sessionIdle) ?? '-'}${sessionMaxPerUser ? ` • Max ${sessionMaxPerUser}/user` : ''}` : undefined}>
                  {sessionText ?? 'Session • fetching...'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => navigate('/auth/login')}
                className="shrink-0 text-xs font-medium text-white underline decoration-white/20 underline-offset-4 hover:decoration-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm px-0.5"
              >
                Sign in
              </button>
            </div>

            {/* Submit — colors on the button element itself so the theme applier's .bg-white.text-black mapping applies. */}
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className={`animate-slide-up [animation-delay:0.35s] [animation-fill-mode:backwards] relative w-full h-[45px] rounded-xl font-semibold text-sm tracking-wide transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed overflow-hidden ${
                submitting ? 'bg-neutral-800 text-white cursor-wait opacity-90' : 'bg-white hover:bg-gray-100 active:bg-gray-200 text-black shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 disabled:opacity-60 disabled:hover:bg-white disabled:hover:shadow-lg disabled:active:scale-100'
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
                    Creating account…
                  </>
                ) : (
                  <>Create Account</>
                )}
              </span>
            </button>

            {/* OAuth "Continue with ..." — same list the login page renders; clicking leaves for the provider and returns via /api/auth/oauth/{id}/callback (which may auto-create the account when registration is enabled). */}
            {oauthProviders.length > 0 && (
              <>
                <div className="animate-slide-up [animation-delay:0.4s] [animation-fill-mode:backwards] flex items-center gap-3 pt-1">
                  <span className="flex-1 h-px bg-white/10" aria-hidden="true" />
                  <span className="text-[11px] uppercase tracking-widest text-gray-400 font-medium">or continue with</span>
                  <span className="flex-1 h-px bg-white/10" aria-hidden="true" />
                </div>
                <div className="animate-slide-up [animation-delay:0.45s] [animation-fill-mode:backwards] space-y-2.5">
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

export default Register;
