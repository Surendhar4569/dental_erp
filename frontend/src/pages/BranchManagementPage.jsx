import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { branchService } from '../services/branchService';
import { toast } from 'react-toastify';
import {
  Building2,
  Plus,
  Search,
  Edit,
  Power,
  Users,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Phone,
  Mail,
  Clock,
  Trash2,
  UserPlus,
  RefreshCw,
  X,
  Filter,
  Check,
  ShieldCheck,
  Info
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

export const BranchManagementPage = () => {
  const { user } = useAuth();
  const { refreshBranches: refreshGlobalBranches, selectBranch } = useBranch();

  // Branch list state
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null); // null = Add, object = Edit

  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [branchToDeactivate, setBranchToDeactivate] = useState(null);

  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [activeStaffBranch, setActiveStaffBranch] = useState(null);
  const [branchStaff, setBranchStaff] = useState([]);
  const [availableStaff, setAvailableStaff] = useState([]);
  const [isStaffLoading, setIsStaffLoading] = useState(false);
  const [selectedStaffToAssign, setSelectedStaffToAssign] = useState('');
  const [assignAsDefault, setAssignAsDefault] = useState(false);

  // Form state
  const initialFormState = {
    branch_name: '',
    branch_code: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'India',
    phone: '',
    email: '',
    timezone: 'Asia/Kolkata',
    is_default: false,
    is_active: true,
  };
  const [formData, setFormData] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch branches from API
  const fetchBranches = async () => {
    try {
      setIsLoading(true);
      const res = await branchService.getBranches();
      setBranches(res.branches || []);
    } catch (err) {
      toast.error('Failed to load branches: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  // Filter branches
  const filteredBranches = useMemo(() => {
    return branches.filter((branch) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === '' ||
        branch.branch_name?.toLowerCase().includes(q) ||
        branch.branch_code?.toLowerCase().includes(q) ||
        branch.city?.toLowerCase().includes(q) ||
        branch.phone?.toLowerCase().includes(q) ||
        branch.email?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && branch.is_active) ||
        (statusFilter === 'inactive' && !branch.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [branches, searchQuery, statusFilter]);

  // Counts
  const totalCount = branches.length;
  const activeCount = branches.filter((b) => b.is_active).length;
  const inactiveCount = branches.filter((b) => !b.is_active).length;
  const totalStaffAssignments = branches.reduce(
    (sum, b) => sum + (parseInt(b.assigned_users_count, 10) || 0),
    0
  );

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingBranch(null);
    setFormData(initialFormState);
    setFormErrors({});
    setIsAddEditModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (branch) => {
    setEditingBranch(branch);
    setFormData({
      branch_name: branch.branch_name || '',
      branch_code: branch.branch_code || '',
      address_line1: branch.address_line1 || '',
      address_line2: branch.address_line2 || '',
      city: branch.city || '',
      state: branch.state || '',
      postal_code: branch.postal_code || '',
      country: branch.country || 'India',
      phone: branch.phone || '',
      email: branch.email || '',
      timezone: branch.timezone || 'Asia/Kolkata',
      is_default: Boolean(branch.is_default),
      is_active: Boolean(branch.is_active),
    });
    setFormErrors({});
    setIsAddEditModalOpen(true);
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    if (!formData.branch_name.trim() || formData.branch_name.trim().length < 2) {
      errors.branch_name = 'Branch name is required (min 2 characters).';
    }
    if (!formData.branch_code.trim()) {
      errors.branch_code = 'Branch code is required.';
    } else if (!/^[A-Za-z0-9_-]{2,50}$/.test(formData.branch_code.trim())) {
      errors.branch_code = 'Code must be 2-50 characters (letters, numbers, hyphens, underscores).';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Add or Edit
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      if (editingBranch) {
        await branchService.updateBranch(editingBranch.id, formData);
        toast.success(`Branch "${formData.branch_name}" updated successfully.`);
      } else {
        await branchService.createBranch(formData);
        toast.success(`Branch "${formData.branch_name}" registered successfully.`);
      }

      setIsAddEditModalOpen(false);
      await fetchBranches();
      await refreshGlobalBranches();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Operation failed.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Deactivate Confirmation Modal
  const handleOpenDeactivateModal = (branch) => {
    if (branch.is_default && branch.is_active) {
      toast.warn('Cannot deactivate the default branch. Please set another active branch as default first.');
      return;
    }
    setBranchToDeactivate(branch);
    setIsDeactivateModalOpen(true);
  };

  // Confirm Status Toggle (Activate or Deactivate)
  const handleConfirmStatusToggle = async () => {
    if (!branchToDeactivate) return;

    try {
      const nextActive = !branchToDeactivate.is_active;
      await branchService.updateBranchStatus(branchToDeactivate.id, nextActive);
      toast.success(
        `Branch "${branchToDeactivate.branch_name}" ${nextActive ? 'activated' : 'deactivated'} successfully.`
      );
      setIsDeactivateModalOpen(false);
      setBranchToDeactivate(null);
      await fetchBranches();
      await refreshGlobalBranches();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update branch status.');
    }
  };

  // Open Staff Management Modal
  const handleOpenStaffModal = async (branch) => {
    setActiveStaffBranch(branch);
    setIsStaffModalOpen(true);
    setSelectedStaffToAssign('');
    setAssignAsDefault(false);
    await loadStaffData(branch.id);
  };

  const loadStaffData = async (branchId) => {
    try {
      setIsStaffLoading(true);
      const res = await branchService.getBranchUsers(branchId, true);
      setBranchStaff(res.assignedUsers || []);
      setAvailableStaff(res.availableUsers || []);
    } catch (err) {
      toast.error('Failed to load branch staff: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsStaffLoading(false);
    }
  };

  // Assign user to active branch
  const handleAssignStaff = async () => {
    if (!selectedStaffToAssign || !activeStaffBranch) return;

    try {
      await branchService.assignUserToBranch(activeStaffBranch.id, selectedStaffToAssign, assignAsDefault);
      toast.success('Personnel assigned to branch successfully.');
      setSelectedStaffToAssign('');
      setAssignAsDefault(false);
      await loadStaffData(activeStaffBranch.id);
      await fetchBranches();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to assign personnel.');
    }
  };

  // Remove staff from branch
  const handleRemoveStaff = async (userId, userName) => {
    if (!activeStaffBranch) return;
    if (!window.confirm(`Are you sure you want to remove ${userName} from this branch?`)) {
      return;
    }

    try {
      await branchService.removeUserFromBranch(activeStaffBranch.id, userId);
      toast.success(`${userName} unassigned from branch.`);
      await loadStaffData(activeStaffBranch.id);
      await fetchBranches();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to remove user.');
    }
  };

  return (
    <div className="space-y-5">
      {/* LeadSquared-Style Page Header with Breadcrumbs and Action CTA */}
      <PageHeader
        title="Branch Location Management"
        subtitle="Configure clinic physical locations, operational contact details, and role-based staff assignments."
        breadcrumbs={[
          { label: 'VoiceGate ERP' },
          { label: 'Workspace' },
          { label: 'Branch Management' },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={fetchBranches}
              disabled={isLoading}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg shadow-xs transition"
              title="Refresh branch records"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="inline-flex items-center px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                <span>Add Branch Location</span>
              </button>
            )}
          </>
        }
      />

      {/* Metric Summary Strip (LeadSquared High-Density Style) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Locations"
          value={totalCount}
          subtext="In this clinic network"
          icon={Building2}
          variant="slate"
        />
        <MetricCard
          title="Active Locations"
          value={activeCount}
          subtext="Operational branches"
          icon={CheckCircle2}
          variant="emerald"
        />
        <MetricCard
          title="Inactive Locations"
          value={inactiveCount}
          subtext="Deactivated clinics"
          icon={Power}
          variant="slate"
        />
        <MetricCard
          title="Total Staff Assigned"
          value={totalStaffAssignments}
          subtext="Personnel across branches"
          icon={Users}
          variant="indigo"
        />
      </div>

      {/* Data Grid Toolbar & Search Controls */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by branch name, code, city, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white transition"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 w-full sm:w-auto bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-md transition ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 rounded-md transition ${
              statusFilter === 'active'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1 rounded-md transition ${
              statusFilter === 'inactive'
                ? 'bg-white text-rose-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Inactive ({inactiveCount})
          </button>
        </div>
      </div>

      {/* Enterprise Data Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center">
            <RefreshCw className="w-6 h-6 text-teal-600 animate-spin mb-2" />
            <span>Loading branch records...</span>
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center">
            <Building2 className="w-8 h-8 text-slate-300 mb-2" />
            <span className="font-semibold text-slate-700 text-sm">No branch locations found</span>
            <span className="text-slate-400 mt-1">
              {searchQuery ? 'No branches match your search criteria.' : 'Click "Add Branch Location" above to create one.'}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Location & Code</th>
                  <th className="py-3 px-4">Address / City</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4">Timezone</th>
                  <th className="py-3 px-4">Operational Status</th>
                  <th className="py-3 px-4 text-center">Assigned Staff</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBranches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Branch Name & Code */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-start space-x-2.5">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            branch.is_active
                              ? 'bg-teal-50 text-teal-700 border-teal-200'
                              : 'bg-slate-100 text-slate-400 border-slate-200'
                          }`}
                        >
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                            <span>{branch.branch_name}</span>
                            {branch.is_default && (
                              <StatusBadge status="default" label="HQ" size="xs" />
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-teal-700 font-semibold mt-0.5">
                            {branch.branch_code}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Address & City */}
                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="flex items-center space-x-1 text-slate-800 font-semibold">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{branch.city || 'Metro City'}</span>
                        {branch.state && <span className="text-slate-400 font-normal">, {branch.state}</span>}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                        {branch.address_line1 || 'No street address specified'}
                      </div>
                    </td>

                    {/* Contact Phone & Email */}
                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="space-y-0.5">
                        {branch.phone && (
                          <div className="flex items-center space-x-1 text-[11px]">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{branch.phone}</span>
                          </div>
                        )}
                        {branch.email && (
                          <div className="flex items-center space-x-1 text-[11px]">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{branch.email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Timezone */}
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{branch.timezone}</span>
                      </div>
                    </td>

                    {/* Operational Status */}
                    <td className="py-3.5 px-4">
                      <StatusBadge status={branch.is_active ? 'active' : 'inactive'} />
                    </td>

                    {/* Assigned Personnel */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleOpenStaffModal(branch)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-300 rounded font-semibold transition text-[11px]"
                        title="Manage assigned personnel"
                      >
                        <Users className="w-3 h-3 text-teal-600" />
                        <span>{branch.assigned_users_count || 0} Staff</span>
                      </button>
                    </td>

                    {/* Row Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(branch)}
                          className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded transition"
                          title="Edit branch details"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenDeactivateModal(branch)}
                          disabled={branch.is_default && branch.is_active}
                          className={`p-1.5 rounded transition ${
                            branch.is_default && branch.is_active
                              ? 'text-slate-300 cursor-not-allowed'
                              : branch.is_active
                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={
                            branch.is_default && branch.is_active
                              ? 'Default branch cannot be deactivated'
                              : branch.is_active
                              ? 'Deactivate branch'
                              : 'Activate branch'
                          }
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* ADD / EDIT BRANCH MODAL */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isAddEditModalOpen}
        onClose={() => setIsAddEditModalOpen(false)}
        title={editingBranch ? 'Edit Branch Location' : 'Register New Clinic Branch'}
        subtitle={
          editingBranch
            ? `Updating profile for ${editingBranch.branch_name} (${editingBranch.branch_code})`
            : 'Add a new physical operating location to your dental organization'
        }
        maxWidth="max-w-xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAddEditModalOpen(false)}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFormSubmit}
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : editingBranch ? 'Update Location' : 'Register Location'}
            </button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Section 1: Location Identity */}
          <div className="pb-3 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              1. Location Identity
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex West Suburban Centre"
                  value={formData.branch_name}
                  onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border focus:ring-1 focus:ring-teal-500 outline-none transition ${
                    formErrors.branch_name ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-slate-50/50'
                  }`}
                />
                {formErrors.branch_name && (
                  <p className="text-[10px] text-rose-600 mt-0.5">{formErrors.branch_name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Branch Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WEST-02"
                  value={formData.branch_code}
                  onChange={(e) => setFormData({ ...formData, branch_code: e.target.value.toUpperCase() })}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border font-mono uppercase focus:ring-1 focus:ring-teal-500 outline-none transition ${
                    formErrors.branch_code ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-slate-50/50'
                  }`}
                />
                {formErrors.branch_code && (
                  <p className="text-[10px] text-rose-600 mt-0.5">{formErrors.branch_code}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Physical Address */}
          <div className="pb-3 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              2. Physical Address
            </span>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Street Address (Line 1)
                </label>
                <input
                  type="text"
                  placeholder="Street address, building name, floor"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:ring-1 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Suite / Landmark (Line 2)
                </label>
                <input
                  type="text"
                  placeholder="Suite, landmark, medical block"
                  value={formData.address_line2}
                  onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:ring-1 focus:ring-teal-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">City</label>
                  <input
                    type="text"
                    placeholder="Metro City"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:ring-1 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">State</label>
                  <input
                    type="text"
                    placeholder="State"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:ring-1 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Postal Code</label>
                  <input
                    type="text"
                    placeholder="400001"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:ring-1 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 mb-0.5">Country</label>
                  <input
                    type="text"
                    placeholder="India"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:ring-1 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Communications & Operating Hours */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              3. Communication & Timezone
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Telephone
                </label>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:ring-1 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Official Email
                </label>
                <input
                  type="email"
                  placeholder="branch@dentalcare-apex.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border focus:ring-1 focus:ring-teal-500 outline-none ${
                    formErrors.email ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-slate-50/50'
                  }`}
                />
                {formErrors.email && <p className="text-[10px] text-rose-600 mt-0.5">{formErrors.email}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Operating Timezone
                </label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50/50 focus:ring-1 focus:ring-teal-500 outline-none"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>
            </div>

            {/* Set as Default Checkbox */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_default"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="w-3.5 h-3.5 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
              />
              <label htmlFor="is_default" className="text-xs font-semibold text-slate-700">
                Designate as Primary Headquarters Location
              </label>
            </div>
          </div>
        </form>
      </Modal>

      {/* ===================================================================== */}
      {/* DEACTIVATE CONFIRMATION DIALOG */}
      {/* ===================================================================== */}
      <ConfirmDialog
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        onConfirm={handleConfirmStatusToggle}
        title={branchToDeactivate?.is_active ? 'Deactivate Branch Location?' : 'Reactivate Branch Location?'}
        message={
          branchToDeactivate?.is_active
            ? `Deactivating ${branchToDeactivate?.branch_name} (${branchToDeactivate?.branch_code}) will revoke clinical session access for assigned non-administrative staff. Existing patient records and audit histories will remain safely preserved.`
            : `Activating ${branchToDeactivate?.branch_name} (${branchToDeactivate?.branch_code}) will restore operational access for authorized dentists and reception personnel.`
        }
        confirmText={branchToDeactivate?.is_active ? 'Deactivate' : 'Activate'}
        isDanger={branchToDeactivate?.is_active}
      />

      {/* ===================================================================== */}
      {/* STAFF MANAGEMENT MODAL */}
      {/* ===================================================================== */}
      <Modal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        title="Branch Personnel & Access"
        subtitle={
          activeStaffBranch
            ? `${activeStaffBranch.branch_name} (${activeStaffBranch.branch_code})`
            : 'Manage assigned staff'
        }
        maxWidth="max-w-2xl"
        footer={
          <button
            type="button"
            onClick={() => setIsStaffModalOpen(false)}
            className="px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
          >
            Close
          </button>
        }
      >
        <div className="space-y-4">
          {/* Section: Assign Personnel */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2 flex items-center">
              <UserPlus className="w-3.5 h-3.5 text-teal-600 mr-1.5" />
              Authorize Staff Member to this Location
            </span>

            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <select
                value={selectedStaffToAssign}
                onChange={(e) => setSelectedStaffToAssign(e.target.value)}
                className="w-full sm:flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">-- Select organization staff member --</option>
                {availableStaff.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.full_name || st.first_name} ({st.role_display || st.role_name}) - {st.email}
                  </option>
                ))}
              </select>

              <div className="flex items-center space-x-1.5 shrink-0">
                <input
                  type="checkbox"
                  id="assignAsDefault"
                  checked={assignAsDefault}
                  onChange={(e) => setAssignAsDefault(e.target.checked)}
                  className="w-3.5 h-3.5 text-teal-600 rounded border-slate-300"
                />
                <label htmlFor="assignAsDefault" className="text-xs text-slate-600 whitespace-nowrap">
                  Set as primary branch
                </label>
              </div>

              <button
                type="button"
                onClick={handleAssignStaff}
                disabled={!selectedStaffToAssign}
                className="w-full sm:w-auto px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs transition disabled:opacity-50 whitespace-nowrap"
              >
                Assign
              </button>
            </div>
          </div>

          {/* Section: List of Currently Assigned Personnel */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Authorized Personnel ({branchStaff.length})
              </span>
              <span className="text-[10px] font-mono text-slate-400">Database Verified</span>
            </div>

            {isStaffLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 text-teal-600 animate-spin mx-auto mb-1.5" />
                <span>Loading staff records...</span>
              </div>
            ) : branchStaff.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-lg text-center text-xs text-slate-400 border border-slate-200">
                No personnel currently assigned to this branch location.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {branchStaff.map((staff) => (
                  <div
                    key={staff.id}
                    className="p-3 flex items-center justify-between hover:bg-slate-50/70 transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-full bg-slate-800 text-teal-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {staff.first_name?.[0] || 'U'}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-xs flex items-center space-x-1.5">
                          <span>{staff.full_name || staff.first_name}</span>
                          {staff.is_user_default && (
                            <StatusBadge status="primary" label="Primary Branch" size="xs" dot={false} />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 mt-0.5">
                          <span className="font-medium text-teal-700">{staff.role_display}</span>
                          <span>&bull;</span>
                          <span>{staff.email}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveStaff(staff.id, staff.full_name || staff.first_name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                      title="Remove user assignment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BranchManagementPage;
