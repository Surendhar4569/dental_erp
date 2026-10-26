import React, { useState, useEffect, useMemo } from 'react';
import { platformService } from '../../services/platformService';
import { ManagedOnboardingModal } from './ManagedOnboardingModal';
import { Modal } from '../../components/common/Modal';
import { MetricCard } from '../../components/common/MetricCard';
import { PageHeader } from '../../components/common/PageHeader';
import { toast } from 'react-toastify';
import {
  Building2,
  Search,
  Plus,
  RefreshCw,
  Power,
  ShieldCheck,
  CreditCard,
  Eye,
  Filter,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Users,
} from 'lucide-react';

export const ClinicsManagementPage = () => {
  const [clinics, setClinics] = useState([]);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');

  // Modals
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [clinicDetails, setClinicDetails] = useState(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  const [isChangePlanOpen, setIsChangePlanOpen] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState('');
  const [branchOverride, setBranchOverride] = useState('');
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [clinicsData, plansData] = await Promise.all([
        platformService.getClinics(),
        platformService.getPlans(),
      ]);
      setClinics(clinicsData.clinics || []);
      setPlans(plansData.plans || []);
    } catch (err) {
      toast.error('Failed to load clinic organizations: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredClinics = useMemo(() => {
    return clinics.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && c.subscription_status === 'active') ||
        (statusFilter === 'suspended' && c.subscription_status === 'suspended') ||
        (statusFilter === 'trial' && c.subscription_status === 'trial');

      const matchesPlan =
        planFilter === 'all' || c.plan_code === planFilter;

      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [clinics, searchQuery, statusFilter, planFilter]);

  const handleOpenDetails = async (clinic) => {
    setSelectedClinic(clinic);
    setIsDetailsOpen(true);
    try {
      setIsDetailsLoading(true);
      const data = await platformService.getClinicById(clinic.id);
      setClinicDetails(data.clinic);
    } catch (err) {
      toast.error('Failed to load clinic details: ' + err.message);
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const handleToggleStatus = async (clinic) => {
    const isCurrentlySuspended = clinic.subscription_status === 'suspended';
    const newStatus = isCurrentlySuspended ? 'active' : 'suspended';

    try {
      await platformService.updateClinicStatus(clinic.id, {
        status: newStatus,
        is_active: isCurrentlySuspended,
      });
      toast.success(
        `Clinic '${clinic.name}' has been ${isCurrentlySuspended ? 'reactivated' : 'suspended'}.`
      );
      fetchData();
    } catch (err) {
      toast.error('Failed to update status: ' + err.message);
    }
  };

  const handleOpenChangePlan = (clinic) => {
    setSelectedClinic(clinic);
    setSelectedPlanCode(clinic.plan_code || 'STARTER');
    setBranchOverride(clinic.max_branches_override || '');
    setIsChangePlanOpen(true);
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    if (!selectedClinic) return;

    try {
      setIsSavingPlan(true);
      await platformService.assignPlan(selectedClinic.id, {
        plan_code: selectedPlanCode,
        max_branches_override: branchOverride ? parseInt(branchOverride, 10) : null,
      });
      toast.success(`Subscription plan updated for '${selectedClinic.name}'.`);
      setIsChangePlanOpen(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to update plan: ' + err.message);
    } finally {
      setIsSavingPlan(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Clinic Organizations"
        subtitle="Manage provisioned dental clinic tenants, branch allocations, subscription status, and customer accounts."
        actions={
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={fetchData}
              disabled={isLoading}
              className="inline-flex items-center px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOnboardingOpen(true)}
              className="inline-flex items-center px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>Onboard New Clinic</span>
            </button>
          </div>
        }
      />

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by clinic name, code, email..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-2.5 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="trial">Trial</option>
          </select>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:border-indigo-500"
          >
            <option value="all">All Plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.plan_code}>
                {p.plan_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clinics High-Density Data Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Clinic Organization</th>
                <th className="py-3 px-4">Subscription Tier</th>
                <th className="py-3 px-4">Branch Limit & Usage</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Staff Count</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                    <span>Loading customer clinic organizations...</span>
                  </td>
                </tr>
              ) : filteredClinics.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    No clinics match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredClinics.map((clinic) => {
                  const isSuspended = clinic.subscription_status === 'suspended';
                  const usagePercentage = Math.round(
                    (clinic.branches_count / (clinic.effective_max_branches || 1)) * 100
                  );

                  return (
                    <tr key={clinic.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-xs">{clinic.name}</span>
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-bold border border-indigo-200">
                              {clinic.code}
                            </span>
                            <span className="text-[11px] text-slate-400">&bull; {clinic.email || 'No email'}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800">
                          {clinic.plan_name || 'Standard Plan'}
                        </span>
                        <div className="text-[10px] font-mono text-slate-500">
                          {clinic.plan_code}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-800">
                            {clinic.branches_count} / {clinic.effective_max_branches}
                          </span>
                          <span className="text-[10px] text-slate-400">locations</span>
                        </div>
                        <div className="w-24 bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              usagePercentage >= 100
                                ? 'bg-amber-500'
                                : 'bg-teal-500'
                            }`}
                            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {isSuspended ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                            Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {clinic.staff_count || 0} users
                      </td>

                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(clinic)}
                          className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-xs font-medium transition"
                          title="View Details"
                        >
                          Details
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenChangePlan(clinic)}
                          className="px-2 py-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded text-xs font-semibold transition"
                          title="Change Subscription Tier"
                        >
                          Plan
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStatus(clinic)}
                          className={`px-2 py-1 rounded text-xs font-semibold transition ${
                            isSuspended
                              ? 'text-emerald-700 hover:bg-emerald-50'
                              : 'text-rose-600 hover:bg-rose-50'
                          }`}
                          title={isSuspended ? 'Reactivate clinic' : 'Suspend clinic'}
                        >
                          {isSuspended ? 'Reactivate' : 'Suspend'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Managed Onboarding Modal */}
      <ManagedOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onClinicCreated={fetchData}
        plans={plans}
      />

      {/* Change Plan / Branch Limit Override Modal */}
      {selectedClinic && (
        <Modal
          isOpen={isChangePlanOpen}
          onClose={() => setIsChangePlanOpen(false)}
          title={`Update Subscription: ${selectedClinic.name}`}
          size="md"
        >
          <form onSubmit={handleSavePlan} className="space-y-4 text-xs text-slate-700">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Select Subscription Plan Tier *
              </label>
              <select
                value={selectedPlanCode}
                onChange={(e) => setSelectedPlanCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:border-indigo-500"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.plan_code}>
                    {p.plan_name} ({p.max_branches} branch limit)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Custom Max Branches Override (Optional)
              </label>
              <input
                type="number"
                min="1"
                value={branchOverride}
                onChange={(e) => setBranchOverride(e.target.value)}
                placeholder="Leave blank to use plan default"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Overrides the default plan limit for this specific clinic account.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsChangePlanOpen(false)}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingPlan}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
              >
                {isSavingPlan ? 'Saving...' : 'Update Plan'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Clinic Details Drawer / Modal */}
      {selectedClinic && (
        <Modal
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          title={`Clinic Details: ${selectedClinic.name}`}
          size="lg"
        >
          {isDetailsLoading ? (
            <div className="py-8 text-center text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
              <span>Loading details...</span>
            </div>
          ) : clinicDetails ? (
            <div className="space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div><span className="text-slate-400">Code:</span> <strong className="text-indigo-700 font-mono">{clinicDetails.code}</strong></div>
                <div><span className="text-slate-400">Status:</span> <strong className="uppercase font-mono">{clinicDetails.subscription_status}</strong></div>
                <div><span className="text-slate-400">Plan:</span> <strong>{clinicDetails.plan_name} ({clinicDetails.effective_max_branches} max)</strong></div>
                <div><span className="text-slate-400">Timezone:</span> <strong>{clinicDetails.timezone}</strong></div>
                <div className="col-span-2"><span className="text-slate-400">Address:</span> <strong>{clinicDetails.address || 'N/A'}</strong></div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 uppercase text-[10px] tracking-wider mb-2">
                  Provisioned Physical Branches ({clinicDetails.branches?.length || 0})
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {clinicDetails.branches?.map((b) => (
                    <div key={b.id} className="p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-800">{b.branch_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{b.branch_code} &bull; {b.city || 'Metro City'}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${b.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {b.is_default ? 'HQ Branch' : b.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 uppercase text-[10px] tracking-wider mb-2">
                  Registered Staff & Practitioners ({clinicDetails.staff?.length || 0})
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {clinicDetails.staff?.map((s) => (
                    <div key={s.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">{s.first_name} {s.last_name}</div>
                        <div className="text-[10px] text-slate-400">{s.email}</div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                        {s.role_display}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
};

export default ClinicsManagementPage;
