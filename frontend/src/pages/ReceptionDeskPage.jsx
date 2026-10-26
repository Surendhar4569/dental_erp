import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { appointmentService } from '../services/appointmentService';
import { scheduleService } from '../services/scheduleService';
import { patientService } from '../services/patientService';
import { PageHeader } from '../components/common/PageHeader';
import { MetricCard } from '../components/common/MetricCard';
import { PaymentCollectionModal } from '../components/appointments/PaymentCollectionModal';
import { PrintableReceiptModal } from '../components/appointments/PrintableReceiptModal';
import { ClinicalExaminationModal } from '../components/clinical/ClinicalExaminationModal';
import { PreConsultVitalsModal } from '../components/clinical/PreConsultVitalsModal';
import { toast } from 'react-toastify';
import {
  Ticket,
  Users,
  Clock,
  PlayCircle,
  CheckCircle2,
  IndianRupee,
  Search,
  PlusCircle,
  RefreshCw,
  Phone,
  AlertCircle,
  Printer,
  CreditCard,
  UserCheck,
  Activity,
  ArrowRight,
  Stethoscope,
  HeartPulse,
} from 'lucide-react';

export const ReceptionDeskPage = () => {
  const { user } = useAuth();
  const { activeBranch } = useBranch();

  // Metrics
  const [metrics, setMetrics] = useState(null);

  // Doctors
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedDoctorFee, setSelectedDoctorFee] = useState(null);

  // Live Queue & Appointments
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [queueFilter, setQueueFilter] = useState('active'); // 'active' | 'queued' | 'in_consultation' | 'completed' | 'all'
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Quick Walk-In State
  const [walkInMode, setWalkInMode] = useState('existing');
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [newPatient, setNewPatient] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    gender: 'unspecified',
  });
  const [walkInComplaint, setWalkInComplaint] = useState('Walk-in consultation');
  const [isSubmittingWalkIn, setIsSubmittingWalkIn] = useState(false);

  // Modals
  const [activeAppointment, setActiveAppointment] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [isClinicalModalOpen, setIsClinicalModalOpen] = useState(false);
  const [clinicalModalAppt, setClinicalModalAppt] = useState(null);
  const [isVitalsModalOpen, setIsVitalsModalOpen] = useState(false);
  const [vitalsModalAppt, setVitalsModalAppt] = useState(null);

  // Load doctors
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
        .catch(() => setDoctors([]));
    }
  }, [activeBranch?.id]);

  // Load fee for selected doctor
  useEffect(() => {
    if (activeBranch?.id && selectedDoctorId) {
      scheduleService
        .getDoctorFee(activeBranch.id, selectedDoctorId)
        .then((res) => setSelectedDoctorFee(res.fees || null))
        .catch(() => setSelectedDoctorFee(null));
    } else {
      setSelectedDoctorFee(null);
    }
  }, [activeBranch?.id, selectedDoctorId]);

  // Load Today's Metrics & Appointments
  const loadDashboard = useCallback(async () => {
    if (!activeBranch?.id) return;
    setIsLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const [metricsRes, apptsRes] = await Promise.all([
        appointmentService.getReceptionMetrics(),
        appointmentService.getAppointments({ date: todayStr, limit: 100 }),
      ]);

      setMetrics(metricsRes.metrics || null);
      setTodayAppointments(apptsRes.appointments || []);
    } catch (err) {
      toast.error('Failed to load reception desk data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeBranch?.id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Patient search debounce for walk-in
  useEffect(() => {
    if (walkInMode !== 'existing' || !patientSearch.trim()) {
      setPatientResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await patientService.getPatients({
          search: patientSearch.trim(),
          limit: 5,
        });
        setPatientResults(res.patients || []);
      } catch {
        setPatientResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [patientSearch, walkInMode]);

  // Register Walk-In
  const handleRegisterWalkIn = async (e) => {
    e.preventDefault();

    if (!selectedDoctorId) {
      toast.warn('Please select a consulting doctor.');
      return;
    }

    if (!selectedDoctorFee?.is_configured || selectedDoctorFee?.consultation_fee == null) {
      toast.error('Consultation fee not configured for this doctor at this branch. Walk-ins cannot be registered.');
      return;
    }

    if (walkInMode === 'existing' && !selectedPatient) {
      toast.warn('Please select an existing patient.');
      return;
    }

    if (walkInMode === 'new') {
      if (!newPatient.first_name.trim() || !newPatient.last_name.trim()) {
        toast.warn('Please provide first and last name.');
        return;
      }
      if (!newPatient.phone.trim()) {
        toast.warn('Please provide mobile phone.');
        return;
      }
    }

    setIsSubmittingWalkIn(true);
    try {
      const payload = {
        doctor_id: selectedDoctorId,
        chief_complaint: walkInComplaint.trim() || 'Walk-in consultation',
        ...(walkInMode === 'existing'
          ? { patient_id: selectedPatient.id }
          : { new_patient: newPatient }),
      };

      const res = await appointmentService.createWalkInAppointment(payload);
      toast.success(
        `Walk-in registered! Daily Token #${res.visit?.token_display} issued for ${res.appointment?.patient_first_name}.`
      );

      // Reset form
      setSelectedPatient(null);
      setPatientSearch('');
      setNewPatient({ first_name: '', last_name: '', phone: '', gender: 'unspecified' });
      setWalkInComplaint('Walk-in consultation');

      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Walk-in registration failed.');
    } finally {
      setIsSubmittingWalkIn(false);
    }
  };

  // State transitions for encounters
  const handleCheckIn = async (appointmentId) => {
    try {
      const res = await appointmentService.checkInAppointment(appointmentId);
      toast.success(`Patient checked in! Token #${res.visit?.token_display} assigned.`);
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Check-in failed.');
    }
  };

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      await appointmentService.updateAppointmentStatus(appointmentId, newStatus);
      toast.success(`Patient moved to ${newStatus}.`);
      loadDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update status.');
    }
  };

  // Filter today's queue
  const filteredQueue = useMemo(() => {
    return todayAppointments.filter((a) => {
      if (a.status === 'cancelled') return false;
      if (queueFilter === 'active') {
        return a.status === 'checked_in' || a.status === 'in_consultation';
      }
      if (queueFilter === 'queued') {
        return a.status === 'checked_in';
      }
      if (queueFilter === 'in_consultation') {
        return a.status === 'in_consultation';
      }
      if (queueFilter === 'completed') {
        return a.status === 'completed';
      }
      return true; // 'all'
    });
  }, [todayAppointments, queueFilter]);

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Reception Desk & Live Patient Queue"
        subtitle={`Branch: ${activeBranch?.branch_name || 'Active Location'} | Daily Visit Token Flow (001+)`}
        breadcrumbs={[
          { label: 'Workspace', href: '#' },
          { label: 'Reception Desk' },
        ]}
      />

      {/* Real-time KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Today's Appointments"
          value={metrics ? metrics.total_active_today : '0'}
          subtext="Active Bookings"
          icon={CalendarClockIcon}
          badgeText="Today"
          badgeColor="teal"
        />
        <MetricCard
          label="Waiting in Queue"
          value={metrics ? metrics.checked_in_count : '0'}
          subtext="Tokens Issued"
          icon={Ticket}
          badgeText="Queued"
          badgeColor="blue"
        />
        <MetricCard
          label="In Consultation"
          value={metrics ? metrics.in_consultation_count : '0'}
          subtext="With Doctors"
          icon={PlayCircle}
          badgeText="Active"
          badgeColor="purple"
        />
        <MetricCard
          label="Completed Visits"
          value={metrics ? metrics.completed_count : '0'}
          subtext="Consults Done"
          icon={CheckCircle2}
          badgeText="Done"
          badgeColor="emerald"
        />
        <MetricCard
          label="Walk-In Encounters"
          value={metrics ? metrics.walk_in_count : '0'}
          subtext="Same-Day Queue"
          icon={Users}
          badgeText="Walk-Ins"
          badgeColor="amber"
        />
        <MetricCard
          label="Pending Balances"
          value={`₹${parseFloat(metrics?.total_pending_balance || 0).toFixed(0)}`}
          subtext="Unsettled Fees"
          icon={IndianRupee}
          badgeText="Due"
          badgeColor="rose"
        />
      </div>

      {/* Main Operations Split: Fast Walk-In Card & Live Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Col: Instant Walk-In Form */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs self-start">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                <Ticket className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 leading-tight">
                  Instant Walk-In Check-In
                </h3>
                <span className="text-[10px] text-slate-500 font-medium">
                  Issue token & add to doctor queue
                </span>
              </div>
            </div>

            <div className="flex bg-slate-100 p-0.5 rounded text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => setWalkInMode('existing')}
                className={`px-2 py-0.5 rounded transition ${
                  walkInMode === 'existing' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Existing
              </button>
              <button
                type="button"
                onClick={() => setWalkInMode('new')}
                className={`px-2 py-0.5 rounded transition ${
                  walkInMode === 'new' ? 'bg-white text-teal-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                + New
              </button>
            </div>
          </div>

          <form onSubmit={handleRegisterWalkIn} className="space-y-3">
            {/* Consulting Doctor */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Consulting Doctor *
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 bg-slate-50 focus:border-teal-500 focus:ring-teal-500"
                required
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    Dr. {d.first_name} {d.last_name} ({d.role_display || d.role_name})
                  </option>
                ))}
              </select>

              {/* Fee status indicator for selected doctor */}
              {selectedDoctorFee && (
                selectedDoctorFee.is_configured && selectedDoctorFee.consultation_fee != null ? (
                  <p className="text-[10px] text-teal-700 mt-1 font-semibold flex items-center justify-between">
                    <span>Consultation Fee: ₹{Number(selectedDoctorFee.consultation_fee).toFixed(2)}</span>
                    <span className="font-mono text-[9px] uppercase text-slate-400">({selectedDoctorFee.source?.replace(/_/g, ' ')})</span>
                  </p>
                ) : (
                  <div className="mt-1.5 p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 flex items-start space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Consultation fee not configured for this doctor at this branch.</strong> Walk-in registration is disabled.
                    </span>
                  </div>
                )
              )}
            </div>

            {/* Patient Selector */}
            {walkInMode === 'existing' ? (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Search Registered Patient *
                </label>
                {selectedPatient ? (
                  <div className="bg-teal-50 border border-teal-200 p-2 rounded-md flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-teal-900">
                        {selectedPatient.first_name} {selectedPatient.last_name}
                      </span>
                      <span className="ml-1 text-[10px] font-mono text-teal-700">
                        (#{selectedPatient.patient_number})
                      </span>
                      <p className="text-[10px] text-teal-600 font-mono">{selectedPatient.phone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientSearch('');
                      }}
                      className="text-[10px] text-teal-800 font-bold hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Type Patient Name, Phone, or ID..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full text-xs rounded-md border-slate-300 pl-7 pr-2.5 py-1.5 focus:border-teal-500 focus:ring-teal-500"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />

                    {patientResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-20 divide-y divide-slate-100 max-h-40 overflow-y-auto">
                        {patientResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedPatient(p);
                              setPatientResults([]);
                            }}
                            className="p-2 hover:bg-slate-50 cursor-pointer text-xs flex items-center justify-between transition"
                          >
                            <div>
                              <span className="font-semibold text-slate-800">
                                {p.first_name} {p.last_name}
                              </span>
                              <span className="ml-1 text-[10px] font-mono text-slate-500">
                                #{p.patient_number}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">{p.phone}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="First Name *"
                    value={newPatient.first_name}
                    onChange={(e) => setNewPatient({ ...newPatient, first_name: e.target.value })}
                    className="text-xs rounded-md border-slate-300 py-1.5 px-2 focus:border-teal-500 focus:ring-teal-500"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Last Name *"
                    value={newPatient.last_name}
                    onChange={(e) => setNewPatient({ ...newPatient, last_name: e.target.value })}
                    className="text-xs rounded-md border-slate-300 py-1.5 px-2 focus:border-teal-500 focus:ring-teal-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    placeholder="Mobile Phone *"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                    className="text-xs rounded-md border-slate-300 py-1.5 px-2 focus:border-teal-500 focus:ring-teal-500"
                    required
                  />
                  <select
                    value={newPatient.gender}
                    onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                    className="text-xs rounded-md border-slate-300 py-1.5 px-2 bg-white focus:border-teal-500 focus:ring-teal-500"
                  >
                    <option value="unspecified">Gender (Opt)</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            )}

            {/* Complaint */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Chief Complaint
              </label>
              <input
                type="text"
                placeholder="e.g. Toothache, Swelling, Checkup..."
                value={walkInComplaint}
                onChange={(e) => setWalkInComplaint(e.target.value)}
                className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingWalkIn || !selectedDoctorFee?.is_configured || selectedDoctorFee?.consultation_fee == null}
              className="w-full mt-2 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              {isSubmittingWalkIn ? (
                <>
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  <span>Issuing Token...</span>
                </>
              ) : (
                <>
                  <Ticket className="w-3.5 h-3.5" />
                  <span>Issue Token & Add to Live Queue</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Col: Live Queue Monitor */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex flex-col">
          {/* Header & Queue Filter Tabs */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Today's Live Queue ({filteredQueue.length})
              </h3>
              <p className="text-[10px] text-slate-500">
                Sorted by check-in time and sequential visit tokens
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setQueueFilter('active')}
                  className={`px-2.5 py-1 rounded transition ${
                    queueFilter === 'active' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Active Queue
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('queued')}
                  className={`px-2.5 py-1 rounded transition ${
                    queueFilter === 'queued' ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Waiting
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('in_consultation')}
                  className={`px-2.5 py-1 rounded transition ${
                    queueFilter === 'in_consultation' ? 'bg-white text-purple-800 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  In Consult
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter('completed')}
                  className={`px-2.5 py-1 rounded transition ${
                    queueFilter === 'completed' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Completed
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsRefreshing(true);
                  loadDashboard();
                }}
                className="p-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600"
                title="Refresh Queue"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-teal-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Queue Body */}
          <div className="p-3 divide-y divide-slate-100 overflow-y-auto max-h-[560px]">
            {isLoading ? (
              <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center">
                <Activity className="w-5 h-5 animate-spin text-teal-600 mb-2" />
                <span>Loading live queue...</span>
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                No patient encounters in this queue view for today.
              </div>
            ) : (
              filteredQueue.map((appt) => {
                const isPaid = appt.payment_status === 'paid';
                const isPartial = appt.payment_status === 'partial';
                const due = Math.max(
                  0,
                  parseFloat(appt.consultation_fee || appt.fee_amount || 0) - parseFloat(appt.amount_paid || 0)
                );

                return (
                  <div
                    key={appt.id}
                    className="py-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 rounded-lg transition"
                  >
                    {/* Left: Token & Patient Info */}
                    <div className="flex items-start space-x-3">
                      {/* Big Daily Visit Token Badge */}
                      <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center shrink-0 shadow-2xs">
                        <span className="text-[9px] uppercase tracking-wider text-teal-400 font-bold">
                          Token
                        </span>
                        <span className="text-base font-extrabold font-mono leading-none">
                          #{appt.visit_token_display || '---'}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-900">
                            {appt.patient_first_name} {appt.patient_last_name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            (#{appt.patient_number})
                          </span>
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            {appt.appointment_type}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Doctor: <strong className="text-slate-700">Dr. {appt.doctor_first_name} {appt.doctor_last_name}</strong>
                          {appt.chief_complaint && (
                            <span className="ml-2 italic text-slate-400">"{appt.chief_complaint}"</span>
                          )}
                        </p>

                        <div className="flex items-center space-x-3 text-[10px] text-slate-400 mt-1">
                          <span>Appt #{appt.appointment_number}</span>
                          <span>Time: {appt.start_time?.slice(0, 5)}</span>
                          <span className={due === 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                            {due === 0 ? 'Fee Settled' : `Fee Due: ₹${due.toFixed(0)}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Status Pill & Actions */}
                    <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
                      {/* Status indicator */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          appt.status === 'checked_in'
                            ? 'bg-blue-100 text-blue-800'
                            : appt.status === 'in_consultation'
                            ? 'bg-purple-100 text-purple-800 animate-pulse'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {appt.status === 'checked_in'
                          ? 'Waiting'
                          : appt.status === 'in_consultation'
                          ? 'In Consult'
                          : appt.status}
                      </span>

                      {/* State transition triggers */}
                      {appt.status === 'scheduled' && (
                        <button
                          type="button"
                          onClick={() => handleCheckIn(appt.id)}
                          className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition shadow-2xs"
                        >
                          Check In
                        </button>
                      )}

                      {appt.status === 'checked_in' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(appt.id, 'in_consultation')}
                          className="px-2.5 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md transition flex items-center space-x-1 shadow-2xs"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>Call In</span>
                        </button>
                      )}

                      {appt.status === 'in_consultation' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(appt.id, 'completed')}
                          className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md transition flex items-center space-x-1 shadow-2xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Done</span>
                        </button>
                      )}

                      {/* Pre-Consultation Vitals & Triage Trigger */}
                      {(appt.status === 'checked_in' || appt.status === 'in_consultation') && (
                        <button
                          type="button"
                          onClick={() => {
                            setVitalsModalAppt(appt);
                            setIsVitalsModalOpen(true);
                          }}
                          className="px-2.5 py-1 text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-md border border-rose-200 transition flex items-center space-x-1 shadow-2xs"
                          title="Record Pre-Consultation Vitals & Triage"
                        >
                          <HeartPulse className="w-3.5 h-3.5 text-rose-600" />
                          <span>Vitals / Triage</span>
                        </button>
                      )}

                      {/* Clinical Examination Notes Trigger */}
                      {(appt.status === 'checked_in' ||
                        appt.status === 'in_consultation' ||
                        appt.status === 'completed') && (
                        <button
                          type="button"
                          onClick={() => {
                            setClinicalModalAppt(appt);
                            setIsClinicalModalOpen(true);
                          }}
                          className="px-2.5 py-1 text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold rounded-md border border-teal-200 transition flex items-center space-x-1 shadow-2xs"
                          title="Open Clinical Examination & Case Notes"
                        >
                          <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                          <span>Clinical Notes</span>
                        </button>
                      )}

                      {/* Payment Trigger */}
                      {due > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveAppointment(appt);
                            setIsPaymentModalOpen(true);
                          }}
                          className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-md transition shadow-2xs flex items-center space-x-1"
                        >
                          <IndianRupee className="w-3 h-3" />
                          <span>Pay</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Payment Collection Modal */}
      <PaymentCollectionModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setActiveAppointment(null);
        }}
        appointment={activeAppointment}
        onPaymentSuccess={(receipt) => {
          loadDashboard();
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

      {/* Clinical Examination & Case Notes Modal */}
      <ClinicalExaminationModal
        isOpen={isClinicalModalOpen}
        onClose={() => {
          setIsClinicalModalOpen(false);
          setClinicalModalAppt(null);
        }}
        appointment={clinicalModalAppt}
        visit={clinicalModalAppt?.visit || (clinicalModalAppt?.visit_id ? { id: clinicalModalAppt.visit_id, token_display: clinicalModalAppt.visit_token_display } : null)}
        patient={clinicalModalAppt ? {
          id: clinicalModalAppt.patient_id,
          first_name: clinicalModalAppt.patient_first_name,
          last_name: clinicalModalAppt.patient_last_name,
          patient_number: clinicalModalAppt.patient_number,
        } : null}
        doctor={clinicalModalAppt ? {
          id: clinicalModalAppt.doctor_id,
          first_name: clinicalModalAppt.doctor_first_name,
          last_name: clinicalModalAppt.doctor_last_name,
        } : null}
        onUpdated={() => {
          loadDashboard();
        }}
      />

      {/* Pre-Consultation Vitals & Triage Assessment Modal */}
      <PreConsultVitalsModal
        isOpen={isVitalsModalOpen}
        onClose={() => {
          setIsVitalsModalOpen(false);
          setVitalsModalAppt(null);
        }}
        appointment={vitalsModalAppt}
        visit={vitalsModalAppt?.visit || (vitalsModalAppt?.visit_id ? { id: vitalsModalAppt.visit_id, token_display: vitalsModalAppt.visit_token_display } : null)}
        onSuccess={() => {
          loadDashboard();
        }}
      />
    </div>
  );
};

const CalendarClockIcon = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h5" />
    <circle cx="16" cy="16" r="6" />
    <path d="M16 14v2l1 1" />
  </svg>
);
