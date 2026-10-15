import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeeStructureDto } from './dto/create-fee-structure.dto';
import { UpdateFeeStructureDto } from './dto/update-fee-structure.dto';
import { FeeStructureStatus, Prisma } from '@prisma/client';

@Injectable()
export class FeeStructuresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(schoolId: string, dto: CreateFeeStructureDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Fee structure must have at least one fee head item');
    }

    // 1. Verify Academic Year belongs to this school
    const academicYear = await this.prisma.academicYear.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: dto.academicYearId,
        },
      },
    });
    if (!academicYear) {
      throw new BadRequestException(`Academic year ${dto.academicYearId} does not belong to this school`);
    }

    // 2. Verify Grade belongs to this school
    const grade = await this.prisma.gradeClass.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: dto.gradeId,
        },
      },
    });
    if (!grade) {
      throw new BadRequestException(`Grade class ${dto.gradeId} does not belong to this school`);
    }

    // 3. Verify no duplicate fee structures for same grade and session with this name
    const existing = await this.prisma.feeStructure.findUnique({
      where: {
        schoolId_academicYearId_gradeId_name: {
          schoolId,
          academicYearId: dto.academicYearId,
          gradeId: dto.gradeId,
          name: dto.name,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A fee structure named "${dto.name}" already exists for this grade and academic year`,
      );
    }

    // 4. Validate items: uniqueness and ownership
    const feeHeadIds = dto.items.map((item) => item.feeHeadId);
    const uniqueIds = new Set(feeHeadIds);
    if (uniqueIds.size !== feeHeadIds.length) {
      throw new BadRequestException('Fee structure contains duplicate fee heads');
    }

    const headsInSchool = await this.prisma.feeHead.findMany({
      where: {
        schoolId,
        id: { in: feeHeadIds },
      },
    });

    if (headsInSchool.length !== uniqueIds.size) {
      throw new BadRequestException('One or more fee heads do not belong to this school');
    }

    const inactiveHead = headsInSchool.find((h) => h.status !== 'ACTIVE');
    if (inactiveHead) {
      throw new BadRequestException(
        `Cannot add inactive fee head "${inactiveHead.name}" to fee structure`,
      );
    }

    // 5. Execute atomic transaction to persist structure and items
    return this.prisma.$transaction(async (tx) => {
      const createdStructure = await tx.feeStructure.create({
        data: {
          schoolId,
          academicYearId: dto.academicYearId,
          gradeId: dto.gradeId,
          name: dto.name,
          description: dto.description,
          items: {
            create: dto.items.map((item) => ({
              feeHeadId: item.feeHeadId,
              amount: new Prisma.Decimal(item.amount.toFixed(2)),
              frequency: item.frequency,
              isOptional: item.isOptional ?? false,
            })),
          },
        },
        include: {
          items: {
            include: {
              feeHead: true,
            },
          },
          grade: true,
          academicYear: true,
        },
      });

      return createdStructure;
    });
  }

  async findAll(
    schoolId: string,
    filters?: { academicYearId?: string; gradeId?: string; status?: FeeStructureStatus },
  ) {
    const where: any = { schoolId };
    if (filters?.academicYearId) {
      where.academicYearId = filters.academicYearId;
    }
    if (filters?.gradeId) {
      where.gradeId = filters.gradeId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    return this.prisma.feeStructure.findMany({
      where,
      include: {
        items: {
          include: {
            feeHead: true,
          },
        },
        grade: true,
        academicYear: true,
        _count: {
          select: { allocations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(schoolId: string, id: string) {
    const structure = await this.prisma.feeStructure.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      include: {
        items: {
          include: {
            feeHead: true,
          },
        },
        grade: true,
        academicYear: true,
        _count: {
          select: { allocations: true },
        },
      },
    });

    if (!structure) {
      throw new NotFoundException(`Fee structure ${id} not found in this school`);
    }

    return structure;
  }

  async update(schoolId: string, id: string, dto: UpdateFeeStructureDto) {
    const existing = await this.findOne(schoolId, id);

    // If changing name, check duplicate
    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.feeStructure.findUnique({
        where: {
          schoolId_academicYearId_gradeId_name: {
            schoolId,
            academicYearId: existing.academicYearId,
            gradeId: existing.gradeId,
            name: dto.name,
          },
        },
      });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(
          `A fee structure named "${dto.name}" already exists for this grade and academic year`,
        );
      }
    }

    // If updating items
    if (dto.items) {
      const allocationCount = await this.prisma.studentFeeAllocation.count({
        where: { schoolId, feeStructureId: id },
      });
      if (allocationCount > 0) {
        throw new BadRequestException(
          `Cannot modify fee structure items: ${allocationCount} student allocation(s) are already active. Create a new version or change status to INACTIVE.`,
        );
      }

      const feeHeadIds = dto.items.map((i) => i.feeHeadId);
      const uniqueIds = new Set(feeHeadIds);
      if (uniqueIds.size !== feeHeadIds.length) {
        throw new BadRequestException('Fee structure contains duplicate fee heads');
      }

      const headsInSchool = await this.prisma.feeHead.findMany({
        where: {
          schoolId,
          id: { in: feeHeadIds },
        },
      });
      if (headsInSchool.length !== uniqueIds.size) {
        throw new BadRequestException('One or more fee heads do not belong to this school');
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.feeStructureItem.deleteMany({
          where: { schoolId, feeStructureId: id },
        });

        await tx.feeStructureItem.createMany({
          data: dto.items!.map((item) => ({
            schoolId,
            feeStructureId: id,
            feeHeadId: item.feeHeadId,
            amount: new Prisma.Decimal(item.amount.toFixed(2)),
            frequency: item.frequency,
            isOptional: item.isOptional ?? false,
          })),
        });

        return tx.feeStructure.update({
          where: { schoolId_id: { schoolId, id } },
          data: {
            name: dto.name,
            description: dto.description,
            status: dto.status,
          },
          include: {
            items: {
              include: {
                feeHead: true,
              },
            },
            grade: true,
            academicYear: true,
          },
        });
      });
    }

    return this.prisma.feeStructure.update({
      where: { schoolId_id: { schoolId, id } },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
      },
      include: {
        items: {
          include: {
            feeHead: true,
          },
        },
        grade: true,
        academicYear: true,
      },
    });
  }

  async remove(schoolId: string, id: string) {
    await this.findOne(schoolId, id);

    const allocationCount = await this.prisma.studentFeeAllocation.count({
      where: { schoolId, feeStructureId: id },
    });

    if (allocationCount > 0) {
      throw new BadRequestException(
        `Cannot delete fee structure: it is already allocated to ${allocationCount} student(s). Deactivate or archive it instead.`,
      );
    }

    return this.prisma.feeStructure.delete({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
    });
  }
}
