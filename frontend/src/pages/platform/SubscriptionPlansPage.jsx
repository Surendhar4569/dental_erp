import React, { useState, useEffect } from 'react';
import { platformService } from '../../services/platformService';
import { PageHeader } from '../../components/common/PageHeader';
import { Modal } from '../../components/common/Modal';
import { toast } from 'react-toastify';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Building2,
  CheckCircle2,
  Edit,
  Layers,
} from 'lucide-react';

export const SubscriptionPlansPage = () => {
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);

  const initialForm = {
    plan_code: '',
    plan_name: '',
    description: '',
    max_branches: 1,
    is_active: true,
  };
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPlans = async () => {
    try {
      setIsLoading(true);
      const data = await platformService.getPlans();
      setPlans(data.plans || []);
    } catch (err) {
      toast.error('Failed to load subscription plans: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenAdd = () => {
    setEditingPlan(null);
    setForm(initialForm);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    setForm({
      plan_code: plan.plan_code,
      plan_name: plan.plan_name,
      description: plan.description || '',
      max_branches: plan.max_branches,
      is_active: plan.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.plan_name.trim()) {
      toast.warn('Plan name is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingPlan) {
        await platformService.updatePlan(editingPlan.id, {
          plan_name: form.plan_name,
          description: form.description,
          max_branches: parseInt(form.max_branches, 10),
          is_active: form.is_active,
        });
        toast.success(`Plan '${form.plan_name}' updated.`);
      } else {
        await platformService.createPlan({
          plan_code: form.plan_code.toUpperCase(),
          plan_name: form.plan_name,
          description: form.description,
          max_branches: parseInt(form.max_branches, 10),
          is_active: form.is_active,
        });
        toast.success(`Plan '${form.plan_name}' created.`);
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="SaaS Subscription Tiers & Plans"
        subtitle="Configure clinic subscription tiers, permitted branch provisioning limits, and view active clinic distribution."
        actions={
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={fetchPlans}
              disabled={isLoading}
              className="inline-flex items-center px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>Create Plan Tier</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {p.plan_code}
                </span>
                <span className={`text-[10px] font-bold uppercase ${p.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {p.is_active ? 'Active Tier' : 'Archived'}
                </span>
              </div>

              <h3 className="text-sm font-bold text-slate-900 mb-1">{p.plan_name}</h3>
              <p className="text-xs text-slate-500 leading-relaxed min-h-[36px]">{p.description || 'Standard subscription tier.'}</p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Branch Limit:</span>
                  <strong className="text-slate-900 text-sm">{p.max_branches} branch{p.max_branches > 1 ? 'es' : ''}</strong>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Active Subscribers:</span>
                  <strong className="text-indigo-700">{p.subscriber_count || 0} clinics</strong>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => handleOpenEdit(p)}
                className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-indigo-600"
              >
                <Edit className="w-3.5 h-3.5 mr-1" />
                <span>Edit Configuration</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Plan Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPlan ? `Edit Plan: ${editingPlan.plan_name}` : 'Create New Subscription Plan'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-700">
          {!editingPlan && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Plan Code *
              </label>
              <input
                type="text"
                value={form.plan_code}
                onChange={(e) => setForm({ ...form, plan_code: e.target.value })}
                placeholder="e.g. CLINIC_PRO"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono uppercase text-xs focus:ring-2 focus:border-indigo-500"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Plan Display Name *
            </label>
            <input
              type="text"
              value={form.plan_name}
              onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
              placeholder="e.g. Clinic Professional"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Maximum Allowed Branches *
            </label>
            <input
              type="number"
              min="1"
              value={form.max_branches}
              onChange={(e) => setForm({ ...form, max_branches: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description of plan tier privileges..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="is_active" className="text-xs text-slate-700 font-medium">
              Plan is active for subscription assignment
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
            >
              {isSubmitting ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SubscriptionPlansPage;
