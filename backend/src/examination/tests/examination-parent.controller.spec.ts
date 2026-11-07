import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ExaminationParentController } from '../controllers/examination-parent.controller';
import { ExaminationStudentAttemptsService } from '../services/examination-student-attempts.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ROLES_KEY } from '../../common/auth/roles.decorator';

describe('ExaminationParentController - Unit Tests', () => {
  let controller: ExaminationParentController;
  let serviceMock: any;
  let reflector: Reflector;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockStudentId = '00000000-0000-0000-0000-000000000088';
  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';

  const mockReq = {
    user: {
      id: 'parent-user-01',
      email: 'parent@home.org',
      role: UserRole.PARENT,
      schoolId: mockSchoolId,
    },
  };

  beforeEach(async () => {
    serviceMock = {
      getParentStudentAssessments: jest.fn(),
      getParentAssessmentResult: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExaminationParentController],
      providers: [
        Reflector,
        {
          provide: ExaminationStudentAttemptsService,
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

    controller = module.get<ExaminationParentController>(ExaminationParentController);
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Route role annotations', () => {
    it('requires PARENT role for getParentStudentAssessments', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getParentStudentAssessments);
      expect(roles).toEqual([UserRole.PARENT]);
    });

    it('requires PARENT role for getParentAssessmentResult', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getParentAssessmentResult);
      expect(roles).toEqual([UserRole.PARENT]);
    });
  });

  describe('Endpoint delegation', () => {
    it('delegates getParentStudentAssessments to service with validated schoolId and studentId', async () => {
      serviceMock.getParentStudentAssessments.mockResolvedValue({
        studentId: mockStudentId,
        assessments: [],
      });

      const res = await controller.getParentStudentAssessments(
        mockReq,
        mockStudentId,
      );

      expect(serviceMock.getParentStudentAssessments).toHaveBeenCalledWith(
        mockSchoolId,
        mockStudentId,
        mockReq.user,
      );
      expect(res.studentId).toBe(mockStudentId);
      expect(res.assessments).toEqual([]);
    });

    it('prioritizes TenantGuard req.school.id over client headers when delegating parent endpoints', async () => {
      const tenantValidatedSchoolId = '00000000-0000-0000-0000-000000000077';
      const reqWithSchool = {
        school: { id: tenantValidatedSchoolId },
        user: {
          ...mockReq.user,
          schoolId: tenantValidatedSchoolId,
        },
      };

      serviceMock.getParentStudentAssessments.mockResolvedValue({
        studentId: mockStudentId,
        assessments: [],
      });

      await controller.getParentStudentAssessments(reqWithSchool, mockStudentId);

      expect(serviceMock.getParentStudentAssessments).toHaveBeenCalledWith(
        tenantValidatedSchoolId,
        mockStudentId,
        reqWithSchool.user,
      );
    });

    it('delegates getParentAssessmentResult to service with studentId and assessmentId', async () => {
      serviceMock.getParentAssessmentResult.mockResolvedValue({
        assessmentId: mockAssessmentId,
        hasAttempt: true,
      });

      const res = await controller.getParentAssessmentResult(
        mockReq,
        mockStudentId,
        mockAssessmentId,
      );

      expect(serviceMock.getParentAssessmentResult).toHaveBeenCalledWith(
        mockSchoolId,
        mockStudentId,
        mockAssessmentId,
        mockReq.user,
      );
      expect(res.assessmentId).toBe(mockAssessmentId);
    });
  });

  describe('Route UUID parameter validation', () => {
    const pipe = new ParseUUIDPipe();

    it('accepts valid UUID strings', async () => {
      const valid = '00000000-0000-0000-0000-000000000099';
      await expect(pipe.transform(valid, { type: 'param', data: 'studentId' })).resolves.toBe(valid);
      await expect(pipe.transform(valid, { type: 'param', data: 'assessmentId' })).resolves.toBe(valid);
    });

    it('rejects invalid UUID parameter with BadRequestException', async () => {
      await expect(
        pipe.transform('invalid-student-id', { type: 'param', data: 'studentId' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        pipe.transform('invalid-assessment-id', { type: 'param', data: 'assessmentId' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
