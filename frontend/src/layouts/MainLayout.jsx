import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from '../components/navigation/Sidebar';
import { TopHeader } from '../components/navigation/TopHeader';
import { authService } from '../services/authService';
import { CheckCircle2 } from 'lucide-react';

export const MainLayout = ({ children, activeTab, setActiveTab }) => {
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [health, setHealth] = useState({ online: true, db: 'connected', loading: false });

  // Quick health check on mount
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await authService.checkHealth();
        if (mounted) {
          setHealth({ online: true, db: res.database?.status || 'connected', loading: false });
        }
      } catch {
        if (mounted) {
          setHealth({ online: false, db: 'disconnected', loading: false });
        }
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex font-sans text-slate-800">
      {/* Left Collapsible Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header */}
        <TopHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setIsMobileOpen={setIsMobileOpen}
          health={health}
        />

        {/* Dynamic Page Workspace Body */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        {/* Corporate Enterprise Footer */}
        <footer className="bg-white border-t border-slate-200/80 py-3 text-xs text-slate-500 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="font-medium text-slate-500">
              {user?.isPlatformAdmin ? 'VoiceGate Cloud Core' : 'VoiceGate Dental ERP'} &bull; LeadSquared-Inspired Architecture &bull; &copy; 2026
            </span>
            <div className="flex items-center space-x-3 text-slate-400">
              <span className="flex items-center text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                {user?.isPlatformAdmin ? 'SaaS Platform Governance Active' : 'Multi-Branch Clinical Network Active'}
              </span>
              <span>&bull;</span>
              <span>{user?.isPlatformAdmin ? 'Platform Scope: Multi-Tenant' : `Clinical Network: ${user?.clinicCode || 'HQ-001'}`}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default MainLayout;
