import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SchoolsView } from '../components/SchoolsView';
import { schoolsApi, setActiveSchoolId } from '../services/api';
import { AuthProvider } from '../context/AuthContext';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    setActiveSchoolId: vi.fn(),
    authApi: {
      ...actual.authApi,
      getToken: vi.fn().mockReturnValue('mock-jwt-token'),
      getUser: vi.fn().mockReturnValue({
        id: 'super-admin-id',
        email: 'superadmin@fee-system.internal',
        name: 'Super Admin',
        role: 'PLATFORM_SUPER_ADMIN',
        schoolId: null,
      }),
      getProfile: vi.fn().mockResolvedValue({
        id: 'super-admin-id',
        email: 'superadmin@fee-system.internal',
        name: 'Super Admin',
        role: 'PLATFORM_SUPER_ADMIN',
        schoolId: null,
      }),
    },
    schoolsApi: {
      list: vi.fn(),
      get: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      provisionAdmin: vi.fn(),
    },
  };
});

const mockSchools = [
  {
    id: 'school-uuid-1',
    code: 'SCH-001',
    name: 'Greenwood International Academy',
    address: '123 Forest Hill Rd',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'IND',
    phone: '+91 80 2345 6789',
    email: 'info@greenwood.edu',
    website: 'https://greenwood.edu',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    status: 'ACTIVE' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    _count: {
      users: 15,
      students: 450,
      feeStructures: 8,
      invoices: 1200,
      payments: 980,
    },
  },
  {
    id: 'school-uuid-2',
    code: 'SCH-002',
    name: 'Oakridge Global School',
    address: '456 Valley Park',
    city: 'Hyderabad',
    state: 'Telangana',
    postalCode: '500081',
    country: 'IND',
    phone: '+91 40 8765 4321',
    email: 'admin@oakridge.edu',
    website: 'https://oakridge.edu',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    status: 'SUSPENDED' as const,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-15T00:00:00.000Z',
    _count: {
      users: 5,
      students: 120,
      feeStructures: 2,
      invoices: 200,
      payments: 150,
    },
  },
];

