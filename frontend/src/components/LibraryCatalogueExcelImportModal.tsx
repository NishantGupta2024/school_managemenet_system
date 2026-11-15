import React, { useState, useRef, useEffect } from 'react';
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
  BookOpen,
  X,
} from 'lucide-react';
import {
  libraryApi,
  CatalogueImportPreviewResult,
  CatalogueImportConfirmResult,
} from '../services/library.api';

interface LibraryCatalogueExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
}

export const LibraryCatalogueExcelImportModal: React.FC<LibraryCatalogueExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Async states
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [confirmLoading, setConfirmLoading] = useState<boolean>(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Workflow states
  const [previewData, setPreviewData] = useState<CatalogueImportPreviewResult | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'VALID' | 'INVALID' | 'DUPLICATES'>('ALL');
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirmResult, setConfirmResult] = useState<CatalogueImportConfirmResult | null>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setPreviewData(null);
      setConfirmResult(null);
      setErrorMessage(null);
      setShowConfirmModal(false);
      setActiveTab('ALL');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      setErrorMessage(null);
      const blob = await libraryApi.downloadCatalogueTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'library_catalogue_template.xlsx');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch (err: any) {
      setErrorMessage(
        err.message || err.response?.data?.message || 'Failed to download library catalogue template.',
      );
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.match(/\.xlsx$/i)) {
        setErrorMessage('Only .xlsx spreadsheet files are accepted. Please select a valid Excel file.');
        return;
      }
      if (selected.size > 5 * 1024 * 1024) {
        setErrorMessage('File size exceeds 5MB limit. Please split your collection into smaller files.');
        return;
      }
      setFile(selected);
      setErrorMessage(null);
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
        setErrorMessage('Only .xlsx spreadsheet files are accepted.');
        return;
      }
      if (dropped.size > 5 * 1024 * 1024) {
        setErrorMessage('File size exceeds 5MB limit.');
        return;
      }
      setFile(dropped);
      setErrorMessage(null);
      setPreviewData(null);
      setConfirmResult(null);
    }
  };

  const handlePreview = async () => {
    if (!file) {
      setErrorMessage('Please select an Excel file to upload.');
      return;
    }

    try {
      setPreviewLoading(true);
      setErrorMessage(null);
      const res = await libraryApi.previewCatalogueImport(file);
      setPreviewData(res);
      setActiveTab('ALL');
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message ||
          err.message ||
          'Failed to parse and validate library catalogue spreadsheet.',
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || !previewData.canImport || previewData.validRows.length === 0) return;

    try {
      setConfirmLoading(true);
      setErrorMessage(null);
      const res = await libraryApi.confirmCatalogueImport(previewData.validRows);
      setConfirmResult(res);
      setShowConfirmModal(false);
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err: any) {
      const data = err.response?.data;
      const msg = Array.isArray(data?.message)
        ? data.message.join('; ')
        : data?.message || 'Failed to execute catalogue import. Entire batch was rolled back.';
      setErrorMessage(msg);
      setShowConfirmModal(false);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!previewData) return;

    // Build CSV content for error and duplicate rows
    const headers = [
      'Row Number',
      'Issue Type',
      'Accession Number',
      'Book Title',
      'Author',
      'Category',
      'Condition',
      'Failure Reasons',
    ];
    const csvRows: string[][] = [headers];

    // Add invalid rows
    previewData.invalidRows.forEach((r) => {
      csvRows.push([
        r.rowNumber.toString(),
        'VALIDATION_ERROR',
        `"${(r.data?.accessionNumber || '').replace(/"/g, '""')}"`,
        `"${(r.data?.title || '').replace(/"/g, '""')}"`,
        `"${(r.data?.author || '').replace(/"/g, '""')}"`,
        `"${(r.data?.category || '').replace(/"/g, '""')}"`,
        `"${(r.data?.condition || '').replace(/"/g, '""')}"`,
        `"${r.errors.join('; ').replace(/"/g, '""')}"`,
      ]);
    });

    // Add duplicate rows
    previewData.duplicateRows.forEach((r) => {
      csvRows.push([
        r.rowNumber.toString(),
        'DUPLICATE_ENTRY',
        `"${(r.accessionNumber || '').replace(/"/g, '""')}"`,
        `"${(r.data?.title || '').replace(/"/g, '""')}"`,
        `"${(r.data?.author || '').replace(/"/g, '""')}"`,
        `"${(r.data?.category || '').replace(/"/g, '""')}"`,
        `"${(r.data?.condition || '').replace(/"/g, '""')}"`,
        `"${r.reason.replace(/"/g, '""')}"`,
      ]);
    });

    const csvContent = csvRows.map((e) => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `catalogue_import_errors_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 1000);
  };

  const resetAll = () => {
    setFile(null);
    setPreviewData(null);
    setConfirmResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-import-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full my-8 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2
                id="library-import-dialog-title"
                className="text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                Import Library Catalogue
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Bulk register book titles and physical copies from an Excel workbook (.xlsx)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Global Alert Notification */}
          {errorMessage && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-start gap-3 text-rose-800 dark:text-rose-200 animate-in fade-in">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold">Import Verification Alert: </span>
                {errorMessage}
              </div>
            </div>
          )}

          {/* Step 1: Upload & Initial State */}
          {!previewData && !confirmResult && (
            <div className="space-y-6">
              {/* Template Download Card */}
              <div className="p-5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Download Official Catalogue Template
                  </div>
                  <p className="text-xs text-indigo-900 dark:text-indigo-300 font-medium">
                    Pre-formatted workbook with required headers, one-row-per-copy convention, and allowed condition guidance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={downloadingTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs shrink-0 disabled:opacity-50"
                >
                  {downloadingTemplate ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download .xlsx Template
                </button>
              </div>

              {/* Instructions Summary Pill */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  <div className="font-bold text-slate-900 dark:text-slate-100 mb-1">One Row Per Copy</div>
                  Each physical copy requires its own row with a mandatory, distinct Accession Number.
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  <div className="font-bold text-slate-900 dark:text-slate-100 mb-1">Allowed Conditions</div>
                  Accepts strictly <strong>NEW</strong>, <strong>GOOD</strong>, or <strong>FAIR</strong>. Blank defaults to GOOD.
                </div>
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  <div className="font-bold text-slate-900 dark:text-slate-100 mb-1">All-or-Nothing Policy</div>
                  Zero error tolerance. If any row is invalid or duplicate, the whole import is blocked.
                </div>
              </div>

              {/* Drag & Drop Upload Zone */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-300 mb-2">
                  Select Excel Workbook (.xlsx)
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                      : file
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/20 dark:bg-emerald-950/20'
                      : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/50 dark:bg-slate-800/30'
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
                        <div className="p-3.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-2xl mb-3 shadow-xs">
                          <FileCheck className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{file.name}</span>
                        <span className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                          {(file.size / 1024).toFixed(1)} KB • Ready for preview verification
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            resetAll();
                          }}
                          className="mt-3 px-3 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                        >
                          Change file
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl mb-3 shadow-xs">
                          <UploadCloud className="w-8 h-8" />
                        </div>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          Click to browse or drag & drop spreadsheet here
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Supports Excel .xlsx files up to 5MB (max 1,000 rows per batch)
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload & Preview Action */}
              <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!file || previewLoading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {previewLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Analyzing & Validating Catalogue...
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Validated File: {file?.name}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-medium">
                    {previewData.summaryMessage}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetAll}
                  className="self-start sm:self-auto text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline"
                >
                  Upload different file
                </button>
              </div>

              {/* Strict All-or-Nothing Notification Banner */}
              {!previewData.canImport ? (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-rose-900 dark:text-rose-200">
                        Import Blocked by Strict All-or-Nothing Policy
                      </div>
                      <div className="text-xs text-rose-900 dark:text-rose-300 mt-0.5 font-medium">
                        Found {previewData.invalidCount} invalid rows and {previewData.duplicateCount} duplicate copies. All rows must be valid before any records can be committed.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadErrorReport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shrink-0 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Error Report (.csv)
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-2xl flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="text-xs text-emerald-950 dark:text-emerald-200 font-medium">
                    <strong className="font-bold">All {previewData.validCount} rows verified successfully! </strong>
                    Ready to commit {previewData.validCount} physical copies ({previewData.newTitlesCount} new titles to create, {previewData.existingTitlesCount} existing titles receiving copies).
                  </div>
                </div>
              )}

              {/* Metric Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  onClick={() => setActiveTab('ALL')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    activeTab === 'ALL'
                      ? 'border-indigo-600 bg-white dark:bg-slate-800 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-400">Total Rows</div>
                  <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                    {previewData.totalRows}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Parsed from sheet</div>
                </div>

                <div
                  onClick={() => setActiveTab('VALID')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    activeTab === 'VALID'
                      ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-200'
                  }`}
                >
                  <div className="text-xs font-bold text-emerald-900 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Valid Copies
                  </div>
                  <div className="text-2xl font-black text-emerald-800 dark:text-emerald-400 mt-1">
                    {previewData.validCount}
                  </div>
                  <div className="text-[11px] text-emerald-800 dark:text-emerald-400 font-medium mt-0.5">
                    Ready to import
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab('INVALID')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    activeTab === 'INVALID'
                      ? 'border-rose-600 bg-rose-50/40 dark:bg-rose-950/30 ring-2 ring-rose-500/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-rose-200'
                  }`}
                >
                  <div className="text-xs font-bold text-rose-900 dark:text-rose-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    Invalid Records
                  </div>
                  <div className="text-2xl font-black text-rose-800 dark:text-rose-400 mt-1">
                    {previewData.invalidCount}
                  </div>
                  <div className="text-[11px] text-rose-800 dark:text-rose-400 font-medium mt-0.5">Contain errors</div>
                </div>

                <div
                  onClick={() => setActiveTab('DUPLICATES')}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    activeTab === 'DUPLICATES'
                      ? 'border-amber-600 bg-amber-50/40 dark:bg-amber-950/30 ring-2 ring-amber-500/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-200'
                  }`}
                >
                  <div className="text-xs font-bold text-amber-950 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Duplicates
                  </div>
                  <div className="text-2xl font-black text-amber-800 dark:text-amber-400 mt-1">
                    {previewData.duplicateCount}
                  </div>
                  <div className="text-[11px] text-amber-900 dark:text-amber-400 font-medium mt-0.5">In file or database</div>
                </div>
              </div>

              {/* Records Inspection Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('ALL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        activeTab === 'ALL'
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      All ({previewData.totalRows})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('VALID')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        activeTab === 'VALID'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:border-transparent dark:bg-emerald-950/50 dark:text-emerald-400 hover:bg-emerald-200'
                      }`}
                    >
                      Valid ({previewData.validCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('INVALID')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        activeTab === 'INVALID'
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-100 text-rose-900 border border-rose-300 dark:border-transparent dark:bg-rose-950/50 dark:text-rose-400 hover:bg-rose-200'
                      }`}
                    >
                      Invalid ({previewData.invalidCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('DUPLICATES')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        activeTab === 'DUPLICATES'
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-100 text-amber-950 border border-amber-300 dark:border-transparent dark:bg-amber-950/50 dark:text-amber-400 hover:bg-amber-200'
                      }`}
                    >
                      Duplicates ({previewData.duplicateCount})
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-80">
                  <table className="w-full min-w-[700px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300">
                        <th className="py-2.5 px-3 w-16">Row</th>
                        <th className="py-2.5 px-3 w-24">Status</th>
                        <th className="py-2.5 px-3">Accession #</th>
                        <th className="py-2.5 px-3">Book Title</th>
                        <th className="py-2.5 px-3">Author</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Condition</th>
                        <th className="py-2.5 px-3">Details / Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {/* Valid Rows */}
                      {(activeTab === 'ALL' || activeTab === 'VALID') &&
                        previewData.validRows.map((row) => (
                          <tr key={`v-${row.rowNumber}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{row.rowNumber}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-900 border border-emerald-300 dark:border-transparent bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700 dark:text-emerald-400" /> Valid
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                              {row.accessionNumber}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                              {row.title}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.author}</td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.category}</td>
                            <td className="py-2.5 px-3">
                              <span className="text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200 dark:border-transparent dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 rounded">
                                {row.condition || 'GOOD'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                              {row.rackLocation ? `Rack: ${row.rackLocation}` : 'Ready for shelf'}
                            </td>
                          </tr>
                        ))}

                      {/* Duplicate Rows */}
                      {(activeTab === 'ALL' || activeTab === 'DUPLICATES') &&
                        previewData.duplicateRows.map((row) => (
                          <tr
                            key={`dup-${row.rowNumber}`}
                            className="bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50/80"
                          >
                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{row.rowNumber}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-950 border border-amber-300 dark:border-transparent bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3 text-amber-700 dark:text-amber-400" /> Duplicate
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-950 dark:text-amber-300">
                              {row.accessionNumber}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-200">
                              {row.data?.title || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.data?.author || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.data?.category || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.data?.condition || '—'}</td>
                            <td className="py-2.5 px-3 text-amber-950 dark:text-amber-300 font-medium">
                              {row.reason}
                            </td>
                          </tr>
                        ))}

                      {/* Invalid Rows */}
                      {(activeTab === 'ALL' || activeTab === 'INVALID') &&
                        previewData.invalidRows.map((row) => (
                          <tr
                            key={`inv-${row.rowNumber}`}
                            className="bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-50/80"
                          >
                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{row.rowNumber}</td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-950 border border-rose-300 dark:border-transparent bg-rose-100 dark:bg-rose-950 dark:text-rose-300 px-2 py-0.5 rounded-full">
                                <XCircle className="w-3 h-3 text-rose-700 dark:text-rose-400" /> Invalid
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-rose-950 dark:text-rose-300">
                              {row.data?.accessionNumber || '(missing)'}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-200">
                              {row.data?.title || '(missing)'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.data?.author || '(missing)'}</td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.data?.category || '(missing)'}</td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{row.data?.condition || '—'}</td>
                            <td className="py-2.5 px-3">
                              <div className="space-y-0.5">
                                {row.errors.map((err, eIdx) => (
                                  <span
                                    key={eIdx}
                                    className="inline-block bg-rose-100 text-rose-900 border border-rose-300 dark:border-transparent dark:bg-rose-950 dark:text-rose-300 text-[10px] px-1.5 py-0.5 rounded font-medium mr-1"
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
                          <td colSpan={8} className="py-8 text-center text-slate-500 dark:text-slate-400">
                            No catalogue records found in uploaded file.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={resetAll}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel & Re-upload
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={!previewData.canImport || confirmLoading}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                  >
                    {confirmLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Ingesting Catalogue...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Confirm & Ingest Catalogue ({previewData.validCount} Copies)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation Summary Results */}
          {confirmResult && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Catalogue Import Committed Atomically
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Database transaction succeeded. All copies and book titles have been committed to your school library.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-900">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Copies Added
                  </div>
                  <div className="text-3xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                    {confirmResult.copiesInserted}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                    Marked AVAILABLE on shelf
                  </div>
                </div>

                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-900">
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                    New Titles Created
                  </div>
                  <div className="text-3xl font-black text-indigo-700 dark:text-indigo-400 mt-1">
                    {confirmResult.titlesCreated}
                  </div>
                  <div className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1">
                    New book catalogue records
                  </div>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-900">
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                    Titles Updated
                  </div>
                  <div className="text-3xl font-black text-purple-700 dark:text-purple-400 mt-1">
                    {confirmResult.booksUpdated}
                  </div>
                  <div className="text-[11px] text-purple-600 dark:text-purple-400 mt-1">
                    Existing titles receiving copies
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Done & View Catalogue
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer (for Step 1 or Step 2 when not confirmed) */}
        {!confirmResult && (
          <div className="p-4 bg-slate-50/50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div>
              Strict all-or-nothing policy • Powered by <span className="font-semibold text-slate-700 dark:text-slate-300">ExcelJS & Prisma</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Sub-Modal */}
      {showConfirmModal && previewData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Confirm Catalogue Ingestion
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  You are about to insert <strong>{previewData.validCount} verified physical copies</strong> into your library inventory.
                </p>
              </div>
            </div>

            <div className="my-4 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Total Copies to Ingest:</span>
                <span className="font-bold text-emerald-800 dark:text-emerald-400">{previewData.validCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-medium">New Book Titles to Create:</span>
                <span className="font-semibold text-indigo-700 dark:text-indigo-400">{previewData.newTitlesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Existing Titles Receiving Copies:</span>
                <span className="font-semibold text-purple-700 dark:text-purple-400">{previewData.existingTitlesCount}</span>
              </div>
            </div>

            <div className="bg-amber-100/70 border border-amber-300 dark:bg-amber-950/40 dark:border-amber-900 rounded-xl p-3 text-[11px] text-amber-950 dark:text-amber-300 mb-5 font-medium">
              <strong>Atomic Transaction Guarantee:</strong> All copies and titles will be created together. If any unexpected error occurs during database write, the entire batch automatically rolls back.
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Back to Preview
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={confirmLoading}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                {confirmLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Committing...
                  </>
                ) : (
                  'Commit Ingestion'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
