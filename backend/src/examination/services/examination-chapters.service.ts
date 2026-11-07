import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeacherStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import { CreateChapterDto } from '../dto/create-chapter.dto';
import { QueryChaptersDto } from '../dto/query-chapters.dto';
import { AssessmentChapterRecord, AuthenticatedUser } from '../types';

@Injectable()
export class ExaminationChaptersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXAMINATION_REPOSITORY)
    private readonly examRepo: IExaminationRepository,
  ) {}

  /**
   * Create a curriculum chapter for a grade and subject.
   */
  async createChapter(
    schoolId: string,
    dto: CreateChapterDto,
    user: AuthenticatedUser,
  ): Promise<AssessmentChapterRecord> {
    // 1. Verify grade exists in caller school
    const grade = await this.prisma.gradeClass.findFirst({
      where: { schoolId, id: dto.gradeId },
    });
    if (!grade) {
      throw new NotFoundException('Grade class not found in this school');
    }

    const normalizedSubject = dto.subject.trim();
    const normalizedCode = dto.chapterCode.trim();

    // 2. Chapter authoring is teacher-only; administrative roles are read-only
    if (user.role !== UserRole.TEACHER) {
      throw new ForbiddenException(
        'Access denied: only assigned teachers may create curriculum chapters',
      );
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!teacher) {
      throw new ForbiddenException('Active teacher profile not found for this account');
    }

    // Require exactly one active academic year for the school
    let activeYears = await this.prisma.academicYear.findMany({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    if ((!activeYears || activeYears.length === 0) && typeof this.prisma.academicYear.findFirst === 'function') {
      const single = await this.prisma.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        select: { id: true },
      });
      if (single) {
        activeYears = [single];
      }
    }

    if (!activeYears || activeYears.length === 0) {
      throw new ForbiddenException(
        'No active academic year is configured for this school; chapters cannot be created',
      );
    }
    if (activeYears.length > 1) {
      throw new ConflictException(
        'Multiple active academic years are configured for this school; chapters cannot be created',
      );
    }
    const currentAcademicYear = activeYears[0];

    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: {
        schoolId,
        teacherId: teacher.id,
        academicYearId: currentAcademicYear.id,
        gradeId: dto.gradeId,
        subject: { equals: normalizedSubject, mode: 'insensitive' },
      },
    });
    if (!assignment) {
      throw new ForbiddenException(
        `Access denied: You are not assigned to teach ${normalizedSubject} in grade ${grade.name} for the current academic year`,
      );
    }

    // 3. Prevent duplicate chapter codes within school + academicYear + teacher + grade + subject
    const existing = await this.examRepo.findChapterByCode(
      schoolId,
      dto.gradeId,
      normalizedSubject,
      normalizedCode,
      currentAcademicYear.id,
      teacher.id,
    );
    if (existing) {
      throw new ConflictException(
        `Chapter with code '${normalizedCode}' already exists for this grade and subject in the current academic year`,
      );
    }

    return this.examRepo.createChapter({
      schoolId,
      academicYearId: currentAcademicYear.id,
      createdByTeacherId: teacher.id,
      gradeId: dto.gradeId,
      subject: normalizedSubject,
      chapterCode: normalizedCode,
      title: dto.title.trim(),
      orderIndex: dto.orderIndex ?? 0,
    });
  }

  /**
   * For teachers, resolves the (grade, subject) pairs they are assigned to in the
   * current active academic year. Returns null for non-teacher callers (no narrowing).
   */
  private async resolveTeacherScope(
    schoolId: string,
    user?: AuthenticatedUser,
  ): Promise<{ gradeId: string; subject: string }[] | null> {
    if (!user || user.role !== UserRole.TEACHER) {
      return null;
    }
    const teacher = await this.prisma.teacher.findFirst({
      where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
    });
    if (!teacher) {
      return [];
    }
    let activeYears = await this.prisma.academicYear.findMany({
      where: { schoolId, isCurrent: true },
      select: { id: true },
    });
    if ((!activeYears || activeYears.length === 0) && typeof this.prisma.academicYear.findFirst === 'function') {
      const single = await this.prisma.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        select: { id: true },
      });
      if (single) {
        activeYears = [single];
      }
    }
    if (!activeYears || activeYears.length !== 1) {
      return [];
    }
    const activeYear = activeYears[0];
    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { schoolId, teacherId: teacher.id, academicYearId: activeYear.id },
      select: { gradeId: true, subject: true },
    });
    return assignments;
  }

  private inScope(
    scope: { gradeId: string; subject: string }[],
    chapter: { gradeId: string; subject: string },
  ): boolean {
    return scope.some(
      (a) =>
        a.gradeId === chapter.gradeId &&
        a.subject.trim().toLowerCase() === chapter.subject.trim().toLowerCase(),
    );
  }

  /**
   * List syllabus chapters filtered by grade and subject. Teachers only receive
   * chapters for grade/subject pairs they are assigned to in the current academic year,
   * scoped to their own chapters and legacy institutional chapters.
   */
  async listChapters(
    schoolId: string,
    query: QueryChaptersDto,
    user?: AuthenticatedUser,
  ): Promise<AssessmentChapterRecord[]> {
    if (user?.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException(
        'Access denied: Platform super administrators cannot view curriculum chapters',
      );
    }

    if (user?.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      if (!teacher) {
        return [];
      }

      let activeYears = await this.prisma.academicYear.findMany({
        where: { schoolId, isCurrent: true },
        select: { id: true },
      });
      if ((!activeYears || activeYears.length === 0) && typeof this.prisma.academicYear.findFirst === 'function') {
        const single = await this.prisma.academicYear.findFirst({
          where: { schoolId, isCurrent: true },
          select: { id: true },
        });
        if (single) {
          activeYears = [single];
        }
      }
      if (!activeYears || activeYears.length !== 1) {
        return [];
      }
      const activeYear = activeYears[0];

      const assignments = await this.prisma.teacherAssignment.findMany({
        where: { schoolId, teacherId: teacher.id, academicYearId: activeYear.id },
        select: { gradeId: true, subject: true },
      });
      if (!assignments || assignments.length === 0) {
        return [];
      }

      const chapters = await this.examRepo.findChapters(schoolId, {
        gradeId: query.gradeId,
        subject: query.subject?.trim(),
        academicYearId: activeYear.id,
        requestingTeacherId: teacher.id,
      });

      return chapters.filter((c) => {
        if (!this.inScope(assignments, c)) {
          return false;
        }
        const isOwn = c.createdByTeacherId === teacher.id;
        const isLegacy = c.createdByTeacherId === null || c.createdByTeacherId === undefined;
        if (!isOwn && !isLegacy) {
          return false;
        }
        const isCurrentYear = c.academicYearId === activeYear.id;
        const isNullYear = c.academicYearId === null || c.academicYearId === undefined;
        if (!isCurrentYear && !isNullYear) {
          return false;
        }
        return true;
      });
    }

    // School Admin or monitoring callers:
    return this.examRepo.findChapters(schoolId, {
      gradeId: query.gradeId,
      subject: query.subject?.trim(),
    });
  }

  /**
   * Retrieve a single chapter by ID.
   */
  async getChapterById(
    schoolId: string,
    id: string,
    user?: AuthenticatedUser,
  ): Promise<AssessmentChapterRecord> {
    if (user?.role === UserRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException(
        'Access denied: Platform super administrators cannot view curriculum chapters',
      );
    }

    const chapter = await this.examRepo.findChapterById(schoolId, id);
    if (!chapter) {
      throw new NotFoundException('Chapter not found in this school');
    }

    if (user?.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { schoolId, userId: user.id, status: TeacherStatus.ACTIVE },
      });
      if (!teacher) {
        throw new NotFoundException('Chapter not found in this school');
      }

      const scope = await this.resolveTeacherScope(schoolId, user);
      if (!scope || !this.inScope(scope, chapter)) {
        throw new NotFoundException('Chapter not found in this school');
      }

      const isOwn = chapter.createdByTeacherId === teacher.id;
      const isLegacy = chapter.createdByTeacherId === null || chapter.createdByTeacherId === undefined;
      if (!isOwn && !isLegacy) {
        throw new NotFoundException('Chapter not found in this school');
      }
    }

    return chapter;
  }
}
