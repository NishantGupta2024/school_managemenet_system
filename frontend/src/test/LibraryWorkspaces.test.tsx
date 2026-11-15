import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LibraryWorkspaceRouter } from '../App';
import { MainLauncherDashboard } from '../components/MainLauncherDashboard';
import { LibraryManagementWorkspace } from '../components/LibraryManagementWorkspace';
import { StudentLibraryPortal } from '../components/StudentLibraryPortal';
import { useAuth } from '../context/AuthContext';
import { libraryApi } from '../services/library.api';
import { UserRole, academicsApi, studentsApi } from '../services/api';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
  useOptionalAuth: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    academicsApi: {
      getGrades: vi.fn(),
      getAcademicYears: vi.fn(),
    },
    studentsApi: {
      getStudents: vi.fn(),
    },
  };
});

vi.mock('../services/library.api', () => ({
  libraryApi: {
    getBooks: vi.fn(),
    createBook: vi.fn(),
    updateBook: vi.fn(),
    deleteBook: vi.fn(),
    createCopy: vi.fn(),
    updateCopy: vi.fn(),
    deleteCopy: vi.fn(),
    issueBook: vi.fn(),
    returnBook: vi.fn(),
    renewBook: vi.fn(),
    getLoans: vi.fn(),
    getFines: vi.fn(),
    collectFine: vi.fn(),
    waiveFine: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getStudentCatalogue: vi.fn(),
    getMyLoans: vi.fn(),
    getMyFines: vi.fn(),
  },
}));

const mockSchool = {
  id: 'sch-library-01',
  code: 'LIB-01',
  name: 'Central High School',
  status: 'ACTIVE',
};

