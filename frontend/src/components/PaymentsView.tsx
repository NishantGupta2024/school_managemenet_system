import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  paymentsApi,
  feeStatementApi,
  metaApi,
  Student,
  AcademicYear,
  PaymentRecord,
  ReceiptRecord,
  PaymentMethod,
  PaymentStatus,
  ReversalType,
  StudentFeeStatement,
  UserRole,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard,
  Receipt,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Printer,
  Download,
  RotateCcw,
  Undo2,
  Eye,
  X,
  DollarSign,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  Lock,
  XCircle,
  Clock,
} from 'lucide-react';

export interface PendingPaymentOperation {
  operationType: 'COLLECTION' | 'REFUND' | 'REVERSAL';
  idempotencyKey: string;
  fingerprint: string;
  createdAt: number;
  context: {
    studentId?: string;
    studentName?: string;
    academicYearId?: string;
    amount?: number | string;
    paymentMethod?: PaymentMethod;
    referenceNumber?: string;
    bankName?: string;
    notes?: string;
    paymentId?: string;
    paymentNumber?: string;
    refundAmount?: number | string;
    refundReason?: string;
    refundMode?: string;
    refundReference?: string;
    reversalType?: ReversalType;
    reversalReason?: string;
  };
}

export const PENDING_PAYMENT_OP_STORAGE_KEY = 'fee_pending_payment_op';

export type PendingOperationType = 'COLLECTION' | 'REFUND' | 'REVERSAL';

const PENDING_OPERATION_TYPES: PendingOperationType[] = ['COLLECTION', 'REFUND', 'REVERSAL'];

/** Records older than this are flagged as stale in the UI. They are NEVER discarded automatically. */
export const STALE_RECORD_MS = 24 * 60 * 60 * 1000;

/** Idempotency keys are client-generated identifiers. Anything outside this shape is not trusted. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && IDEMPOTENCY_KEY_PATTERN.test(key);
}

/**
 * Validates whether an operation has all required fields to safely reconstruct
 * and retry the exact original request. Age is intentionally NOT a validity criterion:
 * an old record whose outcome is unknown is still unresolved.
 */
export function isPendingOperationPayloadValid(op: any): boolean {
  if (!op || typeof op !== 'object') return false;
  if (!PENDING_OPERATION_TYPES.includes(op.operationType)) return false;
  if (!isValidIdempotencyKey(op.idempotencyKey)) return false;
  if (typeof op.createdAt !== 'number' || !Number.isFinite(op.createdAt) || op.createdAt <= 0) return false;

  const ctx = op.context;
  if (!ctx || typeof ctx !== 'object') return false;

  if (op.operationType === 'COLLECTION') {
    const amt = typeof ctx.amount === 'number' ? ctx.amount : parseFloat(String(ctx.amount));
    return !(
      !ctx.studentId ||
      typeof ctx.studentId !== 'string' ||
      !ctx.studentId.trim() ||
      !ctx.academicYearId ||
      typeof ctx.academicYearId !== 'string' ||
      !ctx.academicYearId.trim() ||
      isNaN(amt) ||
      amt <= 0 ||
      !ctx.paymentMethod ||
      typeof ctx.paymentMethod !== 'string'
    );
  }

  if (op.operationType === 'REFUND') {
    const amt =
      typeof ctx.refundAmount === 'number' ? ctx.refundAmount : parseFloat(String(ctx.refundAmount));
    return !(
      !ctx.paymentId ||
      typeof ctx.paymentId !== 'string' ||
      !ctx.paymentId.trim() ||
      isNaN(amt) ||
      amt <= 0 ||
      !ctx.refundReason ||
      typeof ctx.refundReason !== 'string' ||
      ctx.refundReason.trim().length < 10
    );
  }

  // REVERSAL
  return !(
    !ctx.paymentId ||
    typeof ctx.paymentId !== 'string' ||
    !ctx.paymentId.trim() ||
    !ctx.reversalType ||
    !['VOID', 'BOUNCE', 'CORRECTION'].includes(ctx.reversalType) ||
    !ctx.reversalReason ||
    typeof ctx.reversalReason !== 'string' ||
    ctx.reversalReason.trim().length < 10
  );
}

/**
 * Classification of whatever is currently stored in the recovery slot.
 *  - NONE:           nothing stored.
 *  - VALID:          complete record; the exact original payload can be retried with the original key.
 *  - PARTIAL:        operation type and idempotency key are reliable, but the request context is incomplete.
 *                    The outcome can be checked by key; the payload cannot be retried.
 *  - UNRECONCILABLE: the record cannot be trusted (malformed JSON, unknown type, missing/invalid key...).
 *                    `key` is only set when it could be extracted AND validated reliably.
 * No classification ever deletes or rewrites the stored record.
 */
export type RecoveryRecordState =
  | { kind: 'NONE' }
  | { kind: 'VALID'; op: PendingPaymentOperation }
  | { kind: 'PARTIAL'; op: PendingPaymentOperation }
  | { kind: 'UNRECONCILABLE'; key: string | null; operationType: string | null; reason: string };

export function classifyRecoveryRecord(raw: string | null): RecoveryRecordState {
  if (raw === null) return { kind: 'NONE' };

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON: extract the key only if it matches the strict key shape.
    const keyMatch = /"idempotencyKey"\s*:\s*"([^"\\]{1,200})"/.exec(raw);
    const typeMatch = /"operationType"\s*:\s*"([A-Z_]{1,32})"/.exec(raw);
    return {
      kind: 'UNRECONCILABLE',
      key: keyMatch && isValidIdempotencyKey(keyMatch[1]) ? keyMatch[1] : null,
      operationType: typeMatch && PENDING_OPERATION_TYPES.includes(typeMatch[1] as PendingOperationType) ? typeMatch[1] : null,
      reason: 'Stored recovery record is not valid JSON.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      kind: 'UNRECONCILABLE',
      key: null,
      operationType: null,
      reason: 'Stored recovery record has an unexpected structure.',
    };
  }

  const key = isValidIdempotencyKey(parsed.idempotencyKey) ? parsed.idempotencyKey : null;
  if (!key) {
    return {
      kind: 'UNRECONCILABLE',
      key: null,
      operationType: PENDING_OPERATION_TYPES.includes(parsed.operationType) ? parsed.operationType : null,
      reason: 'Stored recovery record has a missing or invalid idempotency key.',
    };
  }

  if (!PENDING_OPERATION_TYPES.includes(parsed.operationType)) {
    return {
      kind: 'UNRECONCILABLE',
      key,
      operationType: null,
      reason: 'Stored recovery record has an unknown operation type.',
    };
  }

  if (isPendingOperationPayloadValid(parsed)) {
    return { kind: 'VALID', op: parsed as PendingPaymentOperation };
  }

  const createdAt =
    typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt) && parsed.createdAt > 0
      ? parsed.createdAt
      : Date.now();
  return {
    kind: 'PARTIAL',
    op: {
      operationType: parsed.operationType,
      idempotencyKey: key,
      fingerprint: typeof parsed.fingerprint === 'string' ? parsed.fingerprint : '',
      createdAt,
      context: parsed.context && typeof parsed.context === 'object' && !Array.isArray(parsed.context) ? parsed.context : {},
    },
  };
}

function readRecoveryRecord(): RecoveryRecordState {
  try {
    return classifyRecoveryRecord(sessionStorage.getItem(PENDING_PAYMENT_OP_STORAGE_KEY));
  } catch {
    return {
      kind: 'UNRECONCILABLE',
      key: null,
      operationType: null,
      reason: 'Session storage is unavailable, so recovery state cannot be verified.',
    };
  }
}

export type SavePendingResult = { ok: true } | { ok: false; reason: string };

/**
 * Persists the recovery record BEFORE any financial request is sent.
 * Refuses (without touching the existing record) when any other operation, or any damaged record, occupies the slot.
 * Callers MUST abort the network request when `ok` is false.
 */
export function savePendingPaymentOperation(op: PendingPaymentOperation): SavePendingResult {
  try {
    const existing = readRecoveryRecord();
    if (existing.kind === 'VALID' || existing.kind === 'PARTIAL') {
      if (
        existing.op.operationType !== op.operationType ||
        existing.op.idempotencyKey !== op.idempotencyKey
      ) {
        return {
          ok: false,
          reason: `Another ${existing.op.operationType.toLowerCase()} operation (key ${existing.op.idempotencyKey.slice(0, 8)}...) is still unresolved. Resolve it before starting a new ${op.operationType.toLowerCase()}. No request was sent.`,
        };
      }
    } else if (existing.kind === 'UNRECONCILABLE') {
      return {
        ok: false,
        reason:
          'A damaged recovery record is present and must be reconciled by a supervisor before any new payment operation. No request was sent.',
      };
    }

    const serialized = JSON.stringify(op);
    sessionStorage.setItem(PENDING_PAYMENT_OP_STORAGE_KEY, serialized);
    if (sessionStorage.getItem(PENDING_PAYMENT_OP_STORAGE_KEY) !== serialized) {
      return { ok: false, reason: 'Recovery state could not be persisted. No request was sent.' };
    }
    return { ok: true };
  } catch (e) {
    console.error('Failed to save pending payment operation to sessionStorage', e);
    return { ok: false, reason: 'Recovery state could not be persisted. No request was sent.' };
  }
}

/** Returns the stored operation only when it is complete. Never deletes or rewrites anything. */
export function getPendingPaymentOperation(): PendingPaymentOperation | null {
  const state = readRecoveryRecord();
  return state.kind === 'VALID' ? state.op : null;
}

/**
 * Removes the stored recovery record ONLY when both the operation type and the idempotency key match.
 * Returns true when a record was removed.
 */
