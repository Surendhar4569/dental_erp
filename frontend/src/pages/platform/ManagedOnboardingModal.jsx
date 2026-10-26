import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { platformService } from '../../services/platformService';
import { toast } from 'react-toastify';
import {
  Building2,
  Users,
  ShieldCheck,
  CreditCard,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';

export const ManagedOnboardingModal = ({ isOpen, onClose, onClinicCreated, plans = [] }) => {
  const initialForm = {
    clinic_name: '',
    clinic_code: '',
    phone: '',
    email: '',
    address: '',
    timezone: 'Asia/Kolkata',
    plan_code: plans[0]?.plan_code || 'STARTER',
    branch_name: '',
    branch_code: 'MAIN-01',
    branch_city: 'Metro City',
    branch_phone: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_email: '',
    admin_password: '',
    admin_phone: '',
  };

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSummary, setCreatedSummary] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.clinic_name.trim()) newErrors.clinic_name = 'Clinic name is required';
    if (!form.clinic_code.trim()) newErrors.clinic_code = 'Clinic code is required';
    if (!form.branch_name.trim()) newErrors.branch_name = 'Primary branch name is required';
    if (!form.branch_code.trim()) newErrors.branch_code = 'Primary branch code is required';
    if (!form.admin_first_name.trim()) newErrors.admin_first_name = 'Admin first name is required';
    if (!form.admin_email.trim()) newErrors.admin_email = 'Admin email is required';
    if (!form.admin_password || form.admin_password.length < 8) {
      newErrors.admin_password = 'Password must be at least 8 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.warn('Please fill in all required onboarding fields.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        clinic_name: form.clinic_name,
        clinic_code: form.clinic_code,
        phone: form.phone,
        email: form.email,
        address: form.address,
        timezone: form.timezone,
        plan_code: form.plan_code,
        primary_branch: {
          branch_name: form.branch_name,
          branch_code: form.branch_code,
          city: form.branch_city,
          phone: form.branch_phone || form.phone,
        },
        admin_user: {
          first_name: form.admin_first_name,
          last_name: form.admin_last_name,
          email: form.admin_email,
          password: form.admin_password,
          phone: form.admin_phone || form.phone,
        },
      };

      const res = await platformService.onboardClinic(payload);
      toast.success(`Clinic '${res.clinic.name}' successfully provisioned!`);
      
      setCreatedSummary({
        clinic: res.clinic,
        branch: res.primaryBranch,
        admin: {
          ...res.administrator,
          password: form.admin_password, // For one-time manual transmission to clinic admin
        },
      });

      if (onClinicCreated) {
        onClinicCreated(res.clinic);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Onboarding failed.';
      toast.error(msg);
      if (err.response?.data?.errors) {
        setErrors(err.response.data.errors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setForm(initialForm);
    setErrors({});
    setCreatedSummary(null);
    onClose();
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.info(`${label} copied to clipboard.`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={createdSummary ? 'Provisioning Complete' : 'Managed Clinic Onboarding'}
      size="xl"
    >
      {createdSummary ? (
        <div className="space-y-5 text-slate-800">
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-emerald-950">
                Organization & Administrator Provisioned Successfully
              </h3>
              <p className="text-xs text-emerald-700 mt-0.5">
                The database records, default branch, administrator account, and subscription tier have been atomically initialized.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 uppercase text-[10px] tracking-wider border-b border-slate-200 pb-1">
              Provisioned Organization Details
            </h4>
            <div className="grid grid-cols-2 gap-2 text-slate-600">
              <div><span className="font-medium text-slate-400">Clinic Name:</span> <strong className="text-slate-800">{createdSummary.clinic.name}</strong></div>
              <div><span className="font-medium text-slate-400">Clinic Code:</span> <code className="font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">{createdSummary.clinic.code}</code></div>
              <div><span className="font-medium text-slate-400">Primary Branch:</span> <strong className="text-slate-800">{createdSummary.branch.branch_name} ({createdSummary.branch.branch_code})</strong></div>
              <div><span className="font-medium text-slate-400">Subscription Status:</span> <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded uppercase text-[10px]">Active</span></div>
            </div>
          </div>

          {/* Initial Admin Credentials Confirmation */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-950 uppercase text-[10px] tracking-wider flex items-center">
                <Lock className="w-3.5 h-3.5 mr-1 text-amber-600" />
                Clinic Administrator Initial Credentials
              </span>
              <span className="text-[10px] text-amber-700 font-medium">Manual Secure Distribution</span>
            </div>
            
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Share these credentials securely with the clinic administrator. No automated public emails are dispatched.
            </p>

            <div className="bg-white rounded-lg p-3 border border-amber-200 font-mono space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Login URL: <strong>http://localhost:5173</strong></span>
                <button
                  type="button"
                  onClick={() => copyToClipboard('http://localhost:5173', 'Login URL')}
                  className="text-amber-800 hover:text-amber-950 p-1"
                  title="Copy URL"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span>Email: <strong>{createdSummary.admin.email}</strong></span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdSummary.admin.email, 'Admin Email')}
                  className="text-amber-800 hover:text-amber-950 p-1"
                  title="Copy Email"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span>Password: <strong>{createdSummary.admin.password}</strong></span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdSummary.admin.password, 'Admin Password')}
                  className="text-amber-800 hover:text-amber-950 p-1"
                  title="Copy Password"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
            >
              Done & Return to Clinics
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 text-xs text-slate-700">
          {/* Section 1: Organization Profile */}
          <div>
            <div className="flex items-center space-x-2 text-indigo-950 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 pb-1.5 mb-3">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span>1. Clinic Organization Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Clinic Name *
                </label>
                <input
                  type="text"
                  name="clinic_name"
                  value={form.clinic_name}
                  onChange={handleChange}
                  placeholder="e.g. Apex Multi-Specialty Dental Clinic"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-2 focus:outline-hidden ${
                    errors.clinic_name ? 'border-rose-400 ring-rose-200' : 'border-slate-300 focus:border-indigo-500 ring-indigo-100'
                  }`}
                />
                {errors.clinic_name && <p className="text-[10px] text-rose-500 mt-0.5">{errors.clinic_name}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Unique Organization Code *
                </label>
                <input
                  type="text"
                  name="clinic_code"
                  value={form.clinic_code}
                  onChange={handleChange}
                  placeholder="e.g. APEX-002"
                  className={`w-full px-3 py-2 rounded-lg border text-xs font-mono uppercase focus:ring-2 focus:outline-hidden ${
                    errors.clinic_code ? 'border-rose-400 ring-rose-200' : 'border-slate-300 focus:border-indigo-500 ring-indigo-100'
                  }`}
                />
                {errors.clinic_code && <p className="text-[10px] text-rose-500 mt-0.5">{errors.clinic_code}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Clinic Phone
                </label>
                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 00000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:border-indigo-500 ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Clinic Contact Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="contact@apex-dental.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:border-indigo-500 ring-indigo-100"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Primary Branch */}
          <div>
            <div className="flex items-center space-x-2 text-indigo-950 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 pb-1.5 mb-3">
              <MapPin className="w-4 h-4 text-teal-600" />
              <span>2. Initial Primary Branch</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Primary Branch Name *
                </label>
                <input
                  type="text"
                  name="branch_name"
                  value={form.branch_name}
                  onChange={handleChange}
                  placeholder="e.g. Apex Central Headquarters"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-2 focus:outline-hidden ${
                    errors.branch_name ? 'border-rose-400 ring-rose-200' : 'border-slate-300 focus:border-indigo-500 ring-indigo-100'
                  }`}
                />
                {errors.branch_name && <p className="text-[10px] text-rose-500 mt-0.5">{errors.branch_name}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Branch Code *
                </label>
                <input
                  type="text"
                  name="branch_code"
                  value={form.branch_code}
                  onChange={handleChange}
                  placeholder="MAIN-01"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono uppercase focus:ring-2 focus:border-indigo-500 ring-indigo-100"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Initial Administrator Account */}
          <div>
            <div className="flex items-center space-x-2 text-indigo-950 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 pb-1.5 mb-3">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>3. Initial Clinic Administrator Account</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Administrator First Name *
                </label>
                <input
                  type="text"
                  name="admin_first_name"
                  value={form.admin_first_name}
                  onChange={handleChange}
                  placeholder="Dr. Rajesh"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-2 focus:outline-hidden ${
                    errors.admin_first_name ? 'border-rose-400 ring-rose-200' : 'border-slate-300 focus:border-indigo-500 ring-indigo-100'
                  }`}
                />
                {errors.admin_first_name && <p className="text-[10px] text-rose-500 mt-0.5">{errors.admin_first_name}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Administrator Last Name
                </label>
                <input
                  type="text"
                  name="admin_last_name"
                  value={form.admin_last_name}
                  onChange={handleChange}
                  placeholder="Sharma"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:border-indigo-500 ring-indigo-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Administrator Login Email *
                </label>
                <input
                  type="email"
                  name="admin_email"
                  value={form.admin_email}
                  onChange={handleChange}
                  placeholder="dr.rajesh@apex-dental.com"
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-2 focus:outline-hidden ${
                    errors.admin_email ? 'border-rose-400 ring-rose-200' : 'border-slate-300 focus:border-indigo-500 ring-indigo-100'
                  }`}
                />
                {errors.admin_email && <p className="text-[10px] text-rose-500 mt-0.5">{errors.admin_email}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Initial Password (Min 8 characters) *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="admin_password"
                    value={form.admin_password}
                    onChange={handleChange}
                    placeholder="••••••••••••"
                    className={`w-full px-3 py-2 pr-9 rounded-lg border text-xs focus:ring-2 focus:outline-hidden ${
                      errors.admin_password ? 'border-rose-400 ring-rose-200' : 'border-slate-300 focus:border-indigo-500 ring-indigo-100'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {errors.admin_password && <p className="text-[10px] text-rose-500 mt-0.5">{errors.admin_password}</p>}
              </div>
            </div>
          </div>

          {/* Section 4: Subscription Plan */}
          <div>
            <div className="flex items-center space-x-2 text-indigo-950 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 pb-1.5 mb-3">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span>4. Subscription Tier Allocation</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {plans.map((p) => {
                const isSelected = form.plan_code === p.plan_code;
                return (
                  <div
                    key={p.id}
                    onClick={() => setForm((prev) => ({ ...prev, plan_code: p.plan_code }))}
                    className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{p.plan_name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Up to {p.max_branches} branch{p.max_branches > 1 ? 'es' : ''}
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] font-mono font-semibold text-indigo-700">
                      {p.plan_code}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition"
            >
              {isSubmitting ? 'Provisioning Clinic...' : 'Provision Clinic Organization'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ManagedOnboardingModal;
