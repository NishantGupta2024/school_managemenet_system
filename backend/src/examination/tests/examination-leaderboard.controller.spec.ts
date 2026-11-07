import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ExaminationLeaderboardController } from '../controllers/examination-leaderboard.controller';
import { ExaminationLeaderboardService } from '../services/examination-leaderboard.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ROLES_KEY } from '../../common/auth/roles.decorator';

describe('ExaminationLeaderboardController - Unit Tests', () => {
  let controller: ExaminationLeaderboardController;
  let serviceMock: any;
  let reflector: Reflector;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockStudentId = '00000000-0000-0000-0000-000000000088';
  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';

  const mockStudentReq = {
    school: { id: mockSchoolId },
    user: {
      id: 'student-user-01',
      email: 'student@school.edu',
      role: UserRole.STUDENT,
      schoolId: mockSchoolId,
    },
  };

  const mockParentReq = {
    school: { id: mockSchoolId },
    user: {
      id: 'parent-user-01',
      email: 'parent@home.edu',
      role: UserRole.PARENT,
      schoolId: mockSchoolId,
    },
  };

  const mockTeacherReq = {
    school: { id: mockSchoolId },
    user: {
      id: 'teacher-user-01',
      email: 'teacher@school.edu',
      role: UserRole.TEACHER,
      schoolId: mockSchoolId,
    },
  };

  const mockAdminReq = {
    school: { id: mockSchoolId },
    user: {
      id: 'admin-user-01',
      email: 'admin@school.edu',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: mockSchoolId,
    },
  };

  const mockSuperAdminReq = {
    user: {
      id: 'super-user-01',
      email: 'super@platform.org',
      role: UserRole.PLATFORM_SUPER_ADMIN,
    },
  };

  beforeEach(async () => {
    serviceMock = {
      getStudentLeaderboard: jest.fn(),
      getParentLeaderboard: jest.fn(),
      getStaffLeaderboard: jest.fn(),
      getLeaderboardPrivacySetting: jest.fn(),
      updateLeaderboardPrivacySetting: jest.fn(),
      getPlatformLeaderboardMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExaminationLeaderboardController],
      providers: [
        Reflector,
        {
          provide: ExaminationLeaderboardService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExaminationLeaderboardController>(
      ExaminationLeaderboardController,
    );
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Route role annotations', () => {
    it('requires STUDENT role for getStudentLeaderboard', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getStudentLeaderboard,
      );
      expect(roles).toEqual([UserRole.STUDENT]);
    });

    it('requires PARENT role for getParentLeaderboard', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getParentLeaderboard,
      );
      expect(roles).toEqual([UserRole.PARENT]);
    });

    it('requires TEACHER and SCHOOL_ADMIN roles for getStaffLeaderboard', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getStaffLeaderboard,
      );
      expect(roles).toEqual([UserRole.TEACHER, UserRole.SCHOOL_ADMIN]);
    });

    it('requires SCHOOL_ADMIN role for getLeaderboardPrivacySetting', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getLeaderboardPrivacySetting,
      );
      expect(roles).toEqual([UserRole.SCHOOL_ADMIN]);
    });

    it('requires SCHOOL_ADMIN role for updateLeaderboardPrivacySetting', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.updateLeaderboardPrivacySetting,
      );
      expect(roles).toEqual([UserRole.SCHOOL_ADMIN]);
    });

    it('requires PLATFORM_SUPER_ADMIN role for getPlatformLeaderboardMetrics', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getPlatformLeaderboardMetrics,
      );
      expect(roles).toEqual([UserRole.PLATFORM_SUPER_ADMIN]);
    });
  });

  describe('Controller delegation to service', () => {
    it('delegates getStudentLeaderboard with schoolId, assessmentId, query and user', async () => {
      serviceMock.getStudentLeaderboard.mockResolvedValue({
        assessmentId: mockAssessmentId,
        entries: [],
      });

      const query = { page: 1, limit: 10 };
      await controller.getStudentLeaderboard(mockStudentReq, mockAssessmentId, query);

      expect(serviceMock.getStudentLeaderboard).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        query,
        mockStudentReq.user,
      );
    });

    it('delegates getParentLeaderboard with schoolId, studentId, assessmentId, query and user', async () => {
      serviceMock.getParentLeaderboard.mockResolvedValue({
        assessmentId: mockAssessmentId,
        entries: [],
      });

      const query = { page: 1, limit: 20 };
      await controller.getParentLeaderboard(
        mockParentReq,
        mockStudentId,
        mockAssessmentId,
        query,
      );

      expect(serviceMock.getParentLeaderboard).toHaveBeenCalledWith(
        mockSchoolId,
        mockStudentId,
        mockAssessmentId,
        query,
        mockParentReq.user,
      );
    });

    it('delegates getStaffLeaderboard with schoolId, assessmentId, query and user', async () => {
      serviceMock.getStaffLeaderboard.mockResolvedValue({
        assessmentId: mockAssessmentId,
        entries: [],
      });

      const query = { page: 2, limit: 15 };
      await controller.getStaffLeaderboard(mockTeacherReq, mockAssessmentId, query);

      expect(serviceMock.getStaffLeaderboard).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        query,
        mockTeacherReq.user,
      );
    });

    it('delegates getLeaderboardPrivacySetting with schoolId and user', async () => {
      serviceMock.getLeaderboardPrivacySetting.mockResolvedValue({
        schoolId: mockSchoolId,
        showStudentNamesOnLeaderboards: false,
      });

      await controller.getLeaderboardPrivacySetting(mockAdminReq);

      expect(serviceMock.getLeaderboardPrivacySetting).toHaveBeenCalledWith(
        mockSchoolId,
        mockAdminReq.user,
      );
    });

    it('delegates updateLeaderboardPrivacySetting with schoolId, dto and user', async () => {
      const dto = { showStudentNamesOnLeaderboards: true };
      serviceMock.updateLeaderboardPrivacySetting.mockResolvedValue({
        schoolId: mockSchoolId,
        showStudentNamesOnLeaderboards: true,
      });

      await controller.updateLeaderboardPrivacySetting(mockAdminReq, dto);

      expect(serviceMock.updateLeaderboardPrivacySetting).toHaveBeenCalledWith(
        mockSchoolId,
        dto,
        mockAdminReq.user,
      );
    });

    it('delegates getPlatformLeaderboardMetrics with user', async () => {
      serviceMock.getPlatformLeaderboardMetrics.mockResolvedValue({
        totalSchoolsReporting: 3,
      });

      await controller.getPlatformLeaderboardMetrics(mockSuperAdminReq);

      expect(serviceMock.getPlatformLeaderboardMetrics).toHaveBeenCalledWith(
        mockSuperAdminReq.user,
      );
    });
  });

  describe('Route UUID parameter validation', () => {
    const pipe = new ParseUUIDPipe();

    it('accepts valid UUID strings', async () => {
      const valid = '00000000-0000-0000-0000-000000000888';
      await expect(pipe.transform(valid, { type: 'param', data: 'assessmentId' })).resolves.toBe(valid);
    });

    it('rejects invalid UUID parameter with BadRequestException', async () => {
      await expect(
        pipe.transform('invalid-uuid-format', { type: 'param', data: 'assessmentId' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
