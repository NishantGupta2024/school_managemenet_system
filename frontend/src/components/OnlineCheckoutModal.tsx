import React, { useState, useEffect } from 'react';
import {
  onlinePaymentsApi,
  FeeInvoice,
  OnlinePaymentOrderResponse,
} from '../services/api';
import { loadRazorpayScript } from '../utils/razorpay';
import {
  CreditCard,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Lock,
  ShieldCheck,
} from 'lucide-react';

interface OnlineCheckoutModalProps {
  isOpen: boolean;
  invoice: FeeInvoice | null;
  studentName: string;
  studentAdmissionNumber: string;
  onClose: () => void;
  onRefreshStatement?: () => void;
}

export const OnlineCheckoutModal: React.FC<OnlineCheckoutModalProps> = ({
  isOpen,
  invoice,
  studentName,
  studentAdmissionNumber,
  onClose,
  onRefreshStatement,
}) => {
  const [paymentType, setPaymentType] = useState<'FULL' | 'CUSTOM'>('FULL');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);

  // Post-checkout state: received payment ID from Razorpay handler
  const [completedPaymentRef, setCompletedPaymentRef] = useState<string | null>(
    null,
  );

  const totalOutstanding = React.useMemo(() => {
    if (!invoice) return 0;
    if (invoice.remainingBalance !== undefined) {
      return Number(invoice.remainingBalance);
    }
    return Math.max(
      0,
      Number(invoice.netAmount || 0) +
        Number(invoice.assessedFineAmount || 0) -
        Number(invoice.paidAmount || 0),
    );
  }, [invoice]);

  // Reset form on invoice change
  useEffect(() => {
    setPaymentType('FULL');
    setCustomAmount('');
    setIsInitializing(false);
    setErrorMessage(null);
    setCancelledMessage(null);
    setCompletedPaymentRef(null);
  }, [invoice?.id, isOpen]);

  if (!isOpen || !invoice) {
    return null;
  }

  const formatCurrency = (val: number | string) => {
    const num = Number(val);
    if (isNaN(num)) return '₹0.00';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(num);
  };

  const handleProceedToCheckout = async () => {
    setErrorMessage(null);
    setCancelledMessage(null);
    setCompletedPaymentRef(null);

    // 1. Amount determination
    let amountToPay: number | undefined;
    if (paymentType === 'CUSTOM') {
      const parsed = parseFloat(customAmount);
      if (isNaN(parsed) || parsed <= 0) {
        setErrorMessage('Please enter a valid positive payment amount.');
        return;
      }
      if (parsed < 1) {
        setErrorMessage('Minimum online payment amount is ₹1.00 (100 paise).');
        return;
      }
      if (parsed > totalOutstanding) {
        setErrorMessage(
          `Payment amount cannot exceed total outstanding balance of ${formatCurrency(totalOutstanding)}.`,
        );
        return;
      }
      amountToPay = Number(parsed.toFixed(2));
    }

    setIsInitializing(true);

    try {
      // 2. Load official Razorpay Checkout SDK script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        throw new Error(
          'Failed to load Razorpay payment SDK. Please check your internet connection and try again.',
        );
      }

      // 3. Generate client attempt idempotency key
      const idempotencyKey = `chk_${invoice.id.substring(0, 8)}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 4. Create server-side order (TEST Mode)
      const orderResponse: OnlinePaymentOrderResponse =
        await onlinePaymentsApi.createOrder(
          {
            invoiceId: invoice.id,
            amount: amountToPay,
            idempotencyKey,
          },
          idempotencyKey,
        );

      // 5. Configure Razorpay Standard Checkout modal options
      const options = {
        key: orderResponse.keyId,
        amount: orderResponse.amountInPaise,
        currency: orderResponse.currency || 'INR',
        name: orderResponse.schoolName || 'School Fee Payment',
        description: `Fee Payment - ${invoice.monthName} (#${invoice.id.substring(0, 8)})`,
        order_id: orderResponse.orderId,
        prefill: {
          name: orderResponse.studentName || studentName,
          email: orderResponse.studentEmail || undefined,
          contact: orderResponse.studentPhone || undefined,
        },
        notes: {
          invoiceId: invoice.id,
          studentId: orderResponse.studentId,
          idempotencyKey,
        },
        theme: {
          color: '#4F46E5', // Indigo theme matching application
        },
        handler: (response: any) => {
          // IMPORTANT: A client-side success callback does NOT mark an invoice paid.
          // It confirms checkout submission at gateway; actual financial settlement occurs in Phase G.
          setIsInitializing(false);
          setCompletedPaymentRef(response.razorpay_payment_id || 'PENDING');
        },
        modal: {
          ondismiss: () => {
            setIsInitializing(false);
            setCancelledMessage(
              'Checkout was closed or cancelled. No charges were made, and your invoice balance remains unchanged.',
            );
          },
        },
      };

      // 6. Launch Razorpay modal
      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on('payment.failed', (failResponse: any) => {
        setIsInitializing(false);
        const reason =
          failResponse.error?.description ||
          failResponse.error?.reason ||
          'Payment was declined by provider.';
        setErrorMessage(`Payment attempt failed: ${reason}`);
      });

      rzpInstance.open();
    } catch (err: any) {
      setIsInitializing(false);
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Unable to initialize online checkout. Please try again.';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                Online Payment
              </span>
              <h3 className="text-lg font-bold text-slate-900">
                Pay Fee Online — {invoice.monthName}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isInitializing}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TEST Mode Pill */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span className="font-semibold">Razorpay TEST Mode Active</span>
          </div>
          <span className="text-[11px] text-purple-700 font-medium">Sandbox Mode</span>
        </div>

        {/* Student & Invoice Summary */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Student:</span>
            <span className="font-bold text-slate-900">
              {studentName} ({studentAdmissionNumber})
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Cycle / Due Date:</span>
            <span className="font-medium text-slate-800">
              {new Date(invoice.dueDate).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Total Outstanding Balance:</span>
            <span className="font-mono font-bold text-rose-700 text-sm">
              {formatCurrency(totalOutstanding)}
            </span>
          </div>
        </div>

        {/* Post-Checkout Result Banner (Submitted Pending Settlement) */}
        {completedPaymentRef && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">
                  Payment Submitted — Pending Server Settlement
                </p>
                <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                  Payment reference: <code className="font-mono font-bold bg-emerald-100 px-1 py-0.5 rounded">{completedPaymentRef}</code>.
                </p>
                <p className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
                  Your checkout attempt was received in TEST mode. In accordance with system financial integrity rules, your invoice will be settled and receipts issued upon server-side webhook confirmation (Phase G).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-emerald-200/60">
              {onRefreshStatement && (
                <button
                  type="button"
                  onClick={() => {
                    onRefreshStatement();
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Invoice Status
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Cancellation Notice */}
        {cancelledMessage && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Checkout Cancelled</p>
              <p className="text-amber-800 mt-0.5">{cancelledMessage}</p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Payment Initialization Error</p>
              <p className="text-rose-800 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Payment Amount Selection (Only show if not already submitted) */}
        {!completedPaymentRef && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Select Payment Amount
            </label>

            <div className="space-y-2">
              <label
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                  paymentType === 'FULL'
                    ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 font-medium'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="paymentType"
                    checked={paymentType === 'FULL'}
                    onChange={() => setPaymentType('FULL')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">Pay Full Balance</span>
                </div>
                <span className="font-mono font-bold text-sm">
                  {formatCurrency(totalOutstanding)}
                </span>
              </label>

              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                  paymentType === 'CUSTOM'
                    ? 'border-indigo-600 bg-indigo-50/40'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="paymentType"
                    checked={paymentType === 'CUSTOM'}
                    onChange={() => setPaymentType('CUSTOM')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-slate-800">
                    Pay Custom / Partial Amount
                  </span>
                </div>

                {paymentType === 'CUSTOM' && (
                  <div className="mt-3 pl-6">
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-sm font-bold">
                        ₹
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        max={totalOutstanding}
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        placeholder={`e.g. 500.00 (Max: ${totalOutstanding})`}
                        className="w-full pl-8 pr-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Minimum online payment is ₹1.00. Maximum is {formatCurrency(totalOutstanding)}.
                    </p>
                  </div>
                )}
              </label>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        {!completedPaymentRef && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isInitializing}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleProceedToCheckout}
              disabled={isInitializing || totalOutstanding <= 0}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition shadow-sm flex items-center gap-2 ${
                isInitializing || totalOutstanding <= 0
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              }`}
            >
              {isInitializing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Initializing Checkout...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Proceed to Razorpay Checkout
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
