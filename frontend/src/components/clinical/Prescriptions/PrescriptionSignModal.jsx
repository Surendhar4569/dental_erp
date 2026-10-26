import React, { useState } from 'react';
import { X, ShieldCheck, AlertTriangle, FileCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-toastify';
import prescriptionService from '../../../services/prescriptionService';

export const PrescriptionSignModal = ({ isOpen, onClose, prescription, onSigned }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  if (!isOpen || !prescription) return null;

  const allergyConflicts = prescription.allergyConflicts || [];
  const hasConflict = allergyConflicts.length > 0;

  const handleSign = async () => {
    if (hasConflict && !acknowledged) {
      toast.warn('Please acknowledge the potential allergy risk before signing.');
      return;
    }
    if (hasConflict && (!overrideReason || !overrideReason.trim())) {
      toast.warn('Please enter a clinical override reason for the detected allergy risk.');
      return;
    }

    try {
      setIsSubmitting(true);
      const ackPayload = hasConflict
        ? {
            acknowledged: true,
            clinicalReason: overrideReason.trim(),
            conflictItems: allergyConflicts.map((c) => c.medicineName),
          }
        : null;

      const res = await prescriptionService.signPrescription(prescription.id, ackPayload);
      toast.success(`Prescription ${prescription.prescription_number} signed successfully.`);
      if (onSigned) onSigned(res.prescription);
      onClose();
    } catch (err) {
      if (err.response?.data?.code === 'ALLERGY_CONFLICT_DETECTED') {
        toast.error(err.response.data.message || 'Allergy conflict detected. Override required.');
      } else {
        toast.error(err.response?.data?.message || err.message || 'Failed to sign prescription.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 bg-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-teal-300" />
            <h3 className="text-sm font-bold tracking-wide">
              Doctor Digital Sign-Off — {prescription.prescription_number}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-300 hover:text-white rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          <div>
            <p className="text-slate-600">
              You are about to digitally sign and certify prescription{' '}
              <strong className="text-slate-900 font-mono">
                {prescription.prescription_number}
              </strong>{' '}
              for patient{' '}
              <strong className="text-slate-900">
                {prescription.patient_first_name} {prescription.patient_last_name || ''}
              </strong>.
            </p>
            <p className="text-slate-500 text-[11px] mt-1">
              Once signed, this clinical prescription becomes a formal legal record and cannot be silently edited or deleted.
            </p>
          </div>

          {/* Medication Summary */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Medications to be Signed ({prescription.items?.length || 0})
            </span>
            <ul className="space-y-1">
              {prescription.items?.map((item, idx) => (
                <li key={item.id || idx} className="flex items-center justify-between font-semibold text-slate-800">
                  <span>
                    {idx + 1}. {item.medicine_name || item.medicineName}{' '}
                    <span className="text-slate-500 font-normal">
                      ({item.dosage}, {item.frequency})
                    </span>
                  </span>
                  <span className="font-mono text-slate-600 text-[11px]">
                    Qty: {item.quantity} {item.quantity_unit || item.quantityUnit || 'tabs'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Allergy Conflict Warning (if detected) */}
          {hasConflict ? (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl space-y-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                    Clinical Safety Alert: Potential Allergy Conflict
                  </h4>
                  <p className="text-[11px] text-rose-800 mt-0.5">
                    Patient medical record indicates:{' '}
                    <strong className="underline">
                      "{allergyConflicts[0]?.patientAllergyRecord}"
                    </strong>
                    .
                  </p>
                  <p className="text-[11px] text-rose-800 mt-0.5">
                    Prescribed medication:{' '}
                    <strong>{allergyConflicts.map((c) => c.medicineName).join(', ')}</strong>.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-rose-200 space-y-2">
                <label className="flex items-start space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="w-4 h-4 text-rose-600 rounded mt-0.5 focus:ring-rose-500"
                  />
                  <span className="text-xs font-bold text-rose-950">
                    I acknowledge this potential allergy conflict and have clinically confirmed that the patient can safely receive this prescription.
                  </span>
                </label>

                {acknowledged && (
                  <div>
                    <label className="block text-[11px] font-bold text-rose-900 mb-1">
                      Clinical Override Justification *
                    </label>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Patient tolerated previously; Alternate drug unavailable; Skin test negative"
                      className="w-full text-xs border border-rose-300 rounded-lg p-2 focus:ring-rose-500 bg-white"
                      required
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center space-x-2 text-emerald-800 text-[11px]">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Zero allergy conflicts detected against patient's recorded allergies.
              </span>
            </div>
          )}

          {/* Legal Sign Confirmation Notice */}
          <div className="p-3 bg-slate-100/80 rounded-lg text-slate-600 text-[11px] space-y-1">
            <p className="font-semibold text-slate-800">Practitioner Digital Certification:</p>
            <p>
              By clicking "Sign Prescription", you certify that you have examined this patient and clinically evaluated all prescribed drugs, dosages, and contraindications.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isSubmitting || (hasConflict && (!acknowledged || !overrideReason.trim()))}
            onClick={handleSign}
            className="inline-flex items-center space-x-1.5 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-50"
          >
            <FileCheck className="w-4 h-4" />
            <span>{isSubmitting ? 'Signing...' : 'Sign & Certify Prescription'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionSignModal;
