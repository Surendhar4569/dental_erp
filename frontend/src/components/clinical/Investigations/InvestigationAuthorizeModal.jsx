import React, { useState } from 'react';
import { X, ShieldCheck, AlertTriangle, FileText, CheckCircle2, Loader2, Edit3, Lock } from 'lucide-react';
import investigationService from '../../../services/investigationService';

export const InvestigationAuthorizeModal = ({ isOpen, onClose, orderItem, onAuthorized }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Amendment mode if already authorized
  const isAlreadyAuthorized = orderItem?.result?.status === 'authorized' || orderItem?.result?.status === 'amended';
  const [isAmending, setIsAmending] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [updatedObservations, setUpdatedObservations] = useState(orderItem?.result?.observations || '');

  if (!isOpen || !orderItem || !orderItem.result) return null;

  const result = orderItem.result;

  const handleAuthorize = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await investigationService.authorizeResult(result.id);
      onAuthorized?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Authorization failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmend = async (e) => {
    e.preventDefault();
    if (!amendmentReason.trim()) {
      setError('A mandatory clinical reason is required to legally amend an authorized result.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        reason: amendmentReason.trim(),
        observations: updatedObservations.trim() || result.observations,
        results_data: result.results_data,
        abnormal_flag: result.abnormal_flag,
        critical_flag: result.critical_flag,
      };

      await investigationService.amendResult(result.id, payload);
      onAuthorized?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Amendment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full flex flex-col overflow-hidden my-auto border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wide">
                {isAlreadyAuthorized ? 'Authorized Investigation Record' : 'Practitioner Clinical Authorization'}
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

        <div className="p-6 text-xs text-slate-700 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Result Summary */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                Draft Findings Summary
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                result.status === 'authorized' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {result.status}
              </span>
            </div>

            {/* Parameters Preview */}
            {result.results_data?.parameters && Array.isArray(result.results_data.parameters) && (
              <div className="space-y-1.5">
                {result.results_data.parameters.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-600">{p.parameter}:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {p.value} {p.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {result.observations && (
              <div className="pt-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Observations:</span>
                <p className="text-slate-800 italic mt-0.5">"{result.observations}"</p>
              </div>
            )}

            <div className="pt-2 text-[11px] text-slate-500 border-t border-slate-200 flex justify-between">
              <span>Recorded by: <strong>{result.recorded_by_name || 'Staff'}</strong></span>
              <span>Time: {new Date(result.recorded_at).toLocaleString()}</span>
            </div>
          </div>

          {!isAlreadyAuthorized ? (
            /* First-time Authorization */
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-start space-x-2.5">
                <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-emerald-900 text-xs">
                  By authorizing, you confirm that you have reviewed these diagnostic findings.
                  <strong> The record will be sealed and become immutable.</strong> Future edits will require a legal amendment reason.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAuthorize}
                  disabled={submitting}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Authorizing Record...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Authorize & Seal Result</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : !isAmending ? (
            /* Already Authorized View with Amend trigger */
            <div className="space-y-4">
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-slate-800 font-semibold">
                  This record is authorized and sealed by Dr. {result.authorized_by_name || 'Practitioner'}.
                </span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setIsAmending(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold rounded-lg transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Create Legal Amendment</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Legal Amendment Form */
            <form onSubmit={handleAmend} className="space-y-4 pt-2 border-t border-slate-200">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                <strong>Legal Amendment:</strong> Record amendments preserve previous versions and attach your name, timestamp, and justification to the audit trail.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                  Amendment Reason (Mandatory)*
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Recalibration of analyzer, additional clinical review..."
                  value={amendmentReason}
                  onChange={(e) => setAmendmentReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                  Updated Diagnostic Impression / Remarks
                </label>
                <textarea
                  rows={3}
                  value={updatedObservations}
                  onChange={(e) => setUpdatedObservations(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAmending(false)}
                  disabled={submitting}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Amendment...</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Commit Amendment</span>
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

export default InvestigationAuthorizeModal;

