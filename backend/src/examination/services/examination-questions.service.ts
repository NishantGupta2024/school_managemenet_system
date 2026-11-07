import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { StudentStatus, TeacherStatus, UserRole } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import { ExaminationStorageService } from './examination-storage.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { UpdateQuestionDto } from '../dto/update-question.dto';
import { ConfirmQuestionImportDto } from '../dto/confirm-question-import.dto';
import {
  AssessmentDraftRecord,
  AssessmentQuestionListResponse,
  AssessmentQuestionRecord,
  AssessmentStatus,
  AttemptStatus,
  AuthenticatedUser,
  DuplicateSerialError,
  InvalidImportRow,
  ParsedImportQuestion,
  QuestionImagePublicDto,
  QuestionImportConfirmResponse,
  QuestionImportPreviewResponse,
} from '../types';

@Injectable()
export class ExaminationQuestionsService {
  private readonly logger = new Logger(ExaminationQuestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXAMINATION_REPOSITORY)
    private readonly examRepo: IExaminationRepository,
    private readonly storageService: ExaminationStorageService,
  ) {}

  /**
   * Helper: Resolves parent assessment, asserts tenant scoping, draft status for mutations,
   * and verifies teacher author ownership.
   */
  private async assertAssessmentAccess(
    schoolId: string,
    assessmentId: string,
    user: AuthenticatedUser,
    mustBeDraft = false,
  ): Promise<{ assessment: AssessmentDraftRecord; teacherId?: string }> {
    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (mustBeDraft) {
      if (assessment.status !== AssessmentStatus.DRAFT) {
        throw new BadRequestException(
          `Cannot modify questions: Assessment is in ${assessment.status} status. Only DRAFT assessments may be modified.`,
        );
      }
      if (user.role !== UserRole.TEACHER) {
        throw new ForbiddenException('Only teachers can create or modify questions');
      }
    }

    if (user.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException(
        'Platform Super Admin is restricted to aggregate examination monitoring and cannot access question banks.',
      );
    }

    if (user.role === UserRole.SCHOOL_ADMIN) {
      throw new ForbiddenException(
        'Access denied: School Admin is restricted to examination monitoring and cannot access question banks or answer keys.',
      );
    }

    let teacherId: string | undefined;

    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      if (!teacher) {
        throw new ForbiddenException('Active teacher profile not found for this account');
      }
      teacherId = teacher.id;

      // Author-only question bank policy: Teachers may only access questions for assessments they authored
      if (assessment.teacherId !== teacher.id) {
        if (mustBeDraft) {
          throw new ForbiddenException('You may only manage questions for assessments you authored');
        } else if (assessment.status === AssessmentStatus.DRAFT) {
          // Return 404 to avoid leaking draft existence across teachers
          throw new NotFoundException('Assessment not found in this school');
        } else {
          // For non-draft assessments, strictly forbid access to other teachers
          throw new ForbiddenException('Access denied: You may only view question banks and answer keys for assessments you authored.');
        }
      }
    } else if (user.role === UserRole.STUDENT) {
      if (mustBeDraft) {
        throw new ForbiddenException('Students cannot modify assessments');
      }
      if (assessment.status === AssessmentStatus.DRAFT) {
        throw new NotFoundException('Assessment not found in this school');
      }

      // F-01: Resolve active student profile in this school
      const student = await this.prisma.student.findFirst({
        where: {
          schoolId,
          userId: user.id,
          status: StudentStatus.ACTIVE,
        },
      });
      if (!student) {
        throw new ForbiddenException(
          'Active student profile not found for this account',
        );
      }

      // Check if student holds an authorized existing attempt for this assessment
      const existingAttempt = await this.examRepo.findAttemptByStudentAndAssessment(
        schoolId,
        assessmentId,
        student.id,
      );

      // Strict Attempt Authorization (FINDING-08):
      // A student must have an existing attempt to access question images.
      // Cohort membership alone never authorizes question image retrieval.
      if (!existingAttempt) {
        throw new ForbiddenException(
          'You must start an authorized assessment attempt before accessing question images.',
        );
      }

      // Verify attempt binding to authenticated student, assessment, and school
      if (
        existingAttempt.studentId !== student.id ||
        existingAttempt.assessmentId !== assessment.id ||
        existingAttempt.schoolId !== schoolId
      ) {
        throw new ForbiddenException('Attempt does not belong to the authenticated student');
      }

      const now = new Date();

      if (existingAttempt.status === AttemptStatus.IN_PROGRESS) {
        // Inclusive deadline check: allowed only while currentTime <= deadlineAt
        if (now.getTime() > existingAttempt.deadlineAt.getTime()) {
          throw new ForbiddenException('Assessment attempt has expired');
        }
      } else if (
        existingAttempt.status === AttemptStatus.SUBMITTED ||
        existingAttempt.status === AttemptStatus.TIMED_OUT
      ) {
        // Once submitted or timed out, images are only accessible if assessment results are released
        if (assessment.status !== AssessmentStatus.RESULTS_RELEASED) {
          throw new ForbiddenException(
            'Question images cannot be accessed after submission until results are released',
          );
        }
      } else {
        throw new ForbiddenException('Invalid attempt state for accessing question images');
      }
    } else {
      throw new ForbiddenException('Access denied: Unauthorized role');
    }

    return { assessment, teacherId };
  }

  /**
   * Helper: Validates question payload bounds, 4 unique options, correct option index, and decimal marks.
   */
  private validateQuestionPayload(
    options: string[],
    correctOption: number,
    marks: number,
    questionText: string,
  ): void {
    const trimmedText = questionText?.trim();
    if (!trimmedText || trimmedText.length < 1 || trimmedText.length > 5000) {
      throw new BadRequestException('Question text must be between 1 and 5000 characters');
    }

    if (!Array.isArray(options) || options.length !== 4) {
      throw new BadRequestException('Options must contain exactly 4 choices');
    }

    const trimmedOptions = options.map((opt, idx) => {
      if (typeof opt !== 'string' || !opt.trim()) {
        throw new BadRequestException(`Option ${idx + 1} must be a non-empty string`);
      }
      if (opt.length > 1000) {
        throw new BadRequestException(`Option ${idx + 1} cannot exceed 1000 characters`);
      }
      return opt.trim();
    });

    // Check for duplicate options within the question
    const lowerOptions = trimmedOptions.map((o) => o.toLowerCase());
    if (new Set(lowerOptions).size !== 4) {
      throw new BadRequestException(
        'Options must contain exactly 4 distinct choices (duplicate choices are forbidden)',
      );
    }

    if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption > 3) {
      throw new BadRequestException('Correct option must be an integer index between 0 and 3');
    }

    if (typeof marks !== 'number' || isNaN(marks) || marks <= 0 || marks > 500) {
      throw new BadRequestException('Marks must be greater than 0.00 and at most 500.00');
    }

    const decimalPlaces = (marks.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      throw new BadRequestException('Marks cannot have more than 2 decimal places');
    }
  }

  /**
   * Helper: Verifies that sectionId belongs to this assessment and school.
   */
  private async validateSectionBelongsToAssessment(
    schoolId: string,
    assessmentId: string,
    sectionId?: string | null,
  ): Promise<void> {
    if (sectionId) {
      const section = await this.examRepo.findAssessmentSectionById(
        schoolId,
        assessmentId,
        sectionId,
      );
      if (!section) {
        throw new BadRequestException(
          'Assessment section not found or does not belong to this assessment',
        );
      }
    }
  }

  /**
   * POST /api/v1/examination/assessments/:assessmentId/questions
   * Add a single MCQ question to a draft assessment atomically.
   */
  async createQuestion(
    schoolId: string,
    assessmentId: string,
    dto: CreateQuestionDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentQuestionRecord> {
    // 1. Assert draft status and caller authorization
    const { teacherId } = await this.assertAssessmentAccess(
      schoolId,
      assessmentId,
      user,
      true,
    );

    // 2. Validate payload bounds & unique options
    this.validateQuestionPayload(
      dto.options,
      dto.correctOption,
      dto.marks,
      dto.questionText,
    );

    // 3. Validate section if specified
    await this.validateSectionBelongsToAssessment(schoolId, assessmentId, dto.sectionId);

    // 4. Atomically create question under parent assessment transaction lock
    return this.examRepo.createQuestion(
      {
        schoolId,
        assessmentId,
        sectionId: dto.sectionId ?? null,
        orderIndex: dto.orderIndex,
        questionText: dto.questionText.trim(),
        options: dto.options.map((o) => o.trim()),
        correctOption: dto.correctOption,
        marks: dto.marks,
        explanation: dto.explanation?.trim() ?? null,
      },
      teacherId,
    );
  }

  /**
   * GET /api/v1/examination/assessments/:assessmentId/questions
   * List all questions in an assessment with marks reconciliation summary.
   */
  async listQuestions(
    schoolId: string,
    assessmentId: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentQuestionListResponse> {
    const { assessment } = await this.assertAssessmentAccess(
      schoolId,
      assessmentId,
      user,
      false,
    );

    const questions = await this.examRepo.findQuestionsByAssessmentId(
      schoolId,
      assessmentId,
    );

    const targetTotalMarks = Number(assessment.totalMarks);
    const currentAllocatedMarks = Math.round(
      questions.reduce((sum, q) => sum + Number(q.marks), 0) * 100,
    ) / 100;
    const remainingMarks = Math.round((targetTotalMarks - currentAllocatedMarks) * 100) / 100;
    const totalQuestions = questions.length;
    const isReconciled = currentAllocatedMarks === targetTotalMarks;

    return {
      summary: {
        targetTotalMarks,
        currentAllocatedMarks,
        remainingMarks,
        totalQuestions,
        isReconciled,
      },
      questions,
    };
  }

  /**
   * GET /api/v1/examination/assessments/:assessmentId/questions/:id
   * Retrieve a single question by ID.
   */
  async getQuestionById(
    schoolId: string,
    assessmentId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentQuestionRecord> {
    await this.assertAssessmentAccess(schoolId, assessmentId, user, false);

    const question = await this.examRepo.findQuestionById(schoolId, assessmentId, id);
    if (!question) {
      throw new NotFoundException('Question not found in this assessment');
    }

    return question;
  }

  /**
   * PATCH /api/v1/examination/assessments/:assessmentId/questions/:id
   * Update a question within a draft assessment.
   */
  async updateQuestion(
    schoolId: string,
    assessmentId: string,
    id: string,
    dto: UpdateQuestionDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentQuestionRecord> {
    const { assessment, teacherId } = await this.assertAssessmentAccess(
      schoolId,
      assessmentId,
      user,
      true,
    );

    const existing = await this.examRepo.findQuestionById(schoolId, assessmentId, id);
    if (!existing) {
      throw new NotFoundException('Question not found in this assessment');
    }

    // Compute effective values
    const effectiveQuestionText =
      dto.questionText !== undefined ? dto.questionText : existing.questionText;
    const effectiveOptions =
      dto.options !== undefined ? dto.options : existing.options;
    const effectiveCorrectOption =
      dto.correctOption !== undefined ? dto.correctOption : existing.correctOption;
    const effectiveMarks =
      dto.marks !== undefined ? dto.marks : existing.marks;
    const effectiveOrderIndex =
      dto.orderIndex !== undefined ? dto.orderIndex : existing.orderIndex;
    const effectiveSectionId =
      dto.sectionId !== undefined ? dto.sectionId : existing.sectionId;
    const effectiveExplanation =
      dto.explanation !== undefined ? dto.explanation : existing.explanation;

    // Validate the complete effective question
    this.validateQuestionPayload(
      effectiveOptions,
      effectiveCorrectOption,
      effectiveMarks,
      effectiveQuestionText,
    );

    await this.validateSectionBelongsToAssessment(
      schoolId,
      assessmentId,
      effectiveSectionId,
    );

    // Reconcile marks if marks changed
    const existingQuestions = await this.examRepo.findQuestionsByAssessmentId(
      schoolId,
      assessmentId,
    );
    const otherQuestionsMarks = existingQuestions
      .filter((q) => q.id !== id)
      .reduce((sum, q) => sum + Number(q.marks), 0);
    const targetTotalMarks = Number(assessment.totalMarks);
    const newAllocatedMarks = Math.round((otherQuestionsMarks + Number(effectiveMarks)) * 100) / 100;

    if (newAllocatedMarks > targetTotalMarks) {
      throw new BadRequestException(
        `Updating this question to ${effectiveMarks} marks would allocate ${newAllocatedMarks.toFixed(2)} marks, exceeding the assessment total of ${targetTotalMarks.toFixed(2)} marks`,
      );
    }

    return this.examRepo.updateQuestion(
      schoolId,
      assessmentId,
      id,
      {
        questionText: dto.questionText !== undefined ? dto.questionText.trim() : undefined,
        options: dto.options !== undefined ? dto.options.map((o) => o.trim()) : undefined,
        correctOption: dto.correctOption,
        marks: dto.marks,
        orderIndex: dto.orderIndex,
        sectionId: dto.sectionId,
        explanation: dto.explanation !== undefined ? dto.explanation?.trim() ?? null : undefined,
      },
      teacherId,
    );
  }

  /**
   * DELETE /api/v1/examination/assessments/:assessmentId/questions/:id
   * Delete a question from a draft assessment.
   */
  async deleteQuestion(
    schoolId: string,
    assessmentId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const { teacherId } = await this.assertAssessmentAccess(
      schoolId,
      assessmentId,
      user,
      true,
    );

    const existing = await this.examRepo.findQuestionById(schoolId, assessmentId, id);
    if (!existing) {
      throw new NotFoundException('Question not found in this assessment');
    }

    // Capture any attached image artifact before deleting the question
    // (PostgreSQL foreign key cascade will delete the question_image_artifacts row)
    let attachedStoragePath: string | null = null;
    try {
      const artifact = await this.examRepo.findQuestionImage(schoolId, assessmentId, id);
      if (artifact) {
        attachedStoragePath = artifact.storagePath;
      }
    } catch (err: any) {
      this.logger.warn(`Could not check image artifact before deleting question ${id}: ${err?.message}`);
    }

    // Delete question in database atomically under parent assessment lock (cascades artifact row)
    await this.examRepo.deleteQuestion(schoolId, assessmentId, id, teacherId);

    // If an image was attached, clean up physical file only after successful DB deletion
    if (attachedStoragePath) {
      try {
        const remainingRefs = await this.examRepo.countImageReferencesByStoragePath(attachedStoragePath);
        if (remainingRefs === 0) {
          await this.storageService.deleteFileSafe(attachedStoragePath);
        }
      } catch (cleanupErr: any) {
        // Safe diagnostic: never fail or rollback committed question deletion
        this.logger.warn(
          `Failed cleaning up orphaned question image ${attachedStoragePath} after question ${id} was deleted: ${cleanupErr?.message}`,
        );
      }
    }

    return { success: true, message: 'Question deleted successfully' };
  }

  /**
   * Helper: Normalize column header strings.
   */
  private normalizeKey(header: string): string {
    if (!header) return '';
    return header
      .toString()
      .replace(/\(.*?\)/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Helper: Robust text extraction from an Excel cell.
   * Avoids permissive string coercion (e.g. '[object Object]', Dates, formula errors).
   */
  private getCellText(cell: ExcelJS.Cell): string {
    if (cell.value === null || cell.value === undefined) return '';

    // Primitives
    if (typeof cell.value === 'string') {
      return cell.value.trim();
    }
    if (typeof cell.value === 'number') {
      return cell.value.toString().trim();
    }
    if (typeof cell.value === 'boolean') {
      return cell.value ? 'true' : 'false';
    }

    // Objects
    if (typeof cell.value === 'object') {
      // Disallow Date objects
      if (cell.value instanceof Date) {
        return '';
      }
      // Formula cell
      if ('result' in cell.value) {
        const res = (cell.value as any).result;
        if (res === null || res === undefined) return '';
        if (typeof res === 'object') return ''; // e.g. formula error object like { error: '#VALUE!' }
        return res.toString().trim();
      }
      // RichText
      if ('richText' in cell.value && Array.isArray((cell.value as any).richText)) {
        return (cell.value as any).richText
          .map((t: any) => (t && typeof t.text === 'string' ? t.text : ''))
          .join('')
          .trim();
      }
      // Hyperlink / Text cell
      if ('text' in cell.value && typeof (cell.value as any).text === 'string') {
        return (cell.value as any).text.trim();
      }
      // Any other unsupported object
      return '';
    }

    return '';
  }

  /**
   * POST /api/v1/examination/assessments/:assessmentId/questions/import/preview
   * Parse uploaded Excel spreadsheet, validate rows, and calculate marks reconciliation preview.
   * Does NOT mutate the database.
   */
  async previewImport(
    schoolId: string,
    assessmentId: string,
    fileBuffer: Buffer,
    user: AuthenticatedUser,
  ): Promise<QuestionImportPreviewResponse> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException('File exceeds maximum limit of 5 MB');
    }

    // Assert assessment access and draft status
    const { assessment, teacherId } = await this.assertAssessmentAccess(
      schoolId,
      assessmentId,
      user,
      true,
    );

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as any);
    } catch {
      throw new BadRequestException(
        'Failed to parse Excel file. Please ensure it is a valid .xlsx document',
      );
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new BadRequestException('Spreadsheet contains no data rows to import');
    }

    // Map Header Row and verify no duplicate or ambiguous column headers
    const headerRow = worksheet.getRow(1);
    const colMap = new Map<string, number>();
    const duplicateHeaderErrors: string[] = [];

    headerRow.eachCell((cell, colNumber) => {
      const rawText = cell.text || (typeof cell.value === 'string' ? cell.value : cell.value?.toString() || '');
      const normalized = this.normalizeKey(rawText);
      if (normalized) {
        if (colMap.has(normalized)) {
          duplicateHeaderErrors.push(
            `Duplicate column header '${rawText}' at column ${colNumber} (already defined at column ${colMap.get(normalized)})`,
          );
        } else {
          colMap.set(normalized, colNumber);
        }
      }
    });

    if (duplicateHeaderErrors.length > 0) {
      throw new BadRequestException(
        `Duplicate column headers detected: ${duplicateHeaderErrors.join('; ')}`,
      );
    }

    const getHeaderCol = (aliases: string[], fieldName: string): number | undefined => {
      const matchingCols = aliases
        .map((a) => ({ alias: a, col: colMap.get(a) }))
        .filter((x): x is { alias: string; col: number } => x.col !== undefined);

      if (matchingCols.length > 1) {
        const colList = matchingCols.map((m) => `column ${m.col} ('${m.alias}')`).join(', ');
        throw new BadRequestException(
          `Ambiguous column mapping: multiple columns map to required field '${fieldName}': ${colList}`,
        );
      }
      return matchingCols.length === 1 ? matchingCols[0].col : undefined;
    };

    const colSerial = getHeaderCol(['serialnumber', 'serialno', 'slno', 'sno', 'orderindex'], 'Serial Number');
    const colQuestion = getHeaderCol(['question', 'questiontext'], 'Question');
    const colOptA = getHeaderCol(['optiona'], 'Option A');
    const colOptB = getHeaderCol(['optionb'], 'Option B');
    const colOptC = getHeaderCol(['optionc'], 'Option C');
    const colOptD = getHeaderCol(['optiond'], 'Option D');
    const colCorrect = getHeaderCol(['correctoption', 'correctanswer', 'answer'], 'Correct Option');
    const colMarks = getHeaderCol(['marks', 'mark'], 'Marks');
    const colExplanation = getHeaderCol(['explanation', 'rationale'], 'Explanation');

    const missingHeaders: string[] = [];
    if (!colSerial) missingHeaders.push('Serial Number');
    if (!colQuestion) missingHeaders.push('Question');
    if (!colOptA) missingHeaders.push('Option A');
    if (!colOptB) missingHeaders.push('Option B');
    if (!colOptC) missingHeaders.push('Option C');
    if (!colOptD) missingHeaders.push('Option D');
    if (!colCorrect) missingHeaders.push('Correct Option');
    if (!colMarks) missingHeaders.push('Marks');

    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Missing required column headers: ${missingHeaders.join(', ')}. Required headers: Serial Number, Question, Option A, Option B, Option C, Option D, Correct Option, Marks`,
      );
    }

    const rawCandidates: {
      rowNumber: number;
      serialNumber: number;
      questionText: string;
      options: string[];
      correctOption: number;
      marks: number;
      explanation: string | null;
    }[] = [];
    const invalidRows: InvalidImportRow[] = [];
    let nonEmptyRowCount = 0;

    // Parse data rows
    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);

      const rawSerial = this.getCellText(row.getCell(colSerial!));
      const rawQuestion = this.getCellText(row.getCell(colQuestion!));
      const rawOptA = this.getCellText(row.getCell(colOptA!));
      const rawOptB = this.getCellText(row.getCell(colOptB!));
      const rawOptC = this.getCellText(row.getCell(colOptC!));
      const rawOptD = this.getCellText(row.getCell(colOptD!));
      const rawCorrect = this.getCellText(row.getCell(colCorrect!));
      const rawMarks = this.getCellText(row.getCell(colMarks!));
      const rawExplanation = colExplanation ? this.getCellText(row.getCell(colExplanation)) : '';

      // Skip fully empty rows
      if (
        !rawSerial &&
        !rawQuestion &&
        !rawOptA &&
        !rawOptB &&
        !rawOptC &&
        !rawOptD &&
        !rawCorrect &&
        !rawMarks &&
        !rawExplanation
      ) {
        continue;
      }

      nonEmptyRowCount++;

      const rowErrors: string[] = [];

      // Check for sample / placeholder indicator so template sample rows are never accidentally imported as real questions
      const isSampleRow =
        rawSerial.toLowerCase().includes('sample') ||
        rawQuestion.toLowerCase().includes('[sample') ||
        rawQuestion.toLowerCase().includes('(sample') ||
        rawQuestion.toLowerCase().includes('sample question') ||
        rawQuestion.toLowerCase().includes('sample placeholder');

      if (isSampleRow) {
        rowErrors.push(
          'Sample placeholder row detected — please delete or replace this row with your actual question before importing',
        );
      }

      // Validate serial number
      const parsedSerial = parseInt(rawSerial, 10);
      if (isNaN(parsedSerial) || parsedSerial < 1 || parsedSerial.toString() !== rawSerial) {
        rowErrors.push('Serial Number must be a positive integer');
      }

      // Validate question text
      if (!rawQuestion || rawQuestion.length < 1 || rawQuestion.length > 5000) {
        rowErrors.push('Question text must be between 1 and 5000 characters');
      }

      // Validate options (non-empty and <= 1000 characters)
      if (!rawOptA) {
        rowErrors.push('Option A is required and cannot be empty');
      } else if (rawOptA.length > 1000) {
        rowErrors.push('Option A cannot exceed 1000 characters');
      }

      if (!rawOptB) {
        rowErrors.push('Option B is required and cannot be empty');
      } else if (rawOptB.length > 1000) {
        rowErrors.push('Option B cannot exceed 1000 characters');
      }

      if (!rawOptC) {
        rowErrors.push('Option C is required and cannot be empty');
      } else if (rawOptC.length > 1000) {
        rowErrors.push('Option C cannot exceed 1000 characters');
      }

      if (!rawOptD) {
        rowErrors.push('Option D is required and cannot be empty');
      } else if (rawOptD.length > 1000) {
        rowErrors.push('Option D cannot exceed 1000 characters');
      }

      const options = [rawOptA, rawOptB, rawOptC, rawOptD];
      const lowerOptions = options.map((o) => o.toLowerCase());
      if (options.every((o) => o.length > 0) && new Set(lowerOptions).size !== 4) {
        rowErrors.push('Options must contain 4 distinct choices (duplicate choices found)');
      }

      // Validate correct option
      let correctOptionIdx = -1;
      const normalizedCorrect = rawCorrect.toUpperCase();
      if (normalizedCorrect === 'A') correctOptionIdx = 0;
      else if (normalizedCorrect === 'B') correctOptionIdx = 1;
      else if (normalizedCorrect === 'C') correctOptionIdx = 2;
      else if (normalizedCorrect === 'D') correctOptionIdx = 3;
      else {
        rowErrors.push("Correct Option must be 'A', 'B', 'C', or 'D'");
      }

      // Validate marks (positive, max 500.00, at most 2 decimal places, no implicit default)
      if (!rawMarks) {
        rowErrors.push('Marks is required and cannot be empty');
      } else {
        const parsedMarks = parseFloat(rawMarks);
        if (isNaN(parsedMarks) || parsedMarks <= 0 || parsedMarks > 500) {
          rowErrors.push('Marks must be a positive number up to 500.00');
        } else {
          const marksParts = rawMarks.split('.');
          if (marksParts.length > 2 || (marksParts[1] && marksParts[1].length > 2)) {
            rowErrors.push('Marks cannot have more than 2 decimal places');
          }
        }
      }

      // Validate explanation (optional, max 2000 characters)
      if (rawExplanation && rawExplanation.length > 2000) {
        rowErrors.push('Explanation cannot exceed 2000 characters');
      }

      if (rowErrors.length > 0) {
        invalidRows.push({
          rowNumber: r,
          data: {
            serialNumber: rawSerial,
            questionText: rawQuestion,
            optionA: rawOptA,
            optionB: rawOptB,
            optionC: rawOptC,
            optionD: rawOptD,
            correctOption: rawCorrect,
            marks: rawMarks,
          },
          errors: rowErrors,
        });
      } else {
        const parsedMarks = parseFloat(rawMarks);
        rawCandidates.push({
          rowNumber: r,
          serialNumber: parsedSerial,
          questionText: rawQuestion,
          options,
          correctOption: correctOptionIdx,
          marks: parsedMarks,
          explanation: rawExplanation || null,
        });
      }
    }

    if (nonEmptyRowCount === 0) {
      throw new BadRequestException('Spreadsheet contains no data rows to import');
    }

    const MAX_DATA_ROWS = 500;
    if (nonEmptyRowCount > MAX_DATA_ROWS) {
      throw new BadRequestException(
        `File exceeds maximum limit of ${MAX_DATA_ROWS} question rows (found ${nonEmptyRowCount} data rows). Please split into smaller files.`,
      );
    }

    // Check duplicate serial numbers within the uploaded workbook
    const serialToRows = new Map<number, number[]>();
    for (const item of rawCandidates) {
      const rows = serialToRows.get(item.serialNumber) || [];
      rows.push(item.rowNumber);
      serialToRows.set(item.serialNumber, rows);
    }

    const duplicateSerialErrors: DuplicateSerialError[] = [];
    const validQuestions: ParsedImportQuestion[] = [];

    for (const item of rawCandidates) {
      const matchingRows = serialToRows.get(item.serialNumber) || [];
      if (matchingRows.length > 1) {
        if (!duplicateSerialErrors.some((d) => d.serialNumber === item.serialNumber)) {
          duplicateSerialErrors.push({
            serialNumber: item.serialNumber,
            rowNumbers: matchingRows,
            message: `Serial number ${item.serialNumber} appears multiple times in spreadsheet (rows ${matchingRows.join(', ')})`,
          });
        }
        invalidRows.push({
          rowNumber: item.rowNumber,
          data: {
            serialNumber: item.serialNumber,
            questionText: item.questionText,
            optionA: item.options[0],
            optionB: item.options[1],
            optionC: item.options[2],
            optionD: item.options[3],
            correctOption: ['A', 'B', 'C', 'D'][item.correctOption],
            marks: item.marks,
          },
          errors: [`Duplicate serial number ${item.serialNumber} found in rows ${matchingRows.join(', ')}`],
        });
      } else {
        validQuestions.push({
          rowNumber: item.rowNumber,
          serialNumber: item.serialNumber,
          orderIndex: item.serialNumber,
          questionText: item.questionText,
          options: item.options,
          correctOption: item.correctOption,
          marks: item.marks,
          explanation: item.explanation,
        });
      }
    }

    // Check duplicate question text warnings (non-blocking)
    const existingQuestions = await this.examRepo.findQuestionsByAssessmentId(
      schoolId,
      assessmentId,
    );

    const duplicateQuestionWarnings: string[] = [];
    const seenTextsInWorkbook = new Map<string, number>();

    for (const q of validQuestions) {
      const normText = q.questionText.trim().toLowerCase();

      // Check within workbook
      if (seenTextsInWorkbook.has(normText)) {
        const prevRow = seenTextsInWorkbook.get(normText)!;
        duplicateQuestionWarnings.push(
          `Row ${q.rowNumber} has identical question text to Row ${prevRow}: "${q.questionText.slice(0, 80)}"`,
        );
      } else {
        seenTextsInWorkbook.set(normText, q.rowNumber);
      }

      // Check against existing questions in this assessment
      const existsInDb = existingQuestions.some(
        (eq) => eq.questionText.trim().toLowerCase() === normText,
      );
      if (existsInDb) {
        duplicateQuestionWarnings.push(
          `Row ${q.rowNumber} has identical question text to an already existing question in this assessment: "${q.questionText.slice(0, 80)}"`,
        );
      }
    }

    // Calculate marks reconciliation
    const importedMarks = Math.round(
      validQuestions.reduce((sum, q) => sum + q.marks, 0) * 100,
    ) / 100;
    const existingAllocatedMarks = Math.round(
      existingQuestions.reduce((sum, q) => sum + Number(q.marks), 0) * 100,
    ) / 100;
    const projectedTotalMarks = Math.round((existingAllocatedMarks + importedMarks) * 100) / 100;
    const targetTotalMarks = Number(assessment.totalMarks);
    const remainingMarks = Math.round((targetTotalMarks - projectedTotalMarks) * 100) / 100;
    const isReconciled = projectedTotalMarks === targetTotalMarks;

    let reconciliationWarning: string | null = null;
    if (projectedTotalMarks > targetTotalMarks) {
      reconciliationWarning = `Projected total marks (${projectedTotalMarks.toFixed(2)}) would exceed assessment total marks (${targetTotalMarks.toFixed(2)}) by ${(projectedTotalMarks - targetTotalMarks).toFixed(2)} marks`;
    }

    return {
      totalRows: validQuestions.length + invalidRows.length,
      validCount: validQuestions.length,
      invalidCount: invalidRows.length,
      validQuestions,
      invalidRows,
      duplicateSerialErrors,
      duplicateQuestionWarnings,
      importedCount: validQuestions.length,
      importedMarks,
      existingCount: existingQuestions.length,
      existingAllocatedMarks,
      projectedTotalMarks,
      targetTotalMarks,
      remainingMarks,
      isReconciled,
      reconciliationWarning,
    };
  }

  /**
   * POST /api/v1/examination/assessments/:assessmentId/questions/import/confirm
   * Atomically import questions into a draft assessment.
   * Locks the assessment under transaction, re-validates marks allocation,
   * and inserts the entire batch atomically.
   */
  async confirmImport(
    schoolId: string,
    assessmentId: string,
    dto: ConfirmQuestionImportDto,
    user: AuthenticatedUser,
  ): Promise<QuestionImportConfirmResponse> {
    const { teacherId } = await this.assertAssessmentAccess(
      schoolId,
      assessmentId,
      user,
      true,
    );

    if (!dto.questions || dto.questions.length === 0) {
      throw new BadRequestException('At least one question is required for import confirmation');
    }

    if (dto.questions.length > 500) {
      throw new BadRequestException('Cannot import more than 500 questions in a single batch');
    }

    // Validate each question server-side (never trust client preview payload)
    const orderIndices = dto.questions
      .map((q) => q.orderIndex)
      .filter((idx) => idx !== undefined);
    if (new Set(orderIndices).size !== orderIndices.length) {
      throw new BadRequestException(
        'Submitted questions contain duplicate serial/orderIndex values',
      );
    }

    for (const q of dto.questions) {
      this.validateQuestionPayload(q.options, q.correctOption, q.marks, q.questionText);
      await this.validateSectionBelongsToAssessment(schoolId, assessmentId, q.sectionId);
    }

    // Format questions for repository atomic insertion
    const questionData = dto.questions.map((q, idx) => ({
      schoolId,
      assessmentId,
      sectionId: q.sectionId ?? null,
      orderIndex: q.orderIndex !== undefined ? q.orderIndex : idx + 1,
      questionText: q.questionText.trim(),
      options: q.options.map((o) => o.trim()),
      correctOption: q.correctOption,
      marks: q.marks,
      explanation: q.explanation?.trim() ?? null,
    }));

    // Atomically execute under parent assessment transaction lock
    const result = await this.examRepo.createQuestionsBulkAtomic(
      schoolId,
      assessmentId,
      questionData,
      teacherId,
    );

    return {
      success: true,
      message: `Successfully imported ${result.importedCount} question(s)`,
      importedCount: result.importedCount,
      importedMarks: result.importedMarks,
      totalQuestions: result.totalQuestions,
      currentAllocatedMarks: result.currentAllocatedMarks,
      remainingMarks: result.remainingMarks,
      isReconciled: result.isReconciled,
    };
  }

  /**
   * Uploads or replaces an image attachment for a question.
   */
  async uploadQuestionImage(
    schoolId: string,
    assessmentId: string,
    questionId: string,
    file: Express.Multer.File,
    user: AuthenticatedUser,
  ): Promise<QuestionImagePublicDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Image file is required');
    }

    const { teacherId } = await this.assertAssessmentAccess(
      schoolId,
      assessmentId,
      user,
      true,
    );

    const question = await this.examRepo.findQuestionById(schoolId, assessmentId, questionId);
    if (!question) {
      throw new NotFoundException('Question not found in this assessment');
    }

    const stored = await this.storageService.storeQuestionImage(
      schoolId,
      assessmentId,
      questionId,
      file.buffer,
      file.originalname,
    );

    let upsertResult: { artifact: any; oldStoragePath: string | null };
    try {
      upsertResult = await this.examRepo.upsertQuestionImageAtomic(
        {
          schoolId,
          assessmentId,
          questionId,
          fileName: stored.fileName,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
          storagePath: stored.storagePath,
          checksumSha256: stored.checksumSha256,
        },
        teacherId,
      );
    } catch (err) {
      // Failure domain isolation: clean up the newly written file if DB fails
      try {
        const refCount = await this.examRepo.countImageReferencesByStoragePath(stored.storagePath);
        if (refCount === 0) {
          await this.storageService.deleteFileSafe(stored.storagePath);
        }
      } catch (cleanupErr: any) {
        this.logger.warn(
          `Failed cleaning up unreferenced file ${stored.storagePath} after DB failure: ${cleanupErr?.message}`,
        );
      }
      throw err;
    }

    // Clean up replaced old file if no other record references it
    if (upsertResult.oldStoragePath && upsertResult.oldStoragePath !== stored.storagePath) {
      try {
        const remainingRefs = await this.examRepo.countImageReferencesByStoragePath(
          upsertResult.oldStoragePath,
        );
        if (remainingRefs === 0) {
          await this.storageService.deleteFileSafe(upsertResult.oldStoragePath);
        }
      } catch (cleanupErr: any) {
        this.logger.warn(
          `Failed cleaning up superseded question image ${upsertResult.oldStoragePath}: ${cleanupErr?.message}`,
        );
      }
    }

    const artifact = upsertResult.artifact;
    return {
      id: artifact.id,
      questionId: artifact.questionId,
      fileName: artifact.fileName,
      fileSize: artifact.fileSize,
      mimeType: artifact.mimeType,
      checksumSha256: artifact.checksumSha256,
      status: artifact.status,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    };
  }

  /**
   * Retrieves an image attachment for a question.
   */
  async getQuestionImage(
    schoolId: string,
    assessmentId: string,
    questionId: string,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    await this.assertAssessmentAccess(schoolId, assessmentId, user, false);

    const question = await this.examRepo.findQuestionById(schoolId, assessmentId, questionId);
    if (!question) {
      throw new NotFoundException('Question not found in this assessment');
    }

    const artifact = await this.examRepo.findQuestionImage(schoolId, assessmentId, questionId);
    if (!artifact) {
      throw new NotFoundException('Question has no attached image');
    }

    const buffer = await this.storageService.readQuestionImage(artifact.storagePath);
    return {
      buffer,
      mimeType: artifact.mimeType,
      fileName: artifact.fileName,
    };
  }

  /**
   * Removes an image attachment from a question and cleans up storage.
   */
  async deleteQuestionImage(
    schoolId: string,
    assessmentId: string,
    questionId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const { teacherId } = await this.assertAssessmentAccess(
      schoolId,
      assessmentId,
      user,
      true,
    );

    const question = await this.examRepo.findQuestionById(schoolId, assessmentId, questionId);
    if (!question) {
      throw new NotFoundException('Question not found in this assessment');
    }

    const { deleted, storagePath } = await this.examRepo.deleteQuestionImageAtomic(
      schoolId,
      assessmentId,
      questionId,
      teacherId,
    );

    if (deleted && storagePath) {
      try {
        const remainingRefs = await this.examRepo.countImageReferencesByStoragePath(storagePath);
        if (remainingRefs === 0) {
          await this.storageService.deleteFileSafe(storagePath);
        }
      } catch (cleanupErr: any) {
        this.logger.warn(
          `Failed cleaning up deleted question image ${storagePath}: ${cleanupErr?.message}`,
        );
      }
    }

    return {
      success: true,
      message: 'Question image removed successfully',
    };
  }
}
