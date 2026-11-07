import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  History,
  Edit3,
  Lock,
  ShieldAlert,
  X,
  User,
  Activity,
  CheckCheck,
} from 'lucide-react';
import {
  attendanceApi,
  academicsApi,
  AttendanceStatus,
  RegisterStatus,
  AttendanceRosterItem,
  RegisterSummary,
  AcademicYear,
  GradeClass,
  StudentAttendanceHistoryResponse,
  UserRole,
  Teacher,
  getMyTeacherProfile,
} from '../services/api';
import { useAuth } from '../context/AuthContext';

interface AttendanceRegisterViewProps {
  teacherProfile?: Teacher | null;
}

export const AttendanceRegisterView: React.FC<AttendanceRegisterViewProps> = ({ teacherProfile: initialProfile }) => {
  const { user } = useAuth();

  // Role checks
  const isFeeStaff = user?.role === UserRole.FEE_STAFF;
  const isTeacher = user?.role === UserRole.TEACHER;
  const isReadOnly = isFeeStaff;

  // Teacher Profile & Class Teacher Assignments
  const [profile, setProfile] = useState<Teacher | null>(initialProfile || null);

  useEffect(() => {
    let isMounted = true;
    if (isTeacher && !profile && user) {
      getMyTeacherProfile(user)
        .then((p) => {
          if (isMounted) setProfile(p);
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isTeacher, profile, user]);

  const classTeacherAssignments = useMemo(() => {
    if (!isTeacher) return [];
    return (profile?.assignments || []).filter((a) => a.isClassTeacher);
  }, [isTeacher, profile]);

  // Academic hierarchy filters
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');

  // Date selection (defaults to today; max is today)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Register state
  const [roster, setRoster] = useState<AttendanceRosterItem[]>([]);
  const [summary, setSummary] = useState<RegisterSummary | null>(null);
  const [localMarks, setLocalMarks] = useState<
    Record<string, { status: AttendanceStatus; remarks: string }>
  >({});

  // UI state
  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(true);
  const [isLoadingRegister, setIsLoadingRegister] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Correction Modal state
  const [correctionTarget, setCorrectionTarget] = useState<AttendanceRosterItem | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState<AttendanceStatus>('PRESENT');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState<boolean>(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Student History Modal state
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [historyStudentName, setHistoryStudentName] = useState<string>('');
  const [historyData, setHistoryData] = useState<StudentAttendanceHistoryResponse | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // 1. Load Academic Metadata (Years, Grades, Sections)
  useEffect(() => {
    let isMounted = true;
    const loadAcademicMetadata = async () => {
      setIsLoadingMetadata(true);
      setErrorMessage(null);
      setAccessDeniedMessage(null);
      try {
        const [yearsData, gradesData] = await Promise.all([
          academicsApi.getAcademicYears(),
          academicsApi.getGrades(),
        ]);

        if (!isMounted) return;

        setAcademicYears(yearsData || []);
        setGrades(gradesData || []);

        if (isTeacher) {
          // Resolve teacher assignments to default strictly to an authorized Class Teacher section
          const teacherProf = initialProfile || (user ? await getMyTeacherProfile(user) : null);
          if (!isMounted) return;
          if (teacherProf) setProfile(teacherProf);

          const asgs = (teacherProf?.assignments || []).filter((a) => a.isClassTeacher);
          if (asgs.length > 0) {
            const activeYear = (yearsData || []).find((y) => y.isCurrent) || yearsData?.[0];
            const targetAsg = asgs.find((a) => a.academicYearId === activeYear?.id) || asgs[0];
            setSelectedAcademicYearId(targetAsg.academicYearId);
            setSelectedGradeId(targetAsg.gradeId);
            setSelectedSectionId(targetAsg.sectionId);
          } else {
            setAccessDeniedMessage(
              'You do not have any designated Class Teacher assignments for attendance management.',
            );
          }
        } else {
          // Default to current academic year if available for administrators / fee staff
          if (yearsData && yearsData.length > 0) {
            const activeYear = yearsData.find((y) => y.isCurrent) || yearsData[0];
            setSelectedAcademicYearId(activeYear.id);
          }

          // Default to first grade and its first section
          if (gradesData && gradesData.length > 0) {
            const firstGrade = gradesData[0];
            setSelectedGradeId(firstGrade.id);
            if (firstGrade.sections && firstGrade.sections.length > 0) {
              setSelectedSectionId(firstGrade.sections[0].id);
            }
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        setErrorMessage(
          err.response?.data?.message || 'Failed to load academic setup metadata. Please try again.',
        );
      } finally {
        if (isMounted) setIsLoadingMetadata(false);
      }
    };

    loadAcademicMetadata();
    return () => {
      isMounted = false;
    };
  }, [isTeacher, initialProfile, user]);

  // Filter visible grades for teachers (only grades where teacher is Class Teacher)
  const visibleGrades = useMemo(() => {
    if (!isTeacher) return grades;
    const assignedGradeIds = new Set(
      classTeacherAssignments
        .filter((a) => !selectedAcademicYearId || a.academicYearId === selectedAcademicYearId)
        .map((a) => a.gradeId),
    );
    return grades.filter((g) => assignedGradeIds.has(g.id));
  }, [isTeacher, grades, classTeacherAssignments, selectedAcademicYearId]);

  // Filter sections when grade changes (only sections where teacher is Class Teacher)
  const availableSections = useMemo(() => {
    const grade = grades.find((g) => g.id === selectedGradeId);
    const sections = grade?.sections || [];
    if (!isTeacher) return sections;
    const assignedSectionIds = new Set(
      classTeacherAssignments
        .filter(
          (a) =>
            (!selectedAcademicYearId || a.academicYearId === selectedAcademicYearId) &&
            (!selectedGradeId || a.gradeId === selectedGradeId),
        )
        .map((a) => a.sectionId),
    );
    return sections.filter((s) => assignedSectionIds.has(s.id));
  }, [isTeacher, grades, selectedGradeId, selectedAcademicYearId, classTeacherAssignments]);

  const handleGradeChange = (gradeId: string) => {
    setSelectedGradeId(gradeId);
    const grade = grades.find((g) => g.id === gradeId);
    const sections = grade?.sections || [];
    const eligibleSections = isTeacher
      ? sections.filter((s) =>
          classTeacherAssignments.some(
            (a) =>
              a.gradeId === gradeId &&
              a.sectionId === s.id &&
              (!selectedAcademicYearId || a.academicYearId === selectedAcademicYearId),
          ),
        )
      : sections;

    if (eligibleSections.length > 0) {
      setSelectedSectionId(eligibleSections[0].id);
    } else {
      setSelectedSectionId('');
    }
  };

  // 2. Fetch Daily Attendance Register
  const fetchRegister = useCallback(async () => {
    if (!selectedAcademicYearId || !selectedGradeId || !selectedSectionId || !selectedDate) {
      return;
    }

    setIsLoadingRegister(true);
    setErrorMessage(null);
    setAccessDeniedMessage(null);

    try {
      const response = await attendanceApi.getRegister({
        academicYearId: selectedAcademicYearId,
        gradeId: selectedGradeId,
        sectionId: selectedSectionId,
        date: selectedDate,
      });

      setRoster(response.data || []);
      setSummary(response.register || null);

      // Initialize local marks mapping from fetched roster
      const initialMarks: Record<string, { status: AttendanceStatus; remarks: string }> = {};
      (response.data || []).forEach((item) => {
        // Default to PRESENT for easy roll-call if not yet marked, or maintain stored status
        const defaultStatus: AttendanceStatus =
          item.status === 'NOT_MARKED' ? 'PRESENT' : item.status;
        initialMarks[item.studentId] = {
          status: defaultStatus,
          remarks: item.remarks || '',
        };
      });
      setLocalMarks(initialMarks);
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || 'Failed to load attendance register';

      if (status === 403) {
        setAccessDeniedMessage(msg);
      } else {
        setErrorMessage(msg);
      }
      setRoster([]);
      setSummary(null);
    } finally {
      setIsLoadingRegister(false);
    }
  }, [selectedAcademicYearId, selectedGradeId, selectedSectionId, selectedDate]);

  // Fetch register whenever section or date changes
  useEffect(() => {
    fetchRegister();
  }, [fetchRegister]);

  // 3. Mark update handlers
  const handleMarkChange = (studentId: string, status: AttendanceStatus) => {
    if (isReadOnly || summary?.isLocked) return;
    setLocalMarks((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
      },
    }));
  };

  const handleRemarkChange = (studentId: string, remarks: string) => {
    if (isReadOnly || summary?.isLocked) return;
    setLocalMarks((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        remarks,
      },
    }));
  };

  const handleMarkAll = (status: AttendanceStatus) => {
    if (isReadOnly || summary?.isLocked) return;
    setLocalMarks((prev) => {
      const updated = { ...prev };
      roster.forEach((item) => {
        updated[item.studentId] = {
          status,
          remarks: prev[item.studentId]?.remarks || '',
        };
      });
      return updated;
    });
  };

  // 4. Bulk Save & Submit Register
  const handleBulkSubmit = async () => {
    if (isReadOnly || summary?.isLocked || isSubmitting) return;

    if (roster.length === 0) {
      setErrorMessage('No enrolled students in this section to mark.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const entries = roster.map((item) => ({
        studentId: item.studentId,
        status: localMarks[item.studentId]?.status || 'PRESENT',
        remarks: localMarks[item.studentId]?.remarks?.trim() || undefined,
      }));

      const res = await attendanceApi.bulkMark({
        academicYearId: selectedAcademicYearId,
        gradeId: selectedGradeId,
        sectionId: selectedSectionId,
        attendanceDate: selectedDate,
        entries,
      });

      setSuccessMessage(
        `Successfully submitted attendance register (${res.totalSubmitted} students recorded).`,
      );
      // Refresh register to synchronize backend summary
      await fetchRegister();
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message || 'Failed to submit attendance register. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Attendance Correction Modal Flow
  const openCorrectionModal = (item: AttendanceRosterItem) => {
    if (isReadOnly) return;
    setCorrectionTarget(item);
    setCorrectionStatus(item.status === 'NOT_MARKED' ? 'PRESENT' : item.status);
    setCorrectionReason('');
    setCorrectionError(null);
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget?.attendanceRecordId) {
      setCorrectionError('Cannot correct an unmarked record. Use bulk marking instead.');
      return;
    }

    if (correctionReason.trim().length < 5) {
      setCorrectionError('Correction reason must be at least 5 characters for audit compliance.');
      return;
    }

    if (correctionStatus === correctionTarget.status) {
      setCorrectionError('New status must be different from current status.');
      return;
    }

    setIsSubmittingCorrection(true);
    setCorrectionError(null);

    try {
      await attendanceApi.correctAttendance(correctionTarget.attendanceRecordId, {
        status: correctionStatus,
        reason: correctionReason.trim(),
      });

      setSuccessMessage(
        `Attendance for ${correctionTarget.firstName} ${correctionTarget.lastName} updated to ${correctionStatus}.`,
      );
      setCorrectionTarget(null);
      await fetchRegister();
    } catch (err: any) {
      setCorrectionError(
        err.response?.data?.message || 'Failed to submit correction. Please check details.',
      );
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  // 6. Student History Modal Flow
  const openHistoryModal = async (studentId: string, studentName: string) => {
    setHistoryStudentId(studentId);
    setHistoryStudentName(studentName);
    setIsLoadingHistory(true);
    setHistoryError(null);
    setHistoryData(null);

    try {
      const history = await attendanceApi.getStudentHistory(studentId, {
        academicYearId: selectedAcademicYearId,
      });
      setHistoryData(history);
    } catch (err: any) {
      setHistoryError(
        err.response?.data?.message || 'Failed to load student attendance history.',
      );
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Filter roster by client-side search query
  const filteredRoster = useMemo(() => {
    if (!searchQuery.trim()) return roster;
    const q = searchQuery.toLowerCase().trim();
    return roster.filter(
      (s) =>
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q) ||
        (s.rollNumber && s.rollNumber.toLowerCase().includes(q)),
    );
  }, [roster, searchQuery]);

  // Status Badge Helper
  const renderRegisterStatusBadge = (status: RegisterStatus | undefined, isLocked?: boolean) => {
    if (isLocked || status === 'LOCKED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          Locked
        </span>
      );
    }

    switch (status) {
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Submitted
          </span>
        );
      case 'PARTIALLY_MARKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            Partially Marked
          </span>
        );
      case 'UNMARKED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Unmarked
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Read-Only Notice for Fee Staff */}
      {isFeeStaff && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-800 text-xs font-medium">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            <strong>Read-Only Access:</strong> Your role ({user?.role}) has view-only privileges for daily attendance registers and student histories. Marking and correction controls are disabled.
          </span>
        </div>
      )}

      {/* Access Denied Card (e.g. Unassigned Teacher) */}
      {accessDeniedMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3">
          <div className="p-3 bg-rose-100 text-rose-600 rounded-full w-fit mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-rose-900">Access Restricted</h3>
          <p className="text-xs text-rose-700 max-w-md mx-auto">{accessDeniedMessage}</p>
          {isTeacher && (
            <p className="text-[11px] text-rose-500">
              Teachers may only mark and view registers for classes to which they are actively assigned by an administrator.
            </p>
          )}
        </div>
      )}

      {/* Success Alert */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between text-emerald-800 text-xs font-medium">
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

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between text-rose-800 text-xs font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
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

      {/* Filter and Selection Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Daily Attendance Register</h3>
              <p className="text-xs text-slate-500">
                Select session, class, section, and date to mark or review roll-call attendance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => fetchRegister()}
              disabled={isLoadingRegister}
              className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Refresh register"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRegister ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Hierarchy Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Academic Year */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Academic Session</label>
            <select
              value={selectedAcademicYearId}
              onChange={(e) => setSelectedAcademicYearId(e.target.value)}
              disabled={isLoadingMetadata || academicYears.length === 0}
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name} {ay.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Grade / Class */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Grade / Class</label>
            <select
              value={selectedGradeId}
              onChange={(e) => handleGradeChange(e.target.value)}
              disabled={isLoadingMetadata || visibleGrades.length === 0}
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {visibleGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </select>
          </div>

          {/* Section */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Section</label>
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              disabled={isLoadingMetadata || availableSections.length === 0}
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {availableSections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name} (Cap: {s.capacity})
                </option>
              ))}
            </select>
          </div>

          {/* Attendance Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Attendance Date</label>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Register Summary & Metrics Banner */}
      {summary && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Register Status:
              </span>
              {renderRegisterStatusBadge(summary.status, summary.isLocked)}
            </div>

            {/* Quick Batch Marking Buttons (Disabled for Fee Staff / Locked) */}
            {!isReadOnly && !summary.isLocked && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium hidden md:inline">
                  Quick Actions:
                </span>
                <button
                  type="button"
                  onClick={() => handleMarkAll('PRESENT')}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition-colors"
                >
                  Mark All Present
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkAll('ABSENT')}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 transition-colors"
                >
                  Mark All Absent
                </button>
              </div>
            )}
          </div>

          {/* Counters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-center">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="block text-[11px] font-semibold text-slate-500">Enrolled</span>
              <span className="text-lg font-bold text-slate-900">{summary.totalEnrolled}</span>
            </div>
            <div className="p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100">
              <span className="block text-[11px] font-semibold text-emerald-700">Present</span>
              <span className="text-lg font-bold text-emerald-700">{summary.totalPresent}</span>
            </div>
            <div className="p-3 bg-rose-50/50 rounded-2xl border border-rose-100">
              <span className="block text-[11px] font-semibold text-rose-700">Absent</span>
              <span className="text-lg font-bold text-rose-700">{summary.totalAbsent}</span>
            </div>
            <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-100">
              <span className="block text-[11px] font-semibold text-amber-700">Late</span>
              <span className="text-lg font-bold text-amber-700">{summary.totalLate}</span>
            </div>
            <div className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100">
              <span className="block text-[11px] font-semibold text-purple-700">Half Day</span>
              <span className="text-lg font-bold text-purple-700">{summary.totalHalfDay}</span>
            </div>
            <div className="p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100">
              <span className="block text-[11px] font-semibold text-indigo-700">Excused</span>
              <span className="text-lg font-bold text-indigo-700">{summary.totalExcused}</span>
            </div>
            <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200">
              <span className="block text-[11px] font-semibold text-slate-600">Unmarked</span>
              <span className="text-lg font-bold text-slate-800">{summary.totalUnmarked}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Student Roster Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by student name, roll, or admission..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <strong>{filteredRoster.length}</strong> of <strong>{roster.length}</strong> enrolled students
          </div>
        </div>

        {/* Loading Spinner State */}
        {isLoadingRegister ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Loading section attendance roster...</p>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="p-3 bg-slate-50 text-slate-400 rounded-full w-fit mx-auto">
              <User className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-bold text-slate-700">No Students Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? 'No students matched your search criteria.'
                : 'No active enrolled students found in this section for the selected session.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4 text-center">Status in Register</th>
                  <th className="py-3 px-4">Marking Selection</th>
                  <th className="py-3 px-4">Remarks</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRoster.map((item, idx) => {
                  const currentLocalStatus = localMarks[item.studentId]?.status || 'PRESENT';
                  const currentLocalRemark = localMarks[item.studentId]?.remarks || '';

                  return (
                    <tr
                      key={item.studentId}
                      className="hover:bg-slate-50/60 transition-colors group"
                    >
                      <td className="py-3 px-4 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>

                      {/* Student Details */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">
                          {item.firstName} {item.lastName}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>Adm: {item.admissionNumber}</span>
                          {item.rollNumber && <span>• Roll: {item.rollNumber}</span>}
                        </div>
                      </td>

                      {/* Status in DB */}
                      <td className="py-3 px-4 text-center">
                        {item.status === 'NOT_MARKED' ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Unmarked
                          </span>
                        ) : item.status === 'PRESENT' ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Present
                          </span>
                        ) : item.status === 'ABSENT' ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Absent
                          </span>
                        ) : item.status === 'LATE' ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Late
                          </span>
                        ) : item.status === 'HALF_DAY' ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Half Day
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Excused
                          </span>
                        )}
                      </td>

                      {/* Marking Selection Pills */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED'] as AttendanceStatus[]).map(
                            (st) => {
                              const isSelected = currentLocalStatus === st;
                              const disabled = isReadOnly || summary?.isLocked;

                              let activeClass = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
                              if (isSelected) {
                                if (st === 'PRESENT') activeClass = 'bg-emerald-600 text-white';
                                else if (st === 'ABSENT') activeClass = 'bg-rose-600 text-white';
                                else if (st === 'LATE') activeClass = 'bg-amber-600 text-white';
                                else if (st === 'HALF_DAY') activeClass = 'bg-purple-600 text-white';
                                else if (st === 'EXCUSED') activeClass = 'bg-indigo-600 text-white';
                              }

                              return (
                                <button
                                  key={st}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => handleMarkChange(item.studentId, st)}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${activeClass} ${
                                    disabled ? 'opacity-50 cursor-not-allowed' : ''
                                  }`}
                                  title={`Mark ${st}`}
                                >
                                  {st === 'PRESENT'
                                    ? 'P'
                                    : st === 'ABSENT'
                                    ? 'A'
                                    : st === 'LATE'
                                    ? 'L'
                                    : st === 'HALF_DAY'
                                    ? 'HD'
                                    : 'EX'}
                                </button>
                              );
                            },
                          )}
                        </div>
                      </td>

                      {/* Remarks Input */}
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          placeholder={isReadOnly ? 'No remarks' : 'Optional note...'}
                          value={currentLocalRemark}
                          disabled={isReadOnly || summary?.isLocked}
                          onChange={(e) => handleRemarkChange(item.studentId, e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Correction button (for already marked records, disabled for Fee Staff) */}
                          {item.attendanceRecordId && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => openCorrectionModal(item)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Correct attendance record with reason"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Student Attendance History Button */}
                          <button
                            type="button"
                            onClick={() =>
                              openHistoryModal(
                                item.studentId,
                                `${item.firstName} ${item.lastName}`,
                              )
                            }
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="View student attendance history"
                          >
                            <History className="w-3.5 h-3.5" />
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

        {/* Bulk Submission Footer */}
        {!isReadOnly && roster.length > 0 && !summary?.isLocked && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              Review your section entries above before submitting.
            </span>

            <button
              type="button"
              onClick={handleBulkSubmit}
              disabled={isSubmitting || isLoadingRegister}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Register...</span>
                </>
              ) : (
                <>
                  <CheckCheck className="w-4 h-4" />
                  <span>Save & Submit Register ({roster.length} Marks)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 7. Attendance Correction Modal */}
      {/* ===================================================================== */}
      {correctionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Attendance Correction</h3>
                  <p className="text-[11px] text-slate-400">
                    Mandatory audit trail reason required by ERP policy.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCorrectionTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCorrectionSubmit} className="p-6 space-y-4">
              {correctionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                  {correctionError}
                </div>
              )}

              {/* Student and Record Info */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-1">
                <div className="font-bold text-slate-800">
                  {correctionTarget.firstName} {correctionTarget.lastName}
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>Adm: {correctionTarget.admissionNumber}</span>
                  <span>Date: {selectedDate}</span>
                </div>
                <div className="text-slate-500">
                  Current Status: <strong>{correctionTarget.status}</strong>
                </div>
              </div>

              {/* New Status Selection */}
              <div>
                <label
                  htmlFor="new-attendance-status"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  New Attendance Status
                </label>
                <select
                  id="new-attendance-status"
                  value={correctionStatus}
                  onChange={(e) => setCorrectionStatus(e.target.value as AttendanceStatus)}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="LATE">LATE</option>
                  <option value="HALF_DAY">HALF_DAY</option>
                  <option value="EXCUSED">EXCUSED</option>
                </select>
              </div>

              {/* Mandatory Reason */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="correction-reason" className="text-xs font-bold text-slate-700">
                    Correction Reason <span className="text-rose-500">*</span>
                  </label>
                  <span
                    className={`text-[10px] ${
                      correctionReason.trim().length >= 5 ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {correctionReason.trim().length}/5 chars min
                  </span>
                </div>
                <textarea
                  id="correction-reason"
                  rows={3}
                  required
                  placeholder="e.g. Bus breakdown delayed arrival, medical slip submitted..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCorrectionTarget(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCorrection || correctionReason.trim().length < 5}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingCorrection && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Correction</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 8. Student Attendance History Modal */}
      {/* ===================================================================== */}
      {historyStudentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{historyStudentName}</h3>
                  <p className="text-[11px] text-slate-400">
                    Attendance history and aggregated statistics
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHistoryStudentId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {isLoadingHistory ? (
                <div className="p-12 text-center space-y-2">
                  <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-xs text-slate-400">Fetching attendance records...</p>
                </div>
              ) : historyError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700">
                  {historyError}
                </div>
              ) : historyData ? (
                <>
                  {/* Statistics Summary */}
                  <div className="bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Overall Attendance Rate</span>
                      <span className="text-base font-extrabold text-indigo-600">
                        {historyData.stats.attendanceRate}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, historyData.stats.attendanceRate)}%` }}
                      />
                    </div>

                    {/* Breakdown Chips */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center pt-1">
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="block text-[10px] text-slate-400 font-medium">Working</span>
                        <span className="text-xs font-bold text-slate-800">
                          {historyData.stats.totalWorkingDays}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="block text-[10px] text-emerald-600 font-medium">Present</span>
                        <span className="text-xs font-bold text-emerald-700">
                          {historyData.stats.presentDays}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="block text-[10px] text-rose-600 font-medium">Absent</span>
                        <span className="text-xs font-bold text-rose-700">
                          {historyData.stats.absentDays}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="block text-[10px] text-amber-600 font-medium">Late</span>
                        <span className="text-xs font-bold text-amber-700">
                          {historyData.stats.lateDays}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="block text-[10px] text-purple-600 font-medium">Half Day</span>
                        <span className="text-xs font-bold text-purple-700">
                          {historyData.stats.halfDays}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="block text-[10px] text-indigo-600 font-medium">Excused</span>
                        <span className="text-xs font-bold text-indigo-700">
                          {historyData.stats.excusedDays}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Past Records Table */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Daily Roll Records ({historyData.data.length})
                    </h4>

                    {historyData.data.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">
                        No recorded attendance marks found for this student.
                      </p>
                    ) : (
                      <div className="border border-slate-100 rounded-2xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {historyData.data.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-50/50">
                                <td className="py-2.5 px-3 font-semibold text-slate-800">
                                  {r.attendanceDate}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      r.status === 'PRESENT'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : r.status === 'ABSENT'
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : r.status === 'LATE'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : r.status === 'HALF_DAY'
                                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                    }`}
                                  >
                                    {r.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-500">
                                  {r.remarks || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryStudentId(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
