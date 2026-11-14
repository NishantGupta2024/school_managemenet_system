import React, { useState, useEffect, useCallback } from 'react';
import {
  usersApi,
  UserProfile,
  UnlinkedStudentRecord,
  UserRole,
} from '../services/api';
import {
  Users,
  UserPlus,
  GraduationCap,
  Heart,
  Search,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Edit2,
  Power,
  X,
  Link as LinkIcon,
  Unlink,
  ShieldAlert,
} from 'lucide-react';

export const UsersView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'STAFF' | 'STUDENTS' | 'PARENTS'>('STAFF');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Staff State
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [staffSearch, setStaffSearch] = useState<string>('');
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState<boolean>(false);
  const [createStaffForm, setCreateStaffForm] = useState({ name: '', email: '', password: '' });
  const [staffFormError, setStaffFormError] = useState<string | null>(null);

  // Student State
  const [studentViewMode, setStudentViewMode] = useState<'UNLINKED' | 'LINKED'>('UNLINKED');
  const [unlinkedStudents, setUnlinkedStudents] = useState<UnlinkedStudentRecord[]>([]);
  const [linkedStudents, setLinkedStudents] = useState<UserProfile[]>([]);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [isProvisionStudentOpen, setIsProvisionStudentOpen] = useState<boolean>(false);
  const [selectedStudentForProvision, setSelectedStudentForProvision] = useState<UnlinkedStudentRecord | null>(null);
  const [provisionStudentForm, setProvisionStudentForm] = useState({ email: '', password: '', name: '' });
  const [studentFormError, setStudentFormError] = useState<string | null>(null);

  // Parent State
  const [parentsList, setParentsList] = useState<UserProfile[]>([]);
  const [parentSearch, setParentSearch] = useState<string>('');
  const [isCreateParentOpen, setIsCreateParentOpen] = useState<boolean>(false);
  const [createParentForm, setCreateParentForm] = useState({
    name: '',
    email: '',
    password: '',
    relationshipType: 'GUARDIAN',
  });
  const [parentFormError, setParentFormError] = useState<string | null>(null);

  // Link Student to Parent Modal
  const [isLinkStudentOpen, setIsLinkStudentOpen] = useState<boolean>(false);
  const [selectedParentForLink, setSelectedParentForLink] = useState<UserProfile | null>(null);
  const [linkStudentId, setLinkStudentId] = useState<string>('');
  const [linkRelationshipType, setLinkRelationshipType] = useState<string>('GUARDIAN');
  const [linkError, setLinkError] = useState<string | null>(null);

  // Edit / Status Modal State
  const [isEditUserOpen, setIsEditUserOpen] = useState<boolean>(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);
  const [editUserName, setEditUserName] = useState<string>('');
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState<boolean>(false);
  const [selectedUserForStatus, setSelectedUserForStatus] = useState<UserProfile | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Load Data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'STAFF') {
        const staff = await usersApi.list({ role: UserRole.FEE_STAFF });
        setStaffList(staff);
      } else if (activeTab === 'STUDENTS') {
        const [unlinked, linked] = await Promise.all([
          usersApi.getUnlinkedStudents(),
          usersApi.list({ role: UserRole.STUDENT }),
        ]);
        setUnlinkedStudents(unlinked);
        setLinkedStudents(linked);
      } else if (activeTab === 'PARENTS') {
        const [parents, unlinked] = await Promise.all([
          usersApi.listParents(),
          usersApi.getUnlinkedStudents(),
        ]);
        setParentsList(parents);
        setUnlinkedStudents(unlinked);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load user records');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Create Staff
  const handleCreateStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createStaffForm.name.trim() || !createStaffForm.email.trim() || !createStaffForm.password) {
      setStaffFormError('All fields are required.');
      return;
    }
    if (createStaffForm.password.length < 8) {
      setStaffFormError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    setStaffFormError(null);
    try {
      await usersApi.createStaff(createStaffForm);
      setSuccessMessage(`Fee Staff account "${createStaffForm.email}" successfully created.`);
      setIsCreateStaffOpen(false);
      setCreateStaffForm({ name: '', email: '', password: '' });
      loadData();
    } catch (err: any) {
      setStaffFormError(err?.response?.data?.message || err?.message || 'Failed to create staff account');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Provision Student Login
  const handleOpenProvisionStudent = (student: UnlinkedStudentRecord) => {
    setSelectedStudentForProvision(student);
    setProvisionStudentForm({
      name: `${student.firstName} ${student.lastName}`.trim(),
      email: student.guardianEmail || '',
      password: '',
    });
    setStudentFormError(null);
    setIsProvisionStudentOpen(true);
  };

  const handleProvisionStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForProvision) return;

    if (!provisionStudentForm.email.trim() || !provisionStudentForm.password) {
      setStudentFormError('Email and password are required.');
      return;
    }
    if (provisionStudentForm.password.length < 8) {
      setStudentFormError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    setStudentFormError(null);
    try {
      await usersApi.provisionStudentAccount(selectedStudentForProvision.id, provisionStudentForm);
      setSuccessMessage(
        `Login account provisioned for student "${selectedStudentForProvision.firstName} ${selectedStudentForProvision.lastName}".`,
      );
      setIsProvisionStudentOpen(false);
      setSelectedStudentForProvision(null);
      loadData();
    } catch (err: any) {
      setStudentFormError(
        err?.response?.data?.message || err?.message || 'Failed to provision student login account',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Create Parent
  const handleCreateParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createParentForm.name.trim() || !createParentForm.email.trim() || !createParentForm.password) {
      setParentFormError('All fields are required.');
      return;
    }
    if (createParentForm.password.length < 8) {
      setParentFormError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    setParentFormError(null);
    try {
      await usersApi.createParent(createParentForm);
      setSuccessMessage(`Parent account "${createParentForm.email}" successfully created.`);
      setIsCreateParentOpen(false);
      setCreateParentForm({ name: '', email: '', password: '', relationshipType: 'GUARDIAN' });
      loadData();
    } catch (err: any) {
      setParentFormError(err?.response?.data?.message || err?.message || 'Failed to create parent account');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Link Student to Parent
  const handleOpenLinkStudent = (parent: UserProfile) => {
    setSelectedParentForLink(parent);
    setLinkStudentId(unlinkedStudents[0]?.id || '');
    setLinkRelationshipType('GUARDIAN');
    setLinkError(null);
    setIsLinkStudentOpen(true);
  };

  const handleLinkStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParentForLink || !linkStudentId) {
      setLinkError('Please select a student to link.');
      return;
    }

    setIsSubmitting(true);
    setLinkError(null);
    try {
      await usersApi.linkParentStudent(selectedParentForLink.id, linkStudentId, {
        relationshipType: linkRelationshipType,
      });
      setSuccessMessage('Student successfully linked to parent.');
      setIsLinkStudentOpen(false);
      loadData();
    } catch (err: any) {
      setLinkError(err?.response?.data?.message || err?.message || 'Failed to link student to parent');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Unlink Student from Parent
  const handleUnlinkStudent = async (parentId: string, studentId: string) => {
    if (!window.confirm('Are you sure you want to unlink this student from this parent?')) {
      return;
    }
    try {
      await usersApi.unlinkParentStudent(parentId, studentId);
      setSuccessMessage('Student unlinked successfully.');
      loadData();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to unlink student');
    }
  };

  // Handle Edit User Name
  const handleEditOpen = (userToEdit: UserProfile) => {
    setSelectedUserForEdit(userToEdit);
    setEditUserName(userToEdit.name);
    setIsEditUserOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit) return;

    setIsSubmitting(true);
    try {
      await usersApi.update(selectedUserForEdit.id, { name: editUserName.trim() });
      setSuccessMessage(`User "${selectedUserForEdit.email}" name updated.`);
      setIsEditUserOpen(false);
      loadData();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update user profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Status Toggle
  const handleStatusToggleConfirm = async () => {
    if (!selectedUserForStatus) return;
    const targetStatus = selectedUserForStatus.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setIsSubmitting(true);
    try {
      await usersApi.updateStatus(selectedUserForStatus.id, targetStatus);
      setSuccessMessage(`User "${selectedUserForStatus.email}" status updated to ${targetStatus}.`);
      setIsStatusConfirmOpen(false);
      loadData();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to change user status');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered lists
  const filteredStaff = staffList.filter(
    (s) =>
      s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(staffSearch.toLowerCase()),
  );

  const filteredUnlinkedStudents = unlinkedStudents.filter(
    (s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.admissionNumber.toLowerCase().includes(studentSearch.toLowerCase()),
  );

  const filteredLinkedStudents = linkedStudents.filter(
    (s) =>
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.studentProfile &&
        s.studentProfile.admissionNumber.toLowerCase().includes(studentSearch.toLowerCase())),
  );

  const filteredParents = parentsList.filter(
    (p) =>
      p.name.toLowerCase().includes(parentSearch.toLowerCase()) ||
      p.email.toLowerCase().includes(parentSearch.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" />
            User & Account Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Provision and administer Fee Staff, Student, and Parent accounts for your school tenant.
          </p>
        </div>

        {/* Global Action / Refresh */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 flex items-center gap-1.5 text-sm font-medium"
            title="Refresh User Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-6 pt-3 gap-6">
        <button
          onClick={() => setActiveTab('STAFF')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'STAFF'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Fee Staff ({staffList.length})
        </button>

        <button
          onClick={() => setActiveTab('STUDENTS')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'STUDENTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Student Accounts ({linkedStudents.length} active, {unlinkedStudents.length} unlinked)
        </button>

        <button
          onClick={() => setActiveTab('PARENTS')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'PARENTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Heart className="w-4 h-4" />
          Parent Accounts ({parentsList.length})
        </button>
      </div>

      {/* TAB CONTENT: FEE STAFF */}
      {activeTab === 'STAFF' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff by name or email..."
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={() => {
                setCreateStaffForm({ name: '', email: '', password: '' });
                setStaffFormError(null);
                setIsCreateStaffOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add Fee Staff
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No Fee Staff accounts found.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((staff) => (
                    <tr key={staff.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">{staff.name}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs">{staff.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          {staff.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                            staff.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {staff.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {new Date(staff.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEditOpen(staff)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit Staff Name"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedUserForStatus(staff);
                              setIsStatusConfirmOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              staff.status === 'ACTIVE'
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={staff.status === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: STUDENT ACCOUNTS */}
      {activeTab === 'STUDENTS' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Sub-view toggle */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setStudentViewMode('UNLINKED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    studentViewMode === 'UNLINKED'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unlinked Students ({unlinkedStudents.length})
                </button>
                <button
                  onClick={() => setStudentViewMode('LINKED')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    studentViewMode === 'LINKED'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active Student Accounts ({linkedStudents.length})
                </button>
              </div>
            </div>
          </div>

          {studentViewMode === 'UNLINKED' ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Admission No.</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Grade & Section</th>
                    <th className="py-3 px-4">Guardian Contact</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredUnlinkedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No unlinked students requiring accounts.
                      </td>
                    </tr>
                  ) : (
                    filteredUnlinkedStudents.map((stud) => (
                      <tr key={stud.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-xs text-slate-800">
                          {stud.admissionNumber}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {stud.firstName} {stud.lastName}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {stud.grade?.name || '—'} {stud.section?.name ? `(${stud.section.name})` : ''}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {stud.guardianEmail || stud.guardianPhone || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenProvisionStudent(stud)}
                            className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 ml-auto transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Provision Login
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Student User</th>
                    <th className="py-3 px-4">Login Email</th>
                    <th className="py-3 px-4">Admission No.</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredLinkedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No student user accounts found.
                      </td>
                    </tr>
                  ) : (
                    filteredLinkedStudents.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800">{u.name}</td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-xs">{u.email}</td>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700">
                          {u.studentProfile?.admissionNumber || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                              u.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedUserForStatus(u);
                              setIsStatusConfirmOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.status === 'ACTIVE'
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={u.status === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: PARENT MANAGEMENT */}
      {activeTab === 'PARENTS' && (
        <div className="bg-white rounded-b-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search parents..."
                value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={() => {
                setCreateParentForm({ name: '', email: '', password: '', relationshipType: 'GUARDIAN' });
                setParentFormError(null);
                setIsCreateParentOpen(true);
              }}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add Parent Account
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Parent Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Linked Children</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredParents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No Parent accounts found.
                    </td>
                  </tr>
                ) : (
                  filteredParents.map((parent) => (
                    <tr key={parent.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">{parent.name}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs">{parent.email}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {parent.parentRelations && parent.parentRelations.length > 0 ? (
                            parent.parentRelations.map((rel) => (
                              <div
                                key={rel.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-indigo-50 text-indigo-800 border border-indigo-200"
                              >
                                <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                                <span>
                                  {rel.student
                                    ? `${rel.student.firstName} ${rel.student.lastName}`
                                    : 'Student'}{' '}
                                  ({rel.relationshipType})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkStudent(parent.id, rel.studentId)}
                                  className="text-indigo-400 hover:text-rose-600 ml-1 transition-colors"
                                  title="Unlink student"
                                >
                                  <Unlink className="w-3 h-3" />
                                </button>
                              </div>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">No linked children</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                            parent.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {parent.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenLinkStudent(parent)}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Link an eligible student"
                          >
                            <LinkIcon className="w-3 h-3" />
                            Link Student
                          </button>
                          <button
                            onClick={() => handleEditOpen(parent)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit Parent Name"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedUserForStatus(parent);
                              setIsStatusConfirmOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              parent.status === 'ACTIVE'
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={parent.status === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CREATE FEE STAFF */}
      {isCreateStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                Add Fee Staff Member
              </h3>
              <button onClick={() => setIsCreateStaffOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaffSubmit} className="p-6 space-y-4">
              {staffFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{staffFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Accountant"
                  value={createStaffForm.name}
                  onChange={(e) => setCreateStaffForm({ ...createStaffForm, name: e.target.value })}
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
                  placeholder="staff@school.edu"
                  value={createStaffForm.email}
                  onChange={(e) => setCreateStaffForm({ ...createStaffForm, email: e.target.value })}
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
                  value={createStaffForm.password}
                  onChange={(e) => setCreateStaffForm({ ...createStaffForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateStaffOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 disabled:opacity-50 text-white rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Confirm Create Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROVISION STUDENT LOGIN */}
      {isProvisionStudentOpen && selectedStudentForProvision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                Provision Student Login
              </h3>
              <button
                onClick={() => setIsProvisionStudentOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProvisionStudentSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900">
                <p className="font-semibold">Student Record:</p>
                <p className="mt-0.5">
                  {selectedStudentForProvision.firstName} {selectedStudentForProvision.lastName} (
                  {selectedStudentForProvision.admissionNumber})
                </p>
                <p className="text-indigo-600 text-[11px] mt-1">
                  Links login credentials directly to this existing student record without duplicating records or altering fee allocations.
                </p>
              </div>

              {studentFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{studentFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Student Display Name
                </label>
                <input
                  type="text"
                  value={provisionStudentForm.name}
                  onChange={(e) =>
                    setProvisionStudentForm({ ...provisionStudentForm, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Login Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="student@school.edu"
                  value={provisionStudentForm.email}
                  onChange={(e) =>
                    setProvisionStudentForm({ ...provisionStudentForm, email: e.target.value })
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
                  value={provisionStudentForm.password}
                  onChange={(e) =>
                    setProvisionStudentForm({ ...provisionStudentForm, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsProvisionStudentOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 disabled:opacity-50 text-white rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  {isSubmitting ? 'Provisioning...' : 'Confirm Provision Login'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PARENT */}
      {isCreateParentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Heart className="w-5 h-5 text-indigo-600" />
                Add Parent Account
              </h3>
              <button
                onClick={() => setIsCreateParentOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateParentSubmit} className="p-6 space-y-4">
              {parentFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{parentFormError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Parent Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Robert Pendelton"
                  value={createParentForm.name}
                  onChange={(e) =>
                    setCreateParentForm({ ...createParentForm, name: e.target.value })
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
                  placeholder="parent@example.com"
                  value={createParentForm.email}
                  onChange={(e) =>
                    setCreateParentForm({ ...createParentForm, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Relationship Type
                </label>
                <select
                  value={createParentForm.relationshipType}
                  onChange={(e) =>
                    setCreateParentForm({ ...createParentForm, relationshipType: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="FATHER">Father</option>
                  <option value="MOTHER">Mother</option>
                  <option value="GUARDIAN">Guardian</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 8 characters, letter & number"
                  value={createParentForm.password}
                  onChange={(e) =>
                    setCreateParentForm({ ...createParentForm, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateParentOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 disabled:opacity-50 text-white rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Confirm Create Parent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LINK STUDENT TO PARENT */}
      {isLinkStudentOpen && selectedParentForLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-indigo-600" />
                Link Student to Parent
              </h3>
              <button
                onClick={() => setIsLinkStudentOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLinkStudentSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900">
                <p className="font-semibold">Parent:</p>
                <p className="mt-0.5">
                  {selectedParentForLink.name} ({selectedParentForLink.email})
                </p>
              </div>

              {linkError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{linkError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Select Student *
                </label>
                {unlinkedStudents.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No unlinked students currently found in this school.</p>
                ) : (
                  <select
                    value={linkStudentId}
                    onChange={(e) => setLinkStudentId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {unlinkedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.admissionNumber})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Relationship Type
                </label>
                <select
                  value={linkRelationshipType}
                  onChange={(e) => setLinkRelationshipType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="FATHER">Father</option>
                  <option value="MOTHER">Mother</option>
                  <option value="GUARDIAN">Guardian</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsLinkStudentOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || unlinkedStudents.length === 0}
                  className="px-5 py-2 disabled:opacity-50 text-white rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  {isSubmitting ? 'Linking...' : 'Confirm Link Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER NAME */}
      {isEditUserOpen && selectedUserForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-600" />
                Edit Profile Name
              </h3>
              <button onClick={() => setIsEditUserOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email (Immutable)
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedUserForEdit.email}
                  className="w-full px-3 py-2 border border-slate-200 bg-slate-100 rounded-xl text-sm font-mono text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditUserOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 disabled:opacity-50 text-white rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STATUS TOGGLE CONFIRM */}
      {isStatusConfirmOpen && selectedUserForStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldAlert
                  className={`w-5 h-5 ${
                    selectedUserForStatus.status === 'ACTIVE' ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                />
                <h3 className="font-bold text-slate-800 text-base">
                  {selectedUserForStatus.status === 'ACTIVE'
                    ? 'Deactivate User Account'
                    : 'Activate User Account'}
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
                Are you sure you want to change status of{' '}
                <span className="font-bold text-slate-900">{selectedUserForStatus.name}</span> (
                <span className="font-mono text-xs">{selectedUserForStatus.email}</span>) to{' '}
                <span className="font-bold uppercase">
                  {selectedUserForStatus.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}
                </span>
                ?
              </p>

              {selectedUserForStatus.status === 'ACTIVE' ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <p className="font-semibold">Security Note:</p>
                  <p>Deactivated users cannot establish new authenticated sessions or invoke protected APIs.</p>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  Activating this user will immediately restore their permission to log in and access their role dashboard.
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
                  className={`px-5 py-2 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors ${
                    selectedUserForStatus.status === 'ACTIVE'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isSubmitting
                    ? 'Updating...'
                    : selectedUserForStatus.status === 'ACTIVE'
                    ? 'Confirm Deactivation'
                    : 'Confirm Activation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
