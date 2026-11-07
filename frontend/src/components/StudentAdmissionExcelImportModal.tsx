import React, { useState, useRef, useEffect } from 'react';
import {
  excelImportsApi,
  AcademicYear,
  ImportPreviewResult,
  ImportConfirmResult,
} from '../services/api';
import {
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  FileCheck,
  ShieldAlert,
  Users,
  Info,
  X,
} from 'lucide-react';

interface StudentAdmissionExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  academicYears: AcademicYear[];
  initialAcademicYearId?: string;
  onImportSuccess?: (result: ImportConfirmResult) => void;
}

export const StudentAdmissionExcelImportModal: React.FC<StudentAdmissionExcelImportModalProps> = ({
  isOpen,
  onClose,
  academicYears,
  initialAcademicYearId,
  onImportSuccess,
}) => {
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Async states
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [confirmLoading, setConfirmLoading] = useState<boolean>(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [batchErrors, setBatchErrors] = useState<{ rowNumber: number; message: string }[]>([]);

  // Workflow states
  const [previewData, setPreviewData] = useState<ImportPreviewResult | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'VALID' | 'INVALID' | 'DUPLICATES'>('ALL');
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResult | null>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setPreviewData(null);
      setConfirmResult(null);
      setErrorMessage(null);
      setBatchErrors([]);
      setShowConfirmModal(false);
      if (initialAcademicYearId) {
        setSelectedAcademicYearId(initialAcademicYearId);
      } else if (academicYears.length > 0) {
        const current = academicYears.find((y) => y.isCurrent) || academicYears[0];
        setSelectedAcademicYearId(current.id);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen, initialAcademicYearId, academicYears]);

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      setErrorMessage(null);
      const blob = await excelImportsApi.downloadTemplate('STUDENT_MASTER');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'student_master_template.xlsx');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || err.response?.data?.message || 'Failed to download student master template');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.match(/\.xlsx$/i)) {
        setErrorMessage('Please select a valid Excel (.xlsx) file');
        return;
      }
      setFile(selected);
      setErrorMessage(null);
      setBatchErrors([]);
      setPreviewData(null);
      setConfirmResult(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (!dropped.name.match(/\.xlsx$/i)) {
        setErrorMessage('Please upload a valid Excel (.xlsx) file');
        return;
      }
      setFile(dropped);
      setErrorMessage(null);
      setBatchErrors([]);
      setPreviewData(null);
      setConfirmResult(null);
    }
  };

  const handlePreview = async () => {
    if (!file) {
      setErrorMessage('Please select an Excel file to upload');
      return;
    }
    if (!selectedAcademicYearId) {
      setErrorMessage('Please select an academic session for the admission import');
      return;
    }

    try {
      setPreviewLoading(true);
      setErrorMessage(null);
      setBatchErrors([]);
      const res = await excelImportsApi.preview(file, 'STUDENT_MASTER', selectedAcademicYearId);
      setPreviewData(res);
      setActiveTab('ALL');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to parse and validate student spreadsheet');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || previewData.validRows.length === 0) return;

    try {
      setConfirmLoading(true);
      setErrorMessage(null);
      setBatchErrors([]);
      const res = await excelImportsApi.confirm({
        importType: 'STUDENT_MASTER',
        academicYearId: previewData.academicYearId,
        rows: previewData.validRows,
      });
      setConfirmResult(res);
      setShowConfirmModal(false);
      if (onImportSuccess) {
        onImportSuccess(res);
      }
    } catch (err: any) {
      const data = err.response?.data;
      const msg = Array.isArray(data?.message)
        ? data.message.join('; ')
        : data?.message || 'Failed to execute student import. The batch was rejected and zero records were written.';
      setErrorMessage(msg);
      if (Array.isArray(data?.errors)) {
        setBatchErrors(data.errors);
      }
      setShowConfirmModal(false);
    } finally {
      setConfirmLoading(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setPreviewData(null);
    setConfirmResult(null);
    setErrorMessage(null);
    setBatchErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-import-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-4xl w-full my-8 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 id="student-import-dialog-title" className="text-lg font-bold text-slate-900 leading-tight">
                Bulk Student Admission via Excel
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload official Student Master spreadsheet with automated validation, duplicate check, and atomic ingestion.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate || previewLoading || confirmLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 transition-colors border border-slate-200 shadow-2xs"
              title="Download standard Excel admission template"
            >
              {downloadingTemplate ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
              ) : (
                <Download className="w-3.5 h-3.5 text-indigo-600" />
              )}
              <span>Download Template</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-rose-900">Import Verification Notice</h3>
                <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
                {batchErrors.length > 0 && (
                  <ul className="mt-2 text-xs text-rose-700 list-disc pl-5 space-y-1">
                    {batchErrors.map((err, i) => (
                      <li key={i}>
                        Row {err.rowNumber}: {err.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => {
                  setErrorMessage(null);
                  setBatchErrors([]);
                }}
                className="text-rose-500 hover:text-rose-700 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Step 1: Upload & Configure (if no preview and no confirmation result yet) */}
          {!previewData && !confirmResult && (
            <div className="space-y-6">
              {/* Instructions Callout */}
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-900 space-y-2">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-indigo-600" />
                  Standardized Student Admission Template Guidelines:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-indigo-800 leading-relaxed">
                  <li>
                    <strong>Mandatory Columns:</strong> Admission Number*, First Name*, Last Name*, Grade Code*, Section*.
                  </li>
                  <li>
                    <strong>Grade & Section Matching:</strong> Grade Code and Section must exist in your active school directory.
                  </li>
                  <li>
                    <strong>Date Formats:</strong> Date of Birth and Admission Date accept <code className="font-mono bg-indigo-100 px-1 py-0.5 rounded">YYYY-MM-DD</code>, <code className="font-mono bg-indigo-100 px-1 py-0.5 rounded">DD/MM/YYYY</code>, or native Excel calendar dates.
                  </li>
                  <li>
                    <strong>Security:</strong> All admissions are scoped strictly to your authenticated school tenant context.
                  </li>
                </ul>
              </div>

              {/* Target Academic Session Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Target Academic Session <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedAcademicYearId}
                  onChange={(e) => setSelectedAcademicYearId(e.target.value)}
                  className="w-full sm:w-80 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="">Select Academic Session</option>
                  {academicYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>
                      {ay.name} {ay.isCurrent ? '(Current Session)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Drag-and-Drop Upload Area */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Select Completed Spreadsheet (.xlsx)
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/60'
                      : file
                      ? 'border-emerald-300 bg-emerald-50/20'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="flex flex-col items-center">
                    {file ? (
                      <>
                        <div className="p-3.5 bg-emerald-100 text-emerald-700 rounded-2xl mb-3 shadow-xs">
                          <FileCheck className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-bold text-slate-900">{file.name}</span>
                        <span className="text-xs text-slate-500 mt-1">
                          {(file.size / 1024).toFixed(1)} KB • Ready for preview verification
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            resetAll();
                          }}
                          className="mt-3 px-3 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          Change file
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl mb-3 shadow-xs">
                          <UploadCloud className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-semibold text-slate-800">
                          Click to browse or drag & drop spreadsheet here
                        </span>
                        <span className="text-xs text-slate-400 mt-1">
                          Supports Excel .xlsx files up to 5MB (max 1,000 rows per batch)
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload & Preview Action */}
              <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!file || !selectedAcademicYearId || previewLoading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {previewLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Analyzing & Validating...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4" />
                      Preview & Validate Records
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Verification Preview Results */}
          {previewData && !confirmResult && (
            <div className="space-y-6">
              {/* Top Banner with File Details */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-slate-700">Validated File: {file?.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{previewData.summaryMessage}</div>
                </div>
                <button
                  type="button"
                  onClick={resetAll}
                  className="self-start sm:self-auto text-xs font-semibold text-slate-600 hover:text-slate-800 underline"
                >
                  Upload different file
                </button>
              </div>

              {/* Metric Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  onClick={() => setActiveTab('ALL')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    activeTab === 'ALL'
                      ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-medium text-slate-500">Total Rows</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{previewData.totalRows}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Parsed from sheet</div>
                </div>

                <div
                  onClick={() => setActiveTab('VALID')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    activeTab === 'VALID'
                      ? 'border-emerald-600 bg-emerald-50/30 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-emerald-200'
                  }`}
                >
                  <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Valid Records
                  </div>
                  <div className="text-2xl font-black text-emerald-600 mt-1">{previewData.validCount}</div>
                  <div className="text-[11px] text-emerald-600/80 mt-0.5">Eligible to import</div>
                </div>

                <div
                  onClick={() => setActiveTab('INVALID')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    activeTab === 'INVALID'
                      ? 'border-rose-600 bg-rose-50/30 ring-2 ring-rose-500/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-rose-200'
                  }`}
                >
                  <div className="text-xs font-medium text-rose-700 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    Invalid Records
                  </div>
                  <div className="text-2xl font-black text-rose-600 mt-1">{previewData.invalidCount}</div>
                  <div className="text-[11px] text-rose-600/80 mt-0.5">Contain errors</div>
                </div>

                <div
                  onClick={() => setActiveTab('DUPLICATES')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    activeTab === 'DUPLICATES'
                      ? 'border-amber-600 bg-amber-50/30 ring-2 ring-amber-500/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-amber-200'
                  }`}
                >
                  <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Duplicates
                  </div>
                  <div className="text-2xl font-black text-amber-600 mt-1">{previewData.duplicateCount}</div>
                  <div className="text-[11px] text-amber-600/80 mt-0.5">Existing / Repeated</div>
                </div>
              </div>

              {/* Records Inspection Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('ALL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        activeTab === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All ({previewData.totalRows})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('VALID')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        activeTab === 'VALID' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      Valid ({previewData.validCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('INVALID')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        activeTab === 'INVALID' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                    >
                      Invalid ({previewData.invalidCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('DUPLICATES')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        activeTab === 'DUPLICATES' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      Duplicates ({previewData.duplicateCount})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={previewData.validCount === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm & Admit ({previewData.validCount} Students)
                  </button>
                </div>

                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Row</th>
                        <th className="py-2.5 px-3 font-semibold">Status</th>
                        <th className="py-2.5 px-3 font-semibold">Admission #</th>
                        <th className="py-2.5 px-3 font-semibold">Student Name</th>
                        <th className="py-2.5 px-3 font-semibold">Grade</th>
                        <th className="py-2.5 px-3 font-semibold">Section</th>
                        <th className="py-2.5 px-3 font-semibold">Roll #</th>
                        <th className="py-2.5 px-3 font-semibold">Validation Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Valid Rows */}
                      {(activeTab === 'ALL' || activeTab === 'VALID') &&
                        previewData.validRows.map((row) => (
                          <tr key={`val-${row.rowNumber}`} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-400">{row.rowNumber}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Valid
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{row.admissionNumber}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">{row.firstName} {row.lastName}</td>
                            <td className="py-2.5 px-3">{row.gradeCode}</td>
                            <td className="py-2.5 px-3">{row.section}</td>
                            <td className="py-2.5 px-3 font-mono">{row.rollNumber || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-400">Ready for admission</td>
                          </tr>
                        ))}

                      {/* Duplicate Rows */}
                      {(activeTab === 'ALL' || activeTab === 'DUPLICATES') &&
                        previewData.duplicateRows.map((row) => (
                          <tr key={`dup-${row.rowNumber}`} className="bg-amber-50/30 hover:bg-amber-50/50">
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-400">{row.rowNumber}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3" /> Duplicate
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-900">{row.admissionNumber}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-700">{row.data?.firstName} {row.data?.lastName}</td>
                            <td className="py-2.5 px-3">{row.data?.gradeCode || '—'}</td>
                            <td className="py-2.5 px-3">{row.data?.section || '—'}</td>
                            <td className="py-2.5 px-3 font-mono">{row.data?.rollNumber || '—'}</td>
                            <td className="py-2.5 px-3 text-amber-800 font-medium">{row.reason}</td>
                          </tr>
                        ))}

                      {/* Invalid Rows */}
                      {(activeTab === 'ALL' || activeTab === 'INVALID') &&
                        previewData.invalidRows.map((row) => (
                          <tr key={`inv-${row.rowNumber}`} className="bg-rose-50/30 hover:bg-rose-50/50">
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-400">{row.rowNumber}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                                <XCircle className="w-3 h-3" /> Invalid
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-rose-900">{row.data?.admissionNumber || '(missing)'}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-700">{row.data?.firstName || ''} {row.data?.lastName || ''}</td>
                            <td className="py-2.5 px-3">{row.data?.gradeCode || '—'}</td>
                            <td className="py-2.5 px-3">{row.data?.section || '—'}</td>
                            <td className="py-2.5 px-3 font-mono">{row.data?.rollNumber || '—'}</td>
                            <td className="py-2.5 px-3">
                              <div className="space-y-0.5">
                                {row.errors.map((err, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="inline-block bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0.5 rounded font-medium mr-1"
                                  >
                                    {err}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}

                      {previewData.totalRows === 0 && (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            No student records found in uploaded file.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation Summary Results */}
          {confirmResult && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Student Admissions Committed Atomically</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Database transaction succeeded. All verified records have been committed to your school tenant.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">Admitted Students</div>
                  <div className="text-3xl font-black text-emerald-700 mt-1">{confirmResult.insertedCount}</div>
                  <div className="text-[11px] text-emerald-600 mt-1">Successfully inserted</div>
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-800">Skipped Records</div>
                  <div className="text-3xl font-black text-amber-700 mt-1">{confirmResult.skippedCount}</div>
                  <div className="text-[11px] text-amber-600 mt-1">Pre-existing admission numbers</div>
                </div>

                <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-800">Failed Records</div>
                  <div className="text-3xl font-black text-rose-700 mt-1">{confirmResult.failedCount}</div>
                  <div className="text-[11px] text-rose-600 mt-1">Validation errors</div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Done & View Student Directory
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer (for Step 1 or Step 2 when not confirmed) */}
        {!confirmResult && (
          <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div>
              Server-enforced validation • Powered by <span className="font-semibold text-slate-700">ExcelJS & Prisma</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Sub-Modal */}
      {showConfirmModal && previewData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Confirm Student Ingestion</h4>
                <p className="text-xs text-slate-500 mt-1">
                  You are about to insert <strong>{previewData.validCount} verified student records</strong> into the active school directory.
                </p>
              </div>
            </div>

            <div className="my-4 p-3.5 bg-slate-50 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Valid Records:</span>
                <span className="font-bold text-emerald-600">{previewData.validCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Excluded (Invalid / Duplicates):</span>
                <span className="font-semibold text-rose-600">
                  {previewData.invalidCount + previewData.duplicateCount}
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 mb-5">
              <strong>Atomic Transaction Guarantee:</strong> Only valid rows will be committed. If any unexpected error occurs during database write, the transaction automatically rolls back.
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={confirmLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={confirmLoading}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-xs"
              >
                {confirmLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Committing Ingestion...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Execute Admission
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
