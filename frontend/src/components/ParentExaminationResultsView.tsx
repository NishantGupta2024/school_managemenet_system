import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Award,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Calendar,
  RefreshCw,
  FileText,
  AlertTriangle,
  X,
  UserCheck,
  GraduationCap,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { ExaminationLeaderboardModal } from './ExaminationLeaderboardModal';
import { metaApi, Student } from '../services/api';
import {
  examinationApi,
  ParentAssessmentHistoryItem,
  StudentResultView,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
} from '../services/examination.api';

// =============================================================================
// Status Helper Functions
// =============================================================================

type DerivedParentStatus =
  | 'UPCOMING'
  | 'AVAILABLE'
  | 'IN_PROGRESS'
  | 'SUBMITTED_PENDING'
  | 'TIMED_OUT_PENDING'
  | 'RESULTS_RELEASED'
  | 'CLOSED_NOT_ATTEMPTED';

function getDerivedStatus(item: ParentAssessmentHistoryItem): DerivedParentStatus {
  if (item.assessmentStatus === AssessmentStatus.RESULTS_RELEASED) {
    return 'RESULTS_RELEASED';
  }
  if (item.attemptStatus === AttemptStatus.SUBMITTED) {
    return 'SUBMITTED_PENDING';
  }
  if (item.attemptStatus === AttemptStatus.TIMED_OUT) {
    return 'TIMED_OUT_PENDING';
  }
  if (item.attemptStatus === AttemptStatus.IN_PROGRESS) {
    return 'IN_PROGRESS';
  }
  if (item.assessmentStatus === AssessmentStatus.CLOSED && !item.hasAttempt) {
    return 'CLOSED_NOT_ATTEMPTED';
  }
  if (item.startWindowAt && new Date(item.startWindowAt) > new Date()) {
    return 'UPCOMING';
  }
  return 'AVAILABLE';
}

function getStatusBadge(status: DerivedParentStatus) {
  switch (status) {
    case 'RESULTS_RELEASED':
      return {
        label: 'Results Released',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
      };
    case 'SUBMITTED_PENDING':
      return {
        label: 'Submitted — Results Pending',
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
      };
    case 'TIMED_OUT_PENDING':
      return {
        label: 'Timed Out — Results Pending',
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
      };
    case 'IN_PROGRESS':
      return {
        label: 'In Progress',
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        dot: 'bg-blue-500',
      };
    case 'CLOSED_NOT_ATTEMPTED':
      return {
        label: 'Closed — Not Attempted',
        bg: 'bg-slate-100 text-slate-600 border-slate-200',
        dot: 'bg-slate-400',
      };
    case 'UPCOMING':
      return {
        label: 'Upcoming',
        bg: 'bg-purple-50 text-purple-700 border-purple-200',
        dot: 'bg-purple-500',
      };
    case 'AVAILABLE':
    default:
      return {
        label: 'Available',
        bg: 'bg-sky-50 text-sky-700 border-sky-200',
        dot: 'bg-sky-500',
      };
  }
}

type FilterTab = 'ALL' | 'UPCOMING_AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'RESULTS_RELEASED';

// =============================================================================
// ParentExaminationResultsView Component
// =============================================================================

