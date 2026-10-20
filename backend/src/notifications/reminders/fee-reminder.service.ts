import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FeeReminderMilestone,
  FeeReminderTemplateData,
} from '../templates/template.types';
import { validateEmailAddress } from '../templates/template-sanitizer';

export interface FeeReminderCandidate {
  invoiceId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  recipientEmail: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  milestone: FeeReminderMilestone;
  dueDate: string;
  daysOverdue?: number;
  totalFeeAmount: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  idempotencyKey: string;
  templateData: FeeReminderTemplateData;
}

export interface FeeReminderScanResult {
  schoolId: string;
  asOfDate: string;
  scannedInvoicesCount: number;
  eligibleRemindersCount: number;
  candidates: FeeReminderCandidate[];
}

export interface FeeReminderProduceResult {
  schoolId: string;
  asOfDate: string;
  scannedInvoicesCount: number;
  eligibleRemindersCount: number;
  enqueuedCount: number;
  skippedCount: number;
  records: Array<{
    idempotencyKey: string;
    invoiceId: string;
    milestone: FeeReminderMilestone;
    status: 'ENQUEUED' | 'SKIPPED' | 'SIMULATED_PENDING_SCHEMA_MIGRATION';
    recipientEmail: string | null;
    recipientPhone: string | null;
    balanceDue: number;
    skipReason?: string;
  }>;
}

/**
 * Returns date formatted as YYYY-MM-DD in the specified IANA timezone.
 */
export function formatDateInTimezone(date: Date, timezone = 'Asia/Kolkata'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    // Fallback if timezone is invalid
    return date.toISOString().split('T')[0];
  }
}

/**
 * Calculates calendar day difference (targetDate - baseDate) in the given timezone.
 */
export function getCalendarDayDiff(targetDate: Date, baseDate: Date, timezone = 'Asia/Kolkata'): number {
  const targetStr = formatDateInTimezone(targetDate, timezone);
  const baseStr = formatDateInTimezone(baseDate, timezone);

  const targetUtc = Date.UTC(
    parseInt(targetStr.slice(0, 4), 10),
    parseInt(targetStr.slice(5, 7), 10) - 1,
    parseInt(targetStr.slice(8, 10), 10),
  );
  const baseUtc = Date.UTC(
    parseInt(baseStr.slice(0, 4), 10),
    parseInt(baseStr.slice(5, 7), 10) - 1,
    parseInt(baseStr.slice(8, 10), 10),
  );

  return Math.round((targetUtc - baseUtc) / (1000 * 60 * 60 * 24));
}

