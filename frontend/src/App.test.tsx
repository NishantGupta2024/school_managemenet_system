import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';

vi.mock('./services/api', () => ({
  DEFAULT_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  DEFAULT_SCHOOL_CODE: 'SCH001',
  UserRole: {
    PLATFORM_SUPER_ADMIN: 'PLATFORM_SUPER_ADMIN',
    SCHOOL_ADMIN: 'SCHOOL_ADMIN',
    FEE_STAFF: 'FEE_STAFF',
    STUDENT: 'STUDENT',
    PARENT: 'PARENT',
  },
  setActiveSchoolId: vi.fn(),
  setOnUnauthorized: vi.fn(),
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn().mockReturnValue('mock-jwt-token'),
    getUser: vi.fn().mockReturnValue({
      id: 'mock-user-1',
      email: 'admin@school.com',
      name: 'Admin User',
      role: 'SCHOOL_ADMIN',
      schoolId: '00000000-0000-0000-0000-000000000001',
      schoolName: 'Greenwood Intl Academy',
    }),
    getProfile: vi.fn().mockResolvedValue({
      id: 'mock-user-1',
      email: 'admin@school.com',
      name: 'Admin User',
      role: 'SCHOOL_ADMIN',
      schoolId: '00000000-0000-0000-0000-000000000001',
    }),
  },
  fetchSystemHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: 12.34,
    environment: 'test',
    database: {
      status: 'connected',
      latencyMs: 1.2,
      tenantCount: 1,
      userCount: 1,
      studentCount: 1,
    },
    tenantContext: {
      activeSchoolId: '00000000-0000-0000-0000-000000000001',
    },
  }),
  feeHeadsApi: {
    list: vi.fn().mockResolvedValue([
      {
        id: '1',
        schoolId: '00000000-0000-0000-0000-000000000001',
        name: 'Tuition Fee',
        code: 'TUIT',
        category: 'ACADEMIC',
        isOptional: false,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      },
    ]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  feeStructuresApi: {
    list: vi.fn().mockResolvedValue([
      {
        id: '1',
        name: 'Grade 10 Standard Fee',
        gradeId: 'g10',
        academicYearId: 'y26',
        items: [
          {
            id: 'item-1',
            feeHeadId: '1',
            amount: 2500,
            frequency: 'MONTHLY',
            isOptional: false,
            feeHead: { name: 'Tuition Fee', code: 'TUIT' },
          },
        ],
        grade: { name: 'Grade 10', code: 'G10' },
        academicYear: { name: '2026-2027', isCurrent: true },
        _count: { allocations: 1 },
      },
    ]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  studentAllocationsApi: {
    list: vi.fn().mockResolvedValue([
      {
        id: 'alloc-1',
        studentId: 'stud-1',
        student: {
          firstName: 'Aarav',
          lastName: 'Sharma',
          admissionNumber: 'ADM-2026-001',
          grade: { name: 'Grade 10' },
        },
        feeStructure: { name: 'Grade 10 Standard Fee', items: [] },
        academicYear: { name: '2026-2027' },
        concessionType: 'PERCENTAGE',
        concessionValue: 10,
        concessionReason: 'Academic merit scholarship',
        optedFeeHeadIds: [],
        status: 'ACTIVE',
      },
    ]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  metaApi: {
    getStudents: vi.fn().mockResolvedValue([
      {
        id: 'stud-1',
        admissionNumber: 'ADM-2026-001',
        firstName: 'Aarav',
        lastName: 'Sharma',
        grade: { name: 'Grade 10' },
      },
    ]),
    getAccessibleStudents: vi.fn().mockResolvedValue([
      {
        id: 'stud-1',
        admissionNumber: 'ADM-2026-001',
        firstName: 'Aarav',
        lastName: 'Sharma',
        grade: { name: 'Grade 10' },
      },
    ]),
    getGrades: vi.fn().mockResolvedValue([{ id: 'g10', name: 'Grade 10', code: 'G10' }]),
    getAcademicYears: vi.fn().mockResolvedValue([{ id: 'y26', name: '2026-2027', isCurrent: true }]),
  },
  feeGenerationApi: {
    preview: vi.fn().mockResolvedValue({
      academicYearId: 'y26',
      totalEligibleAllocations: 1,
      totalStudents: 1,
      totalPlannedInvoices: 12,
      newInvoicesToCreate: 12,
      existingInvoicesToSkip: 0,
      totalPlannedItems: 24,
      projectedGrossTotal: 80500,
      projectedDiscountTotal: 8050,
      projectedNetTotal: 72450,
      validationErrors: [],
    }),
    execute: vi.fn(),
    getRuns: vi.fn().mockResolvedValue([]),
  },
  feeStatementApi: {
    getStatement: vi.fn().mockResolvedValue({
      student: {
        id: 'stud-1',
        admissionNumber: 'ADM-2026-001',
        firstName: 'Aarav',
        lastName: 'Sharma',
        fullName: 'Aarav Sharma',
        grade: 'Grade 10',
        section: 'Section A',
        status: 'ACTIVE',
      },
      academicYear: {
        id: 'y26',
        name: '2026-2027',
      },
      allocation: {
        feeStructureName: 'Grade 10 Standard Fee',
        concessionType: 'PERCENTAGE',
        concessionValue: 10,
      },
      summary: {
        totalGrossAmount: 80500,
        totalDiscountAmount: 8050,
        totalNetAmount: 72450,
        invoiceCount: 12,
        statusBreakdown: { UPCOMING: 12, DUE: 0, OVERDUE: 0, VOID: 0 },
      },
      invoices: [],
    }),
  },
  excelImportsApi: {
    downloadTemplate: vi.fn(),
    preview: vi.fn(),
    confirm: vi.fn(),
  },
  fineRulesApi: {
    list: vi.fn().mockResolvedValue([
      {
        id: 'rule-1',
        schoolId: '00000000-0000-0000-0000-000000000001',
        academicYearId: 'y26',
        name: 'Standard Late Fee',
        fineType: 'PER_DAY',
        fineValue: 25,
        gracePeriodDays: 5,
        maxFineCap: 300,
        dayCountPolicy: 'CALENDAR_DAYS',
        status: 'ACTIVE',
      },
    ]),
    listInvoices: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    preview: vi.fn(),
  },
}));

describe('App Component', () => {
  it('renders application header and title', async () => {
    render(<App />);
    const titleElements = await screen.findAllByText(/School Fee Management System/i);
    expect(titleElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Phase 1 Architecture Foundation Completed/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Greenwood Intl Academy/i)).toBeInTheDocument();
    });
  });

  it('renders infrastructure telemetry cards', async () => {
    render(<App />);
    expect(await screen.findByText(/System Health & Infrastructure Telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/Frontend Tier/i)).toBeInTheDocument();
    const gatewayElements = screen.getAllByText(/API Gateway/i);
    expect(gatewayElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Database Tier/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/PostgreSQL 18 \+ Prisma/i)).toBeInTheDocument();
    });
  });

  it('renders Phase Foundation deliverables checklist', async () => {
    render(<App />);
    expect(await screen.findByText(/Phase Foundation & Fee Engine Deliverables/i)).toBeInTheDocument();
    expect(screen.getByText(/Clean Monorepo Workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/Tenant Context Isolation/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Monthly Invoicing Engine \(Phase 2C\)/i)).toBeInTheDocument();
    });
  });

  it('navigates to Fee Heads tab when clicked', async () => {
    render(<App />);
    const tabBtn = await screen.findByRole('button', { name: /^Fee Heads$/i });
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Fee Head Catalog/i)).toBeInTheDocument();
      expect(screen.getByText(/Tuition Fee/i)).toBeInTheDocument();
      expect(screen.getByText('TUIT')).toBeInTheDocument();
    });
  });

  it('navigates to Fee Structures tab when clicked', async () => {
    render(<App />);
    const tabBtn = await screen.findByRole('button', { name: /^Fee Structures$/i });
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Class-Wise Fee Structures/i)).toBeInTheDocument();
      expect(screen.getByText(/Grade 10 Standard Fee/i)).toBeInTheDocument();
    });
  });

  it('navigates to Student Allocations tab when clicked', async () => {
    render(<App />);
    const tabBtn = await screen.findByRole('button', { name: /^Student Allocations$/i });
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Student Fee Allocations/i)).toBeInTheDocument();
      expect(screen.getByText(/Aarav Sharma/i)).toBeInTheDocument();
      expect(screen.getByText('ADM-2026-001')).toBeInTheDocument();
    });
  });

  it('navigates to Monthly Invoicing tab when clicked', async () => {
    render(<App />);
    await screen.findByText(/Phase Foundation & Fee Engine Deliverables/i);
    const tabBtns = screen.getAllByRole('button', { name: /Monthly Invoicing/i });
    fireEvent.click(tabBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Monthly Invoicing & Schedule Generator/i)).toBeInTheDocument();
      expect(screen.getByText(/Generation Audit Log & History/i)).toBeInTheDocument();
    });
  });

  it('navigates to Fee Statements tab when clicked', async () => {
    render(<App />);
    await screen.findByText(/Phase Foundation & Fee Engine Deliverables/i);
    const tabBtns = screen.getAllByRole('button', { name: /Fee Statements/i });
    fireEvent.click(tabBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Student Fee Statements/i)).toBeInTheDocument();
      expect(screen.getByText(/Monthly Fee Obligation Schedule/i)).toBeInTheDocument();
    });
  });

  it('navigates to Excel Imports tab when clicked', async () => {
    render(<App />);
    await screen.findByText(/Phase Foundation & Fee Engine Deliverables/i);
    const tabBtns = screen.getAllByRole('button', { name: /Excel Imports/i });
    fireEvent.click(tabBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Excel Data Import Engine/i)).toBeInTheDocument();
      expect(screen.getByText(/Student Master Records/i)).toBeInTheDocument();
      expect(screen.getByText(/Fee Structure Allocations/i)).toBeInTheDocument();
    });
  });

  it('navigates to Fine Rules tab when clicked', async () => {
    render(<App />);
    await screen.findByText(/Phase Foundation & Fee Engine Deliverables/i);
    const tabBtns = screen.getAllByRole('button', { name: /Fine Rules/i });
    fireEvent.click(tabBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Fine Configuration & Late Fee Rules/i)).toBeInTheDocument();
      expect(screen.getByText(/Standard Late Fee/i)).toBeInTheDocument();
      expect(screen.getByText(/Late Fine Calculation Preview & Simulator/i)).toBeInTheDocument();
    });
  });
});

