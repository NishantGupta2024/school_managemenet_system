import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ArrowRightLeft,
  DollarSign,
  Settings as SettingsIcon,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  X,
  Lock,
  Clock,
  Shield,
  Edit,
  Trash2,
  FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  UserRole,
  academicsApi,
  studentsApi,
  GradeClass,
  Section,
  Student,
} from '../services/api';
import {
  libraryApi,
  Book,
  BookCopy,
  BookLoan,
  LibraryFine,
  LibrarySetting,
} from '../services/library.api';
import { LibraryCatalogueExcelImportModal } from './LibraryCatalogueExcelImportModal';

type ActiveTab = 'CIRCULATION' | 'CATALOGUE' | 'LOANS' | 'FINES' | 'SETTINGS';

export const LibraryManagementWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Role Gate: Only LIBRARIAN, SCHOOL_ADMIN, and PLATFORM_SUPER_ADMIN
  const isAuthorized =
    user?.role === UserRole.LIBRARIAN ||
    user?.role === UserRole.SCHOOL_ADMIN ||
    user?.role === UserRole.PLATFORM_SUPER_ADMIN;

  const isAdmin =
    user?.role === UserRole.SCHOOL_ADMIN ||
    user?.role === UserRole.PLATFORM_SUPER_ADMIN;

  const [activeTab, setActiveTab] = useState<ActiveTab>('CIRCULATION');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data states
  const [settings, setSettings] = useState<LibrarySetting | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [totalBooks, setTotalBooks] = useState<number>(0);
  const [bookSearch, setBookSearch] = useState<string>('');
  const [bookCategory, setBookCategory] = useState<string>('');
  const [bookPage, setBookPage] = useState<number>(1);

  const [loans, setLoans] = useState<BookLoan[]>([]);
  const [totalLoans, setTotalLoans] = useState<number>(0);
  const [loanStatusFilter, setLoanStatusFilter] = useState<string>('ACTIVE');
  const [loanOverdueOnly, setLoanOverdueOnly] = useState<boolean>(false);

  const [fines, setFines] = useState<LibraryFine[]>([]);
  const [totalFines, setTotalFines] = useState<number>(0);
  const [fineStatusFilter, setFineStatusFilter] = useState<string>('');

  // Modals state
  const [isAddBookOpen, setIsAddBookOpen] = useState<boolean>(false);
  const [isEditBookOpen, setIsEditBookOpen] = useState<boolean>(false);
  const [selectedBookForEdit, setSelectedBookForEdit] = useState<Book | null>(null);

  const [isViewCopiesOpen, setIsViewCopiesOpen] = useState<boolean>(false);
  const [selectedBookForCopies, setSelectedBookForCopies] = useState<Book | null>(null);

  const [isAddCopyOpen, setIsAddCopyOpen] = useState<boolean>(false);
  const [isCollectFineOpen, setIsCollectFineOpen] = useState<boolean>(false);
  const [selectedFineForAction, setSelectedFineForAction] = useState<LibraryFine | null>(null);

  const [isWaiveFineOpen, setIsWaiveFineOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Forms state
  const [newBookForm, setNewBookForm] = useState({
    title: '',
    author: '',
    category: '',
    isbn: '',
    publisher: '',
    edition: '',
    publicationYear: new Date().getFullYear(),
    language: 'English',
    description: '',
  });

  const [newCopyForm, setNewCopyForm] = useState({
    accessionNumber: '',
    barcode: '',
    rackLocation: '',
    shelfLocation: '',
    condition: 'GOOD',
    purchasePrice: 0,
    notes: '',
  });

  // Circulation Desk Form State
  const [issueForm, setIssueForm] = useState({
    copyAccession: '',
    copyId: '',
    studentAdmission: '',
    studentId: '',
    notes: '',
  });
  const [issueCopyFound, setIssueCopyFound] = useState<BookCopy | null>(null);

  // Circulation Desk Dependent Borrower Selectors State
  const [classes, setClasses] = useState<GradeClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState<boolean>(false);
  const [classLoadError, setClassLoadError] = useState<string | null>(null);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [studentLoadError, setStudentLoadError] = useState<string | null>(null);

  const [returnForm, setReturnForm] = useState({
    searchIdentifier: '',
    loanId: '',
    condition: 'GOOD',
    notes: '',
  });
  const [returnLoanFound, setReturnLoanFound] = useState<BookLoan | null>(null);

  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [waiveReason, setWaiveReason] = useState<string>('');
  const [waiveAmount, setWaiveAmount] = useState<number>(0);

  // Settings Edit State
  const [settingsForm, setSettingsForm] = useState({
    maxBooksStudent: 3,
    maxBooksTeacher: 10,
    loanDurationDaysStudent: 14,
    loanDurationDaysTeacher: 30,
    maxRenewals: 2,
    finePerDay: 2.0,
    gracePeriodDays: 2,
    allowRenewWithOverdue: false,
  });

  // -------------------------------------------------------------
  // Data Fetching
  // -------------------------------------------------------------
  const loadSettings = useCallback(async () => {
    try {
      const data = await libraryApi.getSettings();
      setSettings(data);
      setSettingsForm({
        maxBooksStudent: data.maxBooksStudent,
        maxBooksTeacher: data.maxBooksTeacher,
        loanDurationDaysStudent: data.loanDurationDaysStudent,
        loanDurationDaysTeacher: data.loanDurationDaysTeacher,
        maxRenewals: data.maxRenewals,
        finePerDay: Number(data.finePerDay),
        gracePeriodDays: data.gracePeriodDays,
        allowRenewWithOverdue: data.allowRenewWithOverdue,
      });
    } catch (err: any) {
      console.error('Failed to load library settings', err);
    }
  }, []);

  const loadBooks = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await libraryApi.getBooks({
        search: bookSearch.trim() || undefined,
        category: bookCategory || undefined,
        page: bookPage,
        limit: 15,
      });
      setBooks(res.data);
      setTotalBooks(res.meta.total);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load books');
    } finally {
      setIsLoading(false);
    }
  }, [bookSearch, bookCategory, bookPage]);

  const loadLoans = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await libraryApi.getLoans({
        status: loanOverdueOnly ? undefined : (loanStatusFilter || undefined),
        overdueOnly: loanOverdueOnly,
        limit: 25,
      });
      setLoans(res.data);
      setTotalLoans(res.meta.total);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load loans');
    } finally {
      setIsLoading(false);
    }
  }, [loanStatusFilter, loanOverdueOnly]);

  const loadFines = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await libraryApi.getFines({
        status: fineStatusFilter || undefined,
        limit: 25,
      });
      setFines(res.data);
      setTotalFines(res.meta.total);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load library fines');
    } finally {
      setIsLoading(false);
    }
  }, [fineStatusFilter]);

  const loadClasses = useCallback(async () => {
    setIsLoadingClasses(true);
    setClassLoadError(null);
    try {
      const gradesList = await academicsApi.getGrades();
      setClasses(Array.isArray(gradesList) ? gradesList : []);
    } catch (err: any) {
      setClassLoadError(err?.response?.data?.message || err?.message || 'Failed to load school classes');
    } finally {
      setIsLoadingClasses(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    loadSettings();
  }, [isAuthorized, loadSettings]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (activeTab === 'CATALOGUE') {
      loadBooks();
    } else if (activeTab === 'LOANS') {
      loadLoans();
    } else if (activeTab === 'CIRCULATION') {
      loadLoans();
      loadClasses();
    } else if (activeTab === 'FINES') {
      loadFines();
    }
  }, [activeTab, isAuthorized, loadBooks, loadLoans, loadFines, loadClasses]);

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    setSelectedSectionId('');
    setStudents([]);
    setStudentLoadError(null);
    setIssueForm((prev) => ({ ...prev, studentId: '' }));

    if (!classId) {
      setSections([]);
      return;
    }

    const foundClass = classes.find((c) => c.id === classId);
    setSections(foundClass?.sections || []);
  };

  const handleSectionChange = async (sectionId: string) => {
    setSelectedSectionId(sectionId);
    setStudents([]);
    setStudentLoadError(null);
    setIssueForm((prev) => ({ ...prev, studentId: '' }));

    if (!sectionId || !selectedClassId) {
      return;
    }

    setIsLoadingStudents(true);
    try {
      const res = await studentsApi.getStudents({
        gradeId: selectedClassId,
        sectionId: sectionId,
        status: 'ACTIVE',
        page: 1,
        limit: 100,
      });
      const activeList = Array.isArray(res?.data) ? res.data : [];
      setStudents(activeList);
    } catch (err: any) {
      setStudentLoadError(err?.response?.data?.message || err?.message || 'Failed to load students in section');
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const handleStudentChange = (studentId: string) => {
    setIssueForm((prev) => ({ ...prev, studentId }));
  };

  const selectedStudent = students.find((s) => s.id === issueForm.studentId);

  // -------------------------------------------------------------
  // Circulation POS Handlers
  // -------------------------------------------------------------
  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueForm.copyId || !issueForm.studentId) {
      setError('Please select or verify both the book copy and the borrower student ID.');
      return;
    }
    setError(null);
    try {
      const loan = await libraryApi.issueBook({
        copyId: issueForm.copyId,
        borrowerType: 'STUDENT',
        studentId: issueForm.studentId,
        notes: issueForm.notes || undefined,
      });
      setSuccessMessage(
        `Book successfully issued! Due date: ${new Date(loan.dueDate).toLocaleDateString()}`,
      );
      setIssueForm({ copyAccession: '', copyId: '', studentAdmission: '', studentId: '', notes: '' });
      setIssueCopyFound(null);
      setSelectedClassId('');
      setSelectedSectionId('');
      setSections([]);
      setStudents([]);
      loadLoans();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to issue book');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnForm.loanId) {
      setError('Please identify an active loan to process return.');
      return;
    }
    setError(null);
    try {
      const res = await libraryApi.returnBook({
        loanId: returnForm.loanId,
        condition: returnForm.condition,
        notes: returnForm.notes || undefined,
      });
      let msg = 'Book returned successfully to inventory.';
      if (res.fine) {
        msg += ` Note: Overdue fine of ₹${res.fine.fineAmount} was assessed for ${res.fine.overdueDays} billable day(s).`;
      }
      setSuccessMessage(msg);
      setReturnForm({ searchIdentifier: '', loanId: '', condition: 'GOOD', notes: '' });
      setReturnLoanFound(null);
      loadLoans();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to return book');
    }
  };

  const handleQuickRenew = async (loanId: string) => {
    setError(null);
    try {
      const renewed = await libraryApi.renewBook({ loanId });
      setSuccessMessage(
        `Loan renewed successfully. New due date is ${new Date(renewed.dueDate).toLocaleDateString()} (Renewal #${renewed.renewalCount}).`,
      );
      loadLoans();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to renew book');
    }
  };

  // -------------------------------------------------------------
  // Catalogue & Copy Management Handlers
  // -------------------------------------------------------------
  const handleCreateBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await libraryApi.createBook({
        title: newBookForm.title.trim(),
        author: newBookForm.author.trim(),
        category: newBookForm.category.trim(),
        isbn: newBookForm.isbn.trim() || undefined,
        publisher: newBookForm.publisher.trim() || undefined,
        edition: newBookForm.edition.trim() || undefined,
        publicationYear: Number(newBookForm.publicationYear) || undefined,
        language: newBookForm.language.trim() || 'English',
        description: newBookForm.description.trim() || undefined,
      });
      setSuccessMessage(`Book "${newBookForm.title}" added to catalogue.`);
      setIsAddBookOpen(false);
      setNewBookForm({
        title: '',
        author: '',
        category: '',
        isbn: '',
        publisher: '',
        edition: '',
        publicationYear: new Date().getFullYear(),
        language: 'English',
        description: '',
      });
      loadBooks();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to add book');
    }
  };

  const handleEditBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookForEdit) return;
    setError(null);
    try {
      await libraryApi.updateBook(selectedBookForEdit.id, {
        title: selectedBookForEdit.title.trim(),
        author: selectedBookForEdit.author.trim(),
        category: selectedBookForEdit.category.trim(),
        isbn: selectedBookForEdit.isbn?.trim() || undefined,
        publisher: selectedBookForEdit.publisher?.trim() || undefined,
      });
      setSuccessMessage(`Updated book "${selectedBookForEdit.title}".`);
      setIsEditBookOpen(false);
      setSelectedBookForEdit(null);
      loadBooks();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update book');
    }
  };

  const handleCreateCopySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookForCopies) return;
    setError(null);
    try {
      await libraryApi.createCopy(selectedBookForCopies.id, {
        accessionNumber: newCopyForm.accessionNumber.trim(),
        barcode: newCopyForm.barcode.trim() || undefined,
        rackLocation: newCopyForm.rackLocation.trim() || undefined,
        shelfLocation: newCopyForm.shelfLocation.trim() || undefined,
        condition: newCopyForm.condition,
        purchasePrice: Number(newCopyForm.purchasePrice) || undefined,
        notes: newCopyForm.notes.trim() || undefined,
      });
      setSuccessMessage(`Copy "${newCopyForm.accessionNumber}" added to "${selectedBookForCopies.title}".`);
      setIsAddCopyOpen(false);
      setNewCopyForm({
        accessionNumber: '',
        barcode: '',
        rackLocation: '',
        shelfLocation: '',
        condition: 'GOOD',
        purchasePrice: 0,
        notes: '',
      });
      // Refresh book copies view
      const updatedBook = await libraryApi.getBooks({ search: selectedBookForCopies.title });
      const current = updatedBook.data.find((b) => b.id === selectedBookForCopies.id);
      if (current) setSelectedBookForCopies(current);
      loadBooks();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to add copy');
    }
  };

  const handleDeleteBook = async (book: Book) => {
    if (!isAdmin) return;
    if (!window.confirm(`Are you sure you want to delete "${book.title}"? This action cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      await libraryApi.deleteBook(book.id);
      setSuccessMessage(`Book "${book.title}" deleted.`);
      loadBooks();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete book');
    }
  };

  // -------------------------------------------------------------
  // Fines Management Handlers
  // -------------------------------------------------------------
  const handleCollectFineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFineForAction) return;
    setError(null);
    try {
      const res = await libraryApi.collectFine(selectedFineForAction.id, {
        paidAmount: collectAmount > 0 ? collectAmount : undefined,
      });
      setSuccessMessage(
        `Fine collection of ₹${res.collectedAmount} recorded. Desk Receipt: ${res.receiptNumber}. Remaining balance: ₹${res.remainingBalance}.`,
      );
      setIsCollectFineOpen(false);
      setSelectedFineForAction(null);
      loadFines();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record fine payment');
    }
  };

  const handleWaiveFineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFineForAction) return;
    if (!waiveReason.trim() || waiveReason.trim().length < 5) {
      setError('A written waiver justification reason of at least 5 characters is required for auditability.');
      return;
    }
    setError(null);
    try {
      await libraryApi.waiveFine(selectedFineForAction.id, {
        waiveReason: waiveReason.trim(),
        waiveAmount: waiveAmount > 0 ? waiveAmount : undefined,
      });
      setSuccessMessage(`Fine waived successfully with audit record.`);
      setIsWaiveFineOpen(false);
      setSelectedFineForAction(null);
      setWaiveReason('');
      setWaiveAmount(0);
      loadFines();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to waive fine');
    }
  };

  // -------------------------------------------------------------
  // Settings Handlers
  // -------------------------------------------------------------
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setError(null);
    try {
      const updated = await libraryApi.updateSettings(settingsForm);
      setSettings(updated);
      setSuccessMessage('School library policy and fine rates updated successfully.');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update library policy');
    }
  };

  // -------------------------------------------------------------
  // Access Guard Rendering
  // -------------------------------------------------------------
  if (!isAuthorized) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl w-fit mx-auto border border-rose-200 dark:border-rose-900/50">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Access Restricted: Institutional Staff Only
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          The Library Management Workspace is restricted to designated Librarians and School Administrators.
          Parent accounts and unauthorized roles have zero access.
        </p>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
        >
          ← Return to System Launcher
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Workspace Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Library Management Workspace
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800 rounded-full">
                {user?.role === UserRole.LIBRARIAN ? 'Librarian Desk' : 'Admin Oversight'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Catalogue metadata, physical inventory barcodes, desk circulation, and library fine settlements.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          System Launcher →
        </button>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Workspace Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-1 text-sm font-medium">
        <button
          onClick={() => setActiveTab('CIRCULATION')}
          className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'CIRCULATION'
              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Circulation Desk
        </button>

        <button
          onClick={() => setActiveTab('CATALOGUE')}
          className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'CATALOGUE'
              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Book Catalogue & Copies
        </button>

        <button
          onClick={() => setActiveTab('LOANS')}
          className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'LOANS'
              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Active & Overdue Loans ({totalLoans})
        </button>

        <button
          onClick={() => setActiveTab('FINES')}
          className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'FINES'
              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Library Fines
        </button>

        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors shrink-0 ${
            activeTab === 'SETTINGS'
              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          Policy & Rates
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: CIRCULATION DESK (POS CHECKOUT & RETURN) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'CIRCULATION' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section A: Issue Book (Check-out) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-lg">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Check-Out / Issue Book Copy
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Scan copy accession code and assign to active student borrower
                </p>
              </div>
            </div>

            <form onSubmit={handleIssueSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Copy Accession Number or Barcode *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. ACC-2026-0001 or BC-10001"
                    value={issueForm.copyAccession}
                    onChange={(e) => {
                      setIssueForm({ ...issueForm, copyAccession: e.target.value, copyId: '' });
                      setIssueCopyFound(null);
                    }}
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!issueForm.copyAccession.trim()) return;
                      try {
                        const queryStr = issueForm.copyAccession.trim().toLowerCase();
                        const res = await libraryApi.getBooks({ search: issueForm.copyAccession.trim() });
                        let foundCopy: BookCopy | null = null;
                        for (const b of res.data) {
                          const c = b.copies?.find(
                            (x) =>
                              x.accessionNumber.toLowerCase() === queryStr ||
                              x.barcode?.toLowerCase() === queryStr,
                          );
                          if (c) {
                            foundCopy = c;
                            break;
                          }
                        }
                        if (foundCopy) {
                          setIssueCopyFound(foundCopy);
                          setIssueForm((prev) => ({ ...prev, copyId: foundCopy!.id }));
                          setError(null);
                        } else {
                          setError(`Copy "${issueForm.copyAccession}" not found in catalogue.`);
                        }
                      } catch {
                        setError('Lookup failed.');
                      }
                    }}
                    className="px-3 py-2 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  >
                    Verify
                  </button>
                </div>
                {issueCopyFound && (
                  <p className="mt-1.5 text-xs text-emerald-800 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Verified Copy: Status is {issueCopyFound.status} ({issueCopyFound.condition} condition)
                  </p>
                )}
              </div>

              {/* Dependent Borrower Selectors: Class -> Section -> Student */}
              <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-300 dark:border-slate-700/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
                    Student Borrower Selection *
                  </span>
                  {(isLoadingClasses || isLoadingStudents) && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-medium">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Loading...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 1. Class Dropdown */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      1. Class
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => handleClassChange(e.target.value)}
                      disabled={isLoadingClasses}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      aria-label="Class"
                    >
                      <option value="">{isLoadingClasses ? 'Loading classes...' : '-- Select Class --'}</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} ({cls.code})
                        </option>
                      ))}
                    </select>
                    {classLoadError && (
                      <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {classLoadError}
                      </p>
                    )}
                    {!isLoadingClasses && classes.length === 0 && !classLoadError && (
                      <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-400 font-medium">
                        No classes found in school.
                      </p>
                    )}
                  </div>

                  {/* 2. Section Dropdown */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      2. Section
                    </label>
                    <select
                      value={selectedSectionId}
                      onChange={(e) => handleSectionChange(e.target.value)}
                      disabled={!selectedClassId || sections.length === 0}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      aria-label="Section"
                    >
                      <option value="">
                        {!selectedClassId
                          ? '-- Select Class First --'
                          : sections.length === 0
                          ? 'No Sections Available'
                          : '-- Select Section --'}
                      </option>
                      {sections.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          Section {sec.name}
                        </option>
                      ))}
                    </select>
                    {selectedClassId && sections.length === 0 && (
                      <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-400 font-medium">
                        No sections configured for this class.
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Student Dropdown */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    3. Student Borrower
                  </label>
                  <select
                    value={issueForm.studentId}
                    onChange={(e) => handleStudentChange(e.target.value)}
                    disabled={!selectedSectionId || isLoadingStudents}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    aria-label="Student"
                  >
                    <option value="">
                      {!selectedSectionId
                        ? '-- Select Section First --'
                        : isLoadingStudents
                        ? 'Loading students...'
                        : students.length === 0
                        ? 'No active students in this section'
                        : '-- Select Student Borrower --'}
                    </option>
                    {students.map((stud) => (
                      <option key={stud.id} value={stud.id}>
                        {stud.firstName} {stud.lastName} (Adm: {stud.admissionNumber})
                      </option>
                    ))}
                  </select>
                  {studentLoadError && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {studentLoadError}
                    </p>
                  )}
                  {selectedSectionId && !isLoadingStudents && students.length === 0 && !studentLoadError && (
                    <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-400 font-medium">
                      No active students found in this section.
                    </p>
                  )}
                </div>

                {/* Verified Student Summary Card */}
                {selectedStudent && (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Selected Student: <strong className="font-bold">{selectedStudent.firstName} {selectedStudent.lastName}</strong>
                    </span>
                    <span className="font-mono text-[11px] bg-emerald-100 text-emerald-950 font-bold border border-emerald-300 dark:border-transparent dark:bg-emerald-900/60 dark:text-emerald-200 px-2 py-0.5 rounded">
                      Adm: {selectedStudent.admissionNumber}
                    </span>
                  </div>
                )}
              </div>

              {settings && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-900/40 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-medium flex items-center justify-between">
                  <span>Policy Standard Due Date:</span>
                  <span className="font-bold text-indigo-900 dark:text-indigo-400 font-mono">
                    +{settings.loanDurationDaysStudent} Days (
                    {new Date(Date.now() + settings.loanDurationDaysStudent * 86400000).toLocaleDateString()})
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Circulation Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Issued for science exhibition preparation"
                  value={issueForm.notes}
                  onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={!issueCopyFound || !issueForm.studentId}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Confirm Issue to Student
              </button>
            </form>
          </div>

          {/* Section B: Return Book (Check-in) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-lg">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Check-In / Return Book Copy
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Process item return, verify condition, and assess fines if overdue
                </p>
              </div>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Loan ID, Copy Accession Code, or Barcode *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Enter Loan ID, Accession, or Barcode"
                    value={returnForm.searchIdentifier}
                    onChange={(e) => setReturnForm({ ...returnForm, searchIdentifier: e.target.value })}
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!returnForm.searchIdentifier.trim()) return;
                      try {
                        const queryStr = returnForm.searchIdentifier.trim().toLowerCase();
                        // 1. Direct active loan check
                        const res = await libraryApi.getLoans({ status: 'ACTIVE', limit: 100 });
                        let found = res.data.find(
                          (l) =>
                            l.id.toLowerCase() === queryStr ||
                            l.copy.accessionNumber.toLowerCase() === queryStr ||
                            (l.copy.barcode && l.copy.barcode.toLowerCase() === queryStr),
                        );

                        // 2. Fallback: resolve copy via catalogue search and fetch copy's active loan
                        if (!found) {
                          const bookRes = await libraryApi.getBooks({ search: returnForm.searchIdentifier.trim() });
                          for (const b of bookRes.data) {
                            const c = b.copies?.find(
                              (x) =>
                                x.accessionNumber.toLowerCase() === queryStr ||
                                (x.barcode && x.barcode.toLowerCase() === queryStr),
                            );
                            if (c) {
                              const copyLoansRes = await libraryApi.getLoans({ copyId: c.id, status: 'ACTIVE' });
                              if (copyLoansRes.data && copyLoansRes.data.length > 0) {
                                found = copyLoansRes.data[0];
                              }
                              break;
                            }
                          }
                        }

                        if (found) {
                          setReturnLoanFound(found);
                          setReturnForm((prev) => ({ ...prev, loanId: found.id }));
                          setError(null);
                        } else {
                          setError(`No active loan found for "${returnForm.searchIdentifier}".`);
                        }
                      } catch {
                        setError('Active loan lookup failed.');
                      }
                    }}
                    className="px-3 py-2 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  >
                    Lookup
                  </button>
                </div>
              </div>

              {returnLoanFound && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-300 dark:border-slate-700 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-200">
                    <span>{returnLoanFound.copy.book.title}</span>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 font-medium">{returnLoanFound.copy.accessionNumber}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 text-[11px]">
                    Borrower: {returnLoanFound.student ? `${returnLoanFound.student.firstName} ${returnLoanFound.student.lastName}` : 'Institutional Borrower'}
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-700 dark:text-slate-300">Due Date: {new Date(returnLoanFound.dueDate).toLocaleDateString()}</span>
                    {new Date().getTime() > new Date(returnLoanFound.dueDate).getTime() ? (
                      <span className="text-rose-800 dark:text-rose-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        OVERDUE ({Math.floor((new Date().getTime() - new Date(returnLoanFound.dueDate).getTime()) / 86400000)} Days)
                      </span>
                    ) : (
                      <span className="text-emerald-800 dark:text-emerald-400 font-semibold">On Schedule</span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Returned Item Physical Condition *
                </label>
                <select
                  value={returnForm.condition}
                  onChange={(e) => setReturnForm({ ...returnForm, condition: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="GOOD">Good / Serviceable (Return to available shelf)</option>
                  <option value="FAIR">Fair (Normal shelf wear)</option>
                  <option value="DAMAGED">Damaged (Move to Maintenance / Repair)</option>
                  <option value="LOST">Lost / Unreturned (Charge replacement fine)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Return Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Spine wear or clean return"
                  value={returnForm.notes}
                  onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Process Return & Assess Overdue Fines
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: BOOK CATALOGUE & COPIES */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'CATALOGUE' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500 dark:text-slate-400" />
                <input
                  type="text"
                  placeholder="Search title, author, ISBN, accession, or barcode..."
                  value={bookSearch}
                  onChange={(e) => {
                    setBookSearch(e.target.value);
                    setBookPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <input
                type="text"
                placeholder="Category..."
                value={bookCategory}
                onChange={(e) => {
                  setBookCategory(e.target.value);
                  setBookPage(1);
                }}
                className="w-28 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <button
                onClick={loadBooks}
                className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                title="Refresh Catalogue"
              >
                <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium hidden sm:inline">
                ({totalBooks} books)
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="w-full sm:w-auto px-4 py-2 border border-indigo-300 dark:border-indigo-800 text-indigo-900 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                title="Bulk import titles and copies from spreadsheet"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Import from Excel
              </button>
              <button
                onClick={() => setIsAddBookOpen(true)}
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Add New Book Title
              </button>
            </div>
          </div>

          {/* Books Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <th className="py-3 px-4">Title & Author</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">ISBN</th>
                    <th className="py-3 px-4 text-center">Total Copies</th>
                    <th className="py-3 px-4 text-center">Available</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {books.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        {isLoading ? 'Loading catalogue records...' : 'No books found in this school catalogue.'}
                      </td>
                    </tr>
                  ) : (
                    books.map((book) => (
                      <tr key={book.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          {book.title}
                          <span className="block text-[11px] font-normal text-slate-600 dark:text-slate-400">
                            by {book.author}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 border border-slate-200 dark:border-transparent dark:bg-slate-800 text-slate-800 dark:text-slate-300">
                            {book.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {book.isbn || '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {book.totalCopies}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              book.availableCopies > 0
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:border-transparent dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-900 border border-rose-300 dark:border-transparent dark:bg-rose-950/40 dark:text-rose-300'
                            }`}
                          >
                            {book.availableCopies}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedBookForCopies(book);
                                setIsViewCopiesOpen(true);
                              }}
                              className="px-2.5 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 dark:border-transparent dark:bg-indigo-950/40 dark:text-indigo-300 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Manage Copies ({book.copies?.length || 0})
                            </button>
                            <button
                              onClick={() => {
                                setSelectedBookForEdit(book);
                                setIsEditBookOpen(true);
                              }}
                              className="p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                              title="Edit Metadata"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteBook(book)}
                                className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                                title="Delete Book Title"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: ACTIVE & OVERDUE LOANS ROSTER */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'LOANS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2">
              <select
                value={loanStatusFilter}
                onChange={(e) => {
                  setLoanStatusFilter(e.target.value);
                  setLoanOverdueOnly(false);
                }}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                <option value="ACTIVE">Active Loans</option>
                <option value="RETURNED">Returned Loans</option>
                <option value="LOST">Lost Items</option>
                <option value="">All Loan History</option>
              </select>

              <button
                onClick={() => setLoanOverdueOnly(!loanOverdueOnly)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  loanOverdueOnly
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Overdue Roster Only
              </button>
            </div>

            <button
              onClick={loadLoans}
              className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <th className="py-3 px-4">Book Title & Copy</th>
                    <th className="py-3 px-4">Borrower</th>
                    <th className="py-3 px-4">Issue Date</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Quick Desk Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {loans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        {isLoading ? 'Loading circulation records...' : 'No loans matching this filter.'}
                      </td>
                    </tr>
                  ) : (
                    loans.map((loan) => (
                      <tr key={loan.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          {loan.copy.book.title}
                          <span className="block text-[11px] font-mono font-normal text-slate-600 dark:text-slate-400">
                            {loan.copy.accessionNumber}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {loan.student ? (
                            <>
                              <span className="font-semibold text-slate-900 dark:text-slate-200">
                                {loan.student.firstName} {loan.student.lastName}
                              </span>
                              <span className="block text-[11px] font-mono text-slate-600 dark:text-slate-400">
                                Adm: {loan.student.admissionNumber}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-400 italic">Institutional Borrower</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-400">
                          {new Date(loan.issuedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span
                            className={
                              loan.isOverdue
                                ? 'text-rose-800 dark:text-rose-400 font-bold flex items-center gap-1'
                                : 'text-slate-700 dark:text-slate-300'
                            }
                          >
                            {new Date(loan.dueDate).toLocaleDateString()}
                            {loan.isOverdue && <AlertTriangle className="w-3.5 h-3.5 inline" />}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              loan.status === 'ACTIVE'
                                ? loan.isOverdue
                                  ? 'bg-rose-100 text-rose-900 border-rose-300 dark:border-transparent dark:bg-rose-900/40 dark:text-rose-300'
                                  : 'bg-blue-100 text-blue-900 border-blue-300 dark:border-transparent dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {loan.isOverdue ? 'OVERDUE' : loan.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {loan.status === 'ACTIVE' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleQuickRenew(loan.id)}
                                className="px-2 py-1 bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[11px] font-semibold transition-colors"
                              >
                                Renew ({loan.renewalCount})
                              </button>
                              <button
                                onClick={() => {
                                  setReturnForm({
                                    searchIdentifier: loan.copy.accessionNumber,
                                    loanId: loan.id,
                                    condition: 'GOOD',
                                    notes: '',
                                  });
                                  setReturnLoanFound(loan);
                                  setActiveTab('CIRCULATION');
                                }}
                                className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 dark:border-transparent dark:bg-emerald-950/40 dark:text-emerald-300 rounded text-[11px] font-semibold transition-colors"
                              >
                                Check In
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: LIBRARY FINES MANAGEMENT */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'FINES' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-100/70 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-900/40 rounded-2xl text-xs text-amber-950 dark:text-amber-200 font-medium flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-800 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Strict Ledger Isolation:</strong> Library fines are settled exclusively at the library circulation desk with independent receipt sequences. They are never pushed to tuition fee invoices or academic fee balance ledgers.
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2">
              <select
                value={fineStatusFilter}
                onChange={(e) => setFineStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                <option value="">All Fine Records</option>
                <option value="PENDING">Pending Desk Settlement</option>
                <option value="PAID">Settled / Paid</option>
                <option value="WAIVED">Authorized Waivers</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                Total: {totalFines} fines
              </span>
              <button
                onClick={loadFines}
                className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                title="Refresh Fines"
              >
                <RefreshCw className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <th className="py-3 px-4">Borrower & Book</th>
                    <th className="py-3 px-4">Penalty Reason</th>
                    <th className="py-3 px-4 font-mono text-right">Fine Amount</th>
                    <th className="py-3 px-4 font-mono text-right">Settled Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Desk Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {fines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        {isLoading ? 'Loading fine records...' : 'No library fines matching this filter.'}
                      </td>
                    </tr>
                  ) : (
                    fines.map((fine) => {
                      const fineAmt = Number(fine.fineAmount);
                      const paidAmt = Number(fine.paidAmount);
                      const waivedAmt = Number(fine.waivedAmount);
                      const outstanding = Math.max(0, fineAmt - paidAmt - waivedAmt);

                      return (
                        <tr key={fine.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                            {fine.student
                              ? `${fine.student.firstName} ${fine.student.lastName}`
                              : 'Institutional Borrower'}
                            <span className="block text-[11px] font-normal text-slate-600 dark:text-slate-400">
                              {fine.loan?.copy?.book?.title || 'Library Copy'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-800 dark:text-slate-300">
                              {fine.reason}
                            </span>
                            {fine.overdueDays > 0 && (
                              <span className="block text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                                {fine.overdueDays} Overdue Days
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-right font-bold text-slate-900 dark:text-slate-200">
                            ₹{Number(fine.fineAmount).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-emerald-800 dark:text-emerald-400 font-bold">
                            ₹{Number(fine.paidAmount).toFixed(2)}
                            {waivedAmt > 0 && (
                              <span className="block text-[10px] text-amber-800 dark:text-amber-400 font-semibold">
                                (₹{waivedAmt.toFixed(2)} waived)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                fine.status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:border-transparent dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : fine.status === 'WAIVED'
                                  ? 'bg-blue-100 text-blue-900 border-blue-300 dark:border-transparent dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-amber-100 text-amber-950 border-amber-300 dark:border-transparent dark:bg-amber-900/40 dark:text-amber-300'
                              }`}
                            >
                              {fine.status}
                            </span>
                            {fine.paymentReference && (
                              <span className="block text-[10px] font-mono text-slate-600 dark:text-slate-400 font-medium">
                                {fine.paymentReference}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {outstanding > 0 && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedFineForAction(fine);
                                    setCollectAmount(outstanding);
                                    setIsCollectFineOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors"
                                >
                                  Collect ₹{outstanding.toFixed(2)}
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedFineForAction(fine);
                                    setWaiveAmount(outstanding);
                                    setWaiveReason('');
                                    setIsWaiveFineOpen(true);
                                  }}
                                  className="px-2 py-1 bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded text-[11px] font-semibold transition-colors"
                                >
                                  Waive
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 5: POLICY & SETTINGS */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'SETTINGS' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs max-w-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                School Library Policy & Fine Rates
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Institutional circulation rules, loan durations, and automated overdue penalty calculations.
              </p>
            </div>
            {!isAdmin && (
              <span className="px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-300 dark:border-transparent dark:bg-slate-800 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Read-Only (Librarian)
              </span>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Max Active Books (Student)
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  disabled={!isAdmin}
                  value={settingsForm.maxBooksStudent}
                  onChange={(e) => setSettingsForm({ ...settingsForm, maxBooksStudent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Max Active Books (Teacher)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  disabled={!isAdmin}
                  value={settingsForm.maxBooksTeacher}
                  onChange={(e) => setSettingsForm({ ...settingsForm, maxBooksTeacher: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Loan Duration Days (Student)
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  disabled={!isAdmin}
                  value={settingsForm.loanDurationDaysStudent}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, loanDurationDaysStudent: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Max Renewals Allowed
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  disabled={!isAdmin}
                  value={settingsForm.maxRenewals}
                  onChange={(e) => setSettingsForm({ ...settingsForm, maxRenewals: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Overdue Fine Per Day (₹)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  disabled={!isAdmin}
                  value={settingsForm.finePerDay}
                  onChange={(e) => setSettingsForm({ ...settingsForm, finePerDay: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Overdue Grace Period (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  disabled={!isAdmin}
                  value={settingsForm.gracePeriodDays}
                  onChange={(e) => setSettingsForm({ ...settingsForm, gracePeriodDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-300">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={settingsForm.allowRenewWithOverdue}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, allowRenewWithOverdue: e.target.checked })
                  }
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Allow renewals for books that are already overdue
              </label>
            </div>

            {isAdmin && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors"
                >
                  Save Policy Configuration
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODALS */}
      {/* ------------------------------------------------------------- */}

      {/* Modal: Add Book Title */}
      {isAddBookOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Add New Book Title</h3>
              <button onClick={() => setIsAddBookOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateBookSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Book Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fundamentals of Physics"
                  value={newBookForm.title}
                  onChange={(e) => setNewBookForm({ ...newBookForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Author *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Halliday & Resnick"
                    value={newBookForm.author}
                    onChange={(e) => setNewBookForm({ ...newBookForm, author: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Category *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Science, Literature, Math"
                    value={newBookForm.category}
                    onChange={(e) => setNewBookForm({ ...newBookForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    ISBN (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 978-0134093413"
                    value={newBookForm.isbn}
                    onChange={(e) => setNewBookForm({ ...newBookForm, isbn: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Publisher (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Wiley"
                    value={newBookForm.publisher}
                    onChange={(e) => setNewBookForm({ ...newBookForm, publisher: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddBookOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  Save Book Title
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Book Details */}
      {isEditBookOpen && selectedBookForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                Edit Book Metadata
              </h3>
              <button
                onClick={() => {
                  setIsEditBookOpen(false);
                  setSelectedBookForEdit(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditBookSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Book Title *
                </label>
                <input
                  type="text"
                  required
                  value={selectedBookForEdit.title}
                  onChange={(e) =>
                    setSelectedBookForEdit({ ...selectedBookForEdit, title: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Author *
                  </label>
                  <input
                    type="text"
                    required
                    value={selectedBookForEdit.author}
                    onChange={(e) =>
                      setSelectedBookForEdit({ ...selectedBookForEdit, author: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Category *
                  </label>
                  <input
                    type="text"
                    required
                    value={selectedBookForEdit.category}
                    onChange={(e) =>
                      setSelectedBookForEdit({ ...selectedBookForEdit, category: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    ISBN (Optional)
                  </label>
                  <input
                    type="text"
                    value={selectedBookForEdit.isbn || ''}
                    onChange={(e) =>
                      setSelectedBookForEdit({ ...selectedBookForEdit, isbn: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Publisher (Optional)
                  </label>
                  <input
                    type="text"
                    value={selectedBookForEdit.publisher || ''}
                    onChange={(e) =>
                      setSelectedBookForEdit({ ...selectedBookForEdit, publisher: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditBookOpen(false);
                    setSelectedBookForEdit(null);
                  }}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View & Manage Copies for a Book */}
      {isViewCopiesOpen && selectedBookForCopies && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  Physical Inventory Copies: {selectedBookForCopies.title}
                </h3>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                  {selectedBookForCopies.copies?.length || 0} Copy/Copies Registered
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAddCopyOpen(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Copy
                </button>
                <button onClick={() => setIsViewCopiesOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {selectedBookForCopies.copies && selectedBookForCopies.copies.length > 0 ? (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Accession Number</th>
                        <th className="py-2.5 px-3">Barcode</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Condition</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedBookForCopies.copies.map((copy) => (
                        <tr key={copy.id}>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {copy.accessionNumber}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{copy.barcode || '—'}</td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-400">
                            {[copy.rackLocation && `Rack ${copy.rackLocation}`, copy.shelfLocation && `Shelf ${copy.shelfLocation}`]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-medium">{copy.condition}</td>
                          <td className="py-2.5 px-3 font-semibold">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] ${
                                copy.status === 'AVAILABLE'
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:border-transparent dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : copy.status === 'ISSUED'
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300 dark:border-transparent dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-rose-100 text-rose-900 border border-rose-300 dark:border-transparent dark:bg-rose-900/40 dark:text-rose-300'
                              }`}
                            >
                              {copy.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-xs">
                  No physical copies added for this title yet. Click "+ Add Copy" to register accession numbers.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Copy Form */}
      {isAddCopyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Add Copy to Inventory</h3>
              <button onClick={() => setIsAddCopyOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCopySubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Accession Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ACC-2026-0042"
                  value={newCopyForm.accessionNumber}
                  onChange={(e) => setNewCopyForm({ ...newCopyForm, accessionNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Rack Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. B"
                    value={newCopyForm.rackLocation}
                    onChange={(e) => setNewCopyForm({ ...newCopyForm, rackLocation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Shelf Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 3"
                    value={newCopyForm.shelfLocation}
                    onChange={(e) => setNewCopyForm({ ...newCopyForm, shelfLocation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Initial Condition
                </label>
                <select
                  value={newCopyForm.condition}
                  onChange={(e) => setNewCopyForm({ ...newCopyForm, condition: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="NEW">New (Pristine)</option>
                  <option value="GOOD">Good (Ready for loan)</option>
                  <option value="FAIR">Fair</option>
                </select>
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCopyOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  Save Copy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Collect Desk Fine */}
      {isCollectFineOpen && selectedFineForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                Desk Collection: Library Fine
              </h3>
              <button onClick={() => setIsCollectFineOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCollectFineSubmit} className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Record cash settlement for fine on item{' '}
                <strong>{selectedFineForAction.loan?.copy?.book?.title || 'Book Loan'}</strong>.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Amount Received (₹) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-[11px] text-slate-500 space-y-1">
                <div>Receipt sequence: Automatic <code>LIB-REC-YYYY-XXXXXX</code></div>
                <div>Collector: {user?.name} ({user?.role})</div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCollectFineOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  Confirm Cash Collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Waive Fine */}
      {isWaiveFineOpen && selectedFineForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                Authorized Library Fine Waiver
              </h3>
              <button onClick={() => setIsWaiveFineOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleWaiveFineSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Waiver Justification Reason * (Min 5 chars)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Medical absence verified with nurse note, or excused by Principal"
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWaiveFineOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  Confirm Authorized Waiver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Excel Catalogue Bulk Import Modal */}
      <LibraryCatalogueExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={() => {
          loadBooks();
          setIsImportModalOpen(false);
          setSuccessMessage('Library catalogue records ingested successfully from Excel.');
        }}
      />
    </div>
  );
};
