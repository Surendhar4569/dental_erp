import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { scheduleService } from '../services/scheduleService';
import { DoctorFeeModal } from '../components/doctors/DoctorFeeModal';
import { PageHeader } from '../components/common/PageHeader';
import { toast } from 'react-toastify';
import {
  IndianRupee,
  Stethoscope,
  Search,
  Building2,
  Calendar,
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Activity,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';

export const DoctorFeeManagementPage = ({ setActiveTab }) => {
  const { user } = useAuth();
  const { activeBranch } = useBranch();
  const isAdmin = user?.role === 'admin';

  // Doctor List & Pagination State
  const [doctors, setDoctors] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Search Filter State
  const [search, setSearch] = useState('');

  // Fee Modal State
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);

  // Load Doctor Fees
  const loadDoctorFees = useCallback(async () => {
    if (!activeBranch?.id) return;
    setIsLoading(true);
    try {
      const res = await scheduleService.getBranchDoctorFees(activeBranch.id, {
        page,
        limit,
        search,
      });

      setDoctors(res.doctors || []);
      setTotalCount(res.pagination?.totalCount || 0);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch (err) {
      toast.error('Failed to load doctor fee schedules: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsLoading(false);
    }
  }, [activeBranch?.id, page, limit, search]);

  useEffect(() => {
    loadDoctorFees();
  }, [loadDoctorFees]);

  const handleOpenFeeModal = (doctor) => {
    setSelectedDoctor(doctor);
    setIsFeeModalOpen(true);
  };

  // KPI Calculations
  const branchOverrideCount = doctors.filter((d) => d.fees?.source === 'doctor_branch_specific').length;
  const clinicStandardCount = doctors.filter((d) => d.fees?.source === 'doctor_clinic_default').length;
  const configuredDoctors = doctors.filter((d) => d.fees?.is_configured && Number(d.fees?.consultation_fee) > 0);
  const avgFee = configuredDoctors.length > 0
    ? (configuredDoctors.reduce((sum, d) => sum + Number(d.fees.consultation_fee), 0) / configuredDoctors.length).toFixed(0)
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Doctor & Fee Management"
        description="Configure practitioner consultation fees, follow-up rates, and branch-specific fee overrides with strict financial integrity."
        icon={IndianRupee}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Practitioners
            </span>
            <div className="text-2xl font-black text-slate-800 mt-1">{totalCount}</div>
            <span className="text-[11px] text-teal-600 font-semibold mt-0.5 block">
              In {activeBranch?.branch_name || 'Active Branch'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
            <Stethoscope className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Branch Overrides (Tier 1)
            </span>
            <div className="text-2xl font-black text-indigo-700 mt-1">{branchOverrideCount}</div>
            <span className="text-[11px] text-indigo-600 font-semibold mt-0.5 block">
              Location-Specific Rates
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Standard Rates (Tier 2)
            </span>
            <div className="text-2xl font-black text-emerald-700 mt-1">{clinicStandardCount}</div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">
              Clinic-Wide Defaults
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Average Fee
            </span>
            <div className="text-2xl font-black text-slate-800 mt-1">{avgFee !== 'N/A' ? `₹${avgFee}` : 'Not Set'}</div>
            <span className="text-[11px] text-slate-400 font-semibold mt-0.5 block">
              Configured Consultations
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Precedence Notice Banner */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center space-x-2">
          <Info className="w-4 h-4 text-teal-600 shrink-0" />
          <span>
            <strong>Fee Precedence Hierarchy:</strong> Branch Override (Tier 1) &rarr; Doctor Standard (Tier 2). If not configured, fee must be set before booking or payments.
          </span>
        </div>
        <span className="text-[11px] text-slate-400 hidden sm:inline">
          Branch Scoped: <strong>{activeBranch?.branch_name}</strong>
        </span>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search doctor by name, staff ID, specialty..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Doctor Fees Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Staff ID</th>
                <th className="py-3 px-4">Doctor Practitioner</th>
                <th className="py-3 px-4">Specialty & License</th>
                <th className="py-3 px-4">General Fee</th>
                <th className="py-3 px-4">Follow-up Fee</th>
                <th className="py-3 px-4">Emergency Fee</th>
                <th className="py-3 px-4">Precedence Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="8" className="py-8 text-center text-slate-400">
                    <Activity className="w-5 h-5 animate-spin mx-auto mb-2 text-teal-600" />
                    <span>Loading practitioner fee schedules...</span>
                  </td>
                </tr>
              ) : doctors.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">
                    <Stethoscope className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No active doctors found in this branch.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {search ? 'Try clearing the search query.' : 'Assign dentists to this branch in Staff Management.'}
                    </p>
                  </td>
                </tr>
              ) : (
                doctors.map((doc) => {
                  const fee = doc.fees || {};
                  const isBranchOverride = fee.source === 'doctor_branch_specific';
                  const isClinicStandard = fee.source === 'doctor_clinic_default';

                  return (
                    <tr key={doc.staff_id || doc.user_id} className="hover:bg-slate-50/70 transition">
                      {/* Staff ID */}
                      <td className="py-3 px-4 font-mono font-bold text-teal-700">
                        {doc.staff_number || 'N/A'}
                      </td>

                      {/* Doctor Practitioner */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                          <span>{doc.full_name}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {doc.designation || 'Dentist'}
                        </div>
                      </td>

                      {/* Specialty & License */}
                      <td className="py-3 px-4">
                        <div className="text-slate-700 font-semibold">
                          {doc.specialization || 'General Dentistry'}
                        </div>
                        {doc.license_number && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Lic: {doc.license_number}
                          </div>
                        )}
                      </td>

                      {/* General Fee */}
                      <td className="py-3 px-4">
                        {fee.is_configured && fee.consultation_fee != null ? (
                          <span className="font-mono font-bold text-slate-800 text-xs">
                            ₹{Number(fee.consultation_fee).toFixed(2)}
                          </span>
                        ) : (
                          <span className="font-mono text-rose-600 text-xs font-semibold">
                            Not Configured
                          </span>
                        )}
                      </td>

                      {/* Follow-up Fee */}
                      <td className="py-3 px-4">
                        {fee.is_configured && fee.followup_fee != null ? (
                          <span className="font-mono text-slate-600 text-xs">
                            ₹{Number(fee.followup_fee).toFixed(2)}
                          </span>
                        ) : (
                          <span className="font-mono text-slate-400 text-xs">
                            —
                          </span>
                        )}
                      </td>

                      {/* Emergency Fee */}
                      <td className="py-3 px-4">
                        {fee.is_configured && fee.emergency_fee != null ? (
                          <span className="font-mono text-slate-600 text-xs">
                            ₹{Number(fee.emergency_fee).toFixed(2)}
                          </span>
                        ) : (
                          <span className="font-mono text-slate-400 text-xs">
                            —
                          </span>
                        )}
                      </td>

                      {/* Precedence Status Badge */}
                      <td className="py-3 px-4">
                        {isBranchOverride ? (
                          <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            Branch Override (Tier 1)
                          </span>
                        ) : isClinicStandard ? (
                          <span className="inline-flex items-center text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                            Clinic Standard (Tier 2)
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                            Not Configured
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {isAdmin && (
                            <button
                              onClick={() => handleOpenFeeModal(doc)}
                              className="px-2.5 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition"
                            >
                              Configure Fees
                            </button>
                          )}

                          {setActiveTab && (
                            <button
                              onClick={() => setActiveTab('schedules')}
                              title="View Doctor Schedule"
                              className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition flex items-center space-x-1"
                            >
                              <Clock className="w-3 h-3" />
                              <span>Schedule</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-bold text-slate-800">{doctors.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(page * limit, totalCount)}</span> of{' '}
            <span className="font-bold text-slate-800">{totalCount}</span> practitioners
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded-md border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="p-1 rounded-md border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Fee Configuration Modal */}
      {selectedDoctor && (
        <DoctorFeeModal
          isOpen={isFeeModalOpen}
          onClose={() => {
            setIsFeeModalOpen(false);
            setSelectedDoctor(null);
          }}
          doctor={selectedDoctor}
          activeBranch={activeBranch}
          onSaved={loadDoctorFees}
        />
      )}
    </div>
  );
};
