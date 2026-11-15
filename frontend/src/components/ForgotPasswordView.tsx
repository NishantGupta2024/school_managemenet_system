import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { useOptionalTheme } from '../context/ThemeContext';
import { CymbixLogo } from './CymbixLogo';
import { ThemeToggle } from './ThemeToggle';
import { Mail, AlertCircle, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';

export const ForgotPasswordView: React.FC = () => {
  const themeContext = useOptionalTheme();
  const isDark = themeContext?.theme === 'dark';

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = (): boolean => {
    const trimmed = email.trim();
    if (!trimmed) {
      setValidationError('Email address is required.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setValidationError('Please enter a valid email address.');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      // Anti-enumeration guarantee: always transition to success confirmation
      setIsSubmitted(true);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 429) {
        setServerError('Too many reset requests. Please wait a few minutes before trying again.');
      } else {
        // Even for unexpected errors or inactive accounts, present neutral confirmation
        // to strictly avoid exposing account existence.
        setIsSubmitted(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden select-none transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Top-Right Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Background radial gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.18),rgba(255,255,255,0))] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <Link
          to="/"
          className="inline-block hover:opacity-95 transition-opacity focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg p-1"
          aria-label="Cymbix Home"
        >
          <CymbixLogo variant={isDark ? 'dark' : 'light'} className="h-10 sm:h-12 w-auto mx-auto object-contain" />
        </Link>
        <h2 className={`mt-4 text-2xl font-bold tracking-tight ${
          isDark ? 'text-white' : 'text-slate-900'
        }`}>
          Reset your password
        </h2>
        <p className={`mt-1.5 text-sm ${
          isDark ? 'text-slate-400' : 'text-slate-500'
        }`}>
          Enter your institutional email to receive secure recovery instructions
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className={`backdrop-blur-xl rounded-2xl p-6 sm:p-8 space-y-6 relative transition-colors ${
          isDark ? 'bg-slate-900/90 border border-slate-800/80 shadow-2xl' : 'bg-white border border-slate-200 shadow-xl'
        }`}>
          {isSubmitted ? (
            <div className="space-y-5 text-center" data-testid="forgot-password-success-state">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Instructions Dispatched</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  If an active account exists with the email{' '}
                  <span className="font-medium text-white break-all">{email.trim()}</span>, you will receive password reset instructions shortly.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl text-left text-xs text-slate-400 space-y-1.5">
                <p className="font-medium text-slate-300">Security Notice:</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                  <li>Reset links expire after 30 minutes.</li>
                  <li>Check your spam or junk folder if the email does not appear in your inbox.</li>
                  <li>If you do not receive an email, please verify that your address was entered correctly.</li>
                </ul>
              </div>

              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsSubmitted(false);
                    setEmail('');
                    setValidationError(null);
                    setServerError(null);
                  }}
                  className="w-full py-2.5 px-4 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  Try another email
                </button>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 px-4 text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30 rounded-xl transition-colors focus:outline-none focus:underline"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {serverError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{serverError}</span>
                </div>
              )}

              <div>
                <label htmlFor="reset-email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Institutional Email Address
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (validationError) setValidationError(null);
                      if (serverError) setServerError(null);
                    }}
                    disabled={isSubmitting}
                    className={`block w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-950/80 border rounded-xl text-white placeholder-slate-500 focus:bg-slate-950 focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      validationError
                        ? 'border-rose-500/80 text-rose-200 focus:ring-rose-500 focus:border-rose-500'
                        : 'border-slate-800 text-white focus:ring-indigo-500 focus:border-indigo-500'
                    }`}
                    placeholder="user@school.edu"
                    autoFocus
                  />
                </div>
                {validationError && (
                  <p className="mt-1.5 text-xs text-rose-400 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-lg shadow-indigo-500/25 transition-all duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending Reset Link...</span>
                  </>
                ) : (
                  <span>Send Reset Link</span>
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-indigo-400 transition-colors focus:outline-none focus:underline"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Remember your password? Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
