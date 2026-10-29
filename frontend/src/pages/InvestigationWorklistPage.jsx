import React, { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Printer,
  ShieldCheck,
  Edit3,
  FileText,
  Sliders,
  RefreshCw,
  LayoutList,
  Layers,
  ArrowRight,
  Lock,
} from 'lucide-react';
import investigationService from '../services/investigationService';
import { InvestigationResultModal } from '../components/clinical/Investigations/InvestigationResultModal';
import { InvestigationAuthorizeModal } from '../components/clinical/Investigations/InvestigationAuthorizeModal';
import { PrintableInvestigationReportModal } from '../components/clinical/Investigations/PrintableInvestigationReportModal';
import { InvestigationAttachmentsModal } from '../components/clinical/Investigations/InvestigationAttachmentsModal';
import { InvestigationCatalogueModal } from '../components/clinical/Investigations/InvestigationCatalogueModal';

const STATUS_TABS = [
  { key: 'all', label: 'All Orders' },
  { key: 'ordered', label: 'Ordered / Pending' },
  { key: 'sample_collected', label: 'Sample Collected' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'result_entered', label: 'Results Entered' },
  { key: 'authorized', label: 'Authorized / Ready' },
  { key: 'cancelled', label: 'Cancelled' },
];

export const InvestigationWorklistPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // View Mode: 'itemized' (each test investigation as its own row) or 'orders' (grouped by order)
  const [viewMode, setViewMode] = useState('itemized');

  // Filters
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [activeItemForResult, setActiveItemForResult] = useState(null);
  const [activeItemForAuthorize, setActiveItemForAuthorize] = useState(null);
  const [activeOrderForReport, setActiveOrderForReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [activeOrderForAttachments, setActiveOrderForAttachments] = useState(null);
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(false);

  // User role check
  const user = JSON.parse(localStorage.getItem('dental_erp_user') || '{}');
  const isAdmin = user.role_name === 'admin' || user.role === 'admin';

  useEffect(() => {
    loadWorklist();
  }, [selectedStatus, selectedPriority]);

  const loadWorklist = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (selectedPriority !== 'all') params.priority = selectedPriority;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await investigationService.getWorklist(params);
      setOrders(res.orders || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load investigation worklist.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadWorklist();
  };

  const handleAdvanceStatus = async (orderId, newStatus, promptReason = false) => {
    let notes = null;
    if (promptReason) {
      const reason = window.prompt(`Please enter reason for setting order to ${newStatus}:`);
      if (!reason || !reason.trim()) {
        alert('A reason is mandatory for this status transition.');
        return;
      }
      notes = reason.trim();
    }

    try {
      await investigationService.updateOrderStatus(orderId, { status: newStatus, notes });
      loadWorklist();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to update order status.');
    }
  };

  const handleOpenReport = async (order) => {
    try {
      const res = await investigationService.getPrintableReport(order.id);
      setReportData(res);
      setActiveOrderForReport(order);
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to generate report.');
    }
  };

  // Flattened itemized test list for individual row display
  const itemizedList = useMemo(() => {
    const list = [];
    orders.forEach((order) => {
      const items = order.items || order.items_preview || [];
      items.forEach((item) => {
        list.push({
          ...item,
          order,
        });
      });
    });
    return list;
  }, [orders]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Laboratory & Diagnostic Worklist
              </h1>
              <p className="text-xs text-slate-500">
                Operational processing, specimen handling, result entry, authorization seals, and reports.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            type="button"
            onClick={loadWorklist}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
            title="Refresh list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsCatalogueOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Manage Catalogue & Pricing</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-xs border-b border-slate-100">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedStatus(tab.key)}
              className={`px-3 py-1.5 rounded-lg font-bold transition shrink-0 ${
                selectedStatus === tab.key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search, Priority & View Mode Selector */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 flex-1 w-full sm:max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search patient, token, order #, or test name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition"
            >
              Search
            </button>
          </form>

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end flex-wrap gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('itemized')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center space-x-1 transition ${
                  viewMode === 'itemized'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="View each test as its own distinct row"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Itemized Tests ({itemizedList.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('orders')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center space-x-1 transition ${
                  viewMode === 'orders'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Group tests by order"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Group by Order ({orders.length})</span>
              </button>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-bold uppercase text-slate-400">Priority:</span>
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Priorities</option>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">Stat (Emergency)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* VIEW 1: ITEMIZED TESTS VIEW (Every investigation test has its own dedicated row) */}
      {viewMode === 'itemized' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Investigation Test</th>
                  <th className="py-3 px-4">Order # & Token</th>
                  <th className="py-3 px-4">Patient Information</th>
                  <th className="py-3 px-4">Ordering Dentist</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Test Status</th>
                  <th className="py-3 px-4">Results & Authorization</th>
                  <th className="py-3 px-4 text-right">Inline Operational Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                      <span>Loading investigation test worklist...</span>
                    </td>
                  </tr>
                ) : itemizedList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                      No investigation tests match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  itemizedList.map((item) => {
                    const order = item.order;
                    const isUrgent = order.priority === 'urgent';
                    const isStat = order.priority === 'stat';
                    const hasResult = Boolean(item.result);
                    const isAuthorized =
                      item.result?.status === 'authorized' ||
                      item.result?.status === 'amended' ||
                      Boolean(item.result?.is_authorized);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition">
                        {/* Investigation Test */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              {item.investigation_code || item.code}
                            </span>
                            <span className="font-bold text-slate-900 text-xs">
                              {item.investigation_name || item.name}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center space-x-2">
                            <span>Category: <strong className="text-slate-700">{item.category}</strong></span>
                            {item.sample_required || item.sampleRequired ? (
                              <span className="text-amber-600 font-semibold">• Specimen Required</span>
                            ) : null}
                          </div>
                        </td>

                        {/* Order # & Token */}
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-800">
                            {order.order_number}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Token: #{order.token_display || order.visit_token || '---'} • {new Date(order.order_date || order.created_at).toLocaleDateString()}
                          </div>
                        </td>

                        {/* Patient */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {order.patient_name || `${order.patient_first_name} ${order.patient_last_name}`}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            ID: {order.patient_number}
                          </div>
                        </td>

                        {/* Doctor */}
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          Dr. {order.doctor_name || 'Attending Doctor'}
                        </td>

                        {/* Priority */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isStat
                                ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                                : isUrgent
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {order.priority}
                          </span>
                        </td>

                        {/* Test Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                              isAuthorized || item.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'result_entered'
                                ? 'bg-blue-100 text-blue-800'
                                : item.status === 'in_progress'
                                ? 'bg-purple-100 text-purple-800'
                                : item.status === 'sample_collected'
                                ? 'bg-amber-100 text-amber-800'
                                : item.status === 'cancelled'
                                ? 'bg-rose-100 text-rose-800 line-through'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {(item.status || order.status)?.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Results & Observations Preview */}
                        <td className="py-3 px-4 max-w-xs">
                          {hasResult ? (
                            <div className="space-y-1">
                              {item.result.observations && (
                                <p className="text-[11px] text-slate-700 italic line-clamp-2">
                                  "{item.result.observations}"
                                </p>
                              )}
                              {isAuthorized ? (
                                <div className="inline-flex items-center space-x-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Dr. {item.result.authorized_by_name || 'Practitioner'} (Sealed)</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  Results Entered (Pending Sign-off)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">
                              Pending Result Entry
                            </span>
                          )}
                        </td>

                        {/* Inline Operational Action Buttons */}
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {/* Inline Trigger: Enter / Edit Results */}
                          {item.status !== 'completed' && order.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => setActiveItemForResult({ ...item, order_id: order.id })}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold shadow-xs transition inline-flex items-center space-x-1"
                              title="Enter numerical findings, qualitative results & notes"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{hasResult ? 'Edit Results' : '+ Enter Results'}</span>
                            </button>
                          )}

                          {/* Inline Trigger: Review, Authorize & Seal / Amend */}
                          {hasResult && (
                            <button
                              type="button"
                              onClick={() => setActiveItemForAuthorize({ ...item, order_id: order.id })}
                              className={`px-2.5 py-1 rounded text-xs font-bold shadow-xs transition inline-flex items-center space-x-1 ${
                                isAuthorized
                                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                              title={
                                isAuthorized
                                  ? 'Result is cryptographically sealed. Click to record a legal amendment.'
                                  : 'Authorize results and apply digital cryptographic seal.'
                              }
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>{isAuthorized ? 'Amend Result' : 'Authorize & Seal'}</span>
                            </button>
                          )}

                          {/* Diagnostic Scans / Attachments */}
                          <button
                            type="button"
                            onClick={() => setActiveOrderForAttachments(order)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition inline-flex items-center"
                            title="Manage Radiographs, Diagnostic Scans & PDFs"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* Printable Report */}
                          <button
                            type="button"
                            onClick={() => handleOpenReport(order)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition inline-flex items-center"
                            title="View / Print Investigation Report"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: GROUPED BY ORDER VIEW */}
      {viewMode === 'orders' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Date & Token</th>
                  <th className="py-3 px-4">Patient Information</th>
                  <th className="py-3 px-4">Ordering Dentist</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4 min-w-[320px]">Ordered Investigations & Inline Actions</th>
                  <th className="py-3 px-4">Billing Status</th>
                  <th className="py-3 px-4">Order Status</th>
                  <th className="py-3 px-4 text-right">Order Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                      <span>Loading investigation worklist...</span>
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                      No orders match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const isUrgent = order.priority === 'urgent';
                    const isStat = order.priority === 'stat';
                    const items = order.items || order.items_preview || [];

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/70 transition">
                        {/* Order # */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            {order.order_number}
                          </span>
                          {order.clinical_indication && (
                            <p className="text-[10px] text-slate-500 italic mt-1 line-clamp-1" title={order.clinical_indication}>
                              "{order.clinical_indication}"
                            </p>
                          )}
                        </td>

                        {/* Date & Token */}
                        <td className="py-3 px-4 text-slate-600">
                          <div className="font-semibold text-slate-800">
                            {new Date(order.order_date || order.created_at).toLocaleDateString()}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Token: #{order.token_display || order.visit_token || '---'}
                          </div>
                        </td>

                        {/* Patient */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {order.patient_name || `${order.patient_first_name} ${order.patient_last_name}`}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            ID: {order.patient_number} • {order.patient_phone || 'No phone'}
                          </div>
                        </td>

                        {/* Doctor */}
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          Dr. {order.doctor_name || 'Attending Doctor'}
                        </td>

                        {/* Priority */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isStat
                                ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                                : isUrgent
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {order.priority}
                          </span>
                        </td>

                        {/* Ordered Investigations & Inline Actions */}
                        <td className="py-3 px-4">
                          <div className="space-y-2">
                            {items.length === 0 ? (
                              <span className="text-[11px] text-slate-400 italic">No items found</span>
                            ) : (
                              items.map((item) => {
                                const hasResult = Boolean(item.result);
                                const isAuthorized =
                                  item.result?.status === 'authorized' ||
                                  item.result?.status === 'amended' ||
                                  Boolean(item.result?.is_authorized);

                                return (
                                  <div
                                    key={item.id}
                                    className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center space-x-1.5">
                                        <span className="font-mono text-[10px] font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                          {item.investigation_code || item.code}
                                        </span>
                                        <strong className="text-slate-900 text-[11px]">
                                          {item.investigation_name || item.name}
                                        </strong>
                                      </div>
                                      <span
                                        className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                          isAuthorized || item.status === 'completed'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : item.status === 'result_entered'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        {(item.status || order.status)?.replace('_', ' ')}
                                      </span>
                                    </div>

                                    {/* Result preview */}
                                    {hasResult && item.result.observations && (
                                      <p className="text-[10px] text-slate-600 italic">
                                        "{item.result.observations}"
                                      </p>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                                      <span className="text-[10px] text-slate-400">
                                        {item.category}
                                      </span>

                                      <div className="flex items-center space-x-1.5">
                                        {item.status !== 'completed' && order.status !== 'cancelled' && (
                                          <button
                                            type="button"
                                            onClick={() => setActiveItemForResult({ ...item, order_id: order.id })}
                                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold transition"
                                          >
                                            {hasResult ? 'Edit Results' : '+ Enter Results'}
                                          </button>
                                        )}

                                        {hasResult && (
                                          <button
                                            type="button"
                                            onClick={() => setActiveItemForAuthorize({ ...item, order_id: order.id })}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                              isAuthorized
                                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                                : 'bg-emerald-600 text-white border-transparent hover:bg-emerald-700'
                                            }`}
                                          >
                                            {isAuthorized ? 'Amend' : 'Authorize'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </td>

                        {/* Billing Status */}
                        <td className="py-3 px-4 font-mono">
                          <div className="font-bold text-slate-900">
                            ₹{parseFloat(order.total_amount || 0).toFixed(2)}
                          </div>
                          <span className="text-[10px] font-bold uppercase text-slate-500">
                            Central Billing
                          </span>
                        </td>

                        {/* Order Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                              order.status === 'completed' || order.status === 'authorized'
                                ? 'bg-emerald-100 text-emerald-800'
                                : order.status === 'result_entered'
                                ? 'bg-blue-100 text-blue-800'
                                : order.status === 'in_progress'
                                ? 'bg-purple-100 text-purple-800'
                                : order.status === 'sample_collected'
                                ? 'bg-amber-100 text-amber-800'
                                : order.status === 'cancelled'
                                ? 'bg-rose-100 text-rose-800 line-through'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {order.status?.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Order-level Actions */}
                        <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                          {order.status === 'ordered' && (
                            <button
                              type="button"
                              onClick={() => handleAdvanceStatus(order.id, 'sample_collected')}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[11px] font-bold shadow-xs transition"
                            >
                              Sample Collected
                            </button>
                          )}

                          {order.status === 'sample_collected' && (
                            <button
                              type="button"
                              onClick={() => handleAdvanceStatus(order.id, 'in_progress')}
                              className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[11px] font-bold shadow-xs transition"
                            >
                              Start Processing
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenReport(order)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition"
                            title="View / Print Investigation Report"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveOrderForAttachments(order)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition"
                            title="Manage Diagnostic Scans & Attachments"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {order.status !== 'completed' && order.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => handleAdvanceStatus(order.id, 'cancelled', true)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                              title="Cancel Order"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {activeItemForResult && (
        <InvestigationResultModal
          isOpen={!!activeItemForResult}
          onClose={() => setActiveItemForResult(null)}
          orderItem={activeItemForResult}
          onResultSaved={loadWorklist}
        />
      )}

      {activeItemForAuthorize && (
        <InvestigationAuthorizeModal
          isOpen={!!activeItemForAuthorize}
          onClose={() => setActiveItemForAuthorize(null)}
          orderItem={activeItemForAuthorize}
          onAuthorized={loadWorklist}
        />
      )}

      {activeOrderForReport && reportData && (
        <PrintableInvestigationReportModal
          isOpen={!!activeOrderForReport}
          onClose={() => {
            setActiveOrderForReport(null);
            setReportData(null);
          }}
          reportData={reportData}
        />
      )}

      {activeOrderForAttachments && (
        <InvestigationAttachmentsModal
          isOpen={!!activeOrderForAttachments}
          onClose={() => setActiveOrderForAttachments(null)}
          orderId={activeOrderForAttachments.id}
          orderNumber={activeOrderForAttachments.order_number}
        />
      )}

      {isCatalogueOpen && (
        <InvestigationCatalogueModal
          isOpen={isCatalogueOpen}
          onClose={() => setIsCatalogueOpen(false)}
        />
      )}
    </div>
  );
};

export default InvestigationWorklistPage;
