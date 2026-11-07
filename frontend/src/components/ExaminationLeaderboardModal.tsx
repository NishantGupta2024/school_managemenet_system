import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trophy,
  Medal,
  Award,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  examinationApi,
  type LeaderboardResponse,
} from '../services/examination.api';

export interface ExaminationLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  assessmentTitle: string;
  subject?: string;
  totalMarks?: number;
  userRole: 'STUDENT' | 'PARENT' | 'TEACHER' | 'SCHOOL_ADMIN';
  studentId?: string; // Required for PARENT role
  targetStudentName?: string; // Optional label for PARENT role child
}

export const ExaminationLeaderboardModal: React.FC<ExaminationLeaderboardModalProps> = ({
  isOpen,
  onClose,
  assessmentId,
  assessmentTitle,
  subject,
  totalMarks,
  userRole,
  studentId,
  targetStudentName,
}) => {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [page, setPage] = useState<number>(1);
  const limit = 20;
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset page when assessmentId changes
  useEffect(() => {
    if (isOpen) {
      setPage(1);
    }
  }, [isOpen, assessmentId]);

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    if (!isOpen || !assessmentId) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      let res: LeaderboardResponse;

      if (userRole === 'STUDENT') {
        res = await examinationApi.getStudentLeaderboard(assessmentId, page, limit);
      } else if (userRole === 'PARENT') {
        if (!studentId) {
          throw new Error('Student identifier is required to view parent leaderboard.');
        }
        res = await examinationApi.getParentLeaderboard(studentId, assessmentId, page, limit);
      } else {
        // TEACHER or SCHOOL_ADMIN
        res = await examinationApi.getStaffLeaderboard(assessmentId, page, limit);
      }

      setData(res);
    } catch (err: any) {
      console.error('Failed to load assessment leaderboard', err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Unable to load examination leaderboard. Please ensure results have been published.';
      setErrorMessage(msg);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, assessmentId, userRole, studentId, page]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Check if any peer entry has masked format (e.g. Participant #)
  const isMaskedView = useMemo(() => {
    if (!data || !data.entries) return false;
    return data.entries.some(
      (entry) => !entry.isCurrentUser && entry.studentName.startsWith('Participant #'),
    );
  }, [data]);

  if (!isOpen) return null;

  // Rank badge styling helper
  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
          <Trophy className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
          <span>#1</span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800 border border-slate-300">
          <Medal className="w-3.5 h-3.5 text-slate-500" />
          <span>#2</span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
          <Medal className="w-3.5 h-3.5 text-amber-700" />
          <span>#3</span>
        </span>
      );
    }
    return (
      <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 min-w-7 text-center">
        #{rank}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leaderboard-modal-title"
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ----------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ----------------------------------------------------------------- */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100/70 text-amber-700 rounded-2xl border border-amber-200/60 shadow-2xs">
              <Trophy className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="leaderboard-modal-title" className="text-base font-bold text-slate-900 leading-tight">
                  {assessmentTitle}
                </h3>
                {subject && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                    {subject}
                  </span>
                )}
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  Official Standings
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Official examination leaderboard and comparative performance rankings.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            aria-label="Close Leaderboard Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Context & Privacy Banner                                          */}
        {/* ----------------------------------------------------------------- */}
        <div className="px-6 py-3 bg-slate-100/60 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <Users className="w-4 h-4 text-slate-400" />
              <span>Total Participants:</span>
              <strong className="text-slate-900 font-bold">
                {data ? data.totalParticipants : '—'}
              </strong>
            </div>

            {totalMarks !== undefined && (
              <div className="flex items-center gap-1 text-slate-500">
                <span>Max Marks:</span>
                <strong className="text-slate-800">{totalMarks}</strong>
              </div>
            )}
          </div>

          {/* Privacy Indicator Badge */}
          {userRole === 'TEACHER' || userRole === 'SCHOOL_ADMIN' ? (
            <div className="flex items-center gap-1 text-slate-600 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Educator Inspection (Identifiable Roster)</span>
            </div>
          ) : isMaskedView ? (
            <div className="flex items-center gap-1.5 text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Peer names masked per school privacy policy</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <Award className="w-3.5 h-3.5 text-emerald-600" />
              <span>Transparent Public Rankings</span>
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Modal Body / Table View                                           */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
          {isLoading ? (
            <div className="space-y-3 py-6">
              <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-medium pb-4">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading examination leaderboard...</span>
              </div>
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-slate-100 rounded-xl animate-pulse flex items-center px-4 justify-between"
                >
                  <div className="h-4 bg-slate-200 rounded w-12" />
                  <div className="h-4 bg-slate-200 rounded w-44" />
                  <div className="h-4 bg-slate-200 rounded w-16" />
                  <div className="h-4 bg-slate-200 rounded w-16" />
                </div>
              ))}
            </div>
          ) : errorMessage ? (
            <div className="p-8 text-center max-w-md mx-auto my-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Unable to Display Leaderboard</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{errorMessage}</p>
              <button
                type="button"
                onClick={fetchLeaderboard}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : !data || data.entries.length === 0 ? (
            <div className="p-12 text-center max-w-md mx-auto my-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
                <Trophy className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Leaderboard Standings Found</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                No evaluated and persisted assessment results are available for this examination yet.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-20 text-center">Rank</th>
                    <th className="py-3 px-4">Participant</th>
                    <th className="py-3 px-4 text-right">Score</th>
                    <th className="py-3 px-4 text-right">Percentage</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.entries.map((entry, idx) => {
                    const isSelf = entry.isCurrentUser;
                    return (
                      <tr
                        key={`${entry.rank}-${entry.studentName}-${idx}`}
                        className={`transition-colors ${
                          isSelf
                            ? 'bg-indigo-50/80 font-semibold border-l-4 border-l-indigo-600 text-indigo-950'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-3 px-4 text-center">
                          {renderRankBadge(entry.rank)}
                        </td>

                        {/* Student / Participant Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className={isSelf ? 'font-bold text-indigo-950' : 'text-slate-800'}>
                              {entry.studentName}
                            </span>
                            {isSelf && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full shadow-2xs">
                                {userRole === 'PARENT'
                                  ? targetStudentName
                                    ? `Child (${targetStudentName})`
                                    : 'Your Child'
                                  : 'You'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Score */}
                        <td className="py-3 px-4 text-right">
                          <span className="font-bold text-slate-900">
                            {entry.score}
                          </span>
                          {totalMarks !== undefined && (
                            <span className="text-[11px] text-slate-400 font-normal"> / {totalMarks}</span>
                          )}
                        </td>

                        {/* Percentage */}
                        <td className="py-3 px-4 text-right">
                          <span className="font-bold text-slate-800">
                            {Number(entry.percentage).toFixed(1)}%
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          {entry.isPassing ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Pass</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>Fail</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Footer & Pagination                                               */}
        {/* ----------------------------------------------------------------- */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            {data && data.pagination && data.pagination.totalCount > 0 ? (
              <span>
                Showing entries{' '}
                <strong className="text-slate-800">
                  {(data.pagination.page - 1) * data.pagination.limit + 1}
                </strong>{' '}
                to{' '}
                <strong className="text-slate-800">
                  {Math.min(
                    data.pagination.page * data.pagination.limit,
                    data.pagination.totalCount,
                  )}
                </strong>{' '}
                of <strong className="text-slate-800">{data.pagination.totalCount}</strong>
              </span>
            ) : (
              <span>Standings are ranked strictly by competition rules (ties share rank).</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading || !data || data.pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-slate-700 transition-colors flex items-center gap-1 shadow-2xs"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="px-3 py-1.5 text-slate-600 font-semibold bg-white rounded-xl border border-slate-200 shadow-2xs">
              Page {data?.pagination.page || 1} of {data?.pagination.totalPages || 1}
            </span>

            <button
              type="button"
              disabled={
                isLoading ||
                !data ||
                data.pagination.page >= data.pagination.totalPages
              }
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-slate-700 transition-colors flex items-center gap-1 shadow-2xs"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
