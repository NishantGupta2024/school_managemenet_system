import React, { useState, useEffect } from 'react';
import {
  academicsApi,
  AcademicYear,
  GradeClass,
  Section,
} from '../services/api';
import {
  Calendar,
  GraduationCap,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Users,
  Layers,
  ShieldCheck,
  X,
} from 'lucide-react';

export const AcademicSetupView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'SESSIONS' | 'GRADES'>('SESSIONS');

  // Data states
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [showSessionModal, setShowSessionModal] = useState<boolean>(false);
  const [editingSession, setEditingSession] = useState<AcademicYear | null>(null);
  const [sessionFormData, setSessionFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
  });

  const [showGradeModal, setShowGradeModal] = useState<boolean>(false);
  const [editingGrade, setEditingGrade] = useState<GradeClass | null>(null);
  const [gradeFormData, setGradeFormData] = useState({
    name: '',
    code: '',
  });

  const [showSectionModal, setShowSectionModal] = useState<boolean>(false);
  const [targetGradeForSection, setTargetGradeForSection] = useState<GradeClass | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionFormData, setSectionFormData] = useState({
    name: '',
    capacity: 40,
  });

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'SESSION' | 'GRADE' | 'SECTION';
    id: string;
    name: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const [yearsRes, gradesRes] = await Promise.all([
        academicsApi.getAcademicYears(),
        academicsApi.getGrades(),
      ]);
      setAcademicYears(yearsRes);
      setGrades(gradesRes);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to load academic records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenNewSession = () => {
    setEditingSession(null);
    setSessionFormData({
      name: '',
      startDate: '',
      endDate: '',
      isCurrent: academicYears.length === 0,
    });
    setErrorMessage(null);
    setShowSessionModal(true);
  };

  const handleOpenEditSession = (session: AcademicYear) => {
    setEditingSession(session);
    setSessionFormData({
      name: session.name,
      startDate: session.startDate.split('T')[0],
      endDate: session.endDate.split('T')[0],
      isCurrent: session.isCurrent,
    });
    setErrorMessage(null);
    setShowSessionModal(true);
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (editingSession) {
        await academicsApi.updateAcademicYear(editingSession.id, sessionFormData);
        setSuccessMessage(`Academic session '${sessionFormData.name}' updated successfully.`);
      } else {
        await academicsApi.createAcademicYear(sessionFormData);
        setSuccessMessage(`Academic session '${sessionFormData.name}' created successfully.`);
      }

      setShowSessionModal(false);
      await loadData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to save academic session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetCurrentSession = async (session: AcademicYear) => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await academicsApi.setCurrentAcademicYear(session.id);
      setSuccessMessage(`Academic session '${session.name}' is now the active current session.`);
      await loadData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to activate session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenNewGrade = () => {
    setEditingGrade(null);
    setGradeFormData({ name: '', code: '' });
    setErrorMessage(null);
    setShowGradeModal(true);
  };

  const handleOpenEditGrade = (grade: GradeClass) => {
    setEditingGrade(grade);
    setGradeFormData({ name: grade.name, code: grade.code });
    setErrorMessage(null);
    setShowGradeModal(true);
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (editingGrade) {
        await academicsApi.updateGrade(editingGrade.id, gradeFormData);
        setSuccessMessage(`Grade '${gradeFormData.name}' updated successfully.`);
      } else {
        await academicsApi.createGrade(gradeFormData);
        setSuccessMessage(`Grade '${gradeFormData.name}' created successfully.`);
      }

      setShowGradeModal(false);
      await loadData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to save grade');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenNewSection = (grade: GradeClass) => {
    setTargetGradeForSection(grade);
    setEditingSection(null);
    setSectionFormData({ name: '', capacity: 40 });
    setErrorMessage(null);
    setShowSectionModal(true);
  };

  const handleOpenEditSection = (grade: GradeClass, section: Section) => {
    setTargetGradeForSection(grade);
    setEditingSection(section);
    setSectionFormData({ name: section.name, capacity: section.capacity });
    setErrorMessage(null);
    setShowSectionModal(true);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetGradeForSection) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (editingSection) {
        await academicsApi.updateSection(editingSection.id, sectionFormData);
        setSuccessMessage(`Section '${sectionFormData.name}' updated successfully.`);
      } else {
        await academicsApi.createSection(targetGradeForSection.id, sectionFormData);
        setSuccessMessage(`Section '${sectionFormData.name}' added to ${targetGradeForSection.name}.`);
      }

      setShowSectionModal(false);
      await loadData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to save section');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (deleteTarget.type === 'SESSION') {
        await academicsApi.deleteAcademicYear(deleteTarget.id);
        setSuccessMessage(`Academic session '${deleteTarget.name}' deleted.`);
      } else if (deleteTarget.type === 'GRADE') {
        await academicsApi.deleteGrade(deleteTarget.id);
        setSuccessMessage(`Grade '${deleteTarget.name}' deleted.`);
      } else if (deleteTarget.type === 'SECTION') {
        await academicsApi.deleteSection(deleteTarget.id);
        setSuccessMessage(`Section '${deleteTarget.name}' deleted.`);
      }

      setDeleteTarget(null);
      await loadData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to delete record');
      setDeleteTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <GraduationCap className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">Academic Structure & Sessions</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure academic sessions, class grade levels, and sections with student distribution and safety guards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === 'SESSIONS' ? (
            <button
              onClick={handleOpenNewSession}
              disabled={isLoading || isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Academic Session
            </button>
          ) : (
            <button
              onClick={handleOpenNewGrade}
              disabled={isLoading || isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Grade Level
            </button>
          )}

          <button
            onClick={loadData}
            disabled={isLoading || isSubmitting}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors"
            title="Refresh academic records"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-3 text-emerald-800 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start justify-between gap-3 text-rose-800 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Operation Notice</span>
              <span>{errorMessage}</span>
            </div>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('SESSIONS')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${
            activeSubTab === 'SESSIONS'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Academic Sessions ({academicYears.length})
        </button>

        <button
          onClick={() => setActiveSubTab('GRADES')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${
            activeSubTab === 'GRADES'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Grades & Sections ({grades.length} Grades)
        </button>
      </div>

      {/* Sub-tab 1: Academic Sessions */}
      {activeSubTab === 'SESSIONS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Session Name</th>
                    <th className="py-3 px-4">Start Date</th>
                    <th className="py-3 px-4">End Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Enrolled Students</th>
                    <th className="py-3 px-4 text-center">Fee Structures</th>
                    <th className="py-3 px-4 text-center">Invoices</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {academicYears.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No academic sessions configured yet. Click 'New Academic Session' to add one.
                      </td>
                    </tr>
                  ) : (
                    academicYears.map((ay) => (
                      <tr key={ay.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {ay.name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {new Date(ay.startDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {new Date(ay.endDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          {ay.isCurrent ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              Active (Current)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-800">
                          {ay._count?.students ?? 0}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-800">
                          {ay._count?.feeStructures ?? 0}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-slate-800">
                          {ay._count?.invoices ?? 0}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!ay.isCurrent && (
                              <button
                                onClick={() => handleSetCurrentSession(ay)}
                                disabled={isSubmitting}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors border border-indigo-200"
                                title="Set this session as current active academic session"
                              >
                                Activate
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditSession(ay)}
                              disabled={isSubmitting}
                              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Edit Session"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setDeleteTarget({
                                  type: 'SESSION',
                                  id: ay.id,
                                  name: ay.name,
                                })
                              }
                              disabled={isSubmitting || ay.isCurrent}
                              className={`p-1.5 rounded-lg transition-colors ${
                                ay.isCurrent
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title={
                                ay.isCurrent
                                  ? 'Active session cannot be deleted'
                                  : 'Delete Session'
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 2: Grades & Sections */}
      {activeSubTab === 'GRADES' && (
        <div className="space-y-4">
          {grades.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-12 text-center text-slate-400">
              <Layers className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              No grades configured yet. Click 'New Grade Level' to create classes.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {grades.map((grade) => {
                const totalStudentsInGrade =
                  grade._count?.students ??
                  (grade.sections || []).reduce(
                    (acc, s) => acc + (s._count?.students || 0),
                    0,
                  );

                return (
                  <div
                    key={grade.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between hover:border-indigo-200 transition-all"
                  >
                    <div>
                      {/* Grade Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-mono font-bold">
                              {grade.code}
                            </span>
                            <h3 className="text-sm font-bold text-slate-900">
                              {grade.name}
                            </h3>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-400" />
                            <span>{totalStudentsInGrade} enrolled students</span>
                            <span className="text-slate-300">•</span>
                            <span>{grade._count?.feeStructures ?? 0} fee structure(s)</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditGrade(grade)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Grade"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setDeleteTarget({
                                type: 'GRADE',
                                id: grade.id,
                                name: `${grade.name} (${grade.code})`,
                              })
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Grade"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Sections List */}
                      <div className="border-t border-slate-100 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                            Sections ({(grade.sections || []).length})
                          </span>
                          <button
                            onClick={() => handleOpenNewSection(grade)}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Add Section
                          </button>
                        </div>

                        {(!grade.sections || grade.sections.length === 0) ? (
                          <p className="text-xs text-slate-400 italic py-2">
                            No sections added yet. Click 'Add Section' above.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {grade.sections.map((sec) => (
                              <div
                                key={sec.id}
                                className="flex items-center justify-between bg-slate-50 hover:bg-slate-100/80 px-2.5 py-1.5 rounded-xl border border-slate-200/80 text-xs transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800">
                                    Section {sec.name}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    Cap: {sec.capacity}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-medium text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                    {sec._count?.students ?? 0} students
                                  </span>
                                  <button
                                    onClick={() => handleOpenEditSection(grade, sec)}
                                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                    title="Edit Section"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setDeleteTarget({
                                        type: 'SECTION',
                                        id: sec.id,
                                        name: `Section ${sec.name} of ${grade.name}`,
                                      })
                                    }
                                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                    title="Delete Section"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal: Academic Session */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                {editingSession ? 'Edit Academic Session' : 'New Academic Session'}
              </h3>
              <button
                onClick={() => setShowSessionModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Session Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2026-2027"
                  value={sessionFormData.name}
                  onChange={(e) =>
                    setSessionFormData({ ...sessionFormData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={sessionFormData.startDate}
                    onChange={(e) =>
                      setSessionFormData({ ...sessionFormData, startDate: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={sessionFormData.endDate}
                    onChange={(e) =>
                      setSessionFormData({ ...sessionFormData, endDate: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isCurrentCheckbox"
                  checked={sessionFormData.isCurrent}
                  onChange={(e) =>
                    setSessionFormData({ ...sessionFormData, isCurrent: e.target.checked })
                  }
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="isCurrentCheckbox" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Set as active current academic session
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSessionModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {editingSession ? 'Update Session' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Grade / Class */}
      {showGradeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                {editingGrade ? 'Edit Grade Level' : 'New Grade Level'}
              </h3>
              <button
                onClick={() => setShowGradeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGrade} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Grade Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grade 1 or Pre-Primary"
                  value={gradeFormData.name}
                  onChange={(e) =>
                    setGradeFormData({ ...gradeFormData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Grade Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. G1, G10, NUR"
                  value={gradeFormData.code}
                  onChange={(e) =>
                    setGradeFormData({ ...gradeFormData, code: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 uppercase font-mono focus:outline-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Short unique code used for student admission and fee allocations.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGradeModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {editingGrade ? 'Update Grade' : 'Create Grade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Section */}
      {showSectionModal && targetGradeForSection && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                {editingSection
                  ? `Edit Section (${targetGradeForSection.name})`
                  : `Add Section to ${targetGradeForSection.name}`}
              </h3>
              <button
                onClick={() => setShowSectionModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSection} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Section Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. A, B, Blue, Red"
                  value={sectionFormData.name}
                  onChange={(e) =>
                    setSectionFormData({ ...sectionFormData, name: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 uppercase font-mono focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Capacity (Seat Limit)
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={sectionFormData.capacity}
                  onChange={(e) =>
                    setSectionFormData({
                      ...sectionFormData,
                      capacity: parseInt(e.target.value, 10) || 40,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSectionModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {editingSection ? 'Update Section' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full overflow-hidden p-6 animate-in fade-in zoom-in duration-150">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 mb-1">
              Delete {deleteTarget.type === 'SESSION' ? 'Session' : deleteTarget.type === 'GRADE' ? 'Grade' : 'Section'}?
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-slate-800">'{deleteTarget.name}'</span>?
              This operation cannot be undone. System safety rules will prevent deletion if any active students or fee records are linked.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-colors flex items-center gap-1.5"
              >
                {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
