import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SchoolAdminsManagementView } from '../components/SchoolAdminsManagementView';
import { schoolsApi } from '../services/api';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    schoolsApi: {
      list: vi.fn(),
      listAdmins: vi.fn(),
      getAdminProfile: vi.fn(),
      createAdminForSchool: vi.fn(),
      suspendAdmin: vi.fn(),
      activateAdmin: vi.fn(),
      initiateAdminPasswordReset: vi.fn(),
    },
  };
});

describe('SchoolAdminsManagementView — Super Admin Account Management', () => {
  const mockAdmins = [
    {
      id: 'admin-uuid-1',
      name: 'Dr. Jane Smith',
      email: 'jane.smith@greenwood.internal',
      role: 'SCHOOL_ADMIN',
      status: 'ACTIVE' as const,
      createdAt: '2026-01-10T12:00:00Z',
      updatedAt: '2026-01-10T12:00:00Z',
      lastLoginAt: '2026-02-01T09:15:00Z',
      school: {
        id: 'school-uuid-1',
        name: 'Greenwood High School',
        code: 'GWH001',
        status: 'ACTIVE' as const,
      },
    },
    {
      id: 'admin-uuid-2',
      name: 'Mr. Robert Taylor',
      email: 'robert@riverdale.internal',
      role: 'SCHOOL_ADMIN',
      status: 'INACTIVE' as const,
      createdAt: '2026-01-15T12:00:00Z',
      updatedAt: '2026-01-15T12:00:00Z',
      lastLoginAt: null,
      school: {
        id: 'school-uuid-2',
        name: 'Riverdale Academy',
        code: 'RVD002',
        status: 'ACTIVE' as const,
      },
    },
  ];

  const mockSchools = [
    { id: 'school-uuid-1', name: 'Greenwood High School', code: 'GWH001', status: 'ACTIVE' as const },
    { id: 'school-uuid-2', name: 'Riverdale Academy', code: 'RVD002', status: 'ACTIVE' as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (schoolsApi.list as any).mockResolvedValue({ data: mockSchools });
    (schoolsApi.listAdmins as any).mockResolvedValue({
      data: mockAdmins,
      meta: { total: 2, page: 1, limit: 15, totalPages: 1 },
    });
  });

  it('renders administrator directory with accounts and details', async () => {
    render(<SchoolAdminsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('School Administrator Accounts')).toBeInTheDocument();
      expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('jane.smith@greenwood.internal')).toBeInTheDocument();
      expect(screen.getByText('Mr. Robert Taylor')).toBeInTheDocument();
      expect(screen.getByText('robert@riverdale.internal')).toBeInTheDocument();
    });
  });

  it('filters administrators by search keyword', async () => {
    render(<SchoolAdminsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by administrator name/i);
    fireEvent.change(searchInput, { target: { value: 'Greenwood' } });
    fireEvent.submit(searchInput.closest('form')!);

    await waitFor(() => {
      expect(schoolsApi.listAdmins).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Greenwood' }),
      );
    });
  });

  it('opens administrator profile drawer and displays security details', async () => {
    (schoolsApi.getAdminProfile as any).mockResolvedValue({
      ...mockAdmins[0],
      auditHistory: [
        {
          id: 'log-1',
          eventType: 'LOGIN_SUCCESS',
          details: { ip: '127.0.0.1' },
          createdAt: '2026-02-01T09:15:00Z',
        },
      ],
    });

    render(<SchoolAdminsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
    });

    const profileButtons = screen.getAllByRole('button', { name: /profile/i });
    fireEvent.click(profileButtons[0]);

    await waitFor(() => {
      expect(schoolsApi.getAdminProfile).toHaveBeenCalledWith('admin-uuid-1');
      expect(screen.getByText('Administrator Profile & Security Details')).toBeInTheDocument();
      expect(screen.getByText('LOGIN_SUCCESS')).toBeInTheDocument();
    });
  });

  it('opens suspension modal and submits suspension with mandatory reason', async () => {
    (schoolsApi.suspendAdmin as any).mockResolvedValue({
      message: 'Administrator account suspended successfully. All active sessions have been revoked.',
      user: { ...mockAdmins[0], status: 'INACTIVE' },
    });

    render(<SchoolAdminsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
    });

    const suspendButton = screen.getByTitle('Suspend Administrator Account');
    fireEvent.click(suspendButton);

    expect(screen.getByText('Suspend Administrator Account')).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/specify the security or institutional reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Policy non-compliance investigation' } });

    const confirmButton = screen.getByRole('button', { name: /confirm suspension/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(schoolsApi.suspendAdmin).toHaveBeenCalledWith(
        'admin-uuid-1',
        'Policy non-compliance investigation',
      );
      expect(screen.getByText(/all active sessions have been revoked/i)).toBeInTheDocument();
    });
  });

  it('initiates secure password reset with user confirmation', async () => {
    (schoolsApi.initiateAdminPasswordReset as any).mockResolvedValue({
      success: true,
      message: 'Password reset link has been dispatched to the administrator registered email',
    });

    render(<SchoolAdminsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
    });

    const resetButtons = screen.getAllByTitle('Initiate Secure Password Reset');
    fireEvent.click(resetButtons[0]);

    expect(screen.getByText(/Are you sure you want to dispatch a password reset link/i)).toBeInTheDocument();

    const confirmDispatchButton = screen.getByRole('button', { name: /dispatch reset email/i });
    fireEvent.click(confirmDispatchButton);

    await waitFor(() => {
      expect(schoolsApi.initiateAdminPasswordReset).toHaveBeenCalledWith('admin-uuid-1');
      expect(
        screen.getByText(/password reset link has been dispatched/i),
      ).toBeInTheDocument();
    });
  });
});
