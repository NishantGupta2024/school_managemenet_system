import React, { useState, useEffect } from 'react';
import {
  Routes,
  Route,
  Navigate,
  BrowserRouter,
  useInRouterContext,
  useNavigate,
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
import { FeeReportsView } from './components/FeeReportsView';
import { PaymentsView } from './components/PaymentsView';
import { SchoolsView } from './components/SchoolsView';
import { UsersView } from './components/UsersView';
import { PaymentGatewaySettingsView } from './components/PaymentGatewaySettingsView';
import { ReceiptSettingsView } from './components/ReceiptSettingsView';
import { NotificationSettingsView } from './components/NotificationSettingsView';
import { AcademicSetupView } from './components/AcademicSetupView';
import { StudentsManagementView } from './components/StudentsManagementView';
import { TeachersManagementView } from './components/TeachersManagementView';
import { AttendanceManagementWorkspace } from './components/AttendanceManagementWorkspace';
import { ExaminationWorkspace } from './components/ExaminationWorkspace';
import { MainLauncherDashboard } from './components/MainLauncherDashboard';
import { PublicWebsiteView } from './components/PublicWebsiteView';
import { LoginView } from './components/LoginView';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TenantContextGate } from './components/TenantContextGate';
import { AuthProvider, useAuth, useOptionalAuth } from './context/AuthContext';
import { UserRole } from './services/api';
import {
  Shield,
  Layers,
  Activity,
  Tag,
  UserCheck,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Scale,
  Building2,
  BarChart3,
  CreditCard,
  Users,
  GraduationCap,
  Lock,
  Bell,
} from 'lucide-react';

export type ActiveFeeTab =
  | 'overview'
  | 'payments'
  | 'fee-heads'
  | 'fee-structures'
  | 'student-allocations'
  | 'fee-generation'
  | 'student-statements'
  | 'excel-imports'
  | 'fine-configuration'
  | 'reports'
  | 'receipt-settings'
  | 'payment-gateway'
  | 'notifications';

interface FeeTabDefinition {
  id: ActiveFeeTab;
  label: string;
  icon: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ALL_FEE_TABS: FeeTabDefinition[] = [
  {
    id: 'overview',
    label: 'Overview & Health',
    icon: <Activity className="w-4 h-4" />,
  },
  {
    id: 'payments',
    label: 'Payments & Receipts',
    icon: <CreditCard className="w-4 h-4 text-emerald-600" />,
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
  {
    id: 'reports',
    label: 'Fee Reports',
    icon: <BarChart3 className="w-4 h-4 text-blue-600" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.FEE_STAFF],
  },
  {
    id: 'receipt-settings',
    label: 'Receipt Settings',
    icon: <FileText className="w-4 h-4 text-indigo-600" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN],
  },
  {
    id: 'payment-gateway',
    label: 'Payment Gateway',
    icon: <CreditCard className="w-4 h-4 text-purple-600" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell className="w-4 h-4 text-amber-600" />,
    allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN],
  },
];

