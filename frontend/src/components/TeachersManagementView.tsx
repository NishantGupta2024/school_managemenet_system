import React, { useState, useEffect, useCallback } from 'react';
import {
  teachersApi,
  academicsApi,
  Teacher,
  TeacherAssignment,
  TeacherStatus,
  AcademicYear,
  GradeClass,
  UserRole,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit2,
  Phone,
  Mail,
  GraduationCap,
  BookOpen,
  UserCheck,
  UserX,
  Lock,
  Trash2,
  ShieldAlert,
  Briefcase,
} from 'lucide-react';

export const TeachersManagementView: React.FC = () => {
  const { user } = useAuth();
  const canManage =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN || user?.role === UserRole.SCHOOL_ADMIN;

  // Directory state
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [totalTeachers, setTotalTeachers] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<TeacherStatus | ''>('');
  const [departments, setDepartments] = useState<string[]>([]);

  // Reference data for assignments
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals & Panels
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [selectedTeacherForProfile, setSelectedTeacherForProfile] = useState<Teacher | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false);

  // Assignment Modal
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [assignTeacherTarget, setAssignTeacherTarget] = useState<Teacher | null>(null);
  const [assignYearId, setAssignYearId] = useState<string>('');
  const [assignGradeId, setAssignGradeId] = useState<string>('');
  const [assignSectionId, setAssignSectionId] = useState<string>('');
  const [assignSubject, setAssignSubject] = useState<string>('General');
  const [assignIsClassTeacher, setAssignIsClassTeacher] = useState<boolean>(false);
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Provision Account Modal
  const [showProvisionModal, setShowProvisionModal] = useState<boolean>(false);
  const [provisionTarget, setProvisionTarget] = useState<Teacher | null>(null);
  const [provisionEmail, setProvisionEmail] = useState<string>('');
  const [provisionPassword, setProvisionPassword] = useState<string>('');
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Confirmation Modal
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    isDangerous?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Form State
  const initialFormData = {
    employeeId: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    designation: '',
    joiningDate: new Date().toISOString().split('T')[0],
    status: 'ACTIVE' as TeacherStatus,
  };
  const [formData, setFormData] = useState(initialFormData);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto-clear messages
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Load departments and academic metadata
  useEffect(() => {
    let isMounted = true;
    const loadMetadata = async () => {
      try {
        const [deptList, yearsData, gradesData] = await Promise.all([
          teachersApi.getDepartments().catch(() => []),
          academicsApi.getAcademicYears().catch(() => []),
          academicsApi.getGrades().catch(() => []),
        ]);
        if (isMounted) {
          setDepartments(deptList || []);
          setAcademicYears(yearsData || []);
          setGrades(gradesData || []);
        }
      } catch (err) {
        console.error('Failed to load teacher metadata', err);
      }
    };
    loadMetadata();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Teacher Directory
  const fetchTeachers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await teachersApi.getTeachers({
        page,
        limit,
        search: search.trim() || undefined,
        department: selectedDepartment || undefined,
        status: (selectedStatus as TeacherStatus) || undefined,
      });

      if (res && res.data) {
        setTeachers(res.data);
        setTotalTeachers(res.meta.total);
        setTotalPages(res.meta.totalPages || 1);
      } else {
        setTeachers([]);
        setTotalTeachers(0);
        setTotalPages(1);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to load faculty directory';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search, selectedDepartment, selectedStatus]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  // Search handler
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  // Open Profile Drawer
  const handleOpenProfile = async (teacher: Teacher) => {
    setSelectedTeacherForProfile(teacher);
    setIsLoadingProfile(true);
    try {
      const detailed = await teachersApi.getTeacherById(teacher.id);
      setSelectedTeacherForProfile(detailed);
    } catch (err) {
      console.error('Failed to fetch detailed teacher profile', err);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Refresh Single Profile (after assignment or account change)
  const refreshSelectedProfile = async (teacherId: string) => {
    try {
      const detailed = await teachersApi.getTeacherById(teacherId);
      setSelectedTeacherForProfile(detailed);
      // Also update in list
      setTeachers((prev) => prev.map((t) => (t.id === teacherId ? detailed : t)));
    } catch (err) {
      console.error('Failed to refresh teacher profile', err);
    }
  };

  // Create Form Open
  const handleOpenCreateModal = () => {
    setFormData(initialFormData);
    setFormError(null);
    setShowCreateModal(true);
  };

  // Edit Form Open
  const handleOpenEditModal = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      employeeId: teacher.employeeId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.email,
      phone: teacher.phone || '',
      department: teacher.department || '',
      designation: teacher.designation || '',
      joiningDate: teacher.joiningDate
        ? new Date(teacher.joiningDate).toISOString().split('T')[0]
        : '',
      status: teacher.status,
    });
    setFormError(null);
    setShowEditModal(true);
  };

  // Submit Create
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.employeeId.trim()) {
      setFormError('Employee ID is required');
      return;
    }
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setFormError('First and last name are required');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setFormError('A valid email address is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await teachersApi.createTeacher({
        employeeId: formData.employeeId.trim().toUpperCase(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || undefined,
        department: formData.department.trim() || undefined,
        designation: formData.designation.trim() || undefined,
        joiningDate: formData.joiningDate || undefined,
        status: formData.status,
      });

      setShowCreateModal(false);
      setSuccessMessage(
        `Teacher ${created.firstName} ${created.lastName} (${created.employeeId}) registered successfully.`,
      );
      fetchTeachers();
      // Update departments list if new
      if (created.department && !departments.includes(created.department)) {
        setDepartments((prev) => [...prev, created.department!].sort());
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to create teacher profile';
      setFormError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    setFormError(null);

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setFormError('First and last name are required');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setFormError('A valid email address is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await teachersApi.updateTeacher(editingTeacher.id, {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || undefined,
        department: formData.department.trim() || undefined,
        designation: formData.designation.trim() || undefined,
        joiningDate: formData.joiningDate || undefined,
        status: formData.status,
      });

      setShowEditModal(false);
      setEditingTeacher(null);
      setSuccessMessage(`Teacher profile for ${updated.firstName} ${updated.lastName} updated.`);
      fetchTeachers();
      if (selectedTeacherForProfile?.id === updated.id) {
        refreshSelectedProfile(updated.id);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to update teacher profile';
      setFormError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Deactivate Teacher Confirmation
  const handleDeactivatePrompt = (teacher: Teacher) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Deactivate Teacher Profile',
      message: `Are you sure you want to deactivate ${teacher.firstName} ${teacher.lastName} (${teacher.employeeId})? This will mark the teacher as INACTIVE and also disable any associated login portal account.`,
      confirmLabel: 'Deactivate Teacher',
      isDangerous: true,
      onConfirm: async () => {
        try {
          await teachersApi.deactivateTeacher(teacher.id);
          setSuccessMessage(`Teacher ${teacher.firstName} ${teacher.lastName} has been deactivated.`);
          fetchTeachers();
          if (selectedTeacherForProfile?.id === teacher.id) {
            refreshSelectedProfile(teacher.id);
          }
        } catch (err: any) {
          const msg = err.response?.data?.message || 'Failed to deactivate teacher';
          setErrorMessage(msg);
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  // Delete Teacher Confirmation
  const handleDeletePrompt = (teacher: Teacher) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Teacher Profile',
      message: `Permanently delete ${teacher.firstName} ${teacher.lastName} (${teacher.employeeId})? Note: deletion will be blocked if any classroom assignments are still attached.`,
      confirmLabel: 'Delete Permanently',
      isDangerous: true,
      onConfirm: async () => {
        try {
          await teachersApi.deleteTeacher(teacher.id);
          setSuccessMessage(`Teacher ${teacher.firstName} ${teacher.lastName} was deleted.`);
          if (selectedTeacherForProfile?.id === teacher.id) {
            setSelectedTeacherForProfile(null);
          }
          fetchTeachers();
        } catch (err: any) {
          const msg = err.response?.data?.message || 'Failed to delete teacher';
          setErrorMessage(msg);
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  // Open Assign Modal
  const handleOpenAssignModal = (teacher: Teacher) => {
    setAssignTeacherTarget(teacher);
    const activeYear = academicYears.find((y) => y.isCurrent) || academicYears[0];
    setAssignYearId(activeYear?.id || '');
    setAssignGradeId(grades[0]?.id || '');
    setAssignSectionId(grades[0]?.sections?.[0]?.id || '');
    setAssignSubject('General');
    setAssignIsClassTeacher(false);
    setAssignError(null);
    setShowAssignModal(true);
  };

  // Grade change in assign modal updates sections
  const handleAssignGradeChange = (gradeId: string) => {
    setAssignGradeId(gradeId);
    const targetGrade = grades.find((g) => g.id === gradeId);
    setAssignSectionId(targetGrade?.sections?.[0]?.id || '');
  };

  // Submit Assignment
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTeacherTarget) return;
    setAssignError(null);

    if (!assignYearId) {
      setAssignError('Please select an Academic Year');
      return;
    }
    if (!assignGradeId) {
      setAssignError('Please select a Grade');
      return;
    }
    if (!assignSectionId) {
      setAssignError('Please select a Section');
      return;
    }

    setIsAssigning(true);
    try {
      await teachersApi.assignTeacher(assignTeacherTarget.id, {
        academicYearId: assignYearId,
        gradeId: assignGradeId,
        sectionId: assignSectionId,
        subject: assignSubject.trim() || 'General',
        isClassTeacher: assignIsClassTeacher,
      });

      setShowAssignModal(false);
      setSuccessMessage(
        `Assigned ${assignTeacherTarget.firstName} ${assignTeacherTarget.lastName} to ${assignSubject}.`,
      );
      fetchTeachers();
      if (selectedTeacherForProfile?.id === assignTeacherTarget.id) {
        refreshSelectedProfile(assignTeacherTarget.id);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to create academic assignment';
      setAssignError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsAssigning(false);
    }
  };

  // Remove Assignment Confirmation
  const handleRemoveAssignmentPrompt = (assignment: TeacherAssignment, teacherName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Academic Assignment',
      message: `Are you sure you want to remove the assignment for ${assignment.subject} in ${assignment.grade?.name || 'Class'} (${assignment.section?.name || 'Section'}) from ${teacherName}?`,
      confirmLabel: 'Remove Assignment',
      isDangerous: true,
      onConfirm: async () => {
        try {
          await teachersApi.removeAssignment(assignment.teacherId, assignment.id);
          setSuccessMessage(`Academic assignment removed successfully.`);
          fetchTeachers();
          if (selectedTeacherForProfile?.id === assignment.teacherId) {
            refreshSelectedProfile(assignment.teacherId);
          }
        } catch (err: any) {
          const msg = err.response?.data?.message || 'Failed to remove assignment';
          setErrorMessage(msg);
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  // Open Provision Account Modal
  const handleOpenProvisionModal = (teacher: Teacher) => {
    setProvisionTarget(teacher);
    setProvisionEmail(teacher.email);
    setProvisionPassword('');
    setProvisionError(null);
    setShowProvisionModal(true);
  };

  // Submit Provision Account
  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisionTarget) return;
    setProvisionError(null);

    if (provisionPassword.length < 8) {
      setProvisionError('Password must be at least 8 characters long');
      return;
    }

    setIsProvisioning(true);
    try {
      await teachersApi.provisionAccount(provisionTarget.id, {
        email: provisionEmail.trim() || undefined,
        password: provisionPassword,
      });

      setShowProvisionModal(false);
      setSuccessMessage(
        `Login account provisioned successfully for ${provisionTarget.firstName} ${provisionTarget.lastName}.`,
      );
      fetchTeachers();
      if (selectedTeacherForProfile?.id === provisionTarget.id) {
        refreshSelectedProfile(provisionTarget.id);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to provision teacher account';
      setProvisionError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setIsProvisioning(false);
    }
  };

  // Helper for Status Badge
  const renderStatusBadge = (status: TeacherStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case 'ON_LEAVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            On Leave
          </span>
        );
      case 'INACTIVE':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Inactive
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-medium shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl flex items-center justify-between text-xs font-medium shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Directory Header & Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl border border-teal-100">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Teacher & Staff Directory
              </h3>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {totalTeachers} Total Faculty
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Faculty roster, subject assignments, department roles, and portal credentials
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={fetchTeachers}
            disabled={isLoading}
            className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {canManage && (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm shadow-teal-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Faculty Member</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search bar */}
          <form onSubmit={handleSearchSubmit} className="md:col-span-6 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, employee ID, or email..."
                aria-label="Search teachers"
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all font-medium"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-colors shrink-0"
            >
              Search
            </button>
          </form>

          {/* Department Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedDepartment}
              onChange={(e) => {
                setSelectedDepartment(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by department"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as TeacherStatus | '');
                setPage(1);
              }}
              aria-label="Filter by status"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active Faculty</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="INACTIVE">Inactive Faculty</option>
            </select>
          </div>
        </div>

        {/* Active Filters Pill Row */}
        {(search || selectedDepartment || selectedStatus) && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-400">Active Filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium">
                Search: "{search}"
                <button
                  onClick={handleClearSearch}
                  className="hover:text-teal-900"
                  aria-label="Remove search filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedDepartment && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium">
                Dept: {selectedDepartment}
                <button
                  onClick={() => setSelectedDepartment('')}
                  className="hover:text-teal-900"
                  aria-label="Remove department filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedStatus && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium">
                Status: {selectedStatus}
                <button
                  onClick={() => setSelectedStatus('')}
                  className="hover:text-teal-900"
                  aria-label="Remove status filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                handleClearSearch();
                setSelectedDepartment('');
                setSelectedStatus('');
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 ml-auto"
            >
              Reset All
            </button>
          </div>
        )}
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-teal-500 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Loading faculty records...</p>
          </div>
        ) : teachers.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto space-y-4">
            <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl w-fit mx-auto border border-teal-100">
              <GraduationCap className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">No Faculty Records Found</h4>
              <p className="text-xs text-slate-500 mt-1">
                {search || selectedDepartment || selectedStatus
                  ? 'No teacher profiles match your current search and filter criteria.'
                  : 'Start by registering your first faculty member to assign classes and manage subject workloads.'}
              </p>
            </div>
            {search || selectedDepartment || selectedStatus ? (
              <button
                onClick={() => {
                  handleClearSearch();
                  setSelectedDepartment('');
                  setSelectedStatus('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Clear Search & Filters
              </button>
            ) : (
              canManage && (
                <button
                  onClick={handleOpenCreateModal}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register First Faculty</span>
                </button>
              )
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Faculty Member</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Department & Role</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Portal Account</th>
                  <th className="py-3 px-4 text-center">Assignments</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {teachers.map((t) => {
                  const assignmentCount = t.assignments?.length || 0;
                  const hasClassTeacher = t.assignments?.some((a) => a.isClassTeacher);

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => handleOpenProfile(t)}
                    >
                      {/* Name & Employee ID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                            {t.firstName[0]}
                            {t.lastName[0]}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 group-hover:text-teal-600 transition-colors block">
                              {t.firstName} {t.lastName}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              {t.employeeId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[180px]">{t.email}</span>
                          </div>
                          {t.phone ? (
                            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{t.phone}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No phone</span>
                          )}
                        </div>
                      </td>

                      {/* Department & Role */}
                      <td className="py-3.5 px-4">
                        <div>
                          <span className="font-semibold text-slate-800 block">
                            {t.department || 'General'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {t.designation || 'Faculty Member'}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">{renderStatusBadge(t.status)}</td>

                      {/* Portal Account */}
                      <td className="py-3.5 px-4 text-center">
                        {(() => {
                          const linkedAccount = t.user || t.userAccount;
                          return linkedAccount ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <UserCheck className="w-3 h-3 text-indigo-600" />
                              <span>Linked ({linkedAccount.role})</span>
                            </span>
                          ) : t.userId ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <UserCheck className="w-3 h-3 text-indigo-600" />
                              <span>Linked</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                              <UserX className="w-3 h-3 text-slate-400" />
                              <span>Unlinked</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* Assignments */}
                      <td className="py-3.5 px-4 text-center">
                        {assignmentCount > 0 ? (
                          <div className="inline-flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                              {assignmentCount} {assignmentCount === 1 ? 'class' : 'classes'}
                            </span>
                            {hasClassTeacher && (
                              <span
                                className="w-2 h-2 rounded-full bg-purple-500"
                                title="Designated Class Teacher"
                              />
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Unassigned</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3.5 px-4 text-right"
                        onClick={(e) => e.stopPropagation() /* Prevent row click */}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenProfile(t)}
                            className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="View Faculty Profile"
                            aria-label={`View profile for ${t.firstName} ${t.lastName}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canManage && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(t)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Profile"
                                aria-label={`Edit ${t.firstName} ${t.lastName}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleOpenAssignModal(t)}
                                className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="Assign Subject / Class"
                                aria-label={`Assign section for ${t.firstName} ${t.lastName}`}
                              >
                                <BookOpen className="w-4 h-4" />
                              </button>

                              {t.status === 'ACTIVE' && (
                                <button
                                  onClick={() => handleDeactivatePrompt(t)}
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                  title="Deactivate Faculty"
                                  aria-label={`Deactivate ${t.firstName} ${t.lastName}`}
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalTeachers > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div>
              Showing <span className="font-semibold text-slate-800">{(page - 1) * limit + 1}</span>{' '}
              to{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(page * limit, totalTeachers)}
              </span>{' '}
              of <span className="font-semibold text-slate-800">{totalTeachers}</span> faculty
              records
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]">Rows per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Rows per page"
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          PROFILE SLIDE-OUT DRAWER / MODAL
      ========================================================================= */}
      {selectedTeacherForProfile && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 bg-slate-900 text-white flex items-start justify-between relative overflow-hidden">
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-indigo-500 text-white flex items-center justify-center font-bold text-xl shadow-lg">
                  {selectedTeacherForProfile.firstName[0]}
                  {selectedTeacherForProfile.lastName[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold tracking-tight">
                      {selectedTeacherForProfile.firstName} {selectedTeacherForProfile.lastName}
                    </h3>
                    {renderStatusBadge(selectedTeacherForProfile.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-300">
                    <span className="font-mono bg-white/10 px-2 py-0.5 rounded border border-white/10">
                      ID: {selectedTeacherForProfile.employeeId}
                    </span>
                    <span>•</span>
                    <span>{selectedTeacherForProfile.department || 'General Department'}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedTeacherForProfile(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors relative z-10"
                aria-label="Close Profile"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1">
              {isLoadingProfile && (
                <div className="p-4 bg-teal-50 text-teal-700 text-xs rounded-xl flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Refreshing faculty profile...</span>
                </div>
              )}

              {/* 1. Employment Details Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-teal-600" />
                    Employment & Contact Details
                  </span>
                  {canManage && (
                    <button
                      onClick={() => handleOpenEditModal(selectedTeacherForProfile)}
                      className="text-xs text-teal-700 hover:text-teal-900 font-semibold inline-flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit Details
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Official Email</span>
                    <span className="font-medium text-slate-800 break-all">
                      {selectedTeacherForProfile.email}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Primary Phone</span>
                    <span className="font-medium text-slate-800">
                      {selectedTeacherForProfile.phone || 'Not provided'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Department</span>
                    <span className="font-medium text-slate-800">
                      {selectedTeacherForProfile.department || 'General'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Designation</span>
                    <span className="font-medium text-slate-800">
                      {selectedTeacherForProfile.designation || 'Faculty Member'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Joining Date</span>
                    <span className="font-medium text-slate-800">
                      {selectedTeacherForProfile.joiningDate
                        ? new Date(selectedTeacherForProfile.joiningDate).toLocaleDateString()
                        : 'Not specified'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Record Created</span>
                    <span className="font-medium text-slate-800">
                      {new Date(selectedTeacherForProfile.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Login Portal Account Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-indigo-600" />
                    Portal User Credentials
                  </span>
                  {(selectedTeacherForProfile.user || selectedTeacherForProfile.userAccount || selectedTeacherForProfile.userId) ? (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Account Active
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                      Not Provisioned
                    </span>
                  )}
                </div>

                {(() => {
                  const linkedAccount = selectedTeacherForProfile.user || selectedTeacherForProfile.userAccount;
                  if (linkedAccount) {
                    return (
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Username / Login</span>
                          <span className="font-mono font-medium text-slate-800">
                            {linkedAccount.email}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">System Role</span>
                          <span className="font-medium text-slate-800">
                            {linkedAccount.role}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Account Status</span>
                          <span className="font-medium text-slate-800">
                            {linkedAccount.status}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  if (selectedTeacherForProfile.userId) {
                    return (
                      <div className="text-xs text-slate-600">
                        <span>User login account linked.</span>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <p className="text-slate-500">
                        This faculty member does not have portal login credentials yet.
                      </p>
                      {canManage && (
                        <button
                          onClick={() => handleOpenProvisionModal(selectedTeacherForProfile)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shrink-0 transition-colors"
                        >
                          Provision Account
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 3. Academic & Classroom Assignments */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-purple-600" />
                      Academic & Section Assignments
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Classes and subjects assigned to this educator
                    </span>
                  </div>

                  {canManage && (
                    <button
                      onClick={() => handleOpenAssignModal(selectedTeacherForProfile)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Assign Class</span>
                    </button>
                  )}
                </div>

                {selectedTeacherForProfile.assignments &&
                selectedTeacherForProfile.assignments.length > 0 ? (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                    {selectedTeacherForProfile.assignments.map((a) => (
                      <div
                        key={a.id}
                        className="p-3.5 bg-white hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {a.grade?.name || 'Class'} — {a.section?.name || 'Section'}
                            </span>
                            {a.isClassTeacher && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                Class Teacher
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500 flex items-center gap-3 text-[11px]">
                            <span>
                              Subject: <strong className="text-slate-700">{a.subject}</strong>
                            </span>
                            <span>•</span>
                            <span>Session: {a.academicYear?.name || 'Default'}</span>
                          </div>
                        </div>

                        {canManage && (
                          <button
                            onClick={() =>
                              handleRemoveAssignmentPrompt(
                                a,
                                `${selectedTeacherForProfile.firstName} ${selectedTeacherForProfile.lastName}`,
                              )
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove Assignment"
                            aria-label={`Remove assignment for ${a.subject}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 border border-dashed border-slate-200 rounded-2xl text-center space-y-2 bg-slate-50/50">
                    <BookOpen className="w-6 h-6 text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-500 font-medium">
                      No active academic assignments for this teacher.
                    </p>
                    {canManage && (
                      <button
                        onClick={() => handleOpenAssignModal(selectedTeacherForProfile)}
                        className="text-xs text-purple-600 hover:text-purple-800 font-semibold"
                      >
                        + Assign First Section
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Danger Zone Actions */}
              {canManage && (
                <div className="pt-4 border-t border-slate-200 space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Administrative Governance
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedTeacherForProfile.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleDeactivatePrompt(selectedTeacherForProfile)}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-colors"
                      >
                        Deactivate Faculty Record
                      </button>
                    )}

                    <button
                      onClick={() => handleDeletePrompt(selectedTeacherForProfile)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Faculty Member
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CREATE TEACHER MODAL
      ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Register Faculty Member</h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    New teacher employment profile
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Employee ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.employeeId}
                    onChange={(e) =>
                      setFormData({ ...formData, employeeId: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. EMP-2026-001"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="First name"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Last name"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="teacher@school.edu"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="e.g. Science, Mathematics"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder="e.g. Senior Faculty, HOD"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Joining Date
                  </label>
                  <input
                    type="date"
                    value={formData.joiningDate}
                    onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Register Faculty Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          EDIT TEACHER MODAL
      ========================================================================= */}
      {showEditModal && editingTeacher && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Edit Faculty Member</h3>
                <p className="text-[11px] text-slate-400 font-medium font-mono">
                  Employee ID: {editingTeacher.employeeId}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTeacher(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as TeacherStatus })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="ON_LEAVE">ON_LEAVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTeacher(null);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          ASSIGN CLASS / SECTION MODAL
      ========================================================================= */}
      {showAssignModal && assignTeacherTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-purple-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Assign Section & Subject</h3>
                <p className="text-[11px] text-purple-200 font-medium">
                  Faculty: {assignTeacherTarget.firstName} {assignTeacherTarget.lastName}
                </p>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-purple-300 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-6 space-y-4">
              {assignError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{assignError}</span>
                </div>
              )}

              {/* Academic Year */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Academic Session <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={assignYearId}
                  onChange={(e) => setAssignYearId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                >
                  <option value="">-- Select Session --</option>
                  {academicYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>
                      {ay.name} {ay.isCurrent ? '(Active Current Session)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Grade */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Grade / Class <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={assignGradeId}
                  onChange={(e) => handleAssignGradeChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                >
                  <option value="">-- Select Grade --</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Section */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Section <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={assignSectionId}
                  onChange={(e) => setAssignSectionId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                >
                  <option value="">-- Select Section --</option>
                  {(grades.find((g) => g.id === assignGradeId)?.sections || []).map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name} {sec.capacity ? `(Capacity: ${sec.capacity})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  value={assignSubject}
                  onChange={(e) => setAssignSubject(e.target.value)}
                  placeholder="e.g. Mathematics, Physics, General"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              {/* Class Teacher Checkbox */}
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="isClassTeacher"
                  checked={assignIsClassTeacher}
                  onChange={(e) => setAssignIsClassTeacher(e.target.checked)}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="isClassTeacher" className="text-xs text-purple-900 leading-snug">
                  <span className="font-bold block">Designate as Class Teacher</span>
                  <span className="text-[11px] text-purple-700">
                    Each section may have only one primary class teacher per academic year.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isAssigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          PROVISION ACCOUNT MODAL
      ========================================================================= */}
      {showProvisionModal && provisionTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-indigo-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Provision Portal Credentials</h3>
                <p className="text-[11px] text-indigo-200 font-medium">
                  Faculty: {provisionTarget.firstName} {provisionTarget.lastName}
                </p>
              </div>
              <button
                onClick={() => setShowProvisionModal(false)}
                className="text-indigo-300 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProvisionSubmit} className="p-6 space-y-4">
              {provisionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{provisionError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Login Email Address
                </label>
                <input
                  type="email"
                  required
                  value={provisionEmail}
                  onChange={(e) => setProvisionEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Temporary / Initial Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={provisionPassword}
                  onChange={(e) => setProvisionPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Must be at least 8 characters. The user role will be granted as{' '}
                  <strong className="text-slate-700">TEACHER</strong>.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProvisioning}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isProvisioning ? 'Provisioning...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION DIALOG MODAL
      ========================================================================= */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  confirmDialog.isDangerous
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">{confirmDialog.title}</h4>
                <p className="text-xs text-slate-500">Institutional Governance Confirmation</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">{confirmDialog.message}</p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors ${
                  confirmDialog.isDangerous
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
