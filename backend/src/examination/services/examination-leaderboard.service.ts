import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TeacherStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import { QueryLeaderboardDto } from '../dto/query-leaderboard.dto';
import { UpdateLeaderboardPrivacyDto } from '../dto/update-leaderboard-privacy.dto';
import {
  AssessmentStatus,
  AuthenticatedUser,
  LeaderboardEntryDto,
  LeaderboardPrivacySettingResponseDto,
  LeaderboardResponseDto,
  PlatformSuperAdminLeaderboardMetricsDto,
} from '../types';

@Injectable()
export class ExaminationLeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXAMINATION_REPOSITORY)
    private readonly examRepo: IExaminationRepository,
  ) {}

  /**
   * Helper: Resolves and validates an active student profile in the school.
   */
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
   * Helper: Resolves and validates a verified active parent-child relationship.
   */
  private async resolveVerifiedActiveLinkedStudent(
    schoolId: string,
    studentId: string,
    user: AuthenticatedUser,
  ) {
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    if (user.role !== UserRole.PARENT) {
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
   * GET /api/v1/examination/student/assessments/:assessmentId/leaderboard
   */
  async getStudentLeaderboard(
    schoolId: string,
    assessmentId: string,
    query: QueryLeaderboardDto,
    user: AuthenticatedUser,
  ): Promise<LeaderboardResponseDto> {
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Access denied: Student role required');
    }

    if (!schoolId || (user.schoolId && user.schoolId !== schoolId)) {
      throw new ForbiddenException('Cross-tenant access forbidden');
    }

    const student = await this.resolveActiveStudent(schoolId, user.id);

    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (assessment.status !== AssessmentStatus.RESULTS_RELEASED) {
      throw new ForbiddenException(
        'Leaderboard is not available until examination results are officially released',
      );
    }

    const attempt = await this.examRepo.findAttemptByStudentAndAssessment(
      schoolId,
      assessmentId,
      student.id,
    );

    if (!attempt) {
      if (
        assessment.academicYearId !== student.academicYearId ||
        assessment.gradeId !== student.gradeId ||
        (assessment.sectionId !== null && assessment.sectionId !== student.sectionId)
      ) {
        throw new ForbiddenException('Student is not eligible for this assessment');
      }
    }

    const setting = await this.examRepo.getSchoolExaminationSetting(schoolId);
    const showStudentNamesOnLeaderboards =
      setting?.showStudentNamesOnLeaderboards ?? false;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const { entries, totalCount } = await this.examRepo.findLeaderboardEntries(
      schoolId,
      assessmentId,
      { page, limit },
    );

    const mappedEntries: LeaderboardEntryDto[] = entries.map((entry, idx) => {
      const isCurrentUser = entry.studentId === student.id;
      const rank = Number(entry.rank);
      const position = entry.position
        ? Number(entry.position)
        : (page - 1) * limit + idx + 1;
      const studentName =
        isCurrentUser || showStudentNamesOnLeaderboards
          ? `${entry.firstName} ${entry.lastName}`.trim()
          : `Participant #${position}`;

      return {
        rank,
        studentName,
        score: Number(entry.score),
        percentage: Number(entry.percentage),
        isPassing: Boolean(entry.isPassing),
        isCurrentUser,
      };
    });

    const totalPages = Math.ceil(totalCount / limit) || 0;

    return {
      assessmentId: assessment.id,
      title: assessment.title,
      subject: assessment.subject,
      totalMarks: assessment.totalMarks,
      passingMarks: assessment.passingMarks,
      totalParticipants: totalCount,
      showStudentNamesOnLeaderboards,
      entries: mappedEntries,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  /**
   * GET /api/v1/examination/parent/students/:studentId/assessments/:assessmentId/leaderboard
   */
  async getParentLeaderboard(
    schoolId: string,
    studentId: string,
    assessmentId: string,
    query: QueryLeaderboardDto,
    user: AuthenticatedUser,
  ): Promise<LeaderboardResponseDto> {
    const child = await this.resolveVerifiedActiveLinkedStudent(
      schoolId,
      studentId,
      user,
    );

    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (assessment.status !== AssessmentStatus.RESULTS_RELEASED) {
      throw new ForbiddenException(
        'Leaderboard is not available until examination results are officially released',
      );
    }

    const attempt = await this.examRepo.findAttemptByStudentAndAssessment(
      schoolId,
      assessmentId,
      child.id,
    );

    if (!attempt) {
      if (
        assessment.academicYearId !== child.academicYearId ||
        assessment.gradeId !== child.gradeId ||
        (assessment.sectionId !== null && assessment.sectionId !== child.sectionId)
      ) {
        throw new ForbiddenException('Child is not eligible for this assessment');
      }
    }

    const setting = await this.examRepo.getSchoolExaminationSetting(schoolId);
    const showStudentNamesOnLeaderboards =
      setting?.showStudentNamesOnLeaderboards ?? false;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const { entries, totalCount } = await this.examRepo.findLeaderboardEntries(
      schoolId,
      assessmentId,
      { page, limit },
    );

    const mappedEntries: LeaderboardEntryDto[] = entries.map((entry, idx) => {
      const isCurrentUser = entry.studentId === child.id;
      const rank = Number(entry.rank);
      const position = entry.position
        ? Number(entry.position)
        : (page - 1) * limit + idx + 1;
      const studentName =
        isCurrentUser || showStudentNamesOnLeaderboards
          ? `${entry.firstName} ${entry.lastName}`.trim()
          : `Participant #${position}`;

      return {
        rank,
        studentName,
        score: Number(entry.score),
        percentage: Number(entry.percentage),
        isPassing: Boolean(entry.isPassing),
        isCurrentUser,
      };
    });

    const totalPages = Math.ceil(totalCount / limit) || 0;

    return {
      assessmentId: assessment.id,
      title: assessment.title,
      subject: assessment.subject,
      totalMarks: assessment.totalMarks,
      passingMarks: assessment.passingMarks,
      totalParticipants: totalCount,
      showStudentNamesOnLeaderboards,
      entries: mappedEntries,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  /**
   * GET /api/v1/examination/assessments/:assessmentId/leaderboard
   */
  async getStaffLeaderboard(
    schoolId: string,
    assessmentId: string,
    query: QueryLeaderboardDto,
    user: AuthenticatedUser,
  ): Promise<LeaderboardResponseDto> {
    if (
      user.role !== UserRole.TEACHER &&
      user.role !== UserRole.SCHOOL_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Teacher or School Admin role required');
    }

    if (!schoolId || (user.schoolId && user.schoolId !== schoolId)) {
      throw new ForbiddenException('Cross-tenant access forbidden');
    }

    const assessment = await this.examRepo.findAssessmentById(schoolId, assessmentId);
    if (!assessment) {
      throw new NotFoundException('Assessment not found in this school');
    }

    if (assessment.status !== AssessmentStatus.RESULTS_RELEASED) {
      throw new ForbiddenException(
        'Leaderboard is not available until examination results are officially released',
      );
    }

    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      if (!teacher) {
        throw new ForbiddenException('Active teacher profile not found for this account');
      }

      const isAuthor = assessment.teacherId === teacher.id;
      if (!isAuthor) {
        const normalizedSubject = assessment.subject.trim();
        if (assessment.sectionId) {
          const assignment = await this.prisma.teacherAssignment.findFirst({
            where: {
              schoolId,
              teacherId: teacher.id,
              academicYearId: assessment.academicYearId,
              gradeId: assessment.gradeId,
              sectionId: assessment.sectionId,
              subject: { equals: normalizedSubject, mode: 'insensitive' },
            },
          });
          if (!assignment) {
            throw new ForbiddenException(
              'You are not authorized to view the leaderboard for this assessment',
            );
          }
        } else {
          // Grade-wide assessment: teacher must have assignments across ALL sections of this grade
          const allSections = await this.prisma.section.findMany({
            where: { schoolId, gradeId: assessment.gradeId },
            select: { id: true },
          });

          if (allSections.length === 0) {
            throw new ForbiddenException(
              'Cannot access grade-wide assessment: no sections exist for this grade',
            );
          }

          const teacherAssignments = await this.prisma.teacherAssignment.findMany({
            where: {
              schoolId,
              teacherId: teacher.id,
              academicYearId: assessment.academicYearId,
              gradeId: assessment.gradeId,
              subject: { equals: normalizedSubject, mode: 'insensitive' },
            },
            select: { sectionId: true },
          });

          const assignedSectionIds = new Set(teacherAssignments.map((a) => a.sectionId));
          const allCovered = allSections.every((s) => assignedSectionIds.has(s.id));

          if (!allCovered) {
            throw new ForbiddenException(
              'Grade-wide assessment leaderboard access requires active teaching assignments across all sections of this grade',
            );
          }
        }
      }
    }

    const setting = await this.examRepo.getSchoolExaminationSetting(schoolId);
    const showStudentNamesOnLeaderboards =
      setting?.showStudentNamesOnLeaderboards ?? false;

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const { entries, totalCount } = await this.examRepo.findLeaderboardEntries(
      schoolId,
      assessmentId,
      { page, limit },
    );

    const mappedEntries: LeaderboardEntryDto[] = entries.map((entry) => ({
      rank: Number(entry.rank),
      studentName: `${entry.firstName} ${entry.lastName}`.trim(),
      score: Number(entry.score),
      percentage: Number(entry.percentage),
      isPassing: Boolean(entry.isPassing),
      isCurrentUser: false,
    }));

    const totalPages = Math.ceil(totalCount / limit) || 0;

    return {
      assessmentId: assessment.id,
      title: assessment.title,
      subject: assessment.subject,
      totalMarks: assessment.totalMarks,
      passingMarks: assessment.passingMarks,
      totalParticipants: totalCount,
      showStudentNamesOnLeaderboards,
      entries: mappedEntries,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }

  /**
   * GET /api/v1/examination/settings/leaderboard-privacy
   */
  async getLeaderboardPrivacySetting(
    schoolId: string,
    user: AuthenticatedUser,
  ): Promise<LeaderboardPrivacySettingResponseDto> {
    if (user.role !== UserRole.SCHOOL_ADMIN) {
      throw new ForbiddenException('Only school administrators can view privacy settings');
    }

    if (!schoolId || (user.schoolId && user.schoolId !== schoolId)) {
      throw new ForbiddenException('Cross-tenant access forbidden');
    }

    const setting = await this.examRepo.getSchoolExaminationSetting(schoolId);

    return {
      schoolId,
      showStudentNamesOnLeaderboards: setting?.showStudentNamesOnLeaderboards ?? false,
      updatedAt: setting?.updatedAt ?? null,
      updatedByUserId: setting?.updatedByUserId ?? null,
    };
  }

  /**
   * PATCH /api/v1/examination/settings/leaderboard-privacy
   */
  async updateLeaderboardPrivacySetting(
    schoolId: string,
    dto: UpdateLeaderboardPrivacyDto,
    user: AuthenticatedUser,
  ): Promise<LeaderboardPrivacySettingResponseDto> {
    if (user.role !== UserRole.SCHOOL_ADMIN) {
      throw new ForbiddenException('Only school administrators can update privacy settings');
    }

    if (!schoolId || (user.schoolId && user.schoolId !== schoolId)) {
      throw new ForbiddenException(
        'Cross-tenant access forbidden: Cannot update another school setting',
      );
    }

    if (typeof dto.showStudentNamesOnLeaderboards !== 'boolean') {
      throw new BadRequestException('showStudentNamesOnLeaderboards must be a boolean');
    }

    const setting = await this.examRepo.upsertSchoolExaminationSetting(
      schoolId,
      dto.showStudentNamesOnLeaderboards,
      user.id,
    );

    return {
      schoolId: setting.schoolId,
      showStudentNamesOnLeaderboards: setting.showStudentNamesOnLeaderboards,
      updatedAt: setting.updatedAt,
      updatedByUserId: setting.updatedByUserId,
    };
  }

  /**
   * GET /api/v1/examination/platform/leaderboard/metrics
   */
  async getPlatformLeaderboardMetrics(
    user: AuthenticatedUser,
  ): Promise<PlatformSuperAdminLeaderboardMetricsDto> {
    if (user.role !== UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only platform super administrators can access aggregate metrics',
      );
    }

    return this.examRepo.getPlatformLeaderboardMetrics();
  }
}
