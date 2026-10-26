import React, { useState, useEffect, useCallback } from 'react';
import {
  Pill,
  Plus,
  FileCheck,
  Printer,
  Ban,
  History,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  User,
  Clock,
  Edit,
} from 'lucide-react';
import { toast } from 'react-toastify';
import prescriptionService from '../../../services/prescriptionService';
import { patientService } from '../../../services/patientService';
import { PrescriptionFormModal } from './PrescriptionFormModal';
import { PrescriptionSignModal } from './PrescriptionSignModal';
import { PrescriptionCancelModal } from './PrescriptionCancelModal';
import { PrescriptionPrintModal } from './PrescriptionPrintModal';

export const PrescriptionManager = ({
  patient,
  visit = null,
  examination = null,
  doctor = null,
  isReadOnly = false,
  onPrescriptionUpdated = null,
}) => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [prescriptionToEdit, setPrescriptionToEdit] = useState(null);
  const [isAmendmentMode, setIsAmendmentMode] = useState(false);

  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [prescriptionToSign, setPrescriptionToSign] = useState(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [prescriptionToCancel, setPrescriptionToCancel] = useState(null);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printData, setPrintData] = useState(null);

  const patientId = patient?.id;
  const [patientProfile, setPatientProfile] = useState(patient || null);

  // Fetch full patient profile & medical records if allergies not populated
  useEffect(() => {
    if (patientId) {
      patientService
        .getPatientById(patientId)
        .then((res) => {
          if (res?.patient) {
            const med = res?.medicalRecord || res?.patient?.medical_records || res?.patient?.medical_record || {};
            setPatientProfile({
              ...res.patient,
              allergies: med.allergies || res.patient.allergies || '',
              medical_conditions: med.medical_conditions || res.patient.medical_conditions || '',
              has_medical_alerts: med.has_medical_alerts || res.patient.has_medical_alerts || false,
              medical_alert_details: med.medical_alert_details || res.patient.medical_alert_details || '',
              current_medications: med.current_medications || res.patient.current_medications || '',
            });
          }
        })
        .catch(() => {});
    }
  }, [patientId]);

  const effectivePatient = patientProfile || patient;

  // Load prescriptions
  const loadPrescriptions = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      // If we have an active visit, we can fetch all patient prescriptions or prioritize visit
      const res = await prescriptionService.getPatientPrescriptions(patientId);
      setPrescriptions(res.prescriptions || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load prescriptions.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadPrescriptions();
  }, [loadPrescriptions]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setPrescriptionToEdit(null);
    setIsAmendmentMode(false);
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = async (pres) => {
    try {
      const fullRes = await prescriptionService.getPrescriptionById(pres.id);
      setPrescriptionToEdit(fullRes.prescription);
      setIsAmendmentMode(false);
      setIsFormModalOpen(true);
    } catch (err) {
      toast.error('Failed to load prescription details.');
    }
  };

  // Open Amend Modal
  const handleOpenAmend = async (pres) => {
    try {
      const fullRes = await prescriptionService.getPrescriptionById(pres.id);
      setPrescriptionToEdit(fullRes.prescription);
      setIsAmendmentMode(true);
      setIsFormModalOpen(true);
    } catch (err) {
      toast.error('Failed to load prescription for amendment.');
    }
  };

  // Open Sign Modal
  const handleOpenSign = async (pres) => {
    try {
      const fullRes = await prescriptionService.getPrescriptionById(pres.id);
      setPrescriptionToSign(fullRes.prescription);
      setIsSignModalOpen(true);
    } catch (err) {
      toast.error('Failed to prepare prescription for signing.');
    }
  };

  // Open Cancel Modal
  const handleOpenCancel = (pres) => {
    setPrescriptionToCancel(pres);
    setIsCancelModalOpen(true);
  };

  // Open Print Modal
  const handleOpenPrint = async (pres) => {
    try {
      const printRes = await prescriptionService.getPrintData(pres.id);
      setPrintData(printRes.printData);
      setIsPrintModalOpen(true);
    } catch (err) {
      toast.error('Failed to retrieve print data.');
    }
  };

  // Filter prescriptions
  const filteredPrescriptions = prescriptions.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const numMatch = p.prescription_number?.toLowerCase().includes(q);
      const docMatch = (p.doctor_first_name + ' ' + (p.doctor_last_name || '')).toLowerCase().includes(q);
      const medsMatch = p.medications_summary?.toLowerCase().includes(q);
      const diagMatch = p.diagnosis?.toLowerCase().includes(q);
      return numMatch || docMatch || medsMatch || diagMatch;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Patient Clinical Safety Context Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-800">Clinical Safety Context:</span>
            <span className="text-slate-600">
              {effectivePatient?.first_name} {effectivePatient?.last_name || ''} (#{effectivePatient?.patient_number || '---'})
            </span>
            {visit?.token_display && (
              <span className="font-mono text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-200">
                Token #{visit.token_display}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Encounter: {visit ? 'Active Clinical Visit' : 'Patient Profile History'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-xs">
          {/* Allergies Card */}
          <div
            className={`p-2.5 rounded-lg border ${
              effectivePatient?.allergies && effectivePatient.allergies.trim()
                ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                : 'bg-amber-50/70 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center space-x-1.5 font-bold text-[11px] uppercase tracking-wider mb-1">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>
                {effectivePatient?.allergies && effectivePatient.allergies.trim()
                  ? 'Recorded Allergies & Reactions'
                  : 'Allergy Status: Unknown / Not Recorded'}
              </span>
            </div>
            <p className="font-semibold text-xs">
              {effectivePatient?.allergies && effectivePatient.allergies.trim()
                ? effectivePatient.allergies
                : 'Status unknown — do not assume no known allergies.'}
            </p>
          </div>

          {/* Medical Conditions */}
          <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-slate-800">
            <span className="block text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">
              Medical Conditions & Alerts
            </span>
            <p className="text-xs">
              {effectivePatient?.medical_alert_details || effectivePatient?.medical_conditions || 'None reported'}
            </p>
          </div>

          {/* Active Medications */}
          <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-slate-800">
            <span className="block text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">
              Existing / Prior Medications
            </span>
            <p className="text-xs">
              {effectivePatient?.current_medications || 'None recorded'}
            </p>
          </div>
        </div>
      </div>

      {/* Top Action & Filter Strip */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <Pill className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Prescription & Medication Records ({prescriptions.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Authorized doctor prescriptions, dosage instructions, and patient history
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={loadPrescriptions}
              disabled={loading}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition"
              title="Refresh Prescriptions"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {!isReadOnly && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-2xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Prescription</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          {/* Status filter pills */}
          <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
            {['all', 'draft', 'signed', 'cancelled', 'amended'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-md capitalize transition ${
                  statusFilter === st
                    ? 'bg-white text-teal-900 font-bold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search RX #, medicine, doctor..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Prescriptions List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-teal-500 animate-spin mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-500">
            Loading patient prescriptions...
          </p>
        </div>
      ) : filteredPrescriptions.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Pill className="w-6 h-6 text-slate-400" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No Prescriptions Found</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all'
              ? 'No prescriptions match your selected filters. Try clearing search criteria.'
              : 'No prescription records exist yet for this patient. Click "New Prescription" to write one.'}
          </p>
          {!isReadOnly && !searchQuery && statusFilter === 'all' && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Create Initial Prescription</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPrescriptions.map((pres) => {
            const isDraft = pres.status === 'draft';
            const isSigned = pres.status === 'signed';
            const isCancelled = pres.status === 'cancelled';
            const isAmended = pres.status === 'amended';

            return (
              <div
                key={pres.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden hover:border-slate-300 transition"
              >
                {/* Header Strip */}
                <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="font-mono text-xs font-extrabold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200 shadow-2xs">
                      {pres.prescription_number}
                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      v{pres.version || 1}
                    </span>

                    {/* Status Pill */}
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        isDraft
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : isSigned
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : isCancelled
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-purple-100 text-purple-800 border border-purple-200'
                      }`}
                    >
                      {pres.status}
                    </span>

                    {pres.visit_token && (
                      <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        Visit #{pres.visit_token}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 text-xs text-slate-500">
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{new Date(pres.prescription_date).toLocaleDateString()}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Dr. {pres.doctor_first_name} {pres.doctor_last_name || ''}</span>
                    </span>
                  </div>
                </div>

                {/* Body: Medications Summary & Clinical Notes */}
                <div className="p-4 space-y-3 text-xs">
                  {/* Diagnosis */}
                  {pres.diagnosis && (
                    <div className="flex items-baseline space-x-2">
                      <strong className="text-[11px] uppercase tracking-wider text-slate-400 font-bold shrink-0">
                        Indication:
                      </strong>
                      <span className="font-semibold text-slate-800">
                        {pres.diagnosis}
                      </span>
                    </div>
                  )}

                  {/* Medications Pills */}
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1.5">
                      Medications ({pres.items_count || 0})
                    </span>
                    <p className="font-medium text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      {pres.medications_summary || 'No medications listed.'}
                    </p>
                  </div>

                  {/* General Instructions */}
                  {pres.general_instructions && (
                    <div className="text-[11px] text-slate-600 bg-teal-50/50 p-2 rounded border border-teal-100">
                      <strong className="text-teal-900 font-bold">Instructions: </strong>
                      <span>{pres.general_instructions}</span>
                    </div>
                  )}

                  {/* Cancellation Reason if cancelled */}
                  {isCancelled && pres.cancellation_reason && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] flex items-start space-x-2">
                      <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Cancelled: </strong>
                        <span>{pres.cancellation_reason}</span>
                      </div>
                    </div>
                  )}

                  {/* Amendment Reason if amended */}
                  {isAmended && pres.amendment_reason && (
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 text-[11px] flex items-start space-x-2">
                      <History className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Amended: </strong>
                        <span>{pres.amendment_reason}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Action Buttons */}
                <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-[10px] text-slate-400 font-mono">
                    ID: {pres.id.slice(0, 13)}...
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Draft Actions */}
                    {isDraft && !isReadOnly && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(pres)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition shadow-2xs flex items-center space-x-1"
                        >
                          <Edit className="w-3.5 h-3.5 text-slate-500" />
                          <span>Edit Draft</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenSign(pres)}
                          className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition shadow-2xs flex items-center space-x-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Sign Prescription</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenCancel(pres)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
                          title="Cancel Prescription"
                        >
                          Cancel
                        </button>
                      </>
                    )}

                    {/* Signed Actions */}
                    {isSigned && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenPrint(pres)}
                          className="px-3.5 py-1.5 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition shadow-2xs flex items-center space-x-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-teal-600" />
                          <span>Print Prescription</span>
                        </button>

                        {!isReadOnly && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenAmend(pres)}
                              className="px-3 py-1.5 text-xs font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition shadow-2xs flex items-center space-x-1"
                            >
                              <History className="w-3.5 h-3.5 text-purple-600" />
                              <span>Amend</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenCancel(pres)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
                              title="Cancel Prescription"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {/* Cancelled or Amended Actions: Print view remains accessible for audit */}
                    {(isCancelled || isAmended) && (
                      <button
                        type="button"
                        onClick={() => handleOpenPrint(pres)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition flex items-center space-x-1"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>View / Print Archive</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1. Prescription Form Modal (Create / Edit / Amend) */}
      <PrescriptionFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        patient={effectivePatient}
        visit={visit}
        examination={examination}
        prescriptionToEdit={prescriptionToEdit}
        isAmendment={isAmendmentMode}
        onSaved={() => {
          loadPrescriptions();
          if (onPrescriptionUpdated) onPrescriptionUpdated();
        }}
      />

      {/* 2. Prescription Sign Modal */}
      <PrescriptionSignModal
        isOpen={isSignModalOpen}
        onClose={() => setIsSignModalOpen(false)}
        prescription={prescriptionToSign}
        onSigned={() => {
          loadPrescriptions();
          if (onPrescriptionUpdated) onPrescriptionUpdated();
        }}
      />

      {/* 3. Prescription Cancel Modal */}
      <PrescriptionCancelModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        prescription={prescriptionToCancel}
        onCancelled={() => {
          loadPrescriptions();
          if (onPrescriptionUpdated) onPrescriptionUpdated();
        }}
      />

      {/* 4. Prescription Print Preview Modal */}
      <PrescriptionPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        printData={printData}
      />
    </div>
  );
};

export default PrescriptionManager;
