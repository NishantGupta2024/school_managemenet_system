import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssessmentChapterRecord,
  AssessmentDraftRecord,
  AssessmentMode,
  AssessmentQuestionRecord,
  AssessmentStatus,
  ImageArtifactStatus,
  QuestionImageArtifactRecord,
  AssessmentAttemptRecord,
  AttemptAnswerRecord,
  AttemptStatus,
  AssessmentResultRecord,
  ProgressionAssessmentStatus,
  StudentAssessmentProgressionRecord,
  PlatformSuperAdminLeaderboardMetricsDto,
  RawLeaderboardRow,
  SchoolExaminationSettingRecord,
} from './types';
import {
  AssessmentFilter,
  ChapterFilter,
  CreateAssessmentDraftData,
  CreateChapterData,
  CreateQuestionData,
  IExaminationRepository,
  ParentStudentAssessmentHistoryRow,
  UpdateAssessmentDraftData,
  UpdateQuestionData,
  UpsertQuestionImageData,
} from './examination.repository.interface';

@Injectable()
export class ExaminationPrismaRepository implements IExaminationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapChapter(row: any): AssessmentChapterRecord {
    return {
      id: row.id,
      schoolId: row.schoolId,
      academicYearId: row.academicYearId ?? null,
      createdByTeacherId: row.createdByTeacherId ?? null,
      gradeId: row.gradeId,
      subject: row.subject,
      chapterCode: row.chapterCode,
      title: row.title,
      orderIndex: Number(row.orderIndex),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private mapAssessment(row: any): AssessmentDraftRecord {
    return {
      id: row.id,
      schoolId: row.schoolId,
      academicYearId: row.academicYearId,
      gradeId: row.gradeId,
      sectionId: row.sectionId,
      teacherId: row.teacherId,
      chapterId: row.chapterId,
      title: row.title,
      description: row.description,
      subject: row.subject,
      mode: row.mode as AssessmentMode,
      status: row.status as AssessmentStatus,
      totalMarks: Number(row.totalMarks),
      passingMarks: Number(row.passingMarks),
      durationMinutes: Number(row.durationMinutes),
      startWindowAt: row.startWindowAt ? new Date(row.startWindowAt) : null,
      endWindowAt: row.endWindowAt ? new Date(row.endWindowAt) : null,
      shuffleQuestions: Boolean(row.shuffleQuestions),
      shuffleOptions: Boolean(row.shuffleOptions),
      enableProctoring: Boolean(row.enableProctoring),
      monitoringConfig: row.monitoringConfig ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private mapAttempt(row: any): AssessmentAttemptRecord {
    return {
      id: row.id,
      schoolId: row.schoolId,
      assessmentId: row.assessmentId,
      studentId: row.studentId,
      status: row.status as AttemptStatus,
      startedAt: new Date(row.startedAt),
      deadlineAt: new Date(row.deadlineAt),
      submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
      proctoringPassed: Boolean(row.proctoringPassed),
      preflightData: row.preflightData ?? null,
      flaggedForReview: Boolean(row.flaggedForReview),
      studentExplanation: row.studentExplanation ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private mapAttemptAnswer(row: any): AttemptAnswerRecord {
    return {
      id: row.id,
      schoolId: row.schoolId,
      assessmentId: row.assessmentId,
      attemptId: row.attemptId,
      questionId: row.questionId,
      selectedOption:
        row.selectedOption !== null && row.selectedOption !== undefined
          ? Number(row.selectedOption)
          : null,
      metadata: row.metadata,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private mapResult(row: any): AssessmentResultRecord {
    return {
      id: row.id,
      schoolId: row.schoolId,
      assessmentId: row.assessmentId,
      attemptId: row.attemptId,
      studentId: row.studentId,
      totalQuestions: Number(row.totalQuestions),
      attemptedQuestions: Number(row.attemptedQuestions),
      correctAnswers: Number(row.correctAnswers),
      incorrectAnswers: Number(row.incorrectAnswers),
      score: Number(row.score),
      percentage: Number(row.percentage),
      isPassing: Boolean(row.isPassing),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private mapProgression(row: any): StudentAssessmentProgressionRecord {
    return {
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      assessmentId: row.assessmentId,
      chapterId: row.chapterId ?? null,
      status: row.status as ProgressionAssessmentStatus,
      unlockedAt: row.unlockedAt ? new Date(row.unlockedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async createChapter(data: CreateChapterData): Promise<AssessmentChapterRecord> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "assessment_chapters" (
        "id", "schoolId", "academicYearId", "createdByTeacherId", "gradeId", "subject", "chapterCode", "title", "orderIndex", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) RETURNING *`,
      data.schoolId,
      data.academicYearId ?? null,
      data.createdByTeacherId ?? null,
      data.gradeId,
      data.subject,
      data.chapterCode,
      data.title,
      data.orderIndex,
    );
    return this.mapChapter(rows[0]);
  }

  async findChapters(schoolId: string, filter?: ChapterFilter): Promise<AssessmentChapterRecord[]> {
    const conditions: string[] = ['"schoolId" = $1'];
    const params: any[] = [schoolId];

    if (filter?.gradeId) {
      params.push(filter.gradeId);
      conditions.push(`"gradeId" = $${params.length}`);
    }

    if (filter?.subject) {
      params.push(filter.subject);
      conditions.push(`LOWER("subject") = LOWER($${params.length})`);
    }

    if (filter?.requestingTeacherId) {
      params.push(filter.requestingTeacherId);
      conditions.push(`("createdByTeacherId" = $${params.length} OR "createdByTeacherId" IS NULL)`);
    }

    if (filter?.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`("academicYearId" = $${params.length} OR "academicYearId" IS NULL)`);
    }

    const query = `SELECT * FROM "assessment_chapters" WHERE ${conditions.join(
      ' AND ',
    )} ORDER BY "orderIndex" ASC, "title" ASC`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);
    return rows.map((r) => this.mapChapter(r));
  }

  async findChapterById(schoolId: string, id: string): Promise<AssessmentChapterRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessment_chapters" WHERE "schoolId" = $1 AND "id" = $2`,
      schoolId,
      id,
    );
    return rows.length > 0 ? this.mapChapter(rows[0]) : null;
  }

  async findChapterByCode(
    schoolId: string,
    gradeId: string,
    subject: string,
    chapterCode: string,
    academicYearId?: string,
    teacherId?: string | null,
  ): Promise<AssessmentChapterRecord | null> {
    const conditions: string[] = [
      '"schoolId" = $1',
      '"gradeId" = $2',
      'LOWER("subject") = LOWER($3)',
      'LOWER("chapterCode") = LOWER($4)',
    ];
    const params: any[] = [schoolId, gradeId, subject, chapterCode];

    if (teacherId !== undefined) {
      if (teacherId !== null) {
        params.push(teacherId);
        conditions.push(`"createdByTeacherId" = $${params.length}`);
        if (academicYearId) {
          params.push(academicYearId);
          conditions.push(`"academicYearId" = $${params.length}`);
        }
      } else {
        conditions.push('"createdByTeacherId" IS NULL');
        if (academicYearId) {
          params.push(academicYearId);
          conditions.push(`("academicYearId" = $${params.length} OR "academicYearId" IS NULL)`);
        }
      }
    } else if (academicYearId) {
      params.push(academicYearId);
      conditions.push(`("academicYearId" = $${params.length} OR "academicYearId" IS NULL)`);
    }

    const query = `SELECT * FROM "assessment_chapters" WHERE ${conditions.join(' AND ')} LIMIT 1`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);
    return rows.length > 0 ? this.mapChapter(rows[0]) : null;
  }

  async createAssessmentDraft(data: CreateAssessmentDraftData): Promise<AssessmentDraftRecord> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "assessments" (
        "id", "schoolId", "academicYearId", "gradeId", "sectionId", "teacherId", "chapterId",
        "title", "description", "subject", "mode", "status", "totalMarks", "passingMarks",
        "durationMinutes", "startWindowAt", "endWindowAt", "shuffleQuestions", "shuffleOptions",
        "enableProctoring", "monitoringConfig",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10::"AssessmentMode", 'DRAFT', $11, $12,
        $13, $14, $15, $16, $17,
        $18, $19::jsonb,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) RETURNING *`,
      data.schoolId,
      data.academicYearId,
      data.gradeId,
      data.sectionId,
      data.teacherId,
      data.chapterId,
      data.title,
      data.description,
      data.subject,
      data.mode,
      data.totalMarks,
      data.passingMarks,
      data.durationMinutes,
      data.startWindowAt,
      data.endWindowAt,
      data.shuffleQuestions,
      data.shuffleOptions,
      Boolean(data.enableProctoring),
      data.monitoringConfig ? JSON.stringify(data.monitoringConfig) : null,
    );
    return this.mapAssessment(rows[0]);
  }

  async findAssessments(schoolId: string, filter?: AssessmentFilter): Promise<AssessmentDraftRecord[]> {
    const conditions: string[] = ['"schoolId" = $1'];
    const params: any[] = [schoolId];

    if (filter?.status) {
      params.push(filter.status);
      conditions.push(`"status" = $${params.length}::"AssessmentStatus"`);
    }

    if (filter?.gradeId) {
      params.push(filter.gradeId);
      conditions.push(`"gradeId" = $${params.length}`);
    }

    if (filter?.subject) {
      params.push(filter.subject);
      conditions.push(`LOWER("subject") = LOWER($${params.length})`);
    }

    if (filter?.academicYearId) {
      params.push(filter.academicYearId);
      conditions.push(`"academicYearId" = $${params.length}`);
    }

    if (filter?.requestingTeacherId) {
      params.push(filter.requestingTeacherId);
      conditions.push(
        `("status" != 'DRAFT'::"AssessmentStatus" OR "teacherId" = $${params.length})`,
      );
    }

    const query = `SELECT * FROM "assessments" WHERE ${conditions.join(
      ' AND ',
    )} ORDER BY "createdAt" DESC`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);
    return rows.map((r) => this.mapAssessment(r));
  }

  async findAssessmentById(schoolId: string, id: string): Promise<AssessmentDraftRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessments" WHERE "schoolId" = $1 AND "id" = $2`,
      schoolId,
      id,
    );
    return rows.length > 0 ? this.mapAssessment(rows[0]) : null;
  }

  async updateAssessmentDraft(
    schoolId: string,
    id: string,
    data: UpdateAssessmentDraftData,
  ): Promise<AssessmentDraftRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock parent assessment row
      const lockRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "totalMarks", "teacherId"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2
         FOR UPDATE`,
        schoolId,
        id,
      );
      if (lockRows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = lockRows[0];

      if (assessment.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot modify assessment: Assessment is in ${assessment.status} status. Only DRAFT assessments may be modified.`,
        );
      }

      // If totalMarks is being updated, verify it is not less than currently allocated question marks
      if (data.totalMarks !== undefined) {
        const questionRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT "marks" FROM "assessment_questions"
           WHERE "schoolId" = $1 AND "assessmentId" = $2`,
          schoolId,
          id,
        );
        const currentAllocatedMarks = Math.round(
          questionRows.reduce((sum, q) => sum + Number(q.marks), 0) * 100,
        ) / 100;
        const newTotalMarks = Number(data.totalMarks);

        if (newTotalMarks < currentAllocatedMarks) {
          throw new BadRequestException(
            `Cannot reduce totalMarks to ${newTotalMarks.toFixed(2)}: current questions already have ${currentAllocatedMarks.toFixed(2)} marks allocated`,
          );
        }
      }

      const updates: string[] = ['"updatedAt" = CURRENT_TIMESTAMP'];
      const params: any[] = [schoolId, id];

      if (data.academicYearId !== undefined) {
        params.push(data.academicYearId);
        updates.push(`"academicYearId" = $${params.length}`);
      }
      if (data.gradeId !== undefined) {
        params.push(data.gradeId);
        updates.push(`"gradeId" = $${params.length}`);
      }
      if (data.sectionId !== undefined) {
        params.push(data.sectionId);
        updates.push(`"sectionId" = $${params.length}`);
      }
      if (data.chapterId !== undefined) {
        params.push(data.chapterId);
        updates.push(`"chapterId" = $${params.length}`);
      }
      if (data.title !== undefined) {
        params.push(data.title);
        updates.push(`"title" = $${params.length}`);
      }
      if (data.description !== undefined) {
        params.push(data.description);
        updates.push(`"description" = $${params.length}`);
      }
      if (data.subject !== undefined) {
        params.push(data.subject);
        updates.push(`"subject" = $${params.length}`);
      }
      if (data.mode !== undefined) {
        params.push(data.mode);
        updates.push(`"mode" = $${params.length}::"AssessmentMode"`);
      }
      if (data.totalMarks !== undefined) {
        params.push(data.totalMarks);
        updates.push(`"totalMarks" = $${params.length}`);
      }
      if (data.passingMarks !== undefined) {
        params.push(data.passingMarks);
        updates.push(`"passingMarks" = $${params.length}`);
      }
      if (data.durationMinutes !== undefined) {
        params.push(data.durationMinutes);
        updates.push(`"durationMinutes" = $${params.length}`);
      }
      if (data.startWindowAt !== undefined) {
        params.push(data.startWindowAt);
        updates.push(`"startWindowAt" = $${params.length}`);
      }
      if (data.endWindowAt !== undefined) {
        params.push(data.endWindowAt);
        updates.push(`"endWindowAt" = $${params.length}`);
      }
      if (data.shuffleQuestions !== undefined) {
        params.push(data.shuffleQuestions);
        updates.push(`"shuffleQuestions" = $${params.length}`);
      }
      if (data.shuffleOptions !== undefined) {
        params.push(data.shuffleOptions);
        updates.push(`"shuffleOptions" = $${params.length}`);
      }
      if (data.enableProctoring !== undefined) {
        params.push(Boolean(data.enableProctoring));
        updates.push(`"enableProctoring" = $${params.length}`);
      }
      if (data.monitoringConfig !== undefined) {
        params.push(data.monitoringConfig ? JSON.stringify(data.monitoringConfig) : null);
        updates.push(`"monitoringConfig" = $${params.length}::jsonb`);
      }

      const query = `UPDATE "assessments" SET ${updates.join(', ')} WHERE "schoolId" = $1 AND "id" = $2 RETURNING *`;
      const rows = await tx.$queryRawUnsafe<any[]>(query, ...params);
      return this.mapAssessment(rows[0]);
    });
  }

  async publishAssessment(
    schoolId: string,
    id: string,
    teacherId?: string,
  ): Promise<AssessmentDraftRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the assessment row
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessments" WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE`,
        schoolId,
        id,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status === 'PUBLISHED') {
        throw new ConflictException('Assessment is already published');
      }

      if (assessment.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot publish assessment: Assessment is in ${assessment.status} status. Only DRAFT assessments may be published.`,
        );
      }

      if (teacherId && assessment.teacherId !== teacherId) {
        throw new ForbiddenException('You may only publish assessments you authored');
      }

      // 2. Schedule window chronological sanity
      if (assessment.startWindowAt && assessment.endWindowAt) {
        const start = new Date(assessment.startWindowAt).getTime();
        const end = new Date(assessment.endWindowAt).getTime();
        if (end <= start) {
          throw new BadRequestException(
            'Assessment schedule endWindowAt must be strictly after startWindowAt',
          );
        }
      }

      // 3. Query questions under the transaction lock
      const questions = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2`,
        schoolId,
        id,
      );

      if (questions.length === 0) {
        throw new BadRequestException(
          'Cannot publish an empty assessment: at least one question is required',
        );
      }

      // 4. Validate question contents and marks
      let totalAllocatedMarks = 0;
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const text = q.questionText?.trim();
        if (!text || text.length === 0) {
          throw new BadRequestException(
            `Question at index ${i + 1} has invalid or empty question text`,
          );
        }

        let options: string[] = [];
        if (typeof q.options === 'string') {
          try {
            options = JSON.parse(q.options);
          } catch {
            options = [];
          }
        } else if (Array.isArray(q.options)) {
          options = q.options;
        }

        if (
          !Array.isArray(options) ||
          options.length !== 4 ||
          options.some((opt) => typeof opt !== 'string' || !opt.trim())
        ) {
          throw new BadRequestException(
            `Question at index ${i + 1} must contain exactly 4 non-empty options`,
          );
        }

        const correctOption = Number(q.correctOption);
        if (
          !Number.isInteger(correctOption) ||
          correctOption < 0 ||
          correctOption > 3
        ) {
          throw new BadRequestException(
            `Question at index ${i + 1} has invalid correctOption (must be 0-3)`,
          );
        }

        const marks = Number(q.marks);
        if (isNaN(marks) || marks <= 0) {
          throw new BadRequestException(
            `Question at index ${i + 1} has invalid marks (must be > 0)`,
          );
        }

        totalAllocatedMarks += marks;
      }

      totalAllocatedMarks = Math.round(totalAllocatedMarks * 100) / 100;
      const targetTotalMarks = Number(assessment.totalMarks);

      if (totalAllocatedMarks !== targetTotalMarks) {
        throw new BadRequestException(
          `Cannot publish assessment: allocated question marks (${totalAllocatedMarks.toFixed(2)}) do not match totalMarks (${targetTotalMarks.toFixed(2)})`,
        );
      }

      // 5. Transition status to PUBLISHED atomically
      const updatedRows = await tx.$queryRawUnsafe<any[]>(
        `UPDATE "assessments"
         SET "status" = 'PUBLISHED'::"AssessmentStatus", "updatedAt" = CURRENT_TIMESTAMP
         WHERE "schoolId" = $1 AND "id" = $2
         RETURNING *`,
        schoolId,
        id,
      );

      return this.mapAssessment(updatedRows[0]);
    });
  }

  async deleteAssessmentDraft(schoolId: string, id: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "assessments" WHERE "schoolId" = $1 AND "id" = $2`,
      schoolId,
      id,
    );
  }

  async countChildQuestions(assessmentId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int as count FROM "assessment_questions" WHERE "assessmentId" = $1`,
      assessmentId,
    );
    return rows.length > 0 ? Number(rows[0].count) : 0;
  }

