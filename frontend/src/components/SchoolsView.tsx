import React, { useState, useEffect, useCallback } from 'react';
import {
  schoolsApi,
  SchoolRecord,
  CreateSchoolPayload,
  UpdateSchoolPayload,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SchoolAdminsManagementView } from './SchoolAdminsManagementView';
import {
  Building2,
  Search,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
  GraduationCap,
  FileText,
  CreditCard,
  ExternalLink,
  Edit2,
  Power,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  UserPlus,
  ShieldCheck,
  UserCog,
} from 'lucide-react';

export const SchoolsView: React.FC = () => {
  const { selectedSchoolId, selectSchool, setSelectedSchoolId } = useAuth();

  const [activeTab, setActiveTab] = useState<'SCHOOLS' | 'ADMINS'>('SCHOOLS');

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ALL');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState<boolean>(false);
  const [isProvisionAdminOpen, setIsProvisionAdminOpen] = useState<boolean>(false);
  const [provisionAdminData, setProvisionAdminData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [provisionAdminError, setProvisionAdminError] = useState<string | null>(null);

  const [activeSchool, setActiveSchool] = useState<SchoolRecord | null>(null);

  // Form states
  const [formData, setFormData] = useState<CreateSchoolPayload>({
    code: '',
    name: '',
    address: '',
    city: '',
    state: '',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Edit form state
  const [editFormData, setEditFormData] = useState<UpdateSchoolPayload>({
    name: '',
    address: '',
    city: '',
    state: '',
    country: 'IN',
    phone: '',
    email: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  });

  const loadSchools = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await schoolsApi.list({
        page,
        limit,
        search: search.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      setSchools(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load schools');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search, statusFilter]);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadSchools();
  };

  const validateCreateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.code || formData.code.trim().length < 2) {
      errs.code = 'School code is required (min 2 characters)';
    } else if (!/^[A-Z0-9_-]+$/.test(formData.code.trim())) {
      errs.code = 'Code must contain only uppercase letters, numbers, underscores, or hyphens';
    }

    if (!formData.name || formData.name.trim().length < 2) {
      errs.name = 'School name is required (min 2 characters)';
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreateForm()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await schoolsApi.create({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        address: formData.address?.trim() || undefined,
        city: formData.city?.trim() || undefined,
        state: formData.state?.trim() || undefined,
        phone: formData.phone?.trim() || undefined,
        email: formData.email?.trim() || undefined,
        country: formData.country?.trim() || 'IN',
        currency: formData.currency?.trim() || 'INR',
        timezone: formData.timezone?.trim() || 'Asia/Kolkata',
      });

      setSuccessMessage(`School "${created.name}" (${created.code}) created successfully.`);
      setIsCreateModalOpen(false);
      setFormData({
        code: '',
        name: '',
        address: '',
        city: '',
        state: '',
        country: 'IN',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
      });
      loadSchools();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create school');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditOpen = (school: SchoolRecord) => {
    setActiveSchool(school);
    setEditFormData({
      name: school.name,
      address: school.address || '',
      city: school.city || '',
      state: school.state || '',
      country: school.country || 'IN',
      phone: school.phone || '',
      email: school.email || '',
      currency: school.currency || 'INR',
      timezone: school.timezone || 'Asia/Kolkata',
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await schoolsApi.update(activeSchool.id, editFormData);
      setSuccessMessage(`School "${updated.name}" updated successfully.`);
      setIsEditModalOpen(false);
      loadSchools();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update school');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusToggleConfirm = async () => {
    if (!activeSchool) return;

    const targetStatus = activeSchool.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await schoolsApi.updateStatus(activeSchool.id, targetStatus);
      setSuccessMessage(`School "${updated.name}" status changed to ${updated.status}.`);
      setIsStatusConfirmOpen(false);
      loadSchools();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update school status');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProvisionAdminOpen = (school: SchoolRecord) => {
    setActiveSchool(school);
    setProvisionAdminData({ name: '', email: '', password: '' });
    setProvisionAdminError(null);
    setIsProvisionAdminOpen(true);
  };

  const handleProvisionAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool) return;

    if (
      !provisionAdminData.name.trim() ||
      !provisionAdminData.email.trim() ||
      !provisionAdminData.password
    ) {
      setProvisionAdminError('Please fill in all required fields.');
      return;
    }

    if (provisionAdminData.password.length < 8) {
      setProvisionAdminError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    setProvisionAdminError(null);
    try {
      const res = await schoolsApi.provisionAdmin(activeSchool.id, provisionAdminData);
      setSuccessMessage(
        `Administrator "${res.user.email}" successfully provisioned for ${activeSchool.name}.`,
      );
      setIsProvisionAdminOpen(false);
      loadSchools();
    } catch (err: any) {
      setProvisionAdminError(
        err?.response?.data?.message || err?.message || 'Failed to provision administrator',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectContext = async (school: SchoolRecord) => {
    if (school.status !== 'ACTIVE') {
      setError(`Cannot select school "${school.name}" because its status is ${school.status}.`);
      return;
    }
    try {
      if (selectSchool) {
        await selectSchool(school.id);
      } else {
        setSelectedSchoolId(school.id);
      }
      setSuccessMessage(`Switched active context to "${school.name}". All tab views will now target this tenant.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to switch school context');
    }
  };

  const getStatusBadge = (status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            Active
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Suspended
          </span>
        );
      case 'INACTIVE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            <XCircle className="w-3 h-3 text-slate-500" />
            Inactive
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Sub-Tabs: Schools Directory vs Administrator Accounts */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('SCHOOLS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'SCHOOLS'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>School Directory</span>
        </button>

        <button
          onClick={() => setActiveTab('ADMINS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'ADMINS'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <UserCog className="w-4 h-4" />
          <span>Administrator Accounts</span>
        </button>
      </div>

      {activeTab === 'ADMINS' ? (
        <SchoolAdminsManagementView onSwitchToSchools={() => setActiveTab('SCHOOLS')} />
      ) : (
        <>
          {/* Header Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <Building2 className="w-5 h-5" />
                </div>
                <h1 className="text-xl font-bold text-slate-900">Schools Directory & Onboarding</h1>
              </div>
              <p className="text-sm text-slate-500">
                Multi-Tenant Platform Administration — Provision new school tenants, monitor activity, and select active context.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setFormData({
                    code: '',
                    name: '',
                    address: '',
                    city: '',
                    state: '',
                    country: 'IN',
                    currency: 'INR',
                    timezone: 'Asia/Kolkata',
                  });
                  setFormErrors({});
                  setIsCreateModalOpen(true);
                }}
                aria-label="Onboard School"
                className="flex items-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                Onboard School
              </button>
              <button
                onClick={loadSchools}
                className="p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                title="Refresh schools list"
                aria-label="Refresh schools list"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Schools</span>
            <Building2 className="w-5 h-5 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{total}</span>
            <span className="text-xs text-slate-500">registered tenants</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active</span>
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">
              {schools.filter((s) => s.status === 'ACTIVE').length}
            </span>
            <span className="text-xs text-slate-500">on this page</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suspended</span>
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-700">
              {schools.filter((s) => s.status === 'SUSPENDED').length}
            </span>
            <span className="text-xs text-slate-500">blocked access</span>
          </div>
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

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by school name, code or city..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </form>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label htmlFor="status-filter-select" className="text-xs font-medium text-slate-500 shrink-0">Status:</label>
          <select
            id="status-filter-select"
            aria-label="Filter by Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* Schools Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading && schools.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-600 mb-3" />
            <p className="text-sm font-medium">Loading school directory...</p>
          </div>
        ) : schools.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700 mb-1">No schools found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
              {search || statusFilter !== 'ALL'
                ? 'Try adjusting your search criteria or filter to locate the school tenant.'
                : 'No schools onboarded yet. Click "Onboard School" above to establish your first tenant.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">School</th>
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Admin</th>
                  <th className="py-3.5 px-4">Metrics</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {schools.map((school) => {
                  const isCurrentActive = selectedSchoolId === school.id;
                  return (
                    <tr
                      key={school.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrentActive ? 'bg-amber-50/50' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                              isCurrentActive
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {school.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              <span>{school.name}</span>
                              {isCurrentActive && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-200 text-amber-900 rounded">
                                  Active Context
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                              ID: {school.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded">
                          {school.code}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        {school.city ? `${school.city}${school.state ? `, ${school.state}` : ''}` : '—'}
                      </td>

                      <td className="py-3.5 px-4">{getStatusBadge(school.status)}</td>

                      <td className="py-3.5 px-4">
                        {school.hasAdmin ? (
                          <div
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                            title={school.admin?.email}
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>{school.admin?.name || 'Provisioned'}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Not Provisioned</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3 text-xs text-slate-600">
                          <span title="Students" className="inline-flex items-center gap-1">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                            {school._count?.students ?? 0}
                          </span>
                          <span title="Users / Staff" className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-blue-500" />
                            {school._count?.users ?? 0}
                          </span>
                          <span title="Invoices" className="inline-flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-emerald-500" />
                            {school._count?.invoices ?? 0}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSelectContext(school)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                              isCurrentActive
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                            title="Set as target school context for tab operations"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {isCurrentActive ? 'Selected' : 'Select Context'}
                          </button>

                          {!school.hasAdmin && school.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleProvisionAdminOpen(school)}
                              className="px-2 py-1 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 transition-colors"
                              title="Provision Initial Administrator"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Provision Admin</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setActiveSchool(school);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="View School Details"
                            aria-label="View School Details"
                          >
                            <Building2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleEditOpen(school)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit School Profile"
                            aria-label="Edit School Profile"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setActiveSchool(school);
                              setIsStatusConfirmOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              school.status === 'ACTIVE'
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={school.status === 'ACTIVE' ? 'Suspend School' : 'Activate School'}
                            aria-label={school.status === 'ACTIVE' ? 'Suspend School' : 'Activate School'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {total > limit && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold">{(page - 1) * limit + 1}</span> to{' '}
              <span className="font-semibold">{Math.min(page * limit, total)}</span> of{' '}
              <span className="font-semibold">{total}</span> schools
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white disabled:opacity-50 hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white disabled:opacity-50 hover:bg-slate-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Onboard New School */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-700" />
                <h3 className="font-bold text-slate-800 text-base">Onboard New School Tenant</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="create-school-code" className="block text-xs font-semibold text-slate-700 mb-1">
                    School Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="create-school-code"
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SCH003"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  {formErrors.code && <p className="text-xs text-rose-500 mt-1">{formErrors.code}</p>}
                </div>

                <div>
                  <label htmlFor="create-school-currency" className="block text-xs font-semibold text-slate-700 mb-1">
                    Currency
                  </label>
                  <input
                    id="create-school-currency"
                    type="text"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                    placeholder="INR"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="create-school-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  School Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-school-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. St. Jude International School"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                {formErrors.name && <p className="text-xs text-rose-500 mt-1">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street / Campus address"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="create-school-phone" className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    id="create-school-phone"
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="create-school-email" className="block text-xs font-semibold text-slate-700 mb-1">Contact Email</label>
                  <input
                    id="create-school-email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="admin@school.edu"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Bangalore"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="e.g. Karnataka"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value.toUpperCase() })}
                    placeholder="IN"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
                  <input
                    type="text"
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    placeholder="Asia/Kolkata"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors"
                >
                  {isSubmitting ? 'Provisioning...' : 'Create School Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: View School Details */}
      {isDetailModalOpen && activeSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-700" />
                <h3 className="font-bold text-slate-800 text-base">School Tenant Details</h3>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <div className="text-xl font-bold text-slate-900">{activeSchool.name}</div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">UUID: {activeSchool.id}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Code</span>
                  <div className="font-mono font-bold text-slate-800 mt-1">{activeSchool.code}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Status</span>
                  <div className="mt-1">{getStatusBadge(activeSchool.status)}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Currency / Country</span>
                  <div className="font-bold text-slate-800 mt-1">
                    {activeSchool.currency} ({activeSchool.country})
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 uppercase font-semibold text-[10px]">Timezone</span>
                  <div className="font-bold text-slate-800 mt-1">{activeSchool.timezone}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                <span className="text-slate-400 uppercase font-semibold text-[10px]">Address & City</span>
                <div className="text-slate-800 mt-1">
                  {activeSchool.address ? `${activeSchool.address}, ` : ''}
                  {activeSchool.city || 'No city specified'}
                  {activeSchool.state ? `, ${activeSchool.state}` : ''}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Tenant Entity Counts
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                    <GraduationCap className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
                    <div className="text-base font-bold text-indigo-900">
                      {activeSchool._count?.students ?? 0}
                    </div>
                    <div className="text-[10px] text-indigo-600 font-medium">Students</div>
                  </div>
                  <div className="p-2 bg-blue-50 border border-blue-100 rounded-xl">
                    <Users className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                    <div className="text-base font-bold text-blue-900">
                      {activeSchool._count?.users ?? 0}
                    </div>
                    <div className="text-[10px] text-blue-600 font-medium">Staff/Users</div>
                  </div>
                  <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <FileText className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                    <div className="text-base font-bold text-emerald-900">
                      {activeSchool._count?.invoices ?? 0}
                    </div>
                    <div className="text-[10px] text-emerald-600 font-medium">Invoices</div>
                  </div>
                  <div className="p-2 bg-purple-50 border border-purple-100 rounded-xl">
                    <CreditCard className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                    <div className="text-base font-bold text-purple-900">
                      {activeSchool._count?.payments ?? 0}
                    </div>
                    <div className="text-[10px] text-purple-600 font-medium">Payments</div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectContext(activeSchool);
                    setIsDetailModalOpen(false);
                  }}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Select as Active Context
                </button>
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit School Profile */}
      {isEditModalOpen && activeSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800 text-base">Edit School: {activeSchool.name}</h3>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  School Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-school-phone" className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    id="edit-school-phone"
                    type="text"
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="+91..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="edit-school-email" className="block text-xs font-semibold text-slate-700 mb-1">Contact Email</label>
                  <input
                    id="edit-school-email"
                    type="email"
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    placeholder="admin@school.edu"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={editFormData.city}
                    onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={editFormData.state}
                    onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
                  <input
                    type="text"
                    value={editFormData.currency}
                    onChange={(e) => setEditFormData({ ...editFormData, currency: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
                  <input
                    type="text"
                    value={editFormData.timezone}
                    onChange={(e) => setEditFormData({ ...editFormData, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Suspend / Activate Confirmation */}
      {isStatusConfirmOpen && activeSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldAlert
                  className={`w-5 h-5 ${
                    activeSchool.status === 'ACTIVE' ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                />
                <h3 className="font-bold text-slate-800 text-base">
                  {activeSchool.status === 'ACTIVE' ? 'Suspend School Tenant' : 'Activate School Tenant'}
                </h3>
              </div>
              <button
                onClick={() => setIsStatusConfirmOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-sm text-slate-600">
                Are you sure you want to change the status of{' '}
                <span className="font-bold text-slate-900">{activeSchool.name}</span> to{' '}
                <span className="font-bold uppercase">
                  {activeSchool.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}
                </span>
                ?
              </p>

              {activeSchool.status === 'ACTIVE' ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <p className="font-semibold">Impact of Suspension:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                    <li>School staff, students, and parents will be blocked from logging in or making requests.</li>
                    <li>All financial records, invoices, payments, and receipts remain completely preserved.</li>
                    <li>Platform Super Admin can re-activate the school at any time.</li>
                  </ul>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  Activating this school will immediately restore API access for all authenticated staff, students, and parents.
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsStatusConfirmOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleStatusToggleConfirm}
                  className={`px-5 py-2 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors ${
                    activeSchool.status === 'ACTIVE'
                      ? 'bg-amber-700 hover:bg-amber-800'
                      : 'bg-emerald-700 hover:bg-emerald-800'
                  }`}
                >
                  {isSubmitting
                    ? 'Updating...'
                    : activeSchool.status === 'ACTIVE'
                    ? 'Confirm Suspension'
                    : 'Confirm Activation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provision Initial Administrator Modal */}
      {isProvisionAdminOpen && activeSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-base">
                  Provision School Administrator
                </h3>
              </div>
              <button
                onClick={() => setIsProvisionAdminOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProvisionAdminSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900">
                <p className="font-semibold">Target School:</p>
                <p className="font-medium text-indigo-800 mt-0.5">
                  {activeSchool.name} ({activeSchool.code})
                </p>
                <p className="text-indigo-600 text-[11px] mt-1">
                  This user will be provisioned with the <strong>SCHOOL_ADMIN</strong> role for this school.
                </p>
              </div>

              {provisionAdminError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{provisionAdminError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Administrator Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Arthur Pendelton"
                  value={provisionAdminData.name}
                  onChange={(e) =>
                    setProvisionAdminData({ ...provisionAdminData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="principal@school.edu"
                  value={provisionAdminData.email}
                  onChange={(e) =>
                    setProvisionAdminData({ ...provisionAdminData, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 8 characters, letter & number"
                  value={provisionAdminData.password}
                  onChange={(e) =>
                    setProvisionAdminData({ ...provisionAdminData, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Must be at least 8 characters long and contain both letters and digits.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsProvisionAdminOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-xs bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Provisioning...' : 'Confirm Provision Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
