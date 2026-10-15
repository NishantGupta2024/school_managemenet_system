import React, { useEffect, useState } from 'react';
import { Database, Server, RefreshCw, CheckCircle2, XCircle, Clock, Building2, Users, GraduationCap } from 'lucide-react';
import { fetchSystemHealth, HealthResponse, DEFAULT_TENANT_ID } from '../services/api';

export const HealthStatus: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSystemHealth();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Backend unreachable';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            System Health & Infrastructure Telemetry
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time verification of frontend, backend API gateway, and PostgreSQL data tier
          </p>
        </div>
        <button
          onClick={checkHealth}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Checks</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {/* Frontend Layer */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Frontend Tier</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-4">
            <div className="text-base font-bold text-slate-800">React + Vite</div>
            <div className="text-xs text-slate-500 mt-1">TypeScript 5 • Tailwind CSS</div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
            <span className="text-slate-500">Status</span>
            <span className="font-semibold text-emerald-700">Online</span>
          </div>
        </div>

        {/* Backend Layer */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">API Gateway</span>
            {error ? (
              <XCircle className="w-5 h-5 text-rose-500" />
            ) : (
              <Server className="w-5 h-5 text-emerald-600" />
            )}
          </div>
          <div className="mt-4">
            <div className="text-base font-bold text-slate-800">NestJS Core</div>
            <div className="text-xs text-slate-500 mt-1">
              Prefix: <code className="bg-slate-200/60 px-1 py-0.5 rounded text-[11px]">/api/v1</code>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
            <span className="text-slate-500">Status</span>
            <span className={`font-semibold ${error ? 'text-rose-600' : 'text-emerald-700'}`}>
              {error ? 'Unreachable' : health ? 'Connected' : 'Checking...'}
            </span>
          </div>
        </div>

        {/* Database Layer */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Database Tier</span>
            {health?.database.status === 'connected' ? (
              <Database className="w-5 h-5 text-emerald-600" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-500" />
            )}
          </div>
          <div className="mt-4">
            <div className="text-base font-bold text-slate-800">PostgreSQL 18 + Prisma</div>
            <div className="text-xs text-slate-500 mt-1">
              Latency: {health?.database.latencyMs !== undefined ? `${health.database.latencyMs} ms` : 'N/A'}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
            <span className="text-slate-500">Prisma Status</span>
            <span className={`font-semibold ${health?.database.status === 'connected' ? 'text-emerald-700' : 'text-amber-600'}`}>
              {health?.database.status || 'Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Database Entity Counts (Phase 1 Baseline) */}
      {health && (
        <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Database Seed & Tenant Isolation Telemetry
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Schools/Tenants</span>
                <span className="text-sm font-bold text-slate-900">{health.database.tenantCount ?? 0}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Staff / Users</span>
                <span className="text-sm font-bold text-slate-900">{health.database.userCount ?? 0}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Enrolled Students</span>
                <span className="text-sm font-bold text-slate-900">{health.database.studentCount ?? 0}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs text-slate-500 block">API Uptime</span>
                <span className="text-sm font-bold text-slate-900">{Math.floor(health.uptime)}s</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Context Footer */}
      <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-100 gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Active Request School ID:</span>
          <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-700">
            {health?.tenantContext.activeSchoolId || DEFAULT_TENANT_ID}
          </code>
        </div>
        <div>
          Last checked: {lastChecked.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
