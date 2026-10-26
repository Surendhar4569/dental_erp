import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { BranchManagementPage } from './pages/BranchManagementPage';
import { PatientManagementPage } from './pages/PatientManagementPage';
import { AppointmentCalendarPage } from './pages/AppointmentCalendarPage';
import { ReceptionDeskPage } from './pages/ReceptionDeskPage';
import { DoctorSchedulePage } from './pages/DoctorSchedulePage';
import { AnnualCalendarPage } from './pages/AnnualCalendarPage';
import { HolidayMasterPage } from './pages/HolidayMasterPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { DoctorFeeManagementPage } from './pages/DoctorFeeManagementPage';
import { PlatformDashboardPage } from './pages/platform/PlatformDashboardPage';
import { ClinicsManagementPage } from './pages/platform/ClinicsManagementPage';
import { SubscriptionPlansPage } from './pages/platform/SubscriptionPlansPage';
import { MainLayout } from './layouts/MainLayout';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Activity } from 'lucide-react';

// Inner component with access to AuthContext and BranchContext
const AppContent = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    if (user?.isPlatformAdmin) {
      if (!activeTab.startsWith('platform-')) {
        setActiveTab('platform-dashboard');
      }
    } else if (user) {
      if (activeTab.startsWith('platform-')) {
        setActiveTab('dashboard');
      }
    }
  }, [user?.isPlatformAdmin]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-teal-500 flex items-center justify-center animate-pulse mb-4">
          <Activity className="w-7 h-7 text-white" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-slate-300">
          Loading DentalCare ERP...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Render workspace based on authorization scope
  const renderWorkspace = () => {
    if (user?.isPlatformAdmin) {
      switch (activeTab) {
        case 'platform-clinics':
          return <ClinicsManagementPage />;
        case 'platform-plans':
          return <SubscriptionPlansPage />;
        case 'platform-dashboard':
        default:
          return <PlatformDashboardPage setActiveTab={setActiveTab} />;
      }
    }

    // Clinic Workspace
    if (activeTab === 'appointments') {
      return <AppointmentCalendarPage />;
    }
    if (activeTab === 'reception') {
      return <ReceptionDeskPage />;
    }
    if (activeTab === 'staff') {
      return <StaffManagementPage setActiveTab={setActiveTab} />;
    }
    if (activeTab === 'doctor-fees') {
      return <DoctorFeeManagementPage setActiveTab={setActiveTab} />;
    }
    if (activeTab === 'schedules') {
      return <DoctorSchedulePage />;
    }
    if (activeTab === 'annual-calendar' || activeTab === 'holidays') {
      return <AnnualCalendarPage />;
    }
    if (activeTab === 'patients') {
      return <PatientManagementPage />;
    }
    if (activeTab === 'branches' && user?.role === 'admin') {
      return <BranchManagementPage />;
    }
    return <DashboardPage setActiveTab={setActiveTab} />;
  };

  return (
    <MainLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderWorkspace()}
    </MainLayout>
  );
};

export function App() {
  return (
    <AuthProvider>
      <BranchProvider>
        <AppContent />
        <ToastContainer
          position="top-center"
          autoClose={3500}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
      </BranchProvider>
    </AuthProvider>
  );
}

export default App;
