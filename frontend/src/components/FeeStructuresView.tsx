import React, { useState, useEffect } from 'react';
import {
  feeStructuresApi,
  feeHeadsApi,
  metaApi,
  FeeStructure,
  FeeHead,
  GradeClass,
  AcademicYear,
  FeeFrequency,
} from '../services/api';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface StructureItemRow {
  feeHeadId: string;
  amount: number;
  frequency: FeeFrequency;
  isOptional: boolean;
}

export const FeeStructuresView: React.FC = () => {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([]);
  const [grades, setGrades] = useState<GradeClass[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [sessionFilter, setSessionFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    gradeId: '',
    academicYearId: '',
  });

  const [items, setItems] = useState<StructureItemRow[]>([
    { feeHeadId: '', amount: 1000, frequency: 'MONTHLY', isOptional: false },
  ]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [structData, headsData, gradesData, yearsData] = await Promise.all([
        feeStructuresApi.list(),
        feeHeadsApi.list({ status: 'ACTIVE' }),
        metaApi.getGrades(),
        metaApi.getAcademicYears(),
      ]);

      setStructures(structData);
      setFeeHeads(headsData);
      setGrades(gradesData);
      setAcademicYears(yearsData);

      if (gradesData.length > 0 && !formData.gradeId) {
        setFormData((prev) => ({ ...prev, gradeId: gradesData[0].id }));
      }
      if (yearsData.length > 0 && !formData.academicYearId) {
        const currentYear = yearsData.find((y) => y.isCurrent) || yearsData[0];
        setFormData((prev) => ({ ...prev, academicYearId: currentYear.id }));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load fee structures');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      { feeHeadId: '', amount: 500, frequency: 'MONTHLY', isOptional: false },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof StructureItemRow,
    value: any,
  ) => {
    setItems((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const updated = { ...row, [field]: value };
        // If fee head selected, sync optional default from fee head definition
        if (field === 'feeHeadId') {
          const selectedHead = feeHeads.find((h) => h.id === value);
          if (selectedHead) {
            updated.isOptional = selectedHead.isOptional;
          }
        }
        return updated;
      }),
    );
  };

  const calculateAnnualEstimate = (structureItems: StructureItemRow[]) => {
    return structureItems.reduce((acc, it) => {
      let multiplier = 1;
      if (it.frequency === 'MONTHLY') multiplier = 12;
      return acc + (Number(it.amount) || 0) * multiplier;
    }, 0);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formData.name.trim()) {
      setModalError('Structure name is required');
      return;
    }
    if (!formData.gradeId || !formData.academicYearId) {
      setModalError('Grade and Academic Year must be selected');
      return;
    }
    if (items.length === 0) {
      setModalError('At least one fee head item is required');
      return;
    }

    // Validate fee head selection and uniqueness
    const headIds = items.map((it) => it.feeHeadId);
    if (headIds.some((id) => !id)) {
      setModalError('All items must have a fee head selected');
      return;
    }
    const uniqueIds = new Set(headIds);
    if (uniqueIds.size !== headIds.length) {
      setModalError('Each fee head can only appear once in a structure');
      return;
    }
    if (items.some((it) => it.amount <= 0)) {
      setModalError('All fee amounts must be greater than 0');
      return;
    }

    try {
      setModalSubmitting(true);
      await feeStructuresApi.create({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        gradeId: formData.gradeId,
        academicYearId: formData.academicYearId,
        items: items.map((it) => ({
          feeHeadId: it.feeHeadId,
          amount: Number(it.amount),
          frequency: it.frequency,
          isOptional: it.isOptional,
        })),
      });

      setSuccessMsg(`Fee structure "${formData.name}" created successfully`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsModalOpen(false);
      setFormData((prev) => ({
        ...prev,
        name: '',
        description: '',
      }));
      setItems([{ feeHeadId: '', amount: 1000, frequency: 'MONTHLY', isOptional: false }]);
      loadData();
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'Failed to create fee structure');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDelete = async (structure: FeeStructure) => {
    if (!window.confirm(`Are you sure you want to delete structure "${structure.name}"?`)) {
      return;
    }

    try {
      await feeStructuresApi.delete(structure.id);
      setSuccessMsg(`Fee structure "${structure.name}" deleted successfully`);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Cannot delete fee structure');
      setTimeout(() => setError(null), 5000);
    }
  };

  const filteredStructures = structures.filter((s) => {
    const matchesGrade = gradeFilter === 'ALL' || s.gradeId === gradeFilter;
    const matchesSession = sessionFilter === 'ALL' || s.academicYearId === sessionFilter;
    return matchesGrade && matchesSession;
  });

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Class-Wise Fee Structures
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Standard billing blueprints configured per Grade and Academic Year.
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
            Create Fee Structure
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

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Filter by Class</label>
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
          <label className="block text-xs font-semibold text-slate-600 mb-1">Filter by Session</label>
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

      {/* Structures List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
            <p className="text-sm">Loading fee structures...</p>
          </div>
        ) : filteredStructures.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-base font-semibold text-slate-700">No fee structures defined</p>
            <p className="text-xs text-slate-400 mt-1">
              Create a fee structure for your grade classes to start student allocations.
            </p>
          </div>
        ) : (
          filteredStructures.map((structure) => {
            const isExpanded = expandedId === structure.id;
            const mandatoryItems = structure.items.filter((it) => !it.isOptional);

            // Compute Base Annual Minimum
            const baseAnnual = mandatoryItems.reduce((acc, it) => {
              const mult = it.frequency === 'MONTHLY' ? 12 : 1;
              return acc + Number(it.amount) * mult;
            }, 0);

            return (
              <div
                key={structure.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all"
              >
                {/* Header Summary */}
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-slate-900">{structure.name}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {structure.grade?.name || 'Class'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                        {structure.academicYear?.name || 'Session'}
                      </span>
                    </div>
                    {structure.description && (
                      <p className="text-xs text-slate-500">{structure.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-xs text-slate-400">Base Annual Obligation</div>
                      <div className="text-base font-bold text-slate-900 font-mono">
                        ₹{baseAnnual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="text-xs text-slate-500">
                      <div>{structure.items.length} items</div>
                      <div className="text-slate-400">
                        {structure._count?.allocations || 0} students assigned
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : structure.id)}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        title={isExpanded ? 'Collapse' : 'Expand details'}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        onClick={() => handleDelete(structure)}
                        title="Delete structure"
                        className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Item Breakdown */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-5">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
                      Fee Breakdown & Schedules
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {structure.items.map((item) => (
                        <div
                          key={item.id}
                          className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-sm text-slate-800">
                                {item.feeHead?.name || 'Fee Head'}
                              </span>
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {item.feeHead?.code}
                              </span>
                            </div>
                            <span
                              className={`inline-block mt-1 text-[11px] font-medium px-1.5 py-0.5 rounded ${
                                item.isOptional
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {item.isOptional ? 'Optional Opt-In' : 'Mandatory'}
                            </span>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                            <span className="text-xs text-slate-400 capitalize">
                              {item.frequency.toLowerCase()}
                            </span>
                            <span className="font-mono font-bold text-slate-900 text-sm">
                              ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Create Class Fee Structure</h3>
            <p className="text-xs text-slate-500 mb-4">
              Define the itemized fee components for a target grade and session.
            </p>

            {modalError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fee Structure Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grade 10 Standard Fee 2026-2027"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Class / Grade *
                  </label>
                  <select
                    value={formData.gradeId}
                    onChange={(e) => setFormData({ ...formData, gradeId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Academic Year Session *
                  </label>
                  <select
                    value={formData.academicYearId}
                    onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.isCurrent ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Optional notes or eligibility..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Dynamic Fee Items */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Structure Fee Components
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Fee Head
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((row, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center gap-3"
                    >
                      <div className="flex-1 w-full sm:w-auto">
                        <select
                          required
                          value={row.feeHeadId}
                          onChange={(e) => handleItemChange(idx, 'feeHeadId', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="">Select Fee Head</option>
                          {feeHeads.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} ({h.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-full sm:w-32">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          placeholder="Amount"
                          value={row.amount}
                          onChange={(e) =>
                            handleItemChange(idx, 'amount', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 bg-white"
                        />
                      </div>

                      <div className="w-full sm:w-32">
                        <select
                          value={row.frequency}
                          onChange={(e) =>
                            handleItemChange(idx, 'frequency', e.target.value as FeeFrequency)
                          }
                          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="ANNUAL">Annual</option>
                          <option value="ONE_TIME">One-Time</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-slate-600 flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={row.isOptional}
                            onChange={(e) => handleItemChange(idx, 'isOptional', e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          Opt
                        </label>

                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 p-3 bg-indigo-50 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-900">
                    Estimated Annual Total per Student:
                  </span>
                  <span className="font-mono font-bold text-indigo-900 text-sm">
                    ₹{calculateAnnualEstimate(items).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

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
                  disabled={modalSubmitting}
                  className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                >
                  {modalSubmitting ? 'Creating...' : 'Create Structure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
