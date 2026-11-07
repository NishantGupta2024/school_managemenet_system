import React, { useState, useEffect, useCallback } from 'react';
import {
  schoolsApi,
  SchoolAdminRecord,
  SchoolAdminProfile,
  SchoolRecord,
} from '../services/api';
import {
  Users,
  Search,
  KeyRound,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Mail,
  UserCheck,
  UserX,
  History,
  X,
  UserPlus,
} from 'lucide-react';

interface SchoolAdminsManagementViewProps {
  onSwitchToSchools?: () => void;
}

export const SchoolAdminsManagementView: React.FC<SchoolAdminsManagementViewProps> = () => {
  const [admins, setAdmins] = useState<SchoolAdminRecord[]>([]);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [schoolFilter, setSchoolFilter] = useState<string>('');

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Profile Modal State
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [adminProfile, setAdminProfile] = useState<SchoolAdminProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false);

  // Action Dialogs
  const [suspensionTarget, setSuspensionTarget] = useState<SchoolAdminRecord | null>(null);
  const [suspensionReason, setSuspensionReason] = useState<string>('');
  const [isSubmittingSuspension, setIsSubmittingSuspension] = useState<boolean>(false);

  const [activationTarget, setActivationTarget] = useState<SchoolAdminRecord | null>(null);
  const [activationReason, setActivationReason] = useState<string>('');
  const [isSubmittingActivation, setIsSubmittingActivation] = useState<boolean>(false);

  const [resetTarget, setResetTarget] = useState<SchoolAdminRecord | null>(null);
  const [isSubmittingReset, setIsSubmittingReset] = useState<boolean>(false);

  // Add Multi-Admin Dialog
  const [isAddAdminOpen, setIsAddAdminOpen] = useState<boolean>(false);
  const [addAdminData, setAddAdminData] = useState({
    schoolId: '',
    name: '',
    email: '',
    password: '',
  });
  const [isSubmittingAddAdmin, setIsSubmittingAddAdmin] = useState<boolean>(false);

  // Load registered schools for filter dropdown
  useEffect(() => {
    schoolsApi
      .list({ limit: 100 })
      .then((res) => setSchools(res.data))
      .catch(() => {});
  }, []);

  const loadAdmins = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await schoolsApi.listAdmins({
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        schoolId: schoolFilter || undefined,
      });
      setAdmins(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load administrator accounts');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search, statusFilter, schoolFilter]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadAdmins();
  };

  const handleViewProfile = async (adminId: string) => {
    setSelectedAdminId(adminId);
    setIsLoadingProfile(true);
    setError(null);
    try {
      const profile = await schoolsApi.getAdminProfile(adminId);
      setAdminProfile(profile);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to fetch administrator profile');
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleConfirmSuspension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspensionTarget || !suspensionReason.trim()) return;

    setIsSubmittingSuspension(true);
    setError(null);
    try {
      const res = await schoolsApi.suspendAdmin(suspensionTarget.id, suspensionReason.trim());
      setSuccessMessage(res.message);
      setSuspensionTarget(null);
      setSuspensionReason('');
      loadAdmins();
      if (selectedAdminId === suspensionTarget.id) {
        handleViewProfile(suspensionTarget.id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to suspend administrator account');
    } finally {
      setIsSubmittingSuspension(false);
    }
  };

  const handleConfirmActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationTarget) return;

    setIsSubmittingActivation(true);
    setError(null);
    try {
      const res = await schoolsApi.activateAdmin(activationTarget.id, activationReason.trim() || undefined);
      setSuccessMessage(res.message);
      setActivationTarget(null);
      setActivationReason('');
      loadAdmins();
      if (selectedAdminId === activationTarget.id) {
        handleViewProfile(activationTarget.id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to activate administrator account');
    } finally {
      setIsSubmittingActivation(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetTarget) return;

    setIsSubmittingReset(true);
    setError(null);
    try {
      const res = await schoolsApi.initiateAdminPasswordReset(resetTarget.id);
      setSuccessMessage(res.message);
      setResetTarget(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to initiate password reset');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const handleAddAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addAdminData.schoolId || !addAdminData.email.trim() || !addAdminData.password.trim()) {
      setError('Please provide school, email, and password.');
      return;
    }

    setIsSubmittingAddAdmin(true);
    setError(null);
    try {
      const res = await schoolsApi.createAdminForSchool(addAdminData.schoolId, {
        name: addAdminData.name.trim(),
        email: addAdminData.email.trim(),
        password: addAdminData.password,
      });
      setSuccessMessage(res.message);
      setIsAddAdminOpen(false);
      setAddAdminData({ schoolId: '', name: '', email: '', password: '' });
      loadAdmins();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create administrator account');
    } finally {
      setIsSubmittingAddAdmin(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header & Summary Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            School Administrator Accounts
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Global directory of institutional administrators across registered schools. Manage credentials, security statuses, and authentication lifecycles.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAddAdminOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Administrator</span>
          </button>
          <button
            onClick={loadAdmins}
            disabled={isLoading}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by administrator name, email, school name, or code..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* School Filter */}
          <select
            value={schoolFilter}
            onChange={(e) => {
              setSchoolFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Suspended / Inactive</option>
          </select>
        </div>
      </div>

      {/* Administrator Accounts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
            <span className="text-sm text-slate-500 font-medium">Loading administrator directory...</span>
          </div>
        ) : admins.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-800">No administrator accounts found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              No School Administrators match the specified filter or query criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Administrator</th>
                  <th className="py-3 px-4">Associated School</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {admins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{admin.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{admin.email}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {admin.school ? (
                        <div>
                          <div className="font-semibold text-slate-800">{admin.school.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Code: {admin.school.code}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {admin.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {admin.status === 'ACTIVE' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          Suspended
                        </span>
                      )}
                      {admin.lockedUntil && new Date(admin.lockedUntil) > new Date() && (
                        <div className="text-[10px] text-amber-600 font-semibold mt-1">Locked out</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {admin.lastLoginAt ? (
                        <span title={new Date(admin.lastLoginAt).toLocaleString()}>
                          {new Date(admin.lastLoginAt).toLocaleDateString()}{' '}
                          <span className="text-[10px] text-slate-400">
                            {new Date(admin.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Never</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleViewProfile(admin.id)}
                          className="px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium rounded-lg text-xs transition-colors"
                          title="View Profile and Audit History"
                        >
                          Profile
                        </button>

                        <button
                          onClick={() => setResetTarget(admin)}
                          disabled={admin.status !== 'ACTIVE'}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:bg-transparent rounded-lg transition-colors"
                          title="Initiate Secure Password Reset"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {admin.status === 'ACTIVE' ? (
                          <button
                            onClick={() => {
                              setSuspensionTarget(admin);
                              setSuspensionReason('');
                            }}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Suspend Administrator Account"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setActivationTarget(admin);
                              setActivationReason('');
                            }}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Restore / Activate Account"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-800">{admins.length}</span> of{' '}
            <span className="font-semibold text-slate-800">{total}</span> administrator accounts
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-700">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal 1: Administrator Profile & Audit History Drawer */}
      {selectedAdminId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Administrator Profile & Security Details</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedAdminId(null);
                  setAdminProfile(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {isLoadingProfile || !adminProfile ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                  <span className="text-xs text-slate-500">Loading administrator profile...</span>
                </div>
              ) : (
                <>
                  {/* Account Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Account Identity</span>
                      <div className="font-bold text-slate-900 text-base mt-1">{adminProfile.name}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{adminProfile.email}</div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {adminProfile.role}
                        </span>
                        {adminProfile.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Suspended
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Associated School</span>
                      {adminProfile.school ? (
                        <>
                          <div className="font-bold text-slate-900 text-base mt-1">{adminProfile.school.name}</div>
                          <div className="text-xs text-slate-600 font-mono mt-0.5">Code: {adminProfile.school.code}</div>
                          <div className="text-xs text-slate-500 mt-2">
                            Tenant Status: <span className="font-semibold text-slate-700">{adminProfile.school.status}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 italic mt-2">No school assigned</div>
                      )}
                    </div>
                  </div>

                  {/* Metadata and Timestamps */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Account ID</span>
                      <span className="font-mono text-slate-700">{adminProfile.id}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Registration Date</span>
                      <span className="text-slate-700">{new Date(adminProfile.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Last Login Timestamp</span>
                      <span className="text-slate-700">
                        {adminProfile.lastLoginAt ? new Date(adminProfile.lastLoginAt).toLocaleString() : 'Never logged in'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Password Last Changed</span>
                      <span className="text-slate-700">
                        {adminProfile.passwordChangedAt ? new Date(adminProfile.passwordChangedAt).toLocaleString() : 'Default initial password'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Failed Login Attempts</span>
                      <span className="font-semibold text-slate-700">{adminProfile.failedLoginAttempts || 0}</span>
                    </div>
                  </div>

                  {/* Security & Audit Events Trail */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                      <History className="w-4 h-4 text-indigo-600" />
                      Recent Security & Authentication Events
                    </h4>
                    {adminProfile.auditHistory && adminProfile.auditHistory.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {adminProfile.auditHistory.map((item) => (
                          <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800">{item.eventType}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(item.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {item.details && (
                              <div className="text-[11px] text-slate-600 mt-1 font-mono bg-white p-1.5 rounded border border-slate-100">
                                {typeof item.details === 'string' ? item.details : JSON.stringify(item.details)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center border border-slate-200">
                        No recent security events logged for this account.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                onClick={() => {
                  setSelectedAdminId(null);
                  setAdminProfile(null);
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Suspend Account Dialog */}
      {suspensionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmSuspension}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Suspend Administrator Account</h3>
                <p className="text-xs text-slate-500">Revokes access immediately and invalidates all active sessions.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="font-bold text-slate-800">{suspensionTarget.name}</div>
              <div className="text-slate-500">{suspensionTarget.email}</div>
              <div className="text-slate-400 mt-1">School: {suspensionTarget.school?.name}</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Suspension <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder="Specify the security or institutional reason for suspending this administrator..."
                required
                rows={3}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSuspensionTarget(null)}
                disabled={isSubmittingSuspension}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingSuspension || !suspensionReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
              >
                {isSubmittingSuspension ? 'Suspending...' : 'Confirm Suspension'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 3: Activate / Restore Account Dialog */}
      {activationTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmActivation}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Restore Administrator Account</h3>
                <p className="text-xs text-slate-500">Re-enables login access and clears temporary lockout counters.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="font-bold text-slate-800">{activationTarget.name}</div>
              <div className="text-slate-500">{activationTarget.email}</div>
              <div className="text-slate-400 mt-1">School: {activationTarget.school?.name}</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Restoration Note (Optional)
              </label>
              <input
                type="text"
                value={activationReason}
                onChange={(e) => setActivationReason(e.target.value)}
                placeholder="e.g. Compliance review resolved, access restored"
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActivationTarget(null)}
                disabled={isSubmittingActivation}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingActivation}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
              >
                {isSubmittingActivation ? 'Activating...' : 'Restore Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 4: Password Reset Confirmation Dialog */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Initiate Password Reset</h3>
                <p className="text-xs text-slate-500">Dispatches an expiring single-use reset link directly to the user.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to dispatch a password reset link to{' '}
              <strong className="text-slate-800">{resetTarget.email}</strong>? The administrator will receive an email
              valid for 30 minutes. In accordance with zero-trust security guidelines, passwords and tokens are never
              displayed in this interface.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                disabled={isSubmittingReset}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPasswordReset}
                disabled={isSubmittingReset}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
              >
                {isSubmittingReset ? 'Dispatching...' : 'Dispatch Reset Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Add Additional School Administrator Dialog (Multiple Admins support) */}
      {isAddAdminOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAddAdminSubmit}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Provision School Administrator</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddAdminOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Target School Tenant <span className="text-rose-600">*</span>
              </label>
              <select
                value={addAdminData.schoolId}
                onChange={(e) => setAddAdminData({ ...addAdminData, schoolId: e.target.value })}
                required
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select registered school...</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Administrator Full Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={addAdminData.name}
                onChange={(e) => setAddAdminData({ ...addAdminData, name: e.target.value })}
                placeholder="e.g. Dr. Rajesh Sharma"
                required
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Registered Institutional Email <span className="text-rose-600">*</span>
              </label>
              <input
                type="email"
                value={addAdminData.email}
                onChange={(e) => setAddAdminData({ ...addAdminData, email: e.target.value })}
                placeholder="e.g. principal@greenwood.internal"
                required
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Initial Temporary Password <span className="text-rose-600">*</span>
              </label>
              <input
                type="password"
                value={addAdminData.password}
                onChange={(e) => setAddAdminData({ ...addAdminData, password: e.target.value })}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddAdminOpen(false)}
                disabled={isSubmittingAddAdmin}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAddAdmin}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
              >
                {isSubmittingAddAdmin ? 'Provisioning...' : 'Provision Administrator'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
