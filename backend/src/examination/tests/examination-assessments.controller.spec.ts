import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ExaminationAssessmentsController } from '../controllers/examination-assessments.controller';
import { ExaminationAssessmentsService } from '../services/examination-assessments.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { AssessmentMode, AssessmentStatus } from '../types';

describe('ExaminationAssessmentsController', () => {
  let controller: ExaminationAssessmentsController;
  let service: any;
  let reflector: Reflector;

  const mockAdminUser = {
    id: 'user-admin-1',
    schoolId: 'sch-1',
    role: UserRole.SCHOOL_ADMIN,
  };

  const mockSchool = {
    id: 'sch-1',
    name: 'Test Academy',
  };

  beforeEach(async () => {
    service = {
      createDraft: jest.fn().mockResolvedValue({ id: 'asm-1', title: 'Midterm Exam' }),
      listAssessments: jest.fn().mockResolvedValue([{ id: 'asm-1', title: 'Midterm Exam' }]),
      getAssessmentById: jest.fn().mockResolvedValue({ id: 'asm-1', title: 'Midterm Exam' }),
      updateDraft: jest.fn().mockResolvedValue({ id: 'asm-1', title: 'Updated Exam' }),
      deleteDraft: jest.fn().mockResolvedValue({ success: true, id: 'asm-1' }),
      publishAssessment: jest.fn().mockResolvedValue({ id: 'asm-1', status: AssessmentStatus.PUBLISHED }),
      releaseResults: jest.fn().mockResolvedValue({ success: true, status: AssessmentStatus.RESULTS_RELEASED }),
      closeAssessment: jest.fn().mockResolvedValue({ id: 'asm-1', status: AssessmentStatus.CLOSED }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExaminationAssessmentsController],
      providers: [
        Reflector,
        { provide: ExaminationAssessmentsService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExaminationAssessmentsController>(
      ExaminationAssessmentsController,
    );
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('RBAC Metadata', () => {
    it('should restrict createDraft to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.createDraft);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.STUDENT);
      expect(roles).not.toContain(UserRole.PARENT);
    });

    it('should restrict listAssessments to SCHOOL_ADMIN (read-only) and TEACHER', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.listAssessments);
      expect(roles).toEqual([UserRole.SCHOOL_ADMIN, UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.STUDENT);
    });

    it('should restrict getAssessmentById to SCHOOL_ADMIN (read-only) and TEACHER', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getAssessmentById);
      expect(roles).toEqual([UserRole.SCHOOL_ADMIN, UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict updateDraft to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.updateDraft);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict deleteDraft to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.deleteDraft);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict publishAssessment to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.publishAssessment);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.STUDENT);
    });

    it('should restrict releaseResults to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.releaseResults);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.STUDENT);
    });

    it('should restrict closeAssessment to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.closeAssessment);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.STUDENT);
    });
  });

  describe('createDraft', () => {
    it('should delegate to service.createDraft with schoolId and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const dto = {
        academicYearId: 'ay-2026',
        gradeId: 'grade-10',
        chapterId: 'chap-1',
        subject: 'MATHEMATICS',
        title: 'Midterm Exam',
        totalMarks: 100,
        passingMarks: 40,
        durationMinutes: 60,
        mode: AssessmentMode.LIVE_EXAM,
      };

      const result = await controller.createDraft(req, dto);
      expect(service.createDraft).toHaveBeenCalledWith('sch-1', dto, mockAdminUser);
      expect(result).toEqual({ id: 'asm-1', title: 'Midterm Exam' });
    });
  });

  describe('listAssessments', () => {
    it('should delegate to service.listAssessments with schoolId, filters, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const query = {
        gradeId: 'grade-10',
        status: AssessmentStatus.DRAFT,
      };

      const result = await controller.listAssessments(req, query);
      expect(service.listAssessments).toHaveBeenCalledWith('sch-1', query, mockAdminUser);
      expect(result).toEqual([{ id: 'asm-1', title: 'Midterm Exam' }]);
    });
  });

  describe('getAssessmentById', () => {
    it('should delegate to service.getAssessmentById with schoolId, id, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.getAssessmentById(req, 'asm-1');
      expect(service.getAssessmentById).toHaveBeenCalledWith('sch-1', 'asm-1', mockAdminUser);
      expect(result).toEqual({ id: 'asm-1', title: 'Midterm Exam' });
    });
  });

  describe('updateDraft', () => {
    it('should delegate to service.updateDraft with schoolId, id, dto, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const dto = { title: 'Updated Exam' };

      const result = await controller.updateDraft(req, 'asm-1', dto);
      expect(service.updateDraft).toHaveBeenCalledWith('sch-1', 'asm-1', dto, mockAdminUser);
      expect(result).toEqual({ id: 'asm-1', title: 'Updated Exam' });
    });
  });

  describe('deleteDraft', () => {
    it('should delegate to service.deleteDraft with schoolId, id, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.deleteDraft(req, 'asm-1');
      expect(service.deleteDraft).toHaveBeenCalledWith('sch-1', 'asm-1', mockAdminUser);
      expect(result).toEqual({ success: true, id: 'asm-1' });
    });
  });

  describe('publishAssessment', () => {
    it('should delegate to service.publishAssessment with schoolId, id, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.publishAssessment(req, 'asm-1');
      expect(service.publishAssessment).toHaveBeenCalledWith('sch-1', 'asm-1', mockAdminUser);
      expect(result).toEqual({ id: 'asm-1', status: AssessmentStatus.PUBLISHED });
    });
  });

  describe('releaseResults', () => {
    it('should delegate to service.releaseResults with schoolId, id, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.releaseResults(req, 'asm-1');
      expect(service.releaseResults).toHaveBeenCalledWith('sch-1', 'asm-1', mockAdminUser);
      expect(result).toEqual({ success: true, status: AssessmentStatus.RESULTS_RELEASED });
    });
  });

  describe('closeAssessment', () => {
    it('should delegate to service.closeAssessment with schoolId, id, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.closeAssessment(req, 'asm-1');
      expect(service.closeAssessment).toHaveBeenCalledWith('sch-1', 'asm-1', mockAdminUser);
      expect(result).toEqual({ id: 'asm-1', status: AssessmentStatus.CLOSED });
    });
  });

  describe('Route UUID parameter validation', () => {
    const pipe = new ParseUUIDPipe();

    it('accepts valid UUID strings', async () => {
      const valid = 'a0000000-0000-0000-0000-000000000001';
      await expect(pipe.transform(valid, { type: 'param', data: 'id' })).resolves.toBe(valid);
    });

    it('rejects invalid UUID parameter with BadRequestException', async () => {
      await expect(
        pipe.transform('invalid-uuid-format', { type: 'param', data: 'id' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
