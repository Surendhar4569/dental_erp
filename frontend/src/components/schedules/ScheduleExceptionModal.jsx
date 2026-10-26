import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { scheduleService } from '../../services/scheduleService';
import { toast } from 'react-toastify';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Activity,
  FileText,
  ShieldAlert,
} from 'lucide-react';

export const ScheduleExceptionModal = ({
  isOpen,
  onClose,
  branchId,
  doctorId,
  doctorName,
  onSaved,
}) => {
  const [formData, setFormData] = useState({
    exception_date: new Date().toISOString().split('T')[0],
    exception_type: 'leave', // 'leave' | 'holiday' | 'blocked' | 'custom_hours'
    is_partial: false,
    start_time: '',
    end_time: '',
    reason: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [conflicts, setConflicts] = useState([]);

  // Check conflicts whenever date or times change
  useEffect(() => {
    if (!isOpen || !branchId || !doctorId || !formData.exception_date) {
      setConflicts([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingConflicts(true);
      try {
        const payload = {
          exception: {
            exception_date: formData.exception_date,
            exception_type: formData.exception_type,
            start_time: formData.is_partial || formData.exception_type === 'custom_hours' ? formData.start_time : null,
            end_time: formData.is_partial || formData.exception_type === 'custom_hours' ? formData.end_time : null,
          },
        };
        const res = await scheduleService.checkScheduleConflicts(branchId, doctorId, payload);
        setConflicts(res.conflictingAppointments || []);
      } catch {
        // Silent catch for pre-flight check
      } finally {
        setIsCheckingConflicts(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    branchId,
    doctorId,
    formData.exception_date,
    formData.exception_type,
    formData.is_partial,
    formData.start_time,
    formData.end_time,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.reason.trim()) {
      toast.warn('Please provide a reason for the exception.');
      return;
    }

    if (formData.exception_type === 'custom_hours' || formData.is_partial) {
      if (!formData.start_time || !formData.end_time) {
        toast.warn('Start time and end time are required.');
        return;
      }
      if (formData.start_time >= formData.end_time) {
        toast.warn('Start time must be earlier than end_time.');
        return;
      }
    }

    if (conflicts.length > 0) {
      toast.error(
        `Cannot record exception: Doctor has ${conflicts.length} active appointment(s) during this period. Please cancel or reschedule them first.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        exception_date: formData.exception_date,
        exception_type: formData.exception_type,
        start_time: formData.is_partial || formData.exception_type === 'custom_hours' ? formData.start_time : null,
        end_time: formData.is_partial || formData.exception_type === 'custom_hours' ? formData.end_time : null,
        reason: formData.reason.trim(),
      };

      await scheduleService.createDoctorException(branchId, doctorId, payload);
      toast.success('Schedule exception recorded successfully!');
      onSaved();
      onClose();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.conflicts) {
        setConflicts(err.response.data.conflicts);
        toast.error(err.response.data.message || 'Conflicting appointments detected.');
      } else {
        toast.error(err.response?.data?.message || err.message || 'Failed to record exception.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Record Leave or Schedule Exception — ${doctorName}`}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-slate-500">
          Record full-day leave, partial absence, public holidays, emergency unavailability, or one-time custom hours.
        </p>

        {/* Exception Type */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Exception Category
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { id: 'leave', label: 'Doctor Leave' },
              { id: 'holiday', label: 'Public Holiday' },
              { id: 'blocked', label: 'Emergency Block' },
              { id: 'custom_hours', label: 'Custom Hours' },
            ].map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    exception_type: type.id,
                    is_partial: type.id === 'custom_hours' ? true : prev.is_partial,
                  }))
                }
                className={`py-2 px-3 text-center rounded-lg border font-semibold transition-all ${
                  formData.exception_type === type.id
                    ? 'border-teal-600 bg-teal-50 text-teal-900 shadow-2xs'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Exception Date
          </label>
          <input
            type="date"
            value={formData.exception_date}
            onChange={(e) => setFormData((prev) => ({ ...prev, exception_date: e.target.value }))}
            className="w-full text-xs font-medium border-slate-200 rounded-lg p-2 focus:ring-teal-500 focus:border-teal-500"
            required
          />
        </div>

        {/* Partial vs Full Day (unless custom_hours) */}
        {formData.exception_type !== 'custom_hours' && (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="is_partial"
              checked={formData.is_partial}
              onChange={(e) => setFormData((prev) => ({ ...prev, is_partial: e.target.checked }))}
              className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500"
            />
            <label htmlFor="is_partial" className="text-xs font-medium text-slate-700 cursor-pointer">
              Partial-day interval (specify start & end hours)
            </label>
          </div>
        )}

        {/* Start / End Times */}
        {(formData.is_partial || formData.exception_type === 'custom_hours') && (
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData((prev) => ({ ...prev, start_time: e.target.value }))}
                className="w-full text-xs border-slate-200 rounded-lg p-2 focus:ring-teal-500"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData((prev) => ({ ...prev, end_time: e.target.value }))}
                className="w-full text-xs border-slate-200 rounded-lg p-2 focus:ring-teal-500"
                required
              />
            </div>
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Reason / Notes <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={formData.reason}
            onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder="e.g. Annual Leave, Attending Dental Conference, Clinic Renovation, Urgent Medical Leave"
            rows={2}
            className="w-full text-xs border-slate-200 rounded-lg p-2.5 focus:ring-teal-500 focus:border-teal-500"
            required
          />
        </div>

        {/* Real-time Conflict Alert */}
        {isCheckingConflicts && (
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <Activity className="w-3.5 h-3.5 animate-spin text-teal-600" />
            <span>Verifying existing appointment conflicts...</span>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 text-rose-900 text-xs space-y-2">
            <div className="flex items-center space-x-2 font-bold text-rose-800">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>
                Active Appointment Conflict ({conflicts.length} affected)
              </span>
            </div>
            <p className="text-rose-700">
              This doctor already has booked appointments during this period. To preserve patient scheduling integrity,
              please reschedule or cancel these appointments before recording this exception.
            </p>
            <div className="max-h-32 overflow-y-auto divide-y divide-rose-200 bg-white/70 p-2 rounded-lg">
              {conflicts.map((c) => (
                <div key={c.appointmentId} className="py-1 flex items-center justify-between">
                  <span>
                    <strong>{c.appointmentNumber}</strong> — {c.patientName}
                  </span>
                  <span className="font-semibold text-slate-700">
                    {c.startTime} - {c.endTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || conflicts.length > 0}
            className={`px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-sm flex items-center space-x-1.5 ${
              conflicts.length > 0
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Recording...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Record Exception</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