// =========================================================================
// 1. Fee Management Workspace
// =========================================================================
export const FeeManagementWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveFeeTab>('overview');

  // Filter tabs by role
  const accessibleTabs = ALL_FEE_TABS.filter((tab) => {
    if (!user || !user.role || !tab.allowedRoles) return true;
    return tab.allowedRoles.includes(user.role);
  });

  const canAccess = (tabId: ActiveFeeTab) => {
    return accessibleTabs.some((t) => t.id === tabId);
  };

  useEffect(() => {
    if (!accessibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [accessibleTabs, activeTab]);

  return (
    <div className="space-y-6">
      {/* Module Workspace Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
              Fee Management Workspace
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate block">
              Invoicing, allocations, payments, receipts, and financial statements
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors self-end sm:self-auto shrink-0"
        >
          System Launcher →
        </button>
      </div>

      {/* Fee Module Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <nav className="flex space-x-1 overflow-x-auto p-1.5 bg-slate-50/50">
          {accessibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-2.5 px-3.5 rounded-xl font-medium text-xs whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Contents */}
      <>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur border border-white/20 text-indigo-200 mb-4">
                <Shield className="w-3.5 h-3.5 text-indigo-300" />
                Fee Engine & Financial Ledger Active
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Fee Management Workspace
              </h2>
              <p className="mt-2 text-indigo-100 text-sm leading-relaxed max-w-2xl">
                Automated monthly invoicing, cashier collections, receipt numbering, online gateway settlement, and real-time student statements.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveTab('payments')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 transition-colors shadow-sm"
                >
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  Payments & Receipts Desk
                </button>
                {canAccess('fee-heads') && (
                  <button
                    onClick={() => setActiveTab('fee-heads')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
                  >
                    <Tag className="w-3.5 h-3.5 text-indigo-200" />
                    Fee Heads
                  </button>
                )}
                {canAccess('fee-structures') && (
                  <button
                    onClick={() => setActiveTab('fee-structures')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-200" />
                    Fee Structures
                  </button>
                )}
              </div>
            </div>
            <HealthStatus />
          </div>
        )}

        {activeTab === 'payments' && <PaymentsView />}
        {activeTab === 'fee-heads' && <FeeHeadsView />}
        {activeTab === 'fee-structures' && <FeeStructuresView />}
        {activeTab === 'student-allocations' && <StudentAllocationsView />}
        {activeTab === 'fee-generation' && <FeeGenerationView />}
        {activeTab === 'student-statements' && <StudentStatementView />}
        {activeTab === 'excel-imports' && <ExcelImportView />}
        {activeTab === 'fine-configuration' && <FineConfigurationView />}
        {activeTab === 'reports' && <FeeReportsView />}
        {activeTab === 'receipt-settings' && <ReceiptSettingsView />}
        {activeTab === 'payment-gateway' && <PaymentGatewaySettingsView />}
        {activeTab === 'notifications' && <NotificationSettingsView />}
      </>
    </div>
  );
};

// =========================================================================
// 2. Student Management Workspace
// =========================================================================
export const StudentManagementWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAuthorized =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN ||
    user?.role === UserRole.SCHOOL_ADMIN ||
    user?.role === UserRole.FEE_STAFF;

  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-500">
          Your authenticated role ({user?.role}) is not authorized to access Student Admissions & Management.
        </p>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
        >
          ← Return to System Launcher
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Workspace Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
              Student Management Workspace
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate block">
              Authoritative institutional directory, admissions, and profile statements
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors self-end sm:self-auto shrink-0"
        >
          System Launcher →
        </button>
      </div>

      <StudentsManagementView />
    </div>
  );
};

// =========================================================================
// 3. Academic Setup Workspace
// =========================================================================
export const AcademicSetupWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAuthorized =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN || user?.role === UserRole.SCHOOL_ADMIN;

  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-500">
          Your authenticated role ({user?.role}) is not authorized to access Academic Setup & Session Configuration.
        </p>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
        >
          ← Return to System Launcher
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Workspace Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
              Academic Setup & Governance
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate block">
              Academic session lifecycles, grade levels, and section allocations
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors self-end sm:self-auto shrink-0"
        >
          System Launcher →
        </button>
      </div>

      <AcademicSetupView />
    </div>
  );
};

// =========================================================================
// 4. User Accounts Workspace
// =========================================================================
export const UserManagementWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAuthorized =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN || user?.role === UserRole.SCHOOL_ADMIN;

  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-500">
          User account management is restricted to School Administrators and Super Administrators.
        </p>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
        >
          ← Return to System Launcher
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
              User Accounts & Access Management
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate block">
              Fee staff accounts, student portal credentials, and parent-student linkages
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors self-end sm:self-auto shrink-0"
        >
          System Launcher →
        </button>
      </div>

      <UsersView />
    </div>
  );
};

// =========================================================================
// 4b. Notification & Communications Workspace
// =========================================================================
export const NotificationManagementWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAuthorized =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN || user?.role === UserRole.SCHOOL_ADMIN;

  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-500">
          Notification settings and delivery logs are restricted to School Administrators and Super Administrators.
        </p>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
        >
          ← Return to System Launcher
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
              Notifications & Communications
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate block">
              Automated email alerts, notification preferences, delivery logs, and channel status
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors self-end sm:self-auto shrink-0"
        >
          System Launcher →
        </button>
      </div>

      <NotificationSettingsView />
    </div>
  );
};

// =========================================================================
// 5. Platform Admin Workspace
// =========================================================================
export const PlatformAdminWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user?.role !== UserRole.PLATFORM_SUPER_ADMIN) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Platform Super Admin Only</h3>
        <p className="text-xs text-slate-500">
          This workspace is restricted exclusively to Root Platform Super Administrators.
        </p>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
        >
          ← Return to System Launcher
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
              Platform Administration
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate block">
              Global school tenant directory, school onboarding, and system health
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors self-end sm:self-auto shrink-0"
        >
          System Launcher →
        </button>
      </div>

      <SchoolsView />
    </div>
  );
};