@Injectable()
export class FeeReminderService {
  private readonly logger = new Logger(FeeReminderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scans eligible unpaid invoices for a school and identifies reminder candidates for
   * the 4 required milestones: DUE_IN_7_DAYS, DUE_IN_1_DAY, DUE_TODAY, OVERDUE.
   *
   * Idempotent & Non-Mutating by default.
   */
  async scanReminders(
    schoolId: string,
    referenceDate: Date = new Date(),
  ): Promise<FeeReminderScanResult> {
    if (!schoolId) {
      throw new Error('schoolId is required to scan fee reminders');
    }

    // 1. Load School to verify existence, currency, and timezone
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, currency: true, timezone: true },
    });

    if (!school) {
      throw new Error(`School with ID '${schoolId}' not found.`);
    }

    const timezone = school.timezone || 'Asia/Kolkata';
    const currency = school.currency || 'INR';
    const asOfDateStr = formatDateInTimezone(referenceDate, timezone);

    // 2. Query invoices that are NOT marked PAID or VOID
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        schoolId,
        status: {
          notIn: [InvoiceStatus.PAID, InvoiceStatus.VOID],
        },
      },
      include: {
        student: {
          include: {
            userAccount: true,
            grade: { select: { name: true } },
            section: { select: { name: true } },
            parentRelations: {
              where: { schoolId, isVerified: true },
              include: { parent: true },
            },
          },
        },
        academicYear: { select: { name: true } },
        items: {
          include: {
            feeHead: { select: { name: true } },
          },
        },
        paymentAllocations: {
          where: {
            payment: { status: PaymentStatus.COMPLETED },
          },
          select: { allocatedAmount: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const candidates: FeeReminderCandidate[] = [];

    for (const inv of invoices) {
      // 3. Re-verify financial eligibility: net amount minus settled allocations
      const totalAllocated = inv.paymentAllocations.reduce(
        (sum, a) => sum + Number(a.allocatedAmount),
        0,
      );
      const netAmount = Number(inv.netAmount);
      const balanceDue = Math.max(0, netAmount - totalAllocated);

      // Exclude settled invoices
      if (balanceDue <= 0.001) {
        continue;
      }

      // 4. Milestone Evaluation based on calendar day difference in school timezone
      const dueDateStr = formatDateInTimezone(inv.dueDate, timezone);
      const dayDiff = getCalendarDayDiff(inv.dueDate, referenceDate, timezone);

      let milestone: FeeReminderMilestone | null = null;
      let daysOverdue: number | undefined = undefined;

      if (dayDiff === 7) {
        milestone = 'DUE_IN_7_DAYS';
      } else if (dayDiff === 1) {
        milestone = 'DUE_IN_1_DAY';
      } else if (dayDiff === 0) {
        milestone = 'DUE_TODAY';
      } else if (dayDiff < 0) {
        milestone = 'OVERDUE';
        daysOverdue = Math.abs(dayDiff);
      } else {
        // Not at any reminder milestone (e.g. 15 days before due)
        continue;
      }

      // 5. Recipient contact resolution
      const student = inv.student;
      const recipientContact = this.resolveStudentRecipient(student, schoolId);

      // 6. Construct deterministic idempotency key
      // Format: REMINDER:{schoolId}:{invoiceId}:{milestone}:{cycleDate}:{recipientContact}
      const cycleKey = milestone === 'OVERDUE' ? `${dueDateStr}_OD${daysOverdue}` : dueDateStr;
      const recipientKey = recipientContact.email || recipientContact.phone || 'NO_CONTACT';
      const idempotencyKey = `REMINDER:${schoolId}:${inv.id}:${milestone}:${cycleKey}:${recipientKey}`;

      // 7. Format line items snapshot
      const lineItems = (inv.items || []).map((it) => ({
        feeHeadName: it.feeHeadNameSnapshot || it.feeHead?.name || 'Tuition Fee',
        amount: Number(it.netAmount),
      }));

      const templateData: FeeReminderTemplateData = {
        schoolName: school.name,
        studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Student',
        admissionNumber: student?.admissionNumber || 'N/A',
        gradeName: student?.grade?.name,
        sectionName: student?.section?.name,
        academicYearName: inv.academicYear?.name,
        billingMonthName: `Month ${inv.billingMonth}`,
        milestone,
        dueDate: dueDateStr,
        totalFeeAmount: netAmount,
        paidAmount: totalAllocated,
        balanceDue,
        currency,
        lineItems,
        daysOverdue,
      };

      candidates.push({
        invoiceId: inv.id,
        studentId: inv.studentId,
        studentName: templateData.studentName,
        admissionNumber: templateData.admissionNumber,
        recipientEmail: recipientContact.email,
        recipientName: recipientContact.name,
        recipientPhone: recipientContact.phone,
        milestone,
        dueDate: dueDateStr,
        daysOverdue,
        totalFeeAmount: netAmount,
        paidAmount: totalAllocated,
        balanceDue,
        currency,
        idempotencyKey,
        templateData,
      });
    }

    return {
      schoolId,
      asOfDate: asOfDateStr,
      scannedInvoicesCount: invoices.length,
      eligibleRemindersCount: candidates.length,
      candidates,
    };
  }

  /**
   * Producer method: scans eligible invoices and stages fee reminder outbox records.
   * Runs inside caller's transaction or standalone query client.
   * If schema enum for reminder event types is pending migration, records are evaluated and
   * staged in dryRun mode without executing invalid enum casts in PostgreSQL.
   */
  async produceReminders(
    tx: Prisma.TransactionClient,
    schoolId: string,
    referenceDate: Date = new Date(),
    options: { dryRun?: boolean; persistOutbox?: boolean } = { dryRun: true, persistOutbox: false },
  ): Promise<FeeReminderProduceResult> {
    // 0. Check school notification settings for feeReminderEmailEnabled if available
    let feeReminderEmailEnabled = true;
    try {
      const setting = await tx.schoolNotificationSetting.findUnique({
        where: { schoolId },
      });
      if (setting && (setting as any).feeReminderEmailEnabled === false) {
        feeReminderEmailEnabled = false;
      }
    } catch {
      // Proceed with defaults if setting read is unsupported or table missing
    }

    if (!feeReminderEmailEnabled) {
      this.logger.log(`Fee reminder emails disabled by school setting for school ${schoolId}`);
      const scanResult = await this.scanReminders(schoolId, referenceDate);
      return {
        schoolId,
        asOfDate: scanResult.asOfDate,
        scannedInvoicesCount: scanResult.scannedInvoicesCount,
        eligibleRemindersCount: scanResult.eligibleRemindersCount,
        enqueuedCount: 0,
        skippedCount: scanResult.eligibleRemindersCount,
        records: scanResult.candidates.map((cand) => ({
          idempotencyKey: cand.idempotencyKey,
          invoiceId: cand.invoiceId,
          milestone: cand.milestone,
          status: 'SKIPPED',
          recipientEmail: cand.recipientEmail,
          recipientPhone: cand.recipientPhone,
          balanceDue: cand.balanceDue,
          skipReason: 'EVENT_DISABLED_BY_SCHOOL_SETTING:feeReminderEmailEnabled',
        })),
      };
    }

    const scanResult = await this.scanReminders(schoolId, referenceDate);

    const results: FeeReminderProduceResult['records'] = [];
    let enqueuedCount = 0;
    let skippedCount = 0;

    for (const cand of scanResult.candidates) {
      if (!cand.recipientEmail && !cand.recipientPhone) {
        skippedCount++;
        results.push({
          idempotencyKey: cand.idempotencyKey,
          invoiceId: cand.invoiceId,
          milestone: cand.milestone,
          status: 'SKIPPED',
          recipientEmail: null,
          recipientPhone: null,
          balanceDue: cand.balanceDue,
          skipReason: 'NO_VALID_RECIPIENT_CONTACT',
        });
        continue;
      }

      // Check if this idempotency key already exists in notification_outbox
      const existing = await tx.notificationOutbox.findUnique({
        where: {
          schoolId_idempotencyKey: {
            schoolId,
            idempotencyKey: cand.idempotencyKey,
          },
        },
      });

      if (existing) {
        skippedCount++;
        results.push({
          idempotencyKey: cand.idempotencyKey,
          invoiceId: cand.invoiceId,
          milestone: cand.milestone,
          status: 'SKIPPED',
          recipientEmail: cand.recipientEmail,
          recipientPhone: cand.recipientPhone,
          balanceDue: cand.balanceDue,
          skipReason: 'DUPLICATE_IDEMPOTENCY_KEY_ALREADY_EXISTS',
        });
        continue;
      }

      if (options.persistOutbox && !options.dryRun) {
        // Enqueue into notification_outbox via parameterized SQL
        const id = crypto.randomUUID();
        const templateDataJson = JSON.stringify(cand.templateData);

        await tx.$queryRaw`
          INSERT INTO "notification_outbox" (
            "id",
            "schoolId",
            "channel",
            "eventType",
            "recipientEmail",
            "recipientName",
            "idempotencyKey",
            "status",
            "templateKey",
            "templateData",
            "attemptCount",
            "nextAttemptAt",
            "createdAt",
            "updatedAt"
          ) VALUES (
            ${id},
            ${schoolId},
            'EMAIL'::"NotificationChannel",
            'FEE_DUE_REMINDER'::"NotificationEventType",
            ${cand.recipientEmail},
            ${cand.recipientName},
            ${cand.idempotencyKey},
            'PENDING'::"NotificationStatus",
            'FEE_DUE_REMINDER',
            ${templateDataJson}::jsonb,
            0,
            NOW(),
            NOW(),
            NOW()
          )
          ON CONFLICT ("schoolId", "idempotencyKey") DO NOTHING;
        `;
        enqueuedCount++;
        results.push({
          idempotencyKey: cand.idempotencyKey,
          invoiceId: cand.invoiceId,
          milestone: cand.milestone,
          status: 'ENQUEUED',
          recipientEmail: cand.recipientEmail,
          recipientPhone: cand.recipientPhone,
          balanceDue: cand.balanceDue,
        });
      } else {
        // Dry-run / schema enum pending migration
        enqueuedCount++;
        results.push({
          idempotencyKey: cand.idempotencyKey,
          invoiceId: cand.invoiceId,
          milestone: cand.milestone,
          status: 'SIMULATED_PENDING_SCHEMA_MIGRATION',
          recipientEmail: cand.recipientEmail,
          recipientPhone: cand.recipientPhone,
          balanceDue: cand.balanceDue,
        });
      }
    }

    return {
      schoolId,
      asOfDate: scanResult.asOfDate,
      scannedInvoicesCount: scanResult.scannedInvoicesCount,
      eligibleRemindersCount: scanResult.eligibleRemindersCount,
      enqueuedCount,
      skippedCount,
      records: results,
    };
  }

  /**
   * Resolves recipient email, name, and phone with tenant verification.
   */
  private resolveStudentRecipient(
    student: any,
    schoolId: string,
  ): { email: string | null; name: string | null; phone: string | null } {
    if (!student || (student.schoolId && student.schoolId !== schoolId)) {
      return { email: null, name: null, phone: null };
    }

    // Guardian contact details on student profile
    const guardianEmail = student.guardianEmail?.trim();
    const guardianPhone = student.guardianPhone?.trim() || null;
    const guardianName = student.guardianName?.trim() || `${student.firstName} ${student.lastName}`.trim();

    if (guardianEmail && validateEmailAddress(guardianEmail)) {
      return {
        email: guardianEmail.toLowerCase(),
        name: guardianName,
        phone: guardianPhone,
      };
    }

    // Verified parent via relation
    if (Array.isArray(student.parentRelations)) {
      const verified = student.parentRelations.find(
        (rel: any) => rel.isVerified && (!rel.schoolId || rel.schoolId === schoolId) && rel.parent?.email,
      );
      if (verified?.parent?.email && validateEmailAddress(verified.parent.email.trim())) {
        return {
          email: verified.parent.email.trim().toLowerCase(),
          name: verified.parent.name?.trim() || guardianName,
          phone: guardianPhone,
        };
      }
    }

    // Student account fallback
    if (student.userAccount?.email && validateEmailAddress(student.userAccount.email.trim())) {
      return {
        email: student.userAccount.email.trim().toLowerCase(),
        name: student.userAccount.name?.trim() || `${student.firstName} ${student.lastName}`.trim(),
        phone: guardianPhone,
      };
    }

    return {
      email: null,
      name: `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student',
      phone: guardianPhone,
    };
  }
}
