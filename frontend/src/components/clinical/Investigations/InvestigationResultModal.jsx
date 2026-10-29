import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, FlaskConical, Save, Loader2, Info } from 'lucide-react';
import investigationService from '../../../services/investigationService';

export const InvestigationResultModal = ({ isOpen, onClose, orderItem, onResultSaved }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [resultType, setResultType] = useState('structured');
  const [parameters, setParameters] = useState([]);
  const [observations, setObservations] = useState('');
  const [abnormalFlag, setAbnormalFlag] = useState(false);
  const [criticalFlag, setCriticalFlag] = useState(false);

  useEffect(() => {
    if (!isOpen || !orderItem) return;

    setError(null);
    const existing = orderItem.result;

    if (existing) {
      setResultType(existing.result_type || 'structured');
      setObservations(existing.observations || '');
      setAbnormalFlag(Boolean(existing.abnormal_flag));
      setCriticalFlag(Boolean(existing.critical_flag));

      if (existing.results_data?.parameters && Array.isArray(existing.results_data.parameters)) {
        setParameters(existing.results_data.parameters);
      } else {
        initParametersFromCatalogue(orderItem);
      }
    } else {
      setObservations('');
      setAbnormalFlag(false);
      setCriticalFlag(false);
      initParametersFromCatalogue(orderItem);
    }
  }, [isOpen, orderItem]);

  const initParametersFromCatalogue = (item) => {
    let ranges = [];
    if (item.reference_ranges) {
      ranges = typeof item.reference_ranges === 'string'
        ? JSON.parse(item.reference_ranges)
        : item.reference_ranges;
    }

    if (Array.isArray(ranges) && ranges.length > 0) {
      setParameters(
        ranges.map((r) => ({
          parameter: r.parameter || r.name,
          unit: r.unit || '',
          min: r.min !== undefined ? r.min : null,
          max: r.max !== undefined ? r.max : null,
          normal: r.normal || '',
          value: '',
          is_abnormal: false,
        }))
      );
    } else {
      setParameters([
        {
          parameter: 'Primary Finding / Value',
          unit: '',
          min: null,
          max: null,
          normal: 'Normal',
          value: '',
          is_abnormal: false,
        },
      ]);
    }
  };

  const handleParameterChange = (index, val) => {
    const updated = [...parameters];
    const param = { ...updated[index], value: val };

    // Auto flag check for numeric ranges
    if (param.min !== null && param.max !== null && val.trim() !== '') {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        param.is_abnormal = num < param.min || num > param.max;
      }
    }

    updated[index] = param;
    setParameters(updated);

    // Auto toggle abnormal flag if any parameter is out of range
    const anyAbnormal = updated.some((p) => p.is_abnormal);
    if (anyAbnormal) {
      setAbnormalFlag(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderItem) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        result_type: resultType,
        results_data: {
          parameters,
        },
        observations: observations.trim() || null,
        abnormal_flag: abnormalFlag,
        critical_flag: criticalFlag,
      };

      await investigationService.enterItemResult(orderItem.order_id, orderItem.id, payload);
      onResultSaved?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save investigation result.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !orderItem) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden my-auto border border-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wide">
                Record Investigation Findings
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {orderItem.investigation_code} • {orderItem.investigation_name}
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[80vh] space-y-5 text-xs text-slate-700">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Test & Specimen Info Banner */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Specimen / Mode</span>
              <span className="font-semibold text-slate-800">
                {orderItem.specimen_type || 'Radiological / Clinical Device'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Turnaround Target</span>
              <span className="font-semibold text-slate-800">
                {orderItem.turnaround_time_hours || 24} Hours
              </span>
            </div>
          </div>

          {/* Structured Parameters */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              Test Parameters & Values
            </label>
            <div className="space-y-3">
              {parameters.map((param, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border transition ${
                    param.is_abnormal ? 'bg-rose-50/50 border-rose-300' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-800">{param.parameter}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Ref: {param.min !== null && param.max !== null ? `${param.min} - ${param.max} ${param.unit}` : param.normal || 'Normal'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      required
                      placeholder={`Enter ${param.parameter} result...`}
                      value={param.value}
                      onChange={(e) => handleParameterChange(idx, e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {param.unit && (
                      <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-2 rounded-lg border border-slate-200">
                        {param.unit}
                      </span>
                    )}
                  </div>

                  {param.is_abnormal && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1.5 flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      <span>Value falls outside standard physiological reference range.</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Observations / Diagnostic Impression */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              Diagnostic Impression & Clinical Observations
            </label>
            <textarea
              rows={3}
              placeholder="Detailed morphological findings, radiological evaluation, or remarks..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Abnormal / Critical Flags */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={abnormalFlag}
                onChange={(e) => setAbnormalFlag(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
              />
              <span className="text-xs font-semibold text-slate-800">
                Mark as Abnormal Finding
              </span>
            </label>

            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={criticalFlag}
                onChange={(e) => setCriticalFlag(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
              />
              <span className="text-xs font-bold text-rose-700">
                Mark as Critical Value (Requires Urgent Doctor Alert)
              </span>
            </label>
          </div>

          {/* Submit Actions */}
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
              disabled={submitting}
              className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Findings...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Draft Findings</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InvestigationResultModal;

