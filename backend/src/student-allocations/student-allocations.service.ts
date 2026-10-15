import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentAllocationDto } from './dto/create-student-allocation.dto';
import { UpdateStudentAllocationDto } from './dto/update-student-allocation.dto';
import { AllocationStatus, ConcessionType, FeeFrequency, Prisma } from '@prisma/client';

@Injectable()
export class StudentAllocationsService {
  constructor(private readonly prisma: PrismaService) {}

  private calculateTotalBaseFee(
    items: { feeHeadId: string; amount: Prisma.Decimal; frequency: FeeFrequency; isOptional: boolean }[],
    optedHeadIds: string[] = [],
  ): Prisma.Decimal {
    const optedSet = new Set(optedHeadIds);
    let total = new Prisma.Decimal(0);

    for (const item of items) {
      if (item.isOptional && !optedSet.has(item.feeHeadId)) {
        continue;
      }

      let multiplier = 1;
      if (item.frequency === FeeFrequency.MONTHLY) {
        multiplier = 12;
      } else if (item.frequency === FeeFrequency.ANNUAL || item.frequency === FeeFrequency.ONE_TIME) {
        multiplier = 1;
      }

      const itemAmount = new Prisma.Decimal(item.amount);
      total = total.add(itemAmount.mul(multiplier));
    }

    return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  async create(schoolId: string, currentUserId: string, dto: CreateStudentAllocationDto) {
    // 1. Verify Student belongs to this school
    const student = await this.prisma.student.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: dto.studentId,
        },
      },
      include: {
        grade: true,
      },
    });
    if (!student) {
      throw new BadRequestException(`Student ${dto.studentId} does not belong to this school`);
    }

    // 2. Verify Fee Structure belongs to this school
    const structure = await this.prisma.feeStructure.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: dto.feeStructureId,
        },
      },
      include: {
        items: true,
      },
    });
    if (!structure) {
      throw new BadRequestException(`Fee structure ${dto.feeStructureId} does not belong to this school`);
    }

    if (structure.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot allocate an inactive or archived fee structure');
    }

    // 3. Verify Academic Year and Grade match
    if (structure.academicYearId !== dto.academicYearId) {
      throw new BadRequestException('Academic year does not match the fee structure academic year');
    }

    if (structure.gradeId !== student.gradeId) {
      throw new BadRequestException(
        `Fee structure grade (${structure.gradeId}) does not match student enrolled grade (${student.gradeId})`,
      );
    }

    // 4. Verify unique allocation per academic year
    const existing = await this.prisma.studentFeeAllocation.findUnique({
      where: {
        schoolId_studentId_academicYearId: {
          schoolId,
          studentId: dto.studentId,
          academicYearId: dto.academicYearId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Student is already allocated to a fee structure for this academic year',
      );
    }

    // 5. Validate opted optional fee heads
    const optedHeadIds = dto.optedFeeHeadIds || [];
    const optionalItems = structure.items.filter((i) => i.isOptional);
    const optionalHeadIds = new Set(optionalItems.map((i) => i.feeHeadId));

    for (const optedId of optedHeadIds) {
      if (!optionalHeadIds.has(optedId)) {
        throw new BadRequestException(
          `Fee head ${optedId} is not an optional component of this fee structure`,
        );
      }
    }

    // 6. Validate Concession Policy
    const concessionType = dto.concessionType || ConcessionType.NONE;
    let concessionValue = dto.concessionValue ?? 0;
    let concessionReason = dto.concessionReason?.trim() || null;
    let authorizedByUserId: string | null = null;

    const totalBaseFee = this.calculateTotalBaseFee(structure.items, optedHeadIds);
    const concessionDecimal = new Prisma.Decimal(concessionValue);

    if (concessionType === ConcessionType.PERCENTAGE) {
      if (concessionDecimal.lessThanOrEqualTo(0) || concessionDecimal.greaterThan(100)) {
        throw new BadRequestException('Percentage concession must be between 0.01% and 100%');
      }
      if (!concessionReason) {
        throw new BadRequestException('Concession reason is mandatory when concession is granted');
      }
      authorizedByUserId = currentUserId;
    } else if (concessionType === ConcessionType.FLAT_DISCOUNT) {
      if (concessionDecimal.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Flat discount concession must be greater than 0');
      }
      if (concessionDecimal.greaterThan(totalBaseFee)) {
        throw new BadRequestException(
          `Flat discount concession (${concessionDecimal.toFixed(2)}) cannot exceed total base fee (${totalBaseFee.toFixed(2)})`,
        );
      }
      if (!concessionReason) {
        throw new BadRequestException('Concession reason is mandatory when concession is granted');
      }
      authorizedByUserId = currentUserId;
    } else {
      concessionReason = null;
      authorizedByUserId = null;
    }

    // 7. Persist allocation
    return this.prisma.studentFeeAllocation.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        feeStructureId: dto.feeStructureId,
        academicYearId: dto.academicYearId,
        concessionType,
        concessionValue:
          concessionType === ConcessionType.NONE
            ? new Prisma.Decimal('0.00')
            : concessionDecimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        concessionReason,
        authorizedByUserId,
        optedFeeHeadIds: optedHeadIds,
      },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        feeStructure: {
          include: {
            items: {
              include: {
                feeHead: true,
              },
            },
          },
        },
        academicYear: true,
        authorizedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findAll(
    schoolId: string,
    filters?: {
      academicYearId?: string;
      gradeId?: string;
      studentId?: string;
      status?: AllocationStatus;
    },
  ) {
    const where: any = { schoolId };
    if (filters?.academicYearId) {
      where.academicYearId = filters.academicYearId;
    }
    if (filters?.studentId) {
      where.studentId = filters.studentId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.gradeId) {
      where.student = { gradeId: filters.gradeId };
    }

    return this.prisma.studentFeeAllocation.findMany({
      where,
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        feeStructure: {
          include: {
            items: {
              include: {
                feeHead: true,
              },
            },
          },
        },
        academicYear: true,
        authorizedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(schoolId: string, id: string) {
    const allocation = await this.prisma.studentFeeAllocation.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        feeStructure: {
          include: {
            items: {
              include: {
                feeHead: true,
              },
            },
          },
        },
        academicYear: true,
        authorizedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!allocation) {
      throw new NotFoundException(`Student fee allocation ${id} not found in this school`);
    }

    return allocation;
  }

  async update(
    schoolId: string,
    currentUserId: string,
    id: string,
    dto: UpdateStudentAllocationDto,
  ) {
    const existing = await this.findOne(schoolId, id);

    let feeStructureId = existing.feeStructureId;
    let structure = existing.feeStructure;

    if (dto.feeStructureId && dto.feeStructureId !== existing.feeStructureId) {
      const newStructure = await this.prisma.feeStructure.findUnique({
        where: {
          schoolId_id: {
            schoolId,
            id: dto.feeStructureId,
          },
        },
        include: {
          items: true,
        },
      });
      if (!newStructure) {
        throw new BadRequestException(`Fee structure ${dto.feeStructureId} not found in this school`);
      }
      if (newStructure.gradeId !== existing.student.gradeId) {
        throw new BadRequestException('New fee structure grade does not match student enrolled grade');
      }
      if (newStructure.academicYearId !== existing.academicYearId) {
        throw new BadRequestException('New fee structure academic year does not match allocation academic year');
      }
      feeStructureId = dto.feeStructureId;
      structure = newStructure as any;
    }

    const optedHeadIds =
      dto.optedFeeHeadIds !== undefined
        ? dto.optedFeeHeadIds
        : (existing.optedFeeHeadIds as string[]);

    // Validate optional heads
    const optionalItems = structure.items.filter((i) => i.isOptional);
    const optionalHeadIds = new Set(optionalItems.map((i) => i.feeHeadId));
    for (const optedId of optedHeadIds) {
      if (!optionalHeadIds.has(optedId)) {
        throw new BadRequestException(
          `Fee head ${optedId} is not an optional component of this fee structure`,
        );
      }
    }

    // Validate Concession
    const concessionType = dto.concessionType !== undefined ? dto.concessionType : existing.concessionType;
    let concessionValue =
      dto.concessionValue !== undefined ? dto.concessionValue : Number(existing.concessionValue);
    let concessionReason =
      dto.concessionReason !== undefined ? dto.concessionReason?.trim() || null : existing.concessionReason;
    let authorizedByUserId = existing.authorizedByUserId;

    const totalBaseFee = this.calculateTotalBaseFee(structure.items, optedHeadIds);
    const concessionDecimal = new Prisma.Decimal(concessionValue);

    if (concessionType === ConcessionType.PERCENTAGE) {
      if (concessionDecimal.lessThanOrEqualTo(0) || concessionDecimal.greaterThan(100)) {
        throw new BadRequestException('Percentage concession must be between 0.01% and 100%');
      }
      if (!concessionReason) {
        throw new BadRequestException('Concession reason is mandatory when concession is granted');
      }
      authorizedByUserId = currentUserId;
    } else if (concessionType === ConcessionType.FLAT_DISCOUNT) {
      if (concessionDecimal.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Flat discount concession must be greater than 0');
      }
      if (concessionDecimal.greaterThan(totalBaseFee)) {
        throw new BadRequestException(
          `Flat discount concession (${concessionDecimal.toFixed(2)}) cannot exceed total base fee (${totalBaseFee.toFixed(2)})`,
        );
      }
      if (!concessionReason) {
        throw new BadRequestException('Concession reason is mandatory when concession is granted');
      }
      authorizedByUserId = currentUserId;
    } else {
      concessionReason = null;
      authorizedByUserId = null;
    }

    return this.prisma.studentFeeAllocation.update({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      data: {
        feeStructureId,
        concessionType,
        concessionValue:
          concessionType === ConcessionType.NONE
            ? new Prisma.Decimal('0.00')
            : concessionDecimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        concessionReason,
        authorizedByUserId,
        optedFeeHeadIds: optedHeadIds,
        status: dto.status ?? existing.status,
      },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        feeStructure: {
          include: {
            items: {
              include: {
                feeHead: true,
              },
            },
          },
        },
        academicYear: true,
        authorizedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async remove(schoolId: string, id: string) {
    await this.findOne(schoolId, id);

    return this.prisma.studentFeeAllocation.delete({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
    });
  }
}
