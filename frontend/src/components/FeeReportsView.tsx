import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  reportsApi,
  metaApi,
  ReportType,
  ExportFormat,
  AcademicYear,
  GradeClass,
  DailyCollectionReport,
  MonthlyCollectionReport,
  CollectionSummaryReport,
  OutstandingDuesReport,
  ClassCollectionReport,
  FineSummaryReport,
} from '../services/api';
import {
  BarChart3,
  Download,
  RefreshCw,
  Search,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY_COLLECTION: 'Daily Collection',
  MONTHLY_COLLECTION: 'Monthly Collection',
  COLLECTION_SUMMARY: 'Collection Summary',
  OUTSTANDING_DUES: 'Outstanding Dues',
  CLASS_COLLECTION: 'Class-Wise Collection',
  FINE_SUMMARY: 'Fine Summary',
  DEFAULTER_REPORT: 'Defaulter Report',
};

export interface DateValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates date range parameters client-side according to backend reporting DTO contracts.
 */
export function validateDateRange(
  reportType: ReportType,
  startDate?: string,
  endDate?: string,
): DateValidationResult {
  // Only applicable to reports that support date ranges
  if (
    reportType !== 'COLLECTION_SUMMARY' &&
    reportType !== 'CLASS_COLLECTION' &&
    reportType !== 'FINE_SUMMARY'
  ) {
    return { isValid: true };
  }

  const hasStart = Boolean(startDate && startDate.trim());
  const hasEnd = Boolean(endDate && endDate.trim());

  // 1. COLLECTION_SUMMARY requires both startDate and endDate
  if (reportType === 'COLLECTION_SUMMARY') {
    if (!hasStart && !hasEnd) {
      return { isValid: false, errorMessage: 'Both start date and end date are required for collection summary.' };
    }
    if (!hasStart) {
      return { isValid: false, errorMessage: 'Start date is required for collection summary.' };
    }
    if (!hasEnd) {
      return { isValid: false, errorMessage: 'End date is required for collection summary.' };
    }
  }

  // 2. CLASS_COLLECTION and FINE_SUMMARY: If one date is provided, both must be provided
  if (reportType === 'CLASS_COLLECTION' || reportType === 'FINE_SUMMARY') {
    if (hasStart && !hasEnd) {
      return { isValid: false, errorMessage: 'End date is required when start date is provided.' };
    }
    if (!hasStart && hasEnd) {
      return { isValid: false, errorMessage: 'Start date is required when end date is provided.' };
    }
  }

  // 3. If both dates are provided, validate chronological order (startDate <= endDate)
  if (hasStart && hasEnd) {
    if (startDate! > endDate!) {
      return { isValid: false, errorMessage: 'Start date cannot be after end date.' };
    }
  }

  return { isValid: true };
}

const PAYMENT_METHODS = [
  { value: '', label: 'All Payment Methods' },
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'UPI', label: 'UPI' },
  { value: 'POS_CARD', label: 'POS / Card' },
];

