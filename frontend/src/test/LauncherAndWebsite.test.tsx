import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../App';
import { authApi, UserRole, getMyTeacherProfile } from '../services/api';

vi.mock('../services/api', () => {
  let mockToken: string | null = null;
  let mockUser: any = null;

  return {
    default: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
    DEFAULT_TENANT_ID: '00000000-0000-0000-0000-000000000001',
    DEFAULT_SCHOOL_CODE: 'SCH001',
    UserRole: {
      PLATFORM_SUPER_ADMIN: 'PLATFORM_SUPER_ADMIN',
      SCHOOL_ADMIN: 'SCHOOL_ADMIN',
      FEE_STAFF: 'FEE_STAFF',
      STUDENT: 'STUDENT',
      PARENT: 'PARENT',
      TEACHER: 'TEACHER',
    },
    setActiveSchoolId: vi.fn(),
    setOnUnauthorized: vi.fn(),
    authApi: {
      login: vi.fn(),
      logout: vi.fn(() => {
        mockToken = null;
        mockUser = null;
      }),
      getToken: vi.fn(() => mockToken),
      getUser: vi.fn(() => mockUser),
      getProfile: vi.fn(),
      setMockSession: (token: string | null, user: any) => {
        mockToken = token;
        mockUser = user;
        (authApi.getProfile as any).mockResolvedValue(user);
      },
    },
    fetchSystemHealth: vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 10,
      environment: 'test',
      database: { status: 'connected', latencyMs: 1, tenantCount: 1, userCount: 1, studentCount: 1 },
      tenantContext: { activeSchoolId: '00000000-0000-0000-0000-000000000001' },
    }),
    academicsApi: {
      getAcademicYears: vi.fn().mockResolvedValue([
        {
          id: 'ay-2026',
          name: '2026-2027 Academic Session',
          startDate: '2026-04-01T00:00:00.000Z',
          endDate: '2027-03-31T00:00:00.000Z',
          isCurrent: true,
          status: 'ACTIVE',
        },
      ]),
      getGrades: vi.fn().mockResolvedValue([
        { id: 'g1', name: 'Grade 1', code: 'G1', displayOrder: 1, sections: [] },
        { id: 'g2', name: 'Grade 2', code: 'G2', displayOrder: 2, sections: [] },
      ]),
    },
    studentsApi: {
      getStudents: vi.fn().mockResolvedValue({
        data: [],
        meta: { total: 420, page: 1, limit: 10, totalPages: 42 },
      }),
      getStudentById: vi.fn(),
      getStudentProfile: vi.fn(),
      createStudent: vi.fn(),
      updateStudent: vi.fn(),
      getFeeStatement: vi.fn(),
    },
    feeHeadsApi: { list: vi.fn().mockResolvedValue([]) },
    feeStructuresApi: { list: vi.fn().mockResolvedValue([]) },
    studentAllocationsApi: { list: vi.fn().mockResolvedValue([]) },
    fineRulesApi: { list: vi.fn().mockResolvedValue([]) },
    reportsApi: {
      getDailyCollection: vi.fn().mockResolvedValue({ summary: {}, transactions: [] }),
      getMonthlyCollection: vi.fn().mockResolvedValue({ summary: {} }),
      getCollectionSummary: vi.fn().mockResolvedValue({ summary: {} }),
      getOutstandingDues: vi.fn().mockResolvedValue({ summary: {}, records: [] }),
      getDefaultersReport: vi.fn().mockResolvedValue({ summary: {}, records: [] }),
      getClassCollections: vi.fn().mockResolvedValue({ summary: {}, byClass: [] }),
      getFineSummary: vi.fn().mockResolvedValue({ summary: {}, byClass: [] }),
    },
    schoolsApi: {
      list: vi.fn().mockResolvedValue({
        data: [{ id: 'sch-1', name: 'Springfield Academy', code: 'SPF01', status: 'ACTIVE' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }),
    },
    teachersApi: {
      getTeachers: vi.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
      }),
      getDepartments: vi.fn().mockResolvedValue([]),
      getTeacherById: vi.fn(),
      createTeacher: vi.fn(),
      updateTeacher: vi.fn(),
      deactivateTeacher: vi.fn(),
      deleteTeacher: vi.fn(),
      assignTeacher: vi.fn(),
      removeAssignment: vi.fn(),
      provisionAccount: vi.fn(),
    },
    attendanceApi: {
      getRegister: vi.fn().mockResolvedValue({
        data: [],
        register: {
          totalEnrolled: 0,
          totalPresent: 0,
          totalAbsent: 0,
          totalLate: 0,
          totalHalfDay: 0,
          totalExcused: 0,
          totalUnmarked: 0,
          status: 'UNMARKED',
          isLocked: false,
        },
        meta: { total: 0, page: 1, limit: 50, totalPages: 1 },
      }),
      bulkMark: vi.fn(),
      correctAttendance: vi.fn(),
      getStudentHistory: vi.fn(),
    },
    metaApi: {
      getStudents: vi.fn().mockResolvedValue([]),
      getAccessibleStudents: vi.fn().mockResolvedValue([]),
      getGrades: vi.fn().mockResolvedValue([]),
      getAcademicYears: vi.fn().mockResolvedValue([]),
    },
    getMyTeacherProfile: vi.fn(),
  };
});

