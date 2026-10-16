import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  NotificationChannel,
  NotificationEventType,
  NotificationStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { validateEmailAddress } from '../templates/template-sanitizer';
import {
  PaymentReversedTemplateData,
  ReceiptIssuedTemplateData,
  RefundFailedTemplateData,
  RefundSucceededTemplateData,
} from '../templates/template.types';

export interface EnqueueReceiptIssuedParams {
  schoolId: string;
  receipt: {
    id: string;
    receiptNumber: string;
    totalAmount: Prisma.Decimal | number;
    academicYearId?: string;
  };
  payment: {
    id: string;
    paymentNumber: string;
    paymentDate: Date | string;
    paymentMethod: string;
    studentId: string;
  };
  student?: {
    id: string;
    schoolId?: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    guardianEmail?: string | null;
    guardianName?: string | null;
    userAccount?: {
      id?: string;
      schoolId?: string | null;
      email: string;
      name?: string;
      role?: UserRole;
      status?: UserStatus;
    } | null;
    parentRelations?: Array<{
      schoolId?: string;
      isVerified: boolean;
      parent?: {
        id?: string;
        schoolId?: string | null;
        email: string;
        name?: string;
        role?: UserRole;
        status?: UserStatus;
      } | null;
    }> | null;
  } | null;
  school?: {
    name: string;
    currency?: string;
  } | null;
  academicYear?: {
    name: string;
  } | null;
  allocations?: Array<{
    allocatedAmount: Prisma.Decimal | number;
    feeHeadNameSnapshot?: string;
  }>;
}

export interface EnqueuePaymentReversedParams {
  schoolId: string;
  paymentReversal: {
    id: string;
    reversalNumber: string;
    reversalType: string;
    totalAmount: Prisma.Decimal | number;
    reason: string;
    createdAt: Date | string;
  };
  payment: {
    id: string;
    paymentNumber: string;
    studentId: string;
    receipt?: { receiptNumber: string } | null;
  };
  student?: {
    id: string;
    schoolId?: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    guardianEmail?: string | null;
    guardianName?: string | null;
    userAccount?: {
      id?: string;
      schoolId?: string | null;
      email: string;
      name?: string;
      role?: UserRole;
      status?: UserStatus;
    } | null;
    parentRelations?: Array<{
      schoolId?: string;
      isVerified: boolean;
      parent?: {
        id?: string;
        schoolId?: string | null;
        email: string;
        name?: string;
        role?: UserRole;
        status?: UserStatus;
      } | null;
    }> | null;
  } | null;
  school?: {
    name: string;
    currency?: string;
  } | null;
}

export interface EnqueueRefundSucceededParams {
  schoolId: string;
  refund: {
    id: string;
    refundAmount: Prisma.Decimal | number;
    mode: string;
    referenceNumber?: string | null;
    reason: string;
    processedAt?: Date | string | null;
    createdAt: Date | string;
  };
  paymentId: string;
}

export interface EnqueueRefundFailedParams {
  schoolId: string;
  refund: {
    id: string;
    refundAmount: Prisma.Decimal | number;
    failureReason?: string | null;
    processedAt?: Date | string | null;
    createdAt: Date | string;
  };
  paymentId: string;
}

@Injectable()
export class NotificationOutboxService {
  private readonly logger = new Logger(NotificationOutboxService.name);

