import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { 
  Building2, 
  Users, 
  Database, 
  RefreshCw, 
  Key, 
  ArrowUpRight, 
  Info 
} from 'lucide-react';
import { authService } from '../services/authService';
import { branchService } from '../services/branchService';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { toast } from 'react-toastify';

export const DashboardPage = ({ setActiveTab }) => {
  const { user } = useAuth();
  const { activeBranch, branches, viewMode, setViewMode, isOrgAdmin } = useBranch();

  const [health, setHealth] = useState(null);
  const [roles, setRoles] = useState([]);
  const [branchStats, setBranchStats] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHealthAndStats = async () => {
    try {
      setIsRefreshing(true);
      const [healthData, rolesData] = await Promise.all([
        authService.checkHealth(),
        authService.getRoles(),
      ]);
      setHealth(healthData);
      setRoles(rolesData.roles || []);

      if (activeBranch?.id) {
        try {
          const statsData = await branchService.getBranchStats(activeBranch.id);
          setBranchStats(statsData.staffStatistics || null);
        } catch {
          setBranchStats(null);
        }
      }
      toast.success('Live practice metrics and server status refreshed!');
    } catch (err) {
      toast.error('Failed to query backend health: ' + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealthAndStats();
  }, [activeBranch?.id]);

  return (
    <div className="space-y-6">
      {/* Enterprise Welcome Banner */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            <span>VoiceGate Clinical Operations</span>
            <span>&bull;</span>
            <span className="text-teal-700 font-bold">
              {user?.clinicName} ({user?.clinicCode})
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Welcome, {user?.fullName || user?.firstName}
          </h1>

          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Role:</span>
            <span className="font-semibold text-slate-800">{user?.roleDisplay}</span>
            {user?.specialization && (
              <>
                <span>&bull;</span>
                <span className="text-teal-700 font-medium">{user.specialization}</span>
              </>
            )}
            <span>&bull;</span>
            <span>Active Branch:</span>
            <span className="font-semibold text-slate-800 font-mono">
              {activeBranch?.branch_name || 'Organization'} ({activeBranch?.branch_code || 'ALL'})
            </span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2.5 shrink-0 self-start md:self-auto">

          <button
            type="button"
            onClick={fetchHealthAndStats}
            disabled={isRefreshing}
            className="inline-flex items-center px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition disabled:opacity-50"
            title="Refresh system status"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {setActiveTab && (
            <button
              type="button"
              onClick={() => setActiveTab('patients')}
              className="inline-flex items-center px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              <span>Patient Registry</span>
            </button>
          )}

          {isOrgAdmin && setActiveTab && (
            <button
              type="button"
              onClick={() => setActiveTab('branches')}
              className="inline-flex items-center px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg shadow-xs transition"
            >
              <span>Manage Branches</span>
              <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Active Location"
          value={viewMode === 'all' ? `${branches.length} Locations` : activeBranch?.branch_name || 'N/A'}
          subtext={
            viewMode === 'all'
              ? `${branches.filter((b) => b.is_active).length} active branches in clinic`
              : `${activeBranch?.city || 'Metro City'} • Code: ${activeBranch?.branch_code || 'MAIN-01'}`
          }
          icon={Building2}
          variant="teal"
          action={isOrgAdmin && setActiveTab ? () => setActiveTab('branches') : undefined}
          actionText={isOrgAdmin ? 'View Network' : undefined}
        />

        <MetricCard
          title="Branch Personnel"
          value={
            branchStats
              ? `${branchStats.totalAssignedStaff} Assigned`
              : `${activeBranch?.assigned_users_count || 0} Staff`
          }
          subtext={
            branchStats
              ? `${branchStats.dentistsCount} Dentists • ${branchStats.receptionistsCount} Reception`
              : 'Authorized practitioners'
          }
          icon={Users}
          variant="emerald"
          action={isOrgAdmin && setActiveTab ? () => setActiveTab('branches') : undefined}
          actionText={isOrgAdmin ? 'Manage Staff' : undefined}
        />

        <MetricCard
          title="PostgreSQL Pool"
          value={health?.database?.status || 'Connected'}
          subtext={`Database: ${health?.database?.name || 'dental_clinic_erp'} • Port 5432`}
          icon={Database}
          variant="slate"
        />

        <MetricCard
          title="Authentication Session"
          value="JWT Active"
          subtext={`Role: ${user?.roleDisplay} • 24h Expiry`}
          icon={Key}
          variant="indigo"
        />
      </div>

      {/* Two-Column Section: Active Branch Profile & Staff Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Active Location Details */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Operational Location Profile
              </h2>
            </div>
            {activeBranch && (
              <StatusBadge
                status={activeBranch.is_active ? 'active' : 'inactive'}
                label={activeBranch.is_active ? 'Location Active' : 'Location Inactive'}
              />
            )}
          </div>

          {activeBranch ? (
            <div className="space-y-3.5 text-xs">
              <div className="flex items-start justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium">Branch Display Name:</span>
                <span className="font-bold text-slate-800 text-right">{activeBranch.branch_name}</span>
              </div>

              <div className="flex items-start justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium">Branch Code:</span>
                <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {activeBranch.branch_code}
                </span>
              </div>

              <div className="flex items-start justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium">Physical Address:</span>
                <span className="font-medium text-slate-700 text-right max-w-xs">
                  {activeBranch.address_line1 || 'No address specified'}, {activeBranch.city || 'Metro City'}
                </span>
              </div>

              <div className="flex items-start justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium">Telephone & Email:</span>
                <span className="font-medium text-slate-700 text-right">
                  {activeBranch.phone || 'N/A'} &bull; {activeBranch.email || 'N/A'}
                </span>
              </div>

              <div className="flex items-start justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400 font-medium">Local Timezone:</span>
                <span className="font-medium text-slate-700">{activeBranch.timezone || 'Asia/Kolkata'}</span>
              </div>

              <div className="flex items-start justify-between py-1">
                <span className="text-slate-400 font-medium">Headquarters Status:</span>
                <span className="font-medium">
                  {activeBranch.is_default ? (
                    <span className="text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                      Default Organization Headquarters
                    </span>
                  ) : (
                    <span className="text-slate-600">Satellite Branch</span>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              No active branch selected. Please choose a location from the top header.
            </div>
          )}
        </div>

        {/* Right: Real Staff Breakdown for Active Location */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Personnel Allocation ({activeBranch?.branch_code || 'HQ'})
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-500 font-semibold">
                Live DB Records
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400">Dentists</div>
                <div className="text-xl font-extrabold text-teal-700 mt-0.5">
                  {branchStats?.dentistsCount || 0}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Clinical Practitioners</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400">Specialists</div>
                <div className="text-xl font-extrabold text-indigo-700 mt-0.5">
                  {branchStats?.specialistsCount || 0}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Endo, Ortho, Surgery</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400">Reception</div>
                <div className="text-xl font-extrabold text-blue-700 mt-0.5">
                  {branchStats?.receptionistsCount || 0}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Front Desk & Registration</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400">Support Staff</div>
                <div className="text-xl font-extrabold text-slate-700 mt-0.5">
                  {branchStats?.otherStaffCount || 0}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Assistants & Clinic Office</div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-teal-50/70 rounded-lg border border-teal-200 text-xs text-teal-900 flex items-start space-x-2">
            <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <span className="font-bold">Role Scoped:</span> Personnel and practitioners assigned to this branch location have isolated access to operational management for this location.
            </p>
          </div>
        </div>
      </div>

      {/* Configured System Roles (From PostgreSQL) */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              System Roles & Access Catalog
            </h2>
            <p className="text-xs text-slate-500">
              Role-Based Access Control (RBAC) initialized in PostgreSQL database
            </p>
          </div>
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
            {roles.length} System Roles
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Role Code</th>
                <th className="py-2.5 px-3">Display Name</th>
                <th className="py-2.5 px-3">Description & Operational Privileges</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3 font-mono font-bold text-teal-800">{r.name}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-800">{r.display_name}</td>
                  <td className="py-2.5 px-3 text-slate-500">{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
