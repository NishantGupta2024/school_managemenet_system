import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeacherStatus, UserRole } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { ExaminationQuestionsService } from '../services/examination-questions.service';
import { ExaminationStorageService } from '../services/examination-storage.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import { AssessmentMode, AssessmentStatus, AuthenticatedUser } from '../types';

describe('ExaminationQuestionsService - Unit Tests', () => {
  let service: ExaminationQuestionsService;
  let prismaMock: any;
  let examRepoMock: any;
  let storageServiceMock: any;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockAYId = '00000000-0000-0000-0000-000000000199';
  const mockGradeId = '00000000-0000-0000-0000-000000000299';
  const mockTeacherId = '00000000-0000-0000-0000-000000000999';
  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';
  const mockQuestionId = '00000000-0000-0000-0000-000000000777';
  const mockSectionId = '00000000-0000-0000-0000-000000000666';

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

  const otherTeacherUser: AuthenticatedUser = {
    id: 'user-teacher-02',
    email: 'other.teacher@school.edu',
    role: UserRole.TEACHER,
    schoolId: mockSchoolId,
  };

  const studentUser: AuthenticatedUser = {
    id: 'user-student-01',
    email: 'student@school.edu',
    role: UserRole.STUDENT,
    schoolId: mockSchoolId,
  };

  const platformAdminUser: AuthenticatedUser = {
    id: 'user-platform-01',
    email: 'platform@erp.io',
    role: UserRole.PLATFORM_SUPER_ADMIN,
    schoolId: mockSchoolId,
  };

  const mockDraftAssessment = {
    id: mockAssessmentId,
    schoolId: mockSchoolId,
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: null,
    teacherId: mockTeacherId,
    chapterId: null,
    title: 'Midterm Physics',
    description: null,
    subject: 'Physics',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.DRAFT,
    totalMarks: 50.0,
    passingMarks: 20.0,
    durationMinutes: 60,
    startWindowAt: null,
    endWindowAt: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validQuestionDto = {
    questionText: 'What is the SI unit of Force?',
    options: ['Newton', 'Joule', 'Watt', 'Pascal'],
    correctOption: 0,
    marks: 5.0,
    explanation: 'Newton (N) is the SI unit of force.',
  };

  beforeEach(async () => {
    prismaMock = {
      teacher: { findFirst: jest.fn() },
      student: { findFirst: jest.fn() },
    };

    storageServiceMock = {
      validateImageBuffer: jest.fn(),
      storeQuestionImage: jest.fn(),
      readQuestionImage: jest.fn(),
      deleteFileSafe: jest.fn(),
    };

    examRepoMock = {
      findAssessmentById: jest.fn(),
      findQuestionsByAssessmentId: jest.fn(),
      findQuestionById: jest.fn(),
      findAttemptByStudentAndAssessment: jest.fn(),
      createQuestion: jest.fn(),
      updateQuestion: jest.fn(),
      deleteQuestion: jest.fn(),
      getNextQuestionOrderIndex: jest.fn(),
      findAssessmentSectionById: jest.fn(),
      createQuestionsBulkAtomic: jest.fn(),
      upsertQuestionImageAtomic: jest.fn(),
      findQuestionImage: jest.fn(),
      deleteQuestionImageAtomic: jest.fn(),
      countImageReferencesByStoragePath: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExaminationQuestionsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EXAMINATION_REPOSITORY, useValue: examRepoMock },
        { provide: ExaminationStorageService, useValue: storageServiceMock },
      ],
    }).compile();

    service = module.get<ExaminationQuestionsService>(ExaminationQuestionsService);
  });

  describe('createQuestion', () => {
    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue([]);
      examRepoMock.getNextQuestionOrderIndex.mockResolvedValue(1);
    });

    it('successfully creates an MCQ question with 4 options and valid marks', async () => {
      examRepoMock.createQuestion.mockResolvedValue({
        id: mockQuestionId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        sectionId: null,
        orderIndex: 1,
        ...validQuestionDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createQuestion(
        mockSchoolId,
        mockAssessmentId,
        validQuestionDto,
        teacherUser,
      );

      expect(result.id).toBe(mockQuestionId);
      expect(result.questionText).toBe(validQuestionDto.questionText);
      expect(result.options).toEqual(validQuestionDto.options);
      expect(result.correctOption).toBe(0);
      expect(result.marks).toBe(5.0);
      expect(examRepoMock.createQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: mockSchoolId,
          assessmentId: mockAssessmentId,
          marks: 5.0,
        }),
        mockTeacherId,
      );
    });

    it('throws NotFoundException if assessment does not exist in caller school', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(null);

      await expect(
        service.createQuestion(mockSchoolId, 'unknown-id', validQuestionDto, teacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if assessment status is not DRAFT', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockDraftAssessment,
        status: AssessmentStatus.PUBLISHED,
      });

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, validQuestionDto, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if teacher attempts to add question to another teacher draft', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, validQuestionDto, otherTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if school admin attempts to add question to a draft', async () => {
      await expect(
        service.createQuestion(
          mockSchoolId,
          mockAssessmentId,
          validQuestionDto,
          adminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if questionText is empty or blank', async () => {
      const invalid = { ...validQuestionDto, questionText: '   ' };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if options does not contain exactly 4 choices', async () => {
      const invalid = { ...validQuestionDto, options: ['A', 'B', 'C'] };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow('Options must contain exactly 4 choices');
    });

    it('throws BadRequestException if options contain an empty string', async () => {
      const invalid = { ...validQuestionDto, options: ['Newton', '', 'Watt', 'Pascal'] };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if options contain duplicate values within the question', async () => {
      const invalid = {
        ...validQuestionDto,
        options: ['Newton', 'Joule', 'newton', 'Pascal'], // Case-insensitive duplicate
      };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow(/duplicate choices are forbidden/i);
    });

    it('throws BadRequestException if correctOption is not between 0 and 3', async () => {
      const invalid = { ...validQuestionDto, correctOption: 4 };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow('Correct option must be an integer index between 0 and 3');
    });

    it('throws BadRequestException if marks is negative or zero', async () => {
      const invalid = { ...validQuestionDto, marks: 0 };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow('Marks must be greater than 0.00 and at most 500.00');
    });

    it('throws BadRequestException if marks exceeds 500', async () => {
      const invalid = { ...validQuestionDto, marks: 501 };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow('Marks must be greater than 0.00 and at most 500.00');
    });

    it('throws BadRequestException if marks has more than 2 decimal places', async () => {
      const invalid = { ...validQuestionDto, marks: 2.345 };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow('Marks cannot have more than 2 decimal places');
    });

    it('throws BadRequestException if sectionId does not belong to this assessment', async () => {
      examRepoMock.findAssessmentSectionById.mockResolvedValue(null);
      const invalid = { ...validQuestionDto, sectionId: mockSectionId };

      await expect(
        service.createQuestion(mockSchoolId, mockAssessmentId, invalid, teacherUser),
      ).rejects.toThrow('Assessment section not found or does not belong to this assessment');
    });

    it('allows valid sectionId belonging to this assessment', async () => {
      examRepoMock.findAssessmentSectionById.mockResolvedValue({
        id: mockSectionId,
        assessmentId: mockAssessmentId,
        title: 'Section A',
      });
      examRepoMock.createQuestion.mockResolvedValue({
        id: mockQuestionId,
        ...validQuestionDto,
        sectionId: mockSectionId,
      });

      const result = await service.createQuestion(
        mockSchoolId,
        mockAssessmentId,
        { ...validQuestionDto, sectionId: mockSectionId },
        teacherUser,
      );
      expect(result.id).toBe(mockQuestionId);
    });

    describe('Marks Reconciliation on Creation', () => {
      it('rejects adding question if new marks would exceed assessment totalMarks', async () => {
        examRepoMock.createQuestion.mockRejectedValue(
          new BadRequestException(
            'Adding this question with 5 marks would allocate 53.00 marks, exceeding the assessment total of 50.00 marks',
          ),
        );

        // Attempting to add a 5 mark question (48 + 5 = 53 > 50)
        await expect(
          service.createQuestion(mockSchoolId, mockAssessmentId, validQuestionDto, teacherUser),
        ).rejects.toThrow(/exceeding the assessment total of 50.00 marks/);
      });

      it('allows adding question if new marks equal or stay below totalMarks', async () => {
        // Assessment has 50 total marks; 45 already allocated + 5 new = 50
        examRepoMock.findQuestionsByAssessmentId.mockResolvedValue([
          { id: 'q1', marks: 25.0 },
          { id: 'q2', marks: 20.0 },
        ]);
        examRepoMock.createQuestion.mockResolvedValue({
          id: mockQuestionId,
          ...validQuestionDto,
        });

        const result = await service.createQuestion(
          mockSchoolId,
          mockAssessmentId,
          validQuestionDto,
          teacherUser,
        );
        expect(result.id).toBe(mockQuestionId);
      });
    });
  });

  describe('listQuestions', () => {
    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
    });

    it('returns questions list and complete marks reconciliation summary', async () => {
      const existingQuestions = [
        { id: 'q1', marks: 20.0, orderIndex: 1, questionText: 'Q1' },
        { id: 'q2', marks: 15.0, orderIndex: 2, questionText: 'Q2' },
      ];
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue(existingQuestions);

      const response = await service.listQuestions(
        mockSchoolId,
        mockAssessmentId,
        teacherUser,
      );

      expect(response.questions).toHaveLength(2);
      expect(response.summary.targetTotalMarks).toBe(50.0);
      expect(response.summary.currentAllocatedMarks).toBe(35.0);
      expect(response.summary.remainingMarks).toBe(15.0);
      expect(response.summary.totalQuestions).toBe(2);
      expect(response.summary.isReconciled).toBe(false);
    });

    it('reports isReconciled as true when currentAllocatedMarks equals targetTotalMarks', async () => {
      const existingQuestions = [
        { id: 'q1', marks: 25.0, orderIndex: 1 },
        { id: 'q2', marks: 25.0, orderIndex: 2 },
      ];
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue(existingQuestions);

      const response = await service.listQuestions(
        mockSchoolId,
        mockAssessmentId,
        teacherUser,
      );

      expect(response.summary.currentAllocatedMarks).toBe(50.0);
      expect(response.summary.remainingMarks).toBe(0.0);
      expect(response.summary.isReconciled).toBe(true);
    });

    it('throws NotFoundException when teacher attempts to list questions for another teacher draft', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });

      await expect(
        service.listQuestions(mockSchoolId, mockAssessmentId, otherTeacherUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects teacher attempting to list questions for a PUBLISHED assessment authored by another teacher (FINDING-04 VULN-02)', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockDraftAssessment,
        teacherId: 'other-author-id',
        status: AssessmentStatus.PUBLISHED,
      });
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId, status: TeacherStatus.ACTIVE });

      await expect(
        service.listQuestions(mockSchoolId, mockAssessmentId, teacherUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getQuestionById', () => {
    const existingQuestion = {
      id: mockQuestionId,
      schoolId: mockSchoolId,
      assessmentId: mockAssessmentId,
      ...validQuestionDto,
    };

    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
    });

    it('returns question if it exists in the assessment', async () => {
      examRepoMock.findQuestionById.mockResolvedValue(existingQuestion);

      const result = await service.getQuestionById(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        teacherUser,
      );
      expect(result.id).toBe(mockQuestionId);
    });

    it('throws NotFoundException if question does not exist', async () => {
      examRepoMock.findQuestionById.mockResolvedValue(null);

      await expect(
        service.getQuestionById(mockSchoolId, mockAssessmentId, 'non-existent', teacherUser),
      ).rejects.toThrow('Question not found in this assessment');
    });

    it('throws NotFoundException if teacher queries question on another teacher draft', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });

      await expect(
        service.getQuestionById(mockSchoolId, mockAssessmentId, mockQuestionId, otherTeacherUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateQuestion', () => {
    const existingQuestion = {
      id: mockQuestionId,
      schoolId: mockSchoolId,
      assessmentId: mockAssessmentId,
      sectionId: null,
      orderIndex: 1,
      ...validQuestionDto, // marks: 5.0
    };

    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.findQuestionById.mockResolvedValue(existingQuestion);
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue([existingQuestion]);
    });

    it('successfully updates a question field and validates effective values', async () => {
      examRepoMock.updateQuestion.mockResolvedValue({
        ...existingQuestion,
        questionText: 'Updated question text?',
        marks: 10.0,
      });

      const result = await service.updateQuestion(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        { questionText: 'Updated question text?', marks: 10.0 },
        teacherUser,
      );

      expect(result.questionText).toBe('Updated question text?');
      expect(result.marks).toBe(10.0);
    });

    it('throws BadRequestException if assessment status is not DRAFT', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockDraftAssessment,
        status: AssessmentStatus.PUBLISHED,
      });

      await expect(
        service.updateQuestion(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          { marks: 10.0 },
          teacherUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if teacher attempts to update question on another teacher draft', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });

      await expect(
        service.updateQuestion(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          { marks: 10.0 },
          otherTeacherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects partial update if effective options contain duplicates', async () => {
      await expect(
        service.updateQuestion(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          { options: ['Option A', 'Option B', 'Option A', 'Option D'] },
          teacherUser,
        ),
      ).rejects.toThrow(/duplicate choices are forbidden/i);
    });

    it('rejects update if new marks would cause total allocated marks to exceed assessment totalMarks', async () => {
      // Assessment has 50 total marks. Another question q2 has 40 marks.
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue([
        existingQuestion, // id: mockQuestionId, currently 5 marks
        { id: 'q2', marks: 40.0 },
      ]);

      // Updating mockQuestionId to 15 marks (40 + 15 = 55 > 50)
      await expect(
        service.updateQuestion(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          { marks: 15.0 },
          teacherUser,
        ),
      ).rejects.toThrow(/exceeding the assessment total of 50.00 marks/);
    });
  });

  describe('deleteQuestion', () => {
    const existingQuestion = {
      id: mockQuestionId,
      schoolId: mockSchoolId,
      assessmentId: mockAssessmentId,
      ...validQuestionDto,
    };

    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.findQuestionById.mockResolvedValue(existingQuestion);
    });

    it('successfully deletes a question from a draft assessment', async () => {
      const result = await service.deleteQuestion(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        teacherUser,
      );

      expect(result.success).toBe(true);
      expect(examRepoMock.deleteQuestion).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        mockTeacherId,
      );
    });

    it('captures attached image artifact before deletion and unlinks file after repository success', async () => {
      const artifactPath = 'examination-question-images/school/assessment/diagram_123.png';
      examRepoMock.findQuestionImage.mockResolvedValue({
        id: 'img-1',
        storagePath: artifactPath,
      });
      examRepoMock.countImageReferencesByStoragePath.mockResolvedValue(0);

      const result = await service.deleteQuestion(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        teacherUser,
      );

      expect(result.success).toBe(true);
      expect(examRepoMock.findQuestionImage).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
      );
      expect(examRepoMock.deleteQuestion).toHaveBeenCalledWith(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        mockTeacherId,
      );
      expect(storageServiceMock.deleteFileSafe).toHaveBeenCalledWith(artifactPath);
    });

    it('does not unlink file if repository deleteQuestion fails', async () => {
      examRepoMock.findQuestionImage.mockResolvedValue({
        id: 'img-1',
        storagePath: 'examination-question-images/school/assessment/diagram_123.png',
      });
      examRepoMock.deleteQuestion.mockRejectedValue(new Error('Foreign key constraint violation'));

      await expect(
        service.deleteQuestion(mockSchoolId, mockAssessmentId, mockQuestionId, teacherUser),
      ).rejects.toThrow('Foreign key constraint violation');

      expect(storageServiceMock.deleteFileSafe).not.toHaveBeenCalled();
    });

    it('skips unlinking file if another artifact still references the storage path', async () => {
      examRepoMock.findQuestionImage.mockResolvedValue({
        id: 'img-1',
        storagePath: 'examination-question-images/school/assessment/diagram_shared.png',
      });
      examRepoMock.countImageReferencesByStoragePath.mockResolvedValue(1);

      const result = await service.deleteQuestion(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        teacherUser,
      );

      expect(result.success).toBe(true);
      expect(storageServiceMock.deleteFileSafe).not.toHaveBeenCalled();
    });

    it('does not fail question deletion if reference-count check throws after DB commit', async () => {
      examRepoMock.findQuestionImage.mockResolvedValue({
        id: 'img-1',
        storagePath: 'examination-question-images/school/assessment/diagram_123.png',
      });
      examRepoMock.countImageReferencesByStoragePath.mockRejectedValue(new Error('DB read timeout'));

      const result = await service.deleteQuestion(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        teacherUser,
      );

      expect(result.success).toBe(true);
      expect(storageServiceMock.deleteFileSafe).not.toHaveBeenCalled();
    });

    it('does not fail question deletion if physical file cleanup fails after DB commit', async () => {
      examRepoMock.findQuestionImage.mockResolvedValue({
        id: 'img-1',
        storagePath: 'examination-question-images/school/assessment/diagram_123.png',
      });
      examRepoMock.countImageReferencesByStoragePath.mockResolvedValue(0);
      storageServiceMock.deleteFileSafe.mockRejectedValue(new Error('EPERM: file locked'));

      const result = await service.deleteQuestion(
        mockSchoolId,
        mockAssessmentId,
        mockQuestionId,
        teacherUser,
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Question deleted successfully');
    });

    it('throws BadRequestException if assessment status is not DRAFT', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockDraftAssessment,
        status: AssessmentStatus.PUBLISHED,
      });

      await expect(
        service.deleteQuestion(mockSchoolId, mockAssessmentId, mockQuestionId, teacherUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if teacher attempts to delete question on another teacher draft', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });

      await expect(
        service.deleteQuestion(mockSchoolId, mockAssessmentId, mockQuestionId, otherTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if question does not exist', async () => {
      examRepoMock.findQuestionById.mockResolvedValue(null);

      await expect(
        service.deleteQuestion(mockSchoolId, mockAssessmentId, 'non-existent', teacherUser),
      ).rejects.toThrow('Question not found in this assessment');
    });
  });

  describe('Excel Import - previewImport and confirmImport', () => {
    async function buildWorkbookBuffer(
      headers: string[],
      rows: (string | number)[][],
    ): Promise<Buffer> {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Questions');
      worksheet.addRow(headers);
      for (const r of rows) {
        worksheet.addRow(r);
      }
      return Buffer.from(await workbook.xlsx.writeBuffer());
    }

    const standardHeaders = [
      'Serial Number',
      'Question',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'Correct Option',
      'Marks',
      'Explanation',
    ];

    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.findQuestionsByAssessmentId.mockResolvedValue([]);
    });

    describe('previewImport', () => {
      it('successfully parses valid workbook and calculates marks reconciliation', async () => {
        const rows = [
          [1, 'What is the speed of light?', '3x10^8 m/s', '3x10^6 m/s', '300 m/s', 'Zero', 'A', 2.5, 'Constant c'],
          [2, 'What is H2O?', 'Water', 'Hydrogen', 'Oxygen', 'Helium', 'a', 2.5, 'Chemical formula'],
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.validCount).toBe(2);
        expect(result.invalidCount).toBe(0);
        expect(result.importedCount).toBe(2);
        expect(result.importedMarks).toBe(5.0);
        expect(result.projectedTotalMarks).toBe(5.0);
        expect(result.targetTotalMarks).toBe(50.0);
        expect(result.remainingMarks).toBe(45.0);
        expect(result.isReconciled).toBe(false);
        expect(result.reconciliationWarning).toBeNull();
        expect(result.validQuestions[0].correctOption).toBe(0);
      });

      it('throws BadRequestException if file buffer is empty', async () => {
        await expect(
          service.previewImport(mockSchoolId, mockAssessmentId, Buffer.alloc(0), teacherUser),
        ).rejects.toThrow('Uploaded file is empty');
      });

      it('throws BadRequestException if file exceeds 5 MB', async () => {
        const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);

        await expect(
          service.previewImport(mockSchoolId, mockAssessmentId, bigBuffer, teacherUser),
        ).rejects.toThrow('File exceeds maximum limit of 5 MB');
      });

      it('throws BadRequestException if file is not a valid xlsx document', async () => {
        const corruptBuffer = Buffer.from('not-a-valid-zip-or-excel');

        await expect(
          service.previewImport(mockSchoolId, mockAssessmentId, corruptBuffer, teacherUser),
        ).rejects.toThrow(/Failed to parse Excel file/i);
      });

      it('throws BadRequestException if required headers are missing', async () => {
        const incompleteHeaders = ['Serial Number', 'Question', 'Option A', 'Option B']; // Missing Option C, D, Correct, Marks
        const buffer = await buildWorkbookBuffer(incompleteHeaders, [[1, 'Q', 'A', 'B']]);

        await expect(
          service.previewImport(mockSchoolId, mockAssessmentId, buffer, teacherUser),
        ).rejects.toThrow(/Missing required column headers/i);
      });

      it('identifies invalid rows with missing required cells and invalid marks/options', async () => {
        const rows = [
          [1, 'Valid Question', 'Opt 1', 'Opt 2', 'Opt 3', 'Opt 4', 'A', 2.0, ''],
          [2, '', 'Opt 1', 'Opt 2', 'Opt 3', 'Opt 4', 'B', 2.0, ''], // missing question text
          [3, 'Invalid Choice', 'Opt 1', 'Opt 2', 'Opt 3', 'Opt 4', 'Z', 2.0, ''], // invalid correct option 'Z'
          [4, 'Invalid Marks', 'Opt 1', 'Opt 2', 'Opt 3', 'Opt 4', 'C', -5, ''], // negative marks
          [5, 'Duplicate Opts', 'Same', 'Same', 'Opt 3', 'Opt 4', 'D', 1.0, ''], // duplicate options
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.validCount).toBe(1);
        expect(result.invalidCount).toBe(4);
        expect(result.invalidRows).toHaveLength(4);
        expect(result.invalidRows[0].rowNumber).toBe(3); // Excel row 3
        expect(result.invalidRows[0].errors).toContain('Question text must be between 1 and 5000 characters');
      });

      it('identifies duplicate serial numbers in workbook and marks affected rows invalid', async () => {
        const rows = [
          [1, 'First Question', 'A', 'B', 'C', 'D', 'A', 2.0, ''],
          [1, 'Duplicate Serial', 'A', 'B', 'C', 'D', 'B', 2.0, ''], // Duplicate serial 1
          [2, 'Second Question', 'A', 'B', 'C', 'D', 'C', 2.0, ''],
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.duplicateSerialErrors).toHaveLength(1);
        expect(result.duplicateSerialErrors[0].serialNumber).toBe(1);
        expect(result.validCount).toBe(1); // Only serial 2 is valid
        expect(result.invalidCount).toBe(2); // Serial 1 rows moved to invalidRows
      });

      it('generates non-blocking warnings for duplicate question text without dropping rows', async () => {
        examRepoMock.findQuestionsByAssessmentId.mockResolvedValue([
          { id: 'q-existing', questionText: 'Existing Database Question', marks: 5.0 },
        ]);

        const rows = [
          [1, 'Identical Question Text', 'A', 'B', 'C', 'D', 'A', 2.0, ''],
          [2, 'Identical Question Text', 'W', 'X', 'Y', 'Z', 'B', 2.0, ''], // duplicate within file
          [3, 'Existing Database Question', '1', '2', '3', '4', 'C', 2.0, ''], // duplicate against DB
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.validCount).toBe(3); // Not dropped!
        expect(result.duplicateQuestionWarnings.length).toBeGreaterThanOrEqual(2);
        expect(result.duplicateQuestionWarnings[0]).toContain('identical question text to Row 2');
        expect(result.duplicateQuestionWarnings[1]).toContain('already existing question in this assessment');
      });

      it('generates reconciliationWarning when projected marks exceed totalMarks', async () => {
        // Assessment has 50 total marks; file has 60 marks
        const rows = [
          [1, 'Big Question 1', 'A', 'B', 'C', 'D', 'A', 30.0, ''],
          [2, 'Big Question 2', 'A', 'B', 'C', 'D', 'B', 30.0, ''],
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.projectedTotalMarks).toBe(60.0);
        expect(result.reconciliationWarning).toContain('would exceed assessment total marks (50.00) by 10.00 marks');
      });

      it('throws ForbiddenException when teacher attempts to preview another teacher draft', async () => {
        prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });
        const buffer = await buildWorkbookBuffer(standardHeaders, [[1, 'Q', 'A', 'B', 'C', 'D', 'A', 1.0, '']]);

        await expect(
          service.previewImport(mockSchoolId, mockAssessmentId, buffer, otherTeacherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('throws BadRequestException if assessment is not in DRAFT status', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });
        const buffer = await buildWorkbookBuffer(standardHeaders, [[1, 'Q', 'A', 'B', 'C', 'D', 'A', 1.0, '']]);

        await expect(
          service.previewImport(mockSchoolId, mockAssessmentId, buffer, teacherUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('flags row as invalid when an option exceeds 1000 characters', async () => {
        const longOption = 'A'.repeat(1001);
        const rows = [
          [1, 'Normal question', longOption, 'Opt B', 'Opt C', 'Opt D', 'A', 2.0, ''],
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.validCount).toBe(0);
        expect(result.invalidCount).toBe(1);
        expect(result.invalidRows[0].errors).toContain('Option A cannot exceed 1000 characters');
      });

      it('flags row as invalid when explanation exceeds 2000 characters', async () => {
        const longExplanation = 'E'.repeat(2001);
        const rows = [
          [1, 'Normal question', 'Opt A', 'Opt B', 'Opt C', 'Opt D', 'A', 2.0, longExplanation],
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.validCount).toBe(0);
        expect(result.invalidCount).toBe(1);
        expect(result.invalidRows[0].errors).toContain('Explanation cannot exceed 2000 characters');
      });

      it('rejects spreadsheet with duplicate column headers', async () => {
        const dupHeaders = [
          'Serial Number',
          'Question',
          'Option A',
          'Option B',
          'Option C',
          'Option D',
          'Correct Option',
          'Marks',
          'Question', // duplicate column
        ];
        const rows = [[1, 'Q', 'A', 'B', 'C', 'D', 'A', 1.0, 'Duplicate header']];
        const buffer = await buildWorkbookBuffer(dupHeaders, rows);

        await expect(
          service.previewImport(mockSchoolId, mockAssessmentId, buffer, teacherUser),
        ).rejects.toThrow(/Duplicate column headers detected/i);
      });

      it('rejects spreadsheet with ambiguous column aliases for the same field', async () => {
        const ambiguousHeaders = [
          'Serial Number',
          'Order Index', // ambiguous with Serial Number
          'Question',
          'Option A',
          'Option B',
          'Option C',
          'Option D',
          'Correct Option',
          'Marks',
        ];
        const rows = [[1, 1, 'Q', 'A', 'B', 'C', 'D', 'A', 1.0]];
        const buffer = await buildWorkbookBuffer(ambiguousHeaders, rows);

        await expect(
          service.previewImport(mockSchoolId, mockAssessmentId, buffer, teacherUser),
        ).rejects.toThrow(/Ambiguous column mapping: multiple columns map to required field 'Serial Number'/i);
      });

      it('skips trailing blank/formatted rows and calculates totalRows accurately', async () => {
        const rows: (string | number)[][] = [
          [1, 'Question 1', 'A', 'B', 'C', 'D', 'A', 2.0, ''],
          [2, 'Question 2', 'A', 'B', 'C', 'D', 'B', 3.0, ''],
          ['', '', '', '', '', '', '', '', ''], // empty row 1
          ['', '', '', '', '', '', '', '', ''], // empty row 2
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.validCount).toBe(2);
        expect(result.invalidCount).toBe(0);
        expect(result.totalRows).toBe(2); // exactly 2 evaluated non-empty rows, not 4
      });

      it('does not treat partially populated row as blank and reports required missing cells', async () => {
        const rows = [
          [1, '', '', '', '', '', '', '', ''], // partial row: only serial number
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.validCount).toBe(0);
        expect(result.invalidCount).toBe(1);
        expect(result.invalidRows[0].errors).toContain('Question text must be between 1 and 5000 characters');
        expect(result.invalidRows[0].errors).toContain('Option A is required and cannot be empty');
        expect(result.invalidRows[0].errors).toContain('Marks is required and cannot be empty');
      });

      it('flags row with missing marks without assuming implicit default', async () => {
        const rows = [
          [1, 'Question text', 'A', 'B', 'C', 'D', 'A', '', ''],
        ];
        const buffer = await buildWorkbookBuffer(standardHeaders, rows);

        const result = await service.previewImport(
          mockSchoolId,
          mockAssessmentId,
          buffer,
          teacherUser,
        );

        expect(result.invalidRows[0].errors).toContain('Marks is required and cannot be empty');
      });
    });

    describe('confirmImport', () => {
      const confirmDto = {
        questions: [
          {
            orderIndex: 1,
            questionText: 'What is 2+2?',
            options: ['1', '2', '3', '4'],
            correctOption: 3,
            marks: 2.5,
          },
          {
            orderIndex: 2,
            questionText: 'What is 3+3?',
            options: ['5', '6', '7', '8'],
            correctOption: 1,
            marks: 2.5,
          },
        ],
      };

      it('successfully calls createQuestionsBulkAtomic and returns confirm response', async () => {
        examRepoMock.createQuestionsBulkAtomic.mockResolvedValue({
          importedCount: 2,
          importedMarks: 5.0,
          totalQuestions: 2,
          currentAllocatedMarks: 5.0,
          remainingMarks: 45.0,
          isReconciled: false,
        });

        const result = await service.confirmImport(
          mockSchoolId,
          mockAssessmentId,
          confirmDto,
          teacherUser,
        );

        expect(result.success).toBe(true);
        expect(result.importedCount).toBe(2);
        expect(examRepoMock.createQuestionsBulkAtomic).toHaveBeenCalledWith(
          mockSchoolId,
          mockAssessmentId,
          expect.arrayContaining([
            expect.objectContaining({ questionText: 'What is 2+2?', marks: 2.5 }),
            expect.objectContaining({ questionText: 'What is 3+3?', marks: 2.5 }),
          ]),
          mockTeacherId,
        );
      });

      it('rejects confirmation if submitted questions contain duplicate orderIndex', async () => {
        const invalidDto = {
          questions: [
            { orderIndex: 1, questionText: 'Q1', options: ['A', 'B', 'C', 'D'], correctOption: 0, marks: 1.0 },
            { orderIndex: 1, questionText: 'Q2', options: ['A', 'B', 'C', 'D'], correctOption: 0, marks: 1.0 },
          ],
        };

        await expect(
          service.confirmImport(mockSchoolId, mockAssessmentId, invalidDto, teacherUser),
        ).rejects.toThrow('Submitted questions contain duplicate serial/orderIndex values');
      });

      it('server-side re-validates question options and rejects duplicate choices', async () => {
        const invalidDto = {
          questions: [
            { orderIndex: 1, questionText: 'Q1', options: ['Same', 'Same', 'C', 'D'], correctOption: 0, marks: 1.0 },
          ],
        };

        await expect(
          service.confirmImport(mockSchoolId, mockAssessmentId, invalidDto, teacherUser),
        ).rejects.toThrow(/duplicate choices are forbidden/i);
      });

      it('throws ForbiddenException if teacher attempts to confirm import on another teacher draft', async () => {
        prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher-uuid' });

        await expect(
          service.confirmImport(mockSchoolId, mockAssessmentId, confirmDto, otherTeacherUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('throws BadRequestException if assessment is not in DRAFT status', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });

        await expect(
          service.confirmImport(mockSchoolId, mockAssessmentId, confirmDto, teacherUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('rethrows database transaction error when atomic bulk insert fails', async () => {
        examRepoMock.createQuestionsBulkAtomic.mockRejectedValue(
          new BadRequestException('Importing 2 questions would allocate 55.00 marks, exceeding assessment total of 50.00 marks'),
        );

        await expect(
          service.confirmImport(mockSchoolId, mockAssessmentId, confirmDto, teacherUser),
        ).rejects.toThrow(/exceeding assessment total/);
      });
    });
  });

  describe('Question Image Operations', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'circuit-diagram.png',
      encoding: '7bit',
      mimetype: 'image/png',
      buffer: Buffer.from('fake-png-content'),
      size: 16,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    const mockStored = {
      storagePath: 'examination-question-images/school/assessment/q_123.png',
      checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSize: 16,
      mimeType: 'image/png',
      fileName: 'circuit-diagram.png',
      width: 100,
      height: 100,
    };

    const mockArtifact = {
      id: 'img-uuid-001',
      schoolId: mockSchoolId,
      assessmentId: mockAssessmentId,
      questionId: mockQuestionId,
      fileName: 'circuit-diagram.png',
      fileSize: 16,
      mimeType: 'image/png',
      storagePath: 'examination-question-images/school/assessment/q_123.png',
      checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: 'ATTACHED',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);
      prismaMock.teacher.findFirst.mockResolvedValue({ id: mockTeacherId });
      examRepoMock.findQuestionById.mockResolvedValue({
        id: mockQuestionId,
        schoolId: mockSchoolId,
        assessmentId: mockAssessmentId,
        questionText: 'Test question',
      });
    });

    describe('uploadQuestionImage', () => {
      it('throws BadRequestException if file is missing or has no buffer', async () => {
        await expect(
          service.uploadQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, null as any, teacherUser),
        ).rejects.toThrow('Image file is required');
      });

      it('throws BadRequestException if assessment is not in DRAFT status', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });

        await expect(
          service.uploadQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, mockFile, teacherUser),
        ).rejects.toThrow('Only DRAFT assessments may be modified');
      });

      it('throws ForbiddenException if teacher is not the author of the draft assessment', async () => {
        prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher' });

        await expect(
          service.uploadQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, mockFile, otherTeacherUser),
        ).rejects.toThrow('You may only manage questions for assessments you authored');
      });

      it('throws NotFoundException if question does not exist in assessment', async () => {
        examRepoMock.findQuestionById.mockResolvedValue(null);

        await expect(
          service.uploadQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, mockFile, teacherUser),
        ).rejects.toThrow('Question not found in this assessment');
      });

      it('stores file, upserts artifact atomically, and returns public DTO without storagePath', async () => {
        storageServiceMock.storeQuestionImage.mockResolvedValue(mockStored);
        examRepoMock.upsertQuestionImageAtomic.mockResolvedValue({
          artifact: mockArtifact,
          oldStoragePath: null,
        });

        const result = await service.uploadQuestionImage(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          mockFile,
          teacherUser,
        );

        expect(result.id).toBe('img-uuid-001');
        expect(result.fileName).toBe('circuit-diagram.png');
        expect(result.status).toBe('ATTACHED');
        expect((result as any).storagePath).toBeUndefined();
        expect(storageServiceMock.storeQuestionImage).toHaveBeenCalledWith(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          mockFile.buffer,
          mockFile.originalname,
        );
      });

      it('cleans up newly stored file if database upsert fails', async () => {
        storageServiceMock.storeQuestionImage.mockResolvedValue(mockStored);
        examRepoMock.upsertQuestionImageAtomic.mockRejectedValue(new Error('DB transaction deadlock'));
        examRepoMock.countImageReferencesByStoragePath.mockResolvedValue(0);

        await expect(
          service.uploadQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, mockFile, teacherUser),
        ).rejects.toThrow('DB transaction deadlock');

        expect(storageServiceMock.deleteFileSafe).toHaveBeenCalledWith(mockStored.storagePath);
      });

      it('cleans up replaced old file if oldStoragePath exists and has 0 remaining references', async () => {
        storageServiceMock.storeQuestionImage.mockResolvedValue(mockStored);
        const oldPath = 'examination-question-images/school/assessment/old_q.png';
        examRepoMock.upsertQuestionImageAtomic.mockResolvedValue({
          artifact: mockArtifact,
          oldStoragePath: oldPath,
        });
        examRepoMock.countImageReferencesByStoragePath.mockResolvedValue(0);

        await service.uploadQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, mockFile, teacherUser);

        expect(storageServiceMock.deleteFileSafe).toHaveBeenCalledWith(oldPath);
        expect(storageServiceMock.deleteFileSafe).not.toHaveBeenCalledWith(mockStored.storagePath);
      });

      it('skips unlinking old file when another artifact still references it', async () => {
        storageServiceMock.storeQuestionImage.mockResolvedValue(mockStored);
        const oldPath = 'examination-question-images/school/assessment/old_q.png';
        examRepoMock.upsertQuestionImageAtomic.mockResolvedValue({
          artifact: mockArtifact,
          oldStoragePath: oldPath,
        });
        examRepoMock.countImageReferencesByStoragePath.mockResolvedValue(1);

        await service.uploadQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, mockFile, teacherUser);

        expect(storageServiceMock.deleteFileSafe).not.toHaveBeenCalled();
      });

      it('does not trigger unlinking of old file when reference-count check throws', async () => {
        storageServiceMock.storeQuestionImage.mockResolvedValue(mockStored);
        const oldPath = 'examination-question-images/school/assessment/old_q.png';
        examRepoMock.upsertQuestionImageAtomic.mockResolvedValue({
          artifact: mockArtifact,
          oldStoragePath: oldPath,
        });
        examRepoMock.countImageReferencesByStoragePath.mockRejectedValue(new Error('DB read error'));

        const res = await service.uploadQuestionImage(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          mockFile,
          teacherUser,
        );

        expect(res.id).toBe(mockArtifact.id);
        expect(storageServiceMock.deleteFileSafe).not.toHaveBeenCalled();
      });
    });

    describe('getQuestionImage', () => {
      it('throws NotFoundException if question does not exist', async () => {
        examRepoMock.findQuestionById.mockResolvedValue(null);

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, teacherUser),
        ).rejects.toThrow('Question not found in this assessment');
      });

      it('throws NotFoundException if question has no image artifact', async () => {
        examRepoMock.findQuestionImage.mockResolvedValue(null);

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, teacherUser),
        ).rejects.toThrow('Question has no attached image');
      });

      it('throws NotFoundException when student requests image on draft assessment', async () => {
        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('throws ForbiddenException when student profile is inactive or not found', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });
        prismaMock.student.findFirst.mockResolvedValue(null);

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow('Active student profile not found for this account');
      });

      it('throws ForbiddenException when student has wrong grade or academic year and no attempt', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
          gradeId: 'other-grade-id',
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow(
          'You must start an authorized assessment attempt before accessing question images.',
        );
      });

      it('throws ForbiddenException when student has wrong section and no attempt', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
          sectionId: 'section-A',
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: 'section-B',
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow(
          'You must start an authorized assessment attempt before accessing question images.',
        );
      });

      it('rejects student view image when student has no attempt even on matching cohort', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          sectionId: null, // Grade-wide
          status: AssessmentStatus.PUBLISHED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow(
          'You must start an authorized assessment attempt before accessing question images.',
        );
        expect(storageServiceMock.readQuestionImage).not.toHaveBeenCalled();
      });

      it('rejects unattempted student even when assessment results are released', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          sectionId: null,
          status: AssessmentStatus.RESULTS_RELEASED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow(
          'You must start an authorized assessment attempt before accessing question images.',
        );
        expect(storageServiceMock.readQuestionImage).not.toHaveBeenCalled();
      });

      it('allows student to view image when active IN_PROGRESS attempt exists before deadline', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          sectionId: 'section-A',
          status: AssessmentStatus.PUBLISHED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: 'section-B',
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-1',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'IN_PROGRESS',
          deadlineAt: new Date(Date.now() + 60000), // 1 minute in the future
        });
        examRepoMock.findQuestionImage.mockResolvedValue(mockArtifact);
        storageServiceMock.readQuestionImage.mockResolvedValue(Buffer.from('binary-image'));

        const res = await service.getQuestionImage(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          studentUser,
        );

        expect(res.mimeType).toBe('image/png');
        expect(res.fileName).toBe('circuit-diagram.png');
      });

      it('allows student to view image when active IN_PROGRESS attempt deadline is exactly now (inclusive)', async () => {
        const exactNow = new Date('2026-10-31T12:00:00.000Z');
        jest.useFakeTimers();
        jest.setSystemTime(exactNow);

        try {
          examRepoMock.findAssessmentById.mockResolvedValue({
            ...mockDraftAssessment,
            status: AssessmentStatus.PUBLISHED,
          });
          prismaMock.student.findFirst.mockResolvedValue({
            id: 'student-profile-1',
            schoolId: mockSchoolId,
            userId: studentUser.id,
            academicYearId: mockAYId,
            gradeId: mockGradeId,
            sectionId: mockSectionId,
            status: 'ACTIVE',
          });
          examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
            id: 'attempt-1',
            studentId: 'student-profile-1',
            assessmentId: mockAssessmentId,
            schoolId: mockSchoolId,
            status: 'IN_PROGRESS',
            deadlineAt: exactNow, // exact boundary
          });
          examRepoMock.findQuestionImage.mockResolvedValue(mockArtifact);
          storageServiceMock.readQuestionImage.mockResolvedValue(Buffer.from('binary-image'));

          const res = await service.getQuestionImage(
            mockSchoolId,
            mockAssessmentId,
            mockQuestionId,
            studentUser,
          );

          expect(res.mimeType).toBe('image/png');
        } finally {
          jest.useRealTimers();
        }
      });

      it('rejects student viewing image when IN_PROGRESS attempt has expired past deadline', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-1',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'IN_PROGRESS',
          deadlineAt: new Date(Date.now() - 5000), // 5 seconds ago
        });

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow('Assessment attempt has expired');
        expect(storageServiceMock.readQuestionImage).not.toHaveBeenCalled();
      });

      it('allows existing IN_PROGRESS attempt on CLOSED assessment before deadline (soft closure)', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.CLOSED, // soft closure
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-1',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'IN_PROGRESS',
          deadlineAt: new Date(Date.now() + 120000), // 2 mins remaining
        });
        examRepoMock.findQuestionImage.mockResolvedValue(mockArtifact);
        storageServiceMock.readQuestionImage.mockResolvedValue(Buffer.from('binary-image'));

        const res = await service.getQuestionImage(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          studentUser,
        );

        expect(res.mimeType).toBe('image/png');
      });

      it('rejects SUBMITTED attempt before results are released', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-1',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'SUBMITTED',
          deadlineAt: new Date(Date.now() + 60000),
        });

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow('Question images cannot be accessed after submission until results are released');
      });

      it('allows SUBMITTED attempt after results are released', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.RESULTS_RELEASED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-1',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'SUBMITTED',
          deadlineAt: new Date(Date.now() - 60000),
        });
        examRepoMock.findQuestionImage.mockResolvedValue(mockArtifact);
        storageServiceMock.readQuestionImage.mockResolvedValue(Buffer.from('binary-image'));

        const res = await service.getQuestionImage(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          studentUser,
        );

        expect(res.mimeType).toBe('image/png');
      });

      it('rejects TIMED_OUT attempt before results are released', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.CLOSED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-1',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'TIMED_OUT',
          deadlineAt: new Date(Date.now() - 60000),
        });

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow('Question images cannot be accessed after submission until results are released');
      });

      it('allows TIMED_OUT attempt after results are released', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.RESULTS_RELEASED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-1',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'TIMED_OUT',
          deadlineAt: new Date(Date.now() - 60000),
        });
        examRepoMock.findQuestionImage.mockResolvedValue(mockArtifact);
        storageServiceMock.readQuestionImage.mockResolvedValue(Buffer.from('binary-image'));

        const res = await service.getQuestionImage(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          studentUser,
        );

        expect(res.mimeType).toBe('image/png');
      });

      it('rejects attempt belonging to another student', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-other',
          studentId: 'different-student-profile',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'IN_PROGRESS',
          deadlineAt: new Date(Date.now() + 60000),
        });

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow('Attempt does not belong to the authenticated student');
      });

      it('rejects attempt belonging to another school or assessment binding mismatch', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-diff-school',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: 'foreign-school-999',
          status: 'IN_PROGRESS',
          deadlineAt: new Date(Date.now() + 60000),
        });

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow('Attempt does not belong to the authenticated student');
      });

      it('rejects question belonging to another assessment (question not found in assessment)', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });
        prismaMock.student.findFirst.mockResolvedValue({
          id: 'student-profile-1',
          schoolId: mockSchoolId,
          userId: studentUser.id,
          academicYearId: mockAYId,
          gradeId: mockGradeId,
          sectionId: mockSectionId,
          status: 'ACTIVE',
        });
        examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
          id: 'attempt-1',
          studentId: 'student-profile-1',
          assessmentId: mockAssessmentId,
          schoolId: mockSchoolId,
          status: 'IN_PROGRESS',
          deadlineAt: new Date(Date.now() + 60000),
        });
        // Question not found in this assessment
        examRepoMock.findQuestionById.mockResolvedValue(null);

        await expect(
          service.getQuestionImage(mockSchoolId, mockAssessmentId, 'foreign-question-id', studentUser),
        ).rejects.toThrow('Question not found in this assessment');
      });

      it('throws NotFoundException when student attempts cross-tenant assessment image access', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue(null);

        await expect(
          service.getQuestionImage('other-school-id', mockAssessmentId, mockQuestionId, studentUser),
        ).rejects.toThrow('Assessment not found in this school');
      });

      it('allows author teacher to view image on draft assessment', async () => {
        examRepoMock.findQuestionImage.mockResolvedValue(mockArtifact);
        storageServiceMock.readQuestionImage.mockResolvedValue(Buffer.from('binary-image'));

        const res = await service.getQuestionImage(
          mockSchoolId,
          mockAssessmentId,
          mockQuestionId,
          teacherUser,
        );

        expect(res.mimeType).toBe('image/png');
      });

      describe('FINDING-04 Security Tests (Platform Super Admin & School Admin Denial)', () => {
        it('rejects Platform Super Admin listing questions with 403 Forbidden', async () => {
          examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);

          await expect(
            service.listQuestions(mockSchoolId, mockAssessmentId, platformAdminUser),
          ).rejects.toThrow('Platform Super Admin is restricted to aggregate examination monitoring and cannot access question banks.');
        });

        it('rejects Platform Super Admin getting question by id with 403 Forbidden', async () => {
          examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);

          await expect(
            service.getQuestionById(mockSchoolId, mockAssessmentId, mockQuestionId, platformAdminUser),
          ).rejects.toThrow('Platform Super Admin is restricted to aggregate examination monitoring and cannot access question banks.');
        });

        it('rejects Platform Super Admin getting question image with 403 Forbidden', async () => {
          examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);

          await expect(
            service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, platformAdminUser),
          ).rejects.toThrow('Platform Super Admin is restricted to aggregate examination monitoring and cannot access question banks.');
        });

        it('rejects School Admin listing questions with 403 Forbidden', async () => {
          examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);

          await expect(
            service.listQuestions(mockSchoolId, mockAssessmentId, adminUser),
          ).rejects.toThrow('Access denied: School Admin is restricted to examination monitoring and cannot access question banks or answer keys.');
        });

        it('rejects School Admin getting question by id with 403 Forbidden', async () => {
          examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);

          await expect(
            service.getQuestionById(mockSchoolId, mockAssessmentId, mockQuestionId, adminUser),
          ).rejects.toThrow('Access denied: School Admin is restricted to examination monitoring and cannot access question banks or answer keys.');
        });

        it('rejects School Admin getting question image with 403 Forbidden', async () => {
          examRepoMock.findAssessmentById.mockResolvedValue(mockDraftAssessment);

          await expect(
            service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, adminUser),
          ).rejects.toThrow('Access denied: School Admin is restricted to examination monitoring and cannot access question banks or answer keys.');
        });

        it('rejects non-author teacher accessing questions on CLOSED or RESULTS_RELEASED assessment', async () => {
          examRepoMock.findAssessmentById.mockResolvedValue({
            ...mockDraftAssessment,
            status: AssessmentStatus.CLOSED,
            teacherId: 'author-teacher-1',
          });
          prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher', status: TeacherStatus.ACTIVE });

          await expect(
            service.listQuestions(mockSchoolId, mockAssessmentId, otherTeacherUser),
          ).rejects.toThrow('Access denied: You may only view question banks and answer keys for assessments you authored.');
        });

        it('rejects non-author teacher getting question image on published assessment', async () => {
          examRepoMock.findAssessmentById.mockResolvedValue({
            ...mockDraftAssessment,
            status: AssessmentStatus.PUBLISHED,
            teacherId: 'author-teacher-1',
          });
          prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher', status: TeacherStatus.ACTIVE });

          await expect(
            service.getQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, otherTeacherUser),
          ).rejects.toThrow('Access denied: You may only view question banks and answer keys for assessments you authored.');
        });
      });
    });

    describe('deleteQuestionImage', () => {
      it('throws BadRequestException if assessment is not in DRAFT status', async () => {
        examRepoMock.findAssessmentById.mockResolvedValue({
          ...mockDraftAssessment,
          status: AssessmentStatus.PUBLISHED,
        });

        await expect(
          service.deleteQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, teacherUser),
        ).rejects.toThrow('Only DRAFT assessments may be modified');
      });

      it('throws ForbiddenException if teacher is not the author of the draft assessment', async () => {
        prismaMock.teacher.findFirst.mockResolvedValue({ id: 'different-teacher' });

        await expect(
          service.deleteQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, otherTeacherUser),
        ).rejects.toThrow('You may only manage questions for assessments you authored');
      });

      it('successfully deletes image and unlinks file if no remaining DB references', async () => {
        const pathToDelete = 'examination-question-images/school/assessment/img.png';
        examRepoMock.deleteQuestionImageAtomic.mockResolvedValue({
          deleted: true,
          storagePath: pathToDelete,
        });
        examRepoMock.countImageReferencesByStoragePath.mockResolvedValue(0);

        const res = await service.deleteQuestionImage(mockSchoolId, mockAssessmentId, mockQuestionId, teacherUser);

        expect(res.success).toBe(true);
        expect(res.message).toBe('Question image removed successfully');
        expect(storageServiceMock.deleteFileSafe).toHaveBeenCalledWith(pathToDelete);
      });
    });
  });
});
