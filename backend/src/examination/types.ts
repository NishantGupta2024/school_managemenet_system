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

export interface AssessmentChapterRecord {
  id: string;
  schoolId: string;
  academicYearId: string | null;
  createdByTeacherId: string | null;
  gradeId: string;
  subject: string;
  chapterCode: string;
  title: string;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssessmentDraftRecord {
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
  startWindowAt: Date | null;
  endWindowAt: Date | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  schoolId?: string;
}

export interface AssessmentQuestionRecord {
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
  createdAt: Date;
  updatedAt: Date;
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
  questions: AssessmentQuestionRecord[];
}

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

export enum ImageArtifactStatus {
  UPLOADED = 'UPLOADED',
  ATTACHED = 'ATTACHED',
  ORPHANED = 'ORPHANED',
}

export interface QuestionImageArtifactRecord {
  id: string;
  schoolId: string;
  assessmentId: string;
  questionId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  checksumSha256: string;
  status: ImageArtifactStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionImagePublicDto {
  id: string;
  questionId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksumSha256: string;
  status: ImageArtifactStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum AttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  TIMED_OUT = 'TIMED_OUT',
}

export interface AssessmentAttemptRecord {
  id: string;
  schoolId: string;
  assessmentId: string;
  studentId: string;
  status: AttemptStatus;
  startedAt: Date;
  deadlineAt: Date;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttemptAnswerRecord {
  id: string;
  schoolId: string;
  assessmentId: string;
  attemptId: string;
  questionId: string;
  selectedOption: number | null;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentSanitizedQuestionDto {
  id: string;
  sectionId: string | null;
  orderIndex: number;
  questionText: string;
  options: string[];
  marks: number;
  hasImage: boolean;
  imageUrl?: string | null;
}

export interface StudentAssessmentOverviewDto {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  mode: AssessmentMode;
  status: AssessmentStatus;
  totalMarks: number;
  passingMarks: number;
  durationMinutes: number;
  startWindowAt: Date | null;
  endWindowAt: Date | null;
  hasAttempt: boolean;
  attemptStatus: AttemptStatus | null;
  attemptId: string | null;
}

export interface StudentAttemptDetailDto {
  id: string;
  assessmentId: string;
  studentId: string;
  status: AttemptStatus;
  startedAt: Date;
  deadlineAt: Date;
  remainingSeconds: number;
  submittedAt: Date | null;
  questions: StudentSanitizedQuestionDto[];
  answers: Record<string, number | null>;
}

export interface SubmitAttemptResponseDto {
  success: boolean;
  message: string;
  attemptId: string;
  status: AttemptStatus;
  submittedAt: Date;
}

export interface AssessmentResultRecord {
  id: string;
  schoolId: string;
  assessmentId: string;
  attemptId: string;
  studentId: string;
  totalQuestions: number;
  attemptedQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  score: number;
  percentage: number;
  isPassing: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export enum ProgressionAssessmentStatus {
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  PENDING_OPEN = 'PENDING_OPEN',
  RESOLVED_SUBMITTED = 'RESOLVED_SUBMITTED',
  RESOLVED_TIMED_OUT = 'RESOLVED_TIMED_OUT',
  MISSED_UNATTEMPTED = 'MISSED_UNATTEMPTED',
  OVERRIDDEN = 'OVERRIDDEN',
}

export interface StudentAssessmentProgressionRecord {
  id: string;
  schoolId: string;
  studentId: string;
  assessmentId: string;
  chapterId: string | null;
  status: ProgressionAssessmentStatus;
  unlockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChapterProgressionAssessmentItemDto {
  assessmentId: string;
  mode: AssessmentMode;
  title: string;
  status: ProgressionAssessmentStatus;
  resolved: boolean;
}

export interface ChapterProgressionSummaryDto {
  chapterId: string;
  isUnlocked: boolean;
  unlockedAt: Date | null;
  configuredModes: AssessmentMode[];
  assessments: ChapterProgressionAssessmentItemDto[];
}

export interface ReleaseResultsResponseDto {
  success: boolean;
  message: string;
  assessmentId: string;
  status: AssessmentStatus;
  releasedAt: Date;
  alreadyReleased: boolean;
}

export interface StudentResultSummaryDto {
  attemptId: string;
  totalQuestions: number;
  attemptedQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  score: number;
  percentage: number;
  isPassing: boolean;
  submittedAt: Date | null;
}

export interface StudentResultViewDto {
  assessmentId: string;
  title: string;
  subject: string;
  totalMarks: number;
  passingMarks: number;
  hasAttempt: boolean;
  result: StudentResultSummaryDto | null;
  message?: string;
  chapterId?: string | null;
  chapterCode?: string | null;
  chapterTitle?: string | null;
  mode?: AssessmentMode;
  durationMinutes?: number;
  startWindowAt?: Date | null;
  endWindowAt?: Date | null;
  assessmentStatus?: AssessmentStatus;
  attemptStatus?: AttemptStatus | null;
}

export interface ParentAssessmentHistoryItemDto {
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
  startWindowAt: Date | null;
  endWindowAt: Date | null;
  assessmentStatus: AssessmentStatus;
  hasAttempt: boolean;
  attemptId: string | null;
  attemptStatus: AttemptStatus | null;
  submittedAt: Date | null;
  releasedResultSummary: StudentResultSummaryDto | null;
}

export interface ParentStudentAssessmentHistoryResponseDto {
  studentId: string;
  assessments: ParentAssessmentHistoryItemDto[];
}

export interface LeaderboardEntryDto {
  rank: number;
  studentName: string;
  score: number;
  percentage: number;
  isPassing: boolean;
  isCurrentUser: boolean;
}

export interface LeaderboardPaginationDto {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface LeaderboardResponseDto {
  assessmentId: string;
  title: string;
  subject: string;
  totalMarks: number;
  passingMarks: number;
  totalParticipants: number;
  showStudentNamesOnLeaderboards: boolean;
  entries: LeaderboardEntryDto[];
  pagination: LeaderboardPaginationDto;
}

export interface LeaderboardPrivacySettingResponseDto {
  schoolId: string;
  showStudentNamesOnLeaderboards: boolean;
  updatedAt: Date | null;
  updatedByUserId: string | null;
}

export interface PlatformSuperAdminLeaderboardMetricsDto {
  totalSchoolsReporting: number;
  totalReleasedAssessments: number;
  totalEligibleResults: number;
  schoolsWithNamesVisibleCount: number;
  schoolsWithNamesMaskedCount: number;
}

export interface RawLeaderboardRow {
  resultId: string;
  assessmentId: string;
  studentId: string;
  score: number | string;
  percentage: number | string;
  isPassing: boolean;
  firstName: string;
  lastName: string;
  rank: number | string;
  position?: number | string;
  resultCreatedAt: Date;
}

export interface SchoolExaminationSettingRecord {
  id: string;
  schoolId: string;
  showStudentNamesOnLeaderboards: boolean;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}


