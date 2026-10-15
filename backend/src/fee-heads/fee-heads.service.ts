import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeeHeadDto } from './dto/create-fee-head.dto';
import { UpdateFeeHeadDto } from './dto/update-fee-head.dto';
import { FeeHeadCategory, FeeHeadStatus } from '@prisma/client';

@Injectable()
export class FeeHeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(schoolId: string, dto: CreateFeeHeadDto) {
    const existing = await this.prisma.feeHead.findUnique({
      where: {
        schoolId_code: {
          schoolId,
          code: dto.code.toUpperCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Fee head with code "${dto.code}" already exists in this school`);
    }

    return this.prisma.feeHead.create({
      data: {
        schoolId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        category: dto.category || FeeHeadCategory.ACADEMIC,
        isOptional: dto.isOptional ?? false,
      },
    });
  }

  async findAll(
    schoolId: string,
    filters?: { category?: FeeHeadCategory; status?: FeeHeadStatus; isOptional?: boolean },
  ) {
    const where: any = { schoolId };
    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.isOptional !== undefined) {
      where.isOptional = filters.isOptional;
    }

    return this.prisma.feeHead.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(schoolId: string, id: string) {
    const feeHead = await this.prisma.feeHead.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
    });

    if (!feeHead) {
      throw new NotFoundException(`Fee head ${id} not found in this school`);
    }

    return feeHead;
  }

  async update(schoolId: string, id: string, dto: UpdateFeeHeadDto) {
    // Check existence
    await this.findOne(schoolId, id);

    if (dto.code) {
      const codeUpper = dto.code.toUpperCase();
      const existing = await this.prisma.feeHead.findUnique({
        where: {
          schoolId_code: {
            schoolId,
            code: codeUpper,
          },
        },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Fee head with code "${dto.code}" already exists in this school`);
      }
      dto.code = codeUpper;
    }

    return this.prisma.feeHead.update({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      data: dto,
    });
  }

  async remove(schoolId: string, id: string) {
    await this.findOne(schoolId, id);

    const referencedCount = await this.prisma.feeStructureItem.count({
      where: {
        schoolId,
        feeHeadId: id,
      },
    });

    if (referencedCount > 0) {
      throw new BadRequestException(
        `Cannot delete fee head: it is referenced by ${referencedCount} fee structure item(s). Deactivate it instead.`,
      );
    }

    return this.prisma.feeHead.delete({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
    });
  }
}
