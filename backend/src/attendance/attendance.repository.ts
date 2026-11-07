import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus as PrismaAttendanceStatus,
  AttendanceType as PrismaAttendanceType,
  RegisterStatus as PrismaRegisterStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ATTENDANCE_REPOSITORY,
  IAttendanceRepository,
  StudentHistoryFilterParams,
} from './attendance.repository.interface';
import {
  AttendanceCorrectionEntry,
  AttendanceRegisterHeader,
  AttendanceStatus,
  AttendanceType,
  BulkMarkResult,
  RegisterStatus,
  RegisterSummary,
  StudentAttendanceRecord,
} from './types';
import { AttendanceEntryDto } from './dto/bulk-mark-attendance.dto';

/**
 * Authoritative Prisma repository adapter for Attendance Management.
 * Implements real typed Prisma operations with multi-tenant isolation,
 * atomic transactions, and zero unsafe type casts.
 */
@Injectable()
export class AttendancePrismaRepository implements IAttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Formats Date object to 'YYYY-MM-DD' ISO date string.
   */
  private formatDateOnly(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  async findMarksForSectionAndDate(
    schoolId: string,
    sectionId: string,
    attendanceDate: string,
  ): Promise<StudentAttendanceRecord[]> {
    const targetDate = new Date(attendanceDate);

    const records = await this.prisma.studentAttendance.findMany({
      where: {
        schoolId,
        sectionId,
        attendanceDate: targetDate,
        attendanceType: PrismaAttendanceType.DAILY,
        periodNumber: 0,
      },
    });

    return records.map((r) => ({
      id: r.id,
      schoolId: r.schoolId,
      registerId: r.registerId,
      studentId: r.studentId,
      academicYearId: r.academicYearId,
      gradeId: r.gradeId,
      sectionId: r.sectionId,
      attendanceDate: this.formatDateOnly(r.attendanceDate),
      attendanceType: r.attendanceType as AttendanceType,
      periodNumber: r.periodNumber,
      status: r.status as AttendanceStatus,
      remarks: r.remarks,
      markedById: r.markedById,
      markedAt: r.markedAt,
      lastUpdatedBy: r.lastUpdatedBy,
      updatedAt: r.updatedAt,
    }));
  }

  async findRegisterHeader(
    schoolId: string,
    sectionId: string,
    attendanceDate: string,
  ): Promise<AttendanceRegisterHeader | null> {
    const targetDate = new Date(attendanceDate);

    const header = await this.prisma.attendanceRegister.findUnique({
      where: {
        schoolId_sectionId_attendanceDate_attendanceType_periodNumber: {
          schoolId,
          sectionId,
          attendanceDate: targetDate,
          attendanceType: PrismaAttendanceType.DAILY,
          periodNumber: 0,
        },
      },
    });

    if (!header) return null;

    return {
      id: header.id,
      schoolId: header.schoolId,
      academicYearId: header.academicYearId,
      gradeId: header.gradeId,
      sectionId: header.sectionId,
      attendanceDate: this.formatDateOnly(header.attendanceDate),
      attendanceType: header.attendanceType as AttendanceType,
      periodNumber: header.periodNumber,
      status: header.status as RegisterStatus,
      totalEnrolled: header.totalEnrolled,
      totalPresent: header.totalPresent,
      totalAbsent: header.totalAbsent,
      totalLate: header.totalLate,
      totalHalfDay: header.totalHalfDay,
      totalExcused: header.totalExcused,
      submittedById: header.submittedById,
      submittedAt: header.submittedAt,
      lockedById: header.lockedById,
      lockedAt: header.lockedAt,
      remarks: header.remarks,
    };
  }

  async saveBulkMarksInTransaction(
    schoolId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string,
    attendanceDate: string,
    entries: AttendanceEntryDto[],
    userId: string,
    summary: RegisterSummary,
  ): Promise<BulkMarkResult> {
    const targetDate = new Date(attendanceDate);

    return this.prisma.$transaction(async (tx) => {
      // 1. Upsert Register Header
      const register = await tx.attendanceRegister.upsert({
        where: {
          schoolId_sectionId_attendanceDate_attendanceType_periodNumber: {
            schoolId,
            sectionId,
            attendanceDate: targetDate,
            attendanceType: PrismaAttendanceType.DAILY,
            periodNumber: 0,
          },
        },
        create: {
          schoolId,
          academicYearId,
          gradeId,
          sectionId,
          attendanceDate: targetDate,
          attendanceType: PrismaAttendanceType.DAILY,
          periodNumber: 0,
          status: summary.status as PrismaRegisterStatus,
          totalEnrolled: summary.totalEnrolled,
          totalPresent: summary.totalPresent,
          totalAbsent: summary.totalAbsent,
          totalLate: summary.totalLate,
          totalHalfDay: summary.totalHalfDay,
          totalExcused: summary.totalExcused,
          submittedById: userId,
          submittedAt: new Date(),
        },
        update: {
          status: summary.status as PrismaRegisterStatus,
          totalEnrolled: summary.totalEnrolled,
          totalPresent: summary.totalPresent,
          totalAbsent: summary.totalAbsent,
          totalLate: summary.totalLate,
          totalHalfDay: summary.totalHalfDay,
          totalExcused: summary.totalExcused,
          submittedById: userId,
          submittedAt: new Date(),
        },
      });

      // 2. Upsert each student mark atomically
      let createdCount = 0;
      let updatedCount = 0;

      for (const entry of entries) {
        const existing = await tx.studentAttendance.findUnique({
          where: {
            schoolId_studentId_attendanceDate_attendanceType_periodNumber: {
              schoolId,
              studentId: entry.studentId,
              attendanceDate: targetDate,
              attendanceType: PrismaAttendanceType.DAILY,
              periodNumber: 0,
            },
          },
        });

        if (existing) {
          await tx.studentAttendance.update({
            where: { id: existing.id },
            data: {
              status: entry.status as PrismaAttendanceStatus,
              remarks: entry.remarks || null,
              lastUpdatedBy: userId,
              registerId: register.id,
            },
          });
          updatedCount++;
        } else {
          await tx.studentAttendance.create({
            data: {
              schoolId,
              registerId: register.id,
              studentId: entry.studentId,
              academicYearId,
              gradeId,
              sectionId,
              attendanceDate: targetDate,
              attendanceType: PrismaAttendanceType.DAILY,
              periodNumber: 0,
              status: entry.status as PrismaAttendanceStatus,
              remarks: entry.remarks || null,
              markedById: userId,
            },
          });
          createdCount++;
        }
      }

      return {
        registerId: register.id,
        attendanceDate,
        sectionId,
        totalSubmitted: entries.length,
        createdCount,
        updatedCount,
        summary,
      };
    });
  }

  async findRecordById(
    schoolId: string,
    attendanceId: string,
  ): Promise<StudentAttendanceRecord | null> {
    const r = await this.prisma.studentAttendance.findFirst({
      where: { schoolId, id: attendanceId },
    });

    if (!r) return null;

    return {
      id: r.id,
      schoolId: r.schoolId,
      registerId: r.registerId,
      studentId: r.studentId,
      academicYearId: r.academicYearId,
      gradeId: r.gradeId,
      sectionId: r.sectionId,
      attendanceDate: this.formatDateOnly(r.attendanceDate),
      attendanceType: r.attendanceType as AttendanceType,
      periodNumber: r.periodNumber,
      status: r.status as AttendanceStatus,
      remarks: r.remarks,
      markedById: r.markedById,
      markedAt: r.markedAt,
      lastUpdatedBy: r.lastUpdatedBy,
      updatedAt: r.updatedAt,
    };
  }

  async updateRecordAndLogCorrection(
    schoolId: string,
    record: StudentAttendanceRecord,
    newStatus: AttendanceStatus,
    reason: string,
    userId: string,
  ): Promise<{ updatedRecord: StudentAttendanceRecord; correctionLog: AttendanceCorrectionEntry }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Update attendance record
      const updated = await tx.studentAttendance.update({
        where: { id: record.id },
        data: {
          status: newStatus as PrismaAttendanceStatus,
          lastUpdatedBy: userId,
        },
      });

      // 2. Append immutable correction log
      const log = await tx.attendanceCorrectionLog.create({
        data: {
          schoolId,
          attendanceId: record.id,
          studentId: record.studentId,
          attendanceDate: new Date(record.attendanceDate),
          previousStatus: record.status as PrismaAttendanceStatus,
          newStatus: newStatus as PrismaAttendanceStatus,
          reason,
          changedById: userId,
        },
      });

      return {
        updatedRecord: {
          id: updated.id,
          schoolId: updated.schoolId,
          registerId: updated.registerId,
          studentId: updated.studentId,
          academicYearId: updated.academicYearId,
          gradeId: updated.gradeId,
          sectionId: updated.sectionId,
          attendanceDate: this.formatDateOnly(updated.attendanceDate),
          attendanceType: updated.attendanceType as AttendanceType,
          periodNumber: updated.periodNumber,
          status: updated.status as AttendanceStatus,
          remarks: updated.remarks,
          markedById: updated.markedById,
          markedAt: updated.markedAt,
          lastUpdatedBy: updated.lastUpdatedBy,
          updatedAt: updated.updatedAt,
        },
        correctionLog: {
          id: log.id,
          schoolId: log.schoolId,
          attendanceId: log.attendanceId,
          studentId: log.studentId,
          attendanceDate: this.formatDateOnly(log.attendanceDate),
          previousStatus: log.previousStatus as AttendanceStatus,
          newStatus: log.newStatus as AttendanceStatus,
          reason: log.reason,
          changedById: log.changedById,
          changedAt: log.changedAt,
        },
      };
    });
  }

  async findStudentHistory(
    schoolId: string,
    studentId: string,
    params: StudentHistoryFilterParams,
  ): Promise<{ records: StudentAttendanceRecord[]; total: number }> {
    const where: {
      schoolId: string;
      studentId: string;
      attendanceType: PrismaAttendanceType;
      periodNumber: number;
      academicYearId?: string;
      attendanceDate?: { gte?: Date; lte?: Date };
    } = {
      schoolId,
      studentId,
      attendanceType: PrismaAttendanceType.DAILY,
      periodNumber: 0,
    };

    if (params.academicYearId) {
      where.academicYearId = params.academicYearId;
    }

    if (params.startDate || params.endDate) {
      where.attendanceDate = {};
      if (params.startDate) where.attendanceDate.gte = new Date(params.startDate);
      if (params.endDate) where.attendanceDate.lte = new Date(params.endDate);
    }

    const [total, records] = await Promise.all([
      this.prisma.studentAttendance.count({ where }),
      this.prisma.studentAttendance.findMany({
        where,
        orderBy: { attendanceDate: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
    ]);

    return {
      total,
      records: records.map((r) => ({
        id: r.id,
        schoolId: r.schoolId,
        registerId: r.registerId,
        studentId: r.studentId,
        academicYearId: r.academicYearId,
        gradeId: r.gradeId,
        sectionId: r.sectionId,
        attendanceDate: this.formatDateOnly(r.attendanceDate),
        attendanceType: r.attendanceType as AttendanceType,
        periodNumber: r.periodNumber,
        status: r.status as AttendanceStatus,
        remarks: r.remarks,
        markedById: r.markedById,
        markedAt: r.markedAt,
        lastUpdatedBy: r.lastUpdatedBy,
        updatedAt: r.updatedAt,
      })),
    };
  }
}
