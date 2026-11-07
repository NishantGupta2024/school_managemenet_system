import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ExaminationChaptersController } from '../controllers/examination-chapters.controller';
import { ExaminationChaptersService } from '../services/examination-chapters.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ROLES_KEY } from '../../common/auth/roles.decorator';

describe('ExaminationChaptersController', () => {
  let controller: ExaminationChaptersController;
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
      createChapter: jest.fn().mockResolvedValue({ id: 'chap-1', name: 'Real Numbers' }),
      listChapters: jest.fn().mockResolvedValue([{ id: 'chap-1', name: 'Real Numbers' }]),
      getChapterById: jest.fn().mockResolvedValue({ id: 'chap-1', name: 'Real Numbers' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExaminationChaptersController],
      providers: [
        Reflector,
        { provide: ExaminationChaptersService, useValue: service },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ExaminationChaptersController>(ExaminationChaptersController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('RBAC Metadata', () => {
    it('should restrict createChapter to TEACHER only', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.createChapter);
      expect(roles).toEqual([UserRole.TEACHER]);
      expect(roles).not.toContain(UserRole.STUDENT);
      expect(roles).not.toContain(UserRole.PARENT);
      expect(roles).not.toContain(UserRole.SCHOOL_ADMIN);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict listChapters to SCHOOL_ADMIN and TEACHER', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.listChapters);
      expect(roles).toEqual([
        UserRole.SCHOOL_ADMIN,
        UserRole.TEACHER,
      ]);
      expect(roles).not.toContain(UserRole.STUDENT);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });

    it('should restrict getChapterById to SCHOOL_ADMIN and TEACHER', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.getChapterById);
      expect(roles).toEqual([
        UserRole.SCHOOL_ADMIN,
        UserRole.TEACHER,
      ]);
      expect(roles).not.toContain(UserRole.STUDENT);
      expect(roles).not.toContain(UserRole.PLATFORM_SUPER_ADMIN);
    });
  });

  describe('createChapter', () => {
    it('should pass schoolId, dto, and user to service.createChapter', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const dto = {
        gradeId: 'grade-10',
        subject: 'MATHEMATICS',
        chapterCode: 'CH-01',
        title: 'Real Numbers',
        orderIndex: 1,
      };

      const result = await controller.createChapter(req, dto);
      expect(service.createChapter).toHaveBeenCalledWith('sch-1', dto, mockAdminUser);
      expect(result).toEqual({ id: 'chap-1', name: 'Real Numbers' });
    });
  });

  describe('listChapters', () => {
    it('should pass schoolId, query, and user to service.listChapters', async () => {
      const req = { school: mockSchool, user: mockAdminUser };
      const query = { gradeId: 'grade-10', subject: 'MATHEMATICS' };

      const result = await controller.listChapters(req, query);
      expect(service.listChapters).toHaveBeenCalledWith('sch-1', query, mockAdminUser);
      expect(result).toEqual([{ id: 'chap-1', name: 'Real Numbers' }]);
    });
  });

  describe('getChapterById', () => {
    it('should pass schoolId, id, and user to service.getChapterById', async () => {
      const req = { school: mockSchool, user: mockAdminUser };

      const result = await controller.getChapterById(req, 'chap-1');
      expect(service.getChapterById).toHaveBeenCalledWith('sch-1', 'chap-1', mockAdminUser);
      expect(result).toEqual({ id: 'chap-1', name: 'Real Numbers' });
    });
  });

  describe('Route UUID parameter validation', () => {
    const pipe = new ParseUUIDPipe();

    it('accepts valid UUID strings', async () => {
      const valid = 'c0000000-0000-0000-0000-000000000001';
      await expect(pipe.transform(valid, { type: 'param', data: 'id' })).resolves.toBe(valid);
    });

    it('rejects invalid UUID parameter with BadRequestException', async () => {
      await expect(
        pipe.transform('invalid-chapter-id', { type: 'param', data: 'id' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
