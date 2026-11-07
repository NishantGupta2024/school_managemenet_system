import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  receiptNumberingApi,
  ReceiptNumberConfigResponse,
  AcademicYearFormat,
} from '../services/api';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Hash,
  Sliders,
  Calendar,
  Lock,
} from 'lucide-react';

export const ReceiptSettingsView: React.FC = () => {
  const [config, setConfig] = useState<ReceiptNumberConfigResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Form Fields
  const [prefix, setPrefix] = useState<string>('RCT');
  const [yearFormat, setYearFormat] = useState<AcademicYearFormat>('SHORT_6DIGIT');
  const [paddingDigits, setPaddingDigits] = useState<number>(5);
  const [separator, setSeparator] = useState<string>('-');
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const data = await receiptNumberingApi.getConfig();
      setConfig(data);
      setPrefix(data.prefix);
      setYearFormat(data.yearFormat);
      setPaddingDigits(data.paddingDigits);
      setSeparator(data.separator);
    } catch (err: any) {
      setErrorBanner(
        err.response?.data?.message || err.message || 'Failed to load receipt numbering configuration.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Live client-side preview calculation
  const computedPreview = useMemo(() => {
    const cleanPrefix = (prefix || 'RCT').trim().toUpperCase();
    let yearToken = '';
    if (yearFormat === 'SHORT_6DIGIT') yearToken = '202627';
    else if (yearFormat === 'FULL_8DIGIT') yearToken = '20262027';
    else if (yearFormat === 'START_YEAR_4DIGIT') yearToken = '2026';

    const paddedSeq = String(1).padStart(paddingDigits, '0');
    const parts = [cleanPrefix, yearToken, paddedSeq].filter((p) => p.length > 0);
    return parts.join(separator);
  }, [prefix, yearFormat, paddingDigits, separator]);

  const handlePrefixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    setPrefix(val);
    if (val.length < 2) {
      setValidationError('Prefix must be at least 2 alphanumeric characters.');
    } else {
      setValidationError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prefix.trim().length < 2) {
      setValidationError('Prefix must be at least 2 alphanumeric characters.');
      return;
    }

    setSaving(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const updated = await receiptNumberingApi.updateConfig({
        prefix: prefix.trim(),
        yearFormat,
        paddingDigits,
        separator,
      });
      setConfig(updated);
      setSuccessBanner('Receipt numbering configuration saved successfully.');
    } catch (err: any) {
      setErrorBanner(
        err.response?.data?.message || err.message || 'Failed to update receipt numbering configuration.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16" data-testid="receipt-settings-loading">
        <div className="flex items-center gap-3 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          <span className="text-sm font-medium">Loading receipt numbering settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="receipt-settings-view">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            School Receipt Numbering Settings
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure your school's custom receipt prefix, academic year token, and sequence padding.
          </p>
        </div>
        {config?.isCustomized ? (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Custom Standard Active
          </span>
        ) : (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            System Default (RCT)
          </span>
        )}
      </div>

      {/* Notifications */}
      {errorBanner && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm"
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to update configuration</p>
            <p className="text-xs text-rose-700 mt-0.5">{errorBanner}</p>
          </div>
        </div>
      )}

      {successBanner && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-emerald-800 text-sm"
        >
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-semibold">Configuration Saved</p>
            <p className="text-xs text-emerald-700 mt-0.5">{successBanner}</p>
          </div>
        </div>
      )}

      {/* Live Preview Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-sm space-y-3">
        <div className="flex items-center justify-between text-indigo-200 text-xs font-medium uppercase tracking-wider">
          <span>Live Next Receipt Sample Preview</span>
          <span>Sample Sequence: #00001</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            data-testid="live-receipt-preview"
            className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-white px-4 py-2 rounded-xl bg-white/10 border border-white/20 backdrop-blur-sm"
          >
            {computedPreview}
          </span>
        </div>
        <p className="text-xs text-indigo-200/80">
          Newly collected payments will automatically issue receipts following this format.
        </p>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Prefix Input */}
          <div className="space-y-1.5">
            <label htmlFor="receipt-prefix" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-indigo-600" />
              Receipt Prefix
            </label>
            <input
              id="receipt-prefix"
              type="text"
              value={prefix}
              onChange={handlePrefixChange}
              placeholder="e.g. DPMS, ABC, RCT"
              maxLength={10}
              className={`w-full px-3.5 py-2 text-sm font-mono font-semibold uppercase rounded-xl border ${
                validationError ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-200 focus:ring-indigo-500'
              } focus:outline-none focus:ring-2`}
            />
            {validationError ? (
              <p className="text-xs text-rose-600">{validationError}</p>
            ) : (
              <p className="text-[11px] text-slate-400">
                2 to 10 alphanumeric characters (uppercase only). e.g. <span className="font-mono">DPMS</span>
              </p>
            )}
          </div>

          {/* Academic Year Format */}
          <div className="space-y-1.5">
            <label htmlFor="receipt-year-format" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Academic Session Token
            </label>
            <select
              id="receipt-year-format"
              value={yearFormat}
              onChange={(e) => setYearFormat(e.target.value as AcademicYearFormat)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="SHORT_6DIGIT">202627 (6-Digit Short - Recommended)</option>
              <option value="FULL_8DIGIT">20262027 (8-Digit Full)</option>
              <option value="START_YEAR_4DIGIT">2026 (4-Digit Start Year)</option>
              <option value="NONE">None (Omit Year Token)</option>
            </select>
            <p className="text-[11px] text-slate-400">
              Format of the academic year token embedded within the receipt number.
            </p>
          </div>

          {/* Padding Digits */}
          <div className="space-y-1.5">
            <label htmlFor="receipt-padding" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              Sequence Number Padding
            </label>
            <select
              id="receipt-padding"
              value={paddingDigits}
              onChange={(e) => setPaddingDigits(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-mono"
            >
              <option value={4}>4 digits (e.g. 0001)</option>
              <option value={5}>5 digits (e.g. 00001 - Default)</option>
              <option value={6}>6 digits (e.g. 000001)</option>
              <option value={7}>7 digits (e.g. 0000001)</option>
              <option value={8}>8 digits (e.g. 00000001)</option>
            </select>
            <p className="text-[11px] text-slate-400">
              Zero-padding width applied to chronological sequence counters.
            </p>
          </div>

          {/* Separator */}
          <div className="space-y-1.5">
            <label htmlFor="receipt-separator" className="text-xs font-bold text-slate-700">
              Separator Character
            </label>
            <select
              id="receipt-separator"
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-mono"
            >
              <option value="-">Hyphen ("-") (Default)</option>
              <option value="/">Forward Slash ("/")</option>
              <option value="">None (Empty)</option>
            </select>
            <p className="text-[11px] text-slate-400">
              Delimiter placed between prefix, year token, and sequence.
            </p>
          </div>
        </div>

        {/* Audit Advisory */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
          <Lock className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">Accounting & Audit Safeguards</p>
            <p>
              • Changes apply strictly to <strong>future receipts</strong>. Existing historical receipts, reprints, and
              snapshots are immutable.
            </p>
            <p>
              • Sequence counters continue sequentially to preserve monotonic ledger continuity. Manual resets are
              disabled.
            </p>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving || !!validationError}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving Configuration...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Save Receipt Numbering
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