  /**
   * Enqueues a RECEIPT_ISSUED notification outbox record within the caller's Prisma transaction.
   */
  async enqueueReceiptIssued(
    tx: Prisma.TransactionClient,
    params: EnqueueReceiptIssuedParams,
  ) {
    const { schoolId, receipt, payment } = params;

    // 1. Fetch School settings within transaction to check if receipts are enabled
    const setting = await tx.schoolNotificationSetting.findUnique({
      where: { schoolId },
    });
    const isEnabled = setting?.receiptEmailEnabled ?? true;

    // 2. Resolve Student with tenant-scoped relations if not provided
    const student =
      params.student ||
      (await tx.student.findUnique({
        where: { schoolId_id: { schoolId, id: payment.studentId } },
        include: {
          userAccount: true,
          parentRelations: {
            where: { schoolId, isVerified: true },
            include: { parent: true },
          },
        },
      }));

    // 3. Resolve School name if not provided
    const school =
      params.school ||
      (await tx.school.findUnique({
        where: { id: schoolId },
        select: { name: true, currency: true },
      }));

    const schoolName = school?.name || 'School';
    const currency = school?.currency || 'INR';

    // 4. Resolve authorized recipient
    const { email: recipientEmail, name: recipientName, isSkipped, skipReason } =
      this.resolveRecipient(
        student,
        schoolId,
        NotificationEventType.RECEIPT_ISSUED,
        isEnabled,
        'receiptEmailEnabled',
      );

    const idempotencyKey = `RECEIPT:${receipt.id}:${recipientEmail || 'NO_EMAIL'}`;

    // 5. Construct template snapshot
    const templateData: ReceiptIssuedTemplateData = {
      schoolName,
      studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Student',
      admissionNumber: student?.admissionNumber || 'N/A',
      receiptNumber: receipt.receiptNumber,
      paymentNumber: payment.paymentNumber,
      paymentDate:
        payment.paymentDate instanceof Date
          ? payment.paymentDate.toISOString().split('T')[0]
          : String(payment.paymentDate).split('T')[0],
      paymentMethod: payment.paymentMethod,
      totalAmount: Number(receipt.totalAmount),
      currency,
      academicYear: params.academicYear?.name,
      lineItems: params.allocations
        ?.filter((a) => a.feeHeadNameSnapshot)
        .map((a) => ({
          feeHeadName: a.feeHeadNameSnapshot!,
          amount: Number(a.allocatedAmount),
        })),
    };

    return await this.createOutboxRecordSafely(tx, {
      schoolId,
      channel: NotificationChannel.EMAIL,
      eventType: NotificationEventType.RECEIPT_ISSUED,
      recipientEmail,
      recipientName,
      idempotencyKey,
      status: isSkipped ? NotificationStatus.SKIPPED : NotificationStatus.PENDING,
      skipReason,
      skippedAt: isSkipped ? new Date() : null,
      templateKey: NotificationEventType.RECEIPT_ISSUED,
      templateData: templateData as any,
    });
  }

  /**
   * Enqueues a PAYMENT_REVERSED notification outbox record within the caller's Prisma transaction.
   */
  async enqueuePaymentReversed(
    tx: Prisma.TransactionClient,
    params: EnqueuePaymentReversedParams,
  ) {
    const { schoolId, paymentReversal, payment } = params;

    const setting = await tx.schoolNotificationSetting.findUnique({
      where: { schoolId },
    });
    const isEnabled = setting?.paymentReversalEmailEnabled ?? true;

    const student =
      params.student ||
      (await tx.student.findUnique({
        where: { schoolId_id: { schoolId, id: payment.studentId } },
        include: {
          userAccount: true,
          parentRelations: {
            where: { schoolId, isVerified: true },
            include: { parent: true },
          },
        },
      }));

    const school =
      params.school ||
      (await tx.school.findUnique({
        where: { id: schoolId },
        select: { name: true, currency: true },
      }));

    const schoolName = school?.name || 'School';
    const currency = school?.currency || 'INR';

    const { email: recipientEmail, name: recipientName, isSkipped, skipReason } =
      this.resolveRecipient(
        student,
        schoolId,
        NotificationEventType.PAYMENT_REVERSED,
        isEnabled,
        'paymentReversalEmailEnabled',
      );

    const idempotencyKey = `REVERSAL:${paymentReversal.id}:${recipientEmail || 'NO_EMAIL'}`;

    const templateData: PaymentReversedTemplateData = {
      schoolName,
      studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Student',
      admissionNumber: student?.admissionNumber || 'N/A',
      reversalNumber: paymentReversal.reversalNumber,
      reversalType: paymentReversal.reversalType,
      reversedAmount: Number(paymentReversal.totalAmount),
      currency,
      originalPaymentNumber: payment.paymentNumber,
      originalReceiptNumber: payment.receipt?.receiptNumber,
      reason: paymentReversal.reason,
      reversalDate:
        paymentReversal.createdAt instanceof Date
          ? paymentReversal.createdAt.toISOString().split('T')[0]
          : String(paymentReversal.createdAt).split('T')[0],
    };

    return await this.createOutboxRecordSafely(tx, {
      schoolId,
      channel: NotificationChannel.EMAIL,
      eventType: NotificationEventType.PAYMENT_REVERSED,
      recipientEmail,
      recipientName,
      idempotencyKey,
      status: isSkipped ? NotificationStatus.SKIPPED : NotificationStatus.PENDING,
      skipReason,
      skippedAt: isSkipped ? new Date() : null,
      templateKey: NotificationEventType.PAYMENT_REVERSED,
      templateData: templateData as any,
    });
  }

