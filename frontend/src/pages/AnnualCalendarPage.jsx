import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { holidayService } from '../services/holidayService';
import { PageHeader } from '../components/common/PageHeader';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from 'react-toastify';
import {
  Calendar,
  CalendarDays,
  Plus,
  Sparkles,
  Download,
  Upload,
  Search,
  Filter,
  RefreshCw,
  Building,
  Layers,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  ShieldCheck,
  Info,
} from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'national', label: 'National', color: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20' },
  { value: 'festival', label: 'Festival', color: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20' },
  { value: 'state', label: 'State', color: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20' },
  { value: 'clinic_specific', label: 'Clinic Specific', color: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20' },
  { value: 'optional', label: 'Optional', color: 'bg-teal-50 text-teal-700 border-teal-200 ring-teal-500/20' },
  { value: 'other', label: 'Other', color: 'bg-slate-50 text-slate-700 border-slate-200 ring-slate-500/20' },
];

export const AnnualCalendarPage = () => {
  const { user } = useAuth();
  const { activeBranch, branches } = useBranch();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Navigation & Filters ANd
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedScope, setSelectedScope] = useState('all'); // 'all' | 'clinic' | 'branch'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list'

  // Holidays data
  const [holidays, setHolidays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected Date Drawer / Details
  const [selectedDate, setSelectedDate] = useState(null);

  // Modals state
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [deletingHoliday, setDeletingHoliday] = useState(null);

  // Single Add / Edit Form
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

  // CSV Import state
  const [csvText, setCsvText] = useState('');
  const [csvBranchId, setCsvBranchId] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Batch Form Rows
  const [batchRows, setBatchRows] = useState([
    { name: '', holiday_date: '', category: 'festival', is_closed: true, branch_id: '', description: '' },
    { name: '', holiday_date: '', category: 'festival', is_closed: true, branch_id: '', description: '' },
    { name: '', holiday_date: '', category: 'festival', is_closed: true, branch_id: '', description: '' },
  ]);

  // Load Holidays strictly for holiday management (no appointments, no slots)
  const loadHolidays = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        year: selectedYear,
        activeOnly: true,
      };
      if (activeBranch?.id) {
        params.branchId = activeBranch.id;
      }
      const res = await holidayService.getHolidays(params);
      setHolidays(res.holidays || []);
    } catch (err) {
      toast.error('Failed to load annual holidays: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, activeBranch?.id]);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  // Filtered Holidays by category, scope, and search query
  const filteredHolidays = useMemo(() => {
    return holidays.filter((h) => {
      // Category filter
      if (selectedCategory !== 'all' && h.category !== selectedCategory) {
        return false;
      }
      // Scope filter
      if (selectedScope === 'clinic' && h.branch_id) {
        return false;
      }
      if (selectedScope === 'branch' && !h.branch_id) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = h.name.toLowerCase().includes(query);
        const descMatch = (h.description || '').toLowerCase().includes(query);
        if (!nameMatch && !descMatch) return false;
      }
      return true;
    });
  }, [holidays, selectedCategory, selectedScope, searchQuery]);

  // Index holidays by date string (YYYY-MM-DD) for 12-month calendar rendering
  const holidaysByDate = useMemo(() => {
    const map = {};
    for (const h of filteredHolidays) {
      const d = h.holiday_date_str || (h.holiday_date ? h.holiday_date.substring(0, 10) : null);
      if (d) {
        if (!map[d]) map[d] = [];
        map[d].push(h);
      }
    }
    return map;
  }, [filteredHolidays]);

  // Active holidays for the currently selected date drawer
  const selectedDateHolidays = useMemo(() => {
    if (!selectedDate) return [];
    return holidaysByDate[selectedDate] || [];
  }, [selectedDate, holidaysByDate]);

  // Open Single Create Modal
  const handleOpenCreate = (presetDate = '') => {
    setEditingHoliday(null);
    setSingleForm({
      name: '',
      holiday_date: presetDate || `${selectedYear}-01-01`,
      category: 'festival',
      is_closed: true,
      branch_id: '',
      description: '',
    });
    setIsSingleModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (holiday) => {
    setEditingHoliday(holiday);
    setSingleForm({
      name: holiday.name,
      holiday_date: holiday.holiday_date_str || holiday.holiday_date?.substring(0, 10),
      category: holiday.category || 'festival',
      is_closed: Boolean(holiday.is_closed),
      branch_id: holiday.branch_id || '',
      description: holiday.description || '',
    });
    setIsSingleModalOpen(true);
  };

  // Save Single Holiday
  const handleSaveSingle = async (e) => {
    e.preventDefault();
    if (!singleForm.name.trim()) {
      toast.error('Holiday name is required.');
      return;
    }
    if (!singleForm.holiday_date) {
      toast.error('Holiday date is required.');
      return;
    }

    try {
      const payload = {
        name: singleForm.name.trim(),
        holiday_date: singleForm.holiday_date,
        category: singleForm.category,
        is_closed: singleForm.is_closed,
        branch_id: singleForm.branch_id || null,
        description: singleForm.description.trim() || null,
      };

      if (editingHoliday) {
        await holidayService.updateHoliday(editingHoliday.id, payload);
        toast.success(`Holiday "${singleForm.name}" updated successfully.`);
      } else {
        await holidayService.createHoliday(payload);
        toast.success(`Holiday "${singleForm.name}" created successfully.`);
      }

      setIsSingleModalOpen(false);
      loadHolidays();
    } catch (err) {
      toast.error('Failed to save holiday: ' + (err.response?.data?.message || err.message));
    }
  };

  // Deactivate Holiday
  const handleConfirmDeactivate = async () => {
    if (!deletingHoliday) return;
    try {
      await holidayService.deactivateHoliday(deletingHoliday.id);
      toast.success(`Holiday "${deletingHoliday.name}" deactivated.`);
      setDeletingHoliday(null);
      loadHolidays();
    } catch (err) {
      toast.error('Failed to deactivate holiday: ' + (err.response?.data?.message || err.message));
    }
  };

  // Indian Suggestions Modal
  const handleOpenSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setIsSuggestionsModalOpen(true);
    setSelectedSuggestions(new Set());
    try {
      const res = await holidayService.getSuggestedHolidays(selectedYear);
      const list = res.suggestions || [];
      setSuggestedList(list);
      const initialSelected = new Set();
      list.forEach((item) => {
        const alreadyExists = holidays.some(
          (h) => (h.holiday_date_str || h.holiday_date?.substring(0, 10)) === item.holiday_date
        );
        if (!alreadyExists) {
          initialSelected.add(item.holiday_date);
        }
      });
      setSelectedSuggestions(initialSelected);
    } catch (err) {
      toast.error('Failed to load suggestions: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleToggleSuggestion = (dateStr) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const handleImportSuggestions = async () => {
    if (selectedSuggestions.size === 0) {
      toast.warning('No holidays selected for import.');
      return;
    }
    const holidaysToImport = suggestedList
      .filter((item) => selectedSuggestions.has(item.holiday_date))
      .map((item) => ({
        name: item.name,
        holiday_date: item.holiday_date,
        category: item.category,
        is_closed: item.is_closed,
        branch_id: null, // Clinic-wide default
        description: item.description,
      }));

    try {
      const res = await holidayService.createBatchHolidays(holidaysToImport);
      toast.success(
        `Imported ${res.insertedCount} holiday(s) successfully.${
          res.skippedCount > 0 ? ` (${res.skippedCount} duplicates skipped)` : ''
        }`
      );
      setIsSuggestionsModalOpen(false);
      loadHolidays();
    } catch (err) {
      toast.error('Failed to import holidays: ' + (err.response?.data?.message || err.message));
    }
  };

  // CSV Export
  const handleExportCsv = async () => {
    try {
      const params = { year: selectedYear };
      if (activeBranch?.id) params.branchId = activeBranch.id;
      const blob = await holidayService.exportHolidaysCsv(params);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `holidays_${selectedYear}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Holidays exported successfully.');
    } catch (err) {
      toast.error('Failed to export CSV: ' + err.message);
    }
  };

  // CSV Import
  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      toast.error('Please enter CSV content.');
      return;
    }
    setIsImporting(true);
    try {
      const res = await holidayService.importHolidaysCsv(csvText, csvBranchId || null);
      toast.success(`Successfully imported ${res.insertedCount} holiday(s).`);
      setIsCsvModalOpen(false);
      setCsvText('');
      loadHolidays();
    } catch (err) {
      toast.error('CSV Import Error: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsImporting(false);
    }
  };

  // Batch Form Handlers
  const handleAddBatchRow = () => {
    setBatchRows((prev) => [
      ...prev,
      { name: '', holiday_date: '', category: 'festival', is_closed: true, branch_id: '', description: '' },
    ]);
  };

  const handleUpdateBatchRow = (index, field, value) => {
    setBatchRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveBatchRow = (index) => {
    setBatchRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveBatch = async (e) => {
    e.preventDefault();
    const validRows = batchRows.filter((r) => r.name.trim() && r.holiday_date);
    if (validRows.length === 0) {
      toast.error('Please provide at least one complete holiday entry.');
      return;
    }

    try {
      const payload = validRows.map((r) => ({
        name: r.name.trim(),
        holiday_date: r.holiday_date,
        category: r.category,
        is_closed: r.is_closed,
        branch_id: r.branch_id || null,
        description: r.description.trim() || null,
      }));

      const res = await holidayService.createBatchHolidays(payload);
      toast.success(
        `Saved ${res.insertedCount} holiday(s).${res.skippedCount > 0 ? ` (${res.skippedCount} skipped)` : ''}`
      );
      setIsBatchModalOpen(false);
      loadHolidays();
    } catch (err) {
      toast.error('Batch save failed: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header with Year Controls and Action Toolbar */}
      <PageHeader
        title="Annual Holiday Calendar"
        subtitle={`Authoritative annual calendar closures and holiday management for ${selectedYear}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Year Navigator */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-2 hover:bg-slate-50 text-slate-600 transition-colors"
              title="Previous Year"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1.5 text-xs font-bold text-slate-900 border-x border-slate-100">
              {selectedYear}
            </span>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-2 hover:bg-slate-50 text-slate-600 transition-colors"
              title="Next Year"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setSelectedYear(currentYear)}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-2xs transition-all"
          >
            Today
          </button>

          {/* Action Buttons for Authorized Staff */}
          {isAdmin && (
            <>
              <button
                onClick={handleOpenSuggestions}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-2 rounded-xl transition-all"
                title="Curated Indian Festivals Catalogue"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Suggestions</span>
              </button>

              <button
                onClick={() => setIsBatchModalOpen(true)}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-xl transition-all"
                title="Add multiple holidays in batch"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>Batch Add</span>
              </button>

              <button
                onClick={() => setIsCsvModalOpen(true)}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl shadow-2xs transition-all"
                title="Import holidays from CSV"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Import CSV</span>
              </button>

              <button
                onClick={handleExportCsv}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl shadow-2xs transition-all"
                title="Export holidays to CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={() => handleOpenCreate()}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 px-3.5 py-2 rounded-xl shadow-xs transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Holiday</span>
              </button>
            </>
          )}

          <button
            onClick={loadHolidays}
            disabled={isLoading}
            className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-2xs transition-all"
            title="Refresh Holidays"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </PageHeader>

      {/* 2. Filter & Scope Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'calendar' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              12-Month Calendar Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'list' ? 'bg-white text-teal-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Holiday Directory ({filteredHolidays.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Scope Filter Buttons */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
              <button
                onClick={() => setSelectedScope('all')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  selectedScope === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                All Scopes
              </button>
              <button
                onClick={() => setSelectedScope('clinic')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  selectedScope === 'clinic' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                Clinic-Wide
              </button>
              <button
                onClick={() => setSelectedScope('branch')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  selectedScope === 'branch' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                }`}
              >
                {activeBranch?.name || 'Branch'} Specific
              </button>
            </div>

            {/* Search Box */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search holiday name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Categories:</span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                selectedCategory === cat.value
                  ? 'bg-slate-900 text-white shadow-2xs ring-2 ring-slate-900/10'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Main Workspace: 12-Month Calendar Grid OR Directory Table */}
      {viewMode === 'calendar' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MONTH_NAMES.map((monthName, monthIndex) => {
            const firstDayOfWeek = new Date(selectedYear, monthIndex, 1).getDay(); // 0 = Sun
            const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();
            const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
            const blanksArray = Array.from({ length: firstDayOfWeek }, (_, i) => i);

            return (
              <div
                key={monthName}
                className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs hover:shadow-xs transition-shadow"
              >
                {/* Month Title */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                    {monthName}
                  </h3>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {selectedYear}
                  </span>
                </div>

                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                  {WEEKDAY_HEADERS.map((w, idx) => (
                    <div
                      key={idx}
                      className={`text-[10px] font-bold ${
                        idx === 0 || idx === 6 ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {w}
                    </div>
                  ))}
                </div>

                {/* Day Cells Grid */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {/* Leading empty spaces */}
                  {blanksArray.map((_, idx) => (
                    <div key={`blank-${idx}`} className="h-7 w-7" />
                  ))}

                  {/* Month days */}
                  {daysArray.map((day) => {
                    const monthStr = String(monthIndex + 1).padStart(2, '0');
                    const dayStr = String(day).padStart(2, '0');
                    const dateKey = `${selectedYear}-${monthStr}-${dayStr}`;
                    const dateHolidays = holidaysByDate[dateKey] || [];
                    const hasHoliday = dateHolidays.length > 0;
                    const isClosed = dateHolidays.some((h) => h.is_closed);
                    const isSelected = selectedDate === dateKey;

                    // Choose badge color based on primary holiday
                    let badgeStyle = 'text-slate-700 hover:bg-slate-100';
                    if (hasHoliday) {
                      const primaryCat = dateHolidays[0].category;
                      const catConfig = CATEGORIES.find((c) => c.value === primaryCat);
                      if (isClosed) {
                        badgeStyle = 'bg-rose-50 text-rose-700 font-bold border border-rose-300 ring-2 ring-rose-500/20';
                      } else {
                        badgeStyle = `${catConfig?.color || 'bg-teal-50 text-teal-700'} font-bold border ring-2 ring-teal-500/20`;
                      }
                    }

                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(dateKey)}
                        className={`h-7 w-7 rounded-lg text-xs flex flex-col items-center justify-center transition-all relative ${badgeStyle} ${
                          isSelected ? 'ring-2 ring-slate-900 bg-slate-900 text-white font-bold' : ''
                        }`}
                        title={
                          hasHoliday
                            ? `${dateHolidays.map((h) => `${h.name} (${h.is_closed ? 'Closed' : 'Open'})`).join(', ')}`
                            : dateKey
                        }
                      >
                        <span>{day}</span>
                        {/* Dot indicator for holidays */}
                        {hasHoliday && !isSelected && (
                          <span
                            className={`w-1 h-1 rounded-full absolute bottom-0.5 ${
                              isClosed ? 'bg-rose-600' : 'bg-teal-600'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 4. Holiday Directory Table View */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {filteredHolidays.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <CalendarDays className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">
                No holidays matching filters for {selectedYear}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Import curated Indian holidays or add a clinic-specific holiday closure using the buttons above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Holiday Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Status</th>
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
                      <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{dateFormatted}</div>
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
                              <Lock className="w-3 h-3 text-rose-600" />
                              <span>Closed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Unlock className="w-3 h-3 text-emerald-600" />
                              <span>Open / Optional</span>
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
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Holiday"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingHoliday(h)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Deactivate Holiday"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* 5. Date Details Panel (Appears when a date is clicked on calendar) */}
      {selectedDate && (
        <div className="bg-white border-2 border-slate-900 rounded-2xl p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <CalendarDays className="w-5 h-5 text-teal-600" />
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {new Date(selectedDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h4>
                <p className="text-xs text-slate-500">
                  {selectedDateHolidays.length} holiday(s) registered on this date
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleOpenCreate(selectedDate)}
                  className="inline-flex items-center space-x-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-xl transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Holiday Here</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedDateHolidays.length === 0 ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-xs text-slate-500">
                No holiday is scheduled on this date. Clinic operates under standard branch schedules.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedDateHolidays.map((h) => {
                const catMeta = CATEGORIES.find((c) => c.value === h.category) || {
                  color: 'bg-slate-50 text-slate-700 border-slate-200',
                  label: h.category,
                };
                return (
                  <div
                    key={h.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{h.name}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${catMeta.color}`}
                          >
                            {catMeta.label}
                          </span>
                          {h.is_closed ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <Lock className="w-2.5 h-2.5" />
                              <span>Clinic Closed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Unlock className="w-2.5 h-2.5" />
                              <span>Open / Optional</span>
                            </span>
                          )}
                          {h.branch_id ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Building className="w-2.5 h-2.5" />
                              <span>{h.branch_name || 'Branch'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Layers className="w-2.5 h-2.5" />
                              <span>Clinic-Wide</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(h)}
                            className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingHoliday(h)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Deactivate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {h.description && (
                      <p className="text-xs text-slate-600 italic border-t border-slate-100 pt-1.5">
                        {h.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. Visual Legend Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
        <div className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
          Calendar Legend & Closure Standards:
        </div>
        <div className="flex flex-wrap gap-4 text-slate-600">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-md bg-rose-50 border border-rose-300 ring-1 ring-rose-500/20" />
            <span className="font-medium">Closed Holiday (All Appointments & Regular Slots Blocked)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-md bg-teal-50 border border-teal-300 ring-1 ring-teal-500/20" />
            <span className="font-medium">Open / Optional Observance (Standard Booking Open)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-medium">Clinic-Wide Scope (Applies across all branches)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Building className="w-3.5 h-3.5 text-slate-600" />
            <span className="font-medium">Branch-Specific Scope (Only affects selected branch)</span>
          </div>
        </div>
      </div>

      {/* 7. Modal: Add / Edit Single Holiday */}
      <Modal
        isOpen={isSingleModalOpen}
        onClose={() => setIsSingleModalOpen(false)}
        title={editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
      >
        <form onSubmit={handleSaveSingle} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Holiday Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Republic Day, Diwali, Annual Maintenance"
              value={singleForm.name}
              onChange={(e) => setSingleForm({ ...singleForm, name: e.target.value })}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Holiday Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={singleForm.holiday_date}
                onChange={(e) => setSingleForm({ ...singleForm, holiday_date: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category
              </label>
              <select
                value={singleForm.category}
                onChange={(e) => setSingleForm({ ...singleForm, category: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              >
                <option value="national">National Holiday</option>
                <option value="festival">Festival</option>
                <option value="state">State Holiday</option>
                <option value="clinic_specific">Clinic Specific</option>
                <option value="optional">Optional Holiday</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scope / Branch Application
              </label>
              <select
                value={singleForm.branch_id}
                onChange={(e) => setSingleForm({ ...singleForm, branch_id: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
              >
                <option value="">Clinic-Wide (All Branches)</option>
                {(branches || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    Branch: {b.branch_name || b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center space-x-2 p-2 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={singleForm.is_closed}
                  onChange={(e) => setSingleForm({ ...singleForm, is_closed: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    Clinic Closed on this Date
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Prevents doctor slot bookings unless explicitly overridden
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Official gazetted closure, emergency on-call duty only"
              value={singleForm.description}
              onChange={(e) => setSingleForm({ ...singleForm, description: e.target.value })}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsSingleModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-all"
            >
              {editingHoliday ? 'Save Changes' : 'Create Holiday'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 8. Modal: Indian Festival Suggestions */}
      <Modal
        isOpen={isSuggestionsModalOpen}
        onClose={() => setIsSuggestionsModalOpen(false)}
        title={`Suggested Indian Holidays (${selectedYear})`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Select from curated Indian national and festival holidays to import directly into your calendar.
            Existing entries are marked to prevent duplication.
          </p>

          {isLoadingSuggestions ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
              <span className="text-xs">Loading catalogue...</span>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
              {suggestedList.map((item) => {
                const isSelected = selectedSuggestions.has(item.holiday_date);
                const isExisting = holidays.some(
                  (h) => (h.holiday_date_str || h.holiday_date?.substring(0, 10)) === item.holiday_date
                );

                return (
                  <div
                    key={item.holiday_date}
                    onClick={() => !isExisting && handleToggleSuggestion(item.holiday_date)}
                    className={`pt-2 flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer ${
                      isExisting
                        ? 'opacity-50 cursor-not-allowed bg-slate-50'
                        : isSelected
                        ? 'bg-amber-50/70 border border-amber-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        disabled={isExisting}
                        checked={isSelected || isExisting}
                        onChange={() => {}}
                        className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">{item.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(item.holiday_date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          • {item.category}
                        </div>
                      </div>
                    </div>

                    <div>
                      {isExisting ? (
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
                          Already Added
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full">
                          Ready to Import
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">
              {selectedSuggestions.size} holiday(s) selected
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setIsSuggestionsModalOpen(false)}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSuggestions}
                disabled={selectedSuggestions.size === 0}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl disabled:opacity-50 transition-all shadow-xs"
              >
                Import Selected
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 9. Modal: Batch Add Holidays */}
      <Modal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        title="Batch Add Holidays"
      >
        <form onSubmit={handleSaveBatch} className="space-y-4">
          <p className="text-xs text-slate-500">
            Quickly register multiple clinic holidays in one submission.
          </p>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {batchRows.map((row, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">
                    Holiday #{idx + 1}
                  </span>
                  {batchRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBatchRow(idx)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Holiday Name"
                    value={row.name}
                    onChange={(e) => handleUpdateBatchRow(idx, 'name', e.target.value)}
                    className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                  />
                  <input
                    type="date"
                    value={row.holiday_date}
                    onChange={(e) => handleUpdateBatchRow(idx, 'holiday_date', e.target.value)}
                    className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                  />
                  <select
                    value={row.category}
                    onChange={(e) => handleUpdateBatchRow(idx, 'category', e.target.value)}
                    className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="festival">Festival</option>
                    <option value="national">National</option>
                    <option value="state">State</option>
                    <option value="clinic_specific">Clinic Specific</option>
                    <option value="optional">Optional</option>
                  </select>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.is_closed}
                      onChange={(e) => handleUpdateBatchRow(idx, 'is_closed', e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] font-medium text-slate-700">Clinic Closed</span>
                  </label>

                  <select
                    value={row.branch_id}
                    onChange={(e) => handleUpdateBatchRow(idx, 'branch_id', e.target.value)}
                    className="text-[11px] px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-600"
                  >
                    <option value="">Clinic-Wide</option>
                    {(branches || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.branch_name || b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddBatchRow}
            className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Another Row</span>
          </button>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsBatchModalOpen(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
            >
              Save All Holidays
            </button>
          </div>
        </form>
      </Modal>

      {/* 10. Modal: CSV Import */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="Import Holidays from CSV"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Paste CSV data with headers: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">holiday_date,name,category,is_closed,description</code>
          </p>

          <textarea
            rows={5}
            placeholder={`holiday_date,name,category,is_closed,description\n2026-08-15,Independence Day,national,true,National Holiday\n2026-10-02,Gandhi Jayanti,national,true,National Holiday`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full text-xs font-mono p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Apply to Branch (Optional)
            </label>
            <select
              value={csvBranchId}
              onChange={(e) => setCsvBranchId(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
            >
              <option value="">Clinic-Wide (All Branches)</option>
              {(branches || []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_name || b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCsvModalOpen(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImportCsv}
              disabled={isImporting || !csvText.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-50"
            >
              {isImporting ? 'Importing...' : 'Execute Import'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 11. Deactivation Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingHoliday)}
        onClose={() => setDeletingHoliday(null)}
        onConfirm={handleConfirmDeactivate}
        title="Deactivate Holiday?"
        message={`Are you sure you want to deactivate "${deletingHoliday?.name}"? It will no longer close the clinic or block appointment booking.`}
        confirmText="Deactivate"
        isDestructive={true}
      />
    </div>
  );
};
export default AnnualCalendarPage;
