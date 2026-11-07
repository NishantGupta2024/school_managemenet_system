import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../services/api';

interface TenantContextGateProps {
  children: React.ReactNode;
  moduleName: string;
  moduleDescription?: string;
}

/**
 * TenantContextGate ensures that school-specific workspaces are only rendered
 * when a valid school context is established for PLATFORM_SUPER_ADMIN.
 *
 * For regular institutional users (SCHOOL_ADMIN, FEE_STAFF, TEACHER, STUDENT, PARENT),
 * the gate is completely transparent because their tenant identity is server-authoritative
 * and immutable in their session.
 *
 * If a Super Admin enters a tenant-specific workspace with no school selected, this gate
 * intercepts the view and renders an in-place selector card instead of firing failing API
 * requests that cause 400 Bad Request errors.
 */
export const TenantContextGate: React.FC<TenantContextGateProps> = ({
  children,
  moduleName,
  moduleDescription,
}) => {
  const {
    user,
    selectedSchoolId,
    availableSchools,
    organizationContextLoading,
    organizationContextError,
    selectSchool,
    refreshAvailableSchools,
  } = useAuth();
  const navigate = useNavigate();

  // For non-Super Admin users: pass through immediately
  if (user?.role !== UserRole.PLATFORM_SUPER_ADMIN) {
    return <>{children}</>;
  }

  // If a valid school context is active: render the protected workspace
  if (selectedSchoolId) {
    return <>{children}</>;
  }

  // Loading state while checking organization directory
  if (organizationContextLoading && availableSchools.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-12 text-center max-w-lg mx-auto my-12 space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
        <h3 className="text-base font-bold text-slate-800">Loading Organization Directory...</h3>
        <p className="text-xs text-slate-500">
          Preparing available school tenants for {moduleName}.
        </p>
      </div>
    );
  }

  // Intercept view: Target School Context Required
  return (
    <div
      role="region"
      aria-label="Target School Context Required"
      className="bg-white rounded-3xl border border-amber-200 shadow-sm p-8 sm:p-10 text-center max-w-xl mx-auto my-8 space-y-5 animate-in fade-in duration-150"
    >
      <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl w-fit mx-auto border border-amber-100">
        <Building2 className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase tracking-wider">
          Target School Required
        </span>
        <h3 className="text-xl font-bold text-slate-900 tracking-tight">
          Select School Context for {moduleName}
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          {moduleDescription ||
            `The ${moduleName} workspace operates strictly on institutional tenant records. Please choose a target school from your directory to manage its data.`}
        </p>
      </div>

      {/* Directory Error Display */}
      {organizationContextError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between gap-2 max-w-md mx-auto text-left">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="truncate">{organizationContextError}</span>
          </div>
          {refreshAvailableSchools && (
            <button
              onClick={() => refreshAvailableSchools()}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 shrink-0 underline"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Selection Control */}
      <div className="pt-2 max-w-sm mx-auto space-y-3">
        {availableSchools.length > 0 ? (
          <div>
            <label htmlFor="gate-school-select" className="sr-only">
              Select School for {moduleName}
            </label>
            <select
              id="gate-school-select"
              defaultValue=""
              aria-label={`Select School for ${moduleName}`}
              onChange={(e) => {
                if (e.target.value) {
                  selectSchool(e.target.value).catch((err) => {
                    console.error('Failed to set context from gate:', err);
                  });
                }
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="" disabled>
                -- Choose School from Directory --
              </option>
              {availableSchools.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                  disabled={s.status !== 'ACTIVE'}
                >
                  {s.name} ({s.code || 'NO-CODE'}) {s.status !== 'ACTIVE' ? `[${s.status}]` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
            No school tenants found in directory.
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/app/admin')}
            className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Schools Directory</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/app')}
            className="w-full sm:w-auto px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl transition-colors inline-flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>System Launcher</span>
          </button>
        </div>
      </div>
    </div>
  );
};
