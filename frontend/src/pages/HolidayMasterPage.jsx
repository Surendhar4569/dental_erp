import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { holidayService } from '../services/holidayService';
import { PageHeader } from '../components/common/PageHeader';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from 'react-toastify';
import {
  Calendar,
  Plus,
  Download,
  Upload,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  CalendarDays,
  ShieldCheck,
  Building,
  RefreshCw,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'national', label: 'National', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'festival', label: 'Festival', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'state', label: 'State', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'clinic_specific', label: 'Clinic Specific', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'optional', label: 'Optional', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { value: 'other', label: 'Other', color: 'bg-slate-50 text-slate-700 border-slate-200' },
];

export const HolidayMasterPage = () => {
  const { user } = useAuth();
  const { activeBranch, branches } = useBranch();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Filters
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedScope, setSelectedScope] = useState('all'); // 'all' | 'clinic' | 'branch'
  const [searchQuery, setSearchQuery] = useState('');

  // Data
  const [holidays, setHolidays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [deletingHoliday, setDeletingHoliday] = useState(null);

  // Single form
  const [singleForm, setSingleForm] = useState({
    name: '',
    holiday_date: '',
    category: 'festival',
    is_closed: true,
    branch_id: '',
    description: '',
  });

  // Suggestions state
  const [suggestedList, setSuggestedList] = useState([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState(new Set());
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // CSV import state
  const [csvText, setCsvText] = useState('');
  const [csvBranchId, setCsvBranchId] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Batch form rows
  const [batchRows, setBatchRows] = useState([
    { name: '', holiday_date: '', category: 'festival', is_closed: true, branch_id: '', description: '' },
    { name: '', holiday_date: '', category: 'festival', is_closed: true, branch_id: '', description: '' },
    { name: '', holiday_date: '', category: 'festival', is_closed: true, branch_id: '', description: '' },
  ]);

  // Load holidays
  const loadHolidays = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        year: selectedYear,
        activeOnly: true,
      };
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (selectedScope === 'branch' && activeBranch?.id) params.branchId = activeBranch.id;

      const res = await holidayService.getHolidays(params);
      setHolidays(res.holidays || []);
    } catch (err) {
      toast.error('Failed to load holidays.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedCategory, selectedScope, activeBranch]);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  // Open single holiday form
  const handleOpenAdd = () => {
    setEditingHoliday(null);
    setSingleForm({
      name: '',
      holiday_date: `${selectedYear}-01-01`,
      category: 'festival',
      is_closed: true,
      branch_id: activeBranch?.id || '',
      description: '',
    });
    setIsSingleModalOpen(true);
  };

  const handleOpenEdit = (h) => {
    setEditingHoliday(h);
    setSingleForm({
      name: h.name,
      holiday_date: h.holiday_date_str || h.holiday_date,
      category: h.category,
      is_closed: h.is_closed,
      branch_id: h.branch_id || '',
      description: h.description || '',
    });
    setIsSingleModalOpen(true);
  };

  // Submit single holiday
  const handleSaveSingle = async (e) => {
    e.preventDefault();
    if (!singleForm.name.trim() || !singleForm.holiday_date) {
      toast.error('Holiday name and date are required.');
      return;
    }

    try {
      const payload = {
        name: singleForm.name.trim(),
        holiday_date: singleForm.holiday_date,
        category: singleForm.category,
        is_closed: Boolean(singleForm.is_closed),
        branch_id: singleForm.branch_id || null,
        description: singleForm.description ? singleForm.description.trim() : null,
      };

      if (editingHoliday) {
        await holidayService.updateHoliday(editingHoliday.id, payload);
        toast.success('Holiday updated successfully!');
      } else {
        await holidayService.createHoliday(payload);
        toast.success('Holiday created successfully!');
      }

      setIsSingleModalOpen(false);
      loadHolidays();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save holiday.');
    }
  };

  // Deactivate holiday
  const handleConfirmDelete = async () => {
    if (!deletingHoliday) return;
    try {
      await holidayService.deactivateHoliday(deletingHoliday.id);
      toast.success('Holiday removed successfully.');
      setDeletingHoliday(null);
      loadHolidays();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove holiday.');
    }
  };

  // Preloaded Suggestions
  const handleOpenSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setIsSuggestionsModalOpen(true);
    try {
      const res = await holidayService.getSuggestedHolidays(selectedYear);
      const suggestions = res.suggestions || [];
      setSuggestedList(suggestions);

      // Pre-select suggestions that don't already exist in holidays list
      const existingDates = new Set(holidays.map((h) => h.holiday_date_str || h.holiday_date));
      const newKeys = new Set();
      suggestions.forEach((s, idx) => {
        if (!existingDates.has(s.holiday_date)) {
          newKeys.add(idx);
        }
      });
      setSelectedSuggestions(newKeys);
    } catch (err) {
      toast.error('Failed to load holiday suggestions.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleApplySuggestions = async () => {
    const toImport = suggestedList
      .filter((_, idx) => selectedSuggestions.has(idx))
      .map((s) => ({
        ...s,
        branch_id: null, // Clinic-wide
        source: 'preloaded_suggestion',
      }));

    if (toImport.length === 0) {
      toast.info('No holidays selected.');
      return;
    }

    try {
      const res = await holidayService.createBatchHolidays(toImport);
      toast.success(
        `Imported ${res.created.length} holiday(s)! ${
          res.skipped.length > 0 ? `(${res.skipped.length} duplicates skipped)` : ''
        }`
      );
      setIsSuggestionsModalOpen(false);
      loadHolidays();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to import suggestions.');
    }
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const blob = await holidayService.exportHolidaysCsv({
        year: selectedYear,
        branchId: selectedScope === 'branch' ? activeBranch?.id : null,
      });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `clinic_holidays_${selectedYear}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Holidays CSV exported.');
    } catch (err) {
      toast.error('Failed to export CSV.');
    }
  };

  // Import CSV
  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      toast.error('Please paste or upload valid CSV text.');
      return;
    }

    setIsImporting(true);
    try {
      const res = await holidayService.importHolidaysCsv(csvText, csvBranchId || null);
      toast.success(
        `Imported ${res.result.importedCount} holiday(s) successfully! ${
          res.result.skippedCount > 0 ? `(${res.result.skippedCount} skipped)` : ''
        }`
      );
      setIsCsvModalOpen(false);
      setCsvText('');
      loadHolidays();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to import CSV.');
    } finally {
      setIsImporting(false);
    }
  };

  // Batch Rows Save
  const handleSaveBatch = async () => {
    const valid = batchRows.filter((r) => r.name.trim() && r.holiday_date);
    if (valid.length === 0) {
      toast.error('Please enter at least one valid holiday row with name and date.');
      return;
    }

    try {
      const res = await holidayService.createBatchHolidays(
        valid.map((r) => ({
          ...r,
          name: r.name.trim(),
          branch_id: r.branch_id || null,
          source: 'batch_entry',
        }))
      );
      toast.success(`Batch complete: ${res.created.length} added, ${res.skipped.length} skipped.`);
      setIsBatchModalOpen(false);
      loadHolidays();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save batch holidays.');
    }
  };

  // Filtered displayed holidays
  const filteredHolidays = holidays.filter((h) => {
    if (selectedScope === 'clinic' && h.branch_id !== null) return false;
    if (selectedScope === 'branch' && h.branch_id === null) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = h.name.toLowerCase().includes(q);
      const matchDesc = h.description && h.description.toLowerCase().includes(q);
      return matchName || matchDesc;
    }
    return true;
  });

  // Calculate metrics
  const totalHolidays = filteredHolidays.length;
  const closedDays = filteredHolidays.filter((h) => h.is_closed).length;
  const festivalCount = filteredHolidays.filter((h) => h.category === 'festival').length;
  const nationalCount = filteredHolidays.filter((h) => h.category === 'national' || h.category === 'state').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Annual Holiday Master"
        subtitle="Manage clinic-wide holidays, branch closures, festive calendars, and special scheduling overrides."
      >
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleOpenSuggestions}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>Preloaded Suggestions</span>
              </button>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(true)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-all"
              >
                <Layers className="w-4 h-4 text-slate-600" />
                <span>Batch Entry</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(true)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-all"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span>Import CSV</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-all"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Export CSV</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Holiday</span>
            </button>
          )}
        </div>
      </PageHeader>

      {/* Metric summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{totalHolidays}</div>
            <div className="text-xs text-slate-500 font-medium">Holidays in {selectedYear}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{closedDays}</div>
            <div className="text-xs text-slate-500 font-medium">Full Clinic Closures</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{nationalCount}</div>
            <div className="text-xs text-slate-500 font-medium">National / State Holidays</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{festivalCount}</div>
            <div className="text-xs text-slate-500 font-medium">Festive Celebrations</div>
          </div>
        </div>
      </div>

      {/* Control Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Year Switcher */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm font-bold text-slate-800">
              {selectedYear} Calendar
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {selectedYear !== currentYear && (
              <button
                type="button"
                onClick={() => setSelectedYear(currentYear)}
                className="text-[11px] text-indigo-600 hover:underline px-2"
              >
                Today
              </button>
            )}
          </div>

          {/* Scope Filter */}
          <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setSelectedScope('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedScope === 'all'
                  ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Scopes
            </button>
            <button
              type="button"
              onClick={() => setSelectedScope('clinic')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedScope === 'clinic'
                  ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Clinic-Wide Only
            </button>
            <button
              type="button"
              onClick={() => setSelectedScope('branch')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedScope === 'branch'
                  ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {activeBranch?.name || 'Branch'} Only
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search holidays..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                selectedCategory === cat.value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Holidays List / Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-xs">Loading holiday master...</span>
          </div>
        ) : filteredHolidays.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CalendarDays className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-700">
              No holidays found for {selectedYear}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Get started by importing recommended Indian holidays or adding custom clinic closures.
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={handleOpenSuggestions}
                className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm inline-flex items-center space-x-1.5"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Load Suggested Indian Holidays</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Holiday Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Clinic Status</th>
                  <th className="py-3 px-4">Scope</th>
                  <th className="py-3 px-4">Description</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredHolidays.map((h) => {
                  const dateObj = new Date(h.holiday_date_str || h.holiday_date);
                  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                  const dateFormatted = dateObj.toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  const catMeta = CATEGORIES.find((c) => c.value === h.category) || {
                    color: 'bg-slate-50 text-slate-700 border-slate-200',
                    label: h.category,
                  };

                  return (
                    <tr key={h.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{dateFormatted}</div>
                        <div className="text-[11px] text-slate-400 font-medium">{dayName}</div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {h.name}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${catMeta.color}`}
                        >
                          {catMeta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {h.is_closed ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            <span>Clinic Closed</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>Open (Celebration)</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {h.branch_id ? (
                          <span className="inline-flex items-center space-x-1 text-slate-600 font-medium">
                            <Building className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{h.branch_name || 'Branch Specific'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-indigo-700 font-medium">
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Clinic-Wide</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                        {h.description || '—'}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(h)}
                              className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="Edit Holiday"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingHoliday(h)}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                              title="Deactivate Holiday"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1. Single Add/Edit Modal */}
      <Modal
        isOpen={isSingleModalOpen}
        onClose={() => setIsSingleModalOpen(false)}
        title={editingHoliday ? 'Edit Clinic Holiday' : 'Create Clinic Holiday'}
        size="md"
      >
        <form onSubmit={handleSaveSingle} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Holiday Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Republic Day, Diwali, Annual Gala"
              value={singleForm.name}
              onChange={(e) => setSingleForm({ ...singleForm, name: e.target.value })}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Holiday Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={singleForm.holiday_date}
                onChange={(e) => setSingleForm({ ...singleForm, holiday_date: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={singleForm.category}
                onChange={(e) => setSingleForm({ ...singleForm, category: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="national">National</option>
                <option value="festival">Festival</option>
                <option value="state">State</option>
                <option value="clinic_specific">Clinic Specific</option>
                <option value="optional">Optional</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Scope</label>
            <select
              value={singleForm.branch_id}
              onChange={(e) => setSingleForm({ ...singleForm, branch_id: e.target.value })}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Clinic-Wide (All Branches)</option>
              {branches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} only
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="isClosedCheck"
              checked={singleForm.is_closed}
              onChange={(e) => setSingleForm({ ...singleForm, is_closed: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="isClosedCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
              Clinic is strictly CLOSED on this day (Blocks regular slots)
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Notes or internal operational instructions..."
              value={singleForm.description}
              onChange={(e) => setSingleForm({ ...singleForm, description: e.target.value })}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsSingleModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              {editingHoliday ? 'Update Holiday' : 'Create Holiday'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Preloaded Suggestions Review Modal */}
      <Modal
        isOpen={isSuggestionsModalOpen}
        onClose={() => setIsSuggestionsModalOpen(false)}
        title={`Suggested Indian Holidays — Year ${selectedYear}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Select standard national and festival holidays to automatically populate into your clinic’s master calendar.
          </p>

          <div className="flex items-center justify-between py-1 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-700">
              {selectedSuggestions.size} of {suggestedList.length} Selected
            </span>
            <div className="space-x-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedSuggestions(new Set(suggestedList.map((_, i) => i)))}
                className="text-indigo-600 hover:underline font-medium"
              >
                Select All
              </button>
              <span>|</span>
              <button
                type="button"
                onClick={() => setSelectedSuggestions(new Set())}
                className="text-slate-500 hover:underline font-medium"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl p-1">
            {suggestedList.map((s, idx) => {
              const isChecked = selectedSuggestions.has(idx);
              const exists = holidays.some((h) => (h.holiday_date_str || h.holiday_date) === s.holiday_date);

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 hover:bg-slate-50 transition-colors"
                >
                  <label className="flex items-center space-x-3 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const next = new Set(selectedSuggestions);
                        if (e.target.checked) next.add(idx);
                        else next.delete(idx);
                        setSelectedSuggestions(next);
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-800">{s.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {s.holiday_date} • {s.category}
                      </div>
                    </div>
                  </label>
                  {exists && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded">
                      Already in Calendar
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsSuggestionsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplySuggestions}
              disabled={selectedSuggestions.size === 0}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
            >
              Add {selectedSuggestions.size} Holidays to Calendar
            </button>
          </div>
        </div>
      </Modal>

      {/* 3. CSV Import Modal */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="Import Holidays from CSV"
        size="lg"
      >
        <div className="space-y-4">
          <div className="text-xs text-slate-600 space-y-1">
            <p>
              Paste RFC 4180 compliant CSV text. The CSV header must include at least{' '}
              <code>date</code> and <code>name</code> columns.
            </p>
            <p className="text-[11px] text-slate-500">
              Sample Header: <code>date,name,category,is_closed,description</code>
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Branch Scope
            </label>
            <select
              value={csvBranchId}
              onChange={(e) => setCsvBranchId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Clinic-Wide (All Branches)</option>
              {branches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Paste CSV Content
            </label>
            <textarea
              rows={8}
              placeholder={`date,name,category,is_closed,description\n2026-01-26,Republic Day,national,true,National Holiday\n2026-08-15,Independence Day,national,true,Independence Day`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full font-mono text-xs px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImportCsv}
              disabled={isImporting || !csvText.trim()}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
            >
              {isImporting ? 'Validating & Importing...' : 'Import CSV'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 4. Batch Entry Modal */}
      <Modal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        title="Batch Holiday Entry"
        size="xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Quickly enter multiple holidays simultaneously. Empty rows will be ignored.
          </p>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {batchRows.map((row, idx) => (
              <div key={idx} className="flex items-center space-x-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="date"
                  value={row.holiday_date}
                  onChange={(e) => {
                    const next = [...batchRows];
                    next[idx].holiday_date = e.target.value;
                    setBatchRows(next);
                  }}
                  className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Holiday Name"
                  value={row.name}
                  onChange={(e) => {
                    const next = [...batchRows];
                    next[idx].name = e.target.value;
                    setBatchRows(next);
                  }}
                  className="flex-1 text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
                <select
                  value={row.category}
                  onChange={(e) => {
                    const next = [...batchRows];
                    next[idx].category = e.target.value;
                    setBatchRows(next);
                  }}
                  className="text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="national">National</option>
                  <option value="festival">Festival</option>
                  <option value="state">State</option>
                  <option value="clinic_specific">Clinic</option>
                  <option value="other">Other</option>
                </select>
                <label className="flex items-center space-x-1 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.is_closed}
                    onChange={(e) => {
                      const next = [...batchRows];
                      next[idx].is_closed = e.target.checked;
                      setBatchRows(next);
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Closed</span>
                </label>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setBatchRows((prev) => [
                ...prev,
                { name: '', holiday_date: '', category: 'festival', is_closed: true, branch_id: '', description: '' },
              ])
            }
            className="text-xs text-indigo-600 hover:underline font-semibold flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </button>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsBatchModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveBatch}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              Save Batch Entries
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete / Deactivate Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingHoliday)}
        title="Remove Holiday"
        message={`Are you sure you want to deactivate "${deletingHoliday?.name}" on ${
          deletingHoliday?.holiday_date_str || deletingHoliday?.holiday_date
        }? This will re-enable regular schedules on this day unless another exception is active.`}
        confirmText="Remove Holiday"
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingHoliday(null)}
      />
    </div>
  );
};
