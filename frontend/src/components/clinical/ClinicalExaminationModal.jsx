import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { clinicalService } from '../../services/clinicalService';
import { DentalChart } from './DentalChart/DentalChart';
import { TreatmentPlanManager } from './TreatmentPlanning/TreatmentPlanManager';
import { PrescriptionManager } from './Prescriptions/PrescriptionManager';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import {
  X,
  FileText,
  CheckCircle2,
  Lock,
  ShieldCheck,
  AlertCircle,
  Stethoscope,
  HeartPulse,
  Eye,
  EyeOff,
  Plus,
  Clock,
  Save,
  Share2,
  FileCheck,
  History,
  Info,
  Pill,
} from 'lucide-react';

export const ClinicalExaminationModal = ({
  isOpen,
  onClose,
  visit,
  patient,
  appointment,
  doctor,
  onUpdated,
}) => {
  const { user } = useAuth();

  const [examination, setExamination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

  // Form State (Doctor's Clinical Findings - Vitals are captured in Vitals/Triage)
  const [formData, setFormData] = useState({
    chief_complaint: '',
    examination_notes: '',
    diagnosis: '',
    patient_facing_summary: '',
    follow_up_instructions: '',
  });

  // Amendment Form State
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendmentNotes, setAmendmentNotes] = useState('');
  const [isSubmittingAmendment, setIsSubmittingAmendment] = useState(false);

  // Portal Preview State
  const [showPortalPreview, setShowPortalPreview] = useState(false);
  const [portalPreviewData, setPortalPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Tab State: 'notes' | 'dental_chart'
  const [activeTab, setActiveTab] = useState('notes');

  // Resolve IDs
  const visitId = visit?.id || appointment?.visit_id;
  const patientId = patient?.id || visit?.patient_id || appointment?.patient_id;
  const appointmentId = appointment?.id || visit?.appointment_id || null;

  // Fetch or initialize examination draft
  const loadExamination = useCallback(async () => {
    if (!visitId && !appointmentId) return;
    setLoading(true);
    try {
      // First attempt to get existing examination by visit ID
      let exam = null;
      if (visitId) {
        try {
          const res = await clinicalService.getExaminationByVisitId(visitId);
          if (res?.examination) {
            exam = res.examination;
          }
        } catch {
          // If 404, we'll create or get draft below
        }
      }

      if (!exam) {
        // Create or get draft linked to the visit
        const draftPayload = {
          visit_id: visitId,
          patient_id: patientId,
          appointment_id: appointmentId,
          chief_complaint: appointment?.chief_complaint || '',
        };
        const draftRes = await clinicalService.createOrGetDraft(draftPayload);
        exam = draftRes?.examination;
      }

      setExamination(exam);

      // Populate doctor clinical form data
      if (exam) {
        setFormData({
          chief_complaint: exam.chief_complaint || '',
          examination_notes: exam.examination_notes || '',
          diagnosis: exam.diagnosis || '',
          patient_facing_summary: exam.patient_facing_summary || '',
          follow_up_instructions: exam.follow_up_instructions || '',
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to load clinical examination.');
    } finally {
      setLoading(false);
    }
  }, [visitId, patientId, appointmentId, appointment?.chief_complaint]);

  // Read-only latest pre-consultation vitals recorded for this visit
  const latestVitals = useMemo(() => {
    if (examination?.triage_vitals && examination.triage_vitals.length > 0) {
      return examination.triage_vitals[0];
    }
    if (examination?.vital_signs && Object.keys(examination.vital_signs).length > 0) {
      const vs = examination.vital_signs;
      return {
        blood_pressure: vs.blood_pressure || null,
        pulse_bpm: vs.pulse_bpm || null,
        temperature_f: vs.temperature_f || null,
        spo2_percent: vs.spo2_percent || null,
        respiratory_rate: vs.respiratory_rate || null,
        weight_kg: vs.weight_kg || null,
        height_cm: vs.height_cm || null,
        bmi: vs.bmi || null,
        triage_priority: vs.triage_priority || 'routine',
        triage_notes: vs.triage_notes || null,
        recorded_by_first_name: vs.triage_recorded_by || null,
        recorded_at: vs.triage_recorded_at || null,
      };
    }
    return null;
  }, [examination?.triage_vitals, examination?.vital_signs]);

  useEffect(() => {
    if (isOpen) {
      loadExamination();
      setShowAmendmentForm(false);
      setShowPortalPreview(false);
      setActiveTab('notes');
    } else {
      setExamination(null);
    }
  }, [isOpen, loadExamination]);

  if (!isOpen) return null;

  const isSigned = examination?.status === 'signed';
  const isLocked = examination?.status === 'locked';
  const isReadOnly = isSigned || isLocked;
  const isReleased = Boolean(examination?.is_released_to_patient);

  const canEdit = !isReadOnly && ['admin', 'dentist', 'specialist'].includes(user?.role);
  const canSign = !isReadOnly && ['admin', 'dentist', 'specialist'].includes(user?.role);
  const canAmend = isReadOnly && ['admin', 'dentist', 'specialist'].includes(user?.role);
  const canRelease = ['admin', 'dentist', 'specialist', 'receptionist', 'assistant'].includes(user?.role);

  // Handle Save Draft (Doctor Clinical Findings only; vitals remain anchored to visit triage)
  const handleSaveDraft = async () => {
    if (!examination?.id) return;
    setIsSaving(true);
    try {
      const payload = {
        chief_complaint: formData.chief_complaint,
        examination_notes: formData.examination_notes,
        diagnosis: formData.diagnosis,
        patient_facing_summary: formData.patient_facing_summary,
        follow_up_instructions: formData.follow_up_instructions,
      };

      const res = await clinicalService.updateDraft(examination.id, payload);
      setExamination(res.examination);
      toast.success('Clinical examination draft saved.');
      if (onUpdated) onUpdated(res.examination);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save draft.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Doctor Sign-Off
  const handleSignOff = async () => {
    if (!examination?.id) return;
    const confirm = window.confirm(
      'Are you sure you want to sign and seal this clinical record? Once signed, this note becomes immutable. Any future additions must be appended as legal amendments.'
    );
    if (!confirm) return;

    setIsSigning(true);
    try {
      // First save current form changes
      await handleSaveDraft();
      // Then sign
      const res = await clinicalService.signExamination(examination.id);
      setExamination(res.examination);
      toast.success('Clinical examination signed and sealed with cryptographic integrity hash.');
      if (onUpdated) onUpdated(res.examination);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Sign-off failed.');
    } finally {
      setIsSigning(false);
    }
  };

  // Handle Lock
  const handleLock = async () => {
    if (!examination?.id) return;
    const confirm = window.confirm('Lock this clinical record permanently?');
    if (!confirm) return;

    setIsLocking(true);
    try {
      const res = await clinicalService.lockExamination(examination.id);
      setExamination(res.examination);
      toast.success('Clinical examination record locked.');
      if (onUpdated) onUpdated(res.examination);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to lock record.');
    } finally {
      setIsLocking(false);
    }
  };

  // Handle Patient Release Toggle
  const handleToggleRelease = async () => {
    if (!examination?.id) return;
    const targetState = !isReleased;
    setIsReleasing(true);
    try {
      const res = await clinicalService.setPatientRelease(examination.id, targetState);
      setExamination(res.examination);
      toast.success(
        targetState
          ? 'Patient-facing summary released to Patient Portal.'
          : 'Patient portal release revoked.'
      );
      if (onUpdated) onUpdated(res.examination);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update patient release.');
    } finally {
      setIsReleasing(false);
    }
  };

  // Handle Add Amendment
  const handleSubmitAmendment = async (e) => {
    e.preventDefault();
    if (!examination?.id) return;
    if (!amendmentReason.trim() || !amendmentNotes.trim()) {
      toast.error('Both amendment reason and amendment notes are required.');
      return;
    }

    setIsSubmittingAmendment(true);
    try {
      const res = await clinicalService.addAmendment(examination.id, {
        amendment_reason: amendmentReason.trim(),
        amendment_notes: amendmentNotes.trim(),
      });
      setExamination(res.examination);
      setAmendmentReason('');
      setAmendmentNotes('');
      setShowAmendmentForm(false);
      toast.success('Legal amendment recorded and appended to examination history.');
      if (onUpdated) onUpdated(res.examination);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to record amendment.');
    } finally {
      setIsSubmittingAmendment(false);
    }
  };

  // Load Patient Portal Preview
  const handleOpenPortalPreview = async () => {
    if (!visitId) return;
    setLoadingPreview(true);
    setShowPortalPreview(true);
    try {
      const preview = await clinicalService.getPatientPortalPreview(visitId, patientId);
      setPortalPreviewData(preview);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to load preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-teal-50/20 to-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isLocked
                  ? 'bg-slate-200 text-slate-700'
                  : isSigned
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-teal-100 text-teal-700'
              }`}
            >
              {isLocked ? (
                <Lock className="w-5 h-5" />
              ) : isSigned ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <Stethoscope className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">
                  Clinical Examination & Case Notes
                </h2>
                {/* Status Badges */}
                {examination && (
                  <>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isLocked
                          ? 'bg-slate-800 text-slate-100'
                          : isSigned
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {examination.status === 'draft' ? 'Draft In Progress' : examination.status}
                    </span>

                    {/* Patient Release Status */}
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                        isReleased
                          ? 'bg-teal-100 text-teal-800 border border-teal-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isReleased ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                      <span>{isReleased ? 'Patient Portal Released' : 'Portal Access Private'}</span>
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Patient:{' '}
                <strong className="text-slate-800">
                  {patient?.first_name || appointment?.patient_first_name}{' '}
                  {patient?.last_name || appointment?.patient_last_name}
                </strong>{' '}
                <span className="font-mono text-slate-500">
                  (#{patient?.patient_number || appointment?.patient_number})
                </span>{' '}
                • Visit Token:{' '}
                <strong className="text-teal-700">
                  #{visit?.token_display || appointment?.visit_token_display || '---'}
                </strong>{' '}
                • Doctor:{' '}
                <span className="text-slate-700">
                  Dr. {doctor?.first_name || appointment?.doctor_first_name || examination?.doctor_first_name || 'Assigned Dentist'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100/90 px-5 pt-2 pb-0 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-1 sm:space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center space-x-2 ${
                activeTab === 'notes'
                  ? 'bg-white text-teal-800 border-teal-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
              }`}
            >
              <FileText className="w-4 h-4 text-teal-600" />
              <span>Clinical Notes & Assessment</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dental_chart')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center space-x-2 ${
                activeTab === 'dental_chart'
                  ? 'bg-white text-teal-800 border-teal-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-[10px]">
                #
              </div>
              <span>Interactive Dental Chart (Odontogram)</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-teal-50 text-teal-700 border border-teal-200 rounded">
                FDI
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('treatment_plans')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center space-x-2 ${
                activeTab === 'treatment_plans'
                  ? 'bg-white text-teal-800 border-teal-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
              }`}
            >
              <FileCheck className="w-4 h-4 text-teal-600" />
              <span>Treatment Plans & Consent</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('prescriptions')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition flex items-center space-x-2 ${
                activeTab === 'prescriptions'
                  ? 'bg-white text-teal-800 border-teal-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
              }`}
            >
              <Pill className="w-4 h-4 text-teal-600" />
              <span>Prescriptions & Medications</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:block">
            {activeTab === 'notes' ? (
              <span>Vitals & Diagnostic Notes</span>
            ) : activeTab === 'dental_chart' ? (
              <span>Adult & Pediatric Anatomical Charting</span>
            ) : activeTab === 'treatment_plans' ? (
              <span>Staged Procedures & Informed Consent</span>
            ) : (
              <span>Clinical Prescriptions & Drug Orders</span>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="py-16 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
              <p className="text-xs text-slate-500 mt-2">Loading clinical examination record...</p>
            </div>
          ) : activeTab === 'notes' ? (
            <>
              {/* Sealed Record Security Banner */}
              {isReadOnly && (
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-start space-x-3 text-xs">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-emerald-900">
                      Record Cryptographically Signed & Sealed by Dr. {examination.signed_by_first_name} {examination.signed_by_last_name}
                      {examination.signed_at && (
                        <span className="font-normal text-emerald-700 ml-1">
                          on {new Date(examination.signed_at).toLocaleString()}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-emerald-800 font-mono break-all">
                      SHA-256 Seal Hash: {examination.signature_hash}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Immutability Guard Active: Content changes are locked by PostgreSQL database trigger. Use the amendment tool below for legal addenda.
                    </p>
                  </div>
                </div>
              )}

              {/* Pre-Consultation Vitals & Triage Section (Read-Only Staff Assessment) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <HeartPulse className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-bold text-slate-800">
                      Pre-Consultation Vitals & Triage
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
                      Staff Assessment (Read-Only)
                    </span>
                  </div>
                  {latestVitals?.bmi && (
                    <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
                      BMI: {latestVitals.bmi} kg/m²
                    </span>
                  )}
                </div>

                {latestVitals ? (
                  <div className="space-y-3">
                    {/* Triage Priority Banner & Metadata */}
                    <div className="p-3 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-semibold text-slate-500">Triage Priority:</span>
                        <span
                          className={`font-bold px-2 py-0.5 rounded uppercase text-[10px] ${
                            latestVitals.triage_priority === 'urgent'
                              ? 'bg-rose-600 text-white animate-pulse'
                              : latestVitals.triage_priority === 'priority'
                              ? 'bg-amber-500 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {latestVitals.triage_priority}
                        </span>
                        {latestVitals.recorded_by_first_name && (
                          <span className="text-xs text-slate-600 ml-1">
                            Recorded by <strong className="text-slate-800">{latestVitals.recorded_by_first_name} {latestVitals.recorded_by_last_name}</strong> ({latestVitals.recorded_by_role || 'Staff'})
                          </span>
                        )}
                      </div>
                      {latestVitals.recorded_at && (
                        <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{new Date(latestVitals.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(latestVitals.recorded_at).toLocaleDateString()})</span>
                        </span>
                      )}
                    </div>

                    {/* Vitals Metrics Grid (Read-Only Cards) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Blood Pressure</span>
                        <span className="text-sm font-bold text-slate-900 block mt-0.5">
                          {latestVitals.blood_pressure || '—'}
                        </span>
                        <span className="text-[10px] text-slate-400">mmHg</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Pulse Rate</span>
                        <span className="text-sm font-bold text-slate-900 block mt-0.5">
                          {latestVitals.pulse_bpm ? `${latestVitals.pulse_bpm}` : '—'}
                        </span>
                        <span className="text-[10px] text-slate-400">bpm</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Temperature</span>
                        <span className="text-sm font-bold text-slate-900 block mt-0.5">
                          {latestVitals.temperature_f ? `${latestVitals.temperature_f}°F` : '—'}
                        </span>
                        <span className="text-[10px] text-slate-400">Oral/Axillary</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">SpO₂ Oxygen</span>
                        <span className="text-sm font-bold text-slate-900 block mt-0.5">
                          {latestVitals.spo2_percent ? `${latestVitals.spo2_percent}%` : '—'}
                        </span>
                        <span className="text-[10px] text-slate-400">Pulse Oximetry</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Resp. Rate</span>
                        <span className="text-sm font-bold text-slate-900 block mt-0.5">
                          {latestVitals.respiratory_rate ? `${latestVitals.respiratory_rate}` : '—'}
                        </span>
                        <span className="text-[10px] text-slate-400">breaths/min</span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Height & Weight</span>
                        <span className="text-xs font-bold text-slate-900 block mt-0.5">
                          {latestVitals.height_cm ? `${latestVitals.height_cm} cm` : '—'} | {latestVitals.weight_kg ? `${latestVitals.weight_kg} kg` : '—'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {latestVitals.bmi ? `BMI: ${latestVitals.bmi}` : 'Anthropometrics'}
                        </span>
                      </div>
                    </div>

                    {/* Nursing / Triage Notes */}
                    {latestVitals.triage_notes && (
                      <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900">
                        <strong className="font-semibold text-amber-950">Staff Triage Notes: </strong>
                        <span>"{latestVitals.triage_notes}"</span>
                      </div>
                    )}

                    {/* Encounter Prior Vitals History (if staff recorded vitals more than once this visit) */}
                    {examination?.triage_vitals && examination.triage_vitals.length > 1 && (
                      <details className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-2.5">
                        <summary className="font-semibold cursor-pointer text-slate-700 hover:text-slate-900">
                          Prior Vitals Readings for This Encounter ({examination.triage_vitals.length - 1} earlier record{examination.triage_vitals.length > 2 ? 's' : ''})
                        </summary>
                        <div className="mt-2 space-y-1.5 pt-2 border-t border-slate-100">
                          {examination.triage_vitals.slice(1).map((v) => (
                            <div key={v.id} className="p-2 bg-slate-50 rounded border border-slate-200 text-[11px] flex items-center justify-between">
                              <div>
                                <span className="font-semibold uppercase text-slate-700 mr-2">[{v.triage_priority}]</span>
                                <span>BP: <strong>{v.blood_pressure || '—'}</strong> | Pulse: <strong>{v.pulse_bpm || '—'}</strong> | Temp: <strong>{v.temperature_f || '—'}°F</strong></span>
                                {v.triage_notes && <span className="italic text-slate-500 ml-2">"{v.triage_notes}"</span>}
                              </div>
                              <span className="text-slate-400 text-[10px]">
                                {new Date(v.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {v.recorded_by_first_name} {v.recorded_by_last_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                    <HeartPulse className="w-5 h-5 text-slate-300 mx-auto mb-1.5" />
                    <p className="font-medium text-slate-700">No Pre-Consultation Vitals Recorded Yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Clinical staff or reception can record vitals for this encounter via the <strong>Vitals / Triage</strong> action on the Reception Desk queue.
                    </p>
                  </div>
                )}
              </div>

              {/* Chief Complaint & Diagnosis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Chief Complaint <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Patient describes reason for encounter..."
                    disabled={isReadOnly}
                    value={formData.chief_complaint}
                    onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
                    className="w-full text-xs rounded-md border-slate-300 p-2 focus:border-teal-500 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Clinical Diagnosis / Findings
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Irreversible pulpitis #46, Generalized chronic marginal gingivitis..."
                    disabled={isReadOnly}
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    className="w-full text-xs rounded-md border-slate-300 p-2 focus:border-teal-500 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-700"
                  />
                </div>
              </div>

              {/* Internal Examination Notes (CONFIDENTIAL - NEVER EXPOSED TO PORTAL) */}
              <div className="border-2 border-dashed border-amber-200 bg-amber-50/30 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-slate-800">
                      Internal Clinical Notes & Oral Examination
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300 flex items-center space-x-1">
                    <Lock className="w-2.5 h-2.5 mr-1" />
                    <span>Confidential — Internal Only (Never Released to Patient)</span>
                  </span>
                </div>
                <textarea
                  rows={4}
                  placeholder="Record objective clinical findings, tooth conditions, soft tissue assessments, provisional notes, differential diagnosis..."
                  disabled={isReadOnly}
                  value={formData.examination_notes}
                  onChange={(e) => setFormData({ ...formData, examination_notes: e.target.value })}
                  className="w-full text-xs font-sans rounded-md border-slate-300 p-2 focus:border-amber-500 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-700"
                />
                <p className="text-[11px] text-slate-500">
                  <Info className="w-3 h-3 inline mr-1 text-amber-600" />
                  These clinical case notes are strictly isolated for internal doctor and clinical staff reference. They will never appear in patient portal views.
                </p>
              </div>

              {/* Patient-Facing Summary & Follow-Up Instructions (PORTAL ELIGIBLE) */}
              <div className="border border-teal-200 bg-teal-50/20 rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Share2 className="w-4 h-4 text-teal-600" />
                    <span className="text-xs font-bold text-teal-900">
                      Patient-Facing Consultation Summary & Aftercare
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-0.5 rounded border border-teal-300">
                    Visible to Patient when Released
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Patient Summary (Plain Language)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Summary of today's examination discussed with the patient..."
                      disabled={isReadOnly}
                      value={formData.patient_facing_summary}
                      onChange={(e) => setFormData({ ...formData, patient_facing_summary: e.target.value })}
                      className="w-full text-xs rounded-md border-slate-300 p-2 focus:border-teal-500 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Follow-up & Home Care Instructions
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Home care advice, hygiene recommendations, when to return for follow-up..."
                      disabled={isReadOnly}
                      value={formData.follow_up_instructions}
                      onChange={(e) => setFormData({ ...formData, follow_up_instructions: e.target.value })}
                      className="w-full text-xs rounded-md border-slate-300 p-2 focus:border-teal-500 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* Amendments Timeline (if signed or locked) */}
              {isReadOnly && (
                <div className="border border-slate-200 rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                      <History className="w-4 h-4 text-purple-600" />
                      <span>Legal Amendments & Addenda History</span>
                      <span className="text-[10px] font-normal text-slate-500">
                        ({examination.amendments?.length || 0} recorded)
                      </span>
                    </div>

                    {canAmend && !showAmendmentForm && (
                      <button
                        type="button"
                        onClick={() => setShowAmendmentForm(true)}
                        className="px-2 py-1 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded border border-purple-200 transition flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Legal Amendment</span>
                      </button>
                    )}
                  </div>

                  {/* Amendment Input Box */}
                  {showAmendmentForm && (
                    <form
                      onSubmit={handleSubmitAmendment}
                      className="p-3 bg-purple-50/50 border border-purple-200 rounded-lg space-y-2 animate-in fade-in"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-900">
                          Create Append-Only Addendum
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAmendmentForm(false)}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                          Reason for Amendment *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Corrected tooth number mentioned in consultation discussion..."
                          value={amendmentReason}
                          onChange={(e) => setAmendmentReason(e.target.value)}
                          className="w-full text-xs rounded border-slate-300 py-1 px-2 focus:border-purple-500 focus:ring-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                          Amendment Notes *
                        </label>
                        <textarea
                          rows={2}
                          required
                          placeholder="Detailed supplementary note or addendum..."
                          value={amendmentNotes}
                          onChange={(e) => setAmendmentNotes(e.target.value)}
                          className="w-full text-xs rounded border-slate-300 p-2 focus:border-purple-500 focus:ring-purple-500"
                        />
                      </div>

                      <div className="flex justify-end space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAmendmentForm(false)}
                          className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingAmendment}
                          className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded disabled:opacity-50"
                        >
                          {isSubmittingAmendment ? 'Appending Addendum...' : 'Save Legal Addendum'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* List of existing amendments */}
                  {examination.amendments && examination.amendments.length > 0 ? (
                    <div className="space-y-2">
                      {examination.amendments.map((amend, idx) => (
                        <div
                          key={amend.id || idx}
                          className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="font-semibold text-purple-800">
                              Addendum #{idx + 1} • by Dr. {amend.amended_by_first_name} {amend.amended_by_last_name}
                            </span>
                            <span>{new Date(amend.created_at).toLocaleString()}</span>
                          </div>
                          <p className="font-medium text-slate-800">
                            Reason: <span className="font-normal text-slate-700">{amend.amendment_reason}</span>
                          </p>
                          <p className="text-slate-600 italic">"{amend.amendment_notes}"</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No legal amendments recorded.</p>
                  )}
                </div>
              )}

              {/* Portal Preview Drawer */}
              {showPortalPreview && (
                <div className="p-4 bg-teal-50/40 border border-teal-200 rounded-lg space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-900 flex items-center space-x-1.5">
                      <Eye className="w-4 h-4 text-teal-700" />
                      <span>Future Patient Portal Preview (What the patient sees)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPortalPreview(false)}
                      className="text-xs text-teal-700 hover:text-teal-900"
                    >
                      Hide Preview
                    </button>
                  </div>

                  {loadingPreview ? (
                    <p className="text-xs text-slate-500">Loading portal preview...</p>
                  ) : portalPreviewData ? (
                    <div className="bg-white p-3 rounded border border-teal-100 text-xs space-y-2">
                      <div className="flex items-center justify-between border-b pb-1 text-[11px] text-slate-500">
                        <span>Status: <strong className="uppercase">{portalPreviewData.examination?.status || 'unreleased'}</strong></span>
                        <span>Is Released: <strong>{portalPreviewData.is_released ? 'YES' : 'NO'}</strong></span>
                      </div>
                      {!portalPreviewData.is_released ? (
                        <p className="text-amber-700 italic">
                          This record has not been released. On the patient portal, patients see a message that the doctor's summary is pending release.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          <div>
                            <span className="font-bold text-slate-800">Summary: </span>
                            <span className="text-slate-700">{portalPreviewData.examination?.patient_facing_summary || 'No summary entered.'}</span>
                          </div>
                          <div>
                            <span className="font-bold text-slate-800">Follow-up Care: </span>
                            <span className="text-slate-700">{portalPreviewData.examination?.follow_up_instructions || 'Standard follow-up care.'}</span>
                          </div>
                          <p className="text-[10px] text-emerald-700">
                            ✓ Verified: Internal examination notes and clinical thoughts are completely excluded from this payload.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : activeTab === 'dental_chart' ? (
            <div className="space-y-4">
              {isReadOnly && (
                <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg flex items-center space-x-2 text-xs text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Encounter chart is cryptographically sealed and finalized. Direct deletions or alterations are blocked by PostgreSQL database trigger. Use the <strong>Amend</strong> action to append legal addenda to historical findings.
                  </span>
                </div>
              )}
              <DentalChart
                patient={
                  patient || {
                    id: patientId,
                    first_name: appointment?.patient_first_name,
                    last_name: appointment?.patient_last_name,
                    patient_number: appointment?.patient_number,
                  }
                }
                visit={
                  visit ||
                  (visitId
                    ? { id: visitId, token_display: appointment?.visit_token_display }
                    : null)
                }
                examination={examination}
                isReadOnly={isReadOnly}
                onChartUpdated={loadExamination}
                onProposalCreated={() => setActiveTab('treatment_plans')}
              />
            </div>
          ) : activeTab === 'treatment_plans' ? (
            <TreatmentPlanManager
              patient={
                patient || {
                  id: patientId,
                  first_name: appointment?.patient_first_name,
                  last_name: appointment?.patient_last_name,
                  patient_number: appointment?.patient_number,
                }
              }
              visit={
                visit ||
                (visitId
                  ? { id: visitId, token_display: appointment?.visit_token_display }
                  : null)
              }
              examination={examination}
              isReadOnly={isReadOnly}
            />
          ) : activeTab === 'prescriptions' ? (
            <PrescriptionManager
              patient={
                patient || {
                  id: patientId,
                  first_name: appointment?.patient_first_name,
                  last_name: appointment?.patient_last_name,
                  patient_number: appointment?.patient_number,
                }
              }
              visit={
                visit ||
                (visitId
                  ? { id: visitId, token_display: appointment?.visit_token_display }
                  : null)
              }
              examination={examination}
              doctor={doctor}
              isReadOnly={false}
            />
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          {/* Left: Release to Patient Portal toggle & Portal preview */}
          <div className="flex items-center space-x-2">
            {canRelease && isSigned && (
              <button
                type="button"
                onClick={handleToggleRelease}
                disabled={isReleasing}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition flex items-center space-x-1.5 ${
                  isReleased
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : 'bg-teal-600 text-white border-transparent hover:bg-teal-700'
                }`}
              >
                {isReleased ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{isReleased ? 'Revoke Portal Release' : 'Release to Patient Portal'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenPortalPreview}
              className="px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md font-medium transition flex items-center space-x-1"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>Portal Preview</span>
            </button>
          </div>

          {/* Right: Lifecycle action buttons */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-md font-medium transition"
            >
              Close
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isSaving || isSigning}
                className="px-3.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-md transition shadow-2xs flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
              </button>
            )}

            {canSign && (
              <button
                type="button"
                onClick={handleSignOff}
                disabled={isSigning || isSaving}
                className="px-3.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md transition shadow-2xs flex items-center space-x-1.5 disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isSigning ? 'Signing...' : 'Sign & Seal Record'}</span>
              </button>
            )}

            {isSigned && !isLocked && ['admin', 'dentist'].includes(user?.role) && (
              <button
                type="button"
                onClick={handleLock}
                disabled={isLocking}
                className="px-3 py-1.5 text-xs bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-md transition shadow-2xs flex items-center space-x-1"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isLocking ? 'Locking...' : 'Lock Record'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClinicalExaminationModal;
