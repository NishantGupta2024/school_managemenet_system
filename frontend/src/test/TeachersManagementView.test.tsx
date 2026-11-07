import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TeachersManagementView } from '../components/TeachersManagementView';
import { TeacherManagementWorkspace } from '../App';
import { teachersApi, academicsApi, Teacher, TeacherStatus } from '../services/api';
import { AuthProvider } from '../context/AuthContext';

let currentMockUser: any = {
  id: 'admin-1',
  email: 'admin@school.edu',
  name: 'School Administrator',
  role: 'SCHOOL_ADMIN',
  schoolId: 'school-1',
  schoolName: 'Greenwood International',
};

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      login: vi.fn(),
      logout: vi.fn(),
      getToken: vi.fn(() => 'mock-jwt-token'),
      getUser: vi.fn(() => currentMockUser),
      getProfile: vi.fn(() => Promise.resolve(currentMockUser)),
    },
    teachersApi: {
      getTeachers: vi.fn(),
      getDepartments: vi.fn(),
      getTeacherById: vi.fn(),
      createTeacher: vi.fn(),
      updateTeacher: vi.fn(),
      deactivateTeacher: vi.fn(),
      deleteTeacher: vi.fn(),
      assignTeacher: vi.fn(),
      removeAssignment: vi.fn(),
      provisionAccount: vi.fn(),
    },
    academicsApi: {
      getAcademicYears: vi.fn(),
      getGrades: vi.fn(),
    },
  };
});

const mockAcademicYears = [
  {
    id: 'ay-1',
    schoolId: 'school-1',
    name: '2026-2027',
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    isCurrent: true,
  },
];

const mockGrades = [
  {
    id: 'g-10',
    schoolId: 'school-1',
    name: 'Grade 10',
    code: 'G10',
    sections: [
      { id: 'sec-a', schoolId: 'school-1', gradeId: 'g-10', name: 'Section A', capacity: 35 },
      { id: 'sec-b', schoolId: 'school-1', gradeId: 'g-10', name: 'Section B', capacity: 35 },
    ],
  },
];

const mockTeachers: Teacher[] = [
  {
    id: 't-1',
    schoolId: 'school-1',
    employeeId: 'EMP-001',
    firstName: 'Sarah',
    lastName: 'Connor',
    email: 'sarah.connor@school.edu',
    phone: '9876543210',
    department: 'Science',
    designation: 'Senior Faculty',
    joiningDate: '2025-06-01',
    status: 'ACTIVE' as TeacherStatus,
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    user: {
      id: 'u-1',
      email: 'sarah.connor@school.edu',
      role: 'TEACHER',
      status: 'ACTIVE',
    },
    assignments: [
      {
        id: 'asg-1',
        teacherId: 't-1',
        schoolId: 'school-1',
        academicYearId: 'ay-1',
        gradeId: 'g-10',
        sectionId: 'sec-a',
        subject: 'Physics',
        isClassTeacher: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        academicYear: { id: 'ay-1', name: '2026-2027', isCurrent: true },
        grade: { id: 'g-10', name: 'Grade 10', code: 'G10' },
        section: { id: 'sec-a', name: 'Section A' },
      },
    ],
  },
  {
    id: 't-2',
    schoolId: 'school-1',
    employeeId: 'EMP-002',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@school.edu',
    phone: '9123456780',
    department: 'Mathematics',
    designation: 'Lecturer',
    joiningDate: '2025-08-01',
    status: 'ON_LEAVE' as TeacherStatus,
    createdAt: '2025-08-01T00:00:00.000Z',
    updatedAt: '2025-08-01T00:00:00.000Z',
    user: null,
    assignments: [],
  },
];

