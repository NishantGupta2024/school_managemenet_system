import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StudentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExaminationStudentAttemptsService } from '../services/examination-student-attempts.service';
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
  AuthenticatedUser,
} from '../types';

describe('ExaminationStudentAttemptsService - Unit Tests', () => {
  let service: ExaminationStudentAttemptsService;
  let prismaMock: any;
  let examRepoMock: any;
  let progressionServiceMock: any;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockAYId = '00000000-0000-0000-0000-000000000199';
  const mockGradeId = '00000000-0000-0000-0000-000000000299';
  const mockSectionId = '00000000-0000-0000-0000-000000000399';
  const mockOtherSectionId = '00000000-0000-0000-0000-000000000398';
  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';
  const mockAttemptId = '00000000-0000-0000-0000-000000000777';

  const mockStudentUser: AuthenticatedUser = {
    id: 'user-student-01',
    email: 'student@school.edu',
    role: UserRole.STUDENT,
    schoolId: mockSchoolId,
  };

  const mockOtherStudentUser: AuthenticatedUser = {
    id: 'user-student-02',
    email: 'other.student@school.edu',
    role: UserRole.STUDENT,
    schoolId: mockSchoolId,
  };

  const mockStudentProfile = {
    id: 'student-profile-01',
    schoolId: mockSchoolId,
    userId: mockStudentUser.id,
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: mockSectionId,
    status: StudentStatus.ACTIVE,
  };

  const baseAssessment: AssessmentDraftRecord = {
    id: mockAssessmentId,
    schoolId: mockSchoolId,
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: mockSectionId,
    chapterId: null,
    teacherId: 'teacher-01',
    title: 'Science Assessment',
    description: 'Midterm Science Exam',
    subject: 'Science',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.PUBLISHED,
    totalMarks: 50,
    passingMarks: 20,
    durationMinutes: 60,
    startWindowAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
    endWindowAt: new Date(Date.now() + 3600 * 1000), // 1 hour in future
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaMock = {
      student: {
        findFirst: jest.fn().mockResolvedValue(mockStudentProfile),
      },
      parentStudentRelation: {
        findFirst: jest.fn(),
      },
      assessment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      assessmentChapter: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    examRepoMock = {
      findEligibleAssessmentsForStudent: jest.fn(),
      findParentStudentAssessmentHistory: jest.fn().mockResolvedValue([]),
      findAssessmentById: jest.fn(),
      findChapterById: jest.fn().mockResolvedValue(null),
      findAttemptByStudentAndAssessment: jest.fn(),
      findAttemptById: jest.fn(),
      createAttemptAtomic: jest.fn(),
      findQuestionsByAssessmentId: jest.fn(),
      findQuestionImagesByAssessmentId: jest.fn(),
      findAttemptAnswers: jest.fn(),
      findQuestionById: jest.fn(),
      saveAttemptAnswerAtomic: jest.fn(),
      finalizeAttemptAtomic: jest.fn(),
      scoreAndPersistResultAtomic: jest.fn().mockResolvedValue({
        id: 'res-01',
        score: 40,
        percentage: 80,
        isPassing: true,
      }),
      finalizeAndScoreAttemptAtomic: jest.fn().mockResolvedValue({
        attempt: {
          id: mockAttemptId,
          status: AttemptStatus.SUBMITTED,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
        result: {
          id: 'res-01',
          score: 40,
          percentage: 80,
          isPassing: true,
        },
      }),
      findResultByAttemptId: jest.fn(),
    };

    progressionServiceMock = {
      resolveAssessmentProgression: jest.fn().mockResolvedValue({ id: 'prog-01' }),
      getChapterProgression: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExaminationStudentAttemptsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EXAMINATION_REPOSITORY, useValue: examRepoMock },
        { provide: ExaminationProgressionService, useValue: progressionServiceMock },
      ],
    }).compile();

    service = module.get<ExaminationStudentAttemptsService>(
      ExaminationStudentAttemptsService,
    );
  });

  describe('Student identity and status validation', () => {
    it('throws ForbiddenException if student profile is not active or not found', async () => {
      prismaMock.student.findFirst.mockResolvedValue(null);

      await expect(
        service.listAssessmentsForStudent(mockSchoolId, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.startAssessment(mockSchoolId, mockAssessmentId, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /assessments (listAssessmentsForStudent)', () => {
    it('returns eligible published assessments and handles grade-wide assessments', async () => {
      const gradeWideAssessment = {
        ...baseAssessment,
        id: 'gw-assessment-01',
        sectionId: null,
      };

      examRepoMock.findEligibleAssessmentsForStudent.mockResolvedValue([
        baseAssessment,
        gradeWideAssessment,
      ]);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const result = await service.listAssessmentsForStudent(
        mockSchoolId,
        mockStudentUser,
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockAssessmentId);
      expect(result[0].hasAttempt).toBe(false);
      expect(result[1].id).toBe('gw-assessment-01');
    });

    it('filters out assessments outside schedule window if student has no attempt', async () => {
      const expiredAssessment = {
        ...baseAssessment,
        id: 'expired-01',
        endWindowAt: new Date(Date.now() - 60000), // 1 min ago
      };
      const futureAssessment = {
        ...baseAssessment,
        id: 'future-01',
        startWindowAt: new Date(Date.now() + 60000), // 1 min in future
      };

      examRepoMock.findEligibleAssessmentsForStudent.mockResolvedValue([
        expiredAssessment,
        futureAssessment,
        baseAssessment,
      ]);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const result = await service.listAssessmentsForStudent(
        mockSchoolId,
        mockStudentUser,
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockAssessmentId);
    });
  });

  describe('POST /assessments/:id/start (startAssessment)', () => {
    it('throws BadRequestException if assessment is not PUBLISHED', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...baseAssessment,
        status: AssessmentStatus.DRAFT,
      });

      await expect(
        service.startAssessment(mockSchoolId, mockAssessmentId, mockStudentUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if assessment grade or section does not match student', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...baseAssessment,
        sectionId: mockOtherSectionId,
      });

      await expect(
        service.startAssessment(mockSchoolId, mockAssessmentId, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if schedule window has expired', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...baseAssessment,
        endWindowAt: new Date(Date.now() - 10000),
      });

      await expect(
        service.startAssessment(mockSchoolId, mockAssessmentId, mockStudentUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('calculates deadlineAt as min(startedAt + duration, endWindowAt)', async () => {
      const now = new Date();
      // Assessment with endWindowAt only 30 mins away, but duration is 60 mins
      const shortEndWindow = new Date(now.getTime() + 30 * 60 * 1000);
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...baseAssessment,
        durationMinutes: 60,
        endWindowAt: shortEndWindow,
      });
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);
      examRepoMock.createAttemptAtomic.mockImplementation(async (data) => ({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: data.startedAt,
        deadlineAt: data.deadlineAt,
        submittedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue([]);
      examRepoMock.findQuestionImagesByAssessmentId.mockResolvedValue([]);
      examRepoMock.findAttemptAnswers.mockResolvedValue([]);

      const result = await service.startAssessment(
        mockSchoolId,
        mockAssessmentId,
        mockStudentUser,
      );

      expect(examRepoMock.createAttemptAtomic).toHaveBeenCalledWith(
        expect.objectContaining({
          deadlineAt: shortEndWindow,
        }),
      );
      expect(result.id).toBe(mockAttemptId);
    });

    it('resumes existing attempt if one already exists without creating another', async () => {
      const existingAttempt = {
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 600000),
        deadlineAt: new Date(Date.now() + 1800000),
        submittedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      examRepoMock.findAssessmentById.mockResolvedValue(baseAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(existingAttempt);
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue([]);
      examRepoMock.findQuestionImagesByAssessmentId.mockResolvedValue([]);
      examRepoMock.findAttemptAnswers.mockResolvedValue([]);

      const result = await service.startAssessment(
        mockSchoolId,
        mockAssessmentId,
        mockStudentUser,
      );

      expect(examRepoMock.createAttemptAtomic).not.toHaveBeenCalled();
      expect(result.id).toBe(mockAttemptId);
      expect(result.startedAt).toEqual(existingAttempt.startedAt);
    });
  });

  describe('Sanitization of questions and images', () => {
    it('strips correctOption, explanation, and storagePath from question responses', async () => {
      const questions = [
        {
          id: 'q-01',
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          sectionId: null,
          orderIndex: 1,
          questionText: 'What is H2O?',
          options: ['Water', 'Oxygen', 'Hydrogen', 'Carbon'],
          correctOption: 0,
          marks: 5,
          explanation: 'H2O is chemical formula of water.',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const images = [
        {
          id: 'img-01',
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          questionId: 'q-01',
          fileName: 'water.png',
          fileSize: 1234,
          mimeType: 'image/png',
          storagePath: 'secret/path/to/water.png',
          checksumSha256: 'abc',
          status: 'ATTACHED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      examRepoMock.findAssessmentById.mockResolvedValue(baseAssessment);
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3600000),
        submittedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue(questions);
      examRepoMock.findQuestionImagesByAssessmentId.mockResolvedValue(images);
      examRepoMock.findAttemptAnswers.mockResolvedValue([]);

      const result = await service.getAttempt(
        mockSchoolId,
        mockAttemptId,
        mockStudentUser,
      );

      expect(result.questions).toHaveLength(1);
      const q = result.questions[0] as any;
      expect(q.id).toBe('q-01');
      expect(q.correctOption).toBeUndefined();
      expect(q.explanation).toBeUndefined();
      expect(q.hasImage).toBe(true);
      expect(q.imageUrl).toBe(
        `/api/v1/examination/assessments/${mockAssessmentId}/questions/q-01/image`,
      );
      expect(q.storagePath).toBeUndefined();
    });
  });

  describe('PUT /attempts/:id/answers/:questionId (saveAnswer)', () => {
    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(baseAssessment);
    });

    it('throws ForbiddenException if attempt belongs to another student', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: 'other-student-id',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3600000),
      });

      await expect(
        service.saveAnswer(
          mockSchoolId,
          mockAttemptId,
          'q-01',
          { selectedOption: 1 },
          mockStudentUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if attempt is already SUBMITTED or TIMED_OUT', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.SUBMITTED,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3600000),
      });

      await expect(
        service.saveAnswer(
          mockSchoolId,
          mockAttemptId,
          'q-01',
          { selectedOption: 1 },
          mockStudentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects answer and finalizes attempt as TIMED_OUT if deadline has passed', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 7200000),
        deadlineAt: new Date(Date.now() - 3600000), // deadline passed 1 hour ago
      });

      await expect(
        service.saveAnswer(
          mockSchoolId,
          mockAttemptId,
          'q-01',
          { selectedOption: 1 },
          mockStudentUser,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledWith(
        mockSchoolId,
        mockAttemptId,
        AttemptStatus.TIMED_OUT,
        mockAssessmentId,
      );
    });

    it('rejects question if it does not belong to the assessment', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3600000),
      });
      examRepoMock.findQuestionById.mockResolvedValue(null);

      await expect(
        service.saveAnswer(
          mockSchoolId,
          mockAttemptId,
          'unrelated-q-id',
          { selectedOption: 1 },
          mockStudentUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('saves valid answer and allows clearing with null', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3600000),
      });
      examRepoMock.findQuestionById.mockResolvedValue({
        id: 'q-01',
        assessmentId: mockAssessmentId,
      });
      examRepoMock.saveAttemptAnswerAtomic.mockResolvedValue({
        questionId: 'q-01',
        selectedOption: null,
      });

      const result = await service.saveAnswer(
        mockSchoolId,
        mockAttemptId,
        'q-01',
        { selectedOption: null },
        mockStudentUser,
      );

      expect(result.success).toBe(true);
      expect(result.selectedOption).toBeNull();
      expect(examRepoMock.saveAttemptAnswerAtomic).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedOption: null,
        }),
      );
    });

    it('rejects answer saving if assessment results are already released', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3600000),
      });
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...baseAssessment,
        status: AssessmentStatus.RESULTS_RELEASED,
      });

      await expect(
        service.saveAnswer(
          mockSchoolId,
          mockAttemptId,
          'q-01',
          { selectedOption: 1 },
          mockStudentUser,
        ),
      ).rejects.toThrow('Cannot save answer: assessment is in RESULTS_RELEASED status');
    });
  });

  describe('POST /attempts/:id/submit (submitAttempt)', () => {
    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(baseAssessment);
    });

    it('finalizes active attempt as SUBMITTED before deadline', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3600000),
      });
      const submittedAt = new Date();
      examRepoMock.finalizeAndScoreAttemptAtomic.mockResolvedValue({
        attempt: {
          id: mockAttemptId,
          status: AttemptStatus.SUBMITTED,
          submittedAt,
        },
        result: { id: 'res-01' },
      });

      const result = await service.submitAttempt(
        mockSchoolId,
        mockAttemptId,
        mockStudentUser,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(AttemptStatus.SUBMITTED);
      expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledWith(
        mockSchoolId,
        mockAttemptId,
        AttemptStatus.SUBMITTED,
        mockAssessmentId,
      );
      expect((result as any).score).toBeUndefined();
      expect((result as any).percentage).toBeUndefined();
      expect((result as any).correctAnswers).toBeUndefined();
    });

    it('finalizes active attempt as TIMED_OUT at or after deadline', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 7200000),
        deadlineAt: new Date(Date.now() - 1000),
      });
      const submittedAt = new Date();
      examRepoMock.finalizeAndScoreAttemptAtomic.mockResolvedValue({
        attempt: {
          id: mockAttemptId,
          status: AttemptStatus.TIMED_OUT,
          submittedAt,
        },
        result: { id: 'res-01' },
      });

      const result = await service.submitAttempt(
        mockSchoolId,
        mockAttemptId,
        mockStudentUser,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(AttemptStatus.TIMED_OUT);
      expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledWith(
        mockSchoolId,
        mockAttemptId,
        AttemptStatus.TIMED_OUT,
        mockAssessmentId,
      );
    });

    it('is idempotent for duplicate submit requests and preserves terminal timestamp', async () => {
      const originalSubmittedAt = new Date(Date.now() - 300000);
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.SUBMITTED,
        startedAt: new Date(Date.now() - 3600000),
        deadlineAt: new Date(Date.now() + 1800000),
        submittedAt: originalSubmittedAt,
      });

      const result = await service.submitAttempt(
        mockSchoolId,
        mockAttemptId,
        mockStudentUser,
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(AttemptStatus.SUBMITTED);
      expect(result.submittedAt).toEqual(originalSubmittedAt);
      expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledWith(
        mockSchoolId,
        mockAttemptId,
        AttemptStatus.SUBMITTED,
        mockAssessmentId,
      );
    });

    it('rejects attempt submission if assessment results are already released', async () => {
      examRepoMock.findAttemptById.mockResolvedValue({
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 3600000),
      });
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...baseAssessment,
        status: AssessmentStatus.RESULTS_RELEASED,
      });

      await expect(
        service.submitAttempt(
          mockSchoolId,
          mockAttemptId,
          mockStudentUser,
        ),
      ).rejects.toThrow('Cannot submit attempt: assessment results have already been released');
    });
  });

  describe('GET /assessments/:id/result (getStudentAssessmentResult)', () => {
    const mockReleasedAssessment: AssessmentDraftRecord = {
      id: mockAssessmentId,
      schoolId: mockSchoolId,
      academicYearId: mockAYId,
      gradeId: mockGradeId,
      sectionId: mockSectionId,
      teacherId: 'teacher-01',
      chapterId: 'chap-01',
      title: 'Physics Finals',
      description: null,
      subject: 'Physics',
      mode: AssessmentMode.NORMAL_QUIZ,
      status: AssessmentStatus.RESULTS_RELEASED,
      totalMarks: 50,
      passingMarks: 20,
      durationMinutes: 30,
      startWindowAt: new Date(Date.now() - 7200000),
      endWindowAt: new Date(Date.now() - 3600000),
      shuffleQuestions: false,
      shuffleOptions: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns student own sanitized result when assessment is RESULTS_RELEASED', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: mockAttemptId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date('2026-10-29T12:00:00Z'),
      });
      examRepoMock.findResultByAttemptId.mockResolvedValue({
        id: 'res-01',
        attemptId: mockAttemptId,
        totalQuestions: 5,
        attemptedQuestions: 5,
        correctAnswers: 4,
        incorrectAnswers: 1,
        score: 40,
        percentage: 80,
        isPassing: true,
      });

      const res = await service.getStudentAssessmentResult(
        mockSchoolId,
        mockAssessmentId,
        mockStudentUser,
      );

      expect(res.assessmentId).toBe(mockAssessmentId);
      expect(res.hasAttempt).toBe(true);
      expect(res.result).toEqual({
        attemptId: mockAttemptId,
        totalQuestions: 5,
        attemptedQuestions: 5,
        correctAnswers: 4,
        incorrectAnswers: 1,
        score: 40,
        percentage: 80,
        isPassing: true,
        submittedAt: new Date('2026-10-29T12:00:00Z'),
      });
      // Zero answer keys or options leaked
      expect((res.result as any).questions).toBeUndefined();
      expect((res.result as any).answers).toBeUndefined();
    });

    it('rejects access if assessment is not RESULTS_RELEASED', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        status: AssessmentStatus.CLOSED,
      });

      await expect(
        service.getStudentAssessmentResult(mockSchoolId, mockAssessmentId, mockStudentUser),
      ).rejects.toThrow('Assessment results have not been released yet');
    });

    it('returns clean unattempted payload with no fabricated result if student never attempted', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const res = await service.getStudentAssessmentResult(
        mockSchoolId,
        mockAssessmentId,
        mockStudentUser,
      );

      expect(res.hasAttempt).toBe(false);
      expect(res.result).toBeNull();
      expect(res.message).toBe('No attempt was submitted for this assessment');
      expect(examRepoMock.scoreAndPersistResultAtomic).not.toHaveBeenCalled();
    });

    it('rejects access if student is from a different grade or section and has no attempt', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        gradeId: 'wrong-grade',
      });
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      await expect(
        service.getStudentAssessmentResult(mockSchoolId, mockAssessmentId, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows student to view result of historical assessment after promotion/transfer if attempt exists', async () => {
      // Student is currently in mockGradeId, mockAYId, mockSectionId
      // Assessment belongs to an older grade/AY/section
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        academicYearId: 'past-ay-id',
        gradeId: 'past-grade-id',
        sectionId: 'past-section-id',
      });
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: mockAttemptId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date('2025-10-29T12:00:00Z'),
      });
      examRepoMock.findResultByAttemptId.mockResolvedValue({
        id: 'res-historical-01',
        attemptId: mockAttemptId,
        totalQuestions: 10,
        attemptedQuestions: 10,
        correctAnswers: 9,
        incorrectAnswers: 1,
        score: 45,
        percentage: 90,
        isPassing: true,
      });

      const res = await service.getStudentAssessmentResult(
        mockSchoolId,
        mockAssessmentId,
        mockStudentUser,
      );

      expect(res.assessmentId).toBe(mockAssessmentId);
      expect(res.hasAttempt).toBe(true);
      expect(res.result).toEqual({
        attemptId: mockAttemptId,
        totalQuestions: 10,
        attemptedQuestions: 10,
        correctAnswers: 9,
        incorrectAnswers: 1,
        score: 45,
        percentage: 90,
        isPassing: true,
        submittedAt: new Date('2025-10-29T12:00:00Z'),
      });
    });

    it('remains strictly read-only and never invokes scoring/finalization if result is missing post-release', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: mockAttemptId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date('2026-10-29T12:00:00Z'),
      });
      examRepoMock.findResultByAttemptId.mockResolvedValue(null);

      const res = await service.getStudentAssessmentResult(
        mockSchoolId,
        mockAssessmentId,
        mockStudentUser,
      );

      expect(res.hasAttempt).toBe(true);
      expect(res.result).toBeNull();
      expect(res.message).toBe('Result is not available for this attempt');
      expect(examRepoMock.finalizeAttemptAtomic).not.toHaveBeenCalled();
      expect(examRepoMock.scoreAndPersistResultAtomic).not.toHaveBeenCalled();
      expect(examRepoMock.finalizeAndScoreAttemptAtomic).not.toHaveBeenCalled();
    });
  });

  describe('GET /parent/students/:studentId/assessments/:id/result (getParentAssessmentResult)', () => {
    const mockParentUser = {
      id: 'parent-user-01',
      email: 'parent@home.org',
      role: UserRole.PARENT,
      schoolId: mockSchoolId,
    };

    const mockReleasedAssessment: AssessmentDraftRecord = {
      id: mockAssessmentId,
      schoolId: mockSchoolId,
      academicYearId: mockAYId,
      gradeId: mockGradeId,
      sectionId: mockSectionId,
      teacherId: 'teacher-01',
      chapterId: 'chap-01',
      title: 'Physics Finals',
      description: null,
      subject: 'Physics',
      mode: AssessmentMode.NORMAL_QUIZ,
      status: AssessmentStatus.RESULTS_RELEASED,
      totalMarks: 50,
      passingMarks: 20,
      durationMinutes: 30,
      startWindowAt: new Date(Date.now() - 7200000),
      endWindowAt: new Date(Date.now() - 3600000),
      shuffleQuestions: false,
      shuffleOptions: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns student result to parent when relationship is verified and active', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        id: 'rel-01',
        schoolId: mockSchoolId,
        parentId: mockParentUser.id,
        studentId: mockStudentProfile.id,
        isVerified: true,
        student: mockStudentProfile,
      });

      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: mockAttemptId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date('2026-10-29T12:00:00Z'),
      });
      examRepoMock.findResultByAttemptId.mockResolvedValue({
        id: 'res-01',
        attemptId: mockAttemptId,
        totalQuestions: 5,
        attemptedQuestions: 5,
        correctAnswers: 5,
        incorrectAnswers: 0,
        score: 50,
        percentage: 100,
        isPassing: true,
      });

      const res = await service.getParentAssessmentResult(
        mockSchoolId,
        mockStudentProfile.id,
        mockAssessmentId,
        mockParentUser,
      );

      expect(res.assessmentId).toBe(mockAssessmentId);
      expect(res.hasAttempt).toBe(true);
      expect(res.result?.score).toBe(50);
      expect(res.result?.isPassing).toBe(true);
    });

    it('rejects parent access if child is from a different cohort and has no attempt', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        id: 'rel-01',
        schoolId: mockSchoolId,
        parentId: mockParentUser.id,
        studentId: mockStudentProfile.id,
        isVerified: true,
        student: mockStudentProfile,
      });
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        gradeId: 'wrong-grade',
      });
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      await expect(
        service.getParentAssessmentResult(
          mockSchoolId,
          mockStudentProfile.id,
          mockAssessmentId,
          mockParentUser,
        ),
      ).rejects.toThrow('Student does not have access to this assessment');
    });

    it('allows parent to view historical child result after child promotion/transfer if attempt exists', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        id: 'rel-01',
        schoolId: mockSchoolId,
        parentId: mockParentUser.id,
        studentId: mockStudentProfile.id,
        isVerified: true,
        student: mockStudentProfile, // Current grade/ay
      });

      // Past grade/ay
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        academicYearId: 'past-ay-id',
        gradeId: 'past-grade-id',
        sectionId: 'past-section-id',
      });
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: mockAttemptId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date('2025-10-29T12:00:00Z'),
      });
      examRepoMock.findResultByAttemptId.mockResolvedValue({
        id: 'res-historical-parent',
        attemptId: mockAttemptId,
        totalQuestions: 5,
        attemptedQuestions: 5,
        correctAnswers: 5,
        incorrectAnswers: 0,
        score: 50,
        percentage: 100,
        isPassing: true,
      });

      const res = await service.getParentAssessmentResult(
        mockSchoolId,
        mockStudentProfile.id,
        mockAssessmentId,
        mockParentUser,
      );

      expect(res.assessmentId).toBe(mockAssessmentId);
      expect(res.hasAttempt).toBe(true);
      expect(res.result?.score).toBe(50);
      expect(res.result?.percentage).toBe(100);
      expect(res.result?.isPassing).toBe(true);
    });

    it('rejects unverified parent relationship with ForbiddenException', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue(null);

      await expect(
        service.getParentAssessmentResult(
          mockSchoolId,
          mockStudentProfile.id,
          mockAssessmentId,
          mockParentUser,
        ),
      ).rejects.toThrow('You do not have a verified active relationship with this student');
    });

    it('rejects parent access before assessment results are released', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        id: 'rel-01',
        isVerified: true,
        student: mockStudentProfile,
      });
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        status: AssessmentStatus.CLOSED,
      });

      await expect(
        service.getParentAssessmentResult(
          mockSchoolId,
          mockStudentProfile.id,
          mockAssessmentId,
          mockParentUser,
        ),
      ).rejects.toThrow('Assessment results have not been released yet');
    });

    it('parent result read remains strictly read-only and never invokes scoring/finalization if result is missing post-release', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        id: 'rel-01',
        isVerified: true,
        student: mockStudentProfile,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: mockAttemptId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.SUBMITTED,
        submittedAt: new Date('2026-10-29T12:00:00Z'),
      });
      examRepoMock.findResultByAttemptId.mockResolvedValue(null);

      const res = await service.getParentAssessmentResult(
        mockSchoolId,
        mockStudentProfile.id,
        mockAssessmentId,
        mockParentUser,
      );

      expect(res.hasAttempt).toBe(true);
      expect(res.result).toBeNull();
      expect(res.message).toBe('Result is not available for this attempt');
      expect(examRepoMock.finalizeAttemptAtomic).not.toHaveBeenCalled();
      expect(examRepoMock.scoreAndPersistResultAtomic).not.toHaveBeenCalled();
      expect(examRepoMock.finalizeAndScoreAttemptAtomic).not.toHaveBeenCalled();
    });

    it('enriches result DTO with chapter metadata, mode, schedule, assessmentStatus, and attemptStatus (SUBMITTED vs TIMED_OUT)', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        id: 'rel-01',
        schoolId: mockSchoolId,
        parentId: mockParentUser.id,
        studentId: mockStudentProfile.id,
        isVerified: true,
        student: mockStudentProfile,
      });

      const startWindow = new Date('2026-10-29T09:00:00Z');
      const endWindow = new Date('2026-10-29T10:30:00Z');
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        chapterId: 'chap-01',
        mode: AssessmentMode.LIVE_EXAM,
        durationMinutes: 45,
        startWindowAt: startWindow,
        endWindowAt: endWindow,
        status: AssessmentStatus.RESULTS_RELEASED,
      });
      examRepoMock.findChapterById.mockResolvedValue({
        id: 'chap-01',
        schoolId: mockSchoolId,
        gradeId: mockGradeId,
        subject: 'Physics',
        chapterCode: 'PHY-CH01',
        title: 'Laws of Motion',
        orderIndex: 1,
      });
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: mockAttemptId,
        studentId: mockStudentProfile.id,
        status: AttemptStatus.TIMED_OUT,
        submittedAt: new Date('2026-10-29T09:45:00Z'),
      });
      examRepoMock.findResultByAttemptId.mockResolvedValue({
        id: 'res-01',
        attemptId: mockAttemptId,
        totalQuestions: 10,
        attemptedQuestions: 8,
        correctAnswers: 6,
        incorrectAnswers: 2,
        score: 30,
        percentage: 60,
        isPassing: true,
      });

      const res = await service.getParentAssessmentResult(
        mockSchoolId,
        mockStudentProfile.id,
        mockAssessmentId,
        mockParentUser,
      );

      expect(res.chapterId).toBe('chap-01');
      expect(res.chapterCode).toBe('PHY-CH01');
      expect(res.chapterTitle).toBe('Laws of Motion');
      expect(res.mode).toBe(AssessmentMode.LIVE_EXAM);
      expect(res.durationMinutes).toBe(45);
      expect(res.startWindowAt).toEqual(startWindow);
      expect(res.endWindowAt).toEqual(endWindow);
      expect(res.assessmentStatus).toBe(AssessmentStatus.RESULTS_RELEASED);
      expect(res.attemptStatus).toBe(AttemptStatus.TIMED_OUT);
      // Existing fields remain backward-compatible and no answer keys/explanations leak
      expect(res.assessmentId).toBe(mockAssessmentId);
      expect(res.title).toBe('Physics Finals');
      expect(res.subject).toBe('Physics');
      expect(res.totalMarks).toBe(50);
      expect(res.passingMarks).toBe(20);
      expect(res.hasAttempt).toBe(true);
      expect(res.result).toEqual({
        attemptId: mockAttemptId,
        totalQuestions: 10,
        attemptedQuestions: 8,
        correctAnswers: 6,
        incorrectAnswers: 2,
        score: 30,
        percentage: 60,
        isPassing: true,
        submittedAt: new Date('2026-10-29T09:45:00Z'),
      });
      expect((res as any).questions).toBeUndefined();
      expect((res as any).correctOption).toBeUndefined();
      expect((res as any).explanation).toBeUndefined();
    });

    it('handles nullable chapter and schedule fields cleanly and returns attemptStatus: null when unattempted', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        id: 'rel-01',
        schoolId: mockSchoolId,
        parentId: mockParentUser.id,
        studentId: mockStudentProfile.id,
        isVerified: true,
        student: mockStudentProfile,
      });

      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        chapterId: null,
        startWindowAt: null,
        endWindowAt: null,
      });
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      const res = await service.getParentAssessmentResult(
        mockSchoolId,
        mockStudentProfile.id,
        mockAssessmentId,
        mockParentUser,
      );

      expect(res.chapterId).toBeNull();
      expect(res.chapterCode).toBeNull();
      expect(res.chapterTitle).toBeNull();
      expect(res.startWindowAt).toBeNull();
      expect(res.endWindowAt).toBeNull();
      expect(res.hasAttempt).toBe(false);
      expect(res.attemptStatus).toBeNull();
      expect(res.result).toBeNull();
      expect(examRepoMock.findChapterById).not.toHaveBeenCalled();
    });
  });

  describe('GET /parent/students/:studentId/assessments (getParentStudentAssessments)', () => {
    const mockParentUser = {
      id: 'parent-user-01',
      email: 'parent@home.org',
      role: UserRole.PARENT,
      schoolId: mockSchoolId,
    };

    const verifiedActiveRelation = {
      id: 'rel-01',
      schoolId: mockSchoolId,
      parentId: mockParentUser.id,
      studentId: mockStudentProfile.id,
      isVerified: true,
      student: mockStudentProfile,
    };

    describe('A. Parent-child authorization', () => {
      it('1. Authorized parent with verified child can retrieve examination history', async () => {
        prismaMock.parentStudentRelation.findFirst.mockResolvedValue(verifiedActiveRelation);
        examRepoMock.findParentStudentAssessmentHistory.mockResolvedValue([
          {
            id: 'assess-rel-1',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            chapterId: 'chap-01',
            chapterCode: 'MTH-01',
            chapterTitle: 'Linear Equations',
            title: 'Algebra Unit Test',
            subject: 'Mathematics',
            mode: AssessmentMode.NORMAL_QUIZ,
            status: AssessmentStatus.RESULTS_RELEASED,
            totalMarks: 25,
            passingMarks: 10,
            durationMinutes: 30,
            startWindowAt: new Date('2026-10-20T09:00:00Z'),
            endWindowAt: new Date('2026-10-20T10:00:00Z'),
            createdAt: new Date('2026-10-19T09:00:00Z'),
            attempt: {
              id: 'att-01',
              studentId: mockStudentProfile.id,
              status: AttemptStatus.SUBMITTED,
              submittedAt: new Date('2026-10-20T09:25:00Z'),
              result: {
                attemptId: 'att-01',
                totalQuestions: 5,
                attemptedQuestions: 5,
                correctAnswers: 4,
                incorrectAnswers: 1,
                score: 20,
                percentage: 80,
                isPassing: true,
              },
            },
          },
        ]);

        const res = await service.getParentStudentAssessments(
          mockSchoolId,
          mockStudentProfile.id,
          mockParentUser,
        );

        expect(prismaMock.parentStudentRelation.findFirst).toHaveBeenCalledWith({
          where: {
            schoolId: mockSchoolId,
            parentId: mockParentUser.id,
            studentId: mockStudentProfile.id,
            isVerified: true,
          },
          include: { student: true },
        });
        expect(res.studentId).toBe(mockStudentProfile.id);
        expect(res.assessments).toHaveLength(1);
        expect(res.assessments[0].assessmentId).toBe('assess-rel-1');
        expect(res.assessments[0].chapterCode).toBe('MTH-01');
        expect(res.assessments[0].chapterTitle).toBe('Linear Equations');
      });

      it('2. Parent without a verified relationship receives 403 ForbiddenException', async () => {
        prismaMock.parentStudentRelation.findFirst.mockResolvedValue(null);

        await expect(
          service.getParentStudentAssessments(
            mockSchoolId,
            mockStudentProfile.id,
            mockParentUser,
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(examRepoMock.findParentStudentAssessmentHistory).not.toHaveBeenCalled();
      });

      it('3. Parent cannot request another parent’s child', async () => {
        prismaMock.parentStudentRelation.findFirst.mockResolvedValue(null);

        await expect(
          service.getParentStudentAssessments(
            mockSchoolId,
            'another-parents-child-id',
            mockParentUser,
          ),
        ).rejects.toThrow(
          'You do not have a verified active relationship with this student in this school',
        );
        expect(examRepoMock.findParentStudentAssessmentHistory).not.toHaveBeenCalled();
      });

      it('4. Inactive linked student is rejected with 403 ForbiddenException', async () => {
        prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
          ...verifiedActiveRelation,
          student: {
            ...mockStudentProfile,
            status: StudentStatus.TRANSFERRED,
          },
        });

        await expect(
          service.getParentStudentAssessments(
            mockSchoolId,
            mockStudentProfile.id,
            mockParentUser,
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(examRepoMock.findParentStudentAssessmentHistory).not.toHaveBeenCalled();
      });

      it('5. Cross-tenant student access is rejected with 403 ForbiddenException', async () => {
        const otherTenantId = '00000000-0000-0000-0000-000000000999';

        // Case 5a: User schoolId mismatches requested schoolId
        await expect(
          service.getParentStudentAssessments(
            otherTenantId,
            mockStudentProfile.id,
            mockParentUser,
          ),
        ).rejects.toThrow(ForbiddenException);

        // Case 5b: Student record belongs to a different schoolId
        prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
          ...verifiedActiveRelation,
          student: {
            ...mockStudentProfile,
            schoolId: otherTenantId,
          },
        });

        await expect(
          service.getParentStudentAssessments(
            mockSchoolId,
            mockStudentProfile.id,
            mockParentUser,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('6. Unauthenticated request is rejected with 401 UnauthorizedException', async () => {
        await expect(
          service.getParentStudentAssessments(
            mockSchoolId,
            mockStudentProfile.id,
            null,
          ),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('7. Non-parent role is rejected with 403 ForbiddenException', async () => {
        await expect(
          service.getParentStudentAssessments(
            mockSchoolId,
            mockStudentProfile.id,
            mockStudentUser,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('B. Assessment filtering', () => {
      beforeEach(() => {
        prismaMock.parentStudentRelation.findFirst.mockResolvedValue(verifiedActiveRelation);
      });

      it('8–14. Includes only PUBLISHED, CLOSED, RESULTS_RELEASED for matching tenant, academic year, grade, and section or grade-wide (null section); excludes DRAFT, ARCHIVED, and mismatched scopes', async () => {
        examRepoMock.findParentStudentAssessmentHistory.mockResolvedValue([
          {
            id: 'a-published',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.PUBLISHED,
            title: 'Published Quiz',
            subject: 'Science',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 20,
            attempt: null,
          },
          {
            id: 'a-closed',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.CLOSED,
            title: 'Closed Exam',
            subject: 'Science',
            mode: AssessmentMode.LIVE_EXAM,
            totalMarks: 50,
            passingMarks: 20,
            durationMinutes: 45,
            attempt: null,
          },
          {
            id: 'a-released-gradewide',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: null, // 14. Grade-wide assessment
            status: AssessmentStatus.RESULTS_RELEASED,
            title: 'Grade-Wide Released Exam',
            subject: 'Mathematics',
            mode: AssessmentMode.LIVE_EXAM,
            totalMarks: 100,
            passingMarks: 40,
            durationMinutes: 60,
            attempt: null,
          },
          {
            id: 'a-draft',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.DRAFT, // 9. Excluded
            title: 'Draft Quiz',
            subject: 'Science',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 20,
            attempt: null,
          },
          {
            id: 'a-archived',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.ARCHIVED, // 10. Excluded
            title: 'Archived Quiz',
            subject: 'Science',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 20,
            attempt: null,
          },
          {
            id: 'a-other-ay',
            schoolId: mockSchoolId,
            academicYearId: 'other-ay-id', // 11. Excluded
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.RESULTS_RELEASED,
            title: 'Other AY Exam',
            subject: 'Science',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 20,
            attempt: null,
          },
          {
            id: 'a-other-grade',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: 'other-grade-id', // 12. Excluded
            sectionId: mockSectionId,
            status: AssessmentStatus.RESULTS_RELEASED,
            title: 'Other Grade Exam',
            subject: 'Science',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 20,
            attempt: null,
          },
          {
            id: 'a-other-section',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockOtherSectionId, // 13. Excluded
            status: AssessmentStatus.RESULTS_RELEASED,
            title: 'Other Section Exam',
            subject: 'Science',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 20,
            attempt: null,
          },
        ]);

        const res = await service.getParentStudentAssessments(
          mockSchoolId,
          mockStudentProfile.id,
          mockParentUser,
        );

        expect(examRepoMock.findParentStudentAssessmentHistory).toHaveBeenCalledWith(
          mockSchoolId,
          {
            studentId: mockStudentProfile.id,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
          },
        );

        const returnedIds = res.assessments.map((a) => a.assessmentId);
        expect(returnedIds).toEqual([
          'a-published',
          'a-closed',
          'a-released-gradewide',
        ]);
        expect(returnedIds).not.toContain('a-draft');
        expect(returnedIds).not.toContain('a-archived');
        expect(returnedIds).not.toContain('a-other-ay');
        expect(returnedIds).not.toContain('a-other-grade');
        expect(returnedIds).not.toContain('a-other-section');
      });
    });

    describe('C. Attempt metadata & D. Result privacy', () => {
      beforeEach(() => {
        prismaMock.parentStudentRelation.findFirst.mockResolvedValue(verifiedActiveRelation);
      });

      it('15–19. Accurately maps unattempted, SUBMITTED, TIMED_OUT, and IN_PROGRESS attempts without generating fake attempts', async () => {
        const submittedDate = new Date('2026-10-25T10:15:00Z');
        const timedOutDate = new Date('2026-10-26T11:00:00Z');

        examRepoMock.findParentStudentAssessmentHistory.mockResolvedValue([
          {
            id: 'a-unattempted',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.CLOSED,
            title: 'Missed Quiz',
            subject: 'History',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 30,
            attempt: null,
          },
          {
            id: 'a-submitted',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.CLOSED,
            title: 'Submitted Quiz',
            subject: 'History',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 30,
            attempt: {
              id: 'att-sub',
              studentId: mockStudentProfile.id,
              status: AttemptStatus.SUBMITTED,
              submittedAt: submittedDate,
              result: null,
            },
          },
          {
            id: 'a-timed-out',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.CLOSED,
            title: 'Timed Out Exam',
            subject: 'History',
            mode: AssessmentMode.LIVE_EXAM,
            totalMarks: 50,
            passingMarks: 20,
            durationMinutes: 45,
            attempt: {
              id: 'att-to',
              studentId: mockStudentProfile.id,
              status: AttemptStatus.TIMED_OUT,
              submittedAt: timedOutDate,
              result: null,
            },
          },
          {
            id: 'a-in-progress',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.PUBLISHED,
            title: 'Active Quiz',
            subject: 'History',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 30,
            attempt: {
              id: 'att-ip',
              studentId: mockStudentProfile.id,
              status: AttemptStatus.IN_PROGRESS,
              submittedAt: null,
              result: null,
            },
          },
        ]);

        const res = await service.getParentStudentAssessments(
          mockSchoolId,
          mockStudentProfile.id,
          mockParentUser,
        );

        const [unattempted, submitted, timedOut, inProgress] = res.assessments;

        expect(unattempted.hasAttempt).toBe(false);
        expect(unattempted.attemptId).toBeNull();
        expect(unattempted.attemptStatus).toBeNull();
        expect(unattempted.submittedAt).toBeNull();
        expect(unattempted.releasedResultSummary).toBeNull();

        expect(submitted.hasAttempt).toBe(true);
        expect(submitted.attemptId).toBe('att-sub');
        expect(submitted.attemptStatus).toBe(AttemptStatus.SUBMITTED);
        expect(submitted.submittedAt).toEqual(submittedDate);

        expect(timedOut.hasAttempt).toBe(true);
        expect(timedOut.attemptId).toBe('att-to');
        expect(timedOut.attemptStatus).toBe(AttemptStatus.TIMED_OUT);
        expect(timedOut.submittedAt).toEqual(timedOutDate);

        expect(inProgress.hasAttempt).toBe(true);
        expect(inProgress.attemptId).toBe('att-ip');
        expect(inProgress.attemptStatus).toBe(AttemptStatus.IN_PROGRESS);
        expect(inProgress.submittedAt).toBeNull();

        expect(examRepoMock.createAttemptAtomic).not.toHaveBeenCalled();
      });

      it('20–24. Never exposes score, percentage, pass/fail, or correct-answer counts for unreleased assessments even if a pre-scored AssessmentResult row exists; exposes persisted summary only when RESULTS_RELEASED', async () => {
        examRepoMock.findParentStudentAssessmentHistory.mockResolvedValue([
          {
            id: 'a-closed-prescored',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.CLOSED, // NOT released!
            title: 'Closed Pre-Scored Exam',
            subject: 'Chemistry',
            mode: AssessmentMode.LIVE_EXAM,
            totalMarks: 50,
            passingMarks: 20,
            durationMinutes: 45,
            attempt: {
              id: 'att-closed-1',
              studentId: mockStudentProfile.id,
              status: AttemptStatus.SUBMITTED,
              submittedAt: new Date('2026-10-28T10:00:00Z'),
              result: {
                attemptId: 'att-closed-1',
                totalQuestions: 10,
                attemptedQuestions: 10,
                correctAnswers: 9,
                incorrectAnswers: 1,
                score: 45,
                percentage: 90,
                isPassing: true,
              },
            },
          },
          {
            id: 'a-published-prescored',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.PUBLISHED, // NOT released!
            title: 'Published Pre-Scored Quiz',
            subject: 'Chemistry',
            mode: AssessmentMode.NORMAL_QUIZ,
            totalMarks: 20,
            passingMarks: 8,
            durationMinutes: 20,
            attempt: {
              id: 'att-pub-1',
              studentId: mockStudentProfile.id,
              status: AttemptStatus.SUBMITTED,
              submittedAt: new Date('2026-10-28T11:00:00Z'),
              result: {
                attemptId: 'att-pub-1',
                totalQuestions: 4,
                attemptedQuestions: 4,
                correctAnswers: 3,
                incorrectAnswers: 1,
                score: 15,
                percentage: 75,
                isPassing: true,
              },
            },
          },
          {
            id: 'a-officially-released',
            schoolId: mockSchoolId,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: AssessmentStatus.RESULTS_RELEASED, // Officially released
            title: 'Released Chemistry Exam',
            subject: 'Chemistry',
            mode: AssessmentMode.LIVE_EXAM,
            totalMarks: 50,
            passingMarks: 20,
            durationMinutes: 45,
            attempt: {
              id: 'att-rel-1',
              studentId: mockStudentProfile.id,
              status: AttemptStatus.SUBMITTED,
              submittedAt: new Date('2026-10-27T10:00:00Z'),
              result: {
                attemptId: 'att-rel-1',
                totalQuestions: 10,
                attemptedQuestions: 10,
                correctAnswers: 8,
                incorrectAnswers: 2,
                score: 40,
                percentage: 80,
                isPassing: true,
              },
            },
          },
        ]);

        const res = await service.getParentStudentAssessments(
          mockSchoolId,
          mockStudentProfile.id,
          mockParentUser,
        );

        const [closedItem, publishedItem, releasedItem] = res.assessments;

        // 20-23: Unreleased items must strictly have releasedResultSummary === null and no leaked fields
        expect(closedItem.releasedResultSummary).toBeNull();
        expect((closedItem as any).score).toBeUndefined();
        expect((closedItem as any).percentage).toBeUndefined();
        expect((closedItem as any).isPassing).toBeUndefined();
        expect((closedItem as any).correctAnswers).toBeUndefined();

        expect(publishedItem.releasedResultSummary).toBeNull();
        expect((publishedItem as any).score).toBeUndefined();
        expect((publishedItem as any).percentage).toBeUndefined();
        expect((publishedItem as any).isPassing).toBeUndefined();
        expect((publishedItem as any).correctAnswers).toBeUndefined();

        // 24: Released item exposes persisted AssessmentResult summary
        expect(releasedItem.releasedResultSummary).toEqual({
          attemptId: 'att-rel-1',
          totalQuestions: 10,
          attemptedQuestions: 10,
          correctAnswers: 8,
          incorrectAnswers: 2,
          score: 40,
          percentage: 80,
          isPassing: true,
          submittedAt: new Date('2026-10-27T10:00:00Z'),
        });
      });
    });

    describe('FINDING-02: Student Assessment History & Lifecycle Visibility', () => {
      it('returns PUBLISHED, CLOSED, and RESULTS_RELEASED assessments with attempts', async () => {
        const closedAssessment: AssessmentDraftRecord = {
          ...baseAssessment,
          id: 'as-closed-01',
          title: 'Closed Chemistry Test',
          status: AssessmentStatus.CLOSED,
        };
        const releasedAssessment: AssessmentDraftRecord = {
          ...baseAssessment,
          id: 'as-released-01',
          title: 'Released Biology Test',
          status: AssessmentStatus.RESULTS_RELEASED,
        };

        examRepoMock.findEligibleAssessmentsForStudent.mockResolvedValue([
          baseAssessment,
          closedAssessment,
          releasedAssessment,
        ]);

        examRepoMock.findAttemptByStudentAndAssessment.mockImplementation(
          (schoolId: string, assessmentId: string) => {
            if (assessmentId === 'as-closed-01') {
              return Promise.resolve({
                id: 'att-closed',
                assessmentId,
                studentId: mockStudentProfile.id,
                status: AttemptStatus.SUBMITTED,
              });
            }
            if (assessmentId === 'as-released-01') {
              return Promise.resolve({
                id: 'att-released',
                assessmentId,
                studentId: mockStudentProfile.id,
                status: AttemptStatus.TIMED_OUT,
              });
            }
            return Promise.resolve(null);
          },
        );

        const list = await service.listAssessmentsForStudent(mockSchoolId, mockStudentUser);

        expect(list.length).toBe(3);
        expect(list.find((a) => a.id === baseAssessment.id)?.status).toBe(AssessmentStatus.PUBLISHED);
        expect(list.find((a) => a.id === 'as-closed-01')?.status).toBe(AssessmentStatus.CLOSED);
        expect(list.find((a) => a.id === 'as-closed-01')?.attemptStatus).toBe(AttemptStatus.SUBMITTED);
        expect(list.find((a) => a.id === 'as-released-01')?.status).toBe(AssessmentStatus.RESULTS_RELEASED);
        expect(list.find((a) => a.id === 'as-released-01')?.attemptStatus).toBe(AttemptStatus.TIMED_OUT);
      });

      it('rejects starting a CLOSED or RESULTS_RELEASED assessment', async () => {
        examRepoMock.findAssessmentById.mockResolvedValueOnce({
          ...baseAssessment,
          id: 'as-closed-01',
          status: AssessmentStatus.CLOSED,
        });

        await expect(
          service.startAssessment(mockSchoolId, 'as-closed-01', mockStudentUser),
        ).rejects.toThrow(BadRequestException);

        examRepoMock.findAssessmentById.mockResolvedValueOnce({
          ...baseAssessment,
          id: 'as-released-01',
          status: AssessmentStatus.RESULTS_RELEASED,
        });

        await expect(
          service.startAssessment(mockSchoolId, 'as-released-01', mockStudentUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('permits an existing IN_PROGRESS attempt to save answers after assessment is CLOSED if before deadline', async () => {
        const closedAssessment: AssessmentDraftRecord = {
          ...baseAssessment,
          id: 'as-closed-01',
          status: AssessmentStatus.CLOSED,
        };

        const activeAttempt = {
          id: 'att-in-progress-closed',
          assessmentId: closedAssessment.id,
          studentId: mockStudentProfile.id,
          status: AttemptStatus.IN_PROGRESS,
          deadlineAt: new Date(Date.now() + 600000), // 10 minutes in future
        };

        examRepoMock.findAttemptById.mockResolvedValue(activeAttempt);
        examRepoMock.findAssessmentById.mockResolvedValue(closedAssessment);
        examRepoMock.findQuestionById.mockResolvedValue({
          id: 'q-01',
          assessmentId: closedAssessment.id,
        });
        examRepoMock.saveAttemptAnswerAtomic.mockResolvedValue({
          questionId: 'q-01',
          selectedOption: 2,
        });

        const res = await service.saveAnswer(
          mockSchoolId,
          activeAttempt.id,
          'q-01',
          { selectedOption: 2 },
          mockStudentUser,
        );

        expect(res.success).toBe(true);
        expect(res.selectedOption).toBe(2);
        expect(examRepoMock.saveAttemptAnswerAtomic).toHaveBeenCalled();
      });

      it('rejects saveAnswer if assessment status is RESULTS_RELEASED or ARCHIVED', async () => {
        const releasedAssessment: AssessmentDraftRecord = {
          ...baseAssessment,
          id: 'as-rel-01',
          status: AssessmentStatus.RESULTS_RELEASED,
        };

        const attempt = {
          id: 'att-rel',
          assessmentId: releasedAssessment.id,
          studentId: mockStudentProfile.id,
          status: AttemptStatus.IN_PROGRESS,
          deadlineAt: new Date(Date.now() + 600000),
        };

        examRepoMock.findAttemptById.mockResolvedValue(attempt);
        examRepoMock.findAssessmentById.mockResolvedValue(releasedAssessment);

        await expect(
          service.saveAnswer(
            mockSchoolId,
            attempt.id,
            'q-01',
            { selectedOption: 1 },
            mockStudentUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects saveAnswer and finalizes attempt to TIMED_OUT if attempt deadline expired', async () => {
        const closedAssessment: AssessmentDraftRecord = {
          ...baseAssessment,
          id: 'as-closed-01',
          status: AssessmentStatus.CLOSED,
        };

        const expiredAttempt = {
          id: 'att-expired',
          assessmentId: closedAssessment.id,
          studentId: mockStudentProfile.id,
          status: AttemptStatus.IN_PROGRESS,
          deadlineAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        };

        examRepoMock.findAttemptById.mockResolvedValue(expiredAttempt);
        examRepoMock.findAssessmentById.mockResolvedValue(closedAssessment);

        await expect(
          service.saveAnswer(
            mockSchoolId,
            expiredAttempt.id,
            'q-01',
            { selectedOption: 1 },
            mockStudentUser,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledWith(
          mockSchoolId,
          expiredAttempt.id,
          AttemptStatus.TIMED_OUT,
          closedAssessment.id,
        );
      });

      describe('reconcileExpiredAttemptsForAssessment', () => {
        it('finalizes and scores all expired IN_PROGRESS attempts and resolves progression', async () => {
          const expiredAttempts = [
            {
              id: 'att-exp-1',
              studentId: 'student-01',
              assessmentId: mockAssessmentId,
              status: AttemptStatus.IN_PROGRESS,
              deadlineAt: new Date(Date.now() - 3600000),
            },
            {
              id: 'att-exp-2',
              studentId: 'student-02',
              assessmentId: mockAssessmentId,
              status: AttemptStatus.IN_PROGRESS,
              deadlineAt: new Date(Date.now() - 1800000),
            },
          ];

          examRepoMock.findExpiredInProgressAttempts = jest.fn().mockResolvedValue(expiredAttempts);
          examRepoMock.finalizeAndScoreAttemptAtomic = jest
            .fn()
            .mockImplementation(async (sId, attId) => ({
              attempt: { id: attId, status: AttemptStatus.TIMED_OUT },
              result: { id: `res-${attId}`, score: 10 },
            }));

          const res = await service.reconcileExpiredAttemptsForAssessment(
            mockSchoolId,
            mockAssessmentId,
          );

          expect(res.reconciledCount).toBe(2);
          expect(examRepoMock.findExpiredInProgressAttempts).toHaveBeenCalledWith(
            mockSchoolId,
            mockAssessmentId,
          );
          expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledTimes(2);
          expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledWith(
            mockSchoolId,
            'att-exp-1',
            AttemptStatus.TIMED_OUT,
            mockAssessmentId,
          );
          expect(examRepoMock.finalizeAndScoreAttemptAtomic).toHaveBeenCalledWith(
            mockSchoolId,
            'att-exp-2',
            AttemptStatus.TIMED_OUT,
            mockAssessmentId,
          );
          expect(progressionServiceMock.resolveAssessmentProgression).toHaveBeenCalledTimes(2);
          expect(progressionServiceMock.resolveAssessmentProgression).toHaveBeenCalledWith(
            mockSchoolId,
            'student-01',
            mockAssessmentId,
          );
          expect(progressionServiceMock.resolveAssessmentProgression).toHaveBeenCalledWith(
            mockSchoolId,
            'student-02',
            mockAssessmentId,
          );
        });

        it('returns reconciledCount 0 when no expired attempts exist', async () => {
          examRepoMock.findExpiredInProgressAttempts = jest.fn().mockResolvedValue([]);

          const res = await service.reconcileExpiredAttemptsForAssessment(
            mockSchoolId,
            mockAssessmentId,
          );

          expect(res.reconciledCount).toBe(0);
          expect(examRepoMock.finalizeAndScoreAttemptAtomic).not.toHaveBeenCalled();
        });

        it('propagates error if finalization/scoring fails', async () => {
          examRepoMock.findExpiredInProgressAttempts = jest.fn().mockResolvedValue([
            {
              id: 'att-exp-err',
              studentId: 'student-err',
              assessmentId: mockAssessmentId,
            },
          ]);
          examRepoMock.finalizeAndScoreAttemptAtomic = jest
            .fn()
            .mockRejectedValue(new Error('Scoring engine deadlock/failure'));

          await expect(
            service.reconcileExpiredAttemptsForAssessment(mockSchoolId, mockAssessmentId),
          ).rejects.toThrow('Scoring engine deadlock/failure');
        });

        it('propagates error if progression update fails', async () => {
          examRepoMock.findExpiredInProgressAttempts = jest.fn().mockResolvedValue([
            {
              id: 'att-exp-p-err',
              studentId: 'student-p-err',
              assessmentId: mockAssessmentId,
            },
          ]);
          examRepoMock.finalizeAndScoreAttemptAtomic = jest.fn().mockResolvedValue({
            attempt: { id: 'att-exp-p-err', status: AttemptStatus.TIMED_OUT },
            result: { id: 'res-1', score: 10 },
          });
          progressionServiceMock.resolveAssessmentProgression.mockRejectedValueOnce(
            new Error('Progression update error'),
          );

          await expect(
            service.reconcileExpiredAttemptsForAssessment(mockSchoolId, mockAssessmentId),
          ).rejects.toThrow('Progression update error');
        });
      });
    });
  });
});
