import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AllocationType,
  AssessedFineStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceiptStatus,
  RefundStatus,
  ReversalType,
  UserRole,
} from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptSequenceService } from './receipt-sequence.service';
import { ReversalSequenceService } from './reversal-sequence.service';
import { FeeGenerationService } from '../fee-generation/fee-generation.service';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import {
  CreatePaymentRefundDto,
  UpdateRefundStatusDto,
} from './dto/create-payment-refund.dto';

function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

export function computeCanonicalRequestHash(data: any): string {
  // Strip idempotencyKey itself so header vs body doesn't alter the payload hash
  const { idempotencyKey, ...payload } = data;
  const canonicalJson = JSON.stringify(sortObjectKeys(payload));
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

export interface PlannedAllocation {
  invoiceId: string;
  invoiceItemId?: string | null;
  assessedFineId?: string | null;
  allocationType: AllocationType;
  amount: Prisma.Decimal;
  feeHeadNameSnapshot?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptSequenceService: ReceiptSequenceService,
    private readonly reversalSequenceService: ReversalSequenceService,
    private readonly feeGenerationService: FeeGenerationService,
    private readonly outboxService: NotificationOutboxService,
  ) {}

  /**
   * Verifies that the user has permission to collect payments.
   * Only PLATFORM_SUPER_ADMIN, SCHOOL_ADMIN, and FEE_STAFF are permitted.
   */
  public assertCollectorRole(user: any) {
    if (!user) {
      throw new ForbiddenException('Authentication required to collect payments');
    }
    if (user.role === UserRole.STUDENT || user.role === UserRole.PARENT) {
      throw new ForbiddenException(
        'Access denied: Students and parents are not permitted to collect fee payments',
      );
    }
    if (
      user.role !== UserRole.PLATFORM_SUPER_ADMIN &&
      user.role !== UserRole.SCHOOL_ADMIN &&
      user.role !== UserRole.FEE_STAFF
    ) {
      throw new ForbiddenException('Access denied: Unauthorized role for payment collection');
    }
  }

  /**
   * Verifies that the user has permission to execute payment reversals.
   * Only PLATFORM_SUPER_ADMIN and SCHOOL_ADMIN are permitted.
   * FEE_STAFF, STUDENT, and PARENT are strictly forbidden.
   */
  public assertReversalRole(user: any) {
    if (!user) {
      throw new ForbiddenException('Authentication required to reverse payments');
    }
    if (user.role === UserRole.STUDENT || user.role === UserRole.PARENT) {
      throw new ForbiddenException(
        'Access denied: Students and parents cannot execute payment reversals',
      );
    }
    if (user.role === UserRole.FEE_STAFF) {
      throw new ForbiddenException(
        'Access denied: Fee staff cannot execute payment reversals. School admin authorization is required.',
      );
    }
    if (
      user.role !== UserRole.PLATFORM_SUPER_ADMIN &&
      user.role !== UserRole.SCHOOL_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Unauthorized role for payment reversal');
    }
  }

  /**
   * Verifies that the user has permission to execute payment refunds.
   * Only PLATFORM_SUPER_ADMIN and SCHOOL_ADMIN are permitted.
   * FEE_STAFF, STUDENT, and PARENT are strictly forbidden.
   */
  public assertRefundRole(user: any) {
    if (!user) {
      throw new ForbiddenException('Authentication required to process refunds');
    }
    if (user.role === UserRole.STUDENT || user.role === UserRole.PARENT) {
      throw new ForbiddenException(
        'Access denied: Students and parents cannot execute payment refunds',
      );
    }
    if (user.role === UserRole.FEE_STAFF) {
      throw new ForbiddenException(
        'Access denied: Fee staff cannot execute payment refunds. School admin authorization is required.',
      );
    }
    if (
      user.role !== UserRole.PLATFORM_SUPER_ADMIN &&
      user.role !== UserRole.SCHOOL_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Unauthorized role for payment refund');
    }
  }

  /**
   * Main transactional collection entry point.
   */
  async collectPayment(
    schoolId: string,
    user: any,
    dto: CollectPaymentDto,
    headerIdempotencyKey?: string,
  ) {
    // 1. Authorize collector role
    this.assertCollectorRole(user);

    // 1b. Reject Cheque payment method pending clearance workflow implementation
    if (dto.paymentMethod === PaymentMethod.CHEQUE) {
      throw new BadRequestException(
        'Cheque payments are temporarily disabled pending clearance and dishonor workflow implementation',
      );
    }

    // 2. Resolve idempotency key and request hash
    const effectiveIdempotencyKey = (
      headerIdempotencyKey ||
      dto.idempotencyKey ||
      ''
    ).trim() || null;

    const requestHash = effectiveIdempotencyKey
      ? computeCanonicalRequestHash(dto)
      : null;

    // 3. Check for existing idempotent transaction prior to initiating writes
    if (effectiveIdempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: {
          schoolId_idempotencyKey: {
            schoolId,
            idempotencyKey: effectiveIdempotencyKey,
          },
        },
        include: {
          allocations: true,
          receipt: true,
        },
      });

      if (existing) {
        if (existing.requestHash === requestHash) {
          return {
            payment: existing,
            receipt: existing.receipt,
            allocations: existing.allocations,
            isIdempotentReplay: true,
          };
        } else {
          throw new ConflictException(
            `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
          );
        }
      }
    }

    // 4. Validate payment amount
    const paymentAmount = new Prisma.Decimal(dto.amount).toDecimalPlaces(
      2,
      Prisma.Decimal.ROUND_HALF_UP,
    );
    if (paymentAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    try {
      // 5. Execute complete collection inside a single Prisma interactive transaction
      return await this.prisma.$transaction(
        async (tx) => {
          // Early in-transaction check: return existing replay if already committed
          if (effectiveIdempotencyKey) {
            const earlyExisting = await tx.payment.findUnique({
              where: {
                schoolId_idempotencyKey: {
                  schoolId,
                  idempotencyKey: effectiveIdempotencyKey,
                },
              },
              include: {
                allocations: true,
                receipt: true,
              },
            });

            if (earlyExisting) {
              if (earlyExisting.requestHash === requestHash) {
                return {
                  payment: earlyExisting,
                  receipt: earlyExisting.receipt,
                  allocations: earlyExisting.allocations,
                  isIdempotentReplay: true,
                };
              } else {
                throw new ConflictException(
                  `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
                );
              }
            }
          }

          // A. Verify Student in school
          const student = await tx.student.findUnique({
            where: { schoolId_id: { schoolId, id: dto.studentId } },
            include: { grade: true, section: true },
          });
          if (!student) {
            throw new NotFoundException(`Student ${dto.studentId} not found in this school`);
          }

          // B. Verify Academic Year in school
          const academicYear = await tx.academicYear.findUnique({
            where: { schoolId_id: { schoolId, id: dto.academicYearId } },
          });
          if (!academicYear) {
            throw new NotFoundException(
              `Academic year ${dto.academicYearId} not found in this school`,
            );
          }

          // C. Fetch School metadata for receipt snapshot
          const school = await tx.school.findUnique({
            where: { id: schoolId },
          });
          if (!school) {
            throw new NotFoundException(`School ${schoolId} not found`);
          }

          // D. Determine target invoices to lock
          let targetInvoiceIds: string[] = [];
          if (dto.allocations && dto.allocations.length > 0) {
            targetInvoiceIds = Array.from(new Set(dto.allocations.map((a) => a.invoiceId)));
          } else {
            // Default auto-allocation path: find all non-VOID invoices that are either not PAID
            // OR have outstanding/partially paid assessed fines
            const candidateInvoices = await tx.feeInvoice.findMany({
              where: {
                schoolId,
                studentId: dto.studentId,
                academicYearId: dto.academicYearId,
                status: { not: InvoiceStatus.VOID },
                OR: [
                  { status: { not: InvoiceStatus.PAID } },
                  {
                    assessedFines: {
                      some: {
                        status: {
                          in: [
                            AssessedFineStatus.OUTSTANDING,
                            AssessedFineStatus.PARTIALLY_PAID,
                          ],
                        },
                      },
                    },
                  },
                ],
              },
              select: { id: true, billingMonth: true, dueDate: true },
              orderBy: [{ billingMonth: 'asc' }, { dueDate: 'asc' }],
            });
            targetInvoiceIds = candidateInvoices.map((i) => i.id);
          }

          if (targetInvoiceIds.length === 0) {
            // Re-check for an existing payment under the same school and idempotency key before throwing.
            // Under concurrent execution, an earlier request with the same key may have just committed
            // and paid off all invoices, leaving candidateInvoices empty for this retry.
            if (effectiveIdempotencyKey) {
              const replayPayment = await tx.payment.findUnique({
                where: {
                  schoolId_idempotencyKey: {
                    schoolId,
                    idempotencyKey: effectiveIdempotencyKey,
                  },
                },
                include: {
                  allocations: true,
                  receipt: true,
                },
              });

              if (replayPayment) {
                if (replayPayment.requestHash === requestHash) {
                  return {
                    payment: replayPayment,
                    allocations: replayPayment.allocations,
                    receipt: replayPayment.receipt,
                    isIdempotentReplay: true,
                  };
                } else {
                  throw new ConflictException(
                    `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
                  );
                }
              }
            }

            throw new BadRequestException(
              'No outstanding invoices available to allocate this payment against in the specified academic year',
            );
          }

          // E. Acquire row-level locks on target invoices in deterministic ascending ID order
          const sortedInvoiceIds = [...targetInvoiceIds].sort();
          await tx.$queryRaw`
            SELECT id FROM fee_invoices
            WHERE id = ANY(${sortedInvoiceIds}::text[]) AND "schoolId" = ${schoolId}
            ORDER BY id ASC
            FOR UPDATE;
          `;

          // E2. Post-lock idempotency check:
          // A concurrent transaction holding the invoice lock may have committed while we waited.
          // Re-check before calculating balances or rejecting as overpayment.
          if (effectiveIdempotencyKey) {
            const lockedExisting = await tx.payment.findUnique({
              where: {
                schoolId_idempotencyKey: {
                  schoolId,
                  idempotencyKey: effectiveIdempotencyKey,
                },
              },
              include: {
                allocations: true,
                receipt: true,
              },
            });

            if (lockedExisting) {
              if (lockedExisting.requestHash === requestHash) {
                return {
                  payment: lockedExisting,
                  receipt: lockedExisting.receipt,
                  allocations: lockedExisting.allocations,
                  isIdempotentReplay: true,
                };
              } else {
                throw new ConflictException(
                  `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
                );
              }
            }
          }

          // F. Load locked invoices with complete item, allocation, and assessed fine ledger
          const invoices = await tx.feeInvoice.findMany({
            where: {
              schoolId,
              id: { in: sortedInvoiceIds },
            },
            include: {
              items: {
                orderBy: { createdAt: 'asc' },
              },
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
            orderBy: [{ billingMonth: 'asc' }, { dueDate: 'asc' }],
          });

          // G. Validate that all locked invoices belong strictly to this student, school, and academic year
          for (const inv of invoices) {
            if (inv.studentId !== dto.studentId) {
              throw new BadRequestException(
                `Invoice ${inv.id} does not belong to student ${dto.studentId}`,
              );
            }
            if (inv.academicYearId !== dto.academicYearId) {
              throw new BadRequestException(
                `Invoice ${inv.id} belongs to a different academic year than requested`,
              );
            }
            if (inv.status === InvoiceStatus.VOID) {
              throw new BadRequestException(`Invoice ${inv.id} is VOID and cannot receive payments`);
            }
          }

          // H. Recompute authoritative outstanding balances
          const invoiceItemBalances = new Map<string, Prisma.Decimal>();
          const assessedFineBalances = new Map<string, Prisma.Decimal>();

          for (const inv of invoices) {
            for (const item of inv.items) {
              let netPaid = new Prisma.Decimal(0);
              for (const alloc of inv.paymentAllocations) {
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
              const remaining = Prisma.Decimal.max(new Prisma.Decimal(0), itemNet.sub(netPaid));
              invoiceItemBalances.set(item.id, remaining);
            }

            for (const fine of inv.assessedFines) {
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
          }

          // I. Plan allocations
          const plannedAllocations: PlannedAllocation[] = [];

          if (dto.allocations && dto.allocations.length > 0) {
            // Path 1: Explicit Allocations
            let totalExplicit = new Prisma.Decimal(0);
            for (const allocDto of dto.allocations) {
              const allocAmount = new Prisma.Decimal(allocDto.amount).toDecimalPlaces(
                2,
                Prisma.Decimal.ROUND_HALF_UP,
              );
              if (allocAmount.lessThanOrEqualTo(0)) {
                throw new BadRequestException('Allocation amount must be greater than zero');
              }
              totalExplicit = totalExplicit.add(allocAmount);

              const targetInv = invoices.find((i) => i.id === allocDto.invoiceId);
              if (!targetInv) {
                throw new BadRequestException(
                  `Invoice ${allocDto.invoiceId} not found in target invoice set`,
                );
              }

              if (allocDto.allocationType === AllocationType.REVERSAL) {
                throw new BadRequestException(
                  'Reversal allocations cannot be submitted during payment collection',
                );
              }

              if (allocDto.allocationType === AllocationType.PRINCIPAL) {
                if (allocDto.invoiceItemId) {
                  const targetItem = targetInv.items.find((it) => it.id === allocDto.invoiceItemId);
                  if (!targetItem) {
                    throw new BadRequestException(
                      `Invoice item ${allocDto.invoiceItemId} does not belong to invoice ${allocDto.invoiceId}`,
                    );
                  }
                  const remaining = invoiceItemBalances.get(targetItem.id) || new Prisma.Decimal(0);
                  if (allocAmount.greaterThan(remaining)) {
                    throw new BadRequestException(
                      `Allocation amount (${allocAmount}) exceeds remaining item balance (${remaining}) for ${targetItem.feeHeadNameSnapshot}`,
                    );
                  }
                  invoiceItemBalances.set(targetItem.id, remaining.sub(allocAmount));
                  plannedAllocations.push({
                    invoiceId: targetInv.id,
                    invoiceItemId: targetItem.id,
                    allocationType: AllocationType.PRINCIPAL,
                    amount: allocAmount,
                    feeHeadNameSnapshot: targetItem.feeHeadNameSnapshot,
                  });
                } else {
                  // Invoice-level principal allocation: distribute across items
                  let unallocated = allocAmount;
                  for (const it of targetInv.items) {
                    if (unallocated.lessThanOrEqualTo(0)) break;
                    const rem = invoiceItemBalances.get(it.id) || new Prisma.Decimal(0);
                    if (rem.greaterThan(0)) {
                      const take = Prisma.Decimal.min(unallocated, rem);
                      invoiceItemBalances.set(it.id, rem.sub(take));
                      plannedAllocations.push({
                        invoiceId: targetInv.id,
                        invoiceItemId: it.id,
                        allocationType: AllocationType.PRINCIPAL,
                        amount: take,
                        feeHeadNameSnapshot: it.feeHeadNameSnapshot,
                      });
                      unallocated = unallocated.sub(take);
                    }
                  }
                  if (unallocated.greaterThan(0)) {
                    throw new BadRequestException(
                      `Allocation amount (${allocAmount}) exceeds remaining total principal on invoice ${targetInv.id}`,
                    );
                  }
                }
              } else if (allocDto.allocationType === AllocationType.FINE) {
                if (!allocDto.assessedFineId) {
                  // Find first outstanding fine on invoice
                  const openFine = targetInv.assessedFines.find((f) => {
                    const rem = assessedFineBalances.get(f.id) || new Prisma.Decimal(0);
                    return rem.greaterThan(0);
                  });
                  if (!openFine) {
                    throw new BadRequestException(
                      `No outstanding assessed fines exist on invoice ${targetInv.id}`,
                    );
                  }
                  allocDto.assessedFineId = openFine.id;
                }

                const targetFine = targetInv.assessedFines.find(
                  (f) => f.id === allocDto.assessedFineId,
                );
                if (!targetFine) {
                  throw new BadRequestException(
                    `Assessed fine ${allocDto.assessedFineId} does not belong to invoice ${allocDto.invoiceId}`,
                  );
                }

                const remainingFine =
                  assessedFineBalances.get(targetFine.id) || new Prisma.Decimal(0);
                if (allocAmount.greaterThan(remainingFine)) {
                  throw new BadRequestException(
                    `Allocation amount (${allocAmount}) exceeds remaining fine balance (${remainingFine})`,
                  );
                }
                assessedFineBalances.set(targetFine.id, remainingFine.sub(allocAmount));
                plannedAllocations.push({
                  invoiceId: targetInv.id,
                  assessedFineId: targetFine.id,
                  allocationType: AllocationType.FINE,
                  amount: allocAmount,
                });
              }
            }

            if (!totalExplicit.equals(paymentAmount)) {
              throw new BadRequestException(
                `Sum of explicit allocations (${totalExplicit}) does not equal payment amount (${paymentAmount})`,
              );
            }
          } else {
            // Path 2: Principal-First Automatic Waterfall
            let unallocatedFunds = paymentAmount;

            // Pass 1: Extinguish invoice principal items (oldest invoice first)
            for (const inv of invoices) {
              for (const it of inv.items) {
                if (unallocatedFunds.lessThanOrEqualTo(0)) break;
                const remaining = invoiceItemBalances.get(it.id) || new Prisma.Decimal(0);
                if (remaining.greaterThan(0)) {
                  const take = Prisma.Decimal.min(unallocatedFunds, remaining);
                  invoiceItemBalances.set(it.id, remaining.sub(take));
                  plannedAllocations.push({
                    invoiceId: inv.id,
                    invoiceItemId: it.id,
                    allocationType: AllocationType.PRINCIPAL,
                    amount: take,
                    feeHeadNameSnapshot: it.feeHeadNameSnapshot,
                  });
                  unallocatedFunds = unallocatedFunds.sub(take);
                }
              }
            }

            // Pass 2: Extinguish assessed fines on overdue invoices
            if (unallocatedFunds.greaterThan(0)) {
              for (const inv of invoices) {
                for (const fine of inv.assessedFines) {
                  if (unallocatedFunds.lessThanOrEqualTo(0)) break;
                  const remFine = assessedFineBalances.get(fine.id) || new Prisma.Decimal(0);
                  if (remFine.greaterThan(0)) {
                    const take = Prisma.Decimal.min(unallocatedFunds, remFine);
                    assessedFineBalances.set(fine.id, remFine.sub(take));
                    plannedAllocations.push({
                      invoiceId: inv.id,
                      assessedFineId: fine.id,
                      allocationType: AllocationType.FINE,
                      amount: take,
                    });
                    unallocatedFunds = unallocatedFunds.sub(take);
                  }
                }
              }
            }

            // Overpayment rejection
            if (unallocatedFunds.greaterThan(0)) {
              const totalObligation = paymentAmount.sub(unallocatedFunds);
              throw new BadRequestException(
                `Payment amount (${paymentAmount}) exceeds total outstanding obligation (${totalObligation}) for student in this academic session`,
              );
            }
          }

          // J. Allocate Receipt Number using the exact SAME transaction client `tx`
          const allocatedReceipt = await this.receiptSequenceService.allocateNextReceiptNumber({
            schoolId,
            academicYearId: dto.academicYearId,
            tx,
          });

          // Generate matching unique paymentNumber
          const paymentNumber = `PAY-${allocatedReceipt.receiptNumber.replace(/^[A-Z]+-/, '')}`;

          // K. Create Payment Master Record
          const payment = await tx.payment.create({
            data: {
              schoolId,
              studentId: dto.studentId,
              academicYearId: dto.academicYearId,
              paymentNumber,
              paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
              amount: paymentAmount,
              paymentMethod: dto.paymentMethod,
              referenceNumber: dto.referenceNumber || null,
              chequeNumber: dto.chequeNumber || null,
              chequeDate: dto.chequeDate ? new Date(dto.chequeDate) : null,
              bankName: dto.bankName || null,
              notes: dto.notes || null,
              status: PaymentStatus.COMPLETED,
              idempotencyKey: effectiveIdempotencyKey,
              requestHash,
              collectedByUserId: user ? user.id : null,
            },
          });

          // L. Create Payment Allocation Ledger Records
          const createdAllocations: any[] = [];
          for (const alloc of plannedAllocations) {
            const createdAlloc = await tx.paymentAllocation.create({
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
              ...createdAlloc,
              feeHeadNameSnapshot: alloc.feeHeadNameSnapshot,
            });
          }

          // M. Create Immutable Receipt Record and Snapshot
          const receiptSnapshot = {
            receiptNumber: allocatedReceipt.receiptNumber,
            sequenceNumber: allocatedReceipt.sequenceNumber,
            paymentNumber: payment.paymentNumber,
            paymentDate: payment.paymentDate,
            amount: Number(payment.amount),
            paymentMethod: payment.paymentMethod,
            referenceNumber: payment.referenceNumber,
            chequeNumber: payment.chequeNumber,
            chequeDate: payment.chequeDate,
            bankName: payment.bankName,
            notes: payment.notes,
            chequeDisclaimer:
              payment.paymentMethod === PaymentMethod.CHEQUE
                ? 'Cheque payments are subject to realization.'
                : null,
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
            collector: user
              ? { id: user.id, name: user.name, role: user.role }
              : null,
            issuedAt: new Date().toISOString(),
          };

          const receipt = await tx.receipt.create({
            data: {
              schoolId,
              paymentId: payment.id,
              receiptNumber: allocatedReceipt.receiptNumber,
              receiptSequence: allocatedReceipt.sequenceNumber,
              academicYearId: dto.academicYearId,
              totalAmount: paymentAmount,
              status: ReceiptStatus.ACTIVE,
              receiptSnapshot,
            },
          });

          // N. Synchronize Assessed Fine Statuses
          for (const inv of invoices) {
            for (const fine of inv.assessedFines) {
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
                fine.status = newFineStatus;
              }
            }
          }

          // O. Recompute and Update Affected Invoice Statuses
          for (const inv of invoices) {
            let totalPaidPrincipal = new Prisma.Decimal(0);

            // Sum past principal allocations on this invoice
            for (const past of inv.paymentAllocations) {
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

            // Sum new principal allocations on this invoice
            for (const current of plannedAllocations) {
              if (
                current.invoiceId === inv.id &&
                current.allocationType === AllocationType.PRINCIPAL
              ) {
                totalPaidPrincipal = totalPaidPrincipal.add(current.amount);
              }
            }

            const invoiceNet = new Prisma.Decimal(inv.netAmount);
            const remainingPrincipal = Prisma.Decimal.max(
              new Prisma.Decimal(0),
              invoiceNet.sub(totalPaidPrincipal),
            );

            // Sum remaining assessed fines and total paid fines on this invoice
            let totalRemainingFines = new Prisma.Decimal(0);
            let totalPaidFines = new Prisma.Decimal(0);
            for (const fine of inv.assessedFines) {
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
              totalPaidFines = totalPaidFines.add(netPaidFine);

              let totalWaived = new Prisma.Decimal(0);
              for (const w of fine.waivers) {
                totalWaived = totalWaived.add(w.waivedAmount);
              }

              const assessedAmount = new Prisma.Decimal(fine.assessedAmount);
              const remainingFine = Prisma.Decimal.max(
                new Prisma.Decimal(0),
                assessedAmount.sub(totalWaived).sub(netPaidFine),
              );
              totalRemainingFines = totalRemainingFines.add(remainingFine);
            }

            const totalRemainingObligation = remainingPrincipal.add(totalRemainingFines);
            const totalPaidCombined = totalPaidPrincipal.add(totalPaidFines);

            let newStatus: InvoiceStatus;
            if (totalRemainingObligation.equals(0)) {
              newStatus = InvoiceStatus.PAID;
            } else if (totalPaidCombined.greaterThan(0)) {
              newStatus = InvoiceStatus.PARTIALLY_PAID;
            } else {
              newStatus = this.feeGenerationService
                ? this.feeGenerationService.deriveCurrentInvoiceStatus(
                    inv.status,
                    inv.dueDate,
                  )
                : InvoiceStatus.DUE;
            }

            if (newStatus !== inv.status) {
              await tx.feeInvoice.update({
                where: { schoolId_id: { schoolId, id: inv.id } },
                data: { status: newStatus },
              });
            }
          }

          // O. Enqueue RECEIPT_ISSUED Notification Outbox Record within transaction
          await this.outboxService.enqueueReceiptIssued(tx, {
            schoolId,
            receipt,
            payment,
            student,
            school,
            academicYear,
            allocations: createdAllocations,
          });

          return {
            payment,
            receipt,
            allocations: createdAllocations,
            isIdempotentReplay: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      );
    } catch (err: any) {
      // Catch idempotency race condition: concurrent request with identical idempotency key
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        effectiveIdempotencyKey
      ) {
        const existing = await this.prisma.payment.findUnique({
          where: {
            schoolId_idempotencyKey: {
              schoolId,
              idempotencyKey: effectiveIdempotencyKey,
            },
          },
          include: {
            allocations: true,
            receipt: true,
          },
        });
        if (existing) {
          if (existing.requestHash === requestHash) {
            return {
              payment: existing,
              receipt: existing.receipt,
              allocations: existing.allocations,
              isIdempotentReplay: true,
            };
          } else {
            throw new ConflictException(
              `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
            );
          }
        }
      }
      throw err;
    }
  }

  /**
   * Main transactional reversal entry point.
   * Supports VOID, BOUNCE, and CORRECTION with atomic monotonic sequencing,
   * deterministic row-locking, idempotency protection, and date-based invoice status restoration.
   */
  async reversePayment(
    schoolId: string,
    user: any,
    paymentId: string,
    dto: ReversePaymentDto,
    headerIdempotencyKey?: string,
  ) {
    // 1. Authorize reversal role (SCHOOL_ADMIN or PLATFORM_SUPER_ADMIN only)
    this.assertReversalRole(user);

    // 1b. Validate paymentId UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!paymentId || !uuidRegex.test(paymentId)) {
      throw new BadRequestException('Malformed payment ID: Must be a valid UUID');
    }

    // 1c. Validate reason
    const trimmedReason = (dto.reason || '').trim();
    if (trimmedReason.length < 10) {
      throw new BadRequestException(
        'Reversal reason must be at least 10 characters for audit compliance',
      );
    }

    // 1d. Validate reversal type
    if (![ReversalType.VOID, ReversalType.BOUNCE, ReversalType.CORRECTION].includes(dto.reversalType)) {
      throw new BadRequestException('Invalid reversal type');
    }

    // 1e. Validate allocations payload for CORRECTION
    if (dto.reversalType === ReversalType.CORRECTION) {
      if (!dto.allocations || dto.allocations.length === 0) {
        throw new BadRequestException(
          'Specific allocation items and amounts are required for a CORRECTION reversal',
        );
      }
      const seenAllocationIds = new Set<string>();
      for (const item of dto.allocations) {
        if (!item.allocationId || !uuidRegex.test(item.allocationId)) {
          throw new BadRequestException(`Malformed allocation ID: ${item.allocationId}`);
        }
        if (seenAllocationIds.has(item.allocationId)) {
          throw new BadRequestException(
            `Duplicate allocation ID '${item.allocationId}' in reversal request`,
          );
        }
        seenAllocationIds.add(item.allocationId);

        const amt = new Prisma.Decimal(item.amount);
        if (amt.lessThanOrEqualTo(0)) {
          throw new BadRequestException('Reversal allocation amount must be greater than zero');
        }
      }
    }

    // 2. Resolve idempotency key and request hash
    const effectiveIdempotencyKey = (
      headerIdempotencyKey ||
      dto.idempotencyKey ||
      ''
    ).trim() || null;

    const requestHash = effectiveIdempotencyKey
      ? computeCanonicalRequestHash(dto)
      : null;

    // 3. Pre-transaction idempotency lookup
    if (effectiveIdempotencyKey) {
      const existing = await this.prisma.paymentReversal.findUnique({
        where: {
          schoolId_idempotencyKey: {
            schoolId,
            idempotencyKey: effectiveIdempotencyKey,
          },
        },
        include: {
          allocations: true,
        },
      });

      if (existing) {
        if (existing.requestHash === requestHash) {
          return {
            reversal: existing,
            allocations: existing.allocations,
            isIdempotentReplay: true,
          };
        } else {
          throw new ConflictException(
            `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
          );
        }
      }
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // 4. Early in-transaction idempotency check
          if (effectiveIdempotencyKey) {
            const earlyExisting = await tx.paymentReversal.findUnique({
              where: {
                schoolId_idempotencyKey: {
                  schoolId,
                  idempotencyKey: effectiveIdempotencyKey,
                },
              },
              include: {
                allocations: true,
              },
            });

            if (earlyExisting) {
              if (earlyExisting.requestHash === requestHash) {
                return {
                  reversal: earlyExisting,
                  allocations: earlyExisting.allocations,
                  isIdempotentReplay: true,
                };
              } else {
                throw new ConflictException(
                  `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
                );
              }
            }
          }

          // 5. Lock Payment row using SELECT ... FOR UPDATE
          const lockedPaymentRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM payments
            WHERE id = ${paymentId} AND "schoolId" = ${schoolId}
            FOR UPDATE;
          `;

          if (!lockedPaymentRows || lockedPaymentRows.length === 0) {
            throw new NotFoundException(`Payment ${paymentId} not found in this school`);
          }

          // 5b. Post-lock idempotency check
          if (effectiveIdempotencyKey) {
            const lockedExisting = await tx.paymentReversal.findUnique({
              where: {
                schoolId_idempotencyKey: {
                  schoolId,
                  idempotencyKey: effectiveIdempotencyKey,
                },
              },
              include: {
                allocations: true,
              },
            });

            if (lockedExisting) {
              if (lockedExisting.requestHash === requestHash) {
                return {
                  reversal: lockedExisting,
                  allocations: lockedExisting.allocations,
                  isIdempotentReplay: true,
                };
              } else {
                throw new ConflictException(
                  `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
                );
              }
            }
          }

          // 6. Load Payment master with its complete allocation ledger, refunds, and receipt
          const payment = await tx.payment.findUnique({
            where: {
              schoolId_id: { schoolId, id: paymentId },
            },
            include: {
              allocations: {
                include: {
                  reversals: true,
                  refundAllocations: {
                    include: { paymentRefund: true },
                  },
                },
              },
              receipt: true,
              refunds: true,
            },
          });

          if (!payment) {
            throw new NotFoundException(`Payment ${paymentId} not found in this school`);
          }

          // 7. Validate payment status lifecycle
          if (payment.status === PaymentStatus.VOIDED) {
            throw new BadRequestException('Payment has already been voided');
          }
          if (payment.status === PaymentStatus.BOUNCED) {
            throw new BadRequestException('Payment has already bounced');
          }
          if (payment.status === PaymentStatus.REFUNDED) {
            throw new BadRequestException('Payment has already been fully refunded');
          }

          // 8. Filter original allocations (PRINCIPAL or FINE)
          const originalAllocations = payment.allocations.filter(
            (a) =>
              a.allocationType === AllocationType.PRINCIPAL ||
              a.allocationType === AllocationType.FINE,
          );

          if (originalAllocations.length === 0) {
            throw new BadRequestException('Payment has no original allocations to reverse');
          }

          // Compute unreversed headroom for each original allocation
          const allocationHeadroomMap = new Map<
            string,
            { original: any; unreversed: Prisma.Decimal }
          >();
          for (const alloc of originalAllocations) {
            let alreadyReversed = new Prisma.Decimal(0);
            for (const rev of alloc.reversals) {
              if (rev.allocationType === AllocationType.REVERSAL) {
                alreadyReversed = alreadyReversed.add(rev.allocatedAmount);
              }
            }
            let alreadyRefundedOrReserved = new Prisma.Decimal(0);
            if (alloc.refundAllocations) {
              for (const ra of alloc.refundAllocations) {
                if (
                  ra.paymentRefund.status === RefundStatus.SUCCEEDED ||
                  ra.paymentRefund.status === RefundStatus.PENDING
                ) {
                  alreadyRefundedOrReserved = alreadyRefundedOrReserved.add(ra.amount);
                }
              }
            }
            const unreversed = Prisma.Decimal.max(
              new Prisma.Decimal(0),
              new Prisma.Decimal(alloc.allocatedAmount)
                .sub(alreadyReversed)
                .sub(alreadyRefundedOrReserved),
            );
            allocationHeadroomMap.set(alloc.id, { original: alloc, unreversed });
          }

          // 9. Plan reversals based on reversalType
          interface PlannedReversal {
            originalAllocation: any;
            reversalAmount: Prisma.Decimal;
          }
          const plannedReversals: PlannedReversal[] = [];

          if (dto.reversalType === ReversalType.CORRECTION) {
            for (const itemDto of dto.allocations!) {
              const headroom = allocationHeadroomMap.get(itemDto.allocationId);
              if (!headroom) {
                throw new BadRequestException(
                  `Allocation ${itemDto.allocationId} does not belong to payment ${paymentId}`,
                );
              }

              const reqAmount = new Prisma.Decimal(itemDto.amount).toDecimalPlaces(
                2,
                Prisma.Decimal.ROUND_HALF_UP,
              );

              if (reqAmount.greaterThan(headroom.unreversed)) {
                throw new BadRequestException(
                  `Reversal amount (${reqAmount}) exceeds remaining unreversed balance (${headroom.unreversed}) for allocation ${headroom.original.id}`,
                );
              }

              plannedReversals.push({
                originalAllocation: headroom.original,
                reversalAmount: reqAmount,
              });

              // Deduct from local headroom in case of multiple items referencing same allocation
              headroom.unreversed = headroom.unreversed.sub(reqAmount);
            }
          } else {
            // VOID or BOUNCE: reverse all remaining unreversed headroom across all allocations
            let totalRemainingUnreversed = new Prisma.Decimal(0);
            for (const [, headroom] of allocationHeadroomMap) {
              if (headroom.unreversed.greaterThan(0)) {
                plannedReversals.push({
                  originalAllocation: headroom.original,
                  reversalAmount: headroom.unreversed,
                });
                totalRemainingUnreversed = totalRemainingUnreversed.add(headroom.unreversed);
              }
            }

            if (totalRemainingUnreversed.equals(0)) {
              throw new BadRequestException(
                'Payment has no remaining unreversed allocations to reverse',
              );
            }
          }

          // 10. Identify and acquire row locks on affected Invoices
          const affectedInvoiceIds = Array.from(
            new Set(plannedReversals.map((p) => p.originalAllocation.invoiceId)),
          ).sort();

          await tx.$queryRaw`
            SELECT id FROM fee_invoices
            WHERE id = ANY(${affectedInvoiceIds}::text[]) AND "schoolId" = ${schoolId}
            ORDER BY id ASC
            FOR UPDATE;
          `;

          // 11. Allocate unique reversalNumber atomically
          const allocatedReversalNum =
            await this.reversalSequenceService.allocateNextReversalNumber({
              schoolId,
              academicYearId: payment.academicYearId,
              tx,
            });

          const totalReversalAmount = plannedReversals.reduce(
            (sum, p) => sum.add(p.reversalAmount),
            new Prisma.Decimal(0),
          );

          // 12. Create PaymentReversal master record
          const paymentReversal = await tx.paymentReversal.create({
            data: {
              schoolId,
              paymentId,
              reversalNumber: allocatedReversalNum.reversalNumber,
              reversalType: dto.reversalType,
              totalAmount: totalReversalAmount,
              reason: trimmedReason,
              authorizedByUserId: user ? user.id : null,
              idempotencyKey: effectiveIdempotencyKey,
              requestHash,
            },
          });

          // 13. Create compensating PaymentAllocation records
          const createdCompensatingAllocations: any[] = [];
          for (const plan of plannedReversals) {
            const comp = await tx.paymentAllocation.create({
              data: {
                schoolId,
                paymentId,
                invoiceId: plan.originalAllocation.invoiceId,
                invoiceItemId: plan.originalAllocation.invoiceItemId || null,
                assessedFineId: plan.originalAllocation.assessedFineId || null,
                reversalOfAllocationId: plan.originalAllocation.id,
                paymentReversalId: paymentReversal.id,
                allocationType: AllocationType.REVERSAL,
                allocatedAmount: plan.reversalAmount,
              },
            });
            createdCompensatingAllocations.push(comp);
          }

          // 14. Calculate new payment-level remaining unreversed balance
          let totalOriginal = new Prisma.Decimal(0);
          let totalReversed = new Prisma.Decimal(0);
          for (const alloc of payment.allocations) {
            if (
              alloc.allocationType === AllocationType.PRINCIPAL ||
              alloc.allocationType === AllocationType.FINE
            ) {
              totalOriginal = totalOriginal.add(alloc.allocatedAmount);
            } else if (alloc.allocationType === AllocationType.REVERSAL) {
              totalReversed = totalReversed.add(alloc.allocatedAmount);
            }
          }
          totalReversed = totalReversed.add(totalReversalAmount);
          let totalSucceededRefunds = new Prisma.Decimal(0);
          if (payment.refunds) {
            for (const r of payment.refunds) {
              if (r.status === RefundStatus.SUCCEEDED) {
                totalSucceededRefunds = totalSucceededRefunds.add(r.refundAmount);
              }
            }
          }
          const netRemainingPayment = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            totalOriginal.sub(totalReversed).sub(totalSucceededRefunds),
          );

          if (netRemainingPayment.equals(0)) {
            // Full reversal
            const terminalStatus =
              dto.reversalType === ReversalType.BOUNCE
                ? PaymentStatus.BOUNCED
                : PaymentStatus.VOIDED;

            await tx.payment.update({
              where: { schoolId_id: { schoolId, id: paymentId } },
              data: {
                status: terminalStatus,
                cancelledAt: new Date(),
                cancelledByUserId: user ? user.id : null,
                cancellationReason: trimmedReason,
              },
            });

            if (payment.receipt && payment.receipt.status === ReceiptStatus.ACTIVE) {
              await tx.receipt.update({
                where: { id: payment.receipt.id },
                data: { status: ReceiptStatus.CANCELLED },
              });
            }
          } else if (totalSucceededRefunds.greaterThan(0)) {
            await tx.payment.update({
              where: { schoolId_id: { schoolId, id: paymentId } },
              data: { status: PaymentStatus.PARTIALLY_REFUNDED },
            });
          }

          // 15. Synchronize Assessed Fine and Invoice Statuses on affected invoices
          await this.reconcileInvoicesAndFines(tx, schoolId, affectedInvoiceIds);

          // 16. Enqueue PAYMENT_REVERSED Notification Outbox Record within transaction
          await this.outboxService.enqueuePaymentReversed(tx, {
            schoolId,
            paymentReversal,
            payment,
          });

          return {
            reversal: paymentReversal,
            allocations: createdCompensatingAllocations,
            isIdempotentReplay: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      );
    } catch (err: any) {
      // Catch idempotency race condition: concurrent request with identical idempotency key
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        effectiveIdempotencyKey
      ) {
        const existing = await this.prisma.paymentReversal.findUnique({
          where: {
            schoolId_idempotencyKey: {
              schoolId,
              idempotencyKey: effectiveIdempotencyKey,
            },
          },
          include: {
            allocations: true,
          },
        });
        if (existing) {
          if (existing.requestHash === requestHash) {
            return {
              reversal: existing,
              allocations: existing.allocations,
              isIdempotentReplay: true,
            };
          } else {
            throw new ConflictException(
              `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
            );
          }
        }
      }
      throw err;
    }
  }

  /**
   * Authoritative multi-invoice and fine reconciliation helper.
   * Recalculates net paid principal and fine balances taking into account
   * original collections, reversals, waivers, and SUCCEEDED refunds.
   */
  public async reconcileInvoicesAndFines(
    tx: Prisma.TransactionClient,
    schoolId: string,
    invoiceIds: string[],
  ) {
    if (!invoiceIds || invoiceIds.length === 0) return;

    const invoices = await tx.feeInvoice.findMany({
      where: {
        schoolId,
        id: { in: invoiceIds },
      },
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

    for (const inv of invoices) {
      // 1. Reconcile fines
      let totalRemainingFines = new Prisma.Decimal(0);
      let totalPaidFines = new Prisma.Decimal(0);

      for (const fine of inv.assessedFines) {
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
        netPaidFine = Prisma.Decimal.max(new Prisma.Decimal(0), netPaidFine);
        totalPaidFines = totalPaidFines.add(netPaidFine);

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
        totalRemainingFines = totalRemainingFines.add(remainingFine);

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
          fine.status = newFineStatus;
        }
      }

      // 2. Reconcile principal
      let totalPaidPrincipal = new Prisma.Decimal(0);
      for (const past of inv.paymentAllocations) {
        if (past.invoiceItemId) {
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
      }
      totalPaidPrincipal = Prisma.Decimal.max(new Prisma.Decimal(0), totalPaidPrincipal);

      const invoiceNet = new Prisma.Decimal(inv.netAmount);
      const remainingPrincipal = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        invoiceNet.sub(totalPaidPrincipal),
      );

      const totalRemainingObligation = remainingPrincipal.add(totalRemainingFines);
      const totalPaidCombined = totalPaidPrincipal.add(totalPaidFines);

      let newStatus: InvoiceStatus;
      if (totalRemainingObligation.equals(0)) {
        newStatus = InvoiceStatus.PAID;
      } else if (totalPaidCombined.greaterThan(0)) {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      } else {
        newStatus = this.feeGenerationService
          ? this.feeGenerationService.deriveCurrentInvoiceStatus(
              InvoiceStatus.DUE,
              inv.dueDate,
            )
          : InvoiceStatus.DUE;
      }

      if (newStatus !== inv.status) {
        await tx.feeInvoice.update({
          where: { schoolId_id: { schoolId, id: inv.id } },
          data: { status: newStatus },
        });
        inv.status = newStatus;
      }
    }
  }

  /**
   * Reconciles Payment status, receipt cancellation, and affected invoices after a refund.
   */
  public async reconcilePaymentAndInvoicesAfterRefund(
    tx: Prisma.TransactionClient,
    schoolId: string,
    paymentId: string,
    affectedInvoiceIds: string[],
  ) {
    const payment = await tx.payment.findUnique({
      where: { schoolId_id: { schoolId, id: paymentId } },
      include: {
        allocations: true,
        receipt: true,
        refunds: true,
      },
    });

    if (payment) {
      let totalOriginal = new Prisma.Decimal(0);
      let totalReversed = new Prisma.Decimal(0);
      for (const alloc of payment.allocations) {
        if (
          alloc.allocationType === AllocationType.PRINCIPAL ||
          alloc.allocationType === AllocationType.FINE
        ) {
          totalOriginal = totalOriginal.add(alloc.allocatedAmount);
        } else if (alloc.allocationType === AllocationType.REVERSAL) {
          totalReversed = totalReversed.add(alloc.allocatedAmount);
        }
      }

      let totalSucceededRefunds = new Prisma.Decimal(0);
      for (const r of payment.refunds) {
        if (r.status === RefundStatus.SUCCEEDED) {
          totalSucceededRefunds = totalSucceededRefunds.add(r.refundAmount);
        }
      }

      const netRemaining = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        totalOriginal.sub(totalReversed).sub(totalSucceededRefunds),
      );

      let newPaymentStatus: PaymentStatus;
      if (netRemaining.equals(0)) {
        newPaymentStatus = PaymentStatus.REFUNDED;
        if (payment.receipt && payment.receipt.status === ReceiptStatus.ACTIVE) {
          await tx.receipt.update({
            where: { id: payment.receipt.id },
            data: { status: ReceiptStatus.CANCELLED },
          });
        }
      } else {
        newPaymentStatus = PaymentStatus.PARTIALLY_REFUNDED;
      }

      await tx.payment.update({
        where: { schoolId_id: { schoolId, id: paymentId } },
        data: { status: newPaymentStatus },
      });
    }

    await this.reconcileInvoicesAndFines(tx, schoolId, affectedInvoiceIds);
  }

  /**
   * Creates a refund for a payment.
   * Can be initiated as SUCCEEDED (immediate confirmed cash outflow) or PENDING (initiated/awaiting gateway/bank settlement).
   */
  async createRefund(
    schoolId: string,
    user: any,
    paymentId: string,
    dto: CreatePaymentRefundDto,
    headerIdempotencyKey?: string,
  ) {
    this.assertRefundRole(user);

    const effectiveIdempotencyKey = (
      headerIdempotencyKey ||
      dto.idempotencyKey ||
      ''
    ).trim() || null;

    const requestHash = effectiveIdempotencyKey
      ? computeCanonicalRequestHash(dto)
      : null;

    // Check existing idempotency key before initiating writes
    if (effectiveIdempotencyKey) {
      const existing = await this.prisma.paymentRefund.findUnique({
        where: {
          schoolId_idempotencyKey: {
            schoolId,
            idempotencyKey: effectiveIdempotencyKey,
          },
        },
        include: {
          allocations: true,
        },
      });

      if (existing) {
        if (existing.requestHash === requestHash) {
          return {
            refund: existing,
            allocations: existing.allocations,
            isIdempotentReplay: true,
          };
        } else {
          throw new ConflictException(
            `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
          );
        }
      }
    }

    const trimmedReason = (dto.reason || '').trim();
    if (trimmedReason.length < 10) {
      throw new BadRequestException(
        'Refund reason must be at least 10 characters for audit compliance',
      );
    }

    const initialStatus = dto.status || RefundStatus.SUCCEEDED;
    if (
      initialStatus !== RefundStatus.SUCCEEDED &&
      initialStatus !== RefundStatus.PENDING
    ) {
      throw new BadRequestException(
        'Initial refund status must be either SUCCEEDED or PENDING',
      );
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Check idempotency again inside transaction
          if (effectiveIdempotencyKey) {
            const lockedExisting = await tx.paymentRefund.findUnique({
              where: {
                schoolId_idempotencyKey: {
                  schoolId,
                  idempotencyKey: effectiveIdempotencyKey,
                },
              },
              include: {
                allocations: true,
              },
            });

            if (lockedExisting) {
              if (lockedExisting.requestHash === requestHash) {
                return {
                  refund: lockedExisting,
                  allocations: lockedExisting.allocations,
                  isIdempotentReplay: true,
                };
              } else {
                throw new ConflictException(
                  `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
                );
              }
            }
          }

          // 1. Pessimistic lock on payment row
          const lockedPaymentRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM payments
            WHERE id = ${paymentId} AND "schoolId" = ${schoolId}
            FOR UPDATE;
          `;

          if (!lockedPaymentRows || lockedPaymentRows.length === 0) {
            throw new NotFoundException(`Payment ${paymentId} not found in this school`);
          }

          // 2. Fetch payment master with allocations, reversals, refunds, and receipt
          const payment = await tx.payment.findUnique({
            where: {
              schoolId_id: { schoolId, id: paymentId },
            },
            include: {
              allocations: {
                include: {
                  reversals: true,
                  refundAllocations: {
                    include: { paymentRefund: true },
                  },
                },
              },
              receipt: true,
              refunds: true,
            },
          });

          if (!payment) {
            throw new NotFoundException(`Payment ${paymentId} not found in this school`);
          }

          // 3. Validate payment status lifecycle
          if (payment.status === PaymentStatus.VOIDED) {
            throw new BadRequestException('Cannot refund a voided payment');
          }
          if (payment.status === PaymentStatus.BOUNCED) {
            throw new BadRequestException('Cannot refund a bounced payment');
          }
          if (payment.status === PaymentStatus.REFUNDED) {
            throw new BadRequestException('Payment has already been fully refunded');
          }

          const refundAmount = new Prisma.Decimal(dto.amount).toDecimalPlaces(
            2,
            Prisma.Decimal.ROUND_HALF_UP,
          );
          if (refundAmount.lessThanOrEqualTo(0)) {
            throw new BadRequestException('Refund amount must be greater than zero');
          }

          // 4. Compute available headroom per original allocation
          const originalAllocations = payment.allocations.filter(
            (a) =>
              a.allocationType === AllocationType.PRINCIPAL ||
              a.allocationType === AllocationType.FINE,
          );

          if (originalAllocations.length === 0) {
            throw new BadRequestException('Payment has no original allocations to refund');
          }

          const allocationHeadroomMap = new Map<
            string,
            { original: (typeof originalAllocations)[0]; available: Prisma.Decimal }
          >();

          let totalAvailablePaymentHeadroom = new Prisma.Decimal(0);

          for (const alloc of originalAllocations) {
            let alreadyReversed = new Prisma.Decimal(0);
            for (const rev of alloc.reversals) {
              if (rev.allocationType === AllocationType.REVERSAL) {
                alreadyReversed = alreadyReversed.add(rev.allocatedAmount);
              }
            }
            let alreadyRefundedOrReserved = new Prisma.Decimal(0);
            if (alloc.refundAllocations) {
              for (const ra of alloc.refundAllocations) {
                if (
                  ra.paymentRefund.status === RefundStatus.SUCCEEDED ||
                  ra.paymentRefund.status === RefundStatus.PENDING
                ) {
                  alreadyRefundedOrReserved = alreadyRefundedOrReserved.add(ra.amount);
                }
              }
            }
            const available = Prisma.Decimal.max(
              new Prisma.Decimal(0),
              new Prisma.Decimal(alloc.allocatedAmount)
                .sub(alreadyReversed)
                .sub(alreadyRefundedOrReserved),
            );
            allocationHeadroomMap.set(alloc.id, { original: alloc, available });
            totalAvailablePaymentHeadroom = totalAvailablePaymentHeadroom.add(available);
          }

          if (refundAmount.greaterThan(totalAvailablePaymentHeadroom)) {
            throw new BadRequestException(
              `Refund amount (${refundAmount}) exceeds remaining available refundable balance (${totalAvailablePaymentHeadroom}) for payment ${paymentId}`,
            );
          }

          // 5. Plan refund allocations
          interface PlannedRefundAlloc {
            originalAllocationId: string;
            amount: Prisma.Decimal;
            invoiceId: string;
            assessedFineId?: string | null;
            invoiceItemId?: string | null;
          }
          const plannedAllocations: PlannedRefundAlloc[] = [];

          if (dto.allocations && dto.allocations.length > 0) {
            let totalExplicit = new Prisma.Decimal(0);
            for (const itemDto of dto.allocations) {
              const itemAmount = new Prisma.Decimal(itemDto.amount).toDecimalPlaces(
                2,
                Prisma.Decimal.ROUND_HALF_UP,
              );
              if (itemAmount.lessThanOrEqualTo(0)) {
                throw new BadRequestException(
                  'Refund allocation amount must be greater than zero',
                );
              }
              totalExplicit = totalExplicit.add(itemAmount);

              const headroom = allocationHeadroomMap.get(itemDto.allocationId);
              if (!headroom) {
                throw new BadRequestException(
                  `Allocation ${itemDto.allocationId} does not belong to payment ${paymentId}`,
                );
              }
              if (itemAmount.greaterThan(headroom.available)) {
                throw new BadRequestException(
                  `Refund allocation amount (${itemAmount}) exceeds available balance (${headroom.available}) for allocation ${headroom.original.id}`,
                );
              }

              plannedAllocations.push({
                originalAllocationId: headroom.original.id,
                amount: itemAmount,
                invoiceId: headroom.original.invoiceId,
                assessedFineId: headroom.original.assessedFineId,
                invoiceItemId: headroom.original.invoiceItemId,
              });
              headroom.available = headroom.available.sub(itemAmount);
            }

            if (!totalExplicit.equals(refundAmount)) {
              throw new BadRequestException(
                `Sum of refund allocations (${totalExplicit}) does not equal refund amount (${refundAmount})`,
              );
            }
          } else {
            // Automatic allocation across original allocations
            let unallocated = refundAmount;
            for (const alloc of originalAllocations) {
              if (unallocated.lessThanOrEqualTo(0)) break;
              const headroom = allocationHeadroomMap.get(alloc.id)!;
              if (headroom.available.greaterThan(0)) {
                const take = Prisma.Decimal.min(unallocated, headroom.available);
                plannedAllocations.push({
                  originalAllocationId: alloc.id,
                  amount: take,
                  invoiceId: alloc.invoiceId,
                  assessedFineId: alloc.assessedFineId,
                  invoiceItemId: alloc.invoiceItemId,
                });
                headroom.available = headroom.available.sub(take);
                unallocated = unallocated.sub(take);
              }
            }
          }

          // 6. Lock affected invoices in ascending order
          const affectedInvoiceIds = Array.from(
            new Set(plannedAllocations.map((p) => p.invoiceId)),
          ).sort();

          if (affectedInvoiceIds.length > 0) {
            await tx.$queryRaw`
              SELECT id FROM fee_invoices
              WHERE id = ANY(${affectedInvoiceIds}::text[]) AND "schoolId" = ${schoolId}
              ORDER BY id ASC
              FOR UPDATE;
            `;
          }

          // 7. Create PaymentRefund master record
          const paymentRefund = await tx.paymentRefund.create({
            data: {
              schoolId,
              paymentId,
              refundAmount,
              reason: trimmedReason,
              authorizedByUserId: user ? user.id : null,
              processedByUserId:
                initialStatus === RefundStatus.SUCCEEDED
                  ? user
                    ? user.id
                    : null
                  : null,
              processedAt: initialStatus === RefundStatus.SUCCEEDED ? new Date() : null,
              mode: dto.mode || 'CASH',
              status: initialStatus,
              referenceNumber: dto.referenceNumber || null,
              idempotencyKey: effectiveIdempotencyKey,
              requestHash,
            },
          });

          // 8. Create PaymentRefundAllocation records
          const createdAllocations: any[] = [];
          for (const plan of plannedAllocations) {
            const rAlloc = await tx.paymentRefundAllocation.create({
              data: {
                schoolId,
                paymentRefundId: paymentRefund.id,
                originalAllocationId: plan.originalAllocationId,
                amount: plan.amount,
              },
            });
            createdAllocations.push(rAlloc);
          }

          // 9. If SUCCEEDED, reconcile payment, receipt, and invoice statuses
          if (initialStatus === RefundStatus.SUCCEEDED) {
            await this.reconcilePaymentAndInvoicesAfterRefund(
              tx,
              schoolId,
              paymentId,
              affectedInvoiceIds,
            );

            await this.outboxService.enqueueRefundSucceeded(tx, {
              schoolId,
              refund: paymentRefund,
              paymentId,
            });
          }

          return {
            refund: paymentRefund,
            allocations: createdAllocations,
            isIdempotentReplay: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15000,
        },
      );
    } catch (err: any) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        effectiveIdempotencyKey
      ) {
        const existing = await this.prisma.paymentRefund.findUnique({
          where: {
            schoolId_idempotencyKey: {
              schoolId,
              idempotencyKey: effectiveIdempotencyKey,
            },
          },
          include: {
            allocations: true,
          },
        });
        if (existing) {
          if (existing.requestHash === requestHash) {
            return {
              refund: existing,
              allocations: existing.allocations,
              isIdempotentReplay: true,
            };
          } else {
            throw new ConflictException(
              `Idempotency key '${effectiveIdempotencyKey}' was already used with a different request payload`,
            );
          }
        }
      }
      throw err;
    }
  }

  /**
   * Confirms a PENDING refund, updating status to SUCCEEDED and reconciling balances.
   */
  async confirmRefund(
    schoolId: string,
    user: any,
    refundId: string,
    dto?: UpdateRefundStatusDto,
  ) {
    this.assertRefundRole(user);

    return await this.prisma.$transaction(
      async (tx) => {
        const lockedRefundRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM payment_refunds
          WHERE id = ${refundId} AND "schoolId" = ${schoolId}
          FOR UPDATE;
        `;

        if (!lockedRefundRows || lockedRefundRows.length === 0) {
          throw new NotFoundException(`Refund ${refundId} not found in this school`);
        }

        const refund = await tx.paymentRefund.findUnique({
          where: { schoolId_id: { schoolId, id: refundId } },
          include: {
            allocations: {
              include: { originalAllocation: true },
            },
          },
        });

        if (!refund) {
          throw new NotFoundException(`Refund ${refundId} not found in this school`);
        }

        if (refund.status !== RefundStatus.PENDING) {
          throw new BadRequestException(
            `Only PENDING refunds can be confirmed. Current status: ${refund.status}`,
          );
        }

        // Lock payment row
        await tx.$queryRaw`
          SELECT id FROM payments
          WHERE id = ${refund.paymentId} AND "schoolId" = ${schoolId}
          FOR UPDATE;
        `;

        // Lock affected invoices in ascending order
        const affectedInvoiceIds = Array.from(
          new Set(refund.allocations.map((a) => a.originalAllocation.invoiceId)),
        ).sort();

        if (affectedInvoiceIds.length > 0) {
          await tx.$queryRaw`
            SELECT id FROM fee_invoices
            WHERE id = ANY(${affectedInvoiceIds}::text[]) AND "schoolId" = ${schoolId}
            ORDER BY id ASC
            FOR UPDATE;
          `;
        }

        // Update refund status to SUCCEEDED
        const updatedRefund = await tx.paymentRefund.update({
          where: { schoolId_id: { schoolId, id: refundId } },
          data: {
            status: RefundStatus.SUCCEEDED,
            processedByUserId: user ? user.id : null,
            processedAt: new Date(),
            referenceNumber: dto?.referenceNumber || refund.referenceNumber,
          },
          include: { allocations: true },
        });

        // Reconcile payment, receipt, and invoice statuses
        await this.reconcilePaymentAndInvoicesAfterRefund(
          tx,
          schoolId,
          refund.paymentId,
          affectedInvoiceIds,
        );

        await this.outboxService.enqueueRefundSucceeded(tx, {
          schoolId,
          refund: updatedRefund,
          paymentId: refund.paymentId,
        });

        return updatedRefund;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      },
    );
  }

  /**
   * Marks a PENDING refund as FAILED, releasing the reserved allocation headroom.
   */
  async failRefund(
    schoolId: string,
    user: any,
    refundId: string,
    dto?: UpdateRefundStatusDto,
  ) {
    this.assertRefundRole(user);

    return await this.prisma.$transaction(
      async (tx) => {
        const lockedRefundRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM payment_refunds
          WHERE id = ${refundId} AND "schoolId" = ${schoolId}
          FOR UPDATE;
        `;

        if (!lockedRefundRows || lockedRefundRows.length === 0) {
          throw new NotFoundException(`Refund ${refundId} not found in this school`);
        }

        const refund = await tx.paymentRefund.findUnique({
          where: { schoolId_id: { schoolId, id: refundId } },
          include: { allocations: true },
        });

        if (!refund) {
          throw new NotFoundException(`Refund ${refundId} not found in this school`);
        }

        if (refund.status !== RefundStatus.PENDING) {
          throw new BadRequestException(
            `Only PENDING refunds can be marked as failed. Current status: ${refund.status}`,
          );
        }

        const updatedRefund = await tx.paymentRefund.update({
          where: { schoolId_id: { schoolId, id: refundId } },
          data: {
            status: RefundStatus.FAILED,
            processedByUserId: user ? user.id : null,
            processedAt: new Date(),
            failureReason: dto?.reason || 'Refund payout failed',
            referenceNumber: dto?.referenceNumber || refund.referenceNumber,
          },
          include: { allocations: true },
        });

        await this.outboxService.enqueueRefundFailed(tx, {
          schoolId,
          refund: updatedRefund,
          paymentId: refund.paymentId,
        });

        return updatedRefund;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      },
    );
  }

  /**
   * Cancels a PENDING refund, releasing the reserved allocation headroom.
   */
  async cancelRefund(
    schoolId: string,
    user: any,
    refundId: string,
    dto?: UpdateRefundStatusDto,
  ) {
    this.assertRefundRole(user);

    return await this.prisma.$transaction(
      async (tx) => {
        const lockedRefundRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM payment_refunds
          WHERE id = ${refundId} AND "schoolId" = ${schoolId}
          FOR UPDATE;
        `;

        if (!lockedRefundRows || lockedRefundRows.length === 0) {
          throw new NotFoundException(`Refund ${refundId} not found in this school`);
        }

        const refund = await tx.paymentRefund.findUnique({
          where: { schoolId_id: { schoolId, id: refundId } },
          include: { allocations: true },
        });

        if (!refund) {
          throw new NotFoundException(`Refund ${refundId} not found in this school`);
        }

        if (refund.status !== RefundStatus.PENDING) {
          throw new BadRequestException(
            `Only PENDING refunds can be cancelled. Current status: ${refund.status}`,
          );
        }

        return await tx.paymentRefund.update({
          where: { schoolId_id: { schoolId, id: refundId } },
          data: {
            status: RefundStatus.CANCELLED,
            processedByUserId: user ? user.id : null,
            processedAt: new Date(),
            failureReason: dto?.reason || 'Refund cancelled by admin',
            referenceNumber: dto?.referenceNumber || refund.referenceNumber,
          },
          include: { allocations: true },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      },
    );
  }

  /**
   * Retrieves all refunds associated with a payment.
   */
  async findRefundsByPaymentId(schoolId: string, user: any, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { schoolId_id: { schoolId, id: paymentId } },
      select: { studentId: true, student: { select: { userId: true } } },
    });
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found in this school`);
    }

    if (user.role === UserRole.STUDENT) {
      if (payment.student?.userId !== user.id) {
        throw new ForbiddenException('Access denied to this payment refund record');
      }
    } else if (user.role === UserRole.PARENT) {
      const relation = await this.prisma.parentStudentRelation.findFirst({
        where: {
          schoolId,
          parentId: user.id,
          studentId: payment.studentId,
          isVerified: true,
        },
      });
      if (!relation) {
        throw new ForbiddenException('Access denied to this payment refund record');
      }
    }

    return this.prisma.paymentRefund.findMany({
      where: { schoolId, paymentId },
      include: {
        allocations: {
          include: {
            originalAllocation: true,
          },
        },
        authorizedByUser: { select: { id: true, name: true, email: true } },
        processedByUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a paginated list of payments for the school tenant.
   */
  async findAllPayments(schoolId: string, user: any, query: any = {}) {
    const where: Prisma.PaymentWhereInput = { schoolId };

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    if (user.role === UserRole.STUDENT) {
      const student = await this.prisma.student.findFirst({
        where: { schoolId, userId: user.id },
      });
      if (!student) {
        return {
          data: [],
          meta: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }
      where.studentId = student.id;
    } else if (user.role === UserRole.PARENT) {
      const relations = await this.prisma.parentStudentRelation.findMany({
        where: { schoolId, parentId: user.id, isVerified: true },
        select: { studentId: true },
      });
      const studentIds = relations.map((r) => r.studentId);
      if (studentIds.length === 0) {
        return {
          data: [],
          meta: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }
      where.studentId = { in: studentIds };
    } else {
      if (query.studentId) where.studentId = query.studentId;
    }

    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.status) where.status = query.status;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;

    if (query.startDate || query.endDate) {
      where.paymentDate = {};
      if (query.startDate) where.paymentDate.gte = new Date(query.startDate);
      if (query.endDate) where.paymentDate.lte = new Date(query.endDate);
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          receipt: true,
          student: {
            select: {
              id: true,
              admissionNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single payment with full allocation detail and receipt.
   */
  async findPaymentById(schoolId: string, user: any, id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { schoolId_id: { schoolId, id } },
      include: {
        allocations: true,
        receipt: true,
        student: {
          include: { grade: true, section: true },
        },
        academicYear: true,
        collectedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found in this school`);
    }

    // Role-based authorization
    if (user.role === UserRole.STUDENT) {
      if (payment.student?.userId !== user.id) {
        throw new ForbiddenException('Access denied to this payment record');
      }
    } else if (user.role === UserRole.PARENT) {
      const relation = await this.prisma.parentStudentRelation.findFirst({
        where: {
          schoolId,
          parentId: user.id,
          studentId: payment.studentId,
          isVerified: true,
        },
      });
      if (!relation) {
        throw new ForbiddenException('Access denied to this payment record');
      }
    }

    return payment;
  }

  /**
   * Retrieves a receipt by its unique human-readable receipt number.
   */
  async findReceiptByNumber(schoolId: string, user: any, receiptNumber: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: {
        schoolId_receiptNumber: {
          schoolId,
          receiptNumber,
        },
      },
      include: {
        payment: {
          include: {
            student: true,
            allocations: true,
          },
        },
        academicYear: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Receipt ${receiptNumber} not found in this school`);
    }

    // Role-based authorization
    if (user.role === UserRole.STUDENT) {
      if (receipt.payment?.student?.userId !== user.id) {
        throw new ForbiddenException('Access denied to this receipt');
      }
    } else if (user.role === UserRole.PARENT) {
      const relation = await this.prisma.parentStudentRelation.findFirst({
        where: {
          schoolId,
          parentId: user.id,
          studentId: receipt.payment.studentId,
          isVerified: true,
        },
      });
      if (!relation) {
        throw new ForbiddenException('Access denied to this receipt');
      }
    }

    return receipt;
  }

  /**
   * Looks up a prior payment collection, refund, or reversal operation by its idempotency key.
   * Strictly tenant-scoped to schoolId and authorized for staff and admin roles.
   */
  async lookupByIdempotencyKey(schoolId: string, user: any, idempotencyKey: string) {
    if (
      !user ||
      ![
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
        UserRole.FEE_STAFF,
      ].includes(user.role)
    ) {
      throw new ForbiddenException('Access denied to operation lookup');
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new BadRequestException('Idempotency key is required');
    }

    const trimmedKey = idempotencyKey.trim();

    // 1. Check Collection (Payment)
    const payment = await this.prisma.payment.findUnique({
      where: {
        schoolId_idempotencyKey: {
          schoolId,
          idempotencyKey: trimmedKey,
        },
      },
      include: {
        receipt: true,
      },
    });

    if (payment) {
      return {
        found: true,
        operationType: 'COLLECTION',
        status: payment.status,
        payment: {
          id: payment.id,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
          paymentMethod: payment.paymentMethod,
          status: payment.status,
          paymentDate: payment.paymentDate,
          studentId: payment.studentId,
          academicYearId: payment.academicYearId,
          referenceNumber: payment.referenceNumber,
        },
        receipt: payment.receipt
          ? {
              id: payment.receipt.id,
              receiptNumber: payment.receipt.receiptNumber,
              totalAmount: Number(payment.receipt.totalAmount),
              status: payment.receipt.status,
              issuedDate: payment.receipt.issuedDate,
              receiptSnapshot: payment.receipt.receiptSnapshot,
            }
          : null,
      };
    }

    // 2. Check Refund (PaymentRefund)
    const refund = await this.prisma.paymentRefund.findUnique({
      where: {
        schoolId_idempotencyKey: {
          schoolId,
          idempotencyKey: trimmedKey,
        },
      },
    });

    if (refund) {
      return {
        found: true,
        operationType: 'REFUND',
        status: refund.status,
        refund: {
          id: refund.id,
          paymentId: refund.paymentId,
          refundAmount: Number(refund.refundAmount),
          status: refund.status,
          reason: refund.reason,
          mode: refund.mode,
          referenceNumber: refund.referenceNumber,
          refundDate: refund.refundDate,
        },
      };
    }

    // 3. Check Reversal (PaymentReversal)
    const reversal = await this.prisma.paymentReversal.findUnique({
      where: {
        schoolId_idempotencyKey: {
          schoolId,
          idempotencyKey: trimmedKey,
        },
      },
    });

    if (reversal) {
      return {
        found: true,
        operationType: 'REVERSAL',
        status: 'SUCCEEDED',
        reversal: {
          id: reversal.id,
          paymentId: reversal.paymentId,
          reversalNumber: reversal.reversalNumber,
          reversalType: reversal.reversalType,
          totalAmount: Number(reversal.totalAmount),
          reason: reversal.reason,
          createdAt: reversal.createdAt,
        },
      };
    }

    return {
      found: false,
    };
  }
}
