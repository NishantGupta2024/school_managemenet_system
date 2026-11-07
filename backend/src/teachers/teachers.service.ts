import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeacherStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { QueryTeachersDto } from './dto/query-teachers.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { ProvisionTeacherAccountDto } from './dto/provision-teacher-account.dto';

const SAFE_USER_ACCOUNT_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
};

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new teacher profile in the caller's school
   */
  async createTeacher(schoolId: string, dto: CreateTeacherDto) {
    const normalizedEmployeeId = dto.employeeId.trim().toUpperCase();
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check duplicate employee ID in this school
    const existingEmp = await this.prisma.teacher.findFirst({
      where: {
        schoolId,
        employeeId: normalizedEmployeeId,
      },
    });

    if (existingEmp) {
      throw new ConflictException(
        `A teacher with employee ID '${normalizedEmployeeId}' already exists in this school`,
      );
    }

    return this.prisma.teacher.create({
      data: {
        schoolId,
        employeeId: normalizedEmployeeId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: normalizedEmail,
        phone: dto.phone?.trim() || null,
        department: dto.department?.trim() || null,
        designation: dto.designation?.trim() || null,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : null,
        status: dto.status || TeacherStatus.ACTIVE,
      },
      include: {
        userAccount: { select: SAFE_USER_ACCOUNT_SELECT },
        assignments: {
          include: {
            grade: { select: { id: true, name: true, code: true } },
            section: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true, isCurrent: true } },
          },
        },
      },
    });
  }

  /**
   * Retrieve paginated teacher directory scoped strictly to school
   */
  async findAll(schoolId: string, query: QueryTeachersDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: any = { schoolId };

    if (query.department && query.department.trim()) {
      where.department = query.department.trim();
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { employeeId: { contains: term, mode: 'insensitive' } },
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.academicYearId || query.gradeId || query.sectionId) {
      where.assignments = {
        some: {
          ...(query.academicYearId && { academicYearId: query.academicYearId }),
          ...(query.gradeId && { gradeId: query.gradeId }),
          ...(query.sectionId && { sectionId: query.sectionId }),
        },
      };
    }

    const [total, teachers] = await Promise.all([
      this.prisma.teacher.count({ where }),
      this.prisma.teacher.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          userAccount: { select: SAFE_USER_ACCOUNT_SELECT },
          assignments: {
            include: {
              grade: { select: { id: true, name: true, code: true } },
              section: { select: { id: true, name: true } },
              academicYear: { select: { id: true, name: true, isCurrent: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: teachers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Find single teacher profile with complete assignments and account linkage
   */
  async findOne(schoolId: string, id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, schoolId },
      include: {
        userAccount: { select: SAFE_USER_ACCOUNT_SELECT },
        assignments: {
          include: {
            grade: { select: { id: true, name: true, code: true } },
            section: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true, isCurrent: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!teacher) {
      throw new NotFoundException(`Teacher with ID '${id}' not found in this school`);
    }

    return teacher;
  }

  /**
   * Update teacher demographic and profile metadata
   */
  async updateTeacher(schoolId: string, id: string, dto: UpdateTeacherDto) {
    const teacher = await this.findOne(schoolId, id);

    const updateData: any = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName.trim();
    if (dto.email !== undefined) updateData.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) updateData.phone = dto.phone ? dto.phone.trim() : null;
    if (dto.department !== undefined) updateData.department = dto.department ? dto.department.trim() : null;
    if (dto.designation !== undefined) updateData.designation = dto.designation ? dto.designation.trim() : null;
    if (dto.joiningDate !== undefined) updateData.joiningDate = dto.joiningDate ? new Date(dto.joiningDate) : null;
    if (dto.status !== undefined) updateData.status = dto.status;

    // If deactivating teacher, automatically deactivate linked user account with tenant isolation
    if (dto.status === TeacherStatus.INACTIVE && teacher.userId) {
      const linkedUser = await this.prisma.user.findFirst({
        where: { id: teacher.userId, schoolId },
      });
      if (!linkedUser) {
        throw new BadRequestException(
          `Cannot deactivate linked user account '${teacher.userId}' because it does not belong to school '${schoolId}'`,
        );
      }
      await this.prisma.user.update({
        where: { id: teacher.userId },
        data: { status: UserStatus.INACTIVE },
      });
    }

    return this.prisma.teacher.update({
      where: { id },
      data: updateData,
      include: {
        userAccount: { select: SAFE_USER_ACCOUNT_SELECT },
        assignments: {
          include: {
            grade: { select: { id: true, name: true, code: true } },
            section: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true, isCurrent: true } },
          },
        },
      },
    });
  }

  /**
   * Safe deactivation (preserves historical assignments and audit records)
   */
  async deactivateTeacher(schoolId: string, id: string) {
    return this.updateTeacher(schoolId, id, { status: TeacherStatus.INACTIVE });
  }

  /**
   * Hard deletion guard: blocks deletion if any class assignments or examination ownership records exist
   */
  async deleteTeacher(schoolId: string, id: string) {
    const teacher = await this.findOne(schoolId, id);

    // Reference safety checks (teaching assignments, authored assessments, created chapters)
    const [assignmentCount, authoredAssessmentCount, createdChapterCount] =
      await Promise.all([
        this.prisma.teacherAssignment.count({
          where: { schoolId, teacherId: id },
        }),
        this.prisma.assessment.count({
          where: { schoolId, teacherId: id },
        }),
        this.prisma.assessmentChapter.count({
          where: { schoolId, createdByTeacherId: id },
        }),
      ]);

    if (assignmentCount > 0 || authoredAssessmentCount > 0 || createdChapterCount > 0) {
      const details: string[] = [];
      if (assignmentCount > 0) details.push(`${assignmentCount} academic assignment(s)`);
      if (authoredAssessmentCount > 0) details.push(`${authoredAssessmentCount} authored assessment(s)`);
      if (createdChapterCount > 0) details.push(`${createdChapterCount} created chapter(s)`);

      throw new BadRequestException(
        `Cannot delete teacher with existing records: ${details.join(', ')}. Deactivate the teacher instead to preserve institutional and examination records.`,
      );
    }

    try {
      // If an unlinked or orphan user account was attached, unlink it safely within the school tenant
      if (teacher.userId) {
        const linkedUser = await this.prisma.user.findFirst({
          where: { id: teacher.userId, schoolId },
        });
        if (!linkedUser) {
          throw new BadRequestException(
            `Cannot deactivate linked user account '${teacher.userId}' because it does not belong to school '${schoolId}'`,
          );
        }
        await this.prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: teacher.userId },
            data: { status: UserStatus.INACTIVE },
          });
          await tx.teacher.delete({
            where: { id },
          });
        });
      } else {
        await this.prisma.teacher.delete({
          where: { id },
        });
      }
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete teacher: Dependent records still reference this teacher. Please deactivate the teacher instead.',
        );
      }
      throw err;
    }

    return {
      success: true,
      message: `Teacher ${teacher.firstName} ${teacher.lastName} (${teacher.employeeId}) has been deleted`,
    };
  }

  /**
   * Assign teacher to an academic year, grade, section, and subject
   */
  async assignTeacher(schoolId: string, teacherId: string, dto: AssignTeacherDto) {
    // 1. Verify teacher exists in caller's school
    const teacher = await this.findOne(schoolId, teacherId);

    if (teacher.status === TeacherStatus.INACTIVE) {
      throw new BadRequestException('Cannot assign an inactive teacher to a class section');
    }

    // 2. Verify Academic Year belongs to caller's school
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId },
    });
    if (!academicYear) {
      throw new NotFoundException('Academic year not found in this school');
    }

    // 3. Verify Grade belongs to caller's school
    const grade = await this.prisma.gradeClass.findFirst({
      where: { id: dto.gradeId, schoolId },
    });
    if (!grade) {
      throw new NotFoundException('Grade not found in this school');
    }

    // 4. Verify Section belongs to caller's school and matches Grade
    const section = await this.prisma.section.findFirst({
      where: { id: dto.sectionId, schoolId, gradeId: dto.gradeId },
    });
    if (!section) {
      throw new NotFoundException(
        `Section '${dto.sectionId}' does not belong to grade '${grade.name}' in this school`,
      );
    }

    const normalizedSubject = dto.subject?.trim() || 'General';
    const isClassTeacher = dto.isClassTeacher ?? false;

    // 5. Enforce at most one Class Teacher per section per academic year
    if (isClassTeacher) {
      const existingClassTeacher = await this.prisma.teacherAssignment.findFirst({
        where: {
          schoolId,
          academicYearId: dto.academicYearId,
          sectionId: dto.sectionId,
          isClassTeacher: true,
          teacherId: { not: teacherId },
        },
        include: {
          teacher: { select: { firstName: true, lastName: true, employeeId: true } },
        },
      });

      if (existingClassTeacher) {
        throw new BadRequestException(
          `Section '${section.name}' already has a designated class teacher (${existingClassTeacher.teacher.firstName} ${existingClassTeacher.teacher.lastName}) for academic year ${academicYear.name}. Please remove or update the existing class teacher assignment first.`,
        );
      }
    }

    // 6. Check duplicate assignment
    const existingAssignment = await this.prisma.teacherAssignment.findFirst({
      where: {
        schoolId,
        teacherId,
        academicYearId: dto.academicYearId,
        sectionId: dto.sectionId,
        subject: normalizedSubject,
      },
    });

    if (existingAssignment) {
      throw new ConflictException(
        `Teacher is already assigned to section '${section.name}' for subject '${normalizedSubject}' in academic year ${academicYear.name}`,
      );
    }

    return this.prisma.teacherAssignment.create({
      data: {
        schoolId,
        teacherId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subject: normalizedSubject,
        isClassTeacher,
      },
      include: {
        grade: { select: { id: true, name: true, code: true } },
        section: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true, isCurrent: true } },
      },
    });
  }

  /**
   * Remove an academic assignment
   */
  async removeAssignment(schoolId: string, teacherId: string, assignmentId: string) {
    await this.findOne(schoolId, teacherId);

    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: { id: assignmentId, schoolId, teacherId },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Assignment '${assignmentId}' not found for this teacher in this school`,
      );
    }

    await this.prisma.teacherAssignment.delete({
      where: { id: assignmentId },
    });

    return {
      success: true,
      message: 'Assignment removed successfully',
    };
  }

  /**
   * Provision or link a login User account with UserRole.TEACHER
   */
  async provisionTeacherAccount(
    schoolId: string,
    teacherId: string,
    dto: ProvisionTeacherAccountDto,
  ) {
    const teacher = await this.findOne(schoolId, teacherId);

    if (teacher.userId) {
      throw new BadRequestException(
        'Teacher already has a linked user login account. Use user administration to manage credentials.',
      );
    }

    const targetEmail = (dto.email?.trim() || teacher.email).toLowerCase();

    // Verify email uniqueness in this school
    const existingUser = await this.prisma.user.findFirst({
      where: { schoolId, email: targetEmail },
    });

    if (existingUser) {
      throw new ConflictException(
        `A user account with email '${targetEmail}' already exists in this school`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const teacherRole = UserRole.TEACHER;

    return this.prisma.$transaction(async (tx) => {
      // Re-verify teacher and absence of linked account within transaction to prevent race conditions
      const freshTeacher = await tx.teacher.findFirst({
        where: { id: teacherId, schoolId },
      });

      if (!freshTeacher) {
        throw new NotFoundException(`Teacher with ID '${teacherId}' not found in this school`);
      }

      if (freshTeacher.userId) {
        throw new ConflictException(
          'Teacher already has a linked user login account. Concurrent provisioning detected.',
        );
      }

      const existingTxUser = await tx.user.findFirst({
        where: { schoolId, email: targetEmail },
      });

      if (existingTxUser) {
        throw new ConflictException(
          `A user account with email '${targetEmail}' already exists in this school`,
        );
      }

      const user = await tx.user.create({
        data: {
          schoolId,
          email: targetEmail,
          passwordHash,
          name: `${freshTeacher.firstName} ${freshTeacher.lastName}`,
          role: teacherRole,
          status: UserStatus.ACTIVE,
        },
        select: SAFE_USER_ACCOUNT_SELECT,
      });

      // Link user to teacher atomically
      await tx.teacher.update({
        where: { id: teacherId },
        data: { userId: user.id },
      });

      return {
        success: true,
        message: `User account provisioned successfully for teacher ${freshTeacher.firstName} ${freshTeacher.lastName}`,
        user,
      };
    });
  }

  /**
   * Retrieve unique departments within school
   */
  async getDepartments(schoolId: string): Promise<string[]> {
    const teachers = await this.prisma.teacher.findMany({
      where: {
        schoolId,
        department: { not: null },
      },
      select: { department: true },
      distinct: ['department'],
    });

    return teachers
      .map((t: any) => t.department)
      .filter((d: any): d is string => Boolean(d))
      .sort();
  }
}
