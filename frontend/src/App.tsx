import React from 'react';
import { Header } from './components/Header';
import { HealthStatus } from './components/HealthStatus';
import { CheckCircle, Shield, Layers, Database, Lock, ArrowRight } from 'lucide-react';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {/* Phase 1 Banner */}
        <div className="bg-gradient-to-r from-brand-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-8 shadow-xl mb-8 relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur border border-white/20 text-indigo-200 mb-4">
              <Shield className="w-3.5 h-3.5 text-indigo-300" />
              Phase 1 Architecture Foundation Completed
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight">
              School Fee Management System
            </h2>
            <p className="mt-2 text-indigo-100 text-sm leading-relaxed">
              Clean architecture foundation configured with NestJS 11, React 18, PostgreSQL 18, and Prisma ORM.
              Multi-tenancy context isolation via <code className="bg-white/20 px-1 py-0.5 rounded text-white font-mono text-xs">AsyncLocalStorage</code> is operational and verified.
            </p>
          </div>
        </div>

        {/* Live System Health */}
        <div className="mb-8">
          <HealthStatus />
        </div>

        {/* Phase 1 Verification Checklist */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            Phase 1 Foundation Deliverables
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Clean Monorepo Workspace</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Decoupled <code className="font-mono">backend</code> and <code className="font-mono">frontend</code> packages with unified npm workspace scripts.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Tenant Context Isolation</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  AsyncLocalStorage middleware automatically propagates <code className="font-mono">schoolId</code> across asynchronous execution chains.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Prisma Multi-Tenant Models</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  PostgreSQL relational schema with <code className="font-mono">School</code>, <code className="font-mono">User</code>, <code className="font-mono">AcademicYear</code>, <code className="font-mono">GradeClass</code>, <code className="font-mono">Section</code>, <code className="font-mono">Student</code>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                <ArrowRight className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Ready for Phase 2</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Awaiting sign-off before implementing Fee Engine, Fee Heads, Structure rules, and Ledger calculations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        School Fee Management System • Phase 1 Foundation • Multi-Tenant Enterprise Architecture
      </footer>
    </div>
  );
};

export default App;
