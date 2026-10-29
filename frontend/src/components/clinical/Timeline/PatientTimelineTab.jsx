import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Filter,
  Search,
  RefreshCw,
  Activity,
  Stethoscope,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Pill,
  CreditCard,
  Building,
  CheckCircle2,
  Lock,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Eye,
  AlertCircle,
  X,
  ExternalLink,
  Receipt,
  FlaskConical,
} from 'lucide-react';
import { timelineService } from '../../../services/timelineService';
import { VisitEncounterModal } from './VisitEncounterModal';

export const PatientTimelineTab = ({
  patient,
  patientVisits = [],
  isClinical = true,
  onOpenExamination,
  onOpenTreatmentPlan,
  onOpenPrescription,
}) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVisitId, setSelectedVisitId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });

  // Selected visit for single-screen encounter viewer modal
  const [encounterModalVisitId, setEncounterModalVisitId] = useState(null);

  // Fetch timeline events
  const fetchTimeline = useCallback(
    async (pageToLoad = 1) => {
      if (!patient?.id) return;
      setLoading(true);
      setError(null);

      try {
        const params = {
          page: pageToLoad,
          limit: pagination.limit,
          category: selectedCategory,
        };
        if (searchQuery.trim()) params.search = searchQuery.trim();
        if (selectedVisitId) params.visitId = selectedVisitId;
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (selectedBranchId) params.branchId = selectedBranchId;

        const res = await timelineService.getPatientTimeline(patient.id, params);
        if (res.success) {
          setEvents(res.events || []);
          setPagination(res.pagination);
        } else {
          setError(res.message || 'Failed to load timeline events.');
        }
      } catch (err) {
        setError(
          err.response?.data?.message ||
            err.message ||
            'Error communicating with patient timeline service.'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      patient?.id,
      selectedCategory,
      searchQuery,
      selectedVisitId,
      startDate,
      endDate,
      selectedBranchId,
      pagination.limit,
    ]
  );

  useEffect(() => {
    fetchTimeline(1);
  }, [fetchTimeline]);

  // Category options
  const categoryFilters = [
    { id: 'all', label: 'All Records', icon: Filter },
    { id: 'visits', label: 'Visits', icon: Ticket },
    { id: 'appointments', label: 'Appointments', icon: Calendar },
    { id: 'vitals', label: 'Vitals & Triage', icon: Activity },
    { id: 'clinical', label: 'Clinical Exams', icon: Stethoscope },
    { id: 'odontogram', label: 'Odontogram', icon: Eye },
    { id: 'treatment_plans', label: 'Plans', icon: FileText },
    { id: 'consent', label: 'Consents', icon: ShieldCheck },
    { id: 'prescriptions', label: 'Prescriptions', icon: Pill },
    { id: 'investigations', label: 'Investigations', icon: FlaskConical },
    { id: 'billing', label: 'Billing', icon: Receipt },
  ];

  // Helper for Category styling & icons
  const getCategoryTheme = (category) => {
    switch (category) {
      case 'visits':
        return {
          icon: Ticket,
          badgeBg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
          dotBg: 'bg-indigo-600',
          iconBg: 'bg-indigo-100 text-indigo-700',
        };
      case 'appointments':
        return {
          icon: Calendar,
          badgeBg: 'bg-blue-50 border-blue-200 text-blue-700',
          dotBg: 'bg-blue-600',
          iconBg: 'bg-blue-100 text-blue-700',
        };
      case 'vitals':
        return {
          icon: Activity,
          badgeBg: 'bg-rose-50 border-rose-200 text-rose-700',
          dotBg: 'bg-rose-500',
          iconBg: 'bg-rose-100 text-rose-700',
        };
      case 'clinical':
        return {
          icon: Stethoscope,
          badgeBg: 'bg-violet-50 border-violet-200 text-violet-700',
          dotBg: 'bg-violet-600',
          iconBg: 'bg-violet-100 text-violet-700',
        };
      case 'odontogram':
        return {
          icon: Eye,
          badgeBg: 'bg-teal-50 border-teal-200 text-teal-800',
          dotBg: 'bg-teal-600',
          iconBg: 'bg-teal-100 text-teal-800',
        };
      case 'treatment_plans':
        return {
          icon: FileText,
          badgeBg: 'bg-amber-50 border-amber-200 text-amber-800',
          dotBg: 'bg-amber-600',
          iconBg: 'bg-amber-100 text-amber-800',
        };
      case 'consent':
        return {
          icon: ShieldCheck,
          badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          dotBg: 'bg-emerald-600',
          iconBg: 'bg-emerald-100 text-emerald-800',
        };
      case 'prescriptions':
        return {
          icon: Pill,
          badgeBg: 'bg-purple-50 border-purple-200 text-purple-800',
          dotBg: 'bg-purple-600',
          iconBg: 'bg-purple-100 text-purple-800',
        };
      case 'investigations':
        return {
          icon: FlaskConical,
          badgeBg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
          dotBg: 'bg-indigo-600',
          iconBg: 'bg-indigo-100 text-indigo-700',
        };
      case 'billing':
        return {
          icon: Receipt,
          badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          dotBg: 'bg-emerald-600',
          iconBg: 'bg-emerald-100 text-emerald-800',
        };
      default:
        return {
          icon: Clock,
          badgeBg: 'bg-slate-50 border-slate-200 text-slate-700',
          dotBg: 'bg-slate-500',
          iconBg: 'bg-slate-100 text-slate-700',
        };
    }
  };

  // Helper to format dates & relative time
  const formatEventTimestamp = (timestamp) => {
    if (!timestamp) return { dateStr: '---', timeStr: '', relativeStr: '' };
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Relative
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
    let relativeStr = '';
    if (diffDays === 0) relativeStr = 'Today';
    else if (diffDays === 1) relativeStr = 'Yesterday';
    else if (diffDays < 30) relativeStr = `${diffDays} days ago`;

    return { dateStr, timeStr, relativeStr };
  };

  const handleClearFilters = () => {
    setSelectedCategory('all');
    setSearchQuery('');
    setSelectedVisitId('');
    setStartDate('');
    setEndDate('');
    setSelectedBranchId('');
  };

  const hasActiveFilters =
    selectedCategory !== 'all' ||
    searchQuery.trim() !== '' ||
    selectedVisitId !== '' ||
    startDate !== '' ||
    endDate !== '' ||
    selectedBranchId !== '';

  return (
    <div className="space-y-4">
      {/* 1. Filter Control Header Strip */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
        {/* Top Search & Dropdown Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search timeline notes, tokens, doctor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Visit Filter Dropdown */}
          <div>
            <select
              value={selectedVisitId}
              onChange={(e) => setSelectedVisitId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700"
            >
              <option value="">All Visit Encounters</option>
              {patientVisits.map((v) => (
                <option key={v.id} value={v.id}>
                  Token #{v.token_display} ({new Date(v.visit_date).toLocaleDateString()} - {v.branch_name})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Start & End */}
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="date"
              placeholder="From"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700"
              title="Filter from date"
            />
            <input
              type="date"
              placeholder="To"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700"
              title="Filter to date"
            />
          </div>

          {/* Refresh & Reset Controls */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => fetchTimeline(pagination.page)}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition"
                title="Clear all active filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Category Selector Pills Strip */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 pt-1 text-xs">
          {categoryFilters.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-category-id={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`inline-flex items-center px-2.5 py-1 rounded-lg font-bold transition shrink-0 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 mr-1 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Timeline Events Feed */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500">Aggregating patient chronological medical timeline...</p>
        </div>
      ) : error ? (
        <div className="p-6 text-center bg-rose-50 rounded-xl border border-rose-200 text-xs">
          <AlertCircle className="w-6 h-6 text-rose-600 mx-auto mb-2" />
          <p className="font-bold text-rose-800">{error}</p>
          <button
            type="button"
            onClick={() => fetchTimeline(1)}
            className="mt-3 px-3 py-1 bg-white border border-rose-300 text-rose-700 rounded font-bold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-slate-700">No Timeline Events Found</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'No medical events match the current filter criteria. Try clearing search or date parameters.'
              : 'This patient has no recorded clinical encounters, vitals, examinations, or prescriptions.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8 space-y-5 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {events.map((evt) => {
            const theme = getCategoryTheme(evt.category);
            const { dateStr, timeStr, relativeStr } = formatEventTimestamp(evt.event_timestamp);
            const Icon = theme.icon;

            return (
              <div key={`${evt.event_type}-${evt.id}`} className="relative group">
                {/* Timeline node icon */}
                <div
                  className={`absolute -left-6 sm:-left-8 top-1 w-6 h-6 sm:w-7 sm:h-7 rounded-full ${theme.iconBg} border-2 border-white shadow-xs flex items-center justify-center shrink-0 z-10 transition group-hover:scale-110`}
                >
                  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </div>

                {/* Event Card */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-md hover:border-slate-300 transition space-y-2">
                  {/* Card Top Metadata Line */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-100">
                    <div className="flex items-center flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider ${theme.badgeBg}`}
                      >
                        {evt.category.replace('_', ' ')}
                      </span>

                      {evt.visit_token && (
                        <span className="font-mono text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          Encounter #{evt.visit_token}
                        </span>
                      )}

                      {evt.status && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            evt.status === 'signed' || evt.status === 'completed' || evt.status === 'approved' || evt.status === 'obtained' || evt.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : evt.status === 'cancelled' || evt.status === 'reversed' || evt.status === 'withdrawn'
                              ? 'bg-rose-100 text-rose-800'
                              : evt.status === 'in_progress' || evt.status === 'amended'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {evt.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                      <Calendar className="w-3 h-3" />
                      <span>{dateStr}</span>
                      {timeStr && (
                        <>
                          <span>&bull;</span>
                          <Clock className="w-3 h-3" />
                          <span>{timeStr}</span>
                        </>
                      )}
                      {relativeStr && (
                        <span className="font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                          {relativeStr}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Summary */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition">
                      {evt.title}
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {evt.summary}
                    </p>
                  </div>

                  {/* Bottom Context Strip & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                      {evt.doctor_name && (
                        <span className="flex items-center">
                          <Stethoscope className="w-3 h-3 mr-1 text-slate-400" />
                          <strong>{evt.doctor_name}</strong>
                        </span>
                      )}
                      {evt.branch_name && (
                        <span className="flex items-center">
                          <Building className="w-3 h-3 mr-1 text-slate-400" />
                          {evt.branch_name}
                        </span>
                      )}
                    </div>

                    {/* View Details / Encounter Action */}
                    {evt.visit_id && (
                      <button
                        type="button"
                        data-action="view-encounter-records"
                        onClick={() => setEncounterModalVisitId(evt.visit_id)}
                        className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition self-start sm:self-auto shadow-2xs"
                      >
                        <Eye className="w-3 h-3 mr-1 text-indigo-600" />
                        <span>View Encounter Records</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 text-xs">
          <span className="text-slate-500">
            Showing <strong>{(pagination.page - 1) * pagination.limit + 1}</strong> to{' '}
            <strong>{Math.min(pagination.page * pagination.limit, pagination.total)}</strong> of{' '}
            <strong>{pagination.total}</strong> events
          </span>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => fetchTimeline(pagination.page - 1)}
              className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-700 px-2">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => fetchTimeline(pagination.page + 1)}
              className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 4. Single-Screen Encounter Records Modal */}
      {encounterModalVisitId && (
        <VisitEncounterModal
          isOpen={!!encounterModalVisitId}
          onClose={() => setEncounterModalVisitId(null)}
          visitId={encounterModalVisitId}
          patientId={patient?.id}
          isClinical={isClinical}
        />
      )}
    </div>
  );
};

export default PatientTimelineTab;
