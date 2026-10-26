import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  DollarSign,
  ShieldCheck,
  Send,
  Trash2,
  Edit2,
  Play,
  Check,
  Ban,
  PauseCircle,
  History,
  Layers,
  ChevronDown,
  ChevronRight,
  Info,
  Calendar,
  Sparkles,
  RefreshCw,
  X,
  FileCheck,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '../../../context/AuthContext';
import { treatmentPlanService } from '../../../services/treatmentPlanService';
import { ConsentModal } from './ConsentModal';
import {
  isValidToothNumber,
  getToothName,
  isAnterior,
  getValidSurfaces,
} from '../../../utils/dentalNotation';

export const TreatmentPlanManager = ({
  patient,
  visit = null,
  examination = null,
  isReadOnly = false,
  onPlanUpdated,
}) => {
  const { user } = useAuth();
  const patientId = patient?.id;
  const visitId = visit?.id || null;
  const examId = examination?.id || null;

  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [activePlan, setActivePlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Modals state
  const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Complete item modal state
  const [itemToComplete, setItemToComplete] = useState(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);

  // Master Procedures catalog
  const [procedures, setProcedures] = useState([]);

  // Create Plan Form state
  const [newPlanForm, setNewPlanForm] = useState({
    planTitle: 'Comprehensive Treatment Plan',
    clinicalNotes: '',
    treatmentSummary: '',
    plannedStartDate: '',
    reviewDate: '',
  });
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);

  // Add Item Form state
  const [itemForm, setItemForm] = useState({
    toothNumber: '',
    surface: '',
    procedureId: '',
    procedureName: '',
    procedureCode: '',
    category: 'general',
    priority: 'medium',
    quantity: 1,
    unitCost: 0,
    sessionOrder: 1,
    clinicalNotes: '',
    treatingDoctorId: '',
  });
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);

  // Permission checks
  const canManage = !isReadOnly && ['admin', 'dentist', 'specialist'].includes(user?.role);
  const canApprove = !isReadOnly && ['admin', 'dentist', 'specialist'].includes(user?.role);

  // 1. Load patient treatment plans
  const loadPlans = useCallback(async (selectId = null) => {
    if (!patientId) return;
    setLoading(true);
    try {
      const data = await treatmentPlanService.getPatientPlans(patientId);
      const planList = data.plans || [];
      setPlans(planList);

      if (planList.length > 0) {
        const targetId = selectId || selectedPlanId || planList[0].id;
        setSelectedPlanId(targetId);
      } else {
        setSelectedPlanId(null);
        setActivePlan(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to load treatment plans.');
    } finally {
      setLoading(false);
    }
  }, [patientId, selectedPlanId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // 2. Load active plan details (with items, versions, consents)
  const loadPlanDetails = useCallback(async (planId) => {
    if (!planId) return;
    setLoadingDetails(true);
    try {
      const data = await treatmentPlanService.getPlanById(planId);
      setActivePlan(data.plan);
    } catch (err) {
      toast.error('Failed to load treatment plan details.');
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlanId) {
      loadPlanDetails(selectedPlanId);
    }
  }, [selectedPlanId, loadPlanDetails]);

  // Load procedure catalog on mount
  useEffect(() => {
    const fetchProcs = async () => {
      try {
        const data = await treatmentPlanService.getProcedures();
        setProcedures(data.procedures || []);
      } catch {
        // silent fallback
      }
    };
    fetchProcs();
  }, []);

  // Handle Create Plan Submit
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!newPlanForm.planTitle.trim()) {
      toast.warning('Plan title is required.');
      return;
    }

    setIsSubmittingPlan(true);
    try {
      const res = await treatmentPlanService.createPlan({
        patientId,
        visitId,
        examinationId: examId,
        createdByDoctorId: user?.id,
        planTitle: newPlanForm.planTitle.trim(),
        clinicalNotes: newPlanForm.clinicalNotes.trim(),
        treatmentSummary: newPlanForm.treatmentSummary.trim(),
        plannedStartDate: newPlanForm.plannedStartDate || null,
        reviewDate: newPlanForm.reviewDate || null,
      });

      toast.success(`Treatment plan #${res.plan?.plan_number} created successfully!`);
      setIsCreatePlanOpen(false);
      setNewPlanForm({
        planTitle: 'Comprehensive Treatment Plan',
        clinicalNotes: '',
        treatmentSummary: '',
        plannedStartDate: '',
        reviewDate: '',
      });
      loadPlans(res.plan.id);
      if (onPlanUpdated) onPlanUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create plan.');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Handle Procedure change in item form
  const handleSelectProcedureInItemForm = (procId) => {
    const proc = procedures.find((p) => p.id === procId);
    if (proc) {
      setItemForm((prev) => ({
        ...prev,
        procedureId: proc.id,
        procedureName: proc.name,
        procedureCode: proc.code || '',
        category: proc.category || 'general',
        unitCost: parseFloat(proc.default_estimated_cost || 0),
      }));
    }
  };

  // Handle Add Item Submit
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!itemForm.procedureName.trim()) {
      toast.warning('Procedure name is required.');
      return;
    }

    if (itemForm.toothNumber && !isValidToothNumber(parseInt(itemForm.toothNumber, 10))) {
      toast.error('Invalid tooth number. Must follow FDI notation.');
      return;
    }

    setIsSubmittingItem(true);
    try {
      const payload = {
        toothNumber: itemForm.toothNumber ? parseInt(itemForm.toothNumber, 10) : null,
        surface: itemForm.surface ? itemForm.surface.toUpperCase() : null,
        procedureId: itemForm.procedureId || null,
        procedureName: itemForm.procedureName.trim(),
        procedureCode: itemForm.procedureCode || null,
        category: itemForm.category,
        priority: itemForm.priority,
        quantity: Math.max(1, parseInt(itemForm.quantity || 1, 10)),
        unitCost: Math.max(0, parseFloat(itemForm.unitCost || 0)),
        sessionOrder: Math.max(1, parseInt(itemForm.sessionOrder || 1, 10)),
        clinicalNotes: itemForm.clinicalNotes.trim(),
      };

      if (editingItem) {
        await treatmentPlanService.updatePlanItem(activePlan.id, editingItem.id, payload);
        toast.success('Treatment item updated successfully!');
      } else {
        await treatmentPlanService.addPlanItem(activePlan.id, payload);
        toast.success('Treatment item added to plan!');
      }

      setIsAddItemOpen(false);
      setEditingItem(null);
      setItemForm({
        toothNumber: '',
        surface: '',
        procedureId: '',
        procedureName: '',
        procedureCode: '',
        category: 'general',
        priority: 'medium',
        quantity: 1,
        unitCost: 0,
        sessionOrder: 1,
        clinicalNotes: '',
        treatingDoctorId: '',
      });
      loadPlanDetails(activePlan.id);
      loadPlans(activePlan.id);
      if (onPlanUpdated) onPlanUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save treatment item.');
    } finally {
      setIsSubmittingItem(false);
    }
  };

  // Handle Delete Item
  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to remove this item from the treatment plan?')) {
      return;
    }
    try {
      await treatmentPlanService.deletePlanItem(activePlan.id, itemId);
      toast.success('Treatment item removed.');
      loadPlanDetails(activePlan.id);
      loadPlans(activePlan.id);
      if (onPlanUpdated) onPlanUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete item.');
    }
  };

  // Handle Plan Presentation
  const handlePresentPlan = async () => {
    if (!window.confirm('Mark this treatment plan as formally presented to the patient?')) return;
    try {
      await treatmentPlanService.presentPlan(activePlan.id);
      toast.success('Treatment plan marked as Presented to patient.');
      loadPlanDetails(activePlan.id);
      loadPlans(activePlan.id);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to present plan.');
    }
  };

  // Handle Plan Approval
  const handleApprovePlan = async () => {
    if (!window.confirm('Approve this treatment plan?')) return;
    try {
      await treatmentPlanService.approvePlan(activePlan.id);
      toast.success('Treatment plan approved successfully!');
      loadPlanDetails(activePlan.id);
      loadPlans(activePlan.id);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to approve plan.');
    }
  };

  // Handle Item Status Transition (Start / Defer / Cancel)
  const handleUpdateItemStatus = async (item, newStatus) => {
    // If starting treatment, check consent
    if (newStatus === 'in_progress') {
      const hasObtainedConsent = (activePlan?.consents || []).some(
        (c) => c.consent_status === 'obtained'
      );
      if (!hasObtainedConsent) {
        toast.warning(
          'Cannot start treatment: Valid informed consent has not been recorded for this plan. Please record consent first.',
          { autoClose: 5000 }
        );
        setIsConsentOpen(true);
        return;
      }
    }

    // If completing treatment, open clinical note modal
    if (newStatus === 'completed') {
      setItemToComplete(item);
      setCompletionNotes('');
      return;
    }

    try {
      await treatmentPlanService.updatePlanItem(activePlan.id, item.id, {
        status: newStatus,
        clinicalNotes: item.clinical_notes,
      });
      toast.success(`Item status updated to ${newStatus.replace('_', ' ')}.`);
      loadPlanDetails(activePlan.id);
      loadPlans(activePlan.id);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update item status.');
    }
  };

  // Submit Completion with notes
  const handleSubmitCompletion = async (e) => {
    e.preventDefault();
    if (!itemToComplete) return;

    setIsCompleting(true);
    try {
      await treatmentPlanService.updatePlanItem(activePlan.id, itemToComplete.id, {
        status: 'completed',
        clinicalNotes: completionNotes.trim()
          ? `${itemToComplete.clinical_notes ? itemToComplete.clinical_notes + ' | ' : ''}Completion Note: ${completionNotes.trim()}`
          : itemToComplete.clinical_notes,
      });
      toast.success(`Completed treatment item: ${itemToComplete.procedure_name}!`, {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
      });
      setItemToComplete(null);
      loadPlanDetails(activePlan.id);
      loadPlans(activePlan.id);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to complete item.');
    } finally {
      setIsCompleting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'draft':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">Draft</span>;
      case 'presented':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">Presented</span>;
      case 'approved':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">Approved</span>;
      case 'in_progress':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase animate-pulse">In Progress</span>;
      case 'completed':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 uppercase">Completed</span>;
      case 'deferred':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 uppercase">Deferred</span>;
      case 'cancelled':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 uppercase">Cancelled</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">{status}</span>;
    }
  };

  const getPriorityBadge = (prio) => {
    switch (prio) {
      case 'urgent':
        return <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Urgent</span>;
      case 'high':
        return <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">High</span>;
      case 'medium':
        return <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Medium</span>;
      case 'low':
        return <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700">Low</span>;
      default:
        return null;
    }
  };

  const latestConsent = (activePlan?.consents || [])[0];

  return (
    <div className="space-y-4">
      {/* Top Header & Selector Strip */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <span>Treatment Plans ({plans.length})</span>
            </h3>
            <p className="text-xs text-slate-500">
              Patient lifetime treatment proposals, procedural staging, and informed consent
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {plans.length > 0 && (
            <select
              value={selectedPlanId || ''}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-teal-500"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plan_number} — {p.plan_title} ({p.status.toUpperCase()}, v{p.version})
                </option>
              ))}
            </select>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => setIsCreatePlanOpen(true)}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center space-x-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New Plan</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Loading treatment plans...</p>
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-slate-900">No Treatment Plans Recorded</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
            There are currently no active or historical treatment plans for this patient. You can create a
            new comprehensive plan or propose individual items directly from the Odontogram.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setIsCreatePlanOpen(true)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create Initial Treatment Plan</span>
            </button>
          )}
        </div>
      ) : activePlan ? (
        <div className="space-y-4">
          {/* Active Plan Overview Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header Strip */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2.5">
                  <span className="font-mono text-xs font-extrabold bg-teal-500 text-slate-950 px-2 py-0.5 rounded shadow-2xs">
                    {activePlan.plan_number}
                  </span>
                  <span className="text-xs font-mono text-slate-300">v{activePlan.version}</span>
                  {getStatusBadge(activePlan.status)}
                  {latestConsent && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                        latestConsent.consent_status === 'obtained'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : latestConsent.consent_status === 'withdrawn'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                      }`}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      <span>Consent: {latestConsent.consent_status.toUpperCase()}</span>
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold mt-1 text-white">{activePlan.plan_title}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Created by Dr. {activePlan.doctor_first_name} {activePlan.doctor_last_name} on{' '}
                  {new Date(activePlan.created_at).toLocaleDateString()}
                  {activePlan.originating_visit_token && (
                    <span> • Visit #{activePlan.originating_visit_token}</span>
                  )}
                </p>
              </div>

              {/* Total Cost & Action Strip */}
              <div className="flex flex-col md:items-end space-y-2">
                <div className="text-left md:text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Total Estimated Cost
                  </span>
                  <div className="text-2xl font-mono font-extrabold text-teal-400">
                    ${parseFloat(activePlan.total_estimated_cost || 0).toFixed(2)}
                  </div>
                </div>

                {/* Plan Lifecycle Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {canManage && activePlan.status === 'draft' && (
                    <button
                      type="button"
                      onClick={handlePresentPlan}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs"
                      title="Present plan to patient"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Present</span>
                    </button>
                  )}

                  {canApprove && ['draft', 'presented'].includes(activePlan.status) && (
                    <button
                      type="button"
                      onClick={handleApprovePlan}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs"
                      title="Approve plan"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                  )}

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setIsConsentOpen(true)}
                      className="px-2.5 py-1 bg-teal-700 hover:bg-teal-600 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs"
                      title="Record or review patient consent"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Consent</span>
                    </button>
                  )}

                  {activePlan.versions && activePlan.versions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsVersionHistoryOpen(true)}
                      className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                      title="View plan change history"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>History ({activePlan.versions.length})</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Plan Clinical Notes / Summary if present */}
            {(activePlan.clinical_notes || activePlan.treatment_summary) && (
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 text-xs text-slate-700 flex flex-col sm:flex-row gap-4">
                {activePlan.treatment_summary && (
                  <div className="flex-1">
                    <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                      Treatment Summary
                    </span>
                    <p className="text-slate-600 mt-0.5">{activePlan.treatment_summary}</p>
                  </div>
                )}
                {activePlan.clinical_notes && (
                  <div className="flex-1">
                    <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                      Clinical Notes
                    </span>
                    <p className="text-slate-600 mt-0.5">{activePlan.clinical_notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Treatment Items Table */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-teal-600" />
                  <span>Treatment Items & Planned Procedures ({(activePlan.items || []).length})</span>
                </h4>

                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setIsAddItemOpen(true);
                    }}
                    className="px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                )}
              </div>

              {loadingDetails ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin text-teal-600 mx-auto mb-1" />
                  Refreshing items...
                </div>
              ) : (activePlan.items || []).length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                  No procedural items added to this treatment plan yet.
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setIsAddItemOpen(true)}
                      className="block mx-auto mt-2 text-teal-700 font-bold hover:underline"
                    >
                      + Add first treatment procedure
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">Session</th>
                        <th className="py-2.5 px-3">Tooth / Surface</th>
                        <th className="py-2.5 px-3">Procedure Details</th>
                        <th className="py-2.5 px-3">Priority</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Unit ($)</th>
                        <th className="py-2.5 px-3 text-right">Subtotal ($)</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activePlan.items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-500">
                            S{item.session_order || 1}
                          </td>
                          <td className="py-3 px-3">
                            {item.tooth_number ? (
                              <div className="flex items-center space-x-1">
                                <span className="font-mono font-bold bg-teal-50 text-teal-800 border border-teal-200 px-1.5 py-0.5 rounded text-[11px]">
                                  #{item.tooth_number}
                                </span>
                                {item.surface && (
                                  <span className="font-mono font-bold bg-slate-200 text-slate-700 px-1 py-0.5 rounded text-[10px]">
                                    {item.surface}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Full Mouth / General</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{item.procedure_name}</div>
                            {item.clinical_notes && (
                              <p className="text-[11px] text-slate-500 italic mt-0.5">
                                "{item.clinical_notes}"
                              </p>
                            )}
                            <div className="text-[10px] text-slate-400 capitalize mt-0.5">
                              Category: {item.category} {item.procedure_code ? `[${item.procedure_code}]` : ''}
                            </div>
                          </td>
                          <td className="py-3 px-3">{getPriorityBadge(item.priority)}</td>
                          <td className="py-3 px-3 text-right font-mono font-semibold">{item.quantity}</td>
                          <td className="py-3 px-3 text-right font-mono">
                            ${parseFloat(item.unit_cost || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-teal-800">
                            ${parseFloat(item.total_cost || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-center">{getStatusBadge(item.status)}</td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              {/* Workflow Actions */}
                              {canManage && ['proposed', 'approved'].includes(item.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemStatus(item, 'in_progress')}
                                  className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[10px] font-bold flex items-center space-x-0.5 transition"
                                  title="Start treatment procedure"
                                >
                                  <Play className="w-2.5 h-2.5" />
                                  <span>Start</span>
                                </button>
                              )}

                              {canManage && item.status === 'in_progress' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemStatus(item, 'completed')}
                                  className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold flex items-center space-x-0.5 transition"
                                  title="Mark procedure completed with clinical record"
                                >
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Complete</span>
                                </button>
                              )}

                              {canManage && !['completed', 'cancelled'].includes(item.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItemStatus(item, 'deferred')}
                                  className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition"
                                  title="Defer item"
                                >
                                  <PauseCircle className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {canManage && item.status === 'proposed' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* CREATE PLAN MODAL */}
      {isCreatePlanOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-teal-600 to-teal-800 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold">Create New Treatment Plan</h3>
              <button
                type="button"
                onClick={() => setIsCreatePlanOpen(false)}
                className="p-1 rounded-lg text-teal-100 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePlan} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Plan Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newPlanForm.planTitle}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, planTitle: e.target.value })}
                  placeholder="e.g. Quadrant 1 & 2 Restorative and Hygiene Plan"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Overall Treatment Summary
                </label>
                <textarea
                  rows={2}
                  value={newPlanForm.treatmentSummary}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, treatmentSummary: e.target.value })}
                  placeholder="Patient-facing explanation of recommended treatment course"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Doctor Clinical Notes (Internal)
                </label>
                <textarea
                  rows={2}
                  value={newPlanForm.clinicalNotes}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, clinicalNotes: e.target.value })}
                  placeholder="Chairside justification and staging considerations"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Planned Start</label>
                  <input
                    type="date"
                    value={newPlanForm.plannedStartDate}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, plannedStartDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Review Date</label>
                  <input
                    type="date"
                    value={newPlanForm.reviewDate}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, reviewDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCreatePlanOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPlan}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isSubmittingPlan ? 'Creating...' : 'Create Draft Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ITEM MODAL */}
      {isAddItemOpen && activePlan && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-teal-600 to-teal-800 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold">Add Treatment Item to {activePlan.plan_number}</h3>
              <button
                type="button"
                onClick={() => setIsAddItemOpen(false)}
                className="p-1 rounded-lg text-teal-100 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Procedure from Catalog
                </label>
                <select
                  value={itemForm.procedureId}
                  onChange={(e) => handleSelectProcedureInItemForm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="">-- Choose from standard catalog or type custom --</option>
                  {procedures.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name} — ${parseFloat(p.default_estimated_cost || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Procedure Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={itemForm.procedureName}
                    onChange={(e) => setItemForm({ ...itemForm, procedureName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={itemForm.category}
                    onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
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
                    <option value="general">General</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Tooth # (FDI)</label>
                  <input
                    type="number"
                    value={itemForm.toothNumber}
                    onChange={(e) => setItemForm({ ...itemForm, toothNumber: e.target.value })}
                    placeholder="11-48, 51-85"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Surface</label>
                  <input
                    type="text"
                    value={itemForm.surface}
                    onChange={(e) => setItemForm({ ...itemForm, surface: e.target.value.toUpperCase() })}
                    placeholder="e.g. MO, MOD"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg uppercase font-mono font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={itemForm.priority}
                    onChange={(e) => setItemForm({ ...itemForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg capitalize focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={itemForm.quantity}
                    onChange={(e) => setItemForm({ ...itemForm, quantity: Math.max(1, parseInt(e.target.value || 1, 10)) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemForm.unitCost}
                    onChange={(e) => setItemForm({ ...itemForm, unitCost: parseFloat(e.target.value || 0) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Subtotal</label>
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-teal-800">
                    ${(parseFloat(itemForm.unitCost || 0) * parseInt(itemForm.quantity || 1, 10)).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Clinical Notes</label>
                  <input
                    type="text"
                    value={itemForm.clinicalNotes}
                    onChange={(e) => setItemForm({ ...itemForm, clinicalNotes: e.target.value })}
                    placeholder="Specific instructions or clinical justification"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Planned Session</label>
                  <input
                    type="number"
                    min="1"
                    value={itemForm.sessionOrder}
                    onChange={(e) => setItemForm({ ...itemForm, sessionOrder: Math.max(1, parseInt(e.target.value || 1, 10)) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddItemOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingItem}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isSubmittingItem ? 'Saving...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE ITEM CLINICAL NOTE MODAL */}
      {itemToComplete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold">Record Procedure Completion</h3>
              <button
                type="button"
                onClick={() => setItemToComplete(null)}
                className="p-1 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitCompletion} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
                <span className="font-bold block text-sm">{itemToComplete.procedure_name}</span>
                <span className="text-[11px] text-emerald-700">
                  {itemToComplete.tooth_number ? `Tooth #${itemToComplete.tooth_number}` : 'General'}{' '}
                  {itemToComplete.surface ? `(Surface ${itemToComplete.surface})` : ''}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Completion Clinical Notes & Observations
                </label>
                <textarea
                  rows={3}
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="e.g. Completed under 2% lidocaine local anesthesia. Shade A2 composite placed, light-cured, polished. Occlusion verified. Post-op instructions given."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setItemToComplete(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCompleting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition shadow-xs disabled:opacity-50 inline-flex items-center space-x-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isCompleting ? 'Finalizing...' : 'Confirm Completion'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PLAN VERSION HISTORY DRAWER / MODAL */}
      {isVersionHistoryOpen && activePlan && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-teal-400" />
                <h3 className="text-base font-bold">Treatment Plan Version History</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsVersionHistoryOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              <p className="text-slate-500 text-xs">
                Under clinical governance rules, whenever an approved or presented treatment plan is materially
                amended, an immutable snapshot of the prior scope is preserved.
              </p>
              {(activePlan.versions || []).map((ver) => (
                <div key={ver.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                        v{ver.version_number}
                      </span>
                      <span className="font-semibold text-slate-700 capitalize">{ver.status}</span>
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      {new Date(ver.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    <strong>Reason for Change:</strong> {ver.change_reason}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    <strong>Estimated Cost at Version:</strong> ${parseFloat(ver.total_estimated_cost || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONSENT MANAGEMENT MODAL */}
      <ConsentModal
        isOpen={isConsentOpen}
        onClose={() => setIsConsentOpen(false)}
        plan={activePlan}
        patient={patient}
        visit={visit}
        onConsentSuccess={() => {
          loadPlanDetails(activePlan.id);
          loadPlans(activePlan.id);
          if (onPlanUpdated) onPlanUpdated();
        }}
      />
    </div>
  );
};

export default TreatmentPlanManager;