const mockSettings = {
  id: 'set-1',
  schoolId: 'sch-library-01',
  maxBooksStudent: 3,
  maxBooksTeacher: 10,
  loanDurationDaysStudent: 14,
  loanDurationDaysTeacher: 30,
  maxRenewals: 2,
  finePerDay: 5,
  gracePeriodDays: 2,
  allowRenewWithOverdue: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockBooks = [
  {
    id: 'book-1',
    schoolId: 'sch-library-01',
    title: 'Concepts of Physics',
    author: 'H.C. Verma',
    category: 'Physics',
    isbn: '978-8177091878',
    publisher: 'Bharati Bhawan',
    edition: '1st',
    publicationYear: 2020,
    language: 'English',
    description: 'Foundation physics textbook',
    totalCopies: 4,
    availableCopies: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    copies: [
      {
        id: 'copy-1',
        bookId: 'book-1',
        accessionNumber: 'ACC-PHY-001',
        status: 'AVAILABLE',
        condition: 'GOOD',
        rackLocation: 'A',
        shelfLocation: '2',
      },
    ],
  },
];

const mockStudentCatalogue = {
  data: [
    {
      id: 'book-1',
      title: 'Concepts of Physics',
      author: 'H.C. Verma',
      category: 'Physics',
      isbn: '978-8177091878',
      totalCopies: 4,
      availableCopies: 3,
      shelfLocations: ['Rack A, Shelf 2'],
      language: 'English',
    },
  ],
  meta: { total: 1, page: 1, limit: 12, totalPages: 1 },
};

const mockStudentLoans = {
  activeLoans: [
    {
      id: 'loan-1',
      bookTitle: 'Concepts of Physics',
      bookAuthor: 'H.C. Verma',
      category: 'Physics',
      accessionNumber: 'ACC-PHY-001',
      issuedAt: '2026-11-01T00:00:00.000Z',
      dueDate: '2026-11-15T00:00:00.000Z',
      status: 'ACTIVE' as const,
      renewalCount: 0,
      isOverdue: false,
    },
  ],
  pastLoans: [
    {
      id: 'loan-old-1',
      bookTitle: 'Fundamentals of Chemistry',
      bookAuthor: 'O.P. Tandon',
      category: 'Chemistry',
      accessionNumber: 'ACC-CHE-009',
      issuedAt: '2026-10-01T00:00:00.000Z',
      dueDate: '2026-10-15T00:00:00.000Z',
      returnedAt: '2026-10-14T00:00:00.000Z',
      status: 'RETURNED' as const,
      renewalCount: 1,
      isOverdue: false,
    },
  ],
  totalActive: 1,
  totalPast: 1,
};

const mockStudentFines = [
  {
    id: 'fine-1',
    bookTitle: 'Calculus Early Transcendentals',
    reason: 'OVERDUE',
    overdueDays: 4,
    fineAmount: 20,
    paidAmount: 0,
    waivedAmount: 0,
    status: 'PENDING',
    assessedAt: '2026-11-10T00:00:00.000Z',
  },
];

const mockGrades = [
  {
    id: 'grade-10',
    schoolId: 'sch-library-01',
    name: 'Class 10',
    code: '10',
    sections: [
      { id: 'sec-10a', gradeId: 'grade-10', schoolId: 'sch-library-01', name: 'A', capacity: 40 },
      { id: 'sec-10b', gradeId: 'grade-10', schoolId: 'sch-library-01', name: 'B', capacity: 40 },
    ],
  },
  {
    id: 'grade-11',
    schoolId: 'sch-library-01',
    name: 'Class 11',
    code: '11',
    sections: [
      { id: 'sec-11a', gradeId: 'grade-11', schoolId: 'sch-library-01', name: 'A', capacity: 35 },
    ],
  },
  {
    id: 'grade-empty',
    schoolId: 'sch-library-01',
    name: 'Class 12',
    code: '12',
    sections: [],
  },
];

const mockStudentsList = [
  {
    id: 'stud-uuid-1',
    schoolId: 'sch-library-01',
    admissionNumber: 'ADM-2026-001',
    firstName: 'Aarav',
    lastName: 'Sharma',
    rollNumber: '12',
    gradeId: 'grade-10',
    sectionId: 'sec-10a',
    status: 'ACTIVE',
  },
  {
    id: 'stud-uuid-2',
    schoolId: 'sch-library-01',
    admissionNumber: 'ADM-2026-002',
    firstName: 'Diya',
    lastName: 'Patel',
    rollNumber: '14',
    gradeId: 'grade-10',
    sectionId: 'sec-10a',
    status: 'ACTIVE',
  },
];

describe('Library Management System Frontend Workspaces (Phase 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (libraryApi.getSettings as any).mockResolvedValue(mockSettings);
    (libraryApi.getBooks as any).mockResolvedValue({
      data: mockBooks,
      meta: { total: 1, page: 1, limit: 15, totalPages: 1 },
    });
    (libraryApi.getLoans as any).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 15, totalPages: 0 },
    });
    (libraryApi.getFines as any).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 15, totalPages: 0 },
    });
    (libraryApi.getStudentCatalogue as any).mockResolvedValue(mockStudentCatalogue);
    (libraryApi.getMyLoans as any).mockResolvedValue(mockStudentLoans);
    (libraryApi.getMyFines as any).mockResolvedValue(mockStudentFines);
    (academicsApi.getGrades as any).mockResolvedValue(mockGrades);
    (academicsApi.getAcademicYears as any).mockResolvedValue([]);
    (studentsApi.getStudents as any).mockResolvedValue({
      data: mockStudentsList,
      meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
    });
  });

  const setupAuth = (role: UserRole) => {
    (useAuth as any).mockReturnValue({
      user: {
        id: `user-${role.toLowerCase()}`,
        name: `Test ${role}`,
        email: `${role.toLowerCase()}@school.edu`,
        role,
        schoolId: mockSchool.id,
      },
      selectedSchoolId: mockSchool.id,
      selectedSchool: mockSchool,
      availableSchools: [mockSchool],
      selectSchool: vi.fn(),
      clearSelectedSchool: vi.fn(),
      refreshAvailableSchools: vi.fn(),
    });
  };

  describe('Parent Account Strict Exclusion', () => {
    it('strictly denies Parent access to /app/library with Access Restricted', () => {
      setupAuth(UserRole.PARENT);

      render(
        <MemoryRouter initialEntries={['/app/library']}>
          <Routes>
            <Route path="/app/library/*" element={<LibraryWorkspaceRouter />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
      expect(
        screen.getByText(/Parent accounts do not have access to library services/i)
      ).toBeInTheDocument();
      expect(screen.queryByText('Circulation Desk')).not.toBeInTheDocument();
      expect(screen.queryByText('Catalogue Search')).not.toBeInTheDocument();
    });

    it('does not display the Library Management tile to Parent in MainLauncherDashboard', () => {
      setupAuth(UserRole.PARENT);

      render(
        <MemoryRouter>
          <MainLauncherDashboard />
        </MemoryRouter>
      );

      expect(screen.queryByText('Library Management')).not.toBeInTheDocument();
    });
  });

  describe('Student Self-Service Portal Privacy & Independence', () => {
    it('renders StudentLibraryPortal for STUDENT users without Catalogue Search', async () => {
      setupAuth(UserRole.STUDENT);

      render(
        <MemoryRouter initialEntries={['/app/library']}>
          <Routes>
            <Route path="/app/library/*" element={<LibraryWorkspaceRouter />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Student Library Portal')).toBeInTheDocument();
      expect(screen.getByText('My Borrowed Books')).toBeInTheDocument();
      expect(screen.getByText('Library Fines & Desk')).toBeInTheDocument();

      // Student-facing Catalogue Search tab and elements are removed
      expect(screen.queryByText('Catalogue Search')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/Search by title, author, or ISBN/i)).not.toBeInTheDocument();

      // Student does not see staff administrative actions
      expect(screen.queryByText('Add New Book Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Check-Out / Issue Book Copy')).not.toBeInTheDocument();
      expect(screen.queryByText('Policy & Rates')).not.toBeInTheDocument();
    });

    it('displays active and past loans for student with due dates', async () => {
      setupAuth(UserRole.STUDENT);

      render(
        <MemoryRouter>
          <StudentLibraryPortal />
        </MemoryRouter>
      );

      // Default tab is My Borrowed Books
      expect(await screen.findByText('Active Loans (1)')).toBeInTheDocument();
      expect(await screen.findByText('Concepts of Physics')).toBeInTheDocument();
      expect(screen.getByText(/Accession: ACC-PHY-001/i)).toBeInTheDocument();

      // Switch to borrowing history
      const historyButton = screen.getByRole('button', { name: /Borrowing History/i });
      fireEvent.click(historyButton);

      expect(await screen.findByText('Fundamentals of Chemistry')).toBeInTheDocument();
      expect(screen.getByText('ACC-CHE-009')).toBeInTheDocument();
    });

    it('displays library fines with notice of ledger separation from tuition fees', async () => {
      setupAuth(UserRole.STUDENT);

      render(
        <MemoryRouter>
          <StudentLibraryPortal />
        </MemoryRouter>
      );

      // Navigate to Library Fines & Desk tab
      const finesTab = screen.getByRole('button', { name: /Library Fines & Desk/i });
      fireEvent.click(finesTab);

      expect(
        await screen.findByText('Independent Library Desk Settlement Notice')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Library fines are strictly separated from your tuition fee accounts/i)
      ).toBeInTheDocument();
      expect(await screen.findByText('Calculus Early Transcendentals')).toBeInTheDocument();
      expect(screen.getAllByText('₹20.00').length).toBeGreaterThan(0);
    });

    it('displays Library module tile as Live & Operational in MainLauncherDashboard for Student', () => {
      setupAuth(UserRole.STUDENT);

      render(
        <MemoryRouter>
          <MainLauncherDashboard />
        </MemoryRouter>
      );

      expect(screen.getByText('Library Management')).toBeInTheDocument();
      expect(screen.getAllByText('Live & Operational').length).toBeGreaterThan(0);
    });
  });

  describe('Librarian Staff Workspace Workflows', () => {
    it('renders LibraryManagementWorkspace for LIBRARIAN users with staff tabs', async () => {
      setupAuth(UserRole.LIBRARIAN);

      render(
        <MemoryRouter initialEntries={['/app/library']}>
          <Routes>
            <Route path="/app/library/*" element={<LibraryWorkspaceRouter />} />
          </Routes>
        </MemoryRouter>
      );

      const headers = await screen.findAllByText('Library Management Workspace');
      expect(headers.length).toBeGreaterThan(0);
      expect(screen.getByText('Circulation Desk')).toBeInTheDocument();
      expect(screen.getByText('Book Catalogue & Copies')).toBeInTheDocument();
      expect(screen.getByText(/Active & Overdue Loans/i)).toBeInTheDocument();
      expect(screen.getByText('Library Fines')).toBeInTheDocument();
      expect(screen.getByText('Policy & Rates')).toBeInTheDocument();
    });

    it('displays read-only policy guard for LIBRARIAN role in Settings tab', async () => {
      setupAuth(UserRole.LIBRARIAN);

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      const settingsTab = await screen.findByRole('button', { name: /Policy & Rates/i });
      fireEvent.click(settingsTab);

      expect(await screen.findByText(/Read-Only \(Librarian\)/i)).toBeInTheDocument();

      // Form inputs should be disabled for Librarian
      const maxBooksInput = screen.getByDisplayValue('3') as HTMLInputElement;
      expect(maxBooksInput).toBeDisabled();
      expect(screen.queryByText('Save Policy Configuration')).not.toBeInTheDocument();
    });
  });

  describe('Circulation Desk Dependent Borrower Selection', () => {
    it('loads and displays classes in the Class dropdown', async () => {
      setupAuth(UserRole.LIBRARIAN);

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      expect(await screen.findByRole('combobox', { name: /^Class$/i })).toBeInTheDocument();
      expect(academicsApi.getGrades).toHaveBeenCalled();

      expect(screen.getByRole('option', { name: /Class 10 \(10\)/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Class 11 \(11\)/i })).toBeInTheDocument();
    });

    it('filters sections when a class is selected and fetches students when section is selected', async () => {
      setupAuth(UserRole.LIBRARIAN);

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      const classSelect = await screen.findByRole('combobox', { name: /^Class$/i });
      const sectionSelect = screen.getByRole('combobox', { name: /^Section$/i });
      const studentSelect = screen.getByRole('combobox', { name: /^Student$/i });

      // Before selecting class, Section and Student are disabled
      expect(sectionSelect).toBeDisabled();
      expect(studentSelect).toBeDisabled();

      // Select Class 10
      fireEvent.change(classSelect, { target: { value: 'grade-10' } });

      // Section select is now enabled with Class 10 sections (A, B)
      expect(sectionSelect).not.toBeDisabled();
      expect(screen.getByRole('option', { name: /Section A/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Section B/i })).toBeInTheDocument();
      expect(studentSelect).toBeDisabled();

      // Select Section A
      fireEvent.change(sectionSelect, { target: { value: 'sec-10a' } });

      expect(studentsApi.getStudents).toHaveBeenCalledWith({
        gradeId: 'grade-10',
        sectionId: 'sec-10a',
        status: 'ACTIVE',
        page: 1,
        limit: 100,
      });

      // Student select is now enabled with active students
      expect(await screen.findByRole('option', { name: /Aarav Sharma/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Diya Patel/i })).toBeInTheDocument();

      // Select student Aarav
      fireEvent.change(studentSelect, { target: { value: 'stud-uuid-1' } });

      // Verified borrower summary pill is shown
      expect(screen.getByText(/Selected Student:/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Aarav Sharma/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Adm: ADM-2026-001/i).length).toBeGreaterThan(0);
    });

    it('resets section and student when class changes, and resets student when section changes', async () => {
      setupAuth(UserRole.LIBRARIAN);

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      const classSelect = await screen.findByRole('combobox', { name: /^Class$/i });
      const sectionSelect = screen.getByRole('combobox', { name: /^Section$/i });
      const studentSelect = screen.getByRole('combobox', { name: /^Student$/i });

      // Select Class 10 -> Section A -> Student 1
      fireEvent.change(classSelect, { target: { value: 'grade-10' } });
      fireEvent.change(sectionSelect, { target: { value: 'sec-10a' } });
      expect(await screen.findByRole('option', { name: /Aarav Sharma/i })).toBeInTheDocument();
      fireEvent.change(studentSelect, { target: { value: 'stud-uuid-1' } });

      expect(screen.getByText(/Selected Student:/i)).toBeInTheDocument();

      // Changing section resets student
      fireEvent.change(sectionSelect, { target: { value: 'sec-10b' } });
      expect(studentSelect).toHaveValue('');
      expect(screen.queryByText(/Selected Student:/i)).not.toBeInTheDocument();

      // Select student again
      fireEvent.change(studentSelect, { target: { value: 'stud-uuid-2' } });

      // Changing class resets section and student
      fireEvent.change(classSelect, { target: { value: 'grade-11' } });
      expect(sectionSelect).toHaveValue('');
      expect(studentSelect).toHaveValue('');
      expect(studentSelect).toBeDisabled();
      expect(screen.queryByText(/Selected Student:/i)).not.toBeInTheDocument();
    });

    it('displays empty state when class has no sections and when section has no students', async () => {
      setupAuth(UserRole.LIBRARIAN);
      (studentsApi.getStudents as any).mockResolvedValueOnce({ data: [], meta: { total: 0 } });

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      const classSelect = await screen.findByRole('combobox', { name: /^Class$/i });

      // Class 12 has no sections
      fireEvent.change(classSelect, { target: { value: 'grade-empty' } });
      expect(screen.getByText(/No sections configured for this class/i)).toBeInTheDocument();

      // Switch to Class 10, Section B which returns empty students
      fireEvent.change(classSelect, { target: { value: 'grade-10' } });
      const sectionSelect = screen.getByRole('combobox', { name: /^Section$/i });
      fireEvent.change(sectionSelect, { target: { value: 'sec-10b' } });

      expect(await screen.findByText(/No active students found in this section/i)).toBeInTheDocument();
    });

    it('displays error states if loading classes or students fails', async () => {
      setupAuth(UserRole.LIBRARIAN);
      (academicsApi.getGrades as any).mockRejectedValueOnce(new Error('Network error loading grades'));

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      expect(await screen.findByText('Network error loading grades')).toBeInTheDocument();
    });

    it('keeps Confirm Issue button disabled until copy is verified AND student is selected', async () => {
      setupAuth(UserRole.LIBRARIAN);

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      const submitButton = screen.getByRole('button', { name: /Confirm Issue to Student/i });
      expect(submitButton).toBeDisabled();

      // Verify book copy
      const copyInput = screen.getByPlaceholderText(/ACC-2026-0001/i);
      const verifyButton = screen.getByRole('button', { name: /Verify/i });
      fireEvent.change(copyInput, { target: { value: 'ACC-PHY-001' } });
      fireEvent.click(verifyButton);

      expect(await screen.findByText(/Verified Copy: Status is AVAILABLE/i)).toBeInTheDocument();
      // Still disabled because student is not selected
      expect(submitButton).toBeDisabled();

      // Select student
      const classSelect = screen.getByRole('combobox', { name: /^Class$/i });
      const sectionSelect = screen.getByRole('combobox', { name: /^Section$/i });
      const studentSelect = screen.getByRole('combobox', { name: /^Student$/i });

      fireEvent.change(classSelect, { target: { value: 'grade-10' } });
      fireEvent.change(sectionSelect, { target: { value: 'sec-10a' } });
      expect(await screen.findByRole('option', { name: /Aarav Sharma/i })).toBeInTheDocument();
      fireEvent.change(studentSelect, { target: { value: 'stud-uuid-1' } });

      // Both verified: submit button is enabled!
      expect(submitButton).not.toBeDisabled();
    });

    it('submits issue book request with copyId and selected student database UUID', async () => {
      setupAuth(UserRole.LIBRARIAN);
      (libraryApi.issueBook as any).mockResolvedValueOnce({
        id: 'new-loan-1',
        dueDate: '2026-11-30T00:00:00.000Z',
      });

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      // Verify copy
      const copyInput = screen.getByPlaceholderText(/ACC-2026-0001/i);
      const verifyButton = screen.getByRole('button', { name: /Verify/i });
      fireEvent.change(copyInput, { target: { value: 'ACC-PHY-001' } });
      fireEvent.click(verifyButton);
      expect(await screen.findByText(/Verified Copy: Status is AVAILABLE/i)).toBeInTheDocument();

      // Select student
      const classSelect = screen.getByRole('combobox', { name: /^Class$/i });
      const sectionSelect = screen.getByRole('combobox', { name: /^Section$/i });
      const studentSelect = screen.getByRole('combobox', { name: /^Student$/i });

      fireEvent.change(classSelect, { target: { value: 'grade-10' } });
      fireEvent.change(sectionSelect, { target: { value: 'sec-10a' } });
      expect(await screen.findByRole('option', { name: /Aarav Sharma/i })).toBeInTheDocument();
      fireEvent.change(studentSelect, { target: { value: 'stud-uuid-1' } });

      // Add notes and submit
      const notesInput = screen.getByPlaceholderText(/science exhibition preparation/i);
      fireEvent.change(notesInput, { target: { value: 'Reference reading' } });

      const submitButton = screen.getByRole('button', { name: /Confirm Issue to Student/i });
      fireEvent.click(submitButton);

      expect(libraryApi.issueBook).toHaveBeenCalledWith({
        copyId: 'copy-1',
        borrowerType: 'STUDENT',
        studentId: 'stud-uuid-1',
        notes: 'Reference reading',
      });

      expect(await screen.findByText(/Book successfully issued!/i)).toBeInTheDocument();
    });
  });

  describe('School Admin Management & Policy Authority', () => {
    it('allows SCHOOL_ADMIN to edit and save policy settings', async () => {
      setupAuth(UserRole.SCHOOL_ADMIN);

      render(
        <MemoryRouter>
          <LibraryManagementWorkspace />
        </MemoryRouter>
      );

      const settingsTab = await screen.findByRole('button', { name: /Policy & Rates/i });
      fireEvent.click(settingsTab);

      expect(
        await screen.findByText('Save Policy Configuration')
      ).toBeInTheDocument();

      const maxBooksInput = screen.getByDisplayValue('3') as HTMLInputElement;
      expect(maxBooksInput).not.toBeDisabled();
    });
  });
});
