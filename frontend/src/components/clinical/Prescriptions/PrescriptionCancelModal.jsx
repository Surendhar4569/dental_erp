import React, { useState } from 'react';
import { X, Ban, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import prescriptionService from '../../../services/prescriptionService';

export const PrescriptionCancelModal = ({ isOpen, onClose, prescription, onCancelled }) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !prescription) return null;

  const handleCancel = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.warn('Please provide a cancellation reason.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await prescriptionService.cancelPrescription(prescription.id, reason.trim());
      toast.success(`Prescription ${prescription.prescription_number} cancelled.`);
      if (onCancelled) onCancelled(res.prescription);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to cancel prescription.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="p-4 bg-rose-700 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Ban className="w-5 h-5 text-rose-200" />
            <h3 className="text-sm font-bold tracking-wide">
              Cancel Prescription — {prescription.prescription_number}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-rose-200 hover:text-white rounded-md transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCancel} className="p-6 space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px]">
              Cancelling this prescription will preserve its audit history but prevent it from being active, dispensed, or presented. A clinical reason is required.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Cancellation Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Treatment changed; Adverse drug reaction observed; Prescribed in error"
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PrescriptionCancelModal;
