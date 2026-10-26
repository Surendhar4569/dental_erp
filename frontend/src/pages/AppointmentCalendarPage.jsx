import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { appointmentService } from '../services/appointmentService';
import { scheduleService } from '../services/scheduleService';
import { PageHeader } from '../components/common/PageHeader';
import { BookAppointmentModal } from '../components/appointments/BookAppointmentModal';
import { PaymentCollectionModal } from '../components/appointments/PaymentCollectionModal';
import { PrintableReceiptModal } from '../components/appointments/PrintableReceiptModal';
import { RescheduleModal } from '../components/appointments/RescheduleModal';
import { CancelAppointmentModal } from '../components/appointments/CancelAppointmentModal';
import { toast } from 'react-toastify';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  RefreshCw,
  Eye,
  CreditCard,
  Printer,
  CalendarCheck,
  CalendarClock,
  XCircle,
  PlayCircle,
  Ticket,
  Activity,
  ListFilter,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';

const STATUS_CONFIG = {
  scheduled: { label: 'Scheduled', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  confirmed: { label: 'Confirmed', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-300' },
  checked_in: { label: 'Checked In', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300' },
  in_consultation: { label: 'In Consultation', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300' },
  completed: { label: 'Completed', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
  cancelled: { label: 'Cancelled', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300' },
  no_show: { label: 'No Show', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' },
};

export const AppointmentCalendarPage = () => {
  const { user } = useAuth();
  const { activeBranch } = useBranch();

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [viewType, setViewType] = useState('grid'); // 'grid' | 'table'

  // Doctors & Selection
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('all');

  // Appointments data
  const [appointments, setAppointments] = useState([]);
  const [doctorSlotsMap, setDoctorSlotsMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals state
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [preselectedSlotData, setPreselectedSlotData] = useState(null);

  const [activeAppointment, setActiveAppointment] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Search & Status filters (Table view)
  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 1. Load Branch Doctors
  useEffect(() => {
    if (activeBranch?.id) {
      scheduleService
        .getBranchDoctors(activeBranch.id)
        .then((res) => {
          setDoctors(res.doctors || []);
        })
        .catch(() => setDoctors([]));
    }
  }, [activeBranch?.id]);

  // 2. Load Appointments & Doctor Slots for selected date
  const loadData = useCallback(async () => {
    if (!activeBranch?.id) return;
    setIsLoading(true);
    try {
      // Fetch appointments for this branch on this date
      const apptRes = await appointmentService.getAppointments({
        date: selectedDate,
        doctorId: selectedDoctorId !== 'all' ? selectedDoctorId : undefined,
        limit: 100,
      });
      setAppointments(apptRes.appointments || []);

      // If in grid view, fetch slot availability for relevant doctors
      const targetDoctors =
        selectedDoctorId !== 'all'
          ? doctors.filter((d) => d.id === selectedDoctorId)
          : doctors;

      const slotsMap = {};
      await Promise.all(
        targetDoctors.map(async (doc) => {
          try {
            const availRes = await scheduleService.getDoctorAvailableSlots(
              activeBranch.id,
              doc.id,
              selectedDate
            );
            slotsMap[doc.id] = availRes.availability;
          } catch {
            slotsMap[doc.id] = null;
          }
        })
      );
      setDoctorSlotsMap(slotsMap);
    } catch (err) {
      toast.error('Failed to load appointments data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeBranch?.id, selectedDate, selectedDoctorId, doctors]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Date Navigator Helpers
  const handleShiftDate = (days) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + days);
    setSelectedDate(dateObj.toISOString().split('T')[0]);
  };

  const handleSetToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  // Actions
  const handleCheckIn = async (appointmentId) => {
    try {
      const res = await appointmentService.checkInAppointment(appointmentId);
      toast.success(`Patient checked in! Token #${res.visit?.token_display} issued.`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Check-in failed.');
    }
  };

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      await appointmentService.updateAppointmentStatus(appointmentId, newStatus);
      toast.success(`Appointment status updated to ${newStatus}.`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update status.');
    }
  };

  // Open book modal from slot click
  const handleSlotClick = (docId, slot) => {
    setPreselectedSlotData({
      doctorId: docId,
      date: selectedDate,
      slot,
    });
    setIsBookModalOpen(true);
  };

  // Filtered table appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        const patName = `${a.patient_first_name} ${a.patient_last_name}`.toLowerCase();
        const docName = `${a.doctor_first_name} ${a.doctor_last_name}`.toLowerCase();
        return (
          patName.includes(q) ||
          docName.includes(q) ||
          a.appointment_number?.toLowerCase().includes(q) ||
          a.patient_number?.toLowerCase().includes(q) ||
          a.patient_phone?.includes(q)
        );
      }
      return true;
    });
  }, [appointments, statusFilter, tableSearch]);

  const activeDoctorsList =
    selectedDoctorId !== 'all'
      ? doctors.filter((d) => d.id === selectedDoctorId)
      : doctors;

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        title="Appointment Scheduling & Calendar"
        subtitle={`Branch: ${activeBranch?.branch_name || 'Active Location'} | Concurrency-Safe Slot Engine`}
        breadcrumbs={[
          { label: 'Workspace', href: '#' },
          { label: 'Appointments' },
        ]}
      />

      {/* Control Navigation Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Date Navigator */}
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => handleShiftDate(-1)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSetToday}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
          >
            Today
          </button>

          <button
            type="button"
            onClick={() => handleShiftDate(1)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-200">
            <CalendarIcon className="w-4 h-4 text-teal-600 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-bold text-slate-800 border-none bg-transparent p-0 focus:ring-0 cursor-pointer"
            />
          </div>
        </div>

        {/* Doctor Filter & View Modes */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="text-xs rounded-lg border-slate-200 py-1.5 px-2 bg-slate-50 font-medium text-slate-700 focus:ring-teal-500"
            >
              <option value="all">All Doctors ({doctors.length})</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.first_name} {d.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setViewType('grid')}
              className={`p-1.5 rounded-md transition ${
                viewType === 'grid' ? 'bg-white text-teal-700 shadow-2xs font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Slot Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewType('table')}
              className={`p-1.5 rounded-md transition ${
                viewType === 'table' ? 'bg-white text-teal-700 shadow-2xs font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table List View"
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsRefreshing(true);
              loadData();
            }}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setPreselectedSlotData(null);
              setIsBookModalOpen(true);
            }}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Book Appointment</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {isLoading ? (
        <div className="py-20 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center text-slate-400">
          <Activity className="w-6 h-6 animate-spin text-teal-600 mb-2" />
          <span className="text-xs font-medium">Loading schedule slots & bookings...</span>
        </div>
      ) : viewType === 'grid' ? (
        /* GRID VIEW: By Doctor with Time Slots */
        <div className="space-y-4">
          {activeDoctorsList.length === 0 ? (
            <div className="py-12 bg-white rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
              No doctors assigned to this branch location.
            </div>
          ) : (
            activeDoctorsList.map((doc) => {
              const availability = doctorSlotsMap[doc.id];
              const docAppointments = appointments.filter(
                (a) => a.doctor_id === doc.id && a.status !== 'cancelled'
              );

              return (
                <div
                  key={doc.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                >
                  {/* Doctor Card Header */}
                  <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs">
                        {doc.first_name?.[0]}
                        {doc.last_name?.[0]}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 leading-tight">
                          Dr. {doc.first_name} {doc.last_name}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {doc.role_display || doc.role_name}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-xs">
                      {availability ? (
                        availability.isAvailable ? (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            {availability.availableSlotsCount} of {availability.totalSlots} Slots Free
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            {availability.reason || 'Unavailable'}
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] text-slate-400">Schedule not loaded</span>
                      )}

                      <span className="text-xs font-bold text-slate-700">
                        {docAppointments.length} Booked
                      </span>
                    </div>
                  </div>

                  {/* Slot Grid Body */}
                  <div className="p-4">
                    {availability && availability.slots?.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                        {availability.slots.map((slot, sIdx) => {
                          const bookedAppt = docAppointments.find(
                            (a) => a.start_time?.slice(0, 5) === slot.startTime
                          );

                          if (bookedAppt) {
                            const sc = STATUS_CONFIG[bookedAppt.status] || STATUS_CONFIG.scheduled;
                            const isPaid = bookedAppt.payment_status === 'paid';
                            const isPartial = bookedAppt.payment_status === 'partial';

                            return (
                              <div
                                key={sIdx}
                                onClick={() => setActiveAppointment(bookedAppt)}
                                className={`p-2 rounded-lg border ${sc.bg} ${sc.border} shadow-2xs cursor-pointer hover:shadow-md transition text-left flex flex-col justify-between`}
                              >
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold font-mono text-slate-700">
                                      {slot.startTime}
                                    </span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${sc.bg} ${sc.text}`}>
                                      {sc.label}
                                    </span>
                                  </div>

                                  <p className="text-xs font-bold text-slate-900 truncate">
                                    {bookedAppt.patient_first_name} {bookedAppt.patient_last_name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-mono">
                                    #{bookedAppt.patient_number}
                                  </p>
                                </div>

                                <div className="mt-2 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                                  {bookedAppt.visit_token_display ? (
                                    <span className="font-bold text-blue-700 font-mono">
                                      Token #{bookedAppt.visit_token_display}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 capitalize truncate">
                                      {bookedAppt.appointment_type}
                                    </span>
                                  )}

                                  <span
                                    className={`px-1 rounded text-[9px] font-bold ${
                                      isPaid
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : isPartial
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'DUE'}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          if (slot.isAvailable) {
                            return (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => handleSlotClick(doc.id, slot)}
                                className="p-2.5 rounded-lg border border-dashed border-teal-300 bg-teal-50/40 hover:bg-teal-100/60 hover:border-teal-400 text-teal-800 transition flex flex-col items-center justify-center space-y-1 group cursor-pointer"
                              >
                                <span className="text-xs font-bold font-mono text-teal-900 group-hover:scale-105 transition">
                                  {slot.startTime}
                                </span>
                                <span className="text-[10px] text-teal-600 font-medium inline-flex items-center space-x-0.5">
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>Book</span>
                                </span>
                              </button>
                            );
                          }

                          return (
                            <div
                              key={sIdx}
                              className="p-2 rounded-lg border border-slate-200 bg-slate-50 opacity-50 text-center flex flex-col justify-center cursor-not-allowed"
                            >
                              <span className="text-[10px] font-mono text-slate-400 line-through">
                                {slot.startTime}
                              </span>
                              <span className="text-[9px] text-slate-400 truncate">
                                {slot.reason || 'Unavailable'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-400 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        {availability?.reason || 'Doctor has no scheduled working hours for this date.'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* TABLE LIST VIEW */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          {/* Table Filters */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search patient, doctor, appointment #..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="text-xs rounded-lg border-slate-300 pl-8 pr-3 py-1.5 w-64 focus:border-teal-500 focus:ring-teal-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs rounded-lg border-slate-300 py-1.5 px-2.5 bg-white text-slate-700"
              >
                <option value="">All Statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked_in">Checked In</option>
                <option value="in_consultation">In Consultation</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredAppointments.length} appointment(s)
            </span>
          </div>

          {filteredAppointments.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No appointments found for the selected criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/75 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Appt No & Time</th>
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Practitioner</th>
                    <th className="py-2.5 px-3">Type & Reason</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Fee / Payment</th>
                    <th className="py-2.5 px-3 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredAppointments.map((appt) => {
                    const sc = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
                    const fee = parseFloat(appt.consultation_fee || appt.fee_amount || 0);
                    const paid = parseFloat(appt.amount_paid || 0);
                    const due = Math.max(0, fee - paid);

                    return (
                      <tr key={appt.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900 font-mono block">
                            {appt.appointment_number}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {appt.start_time?.slice(0, 5)} - {appt.end_time?.slice(0, 5)}
                          </span>
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900 block">
                            {appt.patient_first_name} {appt.patient_last_name}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            ID: {appt.patient_number} | {appt.patient_phone}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          Dr. {appt.doctor_first_name} {appt.doctor_last_name}
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="capitalize font-semibold text-slate-800 block">
                            {appt.appointment_type}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate max-w-xs block">
                            {appt.chief_complaint || 'No complaint notes'}
                          </span>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex flex-col space-y-1">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase w-fit ${sc.bg} ${sc.text} border ${sc.border}`}
                            >
                              {sc.label}
                            </span>
                            {appt.visit_token_display && (
                              <span className="text-[10px] text-blue-700 font-mono font-bold">
                                Token #{appt.visit_token_display}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900 block">₹{fee.toFixed(2)}</span>
                          <span
                            className={`text-[10px] font-bold ${
                              due === 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {due === 0 ? 'Fully Paid' : `Due: ₹${due.toFixed(2)}`}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-right space-x-1">
                          <button
                            type="button"
                            onClick={() => setActiveAppointment(appt)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                            title="Manage Appointment"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {appt.status !== 'cancelled' && appt.status !== 'completed' && (
                            <>
                              {appt.status !== 'checked_in' && appt.status !== 'in_consultation' && (
                                <button
                                  type="button"
                                  onClick={() => handleCheckIn(appt.id)}
                                  className="px-2 py-1 text-[11px] bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded transition"
                                >
                                  Check In
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setActiveAppointment(appt);
                                  setIsPaymentModalOpen(true);
                                }}
                                className="px-2 py-1 text-[11px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold rounded transition"
                              >
                                Pay
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Appointment Details / Action Modal */}
      {activeAppointment && !isPaymentModalOpen && !isRescheduleModalOpen && !isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Appointment #{activeAppointment.appointment_number}
                </h3>
                <span className="text-xs text-slate-500">
                  {activeAppointment.appointment_date} ({activeAppointment.start_time?.slice(0, 5)} - {activeAppointment.end_time?.slice(0, 5)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveAppointment(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Patient Card */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                  Patient Profile
                </span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">
                  {activeAppointment.patient_first_name} {activeAppointment.patient_last_name}
                </span>
                <span className="text-slate-600 block">
                  Numeric Patient ID: <strong className="font-mono">#{activeAppointment.patient_number}</strong> | Phone: {activeAppointment.patient_phone}
                </span>
              </div>

              {/* Status and Visit Token */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                    Doctor
                  </span>
                  <span className="text-xs font-semibold text-slate-800">
                    Dr. {activeAppointment.doctor_first_name} {activeAppointment.doctor_last_name}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                    Current Status
                  </span>
                  <span className="text-xs font-bold text-teal-700 capitalize">
                    {activeAppointment.status}
                  </span>
                  {activeAppointment.visit_token_display && (
                    <span className="text-[11px] text-blue-700 font-mono block font-bold">
                      Queue Token #{activeAppointment.visit_token_display}
                    </span>
                  )}
                </div>
              </div>

              {/* Billing Summary */}
              <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                    Consultation Fee
                  </span>
                  <span className="text-sm font-bold text-white">
                    ₹{parseFloat(activeAppointment.consultation_fee || activeAppointment.fee_amount || 0).toFixed(2)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">
                    Balance Outstanding
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      parseFloat(activeAppointment.consultation_fee || 0) <= parseFloat(activeAppointment.amount_paid || 0)
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    ₹{(
                      parseFloat(activeAppointment.consultation_fee || activeAppointment.fee_amount || 0) -
                      parseFloat(activeAppointment.amount_paid || 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Lifecycle Actions */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-700 block">Actions:</span>
                <div className="grid grid-cols-2 gap-2">
                  {activeAppointment.status !== 'checked_in' && activeAppointment.status !== 'in_consultation' && activeAppointment.status !== 'completed' && activeAppointment.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => {
                        handleCheckIn(activeAppointment.id);
                        setActiveAppointment(null);
                      }}
                      className="p-2 bg-blue-50 text-blue-800 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5"
                    >
                      <Ticket className="w-3.5 h-3.5 text-blue-600" />
                      <span>Check In (Token)</span>
                    </button>
                  )}

                  {activeAppointment.status === 'checked_in' && (
                    <button
                      type="button"
                      onClick={() => {
                        handleStatusChange(activeAppointment.id, 'in_consultation');
                        setActiveAppointment(null);
                      }}
                      className="p-2 bg-purple-50 text-purple-800 hover:bg-purple-100 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5"
                    >
                      <PlayCircle className="w-3.5 h-3.5 text-purple-600" />
                      <span>Start Consultation</span>
                    </button>
                  )}

                  {activeAppointment.status === 'in_consultation' && (
                    <button
                      type="button"
                      onClick={() => {
                        handleStatusChange(activeAppointment.id, 'completed');
                        setActiveAppointment(null);
                      }}
                      className="p-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Complete Consult</span>
                    </button>
                  )}

                  {activeAppointment.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="p-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5"
                    >
                      <IndianRupee className="w-3.5 h-3.5" />
                      <span>Collect Payment</span>
                    </button>
                  )}

                  {activeAppointment.status !== 'completed' && activeAppointment.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setIsRescheduleModalOpen(true)}
                      className="p-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5"
                    >
                      <CalendarClock className="w-3.5 h-3.5 text-slate-600" />
                      <span>Reschedule Slot</span>
                    </button>
                  )}

                  {activeAppointment.status !== 'completed' && activeAppointment.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setIsCancelModalOpen(true)}
                      className="p-2 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Cancel Slot</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveAppointment(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-md font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Appointment Modal */}
      <BookAppointmentModal
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        preselectedDoctorId={preselectedSlotData?.doctorId}
        preselectedDate={preselectedSlotData?.date}
        preselectedSlot={preselectedSlotData?.slot}
        onSuccess={() => loadData()}
      />

      {/* Payment Collection Modal */}
      <PaymentCollectionModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        appointment={activeAppointment}
        onPaymentSuccess={(receipt) => {
          loadData();
          setActiveReceipt(receipt);
          setIsReceiptModalOpen(true);
          setActiveAppointment(null);
        }}
      />

      {/* Printable Receipt Modal */}
      <PrintableReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setActiveReceipt(null);
        }}
        receipt={activeReceipt}
      />

      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
        appointment={activeAppointment}
        onSuccess={() => {
          loadData();
          setActiveAppointment(null);
        }}
      />

      {/* Cancel Modal */}
      <CancelAppointmentModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        appointment={activeAppointment}
        onSuccess={() => {
          loadData();
          setActiveAppointment(null);
        }}
      />
    </div>
  );
};
