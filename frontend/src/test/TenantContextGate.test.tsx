import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TenantContextGate } from '../components/TenantContextGate';
import { useAuth } from '../context/AuthContext';
import { UserRole, SchoolRecord } from '../services/api';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockSchools: SchoolRecord[] = [
  {
    id: 'sch-1111',
    code: 'SPR-01',
    name: 'Springfield Academy',
    status: 'ACTIVE',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sch-2222',
    code: 'SHB-02',
    name: 'Shelbyville High',
    status: 'ACTIVE',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sch-3333',
    code: 'CAP-03',
    name: 'Capital City Prep',
    status: 'SUSPENDED',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('TenantContextGate Component (SA-ORG-01 Phase 3)', () => {
  const mockSelectSchool = vi.fn().mockResolvedValue(undefined);
  const mockRefreshAvailableSchools = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderGatedContent = (
    moduleName = 'Fee Management',
    moduleDescription = 'Fee ledgers and invoicing',
  ) => {
    return render(
      <MemoryRouter initialEntries={['/app/fees']}>
        <TenantContextGate moduleName={moduleName} moduleDescription={moduleDescription}>
          <div data-testid="protected-workspace-content">
            Protected {moduleName} Content Loaded Successfully
          </div>
        </TenantContextGate>
      </MemoryRouter>,
    );
  };

  it('1. Super Admin with no organization sees selection gate screen, NOT protected content', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sa-1',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      },
      selectedSchoolId: null,
      selectedSchool: null,
      availableSchools: mockSchools,
      organizationContextLoading: false,
      organizationContextError: null,
      selectSchool: mockSelectSchool,
      refreshAvailableSchools: mockRefreshAvailableSchools,
    });

    renderGatedContent('Fee Management');

    // Gate screen is rendered
    expect(screen.getByRole('region', { name: /Target School Context Required/i })).toBeInTheDocument();
    expect(screen.getByText(/Select School Context for Fee Management/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select School for Fee Management/i)).toBeInTheDocument();

    // Protected workspace content is NOT mounted
    expect(screen.queryByTestId('protected-workspace-content')).not.toBeInTheDocument();
  });

  it('2. Super Admin with a valid active organization passes through and sees protected workspace', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sa-1',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      },
      selectedSchoolId: 'sch-1111',
      selectedSchool: mockSchools[0],
      availableSchools: mockSchools,
      organizationContextLoading: false,
      organizationContextError: null,
      selectSchool: mockSelectSchool,
    });

    renderGatedContent('Fee Management');

    // Gate screen is NOT displayed
    expect(screen.queryByRole('region', { name: /Target School Context Required/i })).not.toBeInTheDocument();

    // Protected content is rendered
    expect(screen.getByTestId('protected-workspace-content')).toBeInTheDocument();
    expect(screen.getByText(/Protected Fee Management Content Loaded Successfully/i)).toBeInTheDocument();
  });

  it('3. Loading state is handled cleanly while organization directory loads', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sa-1',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      },
      selectedSchoolId: null,
      selectedSchool: null,
      availableSchools: [],
      organizationContextLoading: true,
      organizationContextError: null,
    });

    renderGatedContent('Student Directory');

    expect(screen.getByText(/Loading Organization Directory\.\.\./i)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-workspace-content')).not.toBeInTheDocument();
  });

  it('4. Organization context error is displayed with a functional Retry action', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sa-1',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      },
      selectedSchoolId: null,
      selectedSchool: null,
      availableSchools: mockSchools,
      organizationContextLoading: false,
      organizationContextError: 'Network error connecting to school service',
      refreshAvailableSchools: mockRefreshAvailableSchools,
    });

    renderGatedContent('Attendance Management');

    expect(screen.getByText('Network error connecting to school service')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryBtn);

    expect(mockRefreshAvailableSchools).toHaveBeenCalledTimes(1);
  });

  it('5. School Admin role bypasses the gate automatically (tenant is server-authoritative)', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sch-admin-1',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'sch-1111',
      },
      selectedSchoolId: null, // Super Admin selector is null for normal users
    });

    renderGatedContent('Fee Management');

    expect(screen.queryByRole('region', { name: /Target School Context Required/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('protected-workspace-content')).toBeInTheDocument();
  });

  it('6. Teacher role bypasses the gate automatically', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'teacher-1',
        role: UserRole.TEACHER,
        schoolId: 'sch-1111',
      },
      selectedSchoolId: null,
    });

    renderGatedContent('Examinations');

    expect(screen.queryByRole('region', { name: /Target School Context Required/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('protected-workspace-content')).toBeInTheDocument();
  });

  it('7. Student and Parent roles bypass the gate automatically', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'student-1',
        role: UserRole.STUDENT,
        schoolId: 'sch-1111',
      },
      selectedSchoolId: null,
    });

    renderGatedContent('Student Statements');

    expect(screen.queryByRole('region', { name: /Target School Context Required/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('protected-workspace-content')).toBeInTheDocument();
  });

  it('8. Selecting a school from the gate dropdown calls selectSchool()', async () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sa-1',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      },
      selectedSchoolId: null,
      selectedSchool: null,
      availableSchools: mockSchools,
      organizationContextLoading: false,
      organizationContextError: null,
      selectSchool: mockSelectSchool,
    });

    renderGatedContent('Fee Management');

    const selectDropdown = screen.getByLabelText(/Select School for Fee Management/i);
    fireEvent.change(selectDropdown, { target: { value: 'sch-2222' } });

    expect(mockSelectSchool).toHaveBeenCalledWith('sch-2222');
  });

  it('9. Suspended schools are disabled in the gate selection dropdown', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sa-1',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      },
      selectedSchoolId: null,
      selectedSchool: null,
      availableSchools: mockSchools,
      organizationContextLoading: false,
      organizationContextError: null,
      selectSchool: mockSelectSchool,
    });

    renderGatedContent('Fee Management');

    const suspendedOption = screen.getByRole('option', {
      name: /Capital City Prep \(CAP-03\) \[SUSPENDED\]/i,
    }) as HTMLOptionElement;

    expect(suspendedOption).toBeInTheDocument();
    expect(suspendedOption.disabled).toBe(true);
  });
});
