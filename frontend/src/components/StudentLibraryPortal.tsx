import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Library,
  DollarSign,
  Calendar,
} from 'lucide-react';
import {
  libraryApi,
  StudentLoanItem,
  StudentFineItem,
} from '../services/library.api';

export const StudentLibraryPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'loans' | 'fines'>('loans');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loans state
  const [activeLoans, setActiveLoans] = useState<StudentLoanItem[]>([]);
  const [pastLoans, setPastLoans] = useState<StudentLoanItem[]>([]);
  const [loanView, setLoanView] = useState<'active' | 'history'>('active');

  // Fines state
  const [fines, setFines] = useState<StudentFineItem[]>([]);

  const loadLoans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await libraryApi.getMyLoans();
      setActiveLoans(data.activeLoans || []);
      setPastLoans(data.pastLoans || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load borrowing records');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFines = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await libraryApi.getMyFines();
      setFines(data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load library fines');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'loans') {
      loadLoans();
    } else if (activeTab === 'fines') {
      loadFines();
    }
  }, [activeTab, loadLoans, loadFines]);

  // Derived fine summary
  const pendingFines = fines.filter((f) => f.status === 'PENDING');
  const totalPendingFine = pendingFines.reduce((sum, f) => sum + Number(f.fineAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Library className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                School Library
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Track your borrowed books, active loans, and view library desk notices.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (activeTab === 'loans') loadLoans();
              else if (activeTab === 'fines') loadFines();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 mt-6 -mb-6 space-x-6">
          <button
            onClick={() => setActiveTab('loans')}
            className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'loans'
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-700 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            My Borrowed Books
            {activeLoans.length > 0 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-900 border border-indigo-200 dark:border-transparent font-bold dark:bg-indigo-900/50 dark:text-indigo-300">
                {activeLoans.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('fines')}
            className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'fines'
                ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-slate-700 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Library Fines & Desk
            {pendingFines.length > 0 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-950 border border-amber-300 dark:border-transparent font-bold dark:bg-amber-900/50 dark:text-amber-300">
                ₹{totalPendingFine.toFixed(2)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-300 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: MY BORROWED BOOKS */}
      {activeTab === 'loans' && (
        <div className="space-y-6">
          {/* Sub-view toggle */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex gap-2">
              <button
                onClick={() => setLoanView('active')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  loanView === 'active'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-950 border border-slate-300 dark:border-transparent dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Active Loans ({activeLoans.length})
              </button>
              <button
                onClick={() => setLoanView('history')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  loanView === 'history'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-slate-950 border border-slate-300 dark:border-transparent dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Borrowing History ({pastLoans.length})
              </button>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium hidden sm:block">
              Present your student ID card at the library desk to return or renew
            </div>
          </div>

          {/* Active Loans View */}
          {loanView === 'active' && (
            <div>
              {loading && activeLoans.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">Loading your loans...</div>
              ) : activeLoans.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-800">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-slate-800 dark:text-slate-200">
                    No active loans
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    You currently do not have any borrowed books. Visit the school library circulation desk to borrow reading materials!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeLoans.map((loan) => {
                    const dueDate = new Date(loan.dueDate);
                    const isOverdue = loan.isOverdue || dueDate < new Date();
                    const diffDays = Math.ceil(
                      (dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                    );

                    return (
                      <div
                        key={loan.id}
                        className={`bg-white dark:bg-slate-900 rounded-xl p-5 border shadow-sm flex flex-col justify-between ${
                          isOverdue
                            ? 'border-red-300 dark:border-red-800 bg-red-50/20 dark:bg-red-950/10'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-300 font-bold dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              Accession: {loan.accessionNumber}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                                isOverdue
                                  ? 'bg-red-100 text-red-900 border border-red-300 dark:border-transparent dark:bg-red-900/50 dark:text-red-300'
                                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:border-transparent dark:bg-emerald-900/50 dark:text-emerald-300'
                              }`}
                            >
                              {isOverdue ? 'OVERDUE' : 'BORROWED'}
                            </span>
                          </div>

                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
                            {loan.bookTitle}
                          </h3>
                          <p className="text-sm text-slate-700 dark:text-slate-400 mt-0.5">
                            By {loan.bookAuthor}
                          </p>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs space-y-2">
                          <div className="flex items-center justify-between text-slate-700 dark:text-slate-400 font-medium">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              Issued: {new Date(loan.issuedAt).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1.5 font-semibold">
                              <Clock className="w-3.5 h-3.5" />
                              Due: {dueDate.toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-slate-700 dark:text-slate-400 font-medium">
                              Renewals used: {loan.renewalCount ?? 0}
                            </span>
                            <span
                              className={`font-bold ${
                                isOverdue
                                  ? 'text-red-800 dark:text-red-400'
                                  : diffDays <= 2
                                  ? 'text-amber-900 dark:text-amber-400'
                                  : 'text-emerald-800 dark:text-emerald-400'
                              }`}
                            >
                              {isOverdue
                                ? `${Math.abs(diffDays)} days overdue`
                                : diffDays === 0
                                ? 'Due today'
                                : `${diffDays} days left`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Past Loans History View */}
          {loanView === 'history' && (
            <div>
              {pastLoans.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-800">
                  <Clock className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-slate-800 dark:text-slate-200">
                    No past borrowing history
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    When you return books to the library, your reading record will be listed here.
                  </p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-semibold">
                        <tr>
                          <th className="px-4 py-3">Book Title & Author</th>
                          <th className="px-4 py-3">Accession</th>
                          <th className="px-4 py-3">Issued On</th>
                          <th className="px-4 py-3">Returned On</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {pastLoans.map((loan) => (
                          <tr key={loan.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {loan.bookTitle}
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-400">
                                {loan.bookAuthor}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-400">
                              {loan.accessionNumber}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-400">
                              {new Date(loan.issuedAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-400">
                              {loan.returnedAt ? new Date(loan.returnedAt).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-block px-2 py-0.5 text-xs rounded-full font-semibold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:border-transparent dark:bg-emerald-900/30 dark:text-emerald-400">
                                {loan.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LIBRARY FINES & DESK */}
      {activeTab === 'fines' && (
        <div className="space-y-6">
          {/* Important Ledger Notice */}
          <div className="bg-amber-100/70 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-800/60 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-800 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-950 dark:text-amber-200 text-sm">
                  Independent Library Desk Settlement Notice
                </h4>
                <p className="text-xs text-amber-950 dark:text-amber-300/90 mt-1 leading-relaxed font-medium">
                  Library fines are assessed by the school library desk for overdue loans or damaged materials.
                  <strong> Library fines are strictly separated from your tuition fee accounts</strong> and cannot be paid through tuition fee gateways.
                  All fine settlements and receipts are processed exclusively at the school library circulation desk.
                </p>
              </div>
            </div>
          </div>

          {/* Fines summary card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Total Pending Fine</div>
              <div className="text-2xl font-bold text-amber-800 dark:text-amber-400 mt-1">
                ₹{totalPendingFine.toFixed(2)}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Pending Fines Count</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-1">
                {pendingFines.length}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Total Fines Settled</div>
              <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-400 mt-1">
                {fines.filter((f) => f.status === 'PAID').length}
              </div>
            </div>
          </div>

          {/* Fines Table */}
          {loading && fines.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">Loading fine records...</div>
          ) : fines.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-800">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-medium text-slate-800 dark:text-slate-200">
                No library fines on record
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Your library account is in good standing with zero assessed fines.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Book Title</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Overdue Days</th>
                      <th className="px-4 py-3">Assessed Date</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Settlement / Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fines.map((fine) => (
                      <tr key={fine.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {fine.bookTitle || 'Library Item'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-800 dark:text-slate-300">
                          {fine.reason}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-400">
                          {fine.overdueDays ?? 0} days
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-400">
                          {fine.assessedAt ? new Date(fine.assessedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          ₹{Number(fine.fineAmount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                              fine.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:border-transparent dark:bg-emerald-900/40 dark:text-emerald-300'
                                : fine.status === 'WAIVED'
                                ? 'bg-blue-100 text-blue-900 border border-blue-300 dark:border-transparent dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-950 border border-amber-300 dark:border-transparent dark:bg-amber-900/40 dark:text-amber-300'
                            }`}
                          >
                            {fine.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-400">
                          {fine.paymentReference ? (
                            <span className="font-mono text-[11px] bg-slate-100 text-slate-800 border border-slate-200 dark:border-transparent dark:bg-slate-800 dark:text-slate-300 px-2 py-1 rounded">
                              Ref: {fine.paymentReference}
                            </span>
                          ) : fine.status === 'WAIVED' ? (
                            <span className="italic text-slate-600 dark:text-slate-400">Waived</span>
                          ) : (
                            <span className="text-amber-900 dark:text-amber-400 font-semibold">
                              Pay at desk
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentLibraryPortal;
