import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { staffService } from '../../services/staffService';
import { toast } from 'react-toastify';
import {
  UserCheck,
  Building2,
  Search,
  Stethoscope,
  ShieldCheck,
  AlertCircle,
  Activity,
  CheckCircle2,
} from 'lucide-react';

export const AssignStaffModal = ({ isOpen, onClose, activeBranch, onAssigned }) => {
  const [unassignedStaff, setUnassignedStaff] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && activeBranch?.id) {
      setIsLoading(true);
      setSelectedStaffId('');
      setSearch('');
      staffService
        .getUnassignedStaffForBranch(activeBranch.id)
        .then((res) => {
          setUnassignedStaff(res.staff || []);
        })
        .catch((err) => {
          toast.error('Failed to load clinic staff: ' + (err.response?.data?.message || err.message));
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, activeBranch?.id]);

  const filteredStaff = unassignedStaff.filter((s) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      s.full_name?.toLowerCase().includes(term) ||
      s.staff_number?.toLowerCase().includes(term) ||
      s.staff_category?.toLowerCase().includes(term) ||
      s.designation?.toLowerCase().includes(term)
    );
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStaffId) {
      toast.warn('Please select a staff member to assign.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await staffService.assignStaffToBranch(activeBranch.id, selectedStaffId);
      toast.success(res.message || 'Staff member assigned successfully.');
      if (onAssigned) onAssigned();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to assign staff member.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Existing Staff Member"
      subtitle={`Location: ${activeBranch?.branch_name || 'Active Branch'}`}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Branch Context Banner */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span className="text-slate-600">
              Assign to target branch: <strong>{activeBranch?.branch_name}</strong>
            </span>
          </div>
          <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded font-mono font-bold">
            Branch: {activeBranch?.branch_code}
          </span>
        </div>

        {/* Informational Guidance */}
        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p>
            Assigning an existing staff member gives them access to this branch under their existing employee ID without creating duplicate profile records.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, employee ID, or role..."
            className="w-full text-xs rounded-lg border-slate-300 pl-8 pr-3 py-2 bg-slate-50 focus:bg-white focus:border-teal-500 focus:ring-teal-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        {/* Staff Selection List */}
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center space-x-2 text-slate-400">
              <Activity className="w-4 h-4 animate-spin text-teal-600" />
              <span className="text-xs">Loading unassigned staff...</span>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
              {search ? 'No matching staff members found.' : 'All clinic staff members are already assigned to this branch.'}
            </div>
          ) : (
            filteredStaff.map((staff) => {
              const isSelected = selectedStaffId === staff.id;
              const isDoctor = ['dentist', 'specialist'].includes(staff.staff_category);

              return (
                <div
                  key={staff.id}
                  onClick={() => setSelectedStaffId(staff.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                    isSelected
                      ? 'border-teal-500 bg-teal-50/60 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isDoctor ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isDoctor ? <Stethoscope className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900">{staff.full_name}</span>
                        <span className="font-mono text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200">
                          {staff.staff_number}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {staff.designation || staff.staff_category}
                        {staff.specialization ? ` • ${staff.specialization}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Primary Branch:</span>
                    <span className="text-[11px] font-semibold text-slate-700">
                      {staff.primary_branch_name || 'Clinic-Wide'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !selectedStaffId}
            className="px-4 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition disabled:opacity-50 flex items-center space-x-1.5 shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Assigning...</span>
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5" />
                <span>Assign to Branch</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
