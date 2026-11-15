import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const schoolId = localStorage.getItem('selected_school_id');
  if (schoolId) {
    config.headers['x-school-id'] = schoolId;
  }
  return config;
});

export interface BookCopy {
  id: string;
  schoolId: string;
  bookId: string;
  accessionNumber: string;
  barcode?: string | null;
  rackLocation?: string | null;
  shelfLocation?: string | null;
  condition: 'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED' | 'LOST' | 'RETIRED';
  status: 'AVAILABLE' | 'ISSUED' | 'RESERVED' | 'MAINTENANCE' | 'LOST' | 'RETIRED';
  acquiredDate?: string | null;
  purchasePrice?: number | string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Book {
  id: string;
  schoolId: string;
  title: string;
  author: string;
  isbn?: string | null;
  publisher?: string | null;
  category: string;
  edition?: string | null;
  publicationYear?: number | null;
  language: string;
  description?: string | null;
  totalCopies: number;
  availableCopies: number;
  createdAt: string;
  updatedAt: string;
  copies?: BookCopy[];
}

export interface BookLoan {
  id: string;
  schoolId: string;
  copyId: string;
  borrowerType: 'STUDENT' | 'TEACHER' | 'STAFF';
  studentId?: string | null;
  teacherId?: string | null;
  issuedByUserId: string;
  issuedAt: string;
  dueDate: string;
  returnedAt?: string | null;
  returnedByUserId?: string | null;
  renewalCount: number;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST';
  notes?: string | null;
  isOverdue?: boolean;
  copy: BookCopy & {
    book: {
      id: string;
      title: string;
      author: string;
      isbn?: string | null;
      category: string;
    };
  };
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
  } | null;
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
  fine?: LibraryFine | null;
}

export interface LibraryFine {
  id: string;
  schoolId: string;
  loanId: string;
  borrowerType: 'STUDENT' | 'TEACHER' | 'STAFF';
  studentId?: string | null;
  teacherId?: string | null;
  reason: 'OVERDUE' | 'DAMAGED_ITEM' | 'LOST_ITEM';
  overdueDays: number;
  fineAmount: number | string;
  paidAmount: number | string;
  waivedAmount: number | string;
  status: 'PENDING' | 'PAID' | 'PARTIALLY_PAID' | 'WAIVED';
  waiveReason?: string | null;
  waivedByUserId?: string | null;
  collectedByUserId?: string | null;
  paymentReference?: string | null;
  assessedAt: string;
  resolvedAt?: string | null;
  loan?: {
    id: string;
    dueDate: string;
    copy: {
      accessionNumber: string;
      book: {
        id: string;
        title: string;
        author: string;
      };
    };
  };
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
  } | null;
  collectedByUser?: { id: string; name: string; email: string } | null;
  waivedByUser?: { id: string; name: string; email: string } | null;
}

