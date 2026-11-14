import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  X,
  AlertTriangle,
  Clock,
  Wifi,
  Monitor,
  CheckCircle2,
  Check,
  User,
  UserX,
  Users,
  Info,
  Camera,
  Volume2,
  Smartphone,
} from 'lucide-react';
import examinationApi, {
  AssessmentDraft,
  IntegrityAuditResponse,
  ViolationEventType,
} from '../services/examination.api';

interface AssessmentIntegrityAuditModalProps {
  assessment: AssessmentDraft;
  attemptId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export const AssessmentIntegrityAuditModal: React.FC<AssessmentIntegrityAuditModalProps> = ({
  assessment,
  attemptId,
  onClose,
  onUpdated,
}) => {
  const [auditData, setAuditData] = useState<IntegrityAuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState<boolean>(false);

  const fetchAudit = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await examinationApi.getAttemptIntegrityAudit(assessment.id, attemptId);
      setAuditData(data);
    } catch (err: any) {
      console.error('Failed to load integrity audit', err);
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Failed to load integrity audit log.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, [assessment.id, attemptId]);

  const handleDismiss = async (eventId: string) => {
    setDismissingId(eventId);
    try {
      await examinationApi.dismissViolationEvent(assessment.id, attemptId, eventId);
      await fetchAudit();
      onUpdated?.();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to dismiss violation event.');
    } finally {
      setDismissingId(null);
    }
  };

