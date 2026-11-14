import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import {
  AssessmentDraftRecord,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
  ChapterProgressionSummaryDto,
  ProgressionAssessmentStatus,
  StudentAssessmentProgressionRecord,
  StudentChapterOptionDto,
} from '../types';

@Injectable()
export class ExaminationProgressionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXAMINATION_REPOSITORY)
    private readonly examRepo: IExaminationRepository,
  ) {}

  private isStatusResolved(status: ProgressionAssessmentStatus): boolean {
    return (
      status === ProgressionAssessmentStatus.RESOLVED_SUBMITTED ||
      status === ProgressionAssessmentStatus.RESOLVED_TIMED_OUT ||
      status === ProgressionAssessmentStatus.MISSED_UNATTEMPTED ||
      status === ProgressionAssessmentStatus.OVERRIDDEN
    );
  }

  async resolveActiveStudent(schoolId: string, userId: string) {
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
   * Evaluates progression for an individual assessment given the authoritative database state.
   */
  async evaluateAssessmentStatus(
    schoolId: string,
    studentId: string,
    assessment: AssessmentDraftRecord,
    now: Date = new Date(),
  ): Promise<ProgressionAssessmentStatus> {
    // 1. Check existing progression for OVERRIDDEN status
    const existingProg = await this.examRepo.findProgressionByStudentAndAssessment(
      schoolId,
      studentId,
      assessment.id,
    );
    if (existingProg && existingProg.status === ProgressionAssessmentStatus.OVERRIDDEN) {
      return ProgressionAssessmentStatus.OVERRIDDEN;
    }

    // 2. Check student's attempt
    let attempt = await this.examRepo.findAttemptByStudentAndAssessment(
      schoolId,
      assessment.id,
      studentId,
    );

    if (attempt) {
      if (attempt.status === AttemptStatus.SUBMITTED) {
        return ProgressionAssessmentStatus.RESOLVED_SUBMITTED;
      }

      if (attempt.status === AttemptStatus.TIMED_OUT) {
        return ProgressionAssessmentStatus.RESOLVED_TIMED_OUT;
      }

      if (attempt.status === AttemptStatus.IN_PROGRESS) {
        if (now >= attempt.deadlineAt) {
          const res = await this.examRepo.finalizeAndScoreAttemptAtomic(
            schoolId,
            attempt.id,
            AttemptStatus.TIMED_OUT,
            assessment.id,
          );
          attempt = res.attempt;
          return ProgressionAssessmentStatus.RESOLVED_TIMED_OUT;
        }
        return ProgressionAssessmentStatus.PENDING_OPEN;
      }
    }

    // 3. No attempt exists: evaluate window and status
    // Closed, released, archived, or past endWindow means MISSED_UNATTEMPTED
    if (
      assessment.status === AssessmentStatus.CLOSED ||
      assessment.status === AssessmentStatus.RESULTS_RELEASED ||
      assessment.status === AssessmentStatus.ARCHIVED ||
      (assessment.endWindowAt && now >= assessment.endWindowAt)
    ) {
      return ProgressionAssessmentStatus.MISSED_UNATTEMPTED;
    }

    // Schedule window is still open or hasn't started yet
    return ProgressionAssessmentStatus.PENDING_OPEN;
  }

  /**
   * Resolves and updates progression for an assessment after finalization.
   */
  async resolveAssessmentProgression(
    schoolId: string,
    studentId: string,
    assessmentId: string,
  ): Promise<StudentAssessmentProgressionRecord> {
    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const now = new Date();
    const evaluatedStatus = await this.evaluateAssessmentStatus(
      schoolId,
      studentId,
      assessment,
      now,
    );

    let unlockedAt: Date | null = null;

    if (assessment.chapterId) {
      // Find the student to get academicYear, grade, section
      const student = await this.prisma.student.findFirst({
        where: { schoolId, id: studentId, status: 'ACTIVE' },
      });

      if (student) {
        const chapterProgression = await this.getChapterProgressionForStudent(
          schoolId,
          assessment.chapterId,
          student,
          now,
        );
        unlockedAt = chapterProgression.unlockedAt;
      }
    }

    return this.examRepo.updateProgressionAtomic({
      schoolId,
      studentId,
      assessmentId,
      chapterId: assessment.chapterId,
      status: evaluatedStatus,
      unlockedAt,
    });
  }

  /**
   * Internal method to evaluate and update chapter progression for a known student.
   */
  async getChapterProgressionForStudent(
    schoolId: string,
    chapterId: string,
    student: {
      id: string;
      academicYearId: string;
      gradeId: string;
      sectionId: string | null;
    },
    now: Date = new Date(),
  ): Promise<ChapterProgressionSummaryDto> {
    const chapter = await this.examRepo.findChapterById(schoolId, chapterId);
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    if (chapter.gradeId !== student.gradeId) {
      throw new ForbiddenException('Chapter is not assigned to your grade');
    }

    // Find all configured published/closed assessments for this chapter and student
    const assessments = await this.examRepo.findChapterAssessmentsForStudent(
      schoolId,
      chapterId,
      student.academicYearId,
      student.gradeId,
      student.sectionId,
    );

    // Rule: If no assessment modes are configured for a chapter, no gate applies (unlocked)
    if (assessments.length === 0) {
      return {
        chapterId,
        isUnlocked: true,
        unlockedAt: null,
        configuredModes: [],
        assessments: [],
      };
    }

    const configuredModes = Array.from(new Set(assessments.map((a) => a.mode)));

    // Check existing progressions for this chapter
    const existingProgressions =
      await this.examRepo.findProgressionsByStudentAndChapter(
        schoolId,
        student.id,
        chapterId,
      );

    // Check if chapter was already unlocked
    const alreadyUnlockedRecord = existingProgressions.find(
      (p) => p.unlockedAt !== null,
    );
    const wasAlreadyUnlocked = !!alreadyUnlockedRecord;
    const existingUnlockedAt = alreadyUnlockedRecord?.unlockedAt ?? null;

    // Evaluate each configured assessment
    const items: {
      assessmentId: string;
      mode: AssessmentMode;
      title: string;
      status: ProgressionAssessmentStatus;
      resolved: boolean;
    }[] = [];

    for (const assessment of assessments) {
      const status = await this.evaluateAssessmentStatus(
        schoolId,
        student.id,
        assessment,
        now,
      );
      items.push({
        assessmentId: assessment.id,
        mode: assessment.mode,
        title: assessment.title,
        status,
        resolved: this.isStatusResolved(status),
      });
    }

    // Chapter gating check:
    // All configured assessments must be resolved.
    // If was already unlocked, maintain unlocked state per policy requirement.
    const allResolved = items.every((item) => item.resolved);
    const isUnlocked = wasAlreadyUnlocked || allResolved;
    const unlockedAt = isUnlocked ? (existingUnlockedAt || now) : null;

    // Persist progression updates for all configured assessments
    for (const item of items) {
      await this.examRepo.updateProgressionAtomic({
        schoolId,
        studentId: student.id,
        assessmentId: item.assessmentId,
        chapterId,
        status: item.status,
        unlockedAt,
      });
    }

    return {
      chapterId,
      isUnlocked,
      unlockedAt,
      configuredModes,
      assessments: items,
    };
  }

  /**
   * Lists curriculum chapters available to the authenticated student,
   * securely scoped to the student's school, grade, and academic year.
   */
  async listChaptersForStudent(
    schoolId: string,
    user: any,
  ): Promise<StudentChapterOptionDto[]> {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    const chapters = await this.examRepo.findChapters(schoolId, {
      gradeId: student.gradeId,
      academicYearId: student.academicYearId,
    });
    return chapters.map((c) => ({
      id: c.id,
      chapterCode: c.chapterCode,
      title: c.title,
      subject: c.subject,
      orderIndex: c.orderIndex,
    }));
  }

  /**
   * On-demand resolution of chapter progression for an authenticated student.
   */
  async getChapterProgression(
    schoolId: string,
    chapterId: string,
    user: any,
  ): Promise<ChapterProgressionSummaryDto> {
    const student = await this.resolveActiveStudent(schoolId, user.id);
    return this.getChapterProgressionForStudent(schoolId, chapterId, student);
  }
}