  private mapQuestion(row: any): AssessmentQuestionRecord {
    let options: string[] = [];
    if (typeof row.options === 'string') {
      try {
        options = JSON.parse(row.options);
      } catch {
        options = [];
      }
    } else if (Array.isArray(row.options)) {
      options = row.options;
    }

    return {
      id: row.id,
      schoolId: row.schoolId,
      assessmentId: row.assessmentId,
      sectionId: row.sectionId ?? null,
      orderIndex: Number(row.orderIndex),
      questionText: row.questionText,
      options,
      correctOption: Number(row.correctOption),
      marks: Number(row.marks),
      explanation: row.explanation ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private mapQuestionImage(row: any): QuestionImageArtifactRecord {
    return {
      id: row.id,
      schoolId: row.schoolId,
      assessmentId: row.assessmentId,
      questionId: row.questionId,
      fileName: row.fileName,
      fileSize: Number(row.fileSize),
      mimeType: row.mimeType,
      storagePath: row.storagePath,
      checksumSha256: row.checksumSha256,
      status: row.status as ImageArtifactStatus,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async countChildSections(assessmentId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int as count FROM "assessment_sections" WHERE "assessmentId" = $1`,
      assessmentId,
    );
    return rows.length > 0 ? Number(rows[0].count) : 0;
  }

  async createQuestion(
    data: CreateQuestionData,
    teacherId?: string,
  ): Promise<AssessmentQuestionRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the parent assessment row with FOR UPDATE
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "totalMarks", "teacherId"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE`,
        data.schoolId,
        data.assessmentId,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot modify questions: Assessment is in ${assessment.status} status. Only DRAFT assessments may be modified.`,
        );
      }

      if (teacherId && assessment.teacherId !== teacherId) {
        throw new ForbiddenException('You may only manage questions for assessments you authored');
      }

      // 2. Query existing questions under transaction lock
      const existingQuestions = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "marks", "orderIndex"
         FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2`,
        data.schoolId,
        data.assessmentId,
      );
      const currentAllocatedMarks = Math.round(
        existingQuestions.reduce((sum, q) => sum + Number(q.marks), 0) * 100,
      ) / 100;
      const targetTotalMarks = Number(assessment.totalMarks);
      const newAllocatedMarks = Math.round((currentAllocatedMarks + Number(data.marks)) * 100) / 100;

      if (newAllocatedMarks > targetTotalMarks) {
        throw new BadRequestException(
          `Adding this question with ${data.marks} marks would allocate ${newAllocatedMarks.toFixed(2)} marks, exceeding the assessment total of ${targetTotalMarks.toFixed(2)} marks`,
        );
      }

      // 3. Compute orderIndex if omitted under lock
      let orderIndex = data.orderIndex;
      if (orderIndex === undefined || orderIndex === null) {
        const maxOrderIndex = existingQuestions.reduce(
          (max, q) => Math.max(max, Number(q.orderIndex) || 0),
          0,
        );
        orderIndex = maxOrderIndex + 1;
      }

      // 4. Insert question under transaction
      const insertRows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO "assessment_questions" (
          "id", "schoolId", "assessmentId", "sectionId", "orderIndex",
          "questionText", "options", "correctOption", "marks", "explanation",
          "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4,
          $5, $6::jsonb, $7, $8, $9,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING *`,
        data.schoolId,
        data.assessmentId,
        data.sectionId,
        orderIndex,
        data.questionText,
        JSON.stringify(data.options),
        data.correctOption,
        data.marks,
        data.explanation,
      );
      return this.mapQuestion(insertRows[0]);
    });
  }

  async findQuestionsByAssessmentId(
    schoolId: string,
    assessmentId: string,
  ): Promise<AssessmentQuestionRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessment_questions"
       WHERE "schoolId" = $1 AND "assessmentId" = $2
       ORDER BY "orderIndex" ASC, "createdAt" ASC`,
      schoolId,
      assessmentId,
    );
    return rows.map((r) => this.mapQuestion(r));
  }

  async findQuestionById(
    schoolId: string,
    assessmentId: string,
    id: string,
  ): Promise<AssessmentQuestionRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessment_questions"
       WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "id" = $3`,
      schoolId,
      assessmentId,
      id,
    );
    return rows.length > 0 ? this.mapQuestion(rows[0]) : null;
  }

  async updateQuestion(
    schoolId: string,
    assessmentId: string,
    id: string,
    data: UpdateQuestionData,
    teacherId?: string,
  ): Promise<AssessmentQuestionRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the parent assessment row with FOR UPDATE
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "totalMarks", "teacherId"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE`,
        schoolId,
        assessmentId,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot modify questions: Assessment is in ${assessment.status} status. Only DRAFT assessments may be modified.`,
        );
      }

      if (teacherId && assessment.teacherId !== teacherId) {
        throw new ForbiddenException('You may only manage questions for assessments you authored');
      }

      // 2. Verify target question exists
      const targetRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "id" = $3`,
        schoolId,
        assessmentId,
        id,
      );
      if (targetRows.length === 0) {
        throw new NotFoundException('Question not found in this assessment');
      }

      // 3. Reconcile marks under parent lock if marks changed
      if (data.marks !== undefined) {
        const allQuestions = await tx.$queryRawUnsafe<any[]>(
          `SELECT "id", "marks" FROM "assessment_questions"
           WHERE "schoolId" = $1 AND "assessmentId" = $2`,
          schoolId,
          assessmentId,
        );
        const otherQuestionsMarks = allQuestions
          .filter((q) => q.id !== id)
          .reduce((sum, q) => sum + Number(q.marks), 0);
        const targetTotalMarks = Number(assessment.totalMarks);
        const newAllocatedMarks =
          Math.round((otherQuestionsMarks + Number(data.marks)) * 100) / 100;

        if (newAllocatedMarks > targetTotalMarks) {
          throw new BadRequestException(
            `Updating this question to ${data.marks} marks would allocate ${newAllocatedMarks.toFixed(2)} marks, exceeding the assessment total of ${targetTotalMarks.toFixed(2)} marks`,
          );
        }
      }

      // 4. Update the question in DB
      const updates: string[] = ['"updatedAt" = CURRENT_TIMESTAMP'];
      const params: any[] = [schoolId, assessmentId, id];

      if (data.sectionId !== undefined) {
        params.push(data.sectionId);
        updates.push(`"sectionId" = $${params.length}`);
      }
      if (data.orderIndex !== undefined) {
        params.push(data.orderIndex);
        updates.push(`"orderIndex" = $${params.length}`);
      }
      if (data.questionText !== undefined) {
        params.push(data.questionText);
        updates.push(`"questionText" = $${params.length}`);
      }
      if (data.options !== undefined) {
        params.push(JSON.stringify(data.options));
        updates.push(`"options" = $${params.length}::jsonb`);
      }
      if (data.correctOption !== undefined) {
        params.push(data.correctOption);
        updates.push(`"correctOption" = $${params.length}`);
      }
      if (data.marks !== undefined) {
        params.push(data.marks);
        updates.push(`"marks" = $${params.length}`);
      }
      if (data.explanation !== undefined) {
        params.push(data.explanation);
        updates.push(`"explanation" = $${params.length}`);
      }

      const query = `UPDATE "assessment_questions"
                     SET ${updates.join(', ')}
                     WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "id" = $3
                     RETURNING *`;
      const updatedRows = await tx.$queryRawUnsafe<any[]>(query, ...params);
      return this.mapQuestion(updatedRows[0]);
    });
  }

  async deleteQuestion(
    schoolId: string,
    assessmentId: string,
    id: string,
    teacherId?: string,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the parent assessment row with FOR UPDATE
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "teacherId"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE`,
        schoolId,
        assessmentId,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot modify questions: Assessment is in ${assessment.status} status. Only DRAFT assessments may be modified.`,
        );
      }

      if (teacherId && assessment.teacherId !== teacherId) {
        throw new ForbiddenException('You may only manage questions for assessments you authored');
      }

      // 2. Verify target question exists and belongs to this assessment
      const targetRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "id" = $3`,
        schoolId,
        assessmentId,
        id,
      );
      if (targetRows.length === 0) {
        throw new NotFoundException('Question not found in this assessment');
      }

      // 3. Delete the question in DB (PostgreSQL CASCADE deletes the question_image_artifacts row)
      await tx.$executeRawUnsafe(
        `DELETE FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "id" = $3`,
        schoolId,
        assessmentId,
        id,
      );
    });
  }

  async getNextQuestionOrderIndex(assessmentId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(MAX("orderIndex"), 0) + 1 as "nextIndex"
       FROM "assessment_questions"
       WHERE "assessmentId" = $1`,
      assessmentId,
    );
    return rows.length > 0 ? Number(rows[0].nextIndex) : 1;
  }

  async findAssessmentSectionById(
    schoolId: string,
    assessmentId: string,
    sectionId: string,
  ): Promise<{ id: string; assessmentId: string; title: string } | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "assessmentId", "title"
       FROM "assessment_sections"
       WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "id" = $3`,
      schoolId,
      assessmentId,
      sectionId,
    );
    return rows.length > 0
      ? { id: rows[0].id, assessmentId: rows[0].assessmentId, title: rows[0].title }
      : null;
  }

  async createQuestionsBulkAtomic(
    schoolId: string,
    assessmentId: string,
    questions: CreateQuestionData[],
    teacherId?: string,
  ): Promise<{
    importedCount: number;
    importedMarks: number;
    totalQuestions: number;
    currentAllocatedMarks: number;
    remainingMarks: number;
    isReconciled: boolean;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the assessment row with FOR UPDATE
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "totalMarks", "teacherId"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE`,
        schoolId,
        assessmentId,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot import questions: Assessment is in ${assessment.status} status. Only DRAFT assessments may be modified.`,
        );
      }

      if (teacherId && assessment.teacherId !== teacherId) {
        throw new ForbiddenException('You may only import questions for assessments you authored');
      }

      // 2. Query existing questions under transaction lock
      const existingQuestions = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "marks", "orderIndex"
         FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2`,
        schoolId,
        assessmentId,
      );
      const currentAllocatedMarks = Math.round(
        existingQuestions.reduce((sum, q) => sum + Number(q.marks), 0) * 100,
      ) / 100;
      const targetTotalMarks = Number(assessment.totalMarks);

      const importMarks = Math.round(
        questions.reduce((sum, q) => sum + Number(q.marks), 0) * 100,
      ) / 100;
      const newAllocatedMarks = Math.round((currentAllocatedMarks + importMarks) * 100) / 100;

      if (newAllocatedMarks > targetTotalMarks) {
        throw new BadRequestException(
          `Importing ${questions.length} questions with ${importMarks.toFixed(2)} marks would allocate ${newAllocatedMarks.toFixed(2)} marks, exceeding the assessment total of ${targetTotalMarks.toFixed(2)} marks`,
        );
      }

      // 3. Compute starting orderIndex from existing questions under lock
      const maxExistingOrderIndex = existingQuestions.reduce(
        (max, q) => Math.max(max, Number(q.orderIndex) || 0),
        0,
      );

      // 4. Insert each question atomically under transaction with consecutive orderIndex
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const assignedOrderIndex = maxExistingOrderIndex + i + 1;
        await tx.$queryRawUnsafe(
          `INSERT INTO "assessment_questions" (
            "id", "schoolId", "assessmentId", "sectionId", "orderIndex",
            "questionText", "options", "correctOption", "marks", "explanation",
            "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4,
            $5, $6::jsonb, $7, $8, $9,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )`,
          schoolId,
          assessmentId,
          q.sectionId,
          assignedOrderIndex,
          q.questionText,
          JSON.stringify(q.options),
          q.correctOption,
          q.marks,
          q.explanation,
        );
      }

      const totalQuestions = existingQuestions.length + questions.length;
      const remainingMarks = Math.round((targetTotalMarks - newAllocatedMarks) * 100) / 100;
      const isReconciled = newAllocatedMarks === targetTotalMarks;

      return {
        importedCount: questions.length,
        importedMarks: importMarks,
        totalQuestions,
        currentAllocatedMarks: newAllocatedMarks,
        remainingMarks,
        isReconciled,
      };
    });
  }

  async upsertQuestionImageAtomic(
    data: UpsertQuestionImageData,
    teacherId?: string,
  ): Promise<{ artifact: QuestionImageArtifactRecord; oldStoragePath: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock parent assessment row
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "teacherId"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2
         FOR UPDATE`,
        data.schoolId,
        data.assessmentId,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot modify question images: Assessment is in ${assessment.status} status. Only DRAFT assessments may be modified.`,
        );
      }

      if (teacherId && assessment.teacherId !== teacherId) {
        throw new ForbiddenException('You may only manage question images for assessments you authored');
      }

      // 2. Verify question exists within this assessment and school
      const questionRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "id" = $3`,
        data.schoolId,
        data.assessmentId,
        data.questionId,
      );
      if (questionRows.length === 0) {
        throw new NotFoundException('Question not found in this assessment');
      }

      // 3. Check for existing image artifact to capture oldStoragePath
      const existingArtifacts = await tx.$queryRawUnsafe<any[]>(
        `SELECT "storagePath" FROM "question_image_artifacts"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "questionId" = $3`,
        data.schoolId,
        data.assessmentId,
        data.questionId,
      );
      const oldStoragePath = existingArtifacts.length > 0 ? (existingArtifacts[0].storagePath as string) : null;

      // 4. Upsert artifact record
      const upsertRows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO "question_image_artifacts" (
          "id", "schoolId", "assessmentId", "questionId",
          "fileName", "fileSize", "mimeType", "storagePath", "checksumSha256",
          "status", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, $3,
          $4, $5, $6, $7, $8,
          'ATTACHED'::"ImageArtifactStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("questionId") DO UPDATE SET
          "fileName" = EXCLUDED."fileName",
          "fileSize" = EXCLUDED."fileSize",
          "mimeType" = EXCLUDED."mimeType",
          "storagePath" = EXCLUDED."storagePath",
          "checksumSha256" = EXCLUDED."checksumSha256",
          "status" = 'ATTACHED'::"ImageArtifactStatus",
          "updatedAt" = CURRENT_TIMESTAMP
        RETURNING *`,
        data.schoolId,
        data.assessmentId,
        data.questionId,
        data.fileName,
        data.fileSize,
        data.mimeType,
        data.storagePath,
        data.checksumSha256,
      );

      return {
        artifact: this.mapQuestionImage(upsertRows[0]),
        oldStoragePath,
      };
    });
  }

  async findQuestionImage(
    schoolId: string,
    assessmentId: string,
    questionId: string,
  ): Promise<QuestionImageArtifactRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "question_image_artifacts"
       WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "questionId" = $3`,
      schoolId,
      assessmentId,
      questionId,
    );
    return rows.length > 0 ? this.mapQuestionImage(rows[0]) : null;
  }

  async deleteQuestionImageAtomic(
    schoolId: string,
    assessmentId: string,
    questionId: string,
    teacherId?: string,
  ): Promise<{ deleted: boolean; storagePath: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock parent assessment row
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "teacherId"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2
         FOR UPDATE`,
        schoolId,
        assessmentId,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot delete question images: Assessment is in ${assessment.status} status. Only DRAFT assessments may be modified.`,
        );
      }

      if (teacherId && assessment.teacherId !== teacherId) {
        throw new ForbiddenException('You may only delete question images for assessments you authored');
      }

      // 2. Verify question exists within this assessment and school
      const questionRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "id" = $3`,
        schoolId,
        assessmentId,
        questionId,
      );
      if (questionRows.length === 0) {
        throw new NotFoundException('Question not found in this assessment');
      }

      // 3. Find existing image artifact
      const existingArtifacts = await tx.$queryRawUnsafe<any[]>(
        `SELECT "storagePath" FROM "question_image_artifacts"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "questionId" = $3`,
        schoolId,
        assessmentId,
        questionId,
      );
      if (existingArtifacts.length === 0) {
        throw new NotFoundException('Question has no attached image');
      }
      const storagePath = existingArtifacts[0].storagePath as string;

      // 4. Delete artifact
      await tx.$executeRawUnsafe(
        `DELETE FROM "question_image_artifacts"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "questionId" = $3`,
        schoolId,
        assessmentId,
        questionId,
      );

      return {
        deleted: true,
        storagePath,
      };
    });
  }

  async countImageReferencesByStoragePath(storagePath: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int as count FROM "question_image_artifacts" WHERE "storagePath" = $1`,
      storagePath,
    );
    return rows.length > 0 ? Number(rows[0].count) : 0;
  }

  async findQuestionImagesByAssessmentId(
    schoolId: string,
    assessmentId: string,
  ): Promise<QuestionImageArtifactRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "question_image_artifacts"
       WHERE "schoolId" = $1 AND "assessmentId" = $2`,
      schoolId,
      assessmentId,
    );
    return rows.map((r) => this.mapQuestionImage(r));
  }

  async findEligibleAssessmentsForStudent(
    schoolId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string,
    studentId?: string,
  ): Promise<AssessmentDraftRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT a.* FROM "assessments" a
       WHERE a."schoolId" = $1
         AND a."status" IN ('PUBLISHED'::"AssessmentStatus", 'CLOSED'::"AssessmentStatus", 'RESULTS_RELEASED'::"AssessmentStatus")
         AND (
           (a."academicYearId" = $2 AND a."gradeId" = $3 AND (a."sectionId" = $4 OR a."sectionId" IS NULL))
           OR ($5::text IS NOT NULL AND EXISTS (
             SELECT 1 FROM "assessment_attempts" att
             WHERE att."schoolId" = a."schoolId"
               AND att."assessmentId" = a."id"
               AND att."studentId" = $5
           ))
         )
       ORDER BY a."createdAt" DESC`,
      schoolId,
      academicYearId,
      gradeId,
      sectionId,
      studentId ?? null,
    );
    return rows.map((r) => this.mapAssessment(r));
  }

  async findAttemptByStudentAndAssessment(
    schoolId: string,
    assessmentId: string,
    studentId: string,
  ): Promise<AssessmentAttemptRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessment_attempts"
       WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "studentId" = $3`,
      schoolId,
      assessmentId,
      studentId,
    );
    return rows.length > 0 ? this.mapAttempt(rows[0]) : null;
  }

  async findAttemptById(
    schoolId: string,
    attemptId: string,
  ): Promise<AssessmentAttemptRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessment_attempts"
       WHERE "schoolId" = $1 AND "id" = $2`,
      schoolId,
      attemptId,
    );
    return rows.length > 0 ? this.mapAttempt(rows[0]) : null;
  }

  async createAttemptAtomic(data: {
    schoolId: string;
    assessmentId: string;
    studentId: string;
    startedAt: Date;
    deadlineAt: Date;
  }): Promise<AssessmentAttemptRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Lock parent assessment with FOR SHARE to serialize against closure and release
        const assessmentRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT "id", "status"
           FROM "assessments"
           WHERE "schoolId" = $1 AND "id" = $2
           FOR SHARE`,
          data.schoolId,
          data.assessmentId,
        );
        if (assessmentRows.length === 0) {
          throw new NotFoundException('Assessment not found in this school');
        }
        const assessment = assessmentRows[0];

        if (assessment.status !== 'PUBLISHED') {
          throw new BadRequestException(
            `Cannot start attempt: assessment is in ${assessment.status} status. Only PUBLISHED assessments may be started.`,
          );
        }

        // 2. Insert attempt
        const rows = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO "assessment_attempts" (
             "id", "schoolId", "assessmentId", "studentId", "status", "startedAt", "deadlineAt", "createdAt", "updatedAt"
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, 'IN_PROGRESS'::"AttemptStatus", $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           ) RETURNING *`,
          data.schoolId,
          data.assessmentId,
          data.studentId,
          data.startedAt,
          data.deadlineAt,
        );
        return this.mapAttempt(rows[0]);
      });
    } catch (error: any) {
      if (
        error?.code === '23505' ||
        error?.code === 'P2002' ||
        error?.message?.includes('assessment_attempts_student_assessment_key') ||
        error?.message?.includes('duplicate key')
      ) {
        const existing = await this.findAttemptByStudentAndAssessment(
          data.schoolId,
          data.assessmentId,
          data.studentId,
        );
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async findAttemptAnswers(
    schoolId: string,
    attemptId: string,
  ): Promise<AttemptAnswerRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "attempt_answers"
       WHERE "schoolId" = $1 AND "attemptId" = $2`,
      schoolId,
      attemptId,
    );
    return rows.map((r) => this.mapAttemptAnswer(r));
  }

  async findExpiredInProgressAttempts(
    schoolId: string,
    assessmentId: string,
  ): Promise<AssessmentAttemptRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessment_attempts"
       WHERE "schoolId" = $1
         AND "assessmentId" = $2
         AND "status" = 'IN_PROGRESS'::"AttemptStatus"
         AND "deadlineAt" <= CURRENT_TIMESTAMP
       ORDER BY "id" ASC`,
      schoolId,
      assessmentId,
    );
    return rows.map((r) => this.mapAttempt(r));
  }

  async saveAttemptAnswerAtomic(data: {
    schoolId: string;
    assessmentId: string;
    attemptId: string;
    questionId: string;
    selectedOption: number | null;
  }): Promise<AttemptAnswerRecord> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO "attempt_answers" (
           "id", "schoolId", "assessmentId", "attemptId", "questionId", "selectedOption", "createdAt", "updatedAt"
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT ("attemptId", "questionId")
         DO UPDATE SET
           "selectedOption" = EXCLUDED."selectedOption",
           "updatedAt" = CURRENT_TIMESTAMP
         RETURNING *`,
        data.schoolId,
        data.assessmentId,
        data.attemptId,
        data.questionId,
        data.selectedOption,
      );
      return this.mapAttemptAnswer(rows[0]);
    } catch (error: any) {
      if (
        (error?.code === '23514' || error?.message?.includes('23514')) &&
        error?.message?.includes('Answers are only accepted while attempt is IN_PROGRESS')
      ) {
        throw new BadRequestException(
          'Cannot save answer: Assessment attempt is no longer in progress',
        );
      }
      throw error;
    }
  }

  async finalizeAttemptAtomic(
    schoolId: string,
    attemptId: string,
    targetStatus: AttemptStatus,
  ): Promise<AssessmentAttemptRecord> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessment_attempts"
         WHERE "schoolId" = $1 AND "id" = $2
         FOR UPDATE`,
        schoolId,
        attemptId,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment attempt not found');
      }
      const attempt = rows[0];

      if (attempt.status === 'SUBMITTED' || attempt.status === 'TIMED_OUT') {
        return this.mapAttempt(attempt);
      }

      // Re-evaluate deadline after acquiring the attempt lock
      const now = new Date();
      const deadlineAt = new Date(attempt.deadlineAt);
      let effectiveStatus = targetStatus;
      if (targetStatus === AttemptStatus.SUBMITTED && now >= deadlineAt) {
        effectiveStatus = AttemptStatus.TIMED_OUT;
      }

      const updatedRows = await tx.$queryRawUnsafe<any[]>(
        `UPDATE "assessment_attempts"
         SET "status" = $3::"AttemptStatus",
             "submittedAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "schoolId" = $1 AND "id" = $2
         RETURNING *`,
        schoolId,
        attemptId,
        effectiveStatus,
      );
      return this.mapAttempt(updatedRows[0]);
    });
  }

  async scoreAndPersistResultAtomic(
    schoolId: string,
    attemptId: string,
  ): Promise<AssessmentResultRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock attempt row with FOR UPDATE
      const attemptRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessment_attempts"
         WHERE "schoolId" = $1 AND "id" = $2
         FOR UPDATE`,
        schoolId,
        attemptId,
      );
      if (attemptRows.length === 0) {
        throw new NotFoundException('Assessment attempt not found');
      }
      const attempt = attemptRows[0];

      // 2. Verify terminal state
      if (attempt.status !== 'SUBMITTED' && attempt.status !== 'TIMED_OUT') {
        throw new BadRequestException(
          `Cannot score attempt: attempt is not in a terminal state (status is ${attempt.status})`,
        );
      }

      // 3. Return existing immutable result if already created
      const existingResults = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessment_results"
         WHERE "schoolId" = $1 AND "attemptId" = $2`,
        schoolId,
        attemptId,
      );
      if (existingResults.length > 0) {
        return this.mapResult(existingResults[0]);
      }

      // 4. Fetch parent assessment for passingMarks and totalMarks with FOR SHARE
      const assessmentRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "totalMarks", "passingMarks"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2
         FOR SHARE`,
        schoolId,
        attempt.assessmentId,
      );
      if (assessmentRows.length === 0) {
        throw new NotFoundException('Assessment not found');
      }
      const assessment = assessmentRows[0];
      if (assessment.status === 'RESULTS_RELEASED' || assessment.status === 'ARCHIVED') {
        throw new BadRequestException(
          `Cannot score attempt: assessment results have already been released or the assessment is archived`,
        );
      }

      // 5. Fetch authoritative questions
      const questions = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "marks", "correctOption"
         FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2
         ORDER BY "orderIndex" ASC`,
        schoolId,
        attempt.assessmentId,
      );

      // 6. Fetch authoritative answers
      const answers = await tx.$queryRawUnsafe<any[]>(
        `SELECT "questionId", "selectedOption"
         FROM "attempt_answers"
         WHERE "schoolId" = $1 AND "attemptId" = $2`,
        schoolId,
        attemptId,
      );

      // 7. Calculate score using decimal-safe integer cents
      const answerMap = new Map<string, number | null>();
      for (const a of answers) {
        answerMap.set(
          a.questionId,
          a.selectedOption !== null && a.selectedOption !== undefined
            ? Number(a.selectedOption)
            : null,
        );
      }

      let attemptedQuestions = 0;
      let correctAnswers = 0;
      let incorrectAnswers = 0;
      let scoreScaled = 0; // integer cents (marks * 100)

      for (const q of questions) {
        const selected = answerMap.get(q.id);
        const marksScaled = Math.round(Number(q.marks) * 100);
        const correctOpt = Number(q.correctOption);

        if (selected !== null && selected !== undefined) {
          attemptedQuestions++;
          if (selected === correctOpt) {
            correctAnswers++;
            scoreScaled += marksScaled;
          } else {
            incorrectAnswers++;
          }
        }
      }

      const score = Math.round(scoreScaled) / 100;
      const totalMarks = Number(assessment.totalMarks);
      const passingMarks = Number(assessment.passingMarks);

      let percentage = 0;
      if (totalMarks > 0) {
        percentage = Math.round(((score / totalMarks) * 100) * 100) / 100;
        if (percentage > 100) {
          percentage = 100;
        }
      }
      const isPassing = score >= passingMarks;

      // 8. Insert into assessment_results with ON CONFLICT ("attemptId") DO NOTHING
      const insertedRows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO "assessment_results" (
           "id", "schoolId", "assessmentId", "attemptId", "studentId",
           "totalQuestions", "attemptedQuestions", "correctAnswers", "incorrectAnswers",
           "score", "percentage", "isPassing", "createdAt", "updatedAt"
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT ("attemptId") DO NOTHING
         RETURNING *`,
        schoolId,
        attempt.assessmentId,
        attemptId,
        attempt.studentId,
        questions.length,
        attemptedQuestions,
        correctAnswers,
        incorrectAnswers,
        score,
        percentage,
        isPassing,
      );

      if (insertedRows.length > 0) {
        return this.mapResult(insertedRows[0]);
      }

      // If insert returned no rows due to a concurrent conflict, safely fetch winning row
      const winnerRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessment_results"
         WHERE "schoolId" = $1 AND "attemptId" = $2`,
        schoolId,
        attemptId,
      );
      return this.mapResult(winnerRows[0]);
    });
  }

  async finalizeAndScoreAttemptAtomic(
    schoolId: string,
    attemptId: string,
    targetStatus?: AttemptStatus,
    assessmentId?: string,
  ): Promise<{
    attempt: AssessmentAttemptRecord;
    result: AssessmentResultRecord;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Resolve assessmentId if not provided
      let targetAssessmentId = assessmentId;
      if (!targetAssessmentId) {
        const attemptLookup = await tx.$queryRawUnsafe<any[]>(
          `SELECT "assessmentId" FROM "assessment_attempts" WHERE "schoolId" = $1 AND "id" = $2`,
          schoolId,
          attemptId,
        );
        if (attemptLookup.length === 0) {
          throw new NotFoundException('Assessment attempt not found');
        }
        targetAssessmentId = attemptLookup[0].assessmentId;
      }

      // 2. Lock parent assessment row first with FOR SHARE to serialize against result release
      const assessmentRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "status", "totalMarks", "passingMarks"
         FROM "assessments"
         WHERE "schoolId" = $1 AND "id" = $2
         FOR SHARE`,
        schoolId,
        targetAssessmentId,
      );
      if (assessmentRows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = assessmentRows[0];

      if (
        assessment.status === 'RESULTS_RELEASED' ||
        assessment.status === 'ARCHIVED'
      ) {
        throw new BadRequestException(
          `Cannot finalize or score attempt: assessment results have already been released or the assessment is archived`,
        );
      }

      // 3. Lock attempt row with FOR UPDATE
      const attemptRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessment_attempts"
         WHERE "schoolId" = $1 AND "id" = $2
         FOR UPDATE`,
        schoolId,
        attemptId,
      );
      if (attemptRows.length === 0) {
        throw new NotFoundException('Assessment attempt not found');
      }
      const attempt = attemptRows[0];

      // 4. Finalize attempt if not already terminal
      let updatedAttempt = attempt;
      if (attempt.status !== 'SUBMITTED' && attempt.status !== 'TIMED_OUT') {
        const now = new Date();
        const deadlineAt = new Date(attempt.deadlineAt);
        let effectiveStatus = targetStatus || AttemptStatus.SUBMITTED;
        if (now >= deadlineAt) {
          effectiveStatus = AttemptStatus.TIMED_OUT;
        }

        const updateRes = await tx.$queryRawUnsafe<any[]>(
          `UPDATE "assessment_attempts"
           SET "status" = $3::"AttemptStatus",
               "submittedAt" = CURRENT_TIMESTAMP,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE "schoolId" = $1 AND "id" = $2
           RETURNING *`,
          schoolId,
          attemptId,
          effectiveStatus,
        );
        updatedAttempt = updateRes[0];
      }

      // 5. Check if result already exists (idempotency)
      const existingResults = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessment_results"
         WHERE "schoolId" = $1 AND "attemptId" = $2`,
        schoolId,
        attemptId,
      );
      if (existingResults.length > 0) {
        return {
          attempt: this.mapAttempt(updatedAttempt),
          result: this.mapResult(existingResults[0]),
        };
      }

      // 6. Calculate score from authoritative questions and answers
      const questions = await tx.$queryRawUnsafe<any[]>(
        `SELECT "id", "marks", "correctOption"
         FROM "assessment_questions"
         WHERE "schoolId" = $1 AND "assessmentId" = $2
         ORDER BY "orderIndex" ASC`,
        schoolId,
        targetAssessmentId,
      );

      const answers = await tx.$queryRawUnsafe<any[]>(
        `SELECT "questionId", "selectedOption"
         FROM "attempt_answers"
         WHERE "schoolId" = $1 AND "attemptId" = $2`,
        schoolId,
        attemptId,
      );

      const answerMap = new Map<string, number | null>();
      for (const a of answers) {
        answerMap.set(
          a.questionId,
          a.selectedOption !== null && a.selectedOption !== undefined
            ? Number(a.selectedOption)
            : null,
        );
      }

      let attemptedQuestions = 0;
      let correctAnswers = 0;
      let incorrectAnswers = 0;
      let scoreScaled = 0; // integer cents (marks * 100)

      for (const q of questions) {
        const selected = answerMap.get(q.id);
        const marksScaled = Math.round(Number(q.marks) * 100);
        const correctOpt = Number(q.correctOption);

        if (selected !== null && selected !== undefined) {
          attemptedQuestions++;
          if (selected === correctOpt) {
            correctAnswers++;
            scoreScaled += marksScaled;
          } else {
            incorrectAnswers++;
          }
        }
      }

      const score = Math.round(scoreScaled) / 100;
      const totalMarks = Number(assessment.totalMarks);
      const passingMarks = Number(assessment.passingMarks);

      let percentage = 0;
      if (totalMarks > 0) {
        percentage = Math.round(((score / totalMarks) * 100) * 100) / 100;
        if (percentage > 100) {
          percentage = 100;
        }
      }
      const isPassing = score >= passingMarks;

      // 7. Insert into assessment_results with ON CONFLICT ("attemptId") DO NOTHING
      const insertedRows = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO "assessment_results" (
           "id", "schoolId", "assessmentId", "attemptId", "studentId",
           "totalQuestions", "attemptedQuestions", "correctAnswers", "incorrectAnswers",
           "score", "percentage", "isPassing", "createdAt", "updatedAt"
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT ("attemptId") DO NOTHING
         RETURNING *`,
        schoolId,
        targetAssessmentId,
        attemptId,
        updatedAttempt.studentId,
        questions.length,
        attemptedQuestions,
        correctAnswers,
        incorrectAnswers,
        score,
        percentage,
        isPassing,
      );

      let finalResultRow = insertedRows[0];
      if (!finalResultRow) {
        const winnerRows = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "assessment_results"
           WHERE "schoolId" = $1 AND "attemptId" = $2`,
          schoolId,
          attemptId,
        );
        finalResultRow = winnerRows[0];
      }

      return {
        attempt: this.mapAttempt(updatedAttempt),
        result: this.mapResult(finalResultRow),
      };
    });
  }

  async findResultByAttemptId(
    schoolId: string,
    attemptId: string,
  ): Promise<AssessmentResultRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessment_results"
       WHERE "schoolId" = $1 AND "attemptId" = $2`,
      schoolId,
      attemptId,
    );
    return rows.length > 0 ? this.mapResult(rows[0]) : null;
  }

  async updateProgressionAtomic(data: {
    schoolId: string;
    studentId: string;
    assessmentId: string;
    chapterId: string | null;
    status: ProgressionAssessmentStatus;
    unlockedAt?: Date | null;
  }): Promise<StudentAssessmentProgressionRecord> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "student_assessment_progressions" (
         "id", "schoolId", "studentId", "assessmentId", "chapterId", "status", "unlockedAt", "createdAt", "updatedAt"
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5::"ProgressionAssessmentStatus", $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )
       ON CONFLICT ("studentId", "assessmentId")
       DO UPDATE SET
         "status" = CASE
           WHEN "student_assessment_progressions"."status" = 'OVERRIDDEN'::"ProgressionAssessmentStatus"
           THEN 'OVERRIDDEN'::"ProgressionAssessmentStatus"
           ELSE EXCLUDED."status"
         END,
         "unlockedAt" = COALESCE("student_assessment_progressions"."unlockedAt", EXCLUDED."unlockedAt"),
         "chapterId" = COALESCE(EXCLUDED."chapterId", "student_assessment_progressions"."chapterId"),
         "updatedAt" = CURRENT_TIMESTAMP
       RETURNING *`,
      data.schoolId,
      data.studentId,
      data.assessmentId,
      data.chapterId,
      data.status,
      data.unlockedAt ?? null,
    );
    return this.mapProgression(rows[0]);
  }

  async findProgressionByStudentAndAssessment(
    schoolId: string,
    studentId: string,
    assessmentId: string,
  ): Promise<StudentAssessmentProgressionRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "student_assessment_progressions"
       WHERE "schoolId" = $1 AND "studentId" = $2 AND "assessmentId" = $3`,
      schoolId,
      studentId,
      assessmentId,
    );
    return rows.length > 0 ? this.mapProgression(rows[0]) : null;
  }

  async findProgressionsByStudentAndChapter(
    schoolId: string,
    studentId: string,
    chapterId: string,
  ): Promise<StudentAssessmentProgressionRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "student_assessment_progressions"
       WHERE "schoolId" = $1 AND "studentId" = $2 AND "chapterId" = $3
       ORDER BY "createdAt" ASC`,
      schoolId,
      studentId,
      chapterId,
    );
    return rows.map((r) => this.mapProgression(r));
  }

  async findChapterAssessmentsForStudent(
    schoolId: string,
    chapterId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string | null,
  ): Promise<AssessmentDraftRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "assessments"
       WHERE "schoolId" = $1
         AND "chapterId" = $2
         AND "status" IN ('PUBLISHED'::"AssessmentStatus", 'CLOSED'::"AssessmentStatus", 'RESULTS_RELEASED'::"AssessmentStatus")
         AND "academicYearId" = $3
         AND "gradeId" = $4
         AND ("sectionId" IS NULL OR ($5::text IS NOT NULL AND "sectionId" = $5))
       ORDER BY "createdAt" ASC`,
      schoolId,
      chapterId,
      academicYearId,
      gradeId,
      sectionId,
    );
    return rows.map((r) => this.mapAssessment(r));
  }

  async releaseAssessmentResultsAtomic(
    schoolId: string,
    id: string,
  ): Promise<AssessmentDraftRecord> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessments" WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE`,
        schoolId,
        id,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status === 'RESULTS_RELEASED') {
        return this.mapAssessment(assessment);
      }

      if (assessment.status === 'DRAFT') {
        throw new BadRequestException('Cannot release results: assessment is in DRAFT status');
      }

      if (assessment.status === 'PUBLISHED') {
        throw new BadRequestException(
          'Cannot release results: assessment is still PUBLISHED. Close the assessment before releasing results.',
        );
      }

      if (assessment.status === 'ARCHIVED') {
        throw new BadRequestException('Cannot release results: assessment is ARCHIVED');
      }

      if (assessment.status !== 'CLOSED') {
        throw new BadRequestException(
          `Cannot release results: assessment is in ${assessment.status} status. Only CLOSED assessments may have results released.`,
        );
      }

      // 2. Atomically verify no attempts remain IN_PROGRESS before release
      const activeAttemptRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count
         FROM "assessment_attempts"
         WHERE "schoolId" = $1 AND "assessmentId" = $2 AND "status" = 'IN_PROGRESS'::"AttemptStatus"`,
        schoolId,
        id,
      );
      const activeCount = Number(activeAttemptRows[0]?.count ?? 0);
      if (activeCount > 0) {
        throw new BadRequestException(
          `Cannot release results: assessment has ${activeCount} active attempt(s) in progress. Wait for all attempts to be submitted or reach their deadlines before releasing results.`,
        );
      }

      // 3. Atomically verify no terminal attempts are missing required AssessmentResult
      const missingResultRows = await tx.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count
         FROM "assessment_attempts" a
         WHERE a."schoolId" = $1 AND a."assessmentId" = $2
           AND a."status" IN ('SUBMITTED'::"AttemptStatus", 'TIMED_OUT'::"AttemptStatus")
           AND NOT EXISTS (
             SELECT 1 FROM "assessment_results" r
             WHERE r."schoolId" = a."schoolId" AND r."attemptId" = a."id"
           )`,
        schoolId,
        id,
      );
      const missingCount = Number(missingResultRows[0]?.count ?? 0);
      if (missingCount > 0) {
        throw new BadRequestException(
          `Cannot release results: assessment has ${missingCount} finalized attempt(s) missing score calculation. Wait for scoring to complete before releasing results.`,
        );
      }

      const updatedRows = await tx.$queryRawUnsafe<any[]>(
        `UPDATE "assessments"
         SET "status" = 'RESULTS_RELEASED'::"AssessmentStatus",
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "schoolId" = $1 AND "id" = $2 AND "status" = 'CLOSED'::"AssessmentStatus"
         RETURNING *`,
        schoolId,
        id,
      );

      return this.mapAssessment(updatedRows[0]);
    });
  }

  async closeAssessmentAtomic(
    schoolId: string,
    id: string,
  ): Promise<AssessmentDraftRecord> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "assessments" WHERE "schoolId" = $1 AND "id" = $2 FOR UPDATE`,
        schoolId,
        id,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Assessment not found in this school');
      }
      const assessment = rows[0];

      if (assessment.status === 'CLOSED') {
        return this.mapAssessment(assessment);
      }

      if (assessment.status !== 'PUBLISHED') {
        throw new BadRequestException(
          `Cannot close assessment: assessment is in ${assessment.status} status. Only PUBLISHED assessments may be closed.`,
        );
      }

      const updatedRows = await tx.$queryRawUnsafe<any[]>(
        `UPDATE "assessments"
         SET "status" = 'CLOSED'::"AssessmentStatus",
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "schoolId" = $1 AND "id" = $2 AND "status" = 'PUBLISHED'::"AssessmentStatus"
         RETURNING *`,
        schoolId,
        id,
      );

      return this.mapAssessment(updatedRows[0]);
    });
  }

  async findParentStudentAssessmentHistory(
    schoolId: string,
    params: {
      studentId: string;
      academicYearId: string;
      gradeId: string;
      sectionId: string | null;
    },
  ): Promise<ParentStudentAssessmentHistoryRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         a."id",
         a."schoolId",
         a."academicYearId",
         a."gradeId",
         a."sectionId",
         a."chapterId",
         a."title",
         a."subject",
         a."mode",
         a."status",
         a."totalMarks",
         a."passingMarks",
         a."durationMinutes",
         a."startWindowAt",
         a."endWindowAt",
         a."createdAt",
         c."id" AS "joinedChapterId",
         c."chapterCode" AS "joinedChapterCode",
         c."title" AS "joinedChapterTitle",
         att."id" AS "attemptId",
         att."studentId" AS "attemptStudentId",
         att."status" AS "attemptStatus",
         att."submittedAt" AS "attemptSubmittedAt",
         res."totalQuestions" AS "resTotalQuestions",
         res."attemptedQuestions" AS "resAttemptedQuestions",
         res."correctAnswers" AS "resCorrectAnswers",
         res."incorrectAnswers" AS "resIncorrectAnswers",
         res."score" AS "resScore",
         res."percentage" AS "resPercentage",
         res."isPassing" AS "resIsPassing"
       FROM "assessments" a
       LEFT JOIN "assessment_chapters" c
         ON c."schoolId" = a."schoolId" AND c."id" = a."chapterId"
       LEFT JOIN "assessment_attempts" att
         ON att."schoolId" = a."schoolId" AND att."assessmentId" = a."id" AND att."studentId" = $5
       LEFT JOIN "assessment_results" res
         ON res."schoolId" = a."schoolId" AND res."attemptId" = att."id" AND res."studentId" = $5
       WHERE a."schoolId" = $1
         AND (
           (a."academicYearId" = $2 AND a."gradeId" = $3 AND (a."sectionId" IS NULL OR ($4::text IS NOT NULL AND a."sectionId" = $4)))
           OR att."id" IS NOT NULL
         )
         AND a."status" IN ('PUBLISHED'::"AssessmentStatus", 'CLOSED'::"AssessmentStatus", 'RESULTS_RELEASED'::"AssessmentStatus")
       ORDER BY a."startWindowAt" DESC NULLS LAST, a."createdAt" DESC
       LIMIT 200`,
      schoolId,
      params.academicYearId,
      params.gradeId,
      params.sectionId,
      params.studentId,
    );

    return rows.map((row) => {
      const hasAttempt = row.attemptId !== null && row.attemptId !== undefined;
      const isReleased = row.status === AssessmentStatus.RESULTS_RELEASED;
      const hasPersistedResult =
        hasAttempt &&
        isReleased &&
        row.resScore !== null &&
        row.resScore !== undefined;

      return {
        id: row.id,
        schoolId: row.schoolId,
        academicYearId: row.academicYearId,
        gradeId: row.gradeId,
        sectionId: row.sectionId ?? null,
        chapterId: row.joinedChapterId ?? row.chapterId ?? null,
        chapterCode: row.joinedChapterCode ?? null,
        chapterTitle: row.joinedChapterTitle ?? null,
        title: row.title,
        subject: row.subject,
        mode: row.mode as AssessmentMode,
        status: row.status as AssessmentStatus,
        totalMarks: Number(row.totalMarks),
        passingMarks: Number(row.passingMarks),
        durationMinutes: Number(row.durationMinutes),
        startWindowAt: row.startWindowAt ? new Date(row.startWindowAt) : null,
        endWindowAt: row.endWindowAt ? new Date(row.endWindowAt) : null,
        createdAt: new Date(row.createdAt),
        attempt: hasAttempt
          ? {
              id: row.attemptId,
              studentId: row.attemptStudentId ?? params.studentId,
              status: row.attemptStatus as AttemptStatus,
              submittedAt: row.attemptSubmittedAt
                ? new Date(row.attemptSubmittedAt)
                : null,
              result: hasPersistedResult
                ? {
                    attemptId: row.attemptId,
                    totalQuestions: Number(row.resTotalQuestions),
                    attemptedQuestions: Number(row.resAttemptedQuestions),
                    correctAnswers: Number(row.resCorrectAnswers),
                    incorrectAnswers: Number(row.resIncorrectAnswers),
                    score: Number(row.resScore),
                    percentage: Number(row.resPercentage),
                    isPassing: Boolean(row.resIsPassing),
                  }
                : null,
            }
          : null,
      };
    });
  }

  async findLeaderboardEntries(
    schoolId: string,
    assessmentId: string,
    pagination: { page: number; limit: number },
  ): Promise<{ entries: RawLeaderboardRow[]; totalCount: number }> {
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(100, Math.max(1, pagination.limit || 20));
    const offset = (page - 1) * limit;

    const countResult = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*)::int AS "totalCount"
       FROM "assessment_results" ar
       JOIN "assessments" a
         ON a."schoolId" = ar."schoolId" AND a."id" = ar."assessmentId"
       JOIN "students" s
         ON s."schoolId" = ar."schoolId" AND s."id" = ar."studentId"
       JOIN "assessment_attempts" att
         ON att."schoolId" = ar."schoolId" AND att."id" = ar."attemptId"
       WHERE ar."schoolId" = $1
         AND ar."assessmentId" = $2
         AND a."status" = 'RESULTS_RELEASED'::"AssessmentStatus"
         AND s."status" = 'ACTIVE'::"StudentStatus"
         AND att."status" IN ('SUBMITTED'::"AttemptStatus", 'TIMED_OUT'::"AttemptStatus")`,
      schoolId,
      assessmentId,
    );

    const totalCount = Number(countResult?.[0]?.totalCount ?? 0);

    if (totalCount === 0) {
      return { entries: [], totalCount: 0 };
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH ranked_results AS (
         SELECT
           ar."id" AS "resultId",
           ar."assessmentId",
           ar."studentId",
           ar."score",
           ar."percentage",
           ar."isPassing",
           ar."createdAt" AS "resultCreatedAt",
           s."firstName",
           s."lastName",
           RANK() OVER (ORDER BY ar."score" DESC)::int AS "rank",
           ROW_NUMBER() OVER (ORDER BY ar."score" DESC, ar."createdAt" ASC, ar."studentId" ASC)::int AS "position"
         FROM "assessment_results" ar
         JOIN "assessments" a
           ON a."schoolId" = ar."schoolId" AND a."id" = ar."assessmentId"
         JOIN "students" s
           ON s."schoolId" = ar."schoolId" AND s."id" = ar."studentId"
         JOIN "assessment_attempts" att
           ON att."schoolId" = ar."schoolId" AND att."id" = ar."attemptId"
         WHERE ar."schoolId" = $1
           AND ar."assessmentId" = $2
           AND a."status" = 'RESULTS_RELEASED'::"AssessmentStatus"
           AND s."status" = 'ACTIVE'::"StudentStatus"
           AND att."status" IN ('SUBMITTED'::"AttemptStatus", 'TIMED_OUT'::"AttemptStatus")
       )
       SELECT * FROM ranked_results
       ORDER BY "rank" ASC, "resultCreatedAt" ASC, "studentId" ASC
       LIMIT $3 OFFSET $4`,
      schoolId,
      assessmentId,
      limit,
      offset,
    );

    const entries: RawLeaderboardRow[] = rows.map((r) => ({
      resultId: r.resultId,
      assessmentId: r.assessmentId,
      studentId: r.studentId,
      score: Number(r.score),
      percentage: Number(r.percentage),
      isPassing: Boolean(r.isPassing),
      firstName: r.firstName,
      lastName: r.lastName,
      rank: Number(r.rank),
      position: r.position ? Number(r.position) : undefined,
      resultCreatedAt: new Date(r.resultCreatedAt),
    }));

    return { entries, totalCount };
  }

  async getSchoolExaminationSetting(
    schoolId: string,
  ): Promise<SchoolExaminationSettingRecord | null> {
    const row = await this.prisma.schoolExaminationSetting.findUnique({
      where: { schoolId },
    });
    if (!row) return null;
    return {
      id: row.id,
      schoolId: row.schoolId,
      showStudentNamesOnLeaderboards: Boolean(row.showStudentNamesOnLeaderboards),
      updatedByUserId: row.updatedByUserId ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async upsertSchoolExaminationSetting(
    schoolId: string,
    showStudentNamesOnLeaderboards: boolean,
    updatedByUserId: string,
  ): Promise<SchoolExaminationSettingRecord> {
    const row = await this.prisma.schoolExaminationSetting.upsert({
      where: { schoolId },
      create: {
        schoolId,
        showStudentNamesOnLeaderboards,
        updatedByUserId,
      },
      update: {
        showStudentNamesOnLeaderboards,
        updatedByUserId,
      },
    });
    return {
      id: row.id,
      schoolId: row.schoolId,
      showStudentNamesOnLeaderboards: Boolean(row.showStudentNamesOnLeaderboards),
      updatedByUserId: row.updatedByUserId ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async getPlatformLeaderboardMetrics(): Promise<PlatformSuperAdminLeaderboardMetricsDto> {
    const reportingSchools = await this.prisma.assessment.findMany({
      where: { status: 'RESULTS_RELEASED' },
      distinct: ['schoolId'],
      select: { schoolId: true },
    });

    const totalSchoolsReporting = reportingSchools.length;
    const reportingSchoolIds = reportingSchools.map((s) => s.schoolId);

    const [totalReleasedAssessments, totalEligibleResults, visibleSettingsCount] = await Promise.all([
      this.prisma.assessment.count({
        where: { status: 'RESULTS_RELEASED' },
      }),
      this.prisma.assessmentResult.count({
        where: {
          assessment: { status: 'RESULTS_RELEASED' },
        },
      }),
      reportingSchoolIds.length > 0
        ? this.prisma.schoolExaminationSetting.count({
            where: {
              schoolId: { in: reportingSchoolIds },
              showStudentNamesOnLeaderboards: true,
            },
          })
        : 0,
    ]);

    const schoolsWithNamesVisibleCount = visibleSettingsCount;
    const schoolsWithNamesMaskedCount = Math.max(
      0,
      totalSchoolsReporting - schoolsWithNamesVisibleCount,
    );

    return {
      totalSchoolsReporting,
      totalReleasedAssessments,
      totalEligibleResults,
      schoolsWithNamesVisibleCount,
      schoolsWithNamesMaskedCount,
    };
  }
}