export function clearPendingPaymentOperation(
  expectedType: PendingOperationType,
  expectedKey: string,
): boolean {
  try {
    const state = readRecoveryRecord();
    if (
      (state.kind === 'VALID' || state.kind === 'PARTIAL') &&
      state.op.operationType === expectedType &&
      state.op.idempotencyKey === expectedKey
    ) {
      sessionStorage.removeItem(PENDING_PAYMENT_OP_STORAGE_KEY);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to clear pending payment operation from sessionStorage', e);
    return false;
  }
}

/**
 * Removes an unreconcilable record only when the server has established the outcome of the exact
 * idempotency key that was extracted from it.
 */
export function clearUnreconcilableRecord(expectedKey: string): boolean {
  try {
    const state = readRecoveryRecord();
    if (state.kind === 'UNRECONCILABLE' && state.key !== null && state.key === expectedKey) {
      sessionStorage.removeItem(PENDING_PAYMENT_OP_STORAGE_KEY);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to clear unreconcilable recovery record', e);
    return false;
  }
}

/**
 * Transport-level and server-side conditions under which the outcome of a financial request is UNKNOWN.
 * Only a definitive rejection (4xx other than 408/425/429 and idempotency conflicts) proves the
 * request did not commit.
 */
export function isAmbiguousPaymentError(err: any): boolean {
  if (!err) return true;
  if (!err.response) return true; // Network interruption, timeout, connection reset
  const code = typeof err.code === 'string' ? err.code.toUpperCase() : '';
  if (
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ERR_NETWORK' ||
    (typeof err.message === 'string' && err.message.toLowerCase().includes('timeout'))
  ) {
    return true;
  }
  const status = Number(err.response?.status);
  if (!Number.isFinite(status)) return true;
  if (status >= 500) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  if (status === 409 && /idempotency/i.test(String(err.response?.data?.message || ''))) return true;
  return false;
}

export type RefundLookupVerdict =
  | { verdict: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PENDING'; status: string }
  | { verdict: 'MISMATCH'; reason: string };

/**
 * Evaluates a refund lookup result against the specific pending operation: idempotency key (implied by the
 * lookup), payment ID, and amount. Returns null when the result is not a refund record.
 * The parent payment's status (e.g. PARTIALLY_REFUNDED) is deliberately never consulted.
 */
export function evaluateRefundLookup(res: any, op: PendingPaymentOperation): RefundLookupVerdict | null {
  if (!res || !res.found || res.operationType !== 'REFUND') return null;
  const refund = res.refund;

  const expectedPaymentId = op.context.paymentId;
  if (expectedPaymentId && (!refund || refund.paymentId !== expectedPaymentId)) {
    return { verdict: 'MISMATCH', reason: 'payment does not match the pending refund' };
  }

  const expectedAmount =
    typeof op.context.refundAmount === 'number'
      ? op.context.refundAmount
      : parseFloat(String(op.context.refundAmount));
  if (Number.isFinite(expectedAmount) && expectedAmount > 0) {
    const actualAmount = Number(refund?.refundAmount);
    if (!Number.isFinite(actualAmount) || Math.abs(actualAmount - expectedAmount) >= 0.005) {
      return { verdict: 'MISMATCH', reason: 'amount does not match the pending refund' };
    }
  }

  const status: string = res.status || refund?.status || 'PENDING';
  if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED') {
    return { verdict: status, status };
  }
  return { verdict: 'PENDING', status };
}

export type RecoveryTone = 'success' | 'pending' | 'failure' | 'unresolved';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SUPPORTED_PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer / NEFT / RTGS' },
  { value: 'UPI', label: 'UPI / QR Code' },
  { value: 'POS_CARD', label: 'POS / Debit / Credit Card' },
  { value: 'DEMAND_DRAFT', label: 'Demand Draft' },
  { value: 'OTHER', label: 'Other' },
];

export const PaymentsView: React.FC = () => {
  const { user } = useAuth();

  const isStaff =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN ||
    user?.role === UserRole.SCHOOL_ADMIN ||
    user?.role === UserRole.FEE_STAFF;

  const isAdmin =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN ||
    user?.role === UserRole.SCHOOL_ADMIN;

  const [activeSubTab, setActiveSubTab] = useState<'collect' | 'history'>(
    isStaff ? 'collect' : 'history',
  );

  // Metadata
  const [students, setStudents] = useState<Student[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  // Collection Form State
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedYearId, setSelectedYearId] = useState('');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateUuid());

  // Statement Preview for selected student
  const [statement, setStatement] = useState<StudentFeeStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementReloadTick, setStatementReloadTick] = useState(0);

  // In-flight submission state (prevents double submissions)
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [, setCollectAttemptFailed] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState<ReceiptRecord | null>(null);

  // History State
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPayments, setTotalPayments] = useState(0);

  // History Filters
  const [filterStudentId, setFilterStudentId] = useState('');
  const [filterYearId, setFilterYearId] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Modals
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptRecord | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Batch Receipt Selection (3 different receipts per A4 page)
  const [selectedReceiptNumbers, setSelectedReceiptNumbers] = useState<string[]>([]);
  const [isDownloadingBatch, setIsDownloadingBatch] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [reversingPayment, setReversingPayment] = useState<PaymentRecord | null>(null);
  const [reversalType, setReversalType] = useState<ReversalType>('VOID');
  const [reversalReason, setReversalReason] = useState('');
  const [reversalSubmitting, setReversalSubmitting] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [, setReversalAttemptFailed] = useState(false);
  const [, setReversalIdempotencyKey] = useState<string>('');

  const [refundingPayment, setRefundingPayment] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundMode, setRefundMode] = useState('BANK_TRANSFER');
  const [refundReference, setRefundReference] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [, setRefundAttemptFailed] = useState(false);
  const [, setRefundIdempotencyKey] = useState<string>('');

  // Pending operations for uncertainty recovery (Task 2 & 3)
  const [pendingCollectionOp, setPendingCollectionOp] = useState<PendingPaymentOperation | null>(null);
  const pendingCollectionOpRef = useRef<PendingPaymentOperation | null>(null);

  const [pendingReversalOp, setPendingReversalOp] = useState<PendingPaymentOperation | null>(null);
  const pendingReversalOpRef = useRef<PendingPaymentOperation | null>(null);

  const [pendingRefundOp, setPendingRefundOp] = useState<PendingPaymentOperation | null>(null);
  const pendingRefundOpRef = useRef<PendingPaymentOperation | null>(null);

  // Outcome lookup state
  const [checkingOutcome, setCheckingOutcome] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [historyRecoveryMessage, setHistoryRecoveryMessage] = useState<string | null>(null);
  const [historyRecoveryTone, setHistoryRecoveryTone] = useState<RecoveryTone>('unresolved');

  // Damaged / untrusted recovery record. While set, EVERY financial operation is blocked.
  const [unreconcilableRecord, setUnreconcilableRecord] = useState<{
    key: string | null;
    operationType: string | null;
    reason: string;
  } | null>(null);
  const [unreconcilableNotice, setUnreconcilableNotice] = useState<string | null>(null);
  const hasUnreconcilable = Boolean(unreconcilableRecord);

  const announceHistory = (message: string | null, tone: RecoveryTone) => {
    setHistoryRecoveryMessage(message);
    setHistoryRecoveryTone(tone);
  };

  /**
   * Releases the recovery slot of ONE specific operation (type + idempotency key).
   * Returns false, touching nothing, when a different/newer operation now owns the slot
   * (e.g. a late response from an older request).
   */
  const releasePending = (type: PendingOperationType, key: string): boolean => {
    const ref =
      type === 'COLLECTION'
        ? pendingCollectionOpRef
        : type === 'REFUND'
          ? pendingRefundOpRef
          : pendingReversalOpRef;
    const current = ref.current;
    if (current && current.idempotencyKey !== key) {
      return false;
    }
    clearPendingPaymentOperation(type, key);
    ref.current = null;
    if (type === 'COLLECTION') setPendingCollectionOp(null);
    else if (type === 'REFUND') setPendingRefundOp(null);
    else setPendingReversalOp(null);
    return true;
  };

  /** Applies a server lookup result to a damaged record. Only an established outcome for the exact key clears it. */
  const reconcileUnreconcilable = (res: any, key: string) => {
    if (!res?.found) {
      setUnreconcilableNotice(
        'The server has no committed record for this key yet. A missing record does not prove the original request can no longer commit, so all payment operations stay blocked. Contact a supervisor to reconcile this operation.',
      );
      return;
    }
    const status: string | undefined = res.status || res.refund?.status;
    if (res.operationType === 'REFUND' && status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'CANCELLED') {
      setUnreconcilableNotice(
        `The server reports this refund as ${status || 'PENDING'}. It remains unresolved and all payment operations stay blocked. Contact a supervisor.`,
      );
      return;
    }
    if (clearUnreconcilableRecord(key)) {
      setUnreconcilableRecord(null);
      setUnreconcilableNotice(null);
      if (res.operationType === 'REFUND' && status !== 'SUCCEEDED') {
        announceHistory(`Damaged recovery record resolved: the refund was recorded as ${status}. No refund was applied.`, 'failure');
      } else {
        announceHistory(
          `Damaged recovery record resolved: the ${String(res.operationType).toLowerCase()} operation was confirmed on the server.`,
          'success',
        );
      }
      loadHistory();
    }
  };

  const handleCheckUnreconcilable = async () => {
    const key = unreconcilableRecord?.key;
    if (!key) return;
    try {
      setCheckingOutcome(true);
      const res = await paymentsApi.lookupIdempotency(key);
      reconcileUnreconcilable(res, key);
    } catch (err: any) {
      setUnreconcilableNotice(
        'Unable to reach server to reconcile the damaged recovery record: ' +
          (err?.response?.data?.message || err?.message || 'Network error'),
      );
    } finally {
      setCheckingOutcome(false);
    }
  };

  // Synchronous payload-bound idempotency key refs (Finding 2: prevents rerender churn and submit race conditions)
  const collectKeyRef = useRef<{ fingerprint: string; key: string }>({
    fingerprint: '',
    key: '',
  });
  const reversalKeyRef = useRef<{ fingerprint: string; key: string }>({
    fingerprint: '',
    key: '',
  });
  const refundKeyRef = useRef<{ fingerprint: string; key: string }>({
    fingerprint: '',
    key: '',
  });

  const collectPayloadFingerprint = React.useMemo(() => {
    const numericAmt = parseFloat(amount);
    return JSON.stringify({
      studentId: selectedStudentId,
      academicYearId: selectedYearId,
      amount: Number.isFinite(numericAmt) ? numericAmt : amount,
      paymentMethod,
      referenceNumber: referenceNumber.trim() || undefined,
      bankName: bankName.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }, [
    selectedStudentId,
    selectedYearId,
    amount,
    paymentMethod,
    referenceNumber,
    bankName,
    notes,
  ]);

  const reversalPayloadFingerprint = React.useMemo(() => {
    return JSON.stringify({
      paymentId: reversingPayment?.id || '',
      reversalType,
      reason: reversalReason.trim(),
    });
  }, [reversingPayment?.id, reversalType, reversalReason]);

  const refundPayloadFingerprint = React.useMemo(() => {
    const numericAmt = parseFloat(refundAmount);
    return JSON.stringify({
      paymentId: refundingPayment?.id || '',
      amount: Number.isFinite(numericAmt) ? numericAmt : refundAmount,
      reason: refundReason.trim(),
      mode: refundMode,
      referenceNumber: refundReference.trim() || undefined,
      status: 'SUCCEEDED',
    });
  }, [refundingPayment?.id, refundAmount, refundReason, refundMode, refundReference]);

  const resolveCollectIdempotencyKey = useCallback((fingerprint: string): string => {
    if (pendingCollectionOpRef.current) {
      return pendingCollectionOpRef.current.idempotencyKey;
    }
    if (collectKeyRef.current.fingerprint === fingerprint && collectKeyRef.current.key) {
      return collectKeyRef.current.key;
    }
    const nextKey = generateUuid();
    collectKeyRef.current = { fingerprint, key: nextKey };
    setIdempotencyKey(nextKey);
    return nextKey;
  }, []);

  const resolveReversalIdempotencyKey = useCallback((fingerprint: string): string => {
    if (pendingReversalOpRef.current) {
      return pendingReversalOpRef.current.idempotencyKey;
    }
    if (reversalKeyRef.current.fingerprint === fingerprint && reversalKeyRef.current.key) {
      return reversalKeyRef.current.key;
    }
    const nextKey = generateUuid();
    reversalKeyRef.current = { fingerprint, key: nextKey };
    setReversalIdempotencyKey(nextKey);
    return nextKey;
  }, []);

  const resolveRefundIdempotencyKey = useCallback((fingerprint: string): string => {
    if (pendingRefundOpRef.current) {
      return pendingRefundOpRef.current.idempotencyKey;
    }
    if (refundKeyRef.current.fingerprint === fingerprint && refundKeyRef.current.key) {
      return refundKeyRef.current.key;
    }
    const nextKey = generateUuid();
    refundKeyRef.current = { fingerprint, key: nextKey };
    setRefundIdempotencyKey(nextKey);
    return nextKey;
  }, []);

  // Synchronize collection idempotency key when any collection payload field changes (Finding 2)
  // Preserves existing key if an unresolved pending operation exists (Task 2)
  useEffect(() => {
    if (!pendingCollectionOpRef.current) {
      resolveCollectIdempotencyKey(collectPayloadFingerprint);
    }
  }, [collectPayloadFingerprint, resolveCollectIdempotencyKey]);

  // Synchronize reversal idempotency key when reversal modal payload changes (Finding 2)
  useEffect(() => {
    if (reversingPayment && !pendingReversalOpRef.current) {
      resolveReversalIdempotencyKey(reversalPayloadFingerprint);
    }
  }, [reversingPayment, reversalPayloadFingerprint, resolveReversalIdempotencyKey]);

  // Synchronize refund idempotency key when refund modal payload changes (Finding 2)
  useEffect(() => {
    if (refundingPayment && !pendingRefundOpRef.current) {
      resolveRefundIdempotencyKey(refundPayloadFingerprint);
    }
  }, [refundingPayment, refundPayloadFingerprint, resolveRefundIdempotencyKey]);

  // Format currency
  const formatCurrency = (val: number | string | undefined | null) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(num);
  };

  const filteredStudents = React.useMemo(() => {
    return students.filter(
      (s) =>
        s.firstName.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
        s.lastName.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
        s.admissionNumber.toLowerCase().includes(studentSearchTerm.toLowerCase()),
    );
  }, [students, studentSearchTerm]);

  // Clear payment form values and statement when student changes (Finding 1)
  const resetCollectionDraftForStudentChange = useCallback(() => {
    if (pendingCollectionOpRef.current) return;
    setStatement(null);
    setStatementError(null);
    setAmount('');
    setReferenceNumber('');
    setBankName('');
    setNotes('');
    setCollectError(null);
    setCollectAttemptFailed(false);
  }, []);

  // Clear selectedStudentId to '' if search term excludes current selection; never silently select first filtered student (Finding 1)
  useEffect(() => {
    if (pendingCollectionOpRef.current) return;
    if (!selectedStudentId) return;
    const isSelectedPresent = filteredStudents.some((s) => s.id === selectedStudentId);
    if (!isSelectedPresent) {
      setSelectedStudentId('');
      resetCollectionDraftForStudentChange();
    }
  }, [filteredStudents, selectedStudentId, resetCollectionDraftForStudentChange]);

  const handleStudentSelectChange = (newStudentId: string) => {
    if (pendingCollectionOpRef.current) return;
    if (newStudentId !== selectedStudentId) {
      resetCollectionDraftForStudentChange();
      setSelectedStudentId(newStudentId);
    }
  };

  const handleYearSelectChange = (newYearId: string) => {
    if (pendingCollectionOpRef.current) return;
    if (newYearId !== selectedYearId) {
      setStatement(null);
      setStatementError(null);
      setCollectError(null);
      setCollectAttemptFailed(false);
      setSelectedYearId(newYearId);
    }
  };

  // Restore unresolved pending payment operation from sessionStorage on reload.
  // Recovery records are NEVER discarded automatically. A record whose outcome cannot be established stays
  // locked (blocking every financial action) until the server reports a definitive outcome for its exact key.
  useEffect(() => {
    let isMounted = true;
    const state = classifyRecoveryRecord(sessionStorage.getItem(PENDING_PAYMENT_OP_STORAGE_KEY));
    if (state.kind === 'NONE') return;

    if (state.kind === 'UNRECONCILABLE') {
      setUnreconcilableRecord({ key: state.key, operationType: state.operationType, reason: state.reason });
      if (state.key) {
        const damagedKey = state.key;
        paymentsApi
          .lookupIdempotency(damagedKey)
          .then((res) => {
            if (!isMounted) return;
            reconcileUnreconcilable(res, damagedKey);
          })
          .catch((err) => {
            if (!isMounted) return;
            setUnreconcilableNotice(
              'Unable to reach server to reconcile the damaged recovery record: ' +
                (err?.response?.data?.message || err?.message || 'Network error'),
            );
          });
      }
      return () => {
        isMounted = false;
      };
    }

    const restored = state.op;
    const key = restored.idempotencyKey;
    const suffix =
      (state.kind === 'PARTIAL'
        ? ' Stored request context is incomplete, so the exact payload cannot be retried; verify the outcome with the server or contact a supervisor.'
        : '') +
      (Date.now() - restored.createdAt > STALE_RECORD_MS
        ? ' This record is older than 24 hours and has NOT been discarded.'
        : '');

    if (restored.operationType === 'COLLECTION') {
      pendingCollectionOpRef.current = restored;
      setPendingCollectionOp(restored);
      setCollectAttemptFailed(true);
      setCollectError(
        'Restored an unresolved payment collection attempt from your previous session. Form fields are locked to prevent duplicate charges. Please verify the outcome with the server.' +
          suffix,
      );
      if (restored.context.studentId) setSelectedStudentId(restored.context.studentId);
      if (restored.context.academicYearId) setSelectedYearId(restored.context.academicYearId);
      if (restored.context.amount !== undefined) setAmount(String(restored.context.amount));
      if (restored.context.paymentMethod) setPaymentMethod(restored.context.paymentMethod);
      if (restored.context.referenceNumber !== undefined) setReferenceNumber(restored.context.referenceNumber);
      if (restored.context.bankName !== undefined) setBankName(restored.context.bankName);
      if (restored.context.notes !== undefined) setNotes(restored.context.notes);

      collectKeyRef.current = { fingerprint: restored.fingerprint, key };
      setIdempotencyKey(key);

      paymentsApi
        .lookupIdempotency(key)
        .then((res) => {
          if (!isMounted) return;
          if (res.found && res.operationType === 'COLLECTION') {
            if (!releasePending('COLLECTION', key)) return;
            setCollectAttemptFailed(false);
            setCollectError(null);
            if (res.receipt) setSuccessReceipt(res.receipt);
            setAmount('');
            setReferenceNumber('');
            setBankName('');
            setNotes('');
            const freshKey = generateUuid();
            collectKeyRef.current = { fingerprint: '', key: freshKey };
            setIdempotencyKey(freshKey);
            loadHistory();
            setLookupMessage('Interrupted payment was confirmed on the server! Receipt has been generated.');
          } else {
            setLookupMessage(
              'Server has no committed payment for this key yet, but that does not prove it can no longer commit. Form inputs remain strictly locked to prevent duplicate charges. Please retry with the same key or re-check outcome.',
            );
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          setLookupMessage(
            'Unable to reach server to reconcile restored payment: ' +
              (err?.response?.data?.message || err?.message || 'Network error'),
          );
        });
    } else if (restored.operationType === 'REFUND') {
      setActiveSubTab('history');
      pendingRefundOpRef.current = restored;
      setPendingRefundOp(restored);
      setRefundAttemptFailed(true);
      const initialMsg = `Restored an unresolved refund attempt (key: ${key.slice(0, 8)}...). Form remains locked for safety.${suffix}`;
      setRefundError(initialMsg);
      announceHistory(initialMsg, 'unresolved');

      paymentsApi
        .lookupIdempotency(key)
        .then((res) => {
          if (!isMounted) return;
          const verdict = evaluateRefundLookup(res, restored);
          if (!verdict) {
            const notFoundMsg = `Restored an unresolved refund attempt (key: ${key.slice(0, 8)}...). The server has not recorded this refund yet, which does not prove it can no longer commit. Inputs remain locked for safety.${suffix}`;
            setRefundError(notFoundMsg);
            announceHistory(notFoundMsg, 'unresolved');
            return;
          }
          if (verdict.verdict === 'MISMATCH') {
            const msg = `The server holds a refund for this key that does not match the pending refund (${verdict.reason}). The operation remains unresolved and locked; contact a supervisor.`;
            setRefundError(msg);
            announceHistory(msg, 'unresolved');
          } else if (verdict.verdict === 'SUCCEEDED') {
            if (!releasePending('REFUND', key)) return;
            setRefundAttemptFailed(false);
            setRefundError(null);
            announceHistory('Restored refund was confirmed on the server! Payment history refreshed.', 'success');
            loadHistory();
          } else if (verdict.verdict === 'FAILED' || verdict.verdict === 'CANCELLED') {
            if (!releasePending('REFUND', key)) return;
            setRefundAttemptFailed(false);
            setRefundError(null);
            announceHistory(
              `Restored refund was recorded as ${verdict.status} on the server. No refund was applied.`,
              'failure',
            );
            loadHistory();
          } else {
            const pendingMsg = `Restored refund is currently ${verdict.status} on the server. The operation remains unresolved. Inputs remain locked for safety.`;
            setRefundError(pendingMsg);
            announceHistory(pendingMsg, 'pending');
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          const errMsg = `Unable to reach server to reconcile restored refund: ${err?.response?.data?.message || err?.message || 'Network error'}. Inputs remain locked for safety.`;
          setRefundError(errMsg);
          announceHistory(errMsg, 'unresolved');
        });
    } else if (restored.operationType === 'REVERSAL') {
      setActiveSubTab('history');
      pendingReversalOpRef.current = restored;
      setPendingReversalOp(restored);
      setReversalAttemptFailed(true);
      const initialMsg = `Restored an unresolved reversal attempt (key: ${key.slice(0, 8)}...). Form remains locked for safety.${suffix}`;
      setReversalError(initialMsg);
      announceHistory(initialMsg, 'unresolved');

      paymentsApi
        .lookupIdempotency(key)
        .then((res) => {
          if (!isMounted) return;
          const paymentMatches =
            !restored.context.paymentId ||
            !res.reversal?.paymentId ||
            res.reversal.paymentId === restored.context.paymentId;
          if (res.found && res.operationType === 'REVERSAL' && paymentMatches) {
            if (!releasePending('REVERSAL', key)) return;
            setReversalAttemptFailed(false);
            setReversalError(null);
            announceHistory('Restored reversal was confirmed on the server! Payment history refreshed.', 'success');
            loadHistory();
          } else if (res.found && res.operationType === 'REVERSAL') {
            const msg =
              'The server holds a reversal for this key that does not match the pending reversal payment. The operation remains unresolved and locked; contact a supervisor.';
            setReversalError(msg);
            announceHistory(msg, 'unresolved');
          } else {
            const notFoundMsg = `Restored an unresolved reversal attempt (key: ${key.slice(0, 8)}...). The server has not recorded this reversal yet, which does not prove it can no longer commit. Inputs remain locked for safety.${suffix}`;
            setReversalError(notFoundMsg);
            announceHistory(notFoundMsg, 'unresolved');
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          const errMsg = `Unable to reach server to reconcile restored reversal: ${err?.response?.data?.message || err?.message || 'Network error'}. Inputs remain locked for safety.`;
          setReversalError(errMsg);
          announceHistory(errMsg, 'unresolved');
        });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Load Metadata with unmount cleanup (F-08)
  useEffect(() => {
    let isMounted = true;
    const loadMeta = async () => {
      try {
        const [stuList, yearList] = await Promise.all([
          metaApi.getAccessibleStudents(),
          metaApi.getAcademicYears(),
        ]);
        if (!isMounted) return;
        setStudents(stuList);
        setAcademicYears(yearList);

        if (yearList.length > 0 && !pendingCollectionOpRef.current) {
          setSelectedYearId(yearList[0].id);
        }
        if (stuList.length > 0 && isStaff && !pendingCollectionOpRef.current) {
          setSelectedStudentId(stuList[0].id);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to load payment metadata', err);
        }
      }
    };

    loadMeta();
    return () => {
      isMounted = false;
    };
  }, [isStaff]);

  // Fetch statement when student or year changes in Collection Tab with immediate stale reset & unmount cleanup (Finding 1 & F-08)
  useEffect(() => {
    setStatement(null);
    setStatementError(null);
    if (!selectedStudentId || !isStaff) {
      setStatementLoading(false);
      return;
    }

    let isMounted = true;
    const targetStudentId = selectedStudentId;
    const targetYearId = selectedYearId;

    const fetchStatement = async () => {
      try {
        setStatementLoading(true);
        const data = await feeStatementApi.getStatement(
          targetStudentId,
          targetYearId || undefined,
        );
        if (!isMounted) return;
        setStatement(data);
        setStatementError(null);
      } catch (err: any) {
        if (!isMounted) return;
        setStatement(null);
        setStatementError(
          err?.response?.data?.message || 'Failed to load student fee statement.',
        );
      } finally {
        if (isMounted) {
          setStatementLoading(false);
        }
      }
    };

    fetchStatement();
    return () => {
      isMounted = false;
    };
  }, [selectedStudentId, selectedYearId, isStaff, statementReloadTick]);

  // Load Payments History (F-07: resilient meta handling, F-08: race protection)
  const loadHistory = useCallback(async (): Promise<PaymentRecord[]> => {
    try {
      setHistoryLoading(true);
      setHistoryError(null);

      const params: any = {
        page: historyPage,
        limit: 15,
      };

      if (filterStudentId) params.studentId = filterStudentId;
      if (filterYearId) params.academicYearId = filterYearId;
      if (filterMethod) params.paymentMethod = filterMethod;
      if (filterStatus) params.status = filterStatus;
      if (filterStartDate) params.startDate = filterStartDate;
      if (filterEndDate) params.endDate = filterEndDate;

      const res = await paymentsApi.list(params);
      const list = res.data || [];
      setPayments(list);
      setTotalPages(res.meta?.totalPages || 1);
      setTotalPayments(res.meta?.total ?? list.length ?? 0);
      return list;
    } catch (err: any) {
      setHistoryError(err?.response?.data?.message || 'Failed to load payment history');
      return [];
    } finally {
      setHistoryLoading(false);
    }
  }, [
    historyPage,
    filterStudentId,
    filterYearId,
    filterMethod,
    filterStatus,
    filterStartDate,
    filterEndDate,
  ]);

  useEffect(() => {
    let isMounted = true;
    if (activeSubTab === 'history') {
      const runHistory = async () => {
        try {
          setHistoryLoading(true);
          setHistoryError(null);

          const params: any = {
            page: historyPage,
            limit: 15,
          };

          if (filterStudentId) params.studentId = filterStudentId;
          if (filterYearId) params.academicYearId = filterYearId;
          if (filterMethod) params.paymentMethod = filterMethod;
          if (filterStatus) params.status = filterStatus;
          if (filterStartDate) params.startDate = filterStartDate;
          if (filterEndDate) params.endDate = filterEndDate;

          const res = await paymentsApi.list(params);
          if (!isMounted) return;
          setPayments(res.data || []);
          setTotalPages(res.meta?.totalPages || 1);
          setTotalPayments(res.meta?.total ?? res.data?.length ?? 0);
        } catch (err: any) {
          if (!isMounted) return;
          setHistoryError(err?.response?.data?.message || 'Failed to load payment history');
        } finally {
          if (isMounted) {
            setHistoryLoading(false);
          }
        }
      };
      runHistory();
    }
    return () => {
      isMounted = false;
    };
  }, [
    activeSubTab,
    historyPage,
    filterStudentId,
    filterYearId,
    filterMethod,
    filterStatus,
    filterStartDate,
    filterEndDate,
  ]);

  // Verify statement matches currently selected student and academic session (Finding 1)
  const isStatementConsistent = Boolean(
    statement &&
      selectedStudentId &&
      statement.student?.id === selectedStudentId &&
      (!selectedYearId ||
        !statement.academicYear?.id ||
        statement.academicYear.id === selectedYearId),
  );

  // Calculate remaining balance from authoritative, consistent statement only (Finding 1 & Finding 3)
  const totalRemainingBalance =
    isStatementConsistent && statement?.summary
      ? statement.summary.totalRemainingAmount !== undefined
        ? statement.summary.totalRemainingAmount
        : Math.max(
            0,
            statement.summary.totalNetAmount +
              (statement.summary.totalAssessedFineAmount ?? 0) -
              (statement.summary.totalPaidAmount || 0),
          )
      : 0;

  const UNRECONCILABLE_BLOCK_MESSAGE =
    'A damaged recovery record is present. All payment, refund, and reversal actions are blocked until a supervisor reconciles the unresolved operation.';
  const hasPendingCollection = Boolean(pendingCollectionOp);
  const hasPendingRefund = Boolean(pendingRefundOp);
  const hasPendingReversal = Boolean(pendingReversalOp);
  const isCollectionFrozen =
    hasPendingCollection || hasPendingRefund || hasPendingReversal || hasUnreconcilable;
  const isReversalFrozen = Boolean(pendingReversalOp) || hasUnreconcilable;
  const isRefundFrozen = Boolean(pendingRefundOp) || hasUnreconcilable;

  const canSubmitCollection =
    !isCollectionFrozen &&
    !hasPendingRefund &&
    !hasPendingReversal &&
    !collecting &&
    !statementLoading &&
    !statementError &&
    isStatementConsistent &&
    Boolean(selectedStudentId) &&
    Boolean(selectedYearId) &&
    Boolean(amount) &&
    parseFloat(amount) > 0;

  // Handle Payment Collection Submission
  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCollectionFrozen || hasPendingRefund || hasPendingReversal) {
      if (hasUnreconcilable) {
        setCollectError(UNRECONCILABLE_BLOCK_MESSAGE);
      } else if (hasPendingRefund || hasPendingReversal) {
        setCollectError(
          `Cannot initiate a new payment collection while a ${hasPendingRefund ? 'refund' : 'reversal'} operation is unresolved. Please resolve the pending operation first.`,
        );
      }
      return;
    }

    if (!selectedStudentId || !selectedYearId) {
      setCollectError('Please select both a student and an academic session.');
      return;
    }

    if (statementLoading || statementError || !isStatementConsistent) {
      setCollectError(
        'Student fee statement is still loading, unavailable, or out of sync with the selected student. Please wait or reload before collecting payment.',
      );
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setCollectError('Payment amount must be greater than zero.');
      return;
    }

    if (totalRemainingBalance <= 0) {
      setCollectError(
        'This student has no outstanding fee balance for the selected academic session.',
      );
      return;
    }

    if (numericAmount > totalRemainingBalance) {
      setCollectError(
        `Payment amount (${formatCurrency(numericAmount)}) exceeds the total outstanding balance (${formatCurrency(totalRemainingBalance)}).`,
      );
      return;
    }

    const activeIdempotencyKey = resolveCollectIdempotencyKey(collectPayloadFingerprint);
    const submittedStudentId = selectedStudentId;
    const submittedYearId = selectedYearId;
    const studentObj = students.find((s) => s.id === submittedStudentId);
    const studentFullName = studentObj
      ? `${studentObj.firstName} ${studentObj.lastName}`
      : (statement?.student?.fullName || '');

    const pendingOp: PendingPaymentOperation = {
      operationType: 'COLLECTION',
      idempotencyKey: activeIdempotencyKey,
      fingerprint: collectPayloadFingerprint,
      createdAt: Date.now(),
      context: {
        studentId: submittedStudentId,
        studentName: studentFullName,
        academicYearId: submittedYearId,
        amount: numericAmount,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        bankName: bankName.trim() || undefined,
        notes: notes.trim() || undefined,
      },
    };

    const savedOp = savePendingPaymentOperation(pendingOp);
    if (!savedOp.ok) {
      setCollectError(savedOp.reason);
      return;
    }
    setPendingCollectionOp(pendingOp);
    pendingCollectionOpRef.current = pendingOp;

    try {
      setCollecting(true);
      setCollectError(null);
      setLookupMessage(null);

      const res = await paymentsApi.collect(
        {
          studentId: submittedStudentId,
          academicYearId: submittedYearId,
          amount: numericAmount,
          paymentMethod,
          referenceNumber: referenceNumber.trim() || undefined,
          bankName: bankName.trim() || undefined,
          notes: notes.trim() || undefined,
          idempotencyKey: activeIdempotencyKey,
        },
        activeIdempotencyKey,
      );

      // Successfully collected
      if (!releasePending('COLLECTION', activeIdempotencyKey)) {
      loadHistory();
      return;
    }
      setCollectAttemptFailed(false);

      // Reset form and force a fresh idempotency key
      setAmount('');
      setReferenceNumber('');
      setBankName('');
      setNotes('');
      const freshKey = generateUuid();
      collectKeyRef.current = { fingerprint: '', key: freshKey };
      setIdempotencyKey(freshKey);
      setSuccessReceipt(res.receipt);

      // Refresh statement preview if the same student is still selected
      if (submittedStudentId) {
        const updated = await feeStatementApi.getStatement(
          submittedStudentId,
          submittedYearId || undefined,
        );
        if (updated?.student?.id === submittedStudentId) {
          setStatement(updated);
        }
      }
      loadHistory();
    } catch (err: any) {
      if (isAmbiguousPaymentError(err)) {
        setCollectAttemptFailed(true);
        setCollectError(
          'Payment collection request timed out or network was interrupted. The outcome on the server is UNKNOWN. Form fields are locked to prevent duplicate collections. Please check the payment outcome below.',
        );
      } else {
        if (!releasePending('COLLECTION', activeIdempotencyKey)) {
        loadHistory();
        return;
      }
        setCollectAttemptFailed(false);
        setCollectError(
          err?.response?.data?.message ||
            'Payment collection was rejected by the server. Please check the values and try again.',
        );
      }
    } finally {
      setCollecting(false);
    }
  };

  // Check Collection Outcome via idempotent operation lookup (Task 1 & 2)
  const handleCheckCollectionOutcome = async () => {
    const activeKey = pendingCollectionOpRef.current?.idempotencyKey || collectKeyRef.current.key;
    if (!activeKey) return;

    try {
      setCheckingOutcome(true);
      setLookupMessage(null);
      const res = await paymentsApi.lookupIdempotency(activeKey);
      if (res.found && res.operationType === 'COLLECTION') {
        if (!releasePending('COLLECTION', activeKey)) {
        loadHistory();
        return;
      }
        setCollectAttemptFailed(false);
        setCollectError(null);
        if (res.receipt) {
          setSuccessReceipt(res.receipt);
        }
        setAmount('');
        setReferenceNumber('');
        setBankName('');
        setNotes('');
        const freshKey = generateUuid();
        collectKeyRef.current = { fingerprint: '', key: freshKey };
        setIdempotencyKey(freshKey);
        if (selectedStudentId) {
          setStatementReloadTick((t) => t + 1);
        }
        loadHistory();
        setLookupMessage('Payment confirmed! The transaction was successfully recorded on the server.');
      } else {
        setLookupMessage(
          'Server confirmed: No committed payment was recorded with this idempotency key yet. Form fields remain strictly locked to prevent duplicate charges. Please retry with the same key or re-check outcome.',
        );
      }
    } catch (err: any) {
      setLookupMessage(
        'Unable to reach server to verify idempotency status: ' +
          (err?.response?.data?.message || err?.message || 'Network error'),
      );
    } finally {
      setCheckingOutcome(false);
    }
  };

  // Retry collection with exact same payload and key (Task 2)
  const handleRetryCollectionExact = async () => {
    if (!pendingCollectionOpRef.current) return;
    const op = pendingCollectionOpRef.current;
    const ctx = op.context;
    const numAmt = typeof ctx.amount === 'number' ? ctx.amount : parseFloat(String(ctx.amount));
    if (!ctx.studentId || !ctx.academicYearId || isNaN(numAmt) || numAmt <= 0) {
      setCollectError(
        'Cannot retry payment collection: Stored recovery payload is missing required fields (student, academic session, or valid positive amount). Please check outcome with the server.',
      );
      return;
    }

    try {
      setCollecting(true);
      setCollectError(null);
      setLookupMessage(null);

      const res = await paymentsApi.collect(
        {
          studentId: ctx.studentId,
          academicYearId: ctx.academicYearId,
          amount: numAmt,
          paymentMethod: ctx.paymentMethod || 'CASH',
          referenceNumber: ctx.referenceNumber,
          bankName: ctx.bankName,
          notes: ctx.notes,
          idempotencyKey: op.idempotencyKey,
        },
        op.idempotencyKey,
      );

      if (!releasePending('COLLECTION', op.idempotencyKey)) {
      loadHistory();
      return;
    }
      setCollectAttemptFailed(false);
      setSuccessReceipt(res.receipt);
      setAmount('');
      setReferenceNumber('');
      setBankName('');
      setNotes('');
      const freshKey = generateUuid();
      collectKeyRef.current = { fingerprint: '', key: freshKey };
      setIdempotencyKey(freshKey);
      if (ctx.studentId) {
        setStatementReloadTick((t) => t + 1);
      }
      loadHistory();
    } catch (err: any) {
      if (isAmbiguousPaymentError(err)) {
        setCollectAttemptFailed(true);
        setCollectError(
          'Retry request timed out or network was interrupted. The outcome remains unknown. Fields remain locked.',
        );
      } else {
        if (!releasePending('COLLECTION', op.idempotencyKey)) {
        loadHistory();
        return;
      }
        setCollectAttemptFailed(false);
        setCollectError(err?.response?.data?.message || 'Payment collection was rejected by the server.');
      }
    } finally {
      setCollecting(false);
    }
  };

  // Handle Reversal Submission (Admins only)
  const handleReversePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingPayment || isReversalFrozen || hasPendingCollection || hasPendingRefund) {
      if (hasUnreconcilable) {
        setReversalError(UNRECONCILABLE_BLOCK_MESSAGE);
      } else if (hasPendingCollection || hasPendingRefund) {
        setReversalError(
          `Cannot initiate reversal while a ${hasPendingCollection ? 'collection' : 'refund'} operation is unresolved. Please resolve the pending operation first.`,
        );
      }
      return;
    }

    if (!reversalReason || reversalReason.trim().length < 10) {
      setReversalError('Reversal reason must be at least 10 characters for audit compliance.');
      return;
    }

    const activeReversalKey = resolveReversalIdempotencyKey(reversalPayloadFingerprint);

    const pendingOp: PendingPaymentOperation = {
      operationType: 'REVERSAL',
      idempotencyKey: activeReversalKey,
      fingerprint: reversalPayloadFingerprint,
      createdAt: Date.now(),
      context: {
        paymentId: reversingPayment.id,
        paymentNumber: reversingPayment.paymentNumber,
        reversalType,
        reversalReason: reversalReason.trim(),
      },
    };

    const savedOp = savePendingPaymentOperation(pendingOp);
    if (!savedOp.ok) {
      setReversalError(savedOp.reason);
      return;
    }
    setPendingReversalOp(pendingOp);
    pendingReversalOpRef.current = pendingOp;

    try {
      setReversalSubmitting(true);
      setReversalError(null);

      await paymentsApi.reverse(
        reversingPayment.id,
        {
          reversalType,
          reason: reversalReason.trim(),
          idempotencyKey: activeReversalKey,
        },
      );

      if (!releasePending('REVERSAL', activeReversalKey)) {
        setStatementReloadTick((t) => t + 1);
        loadHistory();
        return;
      }
      setReversingPayment(null);
      setReversalReason('');
      setReversalAttemptFailed(false);
      reversalKeyRef.current = { fingerprint: '', key: '' };
      setReversalIdempotencyKey('');
      setStatementReloadTick((t) => t + 1);
      loadHistory();
    } catch (err: any) {
      if (isAmbiguousPaymentError(err)) {
        setReversalAttemptFailed(true);
        setReversalError(
          'Reversal request timed out or network was interrupted. The outcome on the server is UNKNOWN. Fields are locked. Please check outcome below.',
        );
      } else {
        if (!releasePending('REVERSAL', activeReversalKey)) {
        loadHistory();
        return;
      }
        setReversalAttemptFailed(false);
        setReversalError(err?.response?.data?.message || 'Payment reversal failed.');
      }
    } finally {
      setReversalSubmitting(false);
    }
  };

  // Safe retry of pending reversal using exact active key
  const handleRetryReversalExact = async () => {
    const op = pendingReversalOpRef.current;
    const targetPaymentId = op?.context.paymentId || reversingPayment?.id;
    if (!op || !targetPaymentId) {
      setReversalError(
        'Cannot retry reversal: Stored recovery payload is missing target payment ID. Please check outcome with the server.',
      );
      return;
    }
    const activeKey = op.idempotencyKey;
    const { reversalType: revType, reversalReason: revReason } = op.context;
    if (!revReason || revReason.trim().length < 10) {
      setReversalError(
        'Cannot retry reversal: Stored recovery payload is missing a valid audit reason (min 10 characters). Please check outcome with the server.',
      );
      return;
    }

    try {
      setReversalSubmitting(true);
      setReversalError(null);

      await paymentsApi.reverse(targetPaymentId, {
        reversalType: (revType || 'VOID') as ReversalType,
        reason: revReason || '',
        idempotencyKey: activeKey,
      });

      if (!releasePending('REVERSAL', activeKey)) {
        setStatementReloadTick((t) => t + 1);
        loadHistory();
        return;
      }
      setReversingPayment(null);
      setReversalReason('');
      setReversalAttemptFailed(false);
      setHistoryRecoveryMessage(null);
      reversalKeyRef.current = { fingerprint: '', key: '' };
      setReversalIdempotencyKey('');
      setStatementReloadTick((t) => t + 1);
      loadHistory();
    } catch (err: any) {
      if (isAmbiguousPaymentError(err)) {
        setReversalAttemptFailed(true);
        const msg =
          'Reversal request timed out or network was interrupted. The outcome on the server is UNKNOWN. Fields are locked. Please check outcome below.';
        setReversalError(msg);
        setHistoryRecoveryMessage(msg);
      } else {
        if (!releasePending('REVERSAL', activeKey)) {
        loadHistory();
        return;
      }
        setReversalAttemptFailed(false);
        setHistoryRecoveryMessage(null);
        setReversalError(err?.response?.data?.message || 'Payment reversal failed.');
      }
    } finally {
      setReversalSubmitting(false);
    }
  };

  // Check Reversal Outcome via idempotency lookup
  const handleCheckReversalOutcome = async () => {
    const activeKey = pendingReversalOpRef.current?.idempotencyKey || reversalKeyRef.current.key;
    if (!activeKey) return;

    try {
      setCheckingOutcome(true);
      setReversalError(null);
      const res = await paymentsApi.lookupIdempotency(activeKey);
      const pendingReversal = pendingReversalOpRef.current;
      const reversalPaymentMatches =
        !pendingReversal?.context.paymentId ||
        !res.reversal?.paymentId ||
        res.reversal.paymentId === pendingReversal.context.paymentId;
      if (res.found && res.operationType === 'REVERSAL' && !reversalPaymentMatches) {
        const mismatchMsg =
          'The server holds a reversal for this key that does not match the pending reversal payment. The operation remains unresolved and locked; contact a supervisor.';
        setReversalError(mismatchMsg);
        announceHistory(mismatchMsg, 'unresolved');
        return;
      }
      if (res.found && res.operationType === 'REVERSAL') {
        if (!releasePending('REVERSAL', activeKey)) {
          setStatementReloadTick((t) => t + 1);
          loadHistory();
          return;
        }
        setReversingPayment(null);
        setReversalReason('');
        setReversalAttemptFailed(false);
        setHistoryRecoveryMessage(null);
        reversalKeyRef.current = { fingerprint: '', key: '' };
        setReversalIdempotencyKey('');
        setStatementReloadTick((t) => t + 1);
        loadHistory();
        return;
      }

      const notFoundMsg =
        'Server confirmed: No reversal was recorded with this key yet. The operation remains unresolved. You may safely retry with the same key.';
      setReversalError(notFoundMsg);
      setHistoryRecoveryMessage(notFoundMsg);
    } catch (err: any) {
      const errMsg = 'Unable to verify reversal outcome: ' + (err?.response?.data?.message || err?.message);
      setReversalError(errMsg);
      setHistoryRecoveryMessage(errMsg);
    } finally {
      setCheckingOutcome(false);
    }
  };

  // Handle Refund Submission (Admins only)
  const handleRefundPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundingPayment || isRefundFrozen || hasPendingCollection || hasPendingReversal) {
      if (hasUnreconcilable) {
        setRefundError(UNRECONCILABLE_BLOCK_MESSAGE);
      } else if (hasPendingCollection || hasPendingReversal) {
        setRefundError(
          `Cannot initiate refund while a ${hasPendingCollection ? 'collection' : 'reversal'} operation is unresolved. Please resolve the pending operation first.`,
        );
      }
      return;
    }

    const numericAmount = parseFloat(refundAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setRefundError('Refund amount must be greater than zero.');
      return;
    }

    if (!refundReason || refundReason.trim().length < 10) {
      setRefundError('Refund reason must be at least 10 characters for audit compliance.');
      return;
    }

    const activeRefundKey = resolveRefundIdempotencyKey(refundPayloadFingerprint);

    const pendingOp: PendingPaymentOperation = {
      operationType: 'REFUND',
      idempotencyKey: activeRefundKey,
      fingerprint: refundPayloadFingerprint,
      createdAt: Date.now(),
      context: {
        paymentId: refundingPayment.id,
        paymentNumber: refundingPayment.paymentNumber,
        refundAmount: numericAmount,
        refundReason: refundReason.trim(),
        refundMode,
        refundReference: refundReference.trim() || undefined,
      },
    };

    const savedOp = savePendingPaymentOperation(pendingOp);
    if (!savedOp.ok) {
      setRefundError(savedOp.reason);
      return;
    }
    setPendingRefundOp(pendingOp);
    pendingRefundOpRef.current = pendingOp;

    try {
      setRefundSubmitting(true);
      setRefundError(null);

      await paymentsApi.refund(
        refundingPayment.id,
        {
          amount: numericAmount,
          reason: refundReason.trim(),
          mode: refundMode,
          referenceNumber: refundReference.trim() || undefined,
          status: 'SUCCEEDED',
          idempotencyKey: activeRefundKey,
        },
      );

      if (!releasePending('REFUND', activeRefundKey)) {
        setStatementReloadTick((t) => t + 1);
        loadHistory();
        return;
      }
      setRefundingPayment(null);
      setRefundAmount('');
      setRefundReason('');
      setRefundReference('');
      setRefundAttemptFailed(false);
      refundKeyRef.current = { fingerprint: '', key: '' };
      setRefundIdempotencyKey('');
      setStatementReloadTick((t) => t + 1);
      loadHistory();
    } catch (err: any) {
      if (isAmbiguousPaymentError(err)) {
        setRefundAttemptFailed(true);
        setRefundError(
          'Refund request timed out or network was interrupted. The outcome on the server is UNKNOWN. Fields are locked. Please check outcome below.',
        );
      } else {
        if (!releasePending('REFUND', activeRefundKey)) {
        loadHistory();
        return;
      }
        setRefundAttemptFailed(false);
        setRefundError(err?.response?.data?.message || 'Refund processing failed.');
      }
    } finally {
      setRefundSubmitting(false);
    }
  };

  // Safe retry of pending refund using exact active key
  const handleRetryRefundExact = async () => {
    const op = pendingRefundOpRef.current;
    const targetPaymentId = op?.context.paymentId || refundingPayment?.id;
    if (!op || !targetPaymentId) {
      setRefundError(
        'Cannot retry refund: Stored recovery payload is missing target payment ID. Please check outcome with the server.',
      );
      return;
    }
    const activeKey = op.idempotencyKey;
    const {
      refundAmount: refAmt,
      refundReason: refRsn,
      refundMode: refMode,
      refundReference: refRef,
    } = op.context;
    const numAmt = typeof refAmt === 'number' ? refAmt : parseFloat(String(refAmt));
    if (isNaN(numAmt) || numAmt <= 0 || !refRsn || refRsn.trim().length < 10) {
      setRefundError(
        'Cannot retry refund: Stored recovery payload has missing or invalid fields (amount or reason >= 10 chars). Please check outcome with the server.',
      );
      return;
    }

    try {
      setRefundSubmitting(true);
      setRefundError(null);

      await paymentsApi.refund(targetPaymentId, {
        amount: numAmt,
        reason: refRsn,
        mode: refMode,
        referenceNumber: refRef,
        status: 'SUCCEEDED',
        idempotencyKey: activeKey,
      });

      if (!releasePending('REFUND', activeKey)) {
      loadHistory();
      return;
    }
      setRefundingPayment(null);
      setRefundAmount('');
      setRefundReason('');
      setRefundReference('');
      setRefundAttemptFailed(false);
      setHistoryRecoveryMessage(null);
      refundKeyRef.current = { fingerprint: '', key: '' };
      setRefundIdempotencyKey('');
      loadHistory();
    } catch (err: any) {
      if (isAmbiguousPaymentError(err)) {
        setRefundAttemptFailed(true);
        const msg =
          'Refund request timed out or network was interrupted. The outcome on the server is UNKNOWN. Fields are locked. Please check outcome below.';
        setRefundError(msg);
        setHistoryRecoveryMessage(msg);
      } else {
        if (!releasePending('REFUND', activeKey)) {
        loadHistory();
        return;
      }
        setRefundAttemptFailed(false);
        setHistoryRecoveryMessage(null);
        setRefundError(err?.response?.data?.message || 'Refund processing failed.');
      }
    } finally {
      setRefundSubmitting(false);
    }
  };

  // Check Refund Outcome via idempotency lookup & refund sub-resource.
  // Confirms ONLY the refund bound to the exact idempotency key, payment ID, and amount of the pending operation.
  const handleCheckRefundOutcome = async () => {
    const pendingOp = pendingRefundOpRef.current;
    const activeKey = pendingOp?.idempotencyKey || refundKeyRef.current.key;
    if (!activeKey) return;
    const opForEval: PendingPaymentOperation = pendingOp || {
      operationType: 'REFUND',
      idempotencyKey: activeKey,
      fingerprint: '',
      createdAt: Date.now(),
      context: {},
    };

    // Applies a verdict; returns true when the verdict was conclusive enough to stop further lookups.
    const applyVerdict = (verdict: RefundLookupVerdict): boolean => {
      if (verdict.verdict === 'SUCCEEDED') {
        if (!releasePending('REFUND', activeKey)) return true;
        setRefundingPayment(null);
        setRefundAmount('');
        setRefundReason('');
        setRefundReference('');
        setRefundAttemptFailed(false);
        announceHistory('Refund was confirmed on the server! Payment history refreshed.', 'success');
        refundKeyRef.current = { fingerprint: '', key: '' };
        setRefundIdempotencyKey('');
        loadHistory();
        return true;
      }
      if (verdict.verdict === 'FAILED' || verdict.verdict === 'CANCELLED') {
        if (!releasePending('REFUND', activeKey)) return true;
        setRefundAttemptFailed(false);
        const terminalMsg = `Server confirmed: Refund was ${verdict.status}. No refund was applied.`;
        setRefundError(terminalMsg);
        announceHistory(terminalMsg, 'failure');
        loadHistory();
        return true;
      }
      if (verdict.verdict === 'MISMATCH') {
        const mismatchMsg = `The server holds a refund for this key that does not match the pending refund (${verdict.reason}). The operation remains unresolved and locked; contact a supervisor.`;
        setRefundError(mismatchMsg);
        announceHistory(mismatchMsg, 'unresolved');
        return true;
      }
      const pendingMsg = `Server confirmed: Refund is currently ${verdict.status}. The operation remains unresolved. Inputs remain locked for safety.`;
      setRefundError(pendingMsg);
      announceHistory(pendingMsg, 'pending');
      return true;
    };

    try {
      setCheckingOutcome(true);
      setRefundError(null);

      // 1. Direct idempotency lookup
      const res = await paymentsApi.lookupIdempotency(activeKey);
      const direct = evaluateRefundLookup(res, opForEval);
      if (direct && applyVerdict(direct)) return;

      // 2. Query refund records for this payment (strictly matching the exact idempotency key, payment and amount)
      const targetPaymentId = opForEval.context.paymentId || refundingPayment?.id;
      if (targetPaymentId) {
        try {
          const refundRecords = await paymentsApi.getRefunds(targetPaymentId);
          const matchingRefund = Array.isArray(refundRecords)
            ? refundRecords.find((r) => r.idempotencyKey === activeKey)
            : undefined;
          if (matchingRefund) {
            const verdict = evaluateRefundLookup(
              {
                found: true,
                operationType: 'REFUND',
                status: matchingRefund.status,
                refund: {
                  paymentId: matchingRefund.paymentId,
                  refundAmount: matchingRefund.refundAmount ?? matchingRefund.amount,
                  status: matchingRefund.status,
                },
              },
              opForEval,
            );
            if (verdict && applyVerdict(verdict)) return;
          }
        } catch (e) {
          console.warn('Could not fetch refund records sub-resource', e);
        }
      }

      const notFoundMsg =
        'Server has no refund recorded with this key yet. That does not prove it can no longer commit, so the operation remains unresolved and locked. You may safely retry with the same key.';
      setRefundError(notFoundMsg);
      announceHistory(notFoundMsg, 'unresolved');
    } catch (err: any) {
      const errMsg = 'Unable to verify refund outcome: ' + (err?.response?.data?.message || err?.message);
      setRefundError(errMsg);
      announceHistory(errMsg, 'unresolved');
    } finally {
      setCheckingOutcome(false);
    }
  };

  // Print Receipt handler
  const handlePrint = () => {
    window.print();
  };

  const handleDownloadReceiptPdf = async (layout: 'compact' | 'standard' = 'standard') => {
    if (!viewingReceipt || isDownloadingPdf) return;
    try {
      setIsDownloadingPdf(true);
      await paymentsApi.downloadReceiptPdf(viewingReceipt.receiptNumber, {
        layout,
        copies: 1,
      });
    } catch (err: any) {
      console.error('Failed to download receipt PDF:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadReceipt3Copies = async () => {
    if (!viewingReceipt || isDownloadingPdf) return;
    try {
      setIsDownloadingPdf(true);
      await paymentsApi.downloadReceiptPdf(viewingReceipt.receiptNumber, {
        layout: 'compact',
        copies: 3,
      });
    } catch (err: any) {
      console.error('Failed to download 3-copy voucher PDF:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleToggleSelectReceipt = (receiptNumber: string) => {
    setSelectedReceiptNumbers((prev) =>
      prev.includes(receiptNumber)
        ? prev.filter((rn) => rn !== receiptNumber)
        : [...prev, receiptNumber],
    );
  };

  const handleSelectAllReceiptsOnPage = () => {
    const eligibleReceiptNumbers = payments
      .map((p) => p.receipt?.receiptNumber)
      .filter((rn): rn is string => Boolean(rn));

    const allSelected =
      eligibleReceiptNumbers.length > 0 &&
      eligibleReceiptNumbers.every((rn) => selectedReceiptNumbers.includes(rn));

    if (allSelected) {
      setSelectedReceiptNumbers((prev) =>
        prev.filter((rn) => !eligibleReceiptNumbers.includes(rn)),
      );
    } else {
      setSelectedReceiptNumbers((prev) =>
        Array.from(new Set([...prev, ...eligibleReceiptNumbers])),
      );
    }
  };

  const handleDownloadSelectedBatchPdf = async () => {
    if (selectedReceiptNumbers.length === 0 || isDownloadingBatch) return;
    try {
      setIsDownloadingBatch(true);
      setBatchError(null);
      await paymentsApi.downloadBatchReceiptsPdf(selectedReceiptNumbers, {
        layout: 'compact',
      });
    } catch (err: any) {
      console.error('Failed to download batch receipts PDF:', err);
      setBatchError(
        err?.response?.data?.message || 'Failed to download selected receipts PDF',
      );
    } finally {
      setIsDownloadingBatch(false);
    }
  };

  const getStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'PARTIALLY_REFUNDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <RotateCcw className="w-3 h-3" />
            Partially Refunded
          </span>
        );
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Undo2 className="w-3 h-3" />
            Refunded
          </span>
        );
      case 'VOIDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            Voided
          </span>
        );
      case 'BOUNCED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3" />
            Bounced
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
    <div className="space-y-6">
      {/* Damaged / untrusted recovery record: blocks every financial operation until the server reports an outcome */}
      {unreconcilableRecord && (
        <div
          data-testid="unreconcilable-record-banner"
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs space-y-3 print:hidden"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm">Unresolved Payment Operation — Supervisor Reconciliation Required</p>
              <p className="mt-1">
                {unreconcilableRecord.reason} A previous collection, refund, or reversal may or may not have been
                committed by the server. All collection, refund, and reversal actions are blocked until the outcome is
                reconciled.
              </p>
              {unreconcilableRecord.key ? (
                <p className="mt-1">
                  Recovered idempotency key:{' '}
                  <code className="bg-rose-100 px-1 py-0.5 rounded font-mono text-[11px]">{unreconcilableRecord.key}</code>
                  {unreconcilableRecord.operationType ? <> (type: {unreconcilableRecord.operationType})</> : null}. Use
                  Check Outcome, or give this key to a supervisor.
                </p>
              ) : (
                <p className="mt-1">
                  No reliable idempotency key could be recovered. A supervisor must verify recent payments for this
                  cashier before any new operation is started.
                </p>
              )}
              {unreconcilableNotice && (
                <p className="mt-2 p-2 rounded-lg bg-rose-100 border border-rose-300 font-semibold">
                  {unreconcilableNotice}
                </p>
              )}
            </div>
          </div>
          {unreconcilableRecord.key && (
            <div className="pt-2 border-t border-rose-200">
              <button
                type="button"
                onClick={handleCheckUnreconcilable}
                disabled={checkingOutcome}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingOutcome ? 'animate-spin' : ''}`} />
                Check Outcome
              </button>
            </div>
          )}
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <CreditCard className="w-6 h-6 text-emerald-600" />
              Fee Payments & Official Receipts
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Offline fee collection, automated receipt allocation, audit-compliant reversals, and payment history.
            </p>
          </div>

          {/* Sub-tab Navigation */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl self-start md:self-auto">
            {isStaff && (
              <button
                type="button"
                disabled={hasPendingRefund || hasPendingReversal || hasUnreconcilable}
                title={
                  hasPendingRefund
                    ? 'A refund operation is pending resolution. Please resolve it first.'
                    : hasPendingReversal
                      ? 'A reversal operation is pending resolution. Please resolve it first.'
                      : undefined
                }
                onClick={() => {
                  if (hasPendingRefund || hasPendingReversal) {
                    setHistoryRecoveryMessage(
                      `A ${hasPendingRefund ? 'refund' : 'reversal'} operation is currently unresolved. Please check its outcome or retry before navigating away.`,
                    );
                    return;
                  }
                  setActiveSubTab('collect');
                  setStatementReloadTick((t) => t + 1);
                }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeSubTab === 'collect'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                Collect Payment
              </button>
            )}
            <button
              type="button"
              disabled={hasPendingCollection}
              title={
                hasPendingCollection
                  ? 'A payment collection operation is pending resolution. Please resolve it first.'
                  : undefined
              }
              onClick={() => {
                if (hasPendingCollection) {
                  setCollectError(
                    'A payment collection attempt is currently unresolved. Please check its outcome or retry before navigating to history.',
                  );
                  return;
                }
                setActiveSubTab('history');
              }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                activeSubTab === 'history'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-indigo-600" />
              Payment History & Receipts
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SUB-TAB 1: COLLECT PAYMENT (Staff only)                   */}
      {/* ========================================================= */}
      {isStaff && activeSubTab === 'collect' && (
        <div
          data-testid="collect-tab-container"
          data-print-hide-when-receipt={viewingReceipt ? 'true' : undefined}
          className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${viewingReceipt ? 'print:hidden' : ''}`}
        >
          {/* Left Column: Collection Form */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Counter Fee Collection
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Record offline payment. System will atomically issue an official receipt and allocate funds principal-first.
            </p>

            {(hasPendingRefund || hasPendingReversal) && !pendingCollectionOp && (
              <div
                data-testid="cross-op-refund-reversal-banner"
                className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-sm">Cross-Operation Guard: Collections Blocked</p>
                  <p className="mt-1 text-amber-800">
                    A {hasPendingRefund ? 'refund' : 'reversal'} operation is currently unresolved. To maintain ledger integrity and prevent recovery context contamination, payment collection is disabled until that operation is resolved.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('history')}
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700"
                  >
                    Go to Pending {hasPendingRefund ? 'Refund' : 'Reversal'}
                  </button>
                </div>
              </div>
            )}

            {isCollectionFrozen && pendingCollectionOp && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-sm text-amber-900">
                      Payment Outcome Uncertain — Form Locked for Safety
                    </p>
                    {collectError && (
                      <p className="text-amber-800 mt-1 font-medium">
                        {collectError}
                      </p>
                    )}
                    <p className="text-amber-800 mt-1">
                      A pending payment of{' '}
                      <strong>
                        {formatCurrency(pendingCollectionOp.context.amount)}
                      </strong>{' '}
                      for student{' '}
                      <strong>
                        {pendingCollectionOp.context.studentName || 'selected student'}
                      </strong>{' '}
                      was dispatched with idempotency key{' '}
                      <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">
                        {pendingCollectionOp.idempotencyKey.slice(0, 8)}...
                      </code>
                      . Form inputs are locked to prevent duplicate collections.
                    </p>
                    {lookupMessage && (
                      <p className="mt-2 p-2 rounded-lg bg-amber-100 border border-amber-300 font-semibold text-amber-950">
                        {lookupMessage}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200">
                  <button
                    type="button"
                    onClick={handleCheckCollectionOutcome}
                    disabled={checkingOutcome}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs disabled:opacity-50"
                  >
                    {checkingOutcome ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Check Payment Outcome
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryCollectionExact}
                    disabled={collecting || checkingOutcome}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {collecting ? 'Retrying...' : 'Retry with Same Key'}
                  </button>
                  <div className="w-full text-[11px] text-amber-800 bg-amber-100/70 p-2 rounded-lg border border-amber-200 mt-2">
                    <strong>Operational Notice:</strong> Discarding uncertain payments is disabled because an in-flight server transaction could still commit late. Please retry with the same key or re-check the outcome to establish a definitive server record.
                  </div>
                </div>
              </div>
            )}

            {!isCollectionFrozen && collectError && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Payment Submission Blocked</p>
                  <p className="text-xs text-rose-700 mt-0.5">{collectError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleCollectPayment} className="space-y-4">
              {/* Student and Academic Year Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="payment-student-select" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Select Student</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      {filteredStudents.length} available
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="Quick search by name or admission #..."
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    disabled={isCollectionFrozen}
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-1.5 mb-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                  <select
                    id="payment-student-select"
                    value={selectedStudentId}
                    onChange={(e) => handleStudentSelectChange(e.target.value)}
                    disabled={isCollectionFrozen || filteredStudents.length === 0}
                    className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {filteredStudents.length === 0 ? (
                      <option value="">No students match search</option>
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
                  <label htmlFor="payment-academic-year-select" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    Academic Session
                  </label>
                  <select
                    id="payment-academic-year-select"
                    value={selectedYearId}
                    onChange={(e) => handleYearSelectChange(e.target.value)}
                    disabled={isCollectionFrozen}
                    className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.isCurrent ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>

                  <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Idempotency Token:</span>
                    <span className="font-mono text-[10px] text-slate-600 truncate max-w-[150px]">
                      {idempotencyKey.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>

              {/* Amount and Method */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Payment Amount (₹) <span className="text-rose-500">*</span>
                    </label>
                    {totalRemainingBalance > 0 && !isCollectionFrozen && (
                      <button
                        type="button"
                        onClick={() => setAmount(totalRemainingBalance.toFixed(2))}
                        disabled={isCollectionFrozen}
                        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                      >
                        Pay Full Balance ({formatCurrency(totalRemainingBalance)})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={isCollectionFrozen}
                      required
                      className="w-full text-base font-mono font-bold rounded-xl border border-slate-300 pl-8 pr-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="payment-method-select" className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Method <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="payment-method-select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    disabled={isCollectionFrozen}
                    className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {SUPPORTED_PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reference and Bank Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reference / Transaction # (UTR / Receipt / Slip)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR1234567890"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    disabled={isCollectionFrozen}
                    className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bank / Institution Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. State Bank of India, HDFC"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    disabled={isCollectionFrozen}
                    className="w-full text-sm rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Collection Notes / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional internal remarks for fee counter records..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isCollectionFrozen}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>

              {/* Submit Button with Anti-Double-Click & Stale-Statement Protection */}
              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <div className="text-xs text-slate-400">
                  Protected with client idempotency key against duplicate submissions.
                </div>
                <button
                  type="submit"
                  disabled={!canSubmitCollection}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {collecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing Payment...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Collect {amount && parseFloat(amount) > 0 ? formatCurrency(amount) : 'Payment'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Live Student Obligation Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600" />
              Live Student Obligation Preview
            </h3>

            {statementLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading statement...
              </div>
            ) : statementError ? (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Unable to verify student obligation</p>
                    <p className="text-rose-700 mt-0.5">{statementError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatementReloadTick((t) => t + 1)}
                  className="px-3 py-1 rounded-lg font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-100"
                >
                  Retry Loading Statement
                </button>
              </div>
            ) : isStatementConsistent && statement ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-xs text-slate-500">Student</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {statement.student.fullName}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Admission #: <span className="font-mono font-semibold">{statement.student.admissionNumber}</span> | Class: {statement.student.grade} - {statement.student.section}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
                    <span className="text-[11px] text-indigo-700 font-medium">Net Principal</span>
                    <p className="text-sm font-bold text-indigo-900 mt-0.5">
                      {formatCurrency(statement.summary.totalNetAmount)}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-amber-100 bg-amber-50/50">
                    <span className="text-[11px] text-amber-800 font-medium">Assessed Fines</span>
                    <p className="text-sm font-bold text-amber-900 mt-0.5">
                      {formatCurrency(statement.summary.totalAssessedFineAmount ?? 0)}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/50">
                    <span className="text-[11px] text-emerald-700 font-medium">Total Paid</span>
                    <p className="text-base font-bold text-emerald-800 mt-0.5">
                      {formatCurrency(statement.summary.totalPaidAmount ?? 0)}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl border border-rose-100 bg-rose-50/50">
                    <span className="text-[11px] text-rose-700 font-medium">Remaining Dues</span>
                    <p className="text-base font-bold text-rose-900 mt-0.5">
                      {formatCurrency(totalRemainingBalance)}
                    </p>
                  </div>
                </div>

                {/* Overdue / Due Invoices Preview */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-700 block mb-2">
                    Invoice Schedule ({statement.invoices.length} cycles)
                  </span>
                  <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {statement.invoices.map((inv) => {
                      const invBalance =
                        inv.remainingBalance !== undefined
                          ? inv.remainingBalance
                          : Math.max(
                              0,
                              inv.netAmount + (inv.assessedFineAmount ?? 0) - (inv.paidAmount ?? 0),
                            );
                      return (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-2 rounded-lg border border-slate-100 text-xs hover:bg-slate-50"
                        >
                          <div>
                            <span className="font-semibold text-slate-800">{inv.monthName}</span>
                            <span className="text-[10px] text-slate-400 block">
                              Due: {new Date(inv.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </span>
                            {(inv.assessedFineAmount ?? 0) > 0 && (
                              <span className="text-[10px] text-amber-700 font-semibold block">
                                +{formatCurrency(inv.assessedFineAmount)} Assessed Fine
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            {inv.status === 'PAID' ? (
                              <>
                                <span className="font-mono font-bold text-emerald-700 block">
                                  {formatCurrency(inv.paidAmount ?? (inv.netAmount + (inv.assessedFineAmount ?? 0)))}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-medium block">
                                  Paid in Full (₹0 due)
                                </span>
                              </>
                            ) : inv.status === 'PARTIALLY_PAID' ? (
                              <>
                                <span className="font-mono font-bold text-indigo-700 block">
                                  {formatCurrency(invBalance)}
                                </span>
                                <span className="text-[10px] text-slate-500 block">
                                  Due (of {formatCurrency(inv.netAmount + (inv.assessedFineAmount ?? 0))})
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-mono font-bold text-slate-900 block">
                                  {formatCurrency(invBalance)}
                                </span>
                                <span className="text-[10px] text-slate-400 block">
                                  Balance Due
                                </span>
                              </>
                            )}
                            <span
                              className={`inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded mt-0.5 ${
                                inv.status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : inv.status === 'PARTIALLY_PAID'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : inv.status === 'OVERDUE'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                Select a student above to inspect fee obligations.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 2: PAYMENT HISTORY & RECEIPTS (All Roles)        */}
      {/* ========================================================= */}
      {activeSubTab === 'history' && (
        <div
          data-testid="history-tab-container"
          data-print-hide-when-receipt={viewingReceipt ? 'true' : undefined}
          className={`space-y-6 ${viewingReceipt ? 'print:hidden' : ''}`}
        >
          {/* Cross-Operation Guard: Pending Collection Blocks Refunds and Reversals */}
          {hasPendingCollection && (
            <div
              data-testid="cross-op-collection-banner"
              className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-sm">Cross-Operation Guard: Refunds and Reversals Blocked</p>
                <p className="mt-1 text-amber-800">
                  A payment collection attempt is currently unresolved. To maintain ledger integrity, refunds and reversals cannot be initiated until the pending collection is resolved.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('collect')}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700"
                >
                  Go to Pending Collection
                </button>
              </div>
            </div>
          )}

          {/* Unresolved Refund or Reversal Recovery Banner (Task 3 - FEE-P0-003-FIX-5) */}
          {(pendingRefundOp || pendingReversalOp) && !refundingPayment && !reversingPayment && (
            <div
              data-testid="history-pending-recovery-banner"
              className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-sm text-amber-900">
                    Pending {pendingRefundOp ? 'Refund' : 'Reversal'} Awaiting Confirmation
                  </p>
                  <p className="text-amber-800 mt-1">
                    {pendingRefundOp && (
                      <>
                        Payment <strong className="font-mono">{pendingRefundOp.context.paymentNumber || pendingRefundOp.context.paymentId}</strong>
                        {' — '}Refund Amount: <strong>{formatCurrency(pendingRefundOp.context.refundAmount)}</strong>.{' '}
                      </>
                    )}
                    {pendingReversalOp && (
                      <>
                        Payment <strong className="font-mono">{pendingReversalOp.context.paymentNumber || pendingReversalOp.context.paymentId}</strong>
                        {' — '}Type: <strong>{pendingReversalOp.context.reversalType || 'VOID'}</strong>.{' '}
                      </>
                    )}
                    {historyRecoveryMessage || (
                      `Restored an unresolved ${pendingRefundOp ? 'refund' : 'reversal'} attempt with idempotency key ${
                        (pendingRefundOp || pendingReversalOp)?.idempotencyKey.slice(0, 8)
                      }... Inputs remain locked to prevent duplicate operations.`
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-amber-200">
                <button
                  type="button"
                  onClick={pendingRefundOp ? handleCheckRefundOutcome : handleCheckReversalOutcome}
                  disabled={checkingOutcome}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingOutcome ? 'animate-spin' : ''}`} />
                  Check Outcome
                </button>
                <button
                  type="button"
                  onClick={pendingRefundOp ? handleRetryRefundExact : handleRetryReversalExact}
                  disabled={checkingOutcome || refundSubmitting || reversalSubmitting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Retry with Same Key
                </button>
              </div>
            </div>
          )}

          {/* Standalone Recovery Outcome Notification: tone-aware (success / pending / failure / unresolved) */}
          {historyRecoveryMessage && !pendingRefundOp && !pendingReversalOp && (
            <div
              data-testid="history-recovery-notification"
              data-tone={historyRecoveryTone}
              role={historyRecoveryTone === 'failure' ? 'alert' : 'status'}
              className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
                historyRecoveryTone === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : historyRecoveryTone === 'failure'
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {historyRecoveryTone === 'success' && (
                  <CheckCircle2 data-testid="recovery-icon-success" className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                {historyRecoveryTone === 'failure' && (
                  <XCircle data-testid="recovery-icon-failure" className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                {historyRecoveryTone === 'pending' && (
                  <Clock data-testid="recovery-icon-pending" className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                {historyRecoveryTone === 'unresolved' && (
                  <AlertTriangle data-testid="recovery-icon-unresolved" className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>
                  <strong>
                    {historyRecoveryTone === 'success'
                      ? 'Confirmed: '
                      : historyRecoveryTone === 'failure'
                        ? 'Failed: '
                        : historyRecoveryTone === 'pending'
                          ? 'Pending: '
                          : 'Unresolved: '}
                  </strong>
                  {historyRecoveryMessage}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHistoryRecoveryMessage(null)}
                className="font-semibold text-xs ml-4 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Filters Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {/* Student Filter (Staff only) */}
              {isStaff && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Student</label>
                  <select
                    value={filterStudentId}
                    onChange={(e) => {
                      setFilterStudentId(e.target.value);
                      setHistoryPage(1);
                    }}
                    className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">All Students</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.admissionNumber} — {s.firstName} {s.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Academic Year Filter */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Academic Year</label>
                <select
                  value={filterYearId}
                  onChange={(e) => {
                    setFilterYearId(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All Sessions</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Method Filter */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Method</label>
                <select
                  value={filterMethod}
                  onChange={(e) => {
                    setFilterMethod(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All Methods</option>
                  {SUPPORTED_PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">All Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
                  <option value="REFUNDED">Refunded</option>
                  <option value="VOIDED">Voided</option>
                  <option value="BOUNCED">Bounced</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">From Date</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">To Date</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => {
                    setFilterEndDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
              <span>Found {totalPayments} payments</span>
              <button
                type="button"
                onClick={() => {
                  setFilterStudentId('');
                  setFilterYearId('');
                  setFilterMethod('');
                  setFilterStatus('');
                  setFilterStartDate('');
                  setFilterEndDate('');
                  setHistoryPage(1);
                }}
                className="text-emerald-700 hover:text-emerald-800 font-semibold"
              >
                Reset Filters
              </button>
            </div>
          </div>

          {/* Batch Selection Action Bar */}
          {selectedReceiptNumbers.length > 0 && (
            <div
              data-testid="receipt-batch-action-bar"
              className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                  {selectedReceiptNumbers.length}
                </div>
                <div>
                  <span className="text-xs font-bold text-emerald-950">
                    {selectedReceiptNumbers.length} {selectedReceiptNumbers.length === 1 ? 'receipt' : 'receipts'} selected
                  </span>
                  <span className="text-[11px] text-emerald-700 block sm:inline sm:ml-2">
                    (Prints 3 different receipts per A4 page)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSelectedBatchPdf}
                  disabled={isDownloadingBatch}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isDownloadingBatch
                    ? 'Generating Batch PDF...'
                    : `Download Selected Receipts (3 per Page)`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReceiptNumbers([])}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {batchError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
              <span>{batchError}</span>
              <button
                type="button"
                onClick={() => setBatchError(null)}
                className="text-rose-600 hover:text-rose-800 font-bold ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Payments Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {historyLoading ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                Loading payment records...
              </div>
            ) : historyError ? (
              <div className="p-8 text-center text-rose-600 text-sm">{historyError}</div>
            ) : payments.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                No payment transactions found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          aria-label="Select all receipts on page"
                          checked={
                            payments.some((p) => p.receipt?.receiptNumber) &&
                            payments
                              .filter((p) => p.receipt?.receiptNumber)
                              .every((p) => selectedReceiptNumbers.includes(p.receipt!.receiptNumber))
                          }
                          onChange={handleSelectAllReceiptsOnPage}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-4">Receipt # / Ref</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {payments.map((p) => {
                      const hasReceipt = Boolean(p.receipt?.receiptNumber);
                      const isSelected = hasReceipt && selectedReceiptNumbers.includes(p.receipt!.receiptNumber);
                      return (
                        <tr
                          key={p.id}
                          className={`transition-colors ${
                            isSelected ? 'bg-emerald-50/40 hover:bg-emerald-50/60' : 'hover:bg-slate-50/60'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            {hasReceipt ? (
                              <input
                                type="checkbox"
                                aria-label={`Select receipt ${p.receipt!.receiptNumber}`}
                                checked={isSelected}
                                onChange={() => handleToggleSelectReceipt(p.receipt!.receiptNumber)}
                                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => {
                              if (p.receipt) {
                                setViewingReceipt(p.receipt);
                              }
                            }}
                            className="font-mono font-bold text-emerald-700 hover:underline flex items-center gap-1"
                          >
                            <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                            {p.receipt?.receiptNumber || p.paymentNumber}
                          </button>
                          {p.referenceNumber && (
                            <span className="text-[10px] text-slate-400 block font-mono">
                              Ref: {p.referenceNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {new Date(p.paymentDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-900 block">
                            {p.student ? `${p.student.firstName} ${p.student.lastName}` : 'N/A'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {p.student?.admissionNumber}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800">
                            {p.paymentMethod.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 text-sm">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="py-3 px-4">{getStatusBadge(p.status)}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {p.receipt && (
                              <button
                                type="button"
                                onClick={() => setViewingReceipt(p.receipt!)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                              >
                                <Eye className="w-3 h-3" />
                                Receipt
                              </button>
                            )}

                            {/* Reversal / Refund: Only for Admin roles */}
                            {isAdmin && (p.status === 'COMPLETED' || p.status === 'PARTIALLY_REFUNDED') && (
                              <>
                                <button
                                  type="button"
                                  disabled={Boolean(
                                    hasUnreconcilable ||
                                      hasPendingCollection ||
                                      hasPendingReversal ||
                                      (hasPendingRefund && pendingRefundOp?.context.paymentId !== p.id)
                                  )}
                                  title={
                                    hasPendingCollection
                                      ? 'A collection operation is pending resolution'
                                      : hasPendingReversal
                                        ? 'A reversal operation is pending resolution'
                                        : hasPendingRefund && pendingRefundOp?.context.paymentId !== p.id
                                          ? 'Another refund operation is pending resolution'
                                          : undefined
                                  }
                                  onClick={() => {
                                    if (hasPendingRefund && pendingRefundOp?.context.paymentId === p.id) {
                                      setRefundingPayment(p);
                                      setRefundAmount(String(pendingRefundOp.context.refundAmount || ''));
                                      setRefundReason(pendingRefundOp.context.refundReason || '');
                                      setRefundReference(pendingRefundOp.context.refundReference || '');
                                      setRefundMode(pendingRefundOp.context.refundMode || 'BANK_TRANSFER');
                                      refundKeyRef.current = { fingerprint: pendingRefundOp.fingerprint, key: pendingRefundOp.idempotencyKey };
                                      setRefundIdempotencyKey(pendingRefundOp.idempotencyKey);
                                      setRefundAttemptFailed(true);
                                      return;
                                    }
                                    refundKeyRef.current = { fingerprint: '', key: '' };
                                    setRefundingPayment(p);
                                    setRefundAmount('');
                                    setRefundReason('');
                                    setRefundReference('');
                                    setRefundMode('BANK_TRANSFER');
                                    setRefundError(null);
                                    setRefundAttemptFailed(false);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Undo2 className="w-3 h-3" />
                                  Refund
                                </button>

                                <button
                                  type="button"
                                  disabled={Boolean(
                                    hasUnreconcilable ||
                                      hasPendingCollection ||
                                      hasPendingRefund ||
                                      (hasPendingReversal && pendingReversalOp?.context.paymentId !== p.id)
                                  )}
                                  title={
                                    hasPendingCollection
                                      ? 'A collection operation is pending resolution'
                                      : hasPendingRefund
                                        ? 'A refund operation is pending resolution'
                                        : hasPendingReversal && pendingReversalOp?.context.paymentId !== p.id
                                          ? 'Another reversal operation is pending resolution'
                                          : undefined
                                  }
                                  onClick={() => {
                                    if (hasPendingReversal && pendingReversalOp?.context.paymentId === p.id) {
                                      setReversingPayment(p);
                                      setReversalType(pendingReversalOp.context.reversalType || 'VOID');
                                      setReversalReason(pendingReversalOp.context.reversalReason || '');
                                      reversalKeyRef.current = { fingerprint: pendingReversalOp.fingerprint, key: pendingReversalOp.idempotencyKey };
                                      setReversalIdempotencyKey(pendingReversalOp.idempotencyKey);
                                      setReversalAttemptFailed(true);
                                      return;
                                    }
                                    reversalKeyRef.current = { fingerprint: '', key: '' };
                                    setReversingPayment(p);
                                    setReversalType('VOID');
                                    setReversalReason('');
                                    setReversalError(null);
                                    setReversalAttemptFailed(false);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Reverse
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Page {historyPage} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={historyPage >= totalPages}
                    onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUCCESS CONFIRMATION MODAL                                */}
      {/* ========================================================= */}
      {successReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-slate-900">Payment Collected Successfully</h3>
              <p className="text-xs text-slate-500 mt-1">
                Official Receipt #{successReceipt.receiptNumber} issued atomically.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-semibold text-slate-800">
                  {successReceipt.receiptSnapshot?.student?.fullName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Admission #:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {successReceipt.receiptSnapshot?.student?.admissionNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {formatCurrency(successReceipt.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Method:</span>
                <span className="font-semibold text-slate-800">
                  {successReceipt.receiptSnapshot?.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Allocations:</span>
                <span className="font-semibold text-slate-800">
                  {successReceipt.receiptSnapshot?.allocations?.length || 0} line item(s) satisfied
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setViewingReceipt(successReceipt);
                  setSuccessReceipt(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                View & Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setSuccessReceipt(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
              >
                Collect Another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* OFFICIAL RECEIPT VIEW & PRINT MODAL                       */}
      {/* ========================================================= */}
      {viewingReceipt && (
        <div
          data-testid="printable-receipt-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 print:p-0 print:bg-white print:static print:inset-auto"
        >
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm;
              }
              header, nav, footer, [data-print-hide-when-receipt="true"] {
                display: none !important;
              }
            }
          `}</style>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:w-full">
            {/* Modal Actions */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Official Fee Receipt</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadReceiptPdf('standard')}
                  disabled={isDownloadingPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
                  title="Download Official PDF Receipt"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadReceipt3Copies}
                  disabled={isDownloadingPdf}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50"
                  title="Download 3 duplicate copies (Student, Office, Accounts) on one A4 sheet"
                >
                  3-Copy Voucher
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setViewingReceipt(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Receipt Layout */}
            <div className="mt-4 p-6 border border-slate-200 rounded-xl bg-white space-y-6 text-slate-800 print:border-none print:p-0">
              {/* Header */}
              <div className="text-center pb-4 border-b border-slate-200">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {viewingReceipt.receiptSnapshot?.school?.name || 'School Fee Management'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {viewingReceipt.receiptSnapshot?.school?.address
                    ? `${viewingReceipt.receiptSnapshot.school.address}, ${viewingReceipt.receiptSnapshot.school.city || ''} ${viewingReceipt.receiptSnapshot.school.state || ''}`
                    : 'Official Fee Payment Receipt'}
                </p>
                <div className="mt-2 inline-block px-3 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold font-mono border border-emerald-200">
                  RECEIPT #: {viewingReceipt.receiptNumber}
                </div>
              </div>

              {/* Receipt Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Student Name:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {viewingReceipt.receiptSnapshot?.student?.fullName || 'N/A'}
                  </span>
                  <span className="text-slate-500 block mt-0.5">
                    Admission #: <span className="font-mono">{viewingReceipt.receiptSnapshot?.student?.admissionNumber}</span>
                  </span>
                  <span className="text-slate-500 block">
                    Class: {viewingReceipt.receiptSnapshot?.student?.grade} - {viewingReceipt.receiptSnapshot?.student?.section}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-slate-400 block">Payment Date:</span>
                  <span className="font-bold text-slate-900">
                    {viewingReceipt.receiptSnapshot?.paymentDate
                      ? new Date(viewingReceipt.receiptSnapshot.paymentDate).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'N/A'}
                  </span>
                  <span className="text-slate-500 block mt-0.5">
                    Method: <span className="font-semibold">{viewingReceipt.receiptSnapshot?.paymentMethod}</span>
                  </span>
                  {viewingReceipt.receiptSnapshot?.referenceNumber && (
                    <span className="text-slate-500 block font-mono text-[11px]">
                      Ref: {viewingReceipt.receiptSnapshot.referenceNumber}
                    </span>
                  )}
                  <span className="text-slate-400 block text-[10px] mt-0.5">
                    Session: {viewingReceipt.receiptSnapshot?.academicYear?.name}
                  </span>
                </div>
              </div>

              {/* Line Item Allocations */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-200 text-slate-600 font-semibold uppercase">
                      <th className="py-2 px-3">Item / Fee Head</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingReceipt.receiptSnapshot?.allocations?.map((alloc, idx) => (
                      <tr key={alloc.id || idx}>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {alloc.feeHeadNameSnapshot || 'Fee Obligation'}
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[10px] uppercase font-bold text-slate-500">
                            {alloc.allocationType}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(alloc.allocatedAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-black text-slate-900 text-sm">
                      <td colSpan={2} className="py-2.5 px-3">
                        Total Amount Received
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                        {formatCurrency(viewingReceipt.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Receipt Footer */}
              <div className="pt-4 border-t border-slate-200 text-xs text-slate-500 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <p className="text-[11px]">
                    Collected By: <span className="font-semibold text-slate-700">{viewingReceipt.receiptSnapshot?.collector?.name || 'Cashier'}</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    This is an electronically generated receipt. No physical signature required.
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      viewingReceipt.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    Receipt Status: {viewingReceipt.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* REVERSAL CONFIRMATION MODAL (Admins Only)                 */}
      {/* ========================================================= */}
      {reversingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 rounded-xl bg-rose-50 border border-rose-100">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Reverse Fee Payment</h3>
                <p className="text-xs text-rose-700">Audit-enforced action for authorized administrators</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                Irreversible Action Warning
              </p>
              <p>
                Reversing payment <span className="font-mono font-bold">{reversingPayment.paymentNumber}</span> will
                permanently mark the payment as void/bounced and restore all allocated invoice dues and late fines.
              </p>
            </div>

            {isReversalFrozen && pendingReversalOp && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Reversal Outcome Uncertain — Fields Locked</p>
                    <p className="mt-0.5 text-amber-800">
                      Reversal request was dispatched with idempotency key{' '}
                      <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">
                        {pendingReversalOp.idempotencyKey.slice(0, 8)}...
                      </code>
                      . Please verify outcome with the server.
                    </p>
                    {reversalError && (
                      <p className="mt-1.5 p-2 rounded-lg bg-amber-100 border border-amber-300 font-semibold text-amber-950">
                        {reversalError}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-amber-200">
                  <button
                    type="button"
                    onClick={handleCheckReversalOutcome}
                    disabled={checkingOutcome}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs disabled:opacity-50"
                  >
                    {checkingOutcome ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Check Reversal Outcome
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryReversalExact}
                    disabled={reversalSubmitting || checkingOutcome}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {reversalSubmitting ? 'Retrying...' : 'Retry with Same Key'}
                  </button>
                </div>
              </div>
            )}

            {!isReversalFrozen && reversalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleReversePayment} className="space-y-4">
              <div>
                <label htmlFor="reversal-type-select" className="block text-xs font-semibold text-slate-700 mb-1">
                  Reversal Type <span className="text-rose-500">*</span>
                </label>
                <select
                  id="reversal-type-select"
                  value={reversalType}
                  onChange={(e) => setReversalType(e.target.value as ReversalType)}
                  disabled={isReversalFrozen}
                  className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  <option value="VOID">VOID — Payment entered by mistake / clerical error</option>
                  <option value="BOUNCE">BOUNCE — Cheque or bank transfer dishonored</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Audit Reason (Minimum 10 characters) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Provide detailed compliance audit justification (min 10 characters)..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  disabled={isReversalFrozen}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Character count: {reversalReason.trim().length}/10 required
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (isReversalFrozen) return;
                    setReversingPayment(null);
                  }}
                  disabled={isReversalFrozen}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversalSubmitting || reversalReason.trim().length < 10}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  {reversalSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Reversing...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      {isReversalFrozen ? 'Retry Reversal' : 'Confirm Reversal'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* REFUND MODAL (Admins Only)                                */}
      {/* ========================================================= */}
      {refundingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-purple-700">
              <div className="p-2 rounded-xl bg-purple-50 border border-purple-100">
                <Undo2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Issue Fee Refund</h3>
                <p className="text-xs text-purple-700">Process refund for payment {refundingPayment.paymentNumber}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex justify-between">
              <span className="text-slate-500">Original Payment Amount:</span>
              <span className="font-mono font-bold text-slate-900">{formatCurrency(refundingPayment.amount)}</span>
            </div>

            {isRefundFrozen && pendingRefundOp && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Refund Outcome Uncertain — Fields Locked</p>
                    <p className="mt-0.5 text-amber-800">
                      Refund of {formatCurrency(pendingRefundOp.context.refundAmount)} was dispatched with idempotency key{' '}
                      <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">
                        {pendingRefundOp.idempotencyKey.slice(0, 8)}...
                      </code>
                      . Please verify outcome with the server.
                    </p>
                    {refundError && (
                      <p className="mt-1.5 p-2 rounded-lg bg-amber-100 border border-amber-300 font-semibold text-amber-950">
                        {refundError}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-amber-200">
                  <button
                    type="button"
                    onClick={handleCheckRefundOutcome}
                    disabled={checkingOutcome}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs disabled:opacity-50"
                  >
                    {checkingOutcome ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Check Refund Outcome
                  </button>
                  <button
                    type="button"
                    onClick={handleRetryRefundExact}
                    disabled={refundSubmitting || checkingOutcome}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold bg-white border border-purple-300 text-purple-900 hover:bg-purple-100 disabled:opacity-50"
                  >
                    {refundSubmitting ? 'Retrying...' : 'Retry with Same Key'}
                  </button>
                </div>
              </div>
            )}

            {!isRefundFrozen && refundError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {refundError}
              </div>
            )}

            <form onSubmit={handleRefundPayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Refund Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={refundingPayment.amount}
                    required
                    placeholder="0.00"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    disabled={isRefundFrozen}
                    className="w-full text-xs font-mono font-bold rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payout Mode</label>
                  <select
                    value={refundMode}
                    onChange={(e) => setRefundMode(e.target.value)}
                    disabled={isRefundFrozen}
                    className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payout Reference # / UTR (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR9876543210"
                  value={refundReference}
                  onChange={(e) => setRefundReference(e.target.value)}
                  disabled={isRefundFrozen}
                  className="w-full text-xs rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Audit Reason (Minimum 10 characters) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Provide audit justification for fee refund (min 10 characters)..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  disabled={isRefundFrozen}
                  className="w-full text-xs rounded-xl border border-slate-300 p-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Character count: {refundReason.trim().length}/10 required
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (isRefundFrozen) return;
                    setRefundingPayment(null);
                  }}
                  disabled={isRefundFrozen}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={refundSubmitting || refundReason.trim().length < 10 || !refundAmount || parseFloat(refundAmount) <= 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 transition-colors disabled:opacity-50"
                >
                  {refundSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing Refund...
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-3.5 h-3.5" />
                      {isRefundFrozen ? 'Retry Refund' : 'Confirm Refund'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsView;
