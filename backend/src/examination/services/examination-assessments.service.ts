import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { TeacherStatus, UserRole, ViolationEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import { CreateAssessmentDraftDto } from '../dto/create-assessment-draft.dto';
import { UpdateAssessmentDraftDto } from '../dto/update-assessment-draft.dto';
import { QueryAssessmentsDto } from '../dto/query-assessments.dto';
import {
  AssessmentDraftRecord,
  AssessmentMode,
  AssessmentStatus,
  AttemptStatus,
  AuthenticatedUser,
  getConfiguredViolationTypes,
  ReleaseResultsResponseDto,
} from '../types';
import { ExaminationStudentAttemptsService } from './examination-student-attempts.service';
import { NotificationOutboxService } from '../../notifications/outbox/notification-outbox.service';

@Injectable()
export class ExaminationAssessmentsService {
  private readonly logger = new Logger(ExaminationAssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXAMINATION_REPOSITORY)
    private readonly examRepo: IExaminationRepository,
    private readonly studentAttemptsService: ExaminationStudentAttemptsService,
    @Optional() private readonly notificationOutboxService?: NotificationOutboxService,
  ) {}

  /**
   * Role policy: routine examination authoring (create / edit / delete / publish /
   * close / release) belongs exclusively to TEACHER. SCHOOL_ADMIN and
   * PLATFORM_SUPER_ADMIN are monitoring-only. No exceptional-override path exists
   * because the platform currently has no persisted permission or audit store.
   */
  private assertTeacherAuthoring(user: AuthenticatedUser, action: string): void {
    if (user.role !== UserRole.TEACHER) {
      throw new ForbiddenException(
        `Access denied: only the authoring teacher may ${action}. Administrative roles are read-only for examinations.`,
      );
    }
  }

  /**
   * The school's current academic year (AcademicYear.isCurrent) is the single source of truth.
   * Any academicYearId supplied by a client must equal it.
   */
  private async assertCurrentAcademicYear(
    schoolId: string,
    academicYearId: string,
  ): Promise<void> {
    const current = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    if (!current) {
      throw new ForbiddenException(
        'No active academic year is configured for this school; assessments cannot be authored',
      );
    }
    if (current.id !== academicYearId) {
      throw new ForbiddenException(
        'Assessments may only be authored for the current active academic year',
      );
    }
  }

  /**
   * Helper: Validates academic year, grade, section, and chapter consistency.
   */
  private async validateAssessmentHierarchy(
    schoolId: string,
    academicYearId: string,
    gradeId: string,
    sectionId?: string | null,
    chapterId?: string | null,
    subject?: string,
    user?: AuthenticatedUser,
  ) {
    const [academicYear, grade] = await Promise.all([
      this.prisma.academicYear.findFirst({
        where: { schoolId, id: academicYearId },
      }),
      this.prisma.gradeClass.findFirst({
        where: { schoolId, id: gradeId },
      }),
    ]);

    if (!academicYear) {
      throw new NotFoundException('Academic year not found in this school');
    }
    if (!grade) {
      throw new NotFoundException('Grade class not found in this school');
    }

    if (sectionId) {
      const section = await this.prisma.section.findFirst({
        where: { schoolId, id: sectionId, gradeId },
      });
      if (!section) {
        throw new NotFoundException(
          'Section not found in the specified grade and school',
        );
      }
    }

    if (chapterId) {
      const chapter = await this.examRepo.findChapterById(schoolId, chapterId);
      if (!chapter) {
        throw new NotFoundException('Curriculum chapter not found in this school');
      }
      if (chapter.gradeId !== gradeId) {
        throw new BadRequestException('Chapter does not belong to the selected grade');
      }
      if (subject && chapter.subject.toLowerCase().trim() !== subject.toLowerCase().trim()) {
        throw new BadRequestException(
          `Chapter subject '${chapter.subject}' does not match assessment subject '${subject}'`,
        );
      }
      if (chapter.academicYearId && chapter.academicYearId !== academicYearId) {
        throw new BadRequestException('Chapter does not belong to the selected academic year');
      }
      if (user && user.role === UserRole.TEACHER) {
        const teacher = await this.prisma.teacher.findFirst({
          where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
        });
        if (teacher) {
          const isOwn = chapter.createdByTeacherId === teacher.id;
          const isLegacy = chapter.createdByTeacherId === null || chapter.createdByTeacherId === undefined;
          if (!isOwn && !isLegacy) {
            throw new ForbiddenException(
              'Access denied: You cannot use a chapter authored by another teacher',
            );
          }
        }
      }
    }

    return { academicYear, grade };
  }

  /**
   * Helper: Validates score bounds, duration bounds, and schedule window chronology.
   */
  private validateParametersAndWindows(
    totalMarks: number,
    passingMarks: number,
    durationMinutes: number,
    startWindowAt?: string | null,
    endWindowAt?: string | null,
  ) {
    if (totalMarks < 1.0) {
      throw new BadRequestException('totalMarks must be at least 1.00');
    }
    if (passingMarks < 0.0) {
      throw new BadRequestException('passingMarks cannot be negative');
    }
    if (passingMarks > totalMarks) {
      throw new BadRequestException(
        `passingMarks (${passingMarks}) cannot be greater than totalMarks (${totalMarks})`,
      );
    }
    if (durationMinutes < 1 || durationMinutes > 1440) {
      throw new BadRequestException(
        'durationMinutes must be between 1 and 1440 (24 hours)',
      );
    }

    if (startWindowAt && endWindowAt) {
      const start = new Date(startWindowAt);
      const end = new Date(endWindowAt);
      if (end <= start) {
        throw new BadRequestException('endWindowAt must be strictly later than startWindowAt');
      }
    }
  }

  /**
   * Helper: Resolves author teacher profile and verifies teaching assignment / grade-wide gate.
   */
  private async resolveTeacherAndAuthorize(
    schoolId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string | null | undefined,
    subject: string,
    user: AuthenticatedUser,
  ): Promise<string> {
    const normalizedSubject = subject.trim();

    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      if (!teacher) {
        throw new ForbiddenException('Active teacher profile not found for this account');
      }

      if (sectionId) {
        // Section-specific assessment: require assignment in this section
        const assignment = await this.prisma.teacherAssignment.findFirst({
          where: {
            schoolId,
            teacherId: teacher.id,
            academicYearId,
            gradeId,
            sectionId,
            subject: { equals: normalizedSubject, mode: 'insensitive' },
          },
        });
        if (!assignment) {
          throw new ForbiddenException(
            `Access denied: You are not assigned to teach ${normalizedSubject} in the selected grade and section`,
          );
        }
      } else {
        // Grade-wide assessment: teacher must be assigned to ALL sections of this grade
        const allSections = await this.prisma.section.findMany({
          where: { schoolId, gradeId },
          select: { id: true },
        });

        if (allSections.length === 0) {
          throw new ForbiddenException(
            'Cannot create grade-wide assessment: no sections exist for this grade',
          );
        }

        const teacherAssignments = await this.prisma.teacherAssignment.findMany({
          where: {
            schoolId,
            teacherId: teacher.id,
            academicYearId,
            gradeId,
            subject: { equals: normalizedSubject, mode: 'insensitive' },
          },
          select: { sectionId: true },
        });

        const assignedSectionIds = new Set(teacherAssignments.map((a) => a.sectionId));
        const allCovered = allSections.every((s) => assignedSectionIds.has(s.id));

        if (!allCovered) {
          throw new ForbiddenException(
            'Grade-wide assessment authoring requires teaching assignments across all sections of this grade or administrative authorization',
          );
        }
      }

      return teacher.id;
    }

    // Routine authoring is teacher-only. SCHOOL_ADMIN / PLATFORM_SUPER_ADMIN never author.
    throw new ForbiddenException('Access denied: You do not have permission to author assessments');
  }

  /**
   * Create a new draft assessment.
   */
  async createDraft(
    schoolId: string,
    dto: CreateAssessmentDraftDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentDraftRecord> {
    this.assertTeacherAuthoring(user, 'create assessments');

    // 0. Mandatory chapter check at service layer
    if (!dto.chapterId || typeof dto.chapterId !== 'string' || !dto.chapterId.trim()) {
      throw new BadRequestException('Chapter ID is required');
    }

    // 1. Validate academic hierarchy & chapter subject alignment and teacher chapter ownership
    await this.validateAssessmentHierarchy(
      schoolId,
      dto.academicYearId,
      dto.gradeId,
      dto.sectionId,
      dto.chapterId,
      dto.subject,
      user,
    );

    // 2. The academic year is never trusted from the client: it must be the school's current year
    await this.assertCurrentAcademicYear(schoolId, dto.academicYearId);

    // 3. Resolve author teacher and verify audience authorization
    const teacherId = await this.resolveTeacherAndAuthorize(
      schoolId,
      dto.academicYearId,
      dto.gradeId,
      dto.sectionId,
      dto.subject,
      user,
    );

    // 4. Validate marks, duration, and window bounds
    this.validateParametersAndWindows(
      dto.totalMarks,
      dto.passingMarks,
      dto.durationMinutes,
      dto.startWindowAt,
      dto.endWindowAt,
    );

    // 5. Create assessment strictly in DRAFT status
    return this.examRepo.createAssessmentDraft({
      schoolId,
      academicYearId: dto.academicYearId,
      gradeId: dto.gradeId,
      sectionId: dto.sectionId ?? null,
      teacherId,
      chapterId: dto.chapterId,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? null,
      subject: dto.subject.trim(),
      mode: dto.mode ?? AssessmentMode.NORMAL_QUIZ,
      status: AssessmentStatus.DRAFT,
      totalMarks: dto.totalMarks,
      passingMarks: dto.passingMarks,
      durationMinutes: dto.durationMinutes,
      startWindowAt: dto.startWindowAt ? new Date(dto.startWindowAt) : null,
      endWindowAt: dto.endWindowAt ? new Date(dto.endWindowAt) : null,
      shuffleQuestions: dto.shuffleQuestions ?? false,
      shuffleOptions: dto.shuffleOptions ?? false,
      enableProctoring: dto.enableProctoring ?? false,
      monitoringConfig: dto.monitoringConfig ?? null,
    });
  }

  /**
   * List assessments in caller school with optional filters.
   */
  async listAssessments(
    schoolId: string,
    query: QueryAssessmentsDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentDraftRecord[]> {
    let requestingTeacherId: string | undefined;

    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      requestingTeacherId = teacher?.id ?? '00000000-0000-0000-0000-000000000000';
    }

    return this.examRepo.findAssessments(schoolId, {
      status: query.status,
      gradeId: query.gradeId,
      subject: query.subject?.trim(),
      academicYearId: query.academicYearId,
      requestingTeacherId,
    });
  }

  /**
   * Retrieve a single assessment by ID.
   */
  async getAssessmentById(
    schoolId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentDraftRecord> {
    const assessment = await this.examRepo.findAssessmentById(schoolId, id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    // Teachers can only view their own drafts. Non-draft assessments are visible across teachers.
    if (user.role === UserRole.TEACHER && assessment.status === AssessmentStatus.DRAFT) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      if (!teacher || assessment.teacherId !== teacher.id) {
        throw new NotFoundException('Assessment not found in this school');
      }
    }

    return assessment;
  }

  /**
   * Update an assessment draft.
   */
  async updateDraft(
    schoolId: string,
    id: string,
    dto: UpdateAssessmentDraftDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentDraftRecord> {
    this.assertTeacherAuthoring(user, 'modify assessments');

    const existing = await this.examRepo.findAssessmentById(schoolId, id);
    if (!existing) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (existing.status !== AssessmentStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT assessments can be modified through this endpoint');
    }

    // Ownership check: teachers may only modify drafts they authored
    const ownerTeacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!ownerTeacher || existing.teacherId !== ownerTeacher.id) {
      throw new ForbiddenException('You may only modify assessments you authored');
    }

    // Compute effective values
    const effectiveYearId = dto.academicYearId ?? existing.academicYearId;
    const effectiveGradeId = dto.gradeId ?? existing.gradeId;
    const effectiveSectionId = dto.sectionId !== undefined ? dto.sectionId : existing.sectionId;
    const effectiveChapterId = dto.chapterId !== undefined ? dto.chapterId : existing.chapterId;
    const effectiveSubject = dto.subject?.trim() ?? existing.subject;
    const effectiveTotal = dto.totalMarks ?? existing.totalMarks;
    const effectivePassing = dto.passingMarks ?? existing.passingMarks;
    const effectiveDuration = dto.durationMinutes ?? existing.durationMinutes;
    const effectiveStart = dto.startWindowAt !== undefined
      ? dto.startWindowAt
      : existing.startWindowAt?.toISOString() ?? null;
    const effectiveEnd = dto.endWindowAt !== undefined
      ? dto.endWindowAt
      : existing.endWindowAt?.toISOString() ?? null;

    // Validate hierarchy and score parameters
    await this.validateAssessmentHierarchy(
      schoolId,
      effectiveYearId,
      effectiveGradeId,
      effectiveSectionId,
      effectiveChapterId,
      effectiveSubject,
      user,
    );

    // Drafts may only be edited while they belong to the current active academic year
    await this.assertCurrentAcademicYear(schoolId, effectiveYearId);

    this.validateParametersAndWindows(
      effectiveTotal,
      effectivePassing,
      effectiveDuration,
      effectiveStart,
      effectiveEnd,
    );

    // Re-verify teaching assignments for effective target fields
    await this.resolveTeacherAndAuthorize(
      schoolId,
      effectiveYearId,
      effectiveGradeId,
      effectiveSectionId,
      effectiveSubject,
      user,
    );

    return this.examRepo.updateAssessmentDraft(schoolId, id, {
      academicYearId: dto.academicYearId,
      gradeId: dto.gradeId,
      sectionId: dto.sectionId,
      chapterId: dto.chapterId,
      title: dto.title?.trim(),
      description: dto.description !== undefined ? dto.description?.trim() ?? null : undefined,
      subject: dto.subject?.trim(),
      mode: dto.mode,
      totalMarks: dto.totalMarks,
      passingMarks: dto.passingMarks,
      durationMinutes: dto.durationMinutes,
      startWindowAt: dto.startWindowAt ? new Date(dto.startWindowAt) : dto.startWindowAt === null ? null : undefined,
      endWindowAt: dto.endWindowAt ? new Date(dto.endWindowAt) : dto.endWindowAt === null ? null : undefined,
      shuffleQuestions: dto.shuffleQuestions,
      shuffleOptions: dto.shuffleOptions,
      enableProctoring: dto.enableProctoring,
      monitoringConfig: dto.monitoringConfig,
    });
  }

  /**
   * Delete an assessment draft.
   */
  async deleteDraft(
    schoolId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    this.assertTeacherAuthoring(user, 'delete assessments');

    const existing = await this.examRepo.findAssessmentById(schoolId, id);
    if (!existing) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (existing.status !== AssessmentStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT assessments can be deleted');
    }

    // Ownership check: teachers may only delete drafts they authored
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!teacher || existing.teacherId !== teacher.id) {
      throw new ForbiddenException('You may only delete assessments you authored');
    }

    // Safe deletion pre-flight checks: prevent deleting assessment with child questions or sections
    const [questionCount, sectionCount] = await Promise.all([
      this.examRepo.countChildQuestions(id),
      this.examRepo.countChildSections(id),
    ]);

    if (questionCount > 0) {
      throw new BadRequestException(
        `Cannot delete assessment with ${questionCount} existing question(s). Delete all questions first.`,
      );
    }

    if (sectionCount > 0) {
      throw new BadRequestException(
        `Cannot delete assessment with ${sectionCount} existing section(s). Delete all sections first.`,
      );
    }

    try {
      await this.examRepo.deleteAssessmentDraft(schoolId, id);
    } catch (error: any) {
      if (
        error?.code === '23503' ||
        error?.message?.includes('foreign key constraint') ||
        error?.message?.includes('violates foreign key') ||
        error?.message?.includes('is still referenced')
      ) {
        throw new ConflictException(
          'Cannot delete assessment: dependent child questions or sections exist or were added concurrently',
        );
      }
      if (
        error?.code === 'P0001' ||
        error?.message?.includes('Only DRAFT assessments may be deleted')
      ) {
        throw new ConflictException(
          'Cannot delete assessment: assessment is not in DRAFT status',
        );
      }
      throw error;
    }

    return { success: true, message: 'Assessment draft deleted successfully' };
  }

  /**
   * POST /api/v1/examination/assessments/:id/publish
   * Publish an assessment draft atomically.
   */
  async publishAssessment(
    schoolId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentDraftRecord> {
    this.assertTeacherAuthoring(user, 'publish assessments');

    const existing = await this.examRepo.findAssessmentById(schoolId, id);
    if (!existing) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (existing.status === AssessmentStatus.PUBLISHED) {
      throw new ConflictException('Assessment is already published');
    }

    if (existing.status !== AssessmentStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot publish assessment: Assessment is in ${existing.status} status. Only DRAFT assessments may be published.`,
      );
    }

    // 1. Author ownership check
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!teacher || existing.teacherId !== teacher.id) {
      throw new ForbiddenException('You may only publish assessments you authored');
    }

    // 2. Draft must still belong to the current active academic year
    await this.assertCurrentAcademicYear(schoolId, existing.academicYearId);

    // 3. Revalidate teaching assignments for assessment target fields
    const teacherId = await this.resolveTeacherAndAuthorize(
      schoolId,
      existing.academicYearId,
      existing.gradeId,
      existing.sectionId,
      existing.subject,
      user,
    );

    const published = await this.examRepo.publishAssessment(schoolId, id, teacherId);

    // Stage examination schedule notifications asynchronously/transactionally
    if (this.notificationOutboxService) {
      try {
        const targetWhere: any = {
          schoolId,
          gradeId: existing.gradeId,
          academicYearId: existing.academicYearId,
          status: 'ACTIVE',
        };
        if (existing.sectionId) {
          targetWhere.sectionId = existing.sectionId;
        }

        const enrolledStudents = await this.prisma.student.findMany({
          where: targetWhere,
          include: {
            userAccount: true,
            parentRelations: {
              where: { schoolId, isVerified: true },
              include: { parent: true },
            },
            school: { select: { name: true } },
            grade: { select: { name: true } },
            section: { select: { name: true } },
          },
        });

        const schoolSetting = await this.prisma.schoolNotificationSetting.findUnique({
          where: { schoolId },
        });
        const examScheduleEmailEnabled = schoolSetting
          ? ((schoolSetting as any).examScheduleEmailEnabled ?? true)
          : true;

        const schoolName = enrolledStudents[0]?.school?.name || 'School';

        await this.prisma.$transaction(async (tx) => {
          for (const s of enrolledStudents) {
            const verifiedRel = s.parentRelations.find((r) => r.isVerified && r.parent?.email);
            const candidateEmail = s.userAccount?.email || verifiedRel?.parent?.email || s.guardianEmail;

            const isSkipped = !candidateEmail || !examScheduleEmailEnabled;
            const skipReason = !candidateEmail
              ? 'NO_VALID_RECIPIENT_EMAIL'
              : !examScheduleEmailEnabled
              ? 'EVENT_DISABLED_BY_SCHOOL_SETTING:examScheduleEmailEnabled'
              : null;

            const idempotencyKey = `EXAM_SCHEDULE:${schoolId}:${id}:${s.id}`;

            await tx.notificationOutbox.upsert({
              where: {
                schoolId_idempotencyKey: {
                  schoolId,
                  idempotencyKey,
                },
              },
              create: {
                schoolId,
                channel: 'EMAIL',
                eventType: 'EXAM_SCHEDULE_PUBLISHED' as any,
                recipientEmail: candidateEmail || null,
                recipientName: `${s.firstName} ${s.lastName}`.trim(),
                idempotencyKey,
                status: isSkipped ? 'SKIPPED' : 'PENDING',
                templateKey: 'EXAM_SCHEDULE_PUBLISHED',
                templateData: {
                  schoolName,
                  studentName: `${s.firstName} ${s.lastName}`.trim(),
                  assessmentTitle: existing.title,
                  subjectName: existing.subject,
                  gradeName: s.grade?.name,
                  sectionName: s.section?.name,
                  startDate: existing.startWindowAt ? existing.startWindowAt.toISOString().split('T')[0] : undefined,
                  durationMinutes: existing.durationMinutes,
                  totalMarks: existing.totalMarks,
                  passingMarks: existing.passingMarks,
                  instructions: existing.description || undefined,
                },
                skippedAt: isSkipped ? new Date() : null,
                skipReason,
              },
              update: {},
            });
          }
        });
      } catch (err: any) {
        this.logger.error(`Failed to stage EXAM_SCHEDULE_PUBLISHED outbox: ${err.message}`);
      }
    }

    return published;
  }

  /**
   * POST /api/v1/examination/assessments/:id/release-results
   * Atomically release results for a CLOSED assessment.
   */
  async releaseResults(
    schoolId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<ReleaseResultsResponseDto> {
    this.assertTeacherAuthoring(user, 'release results');

    const existing = await this.examRepo.findAssessmentById(schoolId, id);
    if (!existing) {
      throw new NotFoundException('Assessment not found in this school');
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!teacher || existing.teacherId !== teacher.id) {
      throw new ForbiddenException('You may only release results for assessments you authored');
    }

    // Idempotent early check
    if (existing.status === AssessmentStatus.RESULTS_RELEASED) {
      return {
        success: true,
        message: 'Assessment results have already been released',
        assessmentId: existing.id,
        status: AssessmentStatus.RESULTS_RELEASED,
        releasedAt: existing.updatedAt,
        alreadyReleased: true,
      };
    }

    if (existing.status === AssessmentStatus.DRAFT) {
      throw new BadRequestException('Cannot release results: assessment is in DRAFT status');
    }

    if (existing.status === AssessmentStatus.PUBLISHED) {
      throw new BadRequestException(
        'Cannot release results: assessment is still PUBLISHED. Close the assessment before releasing results.',
      );
    }

    if (existing.status === AssessmentStatus.ARCHIVED) {
      throw new BadRequestException('Cannot release results: assessment is ARCHIVED');
    }

    if (existing.status !== AssessmentStatus.CLOSED) {
      throw new BadRequestException(
        `Cannot release results: assessment is in ${existing.status} status. Only CLOSED assessments may have results released.`,
      );
    }

    // FINDING-03: Reconcile any abandoned or expired IN_PROGRESS attempts before atomic release
    await this.studentAttemptsService.reconcileExpiredAttemptsForAssessment(schoolId, id);

    const released = await this.examRepo.releaseAssessmentResultsAtomic(schoolId, id);

    // Stage examination results notifications for completed attempts
    if (this.notificationOutboxService) {
      try {
        const attempts = await this.prisma.assessmentAttempt.findMany({
          where: {
            schoolId,
            assessmentId: id,
            status: 'SUBMITTED',
          },
          include: {
            student: {
              include: {
                userAccount: true,
                parentRelations: {
                  where: { schoolId, isVerified: true },
                  include: { parent: true },
                },
                grade: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
            assessment: { select: { title: true, subject: true, totalMarks: true } },
            result: true,
          },
        });

        const school = await this.prisma.school.findUnique({
          where: { id: schoolId },
          select: { name: true },
        });

        const schoolSetting = await this.prisma.schoolNotificationSetting.findUnique({
          where: { schoolId },
        });
        const examResultsEmailEnabled = schoolSetting
          ? ((schoolSetting as any).examResultsEmailEnabled ?? true)
          : true;

        const schoolName = school?.name || 'School';

        await this.prisma.$transaction(async (tx) => {
          for (const att of attempts) {
            const s = att.student;
            const verifiedRel = s.parentRelations.find((r) => r.isVerified && r.parent?.email);
            const candidateEmail = s.userAccount?.email || verifiedRel?.parent?.email || s.guardianEmail;

            const isSkipped = !candidateEmail || !examResultsEmailEnabled;
            const skipReason = !candidateEmail
              ? 'NO_VALID_RECIPIENT_EMAIL'
              : !examResultsEmailEnabled
              ? 'EVENT_DISABLED_BY_SCHOOL_SETTING:examResultsEmailEnabled'
              : null;

            const idempotencyKey = `EXAM_RESULTS:${schoolId}:${id}:${s.id}`;

            await tx.notificationOutbox.upsert({
              where: {
                schoolId_idempotencyKey: {
                  schoolId,
                  idempotencyKey,
                },
              },
              create: {
                schoolId,
                channel: 'EMAIL',
                eventType: 'EXAM_RESULTS_RELEASED' as any,
                recipientEmail: candidateEmail || null,
                recipientName: `${s.firstName} ${s.lastName}`.trim(),
                idempotencyKey,
                status: isSkipped ? 'SKIPPED' : 'PENDING',
                templateKey: 'EXAM_RESULTS_RELEASED',
                templateData: {
                  schoolName,
                  studentName: `${s.firstName} ${s.lastName}`.trim(),
                  admissionNumber: s.admissionNumber,
                  assessmentTitle: att.assessment.title,
                  subjectName: att.assessment.subject,
                  gradeName: s.grade?.name,
                  sectionName: s.section?.name,
                  score: att.result?.score ? Number(att.result.score) : 0,
                  totalMarks: Number(att.assessment.totalMarks),
                  percentage: att.result?.percentage ? Number(att.result.percentage) : undefined,
                  gradeAwarded: att.result?.isPassing ? 'PASS' : 'FAIL',
                  releasedAt: new Date().toISOString().split('T')[0],
                },
                skippedAt: isSkipped ? new Date() : null,
                skipReason,
              },
              update: {},
            });
          }
        });
      } catch (err: any) {
        this.logger.error(`Failed to stage EXAM_RESULTS_RELEASED outbox: ${err.message}`);
      }
    }

    return {
      success: true,
      message: 'Assessment results released successfully',
      assessmentId: released.id,
      status: released.status,
      releasedAt: released.updatedAt,
      alreadyReleased: false,
    };
  }

  /**
   * POST /api/v1/examination/assessments/:id/close
   * Close a PUBLISHED assessment.
   */
  async closeAssessment(
    schoolId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<AssessmentDraftRecord> {
    this.assertTeacherAuthoring(user, 'close assessments');

    const existing = await this.examRepo.findAssessmentById(schoolId, id);
    if (!existing) {
      throw new NotFoundException('Assessment not found in this school');
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!teacher || existing.teacherId !== teacher.id) {
      throw new ForbiddenException('You may only close assessments you authored');
    }

    if (existing.status !== AssessmentStatus.PUBLISHED) {
      throw new BadRequestException(
        `Cannot close assessment: assessment is in ${existing.status} status. Only PUBLISHED assessments may be closed.`,
      );
    }

    return this.examRepo.closeAssessmentAtomic(schoolId, id);
  }

  /**
   * GET /api/v1/examination/assessments/:id/attempts
   * Retrieve minimal attempt summaries for an assessment (teacher-authorized).
   */
  async listAssessmentAttempts(
    schoolId: string,
    assessmentId: string,
    user: AuthenticatedUser,
  ) {
    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      if (!teacher || assessment.teacherId !== teacher.id) {
        throw new ForbiddenException('You may only view attempts for assessments you authored');
      }
    }

    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { schoolId, assessmentId },
      orderBy: { startedAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            rollNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        violationEvents: {
          select: {
            id: true,
            eventType: true,
            dismissed: true,
          },
        },
      },
    });

    const monitoringConfig = (assessment.monitoringConfig as any) || {};
    const maxAllowed = monitoringConfig.maxWarnings ?? 3;
    const configuredTypes = getConfiguredViolationTypes(monitoringConfig);

    return attempts.map((att) => {
      let activeMisconductViolations = 0;
      let activeViolations = 0;
      let activeObjectDetections = 0;
      for (const ev of att.violationEvents) {
        if (!ev.dismissed) {
          activeViolations++;
          if (configuredTypes.includes(ev.eventType as any)) {
            activeMisconductViolations++;
          }
          if (ev.eventType === ViolationEventType.OBJECT_DETECTED) {
            activeObjectDetections++;
          }
        }
      }

      const isLocked =
        Boolean(assessment.enableProctoring) &&
        activeMisconductViolations >= maxAllowed &&
        att.status === AttemptStatus.IN_PROGRESS;

      const studentName =
        [att.student?.firstName, att.student?.lastName].filter(Boolean).join(' ') ||
        'Unknown Student';

      return {
        id: att.id,
        studentId: att.studentId,
        studentName,
        admissionNumber: att.student?.admissionNumber || null,
        rollNumber: att.student?.rollNumber || null,
        status: att.status,
        warningCount: activeMisconductViolations,
        totalViolationsCount: activeViolations,
        maxWarnings: maxAllowed,
        isLocked,
        flaggedForReview: att.flaggedForReview,
        startedAt: att.startedAt,
        deadlineAt: att.deadlineAt,
        submittedAt: att.submittedAt,
      };
    });
  }

  /**
   * GET /api/v1/examination/assessments/:id/attempts/:attemptId/integrity-audit
   * Retrieve proctoring audit log, preflight check status, and violation timeline for an attempt.
   */
  async getAttemptIntegrityAudit(
    schoolId: string,
    assessmentId: string,
    attemptId: string,
    user: AuthenticatedUser,
  ) {
    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      if (!teacher || assessment.teacherId !== teacher.id) {
        throw new ForbiddenException('You may only view integrity audits for assessments you authored');
      }
    }

    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { schoolId, assessmentId, id: attemptId },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            rollNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        violationEvents: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    const monitoringConfig = (assessment.monitoringConfig as any) || {};
    const maxAllowed = monitoringConfig.maxWarnings ?? 3;
    const configuredTypes = getConfiguredViolationTypes(monitoringConfig);

    const eventCounts: Record<string, number> = {};
    let activeViolations = 0;
    let activeMisconductViolations = 0;
    let activeObjectDetections = 0;
    for (const event of attempt.violationEvents) {
      eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
      if (!event.dismissed) {
        activeViolations++;
        if (configuredTypes.includes(event.eventType as any)) {
          activeMisconductViolations++;
        }
        if (event.eventType === ViolationEventType.OBJECT_DETECTED) {
          activeObjectDetections++;
        }
      }
    }

    const isLocked =
      assessment.enableProctoring &&
      activeMisconductViolations >= maxAllowed &&
      attempt.status === AttemptStatus.IN_PROGRESS;

    return {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        deadlineAt: attempt.deadlineAt,
        submittedAt: attempt.submittedAt,
        proctoringPassed: attempt.proctoringPassed,
        preflightData: attempt.preflightData,
        flaggedForReview: attempt.flaggedForReview,
        studentExplanation: attempt.studentExplanation,
        isLocked,
        activeMisconductViolations,
        maxAllowed,
      },
      assessment: {
        id: assessment.id,
        title: assessment.title,
        enableProctoring: assessment.enableProctoring,
        monitoringConfig: assessment.monitoringConfig,
      },
      student: attempt.student,
      events: attempt.violationEvents,
      summary: {
        totalEvents: attempt.violationEvents.length,
        activeViolations,
        activeMisconductViolations,
        maxAllowed,
        isLocked,
        eventCounts,
      },
    };
  }

  /**
   * PATCH /api/v1/examination/assessments/:id/attempts/:attemptId/integrity-audit/:eventId/dismiss
   * Dismiss an integrity violation event (false positive review).
   */
  async dismissViolationEvent(
    schoolId: string,
    assessmentId: string,
    attemptId: string,
    eventId: string,
    user: AuthenticatedUser,
  ) {
    this.assertTeacherAuthoring(user, 'review and dismiss violations');

    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!teacher || assessment.teacherId !== teacher.id) {
      throw new ForbiddenException('You may only dismiss violations for assessments you authored');
    }

    const event = await this.prisma.assessmentViolationEvent.findFirst({
      where: { schoolId, assessmentId, attemptId, id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Violation event not found');
    }

    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { schoolId, assessmentId, id: attemptId },
    });
    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    const updatedEvent = await this.prisma.assessmentViolationEvent.update({
      where: { id: event.id },
      data: { dismissed: true },
    });

    const monitoringConfig = (assessment.monitoringConfig as any) || {};
    const maxAllowed = monitoringConfig.maxWarnings ?? 3;
    const configuredTypes = getConfiguredViolationTypes(monitoringConfig);

    const remainingActive = await this.prisma.assessmentViolationEvent.count({
      where: { schoolId, attemptId, dismissed: false },
    });

    const remainingMisconduct = await this.prisma.assessmentViolationEvent.count({
      where: { schoolId, attemptId, dismissed: false, eventType: { in: configuredTypes as any } },
    });

    const remainingObjectDetections = await this.prisma.assessmentViolationEvent.count({
      where: { schoolId, attemptId, dismissed: false, eventType: ViolationEventType.OBJECT_DETECTED },
    });

    const isLocked =
      assessment.enableProctoring &&
      remainingMisconduct >= maxAllowed &&
      attempt.status === AttemptStatus.IN_PROGRESS;

    if (remainingActive === 0) {
      await this.prisma.assessmentAttempt.update({
        where: { id: attemptId },
        data: { flaggedForReview: false },
      });
    }

    return {
      success: true,
      dismissedEventId: updatedEvent.id,
      remainingActiveViolations: remainingActive,
      remainingMisconductViolations: remainingMisconduct,
      isLocked,
    };
  }

  /**
   * PATCH /api/v1/examination/assessments/:id/attempts/:attemptId/unlock
   * Teacher reviews and unlocks a locked attempt by dismissing active violation events.
   */
  async unlockAttempt(
    schoolId: string,
    assessmentId: string,
    attemptId: string,
    user: AuthenticatedUser,
  ) {
    this.assertTeacherAuthoring(user, 'review and unlock attempts');

    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!teacher || assessment.teacherId !== teacher.id) {
      throw new ForbiddenException('You may only unlock attempts for assessments you authored');
    }

    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { schoolId, assessmentId, id: attemptId },
    });
    if (!attempt) {
      throw new NotFoundException('Assessment attempt not found');
    }

    // Dismiss active violation events
    await this.prisma.assessmentViolationEvent.updateMany({
      where: { schoolId, attemptId, dismissed: false },
      data: { dismissed: true },
    });

    // Unflag attempt
    await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: { flaggedForReview: false },
    });

    return {
      success: true,
      message: 'Attempt has been reviewed and unlocked by teacher',
      attemptId,
      isLocked: false,
    };
  }
}
