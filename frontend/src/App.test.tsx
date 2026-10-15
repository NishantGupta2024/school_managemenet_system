import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Mock the API health fetch so unit test runs deterministically without network
vi.mock('./services/api', () => ({
  DEFAULT_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  DEFAULT_SCHOOL_CODE: 'SCH001',
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
}));

describe('App Component', () => {
  it('renders application header and title', async () => {
    render(<App />);
    const titleElements = screen.getAllByText(/School Fee Management System/i);
    expect(titleElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Phase 1 Architecture Foundation Completed/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Greenwood Intl Academy/i)).toBeInTheDocument();
    });
  });

  it('renders infrastructure telemetry cards', async () => {
    render(<App />);
    expect(screen.getByText(/System Health & Infrastructure Telemetry/i)).toBeInTheDocument();
    expect(screen.getByText(/Frontend Tier/i)).toBeInTheDocument();
    const gatewayElements = screen.getAllByText(/API Gateway/i);
    expect(gatewayElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Database Tier/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/PostgreSQL 18 \+ Prisma/i)).toBeInTheDocument();
    });
  });

  it('renders Phase 1 Foundation deliverables checklist', async () => {
    render(<App />);
    expect(screen.getByText(/Phase 1 Foundation Deliverables/i)).toBeInTheDocument();
    expect(screen.getByText(/Clean Monorepo Workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/Tenant Context Isolation/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Ready for Phase 2/i)).toBeInTheDocument();
    });
  });
});
