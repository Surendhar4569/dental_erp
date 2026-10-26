import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Pill,
  Save,
  CheckCircle2,
  Info,
  Clock,
  Sparkles,
  HeartPulse,
} from 'lucide-react';
import { toast } from 'react-toastify';
import prescriptionService from '../../../services/prescriptionService';

// Common dental prescription drug suggestions for free-text datalist
const COMMON_DENTAL_DRUGS = [
  { name: 'Amoxicillin', generic: 'Amoxicillin', dosage: '500 mg', form: 'capsule', route: 'oral', freq: 'Three times daily (TID)', dur: '5 days', qty: 15, unit: 'capsules', inst: 'Take with food and plenty of water.' },
  { name: 'Augmentin (Amoxicillin + Clavulanate)', generic: 'Amoxicillin + Clavulanic Acid', dosage: '625 mg', form: 'tablet', route: 'oral', freq: 'Twice daily (BD)', dur: '5 days', qty: 10, unit: 'tablets', inst: 'Take at the start of meals.' },
  { name: 'Ibuprofen', generic: 'Ibuprofen', dosage: '400 mg', form: 'tablet', route: 'oral', freq: 'Every 8 hours as needed (TID PRN)', dur: '3 days', qty: 9, unit: 'tablets', inst: 'Take strictly after food for pain.', isPrn: true, prnInd: 'Acute dental pain' },
  { name: 'Paracetamol', generic: 'Acetaminophen', dosage: '650 mg', form: 'tablet', route: 'oral', freq: 'Three times daily (TID)', dur: '3 days', qty: 9, unit: 'tablets', inst: 'Take after meals for mild to moderate pain.' },
  { name: 'Metronidazole', generic: 'Metronidazole', dosage: '400 mg', form: 'tablet', route: 'oral', freq: 'Three times daily (TID)', dur: '5 days', qty: 15, unit: 'tablets', inst: 'Do not consume any alcohol during treatment.' },
  { name: 'Clindamycin', generic: 'Clindamycin Hydrochloride', dosage: '300 mg', form: 'capsule', route: 'oral', freq: 'Every 6 hours (QID)', dur: '5 days', qty: 20, unit: 'capsules', inst: 'Take with a full glass of water. Penicillin-allergic alternative.' },
  { name: 'Chlorhexidine Gluconate 0.2%', generic: 'Chlorhexidine', dosage: '10 ml', form: 'mouthwash', route: 'dental_rinse', freq: 'Twice daily after brushing', dur: '7 days', qty: 1, unit: 'bottles', inst: 'Rinse vigorously for 60 seconds and spit out. Do not swallow.' },
  { name: 'Ketorolac Tromethamine', generic: 'Ketorolac', dosage: '10 mg', form: 'tablet', route: 'oral', freq: 'Every 6 hours PRN', dur: '3 days', qty: 6, unit: 'tablets', inst: 'Take strictly after food. Max 5 days.', isPrn: true, prnInd: 'Severe post-surgical dental pain' },
  { name: 'Cefixime', generic: 'Cefixime', dosage: '200 mg', form: 'tablet', route: 'oral', freq: 'Twice daily (BD)', dur: '5 days', qty: 10, unit: 'tablets', inst: 'Take with or without food.' },
  { name: 'Triamcinolone Acetonide 0.1% Paste', generic: 'Triamcinolone', dosage: '0.1% paste', form: 'paste', route: 'gingival_application', freq: 'Apply at bedtime', dur: '7 days', qty: 1, unit: 'tubes', inst: 'Press small dab onto oral ulcer. Do not rub.' },
];

