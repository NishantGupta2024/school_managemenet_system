import React, { useState, useEffect, useRef } from 'react';
import {
  examinationApi,
  AssessmentDraft,
  AssessmentQuestion,
  AssessmentChapter,
  AssessmentStatus,
  AssessmentMode,
  QuestionMarksReconciliation,
  QuestionImportPreviewResponse,
} from '../services/examination.api';
import { downloadQuestionTemplate } from '../utils/questionTemplateGenerator';
import {
  ArrowLeft,
  Plus,
  Download,
  UploadCloud,
  Eye,
  Edit3,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  X,
  RefreshCw,
  Lock,
  Printer,
  ZoomIn,
} from 'lucide-react';

export interface AssessmentQuestionManagementViewProps {
  assessment: AssessmentDraft;
  grades: { id: string; name: string; sections?: { id: string; name: string }[] }[];
  chapters: AssessmentChapter[];
  onBack: () => void;
  onAssessmentUpdated?: () => void;
}

/**
 * Dedicated Async Image Thumbnail & Preview Component
 * Fetches question diagram securely through authenticated API and revokes Object URLs cleanly.
 */
interface AsyncQuestionImageProps {
  assessmentId: string;
  questionId: string;
  onImageStateChanged?: (hasImage: boolean) => void;
  onZoom?: (imageUrl: string) => void;
  className?: string;
  refreshTrigger?: number;
}

