import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Stethoscope,
  Activity,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Pill,
  CreditCard,
  Building,
  CheckCircle2,
  Lock,
  Printer,
  AlertTriangle,
  Receipt,
  Eye,
  RefreshCw,
  ExternalLink,
  Bookmark,
  Check,
  Info,
  FlaskConical,
} from 'lucide-react';
import { timelineService } from '../../../services/timelineService';
import investigationService from '../../../services/investigationService';
import { PrescriptionPrintModal } from '../Prescriptions/PrescriptionPrintModal';
import { PrintableInvestigationReportModal } from '../Investigations/PrintableInvestigationReportModal';

export const VisitEncounterModal = ({
  isOpen,
  onClose,
  visitId,
  patientId,
  isClinical = true,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const scrollContainerRef = useRef(null);

  // Selected prescription for print preview modal
  const [selectedPrintRx, setSelectedPrintRx] = useState(null);
  const [selectedPrintReport, setSelectedPrintReport] = useState(null);

  useEffect(() => {
    if (!isOpen || !visitId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    timelineService
      .getVisitEncounterRecords(patientId, visitId)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err.response?.data?.message ||
              err.message ||
              'Failed to retrieve visit encounter records.'
          );
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, visitId, patientId]);

  if (!isOpen) return null;

  const visit = data?.visit;
  const vitals = data?.vitals;
  const exam = data?.clinicalExamination;
  const dentalFindings = data?.dentalFindings || [];
  const treatmentPlans = data?.treatmentPlans || [];
  const treatmentConsents = data?.treatmentConsents || [];
  const prescriptions = data?.prescriptions || [];
  const investigations = data?.investigations || [];
  const billing = data?.billing || [];
  const patientSafety = data?.patientSafetyContext;

  const scrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleOpenInvestigationReport = async (inv) => {
    try {
      const res = await investigationService.getPrintableReport(inv.id);
      setSelectedPrintReport(res);
    } catch (err) {
      alert('Failed to load investigation report.');
    }
  };

  const handleOpenPrintPreview = (rx) => {
    // Structure data matching PrescriptionPrintModal expectations
    setSelectedPrintRx({
      clinic: {
        name: visit?.branch_name || visit?.branchName || 'VoiceGate Dental Clinic',
        address: visit?.branch_address || visit?.branchAddress || '',
        phone: visit?.branch_phone || visit?.branchPhone || '',
        email: visit?.branch_email || visit?.branchEmail || '',
      },
      doctor: {
        name: rx.doctor_name || visit?.doctor_name || visit?.doctorName || 'Attending Dentist',
        specialization: rx.doctor_specialization || 'Dental Surgeon',
      },
      patient: {
        name: `${visit?.patient_first_name || data?.patient?.firstName || ''} ${visit?.patient_last_name || data?.patient?.lastName || ''}`.trim() || 'Patient',
        patientNumber: visit?.patient_number || data?.patient?.patientNumber || '',
        gender: visit?.patient_gender || data?.patient?.gender || '',
        dateOfBirth: visit?.patient_dob || data?.patient?.dateOfBirth || '',
        phone: visit?.patient_phone || data?.patient?.phone || '',
      },
      prescription: {
        prescriptionNumber: rx.prescription_number,
        prescriptionDate: rx.prescription_date,
        status: rx.status,
        diagnosis: rx.diagnosis,
        generalInstructions: rx.general_instructions,
        dietaryAdvice: rx.dietary_advice,
        signedAt: rx.signed_at,
        signedByName: rx.signed_by_name || rx.doctor_name,
        signatureHash: rx.signature_hash,
      },
      items: rx.items || [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 font-extrabold text-sm shadow-inner">
              #{visit?.token_display || visit?.tokenDisplay || '---'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Clinical Encounter Records
                </h2>
                {(visit?.status) && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      visit.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : visit.status === 'in_progress'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {visit.status.replace('_', ' ')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center space-x-2">
                <span>
                  Date:{' '}
                  <strong className="text-white">
                    {visit?.visit_date || visit?.visitDate
                      ? new Date(visit.visit_date || visit.visitDate).toLocaleDateString(undefined, {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '---'}
                  </strong>
                </span>
                <span>&bull;</span>
                <span>
                  Branch: <strong className="text-white">{visit?.branch_name || visit?.branchName || 'Main Branch'}</strong>
                </span>
                {(visit?.doctor_name || visit?.doctorName) && (
                  <>
                    <span>&bull;</span>
                    <span>
                      Doctor: <strong className="text-white">{visit.doctor_name || visit.doctorName}</strong>
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Close Encounter (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading ? (
          <div className="p-12 text-center my-auto">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">
              Aggregating Visit Encounter Records...
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Fetching vitals, exam notes, dental findings, treatment plans, consent, prescriptions, and billing for this encounter.
            </p>
          </div>
        ) : error ? (
          <div className="p-8 text-center my-auto">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-rose-200">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Encounter Lookup Error</h3>
            <p className="text-xs text-rose-600 mt-1 max-w-md mx-auto">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Quick-Jump Section Anchor Bar (Non-destructive smooth scrolling across single page) */}
            <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center space-x-1.5 overflow-x-auto text-xs shrink-0 sticky top-0 z-10">
              <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 flex items-center shrink-0">
                <Bookmark className="w-3 h-3 mr-1 text-slate-400" />
                Jump To:
              </span>
              <button
                type="button"
                data-section-pill="all"
                onClick={() => scrollToSection('encounter-section-overview')}
                className="px-2.5 py-1 rounded-md font-bold text-slate-700 bg-white hover:bg-slate-200/80 border border-slate-200 transition shrink-0"
              >
                Overview
              </button>
              <button
                type="button"
                data-section-pill="safety"
                onClick={() => scrollToSection('encounter-section-safety')}
                className="px-2.5 py-1 rounded-md font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition shrink-0 flex items-center space-x-1"
              >
                <ShieldAlert className="w-3 h-3 text-amber-600" />
                <span>Safety Context</span>
              </button>
              <button
                type="button"
                data-section-pill="vitals"
                onClick={() => scrollToSection('encounter-section-vitals')}
                className="px-2.5 py-1 rounded-md font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition shrink-0 flex items-center space-x-1"
              >
                <Activity className="w-3 h-3 text-rose-500" />
                <span>Vitals {vitals ? '✓' : '(0)'}</span>
              </button>
              <button
                type="button"
                data-section-pill="exam"
                onClick={() => scrollToSection('encounter-section-exam')}
                className="px-2.5 py-1 rounded-md font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition shrink-0 flex items-center space-x-1"
              >
                <Stethoscope className="w-3 h-3 text-violet-600" />
                <span>Exam {exam ? '✓' : '(0)'}</span>
              </button>
              <button
                type="button"
                data-section-pill="dental"
                onClick={() => scrollToSection('encounter-section-dental')}
                className="px-2.5 py-1 rounded-md font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition shrink-0"
              >
                <span>Dental ({dentalFindings.length})</span>
              </button>
              <button
                type="button"
                data-section-pill="plans"
                onClick={() => scrollToSection('encounter-section-plans')}
                className="px-2.5 py-1 rounded-md font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition shrink-0 flex items-center space-x-1"
              >
                <FileText className="w-3 h-3 text-amber-600" />
                <span>Plans ({treatmentPlans.length})</span>
              </button>
              <button
                type="button"
                data-section-pill="consent"
                onClick={() => scrollToSection('encounter-section-consent')}
                className="px-2.5 py-1 rounded-md font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition shrink-0 flex items-center space-x-1"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>Consent ({treatmentConsents.length})</span>
              </button>
              <button
                type="button"
                data-section-pill="prescriptions"
                onClick={() => scrollToSection('encounter-section-prescriptions')}
                className="px-2.5 py-1 rounded-md font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition shrink-0 flex items-center space-x-1"
              >
                <Pill className="w-3 h-3 text-purple-600" />
                <span>Rx ({prescriptions.length})</span>
              </button>
              <button
                type="button"
                data-section-pill="investigations"
                onClick={() => scrollToSection('encounter-section-investigations')}
                className="px-2.5 py-1 rounded-md font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition shrink-0 flex items-center space-x-1"
              >
                <FlaskConical className="w-3 h-3 text-indigo-600" />
                <span>Investigations ({investigations.length})</span>
              </button>
              <button
                type="button"
                data-section-pill="billing"
                onClick={() => scrollToSection('encounter-section-billing')}
                className="px-2.5 py-1 rounded-md font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition shrink-0 flex items-center space-x-1"
              >
                <Receipt className="w-3 h-3 text-emerald-600" />
                <span>Billing ({billing.length})</span>
              </button>
            </div>

            {/* Continuous Vertically Scrollable Single-Screen Encounter Record Body */}
            <div
              ref={scrollContainerRef}
              className="p-6 space-y-6 overflow-y-auto max-h-[74vh] scroll-smooth"
            >
              {/* SECTION A: Visit Encounter Overview */}
              <div id="encounter-section-overview" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                    <Building className="w-4 h-4 mr-2 text-indigo-600" />
                    Visit Overview & Encounter Metadata
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    Visit ID: {visit?.id?.slice(0, 8)}...
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Visit Date & Time
                    </span>
                    <p className="font-semibold text-slate-800 mt-1">
                      {visit?.visit_date || visit?.visitDate
                        ? new Date(visit.visit_date || visit.visitDate).toLocaleDateString(undefined, {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '---'}{' '}
                      {visit?.created_at
                        ? `at ${new Date(visit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Visit Type & Queue Token
                    </span>
                    <p className="font-semibold text-slate-800 mt-1 capitalize">
                      {(visit?.visit_type || visit?.visitType || 'consultation')} &bull; Token #{visit?.token_display || visit?.tokenDisplay || '---'}
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Attending Doctor & Branch
                    </span>
                    <p className="font-semibold text-slate-800 mt-1">
                      {visit?.doctor_name || visit?.doctorName || 'Dr. Attending'}
                    </p>
                    <span className="text-[11px] text-slate-500 block">
                      {visit?.branch_name || visit?.branchName || 'Main Branch'}
                    </span>
                  </div>

                  <div className="col-span-1 sm:col-span-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Reason for Visit
                    </span>
                    <p className="font-semibold text-slate-800 mt-1">
                      {visit?.reason_for_visit || visit?.reasonForVisit || 'Routine Dental Checkup / Consultation'}
                    </p>
                  </div>
                </div>

                {visit?.notes && (
                  <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      Clinical & Reception Notes
                    </span>
                    <p className="text-slate-700 italic">"{visit.notes}"</p>
                  </div>
                )}
              </div>

              {/* SECTION B: Patient Safety Context (Explicitly labeled patient-level, not visit-specific) */}
              <div id="encounter-section-safety" className="bg-amber-50/80 border-2 border-amber-300 rounded-xl p-4 shadow-xs">
                <div className="flex items-start space-x-3">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] uppercase font-extrabold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-md">
                        Patient-Level Safety Context (Not Visit-Specific)
                      </span>
                      {patientSafety?.hasMedicalAlerts && (
                        <span className="text-[10px] uppercase font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                          Active Alert
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <strong className="text-slate-700 block">Recorded Allergies:</strong>
                        <span className="font-semibold text-rose-700">
                          {patientSafety?.allergies || 'None recorded'}
                        </span>
                      </div>
                      <div>
                        <strong className="text-slate-700 block">Medical Conditions:</strong>
                        <span className="text-slate-800">
                          {patientSafety?.medicalConditions || 'None recorded'}
                        </span>
                      </div>
                    </div>
                    {patientSafety?.medicalAlertDetails && (
                      <p className="mt-2 text-xs font-bold text-rose-800 bg-rose-50 p-2 rounded-lg border border-rose-200">
                        {patientSafety.medicalAlertDetails}
                      </p>
                    )}
                    {patientSafety?.currentMedications && (
                      <p className="mt-2 text-xs text-slate-600">
                        <strong>Current Medications:</strong> {patientSafety.currentMedications}
                      </p>
                    )}
                    {!patientSafety?.allergies && !patientSafety?.hasMedicalAlerts && !patientSafety?.medicalConditions && (
                      <p className="mt-2 text-xs text-slate-500 italic">
                        No active patient-level allergies or medical alerts on record.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION C: Vitals and Triage */}
              <div id="encounter-section-vitals" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-rose-500" />
                    Pre-Consultation Vitals & Triage
                  </span>
                  {vitals?.triage_priority && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        vitals.triage_priority === 'urgent'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : vitals.triage_priority === 'priority'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}
                    >
                      Priority: {vitals.triage_priority}
                    </span>
                  )}
                </div>

                {vitals ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Blood Pressure
                        </span>
                        <span className="font-mono text-base font-extrabold text-slate-900 mt-1 block">
                          {vitals.blood_pressure || '---'}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Pulse (bpm)
                        </span>
                        <span className="font-mono text-base font-extrabold text-slate-900 mt-1 block">
                          {vitals.pulse_bpm ? `${vitals.pulse_bpm} bpm` : '---'}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Temperature (°F)
                        </span>
                        <span className="font-mono text-base font-extrabold text-slate-900 mt-1 block">
                          {vitals.temperature_f ? `${vitals.temperature_f} °F` : '---'}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          SpO2 (%)
                        </span>
                        <span className="font-mono text-base font-extrabold text-slate-900 mt-1 block">
                          {vitals.spo2_percent ? `${vitals.spo2_percent}%` : '---'}
                        </span>
                      </div>
                    </div>

                    {vitals.triage_notes && (
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Triage Notes
                        </span>
                        <p className="text-slate-700">{vitals.triage_notes}</p>
                      </div>
                    )}

                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100">
                      <span>
                        Recorded by: <strong>{vitals.recorded_by_name || 'Clinical Staff'}</strong>
                      </span>
                      <span>
                        {vitals.recorded_at
                          ? new Date(vitals.recorded_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">
                      No vitals recorded for this visit.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION D: Clinical Examination */}
              <div id="encounter-section-exam" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                    <Stethoscope className="w-4 h-4 mr-2 text-violet-600" />
                    Clinical Examination & Diagnosis
                  </span>
                  {exam?.status && (
                    <div className="flex items-center space-x-2">
                      {exam.status === 'signed' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <Lock className="w-3 h-3 mr-1" />
                          Signed & Locked
                        </span>
                      )}
                      {exam.is_released_to_patient && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Released
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {exam ? (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Chief Complaint
                        </span>
                        <p className="font-semibold text-slate-800 mt-1">
                          {exam.chief_complaint || 'None specified'}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Clinical Diagnosis
                        </span>
                        <p className="font-semibold text-violet-900 mt-1">
                          {exam.diagnosis || 'Dental Examination'}
                          {exam.diagnosis_icd10 && (
                            <span className="ml-1.5 font-mono text-[10px] bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded-md font-bold">
                              ICD: {exam.diagnosis_icd10}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {exam.examination_notes && (
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                          Doctor Case Notes & Observations
                        </span>
                        <p className="text-slate-800 whitespace-pre-line leading-relaxed">
                          {exam.examination_notes}
                        </p>
                      </div>
                    )}

                    {exam.patient_facing_summary && (
                      <div className="bg-indigo-50/60 p-3 rounded-lg border border-indigo-100">
                        <span className="text-[10px] uppercase font-bold text-indigo-700 block mb-0.5">
                          Patient Summary & Advice
                        </span>
                        <p className="text-indigo-950 font-medium">
                          {exam.patient_facing_summary}
                        </p>
                      </div>
                    )}

                    <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100">
                      <span>
                        Examined by:{' '}
                        <strong className="text-slate-600">
                          {exam.doctor_name || visit?.doctor_name || visit?.doctorName}
                        </strong>
                      </span>
                      {exam.signed_at && (
                        <span className="flex items-center text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Signed on {new Date(exam.signed_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">
                      No clinical examination recorded for this visit.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION E: Dental Chart / Odontogram */}
              <div id="encounter-section-dental" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                    <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-[10px] mr-2">
                      #
                    </span>
                    Odontogram Dental Findings ({dentalFindings.length})
                  </span>
                  <span className="text-[11px] text-slate-400 italic">
                    Historical encounter findings
                  </span>
                </div>

                {dentalFindings.length > 0 ? (
                  <div className="space-y-2">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Tooth (FDI)</th>
                            <th className="py-2 px-3">Surface</th>
                            <th className="py-2 px-3">Condition</th>
                            <th className="py-2 px-3">Severity</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {dentalFindings.map((f) => (
                            <tr key={f.id} className="hover:bg-slate-50/70 transition">
                              <td className="py-2.5 px-3 font-mono font-bold text-teal-900">
                                #{f.tooth_number}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-700">
                                {f.surface || 'Entire Tooth'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-slate-900">
                                  {f.condition_name}
                                </span>
                                <span className="ml-1 text-[10px] font-mono text-slate-400">
                                  ({f.condition_code})
                                </span>
                              </td>
                              <td className="py-2.5 px-3 capitalize">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    f.severity === 'critical'
                                      ? 'bg-rose-100 text-rose-800'
                                      : f.severity === 'severe'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {f.severity || 'routine'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 capitalize text-slate-600 font-medium">
                                {f.status}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 italic max-w-xs truncate">
                                {f.notes || '---'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-slate-400 italic">
                      Note: These findings reflect documented observations recorded during this encounter.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">
                      No dental chart findings recorded for this visit.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION F: Treatment Plans (Distinct Section) */}
              <div id="encounter-section-plans" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-amber-600" />
                    Treatment Plans Originated ({treatmentPlans.length})
                  </span>
                </div>

                {treatmentPlans.length > 0 ? (
                  <div className="space-y-4 text-xs">
                    {treatmentPlans.map((tp) => (
                      <div
                        key={tp.id}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200 text-xs">
                                {tp.plan_number}
                              </span>
                              <h4 className="font-bold text-slate-900 text-sm">{tp.plan_title}</h4>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                  tp.status === 'approved'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : tp.status === 'in_progress'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {tp.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Created by <strong>{tp.doctor_name || 'Attending Doctor'}</strong> &bull; Version {tp.version || 1}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              Estimated Cost
                            </span>
                            <span className="font-mono text-base font-extrabold text-slate-900">
                              ₹{Number(tp.total_estimated_cost || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Procedure Items inside the plan */}
                        {tp.items && tp.items.length > 0 && (
                          <div className="overflow-x-auto mt-2">
                            <table className="w-full text-[11px] text-left">
                              <thead className="bg-white text-slate-400 font-bold uppercase text-[9px] border-b border-slate-200">
                                <tr>
                                  <th className="py-1 px-2">Procedure</th>
                                  <th className="py-1 px-2">Tooth</th>
                                  <th className="py-1 px-2">Status</th>
                                  <th className="py-1 px-2 text-right">Fee</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {tp.items.map((item) => (
                                  <tr key={item.id} className="hover:bg-white/60">
                                    <td className="py-1.5 px-2 font-medium text-slate-800">
                                      {item.procedure_name}
                                    </td>
                                    <td className="py-1.5 px-2 font-mono text-slate-600">
                                      {item.tooth_number ? `#${item.tooth_number}` : 'General'}
                                    </td>
                                    <td className="py-1.5 px-2 capitalize">
                                      <span className="text-[10px] font-semibold text-slate-600">
                                        {item.status}
                                      </span>
                                    </td>
                                    <td className="py-1.5 px-2 font-mono text-right text-slate-800">
                                      ₹{Number(item.estimated_cost || 0).toFixed(2)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">
                      No treatment plans originated in this visit.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION G: Treatment Consent (Distinct Section) */}
              <div id="encounter-section-consent" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                    <ShieldCheck className="w-4 h-4 mr-2 text-emerald-600" />
                    Treatment Consent Records ({treatmentConsents.length})
                  </span>
                </div>

                {treatmentConsents.length > 0 ? (
                  <div className="space-y-3 text-xs">
                    {treatmentConsents.map((tc) => (
                      <div
                        key={tc.id}
                        className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-200 space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1.5 border-b border-emerald-100">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-emerald-800 text-xs bg-emerald-100 px-2 py-0.5 rounded">
                              {tc.consent_number}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {tc.consent_status}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Acknowledgement Method: <strong className="text-slate-700 capitalize">{tc.acknowledgement_method?.replace(/_/g, ' ')}</strong>
                          </span>
                        </div>

                        <p className="font-semibold text-slate-900 mt-1">
                          Procedure: {tc.procedure_summary}
                        </p>

                        {tc.material_risks_discussed && (
                          <p className="text-[11px] text-slate-600">
                            <strong>Material Risks:</strong> {tc.material_risks_discussed}
                          </p>
                        )}

                        {tc.alternatives_discussed && (
                          <p className="text-[11px] text-slate-600">
                            <strong>Alternatives Discussed:</strong> {tc.alternatives_discussed}
                          </p>
                        )}

                        <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-emerald-100/60">
                          <span>
                            Acknowledged by: <strong>{tc.patient_name_acknowledged}</strong> &bull; Recorded by: <strong>{tc.recorded_by_name || 'Attending Dentist'}</strong>
                          </span>
                          <span>
                            {tc.created_at ? new Date(tc.created_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">
                      No consent records recorded for this visit.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION H: Prescriptions and Medicines */}
              <div id="encounter-section-prescriptions" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                    <Pill className="w-4 h-4 mr-2 text-purple-600" />
                    Prescriptions & Medicines ({prescriptions.length})
                  </span>
                </div>

                {prescriptions.length > 0 ? (
                  <div className="space-y-4">
                    {prescriptions.map((rx) => (
                      <div
                        key={rx.id}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200 text-xs">
                                {rx.prescription_number}
                              </span>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  rx.status === 'signed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : rx.status === 'amended'
                                    ? 'bg-blue-100 text-blue-800'
                                    : rx.status === 'cancelled'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {rx.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Prescribed by <strong>{rx.doctor_name || 'Attending Doctor'}</strong> on{' '}
                              {new Date(rx.prescription_date).toLocaleDateString()}
                            </p>
                          </div>

                          {/* View / Print button for signed or active prescriptions */}
                          {rx.status === 'signed' && (
                            <button
                              type="button"
                              onClick={() => handleOpenPrintPreview(rx)}
                              className="inline-flex items-center px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition shadow-2xs"
                            >
                              <Printer className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                              View / Print Official Rx
                            </button>
                          )}
                        </div>

                        {/* Cancellation or Amendment Notice */}
                        {rx.status === 'cancelled' && rx.cancellation_reason && (
                          <div className="p-2.5 bg-rose-50 text-rose-800 rounded-lg text-xs border border-rose-200">
                            <strong>Cancellation Reason:</strong> {rx.cancellation_reason} (Cancelled on{' '}
                            {new Date(rx.cancelled_at).toLocaleDateString()})
                          </div>
                        )}
                        {rx.is_amended && rx.amendment_reason && (
                          <div className="p-2.5 bg-blue-50 text-blue-800 rounded-lg text-xs border border-blue-200">
                            <strong>Amendment Reason:</strong> {rx.amendment_reason}
                          </div>
                        )}

                        {/* Medication Items */}
                        {rx.items && rx.items.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-white text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                                <tr>
                                  <th className="py-1.5 px-2">Medicine</th>
                                  <th className="py-1.5 px-2">Dosage & Form</th>
                                  <th className="py-1.5 px-2">Frequency</th>
                                  <th className="py-1.5 px-2">Duration</th>
                                  <th className="py-1.5 px-2">Qty</th>
                                  <th className="py-1.5 px-2">Instructions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {rx.items.map((item) => (
                                  <tr key={item.id} className="hover:bg-white/60">
                                    <td className="py-2 px-2 font-bold text-slate-900">
                                      {item.medicine_name}
                                    </td>
                                    <td className="py-2 px-2 text-slate-700 capitalize">
                                      {item.dosage} ({item.dosage_form})
                                    </td>
                                    <td className="py-2 px-2 font-mono text-indigo-700">
                                      {item.frequency}
                                    </td>
                                    <td className="py-2 px-2 text-slate-700">
                                      {item.duration}
                                    </td>
                                    <td className="py-2 px-2 text-slate-800 font-semibold">
                                      {item.quantity} {item.quantity_unit}
                                    </td>
                                    <td className="py-2 px-2 text-slate-600 italic">
                                      {item.instructions || 'As advised'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No medication items listed.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">
                      No prescriptions generated in this encounter.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION H: Diagnostic & Laboratory Investigations */}
              <div id="encounter-section-investigations" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                      <FlaskConical className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        Diagnostic & Laboratory Investigations ({investigations.length})
                      </h3>
                      <p className="text-[10px] text-slate-500">
                        Ordered tests, specimen processing, findings, abnormal flags, and practitioner seals.
                      </p>
                    </div>
                  </div>
                </div>

                {investigations.length > 0 ? (
                  <div className="space-y-4">
                    {investigations.map((inv) => (
                      <div key={inv.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                              {inv.order_number}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              Priority: <strong className="uppercase text-indigo-600">{inv.priority}</strong>
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              inv.status === 'completed' || inv.status === 'authorized'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {inv.status?.replace('_', ' ')}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenInvestigationReport(inv)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 text-[11px] font-bold flex items-center space-x-1"
                            >
                              <Printer className="w-3 h-3 text-slate-500" />
                              <span>Print Report</span>
                            </button>
                          </div>
                        </div>

                        {inv.clinical_indication && (
                          <p className="text-xs text-slate-600 italic">
                            Indication: "{inv.clinical_indication}"
                          </p>
                        )}

                        <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200 overflow-hidden text-xs">
                          {inv.items?.map((item) => (
                            <div key={item.id} className="p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-mono font-bold text-slate-700 mr-2">[{item.investigation_code}]</span>
                                  <strong className="text-slate-900">{item.investigation_name}</strong>
                                  <span className="text-[10px] uppercase font-semibold text-slate-400 ml-2">({item.category})</span>
                                </div>
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                  item.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {item.status?.replace('_', ' ')}
                                </span>
                              </div>

                              {item.result && (
                                <div className="mt-2 p-2.5 bg-slate-50 rounded border border-slate-200 space-y-1">
                                  {item.result.results_data?.parameters && Array.isArray(item.result.results_data.parameters) ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                      {item.result.results_data.parameters.map((p, pIdx) => (
                                        <div key={pIdx} className="bg-white p-1.5 rounded border border-slate-200">
                                          <div className="text-[10px] text-slate-400 uppercase">{p.parameter}</div>
                                          <div className="font-mono font-bold text-slate-900">{p.value} {p.unit}</div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}

                                  {item.result.observations && (
                                    <p className="text-[11px] text-slate-700 italic pt-1">
                                      Impression: {item.result.observations}
                                    </p>
                                  )}

                                  {item.result.authorized_by_name && (
                                    <p className="text-[10px] text-emerald-700 font-bold pt-1 flex items-center">
                                      <ShieldCheck className="w-3 h-3 mr-1" />
                                      Authorized by Dr. {item.result.authorized_by_name} ({new Date(item.result.authorized_at).toLocaleDateString()})
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">
                      No laboratory or diagnostic investigations ordered for this encounter.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION I: Billing and Payments */}
              <div id="encounter-section-billing" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                    <Receipt className="w-4 h-4 mr-2 text-emerald-600" />
                    Encounter Billing & Payments ({billing.length})
                  </span>
                </div>

                {billing.length > 0 ? (
                  <div className="overflow-x-auto text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Receipt #</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Gross Amount</th>
                          <th className="py-2 px-3">Discount</th>
                          <th className="py-2 px-3">Paid Amount</th>
                          <th className="py-2 px-3">Method</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {billing.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                              {b.receipt_number}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {new Date(b.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              ₹{Number(b.gross_amount || b.amount_paid).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">
                              ₹{Number(b.discount_amount || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                              ₹{Number(b.amount_paid).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 capitalize text-slate-700">
                              {b.payment_method}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  b.payment_status === 'completed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {b.payment_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">
                      No billing or payment records found for this encounter.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Footer Action Bar */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Unified encounter record is read-only to preserve historical medical integrity.</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition"
              >
                Close Encounter Viewer
              </button>
            </div>
          </>
        )}
      </div>

      {/* Prescription Print Modal (if opened from an encounter prescription) */}
      {selectedPrintRx && (
        <PrescriptionPrintModal
          isOpen={!!selectedPrintRx}
          onClose={() => setSelectedPrintRx(null)}
          printData={selectedPrintRx}
        />

      )}
      {selectedPrintReport && (
        <PrintableInvestigationReportModal
          isOpen={!!selectedPrintReport}
          onClose={() => setSelectedPrintReport(null)}
          reportData={selectedPrintReport}
        />
      )}
    </div>
  );
};

export default VisitEncounterModal;
