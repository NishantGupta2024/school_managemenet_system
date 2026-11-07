import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileSpreadsheet,
  Lock,
  CheckCircle2,
  Award,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../services/api';
import { TeacherExaminationView } from './TeacherExaminationView';
import { SchoolAdminExaminationMonitoringView } from './SchoolAdminExaminationMonitoringView';
import { PlatformSuperAdminExaminationMonitoringView } from './PlatformSuperAdminExaminationMonitoringView';
import { StudentExaminationPortal } from './StudentExaminationPortal';
import { ParentExaminationResultsView } from './ParentExaminationResultsView';

export const ExaminationWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isRoleAuthorized =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN ||
    user?.role === UserRole.SCHOOL_ADMIN ||
    user?.role === UserRole.TEACHER ||
    user?.role === UserRole.STUDENT ||
    user?.role === UserRole.PARENT;

  if (!isRoleAuthorized) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4 shadow-xs">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto border border-rose-100">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Your authenticated role (<strong>{user?.role || 'ANONYMOUS'}</strong>) is not authorized to access
          the Examination & Assessment workspace.
        </p>
        <button
          onClick={() => navigate('/app')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          ← Return to System Launcher
        </button>
      </div>
    );
  }

  // Role subtitle and badge helper
  const getRoleHeaderInfo = () => {
    switch (user?.role) {
      case UserRole.TEACHER:
        return {
          title: 'Examinations & Assessments',
          badge: 'Faculty Workspace',
          badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          subtitle: 'Curriculum chapters, assessment drafting, and test scheduling',
        };
      case UserRole.SCHOOL_ADMIN:
        return {
          title: 'Examination Monitoring & Oversight',
          badge: 'School Admin Oversight',
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
          subtitle: 'Institutional test progress, faculty authoring activity, and results release monitoring',
        };
      case UserRole.PLATFORM_SUPER_ADMIN:
        return {
          title: 'Platform Examination Telemetry',
          badge: 'Super Admin Monitoring',
          badgeColor: 'bg-slate-900 text-white border-slate-700',
          subtitle: 'Multi-tenant examination telemetry, school adoption, and system health',
        };
      case UserRole.STUDENT:
        return {
          title: 'Student Examination Portal',
          badge: 'Student Portal',
          badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
          subtitle: 'Scheduled assessments, autosaving quiz runner, and published scorecards',
        };
      case UserRole.PARENT:
        return {
          title: 'Ward Assessment Scorecards',
          badge: 'Parent Portal',
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
          subtitle: 'Verified academic performance summaries and milestone scorecards',
        };
      default:
        return {
          title: 'Examinations & Assessments',
          badge: 'Examination Module',
          badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
          subtitle: 'Assessment platform',
        };
    }
  };

  const headerInfo = getRoleHeaderInfo();

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------- */}
      {/* 1. Top Workspace Navigation Bar                                     */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app')}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Return to System Launcher"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Systems</span>
          </button>
          <div className="h-6 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                  {headerInfo.title}
                </h2>
                <span className={`px-2 py-0.5 text-[10px] font-bold border rounded-full ${headerInfo.badgeColor}`}>
                  {headerInfo.badge}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                {headerInfo.subtitle}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/app')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors hidden sm:block"
          >
            System Launcher →
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 2. Role-Enforced Content Separation                                 */}
      {/* ------------------------------------------------------------------- */}

      {/* ROLE 1: TEACHER -> Dedicated Teacher Assessment Management */}
      {user?.role === UserRole.TEACHER && (
        <div className="space-y-6">
          <TeacherExaminationView />
        </div>
      )}

      {/* ROLE 2: SCHOOL_ADMIN -> Dedicated School Examination Monitoring Dashboard */}
      {user?.role === UserRole.SCHOOL_ADMIN && (
        <div className="space-y-6">
          <SchoolAdminExaminationMonitoringView />
        </div>
      )}

      {/* ROLE 3: PLATFORM_SUPER_ADMIN -> Dedicated Platform Telemetry & Monitoring */}
      {user?.role === UserRole.PLATFORM_SUPER_ADMIN && (
        <div className="space-y-6">
          <PlatformSuperAdminExaminationMonitoringView />
        </div>
      )}

      {/* ROLE 4: STUDENT -> Dedicated Operational Student Examination Portal */}
      {user?.role === UserRole.STUDENT && (
        <div className="space-y-6">
          {/* Student Workflow Overview Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Available Assessments</h4>
                <p className="text-[11px] text-slate-500 leading-tight">Assigned tests for your grade</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Autosave Quiz Runner</h4>
                <p className="text-[11px] text-slate-500 leading-tight">Server timer and real-time persistence</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Released Results</h4>
                <p className="text-[11px] text-slate-500 leading-tight">Official published scorecards</p>
              </div>
            </div>
          </div>

          <StudentExaminationPortal />
        </div>
      )}

      {/* ROLE 5: PARENT -> Parent Portal */}
      {user?.role === UserRole.PARENT && (
        <ParentExaminationResultsView />
      )}
    </div>
  );
};

export default ExaminationWorkspace;
