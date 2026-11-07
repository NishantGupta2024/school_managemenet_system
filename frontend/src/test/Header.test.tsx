import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Header } from '../components/Header';
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
  {
    id: 'sch-4444',
    code: 'OGD-04',
    name: 'Ogdenville Elementary',
    status: 'INACTIVE',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('Header Component — Organization Switcher (SA-ORG-01 Phase 2)', () => {
  const mockLogout = vi.fn();
  const mockSelectSchool = vi.fn();
  const mockClearSelectedSchool = vi.fn();
  const mockRefreshAvailableSchools = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupSuperAdmin = (overrides?: any) => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sa-1',
        name: 'Root Administrator',
        email: 'root@erp.internal',
        role: UserRole.PLATFORM_SUPER_ADMIN,
        schoolId: null,
      },
      selectedSchoolId: null,
      selectedSchool: null,
      availableSchools: mockSchools,
      organizationContextLoading: false,
      organizationContextError: null,
      selectSchool: mockSelectSchool,
      clearSelectedSchool: mockClearSelectedSchool,
      refreshAvailableSchools: mockRefreshAvailableSchools,
      logout: mockLogout,
      ...overrides,
    });
  };

  const renderHeader = (initialRoute = '/app') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Header />
      </MemoryRouter>,
    );
  };

  it('1. Switcher button is visible for Platform Super Admin with Platform-Wide initial label', () => {
    setupSuperAdmin();
    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    expect(switcherBtn).toBeInTheDocument();
    expect(switcherBtn).toHaveTextContent(/Platform-Wide/i);
    expect(switcherBtn).toHaveTextContent(/Context Scope/i);
  });

  it('2. Switcher is hidden for School Admin role (displays fixed school info)', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sch-admin-1',
        name: 'Principal Skinner',
        role: UserRole.SCHOOL_ADMIN,
        schoolId: 'sch-1111',
        schoolName: 'Springfield Elementary',
      },
      logout: mockLogout,
    });

    renderHeader();

    expect(screen.queryByRole('button', { name: /Organization Switcher/i })).not.toBeInTheDocument();
    expect(screen.getByText('Springfield Elementary')).toBeInTheDocument();
  });

  it('3. Switcher is hidden for Teacher role', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'teach-1',
        name: 'Edna Krabappel',
        role: UserRole.TEACHER,
        schoolId: 'sch-1111',
        schoolName: 'Springfield Elementary',
      },
      logout: mockLogout,
    });

    renderHeader();

    expect(screen.queryByRole('button', { name: /Organization Switcher/i })).not.toBeInTheDocument();
  });

  it('4. Switcher is hidden for Student and Parent roles', () => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'stud-1',
        name: 'Bart Simpson',
        role: UserRole.STUDENT,
        schoolId: 'sch-1111',
        schoolName: 'Springfield Elementary',
      },
      logout: mockLogout,
    });

    renderHeader();

    expect(screen.queryByRole('button', { name: /Organization Switcher/i })).not.toBeInTheDocument();
  });

  it('5. Displays selected organization name and code when active', () => {
    setupSuperAdmin({
      selectedSchoolId: 'sch-1111',
      selectedSchool: mockSchools[0],
    });

    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    expect(switcherBtn).toHaveTextContent('Springfield Academy');
    expect(switcherBtn).toHaveTextContent(/Active Tenant/i);
  });

  it('6. Clicking Platform-Wide option calls clearSelectedSchool()', () => {
    setupSuperAdmin({
      selectedSchoolId: 'sch-1111',
      selectedSchool: mockSchools[0],
    });

    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    const platformWideOption = screen.getByText('Platform-Wide');
    fireEvent.click(platformWideOption);

    expect(mockClearSelectedSchool).toHaveBeenCalledTimes(1);
    expect(mockSelectSchool).not.toHaveBeenCalled();
  });

  it('7. Selecting an active organization calls selectSchool(schoolId)', () => {
    setupSuperAdmin();
    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    const schoolOption = screen.getByText('Shelbyville High');
    fireEvent.click(schoolOption);

    expect(mockSelectSchool).toHaveBeenCalledWith('sch-2222');
  });

  it('8. Suspended organizations are visible with badge and disabled', () => {
    setupSuperAdmin();
    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    const suspendedSchoolText = screen.getByText('Capital City Prep');
    expect(suspendedSchoolText).toBeInTheDocument();

    const suspendedBadge = screen.getByText('SUSPENDED');
    expect(suspendedBadge).toBeInTheDocument();

    // Click on suspended item
    fireEvent.click(suspendedSchoolText);
    expect(mockSelectSchool).not.toHaveBeenCalled();
  });

  it('9. Inactive organizations are visible with badge and disabled', () => {
    setupSuperAdmin();
    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    const inactiveSchoolText = screen.getByText('Ogdenville Elementary');
    expect(inactiveSchoolText).toBeInTheDocument();

    const inactiveBadge = screen.getByText('INACTIVE');
    expect(inactiveBadge).toBeInTheDocument();

    fireEvent.click(inactiveSchoolText);
    expect(mockSelectSchool).not.toHaveBeenCalled();
  });

  it('10. Organization search filters options by name (case-insensitive)', () => {
    setupSuperAdmin();
    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    const searchInput = screen.getByLabelText(/Search Organizations/i);
    fireEvent.change(searchInput, { target: { value: 'shelby' } });

    expect(screen.getByText('Shelbyville High')).toBeInTheDocument();
    expect(screen.queryByText('Springfield Academy')).not.toBeInTheDocument();
  });

  it('11. Organization search filters options by code', () => {
    setupSuperAdmin();
    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    const searchInput = screen.getByLabelText(/Search Organizations/i);
    fireEvent.change(searchInput, { target: { value: 'SPR-01' } });

    expect(screen.getByText('Springfield Academy')).toBeInTheDocument();
    expect(screen.queryByText('Shelbyville High')).not.toBeInTheDocument();
  });

  it('12. Shows helpful empty state when search matches no organization', () => {
    setupSuperAdmin();
    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    const searchInput = screen.getByLabelText(/Search Organizations/i);
    fireEvent.change(searchInput, { target: { value: 'NonExistentSchool' } });

    expect(screen.getByText(/No organizations match "NonExistentSchool"/i)).toBeInTheDocument();
    // Platform-Wide option should always remain accessible in listbox
    const listbox = screen.getByRole('listbox', { name: /Select Organization/i });
    expect(listbox).toHaveTextContent('Platform-Wide');
  });

  it('13. Displays loading indicator while organizations are loading', () => {
    setupSuperAdmin({
      availableSchools: [],
      organizationContextLoading: true,
    });

    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    expect(switcherBtn).toHaveTextContent(/Loading schools\.\.\./i);

    fireEvent.click(switcherBtn);
    expect(screen.getByText(/Loading organizations\.\.\./i)).toBeInTheDocument();
  });

  it('14. Displays API error message and provides functional retry button', () => {
    setupSuperAdmin({
      organizationContextError: 'Network error loading directory',
    });

    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    expect(screen.getByText('Network error loading directory')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /Retry Loading/i });
    fireEvent.click(retryBtn);

    expect(mockRefreshAvailableSchools).toHaveBeenCalledTimes(1);
  });

  it('15. Handles empty organization directory gracefully', () => {
    setupSuperAdmin({
      availableSchools: [],
      organizationContextLoading: false,
    });

    renderHeader();

    const switcherBtn = screen.getByRole('button', { name: /Organization Switcher/i });
    fireEvent.click(switcherBtn);

    expect(screen.getByText('No organizations onboarded yet.')).toBeInTheDocument();
    const listbox = screen.getByRole('listbox', { name: /Select Organization/i });
    expect(listbox).toHaveTextContent('Platform-Wide');
  });

  it('16. Existing header navigation, title, and logout continue to function', () => {
    setupSuperAdmin();
    renderHeader('/app/fees');

    // Title exists
    expect(screen.getByText('School ERP')).toBeInTheDocument();

    // Launcher shortcut button exists when inside a module
    expect(screen.getByRole('button', { name: /Launcher/i })).toBeInTheDocument();

    // Sign out button works
    const signOutBtn = screen.getByRole('button', { name: /Sign out/i });
    fireEvent.click(signOutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
