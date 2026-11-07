import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Eye,
  Clock,
  Award,
  Users,
  GraduationCap,
  AlertCircle,
  RefreshCw,
  X,
  Lock,
  BarChart3,
  BookOpen,
  Trophy,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { ExaminationLeaderboardModal } from './ExaminationLeaderboardModal';
import {
  examinationApi,
  AssessmentDraft,
  AssessmentStatus,
  AssessmentMode,
} from '../services/examination.api';
import {
  teachersApi,
  academicsApi,
  Teacher,
  GradeClass,
} from '../services/api';

export const SchoolAdminExaminationMonitoringView: React.FC = () => {
  // ---------------------------------------------------------------------------
  // State: Data
  // ---------------------------------------------------------------------------
  const [assessments, setAssessments] = useState<AssessmentDraft[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);

  // ---------------------------------------------------------------------------
  // State: UI & Filters
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<'assessments' | 'teachers' | 'distribution'>('assessments');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [teacherFilter, setTeacherFilter] = useState<string>('ALL');

  // Modal: Read-Only Inspection Modal
  const [inspectingAssessment, setInspectingAssessment] = useState<AssessmentDraft | null>(null);
  const [leaderboardAssessment, setLeaderboardAssessment] = useState<AssessmentDraft | null>(null);

  // Privacy Settings State
  const [showStudentNames, setShowStudentNames] = useState<boolean>(false);
  const [isLoadingPrivacy, setIsLoadingPrivacy] = useState<boolean>(true);
  const [isSavingPrivacy, setIsSavingPrivacy] = useState<boolean>(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacySuccess, setPrivacySuccess] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const loadPrivacySetting = useCallback(async () => {
    setIsLoadingPrivacy(true);
    setPrivacyError(null);
    try {
      const setting = await examinationApi.getLeaderboardPrivacySetting();
      setShowStudentNames(setting.showStudentNamesOnLeaderboards);
    } catch (err: any) {
      console.error('Failed to load leaderboard privacy setting', err);
      setPrivacyError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to load leaderboard privacy settings.',
      );
    } finally {
      setIsLoadingPrivacy(false);
    }
  }, []);

  const handleTogglePrivacy = async (newValue: boolean) => {
    if (isSavingPrivacy) return; // Prevent duplicate submission
    setIsSavingPrivacy(true);
    setPrivacyError(null);
    setPrivacySuccess(null);
    try {
      const updated = await examinationApi.updateLeaderboardPrivacySetting({
        showStudentNamesOnLeaderboards: newValue,
      });
      setShowStudentNames(updated.showStudentNamesOnLeaderboards);
      setPrivacySuccess(
        updated.showStudentNamesOnLeaderboards
          ? 'Privacy setting updated: Student names will now appear on student and parent leaderboards.'
          : 'Privacy setting updated: Student names will now be masked (e.g. Participant #1) on student and parent leaderboards.',
      );
    } catch (err: any) {
      console.error('Failed to update leaderboard privacy setting', err);
      setPrivacyError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to update leaderboard privacy setting.',
      );
    } finally {
      setIsSavingPrivacy(false);
    }
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      loadPrivacySetting();
      const [assessmentsRes, teachersRes, gradesRes] = await Promise.all([
        examinationApi.listAssessments().catch((err) => {
          console.error('Failed to list school assessments', err);
          return [] as AssessmentDraft[];
        }),
        teachersApi.getTeachers({ limit: 100 }).catch((err) => {
          console.error('Failed to list school teachers', err);
          return { data: [] as Teacher[] };
        }),
        academicsApi.getGrades().catch((err) => {
          console.error('Failed to list grades', err);
          return [] as GradeClass[];
        }),
      ]);

      setAssessments(assessmentsRes || []);
      setTeachers(teachersRes?.data || []);
      setGrades(gradesRes || []);
    } catch (err: any) {
      console.error('Error loading school examination monitoring data', err);
      setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to load examination monitoring data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Lookups & Helpers
  // ---------------------------------------------------------------------------
  const getTeacherName = (teacherId: string) => {
    const t = teachers.find((item) => item.id === teacherId);
    if (!t) return 'Unknown Faculty';
    return `${t.firstName} ${t.lastName} (${t.employeeId})`;
  };

  const getGradeName = (gradeId: string) => {
    const g = grades.find((item) => item.id === gradeId);
    return g ? g.name : 'Unknown Grade';
  };

  const getSectionName = (gradeId: string, sectionId: string | null) => {
    if (!sectionId) return 'All Sections (Grade-wide)';
    const g = grades.find((item) => item.id === gradeId);
    const s = g?.sections?.find((sec) => sec.id === sectionId);
    return s ? `Section ${s.name}` : 'Specific Section';
  };

  // ---------------------------------------------------------------------------
  // Statistics & Aggregations
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    const total = assessments.length;
    const drafts = assessments.filter((a) => a.status === AssessmentStatus.DRAFT).length;
    const published = assessments.filter((a) => a.status === AssessmentStatus.PUBLISHED).length;
    const closed = assessments.filter((a) => a.status === AssessmentStatus.CLOSED).length;
    const released = assessments.filter((a) => a.status === AssessmentStatus.RESULTS_RELEASED).length;

    // Distinct teachers who authored at least one assessment
    const authoringTeacherIds = new Set(assessments.map((a) => a.teacherId));
    const activeFacultyCount = authoringTeacherIds.size;

    return {
      total,
      drafts,
      published,
      closed,
      released,
      activeFacultyCount,
      totalTeachersCount: teachers.length,
    };
  }, [assessments, teachers]);

  // Teacher-wise breakdown
  const teacherStats = useMemo(() => {
    return teachers.map((t) => {
      const teacherAssessments = assessments.filter((a) => a.teacherId === t.id);
      const drafts = teacherAssessments.filter((a) => a.status === AssessmentStatus.DRAFT).length;
      const published = teacherAssessments.filter((a) => a.status === AssessmentStatus.PUBLISHED).length;
      const closed = teacherAssessments.filter((a) => a.status === AssessmentStatus.CLOSED).length;
      const released = teacherAssessments.filter((a) => a.status === AssessmentStatus.RESULTS_RELEASED).length;
      return {
        teacher: t,
        total: teacherAssessments.length,
        drafts,
        published,
        closed,
        released,
      };
    }).sort((a, b) => b.total - a.total);
  }, [teachers, assessments]);

  // Class-wise breakdown
  const classStats = useMemo(() => {
    return grades.map((g) => {
      const gradeAssessments = assessments.filter((a) => a.gradeId === g.id);
      return {
        grade: g,
        count: gradeAssessments.length,
        published: gradeAssessments.filter((a) => a.status === AssessmentStatus.PUBLISHED).length,
        released: gradeAssessments.filter((a) => a.status === AssessmentStatus.RESULTS_RELEASED).length,
      };
    });
  }, [grades, assessments]);

  // Subject-wise breakdown
  const subjectStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assessments) {
      const count = map.get(a.subject) || 0;
      map.set(a.subject, count + 1);
    }
    return Array.from(map.entries()).map(([subject, count]) => ({ subject, count }));
  }, [assessments]);

  // Filtered Assessments
  const filteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = a.title.toLowerCase().includes(q);
        const matchesSubject = a.subject.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubject) return false;
      }
      // Status
      if (statusFilter !== 'ALL' && a.status !== statusFilter) {
        return false;
      }
      // Grade
      if (gradeFilter !== 'ALL' && a.gradeId !== gradeFilter) {
        return false;
      }
      // Teacher
      if (teacherFilter !== 'ALL' && a.teacherId !== teacherFilter) {
        return false;
      }
      return true;
    });
  }, [assessments, searchQuery, statusFilter, gradeFilter, teacherFilter]);

  // Status Badge Helper
  const renderStatusBadge = (status: AssessmentStatus) => {
    switch (status) {
      case AssessmentStatus.DRAFT:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Draft
          </span>
        );
      case AssessmentStatus.PUBLISHED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Published
          </span>
        );
      case AssessmentStatus.CLOSED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="w-3 h-3 text-slate-500" />
            Closed
          </span>
        );
      case AssessmentStatus.RESULTS_RELEASED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Award className="w-3 h-3 text-indigo-600" />
            Results Released
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  // ---------------------------------------------------------------------------
  // Render Loading State
  // ---------------------------------------------------------------------------
  if (isLoading && assessments.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-xs">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
        <h3 className="text-base font-bold text-slate-800">Loading School Examination Monitoring...</h3>
        <p className="text-xs text-slate-500">Aggregating assessment activity, teacher participation, and lifecycle metrics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* 1. Header & Oversight Banner                                        */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">School Examination Monitoring</h3>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
              Administrative Oversight
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Institutional inspection of assessment lifecycles, faculty authoring activity, and result release progress.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            title="Refresh Monitoring Data"
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors text-xs flex items-center gap-1.5 shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-rose-100 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 2. KPI Metrics Grid                                                 */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-400 block">Total Assessments</span>
          <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">School-wide</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-amber-200/60 shadow-2xs bg-amber-50/20">
          <span className="text-[11px] font-medium text-amber-700 block">Drafts</span>
          <span className="text-2xl font-bold text-amber-900">{stats.drafts}</span>
          <span className="text-[10px] text-amber-600 block mt-0.5">In preparation</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-emerald-200/60 shadow-2xs bg-emerald-50/20">
          <span className="text-[11px] font-medium text-emerald-700 block">Published</span>
          <span className="text-2xl font-bold text-emerald-900">{stats.published}</span>
          <span className="text-[10px] text-emerald-600 block mt-0.5">Active testing</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Closed</span>
          <span className="text-2xl font-bold text-slate-800">{stats.closed}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Windows ended</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-indigo-200/60 shadow-2xs bg-indigo-50/20">
          <span className="text-[11px] font-medium text-indigo-700 block">Results Released</span>
          <span className="text-2xl font-bold text-indigo-900">{stats.released}</span>
          <span className="text-[10px] text-indigo-600 block mt-0.5">Official scorecards</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-purple-200/60 shadow-2xs bg-purple-50/20">
          <span className="text-[11px] font-medium text-purple-700 block">Active Faculty</span>
          <span className="text-2xl font-bold text-purple-900">{stats.activeFacultyCount}</span>
          <span className="text-[10px] text-purple-600 block mt-0.5">of {stats.totalTeachersCount} teachers</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 3. Telemetry Notice & Backend Gap Clarification                     */}
      {/* ------------------------------------------------------------------- */}
      <div className="p-4 bg-blue-50/70 border border-blue-200 text-blue-900 rounded-2xl text-xs flex items-start gap-3">
        <BarChart3 className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold">Student Participation & Completion Telemetry</span>
            <span className="px-2 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-300 rounded-full">
              Analytics API Contract Proposed
            </span>
          </div>
          <p className="text-[11px] text-blue-800 leading-relaxed">
            In compliance with statistical safety invariants, student participation and completion percentages are not estimated
            in the frontend without an authoritative eligible-student denominator from the backend. A dedicated administrative
            endpoint (<code className="font-mono bg-blue-100/70 px-1 rounded">GET /api/v1/examination/admin/assessments/:id/analytics</code>)
            is proposed in Phase 4 Task P4-09B-2A to deliver verified attempt counts, completion rates, and average score distributions.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 4. Leaderboard Privacy Settings Section                             */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100 shrink-0">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">Leaderboard Privacy Settings</h4>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
                  School Admin Authority
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure student identity visibility across student and parent examination rankings.
              </p>
            </div>
          </div>

          {/* Toggle Switch & Status */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs font-bold text-slate-800 block">
                Show Student Names
              </span>
              <span className="text-[11px] text-slate-500">
                {isLoadingPrivacy
                  ? 'Loading setting...'
                  : showStudentNames
                  ? 'Status: Visible'
                  : 'Status: Masked'}
              </span>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={showStudentNames}
              aria-label="Toggle Show Student Names"
              disabled={isLoadingPrivacy || isSavingPrivacy}
              onClick={() => handleTogglePrivacy(!showStudentNames)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                showStudentNames ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  showStudentNames ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Current status indicator & Explanation Note */}
        <div className="p-3.5 rounded-xl border text-xs space-y-1.5 bg-slate-50/80 border-slate-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Current Policy:</span>
            {showStudentNames ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Student names visible on student and parent leaderboards</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                <span>Student names masked on student and parent leaderboards (e.g. Participant #1, Participant #2)</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            When OFF (default), students and parents only see their own identity, while peers appear as anonymous participant numbers.
            When ON, peer student names are displayed transparently to students and parents.
            Educators (Teachers and Administrators) always retain access to full identifiable student rosters for authorized classes.
          </p>
        </div>

        {/* Feedback Alerts */}
        {isSavingPrivacy && (
          <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Saving privacy setting to server...</span>
          </div>
        )}

        {privacySuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{privacySuccess}</span>
            </div>
            <button
              onClick={() => setPrivacySuccess(null)}
              className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {privacyError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{privacyError}</span>
            </div>
            <button
              onClick={() => setPrivacyError(null)}
              className="p-1 hover:bg-rose-100 rounded-lg text-rose-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 5. Tab Navigation: Assessments vs Faculty vs Distribution           */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('assessments')}
          className={`pb-3 px-1 text-xs font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'assessments'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>All Assessments ({assessments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('teachers')}
          className={`pb-3 px-1 text-xs font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'teachers'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Teacher Activity ({teachers.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('distribution')}
          className={`pb-3 px-1 text-xs font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'distribution'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Class & Subject Distribution</span>
        </button>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Tab 1: Assessments Oversight Table                                  */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'assessments' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search assessment title or subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Status Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 font-medium">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by Status"
                  className="bg-transparent text-slate-700 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value={AssessmentStatus.DRAFT}>Drafts Only</option>
                  <option value={AssessmentStatus.PUBLISHED}>Published</option>
                  <option value={AssessmentStatus.CLOSED}>Closed</option>
                  <option value={AssessmentStatus.RESULTS_RELEASED}>Results Released</option>
                </select>
              </div>

              {/* Grade Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                <Filter className="w-3 h-3 text-slate-400" />
                <span className="text-[11px] text-slate-500 font-medium">Grade:</span>
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  aria-label="Filter by Grade"
                  className="bg-transparent text-slate-700 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Grades</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Teacher Filter */}
              {teacherFilter !== 'ALL' && (
                <div className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded-xl border border-purple-200 text-[11px] font-semibold">
                  <span>Faculty Filter Active</span>
                  <button
                    onClick={() => setTeacherFilter('ALL')}
                    className="hover:bg-purple-100 rounded-md p-0.5 ml-1"
                    title="Clear faculty filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          {filteredAssessments.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-md mx-auto my-8 space-y-3 shadow-2xs">
              <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">No Assessments Match Filters</h4>
              <p className="text-xs text-slate-500">
                Adjust the status, grade, or search filters to monitor school examination activity.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Title & Subject</th>
                      <th className="py-3 px-4">Authoring Faculty</th>
                      <th className="py-3 px-4">Class & Section</th>
                      <th className="py-3 px-4">Mode</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Marks</th>
                      <th className="py-3 px-4 text-center">Duration</th>
                      <th className="py-3 px-4">Result Status</th>
                      <th className="py-3 px-4 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredAssessments.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 block">{a.title}</span>
                          <span className="text-[11px] text-indigo-600 font-semibold">{a.subject}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-slate-800 font-medium block">{getTeacherName(a.teacherId)}</span>
                          <span className="text-[10px] text-slate-400 font-mono">ID: {a.teacherId.slice(0, 8)}...</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-slate-800 font-medium block">{getGradeName(a.gradeId)}</span>
                          <span className="text-[11px] text-slate-500">{getSectionName(a.gradeId, a.sectionId)}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${
                              a.mode === AssessmentMode.LIVE_EXAM
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {a.mode === AssessmentMode.LIVE_EXAM ? 'Live Exam' : 'Normal Quiz'}
                          </span>
                        </td>
                        <td className="py-3 px-4">{renderStatusBadge(a.status)}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                          {a.passingMarks} / {a.totalMarks}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-600">
                          {a.durationMinutes} min
                        </td>
                        <td className="py-3 px-4">
                          {a.status === AssessmentStatus.RESULTS_RELEASED ? (
                            <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                              <Award className="w-3 h-3 text-emerald-600" />
                              Released
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Unreleased / Incomplete</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {a.status === AssessmentStatus.RESULTS_RELEASED && (
                              <button
                                onClick={() => setLeaderboardAssessment(a)}
                                className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded-lg transition-colors inline-flex items-center gap-1 font-semibold"
                                title="View Assessment Leaderboard"
                              >
                                <Trophy className="w-4 h-4 text-amber-600" />
                                <span>Leaderboard</span>
                              </button>
                            )}
                            <button
                              onClick={() => setInspectingAssessment(a)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center gap-1 font-semibold"
                              title="Inspect Assessment (Read-Only)"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Inspect</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Tab 2: Teacher-Wise Assessment Activity                             */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'teachers' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Faculty Examination Activity</h4>
              <p className="text-xs text-slate-500">Distribution of authored assessments by teacher.</p>
            </div>
            <span className="text-xs font-semibold text-slate-400">Total Teachers: {teachers.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Teacher Name</th>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4 text-center">Total Authored</th>
                  <th className="py-3 px-4 text-center">Drafts</th>
                  <th className="py-3 px-4 text-center">Published</th>
                  <th className="py-3 px-4 text-center">Released</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {teacherStats.map(({ teacher, total, drafts, published, released }) => (
                  <tr key={teacher.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {teacher.firstName} {teacher.lastName}
                    </td>
                    <td className="py-3 px-4 font-mono text-purple-700">{teacher.employeeId}</td>
                    <td className="py-3 px-4 text-slate-600">{teacher.department || 'General'}</td>
                    <td className="py-3 px-4 text-center font-bold text-slate-800 text-sm">{total}</td>
                    <td className="py-3 px-4 text-center text-amber-700 font-medium">{drafts}</td>
                    <td className="py-3 px-4 text-center text-emerald-700 font-medium">{published}</td>
                    <td className="py-3 px-4 text-center text-indigo-700 font-medium">{released}</td>
                    <td className="py-3 px-4 text-right">
                      {total > 0 ? (
                        <button
                          onClick={() => {
                            setTeacherFilter(teacher.id);
                            setActiveTab('assessments');
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          View Tests ({total})
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">No Tests Authored</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Tab 3: Class & Subject Distribution                                 */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'distribution' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Class-wise Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-600" />
              <h4 className="text-sm font-bold text-slate-900">Class & Grade Distribution</h4>
            </div>
            <div className="space-y-2">
              {classStats.map(({ grade, count, published, released }) => (
                <div
                  key={grade.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800 block">{grade.name}</span>
                    <span className="text-[11px] text-slate-400">Code: {grade.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-slate-500">Total: <strong className="text-slate-800">{count}</strong></span>
                    <span className="text-emerald-700">Published: <strong>{published}</strong></span>
                    <span className="text-indigo-700">Released: <strong>{released}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subject-wise Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <h4 className="text-sm font-bold text-slate-900">Subject Distribution</h4>
            </div>
            <div className="space-y-2">
              {subjectStats.length === 0 ? (
                <p className="text-xs text-slate-400">No subjects currently assigned to assessments.</p>
              ) : (
                subjectStats.map(({ subject, count }) => (
                  <div
                    key={subject}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <span className="font-bold text-slate-800">{subject}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                      {count} {count === 1 ? 'assessment' : 'assessments'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal: Read-Only Assessment Details Inspection                      */}
      {/* ------------------------------------------------------------------- */}
      {inspectingAssessment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">
                  Administrative Inspection
                </span>
                <h3 className="text-base font-bold">{inspectingAssessment.title}</h3>
              </div>
              <button
                onClick={() => setInspectingAssessment(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Lifecycle Status:</span>
                {renderStatusBadge(inspectingAssessment.status)}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 text-slate-500 mt-0.5" />
                <div>
                  <span className="font-bold block text-slate-900">Read-Only Administrative View</span>
                  <span className="text-[11px] text-slate-500">
                    Question authoring and draft modifications are reserved exclusively for designated faculty members.
                    This administrative screen provides read-only oversight.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Authoring Faculty</span>
                  <span className="font-semibold text-slate-800">
                    {getTeacherName(inspectingAssessment.teacherId)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Subject</span>
                  <span className="font-semibold text-slate-800">{inspectingAssessment.subject}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Class & Section</span>
                  <span className="font-semibold text-slate-800">
                    {getGradeName(inspectingAssessment.gradeId)} • {getSectionName(inspectingAssessment.gradeId, inspectingAssessment.sectionId)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Assessment Mode</span>
                  <span className="font-semibold text-slate-800">
                    {inspectingAssessment.mode === AssessmentMode.LIVE_EXAM ? 'Live Synchronous Exam' : 'Normal Flexible Quiz'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Passing / Total Marks</span>
                  <span className="font-semibold text-slate-800">
                    {inspectingAssessment.passingMarks} / {inspectingAssessment.totalMarks} Marks
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Duration</span>
                  <span className="font-semibold text-slate-800">{inspectingAssessment.durationMinutes} Minutes</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Start Window</span>
                  <span className="font-semibold text-slate-800">
                    {inspectingAssessment.startWindowAt
                      ? new Date(inspectingAssessment.startWindowAt).toLocaleString()
                      : 'Flexible / Unscheduled'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">End Window</span>
                  <span className="font-semibold text-slate-800">
                    {inspectingAssessment.endWindowAt
                      ? new Date(inspectingAssessment.endWindowAt).toLocaleString()
                      : 'Flexible / Unscheduled'}
                  </span>
                </div>
              </div>

              {inspectingAssessment.description && (
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Instructions / Description</span>
                  <p className="text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 whitespace-pre-wrap">
                    {inspectingAssessment.description}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                <span>Assessment ID: {inspectingAssessment.id}</span>
                <span>Created: {new Date(inspectingAssessment.createdAt).toLocaleDateString()}</span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setInspectingAssessment(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-colors"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Inspection Modal */}
      {leaderboardAssessment && (
        <ExaminationLeaderboardModal
          isOpen={!!leaderboardAssessment}
          onClose={() => setLeaderboardAssessment(null)}
          assessmentId={leaderboardAssessment.id}
          assessmentTitle={leaderboardAssessment.title}
          subject={leaderboardAssessment.subject}
          totalMarks={leaderboardAssessment.totalMarks}
          userRole="SCHOOL_ADMIN"
        />
      )}
    </div>
  );
};

export default SchoolAdminExaminationMonitoringView;
