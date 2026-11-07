import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Globe,
  Building2,
  FileSpreadsheet,
  Search,
  Award,
  Clock,
  RefreshCw,
  Eye,
  X,
  AlertCircle,
  ShieldCheck,
  Lock,
  Trophy,
} from 'lucide-react';
import {
  examinationApi,
  AssessmentDraft,
  AssessmentStatus,
  AssessmentMode,
  type PlatformLeaderboardMetrics,
} from '../services/examination.api';
import { useOptionalAuth } from '../context/AuthContext';
import { schoolsApi, SchoolRecord, setActiveSchoolId } from '../services/api';

export const PlatformSuperAdminExaminationMonitoringView: React.FC = () => {
  const authContext = useOptionalAuth();
  const [localSchools, setLocalSchools] = useState<SchoolRecord[]>([]);
  const [localSelectedSchoolId, setLocalSelectedSchoolId] = useState<string>('');

  // Synchronize with AuthContext when available, or fall back to self-contained list
  const schools = authContext?.availableSchools?.length ? authContext.availableSchools : localSchools;
  const selectedSchoolId = authContext?.selectedSchoolId || localSelectedSchoolId;
  const isLoadingSchools = authContext ? authContext.organizationContextLoading : false;

  useEffect(() => {
    // If running outside full AuthProvider (e.g. In unit tests), load schools fallback
    if (!authContext?.availableSchools?.length) {
      schoolsApi
        .list({ limit: 100 })
        .then((res) => {
          const list = res?.data || [];
          setLocalSchools(list);
          if (list.length > 0 && !localSelectedSchoolId) {
            setLocalSelectedSchoolId(list[0].id);
            setActiveSchoolId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [authContext, localSelectedSchoolId]);

  // ---------------------------------------------------------------------------
  // State: Data
  // ---------------------------------------------------------------------------
  const [assessments, setAssessments] = useState<AssessmentDraft[]>([]);

  // ---------------------------------------------------------------------------
  // State: UI & Status
  // ---------------------------------------------------------------------------
  const [isLoadingAssessments, setIsLoadingAssessments] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal: Read-only Assessment Inspection
  const [inspectingAssessment, setInspectingAssessment] = useState<AssessmentDraft | null>(null);

  // Platform Aggregate Leaderboard Metrics
  const [platformMetrics, setPlatformMetrics] = useState<PlatformLeaderboardMetrics | null>(null);
  const [isLoadingPlatformMetrics, setIsLoadingPlatformMetrics] = useState<boolean>(true);
  const [platformMetricsError, setPlatformMetricsError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching: 0. Platform Leaderboard Metrics
  // ---------------------------------------------------------------------------
  const loadPlatformMetrics = useCallback(async () => {
    setIsLoadingPlatformMetrics(true);
    setPlatformMetricsError(null);
    try {
      const res = await examinationApi.getPlatformLeaderboardMetrics();
      setPlatformMetrics(res);
    } catch (err: any) {
      console.error('Failed to load platform leaderboard metrics', err);
      setPlatformMetricsError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to load platform leaderboard metrics.',
      );
    } finally {
      setIsLoadingPlatformMetrics(false);
    }
  }, []);

  useEffect(() => {
    loadPlatformMetrics();
  }, [loadPlatformMetrics]);

  // ---------------------------------------------------------------------------
  // Data Fetching: 1. Tenant-Scoped Assessments for Central Selected School
  // ---------------------------------------------------------------------------
  const loadSchoolAssessments = useCallback(async (schoolId?: string | null) => {
    if (!schoolId) {
      setAssessments([]);
      return;
    }
    setIsLoadingAssessments(true);
    setErrorMessage(null);
    try {
      setActiveSchoolId(schoolId);
      const res = await examinationApi.listAssessments();
      setAssessments(res || []);
    } catch (err: any) {
      console.error('Failed to load assessments for school', err);
      setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to load school assessments.');
      setAssessments([]);
    } finally {
      setIsLoadingAssessments(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSchoolId) {
      loadSchoolAssessments(selectedSchoolId);
    }
  }, [selectedSchoolId, loadSchoolAssessments]);

  // ---------------------------------------------------------------------------
  // Selected School Record
  // ---------------------------------------------------------------------------
  const selectedSchool = useMemo(() => {
    return schools.find((s) => s.id === selectedSchoolId) || null;
  }, [schools, selectedSchoolId]);

  // ---------------------------------------------------------------------------
  // Computed Metrics
  // ---------------------------------------------------------------------------
  const metrics = useMemo(() => {
    const totalSchools = schools.length;
    const selectedTotal = assessments.length;
    const selectedDrafts = assessments.filter((a) => a.status === AssessmentStatus.DRAFT).length;
    const selectedPublished = assessments.filter((a) => a.status === AssessmentStatus.PUBLISHED).length;
    const selectedClosed = assessments.filter((a) => a.status === AssessmentStatus.CLOSED).length;
    const selectedReleased = assessments.filter((a) => a.status === AssessmentStatus.RESULTS_RELEASED).length;
    const liveExams = assessments.filter((a) => a.mode === AssessmentMode.LIVE_EXAM).length;
    const normalQuizzes = assessments.filter((a) => a.mode === AssessmentMode.NORMAL_QUIZ).length;

    return {
      totalSchools,
      selectedTotal,
      selectedDrafts,
      selectedPublished,
      selectedClosed,
      selectedReleased,
      liveExams,
      normalQuizzes,
    };
  }, [schools, assessments]);

  const filteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = a.title.toLowerCase().includes(q);
        const matchesSubject = a.subject.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubject) return false;
      }
      if (statusFilter !== 'ALL' && a.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [assessments, searchQuery, statusFilter]);

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

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* 1. Header & Platform Scope                                          */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Platform Examination Telemetry</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                  Super Admin Monitoring
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cross-tenant examination activity, multi-school adoption metrics, and centralized test lifecycle telemetry.
              </p>
            </div>
          </div>
        </div>

        {/* Tenant Scope Selector (Synchronized with AuthContext) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <Building2 className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] text-slate-500 font-medium">Target School:</span>
            <select
              value={selectedSchoolId || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  if (authContext?.selectSchool) {
                    authContext.selectSchool(val);
                  } else {
                    setLocalSelectedSchoolId(val);
                    setActiveSchoolId(val);
                  }
                }
              }}
              aria-label="Target School"
              disabled={isLoadingSchools || schools.length === 0}
              className="bg-transparent text-slate-800 text-xs font-bold focus:outline-none cursor-pointer max-w-xs truncate"
            >
              <option value="" disabled>-- Select School --</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id} disabled={s.status !== 'ACTIVE'}>
                  {s.name} ({s.code}) {s.status !== 'ACTIVE' ? `[${s.status}]` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => loadSchoolAssessments(selectedSchoolId)}
            title="Refresh School Data"
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors text-xs flex items-center gap-1 shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingAssessments ? 'animate-spin text-indigo-600' : ''}`} />
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
      {/* 2. Platform Adoption & KPI Metrics                                  */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-400 block">Total Schools</span>
          <span className="text-2xl font-bold text-slate-800">{metrics.totalSchools}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Platform Tenants</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-400 block">Tests in Selected</span>
          <span className="text-2xl font-bold text-slate-800">{metrics.selectedTotal}</span>
          <span className="text-[10px] text-indigo-600 font-semibold block mt-0.5 truncate">{selectedSchool?.name || 'Selected'}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-amber-200/60 shadow-2xs bg-amber-50/20">
          <span className="text-[11px] font-medium text-amber-700 block">Drafts</span>
          <span className="text-2xl font-bold text-amber-900">{metrics.selectedDrafts}</span>
          <span className="text-[10px] text-amber-600 block mt-0.5">In Authoring</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-emerald-200/60 shadow-2xs bg-emerald-50/20">
          <span className="text-[11px] font-medium text-emerald-700 block">Published</span>
          <span className="text-2xl font-bold text-emerald-900">{metrics.selectedPublished}</span>
          <span className="text-[10px] text-emerald-600 block mt-0.5">Active Exams</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-indigo-200/60 shadow-2xs bg-indigo-50/20">
          <span className="text-[11px] font-medium text-indigo-700 block">Results Released</span>
          <span className="text-2xl font-bold text-indigo-900">{metrics.selectedReleased}</span>
          <span className="text-[10px] text-indigo-600 block mt-0.5">Scored & Finalized</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-purple-200/60 shadow-2xs bg-purple-50/20">
          <span className="text-[11px] font-medium text-purple-700 block">Synchronous Live</span>
          <span className="text-2xl font-bold text-purple-900">{metrics.liveExams}</span>
          <span className="text-[10px] text-purple-600 block mt-0.5">vs {metrics.normalQuizzes} Quizzes</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 3. Platform Leaderboard Telemetry & Privacy Adoption                */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-2xl border border-amber-200/60 shadow-2xs">
              <Trophy className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">
                  Cross-Tenant Leaderboard Adoption & Privacy
                </h4>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                  Aggregate Telemetry
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-tenant examination leaderboard utilization and institutional student identity privacy distribution.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadPlatformMetrics}
            className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors text-xs flex items-center gap-1 shadow-2xs self-start sm:self-auto"
            title="Refresh Platform Metrics"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoadingPlatformMetrics ? 'animate-spin text-indigo-600' : ''
              }`}
            />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        {platformMetricsError ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{platformMetricsError}</span>
          </div>
        ) : isLoadingPlatformMetrics ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : platformMetrics ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Schools Reporting
              </span>
              <span className="text-xl font-bold text-slate-900 mt-0.5 block">
                {platformMetrics.totalSchoolsReporting}
              </span>
              <span className="text-[10px] text-slate-400">With published exams</span>
            </div>
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider block">
                Released Exams
              </span>
              <span className="text-xl font-bold text-indigo-900 mt-0.5 block">
                {platformMetrics.totalReleasedAssessments}
              </span>
              <span className="text-[10px] text-slate-400">Official standings</span>
            </div>
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider block">
                Persisted Results
              </span>
              <span className="text-xl font-bold text-emerald-900 mt-0.5 block">
                {platformMetrics.totalEligibleResults}
              </span>
              <span className="text-[10px] text-slate-400">Scored student attempts</span>
            </div>
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider block">
                Names Visible
              </span>
              <span className="text-xl font-bold text-teal-900 mt-0.5 block">
                {platformMetrics.schoolsWithNamesVisibleCount}
              </span>
              <span className="text-[10px] text-teal-600">Transparent mode</span>
            </div>
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">
                Names Masked
              </span>
              <span className="text-xl font-bold text-amber-900 mt-0.5 block">
                {platformMetrics.schoolsWithNamesMaskedCount}
              </span>
              <span className="text-[10px] text-amber-700">Privacy default mode</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 4. Tenant Isolation & Telemetry Invariant Assurance                 */}
      {/* ------------------------------------------------------------------- */}
      <div className="p-4 bg-slate-900 text-white rounded-3xl shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h4 className="text-sm font-bold tracking-tight">Tenant Boundary & Telemetry Integrity</h4>
          </div>
          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
            Header Isolation Active
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Super administrator queries explicitly target one school at a time via the authoritative <code className="font-mono text-emerald-300">x-school-id</code> header,
          guaranteeing strict multi-tenant boundary compliance with backend <code className="font-mono text-emerald-300">TenantGuard</code> invariants.
          No cross-tenant data leakage is permitted.
        </p>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 4. Selected School Assessments Table                                */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs space-y-3 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Assessments in {selectedSchool?.name || 'Selected School'}
            </h4>
            <p className="text-xs text-slate-500 font-mono text-[11px]">
              School Code: {selectedSchool?.code} • Tenant ID: {selectedSchool?.id}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter title or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by Status"
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-xl focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value={AssessmentStatus.DRAFT}>Drafts Only</option>
              <option value={AssessmentStatus.PUBLISHED}>Published</option>
              <option value={AssessmentStatus.CLOSED}>Closed</option>
              <option value={AssessmentStatus.RESULTS_RELEASED}>Results Released</option>
            </select>
          </div>
        </div>

        {filteredAssessments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 space-y-1">
            <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No assessments found for this tenant.</p>
            <p>Faculty members at this school have not authored assessments matching the filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Title & Subject</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-center">Marks</th>
                  <th className="py-2.5 px-3 text-center">Duration</th>
                  <th className="py-2.5 px-3">Window</th>
                  <th className="py-2.5 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAssessments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-slate-900 block">{a.title}</span>
                      <span className="text-[11px] text-indigo-600 font-semibold">{a.subject}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${
                          a.mode === AssessmentMode.LIVE_EXAM
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {a.mode === AssessmentMode.LIVE_EXAM ? 'Live Exam' : 'Normal Quiz'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">{renderStatusBadge(a.status)}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                      {a.passingMarks} / {a.totalMarks}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600">{a.durationMinutes} min</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      {a.startWindowAt ? 'Scheduled Window' : 'Untimed Window'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setInspectingAssessment(a)}
                        className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center gap-1 font-semibold"
                        title="Inspect Assessment"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Modal: Read-Only Inspection Modal for Super Admin                   */}
      {/* ------------------------------------------------------------------- */}
      {inspectingAssessment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Platform Telemetry Inspection
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
                  <span className="font-bold block text-slate-900">Platform Super Admin Read-Only Mode</span>
                  <span className="text-[11px] text-slate-500">
                    Platform telemetry provides non-invasive institutional inspection. Authoring controls are restricted
                    to school faculty.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Subject</span>
                  <span className="font-semibold text-slate-800">{inspectingAssessment.subject}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Mode</span>
                  <span className="font-semibold text-slate-800">
                    {inspectingAssessment.mode === AssessmentMode.LIVE_EXAM ? 'Live Exam' : 'Normal Quiz'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Marks Criteria</span>
                  <span className="font-semibold text-slate-800">
                    Passing {inspectingAssessment.passingMarks} / Total {inspectingAssessment.totalMarks}
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
                      : 'Flexible'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">End Window</span>
                  <span className="font-semibold text-slate-800">
                    {inspectingAssessment.endWindowAt
                      ? new Date(inspectingAssessment.endWindowAt).toLocaleString()
                      : 'Flexible'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                <span>Assessment ID: {inspectingAssessment.id}</span>
                <span>Tenant: {inspectingAssessment.schoolId}</span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setInspectingAssessment(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformSuperAdminExaminationMonitoringView;
