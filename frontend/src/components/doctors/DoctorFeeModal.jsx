import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { scheduleService } from '../../services/scheduleService';
import { toast } from 'react-toastify';
import {
  IndianRupee,
  ShieldCheck,
  Building2,
  Stethoscope,
  Info,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';

export const DoctorFeeModal = ({ isOpen, onClose, doctor, activeBranch, onSaved }) => {
  const [formData, setFormData] = useState({
    scope: 'branch', // 'branch' | 'clinic_standard'
    consultation_fee: '',
    followup_fee: '',
    emergency_fee: '',
    reason: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentFeeInfo, setCurrentFeeInfo] = useState(null);

  useEffect(() => {
    if (doctor?.user_id && activeBranch?.id && isOpen) {
      setIsLoading(true);
      scheduleService
        .getDoctorFee(activeBranch.id, doctor.user_id)
        .then((res) => {
          const fees = res.fees || {};
          setCurrentFeeInfo(fees);
          setFormData({
            scope: fees.source === 'doctor_clinic_default' ? 'clinic_standard' : 'branch',
            consultation_fee: fees.consultation_fee != null ? fees.consultation_fee : '',
            followup_fee: fees.followup_fee != null ? fees.followup_fee : '',
            emergency_fee: fees.emergency_fee != null ? fees.emergency_fee : '',
            reason: '',
          });
        })
        .catch((err) => {
          toast.error('Failed to load current doctor fees: ' + err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [doctor, activeBranch, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!doctor?.user_id) {
      toast.error('Cannot configure fees: Doctor has no associated login profile.');
      return;
    }

    const cFee = Number(formData.consultation_fee);
    const fFee = Number(formData.followup_fee);
    const eFee = Number(formData.emergency_fee);

    if (isNaN(cFee) || cFee < 0) {
      toast.error('General Consultation Fee must be a non-negative number.');
      return;
    }
    if (isNaN(fFee) || fFee < 0) {
      toast.error('Follow-up Fee must be a non-negative number.');
      return;
    }
    if (isNaN(eFee) || eFee < 0) {
      toast.error('Emergency Fee must be a non-negative number.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        scope: formData.scope,
        consultation_fee: cFee,
        followup_fee: fFee,
        emergency_fee: eFee,
        reason: formData.reason || 'Fee schedule updated by administrator',
      };

      await scheduleService.saveDoctorFee(activeBranch.id, doctor.user_id, payload);
      toast.success(`Consultation fees for ${doctor.full_name} saved successfully.`);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to save doctor fees.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configure Consultation Fees — ${doctor?.full_name || 'Doctor'}`}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Doctor Header Profile */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-800 text-sm">{doctor?.full_name}</span>
              {doctor?.staff_number && (
                <span className="font-mono text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {doctor.staff_number}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {doctor?.specialization || doctor?.designation || 'Consultant Specialist'}
              {doctor?.license_number ? ` • Reg: ${doctor.license_number}` : ''}
            </p>
            <div className="flex items-center space-x-1.5 text-xs text-slate-600 pt-0.5">
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              <span>Current Branch: <strong>{activeBranch?.branch_name || 'Authorized Branch'}</strong></span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Stethoscope className="w-5 h-5" />
          </div>
        </div>

        {/* Current Fee Resolution Status */}
        {currentFeeInfo && (
          currentFeeInfo.is_configured && currentFeeInfo.consultation_fee != null ? (
            <div className="p-3 rounded-lg bg-teal-50/60 border border-teal-200 text-xs flex items-center justify-between">
              <div>
                <span className="text-teal-900 font-bold block">Current Fee Precedence:</span>
                <span className="text-teal-700 font-mono text-[11px] capitalize">
                  Source: {currentFeeInfo.source?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-teal-800 uppercase tracking-wider font-semibold">Active Rate</span>
                <div className="text-base font-black text-teal-900">
                  ₹{Number(currentFeeInfo.consultation_fee).toFixed(2)}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs flex items-center space-x-2 text-rose-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>
                <strong>Consultation fee not configured for this doctor at this branch.</strong> Please specify the rates below.
              </span>
            </div>
          )
        )}

        {/* Scope Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Fee Configuration Scope
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex flex-col p-3 rounded-xl border text-xs cursor-pointer transition ${
                formData.scope === 'branch'
                  ? 'bg-teal-50/80 border-teal-400 text-teal-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold">
                <input
                  type="radio"
                  name="scope"
                  value="branch"
                  checked={formData.scope === 'branch'}
                  onChange={handleChange}
                  className="text-teal-600 focus:ring-teal-500"
                />
                <span>Branch-Specific Override</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 pl-5">
                Highest priority (Tier 1). Applies exclusively when appointments are booked at {activeBranch?.branch_name}.
              </span>
            </label>

            <label
              className={`flex flex-col p-3 rounded-xl border text-xs cursor-pointer transition ${
                formData.scope === 'clinic_standard'
                  ? 'bg-teal-50/80 border-teal-400 text-teal-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2 font-bold">
                <input
                  type="radio"
                  name="scope"
                  value="clinic_standard"
                  checked={formData.scope === 'clinic_standard'}
                  onChange={handleChange}
                  className="text-teal-600 focus:ring-teal-500"
                />
                <span>Doctor General Standard</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 pl-5">
                Clinic-wide default (Tier 2). Applies at all branches unless overridden.
              </span>
            </label>
          </div>
        </div>

        {/* Fee Matrix Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              General Consultation <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="text-slate-400 font-bold text-xs absolute left-3 top-1/2 -translate-y-1/2">₹</span>
              <input
                type="number"
                name="consultation_fee"
                step="0.01"
                min="0"
                required
                value={formData.consultation_fee}
                onChange={handleChange}
                placeholder="e.g. 500.00"
                className="w-full pl-7 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white font-mono font-bold text-slate-800"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Standard new visit</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Follow-up Consultation
            </label>
            <div className="relative">
              <span className="text-slate-400 font-bold text-xs absolute left-3 top-1/2 -translate-y-1/2">₹</span>
              <input
                type="number"
                name="followup_fee"
                step="0.01"
                min="0"
                value={formData.followup_fee}
                onChange={handleChange}
                placeholder="e.g. 300.00"
                className="w-full pl-7 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white font-mono font-bold text-slate-800"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Follow-up / review visit</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Emergency / Procedure
            </label>
            <div className="relative">
              <span className="text-slate-400 font-bold text-xs absolute left-3 top-1/2 -translate-y-1/2">₹</span>
              <input
                type="number"
                name="emergency_fee"
                step="0.01"
                min="0"
                value={formData.emergency_fee}
                onChange={handleChange}
                placeholder="e.g. 800.00"
                className="w-full pl-7 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white font-mono font-bold text-slate-800"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Specialty / emergency</span>
          </div>
        </div>

        {/* Change Reason / Audit Notes */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Reason for Adjustment / Audit Note
          </label>
          <div className="relative">
            <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              placeholder="e.g. Annual clinical fee revision or specialty override"
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Financial Immutability Notice */}
        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start space-x-2">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Financial Integrity Guaranteed:</strong> Updating fee rates only affects new appointments booked after saving. Existing bookings, billed consultations, and issued receipts retain their original snapshot amounts and will not be altered.
          </div>
        </div>

        {/* Modal Actions */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition disabled:opacity-50"
          >
            {isSubmitting ? 'Saving Fee Matrix...' : 'Save Fee Configuration'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
