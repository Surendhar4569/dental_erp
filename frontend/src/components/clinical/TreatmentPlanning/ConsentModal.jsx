import React, { useState, useEffect } from 'react';
import {
  X,
  FileCheck,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  History,
  Clock,
  User,
  AlertCircle,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { treatmentPlanService } from '../../../services/treatmentPlanService';

const COMMON_RISKS = [
  'Post-operative sensitivity or discomfort',
  'Bleeding, swelling, or localized bruising',
  'Transient or permanent nerve paresthesia',
  'Fracture of tooth or restorative material',
  'Failure of endodontic treatment requiring periapical surgery',
  'Allergic reaction to dental materials or local anesthetics',
  'Need for additional unexpected clinical procedures',
];

const COMMON_ALTERNATIVES = [
  'No treatment / observation of condition (with disease progression risks)',
  'Tooth extraction rather than restorative/endodontic preservation',
  'Removable prosthetics instead of fixed crown/bridge/implant',
  'Temporary sedative restoration prior to definitive therapy',
];

export const ConsentModal = ({
  isOpen,
  onClose,
  plan,
  patient,
  visit,
  onConsentSuccess,
}) => {
  const [activeTab, setActiveTab] = useState('record'); // 'record' | 'history' | 'withdraw'

  // Form State
  const [consentStatus, setConsentStatus] = useState('obtained'); // 'obtained' | 'declined'
  const [procedureSummary, setProcedureSummary] = useState('');
  const [materialRisks, setMaterialRisks] = useState(COMMON_RISKS.slice(0, 3).join('; '));
  const [alternativesDiscussed, setAlternativesDiscussed] = useState(
    'Observation without treatment, tooth extraction, and deferred care discussed with patient.'
  );
  const [acknowledgementMethod, setAcknowledgementMethod] = useState('in_person_verbal_witnessed');
  const [patientNameAcknowledged, setPatientNameAcknowledged] = useState('');
  const [isGuardianConsent, setIsGuardianConsent] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('Parent');
  const [witnessName, setWitnessName] = useState('');
  const [witnessRole, setWitnessRole] = useState('Dental Assistant');
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [declineReason, setDeclineReason] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Consent History state
  const [consentHistory, setConsentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Initialize form when plan changes
  useEffect(() => {
    if (isOpen && plan) {
      const patientFullName = `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim();
      setPatientNameAcknowledged(patientFullName);

      // Generate default procedure summary from plan items
      const itemSummaries = (plan.items || [])
        .filter((it) => it.status !== 'cancelled')
        .map((it) => `${it.procedure_name}${it.tooth_number ? ` (#${it.tooth_number})` : ''}`)
        .join(', ');

      setProcedureSummary(
        itemSummaries
          ? `Agreed treatment scope includes: ${itemSummaries}.`
          : plan.treatment_summary || 'General dental treatment plan discussed.'
      );

      // Default select all active items
      const activeIds = (plan.items || [])
        .filter((it) => it.status !== 'cancelled')
        .map((it) => it.id);
      setSelectedItemIds(activeIds);

      // Load existing consents for this plan
      if (plan.consents && plan.consents.length > 0) {
        setConsentHistory(plan.consents);
      }
    }
  }, [isOpen, plan, patient]);

  // Toggle item in agreed items snapshot
  const handleToggleItem = (itemId) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleSelectAllItems = () => {
    const activeIds = (plan?.items || []).filter((it) => it.status !== 'cancelled').map((it) => it.id);
    setSelectedItemIds(activeIds);
  };

  // Add risk snippet
  const handleAddRisk = (risk) => {
    if (!materialRisks.includes(risk)) {
      setMaterialRisks((prev) => (prev ? `${prev}; ${risk}` : risk));
    }
  };

  // Add alternative snippet
  const handleAddAlternative = (alt) => {
    if (!alternativesDiscussed.includes(alt)) {
      setAlternativesDiscussed((prev) => (prev ? `${prev}; ${alt}` : alt));
    }
  };

  // Submit Consent Record
  const handleSubmitConsent = async (e) => {
    e.preventDefault();

    if (!procedureSummary.trim()) {
      toast.warning('Procedure summary is required.');
      return;
    }

    if (!materialRisks.trim()) {
      toast.warning('Material risks discussed with the patient must be recorded.');
      return;
    }

    if (!patientNameAcknowledged.trim()) {
      toast.warning('Patient acknowledgement name is required.');
      return;
    }

    if (isGuardianConsent && (!guardianName.trim() || !guardianRelationship.trim())) {
      toast.warning('Guardian name and relationship are required for guardian consent.');
      return;
    }

    if (consentStatus === 'declined' && !declineReason.trim()) {
      toast.warning('Please specify the patient’s reason for declining treatment.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        patientId: patient?.id || plan.patient_id,
        consentStatus,
        procedureSummary: procedureSummary.trim(),
        materialRisksDiscussed: materialRisks.trim(),
        alternativesDiscussed: alternativesDiscussed.trim(),
        acknowledgementMethod,
        patientNameAcknowledged: patientNameAcknowledged.trim(),
        isGuardianConsent,
        guardianName: isGuardianConsent ? guardianName.trim() : null,
        guardianRelationship: isGuardianConsent ? guardianRelationship.trim() : null,
        witnessName: witnessName.trim() || null,
        witnessRole: witnessRole.trim() || null,
        agreedItemIds: selectedItemIds,
        declineReason: consentStatus === 'declined' ? declineReason.trim() : null,
      };

      const res = await treatmentPlanService.recordConsent(plan.id, payload);
      toast.success(
        `Informed consent #${res.consent?.consent_number || 'CNS'} recorded successfully!`,
        { icon: <ShieldCheck className="w-5 h-5 text-emerald-600" /> }
      );

      if (onConsentSuccess) {
        onConsentSuccess(res);
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to record consent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Withdraw Consent
  const handleWithdrawConsent = async (consentId) => {
    if (!withdrawalReason.trim()) {
      toast.warning('A valid clinical/patient reason is required to withdraw informed consent.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        newConsentStatus: 'withdrawn',
        amendmentReason: 'Patient formal consent withdrawal',
        withdrawalReason: withdrawalReason.trim(),
        notes: `Patient withdrew consent on ${new Date().toLocaleDateString()}`,
      };

      await treatmentPlanService.amendConsent(consentId, payload);
      toast.success('Informed consent successfully recorded as withdrawn.');
      if (onConsentSuccess) {
        onConsentSuccess();
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to withdraw consent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !plan) return null;

  const latestConsent = (plan.consents || [])[0];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <h3 className="text-base font-bold">Informed Consent Management</h3>
              <p className="text-xs text-emerald-100">
                Plan {plan.plan_number} (v{plan.version}) • {patient?.first_name} {patient?.last_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="bg-slate-100 px-6 pt-2 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex space-x-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('record')}
              className={`py-2 px-3.5 font-bold rounded-t-lg transition flex items-center space-x-1.5 ${
                activeTab === 'record'
                  ? 'bg-white text-emerald-800 border-t-2 border-emerald-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCheck className="w-4 h-4 text-emerald-600" />
              <span>Record Informed Consent</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`py-2 px-3.5 font-bold rounded-t-lg transition flex items-center space-x-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-emerald-800 border-t-2 border-emerald-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-4 h-4 text-teal-600" />
              <span>Consent History ({plan.consents?.length || 0})</span>
            </button>

            {latestConsent?.consent_status === 'obtained' && (
              <button
                type="button"
                onClick={() => setActiveTab('withdraw')}
                className={`py-2 px-3.5 font-bold rounded-t-lg transition flex items-center space-x-1.5 ${
                  activeTab === 'withdraw'
                    ? 'bg-white text-rose-800 border-t-2 border-rose-600 shadow-2xs'
                    : 'text-rose-600 hover:text-rose-800'
                }`}
              >
                <XCircle className="w-4 h-4 text-rose-500" />
                <span>Withdraw Consent</span>
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Status: <strong className="uppercase text-slate-700">{plan.status}</strong>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TAB 1: RECORD CONSENT */}
          {activeTab === 'record' && (
            <form onSubmit={handleSubmitConsent} className="space-y-4 text-xs">
              {/* Consent Status Choice */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Patient Consent Decision <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center space-x-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      consentStatus === 'obtained'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="consentStatus"
                      value="obtained"
                      checked={consentStatus === 'obtained'}
                      onChange={() => setConsentStatus('obtained')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold block">Consent Obtained</span>
                      <span className="text-[10px] text-emerald-700">
                        Patient / guardian agreed to proposed treatment & risks
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-center space-x-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      consentStatus === 'declined'
                        ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="consentStatus"
                      value="declined"
                      checked={consentStatus === 'declined'}
                      onChange={() => setConsentStatus('declined')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <span className="font-bold block">Consent Declined</span>
                      <span className="text-[10px] text-rose-700">
                        Patient / guardian declined proposed procedures
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Procedure Summary */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  1. Treatment & Procedure Scope Explained <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={procedureSummary}
                  onChange={(e) => setProcedureSummary(e.target.value)}
                  placeholder="Summary of clinical procedures discussed with the patient"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Material Risks Discussed */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    2. Material Risks Explained to Patient <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Click chips below to add</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {COMMON_RISKS.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleAddRisk(r)}
                      className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 border border-slate-200 rounded-md transition text-slate-600"
                    >
                      + {r}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  required
                  value={materialRisks}
                  onChange={(e) => setMaterialRisks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Alternatives Discussed */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    3. Alternatives Discussed
                  </label>
                  <span className="text-[10px] text-slate-400">Click chips below to add</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {COMMON_ALTERNATIVES.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleAddAlternative(a)}
                      className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 border border-slate-200 rounded-md transition text-slate-600"
                    >
                      + {a}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={alternativesDiscussed}
                  onChange={(e) => setAlternativesDiscussed(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Scope of Agreed Items (Checklist) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    4. Agreed Treatment Items Snapshot ({selectedItemIds.length}/{(plan.items || []).length})
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllItems}
                    className="text-[10px] font-bold text-teal-700 hover:underline"
                  >
                    Select All Items
                  </button>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {(plan.items || []).map((it) => (
                    <label
                      key={it.id}
                      className="flex items-center space-x-2 p-1.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedItemIds.includes(it.id)}
                        onChange={() => handleToggleItem(it.id)}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                      <span className="font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded text-[10px]">
                        {it.tooth_number ? `#${it.tooth_number}` : 'Mouth'}
                      </span>
                      <span className="font-semibold text-slate-800 flex-1">{it.procedure_name}</span>
                      <span className="font-mono text-slate-600">${parseFloat(it.total_cost || 0).toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Patient Acknowledgement & Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Patient Name Acknowledged <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={patientNameAcknowledged}
                    onChange={(e) => setPatientNameAcknowledged(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Acknowledgement Method <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={acknowledgementMethod}
                    onChange={(e) => setAcknowledgementMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="in_person_verbal_witnessed">
                      In-Person Verbal Explanation (Doctor-Verified & Witnessed)
                    </option>
                    <option value="signed_paper_on_file">
                      Signed Physical Paper Consent Form on File
                    </option>
                    <option value="digital_acknowledgement_patient">
                      Digital Chairside Tablet Acknowledgement (Patient)
                    </option>
                    <option value="digital_acknowledgement_guardian">
                      Digital Chairside Tablet Acknowledgement (Parent / Legal Guardian)
                    </option>
                  </select>
                </div>
              </div>

              {/* Guardian Toggle & Details */}
              <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isGuardianConsent}
                    onChange={(e) => setIsGuardianConsent(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    Consent provided by Parent / Legal Guardian (Minor or dependent patient)
                  </span>
                </label>

                {isGuardianConsent && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Guardian Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required={isGuardianConsent}
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                        placeholder="e.g. Jane Doe"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Relationship to Patient <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required={isGuardianConsent}
                        value={guardianRelationship}
                        onChange={(e) => setGuardianRelationship(e.target.value)}
                        placeholder="e.g. Mother, Father, Legal Guardian"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Witness Details (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Witness Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={witnessName}
                    onChange={(e) => setWitnessName(e.target.value)}
                    placeholder="e.g. Nurse Sarah"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Witness Role</label>
                  <input
                    type="text"
                    value={witnessRole}
                    onChange={(e) => setWitnessRole(e.target.value)}
                    placeholder="e.g. Dental Assistant"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* If Declined: Reason */}
              {consentStatus === 'declined' && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                  <label className="block text-[11px] font-bold text-rose-900">
                    Reason for Declining Treatment <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="e.g. Patient prefers extraction over root canal / financial constraints / second opinion"
                    className="w-full px-3 py-2 border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none text-xs"
                  />
                </div>
              )}

              {/* Submit Button */}
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 inline-flex items-center space-x-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Recording Consent...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Record Informed Consent</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CONSENT HISTORY (APPEND-ONLY) */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {consentHistory.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  No formal consent records have been recorded yet for this treatment plan.
                </div>
              ) : (
                <div className="space-y-3">
                  {consentHistory.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs shadow-2xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            {c.consent_number}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              c.consent_status === 'obtained'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.consent_status === 'withdrawn'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {c.consent_status}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            Plan v{c.plan_version_at_consent}
                          </span>
                        </div>
                        <span className="text-slate-500 text-[11px]">
                          {c.obtained_at || c.declined_at || c.created_at
                            ? new Date(c.obtained_at || c.declined_at || c.created_at).toLocaleString()
                            : '—'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block font-semibold">Acknowledged By</span>
                          <span className="font-medium text-slate-800">
                            {c.patient_name_acknowledged}
                            {c.is_guardian_consent && ` (Guardian: ${c.guardian_name} - ${c.guardian_relationship})`}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-semibold">Method</span>
                          <span className="font-medium text-slate-800 capitalize">
                            {(c.acknowledgement_method || '').replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="font-semibold text-slate-700 block">Procedure Scope</span>
                        <p className="text-slate-600 mt-0.5">{c.procedure_summary}</p>
                        {c.material_risks_discussed && (
                          <div className="mt-1 pt-1 border-t border-slate-100 text-slate-500">
                            <strong className="text-slate-600">Risks: </strong>
                            {c.material_risks_discussed}
                          </div>
                        )}
                      </div>

                      {c.withdrawal_reason && (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px]">
                          <strong>Withdrawal Reason:</strong> {c.withdrawal_reason} (at{' '}
                          {new Date(c.withdrawn_at).toLocaleString()})
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WITHDRAW CONSENT */}
          {activeTab === 'withdraw' && latestConsent && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-900">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-sm">Formal Withdrawal of Informed Consent</h4>
                  <p className="text-xs text-rose-800 leading-relaxed">
                    Under dental clinical governance, a patient or their legal guardian has the right to
                    withdraw informed consent at any time prior to or during treatment. This action is
                    recorded in the append-only legal audit trail and halts any unstarted procedures under
                    Consent #{latestConsent.consent_number}.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Reason for Withdrawal <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={withdrawalReason}
                  onChange={(e) => setWithdrawalReason(e.target.value)}
                  placeholder="Detail the patient's statement, changing clinical circumstances, or decision to withdraw consent"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('record')}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => handleWithdrawConsent(latestConsent.id)}
                  disabled={isSubmitting || !withdrawalReason.trim()}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 inline-flex items-center space-x-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Recording Withdrawal...</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      <span>Confirm Withdrawal</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConsentModal;
