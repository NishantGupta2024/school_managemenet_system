import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  academicsApi,
  studentsApi,
  UserRole,
  AcademicYear,
  getMyTeacherProfile,
} from '../services/api';
import {
  CreditCard,
  Users,
  GraduationCap,
  Building2,
  Lock,
  ArrowRight,
  Sparkles,
  CalendarCheck,
  FileSpreadsheet,
  Library,
  Layers,
  CheckCircle2,
  Info,
  X,
  Building,
  Bell,
} from 'lucide-react';

interface ModuleLauncherCard {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  iconBg: string;
  badge: string;
  badgeColor: string;
  status: 'OPERATIONAL' | 'ROADMAP';
  allowedRoles: UserRole[];
  keyFeatures: string[];
}

export const MainLauncherDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, selectedSchoolId } = useAuth();

  // Reference state for dashboard indicators
  const [currentSession, setCurrentSession] = useState<AcademicYear | null>(null);
  const [totalStudents, setTotalStudents] = useState<number | null>(null);
  const [totalGrades, setTotalGrades] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(true);
  const [isClassTeacher, setIsClassTeacher] = useState<boolean>(false);

  // Check Class Teacher status for teachers to govern Attendance module visibility
  useEffect(() => {
    let isMounted = true;
    if (user?.role === UserRole.TEACHER) {
      getMyTeacherProfile(user)
        .then((profile) => {
          if (!isMounted) return;
          const hasClassTeacher = Boolean(profile?.assignments?.some((a) => a.isClassTeacher));
          setIsClassTeacher(hasClassTeacher);
        })
        .catch(() => {
          if (!isMounted) return;
          setIsClassTeacher(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Roadmap modal
  const [roadmapModalModule, setRoadmapModalModule] = useState<{
    title: string;
    description: string;
    expectedPhase: string;
    features: string[];
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadOverviewData = async () => {
      setIsLoadingStats(true);
      try {
        const [years, grades, studentsRes] = await Promise.all([
          academicsApi.getAcademicYears().catch(() => []),
          academicsApi.getGrades().catch(() => []),
          studentsApi.getStudents({ page: 1, limit: 1 }).catch(() => null),
        ]);

        if (!isMounted) return;

        const activeYear = years.find((y) => y.isCurrent) || years[0] || null;
        setCurrentSession(activeYear);
        setTotalGrades(grades.length);
        if (studentsRes && studentsRes.meta) {
          setTotalStudents(studentsRes.meta.total);
        }
      } catch (err) {
        console.error('Failed to load launcher summary stats', err);
      } finally {
        if (isMounted) setIsLoadingStats(false);
      }
    };

    loadOverviewData();
    return () => {
      isMounted = false;
    };
  }, [user, selectedSchoolId]);

  const allModules: ModuleLauncherCard[] = [
    {
      id: 'fees',
      title: 'Fee Management',
      description:
        'End-to-end fee structures, student allocations, automated monthly invoicing, cashier collections, Razorpay online gateway, and compact receipt generation.',
      path: '/app/fees',
      icon: <CreditCard className="w-6 h-6 text-emerald-600" />,
      iconBg: 'bg-emerald-50 border-emerald-100',
      badge: 'Live & Operational',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      status: 'OPERATIONAL',
      allowedRoles: [
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
        UserRole.FEE_STAFF,
        UserRole.STUDENT,
        UserRole.PARENT,
      ],
      keyFeatures: [
        'Multi-frequency billing heads',
        'Student concession policies',
        'Cashier collection & reversals',
        'Razorpay online payment',
      ],
    },
    {
      id: 'students',
      title: 'Student & Admissions',
      description:
        'Authoritative institutional student identity, paperless admissions, demographic tracking, safe guardian updating, and live fee statements.',
      path: '/app/students',
      icon: <Users className="w-6 h-6 text-indigo-600" />,
      iconBg: 'bg-indigo-50 border-indigo-100',
      badge: 'Live & Operational',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      status: 'OPERATIONAL',
      allowedRoles: [
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
        UserRole.FEE_STAFF,
      ],
      keyFeatures: [
        'Authoritative student master',
        'Admission number normalization',
        'Safe demographic editing',
        'Live statement slide-out',
      ],
    },
    {
      id: 'academics',
      title: 'Academic Setup',
      description:
        'Academic sessions lifecycle, grade class hierarchy, section allocations, capacity management, and financial dependency guards.',
      path: '/app/academics',
      icon: <GraduationCap className="w-6 h-6 text-purple-600" />,
      iconBg: 'bg-purple-50 border-purple-100',
      badge: 'Live & Operational',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      status: 'OPERATIONAL',
      allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN],
      keyFeatures: [
        'Multi-session management',
        'Grade classes & sections',
        'Session closure protection',
        'Capacity validation',
      ],
    },
    {
      id: 'users',
      title: 'User Accounts & Access',
      description:
        'Manage staff login credentials, provision student portal accounts, and link verified parent relationships with tenant-scoped boundaries.',
      path: '/app/users',
      icon: <Lock className="w-6 h-6 text-indigo-600" />,
      iconBg: 'bg-indigo-50 border-indigo-100',
      badge: 'Live & Operational',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      status: 'OPERATIONAL',
      allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN],
      keyFeatures: [
        'Fee staff credentials',
        'Student portal provisioning',
        'Parent child linking',
        'Account status toggling',
      ],
    },
    {
      id: 'notifications',
      title: 'Notifications & Communications',
      description:
        'Manage institutional email notifications, notification preferences, delivery audit logs, and communication channel status.',
      path: '/app/notifications',
      icon: <Bell className="w-6 h-6 text-amber-600" />,
      iconBg: 'bg-amber-50 border-amber-100',
      badge: 'Live & Operational',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      status: 'OPERATIONAL',
      allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN],
      keyFeatures: [
        'Automated fee reminders',
        'Exam results & absence alerts',
        'Delivery audit logs & filters',
        'SMTP & WhatsApp channel status',
      ],
    },
    {
      id: 'admin',
      title: 'Platform Administration',
      description:
        'Global school tenant onboarding, institutional configuration, and cross-tenant context switcher for platform administrators.',
      path: '/app/admin',
      icon: <Building2 className="w-6 h-6 text-amber-600" />,
      iconBg: 'bg-amber-50 border-amber-100',
      badge: 'Super Admin Only',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      status: 'OPERATIONAL',
      allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN],
      keyFeatures: [
        'School onboarding wizard',
        'Tenant context switcher',
        'Global schools directory',
        'Cryptographic config',
      ],
    },
    {
      id: 'teachers',
      title: 'Teacher & Staff Management',
      description:
        'Faculty records, subject assignments, department allocations, and staff workload distribution linked to classes.',
      path: '/app/teachers',
      icon: <GraduationCap className="w-6 h-6 text-teal-600" />,
      iconBg: 'bg-teal-50 border-teal-100',
      badge: 'Live & Operational',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      status: 'OPERATIONAL',
      allowedRoles: [
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
        UserRole.FEE_STAFF,
        UserRole.TEACHER,
      ],
      keyFeatures: [
        'Faculty profiles',
        'Subject assignments',
        'Class teacher designation',
        'Staff credentials',
      ],
    },
    {
      id: 'attendance',
      title: 'Attendance Management',
      description:
        'Daily student roll-call registers, section attendance marking, authorized audit corrections, and student attendance history analytics.',
      path: '/app/attendance',
      icon: <CalendarCheck className="w-6 h-6 text-blue-600" />,
      iconBg: 'bg-blue-50 border-blue-100',
      badge: 'Operational',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      status: 'OPERATIONAL',
      allowedRoles: [
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
        UserRole.FEE_STAFF,
        UserRole.TEACHER,
      ],
      keyFeatures: [
        'Daily roll-call registers',
        'Section attendance marking',
        'Audit correction logs',
        'Student history analytics',
      ],
    },
    {
      id: 'examinations',
      title: 'Examinations & Grading',
      description:
        'Curriculum chapters, MCQ assessment builder, Excel question import, live online tests, autosave submissions, and student scorecards.',
      path: '/app/examinations',
      icon: <FileSpreadsheet className="w-6 h-6 text-indigo-600" />,
      iconBg: 'bg-indigo-50 border-indigo-100',
      badge: 'Operational',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      status: 'OPERATIONAL',
      allowedRoles: [
        UserRole.PLATFORM_SUPER_ADMIN,
        UserRole.SCHOOL_ADMIN,
        UserRole.FEE_STAFF,
        UserRole.TEACHER,
        UserRole.STUDENT,
        UserRole.PARENT,
      ],
      keyFeatures: [
        'Curriculum chapters & syllabus',
        'MCQ assessment builder & Excel import',
        'Online quizzes & live examinations',
        'Student & parent results release',
      ],
    },
    {
      id: 'library',
      title: 'Library Management',
      description:
        'Book cataloging with ISBN tracking, student checkout/return workflows, and automated overdue fines integrated with fee ledger.',
      path: '',
      icon: <Library className="w-6 h-6 text-slate-500" />,
      iconBg: 'bg-slate-100 border-slate-200',
      badge: 'Roadmap',
      badgeColor: 'bg-slate-100 text-slate-600 border-slate-200',
      status: 'ROADMAP',
      allowedRoles: [UserRole.PLATFORM_SUPER_ADMIN, UserRole.SCHOOL_ADMIN],
      keyFeatures: [
        'ISBN cataloging',
        'Issue & return records',
        'Overdue fine integration',
        'Inventory audit',
      ],
    },
  ];

  // Filter modules based on user authorization
  const authorizedModules = allModules.filter((mod) => {
    if (!user || !user.role) return false;
    if (!mod.allowedRoles.includes(user.role)) return false;

    // Special policy for Attendance Management:
    // Teachers may only see Attendance Management if they hold at least one Class Teacher assignment
    if (mod.id === 'attendance' && user.role === UserRole.TEACHER) {
      return isClassTeacher;
    }

    return true;
  });

  const getExpectedPhase = (id: string): string => {
    switch (id) {
      case 'teachers':
        return 'Phase 3: Academic Operations & Staff Roster';
      case 'examinations':
        return 'Phase 4: Examinations & Gradebook Management';
      case 'library':
        return 'Phase 5: Library Cataloging & Overdue Ledger';
      case 'portals':
        return 'Phase 6: Dedicated Student & Parent Portals';
      default:
        return 'Next Roadmap Phase';
    }
  };

  const handleModuleClick = (mod: ModuleLauncherCard) => {
    if (mod.status === 'OPERATIONAL') {
      navigate(mod.path);
    } else {
      setRoadmapModalModule({
        title: mod.title,
        description: mod.description,
        expectedPhase: getExpectedPhase(mod.id),
        features: mod.keyFeatures,
      });
    }
  };

  const schoolName =
    user?.schoolName ||
    (user?.role === UserRole.PLATFORM_SUPER_ADMIN
      ? selectedSchoolId
        ? 'Administering Target School'
        : 'Platform Global Administration'
      : 'Institutional Campus');

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* 1. Welcome Header Card */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                {user?.role ? user.role.replace(/_/g, ' ') : 'Institutional User'}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                {schoolName}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome back, {user?.name || 'Administrator'}
            </h1>

            <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
              Unified School ERP System Launcher. Select any authorized module workspace below to manage departmental operations on the shared institutional data foundation.
            </p>
          </div>

          {/* Quick Context Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Academic Session
              </span>
              <strong className="text-xs sm:text-sm font-bold text-slate-800 truncate block mt-0.5">
                {currentSession ? currentSession.name : 'Active Session'}
              </strong>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total Classes
              </span>
              <strong className="text-xs sm:text-sm font-bold text-slate-800 block mt-0.5">
                {isLoadingStats ? '...' : totalGrades !== null ? totalGrades : 'Configured'}
              </strong>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-center col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Enrolled Students
              </span>
              <strong className="text-xs sm:text-sm font-bold text-slate-800 block mt-0.5">
                {isLoadingStats ? '...' : totalStudents !== null ? totalStudents : 'Active'}
              </strong>
            </div>
          </div>
        </div>

        {/* Decorative corner element */}
        <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-br from-indigo-50/50 to-purple-50/20 rounded-full blur-2xl pointer-events-none -mr-20 -mt-20" />
      </div>

      {/* 2. System Launcher Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>ERP System Workspaces</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Authoritative modules available for your authenticated role. Click any card to launch its workspace.
            </p>
          </div>

          <span className="text-xs font-semibold text-slate-400 hidden sm:inline">
            {authorizedModules.filter((m) => m.status === 'OPERATIONAL').length} Active Workspaces
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {authorizedModules.map((mod) => {
            const isLive = mod.status === 'OPERATIONAL';
            return (
              <div
                key={mod.id}
                role="button"
                tabIndex={0}
                aria-label={`Launch ${mod.title}`}
                onClick={() => handleModuleClick(mod)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleModuleClick(mod);
                  }
                }}
                className={`bg-white rounded-3xl border p-6 flex flex-col justify-between transition-all cursor-pointer group ${
                  isLive
                    ? 'border-slate-200 hover:border-indigo-400 hover:shadow-lg hover:shadow-indigo-500/5'
                    : 'border-slate-200/80 bg-slate-50/50 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Bar: Icon & Badge */}
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-2xl border ${mod.iconBg}`}>
                      {mod.icon}
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border ${mod.badgeColor}`}
                    >
                      {mod.badge}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3
                    className={`text-lg font-bold tracking-tight transition-colors ${
                      isLive ? 'text-slate-900 group-hover:text-indigo-600' : 'text-slate-700'
                    }`}
                  >
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    {mod.description}
                  </p>

                  {/* Feature Bullets */}
                  <div className="mt-4 space-y-1.5 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    {mod.keyFeatures.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isLive ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                  {isLive ? (
                    <span className="text-indigo-600 group-hover:text-indigo-700 flex items-center gap-1.5 transition-colors">
                      <span>Launch Workspace</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  ) : (
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Info className="w-4 h-4" />
                      <span>Roadmap Preview</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Planned Roadmap Modal */}
      {roadmapModalModule && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {roadmapModalModule.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-semibold text-indigo-600">
                      Roadmap Module Preview
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {roadmapModalModule.expectedPhase}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setRoadmapModalModule(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {roadmapModalModule.description}
            </p>

            <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Planned Functional Capabilities:
              </span>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {roadmapModalModule.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setRoadmapModalModule(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
