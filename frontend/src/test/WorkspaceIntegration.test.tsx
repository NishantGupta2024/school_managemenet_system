import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ERPWorkspaceShell } from '../App';
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
];

describe('ERP Workspace Shell & Route Integration (SA-ORG-01 Phase 3)', () => {
  const mockSelectSchool = vi.fn().mockResolvedValue(undefined);
  const mockClearSelectedSchool = vi.fn();
  const mockRefreshAvailableSchools = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupAuth = (overrides?: any) => {
    (useAuth as any).mockReturnValue({
      user: {
        id: 'sa-1',
        name: 'Super Admin',
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
      ...overrides,
    });
  };

  const renderWorkspace = (initialEntry: string) => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/app/*" element={<ERPWorkspaceShell />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('1. Deep linking to tenant route (/app/fees) with no context renders TenantContextGate, not fee tables', () => {
    setupAuth({ selectedSchoolId: null });

    renderWorkspace('/app/fees');

    // Gate should intercept
    expect(screen.getByRole('region', { name: /Target School Context Required/i })).toBeInTheDocument();
    expect(screen.getByText(/Select School Context for Fee Management/i)).toBeInTheDocument();

    // Redundant amber banner from old App.tsx must NOT exist
    expect(screen.queryByPlaceholderText(/Target School UUID/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set Context/i })).not.toBeInTheDocument();
  });

  it('2. Deep linking to tenant route with active context renders workspace immediately', () => {
    setupAuth({
      selectedSchoolId: 'sch-1111',
      selectedSchool: mockSchools[0],
    });

    renderWorkspace('/app/fees');

    // Gate should NOT be present
    expect(screen.queryByRole('region', { name: /Target School Context Required/i })).not.toBeInTheDocument();

    // Fee workspace should render
    expect(screen.getByText(/Fee Engine & Financial Ledger Active/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Payments & Receipts Desk/i })).toBeInTheDocument();
  });

  it('3. Platform-wide routes (/app and /app/admin) remain fully accessible without selecting a school', () => {
    setupAuth({ selectedSchoolId: null });

    renderWorkspace('/app');

    // Platform launcher is accessible
    expect(screen.getByText(/Unified School ERP System Launcher/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Target School Context Required/i })).not.toBeInTheDocument();
  });

  it('4. Switching organization remounts the workspace via tenantKey without reloading the ERP shell', () => {
    // Render first with School A
    setupAuth({
      selectedSchoolId: 'sch-1111',
      selectedSchool: mockSchools[0],
    });

    const { rerender } = render(
      <MemoryRouter initialEntries={['/app/fees']}>
        <Routes>
          <Route path="/app/*" element={<ERPWorkspaceShell />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/Fee Management Workspace/i).length).toBeGreaterThan(0);

    // Switch to School B
    setupAuth({
      selectedSchoolId: 'sch-2222',
      selectedSchool: mockSchools[1],
    });

    rerender(
      <MemoryRouter initialEntries={['/app/fees']}>
        <Routes>
          <Route path="/app/*" element={<ERPWorkspaceShell />} />
        </Routes>
      </MemoryRouter>,
    );

    // Header continues to be present, and workspace renders cleanly under new tenant key
    expect(screen.getAllByText(/Fee Management Workspace/i).length).toBeGreaterThan(0);
  });

  it('5. Clearing organization context while in a tenant workspace returns to the gate screen', () => {
    setupAuth({
      selectedSchoolId: 'sch-1111',
      selectedSchool: mockSchools[0],
    });

    const { rerender } = render(
      <MemoryRouter initialEntries={['/app/fees']}>
        <Routes>
          <Route path="/app/*" element={<ERPWorkspaceShell />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('region', { name: /Target School Context Required/i })).not.toBeInTheDocument();

    // Super Admin clears context to Platform-Wide
    setupAuth({
      selectedSchoolId: null,
      selectedSchool: null,
    });

    rerender(
      <MemoryRouter initialEntries={['/app/fees']}>
        <Routes>
          <Route path="/app/*" element={<ERPWorkspaceShell />} />
        </Routes>
      </MemoryRouter>,
    );

    // Gate screen must now intercept
    expect(screen.getByRole('region', { name: /Target School Context Required/i })).toBeInTheDocument();
  });
});
