import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  AlertCircle,
  FileText,
  DollarSign,
  Clock,
  CheckCircle2,
  ListPlus,
  RefreshCw,
  Info,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { treatmentPlanService } from '../../../services/treatmentPlanService';
import {
  isValidToothNumber,
  getToothName,
  isAnterior,
  getValidSurfaces,
  SURFACE_DESCRIPTIONS,
} from '../../../utils/dentalNotation';

export const TreatmentProposalModal = ({
  isOpen,
  onClose,
  patient,
  visit,
  examination,
  toothNumber = null,
  finding = null,
  onProposalSuccess,
}) => {
  const [procedures, setProcedures] = useState([]);
  const [loadingProcedures, setLoadingProcedures] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [selectedTooth, setSelectedTooth] = useState(toothNumber || '');
  const [selectedSurface, setSelectedSurface] = useState(finding?.surface || '');
  const [selectedProcedureId, setSelectedProcedureId] = useState('');
  const [procedureName, setProcedureName] = useState('');
  const [procedureCode, setProcedureCode] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState(finding?.severity === 'urgent' ? 'urgent' : 'medium');
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [sessionOrder, setSessionOrder] = useState(1);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [planTitle, setPlanTitle] = useState('Comprehensive Treatment Plan');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync props when modal opens or tooth changes
  useEffect(() => {
    if (isOpen) {
      setSelectedTooth(toothNumber || '');
      setSelectedSurface(finding?.surface || '');
      if (finding?.notes) {
        setClinicalNotes(`Proposed for ${finding.condition_name || 'finding'}: ${finding.notes}`);
      } else if (finding?.condition_name) {
        setClinicalNotes(`Proposed for ${finding.condition_name}`);
      } else {
        setClinicalNotes('');
      }
    }
  }, [isOpen, toothNumber, finding]);

  // Load procedure master
  useEffect(() => {
    if (!isOpen) return;
    const fetchProcedures = async () => {
      setLoadingProcedures(true);
      try {
        const data = await treatmentPlanService.getProcedures();
        setProcedures(data.procedures || []);
      } catch (err) {
        toast.error('Failed to load dental procedures master.');
      } finally {
        setLoadingProcedures(false);
      }
    };
    fetchProcedures();
  }, [isOpen]);

  // Handle Procedure Selection from catalog
  const handleSelectProcedure = (procId) => {
    setSelectedProcedureId(procId);
    const proc = procedures.find((p) => p.id === procId);
    if (proc) {
      setProcedureName(proc.name);
      setProcedureCode(proc.code || '');
      setCategory(proc.category || 'general');
      setUnitCost(parseFloat(proc.default_estimated_cost || 0));
    }
  };

  const filteredProcedures = useMemo(() => {
    return procedures.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [procedures, selectedCategory, searchQuery]);

  const validSurfaces = useMemo(() => {
    if (!selectedTooth || !isValidToothNumber(parseInt(selectedTooth, 10))) return [];
    return getValidSurfaces(parseInt(selectedTooth, 10));
  }, [selectedTooth]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!procedureName.trim()) {
      toast.warning('Please select or specify a procedure name.');
      return;
    }

    if (selectedTooth && !isValidToothNumber(parseInt(selectedTooth, 10))) {
      toast.error('Invalid tooth number. Must follow standard FDI notation (11-48, 51-85).');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        patientId: patient?.id,
        visitId: visit?.id || null,
        examinationId: examination?.id || null,
        toothNumber: selectedTooth ? parseInt(selectedTooth, 10) : null,
        surface: selectedSurface || null,
        findingId: finding?.id || null,
        conditionCode: finding?.condition_code || null,
        procedureId: selectedProcedureId || null,
        procedureName: procedureName.trim(),
        procedureCode: procedureCode || null,
        category,
        priority,
        quantity: Math.max(1, parseInt(quantity, 10)),
        unitCost: Math.max(0, parseFloat(unitCost || 0)),
        sessionOrder: Math.max(1, parseInt(sessionOrder, 10)),
        clinicalNotes: clinicalNotes.trim(),
        planTitle: planTitle.trim() || 'Comprehensive Treatment Plan',
      };

      const res = await treatmentPlanService.proposeFromOdontogram(payload);
      toast.success(
        `Treatment proposal added to ${res.plan?.plan_number || 'Draft Treatment Plan'}!`,
        { icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" /> }
      );

      if (onProposalSuccess) {
        onProposalSuccess(res);
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit treatment proposal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-800 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-teal-100" />
            </div>
            <div>
              <h3 className="text-base font-bold">Create Treatment Proposal</h3>
              <p className="text-xs text-teal-100">
                Bridge findings from Odontogram directly into Patient Treatment Plan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-teal-100 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Patient & Context Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-3 text-slate-600">
            <span>
              Patient: <strong className="text-slate-800">{patient?.first_name} {patient?.last_name}</strong> (#{patient?.patient_number})
            </span>
            {visit?.token_display && (
              <span>• Visit Token: <strong className="text-teal-700">#{visit.token_display}</strong></span>
            )}
          </div>
          {selectedTooth && (
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500">Target Tooth:</span>
              <span className="font-mono font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded text-xs">
                #{selectedTooth} ({getToothName(parseInt(selectedTooth, 10))})
              </span>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
          {finding && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start space-x-2.5 text-xs text-amber-900">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Bridged from Finding: </span>
                <span className="font-semibold">{finding.condition_name || finding.display_name}</span>
                {finding.surface && (
                  <span className="ml-1.5 font-mono font-bold bg-amber-200/80 px-1 py-0.2 rounded text-[10px]">
                    Surface {finding.surface}
                  </span>
                )}
                {finding.notes && <p className="text-[11px] text-amber-700 mt-0.5 italic">"{finding.notes}"</p>}
              </div>
            </div>
          )}

          {/* Procedure Picker from Master Catalog */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Select Procedure from Catalog <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Search procedure name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs capitalize bg-white text-slate-700 focus:ring-2 focus:ring-teal-500"
                >
                  <option value="all">All Categories</option>
                  <option value="preventive">Preventive</option>
                  <option value="restorative">Restorative</option>
                  <option value="endodontic">Endodontics</option>
                  <option value="oral_surgery">Oral Surgery</option>
                  <option value="prosthodontic">Prosthodontics</option>
                  <option value="periodontic">Periodontics</option>
                  <option value="diagnostic">Diagnostic</option>
                  <option value="orthodontic">Orthodontics</option>
                </select>
              </div>

              {loadingProcedures ? (
                <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                  <span>Loading procedure catalog...</span>
                </div>
              ) : (
                <select
                  value={selectedProcedureId}
                  onChange={(e) => handleSelectProcedure(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="">-- Choose a standard dental procedure --</option>
                  {filteredProcedures.map((proc) => (
                    <option key={proc.id} value={proc.id}>
                      [{proc.code}] {proc.name} — ${parseFloat(proc.default_estimated_cost || 0).toFixed(2)} ({proc.category})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Procedure Customization Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Procedure Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={procedureName}
                onChange={(e) => setProcedureName(e.target.value)}
                placeholder="e.g. Composite Restoration (Posterior)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg capitalize focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value="diagnostic">Diagnostic</option>
                <option value="preventive">Preventive</option>
                <option value="restorative">Restorative</option>
                <option value="endodontic">Endodontic</option>
                <option value="periodontic">Periodontic</option>
                <option value="oral_surgery">Oral Surgery</option>
                <option value="prosthodontic">Prosthodontic</option>
                <option value="orthodontic">Orthodontic</option>
                <option value="cosmetic">Cosmetic</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>

          {/* Tooth & Surface Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Tooth Number (FDI)
              </label>
              <input
                type="number"
                value={selectedTooth}
                onChange={(e) => setSelectedTooth(e.target.value)}
                placeholder="e.g. 16 or 46"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400">Leave blank for full-mouth</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Tooth Surface (Optional)
              </label>
              <input
                type="text"
                value={selectedSurface}
                onChange={(e) => setSelectedSurface(e.target.value.toUpperCase())}
                placeholder={selectedTooth && isAnterior(parseInt(selectedTooth, 10)) ? 'e.g. M, D, F, L, I' : 'e.g. MO, MOD, O'}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase font-mono font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              {validSurfaces.length > 0 && (
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Valid surfaces: {validSurfaces.join(', ')}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Priority / Urgency</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg capitalize font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value="urgent">Urgent (Immediate relief)</option>
                <option value="high">High (Active disease)</option>
                <option value="medium">Medium (Routine treatment)</option>
                <option value="low">Low (Elective / cosmetic)</option>
              </select>
            </div>
          </div>

          {/* Pricing & Quantity (Server Authoritative) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value || 1, 10)))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Estimated Unit Cost ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(parseFloat(e.target.value || 0))}
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Estimated Subtotal</label>
              <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-sm text-teal-800">
                ${(parseFloat(unitCost || 0) * parseInt(quantity || 1, 10)).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Clinical Notes & Planned Session */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Clinical Justification / Procedure Notes
              </label>
              <textarea
                rows={2}
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="e.g. Deep occlusal dentinal caries, symptom-free, direct composite indicated"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Planned Session</label>
              <input
                type="number"
                min="1"
                value={sessionOrder}
                onChange={(e) => setSessionOrder(Math.max(1, parseInt(e.target.value || 1, 10)))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400">Sequence or visit #</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 inline-flex items-center space-x-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Adding Proposal...</span>
                </>
              ) : (
                <>
                  <ListPlus className="w-4 h-4" />
                  <span>Add to Treatment Plan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TreatmentProposalModal;
