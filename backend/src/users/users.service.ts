import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ProvisionStudentAccountDto } from './dto/provision-student-account.dto';
import { CreateParentDto } from './dto/create-parent.dto';
import { LinkStudentParentDto } from './dto/link-student-parent.dto';
import { ListUsersDto } from './dto/list-users.dto';

const SAFE_USER_SELECT = {
  id: true,
  schoolId: true,
  email: true,
  name: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List users in the caller's school with optional role, status, and search filtering.
   * School context is server-enforced; never returns password hashes.
   */
  async findAll(schoolId: string, query: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      schoolId,
    };

    if (query.role) {
      where.role = query.role;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: {
        ...SAFE_USER_SELECT,
        studentProfile: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        parentRelations: {
          select: {
            id: true,
            studentId: true,
            relationshipType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retrieve a single user by ID within the caller's school.
   */
  async findOne(schoolId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        schoolId,
      },
      select: {
        ...SAFE_USER_SELECT,
        studentProfile: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        parentRelations: {
          include: {
            student: {
              select: {
                id: true,
                admissionNumber: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found in this school`);
    }

    return user;
  }

  /**
   * School Admin provisions a new Fee Staff account in their own school.
   * Role is hardcoded to FEE_STAFF; client cannot escalate privileges.
   */
  async createStaff(schoolId: string, dto: CreateStaffDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: {
        schoolId,
        email: normalizedEmail,
      },
    });

    if (existing) {
      throw new ConflictException(
        `An account with email '${normalizedEmail}' already exists in this school`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: UserRole.FEE_STAFF,
        schoolId,
        status: UserStatus.ACTIVE,
      },
      select: SAFE_USER_SELECT,
    });
  }

  /**
   * Update allowlisted user profile fields (e.g. name).
   * Protected fields (id, schoolId, role, status, email) cannot be changed here.
   */
  async updateUser(schoolId: string, id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, schoolId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found in this school`);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
      },
      select: SAFE_USER_SELECT,
    });
  }

  /**
   * Activate or deactivate a user account.
   * Safeguards:
   * 1. Cannot change own account status.
   * 2. Cannot deactivate the last active School Admin.
   */
  async updateStatus(
    schoolId: string,
    id: string,
    currentUserId: string,
    dto: UpdateUserStatusDto,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, schoolId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found in this school`);
    }

    if (id === currentUserId) {
      throw new BadRequestException('Cannot change the status of your own account');
    }

    if (user.role === UserRole.SCHOOL_ADMIN && dto.status === UserStatus.INACTIVE) {
      const activeAdminsCount = await this.prisma.user.count({
        where: {
          schoolId,
          role: UserRole.SCHOOL_ADMIN,
          status: UserStatus.ACTIVE,
        },
      });

      if (activeAdminsCount <= 1) {
        throw new BadRequestException(
          'Cannot deactivate the last active School Administrator for this school',
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      select: SAFE_USER_SELECT,
    });
  }

  /**
   * List students who do not yet have a linked user login account.
   */
  async getUnlinkedStudents(schoolId: string) {
    return this.prisma.student.findMany({
      where: {
        schoolId,
        userId: null,
      },
      include: {
        grade: true,
        section: true,
        academicYear: true,
      },
      orderBy: { admissionNumber: 'asc' },
    });
  }

  /**
   * Provision a login account for an existing student record.
   * Links student record without duplicating domain records or altering fee history.
   */
  async provisionStudentAccount(
    schoolId: string,
    studentId: string,
    dto: ProvisionStudentAccountDto,
  ) {
    const student = await this.prisma.student.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: studentId,
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Student '${studentId}' not found in this school`);
    }

    if (student.userId) {
      throw new ConflictException('Student already has a user login account linked');
    }

    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        schoolId,
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        `An account with email '${normalizedEmail}' already exists in this school`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const displayName =
      dto.name?.trim() || `${student.firstName} ${student.lastName}`.trim();

    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: displayName,
          email: normalizedEmail,
          passwordHash,
          role: UserRole.STUDENT,
          schoolId,
          status: UserStatus.ACTIVE,
        },
        select: SAFE_USER_SELECT,
      });

      await tx.student.update({
        where: { id: studentId },
        data: { userId: newUser.id },
      });

      return {
        message: 'Student account successfully provisioned and linked',
        user: newUser,
        studentId,
      };
    });
  }

  /**
   * Create or link a Parent user account and optionally associate with student(s).
   */
  async createParent(schoolId: string, dto: CreateParentDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Verify all specified students belong to the current school
    if (dto.studentIds && dto.studentIds.length > 0) {
      const validStudents = await this.prisma.student.findMany({
        where: {
          schoolId,
          id: { in: dto.studentIds },
        },
      });

      if (validStudents.length !== dto.studentIds.length) {
        throw new BadRequestException(
          'One or more selected students do not belong to this school',
        );
      }
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        schoolId,
        email: normalizedEmail,
      },
    });

    let parentUser: any;

    if (existingUser) {
      if (existingUser.role !== UserRole.PARENT) {
        throw new ConflictException(
          `User '${normalizedEmail}' exists with role '${existingUser.role}' and cannot be used as a Parent`,
        );
      }
      parentUser = existingUser;
    } else {
      const passwordHash = await bcrypt.hash(dto.password, 10);
      parentUser = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: UserRole.PARENT,
          schoolId,
          status: UserStatus.ACTIVE,
        },
        select: SAFE_USER_SELECT,
      });
    }

    // Link students if provided
    if (dto.studentIds && dto.studentIds.length > 0) {
      for (const studentId of dto.studentIds) {
        const existingRel = await this.prisma.parentStudentRelation.findUnique({
          where: {
            schoolId_parentId_studentId: {
              schoolId,
              parentId: parentUser.id,
              studentId,
            },
          },
        });

        if (!existingRel) {
          await this.prisma.parentStudentRelation.create({
            data: {
              schoolId,
              parentId: parentUser.id,
              studentId,
              relationshipType: dto.relationshipType || 'GUARDIAN',
              isVerified: true,
            },
          });
        }
      }
    }

    return this.findOne(schoolId, parentUser.id);
  }

  /**
   * List all parents in the school along with their linked students.
   */
  async listParents(schoolId: string) {
    return this.prisma.user.findMany({
      where: {
        schoolId,
        role: UserRole.PARENT,
      },
      select: {
        ...SAFE_USER_SELECT,
        parentRelations: {
          include: {
            student: {
              include: {
                grade: true,
                section: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Link an existing parent user to an existing student in the same school.
   */
  async linkParentStudent(
    schoolId: string,
    parentId: string,
    studentId: string,
    dto: LinkStudentParentDto,
  ) {
    const parent = await this.prisma.user.findFirst({
      where: {
        id: parentId,
        schoolId,
        role: UserRole.PARENT,
      },
    });

    if (!parent) {
      throw new NotFoundException(`Parent with ID '${parentId}' not found in this school`);
    }

    const student = await this.prisma.student.findUnique({
      where: {
        schoolId_id: {
          schoolId,
          id: studentId,
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`Student with ID '${studentId}' not found in this school`);
    }

    const existingRel = await this.prisma.parentStudentRelation.findUnique({
      where: {
        schoolId_parentId_studentId: {
          schoolId,
          parentId,
          studentId,
        },
      },
    });

    if (existingRel) {
      throw new ConflictException('Student is already linked to this parent');
    }

    return this.prisma.parentStudentRelation.create({
      data: {
        schoolId,
        parentId,
        studentId,
        relationshipType: dto.relationshipType || 'GUARDIAN',
        isVerified: true,
      },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Remove link between parent and student in the same school.
   */
  async unlinkParentStudent(schoolId: string, parentId: string, studentId: string) {
    const relation = await this.prisma.parentStudentRelation.findUnique({
      where: {
        schoolId_parentId_studentId: {
          schoolId,
          parentId,
          studentId,
        },
      },
    });

    if (!relation) {
      throw new NotFoundException('Parent-student link not found in this school');
    }

    await this.prisma.parentStudentRelation.delete({
      where: {
        schoolId_parentId_studentId: {
          schoolId,
          parentId,
          studentId,
        },
      },
    });

    return { message: 'Parent-student link successfully removed' };
  }
}
