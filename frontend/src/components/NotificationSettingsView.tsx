import React, { useState, useEffect, useCallback } from 'react';
import {
  notificationsApi,
  SchoolNotificationSettings,
  UpdateSchoolNotificationSettingsPayload,
  NotificationLogItem,
  NotificationStatus,
  NotificationEventType,
} from '../services/api';
import {
  Bell,
  Mail,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Save,
  Clock,
  AlertTriangle,
  XCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
  Sliders,
  History,
} from 'lucide-react';

export const NotificationSettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'settings' | 'history' | 'channels'>('settings');

  // ==========================================
  // Settings State
  // ==========================================
  const [, setSettings] = useState<SchoolNotificationSettings | null>(null);
  const [initialSettings, setInitialSettings] = useState<SchoolNotificationSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Editable form fields
  const [feeReminderEmailEnabled, setFeeReminderEmailEnabled] = useState<boolean>(false);
  const [studentAdmissionEmailEnabled, setStudentAdmissionEmailEnabled] = useState<boolean>(true);
  const [attendanceAbsenceEmailEnabled, setAttendanceAbsenceEmailEnabled] = useState<boolean>(false);
  const [examScheduleEmailEnabled, setExamScheduleEmailEnabled] = useState<boolean>(true);
  const [examResultsEmailEnabled, setExamResultsEmailEnabled] = useState<boolean>(true);
  const [receiptEmailEnabled, setReceiptEmailEnabled] = useState<boolean>(true);
  const [paymentReversalEmailEnabled, setPaymentReversalEmailEnabled] = useState<boolean>(true);
  const [refundSuccessEmailEnabled, setRefundSuccessEmailEnabled] = useState<boolean>(true);
  const [refundFailureEmailEnabled, setRefundFailureEmailEnabled] = useState<boolean>(true);
  const [senderDisplayName, setSenderDisplayName] = useState<string>('');
  const [replyToEmail, setReplyToEmail] = useState<string>('');

  // ==========================================
  // History Logs State
  // ==========================================
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filterStatus, setFilterStatus] = useState<NotificationStatus | ''>('');
  const [filterEventType, setFilterEventType] = useState<NotificationEventType | ''>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch settings from backend
  const loadSettings = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoadingSettings(true);
      setSettingsError(null);
    }
    try {
      const data = await notificationsApi.getSettings();
      setSettings(data);
      setInitialSettings(data);
      // Bind form states
      setFeeReminderEmailEnabled(data.feeReminderEmailEnabled);
      setStudentAdmissionEmailEnabled(data.studentAdmissionEmailEnabled);
      setAttendanceAbsenceEmailEnabled(data.attendanceAbsenceEmailEnabled);
      setExamScheduleEmailEnabled(data.examScheduleEmailEnabled);
      setExamResultsEmailEnabled(data.examResultsEmailEnabled);
      setReceiptEmailEnabled(data.receiptEmailEnabled);
      setPaymentReversalEmailEnabled(data.paymentReversalEmailEnabled);
      setRefundSuccessEmailEnabled(data.refundSuccessEmailEnabled);
      setRefundFailureEmailEnabled(data.refundFailureEmailEnabled);
      setSenderDisplayName(data.senderDisplayName || '');
      setReplyToEmail(data.replyToEmail || '');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to load notification settings';
      setSettingsError(msg);
    } finally {
      if (!silent) {
        setIsLoadingSettings(false);
      }
    }
  }, []);

  // Fetch logs from backend
  const loadLogs = useCallback(
    async (page = 1) => {
      setIsLoadingLogs(true);
      setLogsError(null);
      try {
        const res = await notificationsApi.getLogs({
          page,
          limit: 15,
          status: filterStatus || undefined,
          eventType: filterEventType || undefined,
          search: searchQuery.trim() || undefined,
        });
        setLogs(res.data || []);
        setCurrentPage(res.meta.page);
        setTotalPages(res.meta.totalPages);
        setTotalCount(res.meta.total);
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || 'Failed to load notification logs';
        setLogsError(msg);
      } finally {
        setIsLoadingLogs(false);
      }
    },
    [filterStatus, filterEventType, searchQuery],
  );

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadLogs(currentPage);
    }
  }, [activeTab, loadLogs, currentPage]);

  // Check if form is dirty
  const isDirty =
    initialSettings !== null &&
    (feeReminderEmailEnabled !== initialSettings.feeReminderEmailEnabled ||
      studentAdmissionEmailEnabled !== initialSettings.studentAdmissionEmailEnabled ||
      attendanceAbsenceEmailEnabled !== initialSettings.attendanceAbsenceEmailEnabled ||
      examScheduleEmailEnabled !== initialSettings.examScheduleEmailEnabled ||
      examResultsEmailEnabled !== initialSettings.examResultsEmailEnabled ||
      receiptEmailEnabled !== initialSettings.receiptEmailEnabled ||
      paymentReversalEmailEnabled !== initialSettings.paymentReversalEmailEnabled ||
      refundSuccessEmailEnabled !== initialSettings.refundSuccessEmailEnabled ||
      refundFailureEmailEnabled !== initialSettings.refundFailureEmailEnabled ||
      senderDisplayName.trim() !== (initialSettings.senderDisplayName || '').trim() ||
      replyToEmail.trim() !== (initialSettings.replyToEmail || '').trim());

  // Save settings handler
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(null);
    setIsSavingSettings(true);

    const payload: UpdateSchoolNotificationSettingsPayload = {
      feeReminderEmailEnabled,
      studentAdmissionEmailEnabled,
      attendanceAbsenceEmailEnabled,
      examScheduleEmailEnabled,
      examResultsEmailEnabled,
      receiptEmailEnabled,
      paymentReversalEmailEnabled,
      refundSuccessEmailEnabled,
      refundFailureEmailEnabled,
      senderDisplayName: senderDisplayName.trim() || null,
      replyToEmail: replyToEmail.trim() || null,
    };

    try {
      const updated = await notificationsApi.updateSettings(payload);
      setSettings(updated);
      setInitialSettings(updated);
      setSettingsSuccess('Notification preferences saved and updated successfully.');
      setTimeout(() => setSettingsSuccess(null), 4000);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to update notification settings';
      setSettingsError(msg);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: NotificationStatus) => {
    switch (status) {
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            SENT
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" />
            PENDING
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
            <RefreshCw className="w-3 h-3 text-amber-600 animate-spin" />
            PROCESSING
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            FAILED
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <AlertCircle className="w-3 h-3 text-slate-500" />
            SKIPPED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
            CANCELLED
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur border border-white/20 text-indigo-200 mb-3">
              <Bell className="w-3.5 h-3.5 text-indigo-300" />
              Multi-Channel Transactional Notification Center
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Notification Management & Preferences
            </h2>
            <p className="mt-2 text-indigo-100 text-sm leading-relaxed max-w-2xl">
              Configure automated guardian emails, academic alerts, attendance notifications, and monitor delivery ledger records across all tenant events.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              onClick={() => {
                if (activeTab === 'settings') loadSettings();
                else if (activeTab === 'history') loadLogs(currentPage);
              }}
              disabled={isLoadingSettings || isLoadingLogs}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSettings || isLoadingLogs ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <nav className="flex space-x-1 p-1.5 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 py-2.5 px-4 rounded-xl font-medium text-xs transition-all ${
              activeTab === 'settings'
                ? 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Event Preferences ({isDirty ? '● Unsaved' : 'Saved'})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 py-2.5 px-4 rounded-xl font-medium text-xs transition-all ${
              activeTab === 'history'
                ? 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            Delivery History & Outbox
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`flex items-center gap-2 py-2.5 px-4 rounded-xl font-medium text-xs transition-all ${
              activeTab === 'channels'
                ? 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Mail className="w-4 h-4" />
            Channel Status & Diagnostic
          </button>
        </nav>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: NOTIFICATION SETTINGS FORM                        */}
      {/* ======================================================== */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Alerts */}
          {settingsError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{settingsError}</span>
            </div>
          )}
          {settingsSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center gap-3 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{settingsSuccess}</span>
            </div>
          )}

          {/* New Phase 2 Preferences Section */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                Phase 2 Expansion
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-2">
                Operational & Academic Event Notifications
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Configure automated email dispatch for admissions, daily attendance, examinations, and fee billing alerts.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Student Admitted */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">Student Admission Alert</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Default: Enabled
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Sends welcome email with admission details and institutional credentials when a student profile is created.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={studentAdmissionEmailEnabled}
                    onChange={(e) => setStudentAdmissionEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* 2. Fee Due Reminder */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">Fee Due Date Reminder</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      Opt-In
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Sends payment reminders to guardians for unpaid and pending monthly school fee invoices.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={feeReminderEmailEnabled}
                    onChange={(e) => setFeeReminderEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* 3. Attendance Absence */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">Daily Absence Notification</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      Opt-In
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Dispatches immediate notification to verified parent email when student is marked ABSENT in roll call.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={attendanceAbsenceEmailEnabled}
                    onChange={(e) => setAttendanceAbsenceEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* 4. Exam Schedule Published */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">Exam Schedule Published</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Default: Enabled
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Notifies students and parents when a teacher publishes an official test date, duration, and subject syllabus.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={examScheduleEmailEnabled}
                    onChange={(e) => setExamScheduleEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* 5. Exam Results Released */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-900">Exam Results Released</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Default: Enabled
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Sends scorecard summary and percentage breakdown once the teacher officially releases test results.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={examResultsEmailEnabled}
                    onChange={(e) => setExamResultsEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Payment Financial Events Section */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                Ledger & Payments
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-2">
                Payment & Accounting Event Notifications
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Triggered automatically upon cashier receipt generation, online gateway verification, or reversal entries.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Receipt Issued */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="font-semibold text-sm text-slate-900">Payment Receipt Issued</span>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Sends electronic receipt acknowledgement with transaction ID and allocation breakdown.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={receiptEmailEnabled}
                    onChange={(e) => setReceiptEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Payment Reversal */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="font-semibold text-sm text-slate-900">Payment Reversal Alert</span>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Notifies guardians when a previously recorded payment is voided or cancelled by an administrator.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={paymentReversalEmailEnabled}
                    onChange={(e) => setPaymentReversalEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Refund Succeeded */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="font-semibold text-sm text-slate-900">Refund Successful</span>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Dispatches credit confirmation when an online gateway refund completes successfully.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={refundSuccessEmailEnabled}
                    onChange={(e) => setRefundSuccessEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Refund Failed */}
              <div className="p-4 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all bg-slate-50/30 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="font-semibold text-sm text-slate-900">Refund Failure Notification</span>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Alerts administrator and payer if a gateway refund transaction encounters an error.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={refundFailureEmailEnabled}
                    onChange={(e) => setRefundFailureEmailEnabled(e.target.checked)}
                    disabled={isLoadingSettings || isSavingSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Email Branding Configuration */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-1 rounded-md">
                Sender Identity
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-2">
                Email Branding & Reply Routing
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Customize the sender display name and reply-to address shown to students and guardians.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Sender Display Name
                </label>
                <input
                  type="text"
                  value={senderDisplayName}
                  onChange={(e) => setSenderDisplayName(e.target.value)}
                  placeholder="e.g. Springfield Academy Admissions"
                  maxLength={100}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                />
                <span className="text-[11px] text-slate-400">
                  Appears in email clients as the friendly "From" header.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Reply-To Email Address
                </label>
                <input
                  type="email"
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                  placeholder="e.g. fee-accounts@springfield.edu"
                  maxLength={255}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                />
                <span className="text-[11px] text-slate-400">
                  Directs guardian replies to your official administrative inbox.
                </span>
              </div>
            </div>
          </div>

          {/* Sticky Actions Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-400" />
              <span>
                {isDirty
                  ? 'You have unsaved changes in your notification preferences.'
                  : 'All preferences are synchronized with the database.'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => initialSettings && loadSettings(false)}
                disabled={!isDirty || isSavingSettings}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all"
              >
                Discard Changes
              </button>
              <button
                type="submit"
                disabled={!isDirty || isSavingSettings}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 transition-all"
              >
                <Save className="w-4 h-4" />
                {isSavingSettings ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* TAB 2: NOTIFICATION DELIVERY HISTORY & OUTBOX            */}
      {/* ======================================================== */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Controls & Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadLogs(1)}
                  placeholder="Search recipient name / email..."
                  className="pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 w-64"
                />
              </div>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-700 font-medium"
              >
                <option value="">All Statuses</option>
                <option value="SENT">SENT</option>
                <option value="PENDING">PENDING</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="SKIPPED">SKIPPED</option>
                <option value="FAILED">FAILED</option>
              </select>

              {/* Event Type Filter */}
              <select
                value={filterEventType}
                onChange={(e) => {
                  setFilterEventType(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-slate-700 font-medium"
              >
                <option value="">All Event Types</option>
                <option value="RECEIPT_ISSUED">Receipt Issued</option>
                <option value="PAYMENT_REVERSED">Payment Reversed</option>
                <option value="STUDENT_ADMITTED">Student Admitted</option>
                <option value="ATTENDANCE_ABSENT">Attendance Absent</option>
                <option value="EXAM_SCHEDULE_PUBLISHED">Exam Schedule</option>
                <option value="EXAM_RESULTS_RELEASED">Exam Results</option>
                <option value="FEE_DUE_REMINDER">Fee Due Reminder</option>
              </select>

              <button
                onClick={() => loadLogs(1)}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Apply Filters
              </button>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing total <span className="font-bold text-slate-900">{totalCount}</span> outbox records
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
            {logsError && (
              <div className="p-4 bg-rose-50 border-b border-rose-100 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{logsError}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Attempts</th>
                    <th className="py-3 px-4">Created At</th>
                    <th className="py-3 px-4">Sent / Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {isLoadingLogs ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                        Loading notification delivery ledger...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400">
                        <Mail className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        No notification outbox records found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    logs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <span className="font-mono text-[11px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                            {item.eventType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{item.recipientName || '—'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{item.recipientEmail || 'No Email'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                            <Mail className="w-3 h-3 text-indigo-500" />
                            {item.channel}
                          </span>
                        </td>
                        <td className="py-3 px-4">{getStatusBadge(item.status)}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {item.attemptCount}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(item.createdAt).toLocaleString(undefined, {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="py-3 px-4">
                          {item.sentAt ? (
                            <span className="text-emerald-700 text-[11px] font-medium">
                              {new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : item.lastErrorMessage ? (
                            <span className="text-rose-600 text-[11px] max-w-xs truncate block" title={item.lastErrorMessage}>
                              {item.lastErrorMessage}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/30">
                <div>
                  Page <span className="font-bold text-slate-800">{currentPage}</span> of{' '}
                  <span className="font-bold text-slate-800">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || isLoadingLogs}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages || isLoadingLogs}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CHANNEL CONFIGURATION & DIAGNOSTIC                */}
      {/* ======================================================== */}
      {activeTab === 'channels' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Email Channel Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Email Channel (Primary)</h3>
                  <span className="text-[11px] text-slate-400 font-medium">SMTP / Nodemailer Transport</span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                OPERATIONAL
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Provider Implementation</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> SmtpEmailProvider / Nodemailer
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">HTML & Text Templates</span>
                <span className="font-semibold text-slate-900">9 Templates Implemented & Sanitized</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Concurrency Claiming</span>
                <span className="font-semibold text-slate-900">PostgreSQL FOR UPDATE SKIP LOCKED</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Stale Claim Recovery</span>
                <span className="font-semibold text-slate-900">5-Minute Automated Lease Expiry</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500">Delivery Status</span>
                <span className="font-semibold text-indigo-600">Active (Production & Dev In-Memory)</span>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 text-[11px] text-slate-500 leading-relaxed border border-slate-100">
              <span className="font-bold text-slate-700">Security Assurance:</span> Secret connection credentials, SMTP passwords, and DKIM private keys are confined to protected server-side environment variables and are never surfaced to the browser.
            </div>
          </div>

          {/* WhatsApp Channel Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">WhatsApp Channel (Roadmap)</h3>
                  <span className="text-[11px] text-slate-400 font-medium">Meta Cloud API (v19.0)</span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                CODE READY / UNCONFIGURED
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Provider Implementation</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> WhatsAppCloudApiProvider
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">E.164 Phone Normalization</span>
                <span className="font-semibold text-slate-900">Implemented (India +91 & Global)</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Meta Graph API Credentials</span>
                <span className="font-semibold text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Token Unconfigured (MVP Default)
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Approved Meta HSM Templates</span>
                <span className="font-semibold text-slate-500">Pending Meta Business Verification</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-500">Live Delivery Readiness</span>
                <span className="font-semibold text-slate-500">Standby (Deferred to Phase 3)</span>
              </div>
            </div>

            <div className="bg-amber-50/50 rounded-2xl p-4 text-[11px] text-amber-800 leading-relaxed border border-amber-100">
              <span className="font-bold text-amber-900">Channel Status Notice:</span> WhatsApp business messaging requires a verified Meta Business Account and pre-approved HSM message templates. Email remains the designated active channel for MVP delivery.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
