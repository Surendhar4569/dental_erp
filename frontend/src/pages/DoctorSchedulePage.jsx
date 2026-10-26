import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { scheduleService } from '../services/scheduleService';
import { PageHeader } from '../components/common/PageHeader';
import { WeeklyScheduleModal } from '../components/schedules/WeeklyScheduleModal';
import { ScheduleExceptionModal } from '../components/schedules/ScheduleExceptionModal';
import { MultiDateScheduleModal } from '../components/schedules/MultiDateScheduleModal';
import { toast } from 'react-toastify';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Coffee,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ShieldAlert,
  CalendarCheck,
  CalendarDays,
  LayoutGrid,
  ListFilter,
  RefreshCw,
  Sun,
  Moon,
  Info,
} from 'lucide-react';

const DAYS_OF_WEEK = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
  { day: 6, label: 'Saturday' },
  { day: 0, label: 'Sunday' },
];

export const DoctorSchedulePage = () => {
  const { user } = useAuth();
  const { activeBranch } = useBranch();
  const canManageSchedules = ['admin', 'dentist', 'specialist'].includes(user?.role);

  // Doctors & Selection
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');

  // View & Date Navigation
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'week' | 'month' | 'template' | 'exceptions'
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Data states
  const [dayAvailability, setDayAvailability] = useState(null);
  const [rangeAvailability, setRangeAvailability] = useState([]);
  const [weeklySchedules, setWeeklySchedules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals state
  const [isWeeklyModalOpen, setIsWeeklyModalOpen] = useState(false);
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [isMultiDateModalOpen, setIsMultiDateModalOpen] = useState(false);

  // 1. Load Doctors assigned to active branch
  useEffect(() => {
    if (activeBranch?.id) {
      scheduleService
        .getBranchDoctors(activeBranch.id)
        .then((res) => {
          const docs = res.doctors || [];
          setDoctors(docs);
          if (docs.length > 0 && !selectedDoctorId) {
            setSelectedDoctorId(docs[0].id);
          }
        })
        .catch((err) => toast.error('Failed to load branch doctors: ' + err.message));
    }
  }, [activeBranch?.id]);

  // Compute Week Start (Monday) and Week End (Sunday)
  const weekRange = useMemo(() => {
    const cur = new Date(selectedDate);
    const day = cur.getDay(); // 0 = Sun, 1 = Mon ...
    const diffToMonday = cur.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(cur.setDate(diffToMonday));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
      startDate: monday.toISOString().split('T')[0],
      endDate: sunday.toISOString().split('T')[0],
    };
  }, [selectedDate]);

  // Compute Month Start and End
  const monthRange = useMemo(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1).toISOString().split('T')[0];
    const lastDay = new Date(y, m, 0).toISOString().split('T')[0];
    return {
      startDate: firstDay,
      endDate: lastDay,
    };
  }, [selectedDate]);

  // Load schedule data based on active view mode
  const loadScheduleData = useCallback(async () => {
    if (!activeBranch?.id || !selectedDoctorId) return;
    setIsLoading(true);
    try {
      // 1. Always fetch weekly templates & exceptions for reference
      const [schedRes, excRes] = await Promise.all([
        scheduleService.getDoctorWeeklySchedule(activeBranch.id, selectedDoctorId),
        scheduleService.getDoctorExceptions(activeBranch.id, selectedDoctorId),
      ]);
      setWeeklySchedules(schedRes.schedules || []);
      setExceptions(excRes.exceptions || []);

      // 2. Load View-specific availability data
      if (viewMode === 'day') {
        const [dayAvail, events] = await Promise.all([
          scheduleService.getDoctorAvailableSlots(activeBranch.id, selectedDoctorId, selectedDate),
          scheduleService.getDoctorCalendarEvents(
            activeBranch.id,
            selectedDoctorId,
            selectedDate,
            selectedDate
          ),
        ]);
        setDayAvailability(dayAvail.availability || dayAvail);
        setCalendarEvents(events);
      } else if (viewMode === 'week') {
        const rangeRes = await scheduleService.getDoctorAvailabilityRange(
          activeBranch.id,
          selectedDoctorId,
          weekRange.startDate,
          weekRange.endDate
        );
        setRangeAvailability(rangeRes.days || []);
      } else if (viewMode === 'month') {
        const rangeRes = await scheduleService.getDoctorAvailabilityRange(
          activeBranch.id,
          selectedDoctorId,
          monthRange.startDate,
          monthRange.endDate
        );
        setRangeAvailability(rangeRes.days || []);
      }
    } catch (err) {
      toast.error('Failed to load schedule data: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeBranch?.id, selectedDoctorId, selectedDate, viewMode, weekRange, monthRange]);

  useEffect(() => {
    if (selectedDoctorId) {
      loadScheduleData();
    }
  }, [selectedDoctorId, selectedDate, viewMode, loadScheduleData]);

  // Date navigation handlers
  const handleNavigate = (direction) => {
    const cur = new Date(selectedDate);
    if (viewMode === 'day') {
      cur.setDate(cur.getDate() + direction);
    } else if (viewMode === 'week') {
      cur.setDate(cur.getDate() + direction * 7);
    } else if (viewMode === 'month') {
      cur.setMonth(cur.getMonth() + direction);
    }
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const handleSetToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const handleDeleteException = async (exceptionId) => {
    if (!window.confirm('Are you sure you want to delete this schedule exception?')) return;
    try {
      await scheduleService.deleteDoctorException(activeBranch.id, exceptionId);
      toast.success('Schedule exception deleted successfully.');
      loadScheduleData();
    } catch (err) {
      toast.error('Failed to delete exception: ' + err.message);
    }
  };

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  // Formatted Date Label for Navigation Bar
  const dateHeading = useMemo(() => {
    const d = new Date(selectedDate);
    if (viewMode === 'day') {
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } else if (viewMode === 'week') {
      const s = new Date(weekRange.startDate);
      const e = new Date(weekRange.endDate);
      return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else if (viewMode === 'month') {
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return selectedDate;
  }, [selectedDate, viewMode, weekRange]);

  return (
    <div className="space-y-5 pb-16">
      {/* Page Header with Enterprise SaaS Styling */}
      <PageHeader
        title="Doctor Schedule Management"
        subtitle={`Branch: ${activeBranch?.branch_name || 'Active Location'} | Independent Capacity Engine`}
        breadcrumbs={[
          { label: 'Workspace', href: '#' },
          { label: 'Doctor Schedule' },
        ]}
      />

      {/* Practitioner Selection & Top Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Doctor Selector */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
            <User className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Practitioner Filter
            </span>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="text-sm font-bold text-slate-900 border-none bg-transparent p-0 focus:ring-0 cursor-pointer"
            >
              {doctors.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.first_name} {doc.last_name} ({doc.role_display || doc.role_name})
                  {doc.staff_number ? ` — ${doc.staff_number}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'day' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Day View
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'week' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Week View
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'month' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Month View
          </button>
          <button
            onClick={() => setViewMode('template')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'template' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Weekly Template
          </button>
          <button
            onClick={() => setViewMode('exceptions')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'exceptions' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'hover:text-slate-900'
            }`}
          >
            Leaves ({exceptions.length})
          </button>
        </div>

        {/* Action Buttons for Authorized Staff */}
        {canManageSchedules && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMultiDateModalOpen(true)}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-xl transition-all"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Multi-Date Shifts</span>
            </button>
            <button
              onClick={() => setIsExceptionModalOpen(true)}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-2 rounded-xl transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Leave / Exception</span>
            </button>
            <button
              onClick={() => setIsWeeklyModalOpen(true)}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 px-3.5 py-2 rounded-xl shadow-xs transition-all"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Configure Working Hours</span>
            </button>
          </div>
        )}

      </div>

      {/* Date Navigation & Status Legend Bar (for Day, Week, Month views) */}
      {['day', 'week', 'month'].includes(viewMode) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Navigation Controls */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <button
                onClick={() => handleNavigate(-1)}
                className="p-2 hover:bg-slate-50 text-slate-600"
                title="Previous period"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleSetToday}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 border-x border-slate-200"
              >
                Today
              </button>
              <button
                onClick={() => handleNavigate(1)}
                className="p-2 hover:bg-slate-50 text-slate-600"
                title="Next period"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <h2 className="text-base font-bold text-slate-900">{dateHeading}</h2>
          </div>

          {/* Visual Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-600"></span>
              Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-400"></span>
              Break
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500"></span>
              Leave / Blocked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-slate-300"></span>
              Past
            </span>
            <button
              onClick={() => {
                setIsRefreshing(true);
                loadScheduleData();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 ml-2"
              title="Refresh schedule"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Main View Display Area */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
          <Activity className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold">Loading schedule and slot capacity...</p>
        </div>
      ) : (
        <>
          {/* 1. DAY VIEW */}
          {viewMode === 'day' && dayAvailability && (
            <div className="space-y-5">
              {/* Day Capacity Header Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Working Status
                  </span>
                  <span
                    className={`text-base font-bold mt-1 inline-block ${
                      dayAvailability.isAvailable ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {dayAvailability.isAvailable ? 'Practicing Today' : 'Unavailable'}
                  </span>
                  {dayAvailability.reason && (
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{dayAvailability.reason}</p>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Slots
                  </span>
                  <span className="text-xl font-extrabold text-slate-900 mt-1 block">
                    {dayAvailability.totalSlots || 0}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {dayAvailability.slotDurationMinutes || 30}m duration + {dayAvailability.bufferMinutes || 0}m buffer
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Available Slots
                  </span>
                  <span className="text-xl font-extrabold text-emerald-600 mt-1 block">
                    {dayAvailability.availableSlotsCount || 0}
                  </span>
                  <span className="text-[11px] text-slate-500">Ready for booking</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Booked Appointments
                  </span>
                  <span className="text-xl font-extrabold text-blue-600 mt-1 block">
                    {(dayAvailability.slots || []).filter((s) => s.status === 'booked').length}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {dayAvailability.totalSlots > 0
                      ? `${Math.round(
                          (((dayAvailability.slots || []).filter((s) => s.status === 'booked').length) /
                            dayAvailability.totalSlots) *
                            100
                        )}% capacity utilization`
                      : '0% utilization'}
                  </span>
                </div>
              </div>

              {/* Slot Timeline Matrix */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-teal-600" />
                    <span>Appointment Slot & Working Period Matrix</span>
                  </h3>
                  <span className="text-xs text-slate-500">
                    {selectedDoctor?.first_name} {selectedDoctor?.last_name}
                  </span>
                </div>

                {(!dayAvailability.slots || dayAvailability.slots.length === 0) ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-600">
                      No schedule or slots available for this date.
                    </p>
                    <p className="text-xs text-slate-400">
                      {dayAvailability.reason || 'Doctor is not scheduled or has full-day leave.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
                    {dayAvailability.slots.map((slot, sIdx) => {
                      const isAvailable = slot.status === 'available';
                      const isBooked = slot.status === 'booked';
                      const isBreak = slot.status === 'break';
                      const isBlocked = slot.status === 'blocked';
                      const isPast = slot.status === 'past';

                      return (
                        <div
                          key={sIdx}
                          className={`p-3 rounded-xl border text-xs transition-all relative ${
                            isAvailable
                              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 hover:shadow-xs'
                              : isBooked
                              ? 'bg-blue-50/70 border-blue-300 text-blue-950'
                              : isBreak
                              ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                              : isBlocked
                              ? 'bg-rose-50/80 border-rose-300 text-rose-950'
                              : 'bg-slate-100 border-slate-200 text-slate-500 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold mb-1">
                            <span>{slot.startTime}</span>
                            <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                              {slot.status}
                            </span>
                          </div>

                          <div className="text-[11px] font-medium truncate">
                            {isAvailable && <span className="text-emerald-700">Available Slot</span>}
                            {isBooked && (
                              <span className="text-blue-800 font-semibold" title={slot.reason}>
                                {slot.reason}
                              </span>
                            )}
                            {isBreak && (
                              <span className="text-amber-800 flex items-center gap-1 font-semibold">
                                <Coffee className="w-3 h-3 text-amber-600" />
                                {slot.reason}
                              </span>
                            )}
                            {isBlocked && (
                              <span className="text-rose-800 font-semibold" title={slot.reason}>
                                {slot.reason}
                              </span>
                            )}
                            {isPast && <span>Past slot</span>}
                          </div>

                          <span className="text-[10px] text-slate-400 block mt-1">
                            {slot.sessionName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. WEEK VIEW */}
          {viewMode === 'week' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-teal-600" />
                  <span>Weekly Schedule & Capacity Overview</span>
                </h3>
                <span className="text-xs text-slate-500 font-medium">{dateHeading}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 gap-3 pt-2">
                {rangeAvailability.map((day) => {
                  const dayDate = new Date(day.date);
                  const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
                  const dateNum = dayDate.getDate();
                  const isToday = day.date === new Date().toISOString().split('T')[0];

                  return (
                    <div
                      key={day.date}
                      onClick={() => {
                        setSelectedDate(day.date);
                        setViewMode('day');
                      }}
                      className={`border rounded-xl p-3 text-xs cursor-pointer transition-all hover:shadow-xs flex flex-col justify-between min-h-48 ${
                        isToday
                          ? 'border-teal-500 ring-2 ring-teal-100 bg-white'
                          : day.isAvailable
                          ? 'border-slate-200 bg-white'
                          : 'border-slate-100 bg-slate-50/70'
                      }`}
                    >
                      <div>
                        {/* Day Column Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                          <span className="font-bold text-slate-900">
                            {dayName}{' '}
                            <span className="text-slate-400 font-normal">#{dateNum}</span>
                          </span>
                          {isToday && (
                            <span className="text-[9px] font-bold uppercase bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
                              Today
                            </span>
                          )}
                        </div>

                        {/* Status chip */}
                        {day.isAvailable ? (
                          <div className="space-y-1.5 mb-2">
                            <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Active Shift
                            </span>
                            <div className="text-[11px] text-slate-600 font-medium">
                              {day.availableSlotsCount} of {day.totalSlots} slots free
                            </div>
                            <div className="text-[11px] text-blue-600 font-semibold">
                              {day.bookedSlotsCount} booked
                            </div>
                            {day.breakSlotsCount > 0 && (
                              <div className="text-[10px] text-amber-700 font-semibold">
                                {day.breakSlotsCount} break slots
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1 my-2">
                            <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                              {day.reason ? 'Unavailable' : 'Day Off'}
                            </span>
                            <p className="text-[10px] text-slate-400 leading-tight">
                              {day.reason || 'No shifts scheduled'}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-teal-600 font-bold hover:underline pt-2 border-t border-slate-100">
                        View Slots →
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. MONTH VIEW */}
          {viewMode === 'month' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-teal-600" />
                  <span>Monthly Capacity Matrix</span>
                </h3>
                <span className="text-xs text-slate-500 font-semibold">{dateHeading}</span>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400 uppercase tracking-wider pb-1">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName) => (
                  <div key={dayName} className="py-1">
                    {dayName}
                  </div>
                ))}
              </div>

              {/* Month Days Grid */}
              <div className="grid grid-cols-7 gap-2">
                {rangeAvailability.map((day) => {
                  const dayDate = new Date(day.date);
                  const dateNum = dayDate.getDate();
                  const isToday = day.date === new Date().toISOString().split('T')[0];

                  return (
                    <div
                      key={day.date}
                      onClick={() => {
                        setSelectedDate(day.date);
                        setViewMode('day');
                      }}
                      className={`border rounded-xl p-2.5 min-h-24 text-xs cursor-pointer transition-all hover:border-teal-500 hover:shadow-xs flex flex-col justify-between ${
                        isToday
                          ? 'border-teal-500 bg-teal-50/30'
                          : day.isAvailable
                          ? 'border-slate-200 bg-white'
                          : 'border-slate-100 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-bold ${isToday ? 'text-teal-700' : 'text-slate-800'}`}>
                          {dateNum}
                        </span>
                        {day.isAvailable && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        )}
                      </div>

                      <div className="my-1">
                        {day.isAvailable ? (
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-semibold text-emerald-700 block">
                              {day.availableSlotsCount} free
                            </span>
                            {day.bookedSlotsCount > 0 && (
                              <span className="text-[10px] font-semibold text-blue-700 block">
                                {day.bookedSlotsCount} booked
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-400 block truncate">
                            {day.reason || 'Off'}
                          </span>
                        )}
                      </div>

                      <span className="text-[9px] text-slate-400 hover:text-teal-600 text-right">
                        Day →
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. WEEKLY TEMPLATE VIEW */}
          {viewMode === 'template' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Recurring Weekly Working Hours Template
                  </h3>
                  <p className="text-xs text-slate-500">
                    Defines the standard operational working hours, shifts, breaks, and slot durations for each day.
                  </p>
                </div>
                {canManageSchedules && (
                  <button
                    onClick={() => setIsWeeklyModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 px-3.5 py-2 rounded-xl shadow-xs"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Edit Working Hours</span>
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100">
                {DAYS_OF_WEEK.map(({ day, label }) => {
                  const s = weeklySchedules.find((item) => item.day_of_week === day);
                  const isActive = s ? s.is_active : day !== 0;
                  const sessions = s?.sessions || [];
                  const workingShifts = sessions.filter((sess) => !sess.is_break);
                  const breakPeriods = sessions.filter((sess) => sess.is_break);

                  return (
                    <div key={day} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="w-48">
                        <span className="text-sm font-bold text-slate-900 block">{label}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block mt-1 ${
                            isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isActive ? 'Working Day' : 'Day Off'}
                        </span>
                      </div>

                      {isActive ? (
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500">Shifts:</span>
                            {workingShifts.length > 0 ? (
                              workingShifts.map((shift, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800"
                                >
                                  {shift.session_name}: {shift.start_time} – {shift.end_time}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">No shifts configured</span>
                            )}
                          </div>

                          {breakPeriods.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-slate-500">Breaks:</span>
                              {breakPeriods.map((brk, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-1"
                                >
                                  <Coffee className="w-3 h-3 text-amber-600" />
                                  {brk.break_reason || brk.session_name}: {brk.start_time} – {brk.end_time}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex-1 text-xs text-slate-400 italic">No working hours scheduled.</div>
                      )}

                      {isActive && (
                        <div className="text-xs text-right text-slate-500 min-w-32">
                          <div>
                            <span className="font-semibold text-slate-700">{s?.slot_duration_minutes || 30}m</span>{' '}
                            slots
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700">{s?.buffer_minutes || 0}m</span> buffer
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. EXCEPTIONS & LEAVES ROSTER VIEW */}
          {viewMode === 'exceptions' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Scheduled Leaves & Operational Exceptions
                  </h3>
                  <p className="text-xs text-slate-500">
                    Recorded holidays, leaves, emergency blocks, and custom hour exceptions.
                  </p>
                </div>
                {canManageSchedules && (
                  <button
                    onClick={() => setIsExceptionModalOpen(true)}
                    className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 px-3.5 py-2 rounded-xl shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record Leave / Exception</span>
                  </button>
                )}
              </div>

              {exceptions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-600">No upcoming exceptions recorded.</p>
                  <p className="text-xs text-slate-400">Doctor is working according to the standard weekly schedule.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider font-bold">
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Category</th>
                        <th className="py-3 px-3">Time Period</th>
                        <th className="py-3 px-3">Reason / Description</th>
                        <th className="py-3 px-3">Recorded By</th>
                        {canManageSchedules && <th className="py-3 px-3 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {exceptions.map((exc) => (
                        <tr key={exc.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3 font-bold text-slate-900">{exc.exception_date}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                exc.exception_type === 'leave'
                                  ? 'bg-rose-100 text-rose-800'
                                  : exc.exception_type === 'holiday'
                                  ? 'bg-purple-100 text-purple-800'
                                  : exc.exception_type === 'blocked'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {exc.exception_type}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 font-medium">
                            {exc.start_time && exc.end_time
                              ? `${exc.start_time} – ${exc.end_time}`
                              : 'Entire Day'}
                          </td>
                          <td className="py-3 px-3 text-slate-800">{exc.reason}</td>
                          <td className="py-3 px-3 text-slate-500">
                            {exc.created_by_first_name
                              ? `${exc.created_by_first_name} ${exc.created_by_last_name || ''}`
                              : 'System'}
                          </td>
                          {canManageSchedules && (
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() => handleDeleteException(exc.id)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Remove exception"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Weekly Schedule Configuration Modal */}
      <WeeklyScheduleModal
        isOpen={isWeeklyModalOpen}
        onClose={() => setIsWeeklyModalOpen(false)}
        branchId={activeBranch?.id}
        doctorId={selectedDoctorId}
        doctorName={selectedDoctor ? `${selectedDoctor.first_name} ${selectedDoctor.last_name}` : ''}
        initialSchedules={weeklySchedules}
        onSaved={loadScheduleData}
      />

      {/* Schedule Exception Modal */}
      <ScheduleExceptionModal
        isOpen={isExceptionModalOpen}
        onClose={() => setIsExceptionModalOpen(false)}
        branchId={activeBranch?.id}
        doctorId={selectedDoctorId}
        doctorName={selectedDoctor ? `${selectedDoctor.first_name} ${selectedDoctor.last_name}` : ''}
        onSaved={loadScheduleData}
      />

      {/* Multi-Date Schedule Modal */}
      <MultiDateScheduleModal
        isOpen={isMultiDateModalOpen}
        onClose={() => setIsMultiDateModalOpen(false)}
        branchId={activeBranch?.id}
        doctorId={selectedDoctorId}
        doctorName={selectedDoctor ? `${selectedDoctor.first_name} ${selectedDoctor.last_name}` : ''}
        onSaved={loadScheduleData}
      />
    </div>
  );
};

