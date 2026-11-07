import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth, SUPER_ADMIN_ACTIVE_SCHOOL_KEY } from '../context/AuthContext';
import {
  authApi,
  schoolsApi,
  UserRole,
  setActiveSchoolId,
  getActiveSchoolId,
  SchoolRecord,
} from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  let mockToken: string | null = null;
  let mockUser: any = null;
  let activeSchoolId: string | null = null;

  return {
    ...actual,
    setActiveSchoolId: vi.fn((id: string | null) => {
      activeSchoolId = id;
    }),
    getActiveSchoolId: vi.fn(() => activeSchoolId),
    authApi: {
      ...actual.authApi,
      getToken: vi.fn(() => mockToken),
      getUser: vi.fn(() => mockUser),
      getProfile: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(() => {
        mockToken = null;
        mockUser = null;
      }),
      setMockSession: (token: string | null, user: any) => {
        mockToken = token;
        mockUser = user;
      },
    },
    schoolsApi: {
      ...actual.schoolsApi,
      list: vi.fn(),
      get: vi.fn(),
    },
  };
});

const mockSchools: SchoolRecord[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'SCH-01',
    name: 'Springfield Academy',
    status: 'ACTIVE',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    code: 'SCH-02',
    name: 'Shelbyville High',
    status: 'ACTIVE',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    code: 'SCH-03',
    name: 'Capital City Prep',
    status: 'SUSPENDED',
    country: 'IN',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('SA-ORG-01 Phase 1 — AuthContext Organization State & Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    (schoolsApi.list as any).mockResolvedValue({
      data: mockSchools,
      meta: { total: mockSchools.length, page: 1, limit: 100, totalPages: 1 },
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it('1. Platform Super Admin initializes with no selected organization by default', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user?.role).toBe(UserRole.PLATFORM_SUPER_ADMIN);
    expect(result.current.selectedSchoolId).toBeNull();
    expect(result.current.selectedSchool).toBeNull();
    expect(setActiveSchoolId).toHaveBeenCalledWith(null);
    expect(getActiveSchoolId()).toBeNull();
  });

  it('2. Having one or more available organizations does NOT trigger automatic selection', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    (schoolsApi.list as any).mockResolvedValue({
      data: [mockSchools[0]],
      meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.availableSchools).toHaveLength(1);
    });

    expect(result.current.selectedSchoolId).toBeNull();
    expect(result.current.selectedSchool).toBeNull();
    expect(getActiveSchoolId()).toBeNull();
  });

  it('3. Multiple organizations load correctly into availableSchools', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(3);
    });

    expect(result.current.availableSchools[0].code).toBe('SCH-01');
    expect(result.current.availableSchools[1].code).toBe('SCH-02');
  });

  it('4. Valid sessionStorage selection is restored after backend validation', async () => {
    sessionStorage.setItem(
      SUPER_ADMIN_ACTIVE_SCHOOL_KEY,
      '22222222-2222-2222-2222-222222222222',
    );

    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.selectedSchoolId).toBe('22222222-2222-2222-2222-222222222222');
    });

    expect(result.current.selectedSchool?.name).toBe('Shelbyville High');
    expect(setActiveSchoolId).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
    expect(getActiveSchoolId()).toBe('22222222-2222-2222-2222-222222222222');
    expect(sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY)).toBe(
      '22222222-2222-2222-2222-222222222222',
    );
  });

  it('5. Invalid stored organization ID is cleared from storage and context', async () => {
    sessionStorage.setItem(
      SUPER_ADMIN_ACTIVE_SCHOOL_KEY,
      '99999999-9999-9999-9999-999999999999',
    );

    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(3);
    });

    expect(result.current.selectedSchoolId).toBeNull();
    expect(result.current.selectedSchool).toBeNull();
    expect(getActiveSchoolId()).toBeNull();
    expect(sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY)).toBeNull();
  });

  it('6. Suspended or inactive organization cannot be selected', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(3);
    });

    let thrownError: any = null;
    await act(async () => {
      try {
        await result.current.selectSchool('33333333-3333-3333-3333-333333333333');
      } catch (err: any) {
        thrownError = err;
      }
    });

    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toContain('is SUSPENDED and cannot be selected');
    expect(result.current.selectedSchoolId).toBeNull();
    expect(getActiveSchoolId()).toBeNull();
    expect(sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY)).toBeNull();
  });

  it('7. selectSchool() updates central state, header, and sessionStorage', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(3);
    });

    await act(async () => {
      await result.current.selectSchool('11111111-1111-1111-1111-111111111111');
    });

    expect(result.current.selectedSchoolId).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.current.selectedSchool?.name).toBe('Springfield Academy');
    expect(setActiveSchoolId).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    expect(getActiveSchoolId()).toBe('11111111-1111-1111-1111-111111111111');
    expect(sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY)).toBe(
      '11111111-1111-1111-1111-111111111111',
    );
  });

  it('8. clearSelectedSchool() clears state, header, and persistence', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(3);
    });

    await act(async () => {
      await result.current.selectSchool('11111111-1111-1111-1111-111111111111');
    });
    expect(result.current.selectedSchoolId).toBe('11111111-1111-1111-1111-111111111111');

    act(() => {
      result.current.clearSelectedSchool();
    });

    expect(result.current.selectedSchoolId).toBeNull();
    expect(result.current.selectedSchool).toBeNull();
    expect(setActiveSchoolId).toHaveBeenCalledWith(null);
    expect(getActiveSchoolId()).toBeNull();
    expect(sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY)).toBeNull();
  });

  it('9. logout() clears user, token, school context, header, and sessionStorage', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(3);
    });

    await act(async () => {
      await result.current.selectSchool('11111111-1111-1111-1111-111111111111');
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.selectedSchoolId).toBeNull();
    expect(result.current.selectedSchool).toBeNull();
    expect(result.current.availableSchools).toHaveLength(0);
    expect(sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY)).toBeNull();
    expect(setActiveSchoolId).toHaveBeenCalledWith(null);
    expect(getActiveSchoolId()).toBeNull();
  });

  it('10. Other user roles (SCHOOL_ADMIN) retain their existing fixed school context behavior', async () => {
    (authApi.getToken as any).mockReturnValue('valid-school-admin-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'school-admin-1',
      email: 'admin@school.internal',
      name: 'School Principal',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: '11111111-1111-1111-1111-111111111111',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(setActiveSchoolId).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
    expect(getActiveSchoolId()).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.current.availableSchools).toHaveLength(0);
    expect(result.current.selectedSchoolId).toBeNull();
    expect(sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY)).toBeNull();
  });

  it('11. Organization-list API failure is handled safely without crashing auth', async () => {
    (schoolsApi.list as any).mockRejectedValue(new Error('Network error loading schools'));

    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.availableSchools).toHaveLength(0);
    expect(result.current.organizationContextError).toContain('Network error loading schools');
  });

  it('12. Switching from School A to School B updates state, header, and storage cleanly', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(3);
    });

    // Select School A
    await act(async () => {
      await result.current.selectSchool('11111111-1111-1111-1111-111111111111');
    });
    expect(result.current.selectedSchoolId).toBe('11111111-1111-1111-1111-111111111111');
    expect(getActiveSchoolId()).toBe('11111111-1111-1111-1111-111111111111');

    // Switch to School B
    await act(async () => {
      await result.current.selectSchool('22222222-2222-2222-2222-222222222222');
    });
    expect(result.current.selectedSchoolId).toBe('22222222-2222-2222-2222-222222222222');
    expect(result.current.selectedSchool?.name).toBe('Shelbyville High');
    expect(setActiveSchoolId).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
    expect(getActiveSchoolId()).toBe('22222222-2222-2222-2222-222222222222');
    expect(sessionStorage.getItem(SUPER_ADMIN_ACTIVE_SCHOOL_KEY)).toBe(
      '22222222-2222-2222-2222-222222222222',
    );
  });

  it('13. Multi-page pagination loads schools beyond first page into availableSchools', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    // Mock 2 pages of schools
    (schoolsApi.list as any).mockImplementation(({ page }: { page?: number }) => {
      if (page === 2) {
        return Promise.resolve({
          data: [
            {
              id: '44444444-4444-4444-4444-444444444444',
              code: 'SCH-04',
              name: 'Page 2 School',
              status: 'ACTIVE',
              country: 'IN',
              currency: 'INR',
              timezone: 'Asia/Kolkata',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          meta: { total: 4, page: 2, limit: 3, totalPages: 2 },
        });
      }
      return Promise.resolve({
        data: mockSchools,
        meta: { total: 4, page: 1, limit: 3, totalPages: 2 },
      });
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(4);
    });

    expect(result.current.availableSchools.some((s) => s.id === '44444444-4444-4444-4444-444444444444')).toBe(true);
  });

  it('14. Context restoration validates organization beyond page 1 correctly', async () => {
    sessionStorage.setItem(
      SUPER_ADMIN_ACTIVE_SCHOOL_KEY,
      '44444444-4444-4444-4444-444444444444', // Stored school on page 2
    );

    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    (schoolsApi.list as any).mockImplementation(({ page }: { page?: number }) => {
      if (page === 2) {
        return Promise.resolve({
          data: [
            {
              id: '44444444-4444-4444-4444-444444444444',
              code: 'SCH-04',
              name: 'Page 2 School',
              status: 'ACTIVE',
              country: 'IN',
              currency: 'INR',
              timezone: 'Asia/Kolkata',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          meta: { total: 4, page: 2, limit: 3, totalPages: 2 },
        });
      }
      return Promise.resolve({
        data: mockSchools,
        meta: { total: 4, page: 1, limit: 3, totalPages: 2 },
      });
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.selectedSchoolId).toBe('44444444-4444-4444-4444-444444444444');
    });

    expect(result.current.selectedSchool?.name).toBe('Page 2 School');
    expect(getActiveSchoolId()).toBe('44444444-4444-4444-4444-444444444444');
  });

  it('15. Asynchronous safety: slower out-of-order organization refresh cannot overwrite newer state', async () => {
    (authApi.getToken as any).mockReturnValue('valid-sa-token');
    (authApi.getProfile as any).mockResolvedValue({
      id: 'sa-user-1',
      email: 'superadmin@erp.internal',
      name: 'Super Admin',
      role: UserRole.PLATFORM_SUPER_ADMIN,
      schoolId: null,
    });

    let resolveSlowFetch: (value: any) => void;
    const slowFetchPromise = new Promise((resolve) => {
      resolveSlowFetch = resolve;
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.availableSchools).toHaveLength(3);
    });

    // Super Admin selects School 2
    await act(async () => {
      await result.current.selectSchool('22222222-2222-2222-2222-222222222222');
    });
    expect(result.current.selectedSchoolId).toBe('22222222-2222-2222-2222-222222222222');

    // Trigger refresh that will hang
    (schoolsApi.list as any).mockReturnValueOnce(slowFetchPromise);
    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = result.current.refreshAvailableSchools();
    });

    // Meanwhile, user switches to School 1
    await act(async () => {
      await result.current.selectSchool('11111111-1111-1111-1111-111111111111');
    });
    expect(result.current.selectedSchoolId).toBe('11111111-1111-1111-1111-111111111111');

    // Trigger another fast refresh that finishes
    (schoolsApi.list as any).mockResolvedValueOnce({
      data: mockSchools,
      meta: { total: 3, page: 1, limit: 100, totalPages: 1 },
    });
    await act(async () => {
      await result.current.refreshAvailableSchools();
    });

    // Now resolve the old slow refresh with an empty list
    await act(async () => {
      resolveSlowFetch!({ data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } });
      await refreshPromise!;
    });

    // Stale slow refresh must NOT have overwritten newer selection
    expect(result.current.selectedSchoolId).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.current.selectedSchool?.name).toBe('Springfield Academy');
    expect(getActiveSchoolId()).toBe('11111111-1111-1111-1111-111111111111');
  });
});