  const handleUnlock = async () => {
    setIsUnlocking(true);
    try {
      await examinationApi.unlockAttempt(assessment.id, attemptId);
      setShowUnlockConfirm(false);
      await fetchAudit();
      onUpdated?.();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to unlock attempt.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const getEventBadge = (type: ViolationEventType) => {
    switch (type) {
      case ViolationEventType.FULLSCREEN_EXIT:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-500" /> Fullscreen Exited
          </span>
        );
      case ViolationEventType.TAB_BLUR:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Monitor className="w-3 h-3 text-amber-500" /> Window Focus Lost
          </span>
        );
      case ViolationEventType.VISIBILITY_HIDDEN:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Monitor className="w-3 h-3 text-amber-500" /> Tab Hidden
          </span>
        );
      case ViolationEventType.NETWORK_ANOMALY:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
            <Wifi className="w-3 h-3 text-blue-500" /> Network Disconnect
          </span>
        );
      case ViolationEventType.NO_FACE:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1">
            <UserX className="w-3 h-3 text-orange-500" /> Face Absent (Pilot)
          </span>
        );
      case ViolationEventType.MULTIPLE_FACES:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
            <Users className="w-3 h-3 text-purple-500" /> Multiple Faces (Pilot)
          </span>
        );
      case ViolationEventType.SUSPICIOUS_AUDIO:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <Volume2 className="w-3 h-3 text-amber-500" /> Suspicious Audio (Pilot)
          </span>
        );
      case ViolationEventType.OBJECT_DETECTED:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-cyan-50 text-cyan-800 border border-cyan-200 flex items-center gap-1">
            <Smartphone className="w-3 h-3 text-cyan-600" /> Object Detected (Pilot)
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Assessment Integrity Audit</h3>
              <p className="text-xs text-slate-500">
                {assessment.title} • {assessment.subject}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading && (
            <div className="py-12 text-center text-slate-400 text-sm">
              Loading integrity audit timeline and preflight telemetry...
            </div>
          )}

          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMessage}
            </div>
          )}

          {auditData && !isLoading && (
            <>
              {/* Student & Session Overview */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Student</span>
                  <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mt-0.5">
                    <User className="w-4 h-4 text-indigo-600" />
                    <span>
                      {auditData.student.firstName} {auditData.student.lastName}
                    </span>
                  </div>
                  <span className="text-slate-500 font-mono text-[11px] block mt-0.5">
                    Adm: {auditData.student.admissionNumber}
                    {auditData.student.rollNumber && ` • Roll: ${auditData.student.rollNumber}`}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">Integrity Status</span>
                  <div className="mt-1 inline-flex items-center gap-1.5">
                    {auditData.summary.isLocked || auditData.attempt.isLocked ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Locked (Threshold Reached)
                      </span>
                    ) : auditData.attempt.flaggedForReview ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Flagged for Teacher Review
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Verified Clean
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Locked Attempt Warning & Override Banner */}
              {(auditData.summary.isLocked || auditData.attempt.isLocked) && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-3 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <p className="font-bold">Student Attempt is Currently Locked</p>
                        <p className="text-[11px] text-rose-700">
                          {auditData.summary.eventCounts?.OBJECT_DETECTED ? (
                            <>
                              Prohibited physical object (phone/book) was detected, or student reached the warning limit ({auditData.summary.activeMisconductViolations ?? auditData.summary.activeViolations}/{auditData.summary.maxAllowed ?? 3} misconduct warnings). Answer inputs are disabled. Review events below and unlock to allow student to continue.
                            </>
                          ) : (
                            <>
                              The student reached the warning limit ({auditData.summary.activeMisconductViolations ?? auditData.summary.activeViolations}/{auditData.summary.maxAllowed ?? 3} misconduct warnings). Answer inputs are disabled. Review events below and unlock to allow student to continue.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    {!showUnlockConfirm && (
                      <button
                        type="button"
                        onClick={() => setShowUnlockConfirm(true)}
                        disabled={isUnlocking}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors shrink-0 disabled:opacity-50"
                      >
                        Unlock Attempt
                      </button>
                    )}
                  </div>

                  {showUnlockConfirm && (
                    <div className="p-3 bg-white border border-rose-300 rounded-xl flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
                      <div>
                        <p className="font-bold text-slate-800">Confirm Unlocking Attempt?</p>
                        <p className="text-[11px] text-slate-500">
                          Active misconduct warnings will be dismissed and the student will be permitted to continue answering.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowUnlockConfirm(false)}
                          disabled={isUnlocking}
                          className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-xs border border-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleUnlock}
                          disabled={isUnlocking}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors disabled:opacity-50"
                        >
                          {isUnlocking ? 'Unlocking...' : 'Confirm Unlock'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Preflight Readiness Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-600" /> System Preflight Diagnostics
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-medium">Preflight Status</span>
                    <span className="font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {auditData.attempt.proctoringPassed ? 'Passed' : 'Pending'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-medium">Round-trip Latency</span>
                    <span className="font-bold text-slate-800 mt-0.5 block font-mono">
                      {auditData.attempt.preflightData?.latencyMs
                        ? `${auditData.attempt.preflightData.latencyMs} ms`
                        : 'Local Check'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-medium">Download Speed</span>
                    <span className="font-bold text-slate-800 mt-0.5 block font-mono">
                      {auditData.attempt.preflightData?.downloadMbps !== undefined
                        ? `${auditData.attempt.preflightData.downloadMbps} Mbps`
                        : 'Verified (250KB)'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-medium">Upload Speed</span>
                    <span className="font-bold text-slate-800 mt-0.5 block font-mono">
                      {auditData.attempt.preflightData?.uploadMbps !== undefined
                        ? `${auditData.attempt.preflightData.uploadMbps} Mbps`
                        : 'Verified (64KB)'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-medium">Camera Telemetry</span>
                    <span className="font-bold text-slate-800 mt-0.5 block flex items-center gap-1">
                      <Camera className="w-3 h-3 text-indigo-600" />
                      {auditData.attempt.preflightData?.cameraTested
                        ? 'Tested & Ready'
                        : auditData.assessment.monitoringConfig?.requireWebcam
                        ? 'Exempt / Not Tested'
                        : 'Not Required'}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-medium">Mic Telemetry</span>
                    <span className="font-bold text-slate-800 mt-0.5 block flex items-center gap-1">
                      <Volume2 className="w-3 h-3 text-indigo-600" />
                      {auditData.attempt.preflightData?.micTested
                        ? `${auditData.attempt.preflightData?.ambientBaselineDb ?? -50} dB`
                        : auditData.assessment.monitoringConfig?.requireMic
                        ? 'Exempt / Not Tested'
                        : 'Not Required'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Student Explanation (if submitted) */}
              {auditData.attempt.studentExplanation && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                    Student Appeal / Explanation
                  </span>
                  <p className="text-xs text-amber-950 italic">
                    "{auditData.attempt.studentExplanation}"
                  </p>
                </div>
              )}

              {/* Violation Events Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Audit Timeline Events ({auditData.events.length})
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Active Flags: <span className="font-bold text-slate-800">{auditData.summary.activeViolations}</span>
                  </span>
                </div>

                {auditData.events.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-slate-400 text-xs">
                    No integrity anomalies detected during this attempt.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {auditData.events.map((ev) => (
                      <div
                        key={ev.id}
                        className={`p-3 text-xs flex items-center justify-between gap-3 ${
                          ev.dismissed ? 'bg-slate-50/50 opacity-60' : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {getEventBadge(ev.eventType)}
                          <div>
                            <span className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(ev.timestamp).toLocaleTimeString()}
                              {ev.durationMs ? ` • Duration: ${(ev.durationMs / 1000).toFixed(1)}s` : ''}
                              {ev.metadata?.detectedClass ? ` • Item: ${ev.metadata.detectedClass}` : ''}
                              {ev.metadata?.confidence ? ` (${Math.round(ev.metadata.confidence * 100)}%)` : ''}
                            </span>
                            {ev.dismissed && (
                              <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">
                                Dismissed by instructor as false positive
                              </span>
                            )}
                          </div>
                        </div>

                        {!ev.dismissed && (
                          <button
                            type="button"
                            onClick={() => handleDismiss(ev.id)}
                            disabled={dismissingId === ev.id}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>{dismissingId === ev.id ? 'Dismissing...' : 'Dismiss'}</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/60">
          <span className="text-[11px] text-slate-400">
            Automated proctoring flags are advisory only. Final evaluation is at instructor discretion.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};
