import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal } from '../common/Modal';
import { scheduleService } from '../../services/scheduleService';
import { holidayService } from '../../services/holidayService';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'react-toastify';
import {
  Calendar,
  CalendarDays,
  Clock,
  Plus,
  Trash2,
  AlertTriangle,
  Coffee,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Info,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  Armchair,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

const SLOT_DURATIONS = [15, 30, 45, 60];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MultiDateScheduleModal = ({
  isOpen,
  onClose,
  branchId,
  doctorId,
  doctorName,
  onSaved,
}) => {
  const { activeBranch } = useBranch();
  const effectiveBranchId = branchId || activeBranch?.id;
  const branchDisplayName = activeBranch?.branch_name || activeBranch?.name || 'Current Branch';

  // Modal Step: 'dates' | 'sessions' | 'preview'
  const [currentStep, setCurrentStep] = useState('dates');

  // Interactive Calendar State for Date Selection
  const today = new Date();
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());

  // Dates state: exact user-selected order preserved without sorting
  const [selectedDates, setSelectedDates] = useState([]);

  // Manual Quick Range & Single Input
  const [singleDateInput, setSingleDateInput] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeDays, setRangeDays] = useState({
    1: true, // Mon
    2: true, // Tue
    3: true, // Wed
    4: true, // Thu
    5: true, // Fri
    6: true, // Sat
    0: false, // Sun
  });

  // Scheduling Configurations
  const [mode, setMode] = useState('uniform'); // 'uniform' | 'custom'
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [chairId, setChairId] = useState('');
  const [sessions, setSessions] = useState([
    { session_name: 'Morning Session', start_time: '09:00', end_time: '13:00', is_break: false },
    { session_name: 'Lunch Break', start_time: '13:00', end_time: '14:00', is_break: true, break_reason: 'Lunch Break' },
    { session_name: 'Evening Session', start_time: '16:00', end_time: '20:00', is_break: false },
  ]);

  // Per-date custom configurations (if mode === 'custom')
  const [customConfigs, setCustomConfigs] = useState({});
  const [activeCustomDate, setActiveCustomDate] = useState('');

  // Dental Chairs for active branch
  const [chairs, setChairs] = useState([]);

  // Holidays for active branch/clinic
  const [holidays, setHolidays] = useState([]);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(false);

  // Closed Holiday Override State
  const [isWorkingOverride, setIsWorkingOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  // Conflicts & Validation State
  const [conflicts, setConflicts] = useState([]);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 1. Reset state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('dates');
      setSelectedDates([]);
      setSingleDateInput('');
      setRangeStart('');
      setRangeEnd('');
      setConflicts([]);
      setIsWorkingOverride(false);
      setOverrideReason('');
      setCustomConfigs({});
      setActiveCustomDate('');
      setCalendarMonth(new Date().getMonth());
      setCalendarYear(new Date().getFullYear());

      // Fetch chairs for this branch
      if (effectiveBranchId) {
        scheduleService
          .getBranchChairs(effectiveBranchId)
          .then((res) => setChairs(res.chairs || res || []))
          .catch(() => setChairs([]));
      }

      // Fetch authoritative holidays
      if (effectiveBranchId) {
        setIsLoadingHolidays(true);
        holidayService
          .getHolidays({ branchId: effectiveBranchId, activeOnly: true })
          .then((res) => setHolidays(res.holidays || []))
          .catch(() => setHolidays([]))
          .finally(() => setIsLoadingHolidays(false));
      }
    }
  }, [isOpen, effectiveBranchId]);

  // Index holidays by YYYY-MM-DD
  const holidayMap = useMemo(() => {
    const map = {};
    for (const h of holidays) {
      const d = h.holiday_date_str || (h.holiday_date ? h.holiday_date.substring(0, 10) : null);
      if (d) {
        if (!map[d]) map[d] = [];
        map[d].push(h);
      }
    }
    return map;
  }, [holidays]);

  // Identify closed holidays matching current user selection
  const closedHolidaysInSelection = useMemo(() => {
    const matched = [];
    selectedDates.forEach((d) => {
      const list = holidayMap[d] || [];
      const closed = list.find((h) => h.is_closed);
      if (closed) {
        matched.push({ date: d, holiday: closed });
      }
    });
    return matched;
  }, [selectedDates, holidayMap]);

  // 2. Interactive Calendar Date Click (Toggle Selection in exact user order)
  const handleToggleDate = (dateStr) => {
    setSelectedDates((prev) => {
      if (prev.includes(dateStr)) {
        return prev.filter((d) => d !== dateStr);
      } else {
        // Append in the user's clicked order without sorting!
        return [...prev, dateStr];
      }
    });
  };

  // Add individual date manually
  const handleAddSingleDate = () => {
    if (!singleDateInput) return;
    if (selectedDates.includes(singleDateInput)) {
      toast.info('Date is already selected.');
      return;
    }
    setSelectedDates((prev) => [...prev, singleDateInput]);
    setSingleDateInput('');
  };

  // Add date range (appends newly matched dates in order)
  const handleAddRange = () => {
    if (!rangeStart || !rangeEnd) {
      toast.error('Please select both start and end dates.');
      return;
    }
    if (rangeStart > rangeEnd) {
      toast.error('Start date cannot be after end date.');
      return;
    }

    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    const curr = new Date(start);
    const newItems = [];

    while (curr <= end) {
      const day = curr.getDay();
      const dStr = curr.toISOString().split('T')[0];
      if (rangeDays[day] && !selectedDates.includes(dStr) && !newItems.includes(dStr)) {
        newItems.push(dStr);
      }
      curr.setDate(curr.getDate() + 1);
    }

    if (newItems.length === 0) {
      toast.info('No new matching dates in the specified range.');
      return;
    }

    setSelectedDates((prev) => [...prev, ...newItems]);
    toast.success(`Added ${newItems.length} date(s).`);
  };

  // Remove individual date from selection
  const handleRemoveDate = (dateToRemove) => {
    setSelectedDates((prev) => prev.filter((d) => d !== dateToRemove));
  };

  // Clear all dates
  const handleClearAllDates = () => {
    setSelectedDates([]);
  };

  // Session Management Handlers
  const handleAddSession = (isBreak = false) => {
    const currentSessions = mode === 'custom' && activeCustomDate
      ? customConfigs[activeCustomDate]?.sessions || sessions
      : sessions;

    const newOrder = currentSessions.length + 1;
    const newSession = {
      session_name: isBreak ? `Break ${newOrder}` : `Session ${newOrder}`,
      start_time: '14:00',
      end_time: '15:00',
      is_break: isBreak,
      break_reason: isBreak ? 'Break' : '',
    };

    if (mode === 'custom' && activeCustomDate) {
      setCustomConfigs((prev) => ({
        ...prev,
        [activeCustomDate]: {
          ...(prev[activeCustomDate] || { slot_duration_minutes: slotDuration, buffer_minutes: bufferMinutes, chair_id: chairId }),
          sessions: [...currentSessions, newSession],
        },
      }));
    } else {
      setSessions((prev) => [...prev, newSession]);
    }
  };

  const handleUpdateSession = (index, field, value) => {
    if (mode === 'custom' && activeCustomDate) {
      const curSessions = customConfigs[activeCustomDate]?.sessions || [...sessions];
      const updated = curSessions.map((s, idx) => (idx === index ? { ...s, [field]: value } : s));
      setCustomConfigs((prev) => ({
        ...prev,
        [activeCustomDate]: {
          ...(prev[activeCustomDate] || { slot_duration_minutes: slotDuration, buffer_minutes: bufferMinutes, chair_id: chairId }),
          sessions: updated,
        },
      }));
    } else {
      setSessions((prev) =>
        prev.map((s, idx) => (idx === index ? { ...s, [field]: value } : s))
      );
    }
  };

  const handleRemoveSession = (index) => {
    if (mode === 'custom' && activeCustomDate) {
      const curSessions = customConfigs[activeCustomDate]?.sessions || [...sessions];
      const updated = curSessions.filter((_, idx) => idx !== index);
      setCustomConfigs((prev) => ({
        ...prev,
        [activeCustomDate]: {
          ...(prev[activeCustomDate] || { slot_duration_minutes: slotDuration, buffer_minutes: bufferMinutes, chair_id: chairId }),
          sessions: updated,
        },
      }));
    } else {
      setSessions((prev) => prev.filter((_, idx) => idx !== index));
    }
  };

  // Active Sessions depending on mode
  const effectiveSessions = useMemo(() => {
    if (mode === 'custom' && activeCustomDate && customConfigs[activeCustomDate]?.sessions) {
      return customConfigs[activeCustomDate].sessions;
    }
    return sessions;
  }, [mode, activeCustomDate, customConfigs, sessions]);

  // Validate sessions: start < end, no overlapping working sessions, breaks valid
  const validateSessionTiming = (sessionList) => {
    const working = [];
    const breaks = [];

    for (let i = 0; i < sessionList.length; i++) {
      const s = sessionList[i];
      if (!s.start_time || !s.end_time) {
        return `Session #${i + 1} has invalid time inputs.`;
      }
      if (s.start_time >= s.end_time) {
        return `Session "${s.session_name}": Start time (${s.start_time}) must be earlier than end time (${s.end_time}).`;
      }
      if (s.is_break && !s.break_reason?.trim()) {
        return `Break "${s.session_name}" requires a valid break reason.`;
      }
      if (s.is_break) breaks.push(s);
      else working.push(s);
    }

    // Check working session overlaps
    working.sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let i = 0; i < working.length - 1; i++) {
      if (working[i].end_time > working[i + 1].start_time) {
        return `Working sessions "${working[i].session_name}" and "${working[i + 1].session_name}" overlap in time.`;
      }
    }

    return null;
  };

  // Preview slot calculation
  const calculatedSlots = useMemo(() => {
    const working = effectiveSessions.filter((s) => !s.is_break);
    const breaks = effectiveSessions.filter((s) => s.is_break);
    const slots = [];
    const step = slotDuration + bufferMinutes;

    const timeToMin = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const minToTime = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    for (const w of working) {
      let curr = timeToMin(w.start_time);
      const end = timeToMin(w.end_time);

      while (curr + slotDuration <= end) {
        const slotEnd = curr + slotDuration;
        const overlapsBreak = breaks.some(
          (b) => curr < timeToMin(b.end_time) && slotEnd > timeToMin(b.start_time)
        );

        slots.push({
          time: `${minToTime(curr)} - ${minToTime(slotEnd)}`,
          status: overlapsBreak ? 'break' : 'available',
          session: w.session_name,
        });

        curr += step;
      }
    }

    return slots;
  }, [effectiveSessions, slotDuration, bufferMinutes]);

  // Pre-flight Conflict Check
  const handleCheckConflicts = async () => {
    if (selectedDates.length === 0) {
      toast.error('Please select at least one date.');
      return false;
    }

    const timingError = validateSessionTiming(effectiveSessions);
    if (timingError) {
      toast.error(timingError);
      return false;
    }

    setIsCheckingConflicts(true);
    setConflicts([]);

    try {
      const res = await scheduleService.checkScheduleConflicts(effectiveBranchId, doctorId, {
        multiDate: {
          dates: selectedDates,
          mode,
          sessions: effectiveSessions,
          date_configs: customConfigs,
        },
      });

      if (res.conflictCount > 0) {
        setConflicts(res.conflictingAppointments || []);
        toast.warning(
          `Conflict detected with ${res.conflictCount} active appointment(s). Review below before saving.`
        );
        return false;
      } else {
        toast.success('No active appointment conflicts detected across branches.');
        return true;
      }
    } catch (err) {
      toast.error('Conflict check failed: ' + (err.response?.data?.message || err.message));
      return false;
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  // Proceed to Next Step
  const handleProceedToSessions = () => {
    if (selectedDates.length === 0) {
      toast.error('Please select at least one date.');
      return;
    }
    if (closedHolidaysInSelection.length > 0 && !isWorkingOverride) {
      toast.warning('Selected dates include closed holidays. Please review the holiday override banner.');
    }
    setCurrentStep('sessions');
  };

  const handleProceedToPreview = async () => {
    const timingError = validateSessionTiming(effectiveSessions);
    if (timingError) {
      toast.error(timingError);
      return;
    }

    // Check closed holidays override requirement
    if (closedHolidaysInSelection.length > 0) {
      if (!isWorkingOverride) {
        toast.error('Selected dates contain closed holidays. You must enable Special Working Day Override.');
        return;
      }
      if (!overrideReason.trim()) {
        toast.error('Please enter a reason for the holiday override.');
        return;
      }
    }

    // Run pre-flight conflict check automatically
    await handleCheckConflicts();
    setCurrentStep('preview');
  };

  // Transactional Save Multi-Date Schedules
  const handleSaveSchedules = async () => {
    if (selectedDates.length === 0) {
      toast.error('No dates selected.');
      return;
    }

    if (closedHolidaysInSelection.length > 0 && (!isWorkingOverride || !overrideReason.trim())) {
      toast.error('Special working override and reason are mandatory for closed holidays.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        dates: selectedDates,
        mode,
        slot_duration_minutes: slotDuration,
        buffer_minutes: bufferMinutes,
        chair_id: chairId || null,
        sessions: effectiveSessions,
        is_working_override: isWorkingOverride,
        override_reason: overrideReason.trim() || null,
        date_configs: customConfigs,
      };

      const res = await scheduleService.saveDoctorMultiDateSchedule(
        effectiveBranchId,
        doctorId,
        payload
      );

      toast.success(`Successfully saved schedules for ${res.count || selectedDates.length} date(s).`);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      if (err.response?.status === 422) {
        toast.error(`Holiday Restriction: ${err.response.data.message}`);
      } else if (err.response?.status === 409) {
        toast.error(`Appointment Conflict: ${err.response.data.message}`);
        setConflicts(err.response.data.conflictingAppointments || []);
      } else {
        toast.error('Failed to save schedules: ' + (err.response?.data?.message || err.message));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Render Calendar Helper (days of month)
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const blanks = Array.from({ length: firstDayIndex }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    return { blanks, days };
  }, [calendarYear, calendarMonth]);

  const monthLabel = useMemo(() => {
    return new Date(calendarYear, calendarMonth, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }, [calendarYear, calendarMonth]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Multi-Date Doctor Shift & Slot Scheduling"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Step Indicator & Header Info */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <div className="text-xs font-bold text-slate-800">
              Doctor: <span className="text-teal-700">{doctorName || 'Selected Doctor'}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Branch: <span className="font-semibold text-slate-700">{branchDisplayName}</span> • Strict Isolation Applied
            </div>
          </div>

          {/* Stepper Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setCurrentStep('dates')}
              className={`px-3 py-1 rounded-lg transition-all ${
                currentStep === 'dates' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              1. Dates ({selectedDates.length})
            </button>
            <button
              type="button"
              onClick={() => selectedDates.length > 0 && setCurrentStep('sessions')}
              disabled={selectedDates.length === 0}
              className={`px-3 py-1 rounded-lg transition-all ${
                currentStep === 'sessions' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              } disabled:opacity-50`}
            >
              2. Sessions & Slots
            </button>
            <button
              type="button"
              onClick={() => selectedDates.length > 0 && setCurrentStep('preview')}
              disabled={selectedDates.length === 0}
              className={`px-3 py-1 rounded-lg transition-all ${
                currentStep === 'preview' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              } disabled:opacity-50`}
            >
              3. Conflict & Preview
            </button>
          </div>
        </div>

        {/* ================= STEP 1: DATE SELECTION ================= */}
        {currentStep === 'dates' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Interactive Calendar Picker */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-800">{monthLabel}</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (calendarMonth === 0) {
                          setCalendarMonth(11);
                          setCalendarYear((y) => y - 1);
                        } else {
                          setCalendarMonth((m) => m - 1);
                        }
                      }}
                      className="p-1 hover:bg-slate-200 rounded-lg text-slate-600"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (calendarMonth === 11) {
                          setCalendarMonth(0);
                          setCalendarYear((y) => y + 1);
                        } else {
                          setCalendarMonth((m) => m + 1);
                        }
                      }}
                      className="p-1 hover:bg-slate-200 rounded-lg text-slate-600"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {WEEKDAY_NAMES.map((w) => (
                    <span key={w} className="text-[10px] font-bold text-slate-400">
                      {w}
                    </span>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {calendarDays.blanks.map((_, i) => (
                    <div key={`blank-${i}`} className="h-8 w-8" />
                  ))}

                  {calendarDays.days.map((day) => {
                    const monthStr = String(calendarMonth + 1).padStart(2, '0');
                    const dayStr = String(day).padStart(2, '0');
                    const dateStr = `${calendarYear}-${monthStr}-${dayStr}`;

                    const isSelected = selectedDates.includes(dateStr);
                    const dateHolidays = holidayMap[dateStr] || [];
                    const isClosed = dateHolidays.some((h) => h.is_closed);
                    const isOpenHoliday = dateHolidays.some((h) => !h.is_closed);

                    let btnStyle = 'text-slate-700 hover:bg-slate-200/80';
                    if (isSelected) {
                      btnStyle = 'bg-teal-600 text-white font-bold ring-2 ring-teal-600/30';
                    } else if (isClosed) {
                      btnStyle = 'bg-rose-50 text-rose-700 border border-rose-300 font-semibold';
                    } else if (isOpenHoliday) {
                      btnStyle = 'bg-amber-50 text-amber-700 border border-amber-300 font-semibold';
                    }

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleToggleDate(dateStr)}
                        className={`h-8 w-8 rounded-lg text-xs flex flex-col items-center justify-center transition-all relative ${btnStyle}`}
                        title={
                          dateHolidays.length > 0
                            ? `${dateStr}: ${dateHolidays.map((h) => h.name).join(', ')} (${isClosed ? 'Closed' : 'Open'})`
                            : dateStr
                        }
                      >
                        <span>{day}</span>
                        {/* Status dot */}
                        {isClosed && !isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 absolute bottom-0.5" />
                        )}
                        {isOpenHoliday && !isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute bottom-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                  <div className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                    <span>Closed Holiday</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    <span>Celebration Holiday</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-teal-600 inline-block" />
                    <span>Selected</span>
                  </div>
                </div>
              </div>

              {/* Quick Batch Select / Manual Input */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-800">
                    Quick Batch / Range Selector
                  </div>

                  {/* Single date manual input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Pick Specific Single Date
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={singleDateInput}
                        onChange={(e) => setSingleDateInput(e.target.value)}
                        className="text-xs px-3 py-1.5 border border-slate-200 rounded-xl bg-white w-full outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddSingleDate}
                        disabled={!singleDateInput}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Range selector */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-600">
                      Add Continuous Date Range
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white outline-none"
                      />
                      <input
                        type="date"
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white outline-none"
                      />
                    </div>

                    {/* Day filters */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[
                        { day: 1, label: 'Mon' },
                        { day: 2, label: 'Tue' },
                        { day: 3, label: 'Wed' },
                        { day: 4, label: 'Thu' },
                        { day: 5, label: 'Fri' },
                        { day: 6, label: 'Sat' },
                        { day: 0, label: 'Sun' },
                      ].map(({ day, label }) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setRangeDays((prev) => ({ ...prev, [day]: !prev[day] }))}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                            rangeDays[day]
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddRange}
                      className="w-full mt-1 px-3 py-1.5 bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 text-xs font-semibold rounded-xl transition-all"
                    >
                      + Add Range Dates
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 italic bg-white p-2.5 rounded-xl border border-slate-200">
                  Tip: Dates are preserved in the exact order you select. Selection does not require a continuous range.
                </div>
              </div>
            </div>

            {/* Selected Dates Summary Strip (Ordered with Index and Removal) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Selected Dates ({selectedDates.length}) — Exact Selection Order Preserved:
                </span>
                {selectedDates.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllDates}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-800"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {selectedDates.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">
                  No dates selected yet. Click any date on the calendar or use the range selector.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                  {selectedDates.map((dStr, idx) => {
                    const dateObj = new Date(dStr);
                    const dayLabel = dateObj.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    });
                    const dateHolidays = holidayMap[dStr] || [];
                    const isClosed = dateHolidays.some((h) => h.is_closed);

                    return (
                      <span
                        key={dStr}
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border ${
                          isClosed
                            ? 'bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-500/20'
                            : 'bg-teal-50 text-teal-800 border-teal-200'
                        }`}
                      >
                        <span className="text-[10px] font-bold opacity-60">#{idx + 1}</span>
                        <span>{dayLabel}</span>
                        {isClosed && (
                          <span
                            title={`Closed Holiday: ${dateHolidays.map((h) => h.name).join(', ')}`}
                            className="inline-flex items-center text-rose-600"
                          >
                            <Lock className="w-3 h-3 ml-0.5" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveDate(dStr)}
                          className="hover:text-rose-600 ml-1 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Authoritative Closed Holiday Warning & Override Toggle */}
            {closedHolidaysInSelection.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3 text-xs">
                <div className="flex items-start space-x-2 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold">Authoritative Closed Holiday Guard:</span>
                    <p className="mt-0.5 text-amber-800">
                      {closedHolidaysInSelection.length} of your selected date(s) fall on closed clinic holidays:{' '}
                      <span className="font-semibold">
                        {closedHolidaysInSelection.map((m) => `${m.date} (${m.holiday.name})`).join(', ')}
                      </span>
                      . Doctor shift scheduling on closed holidays is blocked unless an explicit override is authorized.
                    </p>
                  </div>
                </div>

                <div className="bg-white/80 p-3 rounded-xl border border-amber-200 space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={isWorkingOverride}
                      onChange={(e) => setIsWorkingOverride(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                    />
                    <span>Authorize Special Working Day Override on Closed Holiday(s)</span>
                  </label>

                  {isWorkingOverride && (
                    <div className="pt-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Override Reason <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Emergency duty coverage, festival walk-in shift"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 2: CONFIGURE SESSIONS & SLOTS ================= */}
        {currentStep === 'sessions' && (
          <div className="space-y-4">
            {/* Mode & Chair Selection Bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-700">Mode:</span>
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('uniform');
                      setActiveCustomDate('');
                    }}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      mode === 'uniform' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600'
                    }`}
                  >
                    Uniform Schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('custom');
                      if (!activeCustomDate && selectedDates.length > 0) {
                        setActiveCustomDate(selectedDates[0]);
                      }
                    }}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      mode === 'custom' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600'
                    }`}
                  >
                    Per-Date Customization
                  </button>
                </div>
              </div>

              {/* Dental Chair Selector */}
              <div className="flex items-center space-x-2">
                <Armchair className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-700">Assigned Chair:</span>
                <select
                  value={chairId}
                  onChange={(e) => setChairId(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Unassigned / Any Chair</option>
                  {chairs.map((c) => (
                    <option key={c.id} value={c.id}>
                      Chair #{c.chair_number} ({c.chair_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom Mode Date Selector */}
            {mode === 'custom' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center space-x-2 overflow-x-auto">
                <span className="text-[11px] font-bold text-slate-500 uppercase shrink-0">Customizing:</span>
                {selectedDates.map((dStr) => (
                  <button
                    key={dStr}
                    type="button"
                    onClick={() => setActiveCustomDate(dStr)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                      activeCustomDate === dStr
                        ? 'bg-teal-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {dStr}
                  </button>
                ))}
              </div>
            )}

            {/* Slot Duration & Buffer Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-slate-200 rounded-2xl p-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Appointment Slot Duration
                </label>
                <div className="flex gap-2">
                  {SLOT_DURATIONS.map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => setSlotDuration(dur)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        slotDuration === dur
                          ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {dur}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Buffer Between Slots
                </label>
                <div className="flex gap-2">
                  {BUFFER_OPTIONS.map((buf) => (
                    <button
                      key={buf}
                      type="button"
                      onClick={() => setBufferMinutes(buf)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        bufferMinutes === buf
                          ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {buf}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sessions & Breaks Configuration List */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Working Sessions & Break Windows
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleAddSession(false)}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Working Session</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddSession(true)}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg"
                  >
                    <Coffee className="w-3 h-3" />
                    <span>Break</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {effectiveSessions.map((sess, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      sess.is_break
                        ? 'bg-amber-50/50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2 flex-1">
                      {sess.is_break ? (
                        <Coffee className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-teal-600 shrink-0" />
                      )}
                      <input
                        type="text"
                        value={sess.session_name}
                        onChange={(e) => handleUpdateSession(idx, 'session_name', e.target.value)}
                        placeholder="Session Name"
                        className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg bg-white w-full max-w-[180px] font-semibold"
                      />
                      {sess.is_break && (
                        <input
                          type="text"
                          value={sess.break_reason || ''}
                          onChange={(e) => handleUpdateSession(idx, 'break_reason', e.target.value)}
                          placeholder="Break Reason (e.g. Lunch)"
                          className="text-xs px-2.5 py-1 border border-amber-200 rounded-lg bg-white flex-1"
                        />
                      )}
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="flex items-center space-x-1">
                        <input
                          type="time"
                          value={sess.start_time}
                          onChange={(e) => handleUpdateSession(idx, 'start_time', e.target.value)}
                          className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                          type="time"
                          value={sess.end_time}
                          onChange={(e) => handleUpdateSession(idx, 'end_time', e.target.value)}
                          className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveSession(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Remove session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Slot Preview Calculation */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Calculated Day Slots: <span className="font-bold text-slate-800">{calculatedSlots.length}</span> ({calculatedSlots.filter((s) => s.status === 'available').length} Available, {calculatedSlots.filter((s) => s.status === 'break').length} In Break)
                </span>
                <span className="text-[11px]">
                  Step: {slotDuration}m slot + {bufferMinutes}m buffer = {slotDuration + bufferMinutes}m per cycle
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 3: CONFLICT CHECK & PREVIEW ================= */}
        {currentStep === 'preview' && (
          <div className="space-y-4">
            {/* Conflict Guard Status Box */}
            {conflicts.length > 0 ? (
              <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 space-y-2">
                <div className="flex items-center space-x-2 text-rose-800 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Conflict Warning: {conflicts.length} active appointment(s) collide with the proposed schedule.
                  </span>
                </div>
                <p className="text-[11px] text-rose-700">
                  Saving will fail unless these appointments fall entirely within working sessions or are rescheduled.
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1.5 divide-y divide-rose-100 text-xs">
                  {conflicts.map((c, i) => (
                    <div key={i} className="pt-1 flex items-center justify-between text-[11px] text-rose-900">
                      <span>
                        Appt #{c.appointmentNumber || c.appointmentId?.substring(0, 8)} on {c.appointmentDate} ({c.startTime} - {c.endTime})
                      </span>
                      <span className="font-semibold text-rose-600">{c.issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center space-x-2 text-emerald-800 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">
                  Zero active appointment conflicts detected locally or across other clinic branches.
                </span>
              </div>
            )}

            {/* Comprehensive Schedule Summary Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Multi-Date Schedule Preview Summary
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">DOCTOR</span>
                  <span className="font-bold text-slate-800">{doctorName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">BRANCH</span>
                  <span className="font-bold text-slate-800">{branchDisplayName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">TOTAL DATES</span>
                  <span className="font-bold text-teal-700">{selectedDates.length} Date(s)</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">SLOT CONFIG</span>
                  <span className="font-bold text-slate-800">{slotDuration}m slot / {bufferMinutes}m buffer</span>
                </div>
              </div>

              {/* Selected Dates Table */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600">
                  Target Schedule Dates (in selection order):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 border border-slate-100 rounded-xl">
                  {selectedDates.map((dStr, idx) => {
                    const isClosed = holidayMap[dStr]?.some((h) => h.is_closed);
                    return (
                      <span
                        key={dStr}
                        className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${
                          isClosed
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        #{idx + 1}: {dStr} {isClosed ? '🔒' : ''}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Sessions Summary */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600">Configured Sessions:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {effectiveSessions.map((s, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg border flex items-center justify-between ${
                        s.is_break ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <span className="font-semibold text-slate-800">
                        {s.session_name} {s.is_break ? `(${s.break_reason || 'Break'})` : ''}
                      </span>
                      <span className="font-mono text-slate-600">
                        {s.start_time} - {s.end_time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Holiday Override Notice if applicable */}
              {closedHolidaysInSelection.length > 0 && isWorkingOverride && (
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                  <span>Special Working Override Applied on Closed Holiday(s)</span>
                  <span className="italic font-medium">"{overrideReason}"</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Navigation & Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div>
            {currentStep !== 'dates' ? (
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 'preview') setCurrentStep('sessions');
                  else if (currentStep === 'sessions') setCurrentStep('dates');
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-all"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {currentStep === 'dates' && (
              <button
                type="button"
                onClick={handleProceedToSessions}
                disabled={selectedDates.length === 0}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center space-x-1.5"
              >
                <span>Configure Sessions</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {currentStep === 'sessions' && (
              <button
                type="button"
                onClick={handleProceedToPreview}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center space-x-1.5"
              >
                <span>Conflict Check & Preview</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {currentStep === 'preview' && (
              <>
                <button
                  type="button"
                  onClick={handleCheckConflicts}
                  disabled={isCheckingConflicts}
                  className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingConflicts ? 'animate-spin' : ''}`} />
                  <span>Re-check Conflicts</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedules}
                  disabled={isSaving || conflicts.length > 0}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {isSaving
                      ? 'Saving Schedules...'
                      : `Confirm & Save ${selectedDates.length} Date(s)`}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
export default MultiDateScheduleModal;