describe('TeachersManagementView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockUser = {
      id: 'admin-1',
      email: 'admin@school.edu',
      name: 'School Administrator',
      role: 'SCHOOL_ADMIN',
      schoolId: 'school-1',
      schoolName: 'Greenwood International',
    };
    (academicsApi.getAcademicYears as any).mockResolvedValue(mockAcademicYears);
    (academicsApi.getGrades as any).mockResolvedValue(mockGrades);
    (teachersApi.getDepartments as any).mockResolvedValue(['Science', 'Mathematics', 'Languages']);
    (teachersApi.getTeachers as any).mockResolvedValue({
      data: mockTeachers,
      meta: {
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      },
    });
    (teachersApi.getTeacherById as any).mockImplementation((id: string) => {
      const found = mockTeachers.find((t) => t.id === id);
      return Promise.resolve(found || mockTeachers[0]);
    });
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = () => {
    return render(
      <AuthProvider>
        <MemoryRouter>
          <TeachersManagementView />
        </MemoryRouter>
      </AuthProvider>,
    );
  };

  it('renders directory heading, total faculty badge, and teacher rows', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Teacher & Staff Directory')).toBeInTheDocument();
      expect(screen.getByText('2 Total Faculty')).toBeInTheDocument();
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('EMP-001')).toBeInTheDocument();
    expect(screen.getByText('EMP-002')).toBeInTheDocument();
    expect(screen.getByText('sarah.connor@school.edu')).toBeInTheDocument();
    expect(screen.getByText('john.doe@school.edu')).toBeInTheDocument();
    expect(screen.getAllByText('Science').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Mathematics').length).toBeGreaterThanOrEqual(1);
  });

  it('filters directory by search input when search is submitted', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search by name, employee ID, or email/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name, employee ID, or email/i);
    fireEvent.change(searchInput, { target: { value: 'Connor' } });

    const searchBtn = screen.getByRole('button', { name: /^Search$/i });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(teachersApi.getTeachers).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Connor',
          page: 1,
        }),
      );
    });
  });

  it('filters directory by department dropdown', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText(/Filter by department/i)).toBeInTheDocument();
    });

    const deptSelect = screen.getByLabelText(/Filter by department/i);
    fireEvent.change(deptSelect, { target: { value: 'Science' } });

    await waitFor(() => {
      expect(teachersApi.getTeachers).toHaveBeenCalledWith(
        expect.objectContaining({
          department: 'Science',
          page: 1,
        }),
      );
    });
  });

  it('filters directory by status dropdown', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText(/Filter by status/i)).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText(/Filter by status/i);
    fireEvent.change(statusSelect, { target: { value: 'ON_LEAVE' } });

    await waitFor(() => {
      expect(teachersApi.getTeachers).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ON_LEAVE',
          page: 1,
        }),
      );
    });
  });

  it('renders empty state when no teachers exist and offers CTA', async () => {
    (teachersApi.getTeachers as any).mockResolvedValueOnce({
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No Faculty Records Found')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Register First Faculty/i })).toBeInTheDocument();
    });
  });

  it('renders error banner when API fails and supports retry', async () => {
    (teachersApi.getTeachers as any).mockRejectedValueOnce({
      response: { data: { message: 'Database connection failed' } },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    });

    // Click refresh to retry
    (teachersApi.getTeachers as any).mockResolvedValueOnce({
      data: mockTeachers,
      meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });

    const refreshBtn = screen.getByTitle('Refresh Directory');
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });
  });

  it('opens Create Teacher modal, validates fields, and creates a teacher profile', async () => {
    (teachersApi.createTeacher as any).mockResolvedValueOnce({
      id: 't-new',
      employeeId: 'EMP-003',
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan.turing@school.edu',
      status: 'ACTIVE',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Faculty Member/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Faculty Member/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Register Faculty Member/i })).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. EMP-2026-001/i), {
      target: { value: 'EMP-003' },
    });
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'Alan' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last name'), {
      target: { value: 'Turing' },
    });
    fireEvent.change(screen.getByPlaceholderText('teacher@school.edu'), {
      target: { value: 'alan.turing@school.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Science, Mathematics/i), {
      target: { value: 'Mathematics' },
    });

    const submitBtn = screen.getByRole('button', { name: /Register Faculty Member/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(teachersApi.createTeacher).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'EMP-003',
          firstName: 'Alan',
          lastName: 'Turing',
          email: 'alan.turing@school.edu',
        }),
      );
      expect(screen.getByText(/registered successfully/i)).toBeInTheDocument();
    });
  });

  it('displays validation error if duplicate employee ID is rejected by backend', async () => {
    (teachersApi.createTeacher as any).mockRejectedValueOnce({
      response: { data: { message: "A teacher with employee ID 'EMP-001' already exists" } },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Faculty Member/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Faculty Member/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Register Faculty Member/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. EMP-2026-001/i), {
      target: { value: 'EMP-001' },
    });
    fireEvent.change(screen.getByPlaceholderText('First name'), {
      target: { value: 'Duplicate' },
    });
    fireEvent.change(screen.getByPlaceholderText('Last name'), {
      target: { value: 'Teacher' },
    });
    fireEvent.change(screen.getByPlaceholderText('teacher@school.edu'), {
      target: { value: 'duplicate@school.edu' },
    });

    const submitBtn = screen.getByRole('button', { name: /Register Faculty Member/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });

  it('opens teacher profile drawer with assignments, contact, and credentials status', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });

    const viewBtn = screen.getByLabelText('View profile for Sarah Connor');
    fireEvent.click(viewBtn);

    await waitFor(() => {
      expect(screen.getByText('Employment & Contact Details')).toBeInTheDocument();
      expect(screen.getByText('Portal User Credentials')).toBeInTheDocument();
      expect(screen.getByText('Academic & Section Assignments')).toBeInTheDocument();
      expect(screen.getByText('Grade 10 — Section A')).toBeInTheDocument();
      expect(screen.getByText('Physics')).toBeInTheDocument();
      expect(screen.getByText('Class Teacher')).toBeInTheDocument();
    });
  });

  it('opens assignment modal and successfully assigns class and section', async () => {
    (teachersApi.assignTeacher as any).mockResolvedValueOnce({
      id: 'asg-2',
      teacherId: 't-1',
      subject: 'Biology',
      isClassTeacher: false,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });

    const assignBtn = screen.getByLabelText('Assign section for Sarah Connor');
    fireEvent.click(assignBtn);

    await waitFor(() => {
      expect(screen.getByText('Assign Section & Subject')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Mathematics, Physics, General/i), {
      target: { value: 'Biology' },
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Assignment/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(teachersApi.assignTeacher).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({
          subject: 'Biology',
        }),
      );
      expect(screen.getByText(/Assigned Sarah Connor to Biology/i)).toBeInTheDocument();
    });
  });

  it('opens provision account modal and provisions login user credentials', async () => {
    (teachersApi.provisionAccount as any).mockResolvedValueOnce({
      message: 'Teacher account provisioned successfully',
      user: { id: 'u-2', email: 'john.doe@school.edu', role: 'TEACHER', status: 'ACTIVE' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Open John Doe's profile (he has user: null)
    const viewBtn = screen.getByLabelText('View profile for John Doe');
    fireEvent.click(viewBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Provision Account/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Provision Account/i }));

    await waitFor(() => {
      expect(screen.getByText('Provision Portal Credentials')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/Minimum 8 characters/i), {
      target: { value: 'SecurePass123!' },
    });

    const createAccountBtn = screen.getByRole('button', { name: /Create Account/i });
    fireEvent.click(createAccountBtn);

    await waitFor(() => {
      expect(teachersApi.provisionAccount).toHaveBeenCalledWith(
        't-2',
        expect.objectContaining({
          password: 'SecurePass123!',
        }),
      );
      expect(screen.getByText(/Login account provisioned successfully/i)).toBeInTheDocument();
    });
  });

  it('handles deactivation confirmation dialog safely', async () => {
    (teachersApi.deactivateTeacher as any).mockResolvedValueOnce({
      ...mockTeachers[0],
      status: 'INACTIVE',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });

    const deactBtn = screen.getByLabelText('Deactivate Sarah Connor');
    fireEvent.click(deactBtn);

    await waitFor(() => {
      expect(screen.getByText('Deactivate Teacher Profile')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Deactivate Teacher$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Deactivate Teacher$/i }));

    await waitFor(() => {
      expect(teachersApi.deactivateTeacher).toHaveBeenCalledWith('t-1');
      expect(screen.getByText(/has been deactivated/i)).toBeInTheDocument();
    });
  });
});

describe('TeacherManagementWorkspace Route & Permission Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows authorized roles (SCHOOL_ADMIN) to render teacher workspace', async () => {
    currentMockUser = {
      id: 'admin-1',
      email: 'admin@school.edu',
      role: 'SCHOOL_ADMIN',
      schoolId: 'school-1',
    };

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/app/teachers']}>
          <Routes>
            <Route path="/app/teachers" element={<TeacherManagementWorkspace />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Teacher & Staff Management')).toBeInTheDocument();
      expect(screen.getByText('Teacher & Staff Directory')).toBeInTheDocument();
    });
  });

  it('blocks unauthorized roles (STUDENT) with Access Restricted notice', async () => {
    currentMockUser = {
      id: 'student-1',
      email: 'student@school.edu',
      role: 'STUDENT',
      schoolId: 'school-1',
    };

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/app/teachers']}>
          <Routes>
            <Route path="/app/teachers" element={<TeacherManagementWorkspace />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
      expect(screen.getByText(/is not authorized to access Teacher & Staff Management/i)).toBeInTheDocument();
    });
  });
});