  /**
   * Enqueues a REFUND_SUCCEEDED notification outbox record within the caller's Prisma transaction.
   */
  async enqueueRefundSucceeded(
    tx: Prisma.TransactionClient,
    params: EnqueueRefundSucceededParams,
  ) {
    const { schoolId, refund, paymentId } = params;

    const setting = await tx.schoolNotificationSetting.findUnique({
      where: { schoolId },
    });
    const isEnabled = setting?.refundSuccessEmailEnabled ?? true;

    // Fetch payment and student details with tenant-scoped parent relations
    const payment = await tx.payment.findUnique({
      where: { schoolId_id: { schoolId, id: paymentId } },
      include: {
        student: {
          include: {
            userAccount: true,
            parentRelations: {
              where: { schoolId, isVerified: true },
              include: { parent: true },
            },
          },
        },
        school: { select: { name: true, currency: true } },
      },
    });

    const student = payment?.student;
    const schoolName = payment?.school?.name || 'School';
    const currency = payment?.school?.currency || 'INR';

    const { email: recipientEmail, name: recipientName, isSkipped, skipReason } =
      this.resolveRecipient(
        student,
        schoolId,
        NotificationEventType.REFUND_SUCCEEDED,
        isEnabled,
        'refundSuccessEmailEnabled',
      );

    const idempotencyKey = `REFUND_SUCCESS:${refund.id}:${recipientEmail || 'NO_EMAIL'}`;

    const templateData: RefundSucceededTemplateData = {
      schoolName,
      studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Student',
      admissionNumber: student?.admissionNumber || 'N/A',
      refundReference: refund.id,
      originalPaymentNumber: payment?.paymentNumber || 'N/A',
      refundAmount: Number(refund.refundAmount),
      currency,
      mode: refund.mode,
      referenceNumber: refund.referenceNumber || undefined,
      reason: refund.reason,
      refundDate: refund.processedAt
        ? refund.processedAt instanceof Date
          ? refund.processedAt.toISOString().split('T')[0]
          : String(refund.processedAt).split('T')[0]
        : refund.createdAt instanceof Date
        ? refund.createdAt.toISOString().split('T')[0]
        : String(refund.createdAt).split('T')[0],
    };

    return await this.createOutboxRecordSafely(tx, {
      schoolId,
      channel: NotificationChannel.EMAIL,
      eventType: NotificationEventType.REFUND_SUCCEEDED,
      recipientEmail,
      recipientName,
      idempotencyKey,
      status: isSkipped ? NotificationStatus.SKIPPED : NotificationStatus.PENDING,
      skipReason,
      skippedAt: isSkipped ? new Date() : null,
      templateKey: NotificationEventType.REFUND_SUCCEEDED,
      templateData: templateData as any,
    });
  }

  /**
   * Enqueues a REFUND_FAILED notification outbox record within the caller's Prisma transaction.
   */
  async enqueueRefundFailed(
    tx: Prisma.TransactionClient,
    params: EnqueueRefundFailedParams,
  ) {
    const { schoolId, refund, paymentId } = params;

    const setting = await tx.schoolNotificationSetting.findUnique({
      where: { schoolId },
    });
    const isEnabled = setting?.refundFailureEmailEnabled ?? true;

    const payment = await tx.payment.findUnique({
      where: { schoolId_id: { schoolId, id: paymentId } },
      include: {
        student: {
          include: {
            userAccount: true,
            parentRelations: {
              where: { schoolId, isVerified: true },
              include: { parent: true },
            },
          },
        },
        school: { select: { name: true, currency: true } },
      },
    });

    const student = payment?.student;
    const schoolName = payment?.school?.name || 'School';
    const currency = payment?.school?.currency || 'INR';

    const { email: recipientEmail, name: recipientName, isSkipped, skipReason } =
      this.resolveRecipient(
        student,
        schoolId,
        NotificationEventType.REFUND_FAILED,
        isEnabled,
        'refundFailureEmailEnabled',
      );

    const idempotencyKey = `REFUND_FAILURE:${refund.id}:${recipientEmail || 'NO_EMAIL'}`;

    const templateData: RefundFailedTemplateData = {
      schoolName,
      studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Student',
      admissionNumber: student?.admissionNumber || 'N/A',
      refundReference: refund.id,
      originalPaymentNumber: payment?.paymentNumber || 'N/A',
      refundAmount: Number(refund.refundAmount),
      currency,
      failureReason: refund.failureReason || 'Disbursement rejected by banking partner',
      attemptedDate: refund.processedAt
        ? refund.processedAt instanceof Date
          ? refund.processedAt.toISOString().split('T')[0]
          : String(refund.processedAt).split('T')[0]
        : refund.createdAt instanceof Date
        ? refund.createdAt.toISOString().split('T')[0]
        : String(refund.createdAt).split('T')[0],
    };

    return await this.createOutboxRecordSafely(tx, {
      schoolId,
      channel: NotificationChannel.EMAIL,
      eventType: NotificationEventType.REFUND_FAILED,
      recipientEmail,
      recipientName,
      idempotencyKey,
      status: isSkipped ? NotificationStatus.SKIPPED : NotificationStatus.PENDING,
      skipReason,
      skippedAt: isSkipped ? new Date() : null,
      templateKey: NotificationEventType.REFUND_FAILED,
      templateData: templateData as any,
    });
  }

