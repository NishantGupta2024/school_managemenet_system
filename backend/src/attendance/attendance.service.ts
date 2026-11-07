import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { StudentStatus, TeacherStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ATTENDANCE_REPOSITORY,
  IAttendanceRepository,
} from './attendance.repository.interface';
import {
  AttendanceRosterItem,
  AttendanceStatus,
  RegisterStatus,
  RegisterSummary,
  StudentAttendanceStats,
} from './types';
import { GetRegisterQueryDto } from './dto/get-register-query.dto';
import { BulkMarkAttendanceDto } from './dto/bulk-mark-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { StudentHistoryQueryDto } from './dto/student-history-query.dto';
import { NotificationOutboxService } from '../notifications/outbox/notification-outbox.service';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  schoolId?: string;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly attendanceRepo: IAttendanceRepository,
    @Optional() private readonly notificationOutboxService?: NotificationOutboxService,
  ) {}

  /**
   * Helper: Validates that an academic year, grade, and section belong to the specified school.
   */
  async validateAcademicHierarchy(
    schoolId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string,
  ) {
    const [academicYear, grade, section] = await Promise.all([
      this.prisma.academicYear.findFirst({
        where: { schoolId, id: academicYearId },
      }),
      this.prisma.gradeClass.findFirst({
        where: { schoolId, id: gradeId },
      }),
      this.prisma.section.findFirst({
        where: { schoolId, id: sectionId, gradeId },
      }),
    ]);

    if (!academicYear) {
      throw new NotFoundException('Academic year not found in this school');
    }
    if (!grade) {
      throw new NotFoundException('Grade class not found in this school');
    }
    if (!section) {
      throw new NotFoundException('Section not found in the specified grade and school');
    }

    return { academicYear, grade, section };
  }

  /**
   * Helper: Verifies whether an authenticated teacher has an active Class Teacher assignment for the given section.
   */
  async assertTeacherAuthorization(
    schoolId: string,
    userId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string,
  ) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId, status: TeacherStatus.ACTIVE },
    });

    if (!teacher) {
      throw new ForbiddenException(
        'Active teacher profile not found for this authenticated user account',
      );
    }

    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: {
        schoolId,
        teacherId: teacher.id,
        academicYearId,
        gradeId,
        sectionId,
        isClassTeacher: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'Access denied: Only designated Class Teachers may view or mark attendance for this grade and section',
      );
    }

    return teacher;
  }

  /**
   * GET /api/v1/attendance/register
   * Retrieves the daily attendance register for a section and date.
   * Returns active enrolled students merged with existing marks.
   * Unmarked students are assigned the virtual status 'NOT_MARKED' (never stored in DB).
   */
  async getRegister(schoolId: string, query: GetRegisterQueryDto, user: AuthenticatedUser) {
    // 1. Verify academic hierarchy belongs to this school
    await this.validateAcademicHierarchy(
      schoolId,
      query.academicYearId,
      query.gradeId,
      query.sectionId,
    );

    // 2. If caller is TEACHER, enforce section assignment authorization
    if (user.role === UserRole.TEACHER) {
      await this.assertTeacherAuthorization(
        schoolId,
        user.id,
        query.academicYearId,
        query.gradeId,
        query.sectionId,
      );
    }

    // 3. Query all active enrolled students for this section
    const activeStudents = await this.prisma.student.findMany({
      where: {
        schoolId,
        academicYearId: query.academicYearId,
        gradeId: query.gradeId,
        sectionId: query.sectionId,
        status: StudentStatus.ACTIVE,
      },
      orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
    });

    // 4. Query existing marks and register header for this date
    const [existingMarks, registerHeader] = await Promise.all([
      this.attendanceRepo.findMarksForSectionAndDate(schoolId, query.sectionId, query.date),
      this.attendanceRepo.findRegisterHeader(schoolId, query.sectionId, query.date),
    ]);

    const marksMap = new Map(existingMarks.map((m) => [m.studentId, m]));

    // 5. Merge active students with marks; un-marked students receive virtual 'NOT_MARKED'
    let rosterItems: AttendanceRosterItem[] = activeStudents.map((student) => {
      const mark = marksMap.get(student.id);
      return {
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        gradeId: student.gradeId,
        sectionId: student.sectionId,
        status: mark ? mark.status : 'NOT_MARKED',
        remarks: mark?.remarks || null,
        attendanceRecordId: mark?.id || null,
        markedAt: mark?.markedAt || null,
      };
    });

    // 6. Optional text search filter
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rosterItems = rosterItems.filter(
        (item) =>
          item.firstName.toLowerCase().includes(q) ||
          item.lastName.toLowerCase().includes(q) ||
          item.admissionNumber.toLowerCase().includes(q) ||
          (item.rollNumber && item.rollNumber.toLowerCase().includes(q)),
      );
    }

    // 7. Compute live summary counts
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;
    let totalHalfDay = 0;
    let totalExcused = 0;
    let totalUnmarked = 0;

    for (const item of rosterItems) {
      switch (item.status) {
        case AttendanceStatus.PRESENT:
          totalPresent++;
          break;
        case AttendanceStatus.ABSENT:
          totalAbsent++;
          break;
        case AttendanceStatus.LATE:
          totalLate++;
          break;
        case AttendanceStatus.HALF_DAY:
          totalHalfDay++;
          break;
        case AttendanceStatus.EXCUSED:
          totalExcused++;
          break;
        case 'NOT_MARKED':
          totalUnmarked++;
          break;
      }
    }

    const totalEnrolled = activeStudents.length;
    let derivedStatus: RegisterStatus = RegisterStatus.UNMARKED;
    if (registerHeader) {
      derivedStatus = registerHeader.status;
    } else if (totalUnmarked === 0 && totalEnrolled > 0) {
      derivedStatus = RegisterStatus.SUBMITTED;
    } else if (totalUnmarked < totalEnrolled) {
      derivedStatus = RegisterStatus.PARTIALLY_MARKED;
    }

    const summary: RegisterSummary = {
      totalEnrolled,
      totalPresent,
      totalAbsent,
      totalLate,
      totalHalfDay,
      totalExcused,
      totalUnmarked,
      status: derivedStatus,
      isLocked: registerHeader?.status === RegisterStatus.LOCKED,
    };

    // 8. Pagination
    const page = query.page || 1;
    const limit = query.limit || 50;
    const startIndex = (page - 1) * limit;
    const paginatedData = rosterItems.slice(startIndex, startIndex + limit);

    return {
      data: paginatedData,
      register: summary,
      meta: {
        total: rosterItems.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(rosterItems.length / limit)),
      },
    };
  }

  /**
   * POST /api/v1/attendance/register/bulk-mark
   * Atomically records daily attendance marks for a section in a transaction.
   */
  async bulkMarkAttendance(schoolId: string, dto: BulkMarkAttendanceDto, user: AuthenticatedUser) {
    // 1. Validate date: Future dates are strictly prohibited
    const targetDate = new Date(dto.attendanceDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid attendance date format');
    }

    if (targetDate > today) {
      throw new BadRequestException('Cannot mark attendance for a future date');
    }

    // 2. Validate academic hierarchy belongs to this school
    await this.validateAcademicHierarchy(
      schoolId,
      dto.academicYearId,
      dto.gradeId,
      dto.sectionId,
    );

    // 3. Teacher authorization check
    if (user.role === UserRole.TEACHER) {
      await this.assertTeacherAuthorization(
        schoolId,
        user.id,
        dto.academicYearId,
        dto.gradeId,
        dto.sectionId,
      );
    }

    // 4. Check if register is already locked
    const existingHeader = await this.attendanceRepo.findRegisterHeader(
      schoolId,
      dto.sectionId,
      dto.attendanceDate,
    );

    if (existingHeader?.status === RegisterStatus.LOCKED) {
      if (user.role !== UserRole.SCHOOL_ADMIN && user.role !== UserRole.PLATFORM_SUPER_ADMIN) {
        throw new ForbiddenException(
          'Attendance register for this date is locked. Only a school administrator can unlock it for modifications.',
        );
      }
    }

    // 5. Check duplicate student IDs within the incoming payload
    const studentIds = dto.entries.map((e) => e.studentId);
    const uniqueIds = new Set(studentIds);
    if (uniqueIds.size !== studentIds.length) {
      throw new BadRequestException(
        'Duplicate student entries detected in bulk attendance payload',
      );
    }

    // 6. Query all submitted students and verify enrollment rules
    const enrolledStudents = await this.prisma.student.findMany({
      where: {
        schoolId,
        id: { in: Array.from(uniqueIds) },
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        status: StudentStatus.ACTIVE,
      },
    });

    if (enrolledStudents.length !== uniqueIds.size) {
      throw new BadRequestException(
        'One or more student IDs are invalid, belong to a different section/school, or are not currently active',
      );
    }

    // 7. Calculate summary counters
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;
    let totalHalfDay = 0;
    let totalExcused = 0;

    for (const entry of dto.entries) {
      switch (entry.status) {
        case AttendanceStatus.PRESENT:
          totalPresent++;
          break;
        case AttendanceStatus.ABSENT:
          totalAbsent++;
          break;
        case AttendanceStatus.LATE:
          totalLate++;
          break;
        case AttendanceStatus.HALF_DAY:
          totalHalfDay++;
          break;
        case AttendanceStatus.EXCUSED:
          totalExcused++;
          break;
      }
    }

    const summary: RegisterSummary = {
      totalEnrolled: enrolledStudents.length,
      totalPresent,
      totalAbsent,
      totalLate,
      totalHalfDay,
      totalExcused,
      totalUnmarked: 0,
      status: RegisterStatus.SUBMITTED,
      isLocked: false,
    };

    // 8. Execute atomic transactional bulk save via repository
    const result = await this.attendanceRepo.saveBulkMarksInTransaction(
      schoolId,
      dto.academicYearId,
      dto.gradeId,
      dto.sectionId,
      dto.attendanceDate,
      dto.entries,
      user.id,
      summary,
    );

    // 9. Stage absent notifications if any absent students are present
    if (this.notificationOutboxService && totalAbsent > 0) {
      try {
        const absentStudentIds = dto.entries
          .filter((e) => e.status === AttendanceStatus.ABSENT)
          .map((e) => e.studentId);

        const absentStudents = await this.prisma.student.findMany({
          where: {
            schoolId,
            id: { in: absentStudentIds },
          },
          include: {
            parentRelations: {
              where: { schoolId, isVerified: true },
              include: { parent: true },
            },
            grade: { select: { name: true } },
            section: { select: { name: true } },
            school: { select: { name: true } },
          },
        });

        const recordsToStage = absentStudents.map((s) => {
          const verifiedRel = s.parentRelations.find((r) => r.isVerified && r.parent?.email);
          const recipientEmail = verifiedRel?.parent?.email || s.guardianEmail || null;
          const recipientName = verifiedRel?.parent?.name || s.guardianName || `${s.firstName} ${s.lastName}`.trim();

          return {
            studentId: s.id,
            studentName: `${s.firstName} ${s.lastName}`.trim(),
            admissionNumber: s.admissionNumber,
            recipientEmail,
            recipientName,
            gradeName: s.grade?.name,
            sectionName: s.section?.name,
          };
        });

        const schoolName = absentStudents[0]?.school?.name || 'School';

        await this.prisma.$transaction(async (tx) => {
          await this.notificationOutboxService!.enqueueAttendanceAbsentBatch(tx, {
            schoolId,
            attendanceDate: dto.attendanceDate,
            records: recordsToStage,
            schoolName,
          });
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to stage ATTENDANCE_ABSENT outbox records for date ${dto.attendanceDate}: ${err.message}`,
        );
      }
    }

    return result;
  }

  /**
   * PATCH /api/v1/attendance/:id
   * Corrects an existing attendance record with mandatory audit trail reason.
   */
  async correctAttendance(
    schoolId: string,
    attendanceId: string,
    dto: CorrectAttendanceDto,
    user: AuthenticatedUser,
  ) {
    // 1. Validate correction reason length
    const sanitizedReason = dto.reason?.trim();
    if (!sanitizedReason || sanitizedReason.length < 5) {
      throw new BadRequestException(
        'Correction reason must be at least 5 characters long for auditability',
      );
    }

    // 2. Locate existing record
    const record = await this.attendanceRepo.findRecordById(schoolId, attendanceId);
    if (!record || record.schoolId !== schoolId) {
      throw new NotFoundException('Attendance record not found in this school');
    }

    // 3. Status must actually change
    if (record.status === dto.status) {
      throw new BadRequestException(
        'The specified attendance status is identical to the current status',
      );
    }

    // 4. If teacher, verify authorization for the record's section
    if (user.role === UserRole.TEACHER) {
      await this.assertTeacherAuthorization(
        schoolId,
        user.id,
        record.academicYearId,
        record.gradeId,
        record.sectionId,
      );

      // Verify register is not locked
      const header = await this.attendanceRepo.findRegisterHeader(
        schoolId,
        record.sectionId,
        record.attendanceDate,
      );
      if (header?.status === RegisterStatus.LOCKED) {
        throw new ForbiddenException(
          'Cannot modify attendance in a locked register. Request school administrator assistance.',
        );
      }
    }

    // 5. Update record and record immutable correction log
    const updated = await this.attendanceRepo.updateRecordAndLogCorrection(
      schoolId,
      record,
      dto.status,
      sanitizedReason,
      user.id,
    );

    // 6. If correcting away from ABSENT, cancel any pending absent email notification
    if (this.notificationOutboxService && record.status === AttendanceStatus.ABSENT && dto.status !== AttendanceStatus.ABSENT) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.notificationOutboxService!.cancelPendingAttendanceAbsent(
            tx,
            schoolId,
            record.studentId,
            record.attendanceDate,
          );
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to cancel pending ATTENDANCE_ABSENT notification for student ${record.studentId}: ${err.message}`,
        );
      }
    }

    return updated;
  }

  /**
   * GET /api/v1/attendance/students/:studentId
   * Retrieves attendance history and statistics for a specific student.
   */
  async getStudentHistory(
    schoolId: string,
    studentId: string,
    query: StudentHistoryQueryDto,
    user: AuthenticatedUser,
  ) {
    // 1. Verify student exists in this school
    const student = await this.prisma.student.findFirst({
      where: { schoolId, id: studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found in this school');
    }

    // 2. If caller is TEACHER, verify assignment for student's section
    if (user.role === UserRole.TEACHER) {
      await this.assertTeacherAuthorization(
        schoolId,
        user.id,
        student.academicYearId,
        student.gradeId,
        student.sectionId,
      );
    }

    // 3. Validate date range consistency
    if (query.startDate && query.endDate) {
      if (new Date(query.startDate) > new Date(query.endDate)) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
    }

    // 4. Query history from repository
    const page = query.page || 1;
    const limit = query.limit || 30;

    const { records, total } = await this.attendanceRepo.findStudentHistory(schoolId, studentId, {
      startDate: query.startDate,
      endDate: query.endDate,
      academicYearId: query.academicYearId || student.academicYearId,
      page,
      limit,
    });

    // 5. Compute stats
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let excusedDays = 0;

    for (const r of records) {
      switch (r.status) {
        case AttendanceStatus.PRESENT:
          presentDays++;
          break;
        case AttendanceStatus.ABSENT:
          absentDays++;
          break;
        case AttendanceStatus.LATE:
          lateDays++;
          break;
        case AttendanceStatus.HALF_DAY:
          halfDays++;
          break;
        case AttendanceStatus.EXCUSED:
          excusedDays++;
          break;
      }
    }

    const totalWorkingDays = presentDays + absentDays + lateDays + halfDays + excusedDays;
    const effectivePresent = presentDays + lateDays + 0.5 * halfDays;
    const attendanceRate =
      totalWorkingDays > 0 ? Number(((effectivePresent / totalWorkingDays) * 100).toFixed(1)) : 100;

    const stats: StudentAttendanceStats = {
      totalWorkingDays,
      presentDays,
      absentDays,
      lateDays,
      halfDays,
      excusedDays,
      attendanceRate,
    };

    return {
      student: {
        id: student.id,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        gradeId: student.gradeId,
        sectionId: student.sectionId,
      },
      stats,
      data: records,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
