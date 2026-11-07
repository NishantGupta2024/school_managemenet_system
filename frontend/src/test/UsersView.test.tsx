import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { UsersView } from '../components/UsersView';
import { usersApi } from '../services/api';
import { AuthProvider } from '../context/AuthContext';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      getToken: vi.fn().mockReturnValue('mock-jwt-token'),
      getUser: vi.fn().mockReturnValue({
        id: 'admin-user-id',
        email: 'admin@greenwood.edu',
        name: 'School Admin',
        role: 'SCHOOL_ADMIN',
        schoolId: '00000000-0000-0000-0000-000000000001',
      }),
      getProfile: vi.fn().mockResolvedValue({
        id: 'admin-user-id',
        email: 'admin@greenwood.edu',
        name: 'School Admin',
        role: 'SCHOOL_ADMIN',
        schoolId: '00000000-0000-0000-0000-000000000001',
      }),
    },
    usersApi: {
      list: vi.fn(),
      getMe: vi.fn(),
      createStaff: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      getUnlinkedStudents: vi.fn(),
      provisionStudentAccount: vi.fn(),
      listParents: vi.fn(),
      createParent: vi.fn(),
      linkParentStudent: vi.fn(),
      unlinkParentStudent: vi.fn(),
    },
  };
});

const mockStaff = [
  {
    id: 'staff-1',
    schoolId: 'school-1',
    name: 'Jane Accountant',
    email: 'jane@greenwood.edu',
    role: 'FEE_STAFF',
    status: 'ACTIVE' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockUnlinkedStudents = [
  {
    id: 'stud-1',
    admissionNumber: 'ADM-101',
    firstName: 'Alice',
    lastName: 'Walker',
    guardianEmail: 'parent.walker@example.com',
    grade: { id: 'g1', name: 'Grade 10' },
    section: { id: 's1', name: 'A' },
  },
];

const mockLinkedStudents = [
  {
    id: 'user-stud-1',
    schoolId: 'school-1',
    name: 'Bob Smith',
    email: 'bob@greenwood.edu',
    role: 'STUDENT',
    status: 'ACTIVE' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    studentProfile: {
      id: 'stud-2',
      admissionNumber: 'ADM-102',
      firstName: 'Bob',
      lastName: 'Smith',
    },
  },
];

const mockParents = [
  {
    id: 'parent-1',
    schoolId: 'school-1',
    name: 'Robert Walker',
    email: 'parent.walker@example.com',
    role: 'PARENT',
    status: 'ACTIVE' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    parentRelations: [
      {
        id: 'rel-1',
        studentId: 'stud-1',
        relationshipType: 'FATHER',
        student: {
          id: 'stud-1',
          admissionNumber: 'ADM-101',
          firstName: 'Alice',
          lastName: 'Walker',
        },
      },
    ],
  },
];

describe('UsersView Component (FEE-P2B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usersApi.list as any).mockImplementation(({ role }: { role: string }) => {
      if (role === 'FEE_STAFF') return Promise.resolve(mockStaff);
      if (role === 'STUDENT') return Promise.resolve(mockLinkedStudents);
      return Promise.resolve([]);
    });
    (usersApi.getUnlinkedStudents as any).mockResolvedValue(mockUnlinkedStudents);
    (usersApi.listParents as any).mockResolvedValue(mockParents);
  });

  const renderComponent = () =>
    render(
      <AuthProvider>
        <UsersView />
      </AuthProvider>,
    );

  it('renders User Management heading and Fee Staff tab by default', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('User & Account Management')).toBeInTheDocument();
      expect(screen.getByText('Jane Accountant')).toBeInTheDocument();
      expect(screen.getByText('jane@greenwood.edu')).toBeInTheDocument();
    });
  });

  it('opens Add Fee Staff modal and submits successfully', async () => {
    (usersApi.createStaff as any).mockResolvedValueOnce({
      id: 'staff-2',
      name: 'Tom Cashier',
      email: 'tom@greenwood.edu',
      role: 'FEE_STAFF',
      status: 'ACTIVE',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Jane Accountant')).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /Add Fee Staff/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('Add Fee Staff Member')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Jane Accountant/i), {
      target: { value: 'Tom Cashier' },
    });
    fireEvent.change(screen.getByPlaceholderText(/staff@school\.edu/i), {
      target: { value: 'tom@greenwood.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Min 8 characters, letter & number/i), {
      target: { value: 'StaffPass123!' },
    });

    const submitBtn = screen.getByRole('button', { name: /Confirm Create Staff/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(usersApi.createStaff).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Tom Cashier',
          email: 'tom@greenwood.edu',
          password: 'StaffPass123!',
        }),
      );
    });
  });

  it('navigates to Student Accounts tab and provisions student login', async () => {
    (usersApi.provisionStudentAccount as any).mockResolvedValueOnce({
      message: 'Student account successfully provisioned and linked',
      user: { id: 'new-user', email: 'alice@greenwood.edu' },
      studentId: 'stud-1',
    });

    renderComponent();

    const studentTabBtn = screen.getByRole('button', { name: /Student Accounts/i });
    fireEvent.click(studentTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Alice Walker')).toBeInTheDocument();
      expect(screen.getByText('ADM-101')).toBeInTheDocument();
    });

    const provisionBtn = screen.getByRole('button', { name: /Provision Login/i });
    fireEvent.click(provisionBtn);

    await waitFor(() => {
      expect(screen.getByText('Provision Student Login')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/student@school\.edu/i), {
      target: { value: 'alice@greenwood.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Min 8 characters, letter & number/i), {
      target: { value: 'StudentPass123!' },
    });

    const submitBtn = screen.getByRole('button', { name: /Confirm Provision Login/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(usersApi.provisionStudentAccount).toHaveBeenCalledWith(
        'stud-1',
        expect.objectContaining({
          email: 'alice@greenwood.edu',
          password: 'StudentPass123!',
        }),
      );
    });
  });

  it('navigates to Parent Accounts tab and renders linked children', async () => {
    renderComponent();

    const parentTabBtn = screen.getByRole('button', { name: /Parent Accounts/i });
    fireEvent.click(parentTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Robert Walker')).toBeInTheDocument();
      expect(screen.getByText(/Alice Walker \(FATHER\)/i)).toBeInTheDocument();
    });
  });

  it('opens Add Parent Account modal and submits successfully', async () => {
    (usersApi.createParent as any).mockResolvedValueOnce({
      id: 'parent-2',
      name: 'Mary Smith',
      email: 'mary@example.com',
      role: 'PARENT',
      status: 'ACTIVE',
    });

    renderComponent();

    const parentTabBtn = screen.getByRole('button', { name: /Parent Accounts/i });
    fireEvent.click(parentTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Robert Walker')).toBeInTheDocument();
    });

    const addParentBtn = screen.getByRole('button', { name: /Add Parent Account/i });
    fireEvent.click(addParentBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Add Parent Account/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Robert Pendelton/i), {
      target: { value: 'Mary Smith' },
    });
    fireEvent.change(screen.getByPlaceholderText(/parent@example\.com/i), {
      target: { value: 'mary@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Min 8 characters, letter & number/i), {
      target: { value: 'ParentPass123!' },
    });

    const submitBtn = screen.getByRole('button', { name: /Confirm Create Parent/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(usersApi.createParent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Mary Smith',
          email: 'mary@example.com',
          password: 'ParentPass123!',
          relationshipType: 'GUARDIAN',
        }),
      );
    });
  });

  it('toggles user status between active and inactive with confirmation', async () => {
    (usersApi.updateStatus as any).mockResolvedValueOnce({
      ...mockStaff[0],
      status: 'INACTIVE',
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Jane Accountant')).toBeInTheDocument();
    });

    const powerBtn = screen.getByTitle(/Deactivate Account/i);
    fireEvent.click(powerBtn);

    await waitFor(() => {
      expect(screen.getByText('Deactivate User Account')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm Deactivation/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(usersApi.updateStatus).toHaveBeenCalledWith('staff-1', 'INACTIVE');
    });
  });
});
