import React, { useState, useEffect } from 'react';
import {
  studentAllocationsApi,
  feeStructuresApi,
  metaApi,
  StudentFeeAllocation,
  FeeStructure,
  Student,
  GradeClass,
  AcademicYear,
  ConcessionType,
} from '../services/api';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  UserCheck,
  Search,
  Filter,
} from 'lucide-react';

export const StudentAllocationsView: React.FC = () => {
  const [allocations, setAllocations] = useState<StudentFeeAllocation[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [sessionFilter, setSessionFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    studentId: '',
    feeStructureId: '',
    academicYearId: '',
    concessionType: 'NONE' as ConcessionType,
    concessionValue: 0,
    concessionReason: '',
    optedFeeHeadIds: [] as string[],
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [allocData, structData, studentData, gradesData, yearsData] =
        await Promise.all([
          studentAllocationsApi.list(),
          feeStructuresApi.list({ status: 'ACTIVE' }),
          metaApi.getStudents(),
          metaApi.getGrades(),
          metaApi.getAcademicYears(),
        ]);

      setAllocations(allocData);
      setStructures(structData);
      setStudents(studentData);
      setGrades(gradesData);
      setAcademicYears(yearsData);

      if (yearsData.length > 0 && !formData.academicYearId) {
        const cur = yearsData.find((y) => y.isCurrent) || yearsData[0];
        setFormData((prev) => ({ ...prev, academicYearId: cur.id }));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load student allocations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When student selection changes, suggest structure matching student grade
  const handleStudentSelect = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    let structureId = '';
    if (student) {
      const matchingStruct = structures.find(
        (s) =>
          s.gradeId === student.gradeId &&
          s.academicYearId === (formData.academicYearId || student.academicYear?.id),
      );
      if (matchingStruct) {
        structureId = matchingStruct.id;
      }
    }
    setFormData((prev) => ({
      ...prev,
      studentId,
      feeStructureId: structureId,
      optedFeeHeadIds: [],
    }));
  };

  // Selected Structure details for preview
  const selectedStructure = structures.find((s) => s.id === formData.feeStructureId);
  const optionalItems = selectedStructure?.items.filter((it) => it.isOptional) || [];

  // Calculate live preview amounts
  const calculatePreview = () => {
    if (!selectedStructure) {
      return { baseFee: 0, optionalFee: 0, totalBeforeConcession: 0, concessionAmount: 0, netPayable: 0 };
    }

    let baseFee = 0;
    let optionalFee = 0;

    for (const item of selectedStructure.items) {
      const mult = item.frequency === 'MONTHLY' ? 12 : 1;
      const amt = Number(item.amount) * mult;
      if (item.isOptional) {
        if (formData.optedFeeHeadIds.includes(item.feeHeadId)) {
          optionalFee += amt;
        }
      } else {
        baseFee += amt;
      }
    }

    const totalBeforeConcession = baseFee + optionalFee;
    let concessionAmount = 0;

    if (formData.concessionType === 'PERCENTAGE') {
      concessionAmount = (totalBeforeConcession * (formData.concessionValue || 0)) / 100;
    } else if (formData.concessionType === 'FLAT_DISCOUNT') {
      concessionAmount = formData.concessionValue || 0;
    }

    const netPayable = Math.max(0, totalBeforeConcession - concessionAmount);

    return {
      baseFee,
      optionalFee,
      totalBeforeConcession,
      concessionAmount,
      netPayable,
    };
  };

  const preview = calculatePreview();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formData.studentId || !formData.feeStructureId || !formData.academicYearId) {
      setModalError('Student, Fee Structure, and Academic Year are all required');
      return;
    }

    if (formData.concessionType !== 'NONE') {
      if (formData.concessionValue <= 0) {
        setModalError('Concession value must be greater than 0');
        return;
      }
      if (!formData.concessionReason.trim()) {
        setModalError('Concession reason is mandatory when concession is applied');
        return;
      }
      if (
        formData.concessionType === 'FLAT_DISCOUNT' &&
        formData.concessionValue > preview.totalBeforeConcession
      ) {
        setModalError('Flat concession discount cannot exceed the total base annual fee');
        return;
      }
    }

    try {
      setModalSubmitting(true);
      await studentAllocationsApi.create({
        studentId: formData.studentId,
        feeStructureId: formData.feeStructureId,
        academicYearId: formData.academicYearId,
        concessionType: formData.concessionType,
        concessionValue: formData.concessionValue,
        concessionReason: formData.concessionReason.trim() || undefined,
        optedFeeHeadIds: formData.optedFeeHeadIds,
      });

      setSuccessMsg('Student fee structure allocated successfully');
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsModalOpen(false);
      setFormData({
        studentId: '',
        feeStructureId: '',
        academicYearId: academicYears.find((y) => y.isCurrent)?.id || '',
        concessionType: 'NONE',
        concessionValue: 0,
        concessionReason: '',
        optedFeeHeadIds: [],
      });
      loadData();
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Failed to allocate fee structure');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDelete = async (allocation: StudentFeeAllocation) => {
    const studentName = `${allocation.student.firstName} ${allocation.student.lastName}`;
    if (!window.confirm(`Are you sure you want to remove fee allocation for ${studentName}?`)) {
      return;
    }

    try {
      await studentAllocationsApi.delete(allocation.id);
      setSuccessMsg(`Fee allocation for ${studentName} removed`);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Cannot remove allocation');
      setTimeout(() => setError(null), 5000);
    }
  };

  const filteredAllocations = allocations.filter((a) => {
    const s = a.student;
    const matchesSearch =
      s.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = gradeFilter === 'ALL' || s.gradeId === gradeFilter;
    const matchesSession = sessionFilter === 'ALL' || a.academicYearId === sessionFilter;
    return matchesSearch && matchesGrade && matchesSession;
  });

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            Student Fee Allocations
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Enroll individual students into class fee structures, configure optional add-ons and concessions.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={loadData}
            title="Refresh"
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl shadow-sm transition-colors flex-1 sm:flex-none"
          >
            <Plus className="w-4 h-4" />
            Assign Student
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search student or admission #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="ALL">All Classes / Grades</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="w-full py-2 px-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="ALL">All Academic Years</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} {y.isCurrent ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
            <p className="text-sm">Loading fee allocations...</p>
          </div>
        ) : filteredAllocations.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <UserCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-base font-semibold text-slate-700">No student allocations found</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Assign Student&quot; to link students to their fee structures.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Class & Session</th>
                  <th className="py-3 px-4">Fee Structure</th>
                  <th className="py-3 px-4">Concessions / Waiver</th>
                  <th className="py-3 px-4">Optional Opt-Ins</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAllocations.map((alloc) => (
                  <tr key={alloc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">
                        {alloc.student.firstName} {alloc.student.lastName}
                      </div>
                      <div className="font-mono text-xs text-slate-400">
                        {alloc.student.admissionNumber}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">
                        {alloc.student.grade?.name || 'Class'}
                      </div>
                      <div className="text-xs text-slate-400">{alloc.academicYear?.name}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">
                        {alloc.feeStructure?.name || 'Standard'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {alloc.feeStructure?.items?.length || 0} scheduled heads
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {alloc.concessionType === 'NONE' ? (
                        <span className="text-xs text-slate-400">None</span>
                      ) : (
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {alloc.concessionType === 'PERCENTAGE'
                              ? `${Number(alloc.concessionValue)}% Off`
                              : `₹${Number(alloc.concessionValue)} Off`}
                          </span>
                          {alloc.concessionReason && (
                            <div className="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate" title={alloc.concessionReason}>
                              {alloc.concessionReason}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {alloc.optedFeeHeadIds && alloc.optedFeeHeadIds.length > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {alloc.optedFeeHeadIds.length} Opted
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Standard only</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {alloc.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDelete(alloc)}
                        title="Remove allocation"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Assign Student to Fee Structure</h3>
            <p className="text-xs text-slate-500 mb-4">
              Allocate a class structure, select optional facilities, and record authorized fee concessions.
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Student Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Student *
                </label>
                <select
                  required
                  value={formData.studentId}
                  onChange={(e) => handleStudentSelect(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- Choose student --</option>
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.firstName} {st.lastName} ({st.admissionNumber}) — {st.grade?.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Session & Structure */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Academic Year *
                  </label>
                  <select
                    required
                    value={formData.academicYearId}
                    onChange={(e) =>
                      setFormData({ ...formData, academicYearId: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.isCurrent ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Fee Structure *
                  </label>
                  <select
                    required
                    value={formData.feeStructureId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        feeStructureId: e.target.value,
                        optedFeeHeadIds: [],
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">-- Choose fee structure --</option>
                    {structures.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.grade?.name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Facilities Opt-In */}
              {optionalItems.length > 0 && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
                    Optional Add-Ons (Opt-in)
                  </label>
                  <div className="space-y-2">
                    {optionalItems.map((item) => {
                      const isChecked = formData.optedFeeHeadIds.includes(item.feeHeadId);
                      return (
                        <label
                          key={item.id}
                          className="flex items-center justify-between text-xs text-slate-700 cursor-pointer p-2 bg-white rounded-lg border border-slate-200 hover:border-indigo-300"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    optedFeeHeadIds: [...formData.optedFeeHeadIds, item.feeHeadId],
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    optedFeeHeadIds: formData.optedFeeHeadIds.filter(
                                      (id) => id !== item.feeHeadId,
                                    ),
                                  });
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-medium text-slate-900">
                              {item.feeHead?.name}
                            </span>
                          </div>
                          <span className="font-mono text-slate-600">
                            ₹{Number(item.amount)}/{item.frequency.toLowerCase()}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Concession Policy Section */}
              <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                <label className="block text-xs font-bold text-indigo-950 uppercase tracking-wide">
                  Concession / Scholarship Waiver
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Concession Type
                    </label>
                    <select
                      value={formData.concessionType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          concessionType: e.target.value as ConcessionType,
                          concessionValue: e.target.value === 'NONE' ? 0 : formData.concessionValue,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="NONE">No Concession</option>
                      <option value="PERCENTAGE">Percentage (%) Discount</option>
                      <option value="FLAT_DISCOUNT">Flat Amount (₹) Discount</option>
                    </select>
                  </div>

                  {formData.concessionType !== 'NONE' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        {formData.concessionType === 'PERCENTAGE'
                          ? 'Discount Percentage (%)'
                          : 'Flat Discount Amount (₹)'}
                      </label>
                      <input
                        type="number"
                        step={formData.concessionType === 'PERCENTAGE' ? '0.1' : '1'}
                        min="0.01"
                        max={formData.concessionType === 'PERCENTAGE' ? 100 : undefined}
                        required
                        value={formData.concessionValue || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            concessionValue: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                  )}
                </div>

                {formData.concessionType !== 'NONE' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Concession Justification / Reason * (Auditable)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sibling discount, sports merit quota..."
                      value={formData.concessionReason}
                      onChange={(e) =>
                        setFormData({ ...formData, concessionReason: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Live Financial Calculation Preview */}
              {selectedStructure && (
                <div className="p-3 bg-slate-900 text-white rounded-xl text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-300">
                    <span>Base Mandatory Tuition & Labs:</span>
                    <span>₹{preview.baseFee.toFixed(2)}</span>
                  </div>
                  {preview.optionalFee > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Opted Facilities (Transport/Etc):</span>
                      <span>+₹{preview.optionalFee.toFixed(2)}</span>
                    </div>
                  )}
                  {preview.concessionAmount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Waiver / Concession:</span>
                      <span>-₹{preview.concessionAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1.5 border-t border-slate-800 text-sm font-bold text-white">
                    <span>Net Annual Obligation:</span>
                    <span className="text-indigo-400">₹{preview.netPayable.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting || !selectedStructure}
                  className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {modalSubmitting ? 'Allocating...' : 'Confirm Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
