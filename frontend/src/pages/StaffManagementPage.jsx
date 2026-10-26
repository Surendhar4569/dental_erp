import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { staffService } from '../services/staffService';
import { StaffModal } from '../components/staff/StaffModal';
import { AssignStaffModal } from '../components/staff/AssignStaffModal';
import { PageHeader } from '../components/common/PageHeader';
import { Modal } from '../components/common/Modal';
import { toast } from 'react-toastify';
import {
  Users,
  UserPlus,
  UserCheck,
  UserMinus,
  Search,
  Filter,
  Stethoscope,
  ShieldCheck,
  Building2,
  Calendar,
  Phone,
  Mail,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Edit,
  UserX,
  ChevronLeft,
  ChevronRight,
  Activity,
  HeartHandshake,
} from 'lucide-react';

const CATEGORY_FILTERS = [
  { value: 'all', label: 'All Categories' },
  { value: 'dentist', label: 'Dentists' },
  { value: 'specialist', label: 'Specialists' },
  { value: 'receptionist', label: 'Receptionists' },
  { value: 'assistant', label: 'Assistants' },
  { value: 'hygienist', label: 'Hygienists' },
  { value: 'nurse', label: 'Nurses' },
  { value: 'manager', label: 'Managers' },
  { value: 'billing', label: 'Billing Staff' },
];

