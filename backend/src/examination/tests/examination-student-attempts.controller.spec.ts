import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ExaminationStudentAttemptsController } from '../controllers/examination-student-attempts.controller';
import { ExaminationStudentAttemptsService } from '../services/examination-student-attempts.service';
import { ExaminationProgressionService } from '../services/examination-progression.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { SaveAnswerDto } from '../dto/save-answer.dto';
import { AttemptStatus } from '../types';

describe('ExaminationStudentAttemptsController - Unit Tests', () => {
  let controller: ExaminationStudentAttemptsController;
  let serviceMock: any;
  let progressionServiceMock: any;
  let reflector: Reflector;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';
  const mockAttemptId = '00000000-0000-0000-0000-000000000777';
  const mockChapterId = '00000000-0000-0000-0000-000000000666';

  const mockReq = {
    user: {
      id: 'user-student-01',
      email: 'student@school.edu',
      role: UserRole.STUDENT,
      schoolId: mockSchoolId,
    },
  };

  beforeEach(async () => {
    serviceMock = {
      listAssessmentsForStudent: jest.fn(),
      startAssessment: jest.fn(),
      getAttempt: jest.fn(),
      saveAnswer: jest.fn(),
      submitAttempt: jest.fn(),
      getStudentAssessmentResult: jest.fn(),
    };

    progressionServiceMock = {
      getChapterProgression: jest.fn(),
      listChaptersForStudent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExaminationStudentAttemptsController],
      providers: [
        Reflector,
        {
          provide: ExaminationStudentAttemptsService,
          useValue: serviceMock,
        },
        {
          provide: ExaminationProgressionService,
          useValue: progressionServiceMock,
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

    controller = module.get<ExaminationStudentAttemptsController>(
      ExaminationStudentAttemptsController,
    );
    reflector = module.get<Reflector>(Reflector);
  });

  describe('Route role annotations', () => {
    it('requires STUDENT role for all endpoints', () => {
      const endpoints = [
        controller.listAssessments,
        controller.startAssessment,
        controller.getAttempt,
        controller.saveAnswer,
        controller.submitAttempt,
        controller.getChapterProgression,
        controller.getAssessmentResult,
      ];
      for (const handler of endpoints) {
        const roles = reflector.get<string[]>(ROLES_KEY, handler);
        expect(roles).toEqual([UserRole.STUDENT]);
      }
    });
  });

  describe('Endpoint delegation', () => {
    it('delegates listChapters to progression service', async () => {
      progressionServiceMock.listChaptersForStudent.mockResolvedValue([
        { id: mockChapterId, chapterCode: 'CH-1', title: 'Test', subject: 'Math', orderIndex: 1 },
      ]);
      const res = await controller.listChapters(mockReq);
      expect(progressionServiceMock.listChaptersForStudent).toHaveBeenCalledWith(
        mockSchoolId,
        mockReq.user,
      );
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(mockChapterId);
    });

    it('delegates getChapterProgression to progression service', async () => {
      progressionServiceMock.getChapterProgression.mockResolvedValue({
        chapterId: mockChapterId,
        isUnlocked: true,
      });
      const res = await controller.getChapterProgression(mockReq, mockChapterId);
      expect(progressionServiceMock.getChapterProgression).toHaveBeenCalledWith(
        mockSchoolId,
        mockChapterId,
        mockReq.user,
      );
      expect(res.isUnlocked).toBe(true);
    });
    it('delegates listAssessments to service', async () => {
      serviceMock.listAssessmentsForStudent.mockResolvedValue([]);
      const res = await controller.listAssessments(mockReq);
      expect(serviceMock.listAssessmentsForStudent).toHaveBeenCalledWith(
        mockSchoolId,
        mockReq.user,
      );
      expect(res).toEqual([]);
    });

    it('delegates startAssessment to service', async () => {
      serviceMock.startAssessment.mockResolvedValue({ id: mockAttemptId });
      const res = await controller.startAssessment(mockReq, mockAssessmentId);
      expect(serviceMock.startAssessment).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        mockReq.user,
      );
      expect(res.id).toBe(mockAttemptId);
    });

    it('delegates getAttempt to service', async () => {
      serviceMock.getAttempt.mockResolvedValue({ id: mockAttemptId });
      const res = await controller.getAttempt(mockReq, mockAttemptId);
      expect(serviceMock.getAttempt).toHaveBeenCalledWith(
        mockSchoolId,
        mockAttemptId,
        mockReq.user,
      );
      expect(res.id).toBe(mockAttemptId);
    });

    it('delegates saveAnswer to service', async () => {
      const dto: SaveAnswerDto = { selectedOption: 2 };
      serviceMock.saveAnswer.mockResolvedValue({ success: true, selectedOption: 2 });
      const res = await controller.saveAnswer(mockReq, mockAttemptId, 'q-01', dto);
      expect(serviceMock.saveAnswer).toHaveBeenCalledWith(
        mockSchoolId,
        mockAttemptId,
        'q-01',
        dto,
        mockReq.user,
      );
      expect(res.success).toBe(true);
    });

    it('delegates submitAttempt to service', async () => {
      serviceMock.submitAttempt.mockResolvedValue({
        success: true,
        status: AttemptStatus.SUBMITTED,
      });
      const res = await controller.submitAttempt(mockReq, mockAttemptId);
      expect(serviceMock.submitAttempt).toHaveBeenCalledWith(
        mockSchoolId,
        mockAttemptId,
        mockReq.user,
      );
      expect(res.success).toBe(true);
    });

    it('delegates getAssessmentResult to service', async () => {
      serviceMock.getStudentAssessmentResult.mockResolvedValue({
        assessmentId: mockAssessmentId,
        hasAttempt: true,
      });
      const res = await controller.getAssessmentResult(mockReq, mockAssessmentId);
      expect(serviceMock.getStudentAssessmentResult).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        mockReq.user,
      );
      expect(res.assessmentId).toBe(mockAssessmentId);
    });
  });

  describe('Route UUID parameter validation', () => {
    const pipe = new ParseUUIDPipe();

    it('accepts valid UUID strings', async () => {
      const valid = '00000000-0000-0000-0000-000000000888';
      await expect(pipe.transform(valid, { type: 'param', data: 'assessmentId' })).resolves.toBe(valid);
      await expect(pipe.transform(valid, { type: 'param', data: 'attemptId' })).resolves.toBe(valid);
      await expect(pipe.transform(valid, { type: 'param', data: 'chapterId' })).resolves.toBe(valid);
    });

    it('rejects invalid UUID parameter with BadRequestException', async () => {
      await expect(
        pipe.transform('invalid-assessment-id', { type: 'param', data: 'assessmentId' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        pipe.transform('invalid-attempt-id', { type: 'param', data: 'attemptId' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        pipe.transform('invalid-chapter-id', { type: 'param', data: 'chapterId' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
