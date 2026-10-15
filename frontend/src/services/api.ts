import axios from 'axios';

// Current active school/tenant (defaulting to Greenwood International Academy for Phase 1)
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_SCHOOL_CODE = 'SCH001';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-school-id': DEFAULT_TENANT_ID,
  },
});

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    status: 'connected' | 'disconnected';
    latencyMs?: number;
    tenantCount?: number;
    userCount?: number;
    studentCount?: number;
  };
  tenantContext: {
    activeSchoolId: string;
  };
}

export const fetchSystemHealth = async (): Promise<HealthResponse> => {
  const response = await api.get<HealthResponse>('/health');
  return response.data;
};

export default api;
