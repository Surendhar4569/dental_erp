import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  Activity,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Server,
  Calendar,
  Ticket,
  Clock,
  UserCheck,
  IndianRupee,
  CalendarDays,
  Sparkles,
} from 'lucide-react';


export const Sidebar = ({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const { user } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

  const handleNavClick = (item) => {
    setActiveTab(item.id);
    if (setIsMobileOpen) setIsMobileOpen(false);
  };

  const navGroups = isPlatformAdmin
    ? [
        {
          groupTitle: 'Platform Governance',
          items: [
            {
              id: 'platform-dashboard',
              label: 'Platform Console',
              icon: LayoutDashboard,
              badge: 'SaaS',
            },
            {
              id: 'platform-clinics',
              label: 'Clinic Organizations',
              icon: Building2,
              badge: 'Tenants',
            },
            {
              id: 'platform-plans',
              label: 'Subscription Plans',
              icon: CreditCard,
              badge: 'Tiers',
            },
          ],
        },
      ]
    : [
        {
          groupTitle: 'Workspace',
          items: [
            {
              id: 'dashboard',
              label: 'Operations Dashboard',
              icon: LayoutDashboard,
              badge: 'Active',
            },
            {
              id: 'appointments',
              label: 'Appointments & Calendar',
              icon: Calendar,
              badge: 'Phase 2.2',
            },
            {
              id: 'reception',
              label: 'Reception Desk & Tokens',
              icon: Ticket,
              badge: 'Live',
            },
            {
              id: 'staff',
              label: 'Staff Management',
              icon: UserCheck,
              badge: 'Active',
            },
            {
              id: 'doctor-fees',
              label: 'Doctor & Fee Management',
              icon: IndianRupee,
              badge: 'Active',
            },
            {
              id: 'schedules',
              label: 'Doctor Schedule & Slots',
              icon: Clock,
              badge: 'Active',
            },
            {
              id: 'annual-calendar',
              label: 'Annual Holiday Calendar',
              icon: CalendarDays,
              badge: 'Holidays',
            },
            {
              id: 'patients',
              label: 'Patient Management',
              icon: Users,
              badge: 'Active',
            },
            ...(user?.role === 'admin'
              ? [
                  {
                    id: 'branches',
                    label: 'Branch Management',
                    icon: Building2,
                    badge: 'Active',
                  },
                ]
              : []),
          ],
        },
      ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-xs"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen bg-[#0f172a] text-slate-300 flex flex-col z-50 transition-all duration-200 border-r border-slate-800 shrink-0 ${
          isCollapsed ? 'w-16' : 'w-64'
        } ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-800/80 justify-between shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow-md ${
                isPlatformAdmin
                  ? 'bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-indigo-500/30'
                  : 'bg-gradient-to-tr from-teal-500 to-emerald-400 shadow-teal-500/20'
              }`}
            >
              {isPlatformAdmin ? <Server className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
            </div>

            {!isCollapsed && (
              <div className="flex flex-col leading-tight overflow-hidden">
                <span className="font-bold text-white text-sm tracking-tight truncate">
                  {isPlatformAdmin ? 'VoiceGate Cloud' : 'VoiceGate Dental ERP'}
                </span>
                <span
                  className={`text-[10px] font-medium truncate ${
                    isPlatformAdmin ? 'text-indigo-400' : 'text-teal-400'
                  }`}
                >
                  {isPlatformAdmin ? 'SaaS Platform Console' : user?.clinicName || 'Apex Healthcare Network'}
                </span>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation Modules List */}
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6 scrollbar-none">
          {navGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1">
              {!isCollapsed ? (
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  {group.groupTitle}
                </div>
              ) : (
                <div className="w-6 mx-auto h-[1px] bg-slate-800 mb-2" />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item)}
                    title={isCollapsed ? item.label : undefined}
                    className={`w-full flex items-center rounded-lg text-xs font-medium transition-all ${
                      isCollapsed
                        ? 'justify-center p-2.5'
                        : 'justify-between px-3 py-2'
                    } ${
                      isActive
                        ? 'bg-teal-600 text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-white' : 'text-teal-400'
                        }`}
                      />
                      {!isCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </div>

                    {!isCollapsed && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                          isActive
                            ? 'bg-teal-700/80 text-teal-100'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                        }`}
                      >
                        {item.badge || 'Active'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer Area: User mini-summary & Collapse Toggle */}
        <div className="p-3 border-t border-slate-800 shrink-0 bg-slate-950/40">
          {isCollapsed ? (
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5 truncate">
                <div
                  className={`w-8 h-8 rounded-full bg-slate-800 border flex items-center justify-center font-bold text-xs shrink-0 ${
                    isPlatformAdmin ? 'border-indigo-500/50 text-indigo-400' : 'border-slate-700 text-teal-400'
                  }`}
                >
                  {user?.firstName?.[0] || 'U'}
                </div>
                <div className="truncate text-left leading-tight">
                  <div className="text-xs font-bold text-white truncate">
                    {user?.fullName || user?.firstName}
                  </div>
                  <div
                    className={`text-[10px] font-medium truncate flex items-center ${
                      isPlatformAdmin ? 'text-indigo-400' : 'text-teal-400/90'
                    }`}
                  >
                    <ShieldCheck className="w-2.5 h-2.5 mr-1" />
                    {isPlatformAdmin ? 'Platform Super Admin' : user?.roleDisplay || user?.role}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="hidden md:flex p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
