import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal';
import { scheduleService } from '../../services/scheduleService';
import { appointmentService } from '../../services/appointmentService';
import { patientService } from '../../services/patientService';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'react-toastify';
import {
  Calendar,
  Clock,
  User,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  FileText,
  Activity,
  ChevronRight,
} from 'lucide-react';

export const BookAppointmentModal = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedDoctorId = null,
  preselectedDate = null,
  preselectedSlot = null,
}) => {
  const { activeBranch } = useBranch();

  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(preselectedDoctorId || '');
  const [selectedDate, setSelectedDate] = useState(
    preselectedDate || new Date().toISOString().split('T')[0]
  );
  const [selectedSlot, setSelectedSlot] = useState(preselectedSlot || null);

  // Patient Mode: 'existing' or 'new'
  const [patientMode, setPatientMode] = useState('existing');
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);

  // New Patient Form
  const [newPatient, setNewPatient] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    gender: 'unspecified',
  });

  // Appointment details
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [doctorFees, setDoctorFees] = useState(null);

  // Slots
  const [slotsData, setSlotsData] = useState(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load doctors for active branch
  useEffect(() => {
    if (isOpen && activeBranch?.id) {
      scheduleService
        .getBranchDoctors(activeBranch.id)
        .then((res) => {
          setDoctors(res.doctors || []);
          if (!selectedDoctorId && res.doctors?.length > 0) {
            setSelectedDoctorId(preselectedDoctorId || res.doctors[0].id);
          }
        })
        .catch((err) => toast.error('Failed to load doctors: ' + err.message));
    }
  }, [isOpen, activeBranch?.id]);

  // Load fees when doctor changes
  useEffect(() => {
    if (activeBranch?.id && selectedDoctorId) {
      scheduleService
        .getDoctorFee(activeBranch.id, selectedDoctorId)
        .then((res) => setDoctorFees(res.fees))
        .catch(() => setDoctorFees(null));
    }
  }, [activeBranch?.id, selectedDoctorId]);

  // Load slot availability
  const loadSlots = useCallback(async () => {
    if (!activeBranch?.id || !selectedDoctorId || !selectedDate) return;
    setIsLoadingSlots(true);
    try {
      const res = await scheduleService.getDoctorAvailableSlots(
        activeBranch.id,
        selectedDoctorId,
        selectedDate
      );
      setSlotsData(res.availability || null);
    } catch (err) {
      setSlotsData(null);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [activeBranch?.id, selectedDoctorId, selectedDate]);

  useEffect(() => {
    if (isOpen) {
      loadSlots();
    }
  }, [isOpen, loadSlots]);

  // Patient search debounce
  useEffect(() => {
    if (patientMode !== 'existing' || !patientSearch.trim()) {
      setPatientResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingPatient(true);
      try {
        const res = await patientService.getPatients({
          search: patientSearch.trim(),
          limit: 5,
        });
        setPatientResults(res.patients || []);
      } catch {
        setPatientResults([]);
      } finally {
        setIsSearchingPatient(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [patientSearch, patientMode]);

  // Preview fee to snapshot
  const isFeeConfigured = Boolean(doctorFees?.is_configured && doctorFees?.consultation_fee != null);
  const activeFeeAmount = isFeeConfigured
    ? appointmentType === 'emergency'
      ? (doctorFees.emergency_fee != null ? doctorFees.emergency_fee : doctorFees.consultation_fee)
      : appointmentType === 'followup'
      ? (doctorFees.followup_fee != null ? doctorFees.followup_fee : doctorFees.consultation_fee)
      : doctorFees.consultation_fee
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedDoctorId) {
      toast.warn('Please select a doctor.');
      return;
    }

    if (!isFeeConfigured || activeFeeAmount == null) {
      toast.error('Consultation fee not configured for this doctor at this branch.');
      return;
    }

    if (patientMode === 'existing' && !selectedPatient) {
      toast.warn('Please select a registered patient.');
      return;
    }

    if (patientMode === 'new') {
      if (!newPatient.first_name.trim() || !newPatient.last_name.trim()) {
        toast.warn('Please provide first and last name for the new patient.');
        return;
      }
      if (!newPatient.phone.trim()) {
        toast.warn('Please provide a mobile phone number.');
        return;
      }
    }

    if (!selectedSlot) {
      toast.warn('Please choose an available time slot.');
      return;
    }

    const payload = {
      doctor_id: selectedDoctorId,
      appointment_date: selectedDate,
      start_time: selectedSlot.startTime,
      end_time: selectedSlot.endTime,
      appointment_type: appointmentType,
      chief_complaint: chiefComplaint.trim() || null,
      ...(patientMode === 'existing'
        ? { patient_id: selectedPatient.id }
        : { new_patient: newPatient }),
    };

    setIsSubmitting(true);
    try {
      const res = await appointmentService.createAppointment(payload);
      toast.success(`Appointment ${res.appointment?.appointment_number} booked successfully!`);
      if (onSuccess) onSuccess(res.appointment);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to book appointment.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Book Patient Appointment"
      subtitle={`Location: ${activeBranch?.branch_name || 'Active Branch'}`}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Doctor & Date Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Practitioner / Dentist *
            </label>
            <select
              value={selectedDoctorId}
              onChange={(e) => {
                setSelectedDoctorId(e.target.value);
                setSelectedSlot(null);
              }}
              className="w-full text-xs rounded-md border-slate-300 shadow-2xs focus:border-teal-500 focus:ring-teal-500 bg-white py-1.5 px-2.5"
              required
            >
              {doctors.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.first_name} {doc.last_name} ({doc.role_display || doc.role_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Appointment Date *
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedSlot(null);
              }}
              min={new Date().toISOString().split('T')[0]}
              className="w-full text-xs rounded-md border-slate-300 shadow-2xs focus:border-teal-500 focus:ring-teal-500 bg-white py-1.5 px-2.5"
              required
            />
          </div>
        </div>

        {/* 2. Slot Availability Picker */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-800 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              <span>Available Time Slots</span>
            </label>
            {slotsData && (
              <span className="text-[11px] text-slate-500 font-medium">
                {slotsData.availableSlotsCount} of {slotsData.totalSlots} slots free
              </span>
            )}
          </div>

          {isLoadingSlots ? (
            <div className="py-6 flex items-center justify-center text-slate-400 space-x-2 bg-slate-50 rounded-lg border border-slate-200">
              <Activity className="w-4 h-4 animate-spin text-teal-600" />
              <span className="text-xs">Computing schedule slots...</span>
            </div>
          ) : slotsData && !slotsData.isAvailable ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{slotsData.reason || 'Doctor is not available on this date.'}</span>
            </div>
          ) : slotsData && slotsData.slots?.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-50 rounded-lg border border-slate-200">
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
                        ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                        : slot.isAvailable
                        ? 'bg-white hover:bg-teal-50 text-slate-800 border-slate-200 hover:border-teal-300'
                        : slot.status === 'booked'
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                        : 'bg-rose-50 text-rose-400 border-rose-200 cursor-not-allowed'
                    }`}
                    title={slot.reason || slot.startTime}
                  >
                    {slot.startTime}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-slate-200">
              No configured sessions for this day.
            </div>
          )}
        </div>

        {/* 3. Patient Selection / Quick Registration */}
        <div className="border border-slate-200 rounded-lg p-3 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-800 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-slate-600" />
              <span>Patient Information *</span>
            </span>

            <div className="flex bg-slate-100 p-0.5 rounded-md text-[11px]">
              <button
                type="button"
                onClick={() => setPatientMode('existing')}
                className={`px-2.5 py-0.5 rounded font-medium transition ${
                  patientMode === 'existing' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Search Existing
              </button>
              <button
                type="button"
                onClick={() => setPatientMode('new')}
                className={`px-2.5 py-0.5 rounded font-medium transition ${
                  patientMode === 'new' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                + Quick Register
              </button>
            </div>
          </div>

          {patientMode === 'existing' ? (
            <div className="space-y-2">
              {selectedPatient ? (
                <div className="flex items-center justify-between bg-teal-50 border border-teal-200 p-2 rounded-md">
                  <div>
                    <span className="text-xs font-bold text-teal-900">
                      {selectedPatient.first_name} {selectedPatient.last_name}
                    </span>
                    <span className="ml-2 text-[11px] text-teal-700 font-mono">
                      (ID: {selectedPatient.patient_number})
                    </span>
                    <p className="text-[11px] text-teal-600">Phone: {selectedPatient.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setPatientSearch('');
                    }}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="Type Patient Name, Mobile Number, or Patient ID..."
                      className="w-full text-xs rounded-md border-slate-300 pl-8 pr-3 py-1.5 focus:border-teal-500 focus:ring-teal-500"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>

                  {patientResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-20 overflow-hidden divide-y divide-slate-100">
                      {patientResults.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatientResults([]);
                          }}
                          className="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition"
                        >
                          <div>
                            <span className="text-xs font-semibold text-slate-900">
                              {p.first_name} {p.last_name}
                            </span>
                            <span className="ml-2 text-[10px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono">
                              #{p.patient_number}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">{p.phone}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                placeholder="First Name *"
                value={newPatient.first_name}
                onChange={(e) => setNewPatient({ ...newPatient, first_name: e.target.value })}
                className="text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
                required
              />
              <input
                type="text"
                placeholder="Last Name *"
                value={newPatient.last_name}
                onChange={(e) => setNewPatient({ ...newPatient, last_name: e.target.value })}
                className="text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
                required
              />
              <input
                type="tel"
                placeholder="Mobile Phone *"
                value={newPatient.phone}
                onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                className="text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
                required
              />
              <select
                value={newPatient.gender}
                onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                className="text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500 bg-white"
              >
                <option value="unspecified">Gender (Opt)</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
        </div>

        {/* 4. Type & Complaint */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Appointment Type
            </label>
            <select
              value={appointmentType}
              onChange={(e) => setAppointmentType(e.target.value)}
              className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 bg-white focus:border-teal-500 focus:ring-teal-500"
            >
              <option value="consultation">
                Standard Consultation {isFeeConfigured ? `(₹${Number(doctorFees.consultation_fee).toFixed(2)})` : '(Fee not configured)'}
              </option>
              <option value="followup">
                Follow-up Visit {isFeeConfigured && doctorFees.followup_fee != null ? `(₹${Number(doctorFees.followup_fee).toFixed(2)})` : ''}
              </option>
              <option value="procedure">
                Dental Procedure {isFeeConfigured ? `(₹${Number(doctorFees.consultation_fee).toFixed(2)})` : ''}
              </option>
              <option value="emergency">
                Emergency {isFeeConfigured && doctorFees.emergency_fee != null ? `(₹${Number(doctorFees.emergency_fee).toFixed(2)})` : ''}
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Chief Complaint / Reason
            </label>
            <input
              type="text"
              placeholder="e.g. Toothache, Scaling, Root Canal checkup..."
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Unconfigured Fee Warning Banner */}
        {!isFeeConfigured && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>
              <strong>Notice:</strong> Consultation fee not configured for this doctor at this branch. Booking is disabled until the doctor's fee schedule is configured.
            </span>
          </div>
        )}

        {/* 5. Summary & Fee Preview */}
        <div className="bg-slate-900 text-white rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <IndianRupee className="w-5 h-5 text-teal-400" />
            <div>
              <span className="text-[11px] text-slate-400 block uppercase tracking-wider font-semibold">
                Consultation Fee Snapshot
              </span>
              {isFeeConfigured ? (
                <div className="flex items-baseline space-x-2">
                  <span className="text-base font-bold text-white">
                    ₹{parseFloat(activeFeeAmount).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono capitalize">
                    ({doctorFees.source?.replace(/_/g, ' ')})
                  </span>
                </div>
              ) : (
                <span className="text-sm font-bold text-rose-400">
                  Fee Not Configured
                </span>
              )}
            </div>
          </div>

          <div className="text-right text-[11px] text-slate-300">
            {selectedSlot ? (
              <span className="text-teal-400 font-semibold">
                Slot: {selectedSlot.startTime} - {selectedSlot.endTime}
              </span>
            ) : (
              <span className="text-amber-400">Please choose a slot</span>
            )}
          </div>
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
            disabled={isSubmitting || !selectedSlot || !isFeeConfigured}
            className="px-4 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold transition disabled:opacity-50 flex items-center space-x-1.5"
          >
            {isSubmitting ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Securing Slot...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Booking</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
