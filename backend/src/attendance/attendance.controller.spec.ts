import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus } from './types';
import { GetRegisterQueryDto } from './dto/get-register-query.dto';
import { BulkMarkAttendanceDto } from './dto/bulk-mark-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { StudentHistoryQueryDto } from './dto/student-history-query.dto';

describe('AttendanceController — Unit Tests & Route Handler Verification', () => {
  let controller: AttendanceController;
  let serviceMock: Partial<Record<keyof AttendanceService, jest.Mock>>;

  const mockSchoolId = '11111111-1111-1111-1111-111111111111';
  const mockReq = {
    school: { id: mockSchoolId },
    user: {
      id: 'usr-001',
      email: 'admin@school.com',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: mockSchoolId,
    },
  };

  beforeEach(async () => {
    serviceMock = {
      getRegister: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
      bulkMarkAttendance: jest.fn().mockResolvedValue({ totalSubmitted: 1 }),
      correctAttendance: jest.fn().mockResolvedValue({ success: true }),
      getStudentHistory: jest.fn().mockResolvedValue({ student: {}, data: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: serviceMock,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  it('GET register should delegate to attendanceService.getRegister with schoolId and user', async () => {
    const query: GetRegisterQueryDto = {
      date: '2026-10-25',
      academicYearId: 'ay-1',
      gradeId: 'grd-1',
      sectionId: 'sec-1',
    };

    await controller.getRegister(mockReq, query);

    expect(serviceMock.getRegister).toHaveBeenCalledWith(
      mockSchoolId,
      query,
      mockReq.user,
    );
  });

  it('POST register/bulk-mark should delegate to attendanceService.bulkMarkAttendance', async () => {
    const dto: BulkMarkAttendanceDto = {
      academicYearId: 'ay-1',
      gradeId: 'grd-1',
      sectionId: 'sec-1',
      attendanceDate: '2026-10-25',
      entries: [{ studentId: 'stu-1', status: AttendanceStatus.PRESENT }],
    };

    await controller.bulkMarkAttendance(mockReq, dto);

    expect(serviceMock.bulkMarkAttendance).toHaveBeenCalledWith(
      mockSchoolId,
      dto,
      mockReq.user,
    );
  });

  it('PATCH :id should delegate to attendanceService.correctAttendance with id and dto', async () => {
    const dto: CorrectAttendanceDto = {
      status: AttendanceStatus.LATE,
      reason: 'Late due to bus breakdown',
    };

    await controller.correctAttendance(mockReq, 'rec-1', dto);

    expect(serviceMock.correctAttendance).toHaveBeenCalledWith(
      mockSchoolId,
      'rec-1',
      dto,
      mockReq.user,
    );
  });

  it('GET students/:studentId should delegate to attendanceService.getStudentHistory', async () => {
    const query: StudentHistoryQueryDto = { page: 1, limit: 10 };

    await controller.getStudentHistory(mockReq, 'stu-1', query);

    expect(serviceMock.getStudentHistory).toHaveBeenCalledWith(
      mockSchoolId,
      'stu-1',
      query,
      mockReq.user,
    );
  });
});