export const ParentExaminationResultsView: React.FC = () => {
  // 1. Linked Students State
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [loadingStudents, setLoadingStudents] = useState<boolean>(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  // 2. Assessment History State
  const [assessments, setAssessments] = useState<ParentAssessmentHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<FilterTab>('ALL');

  // 3. Scorecard State
  const [activeScorecardAssessmentId, setActiveScorecardAssessmentId] = useState<string | null>(null);
  const [scorecardData, setScorecardData] = useState<StudentResultView | null>(null);
  const [loadingScorecard, setLoadingScorecard] = useState<boolean>(false);
  const [scorecardError, setScorecardError] = useState<string | null>(null);

  // 4. Unreleased Info Modal State
  const [unreleasedNoticeAssessment, setUnreleasedNoticeAssessment] = useState<ParentAssessmentHistoryItem | null>(null);

  // 5. Leaderboard Modal State
  const [leaderboardAssessment, setLeaderboardAssessment] = useState<{
    id: string;
    title: string;
    subject?: string;
    totalMarks?: number;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Load Linked Active Students
  // ---------------------------------------------------------------------------
  const loadAccessibleStudents = useCallback(async () => {
    try {
      setLoadingStudents(true);
      setStudentsError(null);
      const res = await metaApi.getAccessibleStudents();
      const activeOnly = (res || []).filter((s) => s.status === 'ACTIVE');
      setStudents(activeOnly);
      if (activeOnly.length > 0) {
        setSelectedStudentId(activeOnly[0].id);
      } else {
        setSelectedStudentId('');
      }
    } catch (err: any) {
      setStudentsError(err?.response?.data?.message || err?.message || 'Failed to load accessible student profiles.');
      setStudents([]);
      setSelectedStudentId('');
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  useEffect(() => {
    loadAccessibleStudents();
  }, [loadAccessibleStudents]);

  // ---------------------------------------------------------------------------
  // Load History When Selected Student Changes
  // ---------------------------------------------------------------------------
  const loadStudentAssessments = useCallback(async (studentId: string) => {
    if (!studentId) {
      setAssessments([]);
      return;
    }

    try {
      setLoadingHistory(true);
      setHistoryError(null);
      setAssessments([]);
      // Clear scorecard when switching students
      setActiveScorecardAssessmentId(null);
      setScorecardData(null);
      setScorecardError(null);
      setUnreleasedNoticeAssessment(null);

      const res = await examinationApi.getParentStudentAssessments(studentId);
      setAssessments(res.assessments || []);
    } catch (err: any) {
      setHistoryError(err?.response?.data?.message || err?.message || 'Failed to load examination history.');
      setAssessments([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStudentId) {
      loadStudentAssessments(selectedStudentId);
    } else {
      setAssessments([]);
    }
  }, [selectedStudentId, loadStudentAssessments]);

  // Selected student object
  const currentStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // ---------------------------------------------------------------------------
  // Filtered Assessments & Counters
  // ---------------------------------------------------------------------------
  const filteredAssessments = useMemo(() => {
    return assessments.filter((item) => {
      const status = getDerivedStatus(item);
      if (selectedTab === 'ALL') return true;
      if (selectedTab === 'UPCOMING_AVAILABLE') {
        return status === 'UPCOMING' || status === 'AVAILABLE';
      }
      if (selectedTab === 'IN_PROGRESS') {
        return status === 'IN_PROGRESS';
      }
      if (selectedTab === 'COMPLETED') {
        return (
          status === 'SUBMITTED_PENDING' ||
          status === 'TIMED_OUT_PENDING' ||
          status === 'RESULTS_RELEASED' ||
          item.attemptStatus === AttemptStatus.SUBMITTED ||
          item.attemptStatus === AttemptStatus.TIMED_OUT
        );
      }
      if (selectedTab === 'RESULTS_RELEASED') {
        return status === 'RESULTS_RELEASED';
      }
      return true;
    });
  }, [assessments, selectedTab]);

  const metrics = useMemo(() => {
    let released = 0;
    let pending = 0;
    let inProgress = 0;
    let total = assessments.length;

    for (const item of assessments) {
      const st = getDerivedStatus(item);
      if (st === 'RESULTS_RELEASED') released++;
      else if (st === 'SUBMITTED_PENDING' || st === 'TIMED_OUT_PENDING') pending++;
      else if (st === 'IN_PROGRESS') inProgress++;
    }

    return { total, released, pending, inProgress };
  }, [assessments]);

  // ---------------------------------------------------------------------------
  // Load Scorecard for Released Assessment
  // ---------------------------------------------------------------------------
  const handleOpenScorecard = async (assessmentId: string) => {
    if (!selectedStudentId) return;

    // If already showing this scorecard, do not refetch
    if (activeScorecardAssessmentId === assessmentId && scorecardData) {
      return;
    }

    setActiveScorecardAssessmentId(assessmentId);
    setScorecardData(null);
    setScorecardError(null);
    setLoadingScorecard(true);

    try {
      const res = await examinationApi.getParentAssessmentResult(selectedStudentId, assessmentId);
      setScorecardData(res);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setScorecardError(
          err?.response?.data?.message || 'Assessment results have not been released yet',
        );
      } else if (status === 404) {
        setScorecardError('No completed attempt found for this assessment.');
      } else {
        setScorecardError(
          err?.response?.data?.message || err?.message || 'Failed to load examination scorecard. Please try again.',
        );
      }
    } finally {
      setLoadingScorecard(false);
    }
  };

  const handleCloseScorecard = () => {
    setActiveScorecardAssessmentId(null);
    setScorecardData(null);
    setScorecardError(null);
  };

  // ---------------------------------------------------------------------------
  // Render: Loading Students State
  // ---------------------------------------------------------------------------
  if (loadingStudents) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-6 rounded-3xl shadow-sm">
          <span className="text-xs font-semibold text-purple-200 tracking-wider uppercase">
            Parent Examination Portal
          </span>
          <h3 className="text-xl font-bold tracking-tight mt-1">Ward Academic Assessment Results</h3>
        </div>
        <div className="bg-white p-12 rounded-2xl border border-slate-200 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600">Verifying linked student profiles...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: No Linked Active Students
  // ---------------------------------------------------------------------------
  if (students.length === 0) {
    return (
      <div className="space-y-6">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-6 rounded-3xl shadow-sm relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-2">
            <span className="text-xs font-semibold text-purple-200 tracking-wider uppercase">
              Parent Examination Portal
            </span>
            <h3 className="text-xl font-bold tracking-tight">Ward Academic Assessment Results</h3>
            <p className="text-xs text-purple-100 leading-relaxed">
              Monitor your verified ward's examination milestones, subject performance summaries, and released scorecards
              with authoritative institutional verification.
            </p>
          </div>
          <div className="absolute -right-8 -bottom-8 opacity-10 text-white pointer-events-none">
            <Users className="w-64 h-64" />
          </div>
        </div>

        {/* Informational Cards (Preserved for compatibility) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                <Award className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Released Scorecards</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                View verified score reports, total marks obtained, percentage, and passing status for each subject test.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-600">Verified Access Only</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                Connected
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Curriculum Progression</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Track completed syllabus chapters and assessment requirements across academic sessions.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-600">Chapter Milestones</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                Connected
              </span>
            </div>
          </div>
        </div>

        {/* Empty State Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center border border-amber-200">
            <UserCheck className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-base font-bold text-slate-900">No Verified Student Profiles Found</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              No verified student profiles are linked to your parent account. Please contact the school administration.
            </p>
          </div>
          {studentsError && (
            <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 p-2 rounded-xl max-w-md mx-auto">
              {studentsError}
            </p>
          )}
          <button
            type="button"
            onClick={loadAccessibleStudents}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Verification</span>
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main Render: Active Linked Children & Examination History
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-6 rounded-3xl shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <span className="text-xs font-semibold text-purple-200 tracking-wider uppercase">
            Parent Examination Portal
          </span>
          <h3 className="text-xl font-bold tracking-tight">Ward Academic Assessment Results</h3>
          <p className="text-xs text-purple-100 leading-relaxed">
            Monitor your verified ward's examination milestones, subject performance summaries, and released scorecards
            with authoritative institutional verification.
          </p>
        </div>
        <div className="absolute -right-8 -bottom-8 opacity-10 text-white pointer-events-none">
          <Users className="w-64 h-64" />
        </div>
      </div>

      {/* Workflow Informational Cards (Preserved for compatibility) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-purple-200 transition-all shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Released Scorecards</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                View verified score reports, total marks obtained, percentage, and passing status for each subject test.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-600">Verified Access Only</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
              Connected
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-purple-200 transition-all shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Curriculum Progression</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Track completed syllabus chapters and assessment requirements across academic sessions.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-600">Chapter Milestones</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
              Connected
            </span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* Child Selection Header */}
      {/* ----------------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-purple-600" />
              <h4 className="text-sm font-bold text-slate-900">Linked Student Profile</h4>
            </div>
            <p className="text-xs text-slate-500">
              Select a ward to inspect verified assessment participation and official scorecards.
            </p>
          </div>

          {/* Child Dropdown / Switcher if multiple */}
          {students.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="child-selector" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Select Ward:
              </label>
              <select
                id="child-selector"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              >
                {students.map((stu) => (
                  <option key={stu.id} value={stu.id}>
                    {stu.firstName} {stu.lastName} ({stu.admissionNumber})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Selected Student Information Card */}
        {currentStudent && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                {currentStudent.firstName?.[0] || 'S'}
                {currentStudent.lastName?.[0] || ''}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {currentStudent.firstName} {currentStudent.lastName}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    Active Student
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-0.5">
                  <span>
                    Adm No: <strong className="text-slate-700 font-semibold">{currentStudent.admissionNumber}</strong>
                  </span>
                  {currentStudent.grade && (
                    <span>
                      Grade: <strong className="text-slate-700 font-semibold">{currentStudent.grade.name}</strong>
                    </span>
                  )}
                  {currentStudent.section && (
                    <span>
                      Section: <strong className="text-slate-700 font-semibold">{currentStudent.section.name}</strong>
                    </span>
                  )}
                  {currentStudent.academicYear && (
                    <span>
                      Session: <strong className="text-slate-700 font-semibold">{currentStudent.academicYear.name}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => selectedStudentId && loadStudentAssessments(selectedStudentId)}
              disabled={loadingHistory}
              className="text-xs font-semibold text-slate-600 hover:text-purple-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-purple-200 transition-colors bg-white shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin text-purple-600' : ''}`} />
              <span>Refresh History</span>
            </button>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* Assessment Metrics Summary */}
      {/* ----------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-slate-500 text-xs font-medium">Total Examinations</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{metrics.total}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-emerald-600 text-xs font-medium">Results Released</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{metrics.released}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-amber-600 text-xs font-medium">Pending Release</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{metrics.pending}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-blue-600 text-xs font-medium">In Progress</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{metrics.inProgress}</div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* Examination History Workspace */}
      {/* ----------------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Navigation & Filter Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-600" />
            <h4 className="text-sm font-bold text-slate-900">Examination Record & Scorecards</h4>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setSelectedTab('ALL')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                selectedTab === 'ALL'
                  ? 'bg-white text-purple-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({assessments.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('RESULTS_RELEASED')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                selectedTab === 'RESULTS_RELEASED'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Results Released ({metrics.released})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('COMPLETED')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                selectedTab === 'COMPLETED'
                  ? 'bg-white text-amber-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Completed ({metrics.released + metrics.pending})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('IN_PROGRESS')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                selectedTab === 'IN_PROGRESS'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              In Progress ({metrics.inProgress})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('UPCOMING_AVAILABLE')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                selectedTab === 'UPCOMING_AVAILABLE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upcoming / Available
            </button>
          </div>
        </div>

        {/* Loading / Error / Empty / List content */}
        {loadingHistory ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-purple-600 animate-spin mx-auto" />
            <p className="text-xs font-medium text-slate-500">Loading student examination records...</p>
          </div>
        ) : historyError ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <div className="space-y-1">
              <h5 className="text-sm font-bold text-slate-900">Failed to Load Examination History</h5>
              <p className="text-xs text-rose-600 font-medium">{historyError}</p>
            </div>
            <button
              type="button"
              onClick={() => selectedStudentId && loadStudentAssessments(selectedStudentId)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <h5 className="text-sm font-bold text-slate-700">No Examination Records Found</h5>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {assessments.length === 0
                ? 'No examinations found for this student.'
                : 'No examinations match the selected filter category.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAssessments.map((item) => {
              const derived = getDerivedStatus(item);
              const badge = getStatusBadge(derived);
              const isScorecardAvailable = item.assessmentStatus === AssessmentStatus.RESULTS_RELEASED;
              const isPendingUnreleased =
                (item.attemptStatus === AttemptStatus.SUBMITTED || item.attemptStatus === AttemptStatus.TIMED_OUT) &&
                item.assessmentStatus !== AssessmentStatus.RESULTS_RELEASED;

              return (
                <div
                  key={item.assessmentId}
                  className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left Column: Assessment Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
                        {item.subject}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${badge.bg}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        <span>{badge.label}</span>
                      </span>
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                        {item.mode === AssessmentMode.LIVE_EXAM ? 'Live Exam' : 'Normal Quiz'}
                      </span>
                    </div>

                    <div>
                      <h5 className="text-sm font-bold text-slate-900">{item.title}</h5>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                        {item.chapterTitle ? (
                          <span className="flex items-center gap-1 text-slate-600 font-medium">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {item.chapterCode ? `${item.chapterCode}: ` : ''}
                              {item.chapterTitle}
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400 italic">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>General Assessment</span>
                          </span>
                        )}

                        <span className="flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Total: <strong className="text-slate-700">{item.totalMarks} Marks</strong>
                          </span>
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.durationMinutes} mins</span>
                        </span>

                        {item.startWindowAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Start: {new Date(item.startWindowAt).toLocaleDateString()}</span>
                          </span>
                        )}

                        {item.submittedAt && (
                          <span className="flex items-center gap-1 text-slate-600">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Submitted: {new Date(item.submittedAt).toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Action Controls */}
                  <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                    {isScorecardAvailable ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenScorecard(item.assessmentId)}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>View Scorecard</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setLeaderboardAssessment({
                              id: item.assessmentId,
                              title: item.title,
                              subject: item.subject,
                              totalMarks: item.totalMarks,
                            })
                          }
                          className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                          title="View Official Leaderboard"
                        >
                          <Trophy className="w-3.5 h-3.5" />
                          <span>Leaderboard</span>
                        </button>
                      </>
                    ) : isPendingUnreleased ? (
                      <button
                        type="button"
                        onClick={() => setUnreleasedNoticeAssessment(item)}
                        className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Results Pending</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 italic px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                        {item.hasAttempt ? 'Attempt In Progress' : 'No Submission Yet'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* Unreleased Examination Notification Modal */}
      {/* ----------------------------------------------------------------------- */}
      {unreleasedNoticeAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Result Under Institutional Review</span>
              </div>
              <button
                type="button"
                onClick={() => setUnreleasedNoticeAssessment(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-1">
                <div className="text-xs font-bold text-amber-900">{unreleasedNoticeAssessment.title}</div>
                <div className="text-[11px] text-amber-700">Subject: {unreleasedNoticeAssessment.subject}</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  Your child's examination has been completed. The school has not published the result yet.
                </p>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Official scorecards, pass/fail verification, and teacher evaluations will be released simultaneously for
                  the entire batch once the school administration approves the final grade report.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setUnreleasedNoticeAssessment(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* Official Scorecard View / Modal */}
      {/* ----------------------------------------------------------------------- */}
      {activeScorecardAssessmentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-100">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">Official Examination Scorecard</h4>
                  <p className="text-xs text-slate-500">School Examination Board Certified Result</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseScorecard}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scorecard Body */}
            {loadingScorecard ? (
              <div className="py-16 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto" />
                <p className="text-xs font-medium text-slate-500">Retrieving official scorecard from registry...</p>
              </div>
            ) : scorecardError ? (
              <div className="py-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center border border-rose-200">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h5 className="text-sm font-bold text-slate-900">Scorecard Notice</h5>
                  <p className="text-xs text-slate-600 leading-relaxed">{scorecardError}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseScorecard}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl"
                >
                  Back to Examination List
                </button>
              </div>
            ) : !scorecardData || !scorecardData.result ? (
              <div className="py-10 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center border border-amber-200">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h5 className="text-sm font-bold text-slate-900">Result Details Currently Unavailable</h5>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {!scorecardData?.hasAttempt
                      ? 'No examination attempt was recorded for this assessment.'
                      : scorecardData?.message ||
                        'Result details are currently unavailable. Please contact the school administration.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseScorecard}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl"
                >
                  Back to Examination List
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Ward & Assessment Header Card */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-full">
                      {scorecardData.subject}
                    </span>
                    <h5 className="text-base font-bold text-slate-900">{scorecardData.title}</h5>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {scorecardData.chapterTitle && (
                        <span>
                          Chapter: <strong>{scorecardData.chapterCode ? `${scorecardData.chapterCode} — ` : ''}{scorecardData.chapterTitle}</strong>
                        </span>
                      )}
                      <span>
                        Mode: <strong>{scorecardData.mode === AssessmentMode.LIVE_EXAM ? 'Live Exam' : 'Normal Quiz'}</strong>
                      </span>
                    </div>
                  </div>

                  {currentStudent && (
                    <div className="text-right text-xs text-slate-600">
                      <div className="font-bold text-slate-900">
                        {currentStudent.firstName} {currentStudent.lastName}
                      </div>
                      <div className="text-[11px] text-slate-500">Adm: {currentStudent.admissionNumber}</div>
                    </div>
                  )}
                </div>

                {/* Score & Passing Status Hero Banner */}
                <div
                  className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
                    scorecardData.result.isPassing
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="space-y-1 text-center sm:text-left">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-80">Final Assessment Outcome</span>
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="text-2xl font-black">
                        {scorecardData.result.isPassing ? 'PASSED' : 'NEEDS IMPROVEMENT'}
                      </span>
                      {scorecardData.result.isPassing ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      ) : (
                        <X className="w-6 h-6 text-rose-600" />
                      )}
                    </div>
                    <p className="text-xs opacity-75">
                      Passing Requirement: {scorecardData.passingMarks} / {scorecardData.totalMarks} Marks
                    </p>
                  </div>

                  <div className="text-center sm:text-right bg-white/80 p-3 rounded-xl border border-white/60 shadow-2xs min-w-[130px]">
                    <div className="text-3xl font-black tracking-tight text-slate-900">
                      {scorecardData.result.score}
                      <span className="text-sm font-semibold text-slate-500"> / {scorecardData.totalMarks}</span>
                    </div>
                    <div className="text-xs font-bold text-slate-700 mt-0.5">
                      {scorecardData.result.percentage.toFixed(1)}% Score
                    </div>
                  </div>
                </div>

                {/* Detailed Breakdown Statistics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                    <div className="text-[11px] text-slate-500 font-medium">Total Questions</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      {scorecardData.result.totalQuestions}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                    <div className="text-[11px] text-slate-500 font-medium">Attempted</div>
                    <div className="text-lg font-bold text-purple-700 mt-0.5">
                      {scorecardData.result.attemptedQuestions}
                    </div>
                  </div>
                  <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 text-center">
                    <div className="text-[11px] text-emerald-700 font-medium">Correct Answers</div>
                    <div className="text-lg font-bold text-emerald-700 mt-0.5">
                      {scorecardData.result.correctAnswers}
                    </div>
                  </div>
                  <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100 text-center">
                    <div className="text-[11px] text-rose-700 font-medium">Incorrect Answers</div>
                    <div className="text-lg font-bold text-rose-700 mt-0.5">
                      {scorecardData.result.incorrectAnswers}
                    </div>
                  </div>
                </div>

                {/* Submission & Timing Meta */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span>
                        Attempt Lifecycle Status:{' '}
                        <strong className="text-slate-800">
                          {scorecardData.attemptStatus === AttemptStatus.TIMED_OUT
                            ? 'Auto-Submitted (Timed Out)'
                            : 'Submitted by Student'}
                        </strong>
                      </span>
                    </span>
                    {scorecardData.result.submittedAt && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>Submitted: {new Date(scorecardData.result.submittedAt).toLocaleString()}</span>
                      </span>
                    )}
                  </div>
                  <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 text-[11px] text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      Official institutional report. In accordance with examination privacy policies, individual question
                      answer keys are not published.
                    </span>
                  </div>
                </div>

                {/* Modal Footer Controls */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (scorecardData) {
                        setLeaderboardAssessment({
                          id: scorecardData.assessmentId,
                          title: scorecardData.title,
                          subject: scorecardData.subject,
                          totalMarks: scorecardData.totalMarks,
                        });
                      }
                    }}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>View Leaderboard</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseScorecard}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs"
                  >
                    Back to History
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {leaderboardAssessment && currentStudent && (
        <ExaminationLeaderboardModal
          isOpen={!!leaderboardAssessment}
          onClose={() => setLeaderboardAssessment(null)}
          assessmentId={leaderboardAssessment.id}
          assessmentTitle={leaderboardAssessment.title}
          subject={leaderboardAssessment.subject}
          totalMarks={leaderboardAssessment.totalMarks}
          userRole="PARENT"
          studentId={currentStudent.id}
          targetStudentName={`${currentStudent.firstName} ${currentStudent.lastName}`}
        />
      )}
    </div>
  );
};

export default ParentExaminationResultsView;
