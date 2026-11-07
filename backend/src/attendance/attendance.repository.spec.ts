import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceStatus as PrismaAttendanceStatus,
  AttendanceType as PrismaAttendanceType,
  RegisterStatus as PrismaRegisterStatus,
} from '@prisma/client';
import { AttendancePrismaRepository } from './attendance.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus, RegisterStatus, StudentAttendanceRecord } from './types';

describe('AttendancePrismaRepository — Unit Tests', () => {
  let repository: AttendancePrismaRepository;
  let prismaMock: any;

  const schoolId = '11111111-1111-1111-1111-111111111111';
  const sectionId = 'sec-1';
  const studentId = 'stu-1';
  const academicYearId = 'ay-1';
  const gradeId = 'grd-1';
  const dateStr = '2026-10-25';
  const dateObj = new Date(dateStr);

  const mockDbRecord = {
    id: 'att-1',
    schoolId,
    registerId: 'reg-1',
    studentId,
    academicYearId,
    gradeId,
    sectionId,
    attendanceDate: dateObj,
    attendanceType: PrismaAttendanceType.DAILY,
    periodNumber: 0,
    status: PrismaAttendanceStatus.PRESENT,
    remarks: 'Present on time',
    markedById: 'usr-1',
    markedAt: new Date(),
    lastUpdatedBy: null,
    updatedAt: new Date(),
  };

  const mockDbRegister = {
    id: 'reg-1',
    schoolId,
    academicYearId,
    gradeId,
    sectionId,
    attendanceDate: dateObj,
    attendanceType: PrismaAttendanceType.DAILY,
    periodNumber: 0,
    status: PrismaRegisterStatus.SUBMITTED,
    totalEnrolled: 10,
    totalPresent: 8,
    totalAbsent: 2,
    totalLate: 0,
    totalHalfDay: 0,
    totalExcused: 0,
    submittedById: 'usr-1',
    submittedAt: new Date(),
    lockedById: null,
    lockedAt: null,
    remarks: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
      studentAttendance: {
        findMany: jest.fn().mockResolvedValue([mockDbRecord]),
        findFirst: jest.fn().mockResolvedValue(mockDbRecord),
        findUnique: jest.fn().mockResolvedValue(mockDbRecord),
        create: jest.fn().mockResolvedValue(mockDbRecord),
        update: jest.fn().mockResolvedValue(mockDbRecord),
        count: jest.fn().mockResolvedValue(1),
      },
      attendanceRegister: {
        findUnique: jest.fn().mockResolvedValue(mockDbRegister),
        upsert: jest.fn().mockResolvedValue(mockDbRegister),
      },
      attendanceCorrectionLog: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'log-1',
            ...data,
            changedAt: new Date(),
          }),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendancePrismaRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<AttendancePrismaRepository>(AttendancePrismaRepository);
  });

  it('findMarksForSectionAndDate should query studentAttendance and format date', async () => {
    const marks = await repository.findMarksForSectionAndDate(schoolId, sectionId, dateStr);

    expect(marks).toHaveLength(1);
    expect(marks[0].attendanceDate).toBe(dateStr);
    expect(marks[0].status).toBe(AttendanceStatus.PRESENT);
    expect(prismaMock.studentAttendance.findMany).toHaveBeenCalledWith({
      where: {
        schoolId,
        sectionId,
        attendanceDate: expect.any(Date),
        attendanceType: PrismaAttendanceType.DAILY,
        periodNumber: 0,
      },
    });
  });

  it('findRegisterHeader should query attendanceRegister and return formatted summary', async () => {
    const header = await repository.findRegisterHeader(schoolId, sectionId, dateStr);

    expect(header).toBeDefined();
    expect(header?.attendanceDate).toBe(dateStr);
    expect(header?.status).toBe(RegisterStatus.SUBMITTED);
  });

  it('findRegisterHeader should return null if no register exists', async () => {
    prismaMock.attendanceRegister.findUnique.mockResolvedValueOnce(null);

    const header = await repository.findRegisterHeader(schoolId, sectionId, dateStr);
    expect(header).toBeNull();
  });

  it('saveBulkMarksInTransaction should execute transactional upsert for header and marks', async () => {
    const result = await repository.saveBulkMarksInTransaction(
      schoolId,
      academicYearId,
      gradeId,
      sectionId,
      dateStr,
      [{ studentId, status: AttendanceStatus.PRESENT }],
      'usr-1',
      {
        totalEnrolled: 1,
        totalPresent: 1,
        totalAbsent: 0,
        totalLate: 0,
        totalHalfDay: 0,
        totalExcused: 0,
        totalUnmarked: 0,
        status: RegisterStatus.SUBMITTED,
        isLocked: false,
      },
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(result.totalSubmitted).toBe(1);
    expect(result.registerId).toBe('reg-1');
  });

  it('findRecordById should locate attendance entry', async () => {
    const record = await repository.findRecordById(schoolId, 'att-1');

    expect(record).toBeDefined();
    expect(record?.id).toBe('att-1');
  });

  it('updateRecordAndLogCorrection should execute transactional update and audit log', async () => {
    const record: StudentAttendanceRecord = {
      id: 'att-1',
      schoolId,
      registerId: 'reg-1',
      studentId,
      academicYearId,
      gradeId,
      sectionId,
      attendanceDate: dateStr,
      attendanceType: 'DAILY' as any,
      periodNumber: 0,
      status: AttendanceStatus.PRESENT,
      remarks: null,
      markedById: 'usr-1',
      markedAt: new Date(),
      lastUpdatedBy: null,
      updatedAt: new Date(),
    };

    const res = await repository.updateRecordAndLogCorrection(
      schoolId,
      record,
      AttendanceStatus.LATE,
      'Traffic delay note',
      'usr-2',
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(res.correctionLog.newStatus).toBe(AttendanceStatus.LATE);
    expect(res.correctionLog.reason).toBe('Traffic delay note');
  });

  it('findStudentHistory should return paginated history and total count', async () => {
    const history = await repository.findStudentHistory(schoolId, studentId, {
      page: 1,
      limit: 10,
    });

    expect(history.total).toBe(1);
    expect(history.records).toHaveLength(1);
    expect(history.records[0].attendanceDate).toBe(dateStr);
  });
});
