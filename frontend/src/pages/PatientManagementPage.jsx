import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { patientService } from '../services/patientService';
import { toast } from 'react-toastify';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Phone,
  Mail,
  Calendar,
  AlertTriangle,
  ShieldAlert,
  Edit,
  Eye,
  CheckCircle2,
  Building2,
  Clock,
  HeartPulse,
  ShieldCheck,
  AlertCircle,
  Ticket,
  ChevronRight,
  ListOrdered,
  PlusCircle,
  CheckCircle,
  XCircle,
  PlayCircle,
  FileText,
  Pill,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { DentalChart } from '../components/clinical/DentalChart/DentalChart';
import { TreatmentPlanManager } from '../components/clinical/TreatmentPlanning/TreatmentPlanManager';
import { PrescriptionManager } from '../components/clinical/Prescriptions/PrescriptionManager';
import { PatientTimelineTab } from '../components/clinical/Timeline/PatientTimelineTab';
import { VisitEncounterModal } from '../components/clinical/Timeline/VisitEncounterModal';

const CLINICAL_ROLES = ['admin', 'dentist', 'specialist', 'radiologist', 'assistant'];
const CLINICAL_EDIT_ROLES = ['admin', 'dentist', 'specialist'];

export const PatientManagementPage = () => {
  const { user } = useAuth();
  const { branches, activeBranch } = useBranch();

  const isClinical = CLINICAL_ROLES.includes(user?.role);
  const canEditMedical = CLINICAL_EDIT_ROLES.includes(user?.role);
  const canRegister = ['admin', 'dentist', 'specialist', 'receptionist', 'assistant'].includes(user?.role);
  const canChangeStatus = ['admin', 'dentist'].includes(user?.role);

  // Active view: 'directory' (Patient Master) or 'queue' (Today's Daily Tokens for Branch)
  const [activeView, setActiveView] = useState('directory');

  // Patient list & pagination state
  const [patients, setPatients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  // Today's branch queue state
  const [todayQueue, setTodayQueue] = useState([]);
  const [isQueueLoading, setIsQueueLoading] = useState(false);

  // Modals state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditMedicalModalOpen, setIsEditMedicalModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);

  // Active patient in view/edit
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedMedicalRecord, setSelectedMedicalRecord] = useState(null);
  const [patientVisits, setPatientVisits] = useState([]);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileTab, setProfileTab] = useState('overview'); // 'overview' | 'timeline' | 'visits' | 'medical'
  const [selectedEncounterVisitId, setSelectedEncounterVisitId] = useState(null);

  // Generated visit token receipt state
  const [generatedVisitReceipt, setGeneratedVisitReceipt] = useState(null);

  // Duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  // Registration form state
  const initialRegisterForm = {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'unspecified',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    branchId: activeBranch?.id || '',
    allergies: '',
    medicalConditions: '',
    currentMedications: '',
    medicalHistory: '',
    dentalTreatmentNotes: '',
    hasMedicalAlerts: false,
    medicalAlertDetails: '',
  };
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedPatientNumber, setGeneratedPatientNumber] = useState(null);

  // Visit creation form state
  const initialVisitForm = {
    branchId: activeBranch?.id || '',
    visitType: 'consultation',
    reasonForVisit: '',
    notes: '',
  };
  const [visitForm, setVisitForm] = useState(initialVisitForm);
  const [isCreatingVisit, setIsCreatingVisit] = useState(false);

  // Edit demographics form state
  const [editForm, setEditForm] = useState({});
  // Edit medical form state
  const [editMedicalForm, setEditMedicalForm] = useState({});
  // Status change form state
  const [statusForm, setStatusForm] = useState({ status: 'active', reason: '' });

  // Fetch patients list
  const fetchPatients = useCallback(async (page = 1, showRefreshToast = false) => {
    try {
      setIsLoading(true);
      const params = {
        page,
        limit: 10,
        search: searchQuery.trim(),
        branchId: activeBranch?.id || '',
        status: statusFilter,
      };

      const res = await patientService.getPatients(params);
      if (res && res.patients) {
        setPatients(res.patients);
        setPagination(res.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
        if (showRefreshToast) {
          toast.success('Patient registry synchronized.');
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load patient records.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [searchQuery, activeBranch?.id, statusFilter]);

  // Fetch today's branch queue
  const fetchTodayQueue = useCallback(async () => {
    if (!activeBranch?.id) return;
    try {
      setIsQueueLoading(true);
      const res = await patientService.getBranchDailyQueue(activeBranch.id);
      if (res && res.queue) {
        setTodayQueue(res.queue);
      }
    } catch (err) {
      console.warn('Failed to load daily queue:', err.message);
    } finally {
      setIsQueueLoading(false);
    }
  }, [activeBranch?.id]);

  useEffect(() => {
    if (activeView === 'directory') {
      fetchPatients(1);
    } else {
      fetchTodayQueue();
    }
  }, [activeView, fetchPatients, fetchTodayQueue]);

  // Handle duplicate check on registration phone blur
  const handlePhoneBlur = async () => {
    if (!registerForm.phone || registerForm.phone.trim().length < 8) {
      setDuplicateWarning(null);
      return;
    }

    try {
      setIsCheckingDuplicate(true);
      const res = await patientService.checkDuplicate(registerForm.phone.trim(), registerForm.email?.trim());
      if (res && res.hasDuplicate && res.duplicates?.length > 0) {
        setDuplicateWarning(res.duplicates[0]);
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // Non-blocking duplicate check error
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  // Open full patient profile
  const handleViewProfile = async (patientId) => {
    try {
      setIsProfileLoading(true);
      setIsProfileModalOpen(true);
      setProfileTab('overview');
      const [patientRes, visitsRes] = await Promise.all([
        patientService.getPatientById(patientId),
        patientService.getPatientVisits(patientId),
      ]);

      if (patientRes && patientRes.patient) {
        setSelectedPatient(patientRes.patient);
        setSelectedMedicalRecord(patientRes.medicalRecord);
      }
      if (visitsRes && visitsRes.visits) {
        setPatientVisits(visitsRes.visits);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch patient profile.');
      setIsProfileModalOpen(false);
    } finally {
      setIsProfileLoading(false);
    }
  };

  // Handle patient registration submission
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!registerForm.firstName.trim() || !registerForm.phone.trim()) {
      toast.warn('First name and mobile phone are required fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        ...registerForm,
        branchId: registerForm.branchId || activeBranch?.id,
      };

      const res = await patientService.registerPatient(payload);
      if (res && res.success) {
        setGeneratedPatientNumber(res.patient.patient_number);
        toast.success(`Patient registered successfully. Permanent Patient ID: ${res.patient.patient_number}`);
        fetchPatients(1);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.join(', ') || 'Registration failed.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open visit creation modal for a patient
  const handleOpenCreateVisit = (patient) => {
    setSelectedPatient(patient);
    setGeneratedVisitReceipt(null);
    setVisitForm({
      branchId: activeBranch?.id || patient.branch_id || branches[0]?.id || '',
      visitType: 'consultation',
      reasonForVisit: '',
      notes: '',
    });
    setIsVisitModalOpen(true);
  };

  // Submit new visit creation and token generation
  const handleVisitSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatient?.id) return;

    try {
      setIsCreatingVisit(true);
      const res = await patientService.createVisit(selectedPatient.id, visitForm);
      if (res && res.success) {
        setGeneratedVisitReceipt({
          patientId: res.patient?.patient_number || selectedPatient.patient_number,
          patientName: `${res.patient?.first_name || selectedPatient.first_name} ${res.patient?.last_name || selectedPatient.last_name || ''}`,
          tokenDisplay: res.visit.token_display,
          visitDate: res.visit.visit_date,
          branchName: res.visit.branch_name,
          branchCode: res.visit.branch_code,
          status: res.visit.status,
        });
        toast.success(`Visit token ${res.visit.token_display} issued for ${res.visit.branch_name}`);
        if (activeView === 'queue') {
          fetchTodayQueue();
        }
        if (isProfileModalOpen) {
          const visitsRes = await patientService.getPatientVisits(selectedPatient.id);
          if (visitsRes && visitsRes.visits) {
            setPatientVisits(visitsRes.visits);
          }
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create visit and allocate token.');
    } finally {
      setIsCreatingVisit(false);
    }
  };

  // Update visit status in daily queue
  const handleUpdateVisitStatus = async (visitId, newStatus) => {
    try {
      await patientService.updateVisitStatus(visitId, newStatus);
      toast.success(`Visit status updated to '${newStatus}'.`);
      fetchTodayQueue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update visit status.');
    }
  };

  // Open edit demographics modal
  const handleOpenEdit = (patient) => {
    setSelectedPatient(patient);
    setEditForm({
      firstName: patient.first_name || '',
      lastName: patient.last_name || '',
      dateOfBirth: patient.date_of_birth ? patient.date_of_birth.split('T')[0] : '',
      gender: patient.gender || 'unspecified',
      phone: patient.phone || '',
      email: patient.email || '',
      address: patient.address || '',
      city: patient.city || '',
      state: patient.state || '',
      postalCode: patient.postal_code || '',
      emergencyContactName: patient.emergency_contact_name || '',
      emergencyContactPhone: patient.emergency_contact_phone || '',
      emergencyContactRelation: patient.emergency_contact_relation || '',
    });
    setIsEditModalOpen(true);
  };

  // Submit edit demographics
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.firstName?.trim() || !editForm.phone?.trim()) {
      toast.warn('First name and phone cannot be empty.');
      return;
    }

    try {
      setIsSubmitting(true);
      await patientService.updatePatient(selectedPatient.id, editForm);
      toast.success('Patient demographics updated.');
      setIsEditModalOpen(false);
      fetchPatients(pagination.page);
      if (isProfileModalOpen) {
        handleViewProfile(selectedPatient.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update patient.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit medical modal
  const handleOpenEditMedical = (patient, medicalRecord) => {
    setSelectedPatient(patient);
    setSelectedMedicalRecord(medicalRecord);
    setEditMedicalForm({
      allergies: medicalRecord?.allergies || '',
      medicalConditions: medicalRecord?.medical_conditions || '',
      currentMedications: medicalRecord?.current_medications || '',
      medicalHistory: medicalRecord?.medical_history || '',
      dentalTreatmentNotes: medicalRecord?.dental_treatment_notes || '',
      hasMedicalAlerts: Boolean(medicalRecord?.has_medical_alerts),
      medicalAlertDetails: medicalRecord?.medical_alert_details || '',
    });
    setIsEditMedicalModalOpen(true);
  };

  // Submit edit medical
  const handleEditMedicalSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await patientService.updateMedicalRecord(selectedPatient.id, editMedicalForm);
      toast.success('Patient medical record updated.');
      setIsEditMedicalModalOpen(false);
      fetchPatients(pagination.page);
      if (isProfileModalOpen) {
        handleViewProfile(selectedPatient.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update medical record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open status modal
  const handleOpenStatus = (patient) => {
    setSelectedPatient(patient);
    setStatusForm({
      status: patient.status || 'active',
      reason: '',
    });
    setIsStatusModalOpen(true);
  };

  // Submit status update
  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await patientService.updatePatientStatus(selectedPatient.id, statusForm.status, statusForm.reason);
      toast.success(`Patient record status updated to ${statusForm.status}.`);
      setIsStatusModalOpen(false);
      fetchPatients(pagination.page);
      if (isProfileModalOpen) {
        handleViewProfile(selectedPatient.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metrics summary
  const metrics = useMemo(() => {
    const total = pagination.total || patients.length;
    const active = patients.filter((p) => p.status === 'active').length;
    const withAlerts = patients.filter((p) => p.has_medical_alerts).length;
    const todayTokens = todayQueue.length;
    return { total, active, withAlerts, todayTokens };
  }, [patients, pagination.total, todayQueue.length]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Patient Management & Encounters"
        subtitle="Permanent organization-wide Patient IDs, cross-branch clinical registry, and daily branch visit tokens"
      >
        <div className="flex items-center space-x-3">
          {/* View Toggle */}
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
            <button
              type="button"
              onClick={() => setActiveView('directory')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center space-x-1.5 ${
                activeView === 'directory'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Patient Directory</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('queue')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center space-x-1.5 ${
                activeView === 'queue'
                  ? 'bg-white text-teal-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Today's Visit Queue</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsRefreshing(true);
              if (activeView === 'directory') {
                fetchPatients(pagination.page, true);
              } else {
                fetchTodayQueue();
              }
            }}
            disabled={isRefreshing || isLoading || isQueueLoading}
            className="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sync
          </button>

          {canRegister && (
            <button
              type="button"
              onClick={() => {
                setGeneratedPatientNumber(null);
                setDuplicateWarning(null);
                setRegisterForm({
                  ...initialRegisterForm,
                  branchId: activeBranch?.id || branches[0]?.id || '',
                });
                setIsRegisterModalOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 transition shadow-xs"
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              Register Patient
            </button>
          )}
        </div>
      </PageHeader>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Total Registered Patients"
          value={metrics.total}
          icon={Users}
          color="teal"
          caption="Permanent numeric IDs (100001+)"
        />
        <MetricCard
          title="Active Care Recipients"
          value={metrics.active}
          icon={ShieldCheck}
          color="emerald"
          caption="Active clinical master records"
        />
        <MetricCard
          title="Medical Alert Surveillance"
          value={metrics.withAlerts}
          icon={AlertTriangle}
          color="amber"
          caption="High-risk allergies & conditions"
        />
        <MetricCard
          title={`Today's Queue (${activeBranch?.branch_code || 'Branch'})`}
          value={metrics.todayTokens}
          icon={Ticket}
          color="indigo"
          caption="Daily branch visit tokens (001+)"
        />
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: PATIENT DIRECTORY                                                 */}
      {/* ========================================================================= */}
      {activeView === 'directory' && (
        <>
          {/* Search, Filter, and Controls Bar */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              {/* Search Field */}
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Patient ID (e.g. 100001), name, or phone..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* Assigned Branch Badge */}
                <div 
                  className="flex items-center space-x-1.5 text-xs bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-slate-700 font-medium select-none"
                  title="Branch context is locked to your assigned branch"
                >
                  <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                    {activeBranch?.branch_name || 'Assigned Branch'}
                  </span>
                  {activeBranch?.branch_code && (
                    <span className="font-mono text-[10px] bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                      {activeBranch.branch_code}
                    </span>
                  )}
                </div>

                {/* Status Filter */}
                <div className="flex items-center space-x-1.5 text-xs">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="py-1.5 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-700"
                  >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Patient Master Table */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center">
                <RefreshCw className="w-8 h-8 text-teal-500 animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold text-slate-500">Loading patient registry records...</p>
              </div>
            ) : patients.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No Patient Records Found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {searchQuery || branchFilter || statusFilter
                    ? 'No matching patient records meet your search criteria. Try adjusting filters.'
                    : 'Get started by registering the first patient in your clinic organization.'}
                </p>
                {canRegister && (
                  <button
                    type="button"
                    onClick={() => {
                      setGeneratedPatientNumber(null);
                      setDuplicateWarning(null);
                      setRegisterForm({
                        ...initialRegisterForm,
                        branchId: activeBranch?.id || branches[0]?.id || '',
                      });
                      setIsRegisterModalOpen(true);
                    }}
                    className="mt-4 inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition"
                  >
                    <UserPlus className="w-4 h-4 mr-1.5" />
                    Register First Patient
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">Patient ID</th>
                      <th className="py-3.5 px-4">Patient Name</th>
                      <th className="py-3.5 px-4">Contact</th>
                      <th className="py-3.5 px-4">Registration Branch</th>
                      <th className="py-3.5 px-4">Medical Alert Status</th>
                      <th className="py-3.5 px-4">Registered Date</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {patients.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition group">
                        {/* Permanent Numeric Patient ID (Digits only) */}
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-1 rounded border border-teal-200 inline-block shadow-2xs">
                            {p.patient_number}
                          </span>
                          {p.legacy_patient_number && (
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              Legacy: {p.legacy_patient_number}
                            </span>
                          )}
                        </td>

                        {/* Patient Name */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                            <span>{p.first_name} {p.last_name || ''}</span>
                            {p.gender && p.gender !== 'unspecified' && (
                              <span className="text-[10px] text-slate-400 capitalize font-medium">
                                ({p.gender[0]})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="py-3.5 px-4 text-slate-600">
                          <div className="flex items-center space-x-1 font-mono text-[11px] text-slate-800">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{p.phone}</span>
                          </div>
                          {p.email && (
                            <div className="flex items-center space-x-1 text-[11px] text-slate-500 mt-0.5 truncate max-w-[160px]">
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{p.email}</span>
                            </div>
                          )}
                        </td>

                        {/* Registered Branch */}
                        <td className="py-3.5 px-4 text-slate-600">
                          <span className="font-semibold text-slate-800 block text-[11px]">
                            {p.branch_name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {p.branch_code}
                          </span>
                        </td>

                        {/* Medical Alert Status */}
                        <td className="py-3.5 px-4">
                          {p.has_medical_alerts ? (
                            <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                              <AlertTriangle className="w-3 h-3 mr-1 text-amber-600 shrink-0" />
                              <span className="truncate max-w-[140px]" title={p.medical_alert_details || 'Medical Alert'}>
                                {p.medical_alert_details || 'High Risk Alert'}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center text-slate-400 text-[11px]">
                              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-slate-300" />
                              Standard
                            </span>
                          )}
                        </td>

                        {/* Registered Date */}
                        <td className="py-3.5 px-4 text-slate-600 text-[11px]">
                          {p.registration_date ? new Date(p.registration_date).toLocaleDateString() : '—'}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <StatusBadge status={p.status} />
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Create Visit Action */}
                            <button
                              type="button"
                              onClick={() => handleOpenCreateVisit(p)}
                              className="inline-flex items-center px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-md font-bold text-[11px] transition"
                              title="Create Visit / Generate Daily Token"
                            >
                              <Ticket className="w-3 h-3 mr-1 text-teal-600" />
                              <span>Visit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleViewProfile(p.id)}
                              className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition"
                              title="View Patient Profile, Encounters & Medical History"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEdit(p)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                              title="Edit Demographics"
                            >
                              <Edit className="w-4 h-4" />
                            </button>

                            {canChangeStatus && (
                              <button
                                type="button"
                                onClick={() => handleOpenStatus(p)}
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition"
                                title="Update Record Status"
                              >
                                <Clock className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {pagination.totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[11px] text-slate-500">
                      Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} patients
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => fetchPatients(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                        className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-semibold text-slate-700">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => fetchPatients(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: TODAY'S VISIT QUEUE (Branch Token Surveillance)                  */}
      {/* ========================================================================= */}
      {activeView === 'queue' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <Ticket className="w-4 h-4 mr-2 text-indigo-600" />
                <span>Today's Branch Visit Queue — {activeBranch?.branch_name || 'Active Location'}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sequential daily tokens (001, 002...) scoped to this branch location for today.
              </p>
            </div>
            <span className="px-3 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg font-mono text-xs font-bold">
              {todayQueue.length} Encounters Today
            </span>
          </div>

          {isQueueLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-500">Loading daily branch visit queue...</p>
            </div>
          ) : todayQueue.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                <Ticket className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Visits Queued Today</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No patient tokens have been generated yet for {activeBranch?.branch_name} on today's date.
              </p>
              <button
                type="button"
                onClick={() => setActiveView('directory')}
                className="mt-4 inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition"
              >
                Find Patient & Issue Token
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Daily Token</th>
                    <th className="py-3 px-4">Patient ID</th>
                    <th className="py-3 px-4">Patient Name</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Reason / Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Queue Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todayQueue.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm font-extrabold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-200 inline-block">
                          #{v.token_display}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {v.patient_number}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                          <span>{v.first_name} {v.last_name || ''}</span>
                          {v.has_medical_alerts && (
                            <span className="p-0.5 rounded-sm bg-rose-100 text-rose-700" title={v.medical_alert_details}>
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700">
                        {v.phone}
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        <span className="capitalize font-semibold text-slate-800 block text-[11px]">
                          {v.visit_type}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate block max-w-xs">
                          {v.reason_for_visit || 'Routine checkup'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            v.status === 'queued'
                              ? 'bg-amber-100 text-amber-800'
                              : v.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800 animate-pulse'
                              : v.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {v.status.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {v.status === 'queued' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateVisitStatus(v.id, 'in_progress')}
                              className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-bold hover:bg-blue-100"
                            >
                              Call In
                            </button>
                          )}

                          {v.status === 'in_progress' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateVisitStatus(v.id, 'completed')}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px] font-bold hover:bg-emerald-100"
                            >
                              Complete
                            </button>
                          )}

                          {v.status !== 'completed' && v.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateVisitStatus(v.id, 'cancelled')}
                              className="px-2 py-1 bg-slate-50 text-slate-600 border border-slate-200 rounded text-[11px] font-semibold hover:bg-rose-50 hover:text-rose-700"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. Register Patient Modal (Permanent Numeric Patient ID)                  */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => {
          setIsRegisterModalOpen(false);
          setGeneratedPatientNumber(null);
        }}
        title="Register New Patient"
        subtitle="Permanent organization-wide Patient ID starting at 100001"
        maxWidth="max-w-3xl"
      >
        {generatedPatientNumber ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Registration Complete</h4>
            <p className="text-xs text-slate-600 max-w-md mx-auto">
              The patient has been assigned a permanent, clinic-organization-wide numeric ID:
            </p>
            <div className="inline-block py-2.5 px-8 rounded-xl bg-slate-900 text-teal-400 font-mono text-2xl font-extrabold tracking-widest shadow-inner border border-slate-800">
              {generatedPatientNumber}
            </div>
            <p className="text-[11px] text-slate-400">
              This permanent numeric ID applies across all branches under your clinic organization.
            </p>
            <div className="pt-4 flex justify-center space-x-3">
              <button
                type="button"
                onClick={() => {
                  setGeneratedPatientNumber(null);
                  setRegisterForm({
                    ...initialRegisterForm,
                    branchId: activeBranch?.id || branches[0]?.id || '',
                  });
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Register Another Patient
              </button>
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-bold hover:bg-teal-700 transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Duplicate Patient Warning Banner */}
            {duplicateWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2.5 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Potential Duplicate Patient Detected:</span>
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    A patient with this mobile number already exists: <strong>{duplicateWarning.first_name} {duplicateWarning.last_name || ''}</strong> (ID: {duplicateWarning.patient_number}) registered at {duplicateWarning.branch_name}. Please verify before creating a new master record.
                  </p>
                </div>
              </div>
            )}

            {/* Section 1: Personal Information */}
            <div>
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 mb-3">
                <Users className="w-4 h-4 text-teal-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  1. Personal Information
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={registerForm.firstName}
                    onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                    placeholder="e.g. Robert"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={registerForm.lastName}
                    onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                    placeholder="e.g. Taylor"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Registration Branch</label>
                  <div className="flex items-center space-x-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                    <Building2 className="w-3.5 h-3.5 text-teal-600" />
                    <span>{activeBranch?.branch_name || 'Assigned Branch'}</span>
                    {activeBranch?.branch_code && (
                      <span className="font-mono text-[10px] bg-teal-50 text-teal-800 border border-teal-200/60 px-1.5 py-0.5 rounded">
                        {activeBranch.branch_code}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={registerForm.dateOfBirth}
                    onChange={(e) => setRegisterForm({ ...registerForm, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Gender</label>
                  <select
                    value={registerForm.gender}
                    onChange={(e) => setRegisterForm({ ...registerForm, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="unspecified">Unspecified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 2: Contact Information */}
            <div>
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 mb-3">
                <Phone className="w-4 h-4 text-teal-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  2. Contact & Address
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Mobile Phone <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={registerForm.phone}
                    onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                    onBlur={handlePhoneBlur}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                    placeholder="patient@example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={registerForm.address}
                    onChange={(e) => setRegisterForm({ ...registerForm, address: e.target.value })}
                    placeholder="House / Street / Area"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={registerForm.city}
                    onChange={(e) => setRegisterForm({ ...registerForm, city: e.target.value })}
                    placeholder="City"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">State</label>
                    <input
                      type="text"
                      value={registerForm.state}
                      onChange={(e) => setRegisterForm({ ...registerForm, state: e.target.value })}
                      placeholder="State"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Postal Code</label>
                    <input
                      type="text"
                      value={registerForm.postalCode}
                      onChange={(e) => setRegisterForm({ ...registerForm, postalCode: e.target.value })}
                      placeholder="e.g. 400001"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Emergency Contact */}
            <div>
              <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 mb-3">
                <AlertCircle className="w-4 h-4 text-teal-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  3. Emergency Contact
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={registerForm.emergencyContactName}
                    onChange={(e) => setRegisterForm({ ...registerForm, emergencyContactName: e.target.value })}
                    placeholder="Full name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Emergency Phone</label>
                  <input
                    type="text"
                    value={registerForm.emergencyContactPhone}
                    onChange={(e) => setRegisterForm({ ...registerForm, emergencyContactPhone: e.target.value })}
                    placeholder="+91..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Relationship</label>
                  <input
                    type="text"
                    value={registerForm.emergencyContactRelation}
                    onChange={(e) => setRegisterForm({ ...registerForm, emergencyContactRelation: e.target.value })}
                    placeholder="Spouse / Parent / Sibling"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Medical Information & Alerts */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                <div className="flex items-center space-x-2">
                  <HeartPulse className="w-4 h-4 text-rose-500" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    4. Medical Information & Clinical Safety Alerts
                  </h4>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registerForm.hasMedicalAlerts}
                    onChange={(e) => setRegisterForm({ ...registerForm, hasMedicalAlerts: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded-sm focus:ring-amber-500"
                  />
                  <span className="ml-2 text-xs font-bold text-amber-700">Flag as High-Risk Alert</span>
                </label>
              </div>

              {registerForm.hasMedicalAlerts && (
                <div className="mb-3 p-3 bg-amber-50/80 border border-amber-200 rounded-lg">
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">
                    Alert Headline Details <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={registerForm.medicalAlertDetails}
                    onChange={(e) => setRegisterForm({ ...registerForm, medicalAlertDetails: e.target.value })}
                    placeholder="e.g. Allergic to Penicillin; Requires prophylactic antibiotics"
                    className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white font-medium"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Known Allergies</label>
                  <input
                    type="text"
                    value={registerForm.allergies}
                    onChange={(e) => setRegisterForm({ ...registerForm, allergies: e.target.value })}
                    placeholder="e.g. Penicillin, Latex, NSAIDs"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Current Medications</label>
                  <input
                    type="text"
                    value={registerForm.currentMedications}
                    onChange={(e) => setRegisterForm({ ...registerForm, currentMedications: e.target.value })}
                    placeholder="e.g. Blood thinners, Metformin, Inhaler"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Existing Medical Conditions</label>
                  <input
                    type="text"
                    value={registerForm.medicalConditions}
                    onChange={(e) => setRegisterForm({ ...registerForm, medicalConditions: e.target.value })}
                    placeholder="e.g. Hypertension, Diabetes, Asthma"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Dental Treatment Precautions / Notes</label>
                  <input
                    type="text"
                    value={registerForm.dentalTreatmentNotes}
                    onChange={(e) => setRegisterForm({ ...registerForm, dentalTreatmentNotes: e.target.value })}
                    placeholder="e.g. Severe dental anxiety, Sensitive gums"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 inline-flex items-center"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Registering...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    Save & Generate Permanent Patient ID
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 2. Create Visit & Daily Token Modal                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isVisitModalOpen}
        onClose={() => {
          setIsVisitModalOpen(false);
          setGeneratedVisitReceipt(null);
        }}
        title="Create Patient Visit / Generate Daily Token"
        subtitle={selectedPatient ? `Patient: ${selectedPatient.first_name} ${selectedPatient.last_name || ''} (ID: ${selectedPatient.patient_number})` : ''}
        maxWidth="max-w-lg"
      >
        {generatedVisitReceipt ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
              <Ticket className="w-6 h-6" />
            </div>

            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Daily Visit Token Issued
            </h4>

            {/* Token Badge */}
            <div className="p-5 bg-gradient-to-br from-indigo-50 to-slate-50 rounded-2xl border-2 border-indigo-200 text-center space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 font-mono">
                Daily Branch Queue Token
              </span>
              <div className="text-4xl font-mono font-extrabold text-indigo-800 tracking-wider">
                #{generatedVisitReceipt.tokenDisplay}
              </div>
              <div className="text-xs font-semibold text-slate-600 pt-1">
                {generatedVisitReceipt.branchName} ({generatedVisitReceipt.branchCode})
              </div>
            </div>

            {/* Explicit Spec Details */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Permanent Patient ID:</span>
                <span className="font-mono font-bold text-slate-900">{generatedVisitReceipt.patientId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Patient Full Name:</span>
                <span className="font-semibold text-slate-900">{generatedVisitReceipt.patientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Visit Token:</span>
                <span className="font-mono font-bold text-indigo-700">{generatedVisitReceipt.tokenDisplay}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Encounter Branch:</span>
                <span className="font-medium text-slate-800">{generatedVisitReceipt.branchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Visit Date:</span>
                <span className="font-medium text-slate-800">{new Date(generatedVisitReceipt.visitDate).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Encounter Status:</span>
                <span className="font-bold text-amber-700 uppercase text-[10px]">{generatedVisitReceipt.status}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsVisitModalOpen(false);
                setGeneratedVisitReceipt(null);
              }}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
            >
              Close & Print Token
            </button>
          </div>
        ) : (
          <form onSubmit={handleVisitSubmit} className="p-6 space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Permanent Patient ID:</span>
                <span className="font-mono font-bold text-slate-900">{selectedPatient?.patient_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Patient Name:</span>
                <span className="font-semibold text-slate-800">{selectedPatient?.first_name} {selectedPatient?.last_name || ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Registered Branch:</span>
                <span className="text-slate-700">{selectedPatient?.branch_name}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Encounter Branch <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center space-x-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{activeBranch?.branch_name || 'Assigned Branch'}</span>
                  {activeBranch?.branch_code && (
                    <span className="font-mono text-[10px] bg-indigo-50 text-indigo-800 border border-indigo-200/60 px-1.5 py-0.5 rounded">
                      {activeBranch.branch_code}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Daily token will be generated from your assigned branch's daily sequence (001, 002...).
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Visit Type</label>
                <select
                  value={visitForm.visitType}
                  onChange={(e) => setVisitForm({ ...visitForm, visitType: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none capitalize font-medium"
                >
                  <option value="consultation">Consultation</option>
                  <option value="checkup">Routine Checkup</option>
                  <option value="treatment">Treatment / Procedure</option>
                  <option value="emergency">Emergency / Acute Pain</option>
                  <option value="follow_up">Follow-Up Review</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Reason for Visit</label>
                <input
                  type="text"
                  value={visitForm.reasonForVisit}
                  onChange={(e) => setVisitForm({ ...visitForm, reasonForVisit: e.target.value })}
                  placeholder="e.g. Tooth sensitivity, scaling, cavity check"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Clinical Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={visitForm.notes}
                  onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })}
                  placeholder="Any front desk or chairside instructions"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsVisitModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingVisit}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 inline-flex items-center"
              >
                {isCreatingVisit ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Allocating Token...
                  </>
                ) : (
                  <>
                    <Ticket className="w-3.5 h-3.5 mr-1.5" />
                    Generate Visit Token
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 3. Patient Profile Drawer (With Visit History & Medical Tabs)             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          setSelectedPatient(null);
          setSelectedMedicalRecord(null);
          setPatientVisits([]);
        }}
        title={selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name || ''}` : 'Patient Profile'}
        subtitle={selectedPatient ? `Permanent Patient ID: ${selectedPatient.patient_number}` : ''}
        maxWidth={['dental_chart', 'treatment_plans', 'prescriptions', 'timeline'].includes(profileTab) ? 'max-w-6xl' : 'max-w-2xl'}
      >
        {isProfileLoading || !selectedPatient ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 text-teal-500 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Loading patient profile...</p>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Header Action Strip */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-extrabold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                  Patient ID: {selectedPatient.patient_number}
                </span>
                <span className="text-xs text-slate-500">
                  Registered at: <strong className="text-slate-800">{selectedPatient.branch_name}</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleOpenCreateVisit(selectedPatient)}
                className="inline-flex items-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
              >
                <Ticket className="w-3.5 h-3.5 mr-1.5" />
                <span>Create Visit / Token</span>
              </button>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex space-x-2 border-b border-slate-200 pb-1 text-xs">
              <button
                type="button"
                onClick={() => setProfileTab('overview')}
                className={`py-1.5 px-3 rounded-lg font-bold transition ${
                  profileTab === 'overview'
                    ? 'bg-slate-100 text-slate-900 border-b-2 border-teal-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Demographics
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('timeline')}
                className={`py-1.5 px-3 rounded-lg font-bold transition flex items-center space-x-1 ${
                  profileTab === 'timeline'
                    ? 'bg-slate-100 text-slate-900 border-b-2 border-indigo-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Medical Timeline</span>
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('visits')}
                className={`py-1.5 px-3 rounded-lg font-bold transition flex items-center space-x-1 ${
                  profileTab === 'visits'
                    ? 'bg-slate-100 text-slate-900 border-b-2 border-indigo-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Ticket className="w-3.5 h-3.5 text-indigo-600" />
                <span>Visit History ({patientVisits.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('medical')}
                className={`py-1.5 px-3 rounded-lg font-bold transition flex items-center space-x-1 ${
                  profileTab === 'medical'
                    ? 'bg-slate-100 text-slate-900 border-b-2 border-rose-500'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                <span>Medical Alerts</span>
              </button>
              {isClinical && (
                <button
                  type="button"
                  onClick={() => setProfileTab('dental_chart')}
                  className={`py-1.5 px-3 rounded-lg font-bold transition flex items-center space-x-1 ${
                    profileTab === 'dental_chart'
                      ? 'bg-slate-100 text-slate-900 border-b-2 border-teal-600'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-[9px]">
                    #
                  </span>
                  <span>Dental Baseline</span>
                </button>
              )}
              {isClinical && (
                <button
                  type="button"
                  onClick={() => setProfileTab('treatment_plans')}
                  className={`py-1.5 px-3 rounded-lg font-bold transition flex items-center space-x-1 ${
                    profileTab === 'treatment_plans'
                      ? 'bg-slate-100 text-slate-900 border-b-2 border-teal-600'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                  <span>Treatment Plans</span>
                </button>
              )}
              {isClinical && (
                <button
                  type="button"
                  onClick={() => setProfileTab('prescriptions')}
                  className={`py-1.5 px-3 rounded-lg font-bold transition flex items-center space-x-1 ${
                    profileTab === 'prescriptions'
                      ? 'bg-slate-100 text-slate-900 border-b-2 border-teal-600'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Pill className="w-3.5 h-3.5 text-teal-600" />
                  <span>Prescriptions</span>
                </button>
              )}
            </div>

            {/* Tab 1: Overview & Demographics */}
            {profileTab === 'overview' && (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-200/80 pb-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                      <Users className="w-3.5 h-3.5 mr-1.5 text-teal-600" />
                      Demographics Profile
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(selectedPatient)}
                      className="inline-flex items-center px-2 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit Demographics
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone</span>
                      <span className="font-mono font-semibold text-slate-900">{selectedPatient.phone}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Email</span>
                      <span className="text-slate-800">{selectedPatient.email || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Gender</span>
                      <span className="capitalize text-slate-800">{selectedPatient.gender || 'Unspecified'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Date of Birth</span>
                      <span className="text-slate-800">
                        {selectedPatient.date_of_birth ? new Date(selectedPatient.date_of_birth).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Registered Branch</span>
                      <span className="font-semibold text-slate-800">{selectedPatient.branch_name}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Record Status</span>
                      <StatusBadge status={selectedPatient.status} />
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Residential Address</span>
                      <span className="text-slate-800">
                        {[selectedPatient.address, selectedPatient.city, selectedPatient.state, selectedPatient.postal_code]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center mb-2">
                    <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-teal-600" />
                    Emergency Contact
                  </span>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Name</span>
                      <span className="text-slate-900 font-medium">{selectedPatient.emergency_contact_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone</span>
                      <span className="font-mono text-slate-900">{selectedPatient.emergency_contact_phone || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Relationship</span>
                      <span className="text-slate-900">{selectedPatient.emergency_contact_relation || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Visit-Wise Patient History & Unified Medical Record Timeline */}
            {profileTab === 'timeline' && (
              <PatientTimelineTab
                patient={selectedPatient}
                patientVisits={patientVisits}
                isClinical={isClinical}
              />
            )}

            {/* Tab 2: Visit History & Cross-Branch Encounters */}
            {profileTab === 'visits' && (
              <div className="space-y-3">
                {patientVisits.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    <Ticket className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                    No previous visits recorded for this patient. Click "Create Visit / Token" above to check in.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                    {patientVisits.map((visit) => (
                      <div
                        key={visit.id}
                        data-visit-row={visit.token_display}
                        onClick={() => setSelectedEncounterVisitId(visit.id)}
                        className="p-3.5 bg-white hover:bg-indigo-50/40 cursor-pointer transition flex items-center justify-between text-xs group"
                        title="Click visit row to view complete encounter records"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="font-mono text-xs font-extrabold text-indigo-700 bg-indigo-50 group-hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 transition">
                            #{visit.token_display}
                          </span>
                          <div>
                            <span className="font-bold text-slate-900 block group-hover:text-indigo-950 transition">
                              {visit.branch_name} ({visit.branch_code})
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {new Date(visit.visit_date).toLocaleDateString()} &bull; <span className="capitalize">{visit.visit_type}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              visit.status === 'queued'
                                ? 'bg-amber-100 text-amber-800'
                                : visit.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : visit.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {visit.status.replace('_', ' ')}
                          </span>

                          <button
                            type="button"
                            data-action="view-encounter-records"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEncounterVisitId(visit.id);
                            }}
                            className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition shadow-2xs"
                            title="Open Single-Screen Encounter Records"
                          >
                            <Eye className="w-3 h-3 mr-1 text-indigo-600" />
                            <span>View Records</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Medical Information & Clinical Safety Alerts */}
            {profileTab === 'medical' && (
              <div className="space-y-4">
                {selectedMedicalRecord?.has_medical_alerts && (
                  <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex items-start space-x-3">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wide">
                        Clinical Safety Alert
                      </h4>
                      <p className="text-xs font-bold text-rose-800 mt-0.5">
                        {selectedMedicalRecord.medical_alert_details || 'High-Risk Condition Recorded'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-200/80 pb-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
                      <HeartPulse className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
                      Medical History & Dental Notes
                    </span>
                    {canEditMedical && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditMedical(selectedPatient, selectedMedicalRecord)}
                        className="inline-flex items-center px-2 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit Medical Profile
                      </button>
                    )}
                  </div>

                  {isClinical ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Allergies</span>
                        <p className="font-semibold text-rose-700 bg-rose-50/60 p-2 rounded-lg border border-rose-100 mt-1">
                          {selectedMedicalRecord?.allergies || 'None recorded (confirmed negative)'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Medications</span>
                        <p className="text-slate-800 bg-white p-2 rounded-lg border border-slate-200 mt-1">
                          {selectedMedicalRecord?.current_medications || 'None recorded'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Medical Conditions</span>
                        <p className="text-slate-800 bg-white p-2 rounded-lg border border-slate-200 mt-1">
                          {selectedMedicalRecord?.medical_conditions || 'None reported'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Dental Treatment Precautions</span>
                        <p className="text-slate-800 bg-white p-2 rounded-lg border border-slate-200 mt-1">
                          {selectedMedicalRecord?.dental_treatment_notes || 'Standard protocol'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-100 rounded-lg text-slate-500 text-xs text-center">
                      <ShieldAlert className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                      Detailed clinical notes and medications are restricted to clinical practitioners for patient privacy.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Dental Baseline (Odontogram) */}
            {profileTab === 'dental_chart' && (
              <div className="space-y-3">
                <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg flex items-center justify-between text-xs text-teal-900">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold">Patient Dental Baseline</span>
                    <span className="text-[11px] text-teal-700">
                      (Cumulative lifelong state across all encounters)
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    To record new findings, launch an active encounter from Reception Desk or queue.
                  </span>
                </div>
                <DentalChart
                  patient={selectedPatient}
                  isReadOnly={true}
                />
              </div>
            )}

            {/* Tab 5: Lifetime Treatment Plans */}
            {profileTab === 'treatment_plans' && (
              <div className="space-y-3">
                <TreatmentPlanManager
                  patient={selectedPatient}
                  isReadOnly={!canEditMedical}
                />
              </div>
            )}

            {/* Tab 6: Lifetime Prescriptions & Medication History */}
            {profileTab === 'prescriptions' && (
              <div className="space-y-3">
                <PrescriptionManager
                  patient={selectedPatient}
                  isReadOnly={!canEditMedical}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 4. Edit Patient Demographics Modal                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Patient Demographics"
        subtitle={selectedPatient ? `Updating records for Permanent Patient ID: ${selectedPatient.patient_number}` : ''}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={editForm.firstName || ''}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Last Name</label>
              <input
                type="text"
                value={editForm.lastName || ''}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone *</label>
              <input
                type="text"
                required
                value={editForm.phone || ''}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={editForm.email || ''}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Gender</label>
              <select
                value={editForm.gender || 'unspecified'}
                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              >
                <option value="unspecified">Unspecified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={editForm.dateOfBirth || ''}
                onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={editForm.address || ''}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={editForm.city || ''}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Postal Code</label>
              <input
                type="text"
                value={editForm.postalCode || ''}
                onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Update Demographics'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 5. Edit Medical Record Modal                                             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditMedicalModalOpen}
        onClose={() => setIsEditMedicalModalOpen(false)}
        title="Update Patient Medical Profile"
        subtitle="Clinical medical records and high-priority treatment alert surveillance"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleEditMedicalSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
            <label className="inline-flex items-center cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={editMedicalForm.hasMedicalAlerts || false}
                onChange={(e) => setEditMedicalForm({ ...editMedicalForm, hasMedicalAlerts: e.target.checked })}
                className="w-4 h-4 text-amber-600 rounded-sm focus:ring-amber-500"
              />
              <span className="ml-2 text-xs font-bold text-amber-900">Flag as High-Risk Medical Alert</span>
            </label>

            {editMedicalForm.hasMedicalAlerts && (
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  Alert Details Headline
                </label>
                <input
                  type="text"
                  value={editMedicalForm.medicalAlertDetails || ''}
                  onChange={(e) => setEditMedicalForm({ ...editMedicalForm, medicalAlertDetails: e.target.value })}
                  placeholder="e.g. Severe Penicillin Allergy"
                  className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white font-medium"
                />
              </div>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Known Allergies</label>
              <textarea
                rows={2}
                value={editMedicalForm.allergies || ''}
                onChange={(e) => setEditMedicalForm({ ...editMedicalForm, allergies: e.target.value })}
                placeholder="e.g. Penicillin, Latex, Local Anesthetics"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Existing Medical Conditions</label>
              <textarea
                rows={2}
                value={editMedicalForm.medicalConditions || ''}
                onChange={(e) => setEditMedicalForm({ ...editMedicalForm, medicalConditions: e.target.value })}
                placeholder="e.g. Diabetes Type 2, Hypertension, Cardiovascular disease"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Current Medications</label>
              <input
                type="text"
                value={editMedicalForm.currentMedications || ''}
                onChange={(e) => setEditMedicalForm({ ...editMedicalForm, currentMedications: e.target.value })}
                placeholder="e.g. Aspirin 75mg daily, Metformin"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Dental Treatment Precautions & Notes</label>
              <textarea
                rows={2}
                value={editMedicalForm.dentalTreatmentNotes || ''}
                onChange={(e) => setEditMedicalForm({ ...editMedicalForm, dentalTreatmentNotes: e.target.value })}
                placeholder="e.g. Requires prophylactic amoxicillin; gag reflex"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsEditMedicalModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Medical Record'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. Change Record Status Modal                                            */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Change Patient Record Status"
        subtitle={selectedPatient ? `Patient ID: ${selectedPatient.patient_number}` : ''}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleStatusSubmit} className="p-6 space-y-4">
          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Status</label>
              <select
                value={statusForm.status}
                onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none font-semibold"
              >
                <option value="active">Active (Receiving Treatment)</option>
                <option value="inactive">Inactive (Not currently attending)</option>
                <option value="archived">Archived (Deceased or Transferred)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Reason for Status Change</label>
              <textarea
                rows={2}
                value={statusForm.reason}
                onChange={(e) => setStatusForm({ ...statusForm, reason: e.target.value })}
                placeholder="e.g. Relocated to another city, completed full treatment"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsStatusModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Updating...' : 'Confirm Status Change'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 4. Single-Screen Visit Encounter Records Modal */}
      {selectedEncounterVisitId && (
        <VisitEncounterModal
          isOpen={!!selectedEncounterVisitId}
          onClose={() => setSelectedEncounterVisitId(null)}
          visitId={selectedEncounterVisitId}
          patientId={selectedPatient?.id}
          isClinical={isClinical}
        />
      )}
    </div>
  );
};

export default PatientManagementPage;
