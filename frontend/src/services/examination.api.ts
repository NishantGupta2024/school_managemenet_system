import api from './api';

// =============================================================================
// Enums & Constants
// =============================================================================

export enum AssessmentMode {
  NORMAL_QUIZ = 'NORMAL_QUIZ',
  LIVE_EXAM = 'LIVE_EXAM',
}

export enum AssessmentStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CLOSED = 'CLOSED',
  RESULTS_RELEASED = 'RESULTS_RELEASED',
  ARCHIVED = 'ARCHIVED',
}

export enum AttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  TIMED_OUT = 'TIMED_OUT',
}

export enum ImageArtifactStatus {
  UPLOADED = 'UPLOADED',
  ATTACHED = 'ATTACHED',
  ORPHANED = 'ORPHANED',
}

export enum ProgressionAssessmentStatus {
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  PENDING_OPEN = 'PENDING_OPEN',
  RESOLVED_SUBMITTED = 'RESOLVED_SUBMITTED',
  RESOLVED_TIMED_OUT = 'RESOLVED_TIMED_OUT',
  MISSED_UNATTEMPTED = 'MISSED_UNATTEMPTED',
  OVERRIDDEN = 'OVERRIDDEN',
}

// =============================================================================
// Chapter Interfaces
// =============================================================================