  /**
   * Safely inserts an outbox record within the caller's interactive Prisma transaction.
   *
   * Transactional Idempotency Strategy:
   * 1. Query tx.notificationOutbox.findUnique first as a fast-path read. If found, returns the existing record immediately.
   * 2. If not found, execute a parameterized PostgreSQL `INSERT ... ON CONFLICT ("schoolId", "idempotencyKey") DO NOTHING RETURNING *`
   *    via `tx.$queryRaw`.
   *    In PostgreSQL, ON CONFLICT DO NOTHING guarantees that:
   *    a) If the row is inserted, RETURNING * returns the newly created row.
   *    b) If a concurrent transaction already inserted the row, PostgreSQL executes DO NOTHING, returns an empty array,
   *       and DOES NOT raise a 23505 unique constraint violation. The caller's transaction remains healthy and usable.
   * 3. If RETURNING * returns an empty array (conflict occurred), read the canonical winning record via
   *    `tx.notificationOutbox.findUniqueOrThrow`. The winning record's original event snapshot is preserved.
   * 4. Unrelated database errors (connectivity failure, timeout, foreign key violation) are NOT caught or swallowed;
   *    they bubble up to trigger an interactive transaction rollback as required by financial integrity rules.
   */
  private async createOutboxRecordSafely(
    tx: Prisma.TransactionClient,
    data: Prisma.NotificationOutboxUncheckedCreateInput,
  ) {
    const existing = await tx.notificationOutbox.findUnique({
      where: {
        schoolId_idempotencyKey: {
          schoolId: data.schoolId,
          idempotencyKey: data.idempotencyKey,
        },
      },
    });
    if (existing) {
      return existing;
    }

    const id = data.id || crypto.randomUUID();
    const templateDataJson = JSON.stringify(data.templateData);

    const insertedRows = await tx.$queryRaw<Array<any>>`
      INSERT INTO "notification_outbox" (
        "id",
        "schoolId",
        "channel",
        "eventType",
        "recipientEmail",
        "recipientName",
        "idempotencyKey",
        "status",
        "skipReason",
        "skippedAt",
        "templateKey",
        "templateData",
        "attemptCount",
        "nextAttemptAt",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${data.schoolId},
        ${data.channel}::"NotificationChannel",
        ${data.eventType}::"NotificationEventType",
        ${data.recipientEmail},
        ${data.recipientName},
        ${data.idempotencyKey},
        ${data.status}::"NotificationStatus",
        ${data.skipReason},
        ${data.skippedAt},
        ${data.templateKey},
        ${templateDataJson}::jsonb,
        0,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT ("schoolId", "idempotencyKey") DO NOTHING
      RETURNING *;
    `;

    if (insertedRows && insertedRows.length > 0) {
      return insertedRows[0];
    }

    // A conflict occurred on ("schoolId", "idempotencyKey") - read the canonical winning record
    return await tx.notificationOutbox.findUniqueOrThrow({
      where: {
        schoolId_idempotencyKey: {
          schoolId: data.schoolId,
          idempotencyKey: data.idempotencyKey,
        },
      },
    });
  }

