import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LibraryManagementWorkspace } from '../components/LibraryManagementWorkspace';
import { LibraryCatalogueExcelImportModal } from '../components/LibraryCatalogueExcelImportModal';
import { useAuth } from '../context/AuthContext';
import { libraryApi } from '../services/library.api';
import { UserRole } from '../services/api';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
  useOptionalAuth: vi.fn(),
}));

vi.mock('../services/library.api', () => ({
  libraryApi: {
    getBooks: vi.fn(),
    getLoans: vi.fn(),
    getFines: vi.fn(),
    getSettings: vi.fn(),
    downloadCatalogueTemplate: vi.fn(),
    previewCatalogueImport: vi.fn(),
    confirmCatalogueImport: vi.fn(),
  },
}));

describe('Library Catalogue Excel Import Flow', () => {
  const mockLibrarianUser = {
    id: 'user-lib-1',
    email: 'librarian@central.edu',
    name: 'Emily Bookman',
    role: UserRole.LIBRARIAN,
    schoolId: 'sch-library-01',
    schoolName: 'Central High School',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: mockLibrarianUser,
      selectedSchool: { id: 'sch-library-01', name: 'Central High School', status: 'ACTIVE' },
      isAuthenticated: true,
      isLoading: false,
    });

    (libraryApi.getBooks as any).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });
    (libraryApi.getLoans as any).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });
    (libraryApi.getFines as any).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });
    (libraryApi.getSettings as any).mockResolvedValue({
      id: 'set-1',
      schoolId: 'sch-library-01',
      maxStudentLoans: 3,
      loanPeriodDays: 14,
    });
  });

  it('renders "Import from Excel" action button in Catalogue tab header and opens modal', async () => {
    render(
      <MemoryRouter>
        <LibraryManagementWorkspace />
      </MemoryRouter>,
    );

    // Switch to Catalogue tab
    const catalogueTab = screen.getByRole('button', { name: /Catalogue/i });
    fireEvent.click(catalogueTab);

    // Find "Import from Excel" button
    const importBtn = await screen.findByRole('button', { name: /Import from Excel/i });
    expect(importBtn).toBeInTheDocument();

    // Click to open modal
    fireEvent.click(importBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Import Library Catalogue')).toBeInTheDocument();
    expect(screen.getByText(/Download Official Catalogue Template/i)).toBeInTheDocument();
  });

  it('downloads the official .xlsx template when template download button is clicked', async () => {
    const mockBlob = new Blob(['mock-xlsx-data'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    (libraryApi.downloadCatalogueTemplate as any).mockResolvedValue(mockBlob);

    // Mock URL.createObjectURL and URL.revokeObjectURL
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob');
    const mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;

    render(
      <LibraryCatalogueExcelImportModal isOpen={true} onClose={vi.fn()} />,
    );

    const downloadBtn = screen.getByRole('button', { name: /Download .xlsx Template/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(libraryApi.downloadCatalogueTemplate).toHaveBeenCalled();
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });
  });

  it('enforces strict all-or-nothing: disables Confirm button when preview contains errors or duplicates', async () => {
    (libraryApi.previewCatalogueImport as any).mockResolvedValue({
      totalRows: 3,
      validCount: 1,
      invalidCount: 1,
      duplicateCount: 1,
      newTitlesCount: 1,
      existingTitlesCount: 0,
      canImport: false,
      validRows: [
        {
          rowNumber: 2,
          title: 'Clean Code',
          author: 'Robert C. Martin',
          category: 'Computer Science',
          accessionNumber: 'ACC-101',
          condition: 'GOOD',
        },
      ],
      invalidRows: [
        {
          rowNumber: 3,
          data: { title: 'Missing Accession Book', author: 'Author' },
          errors: ['Accession Number is required (no auto-generation)'],
        },
      ],
      duplicateRows: [
        {
          rowNumber: 4,
          accessionNumber: 'ACC-DUP',
          reason: 'Accession Number already exists in the school inventory.',
          data: { title: 'Duplicate Book' },
        },
      ],
      summaryMessage: 'Import blocked by All-or-Nothing policy: 1 invalid rows and 1 duplicate copies found.',
    });

    render(
      <LibraryCatalogueExcelImportModal isOpen={true} onClose={vi.fn()} />,
    );

    // Upload mock file
    const file = new File(['mock content'], 'test_catalogue.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Click Preview
    const previewBtn = screen.getByRole('button', { name: /Preview & Validate Records/i });
    fireEvent.click(previewBtn);

    // Expect preview metrics and all-or-nothing banner
    await waitFor(() => {
      expect(screen.getByText(/Import Blocked by Strict All-or-Nothing Policy/i)).toBeInTheDocument();
      expect(screen.getByText('Download Error Report (.csv)')).toBeInTheDocument();
    });

    // Confirm button must be disabled
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Ingest Catalogue/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('enables Confirm button when all rows are valid and commits ingestion atomically', async () => {
    (libraryApi.previewCatalogueImport as any).mockResolvedValue({
      totalRows: 2,
      validCount: 2,
      invalidCount: 0,
      duplicateCount: 0,
      newTitlesCount: 1,
      existingTitlesCount: 0,
      canImport: true,
      validRows: [
        {
          rowNumber: 2,
          title: 'Algorithms',
          author: 'CLRS',
          category: 'CS',
          accessionNumber: 'ACC-201',
          condition: 'GOOD',
        },
        {
          rowNumber: 3,
          title: 'Algorithms',
          author: 'CLRS',
          category: 'CS',
          accessionNumber: 'ACC-202',
          condition: 'NEW',
        },
      ],
      invalidRows: [],
      duplicateRows: [],
      summaryMessage: 'Ready to import! Found 2 valid copies (1 new titles to create).',
    });

    (libraryApi.confirmCatalogueImport as any).mockResolvedValue({
      totalSubmitted: 2,
      titlesCreated: 1,
      copiesInserted: 2,
      booksUpdated: 0,
      message: 'Successfully ingested 2 physical copies across 1 book titles.',
    });

    const mockOnSuccess = vi.fn();

    render(
      <LibraryCatalogueExcelImportModal
        isOpen={true}
        onClose={vi.fn()}
        onImportSuccess={mockOnSuccess}
      />,
    );

    // Upload mock file
    const file = new File(['valid content'], 'valid_catalogue.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Preview
    fireEvent.click(screen.getByRole('button', { name: /Preview & Validate Records/i }));

    // Confirm button should be enabled
    const confirmBtn = await screen.findByRole('button', {
      name: /Confirm & Ingest Catalogue \(2 Copies\)/i,
    });
    expect(confirmBtn).not.toBeDisabled();

    // Click confirm opens sub-modal
    fireEvent.click(confirmBtn);
    expect(screen.getByText('Confirm Catalogue Ingestion')).toBeInTheDocument();
    expect(screen.getByText(/Atomic Transaction Guarantee/i)).toBeInTheDocument();

    // Confirm inside sub-modal
    fireEvent.click(screen.getByRole('button', { name: /Commit Ingestion/i }));

    await waitFor(() => {
      expect(libraryApi.confirmCatalogueImport).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ accessionNumber: 'ACC-201' }),
          expect.objectContaining({ accessionNumber: 'ACC-202' }),
        ]),
      );
      expect(screen.getByText('Catalogue Import Committed Atomically')).toBeInTheDocument();
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });
});
