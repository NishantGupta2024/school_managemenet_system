import React, { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useOptionalTheme } from '../context/ThemeContext';
import { CymbixLogo } from './CymbixLogo';
import { ThemeToggle } from './ThemeToggle';
import { Lock, Eye, EyeOff, AlertCircle, ArrowLeft, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';

export const ResetPasswordView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const navigate = useNavigate();
  const themeContext = useOptionalTheme();
  const isDark = themeContext?.theme === 'dark';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = (): boolean => {
    const errors: { newPassword?: string; confirmPassword?: string } = {};

    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters long.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your new password.';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!token) {
      setServerError('Missing or invalid reset token. Please request a new password reset link.');
      return;
    }

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token, newPassword);
      setIsSuccess(true);
    } catch (err: any) {
      const msg = err.response?.data?.message;
      if (typeof msg === 'string') {
        setServerError(msg);
      } else if (err.response?.status === 400) {
        setServerError('This password reset link is invalid, expired, or has already been used.');
      } else {
        setServerError('Failed to reset password. Please try again or request a new reset link.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Missing Token State
  if (!token) {
    return (
      <div className={`min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden select-none transition-colors ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}>
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
          <ThemeToggle />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.18),rgba(255,255,255,0))] pointer-events-none" />
        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
          <Link to="/" className="inline-block hover:opacity-95 transition-opacity" aria-label="Cymbix Home">
            <CymbixLogo variant={isDark ? 'dark' : 'light'} className="h-10 sm:h-12 w-auto mx-auto object-contain" />
          </Link>
        </div>
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
          <div className={`backdrop-blur-xl rounded-2xl p-6 sm:p-8 space-y-6 text-center transition-colors ${
            isDark ? 'bg-slate-900/90 border border-slate-800/80 shadow-2xl' : 'bg-white border border-slate-200 shadow-xl'
          }`}>
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Invalid Reset Link</h3>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                This password reset link is incomplete or missing a valid security token. Please request a new password reset email.
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2.5">
              <Link
                to="/forgot-password"
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors text-center shadow-lg shadow-indigo-500/20"
              >
                Request New Reset Link
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 px-4 text-sm font-medium text-slate-400 hover:text-indigo-400 rounded-xl transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Return to Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Success State
  if (isSuccess) {
    return (
      <div className={`min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden select-none transition-colors ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}>
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
          <ThemeToggle />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.18),rgba(255,255,255,0))] pointer-events-none" />
        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
          <Link to="/" className="inline-block hover:opacity-95 transition-opacity" aria-label="Cymbix Home">
            <CymbixLogo variant={isDark ? 'dark' : 'light'} className="h-10 sm:h-12 w-auto mx-auto object-contain" />
          </Link>
        </div>
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
          <div className={`backdrop-blur-xl rounded-2xl p-6 sm:p-8 space-y-6 text-center transition-colors ${
            isDark ? 'bg-slate-900/90 border border-slate-800/80 shadow-2xl' : 'bg-white border border-slate-200 shadow-xl'
          }`} data-testid="reset-password-success-state">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Password Successfully Reset</h3>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Your new password has been saved and all previous sessions have been securely terminated.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 rounded-xl shadow-lg shadow-indigo-500/25 transition-all"
              >
                Sign In with New Password
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Reset Form
  return (
    <div className={`min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden select-none transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.18),rgba(255,255,255,0))] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <Link
          to="/"
          className="inline-block hover:opacity-95 transition-opacity focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg p-1"
          aria-label="Cymbix Home"
        >
          <CymbixLogo variant={isDark ? 'dark' : 'light'} className="h-10 sm:h-12 w-auto mx-auto object-contain" />
        </Link>
        <h2 className={`mt-4 text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Create new password
        </h2>
        <p className={`mt-1.5 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Choose a secure password of at least 8 characters
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className={`backdrop-blur-xl rounded-2xl p-6 sm:p-8 space-y-6 relative transition-colors ${
          isDark ? 'bg-slate-900/90 border border-slate-800/80 shadow-2xl' : 'bg-white border border-slate-200 shadow-xl'
        }`}>
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {serverError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex flex-col gap-2"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{serverError}</span>
                </div>
                <div className="pt-1 border-t border-rose-500/20">
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Request a fresh password reset link
                  </Link>
                </div>
              </div>
            )}

            {/* New Password */}
            <div>
              <label htmlFor="new-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="new-password"
                  name="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (validationErrors.newPassword) {
                      setValidationErrors((prev) => ({ ...prev, newPassword: undefined }));
                    }
                    if (serverError) setServerError(null);
                  }}
                  disabled={isSubmitting}
                  className={`block w-full pl-10 pr-10 py-2.5 text-sm bg-slate-950/80 border rounded-xl text-white placeholder-slate-500 focus:bg-slate-950 focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    validationErrors.newPassword
                      ? 'border-rose-500/80 text-rose-200 focus:ring-rose-500 focus:border-rose-500'
                      : 'border-slate-800 text-white focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                  placeholder="••••••••"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-indigo-400 focus:outline-none transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validationErrors.newPassword && (
                <p className="mt-1.5 text-xs text-rose-400 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.newPassword}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (validationErrors.confirmPassword) {
                      setValidationErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                    }
                    if (serverError) setServerError(null);
                  }}
                  disabled={isSubmitting}
                  className={`block w-full pl-10 pr-10 py-2.5 text-sm bg-slate-950/80 border rounded-xl text-white placeholder-slate-500 focus:bg-slate-950 focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    validationErrors.confirmPassword
                      ? 'border-rose-500/80 text-rose-200 focus:ring-rose-500 focus:border-rose-500'
                      : 'border-slate-800 text-white focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-indigo-400 focus:outline-none transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validationErrors.confirmPassword && (
                <p className="mt-1.5 text-xs text-rose-400 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.confirmPassword}
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
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>

            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-indigo-400 transition-colors focus:outline-none focus:underline"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
