import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  AllocationType,
  AssessedFineStatus,
  GatewayEnvironment,
  GatewayStatus,
  InvoiceStatus,
  OnlinePaymentStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceiptStatus,
  RefundStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolPaymentGatewayConfigService } from '../schools/school-payment-gateway-config.service';
import {
  ReceiptArtifactService,
  resolveActiveTemplateVersionForSchool,
} from '../receipt-templates/receipt-artifact.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { SAFE_SCHOOL_SELECT, SAFE_RECEIPT_SELECT } from './payments.service';
import { validateRazorpayKeyEnvironment } from './razorpay-mode.validator';

export interface WebhookProcessingResult {
  status:
    | 'success'
    | 'already_settled'
    | 'settled_with_surplus'
    | 'settled_with_full_surplus'
    | 'marked_failed'
    | 'noop_already_succeeded'
    | 'ignored';
  paymentId?: string;
  orderId?: string;
  receiptNumber?: string;
  allocatedAmount?: number;
  surplusAmount?: number;
  isDuplicate?: boolean;
  event?: string;
}

@Injectable()
export class RazorpayWebhookService {
  private readonly logger = new Logger(RazorpayWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayConfigService: SchoolPaymentGatewayConfigService,
    private readonly receiptSequenceService: ReceiptSequenceService,
    @Optional()
    private readonly receiptArtifactService?: ReceiptArtifactService,
  ) {}

