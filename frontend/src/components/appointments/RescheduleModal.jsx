import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal';
import { scheduleService } from '../../services/scheduleService';
import { appointmentService } from '../../services/appointmentService';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'react-toastify';
import { Clock, Calendar, Activity, CheckCircle2, AlertCircle } from 'lucide-react';

export const RescheduleModal = ({ isOpen, onClose, appointment, onSuccess }) => {
  const { activeBranch } = useBranch();

  const [newDate, setNewDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState('Patient requested reschedule');
  const [slotsData, setSlotsData] = useState(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && appointment) {
      setNewDate(appointment.appointment_date || '');
      setSelectedSlot(null);
    }
  }, [isOpen, appointment]);

  const loadSlots = useCallback(async () => {
    if (!activeBranch?.id || !appointment?.doctor_id || !newDate) return;
    setIsLoadingSlots(true);
    try {
      const res = await scheduleService.getDoctorAvailableSlots(
        activeBranch.id,
        appointment.doctor_id,
        newDate,
        null,
        appointment?.id
      );
      setSlotsData(res.availability || null);
    } catch (err) {
      setSlotsData(null);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [activeBranch?.id, appointment?.doctor_id, appointment?.id, newDate]);

  useEffect(() => {
    if (isOpen && appointment) {
      loadSlots();
    }
  }, [isOpen, appointment, loadSlots]);

  if (!isOpen || !appointment) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedSlot) {
      toast.warn('Please select a new time slot.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        appointment_date: newDate,
        start_time: selectedSlot.startTime,
        end_time: selectedSlot.endTime,
        reason: reason.trim() || 'Patient requested reschedule',
      };

      const res = await appointmentService.rescheduleAppointment(appointment.id, payload);
      toast.success(`Appointment rescheduled to ${newDate} (${selectedSlot.startTime})`);
      if (onSuccess) onSuccess(res.appointment);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Rescheduling failed.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reschedule Appointment"
      subtitle={`Appointment #${appointment.appointment_number} — ${appointment.patient_first_name} ${appointment.patient_last_name}`}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current Details */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Current Booking</span>
            <span className="font-semibold text-slate-800">
              {appointment.appointment_date} ({appointment.start_time?.slice(0, 5)} - {appointment.end_time?.slice(0, 5)})
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Doctor</span>
            <span className="font-medium text-slate-700">Dr. {appointment.doctor_first_name} {appointment.doctor_last_name}</span>
          </div>
        </div>

        {/* Date Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            New Appointment Date *
          </label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => {
              setNewDate(e.target.value);
              setSelectedSlot(null);
            }}
            min={new Date().toISOString().split('T')[0]}
            className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
            required
          />
        </div>

        {/* Slot Grid */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Select New Available Slot *
          </label>
          {isLoadingSlots ? (
            <div className="py-4 flex items-center justify-center text-slate-400 space-x-2 bg-slate-50 rounded-lg border border-slate-200">
              <Activity className="w-4 h-4 animate-spin text-teal-600" />
              <span className="text-xs">Loading available slots...</span>
            </div>
          ) : slotsData && slotsData.slots?.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-50 rounded-lg border border-slate-200">
              {slotsData.slots.map((slot, idx) => {
                const isSelected =
                  selectedSlot &&
                  selectedSlot.startTime === slot.startTime &&
                  selectedSlot.endTime === slot.endTime;

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!slot.isAvailable}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-1 px-1.5 rounded text-[11px] font-medium text-center transition border ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-600'
                        : slot.isAvailable
                        ? 'bg-white hover:bg-teal-50 text-slate-800 border-slate-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                    }`}
                  >
                    {slot.startTime}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-3 text-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-slate-200">
              {slotsData?.reason || 'No available slots on this date.'}
            </div>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Reason for Rescheduling *
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
            required
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !selectedSlot}
            className="px-4 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold transition disabled:opacity-50 flex items-center space-x-1.5"
          >
            {isSubmitting ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Rescheduling...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Reschedule</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
