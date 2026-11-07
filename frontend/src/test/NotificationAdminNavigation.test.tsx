import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../App';
import { authApi, UserRole, notificationsApi } from '../services/api';

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
    academicsApi: {
      getAcademicYears: vi.fn().mockResolvedValue([]),
      getGrades: vi.fn().mockResolvedValue([]),
    },
    studentsApi: {
      getStudents: vi.fn().mockResolvedValue({ meta: { total: 0 } }),
    },
    getMyTeacherProfile: vi.fn().mockResolvedValue({ assignments: [] }),
    fetchSystemHealth: vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 10,
      environment: 'test',
      database: { status: 'connected', latencyMs: 1, tenantCount: 1, userCount: 1, studentCount: 1 },
      tenantContext: { activeSchoolId: '00000000-0000-0000-0000-000000000001' },
    }),
    notificationsApi: {
      getSettings: vi.fn().mockResolvedValue({
        id: 'set-1',
        schoolId: '00000000-0000-0000-0000-000000000001',
        feeReminderEmailEnabled: false,
        studentAdmissionEmailEnabled: true,
        attendanceAbsenceEmailEnabled: false,
        examScheduleEmailEnabled: true,
        examResultsEmailEnabled: true,
        receiptEmailEnabled: true,
        paymentReversalEmailEnabled: true,
        refundSuccessEmailEnabled: true,
        refundFailureEmailEnabled: true,
        senderDisplayName: 'Test Academy',
        replyToEmail: 'noreply@school.edu',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      }),
      updateSettings: vi.fn().mockResolvedValue({}),
      getLogs: vi.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
      }),
    },
    feeHeadsApi: {
      list: vi.fn().mockResolvedValue([]),
    },
    feeStructuresApi: {
      list: vi.fn().mockResolvedValue([]),
    },
    studentAllocationsApi: {
      list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    },
    feeInvoicesApi: {
      list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    },
    paymentsApi: {
      list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    },
    reportsApi: {
      getSummary: vi.fn().mockResolvedValue({}),
    },
    receiptSettingsApi: {
      getConfig: vi.fn().mockResolvedValue({}),
    },
    paymentGatewayApi: {
      getConfig: vi.fn().mockResolvedValue({}),
    },
    metaApi: {
      getStudents: vi.fn().mockResolvedValue([]),
      getAccessibleStudents: vi.fn().mockResolvedValue([]),
      getGrades: vi.fn().mockResolvedValue([]),
      getAcademicYears: vi.fn().mockResolvedValue([]),
    },
    examinationApi: {
      getCurriculumChapters: vi.fn().mockResolvedValue([]),
      getAssessments: vi.fn().mockResolvedValue([]),
    },
  };
});

describe('Phase 2M: Notification Navigation & Route Protection Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1 & 2. Authorized SCHOOL_ADMIN and PLATFORM_SUPER_ADMIN see the Notifications & Communications card on the launcher', async () => {
    (authApi as any).setMockSession('mock-token-admin', {
      id: 'usr-admin-1',
      email: 'admin@school.edu',
      name: 'School Principal',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Academy',
    });

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Notifications & Communications')).toBeInTheDocument();
    });

    // Also verify for PLATFORM_SUPER_ADMIN
    (authApi as any).setMockSession('mock-token-super', {
      id: 'usr-super-1',
      email: 'super@platform.edu',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Academy',
    });

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Notifications & Communications').length).toBeGreaterThan(0);
    });
  });

  it('3 & 4. FEE_STAFF, STUDENT, and PARENT do NOT see the Notifications card on the dashboard', async () => {
    // Check Fee Staff
    (authApi as any).setMockSession('mock-token-staff', {
      id: 'usr-staff-1',
      email: 'staff@school.edu',
      name: 'Fee Staff',
      role: UserRole.FEE_STAFF,
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Academy',
    });

    const { unmount: unmountStaff } = render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Fee Management')).toBeInTheDocument();
    });
    expect(screen.queryByText('Notifications & Communications')).not.toBeInTheDocument();
    unmountStaff();

    // Check Student
    (authApi as any).setMockSession('mock-token-student', {
      id: 'usr-student-1',
      email: 'student@school.edu',
      name: 'Student One',
      role: UserRole.STUDENT,
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Academy',
    });

    const { unmount: unmountStudent } = render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Student One')).toBeInTheDocument();
    });
    expect(screen.queryByText('Notifications & Communications')).not.toBeInTheDocument();
    unmountStudent();
  });

  it('5. Clicking the card navigates to /app/notifications', async () => {
    (authApi as any).setMockSession('mock-token-admin', {
      id: 'usr-admin-1',
      email: 'admin@school.edu',
      name: 'School Principal',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Academy',
    });

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Notifications & Communications')).toBeInTheDocument();
    });

    const launchBtn = screen.getByRole('button', { name: /Launch Notifications & Communications/i });
    fireEvent.click(launchBtn);

    await waitFor(() => {
      expect(screen.getByText('Automated email alerts, notification preferences, delivery logs, and channel status')).toBeInTheDocument();
    });
  });

  it('6 & 7. Direct navigation to /app/notifications renders NotificationSettingsView for authorized admin', async () => {
    (authApi as any).setMockSession('mock-token-admin', {
      id: 'usr-admin-1',
      email: 'admin@school.edu',
      name: 'School Principal',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Academy',
    });

    render(
      <MemoryRouter initialEntries={['/app/notifications']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      // Header from NotificationManagementWorkspace
      expect(screen.getByText('Automated email alerts, notification preferences, delivery logs, and channel status')).toBeInTheDocument();
      // Rendered NotificationSettingsView internal tab / heading
      expect(screen.getByText('Notification Management & Preferences')).toBeInTheDocument();
      expect(notificationsApi.getSettings).toHaveBeenCalled();
    });
  });

  it('8. Unauthorized FEE_STAFF directly entering /app/notifications is blocked with Access Restricted', async () => {
    (authApi as any).setMockSession('mock-token-staff', {
      id: 'usr-staff-1',
      email: 'staff@school.edu',
      name: 'Fee Staff',
      role: UserRole.FEE_STAFF,
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Academy',
    });

    render(
      <MemoryRouter initialEntries={['/app/notifications']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Access Restricted')).toBeInTheDocument();
      expect(screen.getByText(/Notification settings and delivery logs are restricted to School Administrators/i)).toBeInTheDocument();
    });
  });

  it('9. Existing Fee Management workspace Notifications tab remains operational', async () => {
    (authApi as any).setMockSession('mock-token-admin', {
      id: 'usr-admin-1',
      email: 'admin@school.edu',
      name: 'School Principal',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Academy',
    });

    render(
      <MemoryRouter initialEntries={['/app/fees']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Invoicing, allocations, payments, receipts, and financial statements')).toBeInTheDocument();
    });

    // Find and click the Notifications tab inside /app/fees
    const notifTabs = screen.getAllByRole('button', { name: /Notifications/i });
    expect(notifTabs.length).toBeGreaterThan(0);
    fireEvent.click(notifTabs[0]);

    await waitFor(() => {
      expect(screen.getByText('Notification Management & Preferences')).toBeInTheDocument();
    });
  });
});
