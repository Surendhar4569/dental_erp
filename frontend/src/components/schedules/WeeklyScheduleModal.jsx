import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { scheduleService } from '../../services/scheduleService';
import { toast } from 'react-toastify';
import {
  Clock,
  Plus,
  Trash2,
  AlertTriangle,
  Coffee,
  Calendar,
  CheckCircle2,
  Activity,
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

export const WeeklyScheduleModal = ({
  isOpen,
  onClose,
  branchId,
  doctorId,
  doctorName,
  initialSchedules = [],
  onSaved,
}) => {
  const [schedules, setSchedules] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConflicts([]);
      const fullWeek = DAYS_OF_WEEK.map(({ day }) => {
        const existing = initialSchedules.find((f) => f.day_of_week === day);
        if (existing) {
          return {
            ...existing,
            slot_duration_minutes: existing.slot_duration_minutes || 30,
            buffer_minutes: existing.buffer_minutes || 0,
            sessions: (existing.sessions || []).map((s) => ({
              ...s,
              is_break: Boolean(s.is_break),
              break_reason: s.break_reason || '',
            })),
          };
        }
        return {
          day_of_week: day,
          slot_duration_minutes: 30,
          buffer_minutes: 0,
          is_active: day !== 0,
          sessions:
            day !== 0
              ? [
                  { session_name: 'Morning Session', start_time: '09:00', end_time: '13:00', session_order: 1, is_break: false },
                  { session_name: 'Lunch Break', start_time: '13:00', end_time: '14:00', session_order: 2, is_break: true, break_reason: 'Lunch Break' },
                  { session_name: 'Evening Session', start_time: '16:00', end_time: '20:00', session_order: 3, is_break: false },
                ]
              : [],
        };
      });
      setSchedules(fullWeek);
    }
  }, [isOpen, initialSchedules]);

  const handleToggleDay = (dayIndex) => {
    setSchedules((prev) =>
      prev.map((s, idx) => {
        if (idx === dayIndex) {
          const willBeActive = !s.is_active;
          return {
            ...s,
            is_active: willBeActive,
            sessions:
              willBeActive && s.sessions.length === 0
                ? [{ session_name: 'Regular Session', start_time: '09:00', end_time: '17:00', session_order: 1, is_break: false }]
                : s.sessions,
          };
        }
        return s;
      })
    );
  };

  const handleUpdateDuration = (dayIndex, field, value) => {
    setSchedules((prev) =>
      prev.map((s, idx) => (idx === dayIndex ? { ...s, [field]: Number(value) } : s))
    );
  };

  const handleAddSession = (dayIndex, isBreak = false) => {
    setSchedules((prev) =>
      prev.map((s, idx) => {
        if (idx === dayIndex) {
          const order = s.sessions.length + 1;
          const newSession = isBreak
            ? { session_name: 'Break', start_time: '13:00', end_time: '14:00', session_order: order, is_break: true, break_reason: 'Break' }
            : { session_name: `Session ${order}`, start_time: '14:00', end_time: '18:00', session_order: order, is_break: false };
          return { ...s, sessions: [...s.sessions, newSession] };
        }
        return s;
      })
    );
  };

  const handleRemoveSession = (dayIndex, sessionIdx) => {
    setSchedules((prev) =>
      prev.map((s, idx) => {
        if (idx === dayIndex) {
          return {
            ...s,
            sessions: s.sessions.filter((_, sIdx) => sIdx !== sessionIdx),
          };
        }
        return s;
      })
    );
  };

  const handleUpdateSessionTime = (dayIndex, sessionIdx, field, val) => {
    setSchedules((prev) =>
      prev.map((s, idx) => {
        if (idx === dayIndex) {
          const updated = s.sessions.map((sess, sIdx) =>
            sIdx === sessionIdx ? { ...sess, [field]: val } : sess
          );
          return { ...s, sessions: updated };
        }
        return s;
      })
    );
  };

  const handleCheckConflicts = async () => {
    setIsCheckingConflicts(true);
    try {
      const res = await scheduleService.checkScheduleConflicts(branchId, doctorId, {
        schedules,
      });
      setConflicts(res.conflictingAppointments || []);
      if (res.conflictCount === 0) {
        toast.success('No appointment conflicts detected for this schedule configuration!');
      } else {
        toast.warn(`Warning: ${res.conflictCount} future appointment(s) may conflict with updated working hours.`);
      }
    } catch (err) {
      toast.error('Failed to check conflicts: ' + err.message);
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await scheduleService.saveDoctorWeeklySchedule(branchId, doctorId, schedules);
      toast.success('Doctor weekly working hours and breaks updated successfully!');
      if (res.warnings && res.warnings.length > 0) {
        toast.warn(`Notice: ${res.warnings.length} future appointment(s) may require attention.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save schedule.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configure Working Hours — ${doctorName}`}
      maxWidth="max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <p className="text-xs text-slate-500">
          Configure recurring weekly working days, shifts, lunch/tea breaks, slot duration, and buffer time.
          Schedules are branch-specific and operate independently.
        </p>

        {/* Conflicts Alert if any */}
        {conflicts.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900 text-xs space-y-2">
            <div className="flex items-center space-x-2 font-bold text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Potential Appointment Conflicts Detected ({conflicts.length})</span>
            </div>
            <p className="text-amber-700">
              The following existing future appointments fall outside updated shifts or overlap with breaks:
            </p>
            <div className="max-h-36 overflow-y-auto divide-y divide-amber-200">
              {conflicts.map((c) => (
                <div key={c.appointmentId} className="py-1 flex items-center justify-between">
                  <span>
                    <strong>{c.appointmentNumber}</strong> — {c.patientName} on {c.appointmentDate} at {c.startTime}
                  </span>
                  <span className="text-rose-700 font-semibold">{c.issue}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {schedules.map((daySched, dayIndex) => {
            const dayMeta = DAYS_OF_WEEK.find((d) => d.day === daySched.day_of_week);
            const workingSessions = (daySched.sessions || []).filter((s) => !s.is_break);
            const breakSessions = (daySched.sessions || []).filter((s) => s.is_break);

            return (
              <div
                key={daySched.day_of_week}
                className={`border rounded-xl p-4 transition-all ${
                  daySched.is_active
                    ? 'border-slate-200 bg-white shadow-2xs'
                    : 'border-slate-100 bg-slate-50 opacity-70'
                }`}
              >
                {/* Day Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id={`day-${daySched.day_of_week}`}
                      checked={daySched.is_active}
                      onChange={() => handleToggleDay(dayIndex)}
                      className="w-4 h-4 rounded text-teal-600 border-slate-300 focus:ring-teal-500 cursor-pointer"
                    />
                    <label
                      htmlFor={`day-${daySched.day_of_week}`}
                      className="text-sm font-bold text-slate-900 cursor-pointer flex items-center gap-2"
                    >
                      {dayMeta?.label}
                      {!daySched.is_active && (
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          Off Day
                        </span>
                      )}
                    </label>
                  </div>

                  {daySched.is_active && (
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div className="flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-500 font-medium">Slot Duration:</span>
                        <select
                          value={daySched.slot_duration_minutes}
                          onChange={(e) => handleUpdateDuration(dayIndex, 'slot_duration_minutes', e.target.value)}
                          className="text-xs font-semibold border-slate-200 rounded-md py-1 px-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                          <option value={15}>15 mins</option>
                          <option value={30}>30 mins</option>
                          <option value={45}>45 mins</option>
                          <option value={60}>60 mins</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-slate-500 font-medium">Buffer:</span>
                        <select
                          value={daySched.buffer_minutes}
                          onChange={(e) => handleUpdateDuration(dayIndex, 'buffer_minutes', e.target.value)}
                          className="text-xs font-semibold border-slate-200 rounded-md py-1 px-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                          <option value={0}>0 mins</option>
                          <option value={5}>5 mins</option>
                          <option value={10}>10 mins</option>
                          <option value={15}>15 mins</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Day Sessions & Breaks */}
                {daySched.is_active && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      {daySched.sessions.map((sess, sIdx) => (
                        <div
                          key={sIdx}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                            sess.is_break
                              ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                              : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-1 font-semibold min-w-24">
                            {sess.is_break ? (
                              <Coffee className="w-3.5 h-3.5 text-amber-600" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-teal-600" />
                            )}
                            {sess.is_break ? 'Break' : 'Session'}
                          </span>

                          <input
                            type="text"
                            placeholder={sess.is_break ? 'Break description' : 'Session name'}
                            value={sess.is_break ? sess.break_reason || sess.session_name : sess.session_name}
                            onChange={(e) =>
                              handleUpdateSessionTime(
                                dayIndex,
                                sIdx,
                                sess.is_break ? 'break_reason' : 'session_name',
                                e.target.value
                              )
                            }
                            className="text-xs border-slate-200 rounded py-1 px-2 w-32 focus:ring-teal-500"
                          />

                          <div className="flex items-center space-x-1">
                            <input
                              type="time"
                              value={sess.start_time}
                              onChange={(e) =>
                                handleUpdateSessionTime(dayIndex, sIdx, 'start_time', e.target.value)
                              }
                              className="text-xs border-slate-200 rounded py-1 px-2 focus:ring-teal-500"
                              required
                            />
                            <span className="text-slate-400">to</span>
                            <input
                              type="time"
                              value={sess.end_time}
                              onChange={(e) =>
                                handleUpdateSessionTime(dayIndex, sIdx, 'end_time', e.target.value)
                              }
                              className="text-xs border-slate-200 rounded py-1 px-2 focus:ring-teal-500"
                              required
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveSession(dayIndex, sIdx)}
                            className="ml-auto text-slate-400 hover:text-rose-600 p-1"
                            title="Remove session or break"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons to add Session or Break */}
                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleAddSession(dayIndex, false)}
                        className="inline-flex items-center space-x-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded border border-teal-200"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Working Shift</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAddSession(dayIndex, true)}
                        className="inline-flex items-center space-x-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded border border-amber-200"
                      >
                        <Coffee className="w-3 h-3" />
                        <span>Add Break</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleCheckConflicts}
            disabled={isCheckingConflicts}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg"
          >
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            <span>{isCheckingConflicts ? 'Checking Conflicts...' : 'Pre-flight Conflict Check'}</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm flex items-center space-x-1.5"
            >
              {isSaving ? (
                <>
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Schedule</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