export interface AssessmentChapter {
  id: string;
  schoolId: string;
  academicYearId?: string | null;
  createdByTeacherId?: string | null;
  gradeId: string;
  subject: string;
  chapterCode: string;
  title: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChapterDto {
  gradeId: string;
  subject: string;
  chapterCode: string;
  title: string;
  orderIndex?: number;
}

export interface QueryChaptersDto {
  gradeId?: string;
  subject?: string;
}

// =============================================================================
// Assessment Interfaces & DTOs
// =============================================================================

export enum ViolationEventType {
  FULLSCREEN_EXIT = 'FULLSCREEN_EXIT',
  TAB_BLUR = 'TAB_BLUR',
  VISIBILITY_HIDDEN = 'VISIBILITY_HIDDEN',
  MULTIPLE_FACES = 'MULTIPLE_FACES',
  NO_FACE = 'NO_FACE',
  SUSPICIOUS_AUDIO = 'SUSPICIOUS_AUDIO',
  NETWORK_ANOMALY = 'NETWORK_ANOMALY',
  OBJECT_DETECTED = 'OBJECT_DETECTED',
}

export interface MonitoringConfig {
  requireFullscreen?: boolean;
  detectTabSwitch?: boolean;
  requireWebcam?: boolean;
  requireMic?: boolean;
  maxWarnings?: number;
  blockOnThreshold?: boolean;
}

export interface PreflightData {
  latencyMs?: number;
  downloadMbps?: number;
  uploadMbps?: number;
  bandwidthStatus?: 'OPTIMAL' | 'ACCEPTABLE' | 'DEGRADED';
  speedWarningAcknowledged?: boolean;
  fullscreenSupported?: boolean;
  cameraTested?: boolean;
  livenessPassed?: boolean;
  livenessChallenge?: 'TURN_LEFT' | 'TURN_RIGHT';
  livenessExemptionAcknowledged?: boolean;
  livenessTimestamp?: string;
  micTested?: boolean;
  ambientBaselineDb?: number;
  browser?: string;
  os?: string;
  timestamp?: string;
}

export interface ViolationEventRecord {
  id: string;
  eventType: ViolationEventType;
  timestamp: string;
  durationMs?: number | null;
  metadata?: any;
  dismissed: boolean;
  createdAt: string;
}

export interface IntegrityAuditResponse {
  attempt: {
    id: string;
    status: AttemptStatus;
    startedAt: string;
    deadlineAt: string;
    submittedAt: string | null;
    proctoringPassed: boolean;
    preflightData: PreflightData | null;
    flaggedForReview: boolean;
    studentExplanation: string | null;
    isLocked?: boolean;
    activeMisconductViolations?: number;
    maxAllowed?: number;
  };
  assessment: {
    id: string;
    title: string;
    enableProctoring: boolean;
    monitoringConfig: MonitoringConfig | null;
  };
  student: {
    id: string;
    admissionNumber: string;
    rollNumber: string | null;
    firstName: string;
    lastName: string;
  };
  events: ViolationEventRecord[];
  summary: {
    totalEvents: number;
    activeViolations: number;
    activeMisconductViolations?: number;
    maxAllowed?: number;
    isLocked?: boolean;
    eventCounts: Record<string, number>;
  };
}

export interface AssessmentAttemptSummary {
  id: string;
  studentId: string;
  studentName: string;
  admissionNumber: string | null;
  rollNumber: string | null;
  status: AttemptStatus;
  warningCount: number;
  totalViolationsCount: number;
  maxWarnings: number;
  isLocked: boolean;
  flaggedForReview: boolean;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
}

export interface AssessmentDraft {
  id: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string | null;
  teacherId: string;
  chapterId: string | null;
  title: string;
  description: string | null;
  subject: string;
  mode: AssessmentMode;
  status: AssessmentStatus;
  totalMarks: number;
  passingMarks: number;
  durationMinutes: number;
  startWindowAt: string | null;
  endWindowAt: string | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  enableProctoring?: boolean;
  monitoringConfig?: MonitoringConfig | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssessmentDraftDto {
  academicYearId: string;
  gradeId: string;
  sectionId?: string | null;
  chapterId: string;
  teacherId?: string;
  title: string;
  description?: string;
  subject: string;
  mode?: AssessmentMode;
  totalMarks: number;
  passingMarks: number;
  durationMinutes: number;
  startWindowAt?: string | null;
  endWindowAt?: string | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  enableProctoring?: boolean;
  monitoringConfig?: MonitoringConfig;
}

export interface UpdateAssessmentDraftDto {
  academicYearId?: string;
  gradeId?: string;
  sectionId?: string | null;
  chapterId?: string | null;
  title?: string;
  description?: string;
  subject?: string;
  mode?: AssessmentMode;
  totalMarks?: number;
  passingMarks?: number;
  durationMinutes?: number;
  startWindowAt?: string | null;
  endWindowAt?: string | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  enableProctoring?: boolean;
  monitoringConfig?: MonitoringConfig;
}

export interface QueryAssessmentsDto {
  status?: AssessmentStatus;
  gradeId?: string;
  subject?: string;
  academicYearId?: string;
}

export interface ReleaseResultsResponse {
  success: boolean;
  message: string;
  assessmentId: string;
  status: AssessmentStatus;
  releasedAt: string;
  alreadyReleased: boolean;
}

// =============================================================================
// Question Interfaces & DTOs
// =============================================================================

export interface AssessmentQuestion {
  id: string;
  schoolId: string;
  assessmentId: string;
  sectionId: string | null;
  orderIndex: number;
  questionText: string;
  options: string[];
  correctOption: number;
  marks: number;
  explanation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionMarksReconciliation {
  targetTotalMarks: number;
  currentAllocatedMarks: number;
  remainingMarks: number;
  totalQuestions: number;
  isReconciled: boolean;
}

export interface AssessmentQuestionListResponse {
  summary: QuestionMarksReconciliation;
  questions: AssessmentQuestion[];
}

export interface CreateQuestionDto {
  questionText: string;
  options: string[];
  correctOption: number;
  marks: number;
  orderIndex?: number;
  sectionId?: string | null;
  explanation?: string;
}

export interface UpdateQuestionDto {
  questionText?: string;
  options?: string[];
  correctOption?: number;
  marks?: number;
  orderIndex?: number;
  sectionId?: string | null;
  explanation?: string;
}

// =============================================================================
// Excel Import Interfaces & DTOs
// =============================================================================

export interface ParsedImportQuestion {
  rowNumber: number;
  serialNumber: number;
  orderIndex: number;
  questionText: string;
  options: string[];
  correctOption: number;
  marks: number;
  explanation: string | null;
}

export interface InvalidImportRow {
  rowNumber: number;
  data: Record<string, any>;
  errors: string[];
}

export interface DuplicateSerialError {
  serialNumber: number;
  rowNumbers: number[];
  message: string;
}

export interface QuestionImportPreviewResponse {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validQuestions: ParsedImportQuestion[];
  invalidRows: InvalidImportRow[];
  duplicateSerialErrors: DuplicateSerialError[];
  duplicateQuestionWarnings: string[];
  importedCount: number;
  importedMarks: number;
  existingCount: number;
  existingAllocatedMarks: number;
  projectedTotalMarks: number;
  targetTotalMarks: number;
  remainingMarks: number;
  isReconciled: boolean;
  reconciliationWarning: string | null;
}

export interface ImportQuestionItemDto {
  questionText: string;
  options: string[];
  correctOption: number;
  marks: number;
  orderIndex?: number;
  sectionId?: string | null;
  explanation?: string | null;
}

export interface ConfirmQuestionImportDto {
  questions: ImportQuestionItemDto[];
}

export interface QuestionImportConfirmResponse {
  success: boolean;
  message: string;
  importedCount: number;
  importedMarks: number;
  totalQuestions: number;
  currentAllocatedMarks: number;
  remainingMarks: number;
  isReconciled: boolean;
}

// =============================================================================
// Image Artifact Interfaces
// =============================================================================

export interface QuestionImagePublicDto {
  id: string;
  questionId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksumSha256: string;
  status: ImageArtifactStatus;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Student Workflow Interfaces & DTOs
// =============================================================================

export interface StudentAssessmentOverview {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  mode: AssessmentMode;
  status: AssessmentStatus;
  totalMarks: number;
  passingMarks: number;
  durationMinutes: number;
  startWindowAt: string | null;
  endWindowAt: string | null;
  hasAttempt: boolean;
  attemptStatus: AttemptStatus | null;
  attemptId: string | null;
  enableProctoring?: boolean;
  monitoringConfig?: MonitoringConfig | null;
  proctoringPassed?: boolean;
}

export interface StudentSanitizedQuestion {
  id: string;
  sectionId: string | null;
  orderIndex: number;
  questionText: string;
  options: string[];
  marks: number;
  hasImage: boolean;
  imageUrl?: string | null;
}

export interface StudentAttemptDetail {
  id: string;
  assessmentId: string;
  studentId: string;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  remainingSeconds: number;
  submittedAt: string | null;
  enableProctoring?: boolean;
  monitoringConfig?: MonitoringConfig | null;
  proctoringPassed?: boolean;
  preflightData?: PreflightData | null;
  flaggedForReview?: boolean;
  studentExplanation?: string | null;
  isLocked?: boolean;
  activeWarningsCount?: number;
  maxWarnings?: number;
  questions: StudentSanitizedQuestion[];
  answers: Record<string, number | null>;
}

export interface SaveAnswerDto {
  selectedOption: number | null;
}

export interface SubmitAttemptResponse {
  success: boolean;
  message: string;
  attemptId: string;
  status: AttemptStatus;
  submittedAt: string;
}

// =============================================================================
// Result & Progression Interfaces
// =============================================================================

export interface StudentResultSummary {
  attemptId: string;
  totalQuestions: number;
  attemptedQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  score: number;
  percentage: number;
  isPassing: boolean;
  submittedAt: string | null;
}

export interface StudentResultView {
  assessmentId: string;
  title: string;
  subject: string;
  totalMarks: number;
  passingMarks: number;
  hasAttempt: boolean;
  result: StudentResultSummary | null;
  message?: string;
  chapterId?: string | null;
  chapterCode?: string | null;
  chapterTitle?: string | null;
  mode?: AssessmentMode;
  durationMinutes?: number;
  startWindowAt?: string | null;
  endWindowAt?: string | null;
  assessmentStatus?: AssessmentStatus;
  attemptStatus?: AttemptStatus | null;
}

export interface ParentAssessmentHistoryItem {
  assessmentId: string;
  title: string;
  subject: string;
  chapterId: string | null;
  chapterCode: string | null;
  chapterTitle: string | null;
  mode: AssessmentMode;
  totalMarks: number;
  passingMarks: number;
  durationMinutes: number;
  startWindowAt: string | null;
  endWindowAt: string | null;
  assessmentStatus: AssessmentStatus;
  hasAttempt: boolean;
  attemptId: string | null;
  attemptStatus: AttemptStatus | null;
  submittedAt: string | null;
  releasedResultSummary: StudentResultSummary | null;
}

export interface ParentStudentAssessmentHistoryResponse {
  studentId: string;
  assessments: ParentAssessmentHistoryItem[];
}

export interface StudentChapterOption {
  id: string;
  chapterCode: string;
  title: string;
  subject: string;
  orderIndex: number;
}

export interface ChapterProgressionAssessmentItem {
  assessmentId: string;
  mode: AssessmentMode;
  title: string;
  status: ProgressionAssessmentStatus;
  resolved: boolean;
}

export interface ChapterProgressionSummary {
  chapterId: string;
  isUnlocked: boolean;
  unlockedAt: string | null;
  configuredModes: AssessmentMode[];
  assessments: ChapterProgressionAssessmentItem[];
}

// =============================================================================
// Leaderboard Interfaces & DTOs (Phase 4B)
// =============================================================================

export interface LeaderboardEntry {
  rank: number;
  studentName: string;
  score: number;
  percentage: number;
  isPassing: boolean;
  isCurrentUser: boolean;
}

export interface LeaderboardPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  pagination: LeaderboardPagination;
  totalParticipants: number;
}

export interface LeaderboardPrivacySettingResponse {
  schoolId: string;
  showStudentNamesOnLeaderboards: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface UpdateLeaderboardPrivacyDto {
  showStudentNamesOnLeaderboards: boolean;
}

export interface PlatformLeaderboardMetrics {
  totalSchoolsReporting: number;
  totalReleasedAssessments: number;
  totalEligibleResults: number;
  schoolsWithNamesVisibleCount: number;
  schoolsWithNamesMaskedCount: number;
}

// =============================================================================
// Typed Examination API Service
// =============================================================================

export const examinationApi = {
  // ---------------------------------------------------------------------------
  // 1. Chapters
  // ---------------------------------------------------------------------------
  createChapter: async (dto: CreateChapterDto): Promise<AssessmentChapter> => {
    const res = await api.post<AssessmentChapter>('/examination/chapters', dto);
    return res.data;
  },

  listChapters: async (query?: QueryChaptersDto): Promise<AssessmentChapter[]> => {
    const res = await api.get<AssessmentChapter[]>('/examination/chapters', { params: query });
    return res.data;
  },

  getChapterById: async (id: string): Promise<AssessmentChapter> => {
    const res = await api.get<AssessmentChapter>(`/examination/chapters/${id}`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // 2. Assessment Drafts & Lifecycle
  // ---------------------------------------------------------------------------
  createDraft: async (dto: CreateAssessmentDraftDto): Promise<AssessmentDraft> => {
    const res = await api.post<AssessmentDraft>('/examination/assessments/drafts', dto);
    return res.data;
  },

  listAssessments: async (query?: QueryAssessmentsDto): Promise<AssessmentDraft[]> => {
    const res = await api.get<AssessmentDraft[]>('/examination/assessments', { params: query });
    return res.data;
  },

  getAssessmentById: async (id: string): Promise<AssessmentDraft> => {
    const res = await api.get<AssessmentDraft>(`/examination/assessments/${id}`);
    return res.data;
  },

  updateDraft: async (id: string, dto: UpdateAssessmentDraftDto): Promise<AssessmentDraft> => {
    const res = await api.patch<AssessmentDraft>(`/examination/assessments/${id}`, dto);
    return res.data;
  },

  deleteDraft: async (id: string): Promise<{ success: boolean; message: string }> => {
    const res = await api.delete<{ success: boolean; message: string }>(`/examination/assessments/${id}`);
    return res.data;
  },

  publishAssessment: async (id: string): Promise<AssessmentDraft> => {
    const res = await api.post<AssessmentDraft>(`/examination/assessments/${id}/publish`);
    return res.data;
  },

  closeAssessment: async (id: string): Promise<AssessmentDraft> => {
    const res = await api.post<AssessmentDraft>(`/examination/assessments/${id}/close`);
    return res.data;
  },

  releaseResults: async (id: string): Promise<ReleaseResultsResponse> => {
    const res = await api.post<ReleaseResultsResponse>(`/examination/assessments/${id}/release-results`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // 3. Questions
  // ---------------------------------------------------------------------------
  createQuestion: async (
    assessmentId: string,
    dto: CreateQuestionDto,
  ): Promise<AssessmentQuestion> => {
    const res = await api.post<AssessmentQuestion>(
      `/examination/assessments/${assessmentId}/questions`,
      dto,
    );
    return res.data;
  },

  listQuestions: async (assessmentId: string): Promise<AssessmentQuestionListResponse> => {
    const res = await api.get<AssessmentQuestionListResponse>(
      `/examination/assessments/${assessmentId}/questions`,
    );
    return res.data;
  },

  getQuestionById: async (
    assessmentId: string,
    id: string,
  ): Promise<AssessmentQuestion> => {
    const res = await api.get<AssessmentQuestion>(
      `/examination/assessments/${assessmentId}/questions/${id}`,
    );
    return res.data;
  },

  updateQuestion: async (
    assessmentId: string,
    id: string,
    dto: UpdateQuestionDto,
  ): Promise<AssessmentQuestion> => {
    const res = await api.patch<AssessmentQuestion>(
      `/examination/assessments/${assessmentId}/questions/${id}`,
      dto,
    );
    return res.data;
  },

  deleteQuestion: async (
    assessmentId: string,
    id: string,
  ): Promise<{ success: boolean; message: string }> => {
    const res = await api.delete<{ success: boolean; message: string }>(
      `/examination/assessments/${assessmentId}/questions/${id}`,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // 4. Excel MCQ Import
  // ---------------------------------------------------------------------------
  previewImport: async (
    assessmentId: string,
    file: File,
  ): Promise<QuestionImportPreviewResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<QuestionImportPreviewResponse>(
      `/examination/assessments/${assessmentId}/questions/import/preview`,
      formData,
    );
    return res.data;
  },

  confirmImport: async (
    assessmentId: string,
    dto: ConfirmQuestionImportDto,
  ): Promise<QuestionImportConfirmResponse> => {
    const res = await api.post<QuestionImportConfirmResponse>(
      `/examination/assessments/${assessmentId}/questions/import/confirm`,
      dto,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // 5. Question Images
  // ---------------------------------------------------------------------------
  uploadQuestionImage: async (
    assessmentId: string,
    questionId: string,
    file: File,
  ): Promise<QuestionImagePublicDto> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<QuestionImagePublicDto>(
      `/examination/assessments/${assessmentId}/questions/${questionId}/image`,
      formData,
    );
    return res.data;
  },

  getQuestionImageBlob: async (
    assessmentId: string,
    questionId: string,
  ): Promise<Blob> => {
    const res = await api.get<Blob>(
      `/examination/assessments/${assessmentId}/questions/${questionId}/image`,
      { responseType: 'blob' },
    );
    return res.data;
  },

  deleteQuestionImage: async (
    assessmentId: string,
    questionId: string,
  ): Promise<{ success: boolean; message: string }> => {
    const res = await api.delete<{ success: boolean; message: string }>(
      `/examination/assessments/${assessmentId}/questions/${questionId}/image`,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // 6. Student Portal Workflow
  // ---------------------------------------------------------------------------
  listStudentAssessments: async (): Promise<StudentAssessmentOverview[]> => {
    const res = await api.get<StudentAssessmentOverview[]>('/examination/student/assessments');
    return res.data;
  },

  startAssessment: async (assessmentId: string): Promise<StudentAttemptDetail> => {
    const res = await api.post<StudentAttemptDetail>(
      `/examination/student/assessments/${assessmentId}/start`,
    );
    return res.data;
  },

  getAttempt: async (attemptId: string): Promise<StudentAttemptDetail> => {
    const res = await api.get<StudentAttemptDetail>(
      `/examination/student/attempts/${attemptId}`,
    );
    return res.data;
  },

  saveAnswer: async (
    attemptId: string,
    questionId: string,
    dto: SaveAnswerDto,
  ): Promise<{ success: boolean; questionId: string; selectedOption: number | null }> => {
    const res = await api.put<{ success: boolean; questionId: string; selectedOption: number | null }>(
      `/examination/student/attempts/${attemptId}/answers/${questionId}`,
      dto,
    );
    return res.data;
  },

  submitAttempt: async (attemptId: string): Promise<SubmitAttemptResponse> => {
    const res = await api.post<SubmitAttemptResponse>(
      `/examination/student/attempts/${attemptId}/submit`,
    );
    return res.data;
  },

  getStudentAssessmentResult: async (assessmentId: string): Promise<StudentResultView> => {
    const res = await api.get<StudentResultView>(
      `/examination/student/assessments/${assessmentId}/result`,
    );
    return res.data;
  },

  getStudentChapters: async (): Promise<StudentChapterOption[]> => {
    const res = await api.get<StudentChapterOption[]>('/examination/student/chapters');
    return res.data;
  },

  getChapterProgression: async (chapterId: string): Promise<ChapterProgressionSummary> => {
    const res = await api.get<ChapterProgressionSummary>(
      `/examination/student/chapters/${chapterId}/progression`,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // 7. Parent Portal Workflow
  // ---------------------------------------------------------------------------
  getParentStudentAssessments: async (
    studentId: string,
  ): Promise<ParentStudentAssessmentHistoryResponse> => {
    const res = await api.get<ParentStudentAssessmentHistoryResponse>(
      `/examination/parent/students/${studentId}/assessments`,
    );
    return res.data;
  },

  getParentAssessmentResult: async (
    studentId: string,
    assessmentId: string,
  ): Promise<StudentResultView> => {
    const res = await api.get<StudentResultView>(
      `/examination/parent/students/${studentId}/assessments/${assessmentId}/result`,
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // 8. Leaderboard Workflows (Phase 4B)
  // ---------------------------------------------------------------------------
  getStudentLeaderboard: async (
    assessmentId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<LeaderboardResponse> => {
    const res = await api.get<LeaderboardResponse>(
      `/examination/student/assessments/${assessmentId}/leaderboard`,
      { params: { page, limit } },
    );
    return res.data;
  },

  getParentLeaderboard: async (
    studentId: string,
    assessmentId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<LeaderboardResponse> => {
    const res = await api.get<LeaderboardResponse>(
      `/examination/parent/students/${studentId}/assessments/${assessmentId}/leaderboard`,
      { params: { page, limit } },
    );
    return res.data;
  },

  getStaffLeaderboard: async (
    assessmentId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<LeaderboardResponse> => {
    const res = await api.get<LeaderboardResponse>(
      `/examination/assessments/${assessmentId}/leaderboard`,
      { params: { page, limit } },
    );
    return res.data;
  },

  getLeaderboardPrivacySetting: async (): Promise<LeaderboardPrivacySettingResponse> => {
    const res = await api.get<LeaderboardPrivacySettingResponse>(
      '/examination/settings/leaderboard-privacy',
    );
    return res.data;
  },

  updateLeaderboardPrivacySetting: async (
    dto: UpdateLeaderboardPrivacyDto,
  ): Promise<LeaderboardPrivacySettingResponse> => {
    const res = await api.patch<LeaderboardPrivacySettingResponse>(
      '/examination/settings/leaderboard-privacy',
      dto,
    );
    return res.data;
  },

  getPlatformLeaderboardMetrics: async (): Promise<PlatformLeaderboardMetrics> => {
    const res = await api.get<PlatformLeaderboardMetrics>(
      '/examination/platform/leaderboard/metrics',
    );
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // 9. Proctoring & Readiness Checks
  // ---------------------------------------------------------------------------
  testNetworkReadiness: async (
    samplePayload: string = 'ping',
  ): Promise<{ receivedAt: string; payloadSize: number; latencyMs: number }> => {
    const start = performance.now();
    const res = await api.post<{ receivedAt: string; payloadSize: number }>(
      '/examination/student/preflight/network-check',
      { data: samplePayload },
    );
    const latencyMs = Math.round(performance.now() - start);
    return { ...res.data, latencyMs };
  },

  testBandwidthSpeed: async (): Promise<{
    latencyMs: number;
    downloadMbps: number;
    uploadMbps: number;
    bandwidthStatus: 'OPTIMAL' | 'ACCEPTABLE' | 'DEGRADED';
  }> => {
    // 1. Latency: Measure median of 3 pings to local backend
    const pings: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await api.get<{ receivedAt: string }>('/examination/student/preflight/ping', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      pings.push(performance.now() - t0);
    }
    pings.sort((a, b) => a - b);
    const latencyMs = Math.max(1, Math.round(pings[1] || pings[0] || 10));

    // 2. Download speed: GET 250 KB binary probe
    const tDownStart = performance.now();
    const dlRes = await api.get('/examination/student/preflight/download-sample', {
      responseType: 'arraybuffer',
      headers: { 'Cache-Control': 'no-store, no-cache' },
    });
    const tDownElapsed = Math.max((performance.now() - tDownStart) / 1000, 0.001);
    const downloadedBytes = (dlRes.data as ArrayBuffer)?.byteLength || 250 * 1024;
    const downloadBits = downloadedBytes * 8;
    const downloadMbps = Number((downloadBits / (tDownElapsed * 1_000_000)).toFixed(2));

    // 3. Upload speed: POST 64 KB probe
    const uploadPayload = 'U'.repeat(64 * 1024);
    const tUpStart = performance.now();
    await api.post('/examination/student/preflight/upload-sample', {
      data: uploadPayload,
    });
    const tUpElapsed = Math.max((performance.now() - tUpStart) / 1000, 0.001);
    const uploadBytes = 64 * 1024;
    const uploadBits = uploadBytes * 8;
    const uploadMbps = Number((uploadBits / (tUpElapsed * 1_000_000)).toFixed(2));

    // Threshold classification
    let bandwidthStatus: 'OPTIMAL' | 'ACCEPTABLE' | 'DEGRADED' = 'OPTIMAL';
    if (latencyMs > 350 || downloadMbps < 0.8 || uploadMbps < 0.3) {
      bandwidthStatus = 'DEGRADED';
    } else if (latencyMs > 150 || downloadMbps < 2.0 || uploadMbps < 1.0) {
      bandwidthStatus = 'ACCEPTABLE';
    }

    return {
      latencyMs,
      downloadMbps,
      uploadMbps,
      bandwidthStatus,
    };
  },

  completePreflight: async (
    attemptId: string,
    preflightData: PreflightData,
  ): Promise<{ success: boolean; proctoringPassed: boolean }> => {
    const res = await api.post<{ success: boolean; proctoringPassed: boolean }>(
      `/examination/student/attempts/${attemptId}/preflight-complete`,
      { preflightData },
    );
    return res.data;
  },

  recordViolationEvent: async (
    attemptId: string,
    eventType: ViolationEventType,
    durationMs?: number,
    metadata?: any,
  ): Promise<{
    recorded: boolean;
    eventId?: string;
    eventType?: string;
    totalViolations?: number;
    activeMisconductViolations?: number;
    maxAllowed?: number;
    flaggedForReview?: boolean;
    isLocked?: boolean;
    throttled?: boolean;
    message?: string;
  }> => {
    const res = await api.post<{
      recorded: boolean;
      eventId?: string;
      eventType?: string;
      totalViolations?: number;
      activeMisconductViolations?: number;
      maxAllowed?: number;
      flaggedForReview?: boolean;
      isLocked?: boolean;
      throttled?: boolean;
      message?: string;
    }>(`/examination/student/attempts/${attemptId}/events`, {
      eventType,
      durationMs,
      metadata,
    });
    return res.data;
  },

  recordStudentExplanation: async (
    attemptId: string,
    explanation: string,
  ): Promise<{ success: boolean }> => {
    const res = await api.post<{ success: boolean }>(
      `/examination/student/attempts/${attemptId}/explanation`,
      { explanation },
    );
    return res.data;
  },

  listAssessmentAttempts: async (
    assessmentId: string,
  ): Promise<AssessmentAttemptSummary[]> => {
    const res = await api.get<AssessmentAttemptSummary[]>(
      `/examination/assessments/${assessmentId}/attempts`,
    );
    return res.data;
  },

  getAttemptIntegrityAudit: async (
    assessmentId: string,
    attemptId: string,
  ): Promise<IntegrityAuditResponse> => {
    const res = await api.get<IntegrityAuditResponse>(
      `/examination/assessments/${assessmentId}/attempts/${attemptId}/integrity-audit`,
    );
    return res.data;
  },

  dismissViolationEvent: async (
    assessmentId: string,
    attemptId: string,
    eventId: string,
  ): Promise<{
    success: boolean;
    dismissedEventId: string;
    remainingActiveViolations: number;
    remainingMisconductViolations: number;
    isLocked: boolean;
  }> => {
    const res = await api.patch<{
      success: boolean;
      dismissedEventId: string;
      remainingActiveViolations: number;
      remainingMisconductViolations: number;
      isLocked: boolean;
    }>(
      `/examination/assessments/${assessmentId}/attempts/${attemptId}/integrity-audit/${eventId}/dismiss`,
    );
    return res.data;
  },

  unlockAttempt: async (
    assessmentId: string,
    attemptId: string,
  ): Promise<{ success: boolean; message: string; attemptId: string; isLocked: boolean }> => {
    const res = await api.patch<{ success: boolean; message: string; attemptId: string; isLocked: boolean }>(
      `/examination/assessments/${assessmentId}/attempts/${attemptId}/unlock`,
    );
    return res.data;
  },
};

export default examinationApi;
