import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  AllocationType,
  GatewayEnvironment,
  GatewayStatus,
  InvoiceStatus,
  OnlinePaymentStatus,
  Prisma,
  RefundStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolPaymentGatewayConfigService } from '../schools/school-payment-gateway-config.service';
import { CreateOnlinePaymentOrderDto } from './dto/create-online-payment-order.dto';
import { OnlinePaymentOrderResponseDto } from './dto/online-payment-order-response.dto';
import {
  QueueStatusFilter,
  ReconciliationQueueQueryDto,
} from './dto/reconciliation-queue-query.dto';
import { SAFE_RECEIPT_SELECT } from './payments.service';
import {
  ResolveOnlineSurplusDto,
  SurplusResolutionAction,
} from './dto/resolve-online-surplus.dto';
import { BILLING_MONTH_NAMES } from '../fee-generation/fee-generation.service';
import { validateRazorpayKeyEnvironment } from './razorpay-mode.validator';

/**
 * Maximum operational validity window for replaying an active payment order attempt (2 hours).
 * Orders older than 2 hours are transitioned to EXPIRED to prevent reviving stale checkout sessions.
 */
export const ONLINE_ORDER_REPLAY_VALIDITY_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger(OnlinePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayConfigService: SchoolPaymentGatewayConfigService,
  ) {}

  /**
   * Creates a Razorpay TEST-mode order for an authorized student invoice.
   *
   * Enforces:
   * 1. Authentication and strict payer authorization (Student linked / Parent verified).
   * 2. Tenant isolation derived from database records.
   * 3. Server-side authoritative outstanding balance recalculation.
   * 4. Idempotency preservation with race-condition handling.
   * 5. Active, verified school gateway credentials in TEST mode only.
   */
  async createOnlineOrder(
    requestSchoolId: string | undefined,
    user: any,
    dto: CreateOnlinePaymentOrderDto,
    idempotencyKey: string,
  ): Promise<OnlinePaymentOrderResponseDto> {
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (!dto.invoiceId) {
      throw new BadRequestException('Invoice ID is required');
    }

    // 1. Fetch invoice with complete item, allocation, fine and relation history
    const invoice: any = await this.prisma.feeInvoice.findUnique({
      where: { id: dto.invoiceId },
      include: {
        school: true,
        student: {
          include: {
            userAccount: true,
          },
        },
        items: {
          include: {
            paymentAllocations: {
              include: {
                refundAllocations: {
                  include: {
                    paymentRefund: true,
                  },
                },
              },
            },
          },
        },
        assessedFines: {
          include: {
            allocations: {
              include: {
                refundAllocations: {
                  include: {
                    paymentRefund: true,
                  },
                },
              },
            },
            waivers: true,
          },
        },
        paymentAllocations: {
          include: {
            refundAllocations: {
              include: {
                paymentRefund: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // 2. Strict Tenant Verification
    // If request context specified a school, it MUST match the invoice's school.
    if (requestSchoolId && invoice.schoolId !== requestSchoolId) {
      // Do not reveal invoice existence across tenants
      throw new NotFoundException('Invoice not found');
    }

    // If user belongs to a specific school (non-super-admin), it MUST match the invoice's school.
    if (user.schoolId && invoice.schoolId !== user.schoolId) {
      throw new NotFoundException('Invoice not found');
    }

    // 3. Payer Authorization Check
    // Administrative roles (Admin, Staff) do NOT get payment privileges simply because they can administer schools.
    // Online payments must be initiated by the enrolled student or verified parent.
    await this.assertPayerAuthorization(user, invoice);

    // 4. Validate Invoice Status
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already fully paid');
    }
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Invoice is VOID and cannot receive payments');
    }

    // 5. Authoritative Server-Side Outstanding Balance Recalculation
    const totalOutstanding = this.calculateAuthoritativeBalance(invoice);
    if (totalOutstanding.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Invoice has already been fully paid or has zero balance',
      );
    }

    // 6. Requested Amount Determination & Validation
    let effectiveAmount: Prisma.Decimal;
    if (dto.amount !== undefined) {
      const requested = new Prisma.Decimal(dto.amount).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (requested.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
      // Razorpay requires a minimum amount of 100 paise (₹1.00)
      if (requested.lessThan(new Prisma.Decimal(1))) {
        throw new BadRequestException('Minimum online payment amount is ₹1.00');
      }
      if (requested.greaterThan(totalOutstanding)) {
        throw new BadRequestException(
          `Requested payment amount (₹${requested.toFixed(2)}) exceeds outstanding invoice balance (₹${totalOutstanding.toFixed(2)})`,
        );
      }
      effectiveAmount = requested;
    } else {
      effectiveAmount = totalOutstanding;
    }

    // 7. Gateway Configuration Retrieval & Validation
    const credentials =
      await this.gatewayConfigService.decryptCredentialsForInternalUse(
        invoice.schoolId,
      );

    validateRazorpayKeyEnvironment(credentials.environment, credentials.keyId);

    // 8. Idempotency Check
    const existingOrder = await this.prisma.onlinePaymentOrder.findUnique({
      where: {
        schoolId_idempotencyKey: {
          schoolId: invoice.schoolId,
          idempotencyKey,
        },
      },
    });

    if (existingOrder) {
      // Ensure the key wasn't reused with different payment parameters
      if (
        existingOrder.invoiceId !== invoice.id ||
        !existingOrder.amount.equals(effectiveAmount)
      ) {
        throw new ConflictException(
          `Idempotency key '${idempotencyKey}' was already used with a different invoice or amount.`,
        );
      }

      // Check expiration of previous active or attempted order attempt
      const orderAgeMs =
        Date.now() - new Date(existingOrder.createdAt).getTime();
      if (orderAgeMs > ONLINE_ORDER_REPLAY_VALIDITY_MS) {
        try {
          await this.prisma.onlinePaymentOrder.update({
            where: { id: existingOrder.id },
            data: { status: OnlinePaymentStatus.EXPIRED },
          });
        } catch {
          // Non-blocking status transition failure
        }
        throw new BadRequestException(
          'Payment attempt has expired (attempt validity window is 2 hours). Please initiate a fresh payment attempt with a new idempotency key.',
        );
      }

      // If already active or attempted, safely return the existing order details (replay)
      if (
        existingOrder.status === OnlinePaymentStatus.CREATED ||
        existingOrder.status === OnlinePaymentStatus.ATTEMPTED
      ) {
        return this.formatOrderResponse(
          existingOrder,
          credentials.keyId,
          invoice,
          effectiveAmount,
          idempotencyKey,
        );
      }

      if (existingOrder.status === OnlinePaymentStatus.SUCCESS) {
        throw new BadRequestException(
          'This payment attempt has already succeeded.',
        );
      }

      throw new BadRequestException(
        `This payment attempt has previously reached state ${existingOrder.status}. Please initiate a new payment attempt.`,
      );
    }

    // 9. Create Provider Order via Razorpay API (TEST Mode)
    const amountInPaise = Math.round(
      effectiveAmount.mul(100).toNumber(),
    );

    // Razorpay receipt maximum length is 40 characters
    const cleanIdemp = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanInv = invoice.id.replace(/-/g, '');
    const receipt = `ord_${cleanInv.substring(0, 8)}_${cleanIdemp.substring(0, 20)}`.substring(0, 40);

    const rzpOrder = await this.executeRazorpayCreateOrder(
      credentials.keyId,
      credentials.keySecret,
      {
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: {
          schoolId: invoice.schoolId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          academicYearId: invoice.academicYearId,
          idempotencyKey,
        },
      },
    );

    // 10. Persist Local OnlinePaymentOrder Record
    let savedOrder: any;
    try {
      savedOrder = await this.prisma.onlinePaymentOrder.create({
        data: {
          schoolId: invoice.schoolId,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          academicYearId: invoice.academicYearId,
          providerOrderId: rzpOrder.id,
          idempotencyKey,
          amount: effectiveAmount,
          currency: 'INR',
          status: OnlinePaymentStatus.CREATED,
          metadata: {
            receipt: rzpOrder.receipt,
            notes: rzpOrder.notes,
            studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
            admissionNumber: invoice.student.admissionNumber,
            schoolName: invoice.school.name,
          },
        },
      });
    } catch (dbErr: any) {
      if (dbErr.code === 'P2002') {
        // Race condition: another concurrent thread created an order with the same idempotencyKey
        const raceWinner = await this.prisma.onlinePaymentOrder.findUnique({
          where: {
            schoolId_idempotencyKey: {
              schoolId: invoice.schoolId,
              idempotencyKey,
            },
          },
        });
        if (raceWinner) {
          savedOrder = raceWinner;
        } else {
          throw dbErr;
        }
      } else {
        const correlationId = crypto.randomUUID();
        // Safe Recovery Logging: Razorpay order was created at provider, but DB persistence failed
        this.logger.error(
          `CRITICAL [Ref: ${correlationId}]: Razorpay order created (${rzpOrder.id}) but local database persistence failed for school ${invoice.schoolId}, invoice ${invoice.id}, idempotencyKey ${idempotencyKey}: ${dbErr.message}`,
        );
        throw new InternalServerErrorException(
          `An unexpected error occurred while recording your payment attempt. Please contact school administration with reference code: ${correlationId}`,
        );
      }
    }

    this.logger.log(
      `Online payment order ${savedOrder.id} (${savedOrder.providerOrderId}) created for invoice ${invoice.id}, amount ₹${effectiveAmount.toFixed(2)}.`,
    );

    return this.formatOrderResponse(
      savedOrder,
      credentials.keyId,
      invoice,
      effectiveAmount,
      idempotencyKey,
    );
  }

  /**
   * Verifies that the authenticated user is authorized to pay for the given invoice.
   * Rejects administrative roles unless explicitly linked to the student profile.
   */
  private async assertPayerAuthorization(user: any, invoice: any): Promise<void> {
    if (user.role === UserRole.STUDENT) {
      if (invoice.student.userId !== user.id) {
        throw new ForbiddenException(
          'Access denied: You are not authorized to pay invoices for another student.',
        );
      }
      return;
    }

    if (user.role === UserRole.PARENT) {
      const relation = await this.prisma.parentStudentRelation.findFirst({
        where: {
          schoolId: invoice.schoolId,
          parentId: user.id,
          studentId: invoice.studentId,
          isVerified: true,
        },
      });

      if (!relation) {
        throw new ForbiddenException(
          'Access denied: You are not authorized to pay invoices for this student.',
        );
      }
      return;
    }

    // Role is PLATFORM_SUPER_ADMIN, SCHOOL_ADMIN, or FEE_STAFF
    // Per requirement 5: Admin & Fee Staff must not gain payment privileges merely because of admin rights.
    // Check if the user is linked as the student or verified parent
    if (invoice.student.userId === user.id) {
      return;
    }

    const parentCheck = await this.prisma.parentStudentRelation.findFirst({
      where: {
        schoolId: invoice.schoolId,
        parentId: user.id,
        studentId: invoice.studentId,
        isVerified: true,
      },
    });

    if (parentCheck) {
      return;
    }

    throw new ForbiddenException(
      'Access denied: Administrative roles cannot initiate online student fee payments. Payments must be initiated by an authorized student or verified parent.',
    );
  }

  /**
   * Authoritative balance calculation matching PaymentsService financial ledger rules.
   */
  public calculateAuthoritativeBalance(invoice: any): Prisma.Decimal {
    let totalRemainingPrincipal = new Prisma.Decimal(0);

    for (const item of invoice.items) {
      let netPaid = new Prisma.Decimal(0);
      for (const alloc of item.paymentAllocations) {
        if (alloc.allocationType === AllocationType.PRINCIPAL) {
          netPaid = netPaid.add(alloc.allocatedAmount);
          if (alloc.refundAllocations) {
            for (const ra of alloc.refundAllocations) {
              if (ra.paymentRefund?.status === RefundStatus.SUCCEEDED) {
                netPaid = netPaid.sub(ra.amount);
              }
            }
          }
        } else if (alloc.allocationType === AllocationType.REVERSAL) {
          netPaid = netPaid.sub(alloc.allocatedAmount);
        }
      }
      const itemNet = new Prisma.Decimal(item.netAmount);
      const remaining = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        itemNet.sub(netPaid),
      );
      totalRemainingPrincipal = totalRemainingPrincipal.add(remaining);
    }

    let totalRemainingFines = new Prisma.Decimal(0);

    for (const fine of invoice.assessedFines) {
      let netPaidFine = new Prisma.Decimal(0);
      for (const fineAlloc of fine.allocations) {
        if (fineAlloc.allocationType === AllocationType.FINE) {
          netPaidFine = netPaidFine.add(fineAlloc.allocatedAmount);
          if (fineAlloc.refundAllocations) {
            for (const ra of fineAlloc.refundAllocations) {
              if (ra.paymentRefund?.status === RefundStatus.SUCCEEDED) {
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
      totalRemainingFines = totalRemainingFines.add(remainingFine);
    }

    return totalRemainingPrincipal
      .add(totalRemainingFines)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  /**
   * Calls Razorpay API to create an order in TEST mode.
   * Isolated for mockability in tests.
   */
  protected async executeRazorpayCreateOrder(
    keyId: string,
    keySecret: string,
    payload: {
      amount: number;
      currency: string;
      receipt: string;
      notes: Record<string, string>;
    },
  ): Promise<{ id: string; amount: number; currency: string; receipt: string; notes: any }> {
    const endpoint = 'https://api.razorpay.com/v1/orders';
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          'User-Agent': 'SchoolFeeManagementSaaS/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseData: any = await response.json().catch(() => null);

      if (response.status === 200 || response.status === 201) {
        if (!responseData?.id) {
          throw new BadGatewayException(
            'Malformed response received from Razorpay order API.',
          );
        }
        return responseData;
      }

      if (response.status === 401) {
        throw new BadGatewayException(
          'Payment gateway authentication failed. Please verify school Razorpay credentials.',
        );
      }

      const errMsg =
        responseData?.error?.description ||
        `Razorpay API returned HTTP ${response.status}`;
      throw new BadGatewayException(`Payment provider order creation failed: ${errMsg}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new GatewayTimeoutException(
          'Connection to payment gateway timed out. Please check order status before retrying.',
        );
      }
      if (err instanceof BadGatewayException || err instanceof GatewayTimeoutException) {
        throw err;
      }
      throw new BadGatewayException(
        `Unable to reach payment provider: ${err.message || 'Network error'}`,
      );
    }
  }

  /**
   * Formats sanitized response DTO for client consumption.
   */
  private formatOrderResponse(
    order: any,
    keyId: string,
    invoice: any,
    effectiveAmount: Prisma.Decimal,
    idempotencyKey: string,
  ): OnlinePaymentOrderResponseDto {
    const amountInPaise = Math.round(
      effectiveAmount.mul(100).toNumber(),
    );

    return {
      orderId: order.providerOrderId,
      keyId,
      amount: Number(effectiveAmount.toFixed(2)),
      amountInPaise,
      currency: 'INR',
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      schoolName: invoice.school?.name || 'School Fee Payment',
      studentName: `${invoice.student.firstName} ${invoice.student.lastName}`.trim(),
      studentEmail: invoice.student.guardianEmail || invoice.student.user?.email || undefined,
      studentPhone: invoice.student.guardianPhone || undefined,
      idempotencyKey,
      status: order.status,
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Retrieves tenant-scoped online payment orders with surplus awaiting reconciliation.
   */
  async getReconciliationQueue(
    schoolId: string,
    user: any,
    query: ReconciliationQueueQueryDto,
  ) {
    if (
      user.role !== UserRole.PLATFORM_SUPER_ADMIN &&
      user.role !== UserRole.SCHOOL_ADMIN
    ) {
      throw new ForbiddenException(
        'Only School Administrators can access the reconciliation queue',
      );
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const allOrders = await this.prisma.onlinePaymentOrder.findMany({
      where: {
        schoolId,
        status: OnlinePaymentStatus.SUCCESS,
      },
      include: {
        student: { include: { grade: true, section: true } },
        invoice: true,
        payment: { include: { receipt: { select: SAFE_RECEIPT_SELECT } } },
      },
      orderBy: { verifiedAt: 'desc' },
    });

    const filtered = allOrders.filter((order) => {
      const meta: any =
        typeof order.metadata === 'object' && order.metadata !== null
          ? order.metadata
          : {};
      const surplus = Number(meta.surplusAmount || 0);
      if (surplus <= 0) return false;

      const isUnresolved =
        meta.requiresManualReconciliation === true ||
        meta.reconciliationStatus === 'PENDING_RECONCILIATION';
      const isResolved = meta.reconciliationStatus === 'RESOLVED';

      if (query.status === QueueStatusFilter.PENDING) {
        return isUnresolved;
      }
      if (query.status === QueueStatusFilter.RESOLVED) {
        return isResolved;
      }
      return true;
    });

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      data: paginated.map((order) => {
        const meta: any =
          typeof order.metadata === 'object' && order.metadata !== null
            ? order.metadata
            : {};
        const isUnresolved =
          meta.requiresManualReconciliation === true ||
          meta.reconciliationStatus === 'PENDING_RECONCILIATION';

        return {
          orderId: order.id,
          providerOrderId: order.providerOrderId,
          providerPaymentId: order.providerPaymentId,
          paymentNumber:
            order.payment?.paymentNumber || meta.paymentNumber || null,
          receiptNumber:
            order.payment?.receipt?.receiptNumber || meta.receiptNumber || null,
          capturedAmount: Number(order.amount),
          allocatedAmount: Number(
            order.payment?.amount || meta.allocatedAmount || 0,
          ),
          surplusAmount: Number(meta.surplusAmount || 0),
          settlementType: meta.settlementType || 'FULL_SETTLEMENT',
          reconciliationStatus:
            meta.reconciliationStatus ||
            (isUnresolved ? 'PENDING_RECONCILIATION' : 'RESOLVED'),
          reconciliationReason:
            meta.surplusReason ||
            order.failureReason ||
            'SURPLUS_REQUIRES_RECONCILIATION',
          verifiedAt: order.verifiedAt,
          student: {
            id: order.student.id,
            admissionNumber: order.student.admissionNumber,
            name: `${order.student.firstName} ${order.student.lastName || ''}`.trim(),
            grade: order.student.grade?.name,
            section: order.student.section?.name,
          },
          invoice: {
            id: order.invoice.id,
            billingMonth: order.invoice.billingMonth,
            monthName:
              BILLING_MONTH_NAMES[order.invoice.billingMonth - 1] ||
              `Month ${order.invoice.billingMonth}`,
            status: order.invoice.status,
            netAmount: Number(order.invoice.netAmount),
          },
          resolution:
            meta.reconciliationStatus === 'RESOLVED'
              ? {
                  action: meta.resolutionAction,
                  notes: meta.resolutionNotes,
                  externalRef: meta.resolutionExternalRef || null,
                  resolvedBy:
                    meta.resolvedByUserName || meta.resolvedByUserId,
                  resolvedAt: meta.resolvedAt,
                }
              : null,
        };
      }),
    };
  }

  /**
   * Authoritative resolution action for an unallocated surplus order.
   * Records immutable audit details without creating spendable ghost balances.
   */
  async resolveSurplusOrder(
    schoolId: string,
    user: any,
    orderId: string,
    dto: ResolveOnlineSurplusDto,
  ) {
    if (
      user.role !== UserRole.PLATFORM_SUPER_ADMIN &&
      user.role !== UserRole.SCHOOL_ADMIN
    ) {
      throw new ForbiddenException(
        'Only School Administrators can resolve online payment surplus',
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      // Pessimistic lock on online_payment_orders row
      const [lockedOrder] = await tx.$queryRaw<any[]>`
        SELECT id, "schoolId", status, amount, metadata
        FROM online_payment_orders
        WHERE id = ${orderId}
        FOR UPDATE;
      `;

      if (!lockedOrder) {
        throw new NotFoundException(`Online payment order ${orderId} not found`);
      }

      if (lockedOrder.schoolId !== schoolId) {
        // Strict tenant isolation: do not reveal existence across tenants
        throw new NotFoundException(`Online payment order ${orderId} not found`);
      }

      if (lockedOrder.status !== OnlinePaymentStatus.SUCCESS) {
        throw new BadRequestException(
          'Only successfully captured online payment orders can be reconciled',
        );
      }

      const meta: any =
        typeof lockedOrder.metadata === 'object' && lockedOrder.metadata !== null
          ? lockedOrder.metadata
          : {};
      const surplus = Number(meta.surplusAmount || 0);
      if (surplus <= 0) {
        throw new BadRequestException(
          'This online payment order has no surplus funds requiring reconciliation',
        );
      }

      if (meta.reconciliationStatus === 'RESOLVED') {
        throw new ConflictException(
          `This surplus payment of ₹${surplus.toFixed(2)} has already been reconciled with action '${meta.resolutionAction}'.`,
        );
      }

      const isRefundAction =
        dto.action === SurplusResolutionAction.OFFLINE_REFUND_PROCESSED ||
        dto.action === SurplusResolutionAction.EXTERNAL_GATEWAY_REFUND_PROCESSED;
      const trimmedRef = dto.externalReferenceNumber?.trim();

      if (isRefundAction && !trimmedRef) {
        throw new BadRequestException(
          `An external reference number (e.g. bank UTR, cheque reference, or verified gateway refund ID) is required for refund action '${dto.action}'.`,
        );
      }

      const updatedMetadata = {
        ...meta,
        reconciliationStatus: 'RESOLVED',
        resolutionAction: dto.action,
        resolutionNotes: dto.notes.trim(),
        resolutionExternalRef: trimmedRef || null,
        resolvedByUserId: user.id,
        resolvedByUserName: user.name || user.email || 'School Administrator',
        resolvedAt: new Date().toISOString(),
        requiresManualReconciliation: false,
      };

      const updatedOrder = await tx.onlinePaymentOrder.update({
        where: { id: orderId },
        data: {
          metadata: updatedMetadata,
        },
        include: {
          student: true,
          invoice: true,
          payment: true,
        },
      });

      this.logger.log(
        `Online payment order ${orderId} surplus of ₹${surplus.toFixed(2)} reconciled by ${user.id} (${dto.action}).`,
      );

      return {
        success: true,
        orderId: updatedOrder.id,
        surplusAmount: surplus,
        resolutionAction: dto.action,
        reconciliationStatus: 'RESOLVED',
        resolvedAt: updatedMetadata.resolvedAt,
        resolvedBy: updatedMetadata.resolvedByUserName,
        notes: dto.notes.trim(),
        externalReferenceNumber: dto.externalReferenceNumber?.trim() || null,
      };
    });
  }
}
