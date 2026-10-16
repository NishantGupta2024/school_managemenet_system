import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { LoginView } from '../components/LoginView';
import { AppRoutes } from '../App';
import { authApi, UserRole, setActiveSchoolId } from '../services/api';

vi.mock('../services/api', () => {
  let mockToken: string | null = null;
  let mockUser: any = null;
  let unauthorizedHandler: (() => void) | null = null;

  return {
    DEFAULT_TENANT_ID: '00000000-0000-0000-0000-000000000001',
    DEFAULT_SCHOOL_CODE: 'SCH001',
    UserRole: {
      PLATFORM_SUPER_ADMIN: 'PLATFORM_SUPER_ADMIN',
      SCHOOL_ADMIN: 'SCHOOL_ADMIN',
      FEE_STAFF: 'FEE_STAFF',
      STUDENT: 'STUDENT',
      PARENT: 'PARENT',
    },
    setActiveSchoolId: vi.fn(),
    setOnUnauthorized: vi.fn((cb) => {
      unauthorizedHandler = cb;
    }),
    triggerMockUnauthorized: () => {
      if (unauthorizedHandler) unauthorizedHandler();
    },
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
    feeHeadsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    feeStructuresApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    studentAllocationsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    metaApi: {
      getStudents: vi.fn().mockResolvedValue([]),
      getAccessibleStudents: vi.fn().mockResolvedValue([]),
      getGrades: vi.fn().mockResolvedValue([]),
      getAcademicYears: vi.fn().mockResolvedValue([]),
    },
    feeGenerationApi: { preview: vi.fn(), execute: vi.fn(), getRuns: vi.fn().mockResolvedValue([]) },
    feeStatementApi: { getStatement: vi.fn() },
    excelImportsApi: { downloadTemplate: vi.fn(), preview: vi.fn(), confirm: vi.fn() },
    fineRulesApi: { list: vi.fn().mockResolvedValue([]), listInvoices: vi.fn().mockResolvedValue([]) },
  };
});

