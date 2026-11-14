import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ExaminationProgressionService } from '../services/examination-progression.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import {
  AssessmentDraftRecord,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
  ProgressionAssessmentStatus,
} from '../types';

describe('ExaminationProgressionService - Unit Tests', () => {
  let service: ExaminationProgressionService;
  let prismaMock: any;
  let examRepoMock: any;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockStudentId = '00000000-0000-0000-0000-000000000088';
  const mockChapterId = '00000000-0000-0000-0000-000000000077';
  const mockGradeId = '00000000-0000-0000-0000-000000000066';
  const mockSectionId = '00000000-0000-0000-0000-000000000055';
  const mockAYId = '00000000-0000-0000-0000-000000000044';

  const mockStudent = {
    id: mockStudentId,
    schoolId: mockSchoolId,
    userId: 'user-01',
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: mockSectionId,
    status: 'ACTIVE',
  };

  const mockChapter = {
    id: mockChapterId,
    schoolId: mockSchoolId,
    gradeId: mockGradeId,
    subject: 'Physics',
    chapterCode: 'PHY-01',
    title: 'Kinematics',
    orderIndex: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockAssessment = (overrides?: Partial<AssessmentDraftRecord>): AssessmentDraftRecord => ({
    id: 'assessment-01',
    schoolId: mockSchoolId,
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: mockSectionId,
    teacherId: 'teacher-01',
    chapterId: mockChapterId,
    title: 'Kinematics Quiz 1',
    description: null,
    subject: 'Physics',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.PUBLISHED,
    totalMarks: 50,
    passingMarks: 20,
    durationMinutes: 30,
    startWindowAt: new Date(Date.now() - 3600000), // 1 hour ago
    endWindowAt: new Date(Date.now() + 3600000),   // 1 hour in future
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prismaMock = {
      student: {
        findFirst: jest.fn().mockResolvedValue(mockStudent),
      },
    };

    examRepoMock = {
      findChapters: jest.fn().mockResolvedValue([]),
      findChapterById: jest.fn().mockResolvedValue(mockChapter),
      findAssessmentById: jest.fn(),
      findChapterAssessmentsForStudent: jest.fn().mockResolvedValue([]),
      findAttemptByStudentAndAssessment: jest.fn().mockResolvedValue(null),
      findProgressionByStudentAndAssessment: jest.fn().mockResolvedValue(null),
      findProgressionsByStudentAndChapter: jest.fn().mockResolvedValue([]),
      updateProgressionAtomic: jest.fn().mockImplementation((data) =>
        Promise.resolve({
          id: 'prog-01',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      finalizeAttemptAtomic: jest.fn(),
      scoreAndPersistResultAtomic: jest.fn(),
      finalizeAndScoreAttemptAtomic: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExaminationProgressionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EXAMINATION_REPOSITORY, useValue: examRepoMock },
      ],
    }).compile();

    service = module.get<ExaminationProgressionService>(ExaminationProgressionService);
  });

  describe('1. No configured assessments', () => {
    it('immediately unlocks chapter when no assessments are configured for this chapter', async () => {
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([]);

      const result = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(result.isUnlocked).toBe(true);
      expect(result.configuredModes).toEqual([]);
      expect(result.assessments).toEqual([]);
      expect(examRepoMock.updateProgressionAtomic).not.toHaveBeenCalled();
    });
  });

  describe('2. Only quiz configured', () => {
    it('remains locked if configured quiz is PENDING_OPEN', async () => {
      const quiz = createMockAssessment({ id: 'quiz-01', mode: AssessmentMode.NORMAL_QUIZ });
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([quiz]);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const result = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(result.isUnlocked).toBe(false);
      expect(result.configuredModes).toEqual([AssessmentMode.NORMAL_QUIZ]);
      expect(result.assessments[0].status).toBe(ProgressionAssessmentStatus.PENDING_OPEN);
      expect(result.assessments[0].resolved).toBe(false);
      expect(result.unlockedAt).toBeNull();
    });

    it('unlocks chapter when configured quiz attempt is SUBMITTED', async () => {
      const quiz = createMockAssessment({ id: 'quiz-01', mode: AssessmentMode.NORMAL_QUIZ });
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([quiz]);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: 'attempt-01',
        status: AttemptStatus.SUBMITTED,
      });

      const result = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(result.isUnlocked).toBe(true);
      expect(result.configuredModes).toEqual([AssessmentMode.NORMAL_QUIZ]);
      expect(result.assessments[0].status).toBe(ProgressionAssessmentStatus.RESOLVED_SUBMITTED);
      expect(result.assessments[0].resolved).toBe(true);
      expect(result.unlockedAt).toBeInstanceOf(Date);
    });
  });

  describe('3. Only live exam configured', () => {
    it('remains locked if configured live exam is not resolved', async () => {
      const exam = createMockAssessment({ id: 'exam-01', mode: AssessmentMode.LIVE_EXAM });
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([exam]);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const result = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(result.isUnlocked).toBe(false);
      expect(result.configuredModes).toEqual([AssessmentMode.LIVE_EXAM]);
      expect(result.assessments[0].resolved).toBe(false);
    });

    it('unlocks chapter when configured live exam is timed out', async () => {
      const exam = createMockAssessment({ id: 'exam-01', mode: AssessmentMode.LIVE_EXAM });
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([exam]);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: 'attempt-01',
        status: AttemptStatus.TIMED_OUT,
      });

      const result = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(result.isUnlocked).toBe(true);
      expect(result.assessments[0].status).toBe(ProgressionAssessmentStatus.RESOLVED_TIMED_OUT);
      expect(result.assessments[0].resolved).toBe(true);
    });
  });

  describe('4. Both modes configured (NORMAL_QUIZ and LIVE_EXAM)', () => {
    it('requires BOTH quiz and live exam to resolve before unlocking', async () => {
      const quiz = createMockAssessment({ id: 'quiz-01', mode: AssessmentMode.NORMAL_QUIZ });
      const exam = createMockAssessment({ id: 'exam-01', mode: AssessmentMode.LIVE_EXAM });
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([quiz, exam]);

      // Only quiz is submitted, exam has no attempt and window is still open
      examRepoMock.findAttemptByStudentAndAssessment.mockImplementation((sId, aId) => {
        if (aId === 'quiz-01') return Promise.resolve({ id: 'att-1', status: AttemptStatus.SUBMITTED });
        return Promise.resolve(null);
      });

      const partialRes = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(partialRes.isUnlocked).toBe(false);
      expect(partialRes.configuredModes).toContain(AssessmentMode.NORMAL_QUIZ);
      expect(partialRes.configuredModes).toContain(AssessmentMode.LIVE_EXAM);
      expect(partialRes.assessments.find((a) => a.assessmentId === 'quiz-01')?.resolved).toBe(true);
      expect(partialRes.assessments.find((a) => a.assessmentId === 'exam-01')?.resolved).toBe(false);

      // Now both resolve: quiz is SUBMITTED, exam is TIMED_OUT
      examRepoMock.findAttemptByStudentAndAssessment.mockImplementation((sId, aId) => {
        if (aId === 'quiz-01') return Promise.resolve({ id: 'att-1', status: AttemptStatus.SUBMITTED });
        if (aId === 'exam-01') return Promise.resolve({ id: 'att-2', status: AttemptStatus.TIMED_OUT });
        return Promise.resolve(null);
      });

      const completeRes = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(completeRes.isUnlocked).toBe(true);
      expect(completeRes.assessments.every((a) => a.resolved)).toBe(true);
    });
  });

  describe('5. Multiple assessments within one mode', () => {
    it('requires EVERY assessment in that mode to resolve before mode is satisfied', async () => {
      const quiz1 = createMockAssessment({ id: 'quiz-01', mode: AssessmentMode.NORMAL_QUIZ });
      const quiz2 = createMockAssessment({ id: 'quiz-02', mode: AssessmentMode.NORMAL_QUIZ });
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([quiz1, quiz2]);

      // Only quiz1 is submitted
      examRepoMock.findAttemptByStudentAndAssessment.mockImplementation((sId, aId) => {
        if (aId === 'quiz-01') return Promise.resolve({ id: 'att-1', status: AttemptStatus.SUBMITTED });
        return Promise.resolve(null);
      });

      const res1 = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );
      expect(res1.isUnlocked).toBe(false);

      // Now both are submitted
      examRepoMock.findAttemptByStudentAndAssessment.mockImplementation((sId, aId) => {
        if (aId === 'quiz-01') return Promise.resolve({ id: 'att-1', status: AttemptStatus.SUBMITTED });
        if (aId === 'quiz-02') return Promise.resolve({ id: 'att-2', status: AttemptStatus.SUBMITTED });
        return Promise.resolve(null);
      });

      const res2 = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );
      expect(res2.isUnlocked).toBe(true);
    });
  });

  describe('6. Submitted and timed-out attempts resolve progression', () => {
    it('resolves SUBMITTED as RESOLVED_SUBMITTED and TIMED_OUT as RESOLVED_TIMED_OUT', async () => {
      const assessment = createMockAssessment();

      // SUBMITTED
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValueOnce({
        id: 'att-sub',
        status: AttemptStatus.SUBMITTED,
      });
      const statusSub = await service.evaluateAssessmentStatus(
        mockSchoolId,
        mockStudentId,
        assessment,
      );
      expect(statusSub).toBe(ProgressionAssessmentStatus.RESOLVED_SUBMITTED);

      // TIMED_OUT
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValueOnce({
        id: 'att-time',
        status: AttemptStatus.TIMED_OUT,
      });
      const statusTime = await service.evaluateAssessmentStatus(
        mockSchoolId,
        mockStudentId,
        assessment,
      );
      expect(statusTime).toBe(ProgressionAssessmentStatus.RESOLVED_TIMED_OUT);
    });

    it('finalizes IN_PROGRESS attempt lazily if deadline has passed and scores it', async () => {
      const pastDeadline = new Date(Date.now() - 5000);
      const assessment = createMockAssessment();
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValueOnce({
        id: 'att-lazy',
        status: AttemptStatus.IN_PROGRESS,
        deadlineAt: pastDeadline,
      });
      examRepoMock.finalizeAndScoreAttemptAtomic.mockResolvedValueOnce({
        attempt: {
          id: 'att-lazy',
          status: AttemptStatus.TIMED_OUT,
        },
        result: {
          id: 'res-lazy',
        },
      });

      const status = await service.evaluateAssessmentStatus(
        mockSchoolId,
        mockStudentId,
        assessment,
      );

      expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledWith(
        mockSchoolId,
        'att-lazy',
        AttemptStatus.TIMED_OUT,
        assessment.id,
      );
      expect(status).toBe(ProgressionAssessmentStatus.RESOLVED_TIMED_OUT);
    });
  });

  describe('7. Failed score still resolves progression', () => {
    it('resolves progression regardless of passing or failing score', async () => {
      const quiz = createMockAssessment({ id: 'quiz-01', passingMarks: 40, totalMarks: 50 });
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([quiz]);
      // Attempt completed with 0 marks (fail)
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: 'att-fail',
        status: AttemptStatus.SUBMITTED,
      });

      const res = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(res.isUnlocked).toBe(true);
      expect(res.assessments[0].status).toBe(ProgressionAssessmentStatus.RESOLVED_SUBMITTED);
      expect(res.assessments[0].resolved).toBe(true);
    });
  });

  describe('8. Missed assessment creates NO attempt/result', () => {
    it('resolves closed assessment with no attempt to MISSED_UNATTEMPTED without creating attempt or result', async () => {
      const pastWindow = new Date(Date.now() - 10000);
      const closedAssessment = createMockAssessment({
        id: 'closed-01',
        status: AssessmentStatus.CLOSED,
        endWindowAt: pastWindow,
      });

      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([closedAssessment]);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const res = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(res.isUnlocked).toBe(true);
      expect(res.assessments[0].status).toBe(ProgressionAssessmentStatus.MISSED_UNATTEMPTED);
      expect(res.assessments[0].resolved).toBe(true);

      // Verify STRICTLY NO fake attempt, result, or score created
      expect(examRepoMock.finalizeAttemptAtomic).not.toHaveBeenCalled();
      expect(examRepoMock.scoreAndPersistResultAtomic).not.toHaveBeenCalled();
      // createAttemptAtomic should never be touched
      expect((examRepoMock as any).createAttemptAtomic).toBeUndefined();
    });

    it('resolves unattempted RESULTS_RELEASED assessment with null endWindowAt to MISSED_UNATTEMPTED (C-01 fix)', async () => {
      const releasedAssessment = createMockAssessment({
        id: 'released-01',
        status: AssessmentStatus.RESULTS_RELEASED,
        endWindowAt: null,
      });

      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const status = await service.evaluateAssessmentStatus(
        mockSchoolId,
        mockStudentId,
        releasedAssessment,
      );

      expect(status).toBe(ProgressionAssessmentStatus.MISSED_UNATTEMPTED);
    });

    it('resolves unattempted ARCHIVED assessment with null endWindowAt to MISSED_UNATTEMPTED (C-01 fix)', async () => {
      const archivedAssessment = createMockAssessment({
        id: 'archived-01',
        status: AssessmentStatus.ARCHIVED,
        endWindowAt: null,
      });

      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const status = await service.evaluateAssessmentStatus(
        mockSchoolId,
        mockStudentId,
        archivedAssessment,
      );

      expect(status).toBe(ProgressionAssessmentStatus.MISSED_UNATTEMPTED);
    });
  });

  describe('9. Deadline not reached means not missed', () => {
    it('evaluates to PENDING_OPEN when endWindowAt is in the future and does not mark missed', async () => {
      const futureWindow = new Date(Date.now() + 3600000);
      const openAssessment = createMockAssessment({
        id: 'open-01',
        status: AssessmentStatus.PUBLISHED,
        endWindowAt: futureWindow,
      });

      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const status = await service.evaluateAssessmentStatus(
        mockSchoolId,
        mockStudentId,
        openAssessment,
      );

      expect(status).toBe(ProgressionAssessmentStatus.PENDING_OPEN);
      expect(status).not.toBe(ProgressionAssessmentStatus.MISSED_UNATTEMPTED);
    });
  });

  describe('10. Tenant and student isolation', () => {
    it('throws ForbiddenException if student profile is not found or inactive', async () => {
      prismaMock.student.findFirst.mockResolvedValue(null);

      await expect(
        service.getChapterProgression(mockSchoolId, mockChapterId, { id: 'bad-user' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if chapter is assigned to a different grade than student', async () => {
      examRepoMock.findChapterById.mockResolvedValue({
        ...mockChapter,
        gradeId: 'different-grade-uuid',
      });

      await expect(
        service.getChapterProgressionForStudent(mockSchoolId, mockChapterId, mockStudent),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if chapter does not exist in tenant', async () => {
      examRepoMock.findChapterById.mockResolvedValue(null);

      await expect(
        service.getChapterProgressionForStudent(mockSchoolId, 'unknown-chap', mockStudent),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('11. Repeated resolution is idempotent', () => {
    it('preserves initial unlockedAt timestamp across repeated resolutions', async () => {
      const initialUnlockedAt = new Date('2026-10-25T10:00:00Z');
      const quiz = createMockAssessment({ id: 'quiz-01' });

      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([quiz]);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: 'att-1',
        status: AttemptStatus.SUBMITTED,
      });
      examRepoMock.findProgressionsByStudentAndChapter.mockResolvedValue([
        {
          id: 'prog-01',
          schoolId: mockSchoolId,
          studentId: mockStudentId,
          assessmentId: 'quiz-01',
          chapterId: mockChapterId,
          status: ProgressionAssessmentStatus.RESOLVED_SUBMITTED,
          unlockedAt: initialUnlockedAt,
        },
      ]);

      const res = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(res.isUnlocked).toBe(true);
      expect(res.unlockedAt).toEqual(initialUnlockedAt);
      expect(examRepoMock.updateProgressionAtomic).toHaveBeenCalledWith(
        expect.objectContaining({
          unlockedAt: initialUnlockedAt,
        }),
      );
    });
  });

  describe('12. Preserving OVERRIDDEN status', () => {
    it('preserves OVERRIDDEN status and counts as resolved', async () => {
      const quiz = createMockAssessment({ id: 'quiz-01' });
      examRepoMock.findChapterAssessmentsForStudent.mockResolvedValue([quiz]);
      examRepoMock.findProgressionByStudentAndAssessment.mockResolvedValue({
        id: 'prog-01',
        status: ProgressionAssessmentStatus.OVERRIDDEN,
      });

      const res = await service.getChapterProgressionForStudent(
        mockSchoolId,
        mockChapterId,
        mockStudent,
      );

      expect(res.isUnlocked).toBe(true);
      expect(res.assessments[0].status).toBe(ProgressionAssessmentStatus.OVERRIDDEN);
      expect(res.assessments[0].resolved).toBe(true);
    });
  });

  describe('13. listChaptersForStudent', () => {
    it('returns curriculum chapters securely scoped to student school, grade, and academic year', async () => {
      prismaMock.student.findFirst.mockResolvedValue(mockStudent);
      examRepoMock.findChapters.mockResolvedValue([mockChapter]);

      const chapters = await service.listChaptersForStudent(mockSchoolId, { id: 'user-01' });

      expect(prismaMock.student.findFirst).toHaveBeenCalledWith({
        where: {
          schoolId: mockSchoolId,
          userId: 'user-01',
          status: 'ACTIVE',
        },
      });
      expect(examRepoMock.findChapters).toHaveBeenCalledWith(mockSchoolId, {
        gradeId: mockGradeId,
        academicYearId: mockAYId,
      });
      expect(chapters).toEqual([
        {
          id: mockChapterId,
          chapterCode: 'PHY-01',
          title: 'Kinematics',
          subject: 'Physics',
          orderIndex: 1,
        },
      ]);
    });

    it('throws ForbiddenException when active student profile is not found', async () => {
      prismaMock.student.findFirst.mockResolvedValue(null);

      await expect(
        service.listChaptersForStudent(mockSchoolId, { id: 'unknown-user' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