export const StaffManagementPage = ({ setActiveTab }) => {
  const { user } = useAuth();
  const { activeBranch } = useBranch();
  const isAdmin = user?.role === 'admin';

  const isAuthorizedManager = isAdmin || user?.role === 'manager';

  // Staff List & Pagination State
  const [staffList, setStaffList] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Filters State
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Modal State
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  // Deactivate Modal State
  const [deactivatingStaff, setDeactivatingStaff] = useState(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Unassign from Branch State
  const [unassigningStaff, setUnassigningStaff] = useState(null);
  const [isUnassigning, setIsUnassigning] = useState(false);

  // Load Staff
  const loadStaff = useCallback(async () => {
    if (!activeBranch?.id) return;
    setIsLoading(true);
    try {
      const res = await staffService.getStaffList({
        branchId: activeBranch.id,
        page,
        limit,
        category: selectedCategory,
        status: selectedStatus,
        search,
      });

      setStaffList(res.staff || []);
      setTotalCount(res.pagination?.totalCount || 0);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch (err) {
      toast.error('Failed to load staff list: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsLoading(false);
    }
  }, [activeBranch?.id, page, limit, selectedCategory, selectedStatus, search]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleOpenAdd = () => {
    setSelectedStaff(null);
    setIsStaffModalOpen(true);
  };

  const handleOpenEdit = (staff) => {
    setSelectedStaff(staff);
    setIsStaffModalOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingStaff) return;
    setIsDeactivating(true);
    try {
      const res = await staffService.deactivateStaff(deactivatingStaff.id);
      if (res.hasConflict) {
        toast.error(res.message);
      } else {
        toast.success(res.message);
        setDeactivatingStaff(null);
        loadStaff();
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to deactivate staff member.';
      toast.error(msg);
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleConfirmUnassign = async () => {
    if (!unassigningStaff || !activeBranch?.id) return;
    setIsUnassigning(true);
    try {
      const res = await staffService.removeStaffFromBranch(activeBranch.id, unassigningStaff.id);
      toast.success(res.message || 'Staff member unassigned from branch successfully.');
      setUnassigningStaff(null);
      loadStaff();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to unassign staff member from branch.';
      toast.error(msg);
    } finally {
      setIsUnassigning(false);
    }
  };

  // Metrics calculation
  const doctorCount = staffList.filter((s) => ['dentist', 'specialist'].includes(s.staff_category)).length;
  const assistantCount = staffList.filter((s) => ['assistant', 'nurse', 'hygienist'].includes(s.staff_category)).length;
  const adminCount = staffList.filter((s) => ['manager', 'receptionist', 'billing'].includes(s.staff_category)).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Staff & Human Resources"
        description="Comprehensive management of dental clinic staff, clinical practitioners, administrative personnel, and system login credentials."
        icon={Users}
        actions={
          <div className="flex items-center space-x-2">
            {isAuthorizedManager && (
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 shadow-xs transition"
              >
                <UserCheck className="w-4 h-4 text-teal-600" />
                <span>Assign Existing Staff</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Staff Member</span>
              </button>
            )}
          </div>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Active Staff
            </span>
            <div className="text-2xl font-black text-slate-800 mt-1">{totalCount}</div>
            <span className="text-[11px] text-teal-600 font-semibold mt-0.5 block">
              In {activeBranch?.branch_name || 'Current Branch'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Doctors & Specialists
            </span>
            <div className="text-2xl font-black text-slate-800 mt-1">{doctorCount}</div>
            <span className="text-[11px] text-indigo-600 font-semibold mt-0.5 block">
              Dentists & Orthodontists
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Stethoscope className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Clinical & Nursing
            </span>
            <div className="text-2xl font-black text-slate-800 mt-1">{assistantCount}</div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-0.5 block">
              Assistants & Hygienists
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <HeartHandshake className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Front Desk & Billing
            </span>
            <div className="text-2xl font-black text-slate-800 mt-1">{adminCount}</div>
            <span className="text-[11px] text-amber-600 font-semibold mt-0.5 block">
              Reception & Admin
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, ID, phone, email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Category Dropdown */}
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {CATEGORY_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="probation">Probation</option>
            <option value="on_leave">On Leave</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Staff ID</th>
                <th className="py-3 px-4">Staff Name & Contact</th>
                <th className="py-3 px-4">Category / Designation</th>
                <th className="py-3 px-4">Assigned Branch</th>
                <th className="py-3 px-4">Login Access</th>
                <th className="py-3 px-4">Employment Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400">
                    <Activity className="w-5 h-5 animate-spin mx-auto mb-2 text-teal-600" />
                    <span>Loading clinic staff members...</span>
                  </td>
                </tr>
              ) : staffList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No staff members found.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {search || selectedCategory !== 'all'
                        ? 'Try clearing filters or search terms.'
                        : 'Click "Add Staff Member" to register your first team member.'}
                    </p>
                  </td>
                </tr>
              ) : (
                staffList.map((staff) => {
                  const isDoctor = ['dentist', 'specialist'].includes(staff.staff_category);

                  return (
                    <tr key={staff.id} className="hover:bg-slate-50/70 transition">
                      {/* Staff ID */}
                      <td className="py-3 px-4 font-mono font-bold text-teal-700">
                        {staff.staff_number}
                      </td>

                      {/* Staff Name & Contact */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{staff.full_name}</div>
                        <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-0.5">
                          {staff.phone && (
                            <span className="flex items-center space-x-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{staff.phone}</span>
                            </span>
                          )}
                          {staff.email && (
                            <span className="flex items-center space-x-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{staff.email}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category & Designation */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                              isDoctor
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {staff.staff_category}
                          </span>
                          {isDoctor && (
                            <span className="text-[10px] font-bold text-teal-600 flex items-center">
                              <Stethoscope className="w-3 h-3 mr-0.5" />
                              Doctor
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5 font-medium">
                          {staff.designation || staff.specialization || 'Clinical Staff'}
                        </div>
                      </td>

                      {/* Assigned Branch */}
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        <div className="flex items-center space-x-1 text-xs">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{staff.primary_branch_name || 'Headquarters'}</span>
                        </div>
                      </td>

                      {/* Login Access Status */}
                      <td className="py-3 px-4">
                        {staff.user_id ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 w-max">
                              <KeyRound className="w-3 h-3 mr-1" />
                              Active Account
                            </span>
                            <span className="text-[10px] text-slate-500 mt-0.5 font-mono">
                              Role: {staff.login_role_display || staff.login_role_name}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                            No System Login
                          </span>
                        )}
                      </td>

                      {/* Employment Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border capitalize ${
                            staff.is_active && staff.employment_status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : staff.employment_status === 'probation'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : staff.employment_status === 'on_leave'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {staff.is_active ? staff.employment_status : 'Terminated'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Direct Link to Doctor Fees if Doctor */}
                          {isDoctor && staff.is_active && setActiveTab && (
                            <button
                              onClick={() => setActiveTab('doctor-fees')}
                              title="Configure Doctor Consultation Fees"
                              className="px-2 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition flex items-center space-x-1"
                            >
                              <Stethoscope className="w-3 h-3" />
                              <span>Fees</span>
                            </button>
                          )}

                          {isAuthorizedManager && (
                            <button
                              onClick={() => setUnassigningStaff(staff)}
                              title="Unassign from this branch"
                              className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-md transition"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isAdmin && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(staff)}
                                title="Edit Staff Member"
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              {staff.is_active && (
                                <button
                                  onClick={() => setDeactivatingStaff(staff)}
                                  title="Deactivate Staff"
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
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
            Showing{' '}
            <span className="font-bold text-slate-800">
              {staffList.length > 0 ? (page - 1) * limit + 1 : 0}
            </span>{' '}
            to{' '}
            <span className="font-bold text-slate-800">
              {Math.min(page * limit, totalCount)}
            </span>{' '}
            of <span className="font-bold text-slate-800">{totalCount}</span> staff members
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

      {/* Staff Add/Edit Modal */}
      <StaffModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        staffMember={selectedStaff}
        activeBranch={activeBranch}
        onSaved={loadStaff}
      />

      {/* Assign Existing Staff Modal */}
      <AssignStaffModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        activeBranch={activeBranch}
        onAssigned={loadStaff}
      />

      {/* Unassign Branch Confirmation Modal */}
      {unassigningStaff && (
        <Modal
          isOpen={Boolean(unassigningStaff)}
          onClose={() => setUnassigningStaff(null)}
          title="Unassign Staff from Branch"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center space-x-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
              <AlertTriangle className="w-6 h-6 shrink-0 text-amber-600" />
              <div className="text-xs">
                <span className="font-bold block">Confirm Branch Unassignment</span>
                <span>
                  Staff member: <strong>{unassigningStaff.full_name}</strong> ({unassigningStaff.staff_number})
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will remove <strong>{unassigningStaff.full_name}</strong> from <strong>{activeBranch?.branch_name}</strong>. Their employee record and assignments to any other branches will remain active.
            </p>

            {['dentist', 'specialist'].includes(unassigningStaff.staff_category) && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800">
                <strong>Schedule Safety Guard:</strong> If this practitioner has upcoming active appointments booked at this branch, unassignment will be prevented to protect patient bookings.
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setUnassigningStaff(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnassign}
                disabled={isUnassigning}
                className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs transition disabled:opacity-50"
              >
                {isUnassigning ? 'Unassigning...' : 'Confirm Unassign'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Deactivation Confirmation Modal */}
      {deactivatingStaff && (
        <Modal
          isOpen={Boolean(deactivatingStaff)}
          onClose={() => setDeactivatingStaff(null)}
          title="Confirm Staff Deactivation"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center space-x-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
              <AlertTriangle className="w-6 h-6 shrink-0 text-rose-600" />
              <div className="text-xs">
                <span className="font-bold block">Are you sure you want to deactivate?</span>
                <span className="text-rose-700">
                  Staff member: <strong>{deactivatingStaff.full_name}</strong> ({deactivatingStaff.staff_number})
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Deactivating this staff member will revoke their system login access and mark their employment status as terminated. Historical appointment, billing, and receipt records will remain preserved for audit integrity.
            </p>

            {['dentist', 'specialist'].includes(deactivatingStaff.staff_category) && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                <strong>Doctor Notice:</strong> If this practitioner has upcoming booked appointments, deactivation will be blocked until appointments are rescheduled or cancelled.
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeactivatingStaff(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={isDeactivating}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition disabled:opacity-50"
              >
                {isDeactivating ? 'Deactivating...' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
