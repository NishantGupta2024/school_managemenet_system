import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ExcelImportView } from '../components/ExcelImportView';
import { excelImportsApi, metaApi } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    metaApi: {
      getAcademicYears: vi.fn(),
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

describe('Fee Management — ExcelImportView Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(metaApi.getAcademicYears).mockResolvedValue(mockAcademicYears as any);
  });

  it('1. Fee Management Excel import mounts and displays import types independently', async () => {
    render(<ExcelImportView />);

    await waitFor(() => {
      expect(screen.getByText('Excel Data Import Engine')).toBeInTheDocument();
    });

    expect(screen.getByText('Student Master Records')).toBeInTheDocument();
    expect(screen.getByText('Fee Structure Allocations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Template/i })).toBeInTheDocument();
  });

  it('2. Fee allocations template type is requested when FEE_ALLOCATION is selected', async () => {
    const fakeBlob = new Blob(['mock content'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    vi.mocked(excelImportsApi.downloadTemplate).mockResolvedValue(fakeBlob);

    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    const linkClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExcelImportView />);

    await waitFor(() => {
      expect(screen.getByText('Fee Structure Allocations')).toBeInTheDocument();
    });

    // Select FEE_ALLOCATION
    fireEvent.click(screen.getByText('Fee Structure Allocations'));

    // Click Download Template
    fireEvent.click(screen.getByRole('button', { name: /Download Template/i }));

    await waitFor(() => {
      expect(excelImportsApi.downloadTemplate).toHaveBeenCalledWith('FEE_ALLOCATION');
    });

    linkClickSpy.mockRestore();
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('3. Upload and preview for FEE_ALLOCATION passes correct parameters', async () => {
    const mockPreviewResult = {
      importType: 'FEE_ALLOCATION' as const,
      academicYearId: 'year-1',
      totalRows: 1,
      validCount: 1,
      invalidCount: 0,
      duplicateCount: 0,
      validRows: [
        {
          rowNumber: 2,
          admissionNumber: 'ADM-2026-101',
          feeStructureName: 'General Fee Structure',
        },
      ],
      invalidRows: [],
      duplicateRows: [],
      summaryMessage: 'Analyzed 1 rows: 1 valid, 0 duplicate, 0 invalid.',
    };

    vi.mocked(excelImportsApi.preview).mockResolvedValue(mockPreviewResult);

    render(<ExcelImportView />);

    await waitFor(() => {
      expect(screen.getByText('Fee Structure Allocations')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Fee Structure Allocations'));

    const fakeFile = new File(['binary'], 'fee_alloc.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [fakeFile] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Preview/i }));

    await waitFor(() => {
      expect(excelImportsApi.preview).toHaveBeenCalledWith(fakeFile, 'FEE_ALLOCATION', 'year-1');
      expect(screen.getByText('General Fee Structure')).toBeInTheDocument();
    });
  });
});
