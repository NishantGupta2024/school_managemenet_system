import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  UserCircle,
  LayoutGrid,
  Building2,
  ChevronDown,
  Search,
  Check,
  RefreshCw,
  AlertCircle,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole, SchoolRecord } from '../services/api';
import { CymbixLogo } from './CymbixLogo';

export const Header: React.FC = () => {
  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    authContext = useAuth();
  } catch {
    authContext = null;
  }

  const navigate = useNavigate();
  const location = useLocation();

  const user = authContext?.user;
  const logout = authContext?.logout;
  const selectedSchoolId = authContext?.selectedSchoolId;
  const selectedSchool = authContext?.selectedSchool;
  const availableSchools = authContext?.availableSchools || [];
  const organizationContextLoading = authContext?.organizationContextLoading || false;
  const organizationContextError = authContext?.organizationContextError || null;
  const selectSchool = authContext?.selectSchool;
  const clearSelectedSchool = authContext?.clearSelectedSchool;
  const refreshAvailableSchools = authContext?.refreshAvailableSchools;

  // Dropdown & Search UI State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [switchingError, setSwitchingError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setSearchQuery('');
        setSwitchingError(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
        setSearchQuery('');
        setSwitchingError(null);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Filter organizations by search query (name and code, case-insensitive)
  const filteredSchools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availableSchools;
    return availableSchools.filter((school) => {
      const nameMatch = school.name.toLowerCase().includes(q);
      const codeMatch = school.code ? school.code.toLowerCase().includes(q) : false;
      return nameMatch || codeMatch;
    });
  }, [availableSchools, searchQuery]);

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
      case 'TEACHER':
        return 'Teacher';
      default:
        return 'Staff';
    }
  };

  const isPlatformSuperAdmin = user?.role === UserRole.PLATFORM_SUPER_ADMIN;

  const handleSelectPlatformWide = () => {
    if (clearSelectedSchool) {
      clearSelectedSchool();
    }
    setIsDropdownOpen(false);
    setSearchQuery('');
    setSwitchingError(null);
  };

  const handleSelectSchool = async (school: SchoolRecord) => {
    if (school.status !== 'ACTIVE') {
      return; // Disabled
    }

    setSwitchingError(null);
    if (selectSchool) {
      try {
        await selectSchool(school.id);
        setIsDropdownOpen(false);
        setSearchQuery('');
      } catch (err: any) {
        setSwitchingError(err?.message || 'Failed to select school');
      }
    }
  };

  const handleRetryLoading = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (refreshAvailableSchools) {
      await refreshAvailableSchools();
    }
  };

  const isInsideModule = location.pathname.startsWith('/app/') && location.pathname !== '/app';

  return (
    <header className="bg-white border-b border-slate-200 px-2.5 sm:px-6 h-16 sm:h-[88px] lg:h-24 sticky top-0 z-30 flex items-center">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4 w-full">
        {/* Left: Branding & Module Switcher */}
        <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
          <div
            onClick={() => navigate('/app')}
            className="cursor-pointer transition-opacity hover:opacity-90 flex items-center"
            title="Return to System Launcher"
          >
            <CymbixLogo className="!h-8 sm:!h-16 lg:!h-[72px]" />
            <span className="sr-only">School ERP</span>
          </div>
          {isInsideModule && (
            <button
              onClick={() => navigate('/app')}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors shadow-xs"
              title="Return to Main ERP System Launcher"
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xs:inline sm:inline">Launcher</span>
            </button>
          )}
        </div>

        {/* Right: Organization Switcher & User Profile */}
        <div className="flex items-center space-x-1.5 sm:space-x-4">
          {/* 1. Global Super Admin Organization Switcher */}
          {isPlatformSuperAdmin ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                aria-label="Organization Switcher"
                aria-haspopup="listbox"
                aria-expanded={isDropdownOpen}
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all max-w-[130px] sm:max-w-[270px] ${
                  selectedSchool
                    ? 'bg-amber-50/80 border-amber-300 text-amber-950 hover:bg-amber-100'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div
                  className={`p-1 rounded-lg shrink-0 ${
                    selectedSchool
                      ? 'bg-amber-200 text-amber-900'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div className="text-left truncate flex-1 min-w-0">
                  <span className="block text-[8px] sm:text-[9px] uppercase tracking-wider text-slate-400 font-bold leading-none truncate">
                    {selectedSchool ? 'Active Tenant' : 'Context Scope'}
                  </span>
                  <span className="block truncate text-[11px] sm:text-xs font-bold mt-0.5">
                    {organizationContextLoading
                      ? 'Loading schools...'
                      : selectedSchool
                      ? selectedSchool.name
                      : 'Platform-Wide'}
                  </span>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${
                    isDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Organization Dropdown Popover */}
              {isDropdownOpen && (
                <div
                  role="listbox"
                  aria-label="Select Organization"
                  className="absolute right-0 mt-2 w-[calc(100vw-20px)] max-w-xs sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                >
                  {/* Dropdown Header & Search */}
                  <div className="p-3 bg-slate-50 border-b border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        <span>Select Organization</span>
                      </span>
                      {refreshAvailableSchools && (
                        <button
                          type="button"
                          onClick={handleRetryLoading}
                          title="Refresh organizations list"
                          aria-label="Refresh Organizations"
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              organizationContextLoading ? 'animate-spin text-indigo-600' : ''
                            }`}
                          />
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by school name or code..."
                        aria-label="Search Organizations"
                        className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          aria-label="Clear search"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Error State */}
                  {organizationContextError && (
                    <div className="p-3 bg-rose-50 border-b border-rose-100 flex items-start gap-2 text-xs text-rose-800">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold">{organizationContextError}</p>
                        <button
                          type="button"
                          onClick={handleRetryLoading}
                          className="mt-1 text-indigo-600 hover:text-indigo-800 font-bold underline"
                        >
                          Retry Loading
                        </button>
                      </div>
                    </div>
                  )}

                  {switchingError && (
                    <div className="p-2.5 bg-rose-50 border-b border-rose-100 text-xs text-rose-700 font-medium flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>{switchingError}</span>
                    </div>
                  )}

                  {/* Options List */}
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 p-1">
                    {/* Option 1: Platform-Wide Scope */}
                    <div
                      role="option"
                      aria-selected={!selectedSchoolId}
                      tabIndex={0}
                      onClick={handleSelectPlatformWide}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectPlatformWide();
                        }
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors text-xs ${
                        !selectedSchoolId
                          ? 'bg-indigo-50/80 text-indigo-950 font-bold'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            !selectedSchoolId ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                        />
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span>Platform-Wide</span>
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                              Root
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-normal">
                            Cross-tenant administration & global directory
                          </span>
                        </div>
                      </div>
                      {!selectedSchoolId && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                    </div>

                    {/* Loading State */}
                    {organizationContextLoading && availableSchools.length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-400 space-y-1">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-500 mx-auto mb-1" />
                        <span>Loading organizations...</span>
                      </div>
                    )}

                    {/* Empty Search Result */}
                    {!organizationContextLoading && filteredSchools.length === 0 && searchQuery && (
                      <div className="p-4 text-center text-xs text-slate-500">
                        <span>No organizations match "{searchQuery}"</span>
                      </div>
                    )}

                    {/* No Organizations at all */}
                    {!organizationContextLoading && availableSchools.length === 0 && !searchQuery && (
                      <div className="p-4 text-center text-xs text-slate-500">
                        <span>No organizations onboarded yet.</span>
                      </div>
                    )}

                    {/* Filtered Schools */}
                    {filteredSchools.map((school) => {
                      const isSelected = selectedSchoolId === school.id;
                      const isActive = school.status === 'ACTIVE';

                      return (
                        <div
                          key={school.id}
                          role="option"
                          aria-selected={isSelected}
                          aria-disabled={!isActive}
                          tabIndex={isActive ? 0 : -1}
                          onClick={() => isActive && handleSelectSchool(school)}
                          onKeyDown={(e) => {
                            if (isActive && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              handleSelectSchool(school);
                            }
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl transition-colors text-xs ${
                            !isActive
                              ? 'opacity-60 bg-slate-50/50 cursor-not-allowed text-slate-400'
                              : isSelected
                              ? 'bg-amber-50/90 text-amber-950 font-bold cursor-pointer'
                              : 'hover:bg-slate-50 text-slate-800 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isSelected
                                  ? 'bg-amber-600'
                                  : isActive
                                  ? 'bg-emerald-500'
                                  : 'bg-rose-400'
                              }`}
                            />
                            <div className="truncate">
                              <div className="font-semibold truncate flex items-center gap-1.5">
                                <span className="truncate">{school.name}</span>
                                {school.code && (
                                  <span className="text-[10px] font-mono px-1 py-0.2 bg-slate-100 text-slate-600 rounded shrink-0">
                                    {school.code}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                                {school.status !== 'ACTIVE' ? (
                                  <span className="font-bold text-rose-600 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                    {school.status}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono">
                                    ID: {school.id.slice(0, 8)}...
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {isSelected && <Check className="w-4 h-4 text-amber-700 shrink-0 ml-2" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 2. Fixed School Identifier for Non-Super-Admins */
            <div className="text-right border-r border-slate-200 pr-4 hidden sm:block">
              <span className="text-xs font-bold text-slate-800 block truncate max-w-[180px]">
                {user?.schoolName || 'Greenwood Intl Academy'}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {user?.schoolId ? `${user.schoolId.slice(0, 8)}...` : 'SCH001'}
              </span>
            </div>
          )}

          {/* 3. User Profile Badge & Logout */}
          {user && (
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 border border-slate-200 py-1.5 px-2 sm:px-3 rounded-xl">
                <UserCircle className="w-4 h-4 text-slate-500 shrink-0" />
                <div className="text-left hidden md:block">
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
                  className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-200 transition-colors"
                  title="Sign out of school ERP"
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
