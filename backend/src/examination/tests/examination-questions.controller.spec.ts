import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ExaminationQuestionsController } from '../controllers/examination-questions.controller';
import { ExaminationQuestionsService } from '../services/examination-questions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ROLES_KEY } from '../../common/auth/roles.decorator';

describe('ExaminationQuestionsController', () => {
  let controller: ExaminationQuestionsController;
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

  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';
  const mockQuestionId = '00000000-0000-0000-0000-000000000777';

  beforeEach(async () => {
    service = {
      createQuestion: jest.fn().mockResolvedValue({ id: mockQuestionId, questionText: 'What is 2+2?' }),
      listQuestions: jest.fn().mockResolvedValue({ summary: {}, questions: [] }),
      getQuestionById: jest.fn().mockResolvedValue({ id: mockQuestionId, questionText: 'What is 2+2?' }),
      updateQuestion: jest.fn().mockResolvedValue({ id: mockQuestionId, questionText: 'Updated' }),
      deleteQuestion: jest.fn().mockResolvedValue({ success: true, message: 'Question deleted successfully' }),
      previewImport: jest.fn().mockResolvedValue({ validCount: 5, invalidCount: 0 }),
      confirmImport: jest.fn().mockResolvedValue({ success: true, importedCount: 5 }),
      uploadQuestionImage: jest.fn().mockResolvedValue({ id: 'img-1', fileName: 'diag.png' }),
      getQuestionImage: jest.fn().mockResolvedValue({
        buffer: Buffer.from('image-data'),
        mimeType: 'image/png',
        fileName: 'diag.png',
      }),
      deleteQuestionImage: jest.fn().mockResolvedValue({ success: true, message: 'Question image removed successfully' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExaminationQuestionsController],
      providers: [
        Reflector,
        { provide: ExaminationQuestionsService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExaminationQuestionsController>(ExaminationQuestionsController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('RBAC Metadata', () => {
    it('should restrict createQuestion to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.createQuestion);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.STUDENT);
      expect(roles).not.toContain(UserRole.PARENT);
    });

    it('should restrict listQuestions to SCHOOL_ADMIN (read-only) and TEACHER', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.listQuestions);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict getQuestionById to SCHOOL_ADMIN (read-only) and TEACHER', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getQuestionById);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict updateQuestion to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.updateQuestion);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict deleteQuestion to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.deleteQuestion);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict previewImport to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.previewImport);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict confirmImport to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.confirmImport);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict uploadQuestionImage to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.uploadQuestionImage);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.STUDENT);
    });

    it('should restrict getQuestionImage to SCHOOL_ADMIN, TEACHER and STUDENT', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getQuestionImage);
      expect(roles).toEqual([UserRole.TEACHER, UserRole.STUDENT]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict deleteQuestionImage to TEACHER only (admins are read-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.deleteQuestionImage);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.STUDENT);
    });
  });

  describe('createQuestion', () => {
    it('should delegate to service.createQuestion with schoolId, assessmentId, dto, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const dto = {
        questionText: 'What is 2+2?',
        options: ['1', '2', '3', '4'],
        correctOption: 3,
        marks: 2.0,
      };

      const result = await controller.createQuestion(req, mockAssessmentId, dto);
      expect(service.createQuestion).toHaveBeenCalledWith('sch-1', mockAssessmentId, dto, mockAdminUser);
      expect(result).toEqual({ id: mockQuestionId, questionText: 'What is 2+2?' });
    });
  });

  describe('listQuestions', () => {
    it('should delegate to service.listQuestions with schoolId, assessmentId, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.listQuestions(req, mockAssessmentId);
      expect(service.listQuestions).toHaveBeenCalledWith('sch-1', mockAssessmentId, mockAdminUser);
      expect(result).toEqual({ summary: {}, questions: [] });
    });
  });

  describe('getQuestionById', () => {
    it('should delegate to service.getQuestionById with schoolId, assessmentId, id, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.getQuestionById(req, mockAssessmentId, mockQuestionId);
      expect(service.getQuestionById).toHaveBeenCalledWith('sch-1', mockAssessmentId, mockQuestionId, mockAdminUser);
      expect(result).toEqual({ id: mockQuestionId, questionText: 'What is 2+2?' });
    });
  });

  describe('updateQuestion', () => {
    it('should delegate to service.updateQuestion with schoolId, assessmentId, id, dto, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const dto = { questionText: 'Updated' };

      const result = await controller.updateQuestion(req, mockAssessmentId, mockQuestionId, dto);
      expect(service.updateQuestion).toHaveBeenCalledWith(
        'sch-1',
        mockAssessmentId,
        mockQuestionId,
        dto,
        mockAdminUser,
      );
      expect(result).toEqual({ id: mockQuestionId, questionText: 'Updated' });
    });
  });

  describe('deleteQuestion', () => {
    it('should delegate to service.deleteQuestion with schoolId, assessmentId, id, and user', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.deleteQuestion(req, mockAssessmentId, mockQuestionId);
      expect(service.deleteQuestion).toHaveBeenCalledWith('sch-1', mockAssessmentId, mockQuestionId, mockAdminUser);
      expect(result).toEqual({ success: true, message: 'Question deleted successfully' });
    });
  });

  describe('previewImport', () => {
    it('should throw BadRequestException if file is missing', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      await expect(
        controller.previewImport(req, mockAssessmentId, undefined as any),
      ).rejects.toThrow('Spreadsheet file is required');
    });

    it('should delegate file buffer to service.previewImport', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const mockFile = { buffer: Buffer.from('mock-xlsx') } as any;

      const result = await controller.previewImport(req, mockAssessmentId, mockFile);
      expect(service.previewImport).toHaveBeenCalledWith('sch-1', mockAssessmentId, mockFile.buffer, mockAdminUser);
      expect(result).toEqual({ validCount: 5, invalidCount: 0 });
    });
  });

  describe('confirmImport', () => {
    it('should delegate dto to service.confirmImport', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const dto = {
        questions: [
          {
            questionText: 'Q1',
            options: ['A', 'B', 'C', 'D'],
            correctOption: 0,
            marks: 1.0,
          },
        ],
      };

      const result = await controller.confirmImport(req, mockAssessmentId, dto as any);
      expect(service.confirmImport).toHaveBeenCalledWith('sch-1', mockAssessmentId, dto, mockAdminUser);
      expect(result).toEqual({ success: true, importedCount: 5 });
    });
  });

  describe('uploadQuestionImage', () => {
    it('should throw BadRequestException if file is missing', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      await expect(
        controller.uploadQuestionImage(req, mockAssessmentId, mockQuestionId, undefined as any),
      ).rejects.toThrow('Image file is required');
    });

    it('should delegate to service.uploadQuestionImage', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const mockFile = { originalname: 'diag.png', buffer: Buffer.from('data') } as any;

      const res = await controller.uploadQuestionImage(req, mockAssessmentId, mockQuestionId, mockFile);
      expect(service.uploadQuestionImage).toHaveBeenCalledWith(
        'sch-1',
        mockAssessmentId,
        mockQuestionId,
        mockFile,
        mockAdminUser,
      );
      expect(res).toEqual({ id: 'img-1', fileName: 'diag.png' });
    });
  });

  describe('getQuestionImage', () => {
    it('should set headers and stream buffer to response', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.getQuestionImage(req, mockAssessmentId, mockQuestionId, res);

      expect(service.getQuestionImage).toHaveBeenCalledWith(
        'sch-1',
        mockAssessmentId,
        mockQuestionId,
        mockAdminUser,
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="diag.png"');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=3600');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('image-data'));
    });
  });

  describe('deleteQuestionImage', () => {
    it('should delegate to service.deleteQuestionImage', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const res = await controller.deleteQuestionImage(req, mockAssessmentId, mockQuestionId);
      expect(service.deleteQuestionImage).toHaveBeenCalledWith(
        'sch-1',
        mockAssessmentId,
        mockQuestionId,
        mockAdminUser,
      );
      expect(res).toEqual({ success: true, message: 'Question image removed successfully' });
    });
  });

  describe('Route UUID parameter validation', () => {
    const pipe = new ParseUUIDPipe();

    it('accepts valid UUID strings', async () => {
      const valid = 'b0000000-0000-0000-0000-000000000001';
      await expect(pipe.transform(valid, { type: 'param', data: 'assessmentId' })).resolves.toBe(valid);
      await expect(pipe.transform(valid, { type: 'param', data: 'id' })).resolves.toBe(valid);
    });

    it('rejects invalid UUID parameter with BadRequestException', async () => {
      await expect(
        pipe.transform('invalid-assessment-id', { type: 'param', data: 'assessmentId' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        pipe.transform('invalid-question-id', { type: 'param', data: 'id' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
