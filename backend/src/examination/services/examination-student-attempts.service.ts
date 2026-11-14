import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import {
  AssessmentAttemptRecord,
  AssessmentDraftRecord,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
  getConfiguredViolationTypes,
  ParentAssessmentHistoryItemDto,
  ParentStudentAssessmentHistoryResponseDto,
  QuestionImageArtifactRecord,
  StudentAssessmentOverviewDto,
  StudentAttemptDetailDto,
  StudentResultSummaryDto,
  StudentResultViewDto,
  StudentSanitizedQuestionDto,
  SubmitAttemptResponseDto,
  ViolationEventType,
} from '../types';
import { SaveAnswerDto } from '../dto/save-answer.dto';
import { RecordViolationEventDto } from '../dto/record-violation-event.dto';
import { PreflightCompleteDto, StudentExplanationDto } from '../dto/preflight-check.dto';
import { ExaminationProgressionService } from './examination-progression.service';

@Injectable()
export class ExaminationStudentAttemptsService {
  private readonly logger = new Logger(ExaminationStudentAttemptsService.name);
  private readonly lastViolationTimestamps = new Map<string, number>();
  private readonly downloadSampleBuffer: Buffer = crypto.randomBytes(250 * 1024);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXAMINATION_REPOSITORY)
    private readonly examRepo: IExaminationRepository,
    private readonly progressionService: ExaminationProgressionService,
  ) {}

  getDownloadSampleBuffer(): Buffer {
    return this.downloadSampleBuffer;
  }

  private async resolveActiveStudent(schoolId: string, userId: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        schoolId,
        userId,
        status: 'ACTIVE',
      },
    });

    if (!student) {
      throw new ForbiddenException(
        'Active student profile not found for this account in this school',
      );
    }

    return student;
  }

  /**
   * Helper to count distinct persisted, non-dismissed misconduct violation events of configured types.
   */
  async countActiveMisconductViolations(
    schoolId: string,
    attemptId: string,
    monitoringConfig: any,
  ): Promise<number> {
    const configuredTypes = getConfiguredViolationTypes(monitoringConfig);
    if (configuredTypes.length === 0) return 0;

    return this.prisma.assessmentViolationEvent.count({
      where: {
        schoolId,
        attemptId,
        dismissed: false,
        eventType: { in: configuredTypes as any },
      },
    });
  }

  private async buildAttemptDetail(
    schoolId: string,
    assessment: AssessmentDraftRecord,
    attempt: AssessmentAttemptRecord,
  ): Promise<StudentAttemptDetailDto> {
    const [questions, images, answers] = await Promise.all([
      this.examRepo.findQuestionsByAssessmentId(schoolId, assessment.id),
      this.examRepo.findQuestionImagesByAssessmentId(schoolId, assessment.id),
      this.examRepo.findAttemptAnswers(schoolId, attempt.id),
    ]);

    const imageMap = new Map<string, QuestionImageArtifactRecord>();
    for (const img of images) {
      imageMap.set(img.questionId, img);
    }

    const sanitizedQuestions: StudentSanitizedQuestionDto[] = questions.map((q) => {
      const img = imageMap.get(q.id);
      return {
        id: q.id,
        sectionId: q.sectionId,
        orderIndex: q.orderIndex,
        questionText: q.questionText,
        options: q.options,
        marks: q.marks,
        hasImage: !!img,
        imageUrl: img
          ? `/api/v1/examination/assessments/${assessment.id}/questions/${q.id}/image`
          : null,
      };
    });

    const answerMap: Record<string, number | null> = {};
    for (const ans of answers) {
      answerMap[ans.questionId] = ans.selectedOption;
    }

    const now = new Date();
    let remainingSeconds = 0;
    if (attempt.status === AttemptStatus.IN_PROGRESS) {
      remainingSeconds = Math.max(
        0,
        Math.floor((attempt.deadlineAt.getTime() - now.getTime()) / 1000),
      );
    }

    let isLocked = false;
    let activeWarningsCount = 0;
    const monitoringConfig = (assessment.monitoringConfig as any) || {};
    const maxWarnings = monitoringConfig.maxWarnings ?? 3;

    if (assessment.enableProctoring) {
      activeWarningsCount = await this.countActiveMisconductViolations(
        schoolId,
        attempt.id,
        monitoringConfig,
      );

      if (
        activeWarningsCount >= maxWarnings &&
        attempt.status === AttemptStatus.IN_PROGRESS
      ) {
        isLocked = true;
      }
    }

    return {
      id: attempt.id,
      assessmentId: assessment.id,
      studentId: attempt.studentId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      remainingSeconds,
      submittedAt: attempt.submittedAt,
      enableProctoring: assessment.enableProctoring ?? false,
      monitoringConfig: assessment.monitoringConfig ?? null,
      proctoringPassed: (attempt as any).proctoringPassed ?? false,
      preflightData: (attempt as any).preflightData ?? null,
      flaggedForReview: (attempt as any).flaggedForReview ?? false,
      studentExplanation: (attempt as any).studentExplanation ?? null,
      isLocked,
      activeWarningsCount,
      maxWarnings,
      questions: sanitizedQuestions,
      answers: answerMap,
    };
  }

  async listAssessmentsForStudent(
    schoolId: string,
    user: any,
  ): Promise<StudentAssessmentOverviewDto[]> {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const assessments = await this.examRepo.findEligibleAssessmentsForStudent(
      schoolId,
      student.academicYearId,
      student.gradeId,
      student.sectionId,
      student.id,
    );

    const now = new Date();
    const results: StudentAssessmentOverviewDto[] = [];

    for (const assessment of assessments) {
      const attempt = await this.examRepo.findAttemptByStudentAndAssessment(
        schoolId,
        assessment.id,
        student.id,
      );

      // If no attempt exists, check schedule window: must have started and not closed
      if (!attempt) {
        if (assessment.status === AssessmentStatus.PUBLISHED) {
          if (assessment.startWindowAt && now < assessment.startWindowAt) {
            continue;
          }
          if (assessment.endWindowAt && now >= assessment.endWindowAt) {
            continue;
          }
        }
      }

      results.push({
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        subject: assessment.subject,
        mode: assessment.mode,
        status: assessment.status,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        durationMinutes: assessment.durationMinutes,
        startWindowAt: assessment.startWindowAt,
        endWindowAt: assessment.endWindowAt,
        enableProctoring: assessment.enableProctoring ?? false,
        monitoringConfig: assessment.monitoringConfig ?? null,
        hasAttempt: !!attempt,
        attemptStatus: attempt ? attempt.status : null,
        attemptId: attempt ? attempt.id : null,
        proctoringPassed: (attempt as any)?.proctoringPassed ?? false,
      });
    }

    return results;
  }

  async startAssessment(
    schoolId: string,
    assessmentId: string,
    user: any,
  ): Promise<StudentAttemptDetailDto> {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (assessment.status !== 'PUBLISHED') {
      throw new BadRequestException('Assessment is not published');
    }

    if (
      assessment.academicYearId !== student.academicYearId ||
      assessment.gradeId !== student.gradeId
    ) {
      throw new ForbiddenException(
        'Assessment is not assigned to your grade or academic year',
      );
    }

    if (assessment.sectionId && assessment.sectionId !== student.sectionId) {
      throw new ForbiddenException('Assessment is not assigned to your section');
    }

    const now = new Date();
    if (assessment.startWindowAt && now < assessment.startWindowAt) {
      throw new BadRequestException('Assessment schedule window has not started yet');
    }
    if (assessment.endWindowAt && now >= assessment.endWindowAt) {
      throw new BadRequestException('Assessment schedule window has expired');
    }

    // Check if an attempt already exists
    const existingAttempt = await this.examRepo.findAttemptByStudentAndAssessment(
      schoolId,
      assessmentId,
      student.id,
    );

    if (existingAttempt) {
      if (
        existingAttempt.status === AttemptStatus.IN_PROGRESS &&
        now >= existingAttempt.deadlineAt
      ) {
        const { attempt: finalized } = await this.examRepo.finalizeAndScoreAttemptAtomic(
          schoolId,
          existingAttempt.id,
          AttemptStatus.TIMED_OUT,
          assessmentId,
        );
        await this.progressionService.resolveAssessmentProgression(
          schoolId,
          student.id,
          assessmentId,
        );
        return this.buildAttemptDetail(schoolId, assessment, finalized);
      }
      return this.buildAttemptDetail(schoolId, assessment, existingAttempt);
    }

    // Calculate deadline = min(now + duration, endWindowAt)
    const startedAt = now;
    let deadlineAt = new Date(startedAt.getTime() + assessment.durationMinutes * 60 * 1000);
    if (assessment.endWindowAt && assessment.endWindowAt < deadlineAt) {
      deadlineAt = assessment.endWindowAt;
    }

    const attempt = await this.examRepo.createAttemptAtomic({
      schoolId,
      assessmentId,
      studentId: student.id,
      startedAt,
      deadlineAt,
    });

    return this.buildAttemptDetail(schoolId, assessment, attempt);
  }

  async getAttempt(
    schoolId: string,
    attemptId: string,
    user: any,
  ): Promise<StudentAttemptDetailDto> {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    let attempt = await this.examRepo.findAttemptById(schoolId, attemptId);

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    if (attempt.studentId !== student.id) {
      throw new ForbiddenException('You do not have permission to access this attempt');
    }

    const now = new Date();
    if (attempt.status === AttemptStatus.IN_PROGRESS && now >= attempt.deadlineAt) {
      const res = await this.examRepo.finalizeAndScoreAttemptAtomic(
        schoolId,
        attempt.id,
        AttemptStatus.TIMED_OUT,
        attempt.assessmentId,
      );
      attempt = res.attempt;
      await this.progressionService.resolveAssessmentProgression(
        schoolId,
        student.id,
        attempt.assessmentId,
      );
    }

    const assessment = await this.examRepo.findAssessmentById(
      schoolId,
      attempt.assessmentId,
    );
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return this.buildAttemptDetail(schoolId, assessment, attempt);
  }

  async saveAnswer(
    schoolId: string,
    attemptId: string,
    questionId: string,
    dto: SaveAnswerDto,
    user: any,
  ): Promise<{ success: boolean; questionId: string; selectedOption: number | null }> {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const attempt = await this.examRepo.findAttemptById(schoolId, attemptId);

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    if (attempt.studentId !== student.id) {
      throw new ForbiddenException('You do not have permission to access this attempt');
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot save answer: attempt is already ${attempt.status.toLowerCase()}`,
      );
    }

    const assessment = await this.examRepo.findAssessmentById(
      schoolId,
      attempt.assessmentId,
    );
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (
      assessment.status === AssessmentStatus.RESULTS_RELEASED ||
      assessment.status === AssessmentStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        `Cannot save answer: assessment is in ${assessment.status} status`,
      );
    }

    const now = new Date();
    if (now >= attempt.deadlineAt) {
      await this.examRepo.finalizeAndScoreAttemptAtomic(
        schoolId,
        attempt.id,
        AttemptStatus.TIMED_OUT,
        attempt.assessmentId,
      );
      await this.progressionService.resolveAssessmentProgression(
        schoolId,
        student.id,
        attempt.assessmentId,
      );
      throw new BadRequestException(
        'Assessment attempt has expired and is now timed out',
      );
    }

    if (assessment.enableProctoring) {
      const monitoringConfig = (assessment.monitoringConfig as any) || {};
      const maxAllowed = monitoringConfig.maxWarnings ?? 3;
      const activeMisconductViolations = await this.countActiveMisconductViolations(
        schoolId,
        attempt.id,
        monitoringConfig,
      );
      if (activeMisconductViolations >= maxAllowed) {
        throw new ForbiddenException(
          `Assessment attempt is locked due to reaching the integrity warning limit (${activeMisconductViolations}/${maxAllowed}). Further answer changes are disabled. Please contact your teacher.`,
        );
      }
    }

    const question = await this.examRepo.findQuestionById(
      schoolId,
      attempt.assessmentId,
      questionId,
    );
    if (!question) {
      throw new NotFoundException('Question not found in this assessment');
    }

    const saved = await this.examRepo.saveAttemptAnswerAtomic({
      schoolId,
      assessmentId: attempt.assessmentId,
      attemptId: attempt.id,
      questionId,
      selectedOption: dto.selectedOption,
    });

    return {
      success: true,
      questionId: saved.questionId,
      selectedOption: saved.selectedOption,
    };
  }

  async submitAttempt(
    schoolId: string,
    attemptId: string,
    user: any,
  ): Promise<SubmitAttemptResponseDto> {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const attempt = await this.examRepo.findAttemptById(schoolId, attemptId);

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    if (attempt.studentId !== student.id) {
      throw new ForbiddenException('You do not have permission to access this attempt');
    }

    const assessment = await this.examRepo.findAssessmentById(
      schoolId,
      attempt.assessmentId,
    );
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (
      assessment.status === AssessmentStatus.RESULTS_RELEASED ||
      assessment.status === AssessmentStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        'Cannot submit attempt: assessment results have already been released',
      );
    }

    if (
      attempt.status === AttemptStatus.SUBMITTED ||
      attempt.status === AttemptStatus.TIMED_OUT
    ) {
      // Idempotent recovery: ensure result exists atomically without duplicate insert
      await this.examRepo.finalizeAndScoreAttemptAtomic(
        schoolId,
        attempt.id,
        attempt.status,
        attempt.assessmentId,
      );
      await this.progressionService.resolveAssessmentProgression(
        schoolId,
        student.id,
        attempt.assessmentId,
      );
      return {
        success: true,
        attemptId: attempt.id,
        status: attempt.status,
        submittedAt: attempt.submittedAt || attempt.updatedAt,
        message: `Assessment attempt is already ${attempt.status.toLowerCase()}`,
      };
    }

    const now = new Date();
    const targetStatus =
      now >= attempt.deadlineAt ? AttemptStatus.TIMED_OUT : AttemptStatus.SUBMITTED;

    const { attempt: finalized } = await this.examRepo.finalizeAndScoreAttemptAtomic(
      schoolId,
      attempt.id,
      targetStatus,
      attempt.assessmentId,
    );

    await this.progressionService.resolveAssessmentProgression(
      schoolId,
      student.id,
      attempt.assessmentId,
    );

    return {
      success: true,
      attemptId: finalized.id,
      status: finalized.status,
      submittedAt: finalized.submittedAt || finalized.updatedAt,
      message:
        finalized.status === AttemptStatus.TIMED_OUT
          ? 'Assessment attempt timed out'
          : 'Assessment attempt submitted successfully',
    };
  }

  /**
   * GET /api/v1/examination/student/assessments/:assessmentId/result
   * Authorized result viewing for authenticated student once assessment is RESULTS_RELEASED.
   */
  async getStudentAssessmentResult(
    schoolId: string,
    assessmentId: string,
    user: any,
  ): Promise<StudentResultViewDto> {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (assessment.status !== AssessmentStatus.RESULTS_RELEASED) {
      throw new ForbiddenException('Assessment results have not been released yet');
    }

    let attempt = await this.examRepo.findAttemptByStudentAndAssessment(
      schoolId,
      assessmentId,
      student.id,
    );

    if (!attempt) {
      if (
        assessment.academicYearId !== student.academicYearId ||
        assessment.gradeId !== student.gradeId ||
        (assessment.sectionId && assessment.sectionId !== student.sectionId)
      ) {
        throw new ForbiddenException('You do not have access to this assessment');
      }

      return {
        assessmentId: assessment.id,
        title: assessment.title,
        subject: assessment.subject,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        hasAttempt: false,
        result: null,
        message: 'No attempt was submitted for this assessment',
      };
    }

    const result = await this.examRepo.findResultByAttemptId(schoolId, attempt.id);
    if (!result) {
      this.logger.warn(
        `[ResultIntegrity] Student ${student.id} requested result for assessment ${assessment.id} (attempt ${attempt.id}, status: ${attempt.status}), but no persisted result was found post-release.`,
      );
      return {
        assessmentId: assessment.id,
        title: assessment.title,
        subject: assessment.subject,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        hasAttempt: true,
        result: null,
        message: 'Result is not available for this attempt',
      };
    }

    return {
      assessmentId: assessment.id,
      title: assessment.title,
      subject: assessment.subject,
      totalMarks: assessment.totalMarks,
      passingMarks: assessment.passingMarks,
      hasAttempt: true,
      result: {
        attemptId: attempt.id,
        totalQuestions: result.totalQuestions,
        attemptedQuestions: result.attemptedQuestions,
        correctAnswers: result.correctAnswers,
        incorrectAnswers: result.incorrectAnswers,
        score: result.score,
        percentage: result.percentage,
        isPassing: result.isPassing,
        submittedAt: attempt.submittedAt,
      },
    };
  }

  private async resolveVerifiedActiveLinkedStudent(
    schoolId: string,
    studentId: string,
    user: any,
  ) {
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    if (user.role !== 'PARENT') {
      throw new ForbiddenException(
        'Access denied: Only parent accounts can access this endpoint',
      );
    }

    if (!schoolId || (user.schoolId && user.schoolId !== schoolId)) {
      throw new ForbiddenException(
        'Cross-tenant access forbidden: User membership does not match requested school',
      );
    }

    const relation = await this.prisma.parentStudentRelation.findFirst({
      where: {
        schoolId,
        parentId: user.id,
        studentId,
        isVerified: true,
      },
      include: {
        student: true,
      },
    });

    if (
      !relation ||
      !relation.student ||
      (relation.student.schoolId && relation.student.schoolId !== schoolId) ||
      relation.student.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        'You do not have a verified active relationship with this student in this school',
      );
    }

    return relation.student;
  }

  /**
   * GET /api/v1/examination/parent/students/:studentId/assessments
   * Authorized examination history for a verified active linked child.
   */
  async getParentStudentAssessments(
    schoolId: string,
    studentId: string,
    user: any,
  ): Promise<ParentStudentAssessmentHistoryResponseDto> {
    const student = await this.resolveVerifiedActiveLinkedStudent(
      schoolId,
      studentId,
      user,
    );

    const allowedStatuses: AssessmentStatus[] = [
      AssessmentStatus.PUBLISHED,
      AssessmentStatus.CLOSED,
      AssessmentStatus.RESULTS_RELEASED,
    ];

    const rawAssessments =
      typeof this.examRepo.findParentStudentAssessmentHistory === 'function'
        ? await this.examRepo.findParentStudentAssessmentHistory(schoolId, {
            studentId: student.id,
            academicYearId: student.academicYearId,
            gradeId: student.gradeId,
            sectionId: student.sectionId ?? null,
          })
        : [];

    const eligibleAssessments = (rawAssessments || []).filter((a: any) => {
      if (a.schoolId && a.schoolId !== schoolId) return false;
      if (!allowedStatuses.includes(a.status as AssessmentStatus)) return false;

      const hasAttempt =
        a.attemptId ||
        (a.attempt && (!a.attempt.studentId || a.attempt.studentId === student.id)) ||
        (Array.isArray(a.attempts) &&
          a.attempts.some(
            (att: any) => !att.studentId || att.studentId === student.id,
          ));

      if (!hasAttempt) {
        if (a.academicYearId && a.academicYearId !== student.academicYearId) {
          return false;
        }
        if (a.gradeId && a.gradeId !== student.gradeId) return false;
        if (a.sectionId && a.sectionId !== student.sectionId) return false;
      }
      return true;
    });

    const assessments: ParentAssessmentHistoryItemDto[] =
      eligibleAssessments.map((a: any) => {
        const candidateAttempt =
          a.attempt ??
          (Array.isArray(a.attempts)
            ? a.attempts.find(
                (att: any) => !att.studentId || att.studentId === student.id,
              ) ?? null
            : null);

        const matchingAttempt =
          candidateAttempt &&
          (!candidateAttempt.studentId ||
            candidateAttempt.studentId === student.id)
            ? candidateAttempt
            : null;

        const assessmentStatus = a.status as AssessmentStatus;
        const isReleased =
          assessmentStatus === AssessmentStatus.RESULTS_RELEASED;

        let releasedResultSummary: StudentResultSummaryDto | null = null;
        if (isReleased && matchingAttempt && matchingAttempt.result) {
          const r = matchingAttempt.result;
          releasedResultSummary = {
            attemptId: matchingAttempt.id,
            totalQuestions: Number(r.totalQuestions),
            attemptedQuestions: Number(r.attemptedQuestions),
            correctAnswers: Number(r.correctAnswers),
            incorrectAnswers: Number(r.incorrectAnswers),
            score: Number(r.score),
            percentage: Number(r.percentage),
            isPassing: Boolean(r.isPassing),
            submittedAt: matchingAttempt.submittedAt ?? null,
          };
        }

        return {
          assessmentId: a.id,
          title: a.title,
          subject: a.subject,
          chapterId: a.chapter?.id ?? a.chapterId ?? null,
          chapterCode: a.chapter?.chapterCode ?? a.chapterCode ?? null,
          chapterTitle: a.chapter?.title ?? a.chapterTitle ?? null,
          mode: a.mode as AssessmentMode,
          totalMarks: Number(a.totalMarks),
          passingMarks: Number(a.passingMarks),
          durationMinutes: Number(a.durationMinutes),
          startWindowAt: a.startWindowAt ?? null,
          endWindowAt: a.endWindowAt ?? null,
          assessmentStatus,
          hasAttempt: Boolean(matchingAttempt),
          attemptId: matchingAttempt ? matchingAttempt.id : null,
          attemptStatus: matchingAttempt
            ? (matchingAttempt.status as AttemptStatus)
            : null,
          submittedAt: matchingAttempt
            ? (matchingAttempt.submittedAt ?? null)
            : null,
          releasedResultSummary,
        };
      });

    return {
      studentId: student.id,
      assessments,
    };
  }

  /**
   * GET /api/v1/examination/parent/students/:studentId/assessments/:assessmentId/result
   * Authorized result viewing for verified parent once assessment is RESULTS_RELEASED.
   */
  async getParentAssessmentResult(
    schoolId: string,
    studentId: string,
    assessmentId: string,
    user: any,
  ): Promise<StudentResultViewDto> {
    const student = await this.resolveVerifiedActiveLinkedStudent(
      schoolId,
      studentId,
      user,
    );

    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (assessment.status !== AssessmentStatus.RESULTS_RELEASED) {
      throw new ForbiddenException('Assessment results have not been released yet');
    }

    let chapterCode: string | null = null;
    let chapterTitle: string | null = null;

    if (assessment.chapterId) {
      const chapter =
        typeof this.examRepo.findChapterById === 'function'
          ? await this.examRepo.findChapterById(schoolId, assessment.chapterId)
          : null;
      if (chapter) {
        chapterCode = chapter.chapterCode ?? null;
        chapterTitle = chapter.title ?? null;
      }
    }

    let attempt = await this.examRepo.findAttemptByStudentAndAssessment(
      schoolId,
      assessmentId,
      student.id,
    );

    if (!attempt) {
      if (
        assessment.academicYearId !== student.academicYearId ||
        assessment.gradeId !== student.gradeId ||
        (assessment.sectionId && assessment.sectionId !== student.sectionId)
      ) {
        throw new ForbiddenException('Student does not have access to this assessment');
      }

      return {
        assessmentId: assessment.id,
        title: assessment.title,
        subject: assessment.subject,
        chapterId: assessment.chapterId ?? null,
        chapterCode,
        chapterTitle,
        mode: assessment.mode,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        durationMinutes: assessment.durationMinutes,
        startWindowAt: assessment.startWindowAt ?? null,
        endWindowAt: assessment.endWindowAt ?? null,
        assessmentStatus: assessment.status,
        hasAttempt: false,
        attemptStatus: null,
        result: null,
        message: 'No attempt was submitted for this assessment',
      };
    }

    const result = await this.examRepo.findResultByAttemptId(schoolId, attempt.id);
    if (!result) {
      this.logger.warn(
        `[ResultIntegrity] Student ${student.id} requested result for assessment ${assessment.id} (attempt ${attempt.id}, status: ${attempt.status}), but no persisted result was found post-release.`,
      );
      return {
        assessmentId: assessment.id,
        title: assessment.title,
        subject: assessment.subject,
        chapterId: assessment.chapterId ?? null,
        chapterCode,
        chapterTitle,
        mode: assessment.mode,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        durationMinutes: assessment.durationMinutes,
        startWindowAt: assessment.startWindowAt ?? null,
        endWindowAt: assessment.endWindowAt ?? null,
        assessmentStatus: assessment.status,
        hasAttempt: true,
        attemptStatus: attempt.status,
        result: null,
        message: 'Result is not available for this attempt',
      };
    }

    return {
      assessmentId: assessment.id,
      title: assessment.title,
      subject: assessment.subject,
      chapterId: assessment.chapterId ?? null,
      chapterCode,
      chapterTitle,
      mode: assessment.mode,
      totalMarks: assessment.totalMarks,
      passingMarks: assessment.passingMarks,
      durationMinutes: assessment.durationMinutes,
      startWindowAt: assessment.startWindowAt ?? null,
      endWindowAt: assessment.endWindowAt ?? null,
      assessmentStatus: assessment.status,
      hasAttempt: true,
      attemptStatus: attempt.status,
      result: {
        attemptId: attempt.id,
        totalQuestions: result.totalQuestions,
        attemptedQuestions: result.attemptedQuestions,
        correctAnswers: result.correctAnswers,
        incorrectAnswers: result.incorrectAnswers,
        score: result.score,
        percentage: result.percentage,
        isPassing: result.isPassing,
        submittedAt: attempt.submittedAt,
      },
    };
  }

  /**
   * Reconcile abandoned/expired IN_PROGRESS attempts for an assessment.
   * Atomically finalizes them to TIMED_OUT and scores them before result release.
   */
  async reconcileExpiredAttemptsForAssessment(
    schoolId: string,
    assessmentId: string,
  ): Promise<{ reconciledCount: number }> {
    const expiredCandidates = await this.examRepo.findExpiredInProgressAttempts(
      schoolId,
      assessmentId,
    );

    let reconciledCount = 0;
    for (const candidate of expiredCandidates) {
      // Re-verify eligibility and finalize/score atomically
      const { attempt: finalized } = await this.examRepo.finalizeAndScoreAttemptAtomic(
        schoolId,
        candidate.id,
        AttemptStatus.TIMED_OUT,
        assessmentId,
      );

      // Reconcile syllabus progression safely
      await this.progressionService.resolveAssessmentProgression(
        schoolId,
        candidate.studentId,
        assessmentId,
      );

      if (finalized.status === AttemptStatus.TIMED_OUT) {
        reconciledCount++;
      }
    }

    return { reconciledCount };
  }

  /**
   * Complete student preflight readiness checks before or upon entering exam.
   */
  async completePreflightCheck(
    schoolId: string,
    attemptId: string,
    dto: PreflightCompleteDto,
    user: any,
  ) {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { schoolId, id: attemptId, studentId: student.id },
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Cannot complete preflight check on finalized attempt');
    }

    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        proctoringPassed: true,
        preflightData: dto.preflightData ? (dto.preflightData as any) : undefined,
      },
    });

    return {
      success: true,
      proctoringPassed: updated.proctoringPassed,
      preflightData: updated.preflightData,
    };
  }

  /**
   * Record a proctoring violation event (fullscreen exit, tab blur, etc.)
   */
  async recordViolationEvent(
    schoolId: string,
    attemptId: string,
    dto: RecordViolationEventDto,
    user: any,
  ) {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { schoolId, id: attemptId, studentId: student.id },
      include: { assessment: true },
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Cannot log event on finalized attempt');
    }

    // Rate-limiting check: debounce same event type within 2 seconds
    const throttleKey = `${attemptId}:${dto.eventType}`;
    const nowMs = Date.now();
    const lastTimestamp = this.lastViolationTimestamps.get(throttleKey) || 0;
    if (nowMs - lastTimestamp < 2000) {
      return {
        recorded: false,
        throttled: true,
        message: 'Throttled duplicate event',
      };
    }
    this.lastViolationTimestamps.set(throttleKey, nowMs);

    // Save event
    const event = await this.prisma.assessmentViolationEvent.create({
      data: {
        schoolId,
        assessmentId: attempt.assessmentId,
        attemptId: attempt.id,
        studentId: student.id,
        eventType: dto.eventType,
        durationMs: dto.durationMs ?? null,
        metadata: dto.metadata ? (dto.metadata as any) : undefined,
      },
    });

    // Check violation count against assessment threshold
    const totalViolations = await this.prisma.assessmentViolationEvent.count({
      where: { schoolId, attemptId: attempt.id, dismissed: false },
    });

    const monitoringConfig = (attempt.assessment.monitoringConfig as any) || {};
    const maxAllowed = monitoringConfig.maxWarnings ?? 3;

    // Count distinct persisted non-dismissed misconduct violation events of configured types
    const activeMisconductViolations = await this.countActiveMisconductViolations(
      schoolId,
      attempt.id,
      monitoringConfig,
    );

    // Check violation count against configured misconduct threshold
    const isLocked =
      attempt.assessment.enableProctoring &&
      activeMisconductViolations >= maxAllowed;

    // Flag for teacher review on lock or on object-detection alert (advisory for review without hard lock)
    let flaggedForReview = attempt.flaggedForReview;
    const shouldFlag = isLocked || event.eventType === ViolationEventType.OBJECT_DETECTED;
    if (shouldFlag && !attempt.flaggedForReview) {
      await this.prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: { flaggedForReview: true },
      });
      flaggedForReview = true;
    }

    return {
      recorded: true,
      eventId: event.id,
      eventType: event.eventType,
      totalViolations,
      activeMisconductViolations,
      maxAllowed,
      flaggedForReview,
      isLocked,
    };
  }

  /**
   * Record student explanation for flagged attempt.
   */
  async recordStudentExplanation(
    schoolId: string,
    attemptId: string,
    dto: StudentExplanationDto,
    user: any,
  ) {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { schoolId, id: attemptId, studentId: student.id },
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        studentExplanation: dto.explanation.trim(),
      },
    });

    return {
      success: true,
      attemptId: updated.id,
      studentExplanation: updated.studentExplanation,
    };
  }
}