describe('SchoolsView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (schoolsApi.list as any).mockResolvedValue({
      data: mockSchools,
      meta: {
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    });
  });

  const renderComponent = () =>
    render(
      <AuthProvider>
        <SchoolsView />
      </AuthProvider>,
    );

  it('renders directory heading, statistics, and school table', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Schools Directory & Onboarding')).toBeInTheDocument();
      expect(screen.getByText('Greenwood International Academy')).toBeInTheDocument();
      expect(screen.getByText('Oakridge Global School')).toBeInTheDocument();
      expect(screen.getByText('SCH-001')).toBeInTheDocument();
      expect(screen.getByText('SCH-002')).toBeInTheDocument();
    });

    // Check statistics cards
    expect(screen.getByText('Total Schools')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Suspended').length).toBeGreaterThanOrEqual(1);
  });

  it('filters schools by search text on form submit', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Greenwood International Academy')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by school name, code or city/i);
    fireEvent.change(searchInput, { target: { value: 'Greenwood' } });
    fireEvent.submit(searchInput.closest('form')!);

    await waitFor(() => {
      expect(schoolsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Greenwood',
        }),
      );
    });
  });

  it('filters schools by status dropdown', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Greenwood International Academy')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText(/Filter by Status/i);
    fireEvent.change(statusSelect, { target: { value: 'ACTIVE' } });

    await waitFor(() => {
      expect(schoolsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ACTIVE',
        }),
      );
    });
  });

  it('opens Onboard New School modal and submits successfully', async () => {
    (schoolsApi.create as any).mockResolvedValueOnce({
      id: 'school-uuid-3',
      code: 'SCH-003',
      name: 'St. Xavier High School',
      status: 'ACTIVE',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Schools Directory & Onboarding')).toBeInTheDocument();
    });

    const onboardBtn = screen.getByRole('button', { name: /Onboard School/i });
    fireEvent.click(onboardBtn);

    expect(screen.getByText('Onboard New School Tenant')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText(/School Code/i), { target: { value: 'SCH003' } });
    fireEvent.change(screen.getByLabelText(/School Name/i), { target: { value: 'St. Xavier High School' } });
    fireEvent.change(screen.getByLabelText(/Contact Email/i), { target: { value: 'contact@stxavier.edu' } });

    const submitBtn = screen.getByRole('button', { name: /Create School Tenant/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(schoolsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'SCH003',
          name: 'St. Xavier High School',
          email: 'contact@stxavier.edu',
        }),
      );
    });
  });

  it('opens School Details modal with counts', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Greenwood International Academy')).toBeInTheDocument();
    });

    const viewDetailsBtns = screen.getAllByRole('button', { name: /View School Details/i });
    fireEvent.click(viewDetailsBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('School Tenant Details')).toBeInTheDocument();
      expect(screen.getAllByText('450').length).toBeGreaterThanOrEqual(1); // students
      expect(screen.getAllByText('1200').length).toBeGreaterThanOrEqual(1); // invoices
    });
  });

  it('opens Edit School Profile modal and updates successfully', async () => {
    (schoolsApi.update as any).mockResolvedValueOnce({
      ...mockSchools[0],
      phone: '+91 80 9999 8888',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Greenwood International Academy')).toBeInTheDocument();
    });

    const editBtns = screen.getAllByRole('button', { name: /Edit School Profile/i });
    fireEvent.click(editBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Edit School:/i)).toBeInTheDocument();
    });

    const phoneInput = screen.getByLabelText(/Contact Phone/i);
    fireEvent.change(phoneInput, { target: { value: '+91 80 9999 8888' } });

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(schoolsApi.update).toHaveBeenCalledWith(
        'school-uuid-1',
        expect.objectContaining({
          phone: '+91 80 9999 8888',
        }),
      );
    });
  });

  it('opens Suspend/Activate modal and toggles school status', async () => {
    (schoolsApi.updateStatus as any).mockResolvedValueOnce({
      ...mockSchools[0],
      status: 'SUSPENDED',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Greenwood International Academy')).toBeInTheDocument();
    });

    const suspendBtn = screen.getByRole('button', { name: /Suspend School/i });
    fireEvent.click(suspendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Suspend School Tenant/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Suspension/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(schoolsApi.updateStatus).toHaveBeenCalledWith('school-uuid-1', 'SUSPENDED');
    });
  });

  it('allows Super Admin to select school context', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Greenwood International Academy')).toBeInTheDocument();
    });

    const selectContextBtns = screen.getAllByRole('button', { name: /Select Context/i });
    fireEvent.click(selectContextBtns[0]);

    expect(setActiveSchoolId).toHaveBeenCalledWith('school-uuid-1');
  });

  it('opens Provision School Administrator modal and provisions admin successfully', async () => {
    (schoolsApi.provisionAdmin as any).mockResolvedValueOnce({
      message: 'Initial School Administrator successfully provisioned',
      user: {
        id: 'admin-uuid-1',
        email: 'principal@greenwood.edu',
        name: 'Dr. Principal',
        role: 'SCHOOL_ADMIN',
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Greenwood International Academy')).toBeInTheDocument();
    });

    const provisionBtn = screen.getByRole('button', { name: /Provision Admin/i });
    fireEvent.click(provisionBtn);

    await waitFor(() => {
      expect(screen.getByText('Provision School Administrator')).toBeInTheDocument();
    });

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Dr\. Arthur Pendelton/i), {
      target: { value: 'Dr. Principal' },
    });
    fireEvent.change(screen.getByPlaceholderText(/principal@school\.edu/i), {
      target: { value: 'principal@greenwood.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Min 8 characters, letter & number/i), {
      target: { value: 'AdminPassword123!' },
    });

    const submitBtn = screen.getByRole('button', { name: /Confirm Provision Admin/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(schoolsApi.provisionAdmin).toHaveBeenCalledWith(
        'school-uuid-1',
        expect.objectContaining({
          name: 'Dr. Principal',
          email: 'principal@greenwood.edu',
          password: 'AdminPassword123!',
        }),
      );
    });
  });
});
