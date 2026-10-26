import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BranchSelector } from '../BranchSelector';
import {
  Menu,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Database,
  Building2,
  User,
  Stethoscope,
  Activity,
  CheckCircle2
} from 'lucide-react';

export const TopHeader = ({
  activeTab,
  setActiveTab,
  setIsMobileOpen,
  health,
}) => {
  const { user, logout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

  const getBreadcrumbTitle = () => {
    if (activeTab === 'platform-dashboard') return 'Platform Console';
    if (activeTab === 'platform-clinics') return 'Clinic Organizations';
    if (activeTab === 'platform-plans') return 'Subscription Plans';
    if (activeTab === 'appointments') return 'Appointments & Calendar';
    if (activeTab === 'reception') return 'Reception Desk & Live Queue';
    if (activeTab === 'staff') return 'Staff & Human Resources';
    if (activeTab === 'doctor-fees') return 'Doctor & Fee Management';
    if (activeTab === 'schedules') return 'Doctor Schedule & Slot Management';
    if (activeTab === 'patients') return 'Patient Management';
    if (activeTab === 'branches') return 'Branch Management';
    return 'Operations Dashboard';
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs flex items-center justify-between px-4 sm:px-6">
      {/* Left: Mobile Menu Toggle & Breadcrumbs */}
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex flex-col text-left">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
            <span>{isPlatformAdmin ? 'VoiceGate Cloud' : 'VoiceGate ERP'}</span>
            <span>&bull;</span>
            <span className={isPlatformAdmin ? 'text-indigo-700 font-bold' : 'text-teal-700 font-bold'}>
              {isPlatformAdmin ? 'SuperAdmin' : user?.clinicCode || 'HQ-001'}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 tracking-tight leading-none mt-0.5">
            {getBreadcrumbTitle()}
          </div>
        </div>
      </div>

      {/* Middle & Right: Scope / Branch Selector, Health, Profile */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* If SuperAdmin: Platform Scope Indicator; Else: Clinic Branch Selector */}
        {isPlatformAdmin ? (
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Platform Governance Scope</span>
          </div>
        ) : (
          <BranchSelector />
        )}

        {/* PostgreSQL Database Health Status */}
        <div className="hidden lg:flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              health?.online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-500 font-medium">DB:</span>
          <span className={`font-semibold ${health?.online ? 'text-emerald-700' : 'text-rose-600'}`}>
            {health?.online ? 'Connected' : 'Offline'}
          </span>
        </div>

        {/* User Profile Popover */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center space-x-2.5 p-1.5 rounded-lg hover:bg-slate-100/80 transition text-left"
          >
            <div
              className={`w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center border shrink-0 ${
                isPlatformAdmin ? 'bg-indigo-900 border-indigo-400' : 'bg-slate-800 border-slate-300'
              }`}
            >
              {user?.firstName?.[0] || 'U'}
            </div>
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-xs font-bold text-slate-800 leading-tight">
                {user?.fullName || user?.firstName}
              </span>
              <span
                className={`text-[10px] font-semibold truncate max-w-[120px] ${
                  isPlatformAdmin ? 'text-indigo-700' : 'text-teal-700'
                }`}
              >
                {isPlatformAdmin ? 'Platform Super Admin' : user?.roleDisplay || user?.role}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {/* Profile Dropdown Menu */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-900">
                  {user?.fullName || user?.firstName}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {user?.email}
                </div>
                <div
                  className={`mt-1.5 flex items-center space-x-1.5 text-[10px] font-semibold px-2 py-0.5 rounded border w-fit ${
                    isPlatformAdmin
                      ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                      : 'bg-teal-50 text-teal-800 border-teal-200/80'
                  }`}
                >
                  <ShieldCheck className={`w-3 h-3 ${isPlatformAdmin ? 'text-indigo-600' : 'text-teal-600'}`} />
                  <span>{isPlatformAdmin ? 'Platform Super Admin' : user?.roleDisplay}</span>
                </div>
              </div>

              {/* Organization Context */}
              <div className="px-4 py-2 border-b border-slate-100 text-[11px] text-slate-600 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{isPlatformAdmin ? 'Platform:' : 'Clinic:'}</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                    {isPlatformAdmin ? 'VoiceGate Cloud Core' : user?.clinicName}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="py-1">
                {isPlatformAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('platform-dashboard');
                        setIsProfileOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                    >
                      <Activity className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Platform Console</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('platform-clinics');
                        setIsProfileOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                    >
                      <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Clinic Organizations</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('dashboard');
                        setIsProfileOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                    >
                      <Activity className="w-3.5 h-3.5 text-slate-400" />
                      <span>Operations Dashboard</span>
                    </button>

                    {user?.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('branches');
                          setIsProfileOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                      >
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Branch Management</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Logout Button */}
              <div className="pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    logout();
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center space-x-2 font-medium transition"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopHeader;
