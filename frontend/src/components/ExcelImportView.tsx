import React, { useState, useEffect, useRef } from 'react';
import {
  excelImportsApi,
  metaApi,
  AcademicYear,
  ImportType,
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
  Calendar,
  RefreshCw,
  FileCheck,
  ShieldAlert,
  Users,
  CreditCard,
  Info,
} from 'lucide-react';

export const ExcelImportView: React.FC = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [importType, setImportType] = useState<ImportType>('STUDENT_MASTER');

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Async states
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true);
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

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      setLoadingMeta(true);
      const years = await metaApi.getAcademicYears();
      setAcademicYears(years);
      if (years.length > 0) {
        const current = years.find((y) => y.isCurrent) || years[0];
        setSelectedAcademicYearId(current.id);
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to load academic sessions');
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      setErrorMessage(null);
      const blob = await excelImportsApi.downloadTemplate(importType);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${importType.toLowerCase()}_template.xlsx`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || err.response?.data?.message || 'Failed to download template');
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
      setErrorMessage('Please select an academic session');
      return;
    }

    try {
      setPreviewLoading(true);
      setErrorMessage(null);
      setBatchErrors([]);
      const res = await excelImportsApi.preview(file, importType, selectedAcademicYearId);
      setPreviewData(res);
      setActiveTab('ALL');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to parse and validate spreadsheet');
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
        importType: previewData.importType,
        academicYearId: previewData.academicYearId,
        rows: previewData.validRows,
      });
      setConfirmResult(res);
      setShowConfirmModal(false);
    } catch (err: any) {
      const data = err.response?.data;
      const msg = Array.isArray(data?.message)
        ? data.message.join('; ')
        : data?.message || 'Failed to execute import. The batch was rejected and zero records were written.';
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
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">Excel Data Import Engine</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Secure, tenant-isolated bulk data onboarding with preview validation, duplicate detection, and strict all-or-nothing atomic confirmation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Academic Session Selector */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={selectedAcademicYearId}
              onChange={(e) => {
                setSelectedAcademicYearId(e.target.value);
                setPreviewData(null);
                setConfirmResult(null);
              }}
              disabled={loadingMeta || previewLoading || confirmLoading}
              className="bg-transparent text-xs font-semibold text-slate-700 outline-hidden cursor-pointer"
            >
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name} {ay.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Download Template Button */}
          <button
            onClick={handleDownloadTemplate}
            disabled={downloadingTemplate || previewLoading || confirmLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200 shadow-2xs"
          >
            {downloadingTemplate ? (
              <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
            ) : (
              <Download className="w-4 h-4 text-indigo-600" />
            )}
            Download Template
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-rose-900">Import Rejected / Rolled Back</h3>
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

      {/* Step 1 & 2: Configuration & Upload (shown if not yet confirmed) */}
      {!confirmResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          {/* Import Type Switcher */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Select Import Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setImportType('STUDENT_MASTER');
                  setFile(null);
                  setPreviewData(null);
                  setConfirmResult(null);
                }}
                className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 ${
                  importType === 'STUDENT_MASTER'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`p-2.5 rounded-lg ${
                    importType === 'STUDENT_MASTER'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Student Master Records</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Bulk onboarding of students with admission numbers, class & section assignments, roll numbers, and guardian details.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setImportType('FEE_ALLOCATION');
                  setFile(null);
                  setPreviewData(null);
                  setConfirmResult(null);
                }}
                className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 ${
                  importType === 'FEE_ALLOCATION'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`p-2.5 rounded-lg ${
                    importType === 'FEE_ALLOCATION'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Fee Structure Allocations</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Assign grade-matching fee structures and optional concessions (flat or percentage) to existing students.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Upload Spreadsheet File (.xlsx)
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
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
                    <div className="p-3 bg-emerald-100 text-emerald-700 rounded-full mb-3">
                      <FileCheck className="w-8 h-8" />
                    </div>
                    <span className="text-sm font-bold text-slate-800">{file.name}</span>
                    <span className="text-xs text-slate-500 mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB • Ready for preview
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        resetAll();
                      }}
                      className="mt-3 text-xs font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-3">
                      <UploadCloud className="w-8 h-8" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">
                      Click to browse or drag & drop spreadsheet here
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      Supports Excel .xlsx files up to 5MB (max 1,000 rows) • Accepted dates: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Info className="w-4 h-4 text-slate-400" />
              Previewing parses and validates rows without making any database changes. Accepted date formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.
            </div>

            <button
              onClick={handlePreview}
              disabled={!file || previewLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {previewLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzing Spreadsheet...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  Upload & Preview
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Validation Table */}
      {previewData && !confirmResult && (
        <div className="space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              onClick={() => setActiveTab('ALL')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                activeTab === 'ALL'
                  ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/20 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-xs font-medium text-slate-500">Total Rows</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{previewData.totalRows}</div>
              <div className="text-[11px] text-slate-400 mt-1">Found in file</div>
            </div>

            <div
              onClick={() => setActiveTab('VALID')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                activeTab === 'VALID'
                  ? 'border-emerald-600 bg-emerald-50/30 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-emerald-200'
              }`}
            >
              <div className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Valid Rows
              </div>
              <div className="text-2xl font-black text-emerald-600 mt-1">{previewData.validCount}</div>
              <div className="text-[11px] text-emerald-600/80 mt-1">Ready to import</div>
            </div>

            <div
              onClick={() => setActiveTab('INVALID')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                activeTab === 'INVALID'
                  ? 'border-rose-600 bg-rose-50/30 ring-2 ring-rose-500/20 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-rose-200'
              }`}
            >
              <div className="text-xs font-medium text-rose-700 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                Invalid Rows
              </div>
              <div className="text-2xl font-black text-rose-600 mt-1">{previewData.invalidCount}</div>
              <div className="text-[11px] text-rose-600/80 mt-1">Validation errors</div>
            </div>

            <div
              onClick={() => setActiveTab('DUPLICATES')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
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
              <div className="text-[11px] text-amber-600/80 mt-1">Already exist / redundant</div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Table Filters & Actions Header */}
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Rows ({previewData.totalRows})
                </button>
                <button
                  onClick={() => setActiveTab('VALID')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === 'VALID'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  Valid ({previewData.validCount})
                </button>
                <button
                  onClick={() => setActiveTab('INVALID')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === 'INVALID'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  Invalid ({previewData.invalidCount})
                </button>
                <button
                  onClick={() => setActiveTab('DUPLICATES')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === 'DUPLICATES'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  Duplicates ({previewData.duplicateCount})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={previewData.validCount === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm & Import ({previewData.validCount} Records)
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Row</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    {previewData.importType === 'STUDENT_MASTER' ? (
                      <>
                        <th className="py-3 px-4 font-semibold">Admission #</th>
                        <th className="py-3 px-4 font-semibold">Student Name</th>
                        <th className="py-3 px-4 font-semibold">Grade</th>
                        <th className="py-3 px-4 font-semibold">Section</th>
                        <th className="py-3 px-4 font-semibold">Roll #</th>
                        <th className="py-3 px-4 font-semibold">Guardian Info</th>
                        <th className="py-3 px-4 font-semibold">Validation Notes</th>
                      </>
                    ) : (
                      <>
                        <th className="py-3 px-4 font-semibold">Admission #</th>
                        <th className="py-3 px-4 font-semibold">Student Name</th>
                        <th className="py-3 px-4 font-semibold">Fee Structure</th>
                        <th className="py-3 px-4 font-semibold">Concession</th>
                        <th className="py-3 px-4 font-semibold">Start Month</th>
                        <th className="py-3 px-4 font-semibold">Validation Notes</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {/* Valid Rows */}
                  {(activeTab === 'ALL' || activeTab === 'VALID') &&
                    previewData.validRows.map((row, idx) => (
                      <tr key={`valid-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-500">
                          {row.rowNumber}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            VALID
                          </span>
                        </td>
                        {previewData.importType === 'STUDENT_MASTER' ? (
                          <>
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              {row.admissionNumber}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-800">
                              {row.firstName} {row.lastName || ''}
                            </td>
                            <td className="py-3 px-4 font-medium text-indigo-700">
                              {row.gradeName || row.gradeCode}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{row.sectionName || row.section || '-'}</td>
                            <td className="py-3 px-4 font-mono text-slate-500">{row.rollNumber || '-'}</td>
                            <td className="py-3 px-4 text-slate-500">
                              {row.guardianName ? (
                                <div>
                                  <span className="font-medium text-slate-700">{row.guardianName}</span>
                                  {row.guardianPhone && (
                                    <div className="text-[10px] text-slate-400">{row.guardianPhone}</div>
                                  )}
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-3 px-4 text-emerald-600 text-[11px] font-medium">
                              Ready for insertion
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              {row.admissionNumber}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-800">
                              {row.studentName || '-'}
                            </td>
                            <td className="py-3 px-4 font-medium text-indigo-700">
                              {row.feeStructureName}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {row.concessionType && row.concessionType !== 'NONE' ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                                  {row.concessionType === 'PERCENTAGE'
                                    ? `${row.concessionValue}%`
                                    : `₹${row.concessionValue}`}
                                </span>
                              ) : (
                                'None'
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600">
                              Month {row.startBillingMonth || 1}
                            </td>
                            <td className="py-3 px-4 text-emerald-600 text-[11px] font-medium">
                              Ready for allocation
                            </td>
                          </>
                        )}
                      </tr>
                    ))}

                  {/* Duplicate Rows */}
                  {(activeTab === 'ALL' || activeTab === 'DUPLICATES') &&
                    previewData.duplicateRows.map((row, idx) => (
                      <tr key={`dup-${idx}`} className="bg-amber-50/40 hover:bg-amber-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-500">
                          {row.rowNumber}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3" />
                            DUPLICATE
                          </span>
                        </td>
                        {previewData.importType === 'STUDENT_MASTER' ? (
                          <>
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              {row.admissionNumber}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">
                              {row.data?.firstName} {row.data?.lastName || ''}
                            </td>
                            <td className="py-3 px-4 text-slate-500">{row.data?.gradeCode || '-'}</td>
                            <td className="py-3 px-4 text-slate-500">{row.data?.section || '-'}</td>
                            <td className="py-3 px-4 text-slate-500">{row.data?.rollNumber || '-'}</td>
                            <td className="py-3 px-4 text-slate-400">-</td>
                            <td className="py-3 px-4 text-amber-700 text-[11px] font-medium">
                              {row.reason}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              {row.admissionNumber}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">
                              {row.data?.studentName || '-'}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {row.data?.feeStructureName || '-'}
                            </td>
                            <td className="py-3 px-4 text-slate-400">-</td>
                            <td className="py-3 px-4 text-slate-400">-</td>
                            <td className="py-3 px-4 text-amber-700 text-[11px] font-medium">
                              {row.reason}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}

                  {/* Invalid Rows */}
                  {(activeTab === 'ALL' || activeTab === 'INVALID') &&
                    previewData.invalidRows.map((row, idx) => (
                      <tr key={`inv-${idx}`} className="bg-rose-50/40 hover:bg-rose-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-500">
                          {row.rowNumber}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            <XCircle className="w-3 h-3" />
                            INVALID
                          </span>
                        </td>
                        {previewData.importType === 'STUDENT_MASTER' ? (
                          <>
                            <td className="py-3 px-4 font-mono font-bold text-rose-800">
                              {row.data?.admissionNumber || '(missing)'}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">
                              {row.data?.firstName || '(missing)'} {row.data?.lastName || ''}
                            </td>
                            <td className="py-3 px-4 text-slate-500">{row.data?.gradeCode || '-'}</td>
                            <td className="py-3 px-4 text-slate-500">{row.data?.section || '-'}</td>
                            <td className="py-3 px-4 text-slate-500">{row.data?.rollNumber || '-'}</td>
                            <td className="py-3 px-4 text-slate-400">-</td>
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                {row.errors.map((err, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="inline-block bg-rose-100/80 text-rose-800 text-[10px] px-2 py-0.5 rounded font-medium mr-1 mb-0.5"
                                  >
                                    {err}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-4 font-mono font-bold text-rose-800">
                              {row.data?.admissionNumber || '(missing)'}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-700">-</td>
                            <td className="py-3 px-4 text-slate-500">
                              {row.data?.feeStructureName || '(missing)'}
                            </td>
                            <td className="py-3 px-4 text-slate-400">-</td>
                            <td className="py-3 px-4 text-slate-400">-</td>
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                {row.errors.map((err, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="inline-block bg-rose-100/80 text-rose-800 text-[10px] px-2 py-0.5 rounded font-medium mr-1 mb-0.5"
                                  >
                                    {err}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}

                  {previewData.totalRows === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No rows found in uploaded file.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Bulk Import</h3>
                <p className="text-xs text-slate-500 mt-1">
                  You are about to write verified data to the school database.
                </p>
              </div>
            </div>

            <div className="my-5 p-4 bg-slate-50 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Import Type:</span>
                <span className="font-semibold text-slate-800">
                  {previewData.importType === 'STUDENT_MASTER' ? 'Student Master Data' : 'Fee Structure Allocations'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valid Records to Insert:</span>
                <span className="font-bold text-emerald-600">{previewData.validCount} rows</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Invalid Rows to Skip:</span>
                <span className="font-semibold text-rose-600">{previewData.invalidCount} rows</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duplicates to Skip:</span>
                <span className="font-semibold text-amber-600">{previewData.duplicateCount} rows</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800 mb-5">
              <strong>Strict All-or-Nothing Execution:</strong> Only the {previewData.validCount} valid row(s) are submitted for confirmation. The server re-validates the entire batch before writing; if any row fails validation or encounters a database error, the entire transaction is rolled back and zero records are committed.
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={confirmLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Cancel
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
                    Committing Import...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Execute Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Post-Import Confirmation Results */}
      {confirmResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Import Completed Atomically</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                All-or-nothing database transaction succeeded. All accepted records have been committed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Inserted Records</div>
              <div className="text-3xl font-black text-emerald-700 mt-1">{confirmResult.insertedCount}</div>
              <div className="text-xs text-emerald-600 mt-1">Successfully created in database</div>
            </div>

            <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700">Skipped Records</div>
              <div className="text-3xl font-black text-amber-700 mt-1">{confirmResult.skippedCount}</div>
              <div className="text-xs text-amber-600 mt-1">Safely skipped (redundant / duplicate)</div>
            </div>

            <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-200">
              <div className="text-xs font-bold uppercase tracking-wider text-rose-700">Failed Records</div>
              <div className="text-3xl font-black text-rose-700 mt-1">{confirmResult.failedCount}</div>
              <div className="text-xs text-rose-600 mt-1">Validation / integrity errors</div>
            </div>
          </div>

          {confirmResult.errors.length > 0 && (
            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-2">
              <h4 className="text-xs font-bold text-rose-900">Execution Error Details:</h4>
              <ul className="text-xs text-rose-700 space-y-1 list-disc pl-5">
                {confirmResult.errors.map((err, i) => (
                  <li key={i}>
                    Row {err.rowNumber}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={resetAll}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Import Another Spreadsheet
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
