import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CollectFineDto, FineQueryDto, WaiveFineDto } from '../dto/fine.dto';
import { LibraryFineStatus, Prisma } from '@prisma/client';

@Injectable()
export class LibraryFinesService {
  private readonly logger = new Logger(LibraryFinesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List school library fines with filters.
   */
  async getFines(schoolId: string, query: FineQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.LibraryFineWhereInput = {
      schoolId,
      ...(query.status && { status: query.status }),
      ...(query.borrowerType && { borrowerType: query.borrowerType }),
      ...(query.studentId && { studentId: query.studentId }),
    };

    const [fines, total] = await Promise.all([
      this.prisma.libraryFine.findMany({
        where,
        include: {
          loan: {
            include: {
              copy: {
                include: {
                  book: {
                    select: {
                      id: true,
                      title: true,
                      author: true,
                    },
                  },
                },
              },
            },
          },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNumber: true,
            },
          },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
            },
          },
          waivedByUser: {
            select: { id: true, name: true, email: true },
          },
          collectedByUser: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { assessedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.libraryFine.count({ where }),
    ]);

    return {
      data: fines,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Record desk settlement / cash collection of library fine.
   */
  async collectFine(
    schoolId: string,
    fineId: string,
    userId: string,
    dto: CollectFineDto,
  ) {
    const fine = await this.prisma.libraryFine.findFirst({
      where: { schoolId, id: fineId },
    });

    if (!fine) {
      throw new NotFoundException(`Library fine with ID "${fineId}" not found in this school`);
    }

    if (fine.status === LibraryFineStatus.PAID) {
      throw new BadRequestException('Fine is already fully settled');
    }

    if (fine.status === LibraryFineStatus.WAIVED) {
      throw new BadRequestException('Fine has been waived and cannot be collected');
    }

    const fineAmountNum = Number(fine.fineAmount);
    const paidAmountNum = Number(fine.paidAmount);
    const waivedAmountNum = Number(fine.waivedAmount);
    const outstanding = Math.max(0, fineAmountNum - paidAmountNum - waivedAmountNum);

    if (outstanding <= 0) {
      throw new BadRequestException('No outstanding balance remaining on this fine');
    }

    const paymentToApply = dto.paidAmount ? Math.min(dto.paidAmount, outstanding) : outstanding;
    const newPaidTotal = paidAmountNum + paymentToApply;
    const isFullSettlement = newPaidTotal + waivedAmountNum >= fineAmountNum;

    // Generate desk receipt sequence if not provided
    const receiptRef =
      dto.paymentReference?.trim() ||
      `LIB-REC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const updated = await this.prisma.libraryFine.update({
      where: { schoolId_id: { schoolId, id: fineId } },
      data: {
        paidAmount: new Prisma.Decimal(newPaidTotal.toFixed(2)),
        status: isFullSettlement ? LibraryFineStatus.PAID : LibraryFineStatus.PARTIALLY_PAID,
        collectedByUserId: userId,
        paymentReference: receiptRef,
        resolvedAt: isFullSettlement ? new Date() : fine.resolvedAt,
      },
    });

    this.logger.log(
      `Collected library fine of ₹${paymentToApply.toFixed(2)} on Fine ID ${fineId} (Receipt: ${receiptRef}) by User ${userId}`,
    );

    return {
      fine: updated,
      receiptNumber: receiptRef,
      collectedAmount: paymentToApply,
      remainingBalance: Math.max(0, fineAmountNum - newPaidTotal - waivedAmountNum),
    };
  }

  /**
   * Waive a library fine with mandatory reason.
   */
  async waiveFine(
    schoolId: string,
    fineId: string,
    userId: string,
    dto: WaiveFineDto,
  ) {
    const fine = await this.prisma.libraryFine.findFirst({
      where: { schoolId, id: fineId },
    });

    if (!fine) {
      throw new NotFoundException(`Library fine with ID "${fineId}" not found in this school`);
    }

    if (fine.status === LibraryFineStatus.PAID) {
      throw new BadRequestException('Fine is already paid and cannot be waived');
    }

    if (fine.status === LibraryFineStatus.WAIVED) {
      throw new BadRequestException('Fine is already waived');
    }

    const fineAmountNum = Number(fine.fineAmount);
    const paidAmountNum = Number(fine.paidAmount);
    const waivedAmountNum = Number(fine.waivedAmount);
    const outstanding = Math.max(0, fineAmountNum - paidAmountNum - waivedAmountNum);

    if (outstanding <= 0) {
      throw new BadRequestException('No outstanding balance remaining on this fine');
    }

    const waiveToApply = dto.waiveAmount ? Math.min(dto.waiveAmount, outstanding) : outstanding;
    const newWaivedTotal = waivedAmountNum + waiveToApply;

    const updated = await this.prisma.libraryFine.update({
      where: { schoolId_id: { schoolId, id: fineId } },
      data: {
        waivedAmount: new Prisma.Decimal(newWaivedTotal.toFixed(2)),
        status: LibraryFineStatus.WAIVED,
        waivedByUserId: userId,
        waiveReason: dto.waiveReason.trim(),
        resolvedAt: new Date(),
      },
    });

    this.logger.log(
      `Waived library fine of ₹${waiveToApply.toFixed(2)} on Fine ID ${fineId} by User ${userId} (Reason: ${dto.waiveReason})`,
    );

    return {
      fine: updated,
      waivedAmount: waiveToApply,
      message: 'Library fine waived successfully',
    };
  }
}
