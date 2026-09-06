import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import client from '@/shared/api/client';
import { sendVerifyCode, verifyEmail } from '@/features/auth/api/auth';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import ThemedBackground from '@/shared/components/layout/ThemedBackground';

interface VerifyState {
  email?: string;
}

// VerifyEmail is the page a freshly-registered user lands on when the
// install has verify_required on. The backend already mailed a code during
// register; this page lets the user enter the code, request a new one
// ("Send code"), and on a successful match get bounced back to /auth/login.
const VerifyEmail: React.FC = () => {
  const prefillEmail = (useLocation().state as VerifyState | null)?.email || '';
  const [email, setEmail] = useState(prefillEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sessionLifetime, setSessionLifetime] = useState<number | null>(null);
  const [sessionIdle, setSessionIdle] = useState<number | null>(null);
  const [sessionMaxPerUser, setSessionMaxPerUser] = useState<number | null>(null);
  const navigate = useNavigate();
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const panelName = useSettingsStore((s) => s.panelName);
  const panelLogo = useSettingsStore((s) => s.panelLogo);
  const footerText = useSettingsStore((s) => s.footerText);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const flags = await client.get<{
          session_lifetime_minutes?: number;
          session_idle_timeout_minutes?: number;
          session_max_per_user?: number;
        }>('/api/auth/flags');
        if (!cancelled) {
          if (flags.data?.session_lifetime_minutes != null) setSessionLifetime(Number(flags.data.session_lifetime_minutes));
          if (flags.data?.session_idle_timeout_minutes != null) setSessionIdle(Number(flags.data.session_idle_timeout_minutes));
          if (flags.data?.session_max_per_user != null) setSessionMaxPerUser(Number(flags.data.session_max_per_user));
        }
      } catch {
        /* ignore - session hint stays fetching */
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

  const onSend = async () => {
    if (!email.trim()) {
      setError('Enter your email first');
      return;
    }
    setError('');
    setSuccess('');
    setSending(true);
    try {
      const res = await sendVerifyCode(email.trim());
      if (res.sent) {
        setSuccess(`Verification code sent to ${email.trim()}. Check your inbox.`);
      } else {
        setError(res.error || 'Could not send a verification email (check SMTP settings).');
      }
    } catch (e: any) {
      const msg = e?.response?.data || 'Could not send a verification email';
      setError(typeof msg === 'string' ? msg : 'Could not send a verification email');
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !code.trim()) {
      setError('Email and code are required');
      return;
    }
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await verifyEmail(email.trim(), code.trim());
      setSuccess('Email verified! Redirecting to login…');
      timerRef.current = setTimeout(() => navigate('/auth/login', { replace: true }), 900);
    } catch (e: any) {
      const msg = e?.response?.data || 'Invalid or expired code';
      setError(typeof msg === 'string' ? msg : 'Invalid or expired code');
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
              Verify your email
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="relative" noValidate autoComplete="on" aria-labelledby="verify-heading">
          <h2 id="verify-heading" className="sr-only">Verify email form</h2>
          <div className="rounded-2xl p-6 sm:p-7 space-y-6 bg-transparent border border-transparent shadow-none backdrop-blur-none">
            {/* Hint */}
            <p className="text-xs text-gray-400 animate-slide-up [animation-delay:0.05s] [animation-fill-mode:backwards]">
              We sent a verification code to your email. Enter it below to
              activate your account. Didn’t get it? Click “Send code” to
              request another.
            </p>

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
            {success && (
              <div
                role="status"
                aria-live="polite"
                className="px-3.5 py-3 text-sm text-emerald-200 bg-emerald-900/25 border border-emerald-700/50 rounded-lg flex items-start gap-2.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <span className="leading-snug break-words">{success}</span>
              </div>
            )}

            {/* Email (prefilled from register) */}
            <div className="animate-slide-up [animation-delay:0.1s] [animation-fill-mode:backwards]">
              <div className="relative group">
                <input
                  id="verify-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); setSuccess(''); }}
                  required
                  autoComplete="email"
                  placeholder=" "
                  className="peer w-full h-[45px] bg-transparent ks-auth-input placeholder-transparent border-0 border-b rounded-none pl-10 pr-3 py-3 text-sm text-white transition-colors duration-200 focus:bg-transparent focus:ring-0 outline-none border-white/15 focus:border-white/40"
                />
                <label className="absolute left-10 top-[13px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[13px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-transparent peer-focus:px-1 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-transparent peer-[:not(:placeholder-shown)]:px-1" htmlFor="verify-email">
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

            {/* Code */}
            <div className="animate-slide-up [animation-delay:0.15s] [animation-fill-mode:backwards]">
              <div className="relative group">
                <input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); setSuccess(''); }}
                  required
                  autoComplete="one-time-code"
                  placeholder=" "
                  className="peer w-full h-[45px] bg-transparent ks-auth-input placeholder-transparent border-0 border-b rounded-none pl-10 pr-3 py-3 text-sm text-white tracking-[0.5em] text-center placeholder:tracking-normal transition-colors duration-200 focus:bg-transparent focus:ring-0 outline-none border-white/15 focus:border-white/40"
                />
                <label className="absolute left-10 top-[13px] text-sm font-medium text-gray-400 transition-all duration-200 pointer-events-none peer-placeholder-shown:top-[13px] peer-placeholder-shown:text-sm peer-focus:-top-2.5 peer-focus:left-2 peer-focus:text-xs peer-focus:text-white peer-focus:bg-transparent peer-focus:px-1 peer-[:not(:placeholder-shown)]:-top-2.5 peer-[:not(:placeholder-shown)]:left-2 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-gray-300 peer-[:not(:placeholder-shown)]:bg-transparent peer-[:not(:placeholder-shown)]:px-1" htmlFor="verify-code">
                  Verification Code
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-white transition-colors" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4" aria-hidden="true">
                    <path d="M9 11V7a3 3 0 0 1 6 0v4" />
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Session (real data) on left, Sign in on right - between code and Verify */}
            <div className="flex items-center justify-between gap-3 -mt-2 animate-slide-up [animation-delay:0.2s] [animation-fill-mode:backwards]">
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
              className={`animate-slide-up [animation-delay:0.25s] [animation-fill-mode:backwards] relative w-full h-[45px] rounded-xl font-semibold text-sm tracking-wide transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed overflow-hidden ${
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
                    Verifying…
                  </>
                ) : (
                  <>Verify Email</>
                )}
              </span>
            </button>

            {/* Send (resend) code */}
            <button
              type="button"
              onClick={onSend}
              disabled={sending}
              className="animate-slide-up [animation-delay:0.3s] [animation-fill-mode:backwards] w-full h-[45px] rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 active:bg-white/[0.07] text-gray-200 text-sm font-medium transition-all duration-200 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending…
                </>
              ) : (
                <>Send code</>
              )}
            </button>

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

export default VerifyEmail;
