import React, { useState, useEffect } from 'react';
import { platformService } from '../../services/platformService';
import { MetricCard } from '../../components/common/MetricCard';
import { ManagedOnboardingModal } from './ManagedOnboardingModal';
import { toast } from 'react-toastify';
import {
  Building2,
  Users,
  CreditCard,
  ShieldCheck,
  RefreshCw,
  Plus,
  ArrowUpRight,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export const PlatformDashboardPage = ({ setActiveTab }) => {
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  const fetchOverview = async () => {
    try {
      setIsLoading(true);
      const [overviewData, plansData] = await Promise.all([
        platformService.getOverview(),
        platformService.getPlans(),
      ]);
      setData(overviewData.metrics);
      setPlans(plansData.plans || []);
    } catch (err) {
      toast.error('Failed to query platform overview: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const clinicsMetric = data?.clinics || { total_clinics: 0, active_clinics: 0, suspended_clinics: 0 };

  return (
    <div className="space-y-6">
      {/* Enterprise Platform Welcome Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-semibold text-indigo-700 uppercase tracking-wider mb-1">
            <span>VoiceGate Dental Cloud</span>
            <span>&bull;</span>
            <span className="text-slate-500 font-bold">Multi-Tenant Platform Console</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Platform Administration & Clinic Governance
          </h1>

          <p className="text-xs text-slate-500 mt-1">
            Global customer clinic organization oversight, managed onboarding, and subscription plan enforcement.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={fetchOverview}
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
            <span>Onboard Clinic</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Customer Clinics"
          value={`${clinicsMetric.total_clinics} Organizations`}
          subtext={`${clinicsMetric.active_clinics} Active • ${clinicsMetric.suspended_clinics} Suspended`}
          icon={Building2}
          variant="indigo"
          action={setActiveTab ? () => setActiveTab('platform-clinics') : undefined}
          actionText="View Clinics"
        />

        <MetricCard
          title="Provisioned Branches"
          value={`${data?.totalBranches || 0} Locations`}
          subtext="Active physical dental clinics"
          icon={Layers}
          variant="teal"
          action={setActiveTab ? () => setActiveTab('platform-clinics') : undefined}
          actionText="View Network"
        />

        <MetricCard
          title="Customer Personnel"
          value={`${data?.totalUsers || 0} Users`}
          subtext="Practitioners & clinic staff"
          icon={Users}
          variant="slate"
        />

        <MetricCard
          title="Subscription Tiers"
          value={`${plans.length} Configured Plans`}
          subtext="Starter, Pro, Enterprise"
          icon={CreditCard}
          variant="emerald"
          action={setActiveTab ? () => setActiveTab('platform-plans') : undefined}
          actionText="Manage Plans"
        />
      </div>

      {/* Subscription Tier Distribution */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Subscription Plan Distribution
            </h2>
            <p className="text-xs text-slate-500">
              Active clinic organization breakdown across subscription plans
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('platform-plans')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center"
          >
            <span>Configure Tiers</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data?.planDistribution?.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between"
            >
              <div>
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                  {p.plan_code}
                </span>
                <h3 className="text-xs font-bold text-slate-900 mt-1">{p.plan_name}</h3>
                <span className="text-[10px] text-slate-500">Up to {p.max_branches} branch limit</span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-indigo-700">{p.assigned_clinics_count || 0}</span>
                <span className="block text-[10px] text-slate-400 font-medium">Clinics</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Platform Audit Trail */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Recent Platform Provisioning & Governance Activity
            </h2>
            <p className="text-xs text-slate-500">
              Immutable audit trail of clinic onboarding, plan assignments, and status modifications
            </p>
          </div>
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
            {data?.recentActivity?.length || 0} Audit Events
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Target Entity</th>
                <th className="py-2.5 px-3">Initiated By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.recentActivity?.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-4 text-center text-slate-400">
                    No recent platform audit events found.
                  </td>
                </tr>
              ) : (
                data?.recentActivity?.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700 uppercase text-[11px]">
                      {log.entity_type}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {log.performed_by_email || 'SuperAdmin'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Managed Onboarding Modal */}
      <ManagedOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onClinicCreated={fetchOverview}
        plans={plans}
      />
    </div>
  );
};

export default PlatformDashboardPage;
