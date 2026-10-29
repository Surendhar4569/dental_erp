import React, { useState, useEffect } from 'react';
import { X, Search, Plus, Trash2, FlaskConical, AlertTriangle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import investigationService from '../../../services/investigationService';

export const OrderInvestigationModal = ({ isOpen, onClose, patient, visit, onOrderPlaced }) => {
  const [catalogue, setCatalogue] = useState([]);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Order state
  const [selectedItems, setSelectedItems] = useState([]);
  const [priority, setPriority] = useState('routine');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoadingCatalogue(true);
    setError(null);
    setSelectedItems([]);
    setClinicalIndication('');
    setNotes('');
    setPriority('routine');

    investigationService
      .getCatalogue({ is_active: true })
      .then((res) => {
        setCatalogue(res.investigations || []);
        setLoadingCatalogue(false);
      })
      .catch((err) => {
        setError(err.response?.data?.message || err.message || 'Failed to load investigation catalogue.');
        setLoadingCatalogue(false);
      });
  }, [isOpen]);

  const handleSelectItem = (item) => {
    if (selectedItems.some((i) => i.id === item.id)) {
      return; // Already selected
    }
    setSelectedItems([...selectedItems, { ...item, quantity: 1 }]);
  };

  const handleRemoveItem = (itemId) => {
    setSelectedItems(selectedItems.filter((i) => i.id !== itemId));
  };

  const filteredCatalogue = catalogue.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const totalAmount = selectedItems.reduce(
    (sum, item) => sum + parseFloat(item.price || 0) * (item.quantity || 1),
    0
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      setError('Please select at least one investigation.');
      return;
    }

    if (!clinicalIndication.trim()) {
      setError('Clinical indication or reason for investigation is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        patient_id: patient.id,
        visit_id: visit.id,
        clinical_indication: clinicalIndication.trim(),
        priority,
        notes: notes.trim() || null,
        items: selectedItems.map((item) => ({
          investigation_id: item.id,
          quantity: item.quantity || 1,
        })),
      };

      const res = await investigationService.createOrder(payload);
      onOrderPlaced?.(res.order);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to place investigation order.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden my-auto border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wide">
                Order Diagnostic & Laboratory Investigations
              </h2>
              <p className="text-xs text-slate-400">
                Patient: <span className="text-white font-semibold">{patient?.first_name} {patient?.last_name}</span> ({patient?.patient_number}) • Visit Token: #{visit?.token_display || '---'}
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

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[82vh] grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
          {/* Left: Catalogue Explorer */}
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Investigation Catalogue
              </span>
              <span className="text-slate-400 text-[11px]">
                {filteredCatalogue.length} available
              </span>
            </div>

            {/* Search & Filter */}
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search test name or code (e.g. OPG, CBC)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Categories</option>
                <option value="radiology">Radiology / X-Ray</option>
                <option value="laboratory">Laboratory Tests</option>
                <option value="dental_investigation">Dental Specific</option>
                <option value="external_lab">External Referral</option>
              </select>
            </div>

            {/* List */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100 bg-white">
              {loadingCatalogue ? (
                <div className="p-8 text-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                  <span>Loading catalogue...</span>
                </div>
              ) : filteredCatalogue.length === 0 ? (
                <div className="p-6 text-center text-slate-400 italic">
                  No investigations match your search.
                </div>
              ) : (
                filteredCatalogue.map((item) => {
                  const isSelected = selectedItems.some((i) => i.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 flex items-center justify-between hover:bg-slate-50 transition ${
                        isSelected ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <div className="pr-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] border border-indigo-200">
                            {item.code}
                          </span>
                          <span className="font-bold text-slate-800">{item.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {item.description || item.specimen_type || item.category}
                        </p>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        <span className="font-mono font-bold text-slate-900">
                          ₹{parseFloat(item.price || 0).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          disabled={isSelected}
                          onClick={() => handleSelectItem(item)}
                          className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                            isSelected
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                          }`}
                        >
                          {isSelected ? (
                            <span>Added</span>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Order Configuration & Billing Summary */}
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Order Items ({selectedItems.length})
              </span>
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                Central Billing Integrated
              </span>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Selected Items List */}
            <div className="border border-slate-200 rounded-xl overflow-hidden min-h-36 max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white">
              {selectedItems.length === 0 ? (
                <div className="p-6 text-center text-slate-400 italic">
                  Select one or more investigations from the catalogue on the left.
                </div>
              ) : (
                selectedItems.map((item) => (
                  <div key={item.id} className="p-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-800">{item.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{item.code}</div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-bold text-slate-900">
                        ₹{parseFloat(item.price || 0).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total Net Amount Banner */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-700">Total Billable Charges:</span>
              <span className="text-base font-black font-mono text-slate-900">
                ₹{totalAmount.toFixed(2)}
              </span>
            </div>

            {/* Priority Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Clinical Priority*
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['routine', 'urgent', 'stat'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 px-3 rounded-lg font-bold text-xs uppercase tracking-wide border transition ${
                      priority === p
                        ? p === 'stat'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : p === 'urgent'
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Clinical Indication */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Clinical Indication / Reason (Mandatory)*
              </label>
              <textarea
                rows={2}
                required
                placeholder="Reason for requesting investigations (e.g. Pre-extraction assessment, suspect periapical lesion)..."
                value={clinicalIndication}
                onChange={(e) => setClinicalIndication(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Special Instructions to Lab / Radiology
              </label>
              <input
                type="text"
                placeholder="e.g. Focus on tooth 36 periapical area, stat processing needed..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Submit Action */}
            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting || selectedItems.length === 0}
                className="flex items-center space-x-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Placing Order & Posting Charges...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm Order (₹{totalAmount.toFixed(2)})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default OrderInvestigationModal;

