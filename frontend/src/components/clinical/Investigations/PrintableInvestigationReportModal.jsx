import React, { useRef } from 'react';
import { X, Printer, CheckCircle2, AlertTriangle, ShieldCheck, FileText, FlaskConical, Calendar, User, Clock } from 'lucide-react';

export const PrintableInvestigationReportModal = ({ isOpen, onClose, reportData }) => {
  const printRef = useRef(null);

  if (!isOpen || !reportData) return null;

  const { order, clinic, branch, patient, items = [], isAuthorized } = reportData;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto border border-slate-200">
        {/* Modal Top Bar (Screen Only) */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center space-x-2">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold tracking-wide">
              Diagnostic & Laboratory Investigation Report
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
              {order?.order_number}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas */}
        <div ref={printRef} className="p-8 overflow-y-auto print:p-0 print:overflow-visible text-slate-800 bg-white">
          {/* Clinic & Header */}
          <div className="border-b-2 border-indigo-600 pb-5 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {clinic?.name || 'VoiceGate Dental Clinic & Diagnostics'}
                </h1>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  {branch?.branch_name ? `${branch.branch_name} Branch` : 'Main Diagnostic Center'}
                  {branch?.address_line1 && ` • ${branch.address_line1}`}
                  {branch?.city && `, ${branch.city}`}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {branch?.phone && `Phone: ${branch.phone}`}
                  {branch?.email && ` • Email: ${branch.email}`}
                </p>
              </div>

              <div className="text-right">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  isAuthorized
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}>
                  {isAuthorized ? (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      Authorized & Sealed
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
                      Preliminary Draft
                    </>
                  )}
                </span>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  Order: <strong className="text-slate-800">{order?.order_number}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Patient & Encounter Details Box */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6 text-xs">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Patient Name</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {patient?.first_name} {patient?.last_name}
              </p>
              <p className="text-[11px] text-slate-500 font-mono">ID: {patient?.patient_number}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Demographics</p>
              <p className="text-slate-800 font-medium mt-0.5 capitalize">
                {patient?.gender || 'N/A'}
                {patient?.date_of_birth && ` • ${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()} Yrs`}
              </p>
              <p className="text-[11px] text-slate-500">{patient?.phone || 'No phone'}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ordering Doctor</p>
              <p className="text-slate-900 font-bold mt-0.5">
                {order?.doctor_name ? `Dr. ${order.doctor_name}` : 'Attending Dentist'}
              </p>
              <p className="text-[11px] text-slate-500">
                Priority: <span className="font-semibold uppercase text-indigo-700">{order?.priority}</span>
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Date & Visit</p>
              <p className="text-slate-800 font-medium mt-0.5">
                {order?.order_date ? new Date(order.order_date).toLocaleDateString() : '---'}
              </p>
              <p className="text-[11px] text-slate-500">
                Token: <strong className="text-slate-700">#{order?.token_display || '---'}</strong>
              </p>
            </div>
          </div>

          {/* Clinical Indication */}
          {order?.clinical_indication && (
            <div className="mb-6 px-4 py-2.5 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs">
              <span className="font-bold text-indigo-950 uppercase tracking-wider text-[10px] block mb-0.5">
                Clinical Indication / Reason:
              </span>
              <p className="text-slate-700 italic">"{order.clinical_indication}"</p>
            </div>
          )}

          {/* Investigations & Findings */}
          <div className="space-y-6 mb-8">
            {items.map((item, idx) => {
              const res = item.result;
              const hasNumericData = res && Array.isArray(res.results_data?.parameters) && res.results_data.parameters.length > 0;
              const hasStructuredData = res && typeof res.results_data === 'object' && !Array.isArray(res.results_data) && Object.keys(res.results_data).length > 0;

              return (
                <div key={item.id} className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  {/* Investigation Header */}
                  <div className="px-4 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-700">
                          {item.investigation_code}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">
                          {item.investigation_name}
                        </h3>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {item.category?.replace('_', ' ')}
                        </span>
                      </div>
                      {item.specimen_type && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Specimen: <strong className="text-slate-700">{item.specimen_type}</strong>
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.status === 'completed' || item.status === 'authorized'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'result_entered'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Results Body */}
                  <div className="p-4 bg-white text-xs">
                    {res ? (
                      <div>
                        {/* Abnormal / Critical Banner */}
                        {(res.critical_flag || res.abnormal_flag) && (
                          <div className={`mb-3 px-3 py-2 rounded-lg flex items-center space-x-2 border ${
                            res.critical_flag
                              ? 'bg-rose-50 border-rose-300 text-rose-800'
                              : 'bg-amber-50 border-amber-300 text-amber-800'
                          }`}>
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span className="font-bold">
                              {res.critical_flag ? 'CRITICAL VALUE ALERT' : 'ABNORMAL VALUE NOTED'}:
                            </span>
                            <span>Findings require immediate clinical review.</span>
                          </div>
                        )}

                        {/* Structured / Numeric Parameter Table */}
                        {hasNumericData ? (
                          <table className="w-full text-left mb-3">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                              <tr>
                                <th className="py-2 px-3">Test Parameter</th>
                                <th className="py-2 px-3">Observed Value</th>
                                <th className="py-2 px-3">Unit</th>
                                <th className="py-2 px-3">Reference Range</th>
                                <th className="py-2 px-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {res.results_data.parameters.map((param, pIdx) => {
                                const isOut = param.is_abnormal || (param.min !== undefined && param.max !== undefined && (parseFloat(param.value) < param.min || parseFloat(param.value) > param.max));
                                return (
                                  <tr key={pIdx} className={isOut ? 'bg-amber-50/50' : ''}>
                                    <td className="py-2 px-3 font-semibold text-slate-800">
                                      {param.parameter || param.name}
                                    </td>
                                    <td className={`py-2 px-3 font-mono font-bold ${isOut ? 'text-rose-700' : 'text-slate-900'}`}>
                                      {param.value}
                                    </td>
                                    <td className="py-2 px-3 text-slate-500 font-mono">
                                      {param.unit || '---'}
                                    </td>
                                    <td className="py-2 px-3 text-slate-600 font-mono">
                                      {param.min !== undefined && param.max !== undefined
                                        ? `${param.min} - ${param.max}`
                                        : param.normal || 'Normal'}
                                    </td>
                                    <td className="py-2 px-3">
                                      {isOut ? (
                                        <span className="text-[10px] font-bold uppercase text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                                          Abnormal
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-semibold text-emerald-700">
                                          Normal
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : hasStructuredData ? (
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            {Object.entries(res.results_data).map(([key, val]) => (
                              <div key={key} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                                  {key.replace(/_/g, ' ')}
                                </span>
                                <span className="text-xs font-semibold text-slate-800 mt-0.5 block">
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {/* Observations / Diagnostic Impression */}
                        {res.observations && (
                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                              Radiological / Laboratory Impression:
                            </span>
                            <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{res.observations}</p>
                          </div>
                        )}

                        {/* Sign-Off Metadata */}
                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <div>
                            Recorded by:{' '}
                            <strong className="text-slate-700">
                              {res.recorded_by_name || 'Lab Technician'}
                            </strong>{' '}
                            on {new Date(res.recorded_at).toLocaleString()}
                          </div>

                          {res.authorized_by_name && (
                            <div className="text-emerald-700 font-semibold flex items-center">
                              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                              Authorized by Dr. {res.authorized_by_name} ({new Date(res.authorized_at).toLocaleDateString()})
                            </div>
                          )}
                        </div>

                        {/* Legal Amendments History */}
                        {item.amendments && item.amendments.length > 0 && (
                          <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs">
                            <span className="font-bold text-amber-900 uppercase text-[10px] block mb-1">
                              Record Amendments ({item.amendments.length}):
                            </span>
                            <ul className="space-y-1 text-slate-700">
                              {item.amendments.map((am) => (
                                <li key={am.id} className="text-[11px]">
                                  • <strong className="text-slate-800">Amended by Dr. {am.amended_by_name}</strong> on{' '}
                                  {new Date(am.amended_at).toLocaleString()}: <em>"{am.reason}"</em>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-400 italic">
                        Results are currently pending processing by the diagnostics team.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Signatures */}
          <div className="pt-8 border-t-2 border-slate-200 grid grid-cols-2 gap-8 text-xs text-slate-600">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-8">
                Processed By (Laboratory Staff)
              </p>
              <div className="w-48 border-b border-slate-400 pb-1 font-semibold text-slate-800">
                Authorized Lab Technician
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Laboratory & Diagnostic Services</p>
            </div>

            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-8">
                Reviewed & Authorized By (Practitioner)
              </p>
              <div className="inline-block text-left w-56 border-b border-slate-400 pb-1 font-semibold text-slate-800">
                {items[0]?.result?.authorized_by_name
                  ? `Dr. ${items[0].result.authorized_by_name}`
                  : 'Licensed Dental Practitioner'}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {isAuthorized ? 'Digitally Verified & Sealed' : 'Pending Formal Sign-Off'}
              </p>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 pt-4 border-t border-slate-100 text-[10px] text-slate-400 text-center leading-normal">
            This diagnostic report is electronically verified and intended solely for clinical dental practice and patient diagnosis.
            For questions or verification, contact {clinic?.name || 'VoiceGate Dental Clinic'}.
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableInvestigationReportModal;

