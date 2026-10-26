import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Activity, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Stethoscope, 
  UserCheck,
  Building2,
  Sparkles,
  Layers,
  Database,
  Server
} from 'lucide-react';
import { toast } from 'react-toastify';
import { authService } from '../services/authService';

export const LoginPage = () => {
  const { login } = useAuth();
  const isDev = Boolean(import.meta.env.DEV);
  const [email, setEmail] = useState(isDev ? 'admin@dentalerp.com' : '');
  const [password, setPassword] = useState(isDev ? 'Admin@123' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [backendStatus, setBackendStatus] = useState({ checking: true, connected: false });

  // Test backend API connectivity on login page load
  useEffect(() => {
    let active = true;
    const testPing = async () => {
      try {
        const res = await authService.checkHealth();
        if (active) {
          setBackendStatus({ checking: false, connected: res.status === 'healthy' });
        }
      } catch {
        if (active) {
          setBackendStatus({ checking: false, connected: false });
        }
      }
    };
    testPing();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.warn('Please enter both email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.firstName}! Logged in as ${user.roleDisplay}.`);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Login failed. Check server status.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const setDemoUser = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    toast.info(`Populated credentials for: ${demoEmail}`);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-800/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[560px]">
        
        {/* Left Enterprise Branding Panel (Dark Slate / LeadSquared Style) */}
        <div className="md:col-span-5 bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#0f172a] p-8 text-white flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
          <div>
            {/* Brand Logo & Name */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-teal-500/30">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <span className="font-extrabold text-lg text-white tracking-tight">VoiceGate</span>
                <span className="block text-[11px] font-semibold text-teal-400 uppercase tracking-wider">
                  Dental Clinic ERP
                </span>
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-100 tracking-tight leading-snug">
              Enterprise Dental Practice Operations & CRM
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Multi-branch clinical governance, RBAC role-scoping, and centralized practice intelligence.
            </p>

            {/* Feature Highlights */}
            <div className="mt-8 space-y-3.5 text-xs text-slate-300">
              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Multi-Branch Architecture</span>
                  <p className="text-[11px] text-slate-400">Headquarters and satellite clinic location scoping</p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Role-Based Access Control</span>
                  <p className="text-[11px] text-slate-400">Administrators, dentists, specialists, and front desk</p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">PostgreSQL Enterprise Pool</span>
                  <p className="text-[11px] text-slate-400">Transactional schema migrations with zero data loss</p>
                </div>
              </div>
            </div>
          </div>

          {/* Infrastructure Health Badge */}
          <div className="mt-8 pt-4 border-t border-slate-800 text-[11px] flex items-center justify-between text-slate-400">
            <span>Service Status:</span>
            {backendStatus.checking ? (
              <span className="text-slate-400 animate-pulse">Checking API...</span>
            ) : backendStatus.connected ? (
              <span className="inline-flex items-center text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                API & DB Online (Port 5000)
              </span>
            ) : (
              <span className="inline-flex items-center text-rose-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5" />
                Backend Offline
              </span>
            )}
          </div>
        </div>

        {/* Right Form Panel (Clean Corporate White Surface) */}
        <div className="md:col-span-7 p-8 sm:p-10 flex flex-col justify-between bg-white">
          <div>
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                Sign in to your account
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter your registered practice credentials to access the clinic workspace
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@dentalerp.com"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 inline-flex items-center justify-center py-2.5 px-4 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 focus:ring-4 focus:ring-teal-500/20 rounded-lg shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span>Authenticating Session...</span>
                ) : (
                  <>
                    <span>Sign In to Clinical Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-2" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Seed Accounts (Excluded from production builds) */}
            {isDev && (
              <div className="mt-6 pt-5 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block mb-2 font-mono">
                  Development Mode &bull; Demo Seed Accounts:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setDemoUser('superadmin@voicegate.com', 'SuperAdmin@VoiceGate2026')}
                    className="flex flex-col items-center p-2 rounded-lg bg-indigo-50/70 hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-400 transition text-left group"
                  >
                    <Server className="w-4 h-4 text-indigo-600 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-slate-800 text-[11px]">SuperAdmin</span>
                    <span className="text-[9px] text-indigo-700 font-mono">Platform SaaS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDemoUser('admin@dentalerp.com', 'Admin@123')}
                    className="flex flex-col items-center p-2 rounded-lg bg-slate-50 hover:bg-teal-50/80 border border-slate-200 hover:border-teal-300 transition text-left group"
                  >
                    <ShieldCheck className="w-4 h-4 text-teal-600 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-slate-800 text-[11px]">Clinic Admin</span>
                    <span className="text-[9px] text-slate-400 font-mono">Admin@123</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDemoUser('dentist@dentalerp.com', 'Dentist@123')}
                    className="flex flex-col items-center p-2 rounded-lg bg-slate-50 hover:bg-teal-50/80 border border-slate-200 hover:border-teal-300 transition text-left group"
                  >
                    <Stethoscope className="w-4 h-4 text-emerald-600 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-slate-800 text-[11px]">Dentist</span>
                    <span className="text-[9px] text-slate-400 font-mono">Dentist@123</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDemoUser('reception@dentalerp.com', 'Reception@123')}
                    className="flex flex-col items-center p-2 rounded-lg bg-slate-50 hover:bg-teal-50/80 border border-slate-200 hover:border-teal-300 transition text-left group"
                  >
                    <UserCheck className="w-4 h-4 text-blue-600 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="font-bold text-slate-800 text-[11px]">Reception</span>
                    <span className="text-[9px] text-slate-400 font-mono">Reception@123</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Notice */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>VoiceGate Health Technologies</span>
            <span>v1.5 Enterprise</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
