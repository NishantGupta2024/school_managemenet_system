import React, { useState, useEffect, useCallback } from 'react';
import {
  feeStatementApi,
  metaApi,
  Student,
  AcademicYear,
  StudentFeeStatement,
  FeeInvoice,
} from '../services/api';
import { OnlineCheckoutModal } from './OnlineCheckoutModal';
import {
  Search,
  User,
  Calendar,
  AlertCircle,
  FileText,
  Clock,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Eye,
  Percent,
  X,
  CreditCard,
} from 'lucide-react';

export const StudentStatementView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [statement, setStatement] = useState<StudentFeeStatement | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal for Itemized Line Items
  const [activeInvoice, setActiveInvoice] = useState<FeeInvoice | null>(null);

  // Modal for Razorpay Online Checkout (Phase F)
  const [checkoutInvoice, setCheckoutInvoice] = useState<FeeInvoice | null>(null);

  const filteredStudents = React.useMemo(() => {
    return students.filter(
      (s) =>
        s.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [students, searchTerm]);

  // Clear selected student if search term excludes current selection (Finding 1: never silently select first filtered student)
  useEffect(() => {
    if (!selectedStudentId) return;
    const match = filteredStudents.some((s) => s.id === selectedStudentId);
    if (!match) {
      setSelectedStudentId('');
      setStatement(null);
      setActiveInvoice(null);
      setCheckoutInvoice(null);
    }
  }, [filteredStudents, selectedStudentId]);

  // Load Metadata with unmount cleanup (F-08)
  useEffect(() => {
    let isMounted = true;
    const loadMetadata = async () => {
      try {
        const [stuList, yearList] = await Promise.all([
          metaApi.getAccessibleStudents(),
          metaApi.getAcademicYears(),
        ]);
        if (!isMounted) return;
        setStudents(stuList);
        setAcademicYears(yearList);

        if (yearList.length > 0) {
          setSelectedYearId(yearList[0].id);
        }
        if (stuList.length > 0) {
          setSelectedStudentId(stuList[0].id);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.response?.data?.message || 'Failed to load metadata');
      }
    };

    loadMetadata();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadStatement = useCallback(
    async (studentId: string, yearId?: string) => {
      if (!studentId) {
        setStatement(null);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const data = await feeStatementApi.getStatement(
          studentId,
          yearId || undefined,
        );
        setStatement(data);
      } catch (err: any) {
        setError(
          err?.response?.data?.message || 'Failed to fetch student fee statement',
        );
        setStatement(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Fetch statement when student or year changes with unmount cleanup and immediate stale state reset (Finding 1 & F-08)
  useEffect(() => {
    setStatement(null);
    setActiveInvoice(null);
    setCheckoutInvoice(null);
    if (!selectedStudentId) {
      setLoading(false);
      return;
    }

    loadStatement(selectedStudentId, selectedYearId);
  }, [selectedStudentId, selectedYearId, loadStatement]);

  const handleStudentSelect = (studentId: string) => {
    if (studentId !== selectedStudentId) {
      setStatement(null);
      setActiveInvoice(null);
      setSelectedStudentId(studentId);
    }
  };

  const handleYearSelect = (yearId: string) => {
    if (yearId !== selectedYearId) {
      setStatement(null);
      setActiveInvoice(null);
      setSelectedYearId(yearId);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Paid
          </span>
        );
      case 'PARTIALLY_PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Clock className="w-3 h-3" />
            Partially Paid
          </span>
        );
      case 'UPCOMING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Clock className="w-3 h-3" />
            Upcoming
          </span>
        );
      case 'DUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3" />
            Due
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            Overdue
          </span>
        );
      case 'VOID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Void
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Selector Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Student Fee Statements
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Itemized 12-month billing schedule, dynamically derived statuses, concession audits, and ledger snapshots.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Unable to load fee statement</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-indigo-600" />
              Filter / Search Student
            </label>
            <input
              type="text"
              placeholder="Search by name or admission #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600" />
              Select Student ({filteredStudents.length} available)
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => handleStudentSelect(e.target.value)}
              disabled={filteredStudents.length === 0}
              className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {filteredStudents.length === 0 ? (
                <option value="">No students available</option>
              ) : (
                <>
                  <option value="">-- Select a student --</option>
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.admissionNumber} — {s.firstName} {s.lastName} ({s.grade?.name || 'Class'})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Academic Session
            </label>
            <select
              value={selectedYearId}
              onChange={(e) => handleYearSelect(e.target.value)}
              className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading student fee obligations...
        </div>
      )}

      {!loading && !selectedStudentId && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          Please select a student from the dropdown above to view their fee statement.
        </div>
      )}

      {!loading && statement && statement.student?.id === selectedStudentId && (
        <>
          {/* Student Profile & Allocation Header */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xl border border-indigo-100 shrink-0">
                  {statement.student.firstName[0]}
                  {statement.student.lastName[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">
                      {statement.student.fullName}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 font-mono">
                      {statement.student.admissionNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                      {statement.student.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mt-1">
                    Class: <span className="font-semibold text-slate-800">{statement.student.grade} - {statement.student.section}</span> | Guardian: <span className="font-semibold text-slate-800">{statement.student.guardianName || 'N/A'}</span> ({statement.student.guardianEmail || 'No email'})
                  </p>
                </div>
              </div>

              <div className="text-left md:text-right">
                <span className="text-xs text-slate-400">Assigned Structure</span>
                <p className="text-sm font-bold text-slate-900">
                  {statement.allocation?.feeStructureName || 'No Structure Assigned'}
                </p>
                <div className="mt-1 flex items-center md:justify-end gap-1.5">
                  {statement.allocation?.concessionType === 'PERCENTAGE' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      <Percent className="w-3 h-3" />
                      {statement.allocation.concessionValue}% Concession
                    </span>
                  )}
                  {statement.allocation?.concessionType === 'FLAT_DISCOUNT' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      Flat {formatCurrency(statement.allocation.concessionValue)} Annual Concession
                    </span>
                  )}
                  {statement.allocation?.concessionType === 'NONE' && (
                    <span className="text-[11px] font-medium text-slate-500">
                      Standard Pricing (No Concession)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-100">
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                <span className="text-xs font-medium text-slate-500">Gross Schedule</span>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {formatCurrency(statement.summary.totalGrossAmount)}
                </p>
                <span className="text-[11px] text-slate-400">12 Billing Cycles</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                <span className="text-xs font-medium text-slate-500">Concessions</span>
                <p className="text-lg font-bold text-emerald-700 mt-1">
                  -{formatCurrency(statement.summary.totalDiscountAmount)}
                </p>
                <span className="text-[11px] text-slate-400">Reconciled to penny</span>
              </div>

              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40">
                <span className="text-xs font-semibold text-indigo-700">Net Principal</span>
                <p className="text-lg font-black text-indigo-900 mt-1">
                  {formatCurrency(statement.summary.totalNetAmount)}
                </p>
                {(statement.summary.totalAssessedFineAmount ?? 0) > 0 ? (
                  <div className="mt-0.5 space-y-0.5">
                    <span className="block text-[11px] text-amber-700 font-semibold">
                      +{formatCurrency(statement.summary.totalAssessedFineAmount)} Assessed Fines
                    </span>
                    {(statement.summary.totalWaivedFineAmount ?? 0) > 0 && (
                      <span className="block text-[10px] text-emerald-700">
                        (Waived: {formatCurrency(statement.summary.totalWaivedFineAmount)})
                      </span>
                    )}
                    <span className="block text-[10px] text-indigo-800 font-bold">
                      Total Payable: {formatCurrency(statement.summary.totalNetAmount + (statement.summary.totalAssessedFineAmount ?? 0))}
                    </span>
                  </div>
                ) : (
                  <span className="text-[11px] text-indigo-600 font-medium">Session Total</span>
                )}
              </div>

              <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40">
                <span className="text-xs font-semibold text-emerald-700">Total Paid</span>
                <p className="text-lg font-black text-emerald-800 mt-1">
                  {formatCurrency(statement.summary.totalPaidAmount ?? 0)}
                </p>
                <span className="text-[11px] text-emerald-600 font-medium">Authoritative Collections</span>
              </div>

              <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/40">
                <span className="text-xs font-semibold text-rose-700">Remaining Balance</span>
                <p className="text-lg font-black text-rose-900 mt-1">
                  {formatCurrency(
                    statement.summary.totalRemainingAmount !== undefined
                      ? statement.summary.totalRemainingAmount
                      : Math.max(
                          0,
                          statement.summary.totalNetAmount +
                            (statement.summary.totalAssessedFineAmount ?? 0) -
                            (statement.summary.totalPaidAmount || 0),
                        ),
                  )}
                </p>
                <span className="text-[11px] text-rose-600 font-medium">Outstanding Dues (Principal + Fines)</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                <span className="text-xs font-medium text-slate-500">Invoice Status Split</span>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {(statement.summary.statusBreakdown.PAID ?? 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold font-mono">
                      {statement.summary.statusBreakdown.PAID} Paid
                    </span>
                  )}
                  {(statement.summary.statusBreakdown.PARTIALLY_PAID ?? 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-semibold font-mono">
                      {statement.summary.statusBreakdown.PARTIALLY_PAID} Partial
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold font-mono">
                    {statement.summary.statusBreakdown.UPCOMING} Upcoming
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold font-mono">
                    {statement.summary.statusBreakdown.DUE} Due
                  </span>
                  {statement.summary.statusBreakdown.OVERDUE > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold font-mono">
                      {statement.summary.statusBreakdown.OVERDUE} Overdue
                    </span>
                  )}
                </div>
                {typeof statement.summary.totalCalculatedFinePreview === 'number' &&
                  statement.summary.totalCalculatedFinePreview > 0 && (
                    <div className="mt-2 text-[11px] font-semibold text-amber-800">
                      Est. Late Fine Preview: {formatCurrency(statement.summary.totalCalculatedFinePreview)}
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* 12-Month Schedule Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Monthly Fee Obligation Schedule
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Academic Session: {statement.academicYear.name} ({statement.invoices.length} invoices generated)
                </p>
              </div>
            </div>

            {statement.invoices.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-800">No invoices generated yet</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Go to Monthly Invoicing Generator to execute scheduled fee generation for this class.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Cycle</th>
                      <th className="py-3 px-4">Billing Month</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Gross Obligation</th>
                      <th className="py-3 px-4">Concession</th>
                      <th className="py-3 px-4">Net Principal & Fines</th>
                      <th className="py-3 px-4">Paid</th>
                      <th className="py-3 px-4">Balance</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {statement.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-400">
                          #{inv.billingMonth.toString().padStart(2, '0')}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {inv.monthName}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {new Date(inv.dueDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {formatCurrency(inv.grossAmount)}
                        </td>
                        <td className="py-3 px-4 font-mono text-emerald-700 font-medium">
                          {inv.discountAmount > 0 ? `-${formatCurrency(inv.discountAmount)}` : '₹0.00'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          <div>{formatCurrency(inv.netAmount)}</div>
                          {(inv.assessedFineAmount ?? 0) > 0 && (
                            <div className="text-[10px] font-semibold text-rose-700 mt-0.5">
                              +{formatCurrency(inv.assessedFineAmount)} Assessed Fine
                              {(inv.waivedFineAmount ?? 0) > 0
                                ? ` (Waived: ${formatCurrency(inv.waivedFineAmount)})`
                                : ''}
                            </div>
                          )}
                          {inv.finePreview && inv.finePreview.calculatedFine > 0 && (
                            <div className="text-[10px] font-semibold text-amber-700 mt-0.5">
                              +{formatCurrency(inv.finePreview.calculatedFine)} Fine Preview
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-emerald-700 font-semibold">
                          <div>{formatCurrency(inv.paidAmount ?? 0)}</div>
                          {(inv.paidFines ?? 0) > 0 && (
                            <div className="text-[10px] text-slate-500">
                              Prin: {formatCurrency(inv.paidPrincipal ?? 0)} | Fine: {formatCurrency(inv.paidFines)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          <div>
                            {formatCurrency(
                              inv.remainingBalance !== undefined
                                ? inv.remainingBalance
                                : Math.max(
                                    0,
                                    inv.netAmount + (inv.assessedFineAmount ?? 0) - (inv.paidAmount ?? 0),
                                  ),
                            )}
                          </div>
                          {(inv.remainingFines ?? 0) > 0 && (
                            <div className="text-[10px] text-rose-600 font-semibold">
                              Prin: {formatCurrency(inv.remainingPrincipal ?? 0)} | Fine: {formatCurrency(inv.remainingFines)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(inv.status)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {inv.status !== 'PAID' && inv.status !== 'VOID' && (
                              <button
                                onClick={() => setCheckoutInvoice(inv)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-xs"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                Pay Online
                              </button>
                            )}
                            <button
                              onClick={() => setActiveInvoice(inv)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Line Items ({inv.items.length})
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
        </>
      )}

      {/* Itemized Line Items Modal */}
      {activeInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                  Itemized Fee Snapshot
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {activeInvoice.monthName} Invoice Breakdown
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Due: {new Date(activeInvoice.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} | Status: {activeInvoice.status}
                </p>
              </div>
              <button
                onClick={() => setActiveInvoice(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[550px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Fee Head Snapshot</th>
                    <th className="py-2.5 px-3">Frequency</th>
                    <th className="py-2.5 px-3 text-right">Gross</th>
                    <th className="py-2.5 px-3 text-right">Concession</th>
                    <th className="py-2.5 px-3 text-right">Net</th>
                    <th className="py-2.5 px-3 text-right">Paid</th>
                    <th className="py-2.5 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {activeInvoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {item.feeHeadNameSnapshot}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {item.billingFrequencySnapshot}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatCurrency(item.grossAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {item.discountAmount > 0 ? `-${formatCurrency(item.discountAmount)}` : '₹0.00'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(item.netAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                        {formatCurrency(item.paidAmount ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(
                          item.remainingBalance !== undefined
                            ? item.remainingBalance
                            : Math.max(0, item.netAmount - (item.paidAmount ?? 0)),
                        )}
                      </td>
                    </tr>
                  ))}
                  {((activeInvoice.grossAssessedFineAmount ?? 0) > 0 ||
                    (activeInvoice.assessedFineAmount ?? 0) > 0) && (
                    <tr className="bg-amber-50/40">
                      <td className="py-2.5 px-3 font-semibold text-amber-900">
                        Assessed Late Fine
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                          FINE
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-900">
                        {formatCurrency(activeInvoice.grossAssessedFineAmount ?? activeInvoice.assessedFineAmount ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {(activeInvoice.waivedFineAmount ?? 0) > 0
                          ? `-${formatCurrency(activeInvoice.waivedFineAmount)}`
                          : '₹0.00'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-900">
                        {formatCurrency(activeInvoice.assessedFineAmount ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                        {formatCurrency(activeInvoice.paidFines ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-800">
                        {formatCurrency(activeInvoice.remainingFines ?? 0)}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-200 text-slate-900">
                    <td colSpan={2} className="py-2.5 px-3">
                      Total Invoice Obligation
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatCurrency(
                        activeInvoice.grossAmount + (activeInvoice.grossAssessedFineAmount ?? 0),
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                      -{formatCurrency(
                        activeInvoice.discountAmount + (activeInvoice.waivedFineAmount ?? 0),
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-indigo-700 font-black">
                      {formatCurrency(
                        activeInvoice.netAmount + (activeInvoice.assessedFineAmount ?? 0),
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-black">
                      {formatCurrency(activeInvoice.paidAmount ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-900 font-black">
                      {formatCurrency(
                        activeInvoice.remainingBalance !== undefined
                          ? activeInvoice.remainingBalance
                          : Math.max(
                              0,
                              activeInvoice.netAmount +
                                (activeInvoice.assessedFineAmount ?? 0) -
                                (activeInvoice.paidAmount ?? 0),
                            ),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setActiveInvoice(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
              >
                Close
              </button>
              {activeInvoice.status !== 'PAID' && activeInvoice.status !== 'VOID' && (
                <button
                  onClick={() => {
                    const target = activeInvoice;
                    setActiveInvoice(null);
                    setCheckoutInvoice(target);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Pay Online
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Online Checkout Modal (Phase F) */}
      <OnlineCheckoutModal
        isOpen={!!checkoutInvoice}
        invoice={checkoutInvoice}
        studentName={
          statement
            ? `${statement.student.firstName} ${statement.student.lastName}`
            : ''
        }
        studentAdmissionNumber={statement?.student.admissionNumber || ''}
        onClose={() => setCheckoutInvoice(null)}
        onRefreshStatement={() => {
          if (selectedStudentId) {
            loadStatement(selectedStudentId, selectedYearId);
          }
        }}
      />
    </div>
  );
};
