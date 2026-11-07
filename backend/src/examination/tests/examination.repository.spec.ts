import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ExaminationPrismaRepository } from '../examination.repository';
import { AssessmentStatus, AttemptStatus, ProgressionAssessmentStatus } from '../types';

describe('ExaminationPrismaRepository - Unit Tests', () => {
  let repository: ExaminationPrismaRepository;
  let prismaMock: any;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockTeacherId = '00000000-0000-0000-0000-000000000999';
  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';
  const mockQuestionId = '00000000-0000-0000-0000-000000000777';

  const mockAssessmentLockRow = {
    id: mockAssessmentId,
    status: 'DRAFT',
    totalMarks: 50.0,
    teacherId: mockTeacherId,
  };

  const mockAssessmentRow = {
    id: mockAssessmentId,
    schoolId: mockSchoolId,
    academicYearId: 'ay-1',
    gradeId: 'grade-1',
    sectionId: 'sec-1',
    teacherId: mockTeacherId,
    chapterId: null,
    title: 'Math Test',
    description: 'Desc',
    subject: 'Mathematics',
    mode: 'OFFLINE_PAPER',
    status: 'DRAFT',
    totalMarks: 50.0,
    passingMarks: 20.0,
    durationMinutes: 60,
    startWindowAt: null,
    endWindowAt: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
  };

  beforeEach(async () => {
    prismaMock = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      $transaction: jest.fn((cb) => cb(prismaMock)),
      schoolExaminationSetting: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      assessment: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      assessmentResult: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExaminationPrismaRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<ExaminationPrismaRepository>(ExaminationPrismaRepository);
  });

  describe('countChildSections', () => {
    it('returns section count for assessment', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([{ count: 3 }]);

      const count = await repository.countChildSections(mockAssessmentId);
      expect(count).toBe(3);
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FROM "assessment_sections" WHERE "assessmentId" = $1'),
        mockAssessmentId,
      );
    });

    it('returns 0 when no rows returned', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      const count = await repository.countChildSections(mockAssessmentId);
      expect(count).toBe(0);
    });
  });

  describe('findAssessments with requestingTeacherId visibility condition', () => {
    it('appends draft visibility condition when requestingTeacherId is provided', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      await repository.findAssessments(mockSchoolId, {
        status: AssessmentStatus.DRAFT,
        requestingTeacherId: mockTeacherId,
      });

      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('("status" != \'DRAFT\'::"AssessmentStatus" OR "teacherId" = $'),
        mockSchoolId,
        AssessmentStatus.DRAFT,
        mockTeacherId,
      );
    });

    it('omits draft visibility condition when requestingTeacherId is not provided', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      await repository.findAssessments(mockSchoolId, {
        status: AssessmentStatus.DRAFT,
      });

      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.not.stringContaining('"teacherId" = $'),
        mockSchoolId,
        AssessmentStatus.DRAFT,
      );
    });
  });

  describe('Chapter repository methods', () => {
    const mockGradeId = 'grade-class-01';
    const mockAcademicYearId = 'ay-2026-2027';
    const mockTeacherId1 = 'teacher-profile-001';
    const mockTeacherId2 = 'teacher-profile-002';
    const otherSchoolId = '00000000-0000-0000-0000-000000000088';

    const mockChapterRowTeacher1 = {
      id: 'chapter-uuid-1',
      schoolId: mockSchoolId,
      academicYearId: mockAcademicYearId,
      createdByTeacherId: mockTeacherId1,
      gradeId: mockGradeId,
      subject: 'Mathematics',
      chapterCode: 'MATH-CH-01',
      title: 'Algebra Foundations',
      orderIndex: 1,
      createdAt: '2026-10-31T10:00:00.000Z',
      updatedAt: '2026-10-31T10:00:00.000Z',
    };

    const mockChapterRowLegacy = {
      id: 'chapter-uuid-legacy',
      schoolId: mockSchoolId,
      academicYearId: null,
      createdByTeacherId: null,
      gradeId: mockGradeId,
      subject: 'Mathematics',
      chapterCode: 'MATH-CH-LEGACY',
      title: 'Legacy Institutional Geometry',
      orderIndex: 0,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    };

    describe('createChapter', () => {
      it('persists academicYearId and createdByTeacherId with correct SQL parameter ordering', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([mockChapterRowTeacher1]);

        const result = await repository.createChapter({
          schoolId: mockSchoolId,
          academicYearId: mockAcademicYearId,
          createdByTeacherId: mockTeacherId1,
          gradeId: mockGradeId,
          subject: 'Mathematics',
          chapterCode: 'MATH-CH-01',
          title: 'Algebra Foundations',
          orderIndex: 1,
        });

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO "assessment_chapters"'),
          mockSchoolId,           // $1
          mockAcademicYearId,     // $2
          mockTeacherId1,         // $3
          mockGradeId,            // $4
          'Mathematics',          // $5
          'MATH-CH-01',           // $6
          'Algebra Foundations',  // $7
          1,                      // $8
        );

        expect(result.id).toBe('chapter-uuid-1');
        expect(result.schoolId).toBe(mockSchoolId);
        expect(result.academicYearId).toBe(mockAcademicYearId);
        expect(result.createdByTeacherId).toBe(mockTeacherId1);
        expect(result.gradeId).toBe(mockGradeId);
        expect(result.subject).toBe('Mathematics');
        expect(result.chapterCode).toBe('MATH-CH-01');
        expect(result.title).toBe('Algebra Foundations');
        expect(result.orderIndex).toBe(1);
      });
    });

    describe('findChapters', () => {
      it('enforces tenant scoping with schoolId condition as $1', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([]);

        await repository.findChapters(mockSchoolId);

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('WHERE "schoolId" = $1'),
          mockSchoolId,
        );
      });

      it('filters teacher-owned chapters allowing creator and legacy institutional chapters', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([mockChapterRowTeacher1, mockChapterRowLegacy]);

        const results = await repository.findChapters(mockSchoolId, {
          requestingTeacherId: mockTeacherId1,
        });

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('("createdByTeacherId" = $2 OR "createdByTeacherId" IS NULL)'),
          mockSchoolId,
          mockTeacherId1,
        );

        expect(results).toHaveLength(2);
        expect(results[0].createdByTeacherId).toBe(mockTeacherId1);
        expect(results[1].createdByTeacherId).toBeNull();
      });

      it('preserves visibility of legacy chapters with NULL academicYearId when filtering by academic year', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([mockChapterRowTeacher1, mockChapterRowLegacy]);

        const results = await repository.findChapters(mockSchoolId, {
          academicYearId: mockAcademicYearId,
          requestingTeacherId: mockTeacherId1,
        });

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('("academicYearId" = $3 OR "academicYearId" IS NULL)'),
          mockSchoolId,
          mockTeacherId1,
          mockAcademicYearId,
        );

        expect(results.some((c) => c.academicYearId === null)).toBe(true);
        expect(results.some((c) => c.academicYearId === mockAcademicYearId)).toBe(true);
      });

      it('allows school admin listing without teacher filter while filtering by grade and subject', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([mockChapterRowTeacher1]);

        await repository.findChapters(mockSchoolId, {
          gradeId: mockGradeId,
          subject: 'Mathematics',
          academicYearId: mockAcademicYearId,
        });

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('"schoolId" = $1 AND "gradeId" = $2 AND LOWER("subject") = LOWER($3) AND ("academicYearId" = $4 OR "academicYearId" IS NULL)'),
          mockSchoolId,
          mockGradeId,
          'Mathematics',
          mockAcademicYearId,
        );
      });
    });

    describe('findChapterByCode', () => {
      it('scopes teacher-owned chapter uniqueness to school, academic year, and creator teacher', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([mockChapterRowTeacher1]);

        const found = await repository.findChapterByCode(
          mockSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-01',
          mockAcademicYearId,
          mockTeacherId1,
        );

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining(
            'WHERE "schoolId" = $1 AND "gradeId" = $2 AND LOWER("subject") = LOWER($3) AND LOWER("chapterCode") = LOWER($4) AND "createdByTeacherId" = $5 AND "academicYearId" = $6 LIMIT 1'
          ),
          mockSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-01',
          mockTeacherId1,
          mockAcademicYearId,
        );
        expect(found).not.toBeNull();
        expect(found?.chapterCode).toBe('MATH-CH-01');
        expect(found?.createdByTeacherId).toBe(mockTeacherId1);
      });

      it('does not find teacher 1 chapter when teacher 2 checks the same chapter code', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([]);

        const found = await repository.findChapterByCode(
          mockSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-01',
          mockAcademicYearId,
          mockTeacherId2,
        );

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining(
            'WHERE "schoolId" = $1 AND "gradeId" = $2 AND LOWER("subject") = LOWER($3) AND LOWER("chapterCode") = LOWER($4) AND "createdByTeacherId" = $5 AND "academicYearId" = $6 LIMIT 1'
          ),
          mockSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-01',
          mockTeacherId2,
          mockAcademicYearId,
        );
        expect(found).toBeNull();
      });

      it('does not reject teacher-owned chapter when legacy chapter shares the same code', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([]);

        const found = await repository.findChapterByCode(
          mockSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-LEGACY',
          mockAcademicYearId,
          mockTeacherId1,
        );

        expect(found).toBeNull();
      });

      it('finds legacy chapter when teacherId is null matching legacy partial index rules', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([mockChapterRowLegacy]);

        const found = await repository.findChapterByCode(
          mockSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-LEGACY',
          mockAcademicYearId,
          null,
        );

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining(
            'WHERE "schoolId" = $1 AND "gradeId" = $2 AND LOWER("subject") = LOWER($3) AND LOWER("chapterCode") = LOWER($4) AND "createdByTeacherId" IS NULL AND ("academicYearId" = $5 OR "academicYearId" IS NULL) LIMIT 1'
          ),
          mockSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-LEGACY',
          mockAcademicYearId,
        );
        expect(found).not.toBeNull();
        expect(found?.createdByTeacherId).toBeNull();
      });

      it('maintains tenant isolation and does not match across different schools', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([]);

        const found = await repository.findChapterByCode(
          otherSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-01',
          mockAcademicYearId,
          mockTeacherId1,
        );

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('WHERE "schoolId" = $1'),
          otherSchoolId,
          mockGradeId,
          'Mathematics',
          'MATH-CH-01',
          mockTeacherId1,
          mockAcademicYearId,
        );
        expect(found).toBeNull();
      });
    });

    describe('findChapterById', () => {
      it('returns mapped chapter with academicYearId and createdByTeacherId and enforces schoolId', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValue([mockChapterRowTeacher1]);

        const chapter = await repository.findChapterById(mockSchoolId, 'chapter-uuid-1');

        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('WHERE "schoolId" = $1 AND "id" = $2'),
          mockSchoolId,
          'chapter-uuid-1',
        );
        expect(chapter?.academicYearId).toBe(mockAcademicYearId);
        expect(chapter?.createdByTeacherId).toBe(mockTeacherId1);
      });
    });
  });

  describe('Question repository methods', () => {
    const mockRow = {
      id: mockQuestionId,
      schoolId: mockSchoolId,
      assessmentId: mockAssessmentId,
      sectionId: null,
      orderIndex: 1,
      questionText: 'What is 2+2?',
      options: '["1","2","3","4"]',
      correctOption: 3,
      marks: '2.50',
      explanation: 'Basic math',
      createdAt: '2026-10-29T10:00:00.000Z',
      updatedAt: '2026-10-29T10:00:00.000Z',
    };

    describe('updateAssessmentDraft (atomic marks integrity F-01)', () => {
      it('locks assessment, verifies DRAFT, rejects if totalMarks < allocated question marks', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // lock assessment
          .mockResolvedValueOnce([{ marks: 25.0 }, { marks: 15.0 }]); // 40.0 allocated

        await expect(
          repository.updateAssessmentDraft(mockSchoolId, mockAssessmentId, {
            totalMarks: 35.0, // 35 < 40 -> rejected
          }),
        ).rejects.toThrow(
          'Cannot reduce totalMarks to 35.00: current questions already have 40.00 marks allocated',
        );

        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('FOR UPDATE'),
          mockSchoolId,
          mockAssessmentId,
        );
      });

      it('succeeds when new totalMarks >= allocated question marks', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // lock assessment
          .mockResolvedValueOnce([{ marks: 20.0 }, { marks: 20.0 }]) // 40.0 allocated
          .mockResolvedValueOnce([{ ...mockAssessmentRow, totalMarks: 45.0 }]); // UPDATE RETURNING *

        const result = await repository.updateAssessmentDraft(mockSchoolId, mockAssessmentId, {
          totalMarks: 45.0,
        });

        expect(result.totalMarks).toBe(45.0);
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          3,
          expect.stringContaining('UPDATE "assessments"'),
          mockSchoolId,
          mockAssessmentId,
          45.0,
        );
      });

      it('throws NotFoundException if assessment row does not exist', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

        await expect(
          repository.updateAssessmentDraft(mockSchoolId, mockAssessmentId, {
            title: 'Updated Title',
          }),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('throws BadRequestException if assessment status is not DRAFT', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, status: 'PUBLISHED' },
        ]);

        await expect(
          repository.updateAssessmentDraft(mockSchoolId, mockAssessmentId, {
            title: 'Updated Title',
          }),
        ).rejects.toThrow(/Only DRAFT assessments may be modified/);
      });
    });

    describe('createQuestion (atomic transaction)', () => {
      it('locks assessment, verifies draft/author, auto-increments orderIndex, and inserts under transaction', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // SELECT ... FOR UPDATE
          .mockResolvedValueOnce([{ id: 'q0', marks: 10.0, orderIndex: 1 }]) // SELECT existing questions
          .mockResolvedValueOnce([mockRow]); // INSERT ... RETURNING *

        const result = await repository.createQuestion(
          {
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            sectionId: null,
            questionText: 'What is 2+2?',
            options: ['1', '2', '3', '4'],
            correctOption: 3,
            marks: 2.5,
            explanation: 'Basic math',
          },
          mockTeacherId,
        );

        expect(result.id).toBe(mockQuestionId);
        expect(prismaMock.$transaction).toHaveBeenCalled();
        // Check lock query
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('FOR UPDATE'),
          mockSchoolId,
          mockAssessmentId,
        );
        // Check existing marks query under lock
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('FROM "assessment_questions"'),
          mockSchoolId,
          mockAssessmentId,
        );
        // Check insert query with auto-incremented orderIndex = 2
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          3,
          expect.stringContaining('INSERT INTO "assessment_questions"'),
          mockSchoolId,
          mockAssessmentId,
          null,
          2, // orderIndex auto-incremented after 1
          'What is 2+2?',
          JSON.stringify(['1', '2', '3', '4']),
          3,
          2.5,
          'Basic math',
        );
      });

      it('throws NotFoundException if assessment does not exist', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]); // no rows found

        await expect(
          repository.createQuestion(
            {
              schoolId: mockSchoolId,
              assessmentId: mockAssessmentId,
              sectionId: null,
              questionText: 'Q',
              options: ['1', '2', '3', '4'],
              correctOption: 0,
              marks: 1.0,
              explanation: null,
            },
            mockTeacherId,
          ),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('throws BadRequestException if assessment status is not DRAFT', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, status: 'PUBLISHED' },
        ]);

        await expect(
          repository.createQuestion(
            {
              schoolId: mockSchoolId,
              assessmentId: mockAssessmentId,
              sectionId: null,
              questionText: 'Q',
              options: ['1', '2', '3', '4'],
              correctOption: 0,
              marks: 1.0,
              explanation: null,
            },
            mockTeacherId,
          ),
        ).rejects.toThrow(/Only DRAFT assessments may be modified/);
      });

      it('throws ForbiddenException if teacherId does not match author', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, teacherId: 'other-author-id' },
        ]);

        await expect(
          repository.createQuestion(
            {
              schoolId: mockSchoolId,
              assessmentId: mockAssessmentId,
              sectionId: null,
              questionText: 'Q',
              options: ['1', '2', '3', '4'],
              correctOption: 0,
              marks: 1.0,
              explanation: null,
            },
            mockTeacherId,
          ),
        ).rejects.toThrow('You may only manage questions for assessments you authored');
      });

      it('throws BadRequestException if new marks would exceed assessment totalMarks', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // totalMarks = 50
          .mockResolvedValueOnce([{ id: 'q0', marks: 49.0, orderIndex: 1 }]); // 49 already allocated

        await expect(
          repository.createQuestion(
            {
              schoolId: mockSchoolId,
              assessmentId: mockAssessmentId,
              sectionId: null,
              questionText: 'Q',
              options: ['1', '2', '3', '4'],
              correctOption: 0,
              marks: 5.0, // 49 + 5 = 54 > 50
              explanation: null,
            },
            mockTeacherId,
          ),
        ).rejects.toThrow(/exceeding the assessment total of 50.00 marks/);
      });

      it('propagates transaction error if question insert fails', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([])
          .mockRejectedValueOnce(new Error('Postgres connection severed'));

        await expect(
          repository.createQuestion(
            {
              schoolId: mockSchoolId,
              assessmentId: mockAssessmentId,
              sectionId: null,
              questionText: 'Q',
              options: ['1', '2', '3', '4'],
              correctOption: 0,
              marks: 1.0,
              explanation: null,
            },
            mockTeacherId,
          ),
        ).rejects.toThrow('Postgres connection severed');
      });
    });

    describe('createQuestionsBulkAtomic (bulk import transaction)', () => {
      const sampleQuestions = [
        {
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          sectionId: null,
          orderIndex: 1,
          questionText: 'Bulk Q1',
          options: ['A', 'B', 'C', 'D'],
          correctOption: 0,
          marks: 2.5,
          explanation: null,
        },
        {
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          sectionId: null,
          orderIndex: 2,
          questionText: 'Bulk Q2',
          options: ['W', 'X', 'Y', 'Z'],
          correctOption: 1,
          marks: 2.5,
          explanation: null,
        },
      ];

      it('locks assessment, offsets orderIndex after existing max, and inserts batch under transaction', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // SELECT ... FOR UPDATE (50 totalMarks)
          .mockResolvedValueOnce([{ id: 'existing-1', marks: 5.0, orderIndex: 3 }]) // max existing index is 3
          .mockResolvedValueOnce([]) // insert Q1
          .mockResolvedValueOnce([]); // insert Q2

        const result = await repository.createQuestionsBulkAtomic(
          mockSchoolId,
          mockAssessmentId,
          sampleQuestions,
          mockTeacherId,
        );

        expect(result.importedCount).toBe(2);
        expect(result.importedMarks).toBe(5.0);
        expect(result.currentAllocatedMarks).toBe(10.0);
        expect(result.totalQuestions).toBe(3);
        expect(result.remainingMarks).toBe(40.0);
        expect(result.isReconciled).toBe(false);

        // Verify lock query
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('FOR UPDATE'),
          mockSchoolId,
          mockAssessmentId,
        );

        // Verify insert Q1 assigned orderIndex = 4 (3 + 1)
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          3,
          expect.stringContaining('INSERT INTO "assessment_questions"'),
          mockSchoolId,
          mockAssessmentId,
          null,
          4, // 3 + 1
          'Bulk Q1',
          JSON.stringify(['A', 'B', 'C', 'D']),
          0,
          2.5,
          null,
        );

        // Verify insert Q2 assigned orderIndex = 5 (3 + 2)
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          4,
          expect.stringContaining('INSERT INTO "assessment_questions"'),
          mockSchoolId,
          mockAssessmentId,
          null,
          5, // 3 + 2
          'Bulk Q2',
          JSON.stringify(['W', 'X', 'Y', 'Z']),
          1,
          2.5,
          null,
        );
      });

      it('throws NotFoundException if assessment row does not exist', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

        await expect(
          repository.createQuestionsBulkAtomic(
            mockSchoolId,
            mockAssessmentId,
            sampleQuestions,
            mockTeacherId,
          ),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('throws BadRequestException if assessment is not in DRAFT status', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, status: 'PUBLISHED' },
        ]);

        await expect(
          repository.createQuestionsBulkAtomic(
            mockSchoolId,
            mockAssessmentId,
            sampleQuestions,
            mockTeacherId,
          ),
        ).rejects.toThrow(/Only DRAFT assessments may be modified/);
      });

      it('throws ForbiddenException if teacherId does not match assessment author', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, teacherId: 'different-teacher' },
        ]);

        await expect(
          repository.createQuestionsBulkAtomic(
            mockSchoolId,
            mockAssessmentId,
            sampleQuestions,
            mockTeacherId,
          ),
        ).rejects.toThrow('You may only import questions for assessments you authored');
      });

      it('throws BadRequestException if bulk import exceeds assessment totalMarks', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // 50 totalMarks
          .mockResolvedValueOnce([{ id: 'q-exist', marks: 48.0, orderIndex: 1 }]); // 48 already allocated + 5 = 53 > 50

        await expect(
          repository.createQuestionsBulkAtomic(
            mockSchoolId,
            mockAssessmentId,
            sampleQuestions,
            mockTeacherId,
          ),
        ).rejects.toThrow(/exceeding the assessment total of 50.00 marks/);
      });

      it('propagates transaction rejection if any question insert fails', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([])
          .mockRejectedValueOnce(new Error('Deadlock detected'));

        await expect(
          repository.createQuestionsBulkAtomic(
            mockSchoolId,
            mockAssessmentId,
            sampleQuestions,
            mockTeacherId,
          ),
        ).rejects.toThrow('Deadlock detected');
      });
    });

    it('findQuestionsByAssessmentId queries by schoolId and assessmentId', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockRow]);

      const results = await repository.findQuestionsByAssessmentId(mockSchoolId, mockAssessmentId);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(mockQuestionId);
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "assessment_questions"'),
        mockSchoolId,
        mockAssessmentId,
      );
    });

    it('findQuestionById queries by schoolId, assessmentId, and id', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([mockRow]);

      const result = await repository.findQuestionById(mockSchoolId, mockAssessmentId, mockQuestionId);
      expect(result?.id).toBe(mockQuestionId);
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "assessment_questions"'),
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
      );
    });

    describe('updateQuestion (atomic marks integrity F-02)', () => {
      it('locks assessment, verifies draft/author/question, verifies marks limit and updates dynamically', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // lock assessment (50 totalMarks)
          .mockResolvedValueOnce([mockRow]) // target question exists
          .mockResolvedValueOnce([{ id: 'other-q', marks: 40.0 }]) // existing questions (40 marks)
          .mockResolvedValueOnce([{ ...mockRow, marks: '5.00' }]); // UPDATE RETURNING *

        const result = await repository.updateQuestion(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          { marks: 5.0 },
          mockTeacherId,
        );

        expect(result.marks).toBe(5.0);
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('FOR UPDATE'),
          mockSchoolId,
          mockAssessmentId,
        );
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          4,
          expect.stringContaining('UPDATE "assessment_questions"'),
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          5.0,
        );
      });

      it('throws NotFoundException if assessment does not exist', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

        await expect(
          repository.updateQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            { marks: 5.0 },
            mockTeacherId,
          ),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('throws BadRequestException if assessment status is not DRAFT', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, status: 'PUBLISHED' },
        ]);

        await expect(
          repository.updateQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            { marks: 5.0 },
            mockTeacherId,
          ),
        ).rejects.toThrow(/Only DRAFT assessments may be modified/);
      });

      it('throws ForbiddenException if teacherId does not match author', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, teacherId: 'different-teacher' },
        ]);

        await expect(
          repository.updateQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            { marks: 5.0 },
            mockTeacherId,
          ),
        ).rejects.toThrow('You may only manage questions for assessments you authored');
      });

      it('throws NotFoundException if target question does not exist', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([]); // target question not found

        await expect(
          repository.updateQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            { marks: 5.0 },
            mockTeacherId,
          ),
        ).rejects.toThrow('Question not found in this assessment');
      });

      it('throws BadRequestException if updating marks would exceed assessment totalMarks', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // totalMarks = 50
          .mockResolvedValueOnce([mockRow]) // target question exists
          .mockResolvedValueOnce([
            { id: mockQuestionId, marks: 5.0 },
            { id: 'q-other', marks: 45.0 },
          ]); // other questions sum = 45.0

        await expect(
          repository.updateQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            { marks: 10.0 }, // 45 + 10 = 55 > 50
            mockTeacherId,
          ),
        ).rejects.toThrow(/exceeding the assessment total of 50.00 marks/);
      });
    });

    describe('deleteQuestion (atomic question deletion & parent lock)', () => {
      it('locks assessment, verifies draft/author/question, and executes DELETE under transaction', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // lock assessment
          .mockResolvedValueOnce([{ id: mockQuestionId }]); // question exists

        await repository.deleteQuestion(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          mockTeacherId,
        );

        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('FOR UPDATE'),
          mockSchoolId,
          mockAssessmentId,
        );
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('FROM "assessment_questions"'),
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
        );
        expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM "assessment_questions"'),
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
        );
      });

      it('throws NotFoundException if assessment does not exist', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

        await expect(
          repository.deleteQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            mockTeacherId,
          ),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('throws BadRequestException if assessment status is not DRAFT', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, status: 'PUBLISHED' },
        ]);

        await expect(
          repository.deleteQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            mockTeacherId,
          ),
        ).rejects.toThrow(/Only DRAFT assessments may be modified/);
      });

      it('throws ForbiddenException if teacherId does not match author', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, teacherId: 'different-teacher' },
        ]);

        await expect(
          repository.deleteQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            mockTeacherId,
          ),
        ).rejects.toThrow('You may only manage questions for assessments you authored');
      });

      it('throws NotFoundException if target question does not exist', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([]); // question not found

        await expect(
          repository.deleteQuestion(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            mockTeacherId,
          ),
        ).rejects.toThrow('Question not found in this assessment');
      });

      it('allows admin deletion without teacherId ownership restriction', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([{ id: mockQuestionId }]);

        await repository.deleteQuestion(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          undefined, // admin caller
        );

        expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM "assessment_questions"'),
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
        );
      });
    });

    it('getNextQuestionOrderIndex returns max + 1 or 1', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([{ nextIndex: 5 }]);

      const next = await repository.getNextQuestionOrderIndex(mockAssessmentId);
      expect(next).toBe(5);
    });

    it('findAssessmentSectionById checks section in assessment and school', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([{ id: 'sec-1', assessmentId: mockAssessmentId, title: 'Sec A' }]);

      const sec = await repository.findAssessmentSectionById(mockSchoolId, mockAssessmentId, 'sec-1');
      expect(sec?.id).toBe('sec-1');
    });
  });

  describe('Question Image Handling', () => {
    const mockImageRow = {
      id: 'img-1',
      schoolId: mockSchoolId,
      assessmentId: mockAssessmentId,
      questionId: mockQuestionId,
      fileName: 'diagram.png',
      fileSize: 12345,
      mimeType: 'image/png',
      storagePath: 'examination-question-images/school/assessment/q_123.png',
      checksumSha256: 'a'.repeat(64),
      status: 'ATTACHED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    describe('upsertQuestionImageAtomic', () => {
      it('throws NotFoundException if assessment is not found', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]); // assessment query

        await expect(
          repository.upsertQuestionImageAtomic({
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            questionId: mockQuestionId,
            fileName: 'diagram.png',
            fileSize: 100,
            mimeType: 'image/png',
            storagePath: 'path/to/img.png',
            checksumSha256: 'hash',
          }),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('throws BadRequestException if assessment is not in DRAFT status', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { id: mockAssessmentId, status: 'PUBLISHED', teacherId: mockTeacherId },
        ]);

        await expect(
          repository.upsertQuestionImageAtomic({
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            questionId: mockQuestionId,
            fileName: 'diagram.png',
            fileSize: 100,
            mimeType: 'image/png',
            storagePath: 'path/to/img.png',
            checksumSha256: 'hash',
          }),
        ).rejects.toThrow('Only DRAFT assessments may be modified');
      });

      it('throws ForbiddenException if teacherId does not match assessment author', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { id: mockAssessmentId, status: 'DRAFT', teacherId: 'different-teacher' },
        ]);

        await expect(
          repository.upsertQuestionImageAtomic(
            {
              schoolId: mockSchoolId,
              assessmentId: mockAssessmentId,
              questionId: mockQuestionId,
              fileName: 'diagram.png',
              fileSize: 100,
              mimeType: 'image/png',
              storagePath: 'path/to/img.png',
              checksumSha256: 'hash',
            },
            mockTeacherId,
          ),
        ).rejects.toThrow('You may only manage question images for assessments you authored');
      });

      it('throws NotFoundException if question is not found in assessment', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([{ id: mockAssessmentId, status: 'DRAFT', teacherId: mockTeacherId }])
          .mockResolvedValueOnce([]); // question query

        await expect(
          repository.upsertQuestionImageAtomic({
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            questionId: mockQuestionId,
            fileName: 'diagram.png',
            fileSize: 100,
            mimeType: 'image/png',
            storagePath: 'path/to/img.png',
            checksumSha256: 'hash',
          }),
        ).rejects.toThrow('Question not found in this assessment');
      });

      it('successfully upserts question image and identifies old storage path if replaced', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([{ id: mockAssessmentId, status: 'DRAFT', teacherId: mockTeacherId }]) // assessment
          .mockResolvedValueOnce([{ id: mockQuestionId }]) // question
          .mockResolvedValueOnce([{ storagePath: 'old/storage/path.png' }]) // existing artifact
          .mockResolvedValueOnce([mockImageRow]); // upsert

        const res = await repository.upsertQuestionImageAtomic({
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          questionId: mockQuestionId,
          fileName: 'diagram.png',
          fileSize: 12345,
          mimeType: 'image/png',
          storagePath: 'new/storage/path.png',
          checksumSha256: 'a'.repeat(64),
        });

        expect(res.oldStoragePath).toBe('old/storage/path.png');
        expect(res.artifact.fileName).toBe('diagram.png');
        expect(res.artifact.status).toBe('ATTACHED');
      });
    });

    describe('findQuestionImage', () => {
      it('returns null if no image found', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
        const img = await repository.findQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId);
        expect(img).toBeNull();
      });

      it('returns mapped artifact if found', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([mockImageRow]);
        const img = await repository.findQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId);
        expect(img?.id).toBe('img-1');
        expect(img?.mimeType).toBe('image/png');
      });
    });

    describe('deleteQuestionImageAtomic', () => {
      it('throws NotFoundException if question has no image', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([{ id: mockAssessmentId, status: 'DRAFT', teacherId: mockTeacherId }])
          .mockResolvedValueOnce([{ id: mockQuestionId }])
          .mockResolvedValueOnce([]); // no existing artifact

        await expect(
          repository.deleteQuestionImageAtomic(mockSchoolId, mockAssessmentId, mockQuestionId),
        ).rejects.toThrow('Question has no attached image');
      });

      it('successfully deletes artifact and returns old storagePath', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([{ id: mockAssessmentId, status: 'DRAFT', teacherId: mockTeacherId }])
          .mockResolvedValueOnce([{ id: mockQuestionId }])
          .mockResolvedValueOnce([{ storagePath: 'path/to/delete.png' }]);

        const res = await repository.deleteQuestionImageAtomic(mockSchoolId, mockAssessmentId, mockQuestionId);
        expect(res.deleted).toBe(true);
        expect(res.storagePath).toBe('path/to/delete.png');
        expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM "question_image_artifacts"'),
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
        );
      });
    });

    describe('countImageReferencesByStoragePath', () => {
      it('returns count from database', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ count: 2 }]);
        const count = await repository.countImageReferencesByStoragePath('some/path.png');
        expect(count).toBe(2);
      });
    });

    describe('publishAssessment (atomic publication & reconciliation)', () => {
      const validQuestions = [
        {
          id: 'q-1',
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          orderIndex: 1,
          questionText: 'What is 5 x 5?',
          options: JSON.stringify(['10', '20', '25', '30']),
          correctOption: 2,
          marks: 25.0,
        },
        {
          id: 'q-2',
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          orderIndex: 2,
          questionText: 'What is 6 x 6?',
          options: JSON.stringify(['12', '24', '36', '48']),
          correctOption: 2,
          marks: 25.0,
        },
      ];

      it('locks assessment with FOR UPDATE and publishes when questions match totalMarks', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([
            {
              ...mockAssessmentLockRow,
              startWindowAt: '2026-11-01T09:00:00Z',
              endWindowAt: '2026-11-01T10:00:00Z',
            },
          ]) // lock assessment
          .mockResolvedValueOnce(validQuestions) // questions query
          .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'PUBLISHED' }]); // UPDATE RETURNING *

        const result = await repository.publishAssessment(
          mockSchoolId,
          mockAssessmentId,
          mockTeacherId,
        );

        expect(result.status).toBe(AssessmentStatus.PUBLISHED);
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('FOR UPDATE'),
          mockSchoolId,
          mockAssessmentId,
        );
        expect(prismaMock.$queryRawUnsafe).toHaveBeenNthCalledWith(
          3,
          expect.stringContaining('SET "status" = \'PUBLISHED\'::"AssessmentStatus"'),
          mockSchoolId,
          mockAssessmentId,
        );
      });

      it('throws NotFoundException if assessment not found', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('throws ConflictException if assessment is already PUBLISHED', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, status: 'PUBLISHED' },
        ]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow('Assessment is already published');
      });

      it('throws BadRequestException if assessment status is not DRAFT', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, status: 'ARCHIVED' },
        ]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow(/Only DRAFT assessments may be published/);
      });

      it('throws ForbiddenException if teacherId does not match author', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          { ...mockAssessmentLockRow, teacherId: 'other-author' },
        ]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow('You may only publish assessments you authored');
      });

      it('throws BadRequestException if endWindowAt <= startWindowAt', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          {
            ...mockAssessmentLockRow,
            startWindowAt: '2026-11-01T12:00:00Z',
            endWindowAt: '2026-11-01T10:00:00Z',
          },
        ]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow('Assessment schedule endWindowAt must be strictly after startWindowAt');
      });

      it('throws BadRequestException if assessment has no questions', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([]); // 0 questions

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow('Cannot publish an empty assessment: at least one question is required');
      });

      it('throws BadRequestException if a question has empty text', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([{ ...validQuestions[0], questionText: '   ' }]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow(/invalid or empty question text/);
      });

      it('throws BadRequestException if a question options array is not 4 choices', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([{ ...validQuestions[0], options: JSON.stringify(['A', 'B']) }]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow(/must contain exactly 4 non-empty options/);
      });

      it('throws BadRequestException if correctOption is out of range', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([{ ...validQuestions[0], correctOption: 4 }]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow(/invalid correctOption/);
      });

      it('throws BadRequestException if question marks are not positive', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow])
          .mockResolvedValueOnce([{ ...validQuestions[0], marks: 0 }]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow(/invalid marks/);
      });

      it('throws BadRequestException if allocated marks do not match totalMarks', async () => {
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([mockAssessmentLockRow]) // totalMarks = 50.0
          .mockResolvedValueOnce([
            { ...validQuestions[0], marks: 20.0 }, // 20 + 25 = 45 != 50
            validQuestions[1],
          ]);

        await expect(
          repository.publishAssessment(mockSchoolId, mockAssessmentId, mockTeacherId),
        ).rejects.toThrow(/allocated question marks \(45.00\) do not match totalMarks \(50.00\)/);
      });
    });

    describe('Student Attempt Lifecycle Repository Methods', () => {
      const mockStudentId = '00000000-0000-0000-0000-000000000666';
      const mockAttemptId = '00000000-0000-0000-0000-000000000777';
      const mockAYId = '00000000-0000-0000-0000-000000000199';
      const mockGradeId = '00000000-0000-0000-0000-000000000299';
      const mockSectionId = '00000000-0000-0000-0000-000000000399';

      const mockAttemptRow = {
        id: mockAttemptId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        studentId: mockStudentId,
        status: 'IN_PROGRESS',
        startedAt: new Date('2026-11-01T10:00:00Z'),
        deadlineAt: new Date('2026-11-01T11:00:00Z'),
        submittedAt: null,
        createdAt: new Date('2026-11-01T10:00:00Z'),
        updatedAt: new Date('2026-11-01T10:00:00Z'),
      };

      it('findQuestionImagesByAssessmentId maps artifacts correctly', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          {
            id: 'art-01',
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            questionId: mockQuestionId,
            fileName: 'diagram.png',
            fileSize: 4500,
            mimeType: 'image/png',
            storagePath: 'path/to/diagram.png',
            checksumSha256: 'abc123',
            status: 'ATTACHED',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

        const res = await repository.findQuestionImagesByAssessmentId(mockSchoolId, mockAssessmentId);
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe('art-01');
        expect(res[0].fileName).toBe('diagram.png');
      });

      it('findEligibleAssessmentsForStudent queries published assessments for grade and section', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          {
            ...mockAssessmentLockRow,
            status: 'PUBLISHED',
          },
        ]);

        const res = await repository.findEligibleAssessmentsForStudent(
          mockSchoolId,
          mockAYId,
          mockGradeId,
          mockSectionId,
        );
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(mockAssessmentId);
      });

      it('findAttemptByStudentAndAssessment returns mapped attempt or null', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([mockAttemptRow]);
        const res = await repository.findAttemptByStudentAndAssessment(
          mockSchoolId,
          mockAssessmentId,
          mockStudentId,
        );
        expect(res?.id).toBe(mockAttemptId);
        expect(res?.status).toBe('IN_PROGRESS');

        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
        const nullRes = await repository.findAttemptByStudentAndAssessment(
          mockSchoolId,
          mockAssessmentId,
          'unknown-student',
        );
        expect(nullRes).toBeNull();
      });

      it('findAttemptById returns mapped attempt or null', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([mockAttemptRow]);
        const res = await repository.findAttemptById(mockSchoolId, mockAttemptId);
        expect(res?.id).toBe(mockAttemptId);

        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
        const nullRes = await repository.findAttemptById(mockSchoolId, 'unknown');
        expect(nullRes).toBeNull();
      });

      it('createAttemptAtomic inserts new attempt and handles concurrent duplicate key race', async () => {
        // Success case: parent assessment check (FOR SHARE) then insert
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([{ id: mockAssessmentId, status: 'PUBLISHED' }])
          .mockResolvedValueOnce([mockAttemptRow]);
        const res = await repository.createAttemptAtomic({
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          studentId: mockStudentId,
          startedAt: mockAttemptRow.startedAt,
          deadlineAt: mockAttemptRow.deadlineAt,
        });
        expect(res.id).toBe(mockAttemptId);

        // Race case: parent check ok, insert throws 23505 unique constraint violation -> fallback to findAttempt
        const uniqueErr: any = new Error('duplicate key value violates unique constraint');
        uniqueErr.code = '23505';
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([{ id: mockAssessmentId, status: 'PUBLISHED' }])
          .mockRejectedValueOnce(uniqueErr)
          .mockResolvedValueOnce([mockAttemptRow]);

        const raceRes = await repository.createAttemptAtomic({
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          studentId: mockStudentId,
          startedAt: mockAttemptRow.startedAt,
          deadlineAt: mockAttemptRow.deadlineAt,
        });
        expect(raceRes.id).toBe(mockAttemptId);
      });

      it('createAttemptAtomic rejects attempt creation if assessment is not PUBLISHED (e.g. CLOSED)', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ id: mockAssessmentId, status: 'CLOSED' }]);

        await expect(
          repository.createAttemptAtomic({
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            studentId: mockStudentId,
            startedAt: mockAttemptRow.startedAt,
            deadlineAt: mockAttemptRow.deadlineAt,
          }),
        ).rejects.toThrow('Cannot start attempt: assessment is in CLOSED status. Only PUBLISHED assessments may be started.');
      });

      it('findAttemptAnswers returns mapped attempt answers', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          {
            id: 'ans-01',
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            attemptId: mockAttemptId,
            questionId: mockQuestionId,
            selectedOption: 2,
            metadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

        const res = await repository.findAttemptAnswers(mockSchoolId, mockAttemptId);
        expect(res).toHaveLength(1);
        expect(res[0].selectedOption).toBe(2);
      });

      it('saveAttemptAnswerAtomic performs idempotent ON CONFLICT upsert', async () => {
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
          {
            id: 'ans-01',
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            attemptId: mockAttemptId,
            questionId: mockQuestionId,
            selectedOption: 1,
            metadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

        const res = await repository.saveAttemptAnswerAtomic({
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          attemptId: mockAttemptId,
          questionId: mockQuestionId,
          selectedOption: 1,
        });
        expect(res.selectedOption).toBe(1);
        expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT ("attemptId", "questionId")'),
          mockSchoolId,
          mockAssessmentId,
          mockAttemptId,
          mockQuestionId,
          1,
        );
      });

      it('saveAttemptAnswerAtomic maps trigger 23514 status rejection to BadRequestException', async () => {
        const triggerErr: any = new Error(
          'Cannot submit answer for attempt ' + mockAttemptId + ' with status SUBMITTED. Answers are only accepted while attempt is IN_PROGRESS.',
        );
        triggerErr.code = '23514';
        prismaMock.$queryRawUnsafe.mockRejectedValueOnce(triggerErr);

        await expect(
          repository.saveAttemptAnswerAtomic({
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            attemptId: mockAttemptId,
            questionId: mockQuestionId,
            selectedOption: 2,
          }),
        ).rejects.toThrow('Cannot save answer: Assessment attempt is no longer in progress');
      });

      it('saveAttemptAnswerAtomic rethrows unrelated 23514 check violation or DB error as-is', async () => {
        const unrelatedCheckErr: any = new Error('check constraint chk_unrelated_field violated');
        unrelatedCheckErr.code = '23514';
        prismaMock.$queryRawUnsafe.mockRejectedValueOnce(unrelatedCheckErr);

        await expect(
          repository.saveAttemptAnswerAtomic({
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            attemptId: mockAttemptId,
            questionId: mockQuestionId,
            selectedOption: 2,
          }),
        ).rejects.toThrow('check constraint chk_unrelated_field violated');
      });

      it('finalizeAttemptAtomic locks attempt FOR UPDATE and updates status before deadline', async () => {
        const activeAttempt = {
          ...mockAttemptRow,
          deadlineAt: new Date(Date.now() + 3600000), // 1 hour in future
        };
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([activeAttempt])
          .mockResolvedValueOnce([{ ...activeAttempt, status: 'SUBMITTED', submittedAt: new Date() }]);

        const res = await repository.finalizeAttemptAtomic(
          mockSchoolId,
          mockAttemptId,
          'SUBMITTED' as any,
        );
        expect(res.status).toBe('SUBMITTED');
      });

      it('finalizeAttemptAtomic switches SUBMITTED to TIMED_OUT if deadline crossed while waiting for lock', async () => {
        const expiredAttempt = {
          ...mockAttemptRow,
          deadlineAt: new Date(Date.now() - 5000), // deadline passed 5 seconds ago
        };
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([expiredAttempt])
          .mockResolvedValueOnce([{ ...expiredAttempt, status: 'TIMED_OUT', submittedAt: new Date() }]);

        const res = await repository.finalizeAttemptAtomic(
          mockSchoolId,
          mockAttemptId,
          'SUBMITTED' as any,
        );
        expect(res.status).toBe('TIMED_OUT');
        expect(prismaMock.$queryRawUnsafe).toHaveBeenLastCalledWith(
          expect.stringContaining('UPDATE "assessment_attempts"'),
          mockSchoolId,
          mockAttemptId,
          'TIMED_OUT',
        );
      });

      it('finalizeAttemptAtomic enforces TIMED_OUT at exact deadline equality', async () => {
        const now = new Date();
        const boundaryAttempt = {
          ...mockAttemptRow,
          deadlineAt: now, // exactly equal to current timestamp
        };
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([boundaryAttempt])
          .mockResolvedValueOnce([{ ...boundaryAttempt, status: 'TIMED_OUT', submittedAt: new Date() }]);

        const res = await repository.finalizeAttemptAtomic(
          mockSchoolId,
          mockAttemptId,
          'SUBMITTED' as any,
        );
        expect(res.status).toBe('TIMED_OUT');
      });

      it('finalizeAttemptAtomic preserves explicit TIMED_OUT requests even if deadline is in the future', async () => {
        const futureAttempt = {
          ...mockAttemptRow,
          deadlineAt: new Date(Date.now() + 3600000),
        };
        prismaMock.$queryRawUnsafe
          .mockResolvedValueOnce([futureAttempt])
          .mockResolvedValueOnce([{ ...futureAttempt, status: 'TIMED_OUT', submittedAt: new Date() }]);

        const res = await repository.finalizeAttemptAtomic(
          mockSchoolId,
          mockAttemptId,
          'TIMED_OUT' as any,
        );
        expect(res.status).toBe('TIMED_OUT');
      });

      it('finalizeAttemptAtomic returns existing attempt idempotently if already terminal', async () => {
        const terminalRow = {
          ...mockAttemptRow,
          status: 'SUBMITTED',
          submittedAt: new Date('2026-11-01T10:45:00Z'),
        };
        prismaMock.$queryRawUnsafe.mockResolvedValueOnce([terminalRow]);

        const res = await repository.finalizeAttemptAtomic(
          mockSchoolId,
          mockAttemptId,
          'SUBMITTED' as any,
        );
        expect(res.status).toBe('SUBMITTED');
        expect(res.submittedAt).toEqual(terminalRow.submittedAt);
      });

      describe('Automated Scoring & Immutable Result Persistence (scoreAndPersistResultAtomic)', () => {
        const mockQuestions = [
          { id: 'q-1', marks: 25.5, correctOption: 1 },
          { id: 'q-2', marks: 14.5, correctOption: 2 },
          { id: 'q-3', marks: 10.0, correctOption: 0 },
        ];

        const mockAssessmentRow = {
          id: mockAssessmentId,
          status: 'CLOSED',
          totalMarks: 50.0,
          passingMarks: 20.0,
        };

        const terminalAttemptRow = {
          id: mockAttemptId,
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          studentId: mockStudentId,
          status: 'SUBMITTED',
        };

        it('rejects scoring if attempt is not in terminal state (IN_PROGRESS)', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
            { ...terminalAttemptRow, status: 'IN_PROGRESS' },
          ]);

          await expect(
            repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId),
          ).rejects.toThrow(/not in a terminal state/);
        });

        it('returns existing result idempotently without update if already created', async () => {
          const existingResult = {
            id: 'res-existing',
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            attemptId: mockAttemptId,
            studentId: mockStudentId,
            totalQuestions: 3,
            attemptedQuestions: 3,
            correctAnswers: 3,
            incorrectAnswers: 0,
            score: 50.0,
            percentage: 100.0,
            isPassing: true,
            createdAt: new Date('2026-11-01T10:00:00Z'),
            updatedAt: new Date('2026-11-01T10:00:00Z'),
          };

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([terminalAttemptRow])
            .mockResolvedValueOnce([existingResult]);

          const res = await repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId);
          expect(res.id).toBe('res-existing');
          expect(res.score).toBe(50.0);
          expect(res.createdAt).toEqual(existingResult.createdAt);
        });

        it('computes perfect score with decimal marks, calculates 100% and sets isPassing to true', async () => {
          const answers = [
            { questionId: 'q-1', selectedOption: 1 },
            { questionId: 'q-2', selectedOption: 2 },
            { questionId: 'q-3', selectedOption: 0 },
          ];

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([terminalAttemptRow])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockAssessmentRow])
            .mockResolvedValueOnce(mockQuestions)
            .mockResolvedValueOnce(answers)
            .mockResolvedValueOnce([
              {
                id: 'res-new',
                schoolId: mockSchoolId,
                assessmentId: mockAssessmentId,
                attemptId: mockAttemptId,
                studentId: mockStudentId,
                totalQuestions: 3,
                attemptedQuestions: 3,
                correctAnswers: 3,
                incorrectAnswers: 0,
                score: 50.0,
                percentage: 100.0,
                isPassing: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]);

          const res = await repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId);
          expect(res.score).toBe(50.0);
          expect(res.percentage).toBe(100.0);
          expect(res.correctAnswers).toBe(3);
          expect(res.incorrectAnswers).toBe(0);
          expect(res.attemptedQuestions).toBe(3);
          expect(res.isPassing).toBe(true);
        });

        it('computes zero score when all answers are incorrect', async () => {
          const answers = [
            { questionId: 'q-1', selectedOption: 0 },
            { questionId: 'q-2', selectedOption: 0 },
            { questionId: 'q-3', selectedOption: 1 },
          ];

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([terminalAttemptRow])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockAssessmentRow])
            .mockResolvedValueOnce(mockQuestions)
            .mockResolvedValueOnce(answers)
            .mockResolvedValueOnce([
              {
                id: 'res-new',
                schoolId: mockSchoolId,
                assessmentId: mockAssessmentId,
                attemptId: mockAttemptId,
                studentId: mockStudentId,
                totalQuestions: 3,
                attemptedQuestions: 3,
                correctAnswers: 0,
                incorrectAnswers: 3,
                score: 0.0,
                percentage: 0.0,
                isPassing: false,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]);

          const res = await repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId);
          expect(res.score).toBe(0.0);
          expect(res.percentage).toBe(0.0);
          expect(res.correctAnswers).toBe(0);
          expect(res.incorrectAnswers).toBe(3);
          expect(res.isPassing).toBe(false);
        });

        it('correctly handles mixed correct, incorrect, and unanswered questions', async () => {
          const answers = [
            { questionId: 'q-1', selectedOption: 1 },
            { questionId: 'q-2', selectedOption: 3 },
            { questionId: 'q-3', selectedOption: null },
          ];

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([terminalAttemptRow])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockAssessmentRow])
            .mockResolvedValueOnce(mockQuestions)
            .mockResolvedValueOnce(answers)
            .mockResolvedValueOnce([
              {
                id: 'res-new',
                schoolId: mockSchoolId,
                assessmentId: mockAssessmentId,
                attemptId: mockAttemptId,
                studentId: mockStudentId,
                totalQuestions: 3,
                attemptedQuestions: 2,
                correctAnswers: 1,
                incorrectAnswers: 1,
                score: 25.5,
                percentage: 51.0,
                isPassing: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]);

          const res = await repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId);
          expect(res.totalQuestions).toBe(3);
          expect(res.attemptedQuestions).toBe(2);
          expect(res.correctAnswers).toBe(1);
          expect(res.incorrectAnswers).toBe(1);
          expect(res.score).toBe(25.5);
          expect(res.percentage).toBe(51.0);
          expect(res.isPassing).toBe(true);
        });

        it('scores TIMED_OUT attempts correctly', async () => {
          const timedOutAttempt = {
            ...terminalAttemptRow,
            status: 'TIMED_OUT',
          };

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([timedOutAttempt])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockAssessmentRow])
            .mockResolvedValueOnce(mockQuestions)
            .mockResolvedValueOnce([{ questionId: 'q-1', selectedOption: 1 }])
            .mockResolvedValueOnce([
              {
                id: 'res-to',
                schoolId: mockSchoolId,
                assessmentId: mockAssessmentId,
                attemptId: mockAttemptId,
                studentId: mockStudentId,
                totalQuestions: 3,
                attemptedQuestions: 1,
                correctAnswers: 1,
                incorrectAnswers: 0,
                score: 25.5,
                percentage: 51.0,
                isPassing: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]);

          const res = await repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId);
          expect(res.score).toBe(25.5);
        });

        it('safely handles non-positive totalMarks without division by zero', async () => {
          const zeroTotalAssessment = {
            id: mockAssessmentId,
            totalMarks: 0,
            passingMarks: 0,
          };

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([terminalAttemptRow])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([zeroTotalAssessment])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              {
                id: 'res-zero',
                schoolId: mockSchoolId,
                assessmentId: mockAssessmentId,
                attemptId: mockAttemptId,
                studentId: mockStudentId,
                totalQuestions: 0,
                attemptedQuestions: 0,
                correctAnswers: 0,
                incorrectAnswers: 0,
                score: 0.0,
                percentage: 0.0,
                isPassing: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]);

          const res = await repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId);
          expect(res.percentage).toBe(0.0);
          expect(res.score).toBe(0.0);
        });

        it('safely recovers winning row if concurrent insert returns 0 rows due to ON CONFLICT', async () => {
          const winningResult = {
            id: 'res-winner',
            schoolId: mockSchoolId,
            assessmentId: mockAssessmentId,
            attemptId: mockAttemptId,
            studentId: mockStudentId,
            totalQuestions: 3,
            attemptedQuestions: 3,
            correctAnswers: 3,
            incorrectAnswers: 0,
            score: 50.0,
            percentage: 100.0,
            isPassing: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([terminalAttemptRow])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([mockAssessmentRow])
            .mockResolvedValueOnce(mockQuestions)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([winningResult]);

          const res = await repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId);
          expect(res.id).toBe('res-winner');
          expect(res.score).toBe(50.0);
        });

        it('findResultByAttemptId returns result or null', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
            {
              id: 'res-01',
              schoolId: mockSchoolId,
              assessmentId: mockAssessmentId,
              attemptId: mockAttemptId,
              studentId: mockStudentId,
              totalQuestions: 3,
              attemptedQuestions: 3,
              correctAnswers: 3,
              incorrectAnswers: 0,
              score: 50.0,
              percentage: 100.0,
              isPassing: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);

          const res = await repository.findResultByAttemptId(mockSchoolId, mockAttemptId);
          expect(res?.id).toBe('res-01');

          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
          const nullRes = await repository.findResultByAttemptId(mockSchoolId, 'unknown');
          expect(nullRes).toBeNull();
        });

        it('scoreAndPersistResultAtomic rejects if assessment is already RESULTS_RELEASED', async () => {
          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([terminalAttemptRow])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'RESULTS_RELEASED' }]);

          await expect(
            repository.scoreAndPersistResultAtomic(mockSchoolId, mockAttemptId),
          ).rejects.toThrow(/results have already been released/);
        });
      });

      describe('Single-Transaction Atomic Finalization & Scoring (finalizeAndScoreAttemptAtomic)', () => {
        const mockQuestions = [
          { id: 'q-1', marks: 25.5, correctOption: 1 },
          { id: 'q-2', marks: 14.5, correctOption: 2 },
          { id: 'q-3', marks: 10.0, correctOption: 0 },
        ];

        const mockAssessment = {
          id: mockAssessmentId,
          status: 'CLOSED',
          totalMarks: 50.0,
          passingMarks: 20.0,
        };

        const inProgressAttempt = {
          id: mockAttemptId,
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          studentId: mockStudentId,
          status: 'IN_PROGRESS',
          startedAt: new Date(Date.now() - 3600000),
          deadlineAt: new Date(Date.now() + 3600000),
          submittedAt: null,
          createdAt: new Date(Date.now() - 3600000),
          updatedAt: new Date(Date.now() - 3600000),
        };

        const answers = [
          { questionId: 'q-1', selectedOption: 1 },
          { questionId: 'q-2', selectedOption: 2 },
          { questionId: 'q-3', selectedOption: 0 },
        ];

        const mockResultRow = {
          id: 'res-atomic-01',
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          attemptId: mockAttemptId,
          studentId: mockStudentId,
          totalQuestions: 3,
          attemptedQuestions: 3,
          correctAnswers: 3,
          incorrectAnswers: 0,
          score: 50.0,
          percentage: 100.0,
          isPassing: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        it('finalizes active attempt and creates result in a single atomic transaction', async () => {
          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([mockAssessment]) // 1. Lock assessment FOR SHARE
            .mockResolvedValueOnce([inProgressAttempt]) // 2. Lock attempt FOR UPDATE
            .mockResolvedValueOnce([{ ...inProgressAttempt, status: 'SUBMITTED', submittedAt: new Date() }]) // 3. Update attempt
            .mockResolvedValueOnce([]) // 4. Check existing result (none)
            .mockResolvedValueOnce(mockQuestions) // 5. Questions
            .mockResolvedValueOnce(answers) // 6. Answers
            .mockResolvedValueOnce([mockResultRow]); // 7. Insert result

          const res = await repository.finalizeAndScoreAttemptAtomic(
            mockSchoolId,
            mockAttemptId,
            AttemptStatus.SUBMITTED,
            mockAssessmentId,
          );

          expect(res.attempt.status).toBe(AttemptStatus.SUBMITTED);
          expect(res.result.id).toBe('res-atomic-01');
          expect(res.result.score).toBe(50.0);
          expect(res.result.isPassing).toBe(true);
        });

        it('rejects finalization and scoring if assessment is already RESULTS_RELEASED', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
            { ...mockAssessment, status: 'RESULTS_RELEASED' },
          ]);

          await expect(
            repository.finalizeAndScoreAttemptAtomic(
              mockSchoolId,
              mockAttemptId,
              AttemptStatus.SUBMITTED,
              mockAssessmentId,
            ),
          ).rejects.toThrow('Cannot finalize or score attempt: assessment results have already been released');
        });

        it('returns existing result and attempt idempotently if already scored without duplicate insert', async () => {
          const terminalAttempt = { ...inProgressAttempt, status: 'SUBMITTED', submittedAt: new Date() };

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([mockAssessment]) // 1. Lock assessment FOR SHARE
            .mockResolvedValueOnce([terminalAttempt]) // 2. Lock attempt FOR UPDATE (already terminal)
            .mockResolvedValueOnce([mockResultRow]); // 3. Check existing result (found)

          const res = await repository.finalizeAndScoreAttemptAtomic(
            mockSchoolId,
            mockAttemptId,
            AttemptStatus.SUBMITTED,
            mockAssessmentId,
          );

          expect(res.attempt.status).toBe(AttemptStatus.SUBMITTED);
          expect(res.result.id).toBe('res-atomic-01');
        });

        it('recovers unpersisted terminal attempt and scores it before release', async () => {
          const terminalAttemptWithoutResult = { ...inProgressAttempt, status: 'SUBMITTED', submittedAt: new Date() };

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([mockAssessment]) // 1. Lock assessment FOR SHARE
            .mockResolvedValueOnce([terminalAttemptWithoutResult]) // 2. Lock attempt FOR UPDATE (already terminal)
            .mockResolvedValueOnce([]) // 3. Check existing result (none found -> recover)
            .mockResolvedValueOnce(mockQuestions) // 4. Questions
            .mockResolvedValueOnce(answers) // 5. Answers
            .mockResolvedValueOnce([mockResultRow]); // 6. Insert result

          const res = await repository.finalizeAndScoreAttemptAtomic(
            mockSchoolId,
            mockAttemptId,
            AttemptStatus.SUBMITTED,
            mockAssessmentId,
          );

          expect(res.attempt.status).toBe(AttemptStatus.SUBMITTED);
          expect(res.result.id).toBe('res-atomic-01');
        });

        it('automatically switches to TIMED_OUT if deadline crossed while active', async () => {
          const expiredAttempt = {
            ...inProgressAttempt,
            deadlineAt: new Date(Date.now() - 60000), // deadline passed 1 minute ago
          };

          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([mockAssessment])
            .mockResolvedValueOnce([expiredAttempt])
            .mockResolvedValueOnce([{ ...expiredAttempt, status: 'TIMED_OUT', submittedAt: new Date() }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(mockQuestions)
            .mockResolvedValueOnce(answers)
            .mockResolvedValueOnce([{ ...mockResultRow, isPassing: true }]);

          const res = await repository.finalizeAndScoreAttemptAtomic(
            mockSchoolId,
            mockAttemptId,
            AttemptStatus.SUBMITTED,
            mockAssessmentId,
          );

          expect(res.attempt.status).toBe(AttemptStatus.TIMED_OUT);
        });
      });

      describe('Student assessment progression methods', () => {
        const mockStudentId = '00000000-0000-0000-0000-000000000088';
        const mockChapterId = '00000000-0000-0000-0000-000000000077';

        it('updateProgressionAtomic executes upsert and returns mapped progression', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
            {
              id: 'prog-01',
              schoolId: mockSchoolId,
              studentId: mockStudentId,
              assessmentId: mockAssessmentId,
              chapterId: mockChapterId,
              status: 'RESOLVED_SUBMITTED',
              unlockedAt: new Date('2026-10-29T12:00:00Z'),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);

          const res = await repository.updateProgressionAtomic({
            schoolId: mockSchoolId,
            studentId: mockStudentId,
            assessmentId: mockAssessmentId,
            chapterId: mockChapterId,
            status: ProgressionAssessmentStatus.RESOLVED_SUBMITTED,
            unlockedAt: new Date('2026-10-29T12:00:00Z'),
          });

          expect(res.id).toBe('prog-01');
          expect(res.status).toBe(ProgressionAssessmentStatus.RESOLVED_SUBMITTED);
          expect(res.unlockedAt).toBeInstanceOf(Date);
          expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO "student_assessment_progressions"'),
            mockSchoolId,
            mockStudentId,
            mockAssessmentId,
            mockChapterId,
            ProgressionAssessmentStatus.RESOLVED_SUBMITTED,
            expect.any(Date),
          );
        });

        it('findProgressionByStudentAndAssessment returns record or null', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
            {
              id: 'prog-01',
              schoolId: mockSchoolId,
              studentId: mockStudentId,
              assessmentId: mockAssessmentId,
              chapterId: mockChapterId,
              status: 'PENDING_OPEN',
              unlockedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);

          const res = await repository.findProgressionByStudentAndAssessment(
            mockSchoolId,
            mockStudentId,
            mockAssessmentId,
          );
          expect(res?.status).toBe(ProgressionAssessmentStatus.PENDING_OPEN);

          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
          const nullRes = await repository.findProgressionByStudentAndAssessment(
            mockSchoolId,
            mockStudentId,
            'unknown-assessment',
          );
          expect(nullRes).toBeNull();
        });

        it('findProgressionsByStudentAndChapter returns list of progressions for chapter', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
            {
              id: 'prog-01',
              schoolId: mockSchoolId,
              studentId: mockStudentId,
              assessmentId: mockAssessmentId,
              chapterId: mockChapterId,
              status: 'RESOLVED_SUBMITTED',
              unlockedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);

          const list = await repository.findProgressionsByStudentAndChapter(
            mockSchoolId,
            mockStudentId,
            mockChapterId,
          );
          expect(list).toHaveLength(1);
          expect(list[0].id).toBe('prog-01');
        });

        it('findChapterAssessmentsForStudent queries published/closed assessments for student grade and section', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([mockAssessmentRow]);

          const assessments = await repository.findChapterAssessmentsForStudent(
            mockSchoolId,
            mockChapterId,
            'ay-01',
            'grade-01',
            'sec-01',
          );
          expect(assessments).toHaveLength(1);
          expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
            expect.stringContaining('WHERE "schoolId" = $1'),
            mockSchoolId,
            mockChapterId,
            'ay-01',
            'grade-01',
            'sec-01',
          );
        });
      });

      describe('releaseAssessmentResultsAtomic and closeAssessmentAtomic', () => {
        it('releaseAssessmentResultsAtomic updates status from CLOSED to RESULTS_RELEASED when 0 active attempts and 0 missing results', async () => {
          prismaMock.$transaction.mockImplementation(async (callback: any) => {
            const tx = {
              $queryRawUnsafe: jest
                .fn()
                .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'CLOSED' }])
                .mockResolvedValueOnce([{ count: 0 }])
                .mockResolvedValueOnce([{ count: 0 }])
                .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'RESULTS_RELEASED' }]),
            };
            return callback(tx);
          });

          const res = await repository.releaseAssessmentResultsAtomic(mockSchoolId, mockAssessmentId);
          expect(res.status).toBe(AssessmentStatus.RESULTS_RELEASED);
        });

        it('releaseAssessmentResultsAtomic rejects if active attempts remain IN_PROGRESS', async () => {
          prismaMock.$transaction.mockImplementation(async (callback: any) => {
            const tx = {
              $queryRawUnsafe: jest
                .fn()
                .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'CLOSED' }])
                .mockResolvedValueOnce([{ count: 2 }]),
            };
            return callback(tx);
          });

          await expect(
            repository.releaseAssessmentResultsAtomic(mockSchoolId, mockAssessmentId),
          ).rejects.toThrow(
            'Cannot release results: assessment has 2 active attempt(s) in progress. Wait for all attempts to be submitted or reach their deadlines before releasing results.',
          );
        });

        it('releaseAssessmentResultsAtomic rejects if terminal attempts are missing required AssessmentResult', async () => {
          prismaMock.$transaction.mockImplementation(async (callback: any) => {
            const tx = {
              $queryRawUnsafe: jest
                .fn()
                .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'CLOSED' }])
                .mockResolvedValueOnce([{ count: 0 }])
                .mockResolvedValueOnce([{ count: 1 }]),
            };
            return callback(tx);
          });

          await expect(
            repository.releaseAssessmentResultsAtomic(mockSchoolId, mockAssessmentId),
          ).rejects.toThrow(
            'Cannot release results: assessment has 1 finalized attempt(s) missing score calculation. Wait for scoring to complete before releasing results.',
          );
        });

        it('releaseAssessmentResultsAtomic returns idempotently if already RESULTS_RELEASED', async () => {
          prismaMock.$transaction.mockImplementation(async (callback: any) => {
            const tx = {
              $queryRawUnsafe: jest
                .fn()
                .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'RESULTS_RELEASED' }]),
            };
            return callback(tx);
          });

          const res = await repository.releaseAssessmentResultsAtomic(mockSchoolId, mockAssessmentId);
          expect(res.status).toBe(AssessmentStatus.RESULTS_RELEASED);
        });

        it('closeAssessmentAtomic updates status from PUBLISHED to CLOSED', async () => {
          prismaMock.$transaction.mockImplementation(async (callback: any) => {
            const tx = {
              $queryRawUnsafe: jest
                .fn()
                .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'PUBLISHED' }])
                .mockResolvedValueOnce([{ ...mockAssessmentRow, status: 'CLOSED' }]),
            };
            return callback(tx);
          });

          const res = await repository.closeAssessmentAtomic(mockSchoolId, mockAssessmentId);
          expect(res.status).toBe(AssessmentStatus.CLOSED);
        });

        describe('findExpiredInProgressAttempts (FINDING-03)', () => {
          it('queries expired IN_PROGRESS attempts with deadlineAt <= CURRENT_TIMESTAMP', async () => {
            const mockExpiredRow = {
              id: 'att-exp-1',
              schoolId: mockSchoolId,
              assessmentId: mockAssessmentId,
              studentId: 'stud-1',
              status: 'IN_PROGRESS',
              startedAt: new Date(Date.now() - 3600000),
              deadlineAt: new Date(Date.now() - 60000),
              submittedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            prismaMock.$queryRawUnsafe.mockResolvedValueOnce([mockExpiredRow]);

            const rows = await repository.findExpiredInProgressAttempts(
              mockSchoolId,
              mockAssessmentId,
            );

            expect(rows).toHaveLength(1);
            expect(rows[0].id).toBe('att-exp-1');
            expect(rows[0].status).toBe(AttemptStatus.IN_PROGRESS);
            expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
              expect.stringContaining(`AND "deadlineAt" <= CURRENT_TIMESTAMP`),
              mockSchoolId,
              mockAssessmentId,
            );
          });
        });
      });

      describe('findParentStudentAssessmentHistory', () => {
        it('executes single bounded query with chapter, attempt, and result LEFT JOINs and strips pre-scored result data for unreleased assessments', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
            {
              id: 'assess-rel-1',
              schoolId: mockSchoolId,
              academicYearId: 'ay-1',
              gradeId: 'grade-1',
              sectionId: 'sec-1',
              chapterId: 'chap-1',
              title: 'Released Quiz',
              subject: 'Physics',
              mode: 'NORMAL_QUIZ',
              status: 'RESULTS_RELEASED',
              totalMarks: '25.00',
              passingMarks: '10.00',
              durationMinutes: 30,
              startWindowAt: '2026-10-20T09:00:00.000Z',
              endWindowAt: '2026-10-20T10:00:00.000Z',
              createdAt: '2026-10-19T09:00:00.000Z',
              joinedChapterId: 'chap-1',
              joinedChapterCode: 'PHY-01',
              joinedChapterTitle: 'Kinematics',
              attemptId: 'att-1',
              attemptStudentId: 'student-1',
              attemptStatus: 'SUBMITTED',
              attemptSubmittedAt: '2026-10-20T09:25:00.000Z',
              resTotalQuestions: 5,
              resAttemptedQuestions: 5,
              resCorrectAnswers: 4,
              resIncorrectAnswers: 1,
              resScore: '20.00',
              resPercentage: '80.00',
              resIsPassing: true,
            },
            {
              id: 'assess-closed-1',
              schoolId: mockSchoolId,
              academicYearId: 'ay-1',
              gradeId: 'grade-1',
              sectionId: null,
              chapterId: null,
              title: 'Closed Exam',
              subject: 'Physics',
              mode: 'LIVE_EXAM',
              status: 'CLOSED',
              totalMarks: '50.00',
              passingMarks: '20.00',
              durationMinutes: 60,
              startWindowAt: null,
              endWindowAt: null,
              createdAt: '2026-10-21T09:00:00.000Z',
              joinedChapterId: null,
              joinedChapterCode: null,
              joinedChapterTitle: null,
              attemptId: 'att-2',
              attemptStudentId: 'student-1',
              attemptStatus: 'TIMED_OUT',
              attemptSubmittedAt: '2026-10-21T10:00:00.000Z',
              resTotalQuestions: 10,
              resAttemptedQuestions: 9,
              resCorrectAnswers: 7,
              resIncorrectAnswers: 2,
              resScore: '35.00',
              resPercentage: '70.00',
              resIsPassing: true,
            },
          ]);

          const rows = await repository.findParentStudentAssessmentHistory(
            mockSchoolId,
            {
              studentId: 'student-1',
              academicYearId: 'ay-1',
              gradeId: 'grade-1',
              sectionId: 'sec-1',
            },
          );

          expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
            expect.stringContaining(
              `a."status" IN ('PUBLISHED'::"AssessmentStatus", 'CLOSED'::"AssessmentStatus", 'RESULTS_RELEASED'::"AssessmentStatus")`,
            ),
            mockSchoolId,
            'ay-1',
            'grade-1',
            'sec-1',
            'student-1',
          );

          expect(rows).toHaveLength(2);
          // Released row includes persisted result
          expect(rows[0].chapterCode).toBe('PHY-01');
          expect(rows[0].chapterTitle).toBe('Kinematics');
          expect(rows[0].attempt?.status).toBe(AttemptStatus.SUBMITTED);
          expect(rows[0].attempt?.result).toEqual({
            attemptId: 'att-1',
            totalQuestions: 5,
            attemptedQuestions: 5,
            correctAnswers: 4,
            incorrectAnswers: 1,
            score: 20,
            percentage: 80,
            isPassing: true,
          });

          // Closed row strips pre-scored result at the repository layer as well
          expect(rows[1].chapterId).toBeNull();
          expect(rows[1].attempt?.status).toBe(AttemptStatus.TIMED_OUT);
          expect(rows[1].attempt?.result).toBeNull();
        });
      });

      describe('findLeaderboardEntries', () => {
        it('queries total count and ranked results using identical filters, competition ranking and pagination', async () => {
          prismaMock.$queryRawUnsafe
            .mockResolvedValueOnce([{ totalCount: 2 }]) // count query
            .mockResolvedValueOnce([
              {
                resultId: 'res-1',
                assessmentId: mockAssessmentId,
                studentId: 'student-1',
                score: '90.00',
                percentage: '90.00',
                isPassing: true,
                resultCreatedAt: '2026-10-30T10:00:00.000Z',
                firstName: 'Alice',
                lastName: 'Walker',
                rank: 1,
                position: 1,
              },
              {
                resultId: 'res-2',
                assessmentId: mockAssessmentId,
                studentId: 'student-2',
                score: '85.00',
                percentage: '85.00',
                isPassing: true,
                resultCreatedAt: '2026-10-30T10:01:00.000Z',
                firstName: 'Bob',
                lastName: 'Smith',
                rank: 2,
                position: 2,
              },
            ]);

          const result = await repository.findLeaderboardEntries(
            mockSchoolId,
            mockAssessmentId,
            { page: 2, limit: 10 },
          );

          expect(result.totalCount).toBe(2);
          expect(result.entries).toHaveLength(2);
          expect(result.entries[0].rank).toBe(1);
          expect(result.entries[0].position).toBe(1);
          expect(result.entries[0].score).toBe(90);
          expect(result.entries[1].rank).toBe(2);
          expect(result.entries[1].position).toBe(2);
          expect(result.entries[1].score).toBe(85);

          // Verify exact SQL clauses and parameters
          expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(2);

          // 1. Assert Count Query uses identical filters
          const countSql = prismaMock.$queryRawUnsafe.mock.calls[0][0];
          expect(countSql).toContain('SELECT COUNT(*)::int AS "totalCount"');
          expect(countSql).toContain('JOIN "assessments" a');
          expect(countSql).toContain('JOIN "students" s');
          expect(countSql).toContain('JOIN "assessment_attempts" att');
          expect(countSql).toContain(`a."status" = 'RESULTS_RELEASED'::"AssessmentStatus"`);
          expect(countSql).toContain(`s."status" = 'ACTIVE'::"StudentStatus"`);
          expect(countSql).toContain(`att."status" IN ('SUBMITTED'::"AttemptStatus", 'TIMED_OUT'::"AttemptStatus")`);
          expect(prismaMock.$queryRawUnsafe.mock.calls[0][1]).toBe(mockSchoolId);
          expect(prismaMock.$queryRawUnsafe.mock.calls[0][2]).toBe(mockAssessmentId);

          // 2. Assert Ranking Query uses identical joins/filters plus RANK() and pagination
          const rankSql = prismaMock.$queryRawUnsafe.mock.calls[1][0];
          expect(rankSql).toContain('RANK() OVER (ORDER BY ar."score" DESC)::int AS "rank"');
          expect(rankSql).toContain('ROW_NUMBER() OVER (ORDER BY ar."score" DESC, ar."createdAt" ASC, ar."studentId" ASC)::int AS "position"');
          expect(rankSql).toContain('JOIN "assessments" a');
          expect(rankSql).toContain('JOIN "students" s');
          expect(rankSql).toContain('JOIN "assessment_attempts" att');
          expect(rankSql).toContain(`a."status" = 'RESULTS_RELEASED'::"AssessmentStatus"`);
          expect(rankSql).toContain(`s."status" = 'ACTIVE'::"StudentStatus"`);
          expect(rankSql).toContain(`att."status" IN ('SUBMITTED'::"AttemptStatus", 'TIMED_OUT'::"AttemptStatus")`);
          expect(rankSql).toContain('LIMIT $3 OFFSET $4');

          // Pagination on page 2, limit 10 => limit 10, offset 10
          expect(prismaMock.$queryRawUnsafe.mock.calls[1][1]).toBe(mockSchoolId);
          expect(prismaMock.$queryRawUnsafe.mock.calls[1][2]).toBe(mockAssessmentId);
          expect(prismaMock.$queryRawUnsafe.mock.calls[1][3]).toBe(10);
          expect(prismaMock.$queryRawUnsafe.mock.calls[1][4]).toBe(10);
        });

        it('returns empty array when totalCount is 0 without executing second query', async () => {
          prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ totalCount: 0 }]);

          const result = await repository.findLeaderboardEntries(
            mockSchoolId,
            mockAssessmentId,
            { page: 1, limit: 10 },
          );

          expect(result.totalCount).toBe(0);
          expect(result.entries).toEqual([]);
          expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
        });
      });

      describe('getSchoolExaminationSetting and upsertSchoolExaminationSetting', () => {
        it('returns null if setting row does not exist', async () => {
          prismaMock.schoolExaminationSetting.findUnique.mockResolvedValueOnce(null);

          const setting = await repository.getSchoolExaminationSetting(mockSchoolId);
          expect(setting).toBeNull();
        });

        it('upserts setting safely using unique school key and records updatedByUserId', async () => {
          const now = new Date();
          prismaMock.schoolExaminationSetting.upsert.mockResolvedValueOnce({
            id: 'setting-1',
            schoolId: mockSchoolId,
            showStudentNamesOnLeaderboards: true,
            updatedByUserId: 'admin-1',
            createdAt: now,
            updatedAt: now,
          });

          const setting = await repository.upsertSchoolExaminationSetting(
            mockSchoolId,
            true,
            'admin-1',
          );

          expect(setting.showStudentNamesOnLeaderboards).toBe(true);
          expect(setting.updatedByUserId).toBe('admin-1');
          expect(prismaMock.schoolExaminationSetting.upsert).toHaveBeenCalledWith({
            where: { schoolId: mockSchoolId },
            create: {
              schoolId: mockSchoolId,
              showStudentNamesOnLeaderboards: true,
              updatedByUserId: 'admin-1',
            },
            update: {
              showStudentNamesOnLeaderboards: true,
              updatedByUserId: 'admin-1',
            },
          });
        });
      });

      describe('getPlatformLeaderboardMetrics', () => {
        it('aggregates platform stats with default-OFF treatment for missing rows and reconciles denominator', async () => {
          // Scenario with 3 reporting schools:
          // School 1 has setting ON
          // School 2 has setting OFF
          // School 3 has NO setting row (defaults to OFF)
          prismaMock.assessment.findMany.mockResolvedValueOnce([
            { schoolId: 'school-1' },
            { schoolId: 'school-2' },
            { schoolId: 'school-3' },
          ]);
          prismaMock.assessment.count.mockResolvedValueOnce(25);
          prismaMock.assessmentResult.count.mockResolvedValueOnce(1200);
          // Only school-1 has setting ON
          prismaMock.schoolExaminationSetting.count.mockResolvedValueOnce(1);

          const metrics = await repository.getPlatformLeaderboardMetrics();

          expect(metrics.totalSchoolsReporting).toBe(3);
          expect(metrics.totalReleasedAssessments).toBe(25);
          expect(metrics.totalEligibleResults).toBe(1200);
          expect(metrics.schoolsWithNamesVisibleCount).toBe(1);
          // 3 total reporting - 1 visible = 2 masked (includes school-2 with OFF and school-3 with missing row)
          expect(metrics.schoolsWithNamesMaskedCount).toBe(2);
          // Denominator reconciles exactly:
          expect(metrics.schoolsWithNamesVisibleCount + metrics.schoolsWithNamesMaskedCount).toBe(metrics.totalSchoolsReporting);
          // Assert zero PII
          expect((metrics as any).students).toBeUndefined();
          expect((metrics as any).studentNames).toBeUndefined();
        });

        it('handles zero reporting schools safely without divide-by-zero or negative counts', async () => {
          prismaMock.assessment.findMany.mockResolvedValueOnce([]);
          prismaMock.assessment.count.mockResolvedValueOnce(0);
          prismaMock.assessmentResult.count.mockResolvedValueOnce(0);

          const metrics = await repository.getPlatformLeaderboardMetrics();

          expect(metrics.totalSchoolsReporting).toBe(0);
          expect(metrics.totalReleasedAssessments).toBe(0);
          expect(metrics.totalEligibleResults).toBe(0);
          expect(metrics.schoolsWithNamesVisibleCount).toBe(0);
          expect(metrics.schoolsWithNamesMaskedCount).toBe(0);
        });
      });
    });
  });
});
