import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Lock, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Teacher, getMyTeacherProfile } from '../services/api';
import { AttendanceRegisterView } from './AttendanceRegisterView';

export const AttendanceManagementWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(user?.role === UserRole.TEACHER);
  const [teacherProfile, setTeacherProfile] = useState<Teacher | null>(null);
  const [hasClassTeacherAssignment, setHasClassTeacherAssignment] = useState<boolean>(
    user?.role !== UserRole.TEACHER,
  );

  useEffect(() => {
    let isMounted = true;
    if (user?.role === UserRole.TEACHER) {
      getMyTeacherProfile(user)
        .then((profile) => {
          if (!isMounted) return;
          setTeacherProfile(profile);
          const hasClassTeacher = Boolean(profile?.assignments?.some((a) => a.isClassTeacher));
          setHasClassTeacherAssignment(hasClassTeacher);
        })
        .catch(() => {
          if (!isMounted) return;
          setHasClassTeacherAssignment(false);
        })
        .finally(() => {
          if (isMounted) setIsLoadingProfile(false);
        });
    } else {
      setIsLoadingProfile(false);
    }
    return () => {
      isMounted = false;
    };
  }, [user]);

  const isRoleAuthorized =
    user?.role === UserRole.PLATFORM_SUPER_ADMIN ||
    user?.role === UserRole.SCHOOL_ADMIN ||
    user?.role === UserRole.FEE_STAFF ||
    user?.role === UserRole.TEACHER;

  if (!isRoleAuthorized) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mx-auto">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Access Restricted</h3>
        <p className="text-xs text-slate-500">
          Your authenticated role ({user?.role}) is not authorized to access the Attendance Management workspace.
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

  if (isLoadingProfile) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-lg mx-auto my-12 space-y-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-500 font-medium">Verifying faculty class assignment credentials...</p>
      </div>
    );
  }

  if (user?.role === UserRole.TEACHER && !hasClassTeacherAssignment) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl w-fit mx-auto border border-amber-200">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800">Class Teacher Assignment Required</h3>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          Daily attendance marking and register management is restricted to designated <strong>Class Teachers</strong>.
          You currently do not hold an active Class Teacher assignment for any section.
        </p>
        <div className="pt-2">
          <button
            onClick={() => navigate('/app')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            ← Return to System Launcher
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Workspace Navigation Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
              Daily Attendance & Roll-Call Registers
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">
              Classroom roll-call, section attendance marking, audit corrections, and student history
            </span>
          </div>
        </div>

        <button
          onClick={() => navigate('/app')}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          System Launcher →
        </button>
      </div>

      {/* Main Attendance Module View */}
      <AttendanceRegisterView teacherProfile={teacherProfile} />
    </div>
  );
};
