import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, StudentStatus, Prisma } from '@prisma/client';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentsDto } from './dto/query-students.dto';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationOutboxService?: NotificationOutboxService,
  ) {}

  async findStudents(schoolId: string, query?: QueryStudentsDto) {
    // If page is not specified, return raw array for backward compatibility
    if (!query?.page) {
      return this.findAllForSchool(schoolId);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.StudentWhereInput = {
      schoolId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.academicYearId) {
      where.academicYearId = query.academicYearId;
    }

    if (query.gradeId) {
      where.gradeId = query.gradeId;
    }

    if (query.sectionId) {
      where.sectionId = query.sectionId;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { admissionNumber: { contains: term, mode: 'insensitive' } },
        { rollNumber: { contains: term, mode: 'insensitive' } },
        { guardianName: { contains: term, mode: 'insensitive' } },
        { guardianPhone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, students] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        include: {
          grade: true,
          section: true,
          academicYear: true,
          userAccount: {
            select: {
              id: true,
              email: true,
              name: true,
              status: true,
            },
          },
        },
        orderBy: [
          { grade: { code: 'asc' } },
          { section: { name: 'asc' } },
          { rollNumber: 'asc' },
          { admissionNumber: 'asc' },
        ],
        skip,
        take: limit,
      }),
    ]);

    return {
      data: students,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findAccessibleStudents(schoolId: string, user: any) {
    if (
      user.role === UserRole.PLATFORM_SUPER_ADMIN ||
      user.role === UserRole.SCHOOL_ADMIN ||
      user.role === UserRole.FEE_STAFF
    ) {
      return this.findAllForSchool(schoolId);
    } else if (user.role === UserRole.STUDENT) {
      return this.prisma.student.findMany({
        where: {
          schoolId,
          userId: user.id,
        },
        include: {
          grade: true,
          section: true,
          academicYear: true,
        },
      });
    } else if (user.role === UserRole.PARENT) {
      const relations = await this.prisma.parentStudentRelation.findMany({
        where: {
          schoolId,
          parentId: user.id,
          isVerified: true,
        },
        include: {
          student: {
            include: {
              grade: true,
              section: true,
              academicYear: true,
            },
          },
        },
      });
      return relations.map((r) => r.student);
    }
    return [];
  }

  async findAllForSchool(schoolId: string) {
    return this.prisma.student.findMany({
      where: { schoolId },
      include: {
        grade: true,
        section: true,
        academicYear: true,
        userAccount: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { admissionNumber: 'asc' },
    });
  }

  async findOneForSchool(schoolId: string, id: string) {
    const student = await this.prisma.student.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      include: {
        grade: true,
        section: true,
        academicYear: true,
        userAccount: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Student ${id} not found in this school`);
    }

    return student;
  }

  async getStudentProfile(schoolId: string, id: string) {
    const student = await this.prisma.student.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      include: {
        grade: true,
        section: true,
        academicYear: true,
        userAccount: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            createdAt: true,
          },
        },
        parentRelations: {
          include: {
            parent: {
              select: {
                id: true,
                email: true,
                name: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: {
            feeAllocations: true,
            invoices: true,
            payments: true,
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Student ${id} not found in this school`);
    }

    return student;
  }

  async createStudent(schoolId: string, dto: CreateStudentDto) {
    const admissionNumber = dto.admissionNumber.trim().toUpperCase();

    // 1. Verify admission number uniqueness within school
    const existing = await this.prisma.student.findUnique({
      where: {
        schoolId_admissionNumber: {
          schoolId,
          admissionNumber,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Student with admission number "${admissionNumber}" already exists in this school`,
      );
    }

    // 2. Validate academic year belongs to school
    const academicYear = await this.prisma.academicYear.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: dto.academicYearId,
        },
      },
    });
    if (!academicYear) {
      throw new BadRequestException('Selected academic session does not exist in this school');
    }

    // 3. Validate grade belongs to school
    const grade = await this.prisma.gradeClass.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: dto.gradeId,
        },
      },
    });
    if (!grade) {
      throw new BadRequestException('Selected grade/class does not exist in this school');
    }

    // 4. Validate section belongs to school and grade
    const section = await this.prisma.section.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: dto.sectionId,
        },
      },
    });
    if (!section) {
      throw new BadRequestException('Selected section does not exist in this school');
    }
    if (section.gradeId !== dto.gradeId) {
      throw new BadRequestException(
        `Section "${section.name}" does not belong to grade "${grade.name}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          schoolId,
          admissionNumber,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          gradeId: dto.gradeId,
          sectionId: dto.sectionId,
          academicYearId: dto.academicYearId,
          rollNumber: dto.rollNumber?.trim() || null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          guardianName: dto.guardianName?.trim() || null,
          guardianPhone: dto.guardianPhone?.trim() || null,
          guardianEmail: dto.guardianEmail?.trim() || null,
          admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : new Date(),
          status: dto.status || StudentStatus.ACTIVE,
        },
        include: {
          grade: true,
          section: true,
          academicYear: true,
        },
      });

      // Stage admission confirmation notification inside the same transaction
      if (this.notificationOutboxService) {
        try {
          await this.notificationOutboxService.enqueueStudentAdmitted(tx, {
            schoolId,
            student,
          });
        } catch (err: any) {
          this.logger.error(
            `Failed to stage STUDENT_ADMITTED outbox record for student ${student.id}: ${err.message}`,
          );
        }
      }

      return student;
    });
  }

  async updateStudent(schoolId: string, id: string, dto: UpdateStudentDto) {
    const student = await this.prisma.student.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Student ${id} not found in this school`);
    }

    // Check admission number change
    if (dto.admissionNumber) {
      const newAdmissionNumber = dto.admissionNumber.trim().toUpperCase();
      if (newAdmissionNumber !== student.admissionNumber) {
        const duplicate = await this.prisma.student.findUnique({
          where: {
            schoolId_admissionNumber: {
              schoolId,
              admissionNumber: newAdmissionNumber,
            },
          },
        });
        if (duplicate) {
          throw new ConflictException(
            `Student with admission number "${newAdmissionNumber}" already exists in this school`,
          );
        }
      }
    }

    const targetGradeId = dto.gradeId ?? student.gradeId;
    const targetSectionId = dto.sectionId ?? student.sectionId;
    const targetAcademicYearId = dto.academicYearId ?? student.academicYearId;

    // Financial integrity check: If changing grade or academic year, verify no active allocations or invoices exist
    const isGradeChanging = dto.gradeId && dto.gradeId !== student.gradeId;
    const isAcademicYearChanging =
      dto.academicYearId && dto.academicYearId !== student.academicYearId;

    if (isGradeChanging || isAcademicYearChanging) {
      const [allocationsCount, invoicesCount] = await Promise.all([
        this.prisma.studentFeeAllocation.count({
          where: { schoolId, studentId: id },
        }),
        this.prisma.feeInvoice.count({
          where: { schoolId, studentId: id },
        }),
      ]);

      if (allocationsCount > 0 || invoicesCount > 0) {
        throw new BadRequestException(
          `Cannot change class or academic session for student "${student.firstName} ${student.lastName}". ` +
            `Student has ${allocationsCount} active fee allocation(s) and ${invoicesCount} fee invoice(s). ` +
            `To preserve financial integrity and audit history, adjust fee allocations and invoices through Fee Management first.`,
        );
      }
    }

    // Validate foreign keys if changed
    if (dto.academicYearId) {
      const academicYear = await this.prisma.academicYear.findUnique({
        where: { schoolId_id: { schoolId, id: targetAcademicYearId } },
      });
      if (!academicYear) {
        throw new BadRequestException('Selected academic session does not exist in this school');
      }
    }

    if (dto.gradeId) {
      const grade = await this.prisma.gradeClass.findUnique({
        where: { schoolId_id: { schoolId, id: targetGradeId } },
      });
      if (!grade) {
        throw new BadRequestException('Selected grade/class does not exist in this school');
      }
    }

    if (dto.sectionId || dto.gradeId) {
      const section = await this.prisma.section.findUnique({
        where: { schoolId_id: { schoolId, id: targetSectionId } },
      });
      if (!section) {
        throw new BadRequestException('Selected section does not exist in this school');
      }
      if (section.gradeId !== targetGradeId) {
        throw new BadRequestException(
          `Selected section does not belong to the student's assigned grade/class`,
        );
      }
    }

    return this.prisma.student.update({
      where: {
        schoolId_id: {
          schoolId,
          id,
        },
      },
      data: {
        ...(dto.admissionNumber !== undefined && {
          admissionNumber: dto.admissionNumber.trim().toUpperCase(),
        }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName.trim() }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName.trim() }),
        ...(dto.gradeId !== undefined && { gradeId: dto.gradeId }),
        ...(dto.sectionId !== undefined && { sectionId: dto.sectionId }),
        ...(dto.academicYearId !== undefined && { academicYearId: dto.academicYearId }),
        ...(dto.rollNumber !== undefined && { rollNumber: dto.rollNumber?.trim() || null }),
        ...(dto.dateOfBirth !== undefined && {
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        }),
        ...(dto.guardianName !== undefined && { guardianName: dto.guardianName?.trim() || null }),
        ...(dto.guardianPhone !== undefined && {
          guardianPhone: dto.guardianPhone?.trim() || null,
        }),
        ...(dto.guardianEmail !== undefined && {
          guardianEmail: dto.guardianEmail?.trim() || null,
        }),
        ...(dto.admissionDate !== undefined && {
          admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : null,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: {
        grade: true,
        section: true,
        academicYear: true,
        userAccount: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  async findGradesForSchool(schoolId: string) {
    return this.prisma.gradeClass.findMany({
      where: { schoolId },
      include: { sections: true },
      orderBy: { code: 'asc' },
    });
  }

  async findAcademicYearsForSchool(schoolId: string) {
    return this.prisma.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
    });
  }
}