describe('Unified School ERP: Public Website & System Launcher Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authApi as any).setMockSession(null, null);
  });

  afterEach(() => {
    (authApi as any).setMockSession(null, null);
  });

  describe('1. Public Main Website (/)', () => {
    it('renders hero banner, module directory, and institutional value propositions for unauthenticated visitor', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText(/One Unified System for/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Portal Login/i })).toBeInTheDocument();
        expect(screen.getByText(/Specialized Modules on One Data Foundation/i)).toBeInTheDocument();
      });

      // Verify module directory cards
      expect(screen.getByText('Fee Management')).toBeInTheDocument();
      expect(screen.getByText('Student & Admissions')).toBeInTheDocument();
      expect(screen.getByText('Academic Setup')).toBeInTheDocument();
      expect(screen.getByText('Teacher & Staff Management')).toBeInTheDocument();
    });

    it('submits school onboarding enquiry with contact form feedback', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Springfield International School/i)).toBeInTheDocument();
      });

      const schoolInput = screen.getByPlaceholderText(/Springfield International School/i);
      const nameInput = screen.getByPlaceholderText(/Dr\. Rajesh Sharma/i);
      const emailInput = screen.getByPlaceholderText(/admin@school\.edu/i);
      const phoneInput = screen.getByPlaceholderText(/9876543210/i);

      fireEvent.change(schoolInput, { target: { value: 'Hillside Academy' } });
      fireEvent.change(nameInput, { target: { value: 'Principal John' } });
      fireEvent.change(emailInput, { target: { value: 'john@hillside.edu' } });
      fireEvent.change(phoneInput, { target: { value: '9876543210' } });

      const submitButton = screen.getByRole('button', { name: /Submit Institutional Enquiry/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Enquiry Submitted Successfully/i)).toBeInTheDocument();
      });
    });

    it('navigates to /login when Portal Login button is clicked', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Portal Login/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Portal Login/i }));

      await waitFor(() => {
        expect(screen.getByText(/Multi-Tenant SaaS • Sign in with your institutional credentials/i)).toBeInTheDocument();
        expect(screen.getByText(/Back to Institutional Website/i)).toBeInTheDocument();
      });
    });
  });

  describe('2. Main System Launcher Dashboard (/app)', () => {
    beforeEach(() => {
      (authApi as any).setMockSession('valid-token', {
        id: 'user-admin-1',
        email: 'admin@springfield.edu',
        name: 'Principal Skinner',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'sch-1',
        schoolName: 'Springfield Elementary',
      });
      (authApi.getProfile as any).mockResolvedValue({
        id: 'user-admin-1',
        email: 'admin@springfield.edu',
        name: 'Principal Skinner',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'sch-1',
        schoolName: 'Springfield Elementary',
      });
    });

    it('renders system launcher welcome card and live summary counters', async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Principal Skinner')).toBeInTheDocument();
        expect(screen.getByText(/System Launcher/i)).toBeInTheDocument();
        expect(screen.getByText('2026-2027 Academic Session')).toBeInTheDocument();
      });

      // Grade Classes count: 2
      expect(screen.getByText('2')).toBeInTheDocument();
      // Total Enrolled Students count: 420
      expect(screen.getByText('420')).toBeInTheDocument();
    });

    it('displays operational module cards with launch actions', async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Fee Management')).toBeInTheDocument();
        expect(screen.getByText('Student & Admissions')).toBeInTheDocument();
        expect(screen.getByText('Academic Setup')).toBeInTheDocument();
        expect(screen.getByText('User Accounts & Access')).toBeInTheDocument();
      });

      // Verify roadmap preview modal trigger on Library roadmap module
      const libraryCard = screen.getByRole('button', { name: /Launch Library Management/i });
      fireEvent.click(libraryCard);

      await waitFor(() => {
        expect(screen.getByText(/Roadmap Module Preview/i)).toBeInTheDocument();
        expect(screen.getByText(/Phase 5: Library Cataloging & Overdue Ledger/i)).toBeInTheDocument();
      });

      // Close modal
      const closeBtn = screen.getByRole('button', { name: /Close Preview/i });
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByText(/Roadmap Module Preview/i)).not.toBeInTheDocument();
      });
    });

    it('launches Examinations & Grading Workspace with Back to Launcher navigation', async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Examinations & Grading')).toBeInTheDocument();
      });

      const launchExamBtn = screen.getByRole('button', { name: /Launch Examinations & Grading/i });
      fireEvent.click(launchExamBtn);

      await waitFor(() => {
        expect(screen.getByText(/Examination Monitoring & Oversight|Examinations & Assessments/i)).toBeInTheDocument();
        expect(screen.getByText(/System Launcher →/i)).toBeInTheDocument();
      });

      // Click "System Launcher →" to return back to launcher
      const backBtn = screen.getByRole('button', { name: /System Launcher →/i });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(screen.getByText(/System Launcher/i)).toBeInTheDocument();
      });
    });

    it('launches Attendance Management Workspace with Back to Launcher navigation', async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Attendance Management')).toBeInTheDocument();
      });

      const launchAttendanceBtn = screen.getByRole('button', { name: /Launch Attendance Management/i });
      fireEvent.click(launchAttendanceBtn);

      await waitFor(() => {
        expect(screen.getByText('Daily Attendance & Roll-Call Registers')).toBeInTheDocument();
        expect(screen.getByText(/System Launcher →/i)).toBeInTheDocument();
      });

      // Click "System Launcher →" to return back to launcher
      const backBtn = screen.getByRole('button', { name: /System Launcher →/i });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(screen.getByText(/System Launcher/i)).toBeInTheDocument();
      });
    });

    it('launches Teacher & Staff Management Workspace with Back to Launcher navigation', async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Teacher & Staff Management')).toBeInTheDocument();
      });

      const launchTeachersBtn = screen.getByRole('button', { name: /Launch Teacher & Staff Management/i });
      fireEvent.click(launchTeachersBtn);

      await waitFor(() => {
        expect(screen.getAllByText('Teacher & Staff Management').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/System Launcher →/i)).toBeInTheDocument();
      });

      // Click "System Launcher →" to return back to launcher
      const backBtn = screen.getByRole('button', { name: /System Launcher →/i });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(screen.getByText(/System Launcher/i)).toBeInTheDocument();
      });
    });

    it('launches Fee Management Workspace and allows returning to Launcher', async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Fee Management')).toBeInTheDocument();
      });

      const launchFeeBtn = screen.getByRole('button', { name: /Launch Fee Management/i });
      fireEvent.click(launchFeeBtn);

      await waitFor(() => {
        expect(screen.getAllByText('Fee Management Workspace').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/System Launcher →/i)).toBeInTheDocument();
      });

      // Click "System Launcher →" to return back to launcher
      const backBtn = screen.getByRole('button', { name: /System Launcher →/i });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(screen.getByText(/System Launcher/i)).toBeInTheDocument();
      });
    });

    it('launches Student Management Workspace with Back to Launcher navigation', async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Student & Admissions')).toBeInTheDocument();
      });

      const launchStudentBtn = screen.getByRole('button', { name: /Launch Student & Admissions/i });
      fireEvent.click(launchStudentBtn);

      await waitFor(() => {
        expect(screen.getByText('Student Management Workspace')).toBeInTheDocument();
      });

      // Header "Launcher" button returns to /app
      const launcherHeaderBtn = screen.getByRole('button', { name: /^Launcher$/i });
      fireEvent.click(launcherHeaderBtn);

      await waitFor(() => {
        expect(screen.getByText(/System Launcher/i)).toBeInTheDocument();
      });
    });

    it('launches Academic Setup Workspace with Back to Launcher navigation', async () => {
      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Academic Setup')).toBeInTheDocument();
      });

      const launchAcademicBtn = screen.getByRole('button', { name: /Launch Academic Setup/i });
      fireEvent.click(launchAcademicBtn);

      await waitFor(() => {
        expect(screen.getByText('Academic Setup & Governance')).toBeInTheDocument();
      });

      // Return via workspace launcher button
      const backBtn = screen.getByRole('button', { name: /System Launcher →/i });
      fireEvent.click(backBtn);

      await waitFor(() => {
        expect(screen.getByText(/System Launcher/i)).toBeInTheDocument();
      });
    });

    it('shows Attendance Management card for Class Teacher with eligible assignment', async () => {
      (authApi as any).setMockSession('mock-token', {
        id: 'usr-teacher-1',
        email: 'teacher.class@school.edu',
        name: 'Sarah Connor',
        role: UserRole.TEACHER,
        schoolId: 'sch-1',
      });

      (getMyTeacherProfile as any).mockResolvedValueOnce({
        id: 'tch-1',
        email: 'teacher.class@school.edu',
        assignments: [
          {
            id: 'asg-1',
            isClassTeacher: true,
            gradeId: 'grade-1',
            sectionId: 'sec-1',
          },
        ],
      });

      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Attendance Management')).toBeInTheDocument();
      });
    });

    it('hides Attendance Management card for Subject-only teacher', async () => {
      (authApi as any).setMockSession('mock-token', {
        id: 'usr-teacher-subject',
        email: 'teacher.subject@school.edu',
        name: 'Physics Teacher',
        role: UserRole.TEACHER,
        schoolId: 'sch-1',
      });

      (getMyTeacherProfile as any).mockResolvedValueOnce({
        id: 'tch-2',
        email: 'teacher.subject@school.edu',
        assignments: [
          {
            id: 'asg-2',
            isClassTeacher: false,
            subject: 'Physics',
            gradeId: 'grade-1',
            sectionId: 'sec-1',
          },
        ],
      });

      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Teacher & Staff Management')).toBeInTheDocument();
      });

      expect(screen.queryByText('Attendance Management')).not.toBeInTheDocument();
    });

    it('hides Attendance Management card for Unassigned teacher', async () => {
      (authApi as any).setMockSession('mock-token', {
        id: 'usr-teacher-none',
        email: 'teacher.unassigned@school.edu',
        name: 'New Faculty',
        role: UserRole.TEACHER,
        schoolId: 'sch-1',
      });

      (getMyTeacherProfile as any).mockResolvedValueOnce({
        id: 'tch-3',
        email: 'teacher.unassigned@school.edu',
        assignments: [],
      });

      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Teacher & Staff Management')).toBeInTheDocument();
      });

      expect(screen.queryByText('Attendance Management')).not.toBeInTheDocument();
    });

    it('preserves Attendance Management card visibility for School Admin and Fee Staff', async () => {
      (authApi as any).setMockSession('mock-token', {
        id: 'usr-staff-1',
        email: 'staff@school.edu',
        name: 'Accountant Jane',
        role: UserRole.FEE_STAFF,
        schoolId: 'sch-1',
      });

      render(
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Attendance Management')).toBeInTheDocument();
      });
    });
  });
});
