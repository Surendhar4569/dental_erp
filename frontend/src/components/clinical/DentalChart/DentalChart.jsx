import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stethoscope,
  Plus,
  Trash2,
  History,
  AlertCircle,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Eye,
  X,
  Activity,
  Info,
  Calendar,
  Layers,
  Sparkles,
  HelpCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { dentalChartService } from '../../../services/dentalChartService';
import {
  PERMANENT_QUADRANTS,
  PRIMARY_QUADRANTS,
  isAnterior,
  isPosterior,
  getValidSurfaces,
  getToothName,
  SURFACE_DESCRIPTIONS,
} from '../../../utils/dentalNotation';
import { ToothGraphic } from './ToothGraphic';
import { useAuth } from '../../../context/AuthContext';
import { TreatmentProposalModal } from '../TreatmentPlanning/TreatmentProposalModal';

export const DentalChart = ({
  patient,
  visit,
  examination,
  isReadOnly = false,
  onChartUpdated,
  onProposalCreated,
}) => {
  const { user } = useAuth();

  // Mode States
  const [dentitionMode, setDentitionMode] = useState('permanent'); // 'permanent' | 'primary' | 'mixed'
  const [viewScope, setViewScope] = useState('all'); // 'all' (Baseline) | 'visit' (This Visit)

  // Data States
  const [conditions, setConditions] = useState([]);
  const [baseline, setBaseline] = useState([]);
  const [visitFindings, setVisitFindings] = useState([]);
  const [stats, setStats] = useState({
    missing: 0,
    caries: 0,
    restorations: 0,
    rootCanals: 0,
    implants: 0,
    crowns: 0,
    totalChartedTeeth: 0,
  });
  const [loading, setLoading] = useState(true);

  // Selected Tooth & Finding Form State
  const [selectedTooth, setSelectedTooth] = useState(null);
  const [selectedSurfaces, setSelectedSurfaces] = useState([]);
  const [isWholeTooth, setIsWholeTooth] = useState(true);
  const [selectedConditionId, setSelectedConditionId] = useState('');
  const [findingType, setFindingType] = useState('observed_finding');
  const [severity, setSeverity] = useState('routine');
  const [isExistingCondition, setIsExistingCondition] = useState(false);
  const [findingNotes, setFindingNotes] = useState('');
  const [isSavingFinding, setIsSavingFinding] = useState(false);

  // Tooth History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [toothHistoryData, setToothHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Amendment Modal State
  const [showAmendmentModal, setShowAmendmentModal] = useState(false);
  const [findingToAmend, setFindingToAmend] = useState(null);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendmentNotes, setAmendmentNotes] = useState('');
  const [isSubmittingAmendment, setIsSubmittingAmendment] = useState(false);

  // Treatment Proposal Modal State
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [findingForProposal, setFindingForProposal] = useState(null);

  const patientId = patient?.id;
  const visitId = visit?.id;

  const canEdit = !isReadOnly && ['admin', 'dentist', 'specialist', 'assistant'].includes(user?.role);
  const canAmend = isReadOnly && ['admin', 'dentist', 'specialist'].includes(user?.role);

  // 1. Load Chart Data and Master Conditions
  const loadChartData = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [conditionsRes, chartRes] = await Promise.all([
        dentalChartService.getConditions(),
        dentalChartService.getPatientChart(patientId, visitId || null),
      ]);

      setConditions(conditionsRes.conditions || []);
      if (chartRes?.chart) {
        setBaseline(chartRes.chart.baseline || []);
        setVisitFindings(chartRes.chart.visitFindings || []);
        if (chartRes.chart.stats) {
          setStats(chartRes.chart.stats);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to load dental chart.');
    } finally {
      setLoading(false);
    }
  }, [patientId, visitId]);

  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  // Set default selected condition when conditions load
  useEffect(() => {
    if (conditions.length > 0 && !selectedConditionId) {
      const cariesCond = conditions.find((c) => c.code === 'caries');
      setSelectedConditionId(cariesCond ? cariesCond.id : conditions[0].id);
    }
  }, [conditions, selectedConditionId]);

  // Helper: Get findings for a specific tooth
  const getToothConditions = useCallback(
    (toothNumber) => {
      const num = Number(toothNumber);
      if (viewScope === 'visit') {
        return visitFindings.filter((f) => f.tooth_number === num);
      }
      // In baseline view, show baseline + any visit findings
      const toothBaseline = baseline.filter((b) => b.tooth_number === num);
      const toothVisit = visitFindings.filter((f) => f.tooth_number === num);
      return [...toothBaseline, ...toothVisit];
    },
    [baseline, visitFindings, viewScope]
  );

  // Handle Tooth Selection
  const handleSelectTooth = (toothNumber) => {
    const num = Number(toothNumber);
    setSelectedTooth(num);
    setIsWholeTooth(true);
    setSelectedSurfaces([]);
    setFindingNotes('');
    setIsExistingCondition(false);
  };

  // Handle Surface Selection directly from Tooth SVG
  const handleSelectSurface = (toothNumber, surfaceCode) => {
    const num = Number(toothNumber);
    setSelectedTooth(num);
    setIsWholeTooth(false);
    setSelectedSurfaces((prev) => {
      if (prev.includes(surfaceCode)) {
        const next = prev.filter((s) => s !== surfaceCode);
        if (next.length === 0) setIsWholeTooth(true);
        return next;
      } else {
        return [...prev, surfaceCode];
      }
    });
  };

  // Toggle surface selection in the side panel
  const handleToggleSurfacePill = (surfaceCode) => {
    setIsWholeTooth(false);
    setSelectedSurfaces((prev) => {
      if (prev.includes(surfaceCode)) {
        const next = prev.filter((s) => s !== surfaceCode);
        if (next.length === 0) setIsWholeTooth(true);
        return next;
      } else {
        return [...prev, surfaceCode];
      }
    });
  };

  const handleSelectWholeTooth = () => {
    setIsWholeTooth(true);
    setSelectedSurfaces([]);
  };

  // Selected Condition Object
  const selectedCondition = useMemo(() => {
    return conditions.find((c) => c.id === selectedConditionId);
  }, [conditions, selectedConditionId]);

  // Valid surfaces for currently selected tooth
  const validSurfacesForSelectedTooth = useMemo(() => {
    if (!selectedTooth) return [];
    return getValidSurfaces(selectedTooth);
  }, [selectedTooth]);

  // 2. Submit New Dental Finding
  const handleRecordFinding = async (e) => {
    e.preventDefault();
    if (!selectedTooth) {
      toast.warn('Please select a tooth on the dental chart.');
      return;
    }
    if (!visitId) {
      toast.error('No active visit encounter linked to this charting session.');
      return;
    }
    if (!selectedConditionId) {
      toast.warn('Please select a dental condition.');
      return;
    }

    // Surface validation
    let surfacePayload = null;
    if (!isWholeTooth && selectedSurfaces.length > 0) {
      surfacePayload = selectedSurfaces.join('');
    }

    setIsSavingFinding(true);
    try {
      const payload = {
        visit_id: visitId,
        patient_id: patientId,
        tooth_number: selectedTooth,
        surface: surfacePayload,
        condition_id: selectedConditionId,
        finding_type: findingType,
        severity,
        is_existing_condition: isExistingCondition,
        notes: findingNotes.trim() || null,
      };

      const res = await dentalChartService.recordFinding(payload);
      toast.success(
        `Recorded ${res.finding.condition_name} on Tooth #${selectedTooth}${
          surfacePayload ? ` (${surfacePayload})` : ''
        }`
      );

      // Refresh chart data
      await loadChartData();
      if (onChartUpdated) onChartUpdated();

      // Reset selection state
      setSelectedSurfaces([]);
      setIsWholeTooth(true);
      setFindingNotes('');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to record finding.');
    } finally {
      setIsSavingFinding(false);
    }
  };

  // 3. Delete Finding
  const handleDeleteFinding = async (findingId, toothNum) => {
    if (!window.confirm(`Delete this clinical finding from Tooth #${toothNum}?`)) {
      return;
    }
    try {
      await dentalChartService.deleteFinding(findingId);
      toast.success('Finding removed.');
      await loadChartData();
      if (onChartUpdated) onChartUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete finding.');
    }
  };

  // 4. Open Tooth History Modal
  const handleOpenToothHistory = async (toothNum) => {
    if (!toothNum || !patientId) return;
    setLoadingHistory(true);
    setShowHistoryModal(true);
    try {
      const res = await dentalChartService.getToothHistory(patientId, toothNum);
      setToothHistoryData(res.tooth);
    } catch (err) {
      toast.error('Failed to load tooth history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  // 5. Open Amendment Modal
  const handleOpenAmendment = (finding) => {
    setFindingToAmend(finding);
    setAmendmentReason('');
    setAmendmentNotes('');
    setShowAmendmentModal(true);
  };

  // 6. Submit Amendment
  const handleSubmitAmendment = async (e) => {
    e.preventDefault();
    if (!findingToAmend?.id || !amendmentReason.trim()) {
      toast.warn('Please enter an amendment reason.');
      return;
    }

    setIsSubmittingAmendment(true);
    try {
      await dentalChartService.amendFinding(findingToAmend.id, {
        amendment_reason: amendmentReason.trim(),
        new_notes: amendmentNotes.trim() || undefined,
        action: 'modified',
      });
      toast.success('Legal amendment recorded.');
      setShowAmendmentModal(false);
      setFindingToAmend(null);
      await loadChartData();
      if (onChartUpdated) onChartUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to submit amendment.');
    } finally {
      setIsSubmittingAmendment(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 w-full">
      {/* LEFT COLUMN: Odontogram Chart & Controls */}
      <div className="flex-1 flex flex-col space-y-4">
        {/* Controls Toolbar: Mode Switcher & Stats */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          {/* Dentition Selector */}
          <div className="flex items-center space-x-1 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setDentitionMode('permanent')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                dentitionMode === 'permanent'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Permanent (Adult 32)
            </button>
            <button
              type="button"
              onClick={() => setDentitionMode('primary')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                dentitionMode === 'primary'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Primary (Pediatric 20)
            </button>
            <button
              type="button"
              onClick={() => setDentitionMode('mixed')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                dentitionMode === 'mixed'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Mixed Dentition
            </button>
          </div>

          {/* Scope Toggle: Cumulative Baseline vs This Visit Only */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">Scope:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewScope('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  viewScope === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Cumulative Baseline
              </button>
              <button
                type="button"
                onClick={() => setViewScope('visit')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center space-x-1 ${
                  viewScope === 'visit'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>Visit #{visit?.token_display || 'Today'}</span>
                {visitFindings.length > 0 && (
                  <span className="bg-teal-800 text-teal-100 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {visitFindings.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Statistical Summary Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xs">
              C
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Caries</div>
              <div className="text-sm font-bold text-rose-700">{stats.caries}</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
              R
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Restored</div>
              <div className="text-sm font-bold text-blue-700">{stats.restorations}</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xs">
              ⚡
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">RCT</div>
              <div className="text-sm font-bold text-purple-700">{stats.rootCanals}</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
              👑
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Crowns</div>
              <div className="text-sm font-bold text-amber-700">{stats.crowns}</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
              ✕
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Missing</div>
              <div className="text-sm font-bold text-slate-700">{stats.missing}</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-md bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-xs">
              #
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400">Charted</div>
              <div className="text-sm font-bold text-teal-700">{stats.totalChartedTeeth}/32</div>
            </div>
          </div>
        </div>

        {/* Odontogram Interactive Arch Surface */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm flex flex-col space-y-6 overflow-x-auto">
          {/* Orientation Banner */}
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 border-b border-slate-100 pb-2">
            <span>◀ Patient Right (Maxillary)</span>
            <span className="text-teal-700 font-extrabold">FDI Dental Odontogram</span>
            <span>Patient Left (Maxillary) ▶</span>
          </div>

          {/* UPPER ARCH (Maxillary) */}
          <div className="flex flex-col items-center space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-0.5 rounded-full">
              Upper Arch (Maxilla)
            </span>

            {/* Permanent Upper Arch */}
            {(dentitionMode === 'permanent' || dentitionMode === 'mixed') && (
              <div className="flex items-center justify-center space-x-1 sm:space-x-1.5 w-full">
                {/* Quadrant 1 (Upper Right: 18 -> 11) */}
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  {PERMANENT_QUADRANTS.upperRight.map((t) => (
                    <ToothGraphic
                      key={t}
                      toothNumber={t}
                      arch="upper"
                      baselineConditions={baseline.filter((b) => b.tooth_number === t)}
                      visitFindings={visitFindings.filter((f) => f.tooth_number === t)}
                      isSelected={selectedTooth === t}
                      onSelectTooth={handleSelectTooth}
                      onSelectSurface={handleSelectSurface}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>

                {/* Maxillary Midline Divider */}
                <div className="h-16 w-0.5 bg-rose-300 mx-1 relative flex items-center justify-center">
                  <span className="absolute -top-3 text-[9px] font-bold text-rose-500 font-mono">
                    |
                  </span>
                </div>

                {/* Quadrant 2 (Upper Left: 21 -> 28) */}
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  {PERMANENT_QUADRANTS.upperLeft.map((t) => (
                    <ToothGraphic
                      key={t}
                      toothNumber={t}
                      arch="upper"
                      baselineConditions={baseline.filter((b) => b.tooth_number === t)}
                      visitFindings={visitFindings.filter((f) => f.tooth_number === t)}
                      isSelected={selectedTooth === t}
                      onSelectTooth={handleSelectTooth}
                      onSelectSurface={handleSelectSurface}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Primary Upper Arch */}
            {(dentitionMode === 'primary' || dentitionMode === 'mixed') && (
              <div className="flex items-center justify-center space-x-1 sm:space-x-1.5 w-full pt-1 border-t border-slate-100 border-dashed">
                {/* Quadrant 5 (Primary Upper Right: 55 -> 51) */}
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  {PRIMARY_QUADRANTS.upperRight.map((t) => (
                    <ToothGraphic
                      key={t}
                      toothNumber={t}
                      arch="upper"
                      baselineConditions={baseline.filter((b) => b.tooth_number === t)}
                      visitFindings={visitFindings.filter((f) => f.tooth_number === t)}
                      isSelected={selectedTooth === t}
                      onSelectTooth={handleSelectTooth}
                      onSelectSurface={handleSelectSurface}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>

                {/* Midline Divider */}
                <div className="h-14 w-0.5 bg-rose-300 mx-1" />

                {/* Quadrant 6 (Primary Upper Left: 61 -> 65) */}
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  {PRIMARY_QUADRANTS.upperLeft.map((t) => (
                    <ToothGraphic
                      key={t}
                      toothNumber={t}
                      arch="upper"
                      baselineConditions={baseline.filter((b) => b.tooth_number === t)}
                      visitFindings={visitFindings.filter((f) => f.tooth_number === t)}
                      isSelected={selectedTooth === t}
                      onSelectTooth={handleSelectTooth}
                      onSelectSurface={handleSelectSurface}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Occlusal Plane Separator */}
          <div className="relative py-1">
            <div className="border-t-2 border-slate-200 border-dashed w-full" />
            <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-white px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Occlusal Plane
            </span>
          </div>

          {/* LOWER ARCH (Mandibular) */}
          <div className="flex flex-col items-center space-y-3">
            {/* Primary Lower Arch */}
            {(dentitionMode === 'primary' || dentitionMode === 'mixed') && (
              <div className="flex items-center justify-center space-x-1 sm:space-x-1.5 w-full pb-1 border-b border-slate-100 border-dashed">
                {/* Quadrant 8 (Primary Lower Right: 85 -> 81) */}
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  {PRIMARY_QUADRANTS.lowerRight.map((t) => (
                    <ToothGraphic
                      key={t}
                      toothNumber={t}
                      arch="lower"
                      baselineConditions={baseline.filter((b) => b.tooth_number === t)}
                      visitFindings={visitFindings.filter((f) => f.tooth_number === t)}
                      isSelected={selectedTooth === t}
                      onSelectTooth={handleSelectTooth}
                      onSelectSurface={handleSelectSurface}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>

                {/* Midline Divider */}
                <div className="h-14 w-0.5 bg-rose-300 mx-1" />

                {/* Quadrant 7 (Primary Lower Left: 71 -> 75) */}
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  {PRIMARY_QUADRANTS.lowerLeft.map((t) => (
                    <ToothGraphic
                      key={t}
                      toothNumber={t}
                      arch="lower"
                      baselineConditions={baseline.filter((b) => b.tooth_number === t)}
                      visitFindings={visitFindings.filter((f) => f.tooth_number === t)}
                      isSelected={selectedTooth === t}
                      onSelectTooth={handleSelectTooth}
                      onSelectSurface={handleSelectSurface}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Permanent Lower Arch */}
            {(dentitionMode === 'permanent' || dentitionMode === 'mixed') && (
              <div className="flex items-center justify-center space-x-1 sm:space-x-1.5 w-full">
                {/* Quadrant 4 (Lower Right: 48 -> 41) */}
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  {PERMANENT_QUADRANTS.lowerRight.map((t) => (
                    <ToothGraphic
                      key={t}
                      toothNumber={t}
                      arch="lower"
                      baselineConditions={baseline.filter((b) => b.tooth_number === t)}
                      visitFindings={visitFindings.filter((f) => f.tooth_number === t)}
                      isSelected={selectedTooth === t}
                      onSelectTooth={handleSelectTooth}
                      onSelectSurface={handleSelectSurface}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>

                {/* Mandibular Midline Divider */}
                <div className="h-16 w-0.5 bg-rose-300 mx-1 relative flex items-center justify-center">
                  <span className="absolute -bottom-3 text-[9px] font-bold text-rose-500 font-mono">
                    |
                  </span>
                </div>

                {/* Quadrant 3 (Lower Left: 31 -> 38) */}
                <div className="flex items-center space-x-0.5 sm:space-x-1">
                  {PERMANENT_QUADRANTS.lowerLeft.map((t) => (
                    <ToothGraphic
                      key={t}
                      toothNumber={t}
                      arch="lower"
                      baselineConditions={baseline.filter((b) => b.tooth_number === t)}
                      visitFindings={visitFindings.filter((f) => f.tooth_number === t)}
                      isSelected={selectedTooth === t}
                      onSelectTooth={handleSelectTooth}
                      onSelectSurface={handleSelectSurface}
                      isReadOnly={!canEdit}
                    />
                  ))}
                </div>
              </div>
            )}

            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-0.5 rounded-full">
              Lower Arch (Mandible)
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 border-t border-slate-100 pt-2">
            <span>◀ Patient Right (Mandibular)</span>
            <span className="text-slate-400">Click tooth or surface to chart</span>
            <span>Patient Left (Mandibular) ▶</span>
          </div>
        </div>

        {/* Visual Condition Legend (Accessible with symbols & colors) */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-teal-600" />
            <span>Clinical Condition Master Legend</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((c) => (
              <div
                key={c.id}
                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs shadow-2xs"
                title={c.description}
              >
                <span
                  className="w-3.5 h-3.5 rounded-xs flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                  style={{ backgroundColor: c.color_hex }}
                >
                  {c.badge_symbol}
                </span>
                <span className="font-medium text-slate-700 text-[11px]">{c.display_name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Tooth Detail & Finding Recording Panel */}
      <div className="w-full lg:w-96 flex flex-col space-y-4">
        {selectedTooth ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-md overflow-hidden flex flex-col">
            {/* Tooth Header Card */}
            <div className="bg-gradient-to-r from-teal-500 to-teal-700 text-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-800/60 px-2 py-0.5 rounded-full text-teal-100">
                    {isAnterior(selectedTooth) ? 'Anterior Tooth' : 'Posterior Tooth'}
                  </span>
                  <h3 className="text-lg font-bold mt-1 flex items-center space-x-2">
                    <span>Tooth #{selectedTooth}</span>
                  </h3>
                  <p className="text-xs text-teal-100 mt-0.5">{getToothName(selectedTooth)}</p>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFindingForProposal(null);
                      setShowProposalModal(true);
                    }}
                    className="px-2.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
                    title="Create Treatment Proposal for Tooth"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Propose Treatment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenToothHistory(selectedTooth)}
                    className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-xs"
                    title="View chronological history for this tooth"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Existing Findings List on Selected Tooth */}
            <div className="p-4 border-b border-slate-200 max-h-56 overflow-y-auto">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
                <span>Active Conditions on Tooth #{selectedTooth}</span>
                <span className="text-slate-400 font-normal">
                  ({getToothConditions(selectedTooth).length})
                </span>
              </h4>

              {getToothConditions(selectedTooth).length === 0 ? (
                <div className="text-center py-3 text-xs text-slate-400 italic bg-slate-50 rounded-lg border border-slate-100">
                  No recorded pathology or restorations. Intact healthy tooth.
                </div>
              ) : (
                <div className="space-y-2">
                  {getToothConditions(selectedTooth).map((cond, idx) => {
                    const isFromThisVisit = visitFindings.some((vf) => vf.id === cond.id);
                    return (
                      <div
                        key={cond.id || idx}
                        className={`p-2.5 rounded-lg border text-xs flex items-start justify-between space-x-2 transition-all ${
                          isFromThisVisit
                            ? 'bg-teal-50/50 border-teal-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-1.5">
                            <span
                              className="w-4 h-4 rounded-xs text-[9px] font-bold text-white flex items-center justify-center shrink-0"
                              style={{ backgroundColor: cond.color_hex || '#0D9488' }}
                            >
                              {cond.badge_symbol || '●'}
                            </span>
                            <span className="font-bold text-slate-900">
                              {cond.condition_name || cond.display_name}
                            </span>
                            {cond.surface && (
                              <span className="font-mono font-bold bg-slate-200 text-slate-700 px-1 py-0.2 rounded-xs text-[10px]">
                                {cond.surface}
                              </span>
                            )}
                            {isFromThisVisit && (
                              <span className="bg-teal-100 text-teal-800 text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                                This Visit
                              </span>
                            )}
                          </div>
                          {cond.notes && (
                            <p className="text-[11px] text-slate-600 mt-1 italic leading-tight">
                              "{cond.notes}"
                            </p>
                          )}
                          <div className="text-[10px] text-slate-400 mt-1">
                            {cond.last_visit_date || cond.created_at
                              ? new Date(cond.last_visit_date || cond.created_at).toLocaleDateString()
                              : 'Baseline'}
                            {cond.recorded_by_first_name && ` by Dr. ${cond.recorded_by_first_name}`}
                          </div>
                        </div>

                        {/* Action buttons (Propose Treatment / Delete if draft / Amend if signed) */}
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setFindingForProposal(cond);
                              setShowProposalModal(true);
                            }}
                            className="px-2 py-0.5 text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md border border-teal-200 transition-colors flex items-center space-x-0.5"
                            title="Create treatment proposal for this specific finding"
                          >
                            <Sparkles className="w-3 h-3 text-teal-600" />
                            <span>Propose</span>
                          </button>
                          {isFromThisVisit && canEdit && (
                            <button
                              type="button"
                              onClick={() => handleDeleteFinding(cond.id, selectedTooth)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                              title="Delete this finding"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isReadOnly && canAmend && (
                            <button
                              type="button"
                              onClick={() => handleOpenAmendment(cond)}
                              className="px-2 py-0.5 text-[10px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md border border-purple-200 transition-colors"
                              title="Legal Amendment"
                            >
                              Amend
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RECORD FINDING FORM */}
            <div className="p-4 flex-1">
              {isReadOnly ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start space-x-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Finalized Examination</span>
                    <p className="mt-0.5 text-[11px] text-amber-800">
                      This clinical examination is sealed and legally finalized. To modify or add observations, record a legal clinical amendment.
                    </p>
                  </div>
                </div>
              ) : canEdit ? (
                <form onSubmit={handleRecordFinding} className="space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <Plus className="w-3.5 h-3.5 text-teal-600" />
                    <span>Record Finding on Tooth #{selectedTooth}</span>
                  </h4>

                  {/* Surface Selection Buttons */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Surface / Location
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={handleSelectWholeTooth}
                        className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                          isWholeTooth
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Entire Tooth
                      </button>

                      {validSurfacesForSelectedTooth.map((s) => {
                        const isSelected = selectedSurfaces.includes(s);
                        const desc = SURFACE_DESCRIPTIONS[s];
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleToggleSurfacePill(s)}
                            className={`px-2 py-1 text-xs font-bold rounded-md transition-all flex items-center space-x-1 ${
                              isSelected
                                ? 'bg-teal-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                            title={`${desc?.name}: ${desc?.description}`}
                          >
                            <span>{s}</span>
                            <span className="text-[10px] opacity-75">
                              {s === 'O' ? 'Occlusal' : s === 'I' ? 'Incisal' : s === 'B' ? 'Buccal' : s === 'L' ? 'Lingual' : s === 'M' ? 'Mesial' : 'Distal'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Condition Selector */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Clinical Condition *
                    </label>
                    <select
                      value={selectedConditionId}
                      onChange={(e) => setSelectedConditionId(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    >
                      {conditions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.display_name} ({c.category})
                        </option>
                      ))}
                    </select>
                    {selectedCondition?.description && (
                      <p className="text-[10px] text-slate-500 mt-1 italic">
                        {selectedCondition.description}
                      </p>
                    )}
                  </div>

                  {/* Finding Type & Pre-existing Checkbox */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isExistingCondition}
                        onChange={(e) => {
                          setIsExistingCondition(e.target.checked);
                          if (e.target.checked) setFindingType('pre_existing');
                          else setFindingType('observed_finding');
                        }}
                        className="rounded-sm border-slate-300 text-teal-600 focus:ring-teal-500 h-3.5 w-3.5"
                      />
                      <span className="text-xs text-slate-700 font-semibold">
                        Pre-existing Condition (present prior to this visit)
                      </span>
                    </label>

                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Severity:
                      </span>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value)}
                        className="text-xs rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="routine">Routine</option>
                        <option value="moderate">Moderate</option>
                        <option value="severe">Severe</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  {/* Clinical Observation Notes */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Observation Notes (Optional)
                    </label>
                    <textarea
                      rows="2"
                      value={findingNotes}
                      onChange={(e) => setFindingNotes(e.target.value)}
                      placeholder="e.g. Cavitation at cervical margin, asymptomatic..."
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                    />
                  </div>

                  {/* Save Finding Button */}
                  <button
                    type="submit"
                    disabled={isSavingFinding}
                    className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {isSavingFinding ? (
                      <>
                        <Activity className="w-4 h-4 animate-spin" />
                        <span>Saving Finding...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Save to Chart{' '}
                          {selectedSurfaces.length > 0 ? `(${selectedSurfaces.join('')})` : ''}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs text-center">
                  You have read-only access to dental records.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty Selection State */
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center flex flex-col items-center justify-center space-y-3 min-h-[300px]">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shadow-2xs">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">Select a Tooth to Chart</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Click any tooth on the upper or lower arch to inspect existing pathology, view past history, or record findings.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* TOOTH HISTORY MODAL */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                  {toothHistoryData?.toothNumber || selectedTooth}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Tooth #{toothHistoryData?.toothNumber || selectedTooth} History
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {toothHistoryData?.toothName || 'Chronological Finding Timeline'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {loadingHistory ? (
                <div className="text-center py-8 text-xs text-slate-400 flex items-center justify-center space-x-2">
                  <Activity className="w-4 h-4 animate-spin text-teal-600" />
                  <span>Loading tooth timeline...</span>
                </div>
              ) : !toothHistoryData?.history || toothHistoryData.history.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 italic">
                  No previous historical interventions or pathology recorded for this tooth.
                </div>
              ) : (
                <div className="relative pl-4 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {toothHistoryData.history.map((h, i) => (
                    <div key={h.id || i} className="relative flex flex-col space-y-1">
                      <span className="absolute -left-3.5 top-1 w-3 h-3 rounded-full bg-teal-600 ring-4 ring-white" />
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {h.condition_name} {h.surface ? `(${h.surface})` : ''}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(h.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {h.notes && (
                          <p className="text-[11px] text-slate-600 mt-1 italic leading-tight">
                            "{h.notes}"
                          </p>
                        )}
                        <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-1">
                          <span>Visit Token: #{h.visit_token || '---'}</span>
                          <span>Dr. {h.recorded_by_first_name} {h.recorded_by_last_name}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AMENDMENT MODAL */}
      {showAmendmentModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-purple-100 bg-purple-50/50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Legal Dental Chart Amendment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAmendmentModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAmendment} className="p-5 space-y-3.5">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Target Finding</span>
                <div className="font-bold text-slate-800 mt-0.5">
                  Tooth #{findingToAmend?.tooth_number} — {findingToAmend?.condition_name}{' '}
                  {findingToAmend?.surface ? `(${findingToAmend.surface})` : ''}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for Legal Amendment *
                </label>
                <textarea
                  rows="2"
                  value={amendmentReason}
                  onChange={(e) => setAmendmentReason(e.target.value)}
                  placeholder="e.g. Additional radiographic finding revealed secondary caries extending distally..."
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amendment Notes
                </label>
                <textarea
                  rows="2"
                  value={amendmentNotes}
                  onChange={(e) => setAmendmentNotes(e.target.value)}
                  placeholder="Additional clinical addendum details..."
                  className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAmendmentModal(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAmendment}
                  className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isSubmittingAmendment ? 'Submitting...' : 'Sign Legal Amendment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Treatment Proposal Modal Bridge */}
      <TreatmentProposalModal
        isOpen={showProposalModal}
        onClose={() => {
          setShowProposalModal(false);
          setFindingForProposal(null);
        }}
        patient={patient}
        visit={visit}
        examination={examination}
        toothNumber={selectedTooth}
        finding={findingForProposal}
        onProposalSuccess={(res) => {
          if (onProposalCreated) {
            onProposalCreated(res);
          }
        }}
      />
    </div>
  );
};

export default DentalChart;
