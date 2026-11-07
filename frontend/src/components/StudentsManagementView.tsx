import React, { useState, useEffect, useCallback } from 'react';
import {
  studentsApi,
  academicsApi,
  excelImportsApi,
  Student,
  StudentStatus,
  AcademicYear,
  GradeClass,
  Section,
  StudentFeeStatement,
  ImportConfirmResult,
} from '../services/api';
import {
  Users,
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
  UserCheck,
  UserX,
  CreditCard,
  GraduationCap,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { StudentAdmissionExcelImportModal } from './StudentAdmissionExcelImportModal';

export const StudentsManagementView: React.FC = () => {
  // Query & pagination state
  const [students, setStudents] = useState<Student[]>([]);
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<StudentStatus | ''>('');

  // Dropdown reference data
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals & Drawer
  const [showAdmissionModal, setShowAdmissionModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [profileDrawerStudent, setProfileDrawerStudent] = useState<Student | null>(null);
  const [feeStatement, setFeeStatement] = useState<StudentFeeStatement | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form states
  const initialFormData = {
    admissionNumber: '',
    firstName: '',
    lastName: '',
    academicYearId: '',
    gradeId: '',
    sectionId: '',
    rollNumber: '',
    dateOfBirth: '',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
    admissionDate: new Date().toISOString().split('T')[0],
    status: 'ACTIVE' as StudentStatus,
  };

  const [formData, setFormData] = useState(initialFormData);

  // 1. Fetch metadata on load
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [yearsData, gradesData] = await Promise.all([
          academicsApi.getAcademicYears(),
          academicsApi.getGrades(),
        ]);
        setAcademicYears(yearsData || []);
        setGrades(gradesData || []);
      } catch (err: any) {
        console.error('Failed to load academic metadata', err);
      }
    };
    fetchMetadata();
  }, []);

  // 2. Fetch Students
  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await studentsApi.getStudents({
        page,
        limit,
        search: search.trim() || undefined,
        academicYearId: selectedAcademicYearId || undefined,
        gradeId: selectedGradeId || undefined,
        sectionId: selectedSectionId || undefined,
        status: (selectedStatus as StudentStatus) || undefined,
      });

      if (res && res.data) {
        setStudents(res.data);
        setTotalStudents(res.meta.total);
        setTotalPages(res.meta.totalPages || 1);
      } else if (Array.isArray(res)) {
        // Fallback in case raw array is returned
        setStudents(res);
        setTotalStudents(res.length);
        setTotalPages(1);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Failed to load students directory',
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search, selectedAcademicYearId, selectedGradeId, selectedSectionId, selectedStatus]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Handle Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setSelectedAcademicYearId('');
    setSelectedGradeId('');
    setSelectedSectionId('');
    setSelectedStatus('');
    setPage(1);
  };

  // Sections available for selected grade in filters
  const filterGradeObj = grades.find((g) => g.id === selectedGradeId);
  const filterAvailableSections: Section[] = filterGradeObj?.sections || [];

  // Sections available in Modal
  const modalGradeObj = grades.find((g) => g.id === formData.gradeId);
  const modalAvailableSections: Section[] = modalGradeObj?.sections || [];

  // Auto-clear section if grade changes in filters
  const handleFilterGradeChange = (gradeId: string) => {
    setSelectedGradeId(gradeId);
    setSelectedSectionId('');
    setPage(1);
  };

  // Open Admission Modal
  const handleOpenAdmissionModal = () => {
    // Pre-populate with current session and first grade/section if available
    const currentYear = academicYears.find((y) => y.isCurrent) || academicYears[0];
    const defaultGrade = grades[0];
    const defaultSection = defaultGrade?.sections?.[0];

    setFormData({
      ...initialFormData,
      academicYearId: currentYear?.id || '',
      gradeId: defaultGrade?.id || '',
      sectionId: defaultSection?.id || '',
    });
    setErrorMessage(null);
    setShowAdmissionModal(true);
  };

  // Download Excel Template Handler
  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      setErrorMessage(null);
      const blob = await excelImportsApi.downloadTemplate('STUDENT_MASTER');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'student_master_template.xlsx');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
      setSuccessMessage('Student Master Excel template downloaded successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || err.response?.data?.message || 'Failed to download student master template');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Handle successful Excel import
  const handleImportSuccess = (result: ImportConfirmResult) => {
    setSuccessMessage(`Successfully admitted ${result.insertedCount} student(s) via Excel import (${result.skippedCount} skipped).`);
    setTimeout(() => setSuccessMessage(null), 6000);
    fetchStudents();
  };

  // Submit Admission
  const handleAdmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await studentsApi.createStudent({
        admissionNumber: formData.admissionNumber.trim().toUpperCase(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        gradeId: formData.gradeId,
        sectionId: formData.sectionId,
        academicYearId: formData.academicYearId,
        rollNumber: formData.rollNumber.trim() || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        guardianName: formData.guardianName.trim() || undefined,
        guardianPhone: formData.guardianPhone.trim() || undefined,
        guardianEmail: formData.guardianEmail.trim() || undefined,
        admissionDate: formData.admissionDate || undefined,
        status: formData.status,
      });

      setShowAdmissionModal(false);
      setSuccessMessage(`Student admitted successfully: ${formData.firstName} ${formData.lastName}`);
      setTimeout(() => setSuccessMessage(null), 4000);
      fetchStudents();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Failed to admit new student',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      admissionNumber: student.admissionNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      academicYearId: student.academicYearId || (student.academicYear?.id ?? ''),
      gradeId: student.gradeId,
      sectionId: student.sectionId || (student.section?.id ?? ''),
      rollNumber: student.rollNumber || '',
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.split('T')[0] : '',
      guardianName: student.guardianName || '',
      guardianPhone: student.guardianPhone || '',
      guardianEmail: student.guardianEmail || '',
      admissionDate: student.admissionDate ? student.admissionDate.split('T')[0] : '',
      status: student.status || 'ACTIVE',
    });
    setErrorMessage(null);
    setShowEditModal(true);
  };

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await studentsApi.updateStudent(editingStudent.id, {
        admissionNumber: formData.admissionNumber.trim().toUpperCase(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        gradeId: formData.gradeId,
        sectionId: formData.sectionId,
        academicYearId: formData.academicYearId,
        rollNumber: formData.rollNumber.trim() || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        guardianName: formData.guardianName.trim() || undefined,
        guardianPhone: formData.guardianPhone.trim() || undefined,
        guardianEmail: formData.guardianEmail.trim() || undefined,
        admissionDate: formData.admissionDate || undefined,
        status: formData.status,
      });

      setShowEditModal(false);
      setSuccessMessage(`Updated profile for ${formData.firstName} ${formData.lastName}`);
      setTimeout(() => setSuccessMessage(null), 4000);
      fetchStudents();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Failed to update student profile',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Profile Drawer
  const handleOpenProfileDrawer = async (student: Student) => {
    setProfileDrawerStudent(student);
    setFeeStatement(null);
    setIsLoadingStatement(true);

    try {
      const [fullProfile, statement] = await Promise.all([
        studentsApi.getStudentProfile(student.id).catch(() => student),
        studentsApi.getFeeStatement(student.id).catch(() => null),
      ]);
      setProfileDrawerStudent(fullProfile);
      setFeeStatement(statement);
    } catch (err) {
      console.error('Failed to load profile details or fee statement', err);
    } finally {
      setIsLoadingStatement(false);
    }
  };

  const getStatusBadge = (status?: StudentStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case 'PROMOTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Promoted
          </span>
        );
      case 'TRANSFERRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Transferred
          </span>
        );
      case 'ALUMNI':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Alumni
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
            {status || 'Unknown'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start justify-between gap-3 text-rose-800 text-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Encountered an Issue</p>
              <p className="mt-0.5 text-rose-700">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-600 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Student Management & Admissions
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Authoritative student directory, admissions processing, and student profile statements.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            onClick={fetchStudents}
            disabled={isLoading}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Download blank Student Master Excel template"
          >
            {isDownloadingTemplate ? (
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
            ) : (
              <Download className="w-4 h-4 text-indigo-600" />
            )}
            <span>Download Template</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Bulk import students from Excel file"
          >
            <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
            <span>Import via Excel</span>
          </button>

          <button
            onClick={handleOpenAdmissionModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm shadow-indigo-100"
          >
            <Plus className="w-4 h-4" />
            <span>New Admission</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, admission no, roll no..."
              className="w-full pl-9 pr-16 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-colors"
            >
              Search
            </button>
          </form>

          {/* Academic Session Filter */}
          <div>
            <select
              value={selectedAcademicYearId}
              onChange={(e) => {
                setSelectedAcademicYearId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              <option value="">All Academic Sessions</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Grade Filter */}
          <div>
            <select
              value={selectedGradeId}
              onChange={(e) => handleFilterGradeChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              <option value="">All Classes / Grades</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div>
            <select
              value={selectedSectionId}
              onChange={(e) => {
                setSelectedSectionId(e.target.value);
                setPage(1);
              }}
              disabled={!selectedGradeId || filterAvailableSections.length === 0}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <option value="">
                {!selectedGradeId
                  ? 'Select Class first'
                  : filterAvailableSections.length === 0
                  ? 'No Sections'
                  : 'All Sections'}
              </option>
              {filterAvailableSections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Second Row: Status Filter & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="font-semibold text-slate-700">Status:</span>
            {(['', 'ACTIVE', 'PROMOTED', 'TRANSFERRED', 'ALUMNI'] as const).map((st) => (
              <button
                key={st || 'ALL'}
                onClick={() => {
                  setSelectedStatus(st);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  selectedStatus === st
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === '' ? 'All' : st}
              </button>
            ))}
          </div>

          {(search || selectedAcademicYearId || selectedGradeId || selectedSectionId || selectedStatus) && (
            <button
              onClick={handleResetFilters}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* Students Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm font-medium text-slate-600">Loading student directory...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No students found</h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1">
              {search || selectedAcademicYearId || selectedGradeId || selectedStatus
                ? 'No student matches your current filter criteria. Try adjusting or resetting filters.'
                : 'No student records are currently enrolled. Click "+ New Admission" to get started.'}
            </p>
            {(search || selectedAcademicYearId || selectedGradeId || selectedStatus) && (
              <button
                onClick={handleResetFilters}
                className="mt-4 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 font-semibold text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3.5 px-4">Student Details</th>
                  <th className="py-3.5 px-4">Admission No</th>
                  <th className="py-3.5 px-4">Class & Section</th>
                  <th className="py-3.5 px-4">Guardian / Contact</th>
                  <th className="py-3.5 px-4">Portal Account</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {students.map((student) => {
                  const hasUserAccount = Boolean(student.userAccount || student.userId);
                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Name & Roll No */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-700 text-white flex items-center justify-center text-xs font-bold uppercase shadow-xs">
                            {student.firstName[0]}
                            {student.lastName[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {student.firstName} {student.lastName}
                            </p>
                            <p className="text-xs text-slate-400">
                              {student.rollNumber ? `Roll: ${student.rollNumber}` : 'No roll assigned'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Admission Number */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md border border-slate-200">
                          {student.admissionNumber}
                        </span>
                      </td>

                      {/* Class & Section */}
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-900">
                          {student.grade?.name || 'Unassigned Grade'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {student.section ? `Section ${student.section.name}` : 'No section'} •{' '}
                          {student.academicYear?.name || 'N/A'}
                        </p>
                      </td>

                      {/* Guardian */}
                      <td className="py-3.5 px-4">
                        {student.guardianName ? (
                          <div>
                            <p className="font-medium text-slate-800">{student.guardianName}</p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              {student.guardianPhone && (
                                <span className="flex items-center gap-0.5">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  {student.guardianPhone}
                                </span>
                              )}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">None provided</span>
                        )}
                      </td>

                      {/* Portal Account */}
                      <td className="py-3.5 px-4">
                        {hasUserAccount ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <UserCheck className="w-3 h-3" />
                            Linked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
                            <UserX className="w-3 h-3 text-slate-400" />
                            Unlinked
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {getStatusBadge(student.status)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenProfileDrawer(student)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="View Student Profile & Live Fee Statement"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(student)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Edit Student Information"
                          >
                            <Edit2 className="w-4 h-4" />
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

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span>
              Showing{' '}
              <strong className="text-slate-900">
                {totalStudents === 0 ? 0 : (page - 1) * limit + 1}
              </strong>{' '}
              to{' '}
              <strong className="text-slate-900">
                {Math.min(page * limit, totalStudents)}
              </strong>{' '}
              of <strong className="text-slate-900">{totalStudents}</strong> students
            </span>

            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-2 font-medium">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: New Admission */}
      {/* ======================================================== */}
      {showAdmissionModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-150 my-8">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                New Student Admission
              </h3>
              <button
                onClick={() => setShowAdmissionModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdmissionSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Admission Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admission Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.admissionNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, admissionNumber: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. ADM-2026-001"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Roll Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Roll Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.rollNumber}
                    onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                    placeholder="e.g. 101"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* First Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="e.g. Aarav"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="e.g. Sharma"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Academic Session */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Academic Session <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.academicYearId}
                    onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Select Academic Session</option>
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.isCurrent ? '(Current Session)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Grade / Class */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Grade / Class <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.gradeId}
                    onChange={(e) => {
                      const newGradeId = e.target.value;
                      const g = grades.find((gr) => gr.id === newGradeId);
                      setFormData({
                        ...formData,
                        gradeId: newGradeId,
                        sectionId: g?.sections?.[0]?.id || '',
                      });
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Select Grade / Class</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Section <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.sectionId}
                    onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
                    disabled={!formData.gradeId || modalAvailableSections.length === 0}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  >
                    <option value="">
                      {!formData.gradeId
                        ? 'Select Grade first'
                        : modalAvailableSections.length === 0
                        ? 'No sections available in this grade'
                        : 'Select Section'}
                    </option>
                    {modalAvailableSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        Section {s.name} (Capacity: {s.capacity || 'N/A'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as StudentStatus })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PROMOTED">PROMOTED</option>
                    <option value="TRANSFERRED">TRANSFERRED</option>
                    <option value="ALUMNI">ALUMNI</option>
                  </select>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Admission Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admission Date
                  </label>
                  <input
                    type="date"
                    value={formData.admissionDate}
                    onChange={(e) => setFormData({ ...formData, admissionDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Guardian Info Divider */}
              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Guardian & Contact Information (Optional)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Guardian Name</label>
                    <input
                      type="text"
                      value={formData.guardianName}
                      onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                      placeholder="e.g. Vikram Sharma"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Guardian Phone</label>
                    <input
                      type="tel"
                      value={formData.guardianPhone}
                      onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                      placeholder="+91 9876543210"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Guardian Email</label>
                    <input
                      type="email"
                      value={formData.guardianEmail}
                      onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                      placeholder="parent@example.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdmissionModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Submit Admission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Edit Student */}
      {/* ======================================================== */}
      {showEditModal && editingStudent && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-150 my-8">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-600" />
                Edit Student Profile: {editingStudent.firstName} {editingStudent.lastName}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Financial Immutability Notice */}
            <div className="mx-6 mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">Financial Ledger Integrity Guard:</strong>
                <p className="mt-0.5 text-amber-700">
                  Changing a student’s Class or Academic Session is blocked if active fee allocations or invoices already exist. In such cases, adjust allocations and invoices in Fee Management first to preserve historical audit records.
                </p>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Admission Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admission Number
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.admissionNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, admissionNumber: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-900 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Roll Number */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    value={formData.rollNumber}
                    onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                    placeholder="e.g. 101"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* First Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Academic Session */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Academic Session
                  </label>
                  <select
                    value={formData.academicYearId}
                    onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.isCurrent ? '(Current Session)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Grade / Class */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Grade / Class
                  </label>
                  <select
                    value={formData.gradeId}
                    onChange={(e) => {
                      const newGradeId = e.target.value;
                      const g = grades.find((gr) => gr.id === newGradeId);
                      setFormData({
                        ...formData,
                        gradeId: newGradeId,
                        sectionId: g?.sections?.[0]?.id || '',
                      });
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Section
                  </label>
                  <select
                    value={formData.sectionId}
                    onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
                    disabled={modalAvailableSections.length === 0}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  >
                    {modalAvailableSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        Section {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as StudentStatus })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PROMOTED">PROMOTED</option>
                    <option value="TRANSFERRED">TRANSFERRED</option>
                    <option value="ALUMNI">ALUMNI</option>
                  </select>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Admission Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admission Date
                  </label>
                  <input
                    type="date"
                    value={formData.admissionDate}
                    onChange={(e) => setFormData({ ...formData, admissionDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Guardian Info Divider */}
              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Guardian & Contact Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Guardian Name</label>
                    <input
                      type="text"
                      value={formData.guardianName}
                      onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                      placeholder="e.g. Vikram Sharma"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Guardian Phone</label>
                    <input
                      type="tel"
                      value={formData.guardianPhone}
                      onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                      placeholder="+91 9876543210"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Guardian Email</label>
                    <input
                      type="email"
                      value={formData.guardianEmail}
                      onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                      placeholder="parent@example.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DRAWER: Student Profile & Live Fee Statement */}
      {/* ======================================================== */}
      {profileDrawerStudent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-800 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                  {profileDrawerStudent.firstName[0]}
                  {profileDrawerStudent.lastName[0]}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg leading-snug">
                    {profileDrawerStudent.firstName} {profileDrawerStudent.lastName}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded">
                      {profileDrawerStudent.admissionNumber}
                    </span>
                    {getStatusBadge(profileDrawerStudent.status)}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setProfileDrawerStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Placement & Demographics Card */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-indigo-600" />
                  Academic Placement & Demographics
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-slate-400 block">Class & Section</span>
                    <strong className="text-slate-800 font-semibold">
                      {profileDrawerStudent.grade?.name || 'N/A'}{' '}
                      {profileDrawerStudent.section ? `• Sec ${profileDrawerStudent.section.name}` : ''}
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Academic Session</span>
                    <strong className="text-slate-800 font-semibold">
                      {profileDrawerStudent.academicYear?.name || 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Roll Number</span>
                    <span className="text-slate-700 font-medium">
                      {profileDrawerStudent.rollNumber || 'Not assigned'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block">Admission Date</span>
                    <span className="text-slate-700 font-medium">
                      {profileDrawerStudent.admissionDate
                        ? new Date(profileDrawerStudent.admissionDate).toLocaleDateString()
                        : 'Beginning of Session'}
                    </span>
                  </div>
                  {profileDrawerStudent.dateOfBirth && (
                    <div>
                      <span className="text-xs text-slate-400 block">Date of Birth</span>
                      <span className="text-slate-700 font-medium">
                        {new Date(profileDrawerStudent.dateOfBirth).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Guardian & Emergency Contacts Card */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Guardian & Contacts
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Guardian Name:</span>
                    <strong className="text-slate-800">
                      {profileDrawerStudent.guardianName || 'None provided'}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Phone:</span>
                    <span className="text-slate-800 font-medium">
                      {profileDrawerStudent.guardianPhone || 'None provided'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Email:</span>
                    <span className="text-slate-800 font-medium">
                      {profileDrawerStudent.guardianEmail || 'None provided'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Student Portal Account Card */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    Portal Account Access
                  </h4>
                  {profileDrawerStudent.userAccount ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      No Login Account
                    </span>
                  )}
                </div>

                {profileDrawerStudent.userAccount ? (
                  <div className="text-xs text-slate-600 space-y-1">
                    <p>
                      <strong>Login Email:</strong> {profileDrawerStudent.userAccount.email}
                    </p>
                    <p>
                      <strong>Account Status:</strong> {profileDrawerStudent.userAccount.status}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    This student does not have a linked user account for the student portal yet. You can provision one from the User Accounts tab.
                  </p>
                )}
              </div>

              {/* Live Fee Summary Card */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-4 bg-white shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    Live Fee Summary & Financial Statement
                  </h4>
                  {isLoadingStatement && (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  )}
                </div>

                {isLoadingStatement ? (
                  <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                    <span>Loading real-time fee statement...</span>
                  </div>
                ) : !feeStatement ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    No fee statement available for this student.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Financial KPI Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Total Gross
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          ₹{Number(feeStatement.summary?.totalGrossAmount || 0).toLocaleString()}
                        </span>
                      </div>

                      <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100">
                        <span className="text-[10px] uppercase font-bold text-emerald-600 block">
                          Concessions
                        </span>
                        <span className="text-sm font-bold text-emerald-700">
                          ₹{Number(feeStatement.summary?.totalDiscountAmount || 0).toLocaleString()}
                        </span>
                      </div>

                      <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100">
                        <span className="text-[10px] uppercase font-bold text-blue-600 block">
                          Paid
                        </span>
                        <span className="text-sm font-bold text-blue-700">
                          ₹{Number(feeStatement.summary?.totalPaidAmount || 0).toLocaleString()}
                        </span>
                      </div>

                      <div
                        className={`p-2.5 rounded-xl border ${
                          Number(feeStatement.summary?.totalRemainingAmount || 0) > 0
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}
                      >
                        <span className="text-[10px] uppercase font-bold block">
                          Balance Due
                        </span>
                        <span className="text-sm font-bold">
                          ₹{Number(feeStatement.summary?.totalRemainingAmount || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Invoices List */}
                    {feeStatement.invoices && feeStatement.invoices.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <h5 className="text-xs font-semibold text-slate-700">
                          Invoices ({feeStatement.invoices.length})
                        </h5>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {feeStatement.invoices.map((inv: any) => (
                            <div
                              key={inv.id}
                              className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-mono font-semibold text-slate-800 block">
                                  {inv.invoiceNumber}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  Due: {new Date(inv.dueDate).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-slate-900 block">
                                  ₹{Number(inv.netAmount).toLocaleString()}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                    inv.status === 'PAID'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : inv.status === 'OVERDUE'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {inv.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => {
                  handleOpenEditModal(profileDrawerStudent);
                  setProfileDrawerStudent(null);
                }}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                Edit Profile
              </button>

              <button
                onClick={() => setProfileDrawerStudent(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Admission Excel Import Modal */}
      <StudentAdmissionExcelImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        academicYears={academicYears}
        initialAcademicYearId={selectedAcademicYearId}
        onImportSuccess={handleImportSuccess}
      />
    </div>
  );
};
