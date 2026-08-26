import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const navigate = useNavigate();
  const panelName = useSettingsStore((s) => s.panelName);
  const panelLogo = useSettingsStore((s) => s.panelLogo);

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
      setTimeout(() => navigate('/auth/login', { replace: true }), 900);
    } catch (e: any) {
      const msg = e?.response?.data || 'Invalid or expired code';
      setError(typeof msg === 'string' ? msg : 'Invalid or expired code');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center overflow-hidden kspanel-bg-overlay">
      <ThemedBackground />

      <div className="relative z-10 w-full max-w-sm sm:max-w-md px-4 animate-fade-in">
        {/* Brand header */}
        <div className="flex flex-col items-center justify-center mb-7 animate-scale-in">
          <div className="flex items-center gap-3 mb-3">
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
            Verify your email
          </p>
        </div>

        <form onSubmit={onSubmit} className="relative overflow-hidden" autoComplete="on">
          <div className="bg-transparent rounded-xl p-6 sm:p-7 space-y-7">
            {/* Hint */}
            <p className="text-xs text-gray-400">
              We sent a verification code to your email. Enter it below to
              activate your account. Didn’t get it? Click “Send code” to
              request another.
            </p>

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
            {success && (
              <div className="px-3 py-2 text-sm text-emerald-300 bg-emerald-900/25 border border-emerald-800/60 rounded-lg">
                {success}
              </div>
            )}

            {/* Email (prefilled from register) */}
            <div className="relative">
              <div className="relative group">
                <input
                  id="verify-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); setSuccess(''); }}
                  required
                  autoComplete="email"
                  placeholder=" "
                  className="peer w-full bg-transparent ks-auth-input placeholder-transparent
 border-b pl-10 pr-3 py-2.5 text-sm
 transition-all duration-200"
                />
                <label className="absolute left-10 top-2.5 text-xs font-medium text-gray-500
 transition-all duration-200 pointer-events-none
 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-white peer-focus:scale-90
 peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white peer-[:not(:placeholder-shown)]:scale-90"
                  htmlFor="verify-email">
                  Email
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none
 text-gray-500 group-focus-within:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 6L2 7" />
                   </svg>
                </div>
              </div>
            </div>

            {/* Code */}
            <div className="relative">
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
                  className="peer w-full bg-transparent ks-auth-input placeholder-transparent
 border-b pl-10 pr-3 py-2.5 text-sm tracking-[0.5em]
 transition-all duration-200"
                />
                <label className="absolute left-10 top-2.5 text-xs font-medium text-gray-500
 transition-all duration-200 pointer-events-none
 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-white peer-focus:scale-90
 peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white peer-[:not(:placeholder-shown)]:scale-90"
                  htmlFor="verify-code">
                  Verification Code
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none
 text-gray-500 group-focus-within:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                    <path d="M9 11V7a3 3 0 0 1 6 0v4" />
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                   </svg>
                </div>
              </div>
            </div>

            {/* Submit — colors on the button element itself so the theme
                applier's .bg-white.text-black mapping applies. */}
            <button
              type="submit"
              disabled={submitting}
              className={`relative w-full py-2.5 rounded-lg font-semibold text-sm tracking-wide
 transition-all duration-300 active:scale-[0.97]
 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-neutral-900
 disabled:opacity-100 disabled:cursor-wait overflow-hidden ${
   submitting ? 'bg-neutral-800/80 text-white' : 'bg-white hover:bg-gray-200 text-black'
 }`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {submitting ? 'Verifying…' : 'Verify Email'}
              </span>
            </button>

            {/* Send (resend) code */}
            <button
              type="button"
              onClick={onSend}
              disabled={sending}
              className="w-full text-center text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-60"
            >
              {sending ? 'Sending…' : 'Send code'}
            </button>

            {/* Back to login */}
            <p className="text-center text-xs text-gray-400">
              Already verified?{' '}
              <button
                type="button"
                onClick={() => navigate('/auth/login')}
                className="text-gray-200 underline decoration-gray-500 hover:text-white hover:decoration-white transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VerifyEmail;
