import React from 'react';
import { School, ShieldCheck, LogOut, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Header: React.FC = () => {
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
  } catch {
    authContext = null;
  }

  const user = authContext?.user;
  const logout = authContext?.logout;
  const selectedSchoolId = authContext?.selectedSchoolId;

  const formatRole = (role?: string) => {
    switch (role) {
      case 'PLATFORM_SUPER_ADMIN':
        return 'Super Admin';
      case 'SCHOOL_ADMIN':
        return 'School Admin';
      case 'FEE_STAFF':
        return 'Fee Staff';
      case 'STUDENT':
        return 'Student';
      case 'PARENT':
        return 'Parent';
      default:
        return 'Staff';
    }
  };

  const schoolTitle =
    user?.schoolName ||
    (user?.role === 'PLATFORM_SUPER_ADMIN'
      ? selectedSchoolId
        ? 'Administering Target School'
        : 'Platform Administration'
      : 'Greenwood Intl Academy');

  const schoolIdentifier =
    user?.schoolId
      ? `${user.schoolId.slice(0, 8)}...`
      : user?.role === 'PLATFORM_SUPER_ADMIN'
      ? selectedSchoolId
        ? `${selectedSchoolId.slice(0, 8)}...`
        : 'CROSS-TENANT'
      : 'SCH001';

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-brand-600 p-2.5 rounded-xl text-white shadow-sm shadow-brand-500/30">
            <School className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              School Fee Management System
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Multi-Tenant Architecture • Phase 1 Foundation
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden lg:flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Phase 1: Foundation Ready</span>
          </div>

          {/* School Identifier */}
          <div className="text-right border-r border-slate-200 pr-4 hidden sm:block">
            <span className="text-xs font-bold text-slate-800 block truncate max-w-[180px]">
              {schoolTitle}
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {schoolIdentifier}
            </span>
          </div>

          {/* User Profile Badge & Logout */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-xl">
                <UserCircle className="w-4 h-4 text-slate-500 shrink-0" />
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-800 leading-tight">
                    {user.name}
                  </div>
                  <div className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">
                    {formatRole(user.role)}
                  </div>
                </div>
              </div>

              {logout && (
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-200 transition-colors"
                  title="Sign out of fee management system"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