// =========================================================================
// 6. Teacher Management Workspace
// =========================================================================
export const TeacherManagementWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAuthorized =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN ||
    user?.role === UserRole.SCHOOL_ADMIN ||
    user?.role === UserRole.FEE_STAFF ||
    user?.role === UserRole.TEACHER;

  if (!isAuthorized) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-500">
          Your authenticated role ({user?.role}) is not authorized to access Teacher & Staff Management.
        </p>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
        >
          ← Return to System Launcher
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Workspace Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-2 bg-teal-50 text-teal-600 rounded-xl border border-teal-100 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
              Teacher & Staff Management
            </h2>
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate block">
              Faculty directory, classroom assignments, designations, and portal provisioning
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors self-end sm:self-auto shrink-0"
        >
          System Launcher →
        </button>
      </div>

      <TeachersManagementView />
    </div>
  );
};

export { AttendanceManagementWorkspace } from './components/AttendanceManagementWorkspace';
export { ExaminationWorkspace } from './components/ExaminationWorkspace';

// =========================================================================
// 7. ERP Workspace Shell (Protected Shell for /app/*)
// =========================================================================
export const ERPWorkspaceShell: React.FC = () => {
  const { user, selectedSchoolId } = useAuth();
  const tenantKey = user?.role === UserRole.PLATFORM_SUPER_ADMIN ? (selectedSchoolId || 'no-tenant') : 'tenant';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-8 overflow-x-hidden">
        <div key={tenantKey} className="w-full">
          <Routes>
            <Route index element={<MainLauncherDashboard />} />
            <Route path="dashboard" element={<MainLauncherDashboard />} />
            <Route
              path="fees/*"
              element={
                <TenantContextGate moduleName="Fee Management" moduleDescription="Invoicing, allocations, payments, receipts, and financial statements operate strictly on active school tenant records.">
                  <FeeManagementWorkspace />
                </TenantContextGate>
              }
            />
            <Route
              path="students/*"
              element={
                <TenantContextGate moduleName="Student Directory & Admissions" moduleDescription="Student records, profiles, and institutional enrollments require an active school tenant.">
                  <StudentManagementWorkspace />
                </TenantContextGate>
              }
            />
            <Route
              path="teachers/*"
              element={
                <TenantContextGate moduleName="Teacher & Staff Management" moduleDescription="Faculty rosters, departmental assignments, and class allocations require an active school tenant.">
                  <TeacherManagementWorkspace />
                </TenantContextGate>
              }
            />
            <Route
              path="attendance/*"
              element={
                <TenantContextGate moduleName="Attendance Management" moduleDescription="Daily student roll-call registers and section attendance require an active school tenant.">
                  <AttendanceManagementWorkspace />
                </TenantContextGate>
              }
            />
            <Route
              path="examinations/*"
              element={
                <TenantContextGate moduleName="Examinations & Grading" moduleDescription="MCQ question authoring, student quizzes, and test evaluations require an active school tenant.">
                  <ExaminationWorkspace />
                </TenantContextGate>
              }
            />
            <Route
              path="academics/*"
              element={
                <TenantContextGate moduleName="Academic Setup & Governance" moduleDescription="Academic sessions, grade classes, and classroom sections require an active school tenant.">
                  <AcademicSetupWorkspace />
                </TenantContextGate>
              }
            />
            <Route
              path="users/*"
              element={
                <TenantContextGate moduleName="User Accounts & Access" moduleDescription="Institutional staff credentials, student portals, and parent links require an active school tenant.">
                  <UserManagementWorkspace />
                </TenantContextGate>
              }
            />
            <Route
              path="notifications/*"
              element={
                <TenantContextGate moduleName="Notifications & Communications" moduleDescription="Institutional email notification preferences, delivery audit logs, and communication channels require an active school tenant.">
                  <NotificationManagementWorkspace />
                </TenantContextGate>
              }
            />
            <Route path="admin/*" element={<PlatformAdminWorkspace />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        School ERP Unified Platform • Multi-Tenant Enterprise Monolith Architecture
      </footer>
    </div>
  );
};

// =========================================================================
// 8. Route Wrappers
// =========================================================================
export const PublicWebsiteRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/app" replace />;
  }
  return <PublicWebsiteView />;
};

export const LoginRouteWrapper: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/app" replace />;
  }
  return <LoginView />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* 1. Public Main Website */}
      <Route path="/" element={<PublicWebsiteRoute />} />

      {/* 2. Authentication Login */}
      <Route path="/login" element={<LoginRouteWrapper />} />

      {/* 3. Protected Unified School ERP System */}
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <ERPWorkspaceShell />
          </ProtectedRoute>
        }
      />

      {/* Legacy Fallbacks */}
      <Route path="/dashboard" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
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
