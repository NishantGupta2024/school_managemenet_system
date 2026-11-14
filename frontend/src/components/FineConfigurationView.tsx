
import React, { useEffect, useState } from 'react';
import {
  AcademicYear,
  FeeHead,
  FineDayCountPolicy,
  FinePreviewInvoiceItem,
  FinePreviewResponse,
  FineRule,
  FineRuleStatus,
  FineType,
  feeHeadsApi,
  fineRulesApi,
  metaApi,
} from '../services/api';
import {
  AlertCircle,
  Calculator,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  Plus,
  Power,
  RefreshCw,
  Scale,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';

const MONTH_NAMES: Record<number, string> = {
  1: 'April',
  2: 'May',
  3: 'June',
  4: 'July',
  5: 'August',
  6: 'September',
  7: 'October',
  8: 'November',
  9: 'December',
  10: 'January',
  11: 'February',
  12: 'March',
};

export const FineConfigurationView: React.FC = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([]);
  const [rules, setRules] = useState<FineRule[]>([]);
  const [invoices, setInvoices] = useState<FinePreviewInvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create / Edit Form state
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [fineType, setFineType] = useState<FineType>('FIXED');
  const [fineValue, setFineValue] = useState<string>('100');
  const [gracePeriodDays, setGracePeriodDays] = useState<string>('5');
  const [maxFineCap, setMaxFineCap] = useState<string>('');
  const [dayCountPolicy, setDayCountPolicy] =
    useState<FineDayCountPolicy>('CALENDAR_DAYS');
  const [scopeMode, setScopeMode] = useState<'ALL' | 'FEE_HEAD' | 'CATEGORY'>(
    'ALL',
  );
  const [applicableFeeHeadId, setApplicableFeeHeadId] = useState<string>('');
  const [applicableCategory, setApplicableCategory] = useState<string>('');
  const [status, setStatus] = useState<FineRuleStatus>('ACTIVE');
  const [effectiveStartDate, setEffectiveStartDate] = useState<string>('');
  const [effectiveEndDate, setEffectiveEndDate] = useState<string>('');

  // Fine Calculation Preview state
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string>('');
  const [previewRuleId, setPreviewRuleId] = useState<string>('');
  const [previewEvalDate, setPreviewEvalDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [previewPaidAmount, setPreviewPaidAmount] = useState<string>('0');
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] =
    useState<FinePreviewResponse | null>(null);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [yearsData, headsData] = await Promise.all([
        metaApi.getAcademicYears(),
        feeHeadsApi.list(),
      ]);
      setAcademicYears(yearsData);
      setFeeHeads(headsData);

      const defaultYear =
        yearsData.find((y: AcademicYear) => y.isCurrent) ||
        yearsData[0] ||
        null;
      const yearId = defaultYear ? defaultYear.id : '';
      setSelectedYearId(yearId);

      await loadYearScopedData(yearId);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load fine configuration data.',
      );
    } finally {
      setLoading(false);
    }
  };

  const loadYearScopedData = async (yearId: string) => {
    try {
      const [rulesData, invoicesData] = await Promise.all([
        fineRulesApi.list(yearId ? { academicYearId: yearId } : undefined),
        fineRulesApi.listInvoices(yearId || undefined),
      ]);
      setRules(rulesData);
      setInvoices(invoicesData);
      if (invoicesData.length > 0 && !previewInvoiceId) {
        setPreviewInvoiceId(invoicesData[0].id);
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load fine rules for the selected session.',
      );
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleYearChange = async (yearId: string) => {
    setSelectedYearId(yearId);
    setPreviewInvoiceId('');
    setPreviewResult(null);
    await loadYearScopedData(yearId);
  };

  const resetForm = () => {
    setEditingRuleId(null);
    setName('');
    setDescription('');
    setFineType('FIXED');
    setFineValue('100');
    setGracePeriodDays('5');
    setMaxFineCap('');
    setDayCountPolicy('CALENDAR_DAYS');
    setScopeMode('ALL');
    setApplicableFeeHeadId('');
    setApplicableCategory('');
    setStatus('ACTIVE');
    setEffectiveStartDate('');
    setEffectiveEndDate('');
    setFormError(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (rule: FineRule) => {
    setEditingRuleId(rule.id);
    setName(rule.name);
    setDescription(rule.description || '');
    setFineType(rule.fineType);
    setFineValue(String(rule.fineValue));
    setGracePeriodDays(String(rule.gracePeriodDays));
    setMaxFineCap(
      rule.maxFineCap !== null && rule.maxFineCap !== undefined
        ? String(rule.maxFineCap)
        : '',
    );
    setDayCountPolicy(rule.dayCountPolicy);
    if (rule.applicableFeeHeadId) {
      setScopeMode('FEE_HEAD');
      setApplicableFeeHeadId(rule.applicableFeeHeadId);
      setApplicableCategory('');
    } else if (rule.applicableCategory) {
      setScopeMode('CATEGORY');
      setApplicableCategory(rule.applicableCategory);
      setApplicableFeeHeadId('');
    } else {
      setScopeMode('ALL');
      setApplicableFeeHeadId('');
      setApplicableCategory('');
    }
    setStatus(rule.status);
    setEffectiveStartDate(
      rule.effectiveStartDate ? rule.effectiveStartDate.slice(0, 10) : '',
    );
    setEffectiveEndDate(
      rule.effectiveEndDate ? rule.effectiveEndDate.slice(0, 10) : '',
    );
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (!selectedYearId) {
      setFormError('Please select an Academic Session first.');
      return;
    }

    const numericValue = Number(fineValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setFormError('Fine value must be greater than 0.');
      return;
    }
    if (fineType === 'PERCENTAGE' && numericValue > 100) {
      setFormError('Percentage fine value cannot exceed 100%.');
      return;
    }

    const numericGrace = Number(gracePeriodDays);
    if (
      !Number.isInteger(numericGrace) ||
      numericGrace < 0 ||
      numericGrace > 365
    ) {
      setFormError('Grace period days must be an integer between 0 and 365.');
      return;
    }

    let numericCap: number | null = null;
    if (maxFineCap.trim() !== '') {
      numericCap = Number(maxFineCap);
      if (!Number.isFinite(numericCap) || numericCap <= 0) {
        setFormError('Maximum fine cap must be greater than 0 when specified.');
        return;
      }
      if (fineType === 'FIXED' && numericCap < numericValue) {
        setFormError(
          'Maximum fine cap cannot be less than a FIXED fine value.',
        );
        return;
      }
    }

    if (scopeMode === 'FEE_HEAD' && !applicableFeeHeadId) {
      setFormError('Please select an applicable Fee Head.');
      return;
    }
    if (scopeMode === 'CATEGORY' && !applicableCategory.trim()) {
      setFormError('Please enter an applicable Fee Category.');
      return;
    }

    setFormSubmitting(true);
    try {
      const payload = {
        academicYearId: selectedYearId,
        name: name.trim(),
        description: description.trim() || undefined,
        fineType,
        fineValue: numericValue,
        gracePeriodDays: numericGrace,
        maxFineCap: numericCap,
        dayCountPolicy,
        applicableFeeHeadId:
          scopeMode === 'FEE_HEAD' ? applicableFeeHeadId : null,
        applicableCategory:
          scopeMode === 'CATEGORY' ? applicableCategory.trim() : null,
        status,
        effectiveStartDate: effectiveStartDate || null,
        effectiveEndDate: effectiveEndDate || null,
      };

      if (editingRuleId) {
        await fineRulesApi.update(editingRuleId, payload);
        setSuccessMsg(`Updated fine rule "${payload.name}".`);
      } else {
        await fineRulesApi.create(payload);
        setSuccessMsg(`Created fine rule "${payload.name}".`);
      }

      setShowForm(false);
      resetForm();
      await loadYearScopedData(selectedYearId);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setFormError(
        Array.isArray(msg)
          ? msg.join('; ')
          : msg || err?.message || 'Failed to save fine rule.',
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleStatus = async (rule: FineRule) => {
    setError(null);
    setSuccessMsg(null);
    const nextStatus: FineRuleStatus =
      rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await fineRulesApi.updateStatus(rule.id, nextStatus);
      setSuccessMsg(`Rule "${rule.name}" marked as ${nextStatus}.`);
      await loadYearScopedData(selectedYearId);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update rule status.',
      );
    }
  };

  const handleDeleteRule = async (rule: FineRule) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await fineRulesApi.delete(rule.id);
      setSuccessMsg(`Deleted fine rule "${rule.name}".`);
      await loadYearScopedData(selectedYearId);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete fine rule.',
      );
    }
  };

  const handleRunPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewInvoiceId) {
      setPreviewError('Please select an invoice to preview.');
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const numericPaid =
        previewPaidAmount.trim() !== '' ? Number(previewPaidAmount) : 0;
      const res = await fineRulesApi.preview({
        invoiceId: previewInvoiceId,
        fineRuleId: previewRuleId || undefined,
        asOfDate: previewEvalDate || undefined,
        paidAmount: Number.isFinite(numericPaid) ? numericPaid : 0,
      });
      setPreviewResult(res);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setPreviewError(
        Array.isArray(msg)
          ? msg.join('; ')
          : msg || err?.message || 'Failed to calculate fine preview.',
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 mb-2">
            <Scale className="w-3.5 h-3.5" />
            Phase 2D-B • Late Fine Configuration & Calculation Engine
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            Fine Configuration & Late Fee Rules
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure session-scoped late fine rules (Fixed, Per-Day, or
            Percentage) with grace periods, maximum caps, and calendar/working
            day policies.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Academic Session
            </label>
            <select
              value={selectedYearId}
              onChange={(e) => handleYearChange(e.target.value)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Fine Rule
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">{successMsg}</div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create / Edit Rule Modal / Card */}
      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md p-6">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-900">
              {editingRuleId ? 'Edit Fine Rule' : 'Create New Fine Rule'}
            </h3>
            <button
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {formError && (
            <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-medium text-rose-700 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitForm} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Standard Tuition Late Fine"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FineRuleStatus)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain when and how this fine applies..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fine Calculation Type *
                </label>
                <select
                  value={fineType}
                  onChange={(e) => setFineType(e.target.value as FineType)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="FIXED">FIXED (Flat ₹)</option>
                  <option value="PER_DAY">PER_DAY (₹ per overdue day)</option>
                  <option value="PERCENTAGE">
                    PERCENTAGE (% of unpaid base)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {fineType === 'PERCENTAGE'
                    ? 'Fine Percentage (0–100%) *'
                    : 'Fine Amount (₹) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={fineType === 'PERCENTAGE' ? '100' : undefined}
                  required
                  value={fineValue}
                  onChange={(e) => setFineValue(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Grace Period (Days) *
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  required
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Max Fine Cap (₹, Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={maxFineCap}
                  onChange={(e) => setMaxFineCap(e.target.value)}
                  placeholder="No cap"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Day Count Policy
                </label>
                <select
                  value={dayCountPolicy}
                  onChange={(e) =>
                    setDayCountPolicy(e.target.value as FineDayCountPolicy)
                  }
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="CALENDAR_DAYS">
                    CALENDAR_DAYS (All 7 days)
                  </option>
                  <option value="WORKING_DAYS">
                    WORKING_DAYS (Mon–Fri only)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Applicability Scope
                </label>
                <select
                  value={scopeMode}
                  onChange={(e) =>
                    setScopeMode(
                      e.target.value as 'ALL' | 'FEE_HEAD' | 'CATEGORY',
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">Entire Invoice (All Fee Heads)</option>
                  <option value="FEE_HEAD">Specific Fee Head</option>
                  <option value="CATEGORY">Specific Fee Category</option>
                </select>
              </div>

              {scopeMode === 'FEE_HEAD' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Fee Head *
                  </label>
                  <select
                    value={applicableFeeHeadId}
                    onChange={(e) => setApplicableFeeHeadId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select Fee Head...</option>
                    {feeHeads.map((fh) => (
                      <option key={fh.id} value={fh.id}>
                        {fh.name} ({fh.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scopeMode === 'CATEGORY' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Fee Category *
                  </label>
                  <select
                    value={applicableCategory}
                    onChange={(e) => setApplicableCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Select Category...</option>
                    <option value="ACADEMIC">ACADEMIC</option>
                    <option value="FACILITY">FACILITY</option>
                    <option value="INSTITUTIONAL">INSTITUTIONAL</option>
                    <option value="ACTIVITY">ACTIVITY</option>
                    <option value="MISCELLANEOUS">MISCELLANEOUS</option>
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Effective Start Date (Optional)
                </label>
                <input
                  type="date"
                  value={effectiveStartDate}
                  onChange={(e) => setEffectiveStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Effective End Date (Optional)
                </label>
                <input
                  type="date"
                  value={effectiveEndDate}
                  onChange={(e) => setEffectiveEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formSubmitting}
                className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
              >
                {formSubmitting
                  ? 'Saving...'
                  : editingRuleId
                    ? 'Save Changes'
                    : 'Create Fine Rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fine Rules Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Configured Fine Rules ({rules.length})
            </h3>
            <p className="text-xs text-slate-500">
              Precedence when auto-matching: Specific Fee Head &rarr; Fee
              Category &rarr; General Invoice Rule
            </p>
          </div>
          <button
            onClick={() => loadYearScopedData(selectedYearId)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading fine configuration...
          </div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              No fine rules configured for this academic session.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Click &ldquo;New Fine Rule&rdquo; above to create a Fixed,
              Per-Day, or Percentage late fee rule.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Rule Name & Scope</th>
                  <th className="py-3 px-4">Type & Rate</th>
                  <th className="py-3 px-4">Grace & Day Policy</th>
                  <th className="py-3 px-4">Max Cap</th>
                  <th className="py-3 px-4">Effective Window</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">
                        {rule.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {rule.applicableFeeHeadName
                          ? `Fee Head: ${rule.applicableFeeHeadName}`
                          : rule.applicableCategory
                            ? `Category: ${rule.applicableCategory}`
                            : 'Scope: Entire Invoice'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {rule.fineType}
                      </span>
                      <div className="font-mono font-semibold text-slate-800 mt-1">
                        {rule.fineType === 'PERCENTAGE'
                          ? `${Number(rule.fineValue).toFixed(2)}%`
                          : `₹${Number(rule.fineValue).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}`}
                        {rule.fineType === 'PER_DAY' ? ' / day' : ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-medium">
                        {rule.gracePeriodDays} day
                        {rule.gracePeriodDays === 1 ? '' : 's'} grace
                      </div>
                      <div className="text-xs text-slate-500">
                        {rule.dayCountPolicy === 'WORKING_DAYS'
                          ? 'Working Days (Mon–Fri)'
                          : 'Calendar Days'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      {rule.maxFineCap !== null &&
                        rule.maxFineCap !== undefined
                        ? `₹${Number(rule.maxFineCap).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {rule.effectiveStartDate || rule.effectiveEndDate ? (
                        <div>
                          <div>
                            From:{' '}
                            {rule.effectiveStartDate
                              ? rule.effectiveStartDate.slice(0, 10)
                              : 'Any'}
                          </div>
                          <div>
                            To:{' '}
                            {rule.effectiveEndDate
                              ? rule.effectiveEndDate.slice(0, 10)
                              : 'Any'}
                          </div>
                        </div>
                      ) : (
                        'Full Session'
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${rule.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                      >
                        {rule.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditForm(rule)}
                          title="Edit Rule"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(rule)}
                          title={
                            rule.status === 'ACTIVE'
                              ? 'Deactivate Rule'
                              : 'Activate Rule'
                          }
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule)}
                          title="Delete Rule"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Late Fine Calculation Preview Simulator */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Late Fine Calculation Preview & Simulator
            </h3>
            <p className="text-xs text-slate-500">
              Non-mutating calculation preview on real tenant invoices. Does not
              modify historical invoice snapshots or record a payment.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleRunPreview}
          className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-200/80"
        >
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Invoice *
            </label>
            <select
              value={previewInvoiceId}
              onChange={(e) => setPreviewInvoiceId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select an invoice...</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.admissionNumber} • {inv.studentName} •{' '}
                  {inv.monthName || MONTH_NAMES[inv.billingMonth]} (Due{' '}
                  {String(inv.dueDate).slice(0, 10)} • ₹
                  {Number(inv.netAmount).toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Fine Rule Override
            </label>
            <select
              value={previewRuleId}
              onChange={(e) => setPreviewRuleId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Auto-Match Best Active Rule</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.fineType} • {r.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Evaluation Date
            </label>
            <input
              type="date"
              value={previewEvalDate}
              onChange={(e) => setPreviewEvalDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Simulated Paid (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={previewPaidAmount}
                onChange={(e) => setPreviewPaidAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={previewLoading || !previewInvoiceId}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50 shrink-0 self-end"
            >
              {previewLoading ? 'Calculating...' : 'Preview'}
            </button>
          </div>
        </form>

        {previewError && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-medium text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{previewError}</span>
          </div>
        )}

        {previewResult && (
          <div className="mt-6 border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                {previewResult.invoiceSummary.studentName} (
                {previewResult.invoiceSummary.admissionNumber}) •{' '}
                {previewResult.invoiceSummary.monthName} Invoice
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  Timezone: {previewResult.timeZone}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 font-medium">
                  <Clock className="w-3 h-3" />
                  Preview Only (Uncollected)
                </span>
              </div>
            </div>

            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 bg-white">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">
                  Due Date &rarr; Grace End
                </div>
                <div className="text-sm font-bold text-slate-800 mt-1 font-mono">
                  {previewResult.dueLocalDate} &rarr;{' '}
                  {previewResult.graceEndLocalDate}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Evaluated at {previewResult.asOfLocalDate}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">
                  Overdue Days After Grace
                </div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {previewResult.overdueDays} days
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Policy: {previewResult.dayCountPolicy || 'N/A'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500">
                  Eligible Unpaid Base Principal
                </div>
                <div className="text-lg font-bold text-slate-900 mt-1 font-mono">
                  ₹
                  {Number(
                    previewResult.eligibleOutstandingBasis,
                  ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Invoice Net: ₹
                  {Number(previewResult.invoiceNetAmount).toLocaleString(
                    'en-IN',
                  )}{' '}
                  | Paid: ₹
                  {Number(previewResult.paidAmountUsed).toLocaleString('en-IN')}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                <div className="text-xs font-semibold text-amber-800">
                  Calculated Late Fine Preview
                </div>
                <div className="text-xl font-extrabold text-amber-900 mt-1 font-mono">
                  ₹
                  {Number(previewResult.calculatedFine).toLocaleString(
                    'en-IN',
                    { minimumFractionDigits: 2 },
                  )}
                </div>
                <div className="text-[11px] text-amber-700 mt-0.5">
                  {previewResult.capApplied
                    ? `Capped at ₹${previewResult.maxFineCap} (Uncapped: ₹${previewResult.uncappedFine})`
                    : `Rule: ${previewResult.ruleApplied?.name || 'None'}`}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-700 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-900">
                  Calculation Explanation:{' '}
                </span>
                {previewResult.reason}
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                isPaymentOrCollected: false
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

