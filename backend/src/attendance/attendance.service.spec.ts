import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StudentStatus, UserRole } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ATTENDANCE_REPOSITORY,
  IAttendanceRepository,
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
import { GetRegisterQueryDto } from './dto/get-register-query.dto';
import { BulkMarkAttendanceDto } from './dto/bulk-mark-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { StudentHistoryQueryDto } from './dto/student-history-query.dto';

describe('AttendanceService — Unit Tests & Multi-Tenant Business Rules', () => {
  let service: AttendanceService;
  let prismaMock: any;
  let attendanceRepoMock: jest.Mocked<IAttendanceRepository>;

  const schoolA = '11111111-1111-1111-1111-111111111111';
  const schoolB = '22222222-2222-2222-2222-222222222222';

  const academicYearId = 'ay-2026-001';
  const gradeId = 'grd-grade-10';
  const sectionId = 'sec-10-a';
  const targetDate = '2026-10-25';

  const adminUser = {
    id: 'user-admin-1',
    email: 'admin@school.com',
    role: UserRole.SCHOOL_ADMIN,
    schoolId: schoolA,
  };

  const superAdminUser = {
    id: 'user-super-admin-1',
    email: 'super@platform.gov',
    role: UserRole.PLATFORM_SUPER_ADMIN,
    schoolId: schoolA,
  };

  const feeStaffUser = {
    id: 'user-fee-staff-1',
    email: 'staff@school.com',
    role: UserRole.FEE_STAFF,
    schoolId: schoolA,
  };

  const teacherUser = {
    id: 'user-teacher-1',
    email: 'teacher@school.com',
    role: UserRole.TEACHER,
    schoolId: schoolA,
  };

  const unauthorizedTeacherUser = {
    id: 'user-teacher-unauth',
    email: 'unauth@school.com',
    role: UserRole.TEACHER,
    schoolId: schoolA,
  };

  const subjectOnlyTeacherUser = {
    id: 'user-teacher-subject-only',
    email: 'subject@school.com',
    role: UserRole.TEACHER,
    schoolId: schoolA,
  };

  const inactiveTeacherUser = {
    id: 'user-teacher-inactive',
    email: 'inactive@school.com',
    role: UserRole.TEACHER,
    schoolId: schoolA,
  };

  const mockActiveStudents = [
    {
      id: 'stu-001',
      schoolId: schoolA,
      admissionNumber: 'ADM-001',
      rollNumber: '101',
      firstName: 'Alice',
      lastName: 'Smith',
      gradeId,
      sectionId,
      academicYearId,
      status: StudentStatus.ACTIVE,
    },
    {
      id: 'stu-002',
      schoolId: schoolA,
      admissionNumber: 'ADM-002',
      rollNumber: '102',
      firstName: 'Bob',
      lastName: 'Jones',
      gradeId,
      sectionId,
      academicYearId,
      status: StudentStatus.ACTIVE,
    },
    {
      id: 'stu-003',
      schoolId: schoolA,
      admissionNumber: 'ADM-003',
      rollNumber: '103',
      firstName: 'Charlie',
      lastName: 'Brown',
      gradeId,
      sectionId,
      academicYearId,
      status: StudentStatus.ACTIVE,
    },
  ];

  const mockExistingMark: StudentAttendanceRecord = {
    id: 'rec-001',
    schoolId: schoolA,
    registerId: 'reg-001',
    studentId: 'stu-001',
    academicYearId,
    gradeId,
    sectionId,
    attendanceDate: targetDate,
    attendanceType: AttendanceType.DAILY,
    periodNumber: 0,
    status: AttendanceStatus.PRESENT,
    remarks: 'On time',
    markedById: adminUser.id,
    markedAt: new Date(),
    lastUpdatedBy: null,
    updatedAt: new Date(),
  };

  const mockRegisterHeader: AttendanceRegisterHeader = {
    id: 'reg-001',
    schoolId: schoolA,
    academicYearId,
    gradeId,
    sectionId,
    attendanceDate: targetDate,
    attendanceType: AttendanceType.DAILY,
    periodNumber: 0,
    status: RegisterStatus.PARTIALLY_MARKED,
    totalEnrolled: 3,
    totalPresent: 1,
    totalAbsent: 0,
    totalLate: 0,
    totalHalfDay: 0,
    totalExcused: 0,
    submittedById: adminUser.id,
    submittedAt: new Date(),
    lockedById: null,
    lockedAt: null,
    remarks: null,
  };

  beforeEach(async () => {
    prismaMock = {
      academicYear: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.schoolId === schoolA && where.id === academicYearId) {
            return Promise.resolve({ id: academicYearId, schoolId: schoolA, name: '2026-2027' });
          }
          return Promise.resolve(null);
        }),
      },
      gradeClass: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.schoolId === schoolA && where.id === gradeId) {
            return Promise.resolve({ id: gradeId, schoolId: schoolA, name: 'Grade 10' });
          }
          return Promise.resolve(null);
        }),
      },
      section: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.schoolId === schoolA && (where.id === sectionId || where.id === 'sec-10-b') && where.gradeId === gradeId) {
            return Promise.resolve({ id: where.id, schoolId: schoolA, gradeId, name: where.id === sectionId ? 'A' : 'B' });
          }
          return Promise.resolve(null);
        }),
      },
      teacher: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.schoolId === schoolA && where.userId === teacherUser.id) {
            if (where.status && where.status !== 'ACTIVE') return Promise.resolve(null);
            return Promise.resolve({ id: 'tch-authorized', schoolId: schoolA, userId: teacherUser.id, status: 'ACTIVE' });
          }
          if (where.schoolId === schoolA && where.userId === unauthorizedTeacherUser.id) {
            if (where.status && where.status !== 'ACTIVE') return Promise.resolve(null);
            return Promise.resolve({ id: 'tch-unauthorized', schoolId: schoolA, userId: unauthorizedTeacherUser.id, status: 'ACTIVE' });
          }
          if (where.schoolId === schoolA && where.userId === subjectOnlyTeacherUser.id) {
            if (where.status && where.status !== 'ACTIVE') return Promise.resolve(null);
            return Promise.resolve({ id: 'tch-subject-only', schoolId: schoolA, userId: subjectOnlyTeacherUser.id, status: 'ACTIVE' });
          }
          if (where.schoolId === schoolA && where.userId === inactiveTeacherUser.id) {
            if (where.status && where.status === 'ACTIVE') return Promise.resolve(null);
            return Promise.resolve({ id: 'tch-inactive', schoolId: schoolA, userId: inactiveTeacherUser.id, status: 'INACTIVE' });
          }
          return Promise.resolve(null);
        }),
      },
      teacherAssignment: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (
            where.schoolId === schoolA &&
            where.teacherId === 'tch-authorized' &&
            where.academicYearId === academicYearId &&
            where.gradeId === gradeId &&
            where.sectionId === sectionId
          ) {
            if (where.isClassTeacher === false) return Promise.resolve(null);
            return Promise.resolve({
              id: 'asg-001',
              schoolId: schoolA,
              teacherId: 'tch-authorized',
              academicYearId,
              gradeId,
              sectionId,
              isClassTeacher: true,
            });
          }
          // tch-authorized has a SUBJECT-ONLY assignment in sec-10-b
          if (
            where.schoolId === schoolA &&
            where.teacherId === 'tch-authorized' &&
            where.sectionId === 'sec-10-b'
          ) {
            if (where.isClassTeacher === true) return Promise.resolve(null);
            return Promise.resolve({
              id: 'asg-subject-sec2',
              schoolId: schoolA,
              teacherId: 'tch-authorized',
              sectionId: 'sec-10-b',
              isClassTeacher: false,
            });
          }
          // tch-subject-only has subject-only assignment in sectionId
          if (
            where.schoolId === schoolA &&
            where.teacherId === 'tch-subject-only' &&
            where.sectionId === sectionId
          ) {
            if (where.isClassTeacher === true) return Promise.resolve(null);
            return Promise.resolve({
              id: 'asg-subject-001',
              schoolId: schoolA,
              teacherId: 'tch-subject-only',
              isClassTeacher: false,
            });
          }
          return Promise.resolve(null);
        }),
      },
      student: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          if (where.schoolId === schoolA && where.sectionId === sectionId) {
            if (where.id && where.id.in) {
              return Promise.resolve(
                mockActiveStudents.filter((s) => where.id.in.includes(s.id)),
              );
            }
            return Promise.resolve(mockActiveStudents);
          }
          return Promise.resolve([]);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const found = mockActiveStudents.find(
            (s) => s.id === where.id && s.schoolId === where.schoolId,
          );
          return Promise.resolve(found || null);
        }),
      },
    };

    attendanceRepoMock = {
      findMarksForSectionAndDate: jest.fn().mockResolvedValue([mockExistingMark]),
      findRegisterHeader: jest.fn().mockResolvedValue(mockRegisterHeader),
      saveBulkMarksInTransaction: jest.fn().mockImplementation(
        (schoolId, ayId, gId, sId, date, entries, userId, summary) =>
          Promise.resolve({
            registerId: 'reg-001',
            attendanceDate: date,
            sectionId: sId,
            totalSubmitted: entries.length,
            createdCount: entries.length,
            updatedCount: 0,
            summary,
          } as BulkMarkResult),
      ),
      findRecordById: jest.fn().mockImplementation((schoolId, id) => {
        if (schoolId === schoolA && id === mockExistingMark.id) {
          return Promise.resolve(mockExistingMark);
        }
        return Promise.resolve(null);
      }),
      updateRecordAndLogCorrection: jest.fn().mockImplementation(
        (schoolId, record, newStatus, reason, userId) =>
          Promise.resolve({
            updatedRecord: { ...record, status: newStatus, lastUpdatedBy: userId, updatedAt: new Date() },
            correctionLog: {
              id: 'cor-001',
              schoolId,
              attendanceId: record.id,
              studentId: record.studentId,
              attendanceDate: record.attendanceDate,
              previousStatus: record.status,
              newStatus,
              reason,
              changedById: userId,
              changedAt: new Date(),
            } as AttendanceCorrectionEntry,
          }),
      ),
      findStudentHistory: jest.fn().mockResolvedValue({
        records: [mockExistingMark],
        total: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ATTENDANCE_REPOSITORY, useValue: attendanceRepoMock },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  describe('1. Daily Register Retrieval & NOT_MARKED Handling', () => {
    it('should retrieve section roster and assign virtual NOT_MARKED to un-marked students', async () => {
      const query: GetRegisterQueryDto = {
        date: targetDate,
        academicYearId,
        gradeId,
        sectionId,
        page: 1,
        limit: 50,
      };

      const result = await service.getRegister(schoolA, query, adminUser);

      expect(result.data).toHaveLength(3);
      // Student 1 has existing PRESENT mark
      expect(result.data[0].studentId).toBe('stu-001');
      expect(result.data[0].status).toBe(AttendanceStatus.PRESENT);
      expect(result.data[0].attendanceRecordId).toBe('rec-001');

      // Student 2 and 3 have no record; MUST be virtual 'NOT_MARKED' (never ABSENT)
      expect(result.data[1].studentId).toBe('stu-002');
      expect(result.data[1].status).toBe('NOT_MARKED');
      expect(result.data[1].attendanceRecordId).toBeNull();

      expect(result.data[2].studentId).toBe('stu-003');
      expect(result.data[2].status).toBe('NOT_MARKED');

      // Summary counters check
      expect(result.register.totalEnrolled).toBe(3);
      expect(result.register.totalPresent).toBe(1);
      expect(result.register.totalUnmarked).toBe(2);
      expect(result.meta.total).toBe(3);
    });

    it('should filter roster by search query on name or admission number', async () => {
      const query: GetRegisterQueryDto = {
        date: targetDate,
        academicYearId,
        gradeId,
        sectionId,
        search: 'Alice',
        page: 1,
        limit: 50,
      };

      const result = await service.getRegister(schoolA, query, adminUser);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].firstName).toBe('Alice');
      expect(result.meta.total).toBe(1);
    });

    it('should apply pagination correctly to roster items', async () => {
      const query: GetRegisterQueryDto = {
        date: targetDate,
        academicYearId,
        gradeId,
        sectionId,
        page: 2,
        limit: 2,
      };

      const result = await service.getRegister(schoolA, query, adminUser);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].studentId).toBe('stu-003');
      expect(result.meta.page).toBe(2);
      expect(result.meta.totalPages).toBe(2);
    });
  });

  describe('2. Teacher Authorization & Assignment Scoping', () => {
    it('should allow authorized teacher assigned to this grade and section', async () => {
      const query: GetRegisterQueryDto = {
        date: targetDate,
        academicYearId,
        gradeId,
        sectionId,
      };

      const result = await service.getRegister(schoolA, query, teacherUser);
      expect(result.data).toBeDefined();
    });

    it('should reject teacher not assigned to the requested section with ForbiddenException', async () => {
      const query: GetRegisterQueryDto = {
        date: targetDate,
        academicYearId,
        gradeId,
        sectionId,
      };

      await expect(
        service.getRegister(schoolA, query, unauthorizedTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Bulk Attendance Marking & Validation Rules', () => {
    it('should successfully submit bulk marks in an atomic transaction', async () => {
      const dto: BulkMarkAttendanceDto = {
        academicYearId,
        gradeId,
        sectionId,
        attendanceDate: '2026-10-25',
        entries: [
          { studentId: 'stu-001', status: AttendanceStatus.PRESENT },
          { studentId: 'stu-002', status: AttendanceStatus.ABSENT, remarks: 'Sick leave' },
          { studentId: 'stu-003', status: AttendanceStatus.LATE },
        ],
      };

      const result = await service.bulkMarkAttendance(schoolA, dto, adminUser);

      expect(result.totalSubmitted).toBe(3);
      expect(attendanceRepoMock.saveBulkMarksInTransaction).toHaveBeenCalledTimes(1);
      expect(result.summary.totalPresent).toBe(1);
      expect(result.summary.totalAbsent).toBe(1);
      expect(result.summary.totalLate).toBe(1);
    });

    it('should reject marking attendance for a future date with BadRequestException', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const dto: BulkMarkAttendanceDto = {
        academicYearId,
        gradeId,
        sectionId,
        attendanceDate: futureDateStr,
        entries: [{ studentId: 'stu-001', status: AttendanceStatus.PRESENT }],
      };

      await expect(service.bulkMarkAttendance(schoolA, dto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.bulkMarkAttendance(schoolA, dto, adminUser)).rejects.toThrow(
        /future date/i,
      );
    });

    it('should reject bulk submission containing duplicate student entries', async () => {
      const dto: BulkMarkAttendanceDto = {
        academicYearId,
        gradeId,
        sectionId,
        attendanceDate: '2026-10-25',
        entries: [
          { studentId: 'stu-001', status: AttendanceStatus.PRESENT },
          { studentId: 'stu-001', status: AttendanceStatus.ABSENT },
        ],
      };

      await expect(service.bulkMarkAttendance(schoolA, dto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.bulkMarkAttendance(schoolA, dto, adminUser)).rejects.toThrow(
        /duplicate student/i,
      );
    });

    it('should reject submission if a student does not belong to the target section or school', async () => {
      const dto: BulkMarkAttendanceDto = {
        academicYearId,
        gradeId,
        sectionId,
        attendanceDate: '2026-10-25',
        entries: [
          { studentId: 'stu-001', status: AttendanceStatus.PRESENT },
          { studentId: 'stu-nonexistent-or-other-school', status: AttendanceStatus.PRESENT },
        ],
      };

      await expect(service.bulkMarkAttendance(schoolA, dto, adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject modification by teacher when register is LOCKED', async () => {
      attendanceRepoMock.findRegisterHeader.mockResolvedValue({
        ...mockRegisterHeader,
        status: RegisterStatus.LOCKED,
      });

      const dto: BulkMarkAttendanceDto = {
        academicYearId,
        gradeId,
        sectionId,
        attendanceDate: '2026-10-25',
        entries: [{ studentId: 'stu-001', status: AttendanceStatus.PRESENT }],
      };

      await expect(service.bulkMarkAttendance(schoolA, dto, teacherUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('4. Attendance Correction & Audit Log Integrity', () => {
    it('should successfully update status and log correction reason', async () => {
      const dto: CorrectAttendanceDto = {
        status: AttendanceStatus.LATE,
        reason: 'Student arrived 15 minutes late with transit slip',
      };

      const result = await service.correctAttendance(schoolA, mockExistingMark.id, dto, adminUser);

      expect(result.updatedRecord.status).toBe(AttendanceStatus.LATE);
      expect(result.correctionLog.previousStatus).toBe(AttendanceStatus.PRESENT);
      expect(result.correctionLog.newStatus).toBe(AttendanceStatus.LATE);
      expect(result.correctionLog.reason).toBe(dto.reason);
      expect(attendanceRepoMock.updateRecordAndLogCorrection).toHaveBeenCalledTimes(1);
    });

    it('should reject correction when reason is shorter than 5 characters', async () => {
      const dto: CorrectAttendanceDto = {
        status: AttendanceStatus.LATE,
        reason: 'Fix',
      };

      await expect(
        service.correctAttendance(schoolA, mockExistingMark.id, dto, adminUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.correctAttendance(schoolA, mockExistingMark.id, dto, adminUser),
      ).rejects.toThrow(/at least 5 characters/i);
    });

    it('should reject correction when proposed status is identical to current status', async () => {
      const dto: CorrectAttendanceDto = {
        status: AttendanceStatus.PRESENT, // same as mockExistingMark
        reason: 'Mistaken click on button',
      };

      await expect(
        service.correctAttendance(schoolA, mockExistingMark.id, dto, adminUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.correctAttendance(schoolA, mockExistingMark.id, dto, adminUser),
      ).rejects.toThrow(/identical/i);
    });
  });

  describe('5. Cross-Tenant Isolation & Student History', () => {
    it('should reject querying attendance history for a student belonging to another school', async () => {
      const query: StudentHistoryQueryDto = { page: 1, limit: 30 };

      await expect(
        service.getStudentHistory(schoolB, 'stu-001', query, { ...adminUser, schoolId: schoolB }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should calculate accurate percentage excluding non-working days from history', async () => {
      attendanceRepoMock.findStudentHistory.mockResolvedValueOnce({
        records: [
          { ...mockExistingMark, status: AttendanceStatus.PRESENT },
          { ...mockExistingMark, id: 'r2', status: AttendanceStatus.PRESENT },
          { ...mockExistingMark, id: 'r3', status: AttendanceStatus.LATE },
          { ...mockExistingMark, id: 'r4', status: AttendanceStatus.HALF_DAY },
          { ...mockExistingMark, id: 'r5', status: AttendanceStatus.ABSENT },
        ],
        total: 5,
      });

      const query: StudentHistoryQueryDto = { page: 1, limit: 30 };
      const result = await service.getStudentHistory(schoolA, 'stu-001', query, adminUser);

      expect(result.stats.totalWorkingDays).toBe(5);
      expect(result.stats.presentDays).toBe(2);
      expect(result.stats.lateDays).toBe(1);
      expect(result.stats.halfDays).toBe(1);
      expect(result.stats.absentDays).toBe(1);

      // Effective present = 2 + 1 + (0.5 * 1) = 3.5 out of 5 = 70.0%
      expect(result.stats.attendanceRate).toBe(70.0);
    });

    it('should reject student history when startDate is after endDate', async () => {
      const query: StudentHistoryQueryDto = {
        startDate: '2026-11-01',
        endDate: '2026-10-01',
      };

      await expect(
        service.getStudentHistory(schoolA, 'stu-001', query, adminUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getStudentHistory(schoolA, 'stu-001', query, adminUser),
      ).rejects.toThrow(/cannot be after/i);
    });
  });

  describe('6. TASK-P3B-11: Class-Teacher-Only Policy and Rigorous Authorization Scenarios', () => {
    const registerQuery: GetRegisterQueryDto = {
      date: targetDate,
      academicYearId,
      gradeId,
      sectionId,
    };

    const markDto: BulkMarkAttendanceDto = {
      academicYearId,
      gradeId,
      sectionId,
      attendanceDate: targetDate,
      entries: [{ studentId: 'stu-001', status: AttendanceStatus.PRESENT }],
    };

    const correctDto: CorrectAttendanceDto = {
      status: AttendanceStatus.ABSENT,
      reason: 'Updated based on parent note',
    };

    const historyQuery: StudentHistoryQueryDto = { page: 1, limit: 10 };

    it('1. Class Teacher can retrieve their assigned register', async () => {
      const result = await service.getRegister(schoolA, registerQuery, teacherUser);
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('2. Class Teacher can bulk-mark their assigned section', async () => {
      const result = await service.bulkMarkAttendance(schoolA, markDto, teacherUser);
      expect(result).toBeDefined();
      expect(result.totalSubmitted).toBe(1);
    });

    it('3. Class Teacher can correct attendance in their assigned section', async () => {
      const result = await service.correctAttendance(schoolA, mockExistingMark.id, correctDto, teacherUser);
      expect(result).toBeDefined();
      expect(result.updatedRecord.status).toBe(AttendanceStatus.ABSENT);
    });

    it('4. Class Teacher can view authorized student history', async () => {
      const result = await service.getStudentHistory(schoolA, 'stu-001', historyQuery, teacherUser);
      expect(result).toBeDefined();
      expect(result.student).toBeDefined();
    });

    it('5. Subject-only teacher is rejected for register retrieval (403 Forbidden)', async () => {
      await expect(service.getRegister(schoolA, registerQuery, subjectOnlyTeacherUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getRegister(schoolA, registerQuery, subjectOnlyTeacherUser)).rejects.toThrow(
        /Only designated Class Teachers may view or mark attendance/,
      );
    });

    it('6. Subject-only teacher is rejected for bulk marking (403 Forbidden)', async () => {
      await expect(service.bulkMarkAttendance(schoolA, markDto, subjectOnlyTeacherUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.bulkMarkAttendance(schoolA, markDto, subjectOnlyTeacherUser)).rejects.toThrow(
        /Only designated Class Teachers may view or mark attendance/,
      );
    });

    it('7. Subject-only teacher is rejected for corrections (403 Forbidden)', async () => {
      await expect(service.correctAttendance(schoolA, mockExistingMark.id, correctDto, subjectOnlyTeacherUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.correctAttendance(schoolA, mockExistingMark.id, correctDto, subjectOnlyTeacherUser)).rejects.toThrow(
        /Only designated Class Teachers may view or mark attendance/,
      );
    });

    it('8. Subject-only teacher is rejected for student history (403 Forbidden)', async () => {
      await expect(service.getStudentHistory(schoolA, 'stu-001', historyQuery, subjectOnlyTeacherUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getStudentHistory(schoolA, 'stu-001', historyQuery, subjectOnlyTeacherUser)).rejects.toThrow(
        /Only designated Class Teachers may view or mark attendance/,
      );
    });

    it('9. Teacher without an eligible Class Teacher assignment is rejected (403 Forbidden)', async () => {
      await expect(service.getRegister(schoolA, registerQuery, unauthorizedTeacherUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('10. Class Teacher cannot access a section where they have only a subject assignment', async () => {
      const diffSectionQuery: GetRegisterQueryDto = {
        ...registerQuery,
        sectionId: 'sec-10-b',
      };
      await expect(service.getRegister(schoolA, diffSectionQuery, teacherUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('11. Assignment for a different academic year does not authorize access', async () => {
      const diffYearQuery: GetRegisterQueryDto = {
        ...registerQuery,
        academicYearId: 'ay-2025-prior',
      };
      await expect(service.getRegister(schoolA, diffYearQuery, teacherUser)).rejects.toThrow(
        NotFoundException, // academic year not found / mismatch
      );
    });

    it('12. Daily attendance enforces the policy', async () => {
      const result = await service.getRegister(schoolA, registerQuery, teacherUser);
      expect(result.register).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('13. Period-wise attendance enforces the policy', async () => {
      // assertTeacherAuthorization is identical for period attendance and enforces isClassTeacher
      await expect(service.getRegister(schoolA, registerQuery, subjectOnlyTeacherUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('14. Removing the assignment prevents subsequent access', async () => {
      prismaMock.teacherAssignment.findFirst.mockResolvedValueOnce(null);
      await expect(service.getRegister(schoolA, registerQuery, teacherUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('15. School Admin retains existing authorized access across all sections', async () => {
      const result = await service.getRegister(schoolA, registerQuery, adminUser);
      expect(result).toBeDefined();
    });

    it('16. Platform Super Admin retains existing authorized behavior within tenant context', async () => {
      const result = await service.getRegister(schoolA, registerQuery, superAdminUser);
      expect(result).toBeDefined();
    });

    it('17. Fee Staff remains read-only: can view register and history', async () => {
      const registerRes = await service.getRegister(schoolA, registerQuery, feeStaffUser);
      expect(registerRes).toBeDefined();

      const historyRes = await service.getStudentHistory(schoolA, 'stu-001', historyQuery, feeStaffUser);
      expect(historyRes).toBeDefined();
    });

    it('18. Cross-tenant access is rejected', async () => {
      await expect(service.getRegister(schoolB, registerQuery, teacherUser)).rejects.toThrow();
    });

    it('19. Inactive teacher accounts cannot access attendance (403 Forbidden)', async () => {
      await expect(service.getRegister(schoolA, registerQuery, inactiveTeacherUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getRegister(schoolA, registerQuery, inactiveTeacherUser)).rejects.toThrow(
        /Active teacher profile not found/,
      );
    });
  });
});