  /**
   * Main entry point for processing incoming Razorpay webhook deliveries.
   *
   * Enforces:
   * 1. Signature presence and raw body integrity.
   * 2. Tenant identification strictly from local database records (G1.6).
   * 3. HMAC-SHA256 signature verification with timing-safe comparison (G1.2).
   * 4. Strict TEST mode and credential validation (G1.3).
   * 5. Payload event and monetary amount validation (G1.5, G3.3).
   * 6. Durable idempotency and terminal status preservation (G2).
   * 7. Transactional settlement with row-level locks and authoritative balance recalculation (G3).
   * 8. TOCTOU cashier race surplus reconciliation (G4).
   */
  async handleWebhook(
    rawBody: Buffer | string | undefined,
    signature: string | undefined,
  ): Promise<WebhookProcessingResult> {
    // 1. Signature and payload presence
    if (!signature || signature.trim().length === 0) {
      throw new BadRequestException(
        'Missing required x-razorpay-signature header',
      );
    }

    if (!rawBody) {
      throw new BadRequestException('Empty webhook payload');
    }

    const rawBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(rawBody, 'utf8');

    if (rawBuffer.length === 0) {
      throw new BadRequestException('Empty webhook payload');
    }

    // 2. Parse JSON payload
    let payload: any;
    try {
      payload = JSON.parse(rawBuffer.toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed webhook payload JSON');
    }

    const event = payload?.event;
    if (!event || typeof event !== 'string') {
      throw new BadRequestException('Webhook payload missing event type');
    }

    // Extract provider entities
    const paymentEntity = payload?.payload?.payment?.entity;
    const orderEntity = payload?.payload?.order?.entity;

    const providerOrderId = paymentEntity?.order_id || orderEntity?.id;
    const providerPaymentId = paymentEntity?.id;

    if (!providerOrderId) {
      throw new BadRequestException(
        'Webhook payload missing provider order_id',
      );
    }

    // 3. Resolve Tenant strictly from trusted local database record (G1.6)
    const order = await this.prisma.onlinePaymentOrder.findFirst({
      where: { providerOrderId },
      include: {
        school: true,
        student: true,
        invoice: true,
      },
    });

    if (!order) {
      this.logger.warn(
        `Webhook rejected: No local online payment order found for provider order '${providerOrderId}'`,
      );
      throw new NotFoundException(
        `No local online payment order found for provider order '${providerOrderId}'`,
      );
    }

    const schoolId = order.schoolId;

    // 4. Retrieve school gateway credentials and verify HMAC signature
    const credentials =
      await this.gatewayConfigService.decryptCredentialsForInternalUse(schoolId);

    if (!credentials.webhookSecret) {
      this.logger.error(
        `Webhook rejected: School ${schoolId} has not configured a webhook secret`,
      );
      throw new BadRequestException(
        'Webhook secret is not configured for this school',
      );
    }

    this.verifyHmacSignature(rawBuffer, signature, credentials.webhookSecret);

    // Verify gateway environment and key consistency
    validateRazorpayKeyEnvironment(credentials.environment, credentials.keyId);

    // 5. Dispatch based on verified event
    if (event === 'payment.failed') {
      return await this.handlePaymentFailed(order, paymentEntity);
    }

    if (event === 'payment.captured' || event === 'order.paid') {
      return await this.handlePaymentSuccess(
        order,
        paymentEntity,
        orderEntity,
        signature,
        event,
      );
    }

    // Other events (e.g. payment.authorized) are safely acknowledged without settlement
    this.logger.log(
      `Unhandled Razorpay webhook event '${event}' acknowledged for order ${order.id}.`,
    );
    return { status: 'ignored', event };
  }

  /**
   * Cryptographically verifies the Razorpay HMAC-SHA256 signature using timing-safe buffer comparison.
   */
  public verifyHmacSignature(
    rawBuffer: Buffer,
    signature: string,
    webhookSecret: string,
  ): void {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBuffer)
      .digest('hex');

    const sigBuffer = Buffer.from(signature.trim(), 'utf8');
    const expBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      sigBuffer.length !== expBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expBuffer)
    ) {
      this.logger.warn('Webhook rejected: Invalid webhook signature');
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  /**
   * Handles payment.failed provider events.
   * Preserves terminal SUCCESS states (does not overwrite successful settlement with delayed failure).
   */
  private async handlePaymentFailed(
    order: any,
    paymentEntity: any,
  ): Promise<WebhookProcessingResult> {
    const currentOrder = await this.prisma.onlinePaymentOrder.findUnique({
      where: { id: order.id },
      select: { id: true, status: true, metadata: true },
    });

    if (!currentOrder) {
      throw new NotFoundException('Order not found');
    }

    // G2.4: Do not overwrite terminal financial success state with an older or out-of-order failure event
    if (currentOrder.status === OnlinePaymentStatus.SUCCESS) {
      this.logger.log(
        `Out-of-order payment.failed event received for already settled order ${order.id}. Preserving SUCCESS state.`,
      );
      return { status: 'noop_already_succeeded', orderId: order.id };
    }

    const failureReason =
      paymentEntity?.error_description ||
      paymentEntity?.error_reason ||
      'Payment was declined by payment gateway';

    await this.prisma.onlinePaymentOrder.update({
      where: { id: order.id },
      data: {
        status: OnlinePaymentStatus.FAILED,
        failureReason,
        providerPaymentId: paymentEntity?.id || null,
        metadata: {
          ...(typeof currentOrder.metadata === 'object' && currentOrder.metadata !== null
            ? currentOrder.metadata
            : {}),
          failedEvent: {
            paymentId: paymentEntity?.id,
            errorCode: paymentEntity?.error_code,
            errorDescription: failureReason,
            receivedAt: new Date().toISOString(),
          },
        },
      },
    });

    this.logger.log(
      `Online payment order ${order.id} marked FAILED. Reason: ${failureReason}`,
    );
    return { status: 'marked_failed', orderId: order.id };
  }

  /**
   * Handles payment.captured and order.paid provider events.
   * Executes atomic, row-locked financial settlement inside a single database transaction.
   */
  private async handlePaymentSuccess(
    order: any,
    paymentEntity: any,
    orderEntity: any,
    signature: string,
    event: string,
  ): Promise<WebhookProcessingResult> {
    // 1. Validate payment details
    const paymentId = paymentEntity?.id;
    if (!paymentId) {
      throw new BadRequestException('Webhook payload missing payment ID');
    }

    if (paymentEntity?.status && paymentEntity.status !== 'captured') {
      throw new BadRequestException(
        `Payment status is '${paymentEntity.status}', expected 'captured'`,
      );
    }

    // 2. Validate currency
    const eventCurrency =
      paymentEntity?.currency || orderEntity?.currency || 'INR';
    if (eventCurrency !== order.currency) {
      throw new BadRequestException(
        `Currency mismatch: provider event currency '${eventCurrency}' does not match order currency '${order.currency}'`,
      );
    }

    // 3. Validate Amount (G1.5, G3.3): prevent underpayment, overpayment, or forged amounts
    const eventPaise = paymentEntity?.amount ?? orderEntity?.amount;
    if (eventPaise === undefined || eventPaise === null) {
      throw new BadRequestException('Webhook payload missing payment amount');
    }

    const expectedPaise = Math.round(Number(order.amount) * 100);
    if (Number(eventPaise) !== expectedPaise) {
      throw new BadRequestException(
        `Amount mismatch: provider sent ${eventPaise} paise, order expected ${expectedPaise} paise`,
      );
    }

    const schoolId = order.schoolId;
    let settledReceiptId: string | null = null;
    let settledTemplateVersionId: string | null = null;

    // 4. Execute atomic settlement inside Prisma transaction
    const txResult: WebhookProcessingResult = await this.prisma.$transaction(
      async (tx): Promise<WebhookProcessingResult> => {
        // A. Acquire row-level lock on online_payment_orders in deterministic order
        const [lockedOrder] = await tx.$queryRaw<any[]>`
          SELECT id, status, "providerPaymentId", "paymentId", metadata
          FROM online_payment_orders
          WHERE id = ${order.id}
          FOR UPDATE;
        `;

        if (!lockedOrder) {
          throw new NotFoundException(`Order ${order.id} not found under lock`);
        }

        // B. Durable Idempotency Check (G2.2, G2.5)
        if (lockedOrder.status === OnlinePaymentStatus.SUCCESS) {
          this.logger.log(
            `Duplicate webhook received for already settled order ${order.id}. Returning idempotent success.`,
          );
          return {
            status: 'already_settled',
            paymentId: lockedOrder.paymentId,
            orderId: order.id,
            isDuplicate: true,
          };
        }

        // C. Acquire row-level lock on target invoice
        await tx.$queryRaw`
          SELECT id FROM fee_invoices
          WHERE id = ${order.invoiceId} AND "schoolId" = ${schoolId}
          FOR UPDATE;
        `;

        // D. Load locked invoice with complete item, allocation, and fine history
        const invoice = await tx.feeInvoice.findUnique({
          where: { id: order.invoiceId },
          include: {
            items: { orderBy: { createdAt: 'asc' } },
            paymentAllocations: {
              include: {
                refundAllocations: {
                  include: { paymentRefund: true },
                },
              },
            },
            assessedFines: {
              include: {
                allocations: {
                  include: {
                    refundAllocations: {
                      include: { paymentRefund: true },
                    },
                  },
                },
                waivers: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        if (!invoice) {
          throw new NotFoundException(`Invoice ${order.invoiceId} not found`);
        }

        // Load student, academic year, and school metadata
        const student = await tx.student.findUnique({
          where: { schoolId_id: { schoolId, id: order.studentId } },
          include: { grade: true, section: true },
        });

        const academicYear = await tx.academicYear.findUnique({
          where: { schoolId_id: { schoolId, id: order.academicYearId } },
        });

        const school = await tx.school.findUnique({
          where: { id: schoolId },
          select: SAFE_SCHOOL_SELECT,
        });

        if (!student || !academicYear || !school) {
          throw new NotFoundException('Required billing entities not found');
        }

        // E. Authoritative Remaining Balance Recalculation inside transaction (G3.5)
        const invoiceItemBalances = new Map<string, Prisma.Decimal>();
        const assessedFineBalances = new Map<string, Prisma.Decimal>();

        for (const item of invoice.items) {
          let netPaid = new Prisma.Decimal(0);
          for (const alloc of invoice.paymentAllocations) {
            if (alloc.invoiceItemId === item.id) {
              if (alloc.allocationType === AllocationType.PRINCIPAL) {
                netPaid = netPaid.add(alloc.allocatedAmount);
                if (alloc.refundAllocations) {
                  for (const ra of alloc.refundAllocations) {
                    if (ra.paymentRefund.status === RefundStatus.SUCCEEDED) {
                      netPaid = netPaid.sub(ra.amount);
                    }
                  }
                }
              } else if (alloc.allocationType === AllocationType.REVERSAL) {
                netPaid = netPaid.sub(alloc.allocatedAmount);
              }
            }
          }
          const itemNet = new Prisma.Decimal(item.netAmount);
          const remaining = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            itemNet.sub(netPaid),
          );
          invoiceItemBalances.set(item.id, remaining);
        }

        for (const fine of invoice.assessedFines) {
          let netPaidFine = new Prisma.Decimal(0);
          for (const fineAlloc of fine.allocations) {
            if (fineAlloc.allocationType === AllocationType.FINE) {
              netPaidFine = netPaidFine.add(fineAlloc.allocatedAmount);
              if (fineAlloc.refundAllocations) {
                for (const ra of fineAlloc.refundAllocations) {
                  if (ra.paymentRefund.status === RefundStatus.SUCCEEDED) {
                    netPaidFine = netPaidFine.sub(ra.amount);
                  }
                }
              }
            } else if (fineAlloc.allocationType === AllocationType.REVERSAL) {
              netPaidFine = netPaidFine.sub(fineAlloc.allocatedAmount);
            }
          }

          let totalWaived = new Prisma.Decimal(0);
          for (const w of fine.waivers) {
            totalWaived = totalWaived.add(w.waivedAmount);
          }

          const fineAssessed = new Prisma.Decimal(fine.assessedAmount);
          const remainingFine = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            fineAssessed.sub(totalWaived).sub(netPaidFine),
          );
          assessedFineBalances.set(fine.id, remainingFine);
        }

        let totalRemainingPrincipal = new Prisma.Decimal(0);
        for (const rem of invoiceItemBalances.values()) {
          totalRemainingPrincipal = totalRemainingPrincipal.add(rem);
        }

        let totalRemainingFines = new Prisma.Decimal(0);
        for (const rem of assessedFineBalances.values()) {
          totalRemainingFines = totalRemainingFines.add(rem);
        }

        const authoritativeOutstanding = totalRemainingPrincipal.add(
          totalRemainingFines,
        );

        const orderAmount = new Prisma.Decimal(order.amount);

        // F. TOCTOU Race & Surplus Analysis (G3.6, G4.2)
        // Scenario 1: Invoice was ALREADY fully settled offline before webhook arrived
        if (authoritativeOutstanding.lessThanOrEqualTo(0)) {
          this.logger.warn(
            `TOCTOU Race Detected: Invoice ${invoice.id} was already fully settled offline before webhook arrived for order ${order.id}. Incoming payment of ₹${orderAmount.toFixed(2)} recorded as full surplus.`,
          );

          await tx.onlinePaymentOrder.update({
            where: { id: order.id },
            data: {
              status: OnlinePaymentStatus.SUCCESS,
              providerPaymentId: paymentId,
              providerSignature: signature,
              verifiedAt: new Date(),
              failureReason:
                'INVOICE_ALREADY_PAID_OFFLINE: Full payment received after invoice was settled offline. Surplus flagged for institutional reconciliation / advance credit.',
              metadata: {
                ...(typeof lockedOrder.metadata === 'object' && lockedOrder.metadata !== null
                  ? lockedOrder.metadata
                  : {}),
                settlementType: 'ZERO_ALLOCATION_FULL_SURPLUS',
                totalCaptured: Number(orderAmount),
                allocatedAmount: 0,
                surplusAmount: Number(orderAmount),
                surplusReason: 'INVOICE_ALREADY_PAID_OFFLINE',
                requiresManualReconciliation: true,
                settledAt: new Date().toISOString(),
                event,
              },
            },
          });

          return {
            status: 'settled_with_full_surplus',
            orderId: order.id,
            allocatedAmount: 0,
            surplusAmount: Number(orderAmount),
          };
        }

        // Scenario 2: Standard settlement or partial surplus (offline collection reduced balance)
        const allocatableAmount = Prisma.Decimal.min(
          orderAmount,
          authoritativeOutstanding,
        );
        const surplusAmount = orderAmount.sub(allocatableAmount);

        const plannedAllocations: Array<{
          invoiceId: string;
          invoiceItemId?: string;
          assessedFineId?: string;
          allocationType: AllocationType;
          amount: Prisma.Decimal;
          feeHeadNameSnapshot?: string;
        }> = [];

        let unallocatedFunds = allocatableAmount;

        // Pass 1: Extinguish invoice principal items (oldest first)
        for (const item of invoice.items) {
          if (unallocatedFunds.lessThanOrEqualTo(0)) break;
          const rem = invoiceItemBalances.get(item.id) || new Prisma.Decimal(0);
          if (rem.greaterThan(0)) {
            const take = Prisma.Decimal.min(unallocatedFunds, rem);
            invoiceItemBalances.set(item.id, rem.sub(take));
            plannedAllocations.push({
              invoiceId: invoice.id,
              invoiceItemId: item.id,
              allocationType: AllocationType.PRINCIPAL,
              amount: take,
              feeHeadNameSnapshot: item.feeHeadNameSnapshot,
            });
            unallocatedFunds = unallocatedFunds.sub(take);
          }
        }

        // Pass 2: Extinguish assessed fines on invoice
        if (unallocatedFunds.greaterThan(0)) {
          for (const fine of invoice.assessedFines) {
            if (unallocatedFunds.lessThanOrEqualTo(0)) break;
            const remFine =
              assessedFineBalances.get(fine.id) || new Prisma.Decimal(0);
            if (remFine.greaterThan(0)) {
              const take = Prisma.Decimal.min(unallocatedFunds, remFine);
              assessedFineBalances.set(fine.id, remFine.sub(take));
              plannedAllocations.push({
                invoiceId: invoice.id,
                assessedFineId: fine.id,
                allocationType: AllocationType.FINE,
                amount: take,
              });
              unallocatedFunds = unallocatedFunds.sub(take);
            }
          }
        }

        // G. Allocate Receipt Number using the exact same transaction client `tx` (G3.7, G3.8)
        const allocatedReceipt =
          await this.receiptSequenceService.allocateNextReceiptNumber({
            schoolId,
            academicYearId: order.academicYearId,
            tx,
          });

        const paymentNumber = `PAY-${allocatedReceipt.receiptNumber.replace(/^[A-Z]+-/, '')}`;

        // H. Create Payment Master Record
        const paymentNotes = surplusAmount.greaterThan(0)
          ? `Razorpay Payment Ref: ${paymentId}. Total received: ₹${orderAmount.toFixed(2)}. Allocated to invoice balance: ₹${allocatableAmount.toFixed(2)}. Unallocated surplus: ₹${surplusAmount.toFixed(2)} flagged for institutional reconciliation / advance credit.`
          : `Razorpay Online Payment Ref: ${paymentId}`;

        const payment = await tx.payment.create({
          data: {
            schoolId,
            studentId: order.studentId,
            academicYearId: order.academicYearId,
            paymentNumber,
            paymentDate: new Date(),
            amount: allocatableAmount,
            paymentMethod: PaymentMethod.ONLINE_RAZORPAY,
            referenceNumber: paymentId,
            notes: paymentNotes,
            status: PaymentStatus.COMPLETED,
            idempotencyKey: `rzp_pay_${paymentId}`,
            collectedByUserId: null, // System online settlement
          },
        });

        // I. Create Payment Allocations
        const createdAllocations: any[] = [];
        for (const alloc of plannedAllocations) {
          const created = await tx.paymentAllocation.create({
            data: {
              schoolId,
              paymentId: payment.id,
              invoiceId: alloc.invoiceId,
              invoiceItemId: alloc.invoiceItemId || null,
              assessedFineId: alloc.assessedFineId || null,
              allocationType: alloc.allocationType,
              allocatedAmount: alloc.amount,
            },
          });
          createdAllocations.push({
            ...created,
            feeHeadNameSnapshot: alloc.feeHeadNameSnapshot,
          });
        }

        // J. Create Immutable Receipt Snapshot
        const receiptSnapshot = {
          receiptNumber: allocatedReceipt.receiptNumber,
          sequenceNumber: allocatedReceipt.sequenceNumber,
          paymentNumber: payment.paymentNumber,
          paymentDate: payment.paymentDate,
          amount: Number(payment.amount),
          paymentMethod: payment.paymentMethod,
          referenceNumber: payment.referenceNumber,
          notes: payment.notes,
          school: {
            id: school.id,
            code: school.code,
            name: school.name,
            currency: school.currency,
            timezone: school.timezone,
            address: school.address,
            city: school.city,
            state: school.state,
          },
          student: {
            id: student.id,
            admissionNumber: student.admissionNumber,
            firstName: student.firstName,
            lastName: student.lastName,
            fullName: `${student.firstName} ${student.lastName}`,
            grade: student.grade?.name,
            section: student.section?.name,
          },
          academicYear: {
            id: academicYear.id,
            name: academicYear.name,
          },
          allocations: createdAllocations.map((a) => ({
            id: a.id,
            invoiceId: a.invoiceId,
            invoiceItemId: a.invoiceItemId,
            assessedFineId: a.assessedFineId,
            allocationType: a.allocationType,
            allocatedAmount: Number(a.allocatedAmount),
            feeHeadNameSnapshot: a.feeHeadNameSnapshot,
          })),
          collector: { id: 'SYSTEM_RAZORPAY', name: 'Razorpay Payment Gateway', role: 'ONLINE' },
          issuedAt: new Date().toISOString(),
        };

        const selectedTemplateVersionId = this.receiptArtifactService
          ? await this.receiptArtifactService.resolveActiveTemplateVersionId(
              tx,
              schoolId,
              (school as any).defaultReceiptTemplateId ?? null,
            )
          : await resolveActiveTemplateVersionForSchool(
              tx,
              schoolId,
              (school as any).defaultReceiptTemplateId ?? null,
            );

        const createdReceipt = await tx.receipt.create({
          data: {
            schoolId,
            paymentId: payment.id,
            receiptNumber: allocatedReceipt.receiptNumber,
            receiptSequence: allocatedReceipt.sequenceNumber,
            academicYearId: order.academicYearId,
            totalAmount: allocatableAmount,
            status: ReceiptStatus.ACTIVE,
            receiptSnapshot,
            ...(selectedTemplateVersionId
              ? { templateVersionId: selectedTemplateVersionId }
              : {}),
          },
          select: SAFE_RECEIPT_SELECT,
        });

        settledReceiptId = createdReceipt?.id ?? null;
        settledTemplateVersionId =
          (createdReceipt as any)?.templateVersionId ??
          selectedTemplateVersionId ??
          null;

        // K. Synchronize Assessed Fine Statuses
        for (const fine of invoice.assessedFines) {
          let netPaidFine = new Prisma.Decimal(0);
          for (const pastAlloc of fine.allocations) {
            if (pastAlloc.allocationType === AllocationType.FINE) {
              netPaidFine = netPaidFine.add(pastAlloc.allocatedAmount);
              if (pastAlloc.refundAllocations) {
                for (const ra of pastAlloc.refundAllocations) {
                  if (ra.paymentRefund.status === RefundStatus.SUCCEEDED) {
                    netPaidFine = netPaidFine.sub(ra.amount);
                  }
                }
              }
            } else if (pastAlloc.allocationType === AllocationType.REVERSAL) {
              netPaidFine = netPaidFine.sub(pastAlloc.allocatedAmount);
            }
          }
          for (const curAlloc of plannedAllocations) {
            if (
              curAlloc.assessedFineId === fine.id &&
              curAlloc.allocationType === AllocationType.FINE
            ) {
              netPaidFine = netPaidFine.add(curAlloc.amount);
            }
          }

          let totalWaived = new Prisma.Decimal(0);
          for (const w of fine.waivers) {
            totalWaived = totalWaived.add(w.waivedAmount);
          }

          const assessedAmount = new Prisma.Decimal(fine.assessedAmount);
          const netFineObligation = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            assessedAmount.sub(totalWaived),
          );
          const remainingFine = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            netFineObligation.sub(netPaidFine),
          );

          let newFineStatus: AssessedFineStatus;
          if (netFineObligation.equals(0)) {
            newFineStatus = AssessedFineStatus.WAIVED;
          } else if (remainingFine.equals(0)) {
            newFineStatus = AssessedFineStatus.PAID;
          } else if (netPaidFine.greaterThan(0)) {
            newFineStatus = AssessedFineStatus.PARTIALLY_PAID;
          } else {
            newFineStatus = AssessedFineStatus.OUTSTANDING;
          }

          if (newFineStatus !== fine.status) {
            await tx.assessedFine.update({
              where: { schoolId_id: { schoolId, id: fine.id } },
              data: { status: newFineStatus },
            });
          }
        }

        // L. Synchronize Invoice Status
        let totalPaidPrincipal = new Prisma.Decimal(0);
        for (const past of invoice.paymentAllocations) {
          if (past.allocationType === AllocationType.PRINCIPAL) {
            totalPaidPrincipal = totalPaidPrincipal.add(past.allocatedAmount);
            if (past.refundAllocations) {
              for (const ra of past.refundAllocations) {
                if (ra.paymentRefund.status === RefundStatus.SUCCEEDED) {
                  totalPaidPrincipal = totalPaidPrincipal.sub(ra.amount);
                }
              }
            }
          } else if (past.allocationType === AllocationType.REVERSAL) {
            totalPaidPrincipal = totalPaidPrincipal.sub(past.allocatedAmount);
          }
        }
        for (const current of plannedAllocations) {
          if (
            current.invoiceId === invoice.id &&
            current.allocationType === AllocationType.PRINCIPAL
          ) {
            totalPaidPrincipal = totalPaidPrincipal.add(current.amount);
          }
        }

        const invoiceNet = new Prisma.Decimal(invoice.netAmount);
        const finalRemainingPrincipal = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          invoiceNet.sub(totalPaidPrincipal),
        );

        let finalRemainingFines = new Prisma.Decimal(0);
        for (const fine of invoice.assessedFines) {
          let netPaidFine = new Prisma.Decimal(0);
          for (const pastAlloc of fine.allocations) {
            if (pastAlloc.allocationType === AllocationType.FINE) {
              netPaidFine = netPaidFine.add(pastAlloc.allocatedAmount);
              if (pastAlloc.refundAllocations) {
                for (const ra of pastAlloc.refundAllocations) {
                  if (ra.paymentRefund.status === RefundStatus.SUCCEEDED) {
                    netPaidFine = netPaidFine.sub(ra.amount);
                  }
                }
              }
            } else if (pastAlloc.allocationType === AllocationType.REVERSAL) {
              netPaidFine = netPaidFine.sub(pastAlloc.allocatedAmount);
            }
          }
          for (const curAlloc of plannedAllocations) {
            if (
              curAlloc.assessedFineId === fine.id &&
              curAlloc.allocationType === AllocationType.FINE
            ) {
              netPaidFine = netPaidFine.add(curAlloc.amount);
            }
          }
          let totalWaived = new Prisma.Decimal(0);
          for (const w of fine.waivers) {
            totalWaived = totalWaived.add(w.waivedAmount);
          }
          const fineAssessed = new Prisma.Decimal(fine.assessedAmount);
          const remFine = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            fineAssessed.sub(totalWaived).sub(netPaidFine),
          );
          finalRemainingFines = finalRemainingFines.add(remFine);
        }

        const finalTotalObligation = finalRemainingPrincipal.add(
          finalRemainingFines,
        );

        let newInvoiceStatus: InvoiceStatus;
        if (finalTotalObligation.equals(0)) {
          newInvoiceStatus = InvoiceStatus.PAID;
        } else {
          newInvoiceStatus = InvoiceStatus.PARTIALLY_PAID;
        }

        await tx.feeInvoice.update({
          where: { id: invoice.id },
          data: { status: newInvoiceStatus },
        });

        // M. Update OnlinePaymentOrder to SUCCESS
        await tx.onlinePaymentOrder.update({
          where: { id: order.id },
          data: {
            status: OnlinePaymentStatus.SUCCESS,
            providerPaymentId: paymentId,
            providerSignature: signature,
            paymentId: payment.id,
            verifiedAt: new Date(),
            failureReason: surplusAmount.greaterThan(0)
              ? `PARTIAL_SETTLEMENT_WITH_SURPLUS: Allocated ₹${allocatableAmount.toFixed(2)}, surplus ₹${surplusAmount.toFixed(2)} flagged for reconciliation.`
              : null,
            metadata: {
              ...(typeof lockedOrder.metadata === 'object' && lockedOrder.metadata !== null
                ? lockedOrder.metadata
                : {}),
              settlementType: surplusAmount.greaterThan(0)
                ? 'PARTIAL_SETTLEMENT_WITH_SURPLUS'
                : 'FULL_SETTLEMENT',
              totalCaptured: Number(orderAmount),
              allocatedAmount: Number(allocatableAmount),
              surplusAmount: Number(surplusAmount),
              paymentNumber,
              receiptNumber: allocatedReceipt.receiptNumber,
              requiresManualReconciliation: surplusAmount.greaterThan(0),
              recoveredFromExpired: order.status === OnlinePaymentStatus.EXPIRED,
              settledAt: new Date().toISOString(),
              event,
            },
          },
        });

        this.logger.log(
          `Online payment order ${order.id} settled successfully: Payment ${payment.paymentNumber}, Receipt ${allocatedReceipt.receiptNumber}, Allocated ₹${allocatableAmount.toFixed(2)}${surplusAmount.greaterThan(0) ? `, Surplus ₹${surplusAmount.toFixed(2)}` : ''}.`,
        );

        return {
          status: surplusAmount.greaterThan(0)
            ? 'settled_with_surplus'
            : 'success',
          paymentId: payment.id,
          orderId: order.id,
          receiptNumber: allocatedReceipt.receiptNumber,
          allocatedAmount: Number(allocatableAmount),
          surplusAmount: Number(surplusAmount),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );

    if (settledReceiptId && settledTemplateVersionId && this.receiptArtifactService) {
      try {
        await this.receiptArtifactService.ensureArtifactForReceipt(
          schoolId,
          settledReceiptId,
        );
      } catch {
        // Never allow post-commit PDF conversion errors to fail or roll back a settled online payment
      }
    }

    return txResult;
  }
}