  /**
   * Resolves an authorized recipient email based on event type, tenant scoping,
   * verification status, and school notification preferences.
   *
   * Authorization Rules:
   * 1. Tenant Scoping: All recipient candidates MUST belong to the same schoolId as the event.
   *    Cross-tenant user accounts or relations are strictly rejected.
   * 2. RECEIPT_ISSUED:
   *    - Priority 1: Registered Guardian (student.guardianEmail) where student.schoolId === schoolId.
   *    - Priority 2: Verified Active Parent (ParentStudentRelation with isVerified: true, parent.schoolId === schoolId, parent.role === PARENT, parent.status === ACTIVE).
   *    - Priority 3: Student User Account (student.userAccount with schoolId === schoolId, role === STUDENT, status === ACTIVE).
   * 3. PAYMENT_REVERSED, REFUND_SUCCEEDED, REFUND_FAILED:
   *    - Priority 1: Registered Guardian (student.guardianEmail).
   *    - Priority 2: Verified Active Parent (ParentStudentRelation with isVerified: true, parent.schoolId === schoolId, parent.role === PARENT, parent.status === ACTIVE).
   *    - Student accounts are NOT authorized for financial reversals and refund disbursements without guardian standing.
   *      If no authorized guardian or parent exists, skips with NO_AUTHORIZED_PARENT_OR_GUARDIAN_RECIPIENT.
   * 4. Graceful Degradation:
   *    - Never throws; persists SKIPPED status if no valid authorized recipient exists.
   */
  private resolveRecipient(
    student: any,
    schoolId: string,
    eventType: NotificationEventType,
    isEventEnabled: boolean,
    settingKey: string,
  ): {
    email: string | null;
    name: string | null;
    isSkipped: boolean;
    skipReason: string | null;
  } {
    // Defense in depth: Verify student belongs to this school
    if (!student || (student.schoolId && student.schoolId !== schoolId)) {
      return {
        email: null,
        name: null,
        isSkipped: true,
        skipReason: 'STUDENT_NOT_FOUND_OR_TENANT_MISMATCH',
      };
    }

    let candidateEmail: string | null = null;
    let candidateName: string | null = null;

    // 1. Priority 1: Registered Guardian Email on Student Profile
    const rawGuardianEmail = student.guardianEmail?.trim();
    if (rawGuardianEmail && validateEmailAddress(rawGuardianEmail)) {
      candidateEmail = rawGuardianEmail.toLowerCase();
      candidateName =
        student.guardianName?.trim() ||
        `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
        null;
    }

    // 2. Priority 2: Verified Parent via ParentStudentRelation scoped to this school
    if (!candidateEmail && Array.isArray(student.parentRelations)) {
      const verifiedRelation = student.parentRelations.find((rel: any) => {
        if (!rel || rel.isVerified !== true) return false;
        if (rel.schoolId && rel.schoolId !== schoolId) return false;
        const parent = rel.parent;
        if (!parent) return false;
        if (parent.schoolId && parent.schoolId !== schoolId) return false;
        if (parent.role && parent.role !== UserRole.PARENT) return false;
        if (parent.status && parent.status !== UserStatus.ACTIVE) return false;
        return parent.email && validateEmailAddress(parent.email.trim());
      });

      if (verifiedRelation?.parent?.email) {
        candidateEmail = verifiedRelation.parent.email.trim().toLowerCase();
        candidateName =
          verifiedRelation.parent.name?.trim() ||
          `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
          null;
      }
    }

    // 3. Priority 3: Student User Account (ONLY for RECEIPT_ISSUED)
    if (!candidateEmail && eventType === NotificationEventType.RECEIPT_ISSUED) {
      const userAccount = student.userAccount;
      if (
        userAccount &&
        (!userAccount.schoolId || userAccount.schoolId === schoolId) &&
        (!userAccount.role || userAccount.role === UserRole.STUDENT) &&
        (!userAccount.status || userAccount.status === UserStatus.ACTIVE) &&
        userAccount.email &&
        validateEmailAddress(userAccount.email.trim())
      ) {
        candidateEmail = userAccount.email.trim().toLowerCase();
        candidateName =
          `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
          userAccount.name?.trim() ||
          null;
      }
    }

    // 4. If no authorized recipient found
    if (!candidateEmail) {
      const defaultName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || null;
      const skipReason =
        eventType === NotificationEventType.RECEIPT_ISSUED
          ? 'NO_VALID_RECIPIENT_EMAIL'
          : 'NO_AUTHORIZED_PARENT_OR_GUARDIAN_RECIPIENT';

      return {
        email: null,
        name: defaultName,
        isSkipped: true,
        skipReason,
      };
    }

    // 5. Check if event is disabled by school setting
    if (!isEventEnabled) {
      return {
        email: candidateEmail,
        name: candidateName,
        isSkipped: true,
        skipReason: `EVENT_DISABLED_BY_SCHOOL_SETTING:${settingKey}`,
      };
    }

    return {
      email: candidateEmail,
      name: candidateName,
      isSkipped: false,
      skipReason: null,
    };
  }
}