describe('Frontend Authentication & Route Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authApi as any).setMockSession(null, null);
  });

  afterEach(() => {
    (authApi as any).setMockSession(null, null);
  });

  it('redirects unauthenticated users to /login when attempting to access /', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Multi-Tenant SaaS • Sign in with your institutional credentials/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/admin@greenwood\.edu/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    });
  });

  it('validates required fields and email format before submission', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginView />
        </AuthProvider>
      </MemoryRouter>,
    );

    const submitBtn = screen.getByRole('button', { name: /Sign In to Dashboard/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Email address is required/i)).toBeInTheDocument();
      expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByPlaceholderText(/admin@greenwood\.edu/i);
    fireEvent.change(emailInput, { target: { value: 'invalid-email-format' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();
    });
  });

  it('toggles password visibility with show/hide button', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginView />
        </AuthProvider>
      </MemoryRouter>,
    );

    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /Show password/i });
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe('text');

    const hideBtn = screen.getByRole('button', { name: /Hide password/i });
    fireEvent.click(hideBtn);
    expect(passwordInput.type).toBe('password');
  });

  it('displays user-friendly error message on invalid credentials (401)', async () => {
    (authApi.login as any).mockRejectedValueOnce({
      response: {
        status: 401,
        data: { message: 'Invalid email or password' },
      },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginView />
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/admin@greenwood\.edu/i), {
      target: { value: 'admin@school.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'wrongpassword' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In to Dashboard/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid email or password credentials\. Please verify your details\./i),
      ).toBeInTheDocument();
    });
  });

  it('displays inactive account error when inactive message is returned', async () => {
    (authApi.login as any).mockRejectedValueOnce({
      response: {
        status: 401,
        data: { message: 'User account is inactive' },
      },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginView />
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/admin@greenwood\.edu/i), {
      target: { value: 'inactive@school.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In to Dashboard/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/This user account or school tenant is inactive or disabled\./i),
      ).toBeInTheDocument();
    });
  });

  it('successfully logs in, updates context, binds tenant, and displays authenticated dashboard', async () => {
    (authApi.login as any).mockResolvedValueOnce({
      accessToken: 'valid-jwt-token-123',
      tokenType: 'Bearer',
      expiresIn: 86400,
      user: {
        id: 'user-admin-1',
        email: 'bursar@springfield.edu',
        name: 'Margaret Vance',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'sch-uuid-1111',
        schoolName: 'Springfield High',
      },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/admin@greenwood\.edu/i), {
      target: { value: 'bursar@springfield.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'secretpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Sign In to Dashboard/i }));

    await waitFor(() => {
      expect(screen.getByText('Margaret Vance')).toBeInTheDocument();
      expect(screen.getByText('Springfield High')).toBeInTheDocument();
      expect(screen.getByText(/School Admin/i)).toBeInTheDocument();
      expect(setActiveSchoolId).toHaveBeenCalledWith('sch-uuid-1111');
    });
  });

  it('rehydrates authenticated session from storage via /auth/me on app load', async () => {
    (authApi as any).setMockSession('existing-jwt-token', {
      id: 'user-staff-1',
      email: 'staff@springfield.edu',
      name: 'John Staff',
      role: UserRole.FEE_STAFF,
      schoolId: 'sch-uuid-1111',
      schoolName: 'Springfield High',
    });

    (authApi.getProfile as any).mockResolvedValueOnce({
      id: 'user-staff-1',
      email: 'staff@springfield.edu',
      name: 'John Staff',
      role: UserRole.FEE_STAFF,
      schoolId: 'sch-uuid-1111',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('John Staff')).toBeInTheDocument();
      expect(screen.getByText('Fee Staff')).toBeInTheDocument();
      expect(authApi.getProfile).toHaveBeenCalled();
    });
  });

  it('purges storage and redirects to /login when session revalidation returns 401', async () => {
    (authApi as any).setMockSession('expired-jwt-token', {
      id: 'user-staff-1',
      name: 'Expired User',
    });

    (authApi.getProfile as any).mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Unauthorized' } },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalled();
      expect(screen.getByText(/Multi-Tenant SaaS • Sign in with your institutional credentials/i)).toBeInTheDocument();
    });
  });

  it('redirects already authenticated user away from /login to dashboard', async () => {
    (authApi as any).setMockSession('valid-token', {
      id: 'user-1',
      name: 'Alice Bursar',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'sch-1',
    });
    (authApi.getProfile as any).mockResolvedValueOnce({
      id: 'user-1',
      email: 'alice@test.edu',
      name: 'Alice Bursar',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'sch-1',
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Bursar')).toBeInTheDocument();
      expect(screen.queryByText(/Multi-Tenant SaaS • Sign in with your institutional credentials/i)).not.toBeInTheDocument();
    });
  });

  it('logs out user when Sign Out button in Header is clicked', async () => {
    (authApi as any).setMockSession('valid-token', {
      id: 'user-1',
      name: 'Alice Bursar',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'sch-1',
      schoolName: 'Demo Academy',
    });
    (authApi.getProfile as any).mockResolvedValueOnce({
      id: 'user-1',
      email: 'alice@test.edu',
      name: 'Alice Bursar',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'sch-1',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Bursar')).toBeInTheDocument();
    });

    const signOutBtn = screen.getByRole('button', { name: /Sign Out/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalled();
      expect(screen.getByText(/Multi-Tenant SaaS • Sign in with your institutional credentials/i)).toBeInTheDocument();
    });
  });

  describe('Role-Based Tab Access', () => {
    it('restricts STUDENT role to Overview and Fee Statements only', async () => {
      (authApi as any).setMockSession('student-token', {
        id: 'stud-user-1',
        name: 'Rohan Student',
        role: UserRole.STUDENT,
        schoolId: 'sch-1',
      });
      (authApi.getProfile as any).mockResolvedValueOnce({
        id: 'stud-user-1',
        email: 'rohan@student.edu',
        name: 'Rohan Student',
        role: UserRole.STUDENT,
        schoolId: 'sch-1',
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Rohan Student')).toBeInTheDocument();
      });

      // Allowed tabs exist in document
      expect(screen.getByRole('button', { name: /Overview & Health/i })).toBeInTheDocument();
      const feeStatementButtons = screen.getAllByRole('button', { name: /Fee Statements/i });
      expect(feeStatementButtons.length).toBeGreaterThanOrEqual(1);

      // Prohibited tabs must NOT be present in navigation
      expect(screen.queryByRole('button', { name: /^Fee Heads$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Fee Structures$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Student Allocations$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Monthly Invoicing/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Excel Imports/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Fine Rules/i })).not.toBeInTheDocument();
    });

    it('restricts FEE_STAFF from Fine Configuration tab', async () => {
      (authApi as any).setMockSession('staff-token', {
        id: 'staff-1',
        name: 'Staff Clerk',
        role: UserRole.FEE_STAFF,
        schoolId: 'sch-1',
      });
      (authApi.getProfile as any).mockResolvedValueOnce({
        id: 'staff-1',
        email: 'clerk@school.edu',
        name: 'Staff Clerk',
        role: UserRole.FEE_STAFF,
        schoolId: 'sch-1',
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Staff Clerk')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /^Fee Heads$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Fee Structures$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Student Allocations$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Monthly Invoicing/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Excel Imports/i })).toBeInTheDocument();
      // Fine Rules must not be shown to FEE_STAFF
      expect(screen.queryByRole('button', { name: /Fine Rules/i })).not.toBeInTheDocument();
    });

    it('allows PLATFORM_SUPER_ADMIN to manually specify target school context', async () => {
      (authApi as any).setMockSession('super-admin-token', {
        id: 'sa-1',
        name: 'Root Platform Admin',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      });
      (authApi.getProfile as any).mockResolvedValueOnce({
        id: 'sa-1',
        email: 'root@platform.internal',
        name: 'Root Platform Admin',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Root Platform Admin')).toBeInTheDocument();
        expect(screen.getByText(/Platform Super Admin/i)).toBeInTheDocument();
      });

      // Context input should exist
      const schoolInput = screen.getByLabelText(/Target School UUID/i);
      expect(schoolInput).toBeInTheDocument();

      fireEvent.change(schoolInput, { target: { value: 'sch-custom-uuid-9999' } });
      const setContextBtn = screen.getByRole('button', { name: /Set Context/i });
      fireEvent.click(setContextBtn);

      expect(setActiveSchoolId).toHaveBeenCalledWith('sch-custom-uuid-9999');
      expect(screen.getByRole('button', { name: /Clear \(sch-cust\.\.\.\)/i })).toBeInTheDocument();
    });
  });
});
