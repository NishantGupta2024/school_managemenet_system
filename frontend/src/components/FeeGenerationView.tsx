import React, { useState, useEffect } from 'react';
import {
  feeGenerationApi,
  metaApi,
  AcademicYear,
  GradeClass,
  FeeGenerationPreview,
  FeeGenerationExecution,
  FeeGenerationRun,
} from '../services/api';
import {
  Calendar,
  Layers,
  Play,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  FileCheck2,
} from 'lucide-react';

export const FeeGenerationView: React.FC = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);
  const [runs, setRuns] = useState<FeeGenerationRun[]>([]);

  // Selection states
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');

  // Async states
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [executeLoading, setExecuteLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Results
  const [previewData, setPreviewData] = useState<FeeGenerationPreview | null>(null);
  const [executionResult, setExecutionResult] = useState<FeeGenerationExecution | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      setLoadingMeta(true);
      setError(null);
      const [years, gradeList] = await Promise.all([
        metaApi.getAcademicYears(),
        metaApi.getGrades(),
      ]);
      setAcademicYears(years);
      setGrades(gradeList);

      if (years.length > 0) {
        setSelectedAcademicYearId(years[0].id);
        loadRuns(years[0].id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load metadata');
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadRuns = async (yearId?: string) => {
    try {
      const runHistory = await feeGenerationApi.getRuns(yearId || selectedAcademicYearId);
      setRuns(runHistory);
    } catch (err: any) {
      console.error('Failed to load runs:', err);
    }
  };

  const handleYearChange = (yearId: string) => {
    setSelectedAcademicYearId(yearId);
    setPreviewData(null);
    setExecutionResult(null);
    loadRuns(yearId);
  };

  const handlePreview = async () => {
    if (!selectedAcademicYearId) return;
    try {
      setPreviewLoading(true);
      setError(null);
      setExecutionResult(null);
      const data = await feeGenerationApi.preview({
        academicYearId: selectedAcademicYearId,
        gradeId: selectedGradeId || undefined,
      });
      setPreviewData(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedAcademicYearId) return;
    try {
      setExecuteLoading(true);
      setError(null);
      setShowConfirmModal(false);
      const result = await feeGenerationApi.execute({
        academicYearId: selectedAcademicYearId,
        gradeId: selectedGradeId || undefined,
      });
      setExecutionResult(result);
      setPreviewData(null);
      loadRuns(selectedAcademicYearId);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to execute fee generation');
    } finally {
      setExecuteLoading(false);
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Phase 2C Monthly Fee Generation Engine
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Monthly Invoicing & Schedule Generator
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Preview and commit 12-month billing schedules (April–March) for enrolled student fee allocations with exact concession distribution and automated idempotency.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                loadMetadata();
                loadRuns();
              }}
              disabled={loadingMeta || previewLoading || executeLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loadingMeta ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error processing request</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Filter Controls */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Academic Session (Mandatory)
            </label>
            <select
              value={selectedAcademicYearId}
              onChange={(e) => handleYearChange(e.target.value)}
              className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Class / Grade (Optional Target)
            </label>
            <select
              value={selectedGradeId}
              onChange={(e) => {
                setSelectedGradeId(e.target.value);
                setPreviewData(null);
              }}
              className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            >
              <option value="">All Classes in School</option>
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name} ({grade.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handlePreview}
              disabled={previewLoading || !selectedAcademicYearId}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {previewLoading ? 'Calculating Preview...' : 'Preview Generation'}
            </button>
          </div>
        </div>
      </div>

      {/* Execution Success Result Card */}
      {executionResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-emerald-900 shadow-xs">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Fee Generation Executed Successfully!</h3>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Batch Run ID: <code className="font-mono bg-emerald-100/70 px-1 py-0.5 rounded">{executionResult.runId}</code>
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-200/80 text-emerald-800">
              {executionResult.status}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 pt-6 border-t border-emerald-200/60">
            <div className="bg-white/80 p-3 rounded-xl border border-emerald-100">
              <span className="text-xs font-medium text-emerald-700">Students Processed</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{executionResult.totalStudents}</p>
            </div>
            <div className="bg-white/80 p-3 rounded-xl border border-emerald-100">
              <span className="text-xs font-medium text-emerald-700">Invoices Created</span>
              <p className="text-xl font-bold text-emerald-700 mt-1">{executionResult.totalInvoicesCreated}</p>
            </div>
            <div className="bg-white/80 p-3 rounded-xl border border-emerald-100">
              <span className="text-xs font-medium text-emerald-700">Invoices Skipped</span>
              <p className="text-xl font-bold text-slate-600 mt-1">{executionResult.totalInvoicesSkipped}</p>
            </div>
            <div className="bg-white/80 p-3 rounded-xl border border-emerald-100">
              <span className="text-xs font-medium text-emerald-700">Gross Obligation</span>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrency(executionResult.totalGrossAmount)}</p>
            </div>
            <div className="bg-white/80 p-3 rounded-xl border border-emerald-100">
              <span className="text-xs font-medium text-emerald-700">Net Receivable</span>
              <p className="text-lg font-bold text-emerald-800 mt-1">{formatCurrency(executionResult.totalNetAmount)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Preview Metrics Card */}
      {previewData && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-6 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                Prospective Obligation Preview
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-2">
                Generation Simulation Metrics
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculated without committing changes to database. Review totals before proceeding.
              </p>
            </div>

            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={executeLoading || previewData.newInvoicesToCreate === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              Commit & Execute Generation
            </button>
          </div>

          {previewData.validationErrors.length > 0 && (
            <div className="my-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <p className="font-bold flex items-center gap-1.5 mb-1 text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Validation Warnings Detected
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {previewData.validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/80">
              <span className="text-xs font-medium text-slate-500">Eligible Allocations</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{previewData.totalEligibleAllocations}</p>
              <span className="text-[11px] text-slate-400">across {previewData.totalStudents} students</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/80">
              <span className="text-xs font-medium text-slate-500">Invoices to Create</span>
              <p className="text-2xl font-black text-indigo-600 mt-1">{previewData.newInvoicesToCreate}</p>
              <span className="text-[11px] text-slate-400">
                {previewData.existingInvoicesToSkip} already exist (skipped)
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/80">
              <span className="text-xs font-medium text-slate-500">Projected Gross Total</span>
              <p className="text-xl font-black text-slate-900 mt-1">{formatCurrency(previewData.projectedGrossTotal)}</p>
              <span className="text-[11px] text-slate-400">Concession: -{formatCurrency(previewData.projectedDiscountTotal)}</span>
            </div>

            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50">
              <span className="text-xs font-semibold text-indigo-700">Projected Net Total</span>
              <p className="text-xl font-black text-indigo-900 mt-1">{formatCurrency(previewData.projectedNetTotal)}</p>
              <span className="text-[11px] text-indigo-600 font-medium">100% Exact Decimal Precision</span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Confirm Fee Generation</h3>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              You are about to generate <strong className="text-slate-900">{previewData?.newInvoicesToCreate} invoices</strong> amounting to <strong className="text-slate-900">{formatCurrency(previewData?.projectedNetTotal)}</strong>.
              <br /><br />
              This will create immutable invoice snapshots and record an audit entry in the generation log. Any existing invoices will be idempotently preserved.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={executeLoading}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50"
              >
                {executeLoading ? 'Generating Invoices...' : 'Yes, Confirm & Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log / Run History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Generation Audit Log & History
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable log of batch generation executions with recorded audit metrics.
            </p>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No fee generation runs recorded yet for this session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Session</th>
                  <th className="py-3 px-4">Students</th>
                  <th className="py-3 px-4">Created / Skipped</th>
                  <th className="py-3 px-4">Gross Total</th>
                  <th className="py-3 px-4">Net Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Executed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {new Date(run.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {run.academicYear?.name || 'Academic Session'}
                    </td>
                    <td className="py-3 px-4 font-medium">{run.totalStudents}</td>
                    <td className="py-3 px-4 font-mono">
                      <span className="text-emerald-700 font-bold">{run.totalInvoicesCreated} created</span>
                      {run.totalInvoicesSkipped > 0 && (
                        <span className="text-slate-400"> ({run.totalInvoicesSkipped} skipped)</span>
                      )}
                    </td>
                    <td className="py-3 px-4">{formatCurrency(run.totalGrossAmount)}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(run.totalNetAmount)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          run.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {run.executedBy?.name || 'Administrator'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
