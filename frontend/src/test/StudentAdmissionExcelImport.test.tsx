import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { StudentsManagementView } from '../components/StudentsManagementView';
import { studentsApi, academicsApi, excelImportsApi } from '../services/api';

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
    excelImportsApi: {
      downloadTemplate: vi.fn(),
      preview: vi.fn(),
      confirm: vi.fn(),
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
];

describe('Student Admission — Excel Import & Download Template Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(academicsApi.getAcademicYears).mockResolvedValue(mockAcademicYears as any);
    vi.mocked(academicsApi.getGrades).mockResolvedValue(mockGrades as any);
    vi.mocked(studentsApi.getStudents).mockResolvedValue({
      data: mockStudents as any,
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });
  });

  it('1. Download Excel Template and Import via Excel buttons are visible to authorized users', async () => {
    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Download Template/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import via Excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Admission/i })).toBeInTheDocument();
  });

  it('2. Clicking Download Template calls excelImportsApi.downloadTemplate("STUDENT_MASTER")', async () => {
    const fakeBlob = new Blob(['mock content'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    vi.mocked(excelImportsApi.downloadTemplate).mockResolvedValue(fakeBlob);

    // Mock link click & URL
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    const linkClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download Template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Download Template/i }));

    await waitFor(() => {
      expect(excelImportsApi.downloadTemplate).toHaveBeenCalledWith('STUDENT_MASTER');
      expect(screen.getByText(/Student Master Excel template downloaded successfully/i)).toBeInTheDocument();
    });

    linkClickSpy.mockRestore();
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('3. Download errors display useful user feedback', async () => {
    vi.mocked(excelImportsApi.downloadTemplate).mockRejectedValue(new Error('Network error downloading template'));

    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download Template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Download Template/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network error downloading template/i)).toBeInTheDocument();
    });
  });

  it('4. Import Students button opens the import dialog with guidelines', async () => {
    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import via Excel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Import via Excel/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Bulk Student Admission via Excel/i)).toBeInTheDocument();
    expect(screen.getByText(/Standardized Student Admission Template Guidelines:/i)).toBeInTheDocument();
    expect(screen.getByText(/Select Completed Spreadsheet/i)).toBeInTheDocument();
  });

  it('5. XLSX file upload invokes the preview API and displays breakdown counts', async () => {
    const mockPreviewResult = {
      importType: 'STUDENT_MASTER' as const,
      academicYearId: 'year-1',
      totalRows: 3,
      validCount: 2,
      invalidCount: 1,
      duplicateCount: 0,
      validRows: [
        {
          rowNumber: 2,
          admissionNumber: 'ADM-2026-101',
          firstName: 'Rohan',
          lastName: 'Sharma',
          gradeCode: 'G10',
          section: 'A',
          rollNumber: '101',
        },
        {
          rowNumber: 3,
          admissionNumber: 'ADM-2026-102',
          firstName: 'Ananya',
          lastName: 'Iyer',
          gradeCode: 'G10',
          section: 'B',
          rollNumber: '102',
        },
      ],
      invalidRows: [
        {
          rowNumber: 4,
          data: { admissionNumber: 'ADM-BAD' },
          errors: ['Grade "G99" does not exist in this school'],
        },
      ],
      duplicateRows: [],
      summaryMessage: 'Analyzed 3 rows: 2 valid, 0 duplicate, 1 invalid.',
    };

    vi.mocked(excelImportsApi.preview).mockResolvedValue(mockPreviewResult);

    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import via Excel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Import via Excel/i }));

    const fakeFile = new File(['binary'], 'students.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    expect(screen.getByText('students.xlsx')).toBeInTheDocument();

    const previewBtn = screen.getByRole('button', { name: /Preview & Validate Records/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(excelImportsApi.preview).toHaveBeenCalledWith(fakeFile, 'STUDENT_MASTER', 'year-1');
      expect(screen.getByText('Total Rows')).toBeInTheDocument();
      expect(screen.getByText('Valid Records')).toBeInTheDocument();
      expect(screen.getByText('Invalid Records')).toBeInTheDocument();
      expect(screen.getByText('Rohan Sharma')).toBeInTheDocument();
      expect(screen.getByText('Ananya Iyer')).toBeInTheDocument();
      expect(screen.getByText('Grade "G99" does not exist in this school')).toBeInTheDocument();
    });
  });

  it('6. Confirmation is disabled when valid count is 0', async () => {
    const mockEmptyValidPreview = {
      importType: 'STUDENT_MASTER' as const,
      academicYearId: 'year-1',
      totalRows: 1,
      validCount: 0,
      invalidCount: 1,
      duplicateCount: 0,
      validRows: [],
      invalidRows: [
        {
          rowNumber: 2,
          data: { admissionNumber: 'ADM-FAIL' },
          errors: ['Admission number is required'],
        },
      ],
      duplicateRows: [],
      summaryMessage: 'Analyzed 1 rows: 0 valid, 0 duplicate, 1 invalid.',
    };

    vi.mocked(excelImportsApi.preview).mockResolvedValue(mockEmptyValidPreview);

    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import via Excel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Import via Excel/i }));

    const fakeFile = new File(['binary'], 'invalid_students.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    fireEvent.click(screen.getByRole('button', { name: /Preview & Validate Records/i }));

    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Admit/i });
      expect(confirmBtn).toBeDisabled();
    });
  });

  it('7. Successful confirmation calls confirm API, displays summary, and refreshes directory', async () => {
    const mockPreviewResult = {
      importType: 'STUDENT_MASTER' as const,
      academicYearId: 'year-1',
      totalRows: 2,
      validCount: 2,
      invalidCount: 0,
      duplicateCount: 0,
      validRows: [
        {
          rowNumber: 2,
          admissionNumber: 'ADM-2026-101',
          firstName: 'Rohan',
          lastName: 'Sharma',
          gradeCode: 'G10',
          section: 'A',
        },
      ],
      invalidRows: [],
      duplicateRows: [],
      summaryMessage: 'Analyzed 2 rows: 2 valid, 0 duplicate, 0 invalid.',
    };

    const mockConfirmResult = {
      importType: 'STUDENT_MASTER' as const,
      academicYearId: 'year-1',
      totalSubmitted: 2,
      insertedCount: 2,
      skippedCount: 0,
      failedCount: 0,
      errors: [],
    };

    vi.mocked(excelImportsApi.preview).mockResolvedValue(mockPreviewResult);
    vi.mocked(excelImportsApi.confirm).mockResolvedValue(mockConfirmResult);

    render(<StudentsManagementView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import via Excel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Import via Excel/i }));

    const fakeFile = new File(['binary'], 'valid.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    fireEvent.click(screen.getByRole('button', { name: /Preview & Validate Records/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm & Admit \(2 Students\)/i })).toBeInTheDocument();
    });

    // Click to open confirmation sub-modal
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Admit \(2 Students\)/i }));

    expect(screen.getByText(/Confirm Student Ingestion/i)).toBeInTheDocument();

    // Execute confirmation
    fireEvent.click(screen.getByRole('button', { name: /Execute Admission/i }));

    await waitFor(() => {
      expect(excelImportsApi.confirm).toHaveBeenCalledWith({
        importType: 'STUDENT_MASTER',
        academicYearId: 'year-1',
        rows: mockPreviewResult.validRows,
      });

      expect(screen.getByText(/Student Admissions Committed Atomically/i)).toBeInTheDocument();
      expect(screen.getByText('Admitted Students')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Close and verify student list refetch was triggered
    fireEvent.click(screen.getByRole('button', { name: /Done & View Student Directory/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(studentsApi.getStudents).toHaveBeenCalled();
    });
  });

  it('8. Closing the dialog resets state safely', async () => {
    render(<StudentsManagementView />);

    fireEvent.click(screen.getByRole('button', { name: /Import via Excel/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close modal/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
