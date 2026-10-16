import React, { useState, useEffect } from 'react';
import {
  Routes,
  Route,
  Navigate,
  BrowserRouter,
  useInRouterContext,
} from 'react-router-dom';
import { Header } from './components/Header';
import { HealthStatus } from './components/HealthStatus';
import { FeeHeadsView } from './components/FeeHeadsView';
import { FeeStructuresView } from './components/FeeStructuresView';
import { StudentAllocationsView } from './components/StudentAllocationsView';
import { FeeGenerationView } from './components/FeeGenerationView';
import { StudentStatementView } from './components/StudentStatementView';
import { ExcelImportView } from './components/ExcelImportView';
import { FineConfigurationView } from './components/FineConfigurationView';
import { LoginView } from './components/LoginView';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider, useAuth, useOptionalAuth } from './context/AuthContext';
import { UserRole } from './services/api';
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
  Scale,
  Building,
} from 'lucide-react';

export type ActiveTab =
  | 'overview'
  | 'fee-heads'
  | 'fee-structures'
  | 'student-allocations'
  | 'fee-generation'
  | 'student-statements'
  | 'excel-imports'
  | 'fine-configuration';

interface TabDefinition {
  id: ActiveTab;
  label: string;
  icon: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ALL_TABS: TabDefinition[] = [
  {
    id: 'overview',
    label: 'Overview & Health',
    icon: <Activity className="w-4 h-4" />,
  },
  {
    id: 'fee-heads',
    label: 'Fee Heads',
    icon: <Tag className="w-4 h-4" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF],
  },
  {
    id: 'fee-structures',
    label: 'Fee Structures',
    icon: <Layers className="w-4 h-4" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF],
  },
  {
    id: 'student-allocations',
    label: 'Student Allocations',
    icon: <UserCheck className="w-4 h-4" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF],
  },
  {
    id: 'fee-generation',
    label: 'Monthly Invoicing',
    icon: <Sparkles className="w-4 h-4 text-indigo-500" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF],
  },
  {
    id: 'student-statements',
    label: 'Fee Statements',
    icon: <FileText className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: 'excel-imports',
    label: 'Excel Imports',
    icon: <FileSpreadsheet className="w-4 h-4 text-indigo-500" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF],
  },
  {
    id: 'fine-configuration',
    label: 'Fine Rules',
    icon: <Scale className="w-4 h-4 text-amber-500" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN],
  },
];

export const DashboardView: React.FC = () => {
  const { user, selectedSchoolId, setSelectedSchoolId } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [superAdminSchoolInput, setSuperAdminSchoolInput] = useState('');

  // Filter tabs according to authenticated user role
  const accessibleTabs = ALL_TABS.filter((tab) => {
    if (!user || !user.role || !tab.allowedRoles) return true;
    return tab.allowedRoles.includes(user.role);
  });

  const canAccess = (tabId: ActiveTab) => {
    return accessibleTabs.some((t) => t.id === tabId);
  };

  // If the active tab is not in accessible tabs, redirect to overview
  useEffect(() => {
    if (!accessibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [accessibleTabs, activeTab]);

  const isPlatformSuperAdmin = user?.role === UserRole.PLATFORM_SUPER_ADMIN;
  const isSchoolContextMissing = isPlatformSuperAdmin && !selectedSchoolId && activeTab !== 'overview';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header />

      {/* Platform Super Admin Tenant Switcher */}
      {isPlatformSuperAdmin && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <span className="font-semibold px-2 py-0.5 bg-amber-200 text-amber-800 rounded">
                Platform Super Admin
              </span>
              <span>
                Backend school directory API pending. Specify a target School ID (UUID) for school-level operations:
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={superAdminSchoolInput}
                onChange={(e) => setSuperAdminSchoolInput(e.target.value)}
                placeholder="Target School UUID"
                aria-label="Target School UUID"
                className="px-3 py-1 bg-white border border-amber-300 rounded text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none w-64 font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  if (superAdminSchoolInput.trim()) {
                    setSelectedSchoolId(superAdminSchoolInput.trim());
                  }
                }}
                className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded font-medium transition-colors"
              >
                Set Context
              </button>
              {selectedSchoolId && (
                <button
                  type="button"
                  onClick={() => {
                    setSuperAdminSchoolInput('');
                    setSelectedSchoolId(null);
                  }}
                  className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded transition-colors"
                >
                  Clear ({selectedSchoolId.slice(0, 8)}...)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[73px] z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-1 sm:space-x-8 overflow-x-auto py-2">
            {accessibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {isSchoolContextMissing ? (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8 text-center max-w-xl mx-auto my-12">
            <Building className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-800 mb-2">Target School Context Required</h3>
            <p className="text-sm text-slate-600 mb-4">
              As a Platform Super Admin without a fixed tenant, please input a target School UUID in the context bar above before accessing school-scoped data.
            </p>
            <button
              onClick={() => setActiveTab('overview')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
            >
              Return to Overview & System Health
            </button>
          </div>
        ) : (
          <>
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
                      {canAccess('fee-heads') && (
                        <button
                          onClick={() => setActiveTab('fee-heads')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 transition-colors shadow-sm"
                        >
                          <Tag className="w-3.5 h-3.5 text-indigo-600" />
                          Manage Fee Heads
                        </button>
                      )}
                      {canAccess('fee-structures') && (
                        <button
                          onClick={() => setActiveTab('fee-structures')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 transition-colors"
                        >
                          <Layers className="w-3.5 h-3.5 text-indigo-200" />
                          Class Fee Structures
                        </button>
                      )}
                      {canAccess('student-allocations') && (
                        <button
                          onClick={() => setActiveTab('student-allocations')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 transition-colors"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-indigo-200" />
                          Assign Students
                        </button>
                      )}
                      {canAccess('fee-generation') && (
                        <button
                          onClick={() => setActiveTab('fee-generation')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                          Generate Invoices
                        </button>
                      )}
                      {canAccess('student-statements') && (
                        <button
                          onClick={() => setActiveTab('student-statements')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5 text-white" />
                          Fee Statements
                        </button>
                      )}
                      {canAccess('excel-imports') && (
                        <button
                          onClick={() => setActiveTab('excel-imports')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
                          Excel Import
                        </button>
                      )}
                      {canAccess('fine-configuration') && (
                        <button
                          onClick={() => setActiveTab('fine-configuration')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                        >
                          <Scale className="w-3.5 h-3.5 text-white" />
                          Fine Configuration
                        </button>
                      )}
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

            {/* Tab 8: Fine Configuration */}
            {activeTab === 'fine-configuration' && <FineConfigurationView />}
          </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        School Fee Management System • Phase 2D Fine Configuration & Late Fine Rules Engine • Multi-Tenant Enterprise Architecture
      </footer>
    </div>
  );
};

const LoginRouteWrapper: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <LoginView />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginRouteWrapper />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardView />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const existingAuth = useOptionalAuth();
  if (existingAuth) {
    return <>{children}</>;
  }
  return <AuthProvider>{children}</AuthProvider>;
};

export const App: React.FC = () => {
  const inRouter = useInRouterContext();

  const content = (
    <AuthWrapper>
      <AppRoutes />
    </AuthWrapper>
  );

  if (!inRouter) {
    return <BrowserRouter>{content}</BrowserRouter>;
  }

  return content;
};

export default App;
