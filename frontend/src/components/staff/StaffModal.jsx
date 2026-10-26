import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { staffService } from '../../services/staffService';
import { toast } from 'react-toastify';
import {
  User,
  Briefcase,
  KeyRound,
  ShieldAlert,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Stethoscope,
  Info,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'dentist', label: 'Dentist / Doctor', isClinical: true },
  { value: 'specialist', label: 'Dental Specialist', isClinical: true },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'assistant', label: 'Dental Assistant', isClinical: true },
  { value: 'hygienist', label: 'Dental Hygienist', isClinical: true },
  { value: 'nurse', label: 'Nurse', isClinical: true },
  { value: 'technician', label: 'Lab Technician' },
  { value: 'manager', label: 'Clinic Manager' },
  { value: 'billing', label: 'Accountant / Billing Staff' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'support', label: 'Housekeeping / Support Staff' },
  { value: 'other', label: 'Other Staff' },
];

const EMPLOYMENT_STATUSES = [
  { value: 'active', label: 'Active', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'probation', label: 'Probation', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'on_leave', label: 'On Leave', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'terminated', label: 'Terminated', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const LOGIN_ROLES = [
  { value: 'admin', label: 'Clinic Administrator' },
  { value: 'dentist', label: 'Dentist' },
  { value: 'specialist', label: 'Dental Specialist' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'assistant', label: 'Dental Assistant' },
  { value: 'billing', label: 'Billing Staff' },
  { value: 'radiologist', label: 'Dental Radiologist' },
  { value: 'inventory', label: 'Inventory Manager' },
];

export const StaffModal = ({ isOpen, onClose, staffMember, activeBranch, onSaved }) => {
  const isEdit = Boolean(staffMember);
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'employment' | 'login'
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    staff_number: '',
    first_name: '',
    last_name: '',
    gender: 'male',
    date_of_birth: '',
    phone: '',
    email: '',
    address: '',
    staff_category: 'dentist',
    designation: '',
    department: '',
    specialization: '',
    license_number: '',
    joining_date: new Date().toISOString().split('T')[0],
    employment_status: 'active',
    create_login: false,
    login_email: '',
    password: '',
    role: 'dentist',
  });

  useEffect(() => {
    if (staffMember) {
      setFormData({
        staff_number: staffMember.staff_number || '',
        first_name: staffMember.first_name || '',
        last_name: staffMember.last_name || '',
        gender: staffMember.gender || 'male',
        date_of_birth: staffMember.date_of_birth ? staffMember.date_of_birth.split('T')[0] : '',
        phone: staffMember.phone || '',
        email: staffMember.email || '',
        address: staffMember.address || '',
        staff_category: staffMember.staff_category || 'other',
        designation: staffMember.designation || '',
        department: staffMember.department || '',
        specialization: staffMember.specialization || '',
        license_number: staffMember.license_number || '',
        joining_date: staffMember.joining_date ? staffMember.joining_date.split('T')[0] : new Date().toISOString().split('T')[0],
        employment_status: staffMember.employment_status || 'active',
        create_login: false,
        login_email: staffMember.login_email || '',
        password: '',
        role: staffMember.login_role_name || 'dentist',
      });
      setActiveTab('personal');
    } else {
      setFormData({
        staff_number: '',
        first_name: '',
        last_name: '',
        gender: 'male',
        date_of_birth: '',
        phone: '',
        email: '',
        address: '',
        staff_category: 'dentist',
        designation: 'General Dentist',
        department: 'Dental Surgery',
        specialization: '',
        license_number: '',
        joining_date: new Date().toISOString().split('T')[0],
        employment_status: 'active',
        create_login: false,
        login_email: '',
        password: '',
        role: 'dentist',
      });
      setActiveTab('personal');
    }
  }, [staffMember, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      };

      // Auto-suggest role when category changes
      if (name === 'staff_category') {
        if (value === 'dentist') {
          updated.role = 'dentist';
          if (!updated.designation) updated.designation = 'General Dentist';
        } else if (value === 'specialist') {
          updated.role = 'specialist';
          if (!updated.designation) updated.designation = 'Dental Specialist';
        } else if (value === 'receptionist') {
          updated.role = 'receptionist';
          if (!updated.designation) updated.designation = 'Receptionist';
        } else if (value === 'assistant') {
          updated.role = 'assistant';
          if (!updated.designation) updated.designation = 'Dental Assistant';
        } else if (value === 'billing') {
          updated.role = 'billing';
          if (!updated.designation) updated.designation = 'Billing Staff';
        } else if (value === 'manager') {
          updated.role = 'admin';
          if (!updated.designation) updated.designation = 'Clinic Manager';
        }
      }

      // Auto-sync login email if empty
      if (name === 'email' && !prev.login_email) {
        updated.login_email = value;
      }

      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.first_name.trim()) {
      toast.error('First Name is required.');
      setActiveTab('personal');
      return;
    }

    if (!formData.phone.trim()) {
      toast.error('Phone number is required.');
      setActiveTab('personal');
      return;
    }

    if (!formData.staff_category) {
      toast.error('Staff Category is required.');
      setActiveTab('employment');
      return;
    }

    if (!isEdit && formData.create_login) {
      if (!formData.login_email) {
        toast.error('Login email is required when creating a system login.');
        setActiveTab('login');
        return;
      }
      if (!formData.password || formData.password.length < 6) {
        toast.error('Password must be at least 6 characters long.');
        setActiveTab('login');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      if (isEdit) {
        await staffService.updateStaff(staffMember.id, formData);
        toast.success(`Staff member ${formData.first_name} updated successfully.`);
      } else {
        const payload = {
          ...formData,
          branch_id: activeBranch?.id,
        };
        const res = await staffService.createStaff(payload);
        toast.success(`Staff member ${res.staff.first_name} (${res.staff.staff_number}) added successfully.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to save staff record.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Staff Member — ${formData.first_name} ${formData.last_name || ''}` : 'Add New Staff Member'}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Branch Context Indicator */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span className="text-slate-500 font-medium">Assigned Primary Branch:</span>
            <span className="font-bold text-slate-800">{activeBranch?.branch_name || 'Current Branch'}</span>
          </div>
          {formData.staff_number && (
            <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              {formData.staff_number}
            </span>
          )}
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'personal'
                ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <User className="w-4 h-4" />
            <span>1. Personal Information</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('employment')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'employment'
                ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>2. Employment & Clinical</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('login')}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              activeTab === 'login'
                ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>3. Login & Permissions</span>
          </button>
        </div>

        {/* Tab 1: Personal Information */}
        {activeTab === 'personal' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  First Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="first_name"
                  required
                  value={formData.first_name}
                  onChange={handleChange}
                  placeholder="e.g. Dr. Sarah"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  placeholder="e.g. Mitchell"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Gender
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="9876543210"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="sarah.mitchell@clinic.com"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Staff ID (Leave blank to auto-generate STF-10001+)
                </label>
                <input
                  type="text"
                  name="staff_number"
                  value={formData.staff_number}
                  onChange={handleChange}
                  placeholder="Auto-generated (e.g. STF-10001)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Residential / Contact Address
              </label>
              <textarea
                name="address"
                rows="2"
                value={formData.address}
                onChange={handleChange}
                placeholder="Complete street address, city, postal code"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Employment & Clinical Details */}
        {activeTab === 'employment' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Staff Category <span className="text-rose-500">*</span>
                </label>
                <select
                  name="staff_category"
                  value={formData.staff_category}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white font-semibold text-slate-800"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label} {cat.isClinical ? '• (Clinical)' : ''}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Staff category defines the employment classification. Only doctors appear in fee and schedule planners.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Official Designation / Job Title
                </label>
                <input
                  type="text"
                  name="designation"
                  value={formData.designation}
                  onChange={handleChange}
                  placeholder="e.g. Senior Endodontist / Front Desk Lead"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Department / Unit
                </label>
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  placeholder="e.g. Oral Surgery"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Joining Date
                </label>
                <input
                  type="date"
                  name="joining_date"
                  value={formData.joining_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Employment Status
                </label>
                <select
                  name="employment_status"
                  value={formData.employment_status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white font-semibold"
                >
                  {EMPLOYMENT_STATUSES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Doctor / Specialist Clinical Credentials */}
            {['dentist', 'specialist'].includes(formData.staff_category) && (
              <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-3">
                <div className="flex items-center space-x-2 text-teal-800 font-bold text-xs">
                  <Stethoscope className="w-4 h-4 text-teal-600" />
                  <span>Clinical Registration & Specialty Details</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-teal-900 uppercase tracking-wider mb-1">
                      Clinical Specialization
                    </label>
                    <input
                      type="text"
                      name="specialization"
                      value={formData.specialization}
                      onChange={handleChange}
                      placeholder="e.g. Endodontics & Conservative Dentistry"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-teal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-teal-900 uppercase tracking-wider mb-1">
                      Dental Council License Number
                    </label>
                    <input
                      type="text"
                      name="license_number"
                      value={formData.license_number}
                      onChange={handleChange}
                      placeholder="e.g. DENT-LIC-2024-8841"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-teal-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Login & Permissions */}
        {activeTab === 'login' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {isEdit && staffMember?.user_id ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Linked Login Account</span>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                    Active Login Access
                  </span>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    <strong className="text-slate-800">Login Username:</strong> {staffMember.login_email}
                  </p>
                  <p>
                    <strong className="text-slate-800">Assigned Role:</strong> {staffMember.login_role_display}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                  Password changes and role privileges are managed through the central security administration.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200">
                  <input
                    type="checkbox"
                    id="create_login"
                    name="create_login"
                    checked={formData.create_login}
                    onChange={handleChange}
                    className="mt-1 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <label htmlFor="create_login" className="text-xs font-bold text-indigo-900 cursor-pointer">
                      Grant System Login Access
                    </label>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Enable this to create authentication credentials allowing this staff member to sign in to the clinic workspace.
                    </p>
                  </div>
                </div>

                {formData.create_login && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Login Email <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="email"
                          name="login_email"
                          required={formData.create_login}
                          value={formData.login_email}
                          onChange={handleChange}
                          placeholder="doctor@dentalerp.com"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Initial Password <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="password"
                          name="password"
                          required={formData.create_login}
                          value={formData.password}
                          onChange={handleChange}
                          placeholder="••••••••••••"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Application Security Role <span className="text-rose-500">*</span>
                      </label>
                      <select
                        name="role"
                        value={formData.role}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                      >
                        {LOGIN_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label} ({r.value})
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Determines the access privileges and RBAC permissions inside the application.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            Cancel
          </button>
          <div className="flex items-center space-x-2">
            {activeTab !== 'personal' && (
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'login' ? 'employment' : 'personal')}
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Previous
              </button>
            )}
            {activeTab !== 'login' ? (
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'personal' ? 'employment' : 'login')}
                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition"
              >
                Next Step &rarr;
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition disabled:opacity-50"
              >
                {isSubmitting ? 'Saving Staff Record...' : isEdit ? 'Save Changes' : 'Create Staff Member'}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
};