export const FeeReportsView: React.FC = () => {
  // 1. Report Type Selection
  const [selectedReport, setSelectedReport] = useState<ReportType>('DAILY_COLLECTION');

  // 2. Metadata
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);

  // 3. Filter States
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const currentMonth = useMemo(() => new Date().getMonth() + 1, []);

  // Shared Filters
  const [academicYearId, setAcademicYearId] = useState<string>('');
  const [gradeId, setGradeId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');

  // Daily Filters
  const [dailyDate, setDailyDate] = useState<string>(todayIso);

  // Monthly Filters
  const [monthlyYear, setMonthlyYear] = useState<number>(currentYear);
  const [monthlyMonth, setMonthlyMonth] = useState<number>(currentMonth);

  // Range Filters (Collection Summary, Class, Fine)
  const defaultStartDate = useMemo(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return d.toISOString().split('T')[0];
  }, []);
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(todayIso);

  // Dues & Defaulters Filters
  const [search, setSearch] = useState<string>('');
  const [minOverdueDays, setMinOverdueDays] = useState<string>('');
  const [onlyWithDues, setOnlyWithDues] = useState<boolean>(true);
  const [duesPage, setDuesPage] = useState<number>(1);
  const [duesSortBy, setDuesSortBy] = useState<string>('outstandingBalance');
  const [duesSortOrder, setDuesSortOrder] = useState<'asc' | 'desc'>('desc');

  // 4. Async Data States
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Request identity and mount status tracking for race protection
  const activeRequestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeRequestIdRef.current++;
    };
  }, []);

  // Report Data States
  const [dailyData, setDailyData] = useState<DailyCollectionReport | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyCollectionReport | null>(null);
  const [summaryData, setSummaryData] = useState<CollectionSummaryReport | null>(null);
  const [duesData, setDuesData] = useState<OutstandingDuesReport | null>(null);
  const [defaulterData, setDefaulterData] = useState<OutstandingDuesReport | null>(null);
  const [classData, setClassData] = useState<ClassCollectionReport | null>(null);
  const [fineData, setFineData] = useState<FineSummaryReport | null>(null);

  // Load Metadata once on mount
  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [years, gradeList] = await Promise.all([
          metaApi.getAcademicYears(),
          metaApi.getGrades(),
        ]);
        setAcademicYears(years || []);
        setGrades(gradeList || []);
      } catch (err) {
        console.error('Failed to load report metadata:', err);
      }
    };
    loadMeta();
  }, []);

  // Build current query params based on selected report (scoped strictly to supported DTO fields)
  const getActiveFilterParams = useCallback(() => {
    const params: Record<string, any> = {};

    // Academic Year is supported across all seven report types
    if (academicYearId) {
      params.academicYearId = academicYearId;
    }

    switch (selectedReport) {
      case 'DAILY_COLLECTION':
        if (dailyDate) params.date = dailyDate;
        if (paymentMethod) params.paymentMethod = paymentMethod;
        break;

      case 'MONTHLY_COLLECTION':
        params.year = monthlyYear;
        params.month = monthlyMonth;
        if (paymentMethod) params.paymentMethod = paymentMethod;
        break;

      case 'COLLECTION_SUMMARY':
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (paymentMethod) params.paymentMethod = paymentMethod;
        break;

      case 'OUTSTANDING_DUES':
        if (gradeId) params.gradeId = gradeId;
        if (search.trim()) params.search = search.trim();
        if (minOverdueDays) params.minOverdueDays = parseInt(minOverdueDays, 10);
        params.onlyWithDues = onlyWithDues;
        params.page = duesPage;
        params.limit = 20;
        params.sortBy = duesSortBy;
        params.sortOrder = duesSortOrder;
        break;

      case 'DEFAULTER_REPORT':
        if (gradeId) params.gradeId = gradeId;
        if (search.trim()) params.search = search.trim();
        if (minOverdueDays) params.minOverdueDays = parseInt(minOverdueDays, 10);
        params.page = duesPage;
        params.limit = 20;
        params.sortBy = duesSortBy;
        params.sortOrder = duesSortOrder;
        break;

      case 'CLASS_COLLECTION':
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (gradeId) params.gradeId = gradeId;
        if (paymentMethod) params.paymentMethod = paymentMethod;
        break;

      case 'FINE_SUMMARY':
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (gradeId) params.gradeId = gradeId;
        break;
    }

    return params;
  }, [
    selectedReport,
    academicYearId,
    gradeId,
    paymentMethod,
    dailyDate,
    monthlyYear,
    monthlyMonth,
    startDate,
    endDate,
    search,
    minOverdueDays,
    onlyWithDues,
    duesPage,
    duesSortBy,
    duesSortOrder,
  ]);

  // Main Report Fetcher
  const fetchReport = useCallback(async () => {
    // 1. Client-side date range validation
    const dateValidation = validateDateRange(selectedReport, startDate, endDate);
    if (!dateValidation.isValid) {
      setError(dateValidation.errorMessage || 'Invalid date range');
      setLoading(false);
      return;
    }

    // 2. Establish unique request identity
    const currentRequestId = ++activeRequestIdRef.current;

    setLoading(true);
    setError(null);
    setExportSuccessMessage(null);

    const params = getActiveFilterParams();

    try {
      switch (selectedReport) {
        case 'DAILY_COLLECTION': {
          const res = await reportsApi.getDailyCollection(params);
          if (currentRequestId !== activeRequestIdRef.current || !isMountedRef.current) return;
          setDailyData(res);
          break;
        }
        case 'MONTHLY_COLLECTION': {
          const res = await reportsApi.getMonthlyCollection(params);
          if (currentRequestId !== activeRequestIdRef.current || !isMountedRef.current) return;
          setMonthlyData(res);
          break;
        }
        case 'COLLECTION_SUMMARY': {
          const res = await reportsApi.getCollectionSummary(params as any);
          if (currentRequestId !== activeRequestIdRef.current || !isMountedRef.current) return;
          setSummaryData(res);
          break;
        }
        case 'OUTSTANDING_DUES': {
          const res = await reportsApi.getOutstandingDues(params);
          if (currentRequestId !== activeRequestIdRef.current || !isMountedRef.current) return;
          setDuesData(res);
          break;
        }
        case 'DEFAULTER_REPORT': {
          const res = await reportsApi.getDefaultersReport(params);
          if (currentRequestId !== activeRequestIdRef.current || !isMountedRef.current) return;
          setDefaulterData(res);
          break;
        }
        case 'CLASS_COLLECTION': {
          const res = await reportsApi.getClassCollections(params);
          if (currentRequestId !== activeRequestIdRef.current || !isMountedRef.current) return;
          setClassData(res);
          break;
        }
        case 'FINE_SUMMARY': {
          const res = await reportsApi.getFineSummary(params);
          if (currentRequestId !== activeRequestIdRef.current || !isMountedRef.current) return;
          setFineData(res);
          break;
        }
      }
    } catch (err: any) {
      if (currentRequestId !== activeRequestIdRef.current || !isMountedRef.current) return;
      const msg = err?.response?.data?.message || err.message || 'Failed to generate report';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      if (currentRequestId === activeRequestIdRef.current && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [
    selectedReport,
    startDate,
    endDate,
    getActiveFilterParams,
  ]);

  // Trigger fetch when report type or page changes
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Handle Tab Switch (reset page and temporary states)
  const handleReportChange = (type: ReportType) => {
    setSelectedReport(type);
    setDuesPage(1);
    setError(null);
    setExportSuccessMessage(null);
  };

  // Export Action (Preserves active filters)
  const handleExport = async (format: ExportFormat) => {
    if (exportingFormat) return; // Prevent duplicate requests

    // Client-side date validation before issuing export
    const dateValidation = validateDateRange(selectedReport, startDate, endDate);
    if (!dateValidation.isValid) {
      setError(dateValidation.errorMessage || 'Invalid date range');
      return;
    }

    try {
      setExportingFormat(format);
      setError(null);
      setExportSuccessMessage(null);

      const params = getActiveFilterParams();
      const filename = await reportsApi.exportReport(selectedReport, format, params);
      if (isMountedRef.current) {
        setExportSuccessMessage(`Successfully downloaded ${filename}`);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        const msg = err?.message || 'Export failed. Please verify filters and try again.';
        setError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setExportingFormat(null);
      }
    }
  };

  // Currency & Date Formatters
  const formatCurrency = (val: number | undefined | null) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Current report's school metadata
  const activeSchool = useMemo(() => {
    switch (selectedReport) {
      case 'DAILY_COLLECTION':
        return dailyData?.school;
      case 'MONTHLY_COLLECTION':
        return monthlyData?.school;
      case 'COLLECTION_SUMMARY':
        return summaryData?.school;
      case 'OUTSTANDING_DUES':
        return duesData?.school;
      case 'DEFAULTER_REPORT':
        return defaulterData?.school;
      case 'CLASS_COLLECTION':
        return classData?.school;
      case 'FINE_SUMMARY':
        return fineData?.school;
    }
  }, [
    selectedReport,
    dailyData,
    monthlyData,
    summaryData,
    duesData,
    defaulterData,
    classData,
    fineData,
  ]);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Report Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <BarChart3 className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900">Fee Reporting & Financial Analytics</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Authoritative financial summaries, collection aggregations, fine breakdowns, and print-ready exports.
              {activeSchool && (
                <span className="ml-2 font-medium text-slate-700">
                  • {activeSchool.name} ({activeSchool.currency})
                </span>
              )}
            </p>
          </div>

          {/* Export Actions Bar */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Export Actions">
            <button
              type="button"
              onClick={() => handleExport('csv')}
              disabled={loading || !!exportingFormat}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download as CSV"
            >
              {exportingFormat === 'csv' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-600" />
              ) : (
                <Download className="w-3.5 h-3.5 text-slate-600" />
              )}
              CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              disabled={loading || !!exportingFormat}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg transition-colors border border-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download as Excel Sheet"
            >
              {exportingFormat === 'xlsx' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              )}
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={loading || !!exportingFormat}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg transition-colors border border-rose-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download as Print-Ready PDF"
            >
              {exportingFormat === 'pdf' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-600" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-rose-600" />
              )}
              PDF
            </button>
          </div>
        </div>

        {/* Report Type Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-100" role="tablist">
          {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((type) => (
            <button
              key={type}
              role="tab"
              aria-selected={selectedReport === type}
              onClick={() => handleReportChange(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedReport === type
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {REPORT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        {/* 2. Dynamic Filter Toolbar */}
        <div className="mt-5 pt-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
          {/* Daily Date Filter */}
          {selectedReport === 'DAILY_COLLECTION' && (
            <div>
              <label htmlFor="daily-date" className="block font-medium text-slate-700 mb-1">
                Report Date
              </label>
              <input
                id="daily-date"
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* Monthly Year & Month Filters */}
          {selectedReport === 'MONTHLY_COLLECTION' && (
            <>
              <div>
                <label htmlFor="monthly-year" className="block font-medium text-slate-700 mb-1">
                  Year
                </label>
                <input
                  id="monthly-year"
                  type="number"
                  min="2000"
                  max="2100"
                  value={monthlyYear}
                  onChange={(e) => setMonthlyYear(parseInt(e.target.value, 10) || currentYear)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="monthly-month" className="block font-medium text-slate-700 mb-1">
                  Month
                </label>
                <select
                  id="monthly-month"
                  value={monthlyMonth}
                  onChange={(e) => setMonthlyMonth(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  {[
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December',
                  ].map((mName, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {idx + 1} - {mName}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Date Range Filters (Collection Summary, Class, Fine) */}
          {(selectedReport === 'COLLECTION_SUMMARY' ||
            selectedReport === 'CLASS_COLLECTION' ||
            selectedReport === 'FINE_SUMMARY') && (
            <>
              <div>
                <label htmlFor="start-date" className="block font-medium text-slate-700 mb-1">
                  Start Date {selectedReport === 'COLLECTION_SUMMARY' && <span className="text-rose-500">*</span>}
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block font-medium text-slate-700 mb-1">
                  End Date {selectedReport === 'COLLECTION_SUMMARY' && <span className="text-rose-500">*</span>}
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {/* Academic Year Filter (Shared by all reports) */}
          <div>
            <label htmlFor="academic-year-select" className="block font-medium text-slate-700 mb-1">
              Academic Year
            </label>
            <select
              id="academic-year-select"
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">All Academic Years</option>
              {academicYears.map((ay) => (
                <option key={ay.id} value={ay.id}>
                  {ay.name} {ay.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Grade / Class Filter (Dues, Defaulters, Class, Fine) */}
          {(selectedReport === 'OUTSTANDING_DUES' ||
            selectedReport === 'DEFAULTER_REPORT' ||
            selectedReport === 'CLASS_COLLECTION' ||
            selectedReport === 'FINE_SUMMARY') && (
            <div>
              <label htmlFor="grade-select" className="block font-medium text-slate-700 mb-1">
                Grade / Class
              </label>
              <select
                id="grade-select"
                value={gradeId}
                onChange={(e) => setGradeId(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">All Grades</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Payment Method Filter (Daily, Monthly, Collection Summary, Class) */}
          {(selectedReport === 'DAILY_COLLECTION' ||
            selectedReport === 'MONTHLY_COLLECTION' ||
            selectedReport === 'COLLECTION_SUMMARY' ||
            selectedReport === 'CLASS_COLLECTION') && (
            <div>
              <label htmlFor="payment-method-select" className="block font-medium text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                id="payment-method-select"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm.value} value={pm.value}>
                    {pm.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Filter (Dues & Defaulters) */}
          {(selectedReport === 'OUTSTANDING_DUES' || selectedReport === 'DEFAULTER_REPORT') && (
            <div>
              <label htmlFor="student-search" className="block font-medium text-slate-700 mb-1">
                Search Student
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  id="student-search"
                  type="text"
                  placeholder="Admission # or Name"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setDuesPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Min Overdue Days Filter (Dues & Defaulters) */}
          {(selectedReport === 'OUTSTANDING_DUES' || selectedReport === 'DEFAULTER_REPORT') && (
            <div>
              <label htmlFor="min-overdue-days" className="block font-medium text-slate-700 mb-1">
                Min Overdue Days
              </label>
              <input
                id="min-overdue-days"
                type="number"
                min="0"
                placeholder={selectedReport === 'DEFAULTER_REPORT' ? '1 (Default)' : '0'}
                value={minOverdueDays}
                onChange={(e) => {
                  setMinOverdueDays(e.target.value);
                  setDuesPage(1);
                }}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          )}

          {/* Sort By & Order (Dues & Defaulters) */}
          {(selectedReport === 'OUTSTANDING_DUES' || selectedReport === 'DEFAULTER_REPORT') && (
            <>
              <div>
                <label htmlFor="dues-sort-by" className="block font-medium text-slate-700 mb-1">
                  Sort By
                </label>
                <select
                  id="dues-sort-by"
                  value={duesSortBy}
                  onChange={(e) => setDuesSortBy(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="outstandingBalance">Outstanding Balance</option>
                  <option value="overdueAmount">Overdue Amount</option>
                  <option value="maxOverdueDays">Days Overdue</option>
                  <option value="totalBilled">Total Billed</option>
                  <option value="totalPaid">Total Paid</option>
                  <option value="studentName">Student Name</option>
                  <option value="admissionNumber">Admission Number</option>
                </select>
              </div>
              <div>
                <label htmlFor="dues-sort-order" className="block font-medium text-slate-700 mb-1">
                  Order
                </label>
                <select
                  id="dues-sort-order"
                  value={duesSortOrder}
                  onChange={(e) => setDuesSortOrder(e.target.value as 'asc' | 'desc')}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="desc">Descending (High to Low)</option>
                  <option value="asc">Ascending (Low to High)</option>
                </select>
              </div>
            </>
          )}

          {/* Only With Dues Checkbox (Outstanding Dues only) */}
          {selectedReport === 'OUTSTANDING_DUES' && (
            <div className="flex items-center gap-2 pt-5">
              <input
                id="only-with-dues"
                type="checkbox"
                checked={onlyWithDues}
                onChange={(e) => {
                  setOnlyWithDues(e.target.checked);
                  setDuesPage(1);
                }}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              />
              <label htmlFor="only-with-dues" className="font-medium text-slate-700 select-none cursor-pointer">
                Only show students with dues
              </label>
            </div>
          )}

          {/* Refresh / Apply Action */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fetchReport()}
              disabled={loading}
              className="w-full inline-flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {exportSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{exportSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Error Alert with Retry */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="font-semibold">Failed to process report request</p>
              <p className="text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchReport()}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition-colors shrink-0"
          >
            Retry Request
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">Generating Financial Report...</h3>
          <p className="text-xs text-slate-500 mt-1">
            Retrieving authoritative financial aggregations and activity records from the school ledger.
          </p>
        </div>
      )}

      {/* 3. Executive KPI Metric Cards */}
      {!loading && (
        <>
          {/* Collection KPI Cards (Daily, Monthly, Collection Summary, Class Collection) */}
          {(selectedReport === 'DAILY_COLLECTION' ||
            selectedReport === 'MONTHLY_COLLECTION' ||
            selectedReport === 'COLLECTION_SUMMARY' ||
            selectedReport === 'CLASS_COLLECTION') && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(() => {
                const s =
                  selectedReport === 'DAILY_COLLECTION'
                    ? dailyData?.summary
                    : selectedReport === 'MONTHLY_COLLECTION'
                    ? monthlyData?.summary
                    : selectedReport === 'COLLECTION_SUMMARY'
                    ? summaryData?.summary
                    : classData?.summary;
                return (
                  <>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Gross Collections
                      </span>
                      <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">
                        {formatCurrency(s?.grossCollections)}
                      </p>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        {s?.transactionCount || 0} transactions
                      </span>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
                        Total Reversals
                      </span>
                      <p className="text-lg sm:text-2xl font-black text-amber-700 mt-1">
                        {formatCurrency(s?.totalReversals)}
                      </p>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Voided / Reversed entries
                      </span>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
                        Total Refunds
                      </span>
                      <p className="text-lg sm:text-2xl font-black text-rose-700 mt-1">
                        {formatCurrency(s?.totalRefunds)}
                      </p>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Succeeded refunds
                      </span>
                    </div>

                    <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 shadow-xs">
                      <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                        Net Collections
                      </span>
                      <p className="text-lg sm:text-2xl font-black text-indigo-900 mt-1">
                        {formatCurrency(s?.netCollections)}
                      </p>
                      <span className="text-[11px] text-indigo-600 mt-0.5 block">
                        Gross – Reversals – Refunds
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Outstanding Dues KPI Cards */}
          {selectedReport === 'OUTSTANDING_DUES' && duesData && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Total Billed
                </span>
                <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">
                  {formatCurrency(duesData.summary.totalBilledAmount)}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {duesData.summary.totalStudents} total students
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                  Total Collected
                </span>
                <p className="text-lg sm:text-2xl font-black text-emerald-700 mt-1">
                  {formatCurrency(duesData.summary.totalPaidAmount)}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Principal: {formatCurrency(duesData.summary.totalPaidPrincipal)}
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
                  Outstanding Balance
                </span>
                <p className="text-lg sm:text-2xl font-black text-amber-700 mt-1">
                  {formatCurrency(duesData.summary.totalOutstandingAmount)}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Fines due: {formatCurrency(duesData.summary.totalFineBalance)}
                </span>
              </div>

              <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-100 shadow-xs">
                <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                  Total Overdue
                </span>
                <p className="text-lg sm:text-2xl font-black text-rose-900 mt-1">
                  {formatCurrency(duesData.summary.totalOverdueAmount)}
                </p>
                <span className="text-[11px] text-rose-600 mt-0.5 block">
                  {duesData.summary.overdueStudentsCount} overdue students
                </span>
              </div>
            </div>
          )}

          {/* Defaulter Report KPI Cards */}
          {selectedReport === 'DEFAULTER_REPORT' && defaulterData && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Defaulters Count
                </span>
                <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">
                  {defaulterData.summary.overdueStudentsCount}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">Overdue students</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
                  Overdue Principal
                </span>
                <p className="text-lg sm:text-2xl font-black text-amber-700 mt-1">
                  {formatCurrency(defaulterData.summary.totalOverduePrincipal)}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">Base fee liability</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
                  Overdue Fines
                </span>
                <p className="text-lg sm:text-2xl font-black text-rose-700 mt-1">
                  {formatCurrency(defaulterData.summary.totalOverdueFines)}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">Late penalties</span>
              </div>

              <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-100 shadow-xs">
                <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                  Total Overdue
                </span>
                <p className="text-lg sm:text-2xl font-black text-rose-900 mt-1">
                  {formatCurrency(defaulterData.summary.totalOverdueAmount)}
                </p>
                <span className="text-[11px] text-rose-600 mt-0.5 block">
                  Total outstanding: {formatCurrency(defaulterData.summary.totalOutstandingAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Fine Summary KPI Cards */}
          {selectedReport === 'FINE_SUMMARY' && fineData && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Assessed Fines
                </span>
                <p className="text-lg sm:text-2xl font-black text-slate-900 mt-1">
                  {formatCurrency(fineData.summary.totalAssessed)}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {fineData.summary.fineCount} penalties
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
                  Waived Fines
                </span>
                <p className="text-lg sm:text-2xl font-black text-amber-700 mt-1">
                  {formatCurrency(fineData.summary.totalWaived)}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Net Obligation: {formatCurrency(fineData.summary.netObligation)}
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                  Net Collected
                </span>
                <p className="text-lg sm:text-2xl font-black text-emerald-700 mt-1">
                  {formatCurrency(fineData.summary.netCollected)}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Reversals/Refunds deducted
                </span>
              </div>

              <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-100 shadow-xs">
                <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                  Fine Balance
                </span>
                <p className="text-lg sm:text-2xl font-black text-rose-900 mt-1">
                  {formatCurrency(fineData.summary.remainingBalance)}
                </p>
                <span className="text-[11px] text-rose-600 mt-0.5 block">Remaining penalty due</span>
              </div>
            </div>
          )}

          {/* 4. Tabular Data Sections */}

          {/* Report 1: DAILY COLLECTION TABLE */}
          {selectedReport === 'DAILY_COLLECTION' && dailyData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Daily Payment & Receipt Transactions ({dailyData.transactions.length})
                </h3>
                <span className="text-xs text-slate-500">Date: {dailyData.period.date}</span>
              </div>

              {dailyData.transactions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No records found for the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Receipt #</th>
                        <th className="py-3 px-4">Time</th>
                        <th className="py-3 px-4">Adm #</th>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Class / Sec</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4">Reference #</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyData.transactions.map((tx) => (
                        <tr key={tx.paymentId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-indigo-600">
                            {tx.receiptNumber || '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(tx.paymentDate).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-4 font-mono">{tx.student.admissionNumber}</td>
                          <td className="py-3 px-4 font-medium text-slate-900">{tx.student.name}</td>
                          <td className="py-3 px-4 text-slate-600">
                            {tx.student.grade ? `${tx.student.grade} - ${tx.student.section || ''}` : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {tx.paymentMethod}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">{tx.referenceNumber || '—'}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-900">
                            {formatCurrency(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={7} className="py-3 px-4">
                          TOTAL GROSS COLLECTION
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatCurrency(dailyData.summary.grossCollections)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Report 2: MONTHLY COLLECTION TABLE */}
          {selectedReport === 'MONTHLY_COLLECTION' && monthlyData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Daily Breakdown for {monthlyData.period.year}-{String(monthlyData.period.month).padStart(2, '0')}
                </h3>
              </div>

              {monthlyData.dailyBreakdown.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No records found for the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Gross Collections</th>
                        <th className="py-3 px-4 text-right">Reversals</th>
                        <th className="py-3 px-4 text-right">Refunds</th>
                        <th className="py-3 px-4 text-right">Net Collections</th>
                        <th className="py-3 px-4 text-right">Txn Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {monthlyData.dailyBreakdown.map((row) => (
                        <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">{row.date}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{formatCurrency(row.grossCollections)}</td>
                          <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(row.totalReversals)}</td>
                          <td className="py-3 px-4 text-right text-rose-700">{formatCurrency(row.totalRefunds)}</td>
                          <td className="py-3 px-4 text-right font-bold text-indigo-700">{formatCurrency(row.netCollections)}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600">{row.transactionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
                      <tr>
                        <td className="py-3 px-4">MONTH TOTAL</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(monthlyData.summary.grossCollections)}</td>
                        <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(monthlyData.summary.totalReversals)}</td>
                        <td className="py-3 px-4 text-right text-rose-700">{formatCurrency(monthlyData.summary.totalRefunds)}</td>
                        <td className="py-3 px-4 text-right text-indigo-700">{formatCurrency(monthlyData.summary.netCollections)}</td>
                        <td className="py-3 px-4 text-right font-mono">{monthlyData.summary.transactionCount}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Report 3: COLLECTION SUMMARY TABLE */}
          {selectedReport === 'COLLECTION_SUMMARY' && summaryData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Periodic Collection Aggregation ({summaryData.period.startDate} to {summaryData.period.endDate})
                </h3>
              </div>

              {summaryData.periodicBreakdown.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No records found for the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Period</th>
                        <th className="py-3 px-4 text-right">Gross Collections</th>
                        <th className="py-3 px-4 text-right">Reversals</th>
                        <th className="py-3 px-4 text-right">Refunds</th>
                        <th className="py-3 px-4 text-right">Net Collections</th>
                        <th className="py-3 px-4 text-right">Txn Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summaryData.periodicBreakdown.map((row) => (
                        <tr key={row.period} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">{row.period}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{formatCurrency(row.grossCollections)}</td>
                          <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(row.totalReversals)}</td>
                          <td className="py-3 px-4 text-right text-rose-700">{formatCurrency(row.totalRefunds)}</td>
                          <td className="py-3 px-4 text-right font-bold text-indigo-700">{formatCurrency(row.netCollections)}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600">{row.transactionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
                      <tr>
                        <td className="py-3 px-4">TOTAL</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(summaryData.summary.grossCollections)}</td>
                        <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(summaryData.summary.totalReversals)}</td>
                        <td className="py-3 px-4 text-right text-rose-700">{formatCurrency(summaryData.summary.totalRefunds)}</td>
                        <td className="py-3 px-4 text-right text-indigo-700">{formatCurrency(summaryData.summary.netCollections)}</td>
                        <td className="py-3 px-4 text-right font-mono">{summaryData.summary.transactionCount}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Report 4: OUTSTANDING DUES TABLE */}
          {selectedReport === 'OUTSTANDING_DUES' && duesData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Student Outstanding Balances (Showing {duesData.records.length} of {duesData.pagination.totalRecords})
                </h3>
              </div>

              {duesData.records.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No records found for the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[950px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Adm #</th>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Class / Sec</th>
                        <th className="py-3 px-4 text-right">Total Billed</th>
                        <th className="py-3 px-4 text-right">Total Paid</th>
                        <th className="py-3 px-4 text-right">Principal Due</th>
                        <th className="py-3 px-4 text-right">Fine Due</th>
                        <th className="py-3 px-4 text-right">Outstanding</th>
                        <th className="py-3 px-4 text-right">Overdue</th>
                        <th className="py-3 px-4 text-center">Days</th>
                        <th className="py-3 px-4">Guardian Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {duesData.records.map((r) => (
                        <tr key={r.studentId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">{r.admissionNumber}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{r.studentName}</td>
                          <td className="py-3 px-4 text-slate-600">{r.grade.name} - {r.section.name}</td>
                          <td className="py-3 px-4 text-right text-slate-700">{formatCurrency(r.totalBilled)}</td>
                          <td className="py-3 px-4 text-right text-emerald-700">{formatCurrency(r.totalPaid)}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{formatCurrency(r.remainingPrincipal)}</td>
                          <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(r.fineBalance)}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(r.outstandingBalance)}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-600">
                            {r.overdueAmount > 0 ? formatCurrency(r.overdueAmount) : '—'}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            {r.maxOverdueDays > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800">
                                {r.maxOverdueDays} d
                              </span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {r.guardian.phone || r.guardian.email || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Dues Pagination Bar */}
              {duesData.pagination.totalPages > 1 && (
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50">
                  <span className="text-slate-500">
                    Page {duesData.pagination.page} of {duesData.pagination.totalPages} ({duesData.pagination.totalRecords} records)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!duesData.pagination.hasPrevPage}
                      onClick={() => setDuesPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>
                    <button
                      type="button"
                      disabled={!duesData.pagination.hasNextPage}
                      onClick={() => setDuesPage((p) => p + 1)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Report 5: DEFAULTER REPORT TABLE */}
          {selectedReport === 'DEFAULTER_REPORT' && defaulterData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Fee Defaulters & Overdue Aging (Showing {defaulterData.records.length} of {defaulterData.pagination.totalRecords})
                </h3>
              </div>

              {defaulterData.records.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No records found for the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Adm #</th>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Class / Sec</th>
                        <th className="py-3 px-4 text-right">Overdue Principal</th>
                        <th className="py-3 px-4 text-right">Overdue Fines</th>
                        <th className="py-3 px-4 text-right">Total Overdue</th>
                        <th className="py-3 px-4 text-center">Days Overdue</th>
                        <th className="py-3 px-4 text-right">Total Outstanding</th>
                        <th className="py-3 px-4">Guardian Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {defaulterData.records.map((r) => (
                        <tr key={r.studentId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">{r.admissionNumber}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{r.studentName}</td>
                          <td className="py-3 px-4 text-slate-600">{r.grade.name} - {r.section.name}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{formatCurrency(r.overduePrincipal)}</td>
                          <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(r.overdueFines)}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-700">{formatCurrency(r.overdueAmount)}</td>
                          <td className="py-3 px-4 text-center font-mono">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800">
                              {r.maxOverdueDays} days
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">{formatCurrency(r.outstandingBalance)}</td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {r.guardian.phone || r.guardian.email || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Defaulter Pagination Bar */}
              {defaulterData.pagination.totalPages > 1 && (
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50">
                  <span className="text-slate-500">
                    Page {defaulterData.pagination.page} of {defaulterData.pagination.totalPages} ({defaulterData.pagination.totalRecords} records)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!defaulterData.pagination.hasPrevPage}
                      onClick={() => setDuesPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>
                    <button
                      type="button"
                      disabled={!defaulterData.pagination.hasNextPage}
                      onClick={() => setDuesPage((p) => p + 1)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Report 6: CLASS-WISE COLLECTION TABLE */}
          {selectedReport === 'CLASS_COLLECTION' && classData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Class-Wise Collection Aggregation ({classData.byClass.length} Classes)
                </h3>
              </div>

              {classData.byClass.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No records found for the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Class / Section</th>
                        <th className="py-3 px-4 text-right">Gross Collections</th>
                        <th className="py-3 px-4 text-right">Reversals</th>
                        <th className="py-3 px-4 text-right">Refunds</th>
                        <th className="py-3 px-4 text-right">Net Collections</th>
                        <th className="py-3 px-4 text-right">Txn Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classData.byClass.map((c) => (
                        <tr key={`${c.gradeId}:${c.sectionId}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {c.gradeName} - {c.sectionName}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-800">{formatCurrency(c.grossCollections)}</td>
                          <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(c.totalReversals)}</td>
                          <td className="py-3 px-4 text-right text-rose-700">{formatCurrency(c.totalRefunds)}</td>
                          <td className="py-3 px-4 text-right font-bold text-indigo-700">{formatCurrency(c.netCollections)}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600">{c.transactionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
                      <tr>
                        <td className="py-3 px-4">TOTAL</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(classData.summary.grossCollections)}</td>
                        <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(classData.summary.totalReversals)}</td>
                        <td className="py-3 px-4 text-right text-rose-700">{formatCurrency(classData.summary.totalRefunds)}</td>
                        <td className="py-3 px-4 text-right text-indigo-700">{formatCurrency(classData.summary.netCollections)}</td>
                        <td className="py-3 px-4 text-right font-mono">{classData.summary.transactionCount}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Report 7: FINE SUMMARY TABLE */}
          {selectedReport === 'FINE_SUMMARY' && fineData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Late Fine & Penalty Summary by Class ({fineData.byClass.length} Classes)
                </h3>
              </div>

              {fineData.byClass.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No records found for the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Class / Section</th>
                        <th className="py-3 px-4 text-right">Assessed Fines</th>
                        <th className="py-3 px-4 text-right">Waived Fines</th>
                        <th className="py-3 px-4 text-right">Collected Fines</th>
                        <th className="py-3 px-4 text-right">Reversals</th>
                        <th className="py-3 px-4 text-right">Refunds</th>
                        <th className="py-3 px-4 text-right">Net Collected</th>
                        <th className="py-3 px-4 text-right">Fine Balance</th>
                        <th className="py-3 px-4 text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fineData.byClass.map((c) => (
                        <tr key={`${c.gradeId}:${c.sectionId}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {c.gradeName} - {c.sectionName}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-800">{formatCurrency(c.assessedAmount)}</td>
                          <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(c.waivedAmount)}</td>
                          <td className="py-3 px-4 text-right text-slate-700">{formatCurrency(c.collectedAmount)}</td>
                          <td className="py-3 px-4 text-right text-slate-500">{formatCurrency(c.reversalAmount)}</td>
                          <td className="py-3 px-4 text-right text-slate-500">{formatCurrency(c.refundAmount)}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">{formatCurrency(c.netCollected)}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-700">{formatCurrency(c.remainingBalance)}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600">{c.fineCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
                      <tr>
                        <td className="py-3 px-4">TOTAL</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(fineData.summary.totalAssessed)}</td>
                        <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(fineData.summary.totalWaived)}</td>
                        <td className="py-3 px-4 text-right text-slate-700">{formatCurrency(fineData.summary.totalCollected)}</td>
                        <td className="py-3 px-4 text-right text-slate-500">{formatCurrency(fineData.summary.totalReversals)}</td>
                        <td className="py-3 px-4 text-right text-slate-500">{formatCurrency(fineData.summary.totalRefunds)}</td>
                        <td className="py-3 px-4 text-right text-emerald-700">{formatCurrency(fineData.summary.netCollected)}</td>
                        <td className="py-3 px-4 text-right text-rose-700">{formatCurrency(fineData.summary.remainingBalance)}</td>
                        <td className="py-3 px-4 text-right font-mono">{fineData.summary.fineCount}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FeeReportsView;