const AsyncQuestionImage: React.FC<AsyncQuestionImageProps> = ({
  assessmentId,
  questionId,
  onImageStateChanged,
  onZoom,
  className = 'w-12 h-12',
  refreshTrigger = 0,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function fetchImage() {
      try {
        setLoading(true);
        setHasError(false);
        const blob = await examinationApi.getQuestionImageBlob(assessmentId, questionId);
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setImageUrl(createdUrl);
        onImageStateChanged?.(true);
      } catch (err: any) {
        if (!active) return;
        setHasError(true);
        setImageUrl(null);
        onImageStateChanged?.(false);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchImage();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [assessmentId, questionId, refreshTrigger]);

  if (loading) {
    return (
      <div className={`${className} bg-slate-100 rounded-lg flex items-center justify-center animate-pulse border border-slate-200`}>
        <ImageIcon className="w-4 h-4 text-slate-400" />
      </div>
    );
  }

  if (hasError || !imageUrl) {
    return null;
  }

  return (
    <div
      onClick={() => onZoom?.(imageUrl)}
      className={`relative group ${className} rounded-lg overflow-hidden border border-slate-200 bg-white cursor-pointer hover:border-indigo-400 transition-all shadow-2xs`}
      title="Click to view full size diagram"
    >
      <img src={imageUrl} alt="Question diagram" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
        <ZoomIn className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};

export const AssessmentQuestionManagementView: React.FC<AssessmentQuestionManagementViewProps> = ({
  assessment,
  grades,
  chapters,
  onBack,
  onAssessmentUpdated,
}) => {
  // ---------------------------------------------------------------------------
  // 1. Core State
  // ---------------------------------------------------------------------------
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [summary, setSummary] = useState<QuestionMarksReconciliation>({
    targetTotalMarks: Number(assessment.totalMarks),
    currentAllocatedMarks: 0,
    remainingMarks: Number(assessment.totalMarks),
    totalQuestions: 0,
    isReconciled: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Tracking image presence map per question
  const [imageMap, setImageMap] = useState<Record<string, boolean>>({});
  const [imageRefreshCounter, setImageRefreshCounter] = useState<number>(0);

  // Zoomed Image Lightbox
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // 2. Modals State
  // ---------------------------------------------------------------------------
  // Add / Edit Manual Question Modal
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<AssessmentQuestion | null>(null);
  const [formQuestionText, setFormQuestionText] = useState<string>('');
  const [formOptionA, setFormOptionA] = useState<string>('');
  const [formOptionB, setFormOptionB] = useState<string>('');
  const [formOptionC, setFormOptionC] = useState<string>('');
  const [formOptionD, setFormOptionD] = useState<string>('');
  const [formCorrectOption, setFormCorrectOption] = useState<number>(0); // 0=A, 1=B, 2=C, 3=D
  const [formMarks, setFormMarks] = useState<string>('1');
  const [formOrderIndex, setFormOrderIndex] = useState<number>(1);
  const [formExplanation, setFormExplanation] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState<boolean>(false);

  // Delete Question Modal
  const [deletingQuestion, setDeletingQuestion] = useState<AssessmentQuestion | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Download Template State
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<boolean>(false);

  // Excel Import Modal (2-Step Workflow)
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Lifecycle state: current assessment snapshot & publish modal
  const [currentAssessment, setCurrentAssessment] = useState<AssessmentDraft>(assessment);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  useEffect(() => {
    setCurrentAssessment(assessment);
  }, [assessment]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<QuestionImportPreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [activeImportTab, setActiveImportTab] = useState<'VALID' | 'INVALID' | 'WARNINGS'>('VALID');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Question Image Modal
  const [imageModalQuestion, setImageModalQuestion] = useState<AssessmentQuestion | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [isDeletingImage, setIsDeletingImage] = useState<boolean>(false);
  const [imageModalError, setImageModalError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Question Paper Preview Modal
  const [isPreviewPaperOpen, setIsPreviewPaperOpen] = useState<boolean>(false);
  const [showAnswerKey, setShowAnswerKey] = useState<boolean>(true);

  // Lifecycle check
  const isDraft = currentAssessment.status === AssessmentStatus.DRAFT;

  // ---------------------------------------------------------------------------
  // 3. Load Questions & Reconcile Marks
  // ---------------------------------------------------------------------------
  const loadQuestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await examinationApi.listQuestions(assessment.id);
      const defaultSummary: QuestionMarksReconciliation = {
        targetTotalMarks: Number(assessment.totalMarks) || 0,
        currentAllocatedMarks: 0,
        remainingMarks: Number(assessment.totalMarks) || 0,
        totalQuestions: 0,
        isReconciled: false,
      };
      setQuestions(Array.isArray(res?.questions) ? res.questions : []);
      setSummary(res?.summary || defaultSummary);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load assessment questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [assessment.id]);

  // Clean up object URLs on component unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Metadata resolution
  const gradeName = grades.find((g) => g.id === assessment.gradeId)?.name || assessment.gradeId;
  const sectionName = assessment.sectionId
    ? grades.flatMap((g) => g.sections || []).find((s) => s.id === assessment.sectionId)?.name || 'Section'
    : 'All Sections';
  const chapterTitle = chapters.find((c) => c.id === assessment.chapterId)?.title || 'Subject-wide';

  // ---------------------------------------------------------------------------
  // 4. Manual Question Handlers (Add / Edit)
  // ---------------------------------------------------------------------------
  const handleOpenAddQuestion = () => {
    if (!isDraft) return;
    setEditingQuestion(null);
    setFormQuestionText('');
    setFormOptionA('');
    setFormOptionB('');
    setFormOptionC('');
    setFormOptionD('');
    setFormCorrectOption(0);
    // Suggest default marks based on remaining marks, minimum 1
    const suggestedMarks = summary.remainingMarks > 0 ? Math.min(summary.remainingMarks, 1) : 1;
    setFormMarks(suggestedMarks.toString());
    setFormOrderIndex(questions.length + 1);
    setFormExplanation('');
    setFormError(null);
    setIsQuestionModalOpen(true);
  };

  const handleOpenEditQuestion = (q: AssessmentQuestion) => {
    if (!isDraft) return;
    setEditingQuestion(q);
    setFormQuestionText(q.questionText);
    setFormOptionA(q.options[0] || '');
    setFormOptionB(q.options[1] || '');
    setFormOptionC(q.options[2] || '');
    setFormOptionD(q.options[3] || '');
    setFormCorrectOption(q.correctOption ?? 0);
    setFormMarks(q.marks.toString());
    setFormOrderIndex(q.orderIndex);
    setFormExplanation(q.explanation || '');
    setFormError(null);
    setIsQuestionModalOpen(true);
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDraft) return;

    // Validation
    const cleanQuestion = formQuestionText.trim();
    const optA = formOptionA.trim();
    const optB = formOptionB.trim();
    const optC = formOptionC.trim();
    const optD = formOptionD.trim();

    if (!cleanQuestion) {
      setFormError('Question text cannot be empty');
      return;
    }
    if (!optA || !optB || !optC || !optD) {
      setFormError('All four options (A, B, C, D) are required and cannot be empty');
      return;
    }

    const options = [optA, optB, optC, optD];
    const uniqueOptions = new Set(options.map((o) => o.toLowerCase()));
    if (uniqueOptions.size !== 4) {
      setFormError('All four options must be distinct. Duplicate options found.');
      return;
    }

    const parsedMarks = parseFloat(formMarks);
    if (isNaN(parsedMarks) || parsedMarks <= 0) {
      setFormError('Marks must be a positive number greater than 0');
      return;
    }
    if (parsedMarks > 500) {
      setFormError('Marks cannot exceed 500.00');
      return;
    }

    // Decimal precision check (max 2 decimals)
    const marksParts = formMarks.split('.');
    if (marksParts.length > 2 || (marksParts[1] && marksParts[1].length > 2)) {
      setFormError('Marks cannot have more than 2 decimal places');
      return;
    }

    try {
      setIsSubmittingQuestion(true);
      setFormError(null);

      if (editingQuestion) {
        // Update existing question
        await examinationApi.updateQuestion(assessment.id, editingQuestion.id, {
          questionText: cleanQuestion,
          options,
          correctOption: formCorrectOption,
          marks: parsedMarks,
          orderIndex: formOrderIndex,
          explanation: formExplanation.trim() || undefined,
        });
        setSuccessMessage('Question updated successfully');
      } else {
        // Create new question
        await examinationApi.createQuestion(assessment.id, {
          questionText: cleanQuestion,
          options,
          correctOption: formCorrectOption,
          marks: parsedMarks,
          orderIndex: formOrderIndex,
          explanation: formExplanation.trim() || undefined,
        });
        setSuccessMessage('Question added successfully');
      }

      setIsQuestionModalOpen(false);
      await loadQuestions();
      onAssessmentUpdated?.();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err.response?.data?.message || err.message || 'Failed to save question');
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 5. Delete Question Handler
  // ---------------------------------------------------------------------------
  const handleConfirmDeleteQuestion = async () => {
    if (!deletingQuestion || !isDraft) return;

    try {
      setIsDeleting(true);
      await examinationApi.deleteQuestion(assessment.id, deletingQuestion.id);
      setSuccessMessage('Question deleted successfully');
      setDeletingQuestion(null);
      await loadQuestions();
      onAssessmentUpdated?.();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete question');
    } finally {
      setIsDeleting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. Download Excel Template Handler
  // ---------------------------------------------------------------------------
  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      setError(null);
      await downloadQuestionTemplate('Examination_MCQs_Template.xlsx');
      setSuccessMessage('Official MCQ Excel template downloaded. Follow the Instructions tab when preparing questions.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to generate Excel template');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 7. Excel Import Handlers (Preview & Confirm)
  // ---------------------------------------------------------------------------
  const handleOpenImportModal = () => {
    if (!isDraft) return;
    setImportFile(null);
    setPreviewResult(null);
    setImportError(null);
    setIsImportModalOpen(true);
  };

  const handleSelectImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.match(/\.xlsx$/i)) {
        setImportError('Please select a valid Excel workbook (.xlsx file)');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setImportError('File exceeds maximum size limit of 5 MB');
        return;
      }
      setImportFile(file);
      setPreviewResult(null);
      setImportError(null);
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile || !isDraft) return;

    try {
      setIsPreviewLoading(true);
      setImportError(null);
      const res = await examinationApi.previewImport(assessment.id, importFile);
      setPreviewResult(res);
      setActiveImportTab(res.invalidCount > 0 ? 'INVALID' : 'VALID');
    } catch (err: any) {
      setImportError(err.response?.data?.message || err.message || 'Failed to preview spreadsheet');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewResult || previewResult.validCount === 0 || !isDraft) return;

    try {
      setIsConfirming(true);
      setImportError(null);

      // Build DTO strictly from server-validated preview questions
      const confirmDto = {
        questions: previewResult.validQuestions.map((q) => ({
          questionText: q.questionText,
          options: q.options,
          correctOption: q.correctOption,
          marks: q.marks,
          orderIndex: q.orderIndex,
          explanation: q.explanation || null,
        })),
      };

      const res = await examinationApi.confirmImport(assessment.id, confirmDto);
      setSuccessMessage(`Successfully imported ${res.importedCount} questions (${res.importedMarks} marks)`);
      setIsImportModalOpen(false);
      setImportFile(null);
      setPreviewResult(null);
      await loadQuestions();
      onAssessmentUpdated?.();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setImportError(err.response?.data?.message || err.message || 'Failed to commit question import');
    } finally {
      setIsConfirming(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 8. Question Image Handlers (Upload / Delete)
  // ---------------------------------------------------------------------------
  const handleOpenImageModal = (q: AssessmentQuestion) => {
    setImageModalQuestion(q);
    setImageFile(null);
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
    setImageModalError(null);
  };

  const handleSelectImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(png|jpe?g|webp)$/i)) {
        setImageModalError('Only PNG, JPEG, and WebP image files are supported');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setImageModalError('Image file size cannot exceed 5 MB');
        return;
      }

      setImageFile(file);
      setImageModalError(null);
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadImage = async () => {
    if (!imageModalQuestion || !imageFile || !isDraft) return;

    try {
      setIsUploadingImage(true);
      setImageModalError(null);
      await examinationApi.uploadQuestionImage(assessment.id, imageModalQuestion.id, imageFile);
      setSuccessMessage('Question image diagram attached successfully');
      setImageMap((prev) => ({ ...prev, [imageModalQuestion.id]: true }));
      setImageRefreshCounter((c) => c + 1);
      setImageModalQuestion(null);
      setImageFile(null);
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(null);
      }
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setImageModalError(err.response?.data?.message || err.message || 'Failed to upload question image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteImage = async (questionId: string) => {
    if (!isDraft) return;

    try {
      setIsDeletingImage(true);
      setImageModalError(null);
      await examinationApi.deleteQuestionImage(assessment.id, questionId);
      setSuccessMessage('Question image removed successfully');
      setImageMap((prev) => ({ ...prev, [questionId]: false }));
      setImageRefreshCounter((c) => c + 1);
      setImageModalQuestion(null);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setImageModalError(err.response?.data?.message || err.message || 'Failed to remove question image');
    } finally {
      setIsDeletingImage(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 9. Lifecycle Action: Publish Assessment
  // ---------------------------------------------------------------------------
  const handleConfirmPublish = async () => {
    if (!isDraft) return;

    try {
      setIsPublishing(true);
      setError(null);
      const updated = await examinationApi.publishAssessment(currentAssessment.id);
      setCurrentAssessment(updated);
      setSuccessMessage(`Assessment "${updated.title}" has been published successfully.`);
      setIsPublishModalOpen(false);
      onAssessmentUpdated?.();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to publish assessment', err);
      const msg = err?.response?.data?.message || err?.message || 'Failed to publish assessment.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsPublishing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 10. Render Helpers
  // ---------------------------------------------------------------------------
  const renderOptionLetter = (idx: number) => ['A', 'B', 'C', 'D'][idx] || '?';

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* Top Header Bar & Navigation                                         */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-2xs"
            title="Return to Assessments List"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Assessments</span>
          </button>
          <div className="h-6 w-px bg-slate-200 hidden sm:block" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
                Question Management & Paper Preparation
              </h2>
              <span
                className={`px-2.5 py-0.5 text-[11px] font-bold border rounded-full ${
                  isDraft
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {currentAssessment.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Author MCQ questions, import bulk spreadsheets, verify marks reconciliation, and preview question papers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDraft && (
            <button
              onClick={() => setIsPublishModalOpen(true)}
              disabled={isPublishing}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              title="Publish Assessment to Enrolled Students"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isPublishing ? 'Publishing...' : 'Publish Assessment'}</span>
            </button>
          )}
          <button
            onClick={loadQuestions}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors text-xs flex items-center gap-1.5 shadow-2xs"
            title="Refresh Question List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2.5 shadow-2xs">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2.5 shadow-2xs">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <div className="flex-1 font-medium">{successMessage}</div>
          <button onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-emerald-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Non-DRAFT Lock Warning */}
      {!isDraft && (
        <div className="p-4 bg-slate-900 text-white rounded-2xl flex items-center gap-3 shadow-sm border border-slate-800">
          <Lock className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Assessment Locked ({currentAssessment.status})
            </h4>
            <p className="text-xs text-slate-300 mt-0.5">
              This assessment is no longer in DRAFT. Questions, Excel imports, and image modifications are locked by
              database lifecycle triggers to guarantee examination integrity.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Assessment Metadata & Marks Reconciliation Banner                   */}
      {/* ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Assessment Overview */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
                Target Assessment
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">{assessment.title}</h3>
            </div>
            <div className="text-right">
              <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-full">
                {assessment.mode === AssessmentMode.LIVE_EXAM ? 'Live Synchronous Exam' : 'Normal Quiz'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] text-slate-400 block font-medium">Subject</span>
              <span className="font-semibold text-slate-800 block truncate">{assessment.subject}</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] text-slate-400 block font-medium">Class & Section</span>
              <span className="font-semibold text-slate-800 block truncate">
                {gradeName} ({sectionName})
              </span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] text-slate-400 block font-medium">Chapter</span>
              <span className="font-semibold text-slate-800 block truncate">{chapterTitle}</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] text-slate-400 block font-medium">Duration</span>
              <span className="font-semibold text-slate-800 block">{assessment.durationMinutes} Minutes</span>
            </div>
          </div>
        </div>

        {/* Marks Reconciliation KPI Deck */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Marks Reconciliation
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                  summary.isReconciled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : summary.remainingMarks > 0
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {summary.isReconciled
                  ? 'Reconciled (100%)'
                  : summary.remainingMarks > 0
                  ? 'Under-allocated'
                  : 'Over-allocated'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-medium">Configured</span>
                <span className="text-base font-bold text-slate-800">{summary.targetTotalMarks}</span>
                <span className="text-[9px] text-slate-400 block">Total Marks</span>
              </div>
              <div className="p-2 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <span className="text-[10px] text-indigo-600 block font-medium">Allocated</span>
                <span className="text-base font-bold text-indigo-900">{summary.currentAllocatedMarks}</span>
                <span className="text-[9px] text-indigo-500 block">
                  {summary.totalQuestions} {summary.totalQuestions === 1 ? 'MCQ' : 'MCQs'}
                </span>
              </div>
              <div
                className={`p-2 rounded-xl border ${
                  summary.isReconciled
                    ? 'bg-emerald-50/50 border-emerald-100'
                    : summary.remainingMarks > 0
                    ? 'bg-amber-50/50 border-amber-100'
                    : 'bg-rose-50/50 border-rose-100'
                }`}
              >
                <span
                  className={`text-[10px] block font-medium ${
                    summary.isReconciled
                      ? 'text-emerald-700'
                      : summary.remainingMarks > 0
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }`}
                >
                  Remaining
                </span>
                <span
                  className={`text-base font-bold ${
                    summary.isReconciled
                      ? 'text-emerald-900'
                      : summary.remainingMarks > 0
                      ? 'text-amber-900'
                      : 'text-rose-900'
                  }`}
                >
                  {summary.remainingMarks}
                </span>
                <span className="text-[9px] text-slate-400 block">
                  {summary.isReconciled ? 'Balanced' : summary.remainingMarks > 0 ? 'Needed' : 'Excess'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 text-[11px] text-slate-500 border-t border-slate-100">
            {summary.isReconciled ? (
              <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Allocated marks exactly match configured total. Ready for publishing.
              </span>
            ) : summary.remainingMarks > 0 ? (
              <span className="text-amber-700 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Allocate {summary.remainingMarks} more marks to satisfy publishing constraints.
              </span>
            ) : (
              <span className="text-rose-700 font-medium flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                Exceeds total by {Math.abs(summary.remainingMarks)} marks. Edit questions before publishing.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Main Operational Actions Bar                                        */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Add Question */}
          <button
            onClick={handleOpenAddQuestion}
            disabled={!isDraft}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs ${
              isDraft
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Add Question</span>
          </button>

          {/* 2. Download Excel Template (Prominently placed BEFORE import) */}
          <button
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Download official MCQ Excel template with Instructions"
          >
            <Download className={`w-4 h-4 text-indigo-600 ${isDownloadingTemplate ? 'animate-bounce' : ''}`} />
            <span>{isDownloadingTemplate ? 'Generating Template...' : 'Download Excel Template'}</span>
          </button>

          {/* 3. Import Questions from Excel */}
          <button
            onClick={handleOpenImportModal}
            disabled={!isDraft}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs border ${
              isDraft
                ? 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200'
            }`}
            title="Import questions from prepared Excel template"
          >
            <UploadCloud className="w-4 h-4 text-teal-600" />
            <span>Import Questions from Excel</span>
          </button>
        </div>

        {/* 4. Preview Question Paper */}
        <div>
          <button
            onClick={() => setIsPreviewPaperOpen(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            title="Preview formatted question paper with answer keys"
          >
            <Eye className="w-4 h-4 text-indigo-300" />
            <span>Preview Question Paper</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Questions List / Table                                              */}
      {/* ------------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Examination Questions Bank ({questions.length})
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Passing Marks: <strong className="text-slate-700">{assessment.passingMarks}</strong> /{' '}
            <strong className="text-slate-700">{assessment.totalMarks}</strong>
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
            <p className="text-xs">Loading assessment question bank...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h5 className="text-sm font-bold text-slate-800">No questions added yet</h5>
              <p className="text-xs text-slate-500 mt-1">
                You can add questions manually one by one, or download the official Excel template and import questions
                in bulk.
              </p>
            </div>
            {isDraft && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleOpenAddQuestion}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Add First Question
                </button>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors"
                >
                  Download Template
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">S.No</th>
                  <th className="py-3 px-4">Question Text & Diagram</th>
                  <th className="py-3 px-4 w-36">Options</th>
                  <th className="py-3 px-4 w-28 text-center">Correct Option</th>
                  <th className="py-3 px-4 w-20 text-center">Marks</th>
                  <th className="py-3 px-4 w-28 text-center">Diagram</th>
                  <th className="py-3 px-4 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {questions.map((q, idx) => {
                  const hasImage = imageMap[q.id];
                  return (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* S.No */}
                      <td className="py-3 px-4 text-center font-bold text-slate-600">
                        {q.orderIndex || idx + 1}
                      </td>

                      {/* Question Text */}
                      <td className="py-3 px-4 font-medium text-slate-900 max-w-md">
                        <div className="flex items-start gap-3">
                          <AsyncQuestionImage
                            assessmentId={assessment.id}
                            questionId={q.id}
                            onImageStateChanged={(exists) =>
                              setImageMap((prev) => ({ ...prev, [q.id]: exists }))
                            }
                            onZoom={(url) => setZoomedImageUrl(url)}
                            refreshTrigger={imageRefreshCounter}
                            className="w-12 h-12 flex-shrink-0"
                          />
                          <div className="flex-1 space-y-1">
                            <span className="block leading-relaxed">{q.questionText}</span>
                            {q.explanation && (
                              <span className="block text-[11px] text-slate-400 italic">
                                Rationale: {q.explanation}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Options */}
                      <td className="py-3 px-4">
                        <div className="space-y-1 text-[11px]">
                          {q.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              className={`px-1.5 py-0.5 rounded ${
                                oIdx === q.correctOption
                                  ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200'
                                  : 'text-slate-600'
                              }`}
                            >
                              <strong className="text-slate-400">{renderOptionLetter(oIdx)}:</strong> {opt}
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Correct Option */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Option {renderOptionLetter(q.correctOption)}</span>
                        </span>
                      </td>

                      {/* Marks */}
                      <td className="py-3 px-4 text-center font-bold text-slate-800">
                        {Number(q.marks).toFixed(2)}
                      </td>

                      {/* Image Attachment Status */}
                      <td className="py-3 px-4 text-center">
                        {hasImage ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-full inline-flex items-center gap-1">
                            <ImageIcon className="w-3 h-3 text-purple-600" />
                            <span>Attached</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-200 rounded-full">
                            No Diagram
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Image management */}
                          <button
                            onClick={() => handleOpenImageModal(q)}
                            className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title={hasImage ? 'Manage / Replace Diagram' : 'Attach Diagram'}
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>

                          {isDraft && (
                            <>
                              {/* Edit Question */}
                              <button
                                onClick={() => handleOpenEditQuestion(q)}
                                className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Edit Question"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              {/* Delete Question */}
                              <button
                                onClick={() => setDeletingQuestion(q)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete Question"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Modal 1: Add / Edit Manual Question                                 */}
      {/* ------------------------------------------------------------------- */}
      {isQuestionModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  {editingQuestion ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingQuestion ? 'Edit Question' : 'Add MCQ Question'}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {assessment.title} • {assessment.subject}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsQuestionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitQuestion} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Question Text */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Question Text <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={formQuestionText}
                  onChange={(e) => setFormQuestionText(e.target.value)}
                  rows={3}
                  required
                  placeholder="Enter the examination question prompt clearly..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Options A, B, C, D */}
              <div className="space-y-3">
                <span className="block text-xs font-semibold text-slate-700">
                  Multiple Choice Options (All 4 Required) <span className="text-rose-500">*</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A */}
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">Option A</span>
                      <label className="flex items-center gap-1.5 text-[11px] text-indigo-700 cursor-pointer font-semibold">
                        <input
                          type="radio"
                          name="correctOption"
                          checked={formCorrectOption === 0}
                          onChange={() => setFormCorrectOption(0)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Correct Choice
                      </label>
                    </div>
                    <input
                      type="text"
                      value={formOptionA}
                      onChange={(e) => setFormOptionA(e.target.value)}
                      required
                      placeholder="Choice A text"
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  {/* Option B */}
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">Option B</span>
                      <label className="flex items-center gap-1.5 text-[11px] text-indigo-700 cursor-pointer font-semibold">
                        <input
                          type="radio"
                          name="correctOption"
                          checked={formCorrectOption === 1}
                          onChange={() => setFormCorrectOption(1)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Correct Choice
                      </label>
                    </div>
                    <input
                      type="text"
                      value={formOptionB}
                      onChange={(e) => setFormOptionB(e.target.value)}
                      required
                      placeholder="Choice B text"
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  {/* Option C */}
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">Option C</span>
                      <label className="flex items-center gap-1.5 text-[11px] text-indigo-700 cursor-pointer font-semibold">
                        <input
                          type="radio"
                          name="correctOption"
                          checked={formCorrectOption === 2}
                          onChange={() => setFormCorrectOption(2)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Correct Choice
                      </label>
                    </div>
                    <input
                      type="text"
                      value={formOptionC}
                      onChange={(e) => setFormOptionC(e.target.value)}
                      required
                      placeholder="Choice C text"
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  {/* Option D */}
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">Option D</span>
                      <label className="flex items-center gap-1.5 text-[11px] text-indigo-700 cursor-pointer font-semibold">
                        <input
                          type="radio"
                          name="correctOption"
                          checked={formCorrectOption === 3}
                          onChange={() => setFormCorrectOption(3)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Correct Choice
                      </label>
                    </div>
                    <input
                      type="text"
                      value={formOptionD}
                      onChange={(e) => setFormOptionD(e.target.value)}
                      required
                      placeholder="Choice D text"
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Marks & Serial Number */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Marks <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="500"
                    value={formMarks}
                    onChange={(e) => setFormMarks(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Remaining available: {summary.remainingMarks} marks
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Serial Order (S.No)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formOrderIndex}
                    onChange={(e) => setFormOrderIndex(parseInt(e.target.value, 10) || 1)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Explanation / Rationale */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Explanation / Rationale <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  placeholder="Rationale shown to students after official results release..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuestion}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {isSubmittingQuestion && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingQuestion ? 'Update Question' : 'Save Question'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal 2: Excel Import Workflow (Preview & Confirm)                   */}
      {/* ------------------------------------------------------------------- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Import MCQ Questions from Excel</h3>
                  <span className="text-[11px] text-slate-400">
                    Step-by-step preview, server validation, and atomic commit
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {importError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 font-medium">{importError}</span>
                </div>
              )}

              {/* Step 1: File Selection Area */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Select Spreadsheet</span>
                    <span className="text-[11px] text-slate-400">
                      Must be a valid .xlsx workbook prepared with the official template (max 5 MB).
                    </span>
                  </div>
                  <button
                    onClick={handleDownloadTemplate}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Blank Template</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleSelectImportFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  >
                    {importFile ? 'Change File' : 'Browse .xlsx File'}
                  </button>
                  <span className="text-xs text-slate-600 truncate flex-1 font-medium">
                    {importFile ? importFile.name : 'No file chosen'}
                  </span>
                  {importFile && (
                    <button
                      type="button"
                      onClick={handlePreviewImport}
                      disabled={isPreviewLoading}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isPreviewLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Validating...</span>
                        </>
                      ) : (
                        <span>Upload & Preview</span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2: Preview Results Display */}
              {previewResult && (
                <div className="space-y-4 pt-2">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-medium block">Total Rows</span>
                      <span className="text-lg font-bold text-slate-800">{previewResult.totalRows}</span>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 font-medium block">Valid Questions</span>
                      <span className="text-lg font-bold text-emerald-900">{previewResult.validCount}</span>
                    </div>
                    <div
                      className={`p-3 rounded-xl border ${
                        previewResult.invalidCount > 0
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      <span className="text-[10px] font-medium block">Invalid Rows</span>
                      <span className="text-lg font-bold">{previewResult.invalidCount}</span>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                      <span className="text-[10px] text-indigo-700 font-medium block">Imported Marks</span>
                      <span className="text-lg font-bold text-indigo-900">{previewResult.importedMarks}</span>
                    </div>
                  </div>

                  {/* Marks Reconciliation Notice from server preview */}
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                      previewResult.isReconciled
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : previewResult.remainingMarks > 0
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {previewResult.isReconciled ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    )}
                    <span className="font-medium">
                      Projected Total Marks: <strong>{previewResult.projectedTotalMarks}</strong> /{' '}
                      <strong>{previewResult.targetTotalMarks}</strong> (Remaining: {previewResult.remainingMarks} marks)
                      {previewResult.reconciliationWarning && ` • ${previewResult.reconciliationWarning}`}
                    </span>
                  </div>

                  {/* Warnings Box */}
                  {(previewResult.duplicateSerialErrors?.length > 0 ||
                    previewResult.duplicateQuestionWarnings?.length > 0) && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1 text-xs text-amber-800">
                      <span className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Duplicate Warnings:
                      </span>
                      <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                        {previewResult.duplicateSerialErrors?.map((d, i) => (
                          <li key={`ser-${i}`}>{d.message}</li>
                        ))}
                        {previewResult.duplicateQuestionWarnings?.map((w, i) => (
                          <li key={`q-${i}`}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Tabs: Valid Questions vs Invalid Rows */}
                  <div className="border-b border-slate-200 flex gap-4 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setActiveImportTab('VALID')}
                      className={`pb-2 border-b-2 transition-colors ${
                        activeImportTab === 'VALID'
                          ? 'border-indigo-600 text-indigo-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Valid Questions ({previewResult.validCount})
                    </button>
                    {previewResult.invalidCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveImportTab('INVALID')}
                        className={`pb-2 border-b-2 transition-colors ${
                          activeImportTab === 'INVALID'
                            ? 'border-rose-600 text-rose-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Invalid Rows ({previewResult.invalidCount})
                      </button>
                    )}
                  </div>

                  {/* Tab 1: Valid Questions Preview Table */}
                  {activeImportTab === 'VALID' && (
                    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 sticky top-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <tr className="border-b border-slate-200">
                            <th className="p-2 w-10 text-center">#</th>
                            <th className="p-2">Question</th>
                            <th className="p-2 w-20 text-center">Correct</th>
                            <th className="p-2 w-16 text-center">Marks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px]">
                          {previewResult.validQuestions.map((q) => (
                            <tr key={q.rowNumber}>
                              <td className="p-2 text-center text-slate-400 font-bold">{q.serialNumber}</td>
                              <td className="p-2 text-slate-800 truncate max-w-sm">{q.questionText}</td>
                              <td className="p-2 text-center font-bold text-emerald-700">
                                {renderOptionLetter(q.correctOption)}
                              </td>
                              <td className="p-2 text-center font-medium">{q.marks}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab 2: Invalid Rows Details */}
                  {activeImportTab === 'INVALID' && (
                    <div className="max-h-60 overflow-y-auto border border-rose-200 rounded-xl text-xs divide-y divide-rose-100 bg-rose-50/20">
                      {previewResult.invalidRows.map((inv) => (
                        <div key={inv.rowNumber} className="p-3 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-rose-800">
                              Spreadsheet Row {inv.rowNumber} (Serial: {inv.data?.serialNumber || 'N/A'})
                            </span>
                            <span className="text-slate-400 truncate max-w-xs">{inv.data?.questionText}</span>
                          </div>
                          <ul className="list-disc pl-5 text-[11px] text-rose-700 space-y-0.5">
                            {inv.errors.map((err, eIdx) => (
                              <li key={eIdx}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer / Confirmation Action */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                {previewResult
                  ? `Ready to commit ${previewResult.validCount} valid questions.`
                  : 'Upload spreadsheet to view server validation.'}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                {previewResult && previewResult.validCount > 0 && (
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={isConfirming}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isConfirming && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirm & Commit ({previewResult.validCount} Questions)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal 3: Question Image Management (Upload, Replace, Delete)        */}
      {/* ------------------------------------------------------------------- */}
      {imageModalQuestion && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Question Diagram Attachment</h3>
                  <span className="text-[11px] text-slate-400">
                    Question #{imageModalQuestion.orderIndex || 1}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setImageModalQuestion(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {imageModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{imageModalError}</span>
                </div>
              )}

              {/* Question text snippet */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 font-medium">
                "{imageModalQuestion.questionText}"
              </div>

              {/* Current or Newly Selected Image Preview */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-700 block">Current / Selected Diagram</span>
                {imagePreviewUrl ? (
                  <div className="relative border border-slate-200 rounded-2xl overflow-hidden max-h-56 bg-slate-900/5 flex items-center justify-center p-2">
                    <img src={imagePreviewUrl} alt="New preview" className="max-h-52 object-contain rounded-xl" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl min-h-[140px]">
                    <AsyncQuestionImage
                      assessmentId={assessment.id}
                      questionId={imageModalQuestion.id}
                      className="w-32 h-32 object-contain"
                      refreshTrigger={imageRefreshCounter}
                    />
                  </div>
                )}
              </div>

              {/* Upload Controls (in DRAFT only) */}
              {isDraft ? (
                <div className="space-y-3 pt-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleSelectImageFile}
                    className="hidden"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                    >
                      {imageFile ? 'Select Different Diagram' : 'Browse Diagram File'}
                    </button>
                    {imageFile && (
                      <button
                        type="button"
                        onClick={handleUploadImage}
                        disabled={isUploadingImage}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                      >
                        {isUploadingImage && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>Upload Diagram</span>
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    Supported formats: PNG, JPEG, WebP. Maximum size: 5 MB.
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Image uploads and modifications are disabled because this assessment is {assessment.status}.
                </p>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              {isDraft && (
                <button
                  type="button"
                  onClick={() => handleDeleteImage(imageModalQuestion.id)}
                  disabled={isDeletingImage}
                  className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-xl font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Diagram</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setImageModalQuestion(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal 4: Delete Confirmation Modal                                  */}
      {/* ------------------------------------------------------------------- */}
      {deletingQuestion && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center border border-rose-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Delete Question?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to delete this question? Any attached diagram will also be removed. This action
                cannot be undone.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 italic border border-slate-100">
              "{deletingQuestion.questionText}" ({deletingQuestion.marks} marks)
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingQuestion(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteQuestion}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Modal 5: Question Paper Preview Modal (Teacher Preview)             */}
      {/* ------------------------------------------------------------------- */}
      {isPreviewPaperOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Question Paper Preview</h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                      Teacher Inspection View
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Answer keys and rationales are visible only to authorized faculty
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAnswerKey}
                    onChange={(e) => setShowAnswerKey(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Show Answer Keys</span>
                </label>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-200"
                  title="Print Question Paper"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsPreviewPaperOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Paper Preview Body */}
            <div className="p-8 space-y-6 overflow-y-auto flex-1 bg-slate-50/30">
              {/* Paper Masthead */}
              <div className="text-center pb-6 border-b-2 border-slate-800 space-y-1">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  School Examination Paper
                </span>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{assessment.title}</h2>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-700 pt-1">
                  <span>Subject: {assessment.subject}</span>
                  <span>•</span>
                  <span>
                    Class: {gradeName} ({sectionName})
                  </span>
                  <span>•</span>
                  <span>Time: {assessment.durationMinutes} Minutes</span>
                  <span>•</span>
                  <span>Max Marks: {assessment.totalMarks}</span>
                </div>
              </div>

              {/* Questions Stream */}
              <div className="space-y-6">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs font-bold text-slate-900 leading-relaxed">
                        Q{q.orderIndex || idx + 1}. {q.questionText}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 flex-shrink-0">
                        [{Number(q.marks).toFixed(2)} Marks]
                      </span>
                    </div>

                    {/* Question Diagram if present */}
                    <AsyncQuestionImage
                      assessmentId={assessment.id}
                      questionId={q.id}
                      onZoom={(url) => setZoomedImageUrl(url)}
                      refreshTrigger={imageRefreshCounter}
                      className="w-48 h-36 max-w-full"
                    />

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      {q.options.map((opt, oIdx) => {
                        const isCorrect = oIdx === q.correctOption;
                        return (
                          <div
                            key={oIdx}
                            className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                              showAnswerKey && isCorrect
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                                showAnswerKey && isCorrect
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white text-slate-600 border border-slate-200'
                              }`}
                            >
                              {renderOptionLetter(oIdx)}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {showAnswerKey && isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Answer Key & Rationale (Visible to teacher) */}
                    {showAnswerKey && (
                      <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs text-emerald-900 flex items-center justify-between">
                        <span>
                          <strong>Correct Key:</strong> Option {renderOptionLetter(q.correctOption)}
                        </span>
                        {q.explanation && (
                          <span className="text-[11px] text-emerald-700 italic">
                            Rationale: {q.explanation}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                Total Questions: {questions.length} • Total Marks: {summary.currentAllocatedMarks}
              </span>
              <button
                type="button"
                onClick={() => setIsPreviewPaperOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Lightbox Modal: Full Size Diagram Viewer                            */}
      {/* ------------------------------------------------------------------- */}
      {zoomedImageUrl && (
        <div
          onClick={() => setZoomedImageUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[85vh] p-2 bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={zoomedImageUrl} alt="Full size diagram" className="max-h-[80vh] w-auto object-contain rounded-xl" />
            <button
              onClick={() => setZoomedImageUrl(null)}
              className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-900 text-white p-2 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Publish Assessment Confirmation Modal                              */}
      {/* ------------------------------------------------------------------- */}
      {isPublishModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl border shrink-0 bg-emerald-50 text-emerald-600 border-emerald-200">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 id="publish-modal-title" className="text-base font-bold text-slate-900">
                  Publish Assessment
                </h4>
                <p className="text-xs text-slate-500 font-medium">
                  {currentAssessment.title} ({currentAssessment.subject})
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200 leading-relaxed">
              <p>
                Publishing locks question editing, Excel imports, and diagram modifications. The assessment will become active for enrolled students according to its configured schedule.
              </p>
              {!summary.isReconciled ? (
                <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-800 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Marks Pre-flight Notice</span>
                  </div>
                  <p>
                    Allocated marks ({summary.currentAllocatedMarks}) do not equal target total marks ({summary.targetTotalMarks}). The server will reject publishing if marks are not balanced.
                  </p>
                </div>
              ) : (
                <p className="text-emerald-700 font-medium">
                  Marks are reconciled ({summary.currentAllocatedMarks} / {summary.targetTotalMarks} across {questions.length} questions). Ready for publication.
                </p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(false)}
                disabled={isPublishing}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={isPublishing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                {isPublishing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <span>Confirm Publish</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentQuestionManagementView;
