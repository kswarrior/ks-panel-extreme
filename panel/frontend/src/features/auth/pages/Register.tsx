import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { register } from '@/features/auth/api/auth';
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
  const navigate = useNavigate();
  const panelName = useSettingsStore((s) => s.panelName);
  const panelLogo = useSettingsStore((s) => s.panelLogo);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !email.trim() || !password) {
      setError('All fields are required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
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
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative overflow-hidden" autoComplete="on">
          <div className="bg-transparent rounded-xl p-6 sm:p-7 space-y-7">
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

            {/* Username */}
            <div className="relative">
              <div className="relative group">
                <input
                  id="reg-username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  required
                  autoComplete="username"
                  placeholder=" "
                  className="peer w-full bg-transparent text-white placeholder-transparent
 border-b border-neutral-700 pl-10 pr-3 py-2.5 text-sm
 focus:outline-none focus:border-white transition-all duration-200"
                />
                <label className="absolute left-10 top-2.5 text-xs font-medium text-gray-500
 transition-all duration-200 pointer-events-none
 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-white peer-focus:scale-90
 peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white peer-[:not(:placeholder-shown)]:scale-90"
                  htmlFor="reg-username">
                  Username
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

            {/* Email */}
            <div className="relative">
              <div className="relative group">
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  required
                  autoComplete="email"
                  placeholder=" "
                  className="peer w-full bg-transparent text-white placeholder-transparent
 border-b border-neutral-700 pl-10 pr-3 py-2.5 text-sm
 focus:outline-none focus:border-white transition-all duration-200"
                />
                <label className="absolute left-10 top-2.5 text-xs font-medium text-gray-500
 transition-all duration-200 pointer-events-none
 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-white peer-focus:scale-90
 peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white peer-[:not(:placeholder-shown)]:scale-90"
                  htmlFor="reg-email">
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

            {/* Password */}
            <div className="relative">
              <div className="relative group">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  required
                  autoComplete="new-password"
                  placeholder=" "
                  className="peer w-full bg-transparent text-white placeholder-transparent
 border-b border-neutral-700 pl-10 pr-10 py-2.5 text-sm
 focus:outline-none focus:border-white transition-all duration-200"
                />
                <label className="absolute left-10 top-2.5 text-xs font-medium text-gray-500
 transition-all duration-200 pointer-events-none
 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-white peer-focus:scale-90
 peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white peer-[:not(:placeholder-shown)]:scale-90"
                  htmlFor="reg-password">
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

            {/* Confirm password */}
            <div className="relative">
              <div className="relative group">
                <input
                  id="reg-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                  required
                  autoComplete="new-password"
                  placeholder=" "
                  className="peer w-full bg-transparent text-white placeholder-transparent
 border-b border-neutral-700 pl-10 pr-3 py-2.5 text-sm
 focus:outline-none focus:border-white transition-all duration-200"
                />
                <label className="absolute left-10 top-2.5 text-xs font-medium text-gray-500
 transition-all duration-200 pointer-events-none
 peer-focus:-top-4 peer-focus:text-xs peer-focus:text-white peer-focus:scale-90
 peer-[:not(:placeholder-shown)]:-top-4 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-white peer-[:not(:placeholder-shown)]:scale-90"
                  htmlFor="reg-confirm">
                  Confirm Password
                </label>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none
 text-gray-500 group-focus-within:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                   </svg>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="relative w-full py-2.5 rounded-lg font-semibold text-sm tracking-wide
 transition-all duration-300 active:scale-[0.97]
 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-neutral-900
 disabled:opacity-100 disabled:cursor-wait overflow-hidden"
            >
              <span className={`absolute inset-0 rounded-lg transition-all duration-500 ${
                submitting ? 'bg-neutral-800/80' : 'bg-white hover:bg-gray-200'
              }`} />
              {!submitting && (
                <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/0 via-white/5 to-white/0
 animate-[shimmer_2s_ease-in-out_infinite]" />
              )}
              <span className={`relative z-10 flex items-center justify-center gap-2 ${submitting ? 'text-white' : 'text-black'}`}>
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="3"
                        strokeDasharray="30 30" strokeLinecap="round" opacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" strokeLinecap="round" />
                     </svg>
                    Creating account…
                  </>
                ) : (
                  <>Create Account</>
                )}
              </span>
            </button>

            {/* Back to login */}
            <p className="text-center text-xs text-gray-400">
              Already have an account?{' '}
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
