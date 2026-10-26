import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { appointmentService } from '../../services/appointmentService';
import { toast } from 'react-toastify';
import { AlertTriangle, XCircle, Activity } from 'lucide-react';

export const CancelAppointmentModal = ({ isOpen, onClose, appointment, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !appointment) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast.warn('Please provide a reason for cancellation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await appointmentService.cancelAppointment(appointment.id, reason.trim());
      toast.success(`Appointment #${appointment.appointment_number} cancelled.`);
      if (onSuccess) onSuccess(res.appointment);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to cancel appointment.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancel Appointment"
      subtitle={`Appointment #${appointment.appointment_number} — ${appointment.patient_first_name} ${appointment.patient_last_name}`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800 text-xs flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Release Slot Warning</span>
            <p className="mt-0.5 text-rose-700">
              Cancelling this appointment will immediately release the time slot ({appointment.appointment_date} {appointment.start_time?.slice(0, 5)}) and make it available for re-booking.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Reason for Cancellation *
          </label>
          <textarea
            rows="3"
            placeholder="e.g. Patient emergency, rescheduled to next week, no show..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-rose-500 focus:ring-rose-500"
            required
          />
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-medium"
          >
            Keep Appointment
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !reason.trim()}
            className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold transition disabled:opacity-50 flex items-center space-x-1.5"
          >
            {isSubmitting ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Cancelling...</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel Appointment</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
