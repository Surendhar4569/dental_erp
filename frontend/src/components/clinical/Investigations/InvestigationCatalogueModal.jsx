import React, { useState, useEffect } from 'react';
import { X, Search, Plus, Edit2, CheckCircle2, XCircle, AlertTriangle, Loader2, Save, Trash2, Sliders } from 'lucide-react';
import investigationService from '../../../services/investigationService';

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'radiology', label: 'Radiology / Imaging' },
  { value: 'laboratory', label: 'Laboratory Tests' },
  { value: 'diagnostic', label: 'Diagnostic Procedures' },
  { value: 'dental_investigation', label: 'Dental Specific' },
  { value: 'external_lab', label: 'External Lab Referral' },
  { value: 'other', label: 'Other Diagnostics' },
];

export const InvestigationCatalogueModal = ({ isOpen, onClose }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Add / Edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: 'radiology',
    description: '',
    price: '',
    turnaround_time_hours: 24,
    sample_required: false,
    specimen_type: '',
    preparation_instructions: '',
    reference_ranges: [],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadCatalogue();
  }, [isOpen]);

  const loadCatalogue = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await investigationService.getCatalogue();
      setItems(res.investigations || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load catalogue.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      code: '',
      name: '',
      category: 'radiology',
      description: '',
      price: '',
      turnaround_time_hours: 24,
      sample_required: false,
      specimen_type: '',
      preparation_instructions: '',
      reference_ranges: [],
    });
  };

  const handleStartCreate = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    let ranges = [];
    if (item.reference_ranges) {
      ranges = typeof item.reference_ranges === 'string'
        ? JSON.parse(item.reference_ranges)
        : item.reference_ranges;
    }

    setFormData({
      code: item.code,
      name: item.name,
      category: item.category,
      description: item.description || '',
      price: item.price,
      turnaround_time_hours: item.turnaround_time_hours || 24,
      sample_required: Boolean(item.sample_required),
      specimen_type: item.specimen_type || '',
      preparation_instructions: item.preparation_instructions || '',
      reference_ranges: Array.isArray(ranges) ? ranges : [],
    });
    setIsEditing(true);
  };

  const handleToggleStatus = async (item) => {
    try {
      await investigationService.toggleCatalogueStatus(item.id, !item.is_active);
      loadCatalogue();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update status.');
    }
  };

  const handleAddRangeRow = () => {
    setFormData({
      ...formData,
      reference_ranges: [
        ...formData.reference_ranges,
        { parameter: '', unit: '', min: '', max: '', normal: 'Normal' },
      ],
    });
  };

  const handleRemoveRangeRow = (idx) => {
    setFormData({
      ...formData,
      reference_ranges: formData.reference_ranges.filter((_, i) => i !== idx),
    });
  };

  const handleRangeChange = (idx, field, val) => {
    const updated = [...formData.reference_ranges];
    updated[idx] = { ...updated[idx], [field]: val };
    setFormData({ ...formData, reference_ranges: updated });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) {
      setError('Investigation code and name are required.');
      return;
    }

    const numPrice = parseFloat(formData.price);
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Price must be a valid non-negative number.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        price: numPrice,
        turnaround_time_hours: parseInt(formData.turnaround_time_hours, 10) || 24,
        reference_ranges: formData.reference_ranges.map((r) => ({
          parameter: r.parameter,
          unit: r.unit || null,
          min: r.min !== '' && !isNaN(parseFloat(r.min)) ? parseFloat(r.min) : undefined,
          max: r.max !== '' && !isNaN(parseFloat(r.max)) ? parseFloat(r.max) : undefined,
          normal: r.normal || 'Normal',
        })),
      };

      if (editingId) {
        await investigationService.updateCatalogueItem(editingId, payload);
      } else {
        await investigationService.createCatalogueItem(payload);
      }

      resetForm();
      loadCatalogue();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save investigation.');
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesQuery =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesQuery && matchesCat;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden my-auto border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wide">
                Investigation Master Catalogue & Pricing
              </h2>
              <p className="text-xs text-slate-400">
                Configure diagnostic services, specimen requirements, reference ranges, and Central Billing pricing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[82vh] space-y-5 text-xs text-slate-700">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isEditing ? (
            <>
              {/* Top Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2 flex-1 max-w-md">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search code or test name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Investigation</span>
                </button>
              </div>

              {/* Catalogue Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Investigation Name</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Specimen / Sample</th>
                        <th className="py-2.5 px-3">Configured Price</th>
                        <th className="py-2.5 px-3">Turnaround</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                            <span>Loading catalogue...</span>
                          </td>
                        </tr>
                      ) : filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                            No investigations found matching your filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                              {item.code}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {item.name}
                            </td>
                            <td className="py-2.5 px-3 capitalize text-slate-600">
                              {item.category?.replace('_', ' ')}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">
                              {item.specimen_type || (item.sample_required ? 'Required' : 'None')}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              ₹{parseFloat(item.price || 0).toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {item.turnaround_time_hours || 24}h
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  item.is_active
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {item.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right space-x-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(item)}
                                className="p-1 rounded text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition"
                                title="Edit Investigation"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(item)}
                                className={`p-1 rounded transition ${
                                  item.is_active
                                    ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={item.is_active ? 'Deactivate' : 'Activate'}
                              >
                                {item.is_active ? (
                                  <XCircle className="w-3.5 h-3.5" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* Add / Edit Investigation Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                  {editingId ? `Edit Investigation: ${formData.code}` : 'Add New Investigation'}
                </span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Investigation Code*
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. OPG, CBC, CBCT_3D"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Investigation Name*
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Orthopantomogram (Full Mouth Panoramic Radiograph)"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Category*
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="radiology">Radiology / Imaging</option>
                    <option value="laboratory">Laboratory Tests</option>
                    <option value="diagnostic">Diagnostic Procedures</option>
                    <option value="dental_investigation">Dental Specific</option>
                    <option value="external_lab">External Referral</option>
                    <option value="other">Other Diagnostics</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Configured Central Billing Price (INR)*
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Turnaround Time (Hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.turnaround_time_hours}
                    onChange={(e) => setFormData({ ...formData, turnaround_time_hours: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Specimen / Sample Type
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Blood (EDTA), Saliva, Biopsy Tissue, or None"
                    value={formData.specimen_type}
                    onChange={(e) => setFormData({ ...formData, specimen_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Patient Preparation Instructions
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Remove metallic appliances, fasting not required..."
                    value={formData.preparation_instructions}
                    onChange={(e) => setFormData({ ...formData, preparation_instructions: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Reference Ranges Sub-Form */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Reference Ranges & Test Parameters ({formData.reference_ranges.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddRangeRow}
                    className="flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Parameter</span>
                  </button>
                </div>

                {formData.reference_ranges.length > 0 && (
                  <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50">
                    {formData.reference_ranges.map((row, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="Parameter (e.g. Hemoglobin)"
                          value={row.parameter}
                          onChange={(e) => handleRangeChange(idx, 'parameter', e.target.value)}
                          className="flex-2 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Unit (g/dL)"
                          value={row.unit}
                          onChange={(e) => handleRangeChange(idx, 'unit', e.target.value)}
                          className="w-20 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="Min"
                          value={row.min}
                          onChange={(e) => handleRangeChange(idx, 'min', e.target.value)}
                          className="w-20 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                        <input
                          type="number"
                          step="any"
                          placeholder="Max"
                          value={row.max}
                          onChange={(e) => handleRangeChange(idx, 'max', e.target.value)}
                          className="w-20 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Normal description"
                          value={row.normal}
                          onChange={(e) => handleRangeChange(idx, 'normal', e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveRangeRow(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center space-x-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs text-xs transition disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Investigation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvestigationCatalogueModal;

