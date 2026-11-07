import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeacherStatus, UserRole } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { ExaminationAssessmentsService } from '../services/examination-assessments.service';
import { ExaminationStudentAttemptsService } from '../services/examination-student-attempts.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import { AssessmentMode, AssessmentStatus, AuthenticatedUser } from '../types';
import { CreateAssessmentDraftDto } from '../dto/create-assessment-draft.dto';

describe('ExaminationAssessmentsService - Unit Tests', () => {
  let service: ExaminationAssessmentsService;
  let prismaMock: any;
  let examRepoMock: any;
  let studentAttemptsServiceMock: any;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockAYId = '00000000-0000-0000-0000-000000000199';
  const mockGradeId = '00000000-0000-0000-0000-000000000299';
  const mockSectionId = '00000000-0000-0000-0000-000000000399';
  const mockSectionId2 = '00000000-0000-0000-0000-000000000398';
  const mockTeacherId = '00000000-0000-0000-0000-000000000999';
  const mockChapterId = '00000000-0000-0000-0000-000000000599';
  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';

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

  const platformAdminUser: AuthenticatedUser = {
    id: 'user-platform-01',
    email: 'platform@erp.io',
    role: UserRole.PLATFORM_SUPER_ADMIN,
    schoolId: mockSchoolId,
  };

  const otherTeacherUser: AuthenticatedUser = {
    id: 'user-teacher-02',
    email: 'other.teacher@school.edu',
    role: UserRole.TEACHER,
    schoolId: mockSchoolId,
  };

  const validDraftDto = {
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: mockSectionId,
    chapterId: mockChapterId,
    title: 'Midterm Physics Assessment',
    description: 'Comprehensive assessment on Mechanics',
    subject: 'Physics',
    mode: AssessmentMode.NORMAL_QUIZ,
    totalMarks: 100,
    passingMarks: 40,
    durationMinutes: 60,
    startWindowAt: '2026-11-01T09:00:00.000Z',
    endWindowAt: '2026-11-01T12:00:00.000Z',
    shuffleQuestions: true,
    shuffleOptions: true,
  };

  beforeEach(async () => {
    prismaMock = {
      academicYear: { findFirst: jest.fn() },
      gradeClass: { findFirst: jest.fn() },
      section: { findFirst: jest.fn(), findMany: jest.fn() },
      teacher: { findFirst: jest.fn() },
      teacherAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
    };

    examRepoMock = {
      createAssessmentDraft: jest.fn(),
      findAssessments: jest.fn(),
      findAssessmentById: jest.fn(),
      updateAssessmentDraft: jest.fn(),
      publishAssessment: jest.fn(),
      deleteAssessmentDraft: jest.fn(),
      countChildQuestions: jest.fn(),
      countChildSections: jest.fn(),
      findChapterById: jest.fn(),
      releaseAssessmentResultsAtomic: jest.fn(),
      closeAssessmentAtomic: jest.fn(),
    };

    studentAttemptsServiceMock = {
      reconcileExpiredAttemptsForAssessment: jest.fn().mockResolvedValue({ reconciledCount: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExaminationAssessmentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EXAMINATION_REPOSITORY, useValue: examRepoMock },
        { provide: ExaminationStudentAttemptsService, useValue: studentAttemptsServiceMock },
      ],
    }).compile();

    service = module.get<ExaminationAssessmentsService>(ExaminationAssessmentsService);
  });

  describe('Role policy: administrative roles are read-only', () => {
    const closedOrPublished = {
      id: mockAssessmentId,
      schoolId: mockSchoolId,
      academicYearId: mockAYId,
      gradeId: mockGradeId,
      sectionId: mockSectionId,
      teacherId: mockTeacherId,
      subject: 'Physics',
      status: AssessmentStatus.PUBLISHED,
    };

    it.each([
      ['SCHOOL_ADMIN', () => adminUser],
      ['PLATFORM_SUPER_ADMIN', () => platformAdminUser],
    ])('%s cannot create a draft', async (_name, getUser) => {
      await expect(
        service.createDraft(mockSchoolId, validDraftDto, getUser()),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.createAssessmentDraft).not.toHaveBeenCalled();
    });

    it.each([
      ['SCHOOL_ADMIN', () => adminUser],
      ['PLATFORM_SUPER_ADMIN', () => platformAdminUser],
    ])('%s cannot delete a draft', async (_name, getUser) => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...closedOrPublished,
        status: AssessmentStatus.DRAFT,
      });
      await expect(
        service.deleteDraft(mockSchoolId, mockAssessmentId, getUser()),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.deleteAssessmentDraft).not.toHaveBeenCalled();
    });

    it.each([
      ['SCHOOL_ADMIN', () => adminUser],
      ['PLATFORM_SUPER_ADMIN', () => platformAdminUser],
    ])('%s cannot close a published assessment', async (_name, getUser) => {
      examRepoMock.findAssessmentById.mockResolvedValue(closedOrPublished);
      await expect(
        service.closeAssessment(mockSchoolId, mockAssessmentId, getUser()),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.closeAssessmentAtomic).not.toHaveBeenCalled();
    });

    it('does not expose any exceptional override path (no dedicated permission or audit store exists)', async () => {
      // A school admin supplying a reason or teacherId must not bypass the policy.
      const dto = { ...validDraftDto, teacherId: mockTeacherId, reason: 'urgent' } as any;
      await expect(
        service.createDraft(mockSchoolId, dto, adminUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Academic-year enforcement for teacher drafts', () => {
    const previousYearId = '00000000-0000-0000-0000-0000000000a1';

    beforeEach(() => {
      // Hierarchy lookup (by id) finds any year in the school; the school's current year is mockAYId
      prismaMock.academicYear.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.isCurrent ? { id: mockAYId } : { id: where.id }),
      );
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId });
      prismaMock.section.findFirst.mockResolvedValue({ id: mockSectionId, gradeId: mockGradeId });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.findChapterById.mockResolvedValue({
        id: mockChapterId,
        gradeId: mockGradeId,
        subject: 'Physics',
      });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    });

    it('accepts a draft for the current active academic year', async () => {
      examRepoMock.createAssessmentDraft.mockResolvedValue({
        id: mockAssessmentId,
        status: AssessmentStatus.DRAFT,
      });
      const result = await service.createDraft(mockSchoolId, validDraftDto, teacherUser);
      expect(result.id).toBe(mockAssessmentId);
      expect(prismaMock.academicYear.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { schoolId: mockSchoolId, isCurrent: true } }),
      );
    });

    it('rejects a draft for a previous academic year even if the teacher was assigned then', async () => {
      await expect(
        service.createDraft(
          mockSchoolId,
          { ...validDraftDto, academicYearId: previousYearId },
          teacherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.createAssessmentDraft).not.toHaveBeenCalled();
    });

    it('rejects an academic-year id from another tenant (not found in this school)', async () => {
      prismaMock.academicYear.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.isCurrent ? { id: mockAYId } : null),
      );
      await expect(
        service.createDraft(
          mockSchoolId,
          { ...validDraftDto, academicYearId: '00000000-0000-0000-0000-0000000000ff' },
          teacherUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects all drafts when the school has no active academic year', async () => {
      prismaMock.academicYear.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.isCurrent ? null : { id: where.id }),
      );
      await expect(
        service.createDraft(mockSchoolId, validDraftDto, teacherUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createDraft', () => {
    beforeEach(() => {
      prismaMock.academicYear.findFirst.mockResolvedValue({ id: mockAYId });
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId });
      prismaMock.section.findFirst.mockResolvedValue({ id: mockSectionId, gradeId: mockGradeId });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.findChapterById.mockResolvedValue({
        id: mockChapterId,
        gradeId: mockGradeId,
        subject: 'Physics',
      });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    });

    it('throws NotFoundException if academic year does not belong to school', async () => {
      prismaMock.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.createDraft(mockSchoolId, validDraftDto, teacherUser),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.academicYear.findFirst).toHaveBeenCalledWith({
        where: { schoolId: mockSchoolId, id: mockAYId },
      });
    });

    it('throws NotFoundException if section does not belong to the selected grade and school', async () => {
      prismaMock.section.findFirst.mockResolvedValue(null);

      await expect(
        service.createDraft(mockSchoolId, validDraftDto, teacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if chapter subject does not match assessment subject', async () => {
      examRepoMock.findChapterById.mockResolvedValue({
        id: mockChapterId,
        gradeId: mockGradeId,
        subject: 'Chemistry',
      });

      await expect(
        service.createDraft(mockSchoolId, validDraftDto, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if passingMarks > totalMarks', async () => {
      const invalidDto = { ...validDraftDto, totalMarks: 50, passingMarks: 60 };

      await expect(
        service.createDraft(mockSchoolId, invalidDto, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if totalMarks < 1.0', async () => {
      const invalidDto = { ...validDraftDto, totalMarks: 0.5 };

      await expect(
        service.createDraft(mockSchoolId, invalidDto, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if durationMinutes < 1', async () => {
      const invalidDto = { ...validDraftDto, durationMinutes: 0 };

      await expect(
        service.createDraft(mockSchoolId, invalidDto, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if endWindowAt <= startWindowAt', async () => {
      const invalidDto = {
        ...validDraftDto,
        startWindowAt: '2026-11-01T12:00:00.000Z',
        endWindowAt: '2026-11-01T11:00:00.000Z',
      };

      await expect(
        service.createDraft(mockSchoolId, invalidDto, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if teacher is not assigned to the grade and section', async () => {
      prismaMock.teacherAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.createDraft(mockSchoolId, validDraftDto, teacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates draft in DRAFT status when validation passes', async () => {
      examRepoMock.createAssessmentDraft.mockResolvedValue({
        id: mockAssessmentId,
        ...validDraftDto,
        status: AssessmentStatus.DRAFT,
      });

      const result = await service.createDraft(mockSchoolId, validDraftDto, teacherUser);
      expect(result.id).toBe(mockAssessmentId);
      expect(result.status).toBe(AssessmentStatus.DRAFT);
      expect(examRepoMock.createAssessmentDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: mockSchoolId,
          status: AssessmentStatus.DRAFT,
          teacherId: mockTeacherId,
        }),
      );
    });

    describe('Grade-Wide Authorization Gate', () => {
      const gradeWideDto = { ...validDraftDto, sectionId: undefined };

      it('allows teacher to create grade-wide draft if assigned to ALL sections of the grade', async () => {
        prismaMock.section.findMany.mockResolvedValue([
          { id: 'sec-a' },
          { id: 'sec-b' },
        ]);
        prismaMock.teacherAssignment.findMany.mockResolvedValue([
          { sectionId: 'sec-a' },
          { sectionId: 'sec-b' },
        ]);
        examRepoMock.createAssessmentDraft.mockResolvedValue({
          id: mockAssessmentId,
          ...gradeWideDto,
          status: AssessmentStatus.DRAFT,
        });

        const result = await service.createDraft(mockSchoolId, gradeWideDto, teacherUser);
        expect(result.id).toBe(mockAssessmentId);
      });

      it('rejects grade-wide draft if teacher only teaches a subset of sections', async () => {
        prismaMock.section.findMany.mockResolvedValue([
          { id: 'sec-a' },
          { id: 'sec-b' },
        ]);
        prismaMock.teacherAssignment.findMany.mockResolvedValue([
          { sectionId: 'sec-a' }, // Missing sec-b
        ]);

        await expect(
          service.createDraft(mockSchoolId, gradeWideDto, teacherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects grade-wide draft if no sections exist in the grade', async () => {
        prismaMock.section.findMany.mockResolvedValue([]);

        await expect(
          service.createDraft(mockSchoolId, gradeWideDto, teacherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects school admin creating a grade-wide draft even when a teacher is designated', async () => {
        const adminDto = { ...gradeWideDto, teacherId: mockTeacherId };
        prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });

        await expect(
          service.createDraft(mockSchoolId, adminDto, adminUser),
        ).rejects.toThrow(ForbiddenException);
        expect(examRepoMock.createAssessmentDraft).not.toHaveBeenCalled();
      });
    });

    describe('Chapter ownership and mandatory validation', () => {
      it('rejects draft creation when chapterId is missing or empty at service layer', async () => {
        const dtoWithoutChapter = { ...validDraftDto, chapterId: '' };
        await expect(
          service.createDraft(mockSchoolId, dtoWithoutChapter as any, teacherUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('accepts draft creation with own chapter', async () => {
        examRepoMock.findChapterById.mockResolvedValue({
          id: mockChapterId,
          schoolId: mockSchoolId,
          gradeId: mockGradeId,
          subject: 'Physics',
          academicYearId: mockAYId,
          createdByTeacherId: mockTeacherId,
        });
        examRepoMock.createAssessmentDraft.mockResolvedValue({
          id: mockAssessmentId,
          ...validDraftDto,
          status: AssessmentStatus.DRAFT,
        });

        const result = await service.createDraft(mockSchoolId, validDraftDto, teacherUser);
        expect(result.id).toBe(mockAssessmentId);
      });

      it('accepts draft creation with legacy institutional chapter (createdByTeacherId is null)', async () => {
        examRepoMock.findChapterById.mockResolvedValue({
          id: mockChapterId,
          schoolId: mockSchoolId,
          gradeId: mockGradeId,
          subject: 'Physics',
          academicYearId: null,
          createdByTeacherId: null,
        });
        examRepoMock.createAssessmentDraft.mockResolvedValue({
          id: mockAssessmentId,
          ...validDraftDto,
          status: AssessmentStatus.DRAFT,
        });

        const result = await service.createDraft(mockSchoolId, validDraftDto, teacherUser);
        expect(result.id).toBe(mockAssessmentId);
      });

      it('rejects draft creation with another teachers private chapter', async () => {
        examRepoMock.findChapterById.mockResolvedValue({
          id: mockChapterId,
          schoolId: mockSchoolId,
          gradeId: mockGradeId,
          subject: 'Physics',
          academicYearId: mockAYId,
          createdByTeacherId: 'other-teacher-profile-uuid',
        });

        await expect(
          service.createDraft(mockSchoolId, validDraftDto, teacherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects draft creation when chapter belongs to another school (404 NotFound)', async () => {
        examRepoMock.findChapterById.mockResolvedValue(null);

        await expect(
          service.createDraft(mockSchoolId, validDraftDto, teacherUser),
        ).rejects.toThrow(NotFoundException);
      });

      it('rejects draft creation when chapter belongs to a different academic year', async () => {
        examRepoMock.findChapterById.mockResolvedValue({
          id: mockChapterId,
          schoolId: mockSchoolId,
          gradeId: mockGradeId,
          subject: 'Physics',
          academicYearId: 'other-academic-year-uuid',
          createdByTeacherId: mockTeacherId,
        });

        await expect(
          service.createDraft(mockSchoolId, validDraftDto, teacherUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects draft creation when chapter belongs to a different grade', async () => {
        examRepoMock.findChapterById.mockResolvedValue({
          id: mockChapterId,
          schoolId: mockSchoolId,
          gradeId: 'other-grade-uuid',
          subject: 'Physics',
          academicYearId: mockAYId,
          createdByTeacherId: mockTeacherId,
        });

        await expect(
          service.createDraft(mockSchoolId, validDraftDto, teacherUser),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('updateDraft', () => {
    const existingDraft = {
      id: mockAssessmentId,
      schoolId: mockSchoolId,
      academicYearId: mockAYId,
      gradeId: mockGradeId,
      sectionId: mockSectionId,
      teacherId: mockTeacherId,
      title: 'Original Title',
      subject: 'Physics',
      status: AssessmentStatus.DRAFT,
      totalMarks: 100,
      passingMarks: 40,
      durationMinutes: 60,
    };

    beforeEach(() => {
      prismaMock.academicYear.findFirst.mockResolvedValue({ id: mockAYId });
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: mockGradeId });
      prismaMock.section.findFirst.mockResolvedValue({ id: mockSectionId, gradeId: mockGradeId });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    });

    it('throws NotFoundException if assessment does not exist in caller school', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(null);

      await expect(
        service.updateDraft(mockSchoolId, 'non-existent', { title: 'New' }, teacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if assessment is not in DRAFT status', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...existingDraft,
        status: AssessmentStatus.PUBLISHED,
      });

      await expect(
        service.updateDraft(mockSchoolId, mockAssessmentId, { title: 'New' }, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if teacher attempts to modify another teacher draft', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });

      await expect(
        service.updateDraft(mockSchoolId, mockAssessmentId, { title: 'New' }, otherTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows author teacher to update draft title and parameters', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      examRepoMock.updateAssessmentDraft.mockResolvedValue({
        ...existingDraft,
        title: 'Updated Title',
        totalMarks: 120,
      });

      const result = await service.updateDraft(
        mockSchoolId,
        mockAssessmentId,
        { title: 'Updated Title', totalMarks: 120 },
        teacherUser,
      );
      expect(result.title).toBe('Updated Title');
      expect(result.totalMarks).toBe(120);
    });

    it('throws ForbiddenException if teacher changes draft to an unassigned subject', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      // Teacher assignment returns null for Chemistry
      prismaMock.teacherAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDraft(
          mockSchoolId,
          mockAssessmentId,
          { subject: 'Chemistry' },
          teacherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if teacher changes draft to an unassigned grade', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      const otherGradeId = '00000000-0000-0000-0000-000000000288';
      prismaMock.gradeClass.findFirst.mockResolvedValue({ id: otherGradeId });
      prismaMock.section.findFirst.mockResolvedValue({ id: mockSectionId, gradeId: otherGradeId });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDraft(
          mockSchoolId,
          mockAssessmentId,
          { gradeId: otherGradeId },
          teacherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if teacher changes section-specific draft to grade-wide without full coverage', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      prismaMock.section.findMany.mockResolvedValue([
        { id: 'sec-a' },
        { id: 'sec-b' },
      ]);
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { sectionId: 'sec-a' }, // missing sec-b
      ]);

      await expect(
        service.updateDraft(
          mockSchoolId,
          mockAssessmentId,
          { sectionId: null },
          teacherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows teacher to change draft to another section where teacher is authorized', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      prismaMock.section.findFirst.mockResolvedValue({ id: mockSectionId2, gradeId: mockGradeId });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue({ id: 'assign-2' });
      examRepoMock.updateAssessmentDraft.mockResolvedValue({
        ...existingDraft,
        sectionId: mockSectionId2,
      });

      const result = await service.updateDraft(
        mockSchoolId,
        mockAssessmentId,
        { sectionId: mockSectionId2 },
        teacherUser,
      );
      expect(result.sectionId).toBe(mockSectionId2);
    });

    it('rejects school admin updating a draft', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);

      await expect(
        service.updateDraft(mockSchoolId, mockAssessmentId, { title: 'Hijack' }, adminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.updateAssessmentDraft).not.toHaveBeenCalled();
    });

    it('rejects editing a draft that belongs to a previous academic year', async () => {
      const oldYearId = '00000000-0000-0000-0000-0000000000a1';
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...existingDraft,
        academicYearId: oldYearId,
      });

      await expect(
        service.updateDraft(mockSchoolId, mockAssessmentId, { title: 'Late edit' }, teacherUser),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.updateAssessmentDraft).not.toHaveBeenCalled();
    });

    it('rejects moving a draft into a non-current academic year', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);

      await expect(
        service.updateDraft(
          mockSchoolId,
          mockAssessmentId,
          { academicYearId: '00000000-0000-0000-0000-0000000000a1' },
          teacherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    describe('Chapter ownership validation on draft update', () => {
      it('allows updating draft with own chapter', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
        examRepoMock.findChapterById.mockResolvedValue({
          id: 'new-chapter-uuid',
          schoolId: mockSchoolId,
          gradeId: mockGradeId,
          subject: 'Physics',
          academicYearId: mockAYId,
          createdByTeacherId: mockTeacherId,
        });
        examRepoMock.updateAssessmentDraft.mockResolvedValue({
          ...existingDraft,
          chapterId: 'new-chapter-uuid',
        });

        const result = await service.updateDraft(
          mockSchoolId,
          mockAssessmentId,
          { chapterId: 'new-chapter-uuid' },
          teacherUser,
        );
        expect(result.chapterId).toBe('new-chapter-uuid');
      });

      it('allows updating draft with legacy institutional chapter', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
        examRepoMock.findChapterById.mockResolvedValue({
          id: 'legacy-chapter-uuid',
          schoolId: mockSchoolId,
          gradeId: mockGradeId,
          subject: 'Physics',
          academicYearId: null,
          createdByTeacherId: null,
        });
        examRepoMock.updateAssessmentDraft.mockResolvedValue({
          ...existingDraft,
          chapterId: 'legacy-chapter-uuid',
        });

        const result = await service.updateDraft(
          mockSchoolId,
          mockAssessmentId,
          { chapterId: 'legacy-chapter-uuid' },
          teacherUser,
        );
        expect(result.chapterId).toBe('legacy-chapter-uuid');
      });

      it('rejects updating draft with another teachers private chapter', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
        examRepoMock.findChapterById.mockResolvedValue({
          id: 'other-chapter-uuid',
          schoolId: mockSchoolId,
          gradeId: mockGradeId,
          subject: 'Physics',
          academicYearId: mockAYId,
          createdByTeacherId: 'other-teacher-profile-uuid',
        });

        await expect(
          service.updateDraft(
            mockSchoolId,
            mockAssessmentId,
            { chapterId: 'other-chapter-uuid' },
            teacherUser,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects updating draft with chapter belonging to different academic year', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
        examRepoMock.findChapterById.mockResolvedValue({
          id: 'wrong-year-chapter-uuid',
          schoolId: mockSchoolId,
          gradeId: mockGradeId,
          subject: 'Physics',
          academicYearId: 'past-academic-year-uuid',
          createdByTeacherId: mockTeacherId,
        });

        await expect(
          service.updateDraft(
            mockSchoolId,
            mockAssessmentId,
            { chapterId: 'wrong-year-chapter-uuid' },
            teacherUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('preserves historical drafts having chapterId = null when updating non-chapter fields', async () => {
        const historicalNullChapterDraft = { ...existingDraft, chapterId: null };
        examRepoMock.findAssessmentById.mockResolvedValue(historicalNullChapterDraft);
        examRepoMock.updateAssessmentDraft.mockResolvedValue({
          ...historicalNullChapterDraft,
          title: 'Updated Historical Title',
        });

        const result = await service.updateDraft(
          mockSchoolId,
          mockAssessmentId,
          { title: 'Updated Historical Title' },
          teacherUser,
        );
        expect(result.title).toBe('Updated Historical Title');
        expect(result.chapterId).toBeNull();
      });
    });
  });

  describe('deleteDraft', () => {
    const existingDraft = {
      id: mockAssessmentId,
      schoolId: mockSchoolId,
      teacherId: mockTeacherId,
      status: AssessmentStatus.DRAFT,
    };

    beforeEach(() => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.countChildQuestions.mockResolvedValue(0);
      examRepoMock.countChildSections.mockResolvedValue(0);
    });

    it('throws NotFoundException if assessment does not exist in caller school', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(null);

      await expect(
        service.deleteDraft(mockSchoolId, 'non-existent', teacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if assessment status is not DRAFT', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...existingDraft,
        status: AssessmentStatus.PUBLISHED,
      });

      await expect(
        service.deleteDraft(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if teacher attempts to delete another teacher draft', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });

      await expect(
        service.deleteDraft(mockSchoolId, mockAssessmentId, otherTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks deletion with BadRequestException if dependent questions exist', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      examRepoMock.countChildQuestions.mockResolvedValue(5);

      await expect(
        service.deleteDraft(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(BadRequestException);
      expect(examRepoMock.deleteAssessmentDraft).not.toHaveBeenCalled();
    });

    it('blocks deletion with BadRequestException if dependent assessment sections exist', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      examRepoMock.countChildSections.mockResolvedValue(2);

      await expect(
        service.deleteDraft(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(BadRequestException);
      expect(examRepoMock.deleteAssessmentDraft).not.toHaveBeenCalled();
    });

    it('converts PostgreSQL foreign key violation (23503) into ConflictException', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      examRepoMock.countChildQuestions.mockResolvedValue(0);
      examRepoMock.countChildSections.mockResolvedValue(0);
      const dbFkError: any = new Error('update or delete on table "assessments" violates foreign key constraint');
      dbFkError.code = '23503';
      examRepoMock.deleteAssessmentDraft.mockRejectedValue(dbFkError);

      await expect(
        service.deleteDraft(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(ConflictException);
    });

    it('converts trigger non-draft deletion error (P0001) into ConflictException', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      const dbTriggerError: any = new Error('Cannot delete assessment: Only DRAFT assessments may be deleted.');
      dbTriggerError.code = 'P0001';
      examRepoMock.deleteAssessmentDraft.mockRejectedValue(dbTriggerError);

      await expect(
        service.deleteDraft(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated database errors without converting to ConflictException', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      const networkError = new Error('Connection terminated unexpectedly');
      examRepoMock.deleteAssessmentDraft.mockRejectedValue(networkError);

      await expect(
        service.deleteDraft(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow('Connection terminated unexpectedly');
    });

    it('deletes draft successfully when 0 child questions and 0 child sections exist', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(existingDraft);
      examRepoMock.countChildQuestions.mockResolvedValue(0);
      examRepoMock.countChildSections.mockResolvedValue(0);

      const result = await service.deleteDraft(mockSchoolId, mockAssessmentId, teacherUser);
      expect(result.success).toBe(true);
      expect(examRepoMock.deleteAssessmentDraft).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
      );
    });
  });

  describe('listAssessments & getAssessmentById visibility scoping', () => {
    beforeEach(() => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
    });

    describe('listAssessments', () => {
      it('passes requestingTeacherId when caller is a TEACHER', async () => {
        examRepoMock.findAssessments.mockResolvedValue([]);

        await service.listAssessments(
          mockSchoolId,
          { status: AssessmentStatus.DRAFT },
          teacherUser,
        );

        expect(examRepoMock.findAssessments).toHaveBeenCalledWith(mockSchoolId, {
          status: AssessmentStatus.DRAFT,
          gradeId: undefined,
          subject: undefined,
          academicYearId: undefined,
          requestingTeacherId: mockTeacherId,
        });
      });

      it('does NOT pass requestingTeacherId when caller is a SCHOOL_ADMIN', async () => {
        examRepoMock.findAssessments.mockResolvedValue([]);

        await service.listAssessments(
          mockSchoolId,
          { status: AssessmentStatus.DRAFT },
          adminUser,
        );

        expect(examRepoMock.findAssessments).toHaveBeenCalledWith(mockSchoolId, {
          status: AssessmentStatus.DRAFT,
          gradeId: undefined,
          subject: undefined,
          academicYearId: undefined,
          requestingTeacherId: undefined,
        });
      });
    });

    describe('getAssessmentById', () => {
      it('allows author teacher to retrieve their own draft assessment', async () => {
        const myDraft = {
          id: mockAssessmentId,
          schoolId: mockSchoolId,
          teacherId: mockTeacherId,
          status: AssessmentStatus.DRAFT,
          title: 'My Draft',
        };
        examRepoMock.findAssessmentById.mockResolvedValue(myDraft);

        const result = await service.getAssessmentById(
          mockSchoolId,
          mockAssessmentId,
          teacherUser,
        );
        expect(result.id).toBe(mockAssessmentId);
      });

      it('throws NotFoundException when teacher attempts to retrieve another teacher draft', async () => {
        const otherDraft = {
          id: mockAssessmentId,
          schoolId: mockSchoolId,
          teacherId: 'other-teacher-uuid',
          status: AssessmentStatus.DRAFT,
          title: 'Other Draft',
        };
        examRepoMock.findAssessmentById.mockResolvedValue(otherDraft);

        await expect(
          service.getAssessmentById(mockSchoolId, mockAssessmentId, teacherUser),
        ).rejects.toThrow(NotFoundException);
      });

      it('allows teacher to retrieve another teacher PUBLISHED assessment', async () => {
        const publishedExam = {
          id: mockAssessmentId,
          schoolId: mockSchoolId,
          teacherId: 'other-teacher-uuid',
          status: AssessmentStatus.PUBLISHED,
          title: 'Published Exam',
        };
        examRepoMock.findAssessmentById.mockResolvedValue(publishedExam);

        const result = await service.getAssessmentById(
          mockSchoolId,
          mockAssessmentId,
          teacherUser,
        );
        expect(result.id).toBe(mockAssessmentId);
      });

      it('allows school admin to retrieve any teacher draft assessment', async () => {
        const otherDraft = {
          id: mockAssessmentId,
          schoolId: mockSchoolId,
          teacherId: 'other-teacher-uuid',
          status: AssessmentStatus.DRAFT,
          title: 'Other Draft',
        };
        examRepoMock.findAssessmentById.mockResolvedValue(otherDraft);

        const result = await service.getAssessmentById(
          mockSchoolId,
          mockAssessmentId,
          adminUser,
        );
        expect(result.id).toBe(mockAssessmentId);
      });
    });
  });

  describe('publishAssessment', () => {
    const mockDraft = {
      id: mockAssessmentId,
      schoolId: mockSchoolId,
      academicYearId: mockAYId,
      gradeId: mockGradeId,
      sectionId: mockSectionId,
      teacherId: mockTeacherId,
      subject: 'Physics',
      status: AssessmentStatus.DRAFT,
      title: 'Draft Exam',
    };

    beforeEach(() => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      prismaMock.teacherAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
      prismaMock.academicYear.findFirst.mockResolvedValue({ id: mockAYId });
    });

    it('throws NotFoundException if assessment does not exist in caller school', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(null);

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if assessment is already PUBLISHED', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockDraft,
        status: AssessmentStatus.PUBLISHED,
      });

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if assessment status is not DRAFT', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockDraft,
        status: 'ARCHIVED' as any,
      });

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if teacher attempts to publish another teacher draft', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockDraft,
        teacherId: 'other-teacher-uuid',
      });

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if teacher teaching assignment is revoked', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraft);
      prismaMock.teacherAssignment.findFirst.mockResolvedValue(null); // revoked

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(/You are not assigned to teach/);
    });

    it('allows teacher to publish grade-wide draft when assigned to all sections of the grade', async () => {
      const gradeWideDraft = {
        ...mockDraft,
        sectionId: null,
      };
      examRepoMock.findAssessmentById.mockResolvedValue(gradeWideDraft);
      prismaMock.section.findMany.mockResolvedValue([{ id: 'sec-1' }, { id: 'sec-2' }]);
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { sectionId: 'sec-1' },
        { sectionId: 'sec-2' },
      ]);
      examRepoMock.publishAssessment.mockResolvedValue({
        ...gradeWideDraft,
        status: AssessmentStatus.PUBLISHED,
      });

      const result = await service.publishAssessment(
        mockSchoolId,
        mockAssessmentId,
        teacherUser,
      );

      expect(result.status).toBe(AssessmentStatus.PUBLISHED);
      expect(examRepoMock.publishAssessment).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        mockTeacherId,
      );
    });

    it('rejects teacher publishing grade-wide draft when teacher lacks coverage across all sections', async () => {
      const gradeWideDraft = {
        ...mockDraft,
        sectionId: null,
      };
      examRepoMock.findAssessmentById.mockResolvedValue(gradeWideDraft);
      prismaMock.section.findMany.mockResolvedValue([{ id: 'sec-1' }, { id: 'sec-2' }]);
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { sectionId: 'sec-1' }, // only 1 section covered
      ]);

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(/Grade-wide assessment authoring requires teaching assignments across all sections/);
    });

    it('throws ForbiddenException if caller has unauthorized role', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraft);
      const studentUser = {
        id: 'usr-student',
        schoolId: mockSchoolId,
        role: UserRole.STUDENT,
      };

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, studentUser as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows author teacher to publish their draft when assignment is valid', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraft);
      examRepoMock.publishAssessment.mockResolvedValue({
        ...mockDraft,
        status: AssessmentStatus.PUBLISHED,
      });

      const result = await service.publishAssessment(
        mockSchoolId,
        mockAssessmentId,
        teacherUser,
      );

      expect(result.status).toBe(AssessmentStatus.PUBLISHED);
      expect(examRepoMock.publishAssessment).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        mockTeacherId,
      );
    });

    it('rejects school admin publishing any draft', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraft);

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, adminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.publishAssessment).not.toHaveBeenCalled();
    });

    it('rejects platform super admin publishing any draft', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraft);

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, platformAdminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.publishAssessment).not.toHaveBeenCalled();
    });

    it('rejects teacher publishing a draft from a previous academic year', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockDraft,
        academicYearId: '00000000-0000-0000-0000-0000000000a1',
      });

      await expect(
        service.publishAssessment(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.publishAssessment).not.toHaveBeenCalled();
    });
  });

  describe('releaseResults', () => {
    const mockBaseAssessment = {
      id: mockAssessmentId,
      schoolId: mockSchoolId,
      academicYearId: mockAYId,
      gradeId: mockGradeId,
      sectionId: mockSectionId,
      teacherId: mockTeacherId,
      subject: 'Physics',
      status: AssessmentStatus.DRAFT,
      title: 'Draft Exam',
    };

    const closedAssessment = {
      ...mockBaseAssessment,
      status: AssessmentStatus.CLOSED,
      updatedAt: new Date(),
    };

    it('releases results successfully for CLOSED assessment by author teacher', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(closedAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({
        id: mockTeacherId,
        schoolId: mockSchoolId,
        status: TeacherStatus.ACTIVE,
      });
      examRepoMock.releaseAssessmentResultsAtomic.mockResolvedValue({
        ...closedAssessment,
        status: AssessmentStatus.RESULTS_RELEASED,
        updatedAt: new Date(),
      });

      const result = await service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser);
      expect(result.success).toBe(true);
      expect(result.status).toBe(AssessmentStatus.RESULTS_RELEASED);
      expect(result.alreadyReleased).toBe(false);
      expect(examRepoMock.releaseAssessmentResultsAtomic).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
      );
    });

    it('rejects SCHOOL_ADMIN and PLATFORM_SUPER_ADMIN releasing results', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(closedAssessment);

      await expect(
        service.releaseResults(mockSchoolId, mockAssessmentId, adminUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.releaseResults(mockSchoolId, mockAssessmentId, platformAdminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(examRepoMock.releaseAssessmentResultsAtomic).not.toHaveBeenCalled();
    });

    it('returns idempotent success response without re-executing if already RESULTS_RELEASED', async () => {
      const alreadyReleased = {
        ...mockBaseAssessment,
        status: AssessmentStatus.RESULTS_RELEASED,
        updatedAt: new Date(),
      };
      examRepoMock.findAssessmentById.mockResolvedValue(alreadyReleased);
      prismaMock.teacher.findFirst.mockResolvedValue({
        id: mockTeacherId,
        status: TeacherStatus.ACTIVE,
      });

      const result = await service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser);
      expect(result.success).toBe(true);
      expect(result.alreadyReleased).toBe(true);
      expect(result.message).toContain('already been released');
      expect(examRepoMock.releaseAssessmentResultsAtomic).not.toHaveBeenCalled();
    });

    it('rejects DRAFT assessments with BadRequestException', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockBaseAssessment,
        status: AssessmentStatus.DRAFT,
      });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });

      await expect(
        service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects PUBLISHED assessments with BadRequestException stating to close first', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockBaseAssessment,
        status: AssessmentStatus.PUBLISHED,
      });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });

      await expect(
        service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow('Close the assessment before releasing results');
    });

    it('rejects ARCHIVED assessments with BadRequestException', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockBaseAssessment,
        status: AssessmentStatus.ARCHIVED,
      });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });

      await expect(
        service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unauthorized teacher (not author) with ForbiddenException', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(closedAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({
        id: 'other-teacher-id',
        status: TeacherStatus.ACTIVE,
      });

      await expect(
        service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects release when active attempts remain IN_PROGRESS', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(closedAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });
      examRepoMock.releaseAssessmentResultsAtomic.mockRejectedValue(
        new BadRequestException('Cannot release results: assessment has 1 active attempt(s) in progress. Wait for all attempts to be submitted or reach their deadlines before releasing results.'),
      );

      await expect(
        service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow('Cannot release results: assessment has 1 active attempt(s) in progress');
    });

    it('rejects release when terminal attempts are missing required AssessmentResult', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(closedAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });
      examRepoMock.releaseAssessmentResultsAtomic.mockRejectedValue(
        new BadRequestException('Cannot release results: assessment has 1 finalized attempt(s) missing score calculation. Wait for scoring to complete before releasing results.'),
      );

      await expect(
        service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow('Cannot release results: assessment has 1 finalized attempt(s) missing score calculation');
    });

    it('rejects cross-tenant lookup with NotFoundException', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(null);

      await expect(
        service.releaseResults(mockSchoolId, 'wrong-id', teacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    describe('FINDING-03: Safe Expired Attempt Reconciliation & Result Release', () => {
      it('reconciles expired attempts before atomic release and succeeds', async () => {
        const closed = {
          id: mockAssessmentId,
          schoolId: mockSchoolId,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          teacherId: mockTeacherId,
          subject: 'Physics',
          status: AssessmentStatus.CLOSED,
          updatedAt: new Date(),
        };
        examRepoMock.findAssessmentById.mockResolvedValue(closed);
        prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });
        examRepoMock.releaseAssessmentResultsAtomic.mockResolvedValue({
          ...closed,
          status: AssessmentStatus.RESULTS_RELEASED,
        });

        const res = await service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser);

        expect(studentAttemptsServiceMock.reconcileExpiredAttemptsForAssessment).toHaveBeenCalledWith(
          mockSchoolId,
          mockAssessmentId,
        );
        expect(examRepoMock.releaseAssessmentResultsAtomic).toHaveBeenCalledWith(
          mockSchoolId,
          mockAssessmentId,
        );
        expect(res.status).toBe(AssessmentStatus.RESULTS_RELEASED);
      });

      it('aborts release and does NOT call releaseAssessmentResultsAtomic if reconciliation fails', async () => {
        const closed = {
          id: mockAssessmentId,
          schoolId: mockSchoolId,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          teacherId: mockTeacherId,
          subject: 'Physics',
          status: AssessmentStatus.CLOSED,
          updatedAt: new Date(),
        };
        examRepoMock.findAssessmentById.mockResolvedValue(closed);
        prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });
        studentAttemptsServiceMock.reconcileExpiredAttemptsForAssessment.mockRejectedValueOnce(
          new Error('Scoring engine database failure'),
        );

        await expect(
          service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser),
        ).rejects.toThrow('Scoring engine database failure');

        expect(examRepoMock.releaseAssessmentResultsAtomic).not.toHaveBeenCalled();
      });

      it('aborts release if active non-expired attempts remain after reconciliation', async () => {
        const closed = {
          id: mockAssessmentId,
          schoolId: mockSchoolId,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          teacherId: mockTeacherId,
          subject: 'Physics',
          status: AssessmentStatus.CLOSED,
          updatedAt: new Date(),
        };
        examRepoMock.findAssessmentById.mockResolvedValue(closed);
        prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });
        examRepoMock.releaseAssessmentResultsAtomic.mockRejectedValueOnce(
          new BadRequestException('Cannot release results: assessment has 1 active attempt(s) in progress.'),
        );

        await expect(
          service.releaseResults(mockSchoolId, mockAssessmentId, teacherUser),
        ).rejects.toThrow('Cannot release results: assessment has 1 active attempt(s) in progress.');

        expect(studentAttemptsServiceMock.reconcileExpiredAttemptsForAssessment).toHaveBeenCalledWith(
          mockSchoolId,
          mockAssessmentId,
        );
      });
    });
  });

  describe('closeAssessment', () => {
    const mockBaseAssessment = {
      id: mockAssessmentId,
      schoolId: mockSchoolId,
      academicYearId: mockAYId,
      gradeId: mockGradeId,
      sectionId: mockSectionId,
      teacherId: mockTeacherId,
      subject: 'Physics',
      status: AssessmentStatus.DRAFT,
      title: 'Draft Exam',
    };

    it('closes PUBLISHED assessment successfully', async () => {
      const published = { ...mockBaseAssessment, status: AssessmentStatus.PUBLISHED };
      examRepoMock.findAssessmentById.mockResolvedValue(published);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });
      examRepoMock.closeAssessmentAtomic.mockResolvedValue({
        ...published,
        status: AssessmentStatus.CLOSED,
      });

      const res = await service.closeAssessment(mockSchoolId, mockAssessmentId, teacherUser);
      expect(res.status).toBe(AssessmentStatus.CLOSED);
      expect(examRepoMock.closeAssessmentAtomic).toHaveBeenCalledWith(mockSchoolId, mockAssessmentId);
    });

    it('rejects closing DRAFT assessment with BadRequestException', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockBaseAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });

      await expect(
        service.closeAssessment(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Historical assessments with chapterId = null', () => {
    it('allows reading historical draft with chapterId = null', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.findAssessmentById.mockResolvedValue({
        id: mockAssessmentId,
        schoolId: mockSchoolId,
        academicYearId: mockAYId,
        gradeId: mockGradeId,
        sectionId: mockSectionId,
        teacherId: mockTeacherId,
        chapterId: null,
        title: 'Historical Exam',
        subject: 'Physics',
        status: AssessmentStatus.DRAFT,
      });

      const result = await service.getAssessmentById(mockSchoolId, mockAssessmentId, teacherUser);
      expect(result.id).toBe(mockAssessmentId);
      expect(result.chapterId).toBeNull();
    });

    it('allows listing historical assessments with chapterId = null', async () => {
      examRepoMock.findAssessments.mockResolvedValue([
        {
          id: mockAssessmentId,
          schoolId: mockSchoolId,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          teacherId: mockTeacherId,
          chapterId: null,
          title: 'Historical Exam',
          subject: 'Physics',
          status: AssessmentStatus.PUBLISHED,
        },
      ]);

      const list = await service.listAssessments(mockSchoolId, {}, adminUser);
      expect(list).toHaveLength(1);
      expect(list[0].chapterId).toBeNull();
    });
  });

  describe('CreateAssessmentDraftDto validation', () => {
    it('fails validation when chapterId is missing', async () => {
      const dto = plainToInstance(CreateAssessmentDraftDto, {
        academicYearId: '123e4567-e89b-42d3-a456-426614174000',
        gradeId: '123e4567-e89b-42d3-a456-426614174001',
        title: 'Quiz',
        subject: 'Physics',
        totalMarks: 50,
        passingMarks: 20,
        durationMinutes: 30,
      });
      const errors = await validate(dto);
      const chapterError = errors.find((e) => e.property === 'chapterId');
      expect(chapterError).toBeDefined();
    });

    it('fails validation when chapterId is not a valid UUID', async () => {
      const dto = plainToInstance(CreateAssessmentDraftDto, {
        academicYearId: '123e4567-e89b-42d3-a456-426614174000',
        gradeId: '123e4567-e89b-42d3-a456-426614174001',
        chapterId: 'invalid-not-a-uuid',
        title: 'Quiz',
        subject: 'Physics',
        totalMarks: 50,
        passingMarks: 20,
        durationMinutes: 30,
      });
      const errors = await validate(dto);
      const chapterError = errors.find((e) => e.property === 'chapterId');
      expect(chapterError).toBeDefined();
      expect(chapterError?.constraints?.isUuid).toBeDefined();
    });

    it('passes validation when chapterId is a valid UUID', async () => {
      const dto = plainToInstance(CreateAssessmentDraftDto, {
        academicYearId: '123e4567-e89b-42d3-a456-426614174000',
        gradeId: '123e4567-e89b-42d3-a456-426614174001',
        chapterId: '123e4567-e89b-42d3-a456-426614174002',
        title: 'Quiz',
        subject: 'Physics',
        totalMarks: 50,
        passingMarks: 20,
        durationMinutes: 30,
      });
      const errors = await validate(dto);
      const chapterError = errors.find((e) => e.property === 'chapterId');
      expect(chapterError).toBeUndefined();
    });
  });
});
