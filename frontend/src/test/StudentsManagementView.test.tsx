import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StudentsManagementView } from '../components/StudentsManagementView';
import { studentsApi, academicsApi } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    studentsApi: {
      getStudents: vi.fn(),
      getStudentById: vi.fn(),
      getStudentProfile: vi.fn(),
      createStudent: vi.fn(),
      updateStudent: vi.fn(),
      getFeeStatement: vi.fn(),
    },
    academicsApi: {
      getAcademicYears: vi.fn(),
      getGrades: vi.fn(),
    },
  };
});

const mockAcademicYears = [
  {
    id: 'year-1',
    schoolId: 'school-1',
    name: '2026-2027',
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    isCurrent: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

const mockGrades = [
  {
    id: 'grade-1',
    schoolId: 'school-1',
    name: 'Grade 10',
    code: 'G10',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections: [
      { id: 'sec-1', schoolId: 'school-1', gradeId: 'grade-1', name: 'A', capacity: 35, createdAt: '', updatedAt: '' },
      { id: 'sec-2', schoolId: 'school-1', gradeId: 'grade-1', name: 'B', capacity: 35, createdAt: '', updatedAt: '' },
    ],
  },
];

const mockStudents = [
  {
    id: 'stu-1',
    schoolId: 'school-1',
    admissionNumber: 'ADM-001',
    firstName: 'Aarav',
    lastName: 'Sharma',
    gradeId: 'grade-1',
    sectionId: 'sec-1',
    academicYearId: 'year-1',
    rollNumber: '101',
    status: 'ACTIVE' as const,
    guardianName: 'Vikram Sharma',
    guardianPhone: '+91 9876543210',
    grade: mockGrades[0],
    section: mockGrades[0].sections[0],
    academicYear: mockAcademicYears[0],
    userAccount: {
      id: 'usr-1',
      email: 'aarav@school.edu',
      name: 'Aarav Sharma',
      status: 'ACTIVE',
    },
  },
  {
    id: 'stu-2',
    schoolId: 'school-1',
    admissionNumber: 'ADM-002',
    firstName: 'Diya',
    lastName: 'Patel',
    gradeId: 'grade-1',
    sectionId: 'sec-2',
    academicYearId: 'year-1',
    rollNumber: '102',
    status: 'ACTIVE' as const,
    guardianName: 'Ramesh Patel',
    guardianPhone: '+91 9876543211',
    grade: mockGrades[0],
    section: mockGrades[0].sections[1],
    academicYear: mockAcademicYears[0],
    userAccount: null,
  },
];

describe('StudentsManagementView Component (Phase 1B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(academicsApi.getAcademicYears).mockResolvedValue(mockAcademicYears as any);
    vi.mocked(academicsApi.getGrades).mockResolvedValue(mockGrades as any);
    vi.mocked(studentsApi.getStudents).mockResolvedValue({
      data: mockStudents as any,
      meta: {
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    });
  });

  it('renders student directory header and table with student details', async () => {
    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Student Management & Admissions')).toBeInTheDocument();
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
      expect(screen.getByText('Diya Patel')).toBeInTheDocument();
      expect(screen.getByText('ADM-001')).toBeInTheDocument();
      expect(screen.getByText('ADM-002')).toBeInTheDocument();
    });
  });

  it('renders filters for academic session, grade, and status', async () => {
    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by name, admission no, roll no...')).toBeInTheDocument();
      expect(screen.getByText('All Academic Sessions')).toBeInTheDocument();
      expect(screen.getByText('All Classes / Grades')).toBeInTheDocument();
    });
  });

  it('opens admission modal when "+ New Admission" is clicked', async () => {
    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('New Admission')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Admission'));

    await waitFor(() => {
      expect(screen.getByText('New Student Admission')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. ADM-2026-001')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. Aarav')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. Sharma')).toBeInTheDocument();
    });
  });

  it('submits individual student admission successfully', async () => {
    vi.mocked(studentsApi.createStudent).mockResolvedValue({
      id: 'stu-3',
      schoolId: 'school-1',
      admissionNumber: 'ADM-003',
      firstName: 'Kabir',
      lastName: 'Mehta',
      gradeId: 'grade-1',
      sectionId: 'sec-1',
      academicYearId: 'year-1',
      status: 'ACTIVE',
    } as any);

    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('New Admission')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Admission'));

    await waitFor(() => {
      expect(screen.getByText('New Student Admission')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('e.g. ADM-2026-001'), {
      target: { value: 'ADM-003' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Aarav'), {
      target: { value: 'Kabir' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Sharma'), {
      target: { value: 'Mehta' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit Admission/i }));

    await waitFor(() => {
      expect(studentsApi.createStudent).toHaveBeenCalledWith(
        expect.objectContaining({
          admissionNumber: 'ADM-003',
          firstName: 'Kabir',
          lastName: 'Mehta',
        }),
      );
    });
  });

  it('opens student profile drawer and displays live fee summary', async () => {
    vi.mocked(studentsApi.getStudentProfile).mockResolvedValue(mockStudents[0] as any);
    vi.mocked(studentsApi.getFeeStatement).mockResolvedValue({
      student: mockStudents[0] as any,
      academicYear: mockAcademicYears[0] as any,
      allocation: null,
      summary: {
        totalGrossAmount: 12000,
        totalDiscountAmount: 2000,
        totalNetAmount: 10000,
        totalPaidAmount: 5000,
        totalRemainingAmount: 5000,
        invoiceCount: 2,
      },
      invoices: [],
    } as any);

    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    // Click "View Profile" button for the first student
    const profileButtons = screen.getAllByTitle('View Student Profile & Live Fee Statement');
    fireEvent.click(profileButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Academic Placement & Demographics')).toBeInTheDocument();
      expect(screen.getByText('Live Fee Summary & Financial Statement')).toBeInTheDocument();
      expect(screen.getByText('₹12,000')).toBeInTheDocument();
      expect(screen.getAllByText('₹5,000')).toHaveLength(2);
    });
  });
});
