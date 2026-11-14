import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  X,
  AlertTriangle,
  Clock,
  User,
  Users,
  RefreshCw,
  Search,
  Lock,
} from 'lucide-react';
import examinationApi, {
  AssessmentDraft,
  AssessmentAttemptSummary,
  AttemptStatus,
} from '../services/examination.api';

interface AssessmentAttemptsModalProps {
  assessment: AssessmentDraft;
  onClose: () => void;
  onAuditAttempt: (attemptId: string) => void;
}

export const AssessmentAttemptsModal: React.FC<AssessmentAttemptsModalProps> = ({
  assessment,
  onClose,
  onAuditAttempt,
}) => {
  const [attempts, setAttempts] = useState<AssessmentAttemptSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchAttempts = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await examinationApi.listAssessmentAttempts(assessment.id);
      setAttempts(data);
    } catch (err: any) {
      console.error('Failed to list assessment attempts', err);
      if (err?.response?.status === 403) {
        setErrorMessage('You are not authorized to view attempts for this assessment.');
      } else {
        setErrorMessage(
          err?.response?.data?.message || err?.message || 'Failed to load assessment attempts.',
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [assessment.id]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  const filteredAttempts = attempts.filter((att) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      att.studentName.toLowerCase().includes(q) ||
      (att.admissionNumber && att.admissionNumber.toLowerCase().includes(q)) ||
      (att.rollNumber && att.rollNumber.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: AttemptStatus) => {
    switch (status) {
      case AttemptStatus.IN_PROGRESS:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            In Progress
          </span>
        );
      case AttemptStatus.SUBMITTED:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Submitted
          </span>
        );
      case AttemptStatus.TIMED_OUT:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Timed Out
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  const lockedCount = attempts.filter((a) => a.isLocked).length;
  const flaggedCount = attempts.filter((a) => a.flaggedForReview).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">
                  Integrity Audit &amp; Student Attempts
                </h3>
                {assessment.enableProctoring && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wider">
                    Proctored
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {assessment.title} • {assessment.subject} ({assessment.totalMarks} Marks)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search student name or admission no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={fetchAttempts}
              disabled={isLoading}
              className="px-2.5 py-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
              title="Refresh attempts list"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Loading student attempts...</p>
            </div>
          ) : errorMessage ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
              <div>
                <p className="text-sm font-bold text-rose-800">{errorMessage}</p>
                <p className="text-xs text-rose-600 mt-1">
                  Unable to display student attempts. Verify your permissions and connectivity.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchAttempts}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : attempts.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">No Student Attempts</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No students have started or submitted an attempt for this assessment yet.
              </p>
            </div>
          ) : filteredAttempts.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No attempts match your search &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
              {filteredAttempts.map((att) => (
                <div
                  key={att.id}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    att.isLocked ? 'bg-rose-50/40 hover:bg-rose-50/60' : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Student & Status Info */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
                        att.isLocked
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : att.flaggedForReview
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      }`}
                    >
                      <User className="w-4 h-4" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{att.studentName}</span>
                        {getStatusBadge(att.status)}

                        {att.isLocked && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            Locked ({att.warningCount}/{att.maxWarnings})
                          </span>
                        )}

                        {!att.isLocked && att.flaggedForReview && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Flagged ({att.warningCount} warnings)
                          </span>
                        )}

                        {!att.isLocked && !att.flaggedForReview && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                            {att.warningCount} warnings
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                        {att.admissionNumber && (
                          <span>Adm: <strong className="text-slate-600">{att.admissionNumber}</strong></span>
                        )}
                        {att.rollNumber && (
                          <span>Roll: <strong className="text-slate-600">{att.rollNumber}</strong></span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Started: {new Date(att.startedAt).toLocaleTimeString()}
                        </span>
                        {att.submittedAt && (
                          <span>Submitted: {new Date(att.submittedAt).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => onAuditAttempt(att.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors ${
                        att.isLocked
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                      title="Inspect preflight diagnostics and review violation events"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>{att.isLocked ? 'Audit & Unlock' : 'Audit'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/60 text-xs">
          <div className="flex items-center gap-3 text-slate-500">
            <span>
              <strong>{attempts.length}</strong> Total Attempt{attempts.length === 1 ? '' : 's'}
            </span>
            {lockedCount > 0 && (
              <span className="font-semibold text-rose-600">
                • {lockedCount} Locked
              </span>
            )}
            {flaggedCount > 0 && (
              <span className="font-semibold text-amber-600">
                • {flaggedCount} Flagged
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssessmentAttemptsModal;