export interface LibrarySetting {
  id: string;
  schoolId: string;
  maxBooksStudent: number;
  maxBooksTeacher: number;
  loanDurationDaysStudent: number;
  loanDurationDaysTeacher: number;
  maxRenewals: number;
  finePerDay: number | string;
  gracePeriodDays: number;
  allowRenewWithOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentCatalogueItem {
  id: string;
  title: string;
  author: string;
  category: string;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
  language: string;
  description?: string | null;
  totalCopies: number;
  availableCopies: number;
  shelfLocations: string[];
}

export interface StudentLoanItem {
  id: string;
  bookTitle: string;
  bookAuthor: string;
  category: string;
  accessionNumber: string;
  issuedAt: string;
  dueDate: string;
  returnedAt?: string | null;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST';
  renewalCount: number;
  isOverdue: boolean;
  fine?: {
    id: string;
    fineAmount: number | string;
    paidAmount: number | string;
    waivedAmount: number | string;
    status: string;
    reason: string;
  } | null;
}

export interface StudentFineItem {
  id: string;
  bookTitle: string;
  reason: string;
  overdueDays: number;
  fineAmount: number | string;
  paidAmount: number | string;
  waivedAmount: number | string;
  status: string;
  assessedAt: string;
  resolvedAt?: string | null;
  paymentReference?: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ValidatedCatalogueCopyRow {
  rowNumber: number;
  title: string;
  author: string;
  category: string;
  accessionNumber: string;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
  language?: string | null;
  rackLocation?: string | null;
  shelfLocation?: string | null;
  barcode?: string | null;
  condition?: 'NEW' | 'GOOD' | 'FAIR' | null;
  purchasePrice?: number | null;
  description?: string | null;
}

export interface CatalogueImportPreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  newTitlesCount: number;
  existingTitlesCount: number;
  canImport: boolean;
  validRows: ValidatedCatalogueCopyRow[];
  invalidRows: { rowNumber: number; data: any; errors: string[] }[];
  duplicateRows: { rowNumber: number; accessionNumber: string; barcode?: string; reason: string; data: any }[];
  summaryMessage: string;
}

export interface CatalogueImportConfirmResult {
  totalSubmitted: number;
  titlesCreated: number;
  copiesInserted: number;
  booksUpdated: number;
  message: string;
}

export const libraryApi = {
  // Catalogue Excel Import
  downloadCatalogueTemplate: async (): Promise<Blob> => {
    const res = await api.get('/library/catalogue/template', {
      responseType: 'blob',
    });
    return res.data;
  },

  previewCatalogueImport: async (file: File): Promise<CatalogueImportPreviewResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<CatalogueImportPreviewResult>('/library/catalogue/import/preview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  confirmCatalogueImport: async (
    rows: ValidatedCatalogueCopyRow[],
  ): Promise<CatalogueImportConfirmResult> => {
    const res = await api.post<CatalogueImportConfirmResult>('/library/catalogue/import/confirm', {
      rows,
    });
    return res.data;
  },

  // Books (Catalogue)
  getBooks: async (params?: {
    search?: string;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Book>> => {
    const res = await api.get<PaginatedResponse<Book>>('/library/books', { params });
    return res.data;
  },

  createBook: async (payload: {
    title: string;
    author: string;
    category: string;
    isbn?: string;
    publisher?: string;
    edition?: string;
    publicationYear?: number;
    language?: string;
    description?: string;
  }): Promise<Book> => {
    const res = await api.post<Book>('/library/books', payload);
    return res.data;
  },

  updateBook: async (
    id: string,
    payload: {
      title?: string;
      author?: string;
      category?: string;
      isbn?: string;
      publisher?: string;
      edition?: string;
      publicationYear?: number;
      language?: string;
      description?: string;
    },
  ): Promise<Book> => {
    const res = await api.patch<Book>(`/library/books/${id}`, payload);
    return res.data;
  },

  deleteBook: async (id: string): Promise<{ success: boolean; message: string }> => {
    const res = await api.delete<{ success: boolean; message: string }>(`/library/books/${id}`);
    return res.data;
  },

  // Physical Copies
  createCopy: async (
    bookId: string,
    payload: {
      accessionNumber: string;
      barcode?: string;
      rackLocation?: string;
      shelfLocation?: string;
      condition?: string;
      purchasePrice?: number;
      notes?: string;
    },
  ): Promise<BookCopy> => {
    const res = await api.post<BookCopy>(`/library/books/${bookId}/copies`, payload);
    return res.data;
  },

  updateCopy: async (
    copyId: string,
    payload: {
      rackLocation?: string;
      shelfLocation?: string;
      condition?: string;
      status?: string;
      notes?: string;
    },
  ): Promise<BookCopy> => {
    const res = await api.patch<BookCopy>(`/library/copies/${copyId}`, payload);
    return res.data;
  },

  // Circulation
  issueBook: async (payload: {
    copyId: string;
    borrowerType?: 'STUDENT' | 'TEACHER';
    studentId?: string;
    teacherId?: string;
    dueDate?: string;
    notes?: string;
  }): Promise<BookLoan> => {
    const res = await api.post<BookLoan>('/library/circulation/issue', payload);
    return res.data;
  },

  returnBook: async (payload: {
    copyId?: string;
    loanId?: string;
    condition?: string;
    notes?: string;
  }): Promise<{ loan: BookLoan; fine?: LibraryFine | null; message: string }> => {
    const res = await api.post<{ loan: BookLoan; fine?: LibraryFine | null; message: string }>(
      '/library/circulation/return',
      payload,
    );
    return res.data;
  },

  renewBook: async (payload: { loanId: string }): Promise<BookLoan> => {
    const res = await api.post<BookLoan>('/library/circulation/renew', payload);
    return res.data;
  },

  getLoans: async (params?: {
    status?: string;
    borrowerType?: string;
    studentId?: string;
    teacherId?: string;
    copyId?: string;
    overdueOnly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<BookLoan>> => {
    const res = await api.get<PaginatedResponse<BookLoan>>('/library/circulation/loans', { params });
    return res.data;
  },

  // Fines
  getFines: async (params?: {
    status?: string;
    borrowerType?: string;
    studentId?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<LibraryFine>> => {
    const res = await api.get<PaginatedResponse<LibraryFine>>('/library/fines', { params });
    return res.data;
  },

  collectFine: async (
    fineId: string,
    payload: { paidAmount?: number; paymentReference?: string },
  ): Promise<{ fine: LibraryFine; receiptNumber: string; collectedAmount: number; remainingBalance: number }> => {
    const res = await api.post('/library/fines/' + fineId + '/collect', payload);
    return res.data;
  },

  waiveFine: async (
    fineId: string,
    payload: { waiveReason: string; waiveAmount?: number },
  ): Promise<{ fine: LibraryFine; waivedAmount: number; message: string }> => {
    const res = await api.post('/library/fines/' + fineId + '/waive', payload);
    return res.data;
  },

  // Settings
  getSettings: async (): Promise<LibrarySetting> => {
    const res = await api.get<LibrarySetting>('/library/settings');
    return res.data;
  },

  updateSettings: async (payload: Partial<LibrarySetting>): Promise<LibrarySetting> => {
    const res = await api.patch<LibrarySetting>('/library/settings', payload);
    return res.data;
  },

  // Student Self-Service (Zero Student IDs sent from client)
  getStudentCatalogue: async (params?: {
    search?: string;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<StudentCatalogueItem>> => {
    const res = await api.get<PaginatedResponse<StudentCatalogueItem>>('/library/student/catalogue', { params });
    return res.data;
  },

  getMyLoans: async (): Promise<{
    activeLoans: StudentLoanItem[];
    pastLoans: StudentLoanItem[];
    totalActive: number;
    totalPast: number;
  }> => {
    const res = await api.get('/library/student/my-loans');
    return res.data;
  },

  getMyFines: async (): Promise<StudentFineItem[]> => {
    const res = await api.get<StudentFineItem[]>('/library/student/my-fines');
    return res.data;
  },
};