export const PrescriptionFormModal = ({
  isOpen,
  onClose,
  patient,
  visit,
  examination,
  treatmentPlans = [],
  prescriptionToEdit = null,
  isAmendment = false,
  onSaved,
}) => {
  const [diagnosis, setDiagnosis] = useState('');
  const [generalInstructions, setGeneralInstructions] = useState('');
  const [dietaryAdvice, setDietaryAdvice] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [amendmentReason, setAmendmentReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Medication items list state
  const [items, setItems] = useState([
    {
      medicineName: '',
      genericName: '',
      brandName: '',
      dosage: '500 mg',
      dosageForm: 'tablet',
      route: 'oral',
      frequency: 'Three times daily (TID)',
      duration: '5 days',
      quantity: 10,
      quantityUnit: 'tablets',
      instructions: 'Take after food with water.',
      isPrn: false,
      prnIndication: '',
      refillsAllowed: 0,
    },
  ]);

  // Pre-fill state on open or edit
  useEffect(() => {
    if (isOpen) {
      if (prescriptionToEdit) {
        setDiagnosis(prescriptionToEdit.diagnosis || '');
        setGeneralInstructions(prescriptionToEdit.general_instructions || prescriptionToEdit.generalInstructions || '');
        setDietaryAdvice(prescriptionToEdit.dietary_advice || prescriptionToEdit.dietaryAdvice || '');
        setSelectedPlanId(prescriptionToEdit.treatment_plan_id || '');
        if (prescriptionToEdit.items && prescriptionToEdit.items.length > 0) {
          setItems(
            prescriptionToEdit.items.map((it) => ({
              medicineName: it.medicine_name || it.medicineName || '',
              genericName: it.generic_name || it.genericName || '',
              brandName: it.brand_name || it.brandName || '',
              dosage: it.dosage || '500 mg',
              dosageForm: it.dosage_form || it.dosageForm || 'tablet',
              route: it.route || 'oral',
              frequency: it.frequency || 'Twice daily (BD)',
              duration: it.duration || '5 days',
              quantity: it.quantity || 1,
              quantityUnit: it.quantity_unit || it.quantityUnit || 'tablets',
              instructions: it.instructions || '',
              isPrn: Boolean(it.is_prn || it.isPrn),
              prnIndication: it.prn_indication || it.prnIndication || '',
              refillsAllowed: it.refills_allowed || it.refillsAllowed || 0,
            }))
          );
        }
      } else {
        // New prescription draft
        setDiagnosis(examination?.diagnosis || visit?.chief_complaint || '');
        setGeneralInstructions('Take all medications strictly as directed. Complete the entire course of antibiotics.');
        setDietaryAdvice('Avoid hard, crunchy, or extremely hot food near the treated quadrant.');
        setSelectedPlanId('');
        setAmendmentReason('');
        setItems([
          {
            medicineName: '',
            genericName: '',
            brandName: '',
            dosage: '500 mg',
            dosageForm: 'tablet',
            route: 'oral',
            frequency: 'Three times daily (TID)',
            duration: '5 days',
            quantity: 15,
            quantityUnit: 'tablets',
            instructions: 'Take after meals with plenty of water.',
            isPrn: false,
            prnIndication: '',
            refillsAllowed: 0,
          },
        ]);
      }
    }
  }, [isOpen, prescriptionToEdit, examination, visit]);

  if (!isOpen) return null;

  const patientAllergies = patient?.allergies || patient?.patient_allergies || '';
  const hasRecordedAllergies = Boolean(patientAllergies && patientAllergies.trim());

  // Check if any medication item in current form might trigger an allergy warning
  const allergyWarningItems = items.filter((it) => {
    if (!hasRecordedAllergies || !it.medicineName) return false;
    const nameLower = (it.medicineName + ' ' + (it.genericName || '')).toLowerCase();
    const pAllergyLower = patientAllergies.toLowerCase();
    if (pAllergyLower.includes('penicillin') || pAllergyLower.includes('amox')) {
      if (nameLower.includes('amox') || nameLower.includes('penicillin') || nameLower.includes('augmentin')) return true;
    }
    if (pAllergyLower.includes('nsaid') || pAllergyLower.includes('ibuprofen') || pAllergyLower.includes('aspirin')) {
      if (nameLower.includes('ibuprofen') || nameLower.includes('brufen') || nameLower.includes('aspirin') || nameLower.includes('ketorolac')) return true;
    }
    return false;
  });

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        medicineName: '',
        genericName: '',
        brandName: '',
        dosage: '400 mg',
        dosageForm: 'tablet',
        route: 'oral',
        frequency: 'Every 8 hours as needed (TID PRN)',
        duration: '3 days',
        quantity: 6,
        quantityUnit: 'tablets',
        instructions: 'Take after meals for dental pain.',
        isPrn: true,
        prnIndication: 'Dental pain',
        refillsAllowed: 0,
      },
    ]);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;

    // Auto-fill from common drugs if user selects from datalist
    if (field === 'medicineName') {
      const match = COMMON_DENTAL_DRUGS.find((d) => d.name.toLowerCase() === value.toLowerCase());
      if (match) {
        updated[index].genericName = match.generic;
        updated[index].dosage = match.dosage;
        updated[index].dosageForm = match.form;
        updated[index].route = match.route;
        updated[index].frequency = match.freq;
        updated[index].duration = match.dur;
        updated[index].quantity = match.qty;
        updated[index].quantityUnit = match.unit;
        updated[index].instructions = match.inst;
        if (match.isPrn) {
          updated[index].isPrn = true;
          updated[index].prnIndication = match.prnInd;
        }
      }
    }

    setItems(updated);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) {
      toast.warn('A prescription must have at least one medication item.');
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.medicineName || !it.medicineName.trim()) {
        toast.warn(`Medication #${i + 1} must have a medicine name.`);
        return;
      }
      if (!it.dosage || !it.dosage.trim()) {
        toast.warn(`Medication #${i + 1} must have a dosage.`);
        return;
      }
      if (!it.frequency || !it.frequency.trim()) {
        toast.warn(`Medication #${i + 1} must have a frequency.`);
        return;
      }
      if (!it.duration || !it.duration.trim()) {
        toast.warn(`Medication #${i + 1} must have a duration.`);
        return;
      }
    }

    if (isAmendment && (!amendmentReason || !amendmentReason.trim())) {
      toast.warn('Please provide an amendment reason for this signed prescription.');
      return;
    }

    try {
      setIsSubmitting(true);

      if (isAmendment && prescriptionToEdit) {
        // Amend signed prescription workflow
        const amendRes = await prescriptionService.amendPrescription(prescriptionToEdit.id, {
          reason: amendmentReason.trim(),
          newItems: items,
          newDiagnosis: diagnosis.trim(),
          newInstructions: generalInstructions.trim(),
        });
        toast.success(`Prescription amended. Replacement draft created.`);
        if (onSaved) onSaved(amendRes.replacementPrescription);
      } else if (prescriptionToEdit && !isAmendment) {
        // Update existing draft header
        const updRes = await prescriptionService.updatePrescriptionDraft(prescriptionToEdit.id, {
          diagnosis: diagnosis.trim(),
          generalInstructions: generalInstructions.trim(),
          dietaryAdvice: dietaryAdvice.trim(),
          treatmentPlanId: selectedPlanId || null,
        });
        toast.success(`Prescription ${updRes.prescription.prescription_number} draft updated.`);
        if (onSaved) onSaved(updRes.prescription);
      } else {
        // Create new prescription draft
        const createPayload = {
          patientId: patient?.id,
          visitId: visit?.id || null,
          examinationId: examination?.id || null,
          treatmentPlanId: selectedPlanId || null,
          diagnosis: diagnosis.trim(),
          generalInstructions: generalInstructions.trim(),
          dietaryAdvice: dietaryAdvice.trim(),
          items,
        };
        const createRes = await prescriptionService.createPrescription(createPayload);
        toast.success(`Prescription ${createRes.prescription.prescription_number} draft created.`);
        if (onSaved) onSaved(createRes.prescription);
      }

      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save prescription draft.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      {/* HTML5 datalist for common drug auto-suggestions */}
      <datalist id="dental-common-drugs">
        {COMMON_DENTAL_DRUGS.map((d, i) => (
          <option key={i} value={d.name}>
            {d.generic} — {d.dosage} ({d.form})
          </option>
        ))}
      </datalist>

      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 bg-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-teal-700 flex items-center justify-center font-bold text-sm font-serif">
              Rx
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide">
                {isAmendment
                  ? `Amend & Replace Prescription — ${prescriptionToEdit?.prescription_number}`
                  : prescriptionToEdit
                  ? `Edit Draft Prescription — ${prescriptionToEdit?.prescription_number}`
                  : 'Write New Dental Prescription & Medications'}
              </h3>
              <p className="text-[11px] text-teal-200">
                Patient: <strong className="text-white">{patient?.first_name} {patient?.last_name || ''}</strong> (ID: #{patient?.patient_number})
                {visit?.token_display ? ` • Visit Token: #${visit.token_display}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-teal-200 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Section 1: Patient Clinical Context & Allergy Safety Banner */}
          <div className={`p-4 rounded-xl border ${hasRecordedAllergies ? 'bg-amber-50/80 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2.5">
                {hasRecordedAllergies ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <HeartPulse className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Patient Clinical Context & Safety Alerts
                  </h4>
                  <div className="mt-1 space-y-1 text-slate-700">
                    <p>
                      <strong>Known Allergies: </strong>
                      {hasRecordedAllergies ? (
                        <span className="font-bold text-rose-700 underline">
                          {patientAllergies}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">
                          Status Unknown / None recorded in profile. (Clinician must verbally verify with patient).
                        </span>
                      )}
                    </p>
                    {patient?.medical_conditions && (
                      <p>
                        <strong>Medical Conditions: </strong>
                        <span>{patient.medical_conditions}</span>
                      </p>
                    )}
                    {patient?.current_medications && (
                      <p>
                        <strong>Active Regular Medications: </strong>
                        <span>{patient.current_medications}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {hasRecordedAllergies && (
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                  Allergy Flagged
                </span>
              )}
            </div>

            {/* Real-time Allergy Conflict Warning if matched */}
            {allergyWarningItems.length > 0 && (
              <div className="mt-3 p-2.5 bg-rose-100 border border-rose-300 rounded-lg flex items-center space-x-2 text-rose-900 font-bold text-xs animate-pulse">
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                <span>
                  CAUTION: Prescribing "{allergyWarningItems.map((it) => it.medicineName).join(', ')}" may conflict with patient's allergy: "{patientAllergies}".
                </span>
              </div>
            )}
          </div>

          {/* Section 1.5: Amendment Reason (if amendment mode) */}
          {isAmendment && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-purple-900">
                Reason for Amending Signed Prescription <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                required
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder="e.g. Dosage adjusted due to patient intolerance; Added pain reliever; Switched antibiotic"
                className="w-full text-xs border border-purple-300 rounded-lg p-2 focus:ring-purple-500 bg-white"
              />
              <p className="text-[10px] text-purple-700">
                The original signed record will be archived with full revision history. A replacement draft will be created for your review and digital signature.
              </p>
            </div>
          )}

          {/* Section 2: Clinical Indication, Instructions & Treatment Plan Link */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Clinical Diagnosis / Indication
              </label>
              <input
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. Acute periapical abscess #36, Post-surgical pain"
                className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                General Patient Instructions
              </label>
              <input
                type="text"
                value={generalInstructions}
                onChange={(e) => setGeneralInstructions(e.target.value)}
                placeholder="e.g. Take medications after meals with plenty of water."
                className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Dietary & Aftercare Advice
              </label>
              <input
                type="text"
                value={dietaryAdvice}
                onChange={(e) => setDietaryAdvice(e.target.value)}
                placeholder="e.g. Soft diet for 48 hours; Avoid alcohol."
                className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 3: Medication Items Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center space-x-2">
                <Pill className="w-4 h-4 text-teal-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Prescription Medications ({items.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center space-x-1 px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg font-bold text-xs transition shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-teal-600" />
                <span>Add Medication</span>
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 hover:border-slate-300 transition space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <span className="font-bold text-xs text-teal-900">
                      Medication #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                      title="Remove Medication"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Primary Row: Medicine Name, Generic, Brand */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Medicine Name * <span className="text-slate-400 font-normal">(Free text or suggest)</span>
                      </label>
                      <input
                        type="text"
                        required
                        list="dental-common-drugs"
                        value={item.medicineName}
                        onChange={(e) => handleItemChange(index, 'medicineName', e.target.value)}
                        placeholder="e.g. Amoxicillin, Augmentin, Ibuprofen"
                        className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2 focus:ring-teal-500 focus:outline-none bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Generic Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={item.genericName}
                        onChange={(e) => handleItemChange(index, 'genericName', e.target.value)}
                        placeholder="e.g. Amoxicillin Trihydrate"
                        className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-teal-500 focus:outline-none bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Brand / Trade Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={item.brandName}
                        onChange={(e) => handleItemChange(index, 'brandName', e.target.value)}
                        placeholder="e.g. Mox 500, Brufen 400"
                        className="w-full text-xs border border-slate-300 rounded-lg p-2 focus:ring-teal-500 focus:outline-none bg-white"
                      />
                    </div>
                  </div>

                  {/* Second Row: Dosage, Form, Route, Frequency, Duration, Qty */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Dosage / Strength *
                      </label>
                      <input
                        type="text"
                        required
                        value={item.dosage}
                        onChange={(e) => handleItemChange(index, 'dosage', e.target.value)}
                        placeholder="e.g. 500 mg"
                        className="w-full text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Form
                      </label>
                      <select
                        value={item.dosageForm}
                        onChange={(e) => handleItemChange(index, 'dosageForm', e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white capitalize"
                      >
                        <option value="tablet">Tablet</option>
                        <option value="capsule">Capsule</option>
                        <option value="syrup">Syrup</option>
                        <option value="mouthwash">Mouthwash</option>
                        <option value="gel">Gel</option>
                        <option value="paste">Paste</option>
                        <option value="liquid">Liquid</option>
                        <option value="drops">Drops</option>
                        <option value="injection">Injection</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Route
                      </label>
                      <select
                        value={item.route}
                        onChange={(e) => handleItemChange(index, 'route', e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white capitalize"
                      >
                        <option value="oral">Oral</option>
                        <option value="dental_rinse">Dental Rinse</option>
                        <option value="gingival_application">Gingival App</option>
                        <option value="topical">Topical</option>
                        <option value="sublingual">Sublingual</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Frequency *
                      </label>
                      <input
                        type="text"
                        required
                        value={item.frequency}
                        onChange={(e) => handleItemChange(index, 'frequency', e.target.value)}
                        placeholder="e.g. TID, BD, OD"
                        className="w-full text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Duration *
                      </label>
                      <input
                        type="text"
                        required
                        value={item.duration}
                        onChange={(e) => handleItemChange(index, 'duration', e.target.value)}
                        placeholder="e.g. 5 days"
                        className="w-full text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Quantity *
                      </label>
                      <div className="flex space-x-1">
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          className="w-16 text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white"
                        />
                        <input
                          type="text"
                          value={item.quantityUnit}
                          onChange={(e) => handleItemChange(index, 'quantityUnit', e.target.value)}
                          placeholder="tabs"
                          className="w-full text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Third Row: Patient Directions & PRN Checkbox */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                        Patient Directions / Specific Timing Instructions
                      </label>
                      <input
                        type="text"
                        value={item.instructions}
                        onChange={(e) => handleItemChange(index, 'instructions', e.target.value)}
                        placeholder="e.g. Take strictly after food with a full glass of water."
                        className="w-full text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white"
                      />
                    </div>

                    <div className="flex items-center space-x-3 pt-4 sm:pt-2">
                      <label className="flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isPrn}
                          onChange={(e) => handleItemChange(index, 'isPrn', e.target.checked)}
                          className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                        />
                        <span className="font-bold text-slate-700 text-xs">PRN (As Needed)</span>
                      </label>

                      {item.isPrn && (
                        <input
                          type="text"
                          value={item.prnIndication}
                          onChange={(e) => handleItemChange(index, 'prnIndication', e.target.value)}
                          placeholder="Indication: e.g. For acute pain"
                          className="flex-1 text-xs border border-slate-300 rounded-lg p-1.5 focus:ring-teal-500 bg-white"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center space-x-1.5 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Saving...'
                  : isAmendment
                  ? 'Create Replacement Prescription Draft'
                  : prescriptionToEdit
                  ? 'Update Draft'
                  : 'Save Prescription Draft'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PrescriptionFormModal;
