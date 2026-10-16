import React, { useState } from 'react';
import { Header } from './components/Header';
import { HealthStatus } from './components/HealthStatus';
import { FeeHeadsView } from './components/FeeHeadsView';
import { FeeStructuresView } from './components/FeeStructuresView';
import { StudentAllocationsView } from './components/StudentAllocationsView';
import { FeeGenerationView } from './components/FeeGenerationView';
import { StudentStatementView } from './components/StudentStatementView';
import { ExcelImportView } from './components/ExcelImportView';
import {
  CheckCircle,
  Shield,
  Layers,
  Database,
  Lock,
  Activity,
  Tag,
  UserCheck,
  Sparkles,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';

export type ActiveTab =
  | 'overview'
  | 'fee-heads'
  | 'fee-structures'
  | 'student-allocations'
  | 'fee-generation'
  | 'student-statements'
  | 'excel-imports';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header />

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[73px] z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-1 sm:space-x-8 overflow-x-auto py-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'overview'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Activity className="w-4 h-4" />
              Overview & Health
            </button>

            <button
              onClick={() => setActiveTab('fee-heads')}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'fee-heads'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Tag className="w-4 h-4" />
              Fee Heads
            </button>

            <button
              onClick={() => setActiveTab('fee-structures')}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'fee-structures'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Layers className="w-4 h-4" />
              Fee Structures
            </button>

            <button
              onClick={() => setActiveTab('student-allocations')}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'student-allocations'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              Student Allocations
            </button>

            <button
              onClick={() => setActiveTab('fee-generation')}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'fee-generation'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Monthly Invoicing
            </button>

            <button
              onClick={() => setActiveTab('student-statements')}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'student-statements'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <FileText className="w-4 h-4 text-emerald-500" />
              Fee Statements
            </button>

            <button
              onClick={() => setActiveTab('excel-imports')}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'excel-imports'
                  ? 'border-indigo-600 text-indigo-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
              Excel Imports
            </button>
          </nav>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {/* Tab 1: Overview & Health */}
        {activeTab === 'overview' && (
          <div>
            {/* Phase Banner */}
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveTab('fee-heads')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 transition-colors shadow-sm"
                  >
                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                    Manage Fee Heads
                  </button>
                  <button
                    onClick={() => setActiveTab('fee-structures')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-200" />
                    Class Fee Structures
                  </button>
                  <button
                    onClick={() => setActiveTab('student-allocations')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-indigo-200" />
                    Assign Students
                  </button>
                  <button
                    onClick={() => setActiveTab('fee-generation')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                    Generate Invoices
                  </button>
                  <button
                    onClick={() => setActiveTab('student-statements')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-white" />
                    Fee Statements
                  </button>
                  <button
                    onClick={() => setActiveTab('excel-imports')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
                    Excel Import
                  </button>
                </div>
              </div>
            </div>

            {/* Live System Health */}
            <div className="mb-8">
              <HealthStatus />
            </div>

            {/* Phase 1 & 2 Verification Checklist */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                Phase Foundation & Fee Engine Deliverables
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
                    <h4 className="text-sm font-semibold text-slate-800">Fee Configuration Tier (Phase 2B)</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Master Fee Heads, Class Structures with frequencies (Monthly/Annual/One-Time), and Student Fee Allocations with exact concession semantics.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Monthly Invoicing Engine (Phase 2C)</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      12-Month schedule generator (April–March), atomic generation with idempotency, dynamic status derivation, and itemized fee statements.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Fee Heads */}
        {activeTab === 'fee-heads' && <FeeHeadsView />}

        {/* Tab 3: Fee Structures */}
        {activeTab === 'fee-structures' && <FeeStructuresView />}

        {/* Tab 4: Student Allocations */}
        {activeTab === 'student-allocations' && <StudentAllocationsView />}

        {/* Tab 5: Monthly Fee Generation */}
        {activeTab === 'fee-generation' && <FeeGenerationView />}

        {/* Tab 6: Student Fee Statements */}
        {activeTab === 'student-statements' && <StudentStatementView />}

        {/* Tab 7: Excel Data Imports */}
        {activeTab === 'excel-imports' && <ExcelImportView />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        School Fee Management System • Phase 2D Excel Data Import Module • Multi-Tenant Enterprise Architecture
      </footer>
    </div>
  );
};

export default App;
