import {
  AssessmentChapterRecord,
  AssessmentDraftRecord,
  AssessmentMode,
  AssessmentQuestionRecord,
  AssessmentStatus,
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

export const EXAMINATION_REPOSITORY = 'EXAMINATION_REPOSITORY';

export interface CreateChapterData {
  schoolId: string;
  academicYearId: string;
  createdByTeacherId: string;
  gradeId: string;
  subject: string;
  chapterCode: string;
  title: string;
  orderIndex: number;
}

export interface ChapterFilter {
  gradeId?: string;
  subject?: string;
  academicYearId?: string;
  requestingTeacherId?: string;
}

export interface CreateAssessmentDraftData {
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
  enableProctoring?: boolean;
  monitoringConfig?: any;
}

export interface UpdateAssessmentDraftData {
  academicYearId?: string;
  gradeId?: string;
  sectionId?: string | null;
  chapterId?: string | null;
  title?: string;
  description?: string | null;
  subject?: string;
  mode?: AssessmentMode;
  totalMarks?: number;
  passingMarks?: number;
  durationMinutes?: number;
  startWindowAt?: Date | null;
  endWindowAt?: Date | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  enableProctoring?: boolean;
  monitoringConfig?: any;
}

export interface AssessmentFilter {
  status?: AssessmentStatus;
  gradeId?: string;
  subject?: string;
  academicYearId?: string;
  requestingTeacherId?: string;
}

export interface CreateQuestionData {
  schoolId: string;
  assessmentId: string;
  sectionId: string | null;
  orderIndex?: number;
  questionText: string;
  options: string[];
  correctOption: number;
  marks: number;
  explanation: string | null;
}

export interface UpdateQuestionData {
  sectionId?: string | null;
  orderIndex?: number;
  questionText?: string;
  options?: string[];
  correctOption?: number;
  marks?: number;
  explanation?: string | null;
}

export interface UpsertQuestionImageData {
  schoolId: string;
  assessmentId: string;
  questionId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  checksumSha256: string;
}

export interface ParentStudentAssessmentHistoryRow {
  id: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string | null;
  chapterId: string | null;
  chapterCode: string | null;
  chapterTitle: string | null;
  title: string;
  subject: string;
  mode: AssessmentMode;
  status: AssessmentStatus;
  totalMarks: number;
  passingMarks: number;
  durationMinutes: number;
  startWindowAt: Date | null;
  endWindowAt: Date | null;
  createdAt: Date;
  attempt: {
    id: string;
    studentId: string;
    status: AttemptStatus;
    submittedAt: Date | null;
    result: {
      attemptId: string;
      totalQuestions: number;
      attemptedQuestions: number;
      correctAnswers: number;
      incorrectAnswers: number;
      score: number;
      percentage: number;
      isPassing: boolean;
    } | null;
  } | null;
}

export interface IExaminationRepository {
  createChapter(data: CreateChapterData): Promise<AssessmentChapterRecord>;
  findChapters(schoolId: string, filter?: ChapterFilter): Promise<AssessmentChapterRecord[]>;
  findChapterById(schoolId: string, id: string): Promise<AssessmentChapterRecord | null>;
  findChapterByCode(
    schoolId: string,
    gradeId: string,
    subject: string,
    chapterCode: string,
    academicYearId?: string,
    teacherId?: string | null,
  ): Promise<AssessmentChapterRecord | null>;

  createAssessmentDraft(data: CreateAssessmentDraftData): Promise<AssessmentDraftRecord>;
  findAssessments(schoolId: string, filter?: AssessmentFilter): Promise<AssessmentDraftRecord[]>;
  findAssessmentById(schoolId: string, id: string): Promise<AssessmentDraftRecord | null>;
  updateAssessmentDraft(
    schoolId: string,
    id: string,
    data: UpdateAssessmentDraftData,
  ): Promise<AssessmentDraftRecord>;
  publishAssessment(
    schoolId: string,
    id: string,
    teacherId?: string,
  ): Promise<AssessmentDraftRecord>;
  deleteAssessmentDraft(schoolId: string, id: string): Promise<void>;
  countChildQuestions(assessmentId: string): Promise<number>;
  countChildSections(assessmentId: string): Promise<number>;

  createQuestion(
    data: CreateQuestionData,
    teacherId?: string,
  ): Promise<AssessmentQuestionRecord>;
  findQuestionsByAssessmentId(schoolId: string, assessmentId: string): Promise<AssessmentQuestionRecord[]>;
  findQuestionById(schoolId: string, assessmentId: string, id: string): Promise<AssessmentQuestionRecord | null>;
  updateQuestion(
    schoolId: string,
    assessmentId: string,
    id: string,
    data: UpdateQuestionData,
    teacherId?: string,
  ): Promise<AssessmentQuestionRecord>;
  deleteQuestion(
    schoolId: string,
    assessmentId: string,
    id: string,
    teacherId?: string,
  ): Promise<void>;
  getNextQuestionOrderIndex(assessmentId: string): Promise<number>;
  findAssessmentSectionById(
    schoolId: string,
    assessmentId: string,
    sectionId: string,
  ): Promise<{ id: string; assessmentId: string; title: string } | null>;
  createQuestionsBulkAtomic(
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
  }>;

  upsertQuestionImageAtomic(
    data: UpsertQuestionImageData,
    teacherId?: string,
  ): Promise<{ artifact: QuestionImageArtifactRecord; oldStoragePath: string | null }>;
  findQuestionImage(
    schoolId: string,
    assessmentId: string,
    questionId: string,
  ): Promise<QuestionImageArtifactRecord | null>;
  deleteQuestionImageAtomic(
    schoolId: string,
    assessmentId: string,
    questionId: string,
    teacherId?: string,
  ): Promise<{ deleted: boolean; storagePath: string | null }>;
  countImageReferencesByStoragePath(storagePath: string): Promise<number>;

  findQuestionImagesByAssessmentId(
    schoolId: string,
    assessmentId: string,
  ): Promise<QuestionImageArtifactRecord[]>;

  findEligibleAssessmentsForStudent(
    schoolId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string,
    studentId?: string,
  ): Promise<AssessmentDraftRecord[]>;

  findAttemptByStudentAndAssessment(
    schoolId: string,
    assessmentId: string,
    studentId: string,
  ): Promise<AssessmentAttemptRecord | null>;

  findAttemptById(
    schoolId: string,
    attemptId: string,
  ): Promise<AssessmentAttemptRecord | null>;

  createAttemptAtomic(data: {
    schoolId: string;
    assessmentId: string;
    studentId: string;
    startedAt: Date;
    deadlineAt: Date;
  }): Promise<AssessmentAttemptRecord>;

  findAttemptAnswers(
    schoolId: string,
    attemptId: string,
  ): Promise<AttemptAnswerRecord[]>;

  findExpiredInProgressAttempts(
    schoolId: string,
    assessmentId: string,
  ): Promise<AssessmentAttemptRecord[]>;

  saveAttemptAnswerAtomic(data: {
    schoolId: string;
    assessmentId: string;
    attemptId: string;
    questionId: string;
    selectedOption: number | null;
  }): Promise<AttemptAnswerRecord>;

  finalizeAttemptAtomic(
    schoolId: string,
    attemptId: string,
    targetStatus: AttemptStatus,
    assessmentId?: string,
  ): Promise<AssessmentAttemptRecord>;

  scoreAndPersistResultAtomic(
    schoolId: string,
    attemptId: string,
  ): Promise<AssessmentResultRecord>;

  finalizeAndScoreAttemptAtomic(
    schoolId: string,
    attemptId: string,
    targetStatus?: AttemptStatus,
    assessmentId?: string,
  ): Promise<{
    attempt: AssessmentAttemptRecord;
    result: AssessmentResultRecord;
  }>;

  findResultByAttemptId(
    schoolId: string,
    attemptId: string,
  ): Promise<AssessmentResultRecord | null>;

  updateProgressionAtomic(data: {
    schoolId: string;
    studentId: string;
    assessmentId: string;
    chapterId: string | null;
    status: ProgressionAssessmentStatus;
    unlockedAt?: Date | null;
  }): Promise<StudentAssessmentProgressionRecord>;

  findProgressionByStudentAndAssessment(
    schoolId: string,
    studentId: string,
    assessmentId: string,
  ): Promise<StudentAssessmentProgressionRecord | null>;

  findProgressionsByStudentAndChapter(
    schoolId: string,
    studentId: string,
    chapterId: string,
  ): Promise<StudentAssessmentProgressionRecord[]>;

  findChapterAssessmentsForStudent(
    schoolId: string,
    chapterId: string,
    academicYearId: string,
    gradeId: string,
    sectionId: string | null,
  ): Promise<AssessmentDraftRecord[]>;

  releaseAssessmentResultsAtomic(
    schoolId: string,
    id: string,
  ): Promise<AssessmentDraftRecord>;

  closeAssessmentAtomic(
    schoolId: string,
    id: string,
  ): Promise<AssessmentDraftRecord>;

  findParentStudentAssessmentHistory(
    schoolId: string,
    params: {
      studentId: string;
      academicYearId: string;
      gradeId: string;
      sectionId: string | null;
    },
  ): Promise<ParentStudentAssessmentHistoryRow[]>;

  findLeaderboardEntries(
    schoolId: string,
    assessmentId: string,
    pagination: { page: number; limit: number },
  ): Promise<{ entries: RawLeaderboardRow[]; totalCount: number }>;

  getSchoolExaminationSetting(
    schoolId: string,
  ): Promise<SchoolExaminationSettingRecord | null>;

  upsertSchoolExaminationSetting(
    schoolId: string,
    showStudentNamesOnLeaderboards: boolean,
    updatedByUserId: string,
  ): Promise<SchoolExaminationSettingRecord>;

  getPlatformLeaderboardMetrics(): Promise<PlatformSuperAdminLeaderboardMetricsDto>;
}
