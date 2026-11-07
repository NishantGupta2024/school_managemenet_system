import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // ACADEMIC YEARS / SESSIONS
  // =========================================================================

  async findAcademicYears(schoolId: string) {
    return this.prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
      include: {
        _count: {
          select: {
            students: true,
            feeStructures: true,
            invoices: true,
            studentFeeAllocations: true,
            payments: true,
          },
        },
      },
    });
  }

  async findAcademicYearById(schoolId: string, id: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { schoolId_id: { schoolId, id } },
      include: {
        _count: {
          select: {
            students: true,
            feeStructures: true,
            invoices: true,
            studentFeeAllocations: true,
            payments: true,
          },
        },
      },
    });
    if (!year) {
      throw new NotFoundException(`Academic session '${id}' not found in this school`);
    }
    return year;
  }

  async createAcademicYear(schoolId: string, dto: CreateAcademicYearDto) {
    const name = dto.name.trim();
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid date provided for academic session');
    }

    if (startDate >= endDate) {
      throw new BadRequestException('Session start date must be before end date');
    }

    const existing = await this.prisma.academicYear.findUnique({
      where: { schoolId_name: { schoolId, name } },
    });
    if (existing) {
      throw new ConflictException(`Academic session with name '${name}' already exists in this school`);
    }

    // Determine if this should be the current session
    let shouldBeCurrent = Boolean(dto.isCurrent);
    if (!shouldBeCurrent) {
      const totalSessions = await this.prisma.academicYear.count({ where: { schoolId } });
      if (totalSessions === 0) {
        shouldBeCurrent = true; // First session automatically becomes current
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (shouldBeCurrent) {
        await tx.academicYear.updateMany({
          where: { schoolId, isCurrent: true },
          data: { isCurrent: false },
        });
      }

      return tx.academicYear.create({
        data: {
          schoolId,
          name,
          startDate,
          endDate,
          isCurrent: shouldBeCurrent,
        },
      });
    });
  }

  async updateAcademicYear(schoolId: string, id: string, dto: UpdateAcademicYearDto) {
    const existing = await this.findAcademicYearById(schoolId, id);

    const dataToUpdate: any = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== existing.name) {
        const nameConflict = await this.prisma.academicYear.findUnique({
          where: { schoolId_name: { schoolId, name } },
        });
        if (nameConflict) {
          throw new ConflictException(`Academic session with name '${name}' already exists in this school`);
        }
        dataToUpdate.name = name;
      }
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;

    if (startDate >= endDate) {
      throw new BadRequestException('Session start date must be before end date');
    }

    if (dto.startDate) dataToUpdate.startDate = startDate;
    if (dto.endDate) dataToUpdate.endDate = endDate;

    if (dto.isCurrent !== undefined) {
      if (dto.isCurrent === false && existing.isCurrent) {
        throw new BadRequestException(
          'Cannot deactivate the current active academic session directly. Set another session as current instead.',
        );
      }
      dataToUpdate.isCurrent = dto.isCurrent;
    }

    return this.prisma.$transaction(async (tx) => {
      if (dataToUpdate.isCurrent === true) {
        await tx.academicYear.updateMany({
          where: { schoolId, isCurrent: true, id: { not: id } },
          data: { isCurrent: false },
        });
      }

      return tx.academicYear.update({
        where: { schoolId_id: { schoolId, id } },
        data: dataToUpdate,
      });
    });
  }

  async setCurrentAcademicYear(schoolId: string, id: string) {
    await this.findAcademicYearById(schoolId, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({
        where: { schoolId, isCurrent: true },
        data: { isCurrent: false },
      });

      return tx.academicYear.update({
        where: { schoolId_id: { schoolId, id } },
        data: { isCurrent: true },
      });
    });
  }

  async deleteAcademicYear(schoolId: string, id: string) {
    const existing = await this.findAcademicYearById(schoolId, id);

    if (existing.isCurrent) {
      throw new BadRequestException(
        'Cannot delete the currently active academic session. Please activate another session before deleting this one.',
      );
    }

    // Reference safety checks (including financial and examination integrity)
    const [
      studentCount,
      structureCount,
      invoiceCount,
      allocationCount,
      paymentCount,
      assessmentCount,
      chapterCount,
    ] = await Promise.all([
      this.prisma.student.count({ where: { schoolId, academicYearId: id } }),
      this.prisma.feeStructure.count({ where: { schoolId, academicYearId: id } }),
      this.prisma.feeInvoice.count({ where: { schoolId, academicYearId: id } }),
      this.prisma.studentFeeAllocation.count({ where: { schoolId, academicYearId: id } }),
      this.prisma.payment.count({ where: { schoolId, academicYearId: id } }),
      this.prisma.assessment.count({ where: { schoolId, academicYearId: id } }),
      this.prisma.assessmentChapter.count({ where: { schoolId, academicYearId: id } }),
    ]);

    const totalRefs =
      studentCount +
      structureCount +
      invoiceCount +
      allocationCount +
      paymentCount +
      assessmentCount +
      chapterCount;

    if (totalRefs > 0) {
      const details: string[] = [];
      if (studentCount > 0) details.push(`${studentCount} student(s)`);
      if (structureCount > 0) details.push(`${structureCount} fee structure(s)`);
      if (allocationCount > 0) details.push(`${allocationCount} fee allocation(s)`);
      if (invoiceCount > 0) details.push(`${invoiceCount} invoice(s)`);
      if (paymentCount > 0) details.push(`${paymentCount} payment(s)`);
      if (assessmentCount > 0) details.push(`${assessmentCount} assessment(s)`);
      if (chapterCount > 0) details.push(`${chapterCount} assessment chapter(s)`);

      throw new BadRequestException(
        `Cannot delete academic session: It is referenced by ${details.join(', ')}. Academic records with historical data must be preserved.`,
      );
    }

    try {
      return await this.prisma.academicYear.delete({
        where: { schoolId_id: { schoolId, id } },
      });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete academic session: Dependent records still reference this academic session.',
        );
      }
      throw err;
    }
  }

  // =========================================================================
  // GRADES / CLASSES
  // =========================================================================

  async findGrades(schoolId: string) {
    return this.prisma.gradeClass.findMany({
      where: { schoolId },
      orderBy: { code: 'asc' },
      include: {
        sections: {
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: { students: true },
            },
          },
        },
        _count: {
          select: {
            students: true,
            sections: true,
            feeStructures: true,
          },
        },
      },
    });
  }

  async findGradeById(schoolId: string, id: string) {
    const grade = await this.prisma.gradeClass.findUnique({
      where: { schoolId_id: { schoolId, id } },
      include: {
        sections: {
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: { students: true },
            },
          },
        },
        _count: {
          select: {
            students: true,
            sections: true,
            feeStructures: true,
          },
        },
      },
    });
    if (!grade) {
      throw new NotFoundException(`Grade '${id}' not found in this school`);
    }
    return grade;
  }

  async createGrade(schoolId: string, dto: CreateGradeDto) {
    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();

    const existingCode = await this.prisma.gradeClass.findUnique({
      where: { schoolId_code: { schoolId, code } },
    });
    if (existingCode) {
      throw new ConflictException(`Grade with code '${code}' already exists in this school`);
    }

    return this.prisma.gradeClass.create({
      data: {
        schoolId,
        name,
        code,
      },
    });
  }

  async updateGrade(schoolId: string, id: string, dto: UpdateGradeDto) {
    const existing = await this.findGradeById(schoolId, id);
    const dataToUpdate: any = {};

    if (dto.name !== undefined) {
      dataToUpdate.name = dto.name.trim();
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      if (code !== existing.code) {
        const codeConflict = await this.prisma.gradeClass.findUnique({
          where: { schoolId_code: { schoolId, code } },
        });
        if (codeConflict) {
          throw new ConflictException(`Grade with code '${code}' already exists in this school`);
        }
        dataToUpdate.code = code;
      }
    }

    return this.prisma.gradeClass.update({
      where: { schoolId_id: { schoolId, id } },
      data: dataToUpdate,
    });
  }

  async deleteGrade(schoolId: string, id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Acquire exclusive lock on parent grade row to prevent concurrent reference insertion
        const lockedRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT "id" FROM "grade_classes" WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE`,
          schoolId,
          id,
        );

        if (!lockedRows || lockedRows.length === 0) {
          throw new NotFoundException(`Grade '${id}' not found in this school`);
        }

        // 2. Reference safety checks using transaction client (sections, students, fee structures, assessments, chapters)
        const [sectionCount, studentCount, structureCount, assessmentCount, chapterCount] =
          await Promise.all([
            tx.section.count({ where: { schoolId, gradeId: id } }),
            tx.student.count({ where: { schoolId, gradeId: id } }),
            tx.feeStructure.count({ where: { schoolId, gradeId: id } }),
            tx.assessment.count({ where: { schoolId, gradeId: id } }),
            tx.assessmentChapter.count({ where: { schoolId, gradeId: id } }),
          ]);

        const totalRefs =
          sectionCount + studentCount + structureCount + assessmentCount + chapterCount;
        if (totalRefs > 0) {
          const details: string[] = [];
          if (sectionCount > 0) details.push(`${sectionCount} section(s)`);
          if (studentCount > 0) details.push(`${studentCount} student(s)`);
          if (structureCount > 0) details.push(`${structureCount} fee structure(s)`);
          if (assessmentCount > 0) details.push(`${assessmentCount} assessment(s)`);
          if (chapterCount > 0) details.push(`${chapterCount} assessment chapter(s)`);

          throw new BadRequestException(
            `Cannot delete grade: It is referenced by ${details.join(', ')}. Please remove or reassign them first.`,
          );
        }

        // 3. Delete grade using transaction client
        return await tx.gradeClass.delete({
          where: { schoolId_id: { schoolId, id } },
        });
      });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete grade: Dependent records still reference this grade.',
        );
      }
      throw err;
    }
  }

  // =========================================================================
  // SECTIONS
  // =========================================================================

  async findSectionById(schoolId: string, id: string) {
    const section = await this.prisma.section.findUnique({
      where: { schoolId_id: { schoolId, id } },
      include: {
        grade: true,
        _count: {
          select: { students: true },
        },
      },
    });
    if (!section) {
      throw new NotFoundException(`Section '${id}' not found in this school`);
    }
    return section;
  }

  async createSection(schoolId: string, gradeId: string, dto: CreateSectionDto) {
    const grade = await this.prisma.gradeClass.findUnique({
      where: { schoolId_id: { schoolId, id: gradeId } },
    });
    if (!grade) {
      throw new NotFoundException(`Grade '${gradeId}' not found in this school`);
    }

    const name = dto.name.trim().toUpperCase();
    const capacity = dto.capacity ?? 40;

    const existingSection = await this.prisma.section.findUnique({
      where: { schoolId_gradeId_name: { schoolId, gradeId, name } },
    });
    if (existingSection) {
      throw new ConflictException(
        `Section '${name}' already exists under Grade '${grade.name}' (${grade.code})`,
      );
    }

    return this.prisma.section.create({
      data: {
        schoolId,
        gradeId,
        name,
        capacity,
      },
    });
  }

  async updateSection(schoolId: string, id: string, dto: UpdateSectionDto) {
    const existing = await this.findSectionById(schoolId, id);
    const dataToUpdate: any = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim().toUpperCase();
      if (name !== existing.name) {
        const conflict = await this.prisma.section.findUnique({
          where: {
            schoolId_gradeId_name: {
              schoolId,
              gradeId: existing.gradeId,
              name,
            },
          },
        });
        if (conflict) {
          throw new ConflictException(
            `Section '${name}' already exists under Grade '${existing.grade.name}' (${existing.grade.code})`,
          );
        }
        dataToUpdate.name = name;
      }
    }

    if (dto.capacity !== undefined) {
      dataToUpdate.capacity = dto.capacity;
    }

    return this.prisma.section.update({
      where: { schoolId_id: { schoolId, id } },
      data: dataToUpdate,
    });
  }

  async deleteSection(schoolId: string, id: string) {
    await this.findSectionById(schoolId, id);

    // Reference safety checks (students and section-specific assessments)
    const [studentCount, assessmentCount] = await Promise.all([
      this.prisma.student.count({
        where: { schoolId, sectionId: id },
      }),
      this.prisma.assessment.count({
        where: { schoolId, sectionId: id },
      }),
    ]);

    if (studentCount > 0 || assessmentCount > 0) {
      const details: string[] = [];
      if (studentCount > 0) details.push(`${studentCount} enrolled student(s)`);
      if (assessmentCount > 0) details.push(`${assessmentCount} assessment(s)`);

      throw new BadRequestException(
        `Cannot delete section: It is referenced by ${details.join(', ')}. Please transfer students or reassign assessments before deleting this section.`,
      );
    }

    try {
      return await this.prisma.section.delete({
        where: { schoolId_id: { schoolId, id } },
      });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete section: Dependent records still reference this section.',
        );
      }
      throw err;
    }
  }
}
