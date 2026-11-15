import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOptionalTheme } from '../context/ThemeContext';
import { CymbixLogo } from './CymbixLogo';
import { ThemeToggle } from './ThemeToggle';
import { Lock, Mail, Eye, EyeOff, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const themeContext = useOptionalTheme();
  const isDark = themeContext?.theme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [tenantChoices, setTenantChoices] = useState<Array<{ id: string; name: string; status?: string }>>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string; schoolId?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Safe redirect path calculation
  const safeFrom = React.useMemo(() => {
    const rawFrom = (location.state as any)?.from?.pathname;
    if (
      typeof rawFrom === 'string' &&
      rawFrom.startsWith('/') &&
      !rawFrom.startsWith('//') &&
      !rawFrom.includes('\\')
    ) {
      return rawFrom;
    }
    return '/app';
  }, [location.state]);

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate(safeFrom, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, safeFrom]);

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) {
      return;
    }

    if (tenantChoices.length > 0 && !selectedSchoolId) {
      setValidationErrors((prev) => ({ ...prev, schoolId: 'Please select your school institution.' }));
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password, selectedSchoolId || undefined);
      navigate(safeFrom, { replace: true });
    } catch (err: any) {
      const status = err.response?.status;
      const responseData = err.response?.data;
      const responseMsg = responseData?.message;

      if (status === 400 && responseData?.requiresSchoolSelection && Array.isArray(responseData?.schools)) {
        setTenantChoices(responseData.schools);
        setServerError(
          typeof responseMsg === 'string'
            ? responseMsg
            : 'Multiple school accounts share this email address. Please select your school below.',
        );
      } else if (status === 401) {
        if (typeof responseMsg === 'string' && responseMsg.toLowerCase().includes('inactive')) {
          setServerError('This user account or school tenant is inactive or disabled.');
        } else {
          setServerError('Invalid email or password credentials. Please verify your details.');
        }
      } else if (status === 403) {
        setServerError('Access denied for this school tenant.');
      } else if (status >= 500) {
        setServerError('An internal server error occurred. Please try again later.');
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setServerError('Unable to connect to the authentication server. Please check your network.');
      } else {
        setServerError(
          typeof responseMsg === 'string'
            ? responseMsg
            : 'Authentication failed. Please verify your credentials and try again.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans relative overflow-hidden selection:bg-indigo-600 selection:text-white transition-colors ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Top-Right Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Subtle background ambient lighting */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        {/* Brand Logo & Heading */}
        <div className="flex justify-center">
          <CymbixLogo variant={isDark ? 'dark' : 'light'} className="h-14 sm:h-16 w-auto" />
        </div>
        <h2 className={`mt-5 text-center text-2xl font-extrabold tracking-tight ${
          isDark ? 'text-white' : 'text-slate-900'
        }`}>
          School Fee Management System
        </h2>
        <p className={`mt-1.5 text-center text-xs font-medium ${
          isDark ? 'text-slate-400' : 'text-slate-500'
        }`}>
          Multi-Tenant SaaS • Sign in with your institutional credentials
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0 relative z-10">
        <div className={`backdrop-blur-xl py-8 px-6 rounded-3xl border sm:px-10 transition-colors ${
          isDark ? 'bg-slate-900/90 shadow-2xl shadow-black/60 border-slate-800' : 'bg-white shadow-xl shadow-slate-200/50 border-slate-200'
        }`}>
          {/* Server Error Alert */}
          {serverError && (
            <div
              role="alert"
              className={`mb-6 p-4 rounded-xl text-xs flex items-start gap-2.5 border ${
                isDark
                  ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isDark ? 'text-rose-400' : 'text-rose-500'}`} />
              <div className="leading-relaxed">{serverError}</div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {/* Email Field */}
            <div>
              <label htmlFor="email" className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}>
                Email Address
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validationErrors.email) {
                      setValidationErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  disabled={isSubmitting}
                  className={`block w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    validationErrors.email
                      ? 'border-rose-500/80 text-rose-500 focus:ring-rose-500 focus:border-rose-500'
                      : isDark
                      ? 'bg-slate-950/80 border-slate-800 text-white placeholder-slate-500 focus:bg-slate-950 focus:ring-indigo-500 focus:border-indigo-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                  placeholder="admin@greenwood.edu"
                />
              </div>
              {validationErrors.email && (
                <p className="mt-1.5 text-xs text-rose-500 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.email}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className={`block text-xs font-semibold uppercase tracking-wider ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-indigo-500 hover:text-indigo-400 transition-colors focus:outline-none focus:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (validationErrors.password) {
                      setValidationErrors((prev) => ({ ...prev, password: undefined }));
                    }
                  }}
                  disabled={isSubmitting}
                  className={`block w-full pl-10 pr-10 py-2.5 text-sm border rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    validationErrors.password
                      ? 'border-rose-500/80 text-rose-500 focus:ring-rose-500 focus:border-rose-500'
                      : isDark
                      ? 'bg-slate-950/80 border-slate-800 text-white placeholder-slate-500 focus:bg-slate-950 focus:ring-indigo-500 focus:border-indigo-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                  placeholder="••••••••"
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
              {validationErrors.password && (
                <p className="mt-1.5 text-xs text-rose-400 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.password}
                </p>
              )}
            </div>

            {/* Tenant Disambiguation Selector (rendered when an email exists across multiple schools) */}
            {tenantChoices.length > 0 && (
              <div>
                <label htmlFor="schoolId" className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}>
                  Select School Institution
                </label>
                <select
                  id="schoolId"
                  name="schoolId"
                  value={selectedSchoolId}
                  onChange={(e) => {
                    setSelectedSchoolId(e.target.value);
                    if (validationErrors.schoolId) {
                      setValidationErrors((prev) => ({ ...prev, schoolId: undefined }));
                    }
                  }}
                  disabled={isSubmitting}
                  className={`block w-full px-3.5 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isDark
                      ? 'bg-slate-950/80 border border-slate-800 text-white focus:bg-slate-950 focus:ring-indigo-500 focus:border-indigo-500'
                      : 'bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:ring-indigo-600 focus:border-indigo-600'
                  }`}
                >
                  <option value="" className={isDark ? 'bg-slate-900 text-slate-300' : 'bg-white text-slate-700'}>-- Choose your school --</option>
                  {tenantChoices.map((school) => (
                    <option key={school.id} value={school.id} className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>
                      {school.name}
                    </option>
                  ))}
                </select>
                {validationErrors.schoolId && (
                  <p className="mt-1.5 text-xs text-rose-500 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {validationErrors.schoolId}
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-400 shadow-lg shadow-indigo-600/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            className={`text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded-md px-2 py-1 ${
              isDark ? 'text-slate-400 hover:text-indigo-400' : 'text-slate-500 hover:text-indigo-600'
            }`}
          >
            <span>← Back to Institutional Website</span>
          </button>
        </div>

        <div className="mt-4 text-center text-xs text-slate-500">
          Enterprise Multi-Tenant Fee Platform • Protected by Role-Based JWT Context
        </div>
      </div>
    </div>
  );
};
