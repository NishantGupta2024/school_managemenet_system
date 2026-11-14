import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit3,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Layers,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  Award,
  Lock,
  Trophy,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  examinationApi,
  AssessmentDraft,
  AssessmentChapter,
  AssessmentMode,
  AssessmentStatus,
  CreateAssessmentDraftDto,
  UpdateAssessmentDraftDto,
  CreateChapterDto,
} from '../services/examination.api';
import {
  academicsApi,
  GradeClass,
  AcademicYear,
  getMyTeacherProfile,
  Teacher,
} from '../services/api';
import { AssessmentQuestionManagementView } from './AssessmentQuestionManagementView';
import { ExaminationLeaderboardModal } from './ExaminationLeaderboardModal';
import { AssessmentAttemptsModal } from './AssessmentAttemptsModal';
import { AssessmentIntegrityAuditModal } from './AssessmentIntegrityAuditModal';
import { downloadQuestionTemplate } from '../utils/questionTemplateGenerator';

interface TeacherExaminationViewProps {
  onSelectAssessmentForQuestions?: (assessment: AssessmentDraft) => void;
}

export const TeacherExaminationView: React.FC<TeacherExaminationViewProps> = ({
  onSelectAssessmentForQuestions,
}) => {
  const { user } = useAuth();

  // ---------------------------------------------------------------------------
  // State: Data
  // ---------------------------------------------------------------------------
  const [assessments, setAssessments] = useState<AssessmentDraft[]>([]);
  const [chapters, setChapters] = useState<AssessmentChapter[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [teacherProfile, setTeacherProfile] = useState<Teacher | null>(null);

  // ---------------------------------------------------------------------------
  // State: UI & Status
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<'assessments' | 'chapters'>('assessments');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [chapterFilter, setChapterFilter] = useState<string>('ALL');

  // Modals
  const [isCreateChapterOpen, setIsCreateChapterOpen] = useState<boolean>(false);
  const [isCreateDraftOpen, setIsCreateDraftOpen] = useState<boolean>(false);
  const [editingDraft, setEditingDraft] = useState<AssessmentDraft | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<AssessmentDraft | null>(null);
  const [viewingDraft, setViewingDraft] = useState<AssessmentDraft | null>(null);
  const [managingQuestionsAssessment, setManagingQuestionsAssessment] = useState<AssessmentDraft | null>(null);
  const [leaderboardAssessment, setLeaderboardAssessment] = useState<AssessmentDraft | null>(null);

  // Lifecycle confirmation modal & loading state
  const [lifecycleModal, setLifecycleModal] = useState<{
    type: 'publish' | 'close' | 'release';
    assessment: AssessmentDraft;
  } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Form Submitting flags
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Chapter Form State
  // ---------------------------------------------------------------------------
  const [chapterForm, setChapterForm] = useState<{
    gradeId: string;
    subject: string;
    chapterCode: string;
    title: string;
    orderIndex: number;
  }>({
    gradeId: '',
    subject: '',
    chapterCode: '',
    title: '',
    orderIndex: 1,
  });

  // ---------------------------------------------------------------------------
  // Assessment Draft Form State
  // ---------------------------------------------------------------------------
  const [draftForm, setDraftForm] = useState<{
    academicYearId: string;
    gradeId: string;
    sectionId: string;
    chapterId: string;
    title: string;
    description: string;
    subject: string;
    mode: AssessmentMode;
    totalMarks: number;
    passingMarks: number;
    durationMinutes: number;
    startWindowAt: string;
    endWindowAt: string;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    enableProctoring: boolean;
    requireFullscreen: boolean;
    detectTabSwitch: boolean;
    requireWebcam: boolean;
    requireMic: boolean;
    maxWarnings: number;
  }>({
    academicYearId: '',
    gradeId: '',
    sectionId: '',
    chapterId: '',
    title: '',
    description: '',
    subject: '',
    mode: AssessmentMode.NORMAL_QUIZ,
    totalMarks: 50,
    passingMarks: 20,
    durationMinutes: 30,
    startWindowAt: '',
    endWindowAt: '',
    shuffleQuestions: false,
    shuffleOptions: false,
    enableProctoring: false,
    requireFullscreen: true,
    detectTabSwitch: true,
    requireWebcam: false,
    requireMic: false,
    maxWarnings: 3,
  });

  const [attemptsModalAssessment, setAttemptsModalAssessment] = useState<AssessmentDraft | null>(null);
  const [integrityAuditAssessment, setIntegrityAuditAssessment] = useState<AssessmentDraft | null>(null);
  const [integrityAuditAttemptId, setIntegrityAuditAttemptId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [assessmentsRes, chaptersRes, gradesRes, yearsRes] = await Promise.all([
        examinationApi.listAssessments().catch((err) => {
          console.error('Failed to list assessments', err);
          return [] as AssessmentDraft[];
        }),
        examinationApi.listChapters().catch((err) => {
          console.error('Failed to list chapters', err);
          return [] as AssessmentChapter[];
        }),
        academicsApi.getGrades().catch((err) => {
          console.error('Failed to load grades', err);
          return [] as GradeClass[];
        }),
        academicsApi.getAcademicYears().catch((err) => {
          console.error('Failed to load academic years', err);
          return [] as AcademicYear[];
        }),
      ]);

      setAssessments(assessmentsRes || []);
      setChapters(chaptersRes || []);
      setGrades(gradesRes || []);
      setAcademicYears(yearsRes || []);

      if (user) {
        const teacher = await getMyTeacherProfile(user).catch(() => null);
        setTeacherProfile(teacher);
      }
    } catch (err: any) {
      console.error('Error initializing teacher workspace', err);
      setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to load examination data.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-clear success messages after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ---------------------------------------------------------------------------
  // Computed Data & Filtering
  // ---------------------------------------------------------------------------
  const currentAcademicYear = useMemo(() => {
    return academicYears.find((y) => y.isCurrent) || academicYears[0] || null;
  }, [academicYears]);

  const isTeacher = user?.role === 'TEACHER';

  // Active assignments for current academic year
  const activeTeacherAssignments = useMemo(() => {
    if (!isTeacher || !teacherProfile?.assignments) return [];
    const currentYearId = currentAcademicYear?.id;
    return teacherProfile.assignments.filter((a) => {
      if (currentYearId && a.academicYearId) {
        return a.academicYearId === currentYearId;
      }
      return a.academicYear?.isCurrent !== false;
    });
  }, [isTeacher, teacherProfile, currentAcademicYear]);

  const hasNoAssignments = isTeacher && !isLoading && activeTeacherAssignments.length === 0;

  // Assigned grades for the active academic year (all grades if admin)
  const assignedGrades = useMemo(() => {
    if (!isTeacher) return grades;
    const assignedGradeIds = new Set(activeTeacherAssignments.map((a) => a.gradeId));
    return grades.filter((g) => assignedGradeIds.has(g.id));
  }, [isTeacher, grades, activeTeacherAssignments]);

  // Subjects assigned to teacher for a specific grade
  const assignedSubjectsForGrade = useCallback(
    (gradeId: string) => {
      if (!isTeacher) {
        const set = new Set<string>();
        chapters.forEach((c) => {
          if (!gradeId || c.gradeId === gradeId) set.add(c.subject);
        });
        return Array.from(set);
      }
      const set = new Set<string>();
      activeTeacherAssignments
        .filter((a) => !gradeId || a.gradeId === gradeId)
        .forEach((a) => {
          if (a.subject) set.add(a.subject);
        });
      return Array.from(set);
    },
    [isTeacher, chapters, activeTeacherAssignments],
  );

  // Sections available for the selected grade in Draft Form
  const draftGradeSections = useMemo(() => {
    if (!draftForm.gradeId) return [];
    const selected = grades.find((g) => g.id === draftForm.gradeId);
    const allSections = selected?.sections || [];
    if (!isTeacher) return allSections;

    const assignedSectionIds = new Set(
      activeTeacherAssignments
        .filter((a) => {
          if (a.gradeId !== draftForm.gradeId) return false;
          if (draftForm.subject && a.subject.toLowerCase() !== draftForm.subject.toLowerCase()) return false;
          return true;
        })
        .map((a) => a.sectionId),
    );
    return allSections.filter((s) => assignedSectionIds.has(s.id));
  }, [draftForm.gradeId, draftForm.subject, grades, isTeacher, activeTeacherAssignments]);

  // Can the teacher create a Grade-wide assessment for this grade + subject?
  const canTeachGradeWide = useMemo(() => {
    if (!isTeacher) return true;
    if (!draftForm.gradeId) return false;
    const selectedGrade = grades.find((g) => g.id === draftForm.gradeId);
    const allSections = selectedGrade?.sections || [];
    if (allSections.length === 0) return false;
    if (!draftForm.subject) return false;

    const assignedSectionIds = new Set(
      activeTeacherAssignments
        .filter(
          (a) =>
            a.gradeId === draftForm.gradeId &&
            a.subject.toLowerCase() === draftForm.subject.toLowerCase(),
        )
        .map((a) => a.sectionId),
    );
    return allSections.every((s) => assignedSectionIds.has(s.id));
  }, [isTeacher, draftForm.gradeId, draftForm.subject, grades, activeTeacherAssignments]);

  // Subjects available for Draft Form based on selected grade
  const draftAvailableSubjects = useMemo(() => {
    if (!draftForm.gradeId) return [];
    if (!isTeacher) {
      const set = new Set<string>();
      chapters.filter((c) => c.gradeId === draftForm.gradeId).forEach((c) => set.add(c.subject));
      return Array.from(set);
    }
    const set = new Set<string>();
    activeTeacherAssignments
      .filter((a) => {
        if (a.gradeId !== draftForm.gradeId) return false;
        if (draftForm.sectionId && a.sectionId !== draftForm.sectionId) return false;
        return true;
      })
      .forEach((a) => {
        if (a.subject) set.add(a.subject);
      });
    return Array.from(set);
  }, [isTeacher, draftForm.gradeId, draftForm.sectionId, chapters, activeTeacherAssignments]);

  const stats = useMemo(() => {
    const total = assessments.length;
    const drafts = assessments.filter((a) => a.status === AssessmentStatus.DRAFT).length;
    const published = assessments.filter((a) => a.status === AssessmentStatus.PUBLISHED).length;
    const closed = assessments.filter((a) => a.status === AssessmentStatus.CLOSED).length;
    const released = assessments.filter((a) => a.status === AssessmentStatus.RESULTS_RELEASED).length;
    return {
      total,
      drafts,
      published,
      closed,
      released,
      chaptersCount: chapters.length,
    };
  }, [assessments, chapters]);

  const filteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = a.title.toLowerCase().includes(q);
        const matchesSubject = a.subject.toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubject) return false;
      }
      // Status
      if (statusFilter !== 'ALL' && a.status !== statusFilter) {
        return false;
      }
      // Grade
      if (gradeFilter !== 'ALL' && a.gradeId !== gradeFilter) {
        return false;
      }
      // Chapter
      if (chapterFilter !== 'ALL' && a.chapterId !== chapterFilter) {
        return false;
      }
      return true;
    });
  }, [assessments, searchQuery, statusFilter, gradeFilter, chapterFilter]);

  const filteredChapters = useMemo(() => {
    return chapters.filter((c) => {
      // Do not expose another teacher's private chapters if user is a teacher
      if (isTeacher && c.createdByTeacherId && (!teacherProfile?.id || c.createdByTeacherId !== teacherProfile.id)) {
        return false;
      }
      if (gradeFilter !== 'ALL' && c.gradeId !== gradeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesCode = c.chapterCode.toLowerCase().includes(q);
        const matchesSubject = c.subject.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCode && !matchesSubject) return false;
      }
      return true;
    });
  }, [chapters, isTeacher, teacherProfile, gradeFilter, searchQuery]);

  // Available chapters for the selected Grade + Subject in Draft Form
  const draftAvailableChapters = useMemo(() => {
    if (!draftForm.gradeId) return [];
    return chapters.filter((c) => {
      // Do not expose another teacher's private chapters
      if (isTeacher && c.createdByTeacherId && (!teacherProfile?.id || c.createdByTeacherId !== teacherProfile.id)) {
        return false;
      }
      const matchGrade = c.gradeId === draftForm.gradeId;
      const matchSubject = !draftForm.subject || c.subject.toLowerCase() === draftForm.subject.toLowerCase();
      return matchGrade && matchSubject;
    });
  }, [chapters, isTeacher, teacherProfile, draftForm.gradeId, draftForm.subject]);

  // Helper lookups
  const getGradeName = (gradeId: string) => {
    const g = grades.find((item) => item.id === gradeId);
    return g ? g.name : 'Unknown Grade';
  };

  const getSectionName = (gradeId: string, sectionId: string | null) => {
    if (!sectionId) return 'All Sections (Grade-wide)';
    const g = grades.find((item) => item.id === gradeId);
    const s = g?.sections?.find((sec) => sec.id === sectionId);
    return s ? `Section ${s.name}` : 'Specific Section';
  };

  const getChapterTitle = (chapterId: string | null) => {
    if (!chapterId) return 'Independent / General';
    const c = chapters.find((item) => item.id === chapterId);
    return c ? `${c.chapterCode}: ${c.title}` : 'Associated Chapter';
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: Chapter Creation
  // ---------------------------------------------------------------------------
  const handleOpenCreateChapter = () => {
    if (!isTeacher || hasNoAssignments) return;
    setFormError(null);
    const initialGradeId = assignedGrades[0]?.id || grades[0]?.id || '';
    const initialSubjects = assignedSubjectsForGrade(initialGradeId);
    setChapterForm({
      gradeId: initialGradeId,
      subject: initialSubjects[0] || teacherProfile?.assignments?.[0]?.subject || '',
      chapterCode: '',
      title: '',
      orderIndex: chapters.length + 1,
    });
    setIsCreateChapterOpen(true);
  };

  const handleSubmitChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!chapterForm.gradeId) {
      setFormError('Please select a grade.');
      return;
    }
    if (!chapterForm.subject.trim()) {
      setFormError('Please provide a subject name.');
      return;
    }
    if (!chapterForm.chapterCode.trim()) {
      setFormError('Chapter code is required (e.g., CH-01).');
      return;
    }
    if (!chapterForm.title.trim()) {
      setFormError('Chapter title is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: CreateChapterDto = {
        gradeId: chapterForm.gradeId,
        subject: chapterForm.subject.trim(),
        chapterCode: chapterForm.chapterCode.trim().toUpperCase(),
        title: chapterForm.title.trim(),
        orderIndex: Number(chapterForm.orderIndex) || 1,
      };

      const created = await examinationApi.createChapter(dto);
      setChapters((prev) => [...prev, created]);
      setSuccessMessage(`Chapter "${created.chapterCode}: ${created.title}" created successfully.`);
      setIsCreateChapterOpen(false);
    } catch (err: any) {
      console.error('Failed to create chapter', err);
      setFormError(err?.response?.data?.message || err?.message || 'Failed to create chapter.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: Download Excel Question Template
  // ---------------------------------------------------------------------------
  const handleDownloadTemplate = async () => {
    try {
      await downloadQuestionTemplate('Examination_MCQs_Template.xlsx');
      setSuccessMessage('Excel MCQ question template downloaded successfully.');
    } catch (err: any) {
      console.error('Failed to download question template', err);
      setErrorMessage('Failed to generate Excel question template.');
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: Assessment Draft Creation & Editing
  // ---------------------------------------------------------------------------
  const handleOpenCreateDraft = () => {
    if (hasNoAssignments) return;
    setFormError(null);
    setEditingDraft(null);

    const initialGradeId = assignedGrades[0]?.id || grades[0]?.id || '';
    const initialSubjects = assignedSubjectsForGrade(initialGradeId);
    const initialSubject = initialSubjects[0] || teacherProfile?.assignments?.[0]?.subject || '';

    const matchingChapters = chapters.filter(
      (c) =>
        (!isTeacher || !c.createdByTeacherId || (teacherProfile?.id && c.createdByTeacherId === teacherProfile.id)) &&
        c.gradeId === initialGradeId &&
        (!initialSubject || c.subject.toLowerCase() === initialSubject.toLowerCase()),
    );
    const firstChapter = matchingChapters[0] || null;

    // When teacher cannot teach grade-wide, auto-select the first assigned section
    const initialSectionId = canTeachGradeWide
      ? ''
      : (draftGradeSections[0]?.id || activeTeacherAssignments.find(a => a.gradeId === initialGradeId)?.sectionId || '');

    setDraftForm({
      academicYearId: currentAcademicYear?.id || '',
      gradeId: initialGradeId,
      sectionId: initialSectionId,
      chapterId: firstChapter ? firstChapter.id : '',
      title: firstChapter ? firstChapter.title : '',
      description: '',
      subject: initialSubject,
      mode: AssessmentMode.NORMAL_QUIZ,
      totalMarks: 50,
      passingMarks: 20,
      durationMinutes: 30,
      startWindowAt: '',
      endWindowAt: '',
      shuffleQuestions: false,
      shuffleOptions: false,
      enableProctoring: false,
      requireFullscreen: true,
      detectTabSwitch: true,
      requireWebcam: false,
      requireMic: false,
      maxWarnings: 3,
    });
    setIsCreateDraftOpen(true);
  };

  const handleOpenEditDraft = (draft: AssessmentDraft) => {
    if (draft.status !== AssessmentStatus.DRAFT) {
      return;
    }
    setFormError(null);
    setEditingDraft(draft);
    setDraftForm({
      academicYearId: draft.academicYearId,
      gradeId: draft.gradeId,
      sectionId: draft.sectionId || '',
      chapterId: draft.chapterId || '',
      title: draft.title,
      description: draft.description || '',
      subject: draft.subject,
      mode: draft.mode,
      totalMarks: draft.totalMarks,
      passingMarks: draft.passingMarks,
      durationMinutes: draft.durationMinutes,
      startWindowAt: draft.startWindowAt ? new Date(draft.startWindowAt).toISOString().slice(0, 16) : '',
      endWindowAt: draft.endWindowAt ? new Date(draft.endWindowAt).toISOString().slice(0, 16) : '',
      shuffleQuestions: draft.shuffleQuestions,
      shuffleOptions: draft.shuffleOptions,
      enableProctoring: draft.enableProctoring ?? false,
      requireFullscreen: draft.monitoringConfig?.requireFullscreen ?? true,
      detectTabSwitch: draft.monitoringConfig?.detectTabSwitch ?? true,
      requireWebcam: draft.monitoringConfig?.requireWebcam ?? false,
      requireMic: draft.monitoringConfig?.requireMic ?? false,
      maxWarnings: draft.monitoringConfig?.maxWarnings ?? 3,
    });
    setIsCreateDraftOpen(true);
  };

  const handleSubmitDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (!draftForm.academicYearId) {
      setFormError('Please select an academic year.');
      return;
    }
    if (!draftForm.gradeId) {
      setFormError('Please select a grade.');
      return;
    }
    if (!draftForm.chapterId) {
      setFormError('Please select a curriculum chapter for this assessment.');
      return;
    }
    if (!draftForm.title.trim()) {
      setFormError('Assessment title is required.');
      return;
    }
    if (!draftForm.subject.trim()) {
      setFormError('Subject is required.');
      return;
    }
    if (draftForm.totalMarks <= 0) {
      setFormError('Total marks must be at least 1.');
      return;
    }
    if (draftForm.passingMarks <= 0) {
      setFormError('Passing marks must be at least 1.');
      return;
    }
    if (draftForm.passingMarks > draftForm.totalMarks) {
      setFormError('Passing marks cannot exceed total marks.');
      return;
    }
    if (draftForm.durationMinutes <= 0) {
      setFormError('Duration must be at least 1 minute.');
      return;
    }
    if (draftForm.startWindowAt && draftForm.endWindowAt) {
      const start = new Date(draftForm.startWindowAt).getTime();
      const end = new Date(draftForm.endWindowAt).getTime();
      if (start >= end) {
        setFormError('Start window must precede end window.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (editingDraft) {
        // Update Draft
        const updateDto: UpdateAssessmentDraftDto = {
          academicYearId: draftForm.academicYearId,
          gradeId: draftForm.gradeId,
          sectionId: draftForm.sectionId ? draftForm.sectionId : null,
          chapterId: draftForm.chapterId ? draftForm.chapterId : null,
          title: draftForm.title.trim(),
          description: draftForm.description.trim() || undefined,
          subject: draftForm.subject.trim(),
          mode: draftForm.mode,
          totalMarks: Number(draftForm.totalMarks),
          passingMarks: Number(draftForm.passingMarks),
          durationMinutes: Number(draftForm.durationMinutes),
          startWindowAt: draftForm.startWindowAt ? new Date(draftForm.startWindowAt).toISOString() : null,
          endWindowAt: draftForm.endWindowAt ? new Date(draftForm.endWindowAt).toISOString() : null,
          shuffleQuestions: Boolean(draftForm.shuffleQuestions),
          shuffleOptions: Boolean(draftForm.shuffleOptions),
          enableProctoring: Boolean(draftForm.enableProctoring),
          monitoringConfig: {
            requireFullscreen: Boolean(draftForm.requireFullscreen),
            detectTabSwitch: Boolean(draftForm.detectTabSwitch),
            requireWebcam: Boolean(draftForm.requireWebcam),
            requireMic: Boolean(draftForm.requireMic),
            maxWarnings: Number(draftForm.maxWarnings) || 3,
          },
        };

        const updated = await examinationApi.updateDraft(editingDraft.id, updateDto);
        setAssessments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setSuccessMessage(`Assessment "${updated.title}" updated successfully.`);
      } else {
        // Create Draft
        const createDto: CreateAssessmentDraftDto = {
          academicYearId: draftForm.academicYearId,
          gradeId: draftForm.gradeId,
          sectionId: draftForm.sectionId ? draftForm.sectionId : null,
          chapterId: draftForm.chapterId,
          teacherId: teacherProfile?.id,
          title: draftForm.title.trim(),
          description: draftForm.description.trim() || undefined,
          subject: draftForm.subject.trim(),
          mode: draftForm.mode,
          totalMarks: Number(draftForm.totalMarks),
          passingMarks: Number(draftForm.passingMarks),
          durationMinutes: Number(draftForm.durationMinutes),
          startWindowAt: draftForm.startWindowAt ? new Date(draftForm.startWindowAt).toISOString() : null,
          endWindowAt: draftForm.endWindowAt ? new Date(draftForm.endWindowAt).toISOString() : null,
          shuffleQuestions: Boolean(draftForm.shuffleQuestions),
          shuffleOptions: Boolean(draftForm.shuffleOptions),
          enableProctoring: Boolean(draftForm.enableProctoring),
          monitoringConfig: {
            requireFullscreen: Boolean(draftForm.requireFullscreen),
            detectTabSwitch: Boolean(draftForm.detectTabSwitch),
            requireWebcam: Boolean(draftForm.requireWebcam),
            requireMic: Boolean(draftForm.requireMic),
            maxWarnings: Number(draftForm.maxWarnings) || 3,
          },
        };

        const created = await examinationApi.createDraft(createDto);
        setAssessments((prev) => [created, ...prev]);
        setSuccessMessage(`Assessment draft "${created.title}" created successfully.`);
      }

      setIsCreateDraftOpen(false);
      setEditingDraft(null);
    } catch (err: any) {
      console.error('Failed to save assessment draft', err);
      setFormError(err?.response?.data?.message || err?.message || 'Failed to save assessment draft.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: Delete Draft
  // ---------------------------------------------------------------------------
  const handleDeleteDraft = async () => {
    if (!deletingDraft) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await examinationApi.deleteDraft(deletingDraft.id);
      setAssessments((prev) => prev.filter((a) => a.id !== deletingDraft.id));
      setSuccessMessage(`Assessment "${deletingDraft.title}" was deleted.`);
      setDeletingDraft(null);
    } catch (err: any) {
      console.error('Failed to delete assessment draft', err);
      setFormError(err?.response?.data?.message || err?.message || 'Failed to delete assessment draft.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Action Handlers: Lifecycle Transitions (Publish, Close, Release Results)
  // ---------------------------------------------------------------------------
  const handleConfirmLifecycleAction = async () => {
    if (!lifecycleModal) return;
    const { type, assessment } = lifecycleModal;
    setActionLoadingId(assessment.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (type === 'publish') {
        const updated = await examinationApi.publishAssessment(assessment.id);
        setAssessments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setSuccessMessage(`Assessment "${updated.title}" has been published successfully.`);
      } else if (type === 'close') {
        const updated = await examinationApi.closeAssessment(assessment.id);
        setAssessments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setSuccessMessage(`Assessment "${updated.title}" has been closed.`);
      } else if (type === 'release') {
        const res = await examinationApi.releaseResults(assessment.id);
        setAssessments((prev) =>
          prev.map((a) =>
            a.id === assessment.id
              ? { ...a, status: AssessmentStatus.RESULTS_RELEASED }
              : a,
          ),
        );
        setSuccessMessage(
          res.message || `Results for "${assessment.title}" have been released successfully.`,
        );
      }
      setLifecycleModal(null);
    } catch (err: any) {
      console.error(`Failed to ${type} assessment`, err);
      const msg = err?.response?.data?.message || err?.message || `Failed to ${type} assessment.`;
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setActionLoadingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Status Badge Helper
  // ---------------------------------------------------------------------------
  const renderStatusBadge = (status: AssessmentStatus) => {
    switch (status) {
      case AssessmentStatus.DRAFT:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Draft
          </span>
        );
      case AssessmentStatus.PUBLISHED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Published
          </span>
        );
      case AssessmentStatus.CLOSED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="w-3 h-3 text-slate-500" />
            Closed
          </span>
        );
      case AssessmentStatus.RESULTS_RELEASED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Award className="w-3 h-3 text-indigo-600" />
            Results Released
          </span>
        );
      case AssessmentStatus.ARCHIVED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Archived
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  // ---------------------------------------------------------------------------
  // Render Loading / Error states
  // ---------------------------------------------------------------------------
  if (isLoading && assessments.length === 0 && chapters.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-xs">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
        <h3 className="text-base font-bold text-slate-800">Loading Teacher Examination Workspace...</h3>
        <p className="text-xs text-slate-500">Fetching curriculum chapters, assessments, and academic rosters.</p>
      </div>
    );
  }

  // Active Question Management Workspace
  if (managingQuestionsAssessment) {
    return (
      <AssessmentQuestionManagementView
        assessment={managingQuestionsAssessment}
        grades={grades}
        chapters={chapters}
        onBack={() => {
          setManagingQuestionsAssessment(null);
          fetchData();
        }}
        onAssessmentUpdated={() => {
          fetchData();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* Top Banner & Stats Overview                                         */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Faculty Examination Workspace</h3>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
              P4-09B-2 Operational
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage curriculum chapters, author multi-mode assessment drafts, and configure test scheduling.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchData}
            title="Refresh Data"
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleDownloadTemplate}
            title="Download Excel Question Template"
            className="px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Download Excel Template</span>
          </button>
          {isTeacher && (
            <button
              onClick={handleOpenCreateChapter}
              disabled={hasNoAssignments}
              title={hasNoAssignments ? 'Active teaching assignment required' : undefined}
              className="px-3.5 py-2 border border-purple-200 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed text-purple-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>New Chapter</span>
            </button>
          )}
          <button
            onClick={handleOpenCreateDraft}
            disabled={hasNoAssignments}
            title={hasNoAssignments ? 'Active teaching assignment required' : undefined}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Assessment Draft</span>
          </button>
        </div>
      </div>

      {/* Teacher Assignment Alert Banner */}
      {hasNoAssignments && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl flex items-start gap-3 text-xs shadow-2xs">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">No Active Teaching Assignments Found</p>
            <p className="text-amber-800">
              You do not have any active class or subject teaching assignments configured for academic year {currentAcademicYear?.name || 'Current Term'}.
              Assessment drafting and chapter creation require active teaching assignments. Please contact your school administrator to configure your teaching schedule.
            </p>
          </div>
        </div>
      )}

      {/* Notifications / Banners */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-rose-100 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-emerald-100 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-400 block">Total Assessments</span>
          <span className="text-xl font-bold text-slate-800">{stats.total}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-amber-200/60 shadow-2xs bg-amber-50/20">
          <span className="text-[11px] font-medium text-amber-700 block">Drafts (Editable)</span>
          <span className="text-xl font-bold text-amber-900">{stats.drafts}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-emerald-200/60 shadow-2xs bg-emerald-50/20">
          <span className="text-[11px] font-medium text-emerald-700 block">Published</span>
          <span className="text-xl font-bold text-emerald-900">{stats.published}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Closed</span>
          <span className="text-xl font-bold text-slate-800">{stats.closed}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-indigo-200/60 shadow-2xs bg-indigo-50/20">
          <span className="text-[11px] font-medium text-indigo-700 block">Released</span>
          <span className="text-xl font-bold text-indigo-900">{stats.released}</span>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-purple-200/60 shadow-2xs bg-purple-50/20">
          <span className="text-[11px] font-medium text-purple-700 block">Curriculum Chapters</span>
          <span className="text-xl font-bold text-purple-900">{stats.chaptersCount}</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Tab Navigation: Assessments vs Chapters                             */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          onClick={() => setActiveTab('assessments')}
          className={`pb-3 px-1 text-xs font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'assessments'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Assessments ({assessments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('chapters')}
          className={`pb-3 px-1 text-xs font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'chapters'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Curriculum Chapters ({chapters.length})</span>
        </button>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Filters Toolbar                                                     */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={activeTab === 'assessments' ? 'Search by title or subject...' : 'Search chapters...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Grade Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
            <Filter className="w-3 h-3 text-slate-400" />
            <span className="text-[11px] text-slate-500 font-medium">Grade:</span>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              aria-label="Filter by Grade"
              className="bg-transparent text-slate-700 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Grades</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter (Assessments tab only) */}
          {activeTab === 'assessments' && (
            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by Status"
                className="bg-transparent text-slate-700 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value={AssessmentStatus.DRAFT}>Drafts Only</option>
                <option value={AssessmentStatus.PUBLISHED}>Published</option>
                <option value={AssessmentStatus.CLOSED}>Closed</option>
                <option value={AssessmentStatus.RESULTS_RELEASED}>Results Released</option>
              </select>
            </div>
          )}

          {/* Chapter Filter (Assessments tab only) */}
          {activeTab === 'assessments' && chapterFilter !== 'ALL' && (
            <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-xl border border-indigo-200 text-[11px] font-semibold">
              <span>Chapter Filter Active</span>
              <button
                onClick={() => setChapterFilter('ALL')}
                className="hover:bg-indigo-100 rounded-md p-0.5 ml-1"
                title="Remove chapter filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Content Tab 1: Assessments List                                     */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'assessments' && (
        <div className="space-y-3">
          {filteredAssessments.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-md mx-auto my-8 space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Assessments Found</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                {searchQuery || statusFilter !== 'ALL' || gradeFilter !== 'ALL' || chapterFilter !== 'ALL'
                  ? 'No assessments match the selected filters. Try resetting the search or filter criteria.'
                  : 'Start by creating your first curriculum assessment draft for students.'}
              </p>
              <button
                onClick={handleOpenCreateDraft}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>Create Assessment Draft</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssessments.map((a) => {
                const isDraft = a.status === AssessmentStatus.DRAFT;
                return (
                  <div
                    key={a.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-indigo-200 transition-all flex flex-col justify-between group space-y-3"
                  >
                    {/* Header: Title & Badges */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">
                            {a.subject}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                            {a.title}
                          </h4>
                        </div>
                        {renderStatusBadge(a.status)}
                      </div>

                      {a.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{a.description}</p>
                      )}

                      {/* Meta badges: Mode, Grade, Section */}
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-600">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 font-medium">
                          {getGradeName(a.gradeId)}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 font-medium">
                          {getSectionName(a.gradeId, a.sectionId)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg border font-semibold ${
                            a.mode === AssessmentMode.LIVE_EXAM
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {a.mode === AssessmentMode.LIVE_EXAM ? 'Live Exam' : 'Normal Quiz'}
                        </span>
                        {a.enableProctoring && (
                          <span className="px-2 py-0.5 rounded-lg border font-semibold bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-indigo-600" /> Monitored
                          </span>
                        )}
                      </div>

                      {/* Parameters Grid */}
                      <div className="grid grid-cols-3 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-center">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Marks</span>
                          <span className="text-xs font-bold text-slate-800">
                            {a.passingMarks} / {a.totalMarks}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Duration</span>
                          <span className="text-xs font-bold text-slate-800">{a.durationMinutes} min</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Window</span>
                          <span className="text-xs font-bold text-slate-800">
                            {a.startWindowAt ? 'Scheduled' : 'Anytime'}
                          </span>
                        </div>
                      </div>

                      {/* Chapter association if any */}
                      {a.chapterId && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 pt-1">
                          <BookOpen className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="truncate">{getChapterTitle(a.chapterId)}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions Row */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setViewingDraft(a)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="View Assessment Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setManagingQuestionsAssessment(a);
                            onSelectAssessmentForQuestions?.(a);
                          }}
                          className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1"
                          title="Manage Questions & Excel Import"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Questions</span>
                        </button>
                        {a.status === AssessmentStatus.RESULTS_RELEASED && (
                          <button
                            type="button"
                            onClick={() => setLeaderboardAssessment(a)}
                            className="px-2 py-1 text-xs font-semibold text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-1"
                            title="View Official Leaderboard"
                          >
                            <Trophy className="w-3.5 h-3.5 text-amber-600" />
                            <span>Leaderboard</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {isDraft && (
                          <button
                            type="button"
                            onClick={() => setLifecycleModal({ type: 'publish', assessment: a })}
                            disabled={actionLoadingId === a.id}
                            className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                            title="Publish Assessment"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{actionLoadingId === a.id ? 'Publishing...' : 'Publish'}</span>
                          </button>
                        )}

                        {a.status === AssessmentStatus.PUBLISHED && (
                          <>
                            <button
                              type="button"
                              onClick={() => setLifecycleModal({ type: 'close', assessment: a })}
                              disabled={actionLoadingId === a.id}
                              className="px-2 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1"
                              title="Close Assessment"
                            >
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              <span>{actionLoadingId === a.id ? 'Closing...' : 'Close'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setLifecycleModal({ type: 'release', assessment: a })}
                              disabled={
                                actionLoadingId === a.id ||
                                (a.endWindowAt ? new Date().getTime() < new Date(a.endWindowAt).getTime() : false)
                              }
                              className="px-2 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1"
                              title={
                                a.endWindowAt && new Date().getTime() < new Date(a.endWindowAt).getTime()
                                  ? `Results can only be released after the end window (${new Date(a.endWindowAt).toLocaleString()})`
                                  : 'Release Results'
                              }
                            >
                              <Award className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{actionLoadingId === a.id ? 'Releasing...' : 'Release Results'}</span>
                            </button>
                          </>
                        )}

                        {a.status === AssessmentStatus.CLOSED && (
                          <button
                            type="button"
                            onClick={() => setLifecycleModal({ type: 'release', assessment: a })}
                            disabled={actionLoadingId === a.id}
                            className="px-2.5 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                            title="Release Results to Students and Parents"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>{actionLoadingId === a.id ? 'Releasing...' : 'Release Results'}</span>
                          </button>
                        )}

                        {!isDraft && (
                          <button
                            type="button"
                            onClick={() => setAttemptsModalAssessment(a)}
                            className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                            title="View Student Attempts & Integrity Audit"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Integrity Audit</span>
                          </button>
                        )}

                        {isDraft ? (
                          <>
                            <button
                              onClick={() => handleOpenEditDraft(a)}
                              className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Edit Draft Assessment"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingDraft(a)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete Draft"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <div
                            className="flex items-center gap-1 text-[10px] text-slate-400 px-2 py-1 bg-slate-50 rounded-lg border border-slate-200"
                            title="Assessment is locked by PostgreSQL triggers once published or released."
                          >
                            <Lock className="w-3 h-3 text-slate-400" />
                            <span>Immutable</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Content Tab 2: Curriculum Chapters List                             */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'chapters' && (
        <div className="space-y-3">
          {filteredChapters.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-md mx-auto my-8 space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto border border-purple-100">
                <BookOpen className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Curriculum Chapters</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Create structured syllabus chapters by grade and subject to organize questions and assessments.
              </p>
              {isTeacher && (
                <button
                  onClick={handleOpenCreateChapter}
                  disabled={hasNoAssignments}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Chapter</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Code</th>
                      <th className="py-3 px-4">Chapter Title</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Grade</th>
                      <th className="py-3 px-4 text-center">Ownership</th>
                      <th className="py-3 px-4 text-center">Order</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredChapters.map((ch) => {
                      const isOwn = !!teacherProfile?.id && ch.createdByTeacherId === teacherProfile.id;
                      const isLegacy = !ch.createdByTeacherId;
                      return (
                        <tr key={ch.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-bold text-purple-700 font-mono">{ch.chapterCode}</td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{ch.title}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-medium">
                              {ch.subject}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">{getGradeName(ch.gradeId)}</td>
                          <td className="py-3 px-4 text-center">
                            {isOwn ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                                My Chapter
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">
                                Institutional Standard
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500 font-mono font-medium">{ch.orderIndex}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isLegacy && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-semibold">
                                  <Lock className="w-3 h-3" />
                                  Read-Only
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  setChapterFilter(ch.id);
                                  setActiveTab('assessments');
                                }}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors inline-flex items-center gap-1"
                              >
                                <span>Assessments</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal: Create Chapter                                               */}
      {/* ------------------------------------------------------------------- */}
      {isCreateChapterOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-purple-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-500/30">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">New Curriculum Chapter</h3>
                  <p className="text-[11px] text-purple-200 font-medium">Map syllabus units for assessment drafting</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateChapterOpen(false)}
                className="text-purple-300 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitChapter} noValidate className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Grade */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Grade Class *</label>
                <select
                  value={chapterForm.gradeId}
                  onChange={(e) => {
                    const newGradeId = e.target.value;
                    const subjs = assignedSubjectsForGrade(newGradeId);
                    setChapterForm({
                      ...chapterForm,
                      gradeId: newGradeId,
                      subject: subjs[0] || chapterForm.subject || '',
                    });
                  }}
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">Select Grade Class...</option>
                  {assignedGrades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject Name *</label>
                {isTeacher && assignedSubjectsForGrade(chapterForm.gradeId).length > 0 ? (
                  <select
                    value={chapterForm.subject}
                    onChange={(e) => setChapterForm({ ...chapterForm, subject: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select Assigned Subject...</option>
                    {assignedSubjectsForGrade(chapterForm.gradeId).map((subj) => (
                      <option key={subj} value={subj}>
                        {subj}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. Mathematics, Science, English..."
                    value={chapterForm.subject}
                    onChange={(e) => setChapterForm({ ...chapterForm, subject: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                )}
              </div>

              {/* Chapter Code & Order Index */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Chapter Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. CH-01"
                    value={chapterForm.chapterCode}
                    onChange={(e) => setChapterForm({ ...chapterForm, chapterCode: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Order Index</label>
                  <input
                    type="number"
                    min="1"
                    value={chapterForm.orderIndex}
                    onChange={(e) => setChapterForm({ ...chapterForm, orderIndex: Number(e.target.value) || 1 })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Chapter Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chapter Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Linear Equations in Two Variables"
                  value={chapterForm.title}
                  onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateChapterOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
                >
                  {isSubmitting ? 'Creating Chapter...' : 'Create Chapter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal: Create / Edit Assessment Draft                               */}
      {/* ------------------------------------------------------------------- */}
      {isCreateDraftOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">
                    {editingDraft ? 'Edit Assessment Draft' : 'Create Assessment Draft'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {editingDraft ? 'Modify assessment configuration' : 'Configure testing parameters and schedule'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsCreateDraftOpen(false);
                  setEditingDraft(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDraft} noValidate className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Academic Year & Grade Class */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="draft-academic-year" className="block text-xs font-bold text-slate-700 mb-1">Academic Year *</label>
                  <select
                    id="draft-academic-year"
                    value={draftForm.academicYearId}
                    onChange={(e) => setDraftForm({ ...draftForm, academicYearId: e.target.value })}
                    disabled={isTeacher}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-80 disabled:bg-slate-100"
                  >
                    <option value="">Select Academic Year...</option>
                    {academicYears.map((ay) => (
                      <option key={ay.id} value={ay.id}>
                        {ay.name} {ay.isCurrent ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="draft-grade" className="block text-xs font-bold text-slate-700 mb-1">Grade Class *</label>
                  <select
                    id="draft-grade"
                    value={draftForm.gradeId}
                    onChange={(e) => {
                      const nextGradeId = e.target.value;
                      const subjs = assignedSubjectsForGrade(nextGradeId);
                      const nextSubj = subjs[0] || '';
                      const nextSections = grades.find((g) => g.id === nextGradeId)?.sections || [];
                      const nextAssignedSections = isTeacher
                        ? nextSections.filter(s => activeTeacherAssignments.some(a => a.gradeId === nextGradeId && a.sectionId === s.id))
                        : nextSections;
                      const nextCanGradeWide = !isTeacher || (nextSections.length > 0 && nextSections.every(s => nextAssignedSections.some(as => as.id === s.id)));
                      const nextSectionId = nextCanGradeWide ? '' : (nextAssignedSections[0]?.id || '');

                      const nextChapters = chapters.filter(
                        (c) => c.gradeId === nextGradeId && (!nextSubj || c.subject.toLowerCase() === nextSubj.toLowerCase()),
                      );
                      const firstCh = nextChapters[0] || null;
                      setDraftForm({
                        ...draftForm,
                        gradeId: nextGradeId,
                        sectionId: nextSectionId,
                        subject: nextSubj,
                        chapterId: firstCh ? firstCh.id : '',
                        title: firstCh ? firstCh.title : '',
                      });
                    }}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Grade...</option>
                    {assignedGrades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subject & Section */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="draft-subject" className="block text-xs font-bold text-slate-700 mb-1">Subject *</label>
                  {draftAvailableSubjects.length > 0 ? (
                    <select
                      id="draft-subject"
                      value={draftForm.subject}
                      onChange={(e) => {
                        const nextSubj = e.target.value;
                        const nextChapters = chapters.filter(
                          (c) => c.gradeId === draftForm.gradeId && (!nextSubj || c.subject.toLowerCase() === nextSubj.toLowerCase()),
                        );
                        const firstCh = nextChapters[0] || null;
                        setDraftForm({
                          ...draftForm,
                          subject: nextSubj,
                          chapterId: firstCh ? firstCh.id : '',
                          title: firstCh ? firstCh.title : '',
                        });
                      }}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select Subject...</option>
                      {draftAvailableSubjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="draft-subject"
                      type="text"
                      placeholder="e.g. Mathematics"
                      value={draftForm.subject}
                      onChange={(e) => setDraftForm({ ...draftForm, subject: e.target.value })}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
                <div>
                  <label htmlFor="draft-section" className="block text-xs font-bold text-slate-700 mb-1">Section</label>
                  <select
                    id="draft-section"
                    value={draftForm.sectionId}
                    onChange={(e) => setDraftForm({ ...draftForm, sectionId: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {canTeachGradeWide && (
                      <option value="">All Sections (Grade-wide)</option>
                    )}
                    {draftGradeSections.map((s) => (
                      <option key={s.id} value={s.id}>
                        Section {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Chapter-based Test Name Dropdown (Task C) */}
              <div>
                <label htmlFor="draft-chapter-title" className="block text-xs font-bold text-slate-700 mb-1">
                  Chapter / Test Name *
                </label>
                <select
                  id="draft-chapter-title"
                  aria-label="Chapter / Test Name"
                  value={draftForm.chapterId}
                  onChange={(e) => {
                    const chId = e.target.value;
                    const ch = draftAvailableChapters.find((item) => item.id === chId);
                    setDraftForm({
                      ...draftForm,
                      chapterId: chId,
                      title: ch ? ch.title : '',
                    });
                  }}
                  required
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="">Select Curriculum Chapter / Test Name...</option>
                  {draftAvailableChapters.map((ch) => {
                    const isOwn = !!teacherProfile?.id && ch.createdByTeacherId === teacherProfile.id;
                    const ownershipLabel = isOwn ? 'My Chapter' : 'Institutional Standard';
                    const displayLabel = ch.chapterCode
                      ? `${ch.chapterCode}: ${ch.title} (${ownershipLabel})`
                      : `${ch.title} (${ownershipLabel})`;
                    return (
                      <option key={ch.id} value={ch.id}>
                        {displayLabel}
                      </option>
                    );
                  })}
                </select>

                {draftAvailableChapters.length === 0 && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">No curriculum chapters found</p>
                      <p className="text-[11px] text-amber-700">
                        Tests must be based on a curriculum chapter. Please create a chapter for this subject and grade first.
                      </p>
                    </div>
                    {isTeacher && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreateDraftOpen(false);
                          setChapterForm({
                            gradeId: draftForm.gradeId,
                            subject: draftForm.subject,
                            chapterCode: '',
                            title: '',
                            orderIndex: chapters.length + 1,
                          });
                          setIsCreateChapterOpen(true);
                        }}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-2xs"
                      >
                        + Create Chapter
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Assessment Mode & Description */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assessment Mode *</label>
                  <select
                    value={draftForm.mode}
                    onChange={(e) => setDraftForm({ ...draftForm, mode: e.target.value as AssessmentMode })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={AssessmentMode.NORMAL_QUIZ}>Normal Quiz (Flexible window)</option>
                    <option value={AssessmentMode.LIVE_EXAM}>Live Exam (Synchronous strict timing)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Unit diagnostic assessment"
                    value={draftForm.description}
                    onChange={(e) => setDraftForm({ ...draftForm, description: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Marks & Duration */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="draft-total-marks" className="block text-xs font-bold text-slate-700 mb-1">Total Marks *</label>
                  <input
                    id="draft-total-marks"
                    type="number"
                    min="1"
                    value={draftForm.totalMarks}
                    onChange={(e) => setDraftForm({ ...draftForm, totalMarks: Number(e.target.value) || 0 })}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="draft-passing-marks" className="block text-xs font-bold text-slate-700 mb-1">Passing Marks *</label>
                  <input
                    id="draft-passing-marks"
                    type="number"
                    min="1"
                    max={draftForm.totalMarks}
                    value={draftForm.passingMarks}
                    onChange={(e) => setDraftForm({ ...draftForm, passingMarks: Number(e.target.value) || 0 })}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="draft-duration" className="block text-xs font-bold text-slate-700 mb-1">Duration (Min) *</label>
                  <input
                    id="draft-duration"
                    type="number"
                    min="1"
                    value={draftForm.durationMinutes}
                    onChange={(e) => setDraftForm({ ...draftForm, durationMinutes: Number(e.target.value) || 0 })}
                    required
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Start & End Windows */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Window (Optional)</label>
                  <input
                    type="datetime-local"
                    value={draftForm.startWindowAt}
                    onChange={(e) => setDraftForm({ ...draftForm, startWindowAt: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Window (Optional)</label>
                  <input
                    type="datetime-local"
                    value={draftForm.endWindowAt}
                    onChange={(e) => setDraftForm({ ...draftForm, endWindowAt: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Shuffle Toggles */}
              <div className="flex items-center gap-6 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={draftForm.shuffleQuestions}
                    onChange={(e) => setDraftForm({ ...draftForm, shuffleQuestions: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500"
                  />
                  <span>Shuffle Questions</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={draftForm.shuffleOptions}
                    onChange={(e) => setDraftForm({ ...draftForm, shuffleOptions: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500"
                  />
                  <span>Shuffle MCQ Options</span>
                </label>
              </div>

              {/* Proctoring & Integrity Checks */}
              {import.meta.env.VITE_ENABLE_EXAM_PROCTORING === 'true' && (
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-indigo-950">
                      <input
                        type="checkbox"
                        checked={draftForm.enableProctoring}
                        onChange={(e) => setDraftForm({ ...draftForm, enableProctoring: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded-md border-indigo-300 focus:ring-indigo-500"
                      />
                      <span>Enable Exam Readiness & Integrity Monitoring</span>
                    </label>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                      Safe & Local
                    </span>
                  </div>

                  {draftForm.enableProctoring && (
                    <div className="pt-2 border-t border-indigo-100/60 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={draftForm.requireFullscreen}
                          onChange={(e) => setDraftForm({ ...draftForm, requireFullscreen: e.target.checked })}
                          className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300"
                        />
                        <span>Require Fullscreen</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={draftForm.detectTabSwitch}
                          onChange={(e) => setDraftForm({ ...draftForm, detectTabSwitch: e.target.checked })}
                          className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300"
                        />
                        <span>Detect Tab Switches</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={draftForm.requireWebcam}
                          onChange={(e) => setDraftForm({ ...draftForm, requireWebcam: e.target.checked })}
                          className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300"
                        />
                        <span>Require Webcam (Pilot)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={draftForm.requireMic}
                          onChange={(e) => setDraftForm({ ...draftForm, requireMic: e.target.checked })}
                          className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300"
                        />
                        <span>Require Microphone (Pilot)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="text-slate-600 font-medium text-xs whitespace-nowrap">Max Warnings:</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={draftForm.maxWarnings}
                          onChange={(e) => setDraftForm({ ...draftForm, maxWarnings: Number(e.target.value) || 3 })}
                          className="w-16 px-2 py-1 text-xs bg-white border border-indigo-200 rounded-lg text-center font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Instructions / Description</label>
                <textarea
                  rows={2}
                  placeholder="Instructions for students (e.g., negative marking policy, test conduct)..."
                  value={draftForm.description}
                  onChange={(e) => setDraftForm({ ...draftForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateDraftOpen(false);
                    setEditingDraft(null);
                  }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
                >
                  {isSubmitting
                    ? editingDraft
                      ? 'Updating Draft...'
                      : 'Creating Draft...'
                    : editingDraft
                    ? 'Update Draft'
                    : 'Create Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal: Delete Confirmation Dialog                                   */}
      {/* ------------------------------------------------------------------- */}
      {deletingDraft && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Assessment Draft?</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
                {formError}
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">Title:</span> {deletingDraft.title}
              </div>
              <div>
                <span className="font-semibold text-slate-500">Subject:</span> {deletingDraft.subject}
              </div>
              <div>
                <span className="font-semibold text-slate-500">Status:</span> {deletingDraft.status}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setDeletingDraft(null);
                  setFormError(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeleteDraft}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors shadow-2xs"
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal: View Assessment Details                                      */}
      {/* ------------------------------------------------------------------- */}
      {viewingDraft && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                  {viewingDraft.subject}
                </span>
                <h3 className="text-base font-bold">{viewingDraft.title}</h3>
              </div>
              <button onClick={() => setViewingDraft(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Lifecycle Status:</span>
                {renderStatusBadge(viewingDraft.status)}
              </div>

              {viewingDraft.status !== AssessmentStatus.DRAFT && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-start gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <span className="font-bold block">PostgreSQL Trigger Protection Active</span>
                    <span>
                      This assessment is in <strong>{viewingDraft.status}</strong> status. Configuration is locked by
                      database invariants and cannot be edited or deleted.
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Grade & Section</span>
                  <span className="font-semibold text-slate-800">
                    {getGradeName(viewingDraft.gradeId)} • {getSectionName(viewingDraft.gradeId, viewingDraft.sectionId)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Assessment Mode</span>
                  <span className="font-semibold text-slate-800">
                    {viewingDraft.mode === AssessmentMode.LIVE_EXAM ? 'Live Exam' : 'Normal Quiz'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Marks Criteria</span>
                  <span className="font-semibold text-slate-800">
                    Passing {viewingDraft.passingMarks} / Total {viewingDraft.totalMarks}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Duration</span>
                  <span className="font-semibold text-slate-800">{viewingDraft.durationMinutes} Minutes</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Start Window</span>
                  <span className="font-semibold text-slate-800">
                    {viewingDraft.startWindowAt
                      ? new Date(viewingDraft.startWindowAt).toLocaleString()
                      : 'Flexible / Unscheduled'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">End Window</span>
                  <span className="font-semibold text-slate-800">
                    {viewingDraft.endWindowAt
                      ? new Date(viewingDraft.endWindowAt).toLocaleString()
                      : 'Flexible / Unscheduled'}
                  </span>
                </div>
              </div>

              {viewingDraft.chapterId && (
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <span className="text-[10px] text-purple-400 font-bold uppercase block">Associated Chapter</span>
                    <span className="font-semibold text-purple-900">{getChapterTitle(viewingDraft.chapterId)}</span>
                  </div>
                </div>
              )}

              {viewingDraft.enableProctoring && (
                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-start gap-2 text-xs">
                  <ShieldAlert className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-950 block">Integrity & Proctoring Configured</span>
                    <span className="text-slate-600">
                      Fullscreen required: {viewingDraft.monitoringConfig?.requireFullscreen !== false ? 'Yes' : 'No'} •
                      Tab switch detection: {viewingDraft.monitoringConfig?.detectTabSwitch !== false ? 'Yes' : 'No'} •
                      Webcam required: {viewingDraft.monitoringConfig?.requireWebcam ? 'Yes (Pilot)' : 'No'} •
                      Microphone required: {viewingDraft.monitoringConfig?.requireMic ? 'Yes (Pilot)' : 'No'} •
                      Max warnings: {viewingDraft.monitoringConfig?.maxWarnings || 3}
                    </span>
                  </div>
                </div>
              )}

              {viewingDraft.description && (
                <div>
                  <span className="font-bold text-slate-700 block mb-1">Instructions / Description</span>
                  <p className="text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 whitespace-pre-wrap">
                    {viewingDraft.description}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                <span>Assessment ID: {viewingDraft.id.slice(0, 8)}...</span>
                <span>Created: {new Date(viewingDraft.createdAt).toLocaleDateString()}</span>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingDraft;
                    setViewingDraft(null);
                    setManagingQuestionsAssessment(target);
                    onSelectAssessmentForQuestions?.(target);
                  }}
                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-semibold transition-colors flex items-center gap-1.5 border border-indigo-200"
                >
                  <Layers className="w-4 h-4" />
                  <span>Manage Questions</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingDraft(null)}
                  aria-label="Close Assessment Details"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {leaderboardAssessment && (
        <ExaminationLeaderboardModal
          isOpen={!!leaderboardAssessment}
          onClose={() => setLeaderboardAssessment(null)}
          assessmentId={leaderboardAssessment.id}
          assessmentTitle={leaderboardAssessment.title}
          subject={leaderboardAssessment.subject}
          totalMarks={leaderboardAssessment.totalMarks}
          userRole="TEACHER"
        />
      )}

      {/* Lifecycle Action Confirmation Modal */}
      {lifecycleModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lifecycle-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl border shrink-0 ${
                  lifecycleModal.type === 'publish'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    : lifecycleModal.type === 'close'
                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                    : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                }`}
              >
                {lifecycleModal.type === 'publish' && <CheckCircle2 className="w-5 h-5" />}
                {lifecycleModal.type === 'close' && <Clock className="w-5 h-5" />}
                {lifecycleModal.type === 'release' && <Award className="w-5 h-5" />}
              </div>
              <div className="space-y-1">
                <h4 id="lifecycle-modal-title" className="text-base font-bold text-slate-900">
                  {lifecycleModal.type === 'publish' && 'Publish Assessment'}
                  {lifecycleModal.type === 'close' && 'Close Assessment'}
                  {lifecycleModal.type === 'release' && 'Release Assessment Results'}
                </h4>
                <p className="text-xs text-slate-500 font-medium">
                  {lifecycleModal.assessment.title} ({lifecycleModal.assessment.subject})
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200 leading-relaxed">
              {lifecycleModal.type === 'publish' && (
                <>
                  <p>
                    Publishing locks question editing and makes the assessment active for enrolled students according to its configured schedule.
                  </p>
                  <p className="text-amber-800 font-medium">
                    Please ensure all questions are added and total question marks equal{' '}
                    <strong>{lifecycleModal.assessment.totalMarks}</strong> before proceeding.
                  </p>
                </>
              )}
              {lifecycleModal.type === 'close' && (
                <>
                  <p>
                    Closing prevents students from starting new attempts for this assessment.
                  </p>
                  <p className="text-slate-500">
                    Students with active attempts currently in progress may continue until their individual time limits expire.
                  </p>
                </>
              )}
              {lifecycleModal.type === 'release' && (
                <>
                  <p>
                    Releasing results finalizes the examination and makes scores, student feedback, and class leaderboards visible to all participating students and their parents.
                  </p>
                  <p className="text-indigo-800 font-medium">
                    This action cannot be undone. All active attempts must be completed or expired.
                  </p>
                </>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setLifecycleModal(null)}
                disabled={actionLoadingId === lifecycleModal.assessment.id}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLifecycleAction}
                disabled={actionLoadingId === lifecycleModal.assessment.id}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 ${
                  lifecycleModal.type === 'publish'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : lifecycleModal.type === 'close'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {actionLoadingId === lifecycleModal.assessment.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>
                    {lifecycleModal.type === 'publish' && 'Confirm Publish'}
                    {lifecycleModal.type === 'close' && 'Confirm Close'}
                    {lifecycleModal.type === 'release' && 'Confirm Release Results'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Attempts & Integrity Audit Modal */}
      {attemptsModalAssessment && (
        <AssessmentAttemptsModal
          assessment={attemptsModalAssessment}
          onClose={() => setAttemptsModalAssessment(null)}
          onAuditAttempt={(attemptId) => {
            setIntegrityAuditAssessment(attemptsModalAssessment);
            setIntegrityAuditAttemptId(attemptId);
          }}
        />
      )}

      {/* Integrity Audit Modal */}
      {integrityAuditAssessment && integrityAuditAttemptId && (
        <AssessmentIntegrityAuditModal
          assessment={integrityAuditAssessment}
          attemptId={integrityAuditAttemptId}
          onClose={() => {
            setIntegrityAuditAssessment(null);
            setIntegrityAuditAttemptId(null);
          }}
        />
      )}
    </div>
  );
};

export default TeacherExaminationView;
