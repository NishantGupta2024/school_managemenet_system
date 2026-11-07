import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeacherStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExaminationLeaderboardService } from '../services/examination-leaderboard.service';
import {
  EXAMINATION_REPOSITORY,
  IExaminationRepository,
} from '../examination.repository.interface';
import {
  AssessmentDraftRecord,
  AssessmentMode,
  AssessmentStatus,
  AuthenticatedUser,
  RawLeaderboardRow,
  SchoolExaminationSettingRecord,
} from '../types';

describe('ExaminationLeaderboardService - Unit Tests', () => {
  let service: ExaminationLeaderboardService;
  let prismaMock: any;
  let examRepoMock: any;

  const mockSchoolId = '00000000-0000-0000-0000-000000000099';
  const mockOtherSchoolId = '00000000-0000-0000-0000-000000000098';
  const mockAYId = '00000000-0000-0000-0000-000000000199';
  const mockOtherAYId = '00000000-0000-0000-0000-000000000198';
  const mockGradeId = '00000000-0000-0000-0000-000000000299';
  const mockOtherGradeId = '00000000-0000-0000-0000-000000000298';
  const mockSectionId = '00000000-0000-0000-0000-000000000399';
  const mockSectionId2 = '00000000-0000-0000-0000-000000000398';
  const mockOtherSectionId = '00000000-0000-0000-0000-000000000397';
  const mockAssessmentId = '00000000-0000-0000-0000-000000000888';
  const mockGradeWideAssessmentId = '00000000-0000-0000-0000-000000000889';
  const mockTeacherId = 'teacher-profile-01';

  const mockStudentUser: AuthenticatedUser = {
    id: 'user-student-01',
    email: 'student1@school.edu',
    role: UserRole.STUDENT,
    schoolId: mockSchoolId,
  };

  const mockParentUser: AuthenticatedUser = {
    id: 'user-parent-01',
    email: 'parent1@home.edu',
    role: UserRole.PARENT,
    schoolId: mockSchoolId,
  };

  const mockTeacherUser: AuthenticatedUser = {
    id: 'user-teacher-01',
    email: 'teacher1@school.edu',
    role: UserRole.TEACHER,
    schoolId: mockSchoolId,
  };

  const mockSchoolAdminUser: AuthenticatedUser = {
    id: 'user-admin-01',
    email: 'admin@school.edu',
    role: UserRole.SCHOOL_ADMIN,
    schoolId: mockSchoolId,
  };

  const mockSuperAdminUser: AuthenticatedUser = {
    id: 'user-super-01',
    email: 'super@platform.org',
    role: UserRole.PLATFORM_SUPER_ADMIN,
  };

  const mockStudentProfile = {
    id: 'student-profile-01',
    schoolId: mockSchoolId,
    userId: mockStudentUser.id,
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: mockSectionId,
    status: 'ACTIVE',
    firstName: 'Alice',
    lastName: 'Walker',
  };

  const mockReleasedAssessment: AssessmentDraftRecord = {
    id: mockAssessmentId,
    schoolId: mockSchoolId,
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: mockSectionId,
    teacherId: mockTeacherId,
    chapterId: null,
    title: 'Physics Midterm Quiz',
    description: 'Released quiz',
    subject: 'Physics',
    mode: AssessmentMode.NORMAL_QUIZ,
    status: AssessmentStatus.RESULTS_RELEASED,
    totalMarks: 100,
    passingMarks: 40,
    durationMinutes: 60,
    startWindowAt: new Date(),
    endWindowAt: new Date(),
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockGradeWideReleasedAssessment: AssessmentDraftRecord = {
    id: mockGradeWideAssessmentId,
    schoolId: mockSchoolId,
    academicYearId: mockAYId,
    gradeId: mockGradeId,
    sectionId: null, // Grade-wide
    teacherId: mockTeacherId,
    chapterId: null,
    title: 'Physics Grade-Wide Olympiad',
    description: 'All sections',
    subject: 'Physics',
    mode: AssessmentMode.LIVE_EXAM,
    status: AssessmentStatus.RESULTS_RELEASED,
    totalMarks: 100,
    passingMarks: 40,
    durationMinutes: 60,
    startWindowAt: new Date(),
    endWindowAt: new Date(),
    shuffleQuestions: false,
    shuffleOptions: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTiedLeaderboardEntries: RawLeaderboardRow[] = [
    {
      resultId: 'res-1',
      assessmentId: mockAssessmentId,
      studentId: 'student-profile-01', // Current user
      score: 95,
      percentage: 95,
      isPassing: true,
      firstName: 'Alice',
      lastName: 'Walker',
      rank: 1,
      position: 1,
      resultCreatedAt: new Date('2026-10-30T10:00:00Z'),
    },
    {
      resultId: 'res-2',
      assessmentId: mockAssessmentId,
      studentId: 'student-profile-02',
      score: 90,
      percentage: 90,
      isPassing: true,
      firstName: 'Bob',
      lastName: 'Smith',
      rank: 2,
      position: 2,
      resultCreatedAt: new Date('2026-10-30T10:01:00Z'),
    },
    {
      resultId: 'res-3',
      assessmentId: mockAssessmentId,
      studentId: 'student-profile-03',
      score: 90,
      percentage: 90,
      isPassing: true,
      firstName: 'Charlie',
      lastName: 'Brown',
      rank: 2,
      position: 3,
      resultCreatedAt: new Date('2026-10-30T10:02:00Z'),
    },
    {
      resultId: 'res-4',
      assessmentId: mockAssessmentId,
      studentId: 'student-profile-04',
      score: 80,
      percentage: 80,
      isPassing: true,
      firstName: 'Diana',
      lastName: 'Prince',
      rank: 4,
      position: 4,
      resultCreatedAt: new Date('2026-10-30T10:03:00Z'),
    },
  ];

  beforeEach(async () => {
    prismaMock = {
      student: { findFirst: jest.fn() },
      parentStudentRelation: { findFirst: jest.fn() },
      teacher: { findFirst: jest.fn() },
      teacherAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
      section: { findMany: jest.fn() },
      schoolExaminationSetting: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      assessment: { count: jest.fn(), findMany: jest.fn() },
      assessmentResult: { count: jest.fn() },
    };

    examRepoMock = {
      findAssessmentById: jest.fn(),
      findLeaderboardEntries: jest.fn(),
      findAttemptByStudentAndAssessment: jest.fn().mockResolvedValue(null),
      getSchoolExaminationSetting: jest.fn(),
      upsertSchoolExaminationSetting: jest.fn(),
      getPlatformLeaderboardMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExaminationLeaderboardService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EXAMINATION_REPOSITORY, useValue: examRepoMock },
      ],
    }).compile();

    service = module.get<ExaminationLeaderboardService>(ExaminationLeaderboardService);
  });

  describe('Student Access & Eligibility Gating', () => {
    it('Scenario 1: allows student to access eligible released section-specific leaderboard', async () => {
      prismaMock.student.findFirst.mockResolvedValue(mockStudentProfile);
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue({
        schoolId: mockSchoolId,
        showStudentNamesOnLeaderboards: false,
      });
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getStudentLeaderboard(
        mockSchoolId,
        mockAssessmentId,
        { page: 1, limit: 20 },
        mockStudentUser,
      );

      expect(res.assessmentId).toBe(mockAssessmentId);
      expect(res.totalParticipants).toBe(4);
      expect(res.entries).toHaveLength(4);
      expect(res.entries[0].score).toBe(95);
      expect(res.entries[0].isCurrentUser).toBe(true);
    });

    it('allows student to access eligible grade-wide assessment across any section', async () => {
      prismaMock.student.findFirst.mockResolvedValue(mockStudentProfile);
      examRepoMock.findAssessmentById.mockResolvedValue(mockGradeWideReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue(null);
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getStudentLeaderboard(
        mockSchoolId,
        mockGradeWideAssessmentId,
        {},
        mockStudentUser,
      );

      expect(res.assessmentId).toBe(mockGradeWideAssessmentId);
      expect(res.totalParticipants).toBe(4);
    });

    it('allows student with attempt on past assessment to view leaderboard after promotion', async () => {
      // Student is in current grade/AY, but took the past assessment
      prismaMock.student.findFirst.mockResolvedValue({
        ...mockStudentProfile,
        academicYearId: mockOtherAYId,
        gradeId: mockOtherGradeId,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: 'attempt-past-1',
        studentId: mockStudentProfile.id,
        assessmentId: mockAssessmentId,
        schoolId: mockSchoolId,
      });
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue(null);
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getStudentLeaderboard(
        mockSchoolId,
        mockAssessmentId,
        {},
        mockStudentUser,
      );

      expect(res.assessmentId).toBe(mockAssessmentId);
      expect(res.totalParticipants).toBe(4);
    });

    it('rejects student with academic year mismatch and no attempt', async () => {
      prismaMock.student.findFirst.mockResolvedValue({
        ...mockStudentProfile,
        academicYearId: mockOtherAYId,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      await expect(
        service.getStudentLeaderboard(mockSchoolId, mockAssessmentId, {}, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects student with grade mismatch and no attempt', async () => {
      prismaMock.student.findFirst.mockResolvedValue({
        ...mockStudentProfile,
        gradeId: mockOtherGradeId,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      await expect(
        service.getStudentLeaderboard(mockSchoolId, mockAssessmentId, {}, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects student with section mismatch on section-specific assessment and no attempt', async () => {
      prismaMock.student.findFirst.mockResolvedValue({
        ...mockStudentProfile,
        sectionId: mockOtherSectionId,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      await expect(
        service.getStudentLeaderboard(mockSchoolId, mockAssessmentId, {}, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Scenario 2 & 23: Rejection of Unreleased Assessments for All Roles', () => {
    it.each([
      AssessmentStatus.DRAFT,
      AssessmentStatus.PUBLISHED,
      AssessmentStatus.CLOSED,
      AssessmentStatus.ARCHIVED,
    ])('rejects student access for assessment status %s with ForbiddenException', async (status) => {
      prismaMock.student.findFirst.mockResolvedValue(mockStudentProfile);
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        status,
      });

      await expect(
        service.getStudentLeaderboard(mockSchoolId, mockAssessmentId, {}, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects parent access for unreleased assessment', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        student: mockStudentProfile,
      });
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        status: AssessmentStatus.CLOSED,
      });

      await expect(
        service.getParentLeaderboard(mockSchoolId, mockStudentProfile.id, mockAssessmentId, {}, mockParentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects staff access for unreleased assessment', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue({
        ...mockReleasedAssessment,
        status: AssessmentStatus.DRAFT,
      });

      await expect(
        service.getStaffLeaderboard(mockSchoolId, mockAssessmentId, {}, mockSchoolAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Scenario 3 & 24: Cross-Tenant Isolation', () => {
    it('throws ForbiddenException when student user school does not match requested school', async () => {
      await expect(
        service.getStudentLeaderboard(mockOtherSchoolId, mockAssessmentId, {}, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when assessment does not exist in target school', async () => {
      prismaMock.student.findFirst.mockResolvedValue(mockStudentProfile);
      examRepoMock.findAssessmentById.mockResolvedValue(null);

      await expect(
        service.getStudentLeaderboard(mockSchoolId, mockAssessmentId, {}, mockStudentUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Scenario 4 & 5 & 25: Student Masking with Stable Anonymous Position', () => {
    it('shows student own name and distinct stable Participant #N labels for tied peers when OFF', async () => {
      prismaMock.student.findFirst.mockResolvedValue(mockStudentProfile);
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue({
        schoolId: mockSchoolId,
        showStudentNamesOnLeaderboards: false,
      });
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getStudentLeaderboard(mockSchoolId, mockAssessmentId, {}, mockStudentUser);

      // Current student (Alice Walker)
      expect(res.entries[0].isCurrentUser).toBe(true);
      expect(res.entries[0].studentName).toBe('Alice Walker');
      expect(res.entries[0].rank).toBe(1);

      // Distinct participant labels for tied rank 2 peers
      expect(res.entries[1].isCurrentUser).toBe(false);
      expect(res.entries[1].rank).toBe(2);
      expect(res.entries[1].studentName).toBe('Participant #2');

      expect(res.entries[2].isCurrentUser).toBe(false);
      expect(res.entries[2].rank).toBe(2);
      expect(res.entries[2].studentName).toBe('Participant #3');

      expect(res.entries[3].isCurrentUser).toBe(false);
      expect(res.entries[3].rank).toBe(4);
      expect(res.entries[3].studentName).toBe('Participant #4');

      // Assert zero PII
      for (const entry of res.entries) {
        expect((entry as any).studentId).toBeUndefined();
        expect((entry as any).admissionNumber).toBeUndefined();
        expect((entry as any).id).toBeUndefined();
      }
    });

    it('shows real names for all students when showStudentNamesOnLeaderboards is ON', async () => {
      prismaMock.student.findFirst.mockResolvedValue(mockStudentProfile);
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue({
        schoolId: mockSchoolId,
        showStudentNamesOnLeaderboards: true,
      });
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getStudentLeaderboard(mockSchoolId, mockAssessmentId, {}, mockStudentUser);

      expect(res.entries[0].studentName).toBe('Alice Walker');
      expect(res.entries[1].studentName).toBe('Bob Smith');
      expect(res.entries[2].studentName).toBe('Charlie Brown');
      expect(res.entries[3].studentName).toBe('Diana Prince');
    });
  });

  describe('Parent Authorization & Privacy Handling', () => {
    it('verifies parent relationship using authenticated parentId, childId, schoolId and isVerified: true', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        student: mockStudentProfile,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue(null);
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      await service.getParentLeaderboard(mockSchoolId, mockStudentProfile.id, mockAssessmentId, {}, mockParentUser);

      expect(prismaMock.parentStudentRelation.findFirst).toHaveBeenCalledWith({
        where: {
          schoolId: mockSchoolId,
          parentId: mockParentUser.id,
          studentId: mockStudentProfile.id,
          isVerified: true,
        },
        include: {
          student: true,
        },
      });
    });

    it('rejects parent attempting to access unrelated child', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue(null);

      await expect(
        service.getParentLeaderboard(mockSchoolId, 'unrelated-student-id', mockAssessmentId, {}, mockParentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows parent to view leaderboard for child past assessment if child has an attempt', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        student: {
          ...mockStudentProfile,
          academicYearId: mockOtherAYId,
          gradeId: mockOtherGradeId,
        },
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue({
        id: 'attempt-past-child',
        studentId: mockStudentProfile.id,
        assessmentId: mockAssessmentId,
        schoolId: mockSchoolId,
      });
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue(null);
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getParentLeaderboard(
        mockSchoolId,
        mockStudentProfile.id,
        mockAssessmentId,
        {},
        mockParentUser,
      );

      expect(res.assessmentId).toBe(mockAssessmentId);
      expect(res.totalParticipants).toBe(4);
    });

    it('rejects parent when child has section mismatch for section-specific assessment and no attempt', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        student: { ...mockStudentProfile, sectionId: mockOtherSectionId },
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.findAttemptByStudentAndAssessment.mockResolvedValue(null);

      await expect(
        service.getParentLeaderboard(mockSchoolId, mockStudentProfile.id, mockAssessmentId, {}, mockParentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('parent sees own child name and masked peers with Participant #N when OFF', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        student: mockStudentProfile,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue({
        schoolId: mockSchoolId,
        showStudentNamesOnLeaderboards: false,
      });
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getParentLeaderboard(mockSchoolId, mockStudentProfile.id, mockAssessmentId, {}, mockParentUser);

      expect(res.entries[0].isCurrentUser).toBe(true);
      expect(res.entries[0].studentName).toBe('Alice Walker');
      expect(res.entries[1].isCurrentUser).toBe(false);
      expect(res.entries[1].studentName).toBe('Participant #2');
      expect(res.entries[2].isCurrentUser).toBe(false);
      expect(res.entries[2].studentName).toBe('Participant #3');
    });

    it('parent sees peer names when privacy is ON', async () => {
      prismaMock.parentStudentRelation.findFirst.mockResolvedValue({
        student: mockStudentProfile,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue({
        schoolId: mockSchoolId,
        showStudentNamesOnLeaderboards: true,
      });
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getParentLeaderboard(mockSchoolId, mockStudentProfile.id, mockAssessmentId, {}, mockParentUser);

      expect(res.entries[0].studentName).toBe('Alice Walker');
      expect(res.entries[1].studentName).toBe('Bob Smith');
    });
  });

  describe('HIGH: Teacher Authorization on Section-Specific & Grade-Wide Assessments', () => {
    it('1. Non-author teacher assigned to all eligible sections of grade-wide assessment is allowed', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({
        id: 'assigned-teacher-id',
        schoolId: mockSchoolId,
        status: TeacherStatus.ACTIVE,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockGradeWideReleasedAssessment);
      // Grade has 2 sections
      prismaMock.section.findMany.mockResolvedValue([
        { id: mockSectionId },
        { id: mockSectionId2 },
      ]);
      // Teacher assigned to both sections in same school, AY, grade, and subject
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { sectionId: mockSectionId },
        { sectionId: mockSectionId2 },
      ]);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue(null);
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getStaffLeaderboard(mockSchoolId, mockGradeWideAssessmentId, {}, mockTeacherUser);
      expect(res.entries).toHaveLength(4);
    });

    it('2. Non-author teacher assigned to only one of multiple sections of grade-wide assessment is rejected', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({
        id: 'assigned-teacher-id',
        schoolId: mockSchoolId,
        status: TeacherStatus.ACTIVE,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockGradeWideReleasedAssessment);
      // Grade has 2 sections
      prismaMock.section.findMany.mockResolvedValue([
        { id: mockSectionId },
        { id: mockSectionId2 },
      ]);
      // Teacher only assigned to 1 section
      prismaMock.teacherAssignment.findMany.mockResolvedValue([
        { sectionId: mockSectionId },
      ]);

      await expect(
        service.getStaffLeaderboard(mockSchoolId, mockGradeWideAssessmentId, {}, mockTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('3. Teacher assigned to another subject in the grade is rejected', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({
        id: 'math-teacher-id',
        schoolId: mockSchoolId,
        status: TeacherStatus.ACTIVE,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment); // Subject: Physics
      prismaMock.teacherAssignment.findFirst.mockResolvedValue(null); // No Physics assignment

      await expect(
        service.getStaffLeaderboard(mockSchoolId, mockAssessmentId, {}, mockTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('4. Teacher assigned to another academic year is rejected', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({
        id: 'teacher-old-ay',
        schoolId: mockSchoolId,
        status: TeacherStatus.ACTIVE,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      prismaMock.teacherAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.getStaffLeaderboard(mockSchoolId, mockAssessmentId, {}, mockTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('5. Assessment author access remains valid even without assignments across all sections', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue({
        id: mockTeacherId, // Matches author ID on mockGradeWideReleasedAssessment
        schoolId: mockSchoolId,
        status: TeacherStatus.ACTIVE,
      });
      examRepoMock.findAssessmentById.mockResolvedValue(mockGradeWideReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue(null);
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getStaffLeaderboard(mockSchoolId, mockGradeWideAssessmentId, {}, mockTeacherUser);
      expect(res.entries).toHaveLength(4);
      expect(prismaMock.teacherAssignment.findMany).not.toHaveBeenCalled();
    });

    it('6. Inactive teacher profile is rejected', async () => {
      prismaMock.teacher.findFirst.mockResolvedValue(null);
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);

      await expect(
        service.getStaffLeaderboard(mockSchoolId, mockAssessmentId, {}, mockTeacherUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('School Admin Leaderboard & Privacy Settings', () => {
    it('allows school admin to view leaderboard for own school', async () => {
      examRepoMock.findAssessmentById.mockResolvedValue(mockReleasedAssessment);
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue(null);
      examRepoMock.findLeaderboardEntries.mockResolvedValue({
        entries: mockTiedLeaderboardEntries,
        totalCount: 4,
      });

      const res = await service.getStaffLeaderboard(mockSchoolId, mockAssessmentId, {}, mockSchoolAdminUser);
      expect(res.entries[0].studentName).toBe('Alice Walker');
    });

    it('rejects school admin accessing another school assessment', async () => {
      await expect(
        service.getStaffLeaderboard(mockOtherSchoolId, mockAssessmentId, {}, mockSchoolAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates privacy setting for own school and records updatedByUserId', async () => {
      const now = new Date();
      examRepoMock.upsertSchoolExaminationSetting.mockResolvedValue({
        id: 'setting-1',
        schoolId: mockSchoolId,
        showStudentNamesOnLeaderboards: true,
        updatedByUserId: mockSchoolAdminUser.id,
        createdAt: now,
        updatedAt: now,
      });

      const res = await service.updateLeaderboardPrivacySetting(
        mockSchoolId,
        { showStudentNamesOnLeaderboards: true },
        mockSchoolAdminUser,
      );

      expect(res.showStudentNamesOnLeaderboards).toBe(true);
      expect(res.updatedByUserId).toBe(mockSchoolAdminUser.id);
      expect(examRepoMock.upsertSchoolExaminationSetting).toHaveBeenCalledWith(
        mockSchoolId,
        true,
        mockSchoolAdminUser.id,
      );
    });

    it('rejects update by non-SCHOOL_ADMIN roles including PLATFORM_SUPER_ADMIN', async () => {
      await expect(
        service.updateLeaderboardPrivacySetting(mockSchoolId, { showStudentNamesOnLeaderboards: true }, mockSuperAdminUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateLeaderboardPrivacySetting(mockSchoolId, { showStudentNamesOnLeaderboards: true }, mockTeacherUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateLeaderboardPrivacySetting(mockSchoolId, { showStudentNamesOnLeaderboards: true }, mockParentUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateLeaderboardPrivacySetting(mockSchoolId, { showStudentNamesOnLeaderboards: true }, mockStudentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('missing setting defaults to OFF without creating database row', async () => {
      examRepoMock.getSchoolExaminationSetting.mockResolvedValue(null);

      const res = await service.getLeaderboardPrivacySetting(mockSchoolId, mockSchoolAdminUser);
      expect(res.showStudentNamesOnLeaderboards).toBe(false);
      expect(res.updatedAt).toBeNull();
      expect(examRepoMock.upsertSchoolExaminationSetting).not.toHaveBeenCalled();
    });
  });

  describe('Platform Super Admin Aggregate Monitoring', () => {
    it('returns aggregate counts with zero student PII', async () => {
      examRepoMock.getPlatformLeaderboardMetrics.mockResolvedValue({
        totalSchoolsReporting: 4,
        totalReleasedAssessments: 16,
        totalEligibleResults: 800,
        schoolsWithNamesVisibleCount: 1,
        schoolsWithNamesMaskedCount: 3,
      });

      const res = await service.getPlatformLeaderboardMetrics(mockSuperAdminUser);
      expect(res.totalSchoolsReporting).toBe(4);
      expect(res.schoolsWithNamesVisibleCount + res.schoolsWithNamesMaskedCount).toBe(4);
      expect((res as any).students).toBeUndefined();
    });

    it('rejects non-PLATFORM_SUPER_ADMIN', async () => {
      await expect(service.getPlatformLeaderboardMetrics(mockSchoolAdminUser)).rejects.toThrow(ForbiddenException);
    });
  });
});
