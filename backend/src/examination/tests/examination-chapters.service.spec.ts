import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeacherStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExaminationChaptersService } from '../services/examination-chapters.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import { AuthenticatedUser } from '../types';

describe('ExaminationChaptersService - Unit Tests', () => {
  let service: ExaminationChaptersService;
  let prismaMock: any;
  let examRepoMock: any;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockGradeId = '00000000-0000-0000-0000-000000000299';
  const mockTeacherId = '00000000-0000-0000-0000-000000000999';
  const mockCurrentYearId = '00000000-0000-0000-0000-0000000000c1';

  const teacherUser: AuthenticatedUser = {
    id: 'user-teacher-01',
    email: 'teacher@school.edu',
    role: UserRole.TEACHER,
    schoolId: mockSchoolId,
  };

  const adminUser: AuthenticatedUser = {
    id: 'user-admin-01',
    email: 'admin@school.edu',
    role: UserRole.SCHOOL_ADMIN,
    schoolId: mockSchoolId,
  };

  const studentUser: AuthenticatedUser = {
    id: 'user-student-01',
    email: 'student@school.edu',
    role: UserRole.STUDENT,
    schoolId: mockSchoolId,
  };

  const superAdminUser: AuthenticatedUser = {
    id: 'user-superadmin-01',
    email: 'superadmin@platform.gov',
    role: UserRole.PLATFORM_SUPER_ADMIN,
    schoolId: mockSchoolId,
  };

  beforeEach(async () => {
    prismaMock = {
      gradeClass: {
        findFirst: jest.fn(),
      },
      academicYear: {
        findFirst: jest.fn().mockResolvedValue({ id: mockCurrentYearId }),
        findMany: jest.fn().mockResolvedValue([{ id: mockCurrentYearId }]),
      },
      teacher: {
        findFirst: jest.fn(),
      },
      teacherAssignment: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    examRepoMock = {
      createChapter: jest.fn(),
      findChapters: jest.fn(),
      findChapterById: jest.fn(),
      findChapterByCode: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExaminationChaptersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EXAMINATION_REPOSITORY, useValue: examRepoMock },
      ],
    }).compile();

    service = module.get<ExaminationChaptersService>(ExaminationChaptersService);
  });

  describe('createChapter', () => {
    const validDto = {
      gradeId: mockGradeId,
      subject: 'Mathematics',
      chapterCode: 'MATH-CH-01',
      title: 'Linear Algebra',
      orderIndex: 1,
    };

    it('throws NotFoundException if grade does not exist in caller school', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue(null);

      await expect(
        service.createChapter(mockSchoolId, validDto, teacherUser),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.gradeClass.findFirst).toHaveBeenCalledWith({
        where: { schoolId: mockSchoolId, id: mockGradeId },
      });
    });

    it('throws ForbiddenException if user is a student', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });

      await expect(
        service.createChapter(mockSchoolId, validDto, studentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if teacher profile is missing or inactive', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });
      prismaMock.teacher.findFirst.mockResolvedValue(null);

      await expect(
        service.createChapter(mockSchoolId, validDto, teacherUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.teacher.findFirst).toHaveBeenCalledWith({
        where: { schoolId: mockSchoolId, userId: teacherUser.id, status: TeacherStatus.ACTIVE },
      });
    });

    it('throws ForbiddenException if teacher is not assigned to teach the subject in that grade', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.createChapter(mockSchoolId, validDto, teacherUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.teacherAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          schoolId: mockSchoolId,
          teacherId: mockTeacherId,
          academicYearId: mockCurrentYearId,
          gradeId: mockGradeId,
          subject: { equals: 'Mathematics', mode: 'insensitive' },
        },
      });
    });

    it('throws ConflictException if chapter with same code already exists for that grade, subject, and teacher', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
      examRepoMock.findChapterByCode.mockResolvedValue({ id: 'existing-chap-1' });

      await expect(
        service.createChapter(mockSchoolId, validDto, teacherUser),
      ).rejects.toThrow(ConflictException);
      expect(examRepoMock.findChapterByCode).toHaveBeenCalledWith(
        mockSchoolId,
        mockGradeId,
        'Mathematics',
        'MATH-CH-01',
        mockCurrentYearId,
        mockTeacherId,
      );
    });

    it('creates chapter successfully for assigned teacher with academicYearId and createdByTeacherId', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
      examRepoMock.findChapterByCode.mockResolvedValue(null);
      examRepoMock.createChapter.mockResolvedValue({
        id: 'new-chap-1',
        schoolId: mockSchoolId,
        academicYearId: mockCurrentYearId,
        createdByTeacherId: mockTeacherId,
        ...validDto,
      });

      const result = await service.createChapter(mockSchoolId, validDto, teacherUser);
      expect(result.id).toBe('new-chap-1');
      expect(examRepoMock.findChapterByCode).toHaveBeenCalledWith(
        mockSchoolId,
        mockGradeId,
        'Mathematics',
        'MATH-CH-01',
        mockCurrentYearId,
        mockTeacherId,
      );
      expect(examRepoMock.createChapter).toHaveBeenCalledWith({
        schoolId: mockSchoolId,
        academicYearId: mockCurrentYearId,
        createdByTeacherId: mockTeacherId,
        gradeId: mockGradeId,
        subject: 'Mathematics',
        chapterCode: 'MATH-CH-01',
        title: 'Linear Algebra',
        orderIndex: 1,
      });
    });

    it('rejects school admin creating a chapter (read-only role)', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });

      await expect(
        service.createChapter(mockSchoolId, validDto, adminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.createChapter).not.toHaveBeenCalled();
    });

    it('rejects chapter creation when the school has no active academic year', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.academicYear.findMany.mockResolvedValue([]);
      prismaMock.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.createChapter(mockSchoolId, validDto, teacherUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.teacherAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('rejects chapter creation when the school has multiple active academic years', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.academicYear.findMany.mockResolvedValue([
        { id: mockCurrentYearId },
        { id: '00000000-0000-0000-0000-0000000000c2' },
      ]);

      await expect(
        service.createChapter(mockSchoolId, validDto, teacherUser),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.teacherAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when the teacher was only assigned in a previous academic year', async () => {
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId, name: 'Grade 10' });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      // assignment query is scoped to the current year; a previous-year assignment does not match
      prismaMock.teacherAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.createChapter(mockSchoolId, validDto, teacherUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.teacherAssignment.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ academicYearId: mockCurrentYearId }),
      });
    });
  });

  describe('listChapters', () => {
    it('returns the full school list for school admin callers', async () => {
      examRepoMock.findChapters.mockResolvedValue([{ id: 'ch-1', gradeId: mockGradeId, subject: 'Science' }]);
      const result = await service.listChapters(mockSchoolId, {}, adminUser);
      expect(result).toHaveLength(1);
      expect(prismaMock.teacherAssignment.findMany).not.toHaveBeenCalled();
    });

    it('limits teachers to grade/subject pairs assigned in the current academic year and filters by teacher ownership', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { gradeId: mockGradeId, subject: 'Mathematics' },
      ]);
      examRepoMock.findChapters.mockResolvedValue([
        {
          id: 'ch-math',
          gradeId: mockGradeId,
          subject: 'mathematics',
          academicYearId: mockCurrentYearId,
          createdByTeacherId: mockTeacherId,
        },
        {
          id: 'ch-sci',
          gradeId: mockGradeId,
          subject: 'Science',
          academicYearId: mockCurrentYearId,
          createdByTeacherId: mockTeacherId,
        },
        {
          id: 'ch-other-grade',
          gradeId: 'other-grade',
          subject: 'Mathematics',
          academicYearId: mockCurrentYearId,
          createdByTeacherId: mockTeacherId,
        },
      ]);

      const result = await service.listChapters(mockSchoolId, {}, teacherUser);
      expect(result.map((c: any) => c.id)).toEqual(['ch-math']);
      expect(prismaMock.teacherAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { schoolId: mockSchoolId, teacherId: mockTeacherId, academicYearId: mockCurrentYearId },
        }),
      );
    });

    it('allows teacher to see own and legacy chapters but filters out chapters authored by other teachers', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { gradeId: mockGradeId, subject: 'Mathematics' },
      ]);
      examRepoMock.findChapters.mockResolvedValue([
        {
          id: 'ch-own',
          gradeId: mockGradeId,
          subject: 'Mathematics',
          academicYearId: mockCurrentYearId,
          createdByTeacherId: mockTeacherId,
        },
        {
          id: 'ch-legacy',
          gradeId: mockGradeId,
          subject: 'Mathematics',
          academicYearId: null,
          createdByTeacherId: null,
        },
        {
          id: 'ch-other-teacher',
          gradeId: mockGradeId,
          subject: 'Mathematics',
          academicYearId: mockCurrentYearId,
          createdByTeacherId: 'other-teacher-uuid',
        },
      ]);

      const result = await service.listChapters(mockSchoolId, {}, teacherUser);
      expect(result.map((c: any) => c.id)).toEqual(['ch-own', 'ch-legacy']);
    });

    it('preserves legacy chapters with NULL academicYearId while filtering out past academic year chapters', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { gradeId: mockGradeId, subject: 'Mathematics' },
      ]);
      examRepoMock.findChapters.mockResolvedValue([
        {
          id: 'ch-current',
          gradeId: mockGradeId,
          subject: 'Mathematics',
          academicYearId: mockCurrentYearId,
          createdByTeacherId: mockTeacherId,
        },
        {
          id: 'ch-legacy',
          gradeId: mockGradeId,
          subject: 'Mathematics',
          academicYearId: null,
          createdByTeacherId: null,
        },
        {
          id: 'ch-past',
          gradeId: mockGradeId,
          subject: 'Mathematics',
          academicYearId: 'past-year-uuid',
          createdByTeacherId: mockTeacherId,
        },
      ]);

      const result = await service.listChapters(mockSchoolId, {}, teacherUser);
      expect(result.map((c: any) => c.id)).toEqual(['ch-current', 'ch-legacy']);
    });

    it('rejects platform super admin from listing chapters', async () => {
      await expect(
        service.listChapters(mockSchoolId, {}, superAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns nothing for a teacher when no active academic year exists', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.academicYear.findMany.mockResolvedValue([]);
      prismaMock.academicYear.findFirst.mockResolvedValue(null);
      examRepoMock.findChapters.mockResolvedValue([{ id: 'ch-math', gradeId: mockGradeId, subject: 'Mathematics' }]);

      expect(await service.listChapters(mockSchoolId, {}, teacherUser)).toEqual([]);
    });

    it('hides unauthorized chapters by id from teachers (404, not 403)', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findMany.mockResolvedValue([]);
      examRepoMock.findChapterById.mockResolvedValue({ id: 'ch-x', gradeId: mockGradeId, subject: 'Science' });

      await expect(
        service.getChapterById(mockSchoolId, 'ch-x', teacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('scopes query to caller schoolId with optional filters', async () => {
      examRepoMock.findChapters.mockResolvedValue([
        { id: 'ch-1', title: 'Chapter 1' },
      ]);

      const result = await service.listChapters(mockSchoolId, {
        gradeId: mockGradeId,
        subject: 'Science',
      });
      expect(result).toHaveLength(1);
      expect(examRepoMock.findChapters).toHaveBeenCalledWith(mockSchoolId, {
        gradeId: mockGradeId,
        subject: 'Science',
      });
    });
  });

  describe('getChapterById', () => {
    it('throws NotFoundException if chapter does not exist in caller school', async () => {
      examRepoMock.findChapterById.mockResolvedValue(null);

      await expect(
        service.getChapterById(mockSchoolId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
      expect(examRepoMock.findChapterById).toHaveBeenCalledWith(mockSchoolId, 'non-existent');
    });

    it('allows teacher access to their own chapter', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { gradeId: mockGradeId, subject: 'Mathematics' },
      ]);
      examRepoMock.findChapterById.mockResolvedValue({
        id: 'ch-own',
        schoolId: mockSchoolId,
        gradeId: mockGradeId,
        subject: 'Mathematics',
        academicYearId: mockCurrentYearId,
        createdByTeacherId: mockTeacherId,
      });

      const result = await service.getChapterById(mockSchoolId, 'ch-own', teacherUser);
      expect(result.id).toBe('ch-own');
    });

    it('allows teacher access to legacy chapter with createdByTeacherId = null', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { gradeId: mockGradeId, subject: 'Mathematics' },
      ]);
      examRepoMock.findChapterById.mockResolvedValue({
        id: 'ch-legacy',
        schoolId: mockSchoolId,
        gradeId: mockGradeId,
        subject: 'Mathematics',
        academicYearId: null,
        createdByTeacherId: null,
      });

      const result = await service.getChapterById(mockSchoolId, 'ch-legacy', teacherUser);
      expect(result.id).toBe('ch-legacy');
    });

    it('throws 404 NotFoundException for another teacher private chapter', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { gradeId: mockGradeId, subject: 'Mathematics' },
      ]);
      examRepoMock.findChapterById.mockResolvedValue({
        id: 'ch-other',
        schoolId: mockSchoolId,
        gradeId: mockGradeId,
        subject: 'Mathematics',
        academicYearId: mockCurrentYearId,
        createdByTeacherId: 'other-teacher-id',
      });

      await expect(
        service.getChapterById(mockSchoolId, 'ch-other', teacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows school admin to view any chapter in their school read-only', async () => {
      examRepoMock.findChapterById.mockResolvedValue({
        id: 'ch-1',
        schoolId: mockSchoolId,
        gradeId: mockGradeId,
        subject: 'Mathematics',
        academicYearId: mockCurrentYearId,
        createdByTeacherId: mockTeacherId,
      });

      const result = await service.getChapterById(mockSchoolId, 'ch-1', adminUser);
      expect(result.id).toBe('ch-1');
    });

    it('rejects platform super admin from viewing chapter details', async () => {
      await expect(
        service.getChapterById(mockSchoolId, 'ch-1', superAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
