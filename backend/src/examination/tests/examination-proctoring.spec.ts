import { Test, TestingModule } from '@nestjs/testing';
import { ExaminationStudentAttemptsService } from '../services/examination-student-attempts.service';
import { ExaminationAssessmentsService } from '../services/examination-assessments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EXAMINATION_REPOSITORY } from '../examination.repository.interface';
import { ExaminationProgressionService } from '../services/examination-progression.service';
import { AttemptStatus, UserRole, ViolationEventType } from '@prisma/client';
import { getConfiguredViolationTypes } from '../types';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Examination Proctoring & Readiness Checks', () => {
  let studentAttemptsService: ExaminationStudentAttemptsService;
  let assessmentsService: ExaminationAssessmentsService;

  const mockPrisma: any = {
    student: {
      findFirst: jest.fn(),
    },
    teacher: {
      findFirst: jest.fn(),
    },
    assessmentAttempt: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    assessmentViolationEvent: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockExamRepo: any = {
    findAssessmentById: jest.fn(),
    findAttemptById: jest.fn(),
    findQuestionById: jest.fn(),
    saveAttemptAnswerAtomic: jest.fn(),
    findQuestionsByAssessmentId: jest.fn(),
    findQuestionImagesByAssessmentId: jest.fn(),
    findAttemptAnswers: jest.fn(),
  };

  const mockProgressionService: any = {
    resolveAssessmentProgression: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExaminationStudentAttemptsService,
        ExaminationAssessmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EXAMINATION_REPOSITORY, useValue: mockExamRepo },
        { provide: ExaminationProgressionService, useValue: mockProgressionService },
      ],
    }).compile();

    studentAttemptsService = module.get<ExaminationStudentAttemptsService>(
      ExaminationStudentAttemptsService,
    );
    assessmentsService = module.get<ExaminationAssessmentsService>(
      ExaminationAssessmentsService,
    );
  });

  describe('Preflight check completion', () => {
    it('successfully completes preflight check and sets proctoringPassed = true', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-1',
        studentId: 'student-1',
        schoolId: 'school-1',
        status: AttemptStatus.IN_PROGRESS,
      });
      mockPrisma.assessmentAttempt.update.mockResolvedValue({
        id: 'attempt-1',
        proctoringPassed: true,
        preflightData: { latencyMs: 45, fullscreenSupported: true },
      });

      const res = await studentAttemptsService.completePreflightCheck(
        'school-1',
        'attempt-1',
        { preflightData: { latencyMs: 45, fullscreenSupported: true } },
        { id: 'user-1' },
      );

      expect(res.success).toBe(true);
      expect(res.proctoringPassed).toBe(true);
      expect(mockPrisma.assessmentAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: {
          proctoringPassed: true,
          preflightData: { latencyMs: 45, fullscreenSupported: true },
        },
      });
    });

    it('throws error if attempt is already submitted', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-1',
        status: AttemptStatus.SUBMITTED,
      });

      await expect(
        studentAttemptsService.completePreflightCheck(
          'school-1',
          'attempt-1',
          {},
          { id: 'user-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists comprehensive bandwidth telemetry (latency, downloadMbps, uploadMbps)', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-diag',
        studentId: 'student-1',
        schoolId: 'school-1',
        status: AttemptStatus.IN_PROGRESS,
      });
      mockPrisma.assessmentAttempt.update.mockResolvedValue({
        id: 'attempt-diag',
        proctoringPassed: true,
        preflightData: {
          latencyMs: 32,
          downloadMbps: 14.5,
          uploadMbps: 5.2,
          bandwidthStatus: 'OPTIMAL',
        },
      });

      const res = await studentAttemptsService.completePreflightCheck(
        'school-1',
        'attempt-diag',
        {
          preflightData: {
            latencyMs: 32,
            downloadMbps: 14.5,
            uploadMbps: 5.2,
            bandwidthStatus: 'OPTIMAL',
          },
        },
        { id: 'user-1' },
      );

      expect(res.success).toBe(true);
      expect((res.preflightData as any).downloadMbps).toBe(14.5);
      expect((res.preflightData as any).uploadMbps).toBe(5.2);
    });

    it('returns a 250 KB uncompressible binary buffer for download diagnostics', () => {
      const buffer = studentAttemptsService.getDownloadSampleBuffer();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(250 * 1024);
    });
  });

  describe('Violation event ingestion and thresholding', () => {
    it('records violation event and flags attempt when threshold exceeded', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-1',
        assessmentId: 'assessment-1',
        studentId: 'student-1',
        status: AttemptStatus.IN_PROGRESS,
        flaggedForReview: false,
        assessment: {
          id: 'assessment-1',
          enableProctoring: true,
          monitoringConfig: { maxWarnings: 2 },
        },
      });
      mockPrisma.assessmentViolationEvent.create.mockResolvedValue({
        id: 'event-1',
        eventType: ViolationEventType.FULLSCREEN_EXIT,
      });
      mockPrisma.assessmentViolationEvent.count.mockResolvedValue(2);
      mockPrisma.assessmentAttempt.update.mockResolvedValue({});

      const res = await studentAttemptsService.recordViolationEvent(
        'school-1',
        'attempt-1',
        { eventType: ViolationEventType.FULLSCREEN_EXIT },
        { id: 'user-1' },
      );

      expect(res.recorded).toBe(true);
      expect(res.flaggedForReview).toBe(true);
      expect(mockPrisma.assessmentAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { flaggedForReview: true },
      });
    });

    it('throttles rapid duplicate events within 2 seconds', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-throttle',
        assessmentId: 'assessment-1',
        status: AttemptStatus.IN_PROGRESS,
        flaggedForReview: false,
        assessment: { monitoringConfig: { maxWarnings: 3 } },
      });
      mockPrisma.assessmentViolationEvent.create.mockResolvedValue({
        id: 'event-1',
        eventType: ViolationEventType.TAB_BLUR,
      });
      mockPrisma.assessmentViolationEvent.count.mockResolvedValue(1);

      const firstCall = await studentAttemptsService.recordViolationEvent(
        'school-1',
        'attempt-throttle',
        { eventType: ViolationEventType.TAB_BLUR },
        { id: 'user-1' },
      );
      expect(firstCall.recorded).toBe(true);

      const secondCall = await studentAttemptsService.recordViolationEvent(
        'school-1',
        'attempt-throttle',
        { eventType: ViolationEventType.TAB_BLUR },
        { id: 'user-1' },
      );
      expect(secondCall.recorded).toBe(false);
      expect(secondCall.throttled).toBe(true);
    });

    it('records consolidated NETWORK_ANOMALY event with duration and metadata', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-net',
        assessmentId: 'assessment-1',
        studentId: 'student-1',
        status: AttemptStatus.IN_PROGRESS,
        flaggedForReview: false,
        assessment: { id: 'assessment-1', enableProctoring: true, monitoringConfig: { maxWarnings: 5 } },
      });
      mockPrisma.assessmentViolationEvent.create.mockResolvedValue({
        id: 'event-net-1',
        eventType: ViolationEventType.NETWORK_ANOMALY,
        durationMs: 7800,
        metadata: { disconnectedAt: '2026-11-12T10:00:00Z', reconnectedAt: '2026-11-12T10:00:07Z' },
      });
      mockPrisma.assessmentViolationEvent.count.mockResolvedValue(1);

      const res = await studentAttemptsService.recordViolationEvent(
        'school-1',
        'attempt-net',
        {
          eventType: ViolationEventType.NETWORK_ANOMALY,
          durationMs: 7800,
          metadata: { disconnectedAt: '2026-11-12T10:00:00Z', reconnectedAt: '2026-11-12T10:00:07Z' },
        },
        { id: 'user-1' },
      );

      expect(res.recorded).toBe(true);
      expect(res.eventType).toBe(ViolationEventType.NETWORK_ANOMALY);
      expect(mockPrisma.assessmentViolationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: ViolationEventType.NETWORK_ANOMALY,
          durationMs: 7800,
          metadata: expect.objectContaining({
            disconnectedAt: '2026-11-12T10:00:00Z',
          }),
        }),
      });
    });

    it('locks attempt precisely when misconduct count reaches maxWarnings limit', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-lock-1',
        assessmentId: 'assessment-1',
        studentId: 'student-1',
        status: AttemptStatus.IN_PROGRESS,
        flaggedForReview: false,
        assessment: {
          id: 'assessment-1',
          enableProctoring: true,
          monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
        },
      });
      mockPrisma.assessmentViolationEvent.create.mockResolvedValue({
        id: 'event-3',
        eventType: ViolationEventType.FULLSCREEN_EXIT,
      });
      // 3 active violations reached
      mockPrisma.assessmentViolationEvent.count.mockResolvedValue(3);
      mockPrisma.assessmentAttempt.update.mockResolvedValue({});

      const res = await studentAttemptsService.recordViolationEvent(
        'school-1',
        'attempt-lock-1',
        { eventType: ViolationEventType.FULLSCREEN_EXIT },
        { id: 'user-1' },
      );

      expect(res.recorded).toBe(true);
      expect(res.activeMisconductViolations).toBe(3);
      expect(res.maxAllowed).toBe(3);
      expect(res.isLocked).toBe(true);
      expect(res.flaggedForReview).toBe(true);
      expect(mockPrisma.assessmentAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-lock-1' },
        data: { flaggedForReview: true },
      });
    });

    it('keeps attempt unlocked and advisory when count remains below maxWarnings', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-below-1',
        assessmentId: 'assessment-1',
        studentId: 'student-1',
        status: AttemptStatus.IN_PROGRESS,
        flaggedForReview: false,
        assessment: {
          id: 'assessment-1',
          enableProctoring: true,
          monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
        },
      });
      mockPrisma.assessmentViolationEvent.create.mockResolvedValue({
        id: 'event-2',
        eventType: ViolationEventType.FULLSCREEN_EXIT,
      });
      // 2 active violations (below 3), 0 object detections
      mockPrisma.assessmentViolationEvent.count.mockImplementation(async (args: any) => {
        if (args?.where?.eventType === ViolationEventType.OBJECT_DETECTED) {
          return 0;
        }
        return 2;
      });

      const res = await studentAttemptsService.recordViolationEvent(
        'school-1',
        'attempt-below-1',
        { eventType: ViolationEventType.FULLSCREEN_EXIT },
        { id: 'user-1' },
      );

      expect(res.recorded).toBe(true);
      expect(res.activeMisconductViolations).toBe(2);
      expect(res.maxAllowed).toBe(3);
      expect(res.isLocked).toBe(false);
      expect(res.flaggedForReview).toBe(false);
    });

    it('does not count NETWORK_ANOMALY towards misconduct warnings by default', async () => {
      const types = getConfiguredViolationTypes({
        requireFullscreen: true,
        detectTabSwitch: true,
        maxWarnings: 3,
      });

      expect(types).toContain(ViolationEventType.FULLSCREEN_EXIT);
      expect(types).toContain(ViolationEventType.TAB_BLUR);
      expect(types).not.toContain(ViolationEventType.NETWORK_ANOMALY);

      const typesWithNet = getConfiguredViolationTypes({
        requireFullscreen: true,
        includeNetworkAnomaly: true,
        maxWarnings: 3,
      });
      expect(typesWithNet).toContain(ViolationEventType.NETWORK_ANOMALY);
    });
  });

  describe('Backend answer-save enforcement and data preservation', () => {
    it('rejects saveAnswer with ForbiddenException when attempt reaches warning limit', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockExamRepo.findAttemptById.mockResolvedValue({
        id: 'attempt-locked',
        schoolId: 'school-1',
        studentId: 'student-1',
        assessmentId: 'assessment-1',
        status: AttemptStatus.IN_PROGRESS,
        deadlineAt: new Date(Date.now() + 600000),
      });
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        enableProctoring: true,
        status: 'PUBLISHED',
        monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
      });
      mockPrisma.assessmentViolationEvent.count.mockResolvedValue(3);

      await expect(
        studentAttemptsService.saveAnswer(
          'school-1',
          'attempt-locked',
          'q-1',
          { selectedOption: 2 },
          { id: 'user-1' },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockExamRepo.saveAttemptAnswerAtomic).not.toHaveBeenCalled();
    });

    it('preserves previously saved answers when locked attempt detail is fetched', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockExamRepo.findAttemptById.mockResolvedValue({
        id: 'attempt-locked-detail',
        schoolId: 'school-1',
        studentId: 'student-1',
        assessmentId: 'assessment-1',
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        deadlineAt: new Date(Date.now() + 600000),
      });
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        enableProctoring: true,
        monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
      });
      mockExamRepo.findQuestionsByAssessmentId.mockResolvedValue([
        { id: 'q-1', sectionId: 's1', orderIndex: 1, questionText: 'Q1', options: ['A', 'B'], marks: 1 },
      ]);
      mockExamRepo.findQuestionImagesByAssessmentId.mockResolvedValue([]);
      mockExamRepo.findAttemptAnswers.mockResolvedValue([
        { questionId: 'q-1', selectedOption: 1 },
      ]);
      mockPrisma.assessmentViolationEvent.count.mockResolvedValue(3);

      const detail = await (studentAttemptsService as any).buildAttemptDetail(
        'school-1',
        { id: 'assessment-1', enableProctoring: true, monitoringConfig: { maxWarnings: 3 } },
        {
          id: 'attempt-locked-detail',
          schoolId: 'school-1',
          studentId: 'student-1',
          status: AttemptStatus.IN_PROGRESS,
          startedAt: new Date(),
          deadlineAt: new Date(Date.now() + 600000),
          submittedAt: null,
        },
      );

      expect(detail.isLocked).toBe(true);
      expect(detail.activeWarningsCount).toBe(3);
      expect(detail.answers['q-1']).toBe(1);
    });
  });

  describe('Prohibited Object Detection Advisory-Only & Audit Policy', () => {
    it('records OBJECT_DETECTED event and sets flaggedForReview=true for teacher review but leaves isLocked=false', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-obj-1',
        assessmentId: 'assessment-1',
        studentId: 'student-1',
        status: AttemptStatus.IN_PROGRESS,
        flaggedForReview: false,
        assessment: {
          id: 'assessment-1',
          enableProctoring: true,
          monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
        },
      });
      mockPrisma.assessmentViolationEvent.create.mockResolvedValue({
        id: 'event-obj-1',
        eventType: ViolationEventType.OBJECT_DETECTED,
        metadata: { class: 'cell phone', score: 0.81, advisoryOnly: true },
      });
      mockPrisma.assessmentViolationEvent.count.mockImplementation(async (args: any) => {
        if (args?.where?.eventType === ViolationEventType.OBJECT_DETECTED) {
          return 1;
        }
        if (args?.where?.eventType?.in) {
          return 0; // 0 misconduct warnings
        }
        return 1; // total violations
      });
      mockPrisma.assessmentAttempt.update.mockResolvedValue({});

      const res = await studentAttemptsService.recordViolationEvent(
        'school-1',
        'attempt-obj-1',
        {
          eventType: ViolationEventType.OBJECT_DETECTED,
          metadata: { class: 'cell phone', score: 0.81, advisoryOnly: true },
        },
        { id: 'user-1' },
      );

      expect(res.recorded).toBe(true);
      expect(res.eventType).toBe(ViolationEventType.OBJECT_DETECTED);
      expect(res.activeMisconductViolations).toBe(0);
      expect(res.maxAllowed).toBe(3);
      // Crucial: Object detection is advisory-only and does not auto-lock attempt
      expect(res.isLocked).toBe(false);
      // Teacher review flag is preserved
      expect(res.flaggedForReview).toBe(true);
      expect(mockPrisma.assessmentAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-obj-1' },
        data: { flaggedForReview: true },
      });
    });

    it('allows saveAnswer to succeed without throwing when active OBJECT_DETECTED event exists', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockExamRepo.findAttemptById.mockResolvedValue({
        id: 'attempt-obj-advisory',
        schoolId: 'school-1',
        studentId: 'student-1',
        assessmentId: 'assessment-1',
        status: AttemptStatus.IN_PROGRESS,
        deadlineAt: new Date(Date.now() + 600000),
      });
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        enableProctoring: true,
        status: 'PUBLISHED',
        monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
      });
      mockExamRepo.findQuestionById.mockResolvedValue({
        id: 'q-1',
        assessmentId: 'assessment-1',
      });
      mockExamRepo.saveAttemptAnswerAtomic.mockResolvedValue({
        questionId: 'q-1',
        selectedOption: 1,
      });
      mockPrisma.assessmentViolationEvent.count.mockImplementation(async (args: any) => {
        if (args?.where?.eventType === ViolationEventType.OBJECT_DETECTED) {
          return 1; // Object detected
        }
        return 0; // 0 misconduct warnings
      });

      const res = await studentAttemptsService.saveAnswer(
        'school-1',
        'attempt-obj-advisory',
        'q-1',
        { selectedOption: 1 },
        { id: 'user-1' },
      );

      expect(res.success).toBe(true);
      expect(res.questionId).toBe('q-1');
      expect(res.selectedOption).toBe(1);
      expect(mockExamRepo.saveAttemptAnswerAtomic).toHaveBeenCalled();
    });

    it('preserves existing answers and reports isLocked=false when attempt has OBJECT_DETECTED', async () => {
      mockExamRepo.findQuestionsByAssessmentId.mockResolvedValue([
        { id: 'q-1', sectionId: 's1', orderIndex: 1, questionText: 'Q1', options: ['A', 'B'], marks: 1 },
      ]);
      mockExamRepo.findQuestionImagesByAssessmentId.mockResolvedValue([]);
      mockExamRepo.findAttemptAnswers.mockResolvedValue([
        { questionId: 'q-1', selectedOption: 2 },
      ]);
      mockPrisma.assessmentViolationEvent.count.mockImplementation(async (args: any) => {
        if (args?.where?.eventType === ViolationEventType.OBJECT_DETECTED) {
          return 1;
        }
        return 0;
      });

      const detail = await (studentAttemptsService as any).buildAttemptDetail(
        'school-1',
        { id: 'assessment-1', enableProctoring: true, monitoringConfig: { maxWarnings: 3 } },
        {
          id: 'attempt-obj-advisory-detail',
          schoolId: 'school-1',
          studentId: 'student-1',
          status: AttemptStatus.IN_PROGRESS,
          startedAt: new Date(),
          deadlineAt: new Date(Date.now() + 600000),
          submittedAt: null,
        },
      );

      expect(detail.isLocked).toBe(false);
      expect(detail.status).toBe(AttemptStatus.IN_PROGRESS);
      expect(detail.answers['q-1']).toBe(2);
      expect(detail.activeWarningsCount).toBe(0); // Misconduct warnings unchanged
    });

    it('still rejects saveAnswer with ForbiddenException when configured misconduct warnings reach limit', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: 'student-1', schoolId: 'school-1' });
      mockExamRepo.findAttemptById.mockResolvedValue({
        id: 'attempt-misconduct-locked',
        schoolId: 'school-1',
        studentId: 'student-1',
        assessmentId: 'assessment-1',
        status: AttemptStatus.IN_PROGRESS,
        deadlineAt: new Date(Date.now() + 600000),
      });
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        enableProctoring: true,
        status: 'PUBLISHED',
        monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
      });
      mockPrisma.assessmentViolationEvent.count.mockImplementation(async (args: any) => {
        if (args?.where?.eventType?.in) {
          return 3; // 3 misconduct warnings (limit reached!)
        }
        return 3;
      });

      await expect(
        studentAttemptsService.saveAnswer(
          'school-1',
          'attempt-misconduct-locked',
          'q-1',
          { selectedOption: 1 },
          { id: 'user-1' },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockExamRepo.saveAttemptAnswerAtomic).not.toHaveBeenCalled();
    });

    it('teacher unlock restores attempt lock state (isLocked: false) by dismissing OBJECT_DETECTED violation', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        teacherId: 'teacher-1',
      });
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-obj-locked',
        assessmentId: 'assessment-1',
        status: AttemptStatus.IN_PROGRESS,
      });
      mockPrisma.assessmentViolationEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.assessmentAttempt.update.mockResolvedValue({});

      const res = await assessmentsService.unlockAttempt(
        'school-1',
        'assessment-1',
        'attempt-obj-locked',
        { id: 'user-t', email: 'teacher@test.com', role: UserRole.TEACHER },
      );

      expect(res.success).toBe(true);
      expect(res.isLocked).toBe(false);
      expect(mockPrisma.assessmentViolationEvent.updateMany).toHaveBeenCalledWith({
        where: { schoolId: 'school-1', attemptId: 'attempt-obj-locked', dismissed: false },
        data: { dismissed: true },
      });
      expect(mockPrisma.assessmentAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-obj-locked' },
        data: { flaggedForReview: false },
      });
    });

    it('teacher single violation dismissal of OBJECT_DETECTED unflags and unlocks attempt when 0 active remain', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        teacherId: 'teacher-1',
        enableProctoring: true,
        monitoringConfig: { maxWarnings: 3 },
      });
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
      mockPrisma.assessmentViolationEvent.findFirst.mockResolvedValue({
        id: 'e-obj-1',
        eventType: ViolationEventType.OBJECT_DETECTED,
        dismissed: false,
      });
      mockPrisma.assessmentViolationEvent.update.mockResolvedValue({ id: 'e-obj-1', dismissed: true });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-obj-1',
        status: AttemptStatus.IN_PROGRESS,
      });
      mockPrisma.assessmentViolationEvent.count.mockResolvedValue(0);
      mockPrisma.assessmentAttempt.update.mockResolvedValue({});

      const res = await assessmentsService.dismissViolationEvent(
        'school-1',
        'assessment-1',
        'attempt-obj-1',
        'e-obj-1',
        { id: 'user-t', email: 'teacher@test.com', role: UserRole.TEACHER },
      );

      expect(res.success).toBe(true);
      expect(res.remainingActiveViolations).toBe(0);
      expect(res.remainingMisconductViolations).toBe(0);
      expect(res.isLocked).toBe(false);
      expect(mockPrisma.assessmentAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-obj-1' },
        data: { flaggedForReview: false },
      });
    });
  });

  describe('Teacher review and unlock behavior', () => {
    it('unlocks attempt via unlockAttempt by dismissing active violations', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        teacherId: 'teacher-1',
      });
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-1',
        assessmentId: 'assessment-1',
        status: AttemptStatus.IN_PROGRESS,
      });
      mockPrisma.assessmentViolationEvent.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.assessmentAttempt.update.mockResolvedValue({});

      const res = await assessmentsService.unlockAttempt(
        'school-1',
        'assessment-1',
        'attempt-1',
        { id: 'user-t', email: 'teacher@test.com', role: UserRole.TEACHER },
      );

      expect(res.success).toBe(true);
      expect(res.isLocked).toBe(false);
      expect(mockPrisma.assessmentViolationEvent.updateMany).toHaveBeenCalledWith({
        where: { schoolId: 'school-1', attemptId: 'attempt-1', dismissed: false },
        data: { dismissed: true },
      });
      expect(mockPrisma.assessmentAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { flaggedForReview: false },
      });
    });
  });

  describe('Integrity audit review and dismissal', () => {
    it('returns integrity audit timeline and event counts', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        teacherId: 'teacher-1',
        title: 'Maths Midterm',
        enableProctoring: true,
      });
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 'attempt-1',
        status: AttemptStatus.SUBMITTED,
        proctoringPassed: true,
        flaggedForReview: true,
        student: { id: 'student-1', firstName: 'John', lastName: 'Doe' },
        violationEvents: [
          { id: 'e1', eventType: ViolationEventType.FULLSCREEN_EXIT, dismissed: false },
          { id: 'e2', eventType: ViolationEventType.FULLSCREEN_EXIT, dismissed: true },
        ],
      });

      const audit = await assessmentsService.getAttemptIntegrityAudit(
        'school-1',
        'assessment-1',
        'attempt-1',
        { id: 'user-t', email: 'teacher@test.com', role: UserRole.TEACHER },
      );

      expect(audit.attempt.flaggedForReview).toBe(true);
      expect(audit.summary.totalEvents).toBe(2);
      expect(audit.summary.activeViolations).toBe(1);
      expect(audit.summary.eventCounts[ViolationEventType.FULLSCREEN_EXIT]).toBe(2);
    });

    it('dismisses a violation event and unflags attempt when zero active remain', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'assessment-1',
        teacherId: 'teacher-1',
      });
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
      mockPrisma.assessmentViolationEvent.findFirst.mockResolvedValue({
        id: 'e1',
        dismissed: false,
      });
      mockPrisma.assessmentViolationEvent.update.mockResolvedValue({ id: 'e1', dismissed: true });
      mockPrisma.assessmentViolationEvent.count.mockResolvedValue(0);
      mockPrisma.assessmentAttempt.update.mockResolvedValue({});

      const res = await assessmentsService.dismissViolationEvent(
        'school-1',
        'assessment-1',
        'attempt-1',
        'e1',
        { id: 'user-t', email: 'teacher@test.com', role: UserRole.TEACHER },
      );

      expect(res.success).toBe(true);
      expect(res.remainingActiveViolations).toBe(0);
      expect(mockPrisma.assessmentAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { flaggedForReview: false },
      });
    });
  });

  describe('Teacher attempt listing and authorization (listAssessmentAttempts)', () => {
    it('throws NotFoundException if assessment does not exist in school', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue(null);

      await expect(
        assessmentsService.listAssessmentAttempts('school-1', 'invalid-as', {
          id: 'user-t',
          role: UserRole.TEACHER,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if teacher does not author the assessment', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'as-1',
        teacherId: 'teacher-owner',
      });
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-intruder' });

      await expect(
        assessmentsService.listAssessmentAttempts('school-1', 'as-1', {
          id: 'user-intruder',
          role: UserRole.TEACHER,
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lists minimal attempt summaries with accurate warning count and lock state for author', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'as-1',
        teacherId: 'teacher-1',
        enableProctoring: true,
        monitoringConfig: { requireFullscreen: true, maxWarnings: 3 },
      });
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 'teacher-1' });
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([
        {
          id: 'att-locked',
          studentId: 'st-1',
          status: AttemptStatus.IN_PROGRESS,
          flaggedForReview: true,
          startedAt: new Date('2026-11-12T10:00:00Z'),
          deadlineAt: new Date('2026-11-12T10:45:00Z'),
          submittedAt: null,
          student: {
            id: 'st-1',
            admissionNumber: 'ADM-001',
            rollNumber: '1',
            firstName: 'Nishu',
            lastName: 'Gupta',
          },
          violationEvents: [
            { id: 'v1', eventType: ViolationEventType.FULLSCREEN_EXIT, dismissed: false },
            { id: 'v2', eventType: ViolationEventType.FULLSCREEN_EXIT, dismissed: false },
            { id: 'v3', eventType: ViolationEventType.FULLSCREEN_EXIT, dismissed: false },
          ],
        },
        {
          id: 'att-clear',
          studentId: 'st-2',
          status: AttemptStatus.SUBMITTED,
          flaggedForReview: false,
          startedAt: new Date('2026-11-12T10:05:00Z'),
          deadlineAt: new Date('2026-11-12T10:50:00Z'),
          submittedAt: new Date('2026-11-12T10:35:00Z'),
          student: {
            id: 'st-2',
            admissionNumber: 'ADM-002',
            rollNumber: '2',
            firstName: 'Aarav',
            lastName: 'Sharma',
          },
          violationEvents: [],
        },
      ]);

      const results = await assessmentsService.listAssessmentAttempts('school-1', 'as-1', {
        id: 'user-t',
        role: UserRole.TEACHER,
      } as any);

      expect(results).toHaveLength(2);

      // Student 1 (Locked)
      expect(results[0].id).toBe('att-locked');
      expect(results[0].studentName).toBe('Nishu Gupta');
      expect(results[0].admissionNumber).toBe('ADM-001');
      expect(results[0].rollNumber).toBe('1');
      expect(results[0].status).toBe(AttemptStatus.IN_PROGRESS);
      expect(results[0].warningCount).toBe(3);
      expect(results[0].isLocked).toBe(true);
      expect(results[0].flaggedForReview).toBe(true);
      // Ensures private data (passwords, answers, questions) is NOT returned
      expect((results[0] as any).answers).toBeUndefined();
      expect((results[0] as any).password).toBeUndefined();

      // Student 2 (Clear and Submitted)
      expect(results[1].id).toBe('att-clear');
      expect(results[1].studentName).toBe('Aarav Sharma');
      expect(results[1].warningCount).toBe(0);
      expect(results[1].isLocked).toBe(false);
      expect(results[1].status).toBe(AttemptStatus.SUBMITTED);
    });

    it('allows school admin or platform super admin without teacher authorship restriction', async () => {
      mockExamRepo.findAssessmentById.mockResolvedValue({
        id: 'as-1',
        teacherId: 'teacher-1',
        enableProctoring: false,
      });
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([]);

      const results = await assessmentsService.listAssessmentAttempts('school-1', 'as-1', {
        id: 'user-admin',
        role: UserRole.SCHOOL_ADMIN,
      } as any);

      expect(results).toEqual([]);
      expect(mockPrisma.teacher.findFirst).not.toHaveBeenCalled();
    });
  });
});
