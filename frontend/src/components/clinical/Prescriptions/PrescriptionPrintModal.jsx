import React, { useRef } from 'react';
import { X, Printer, ShieldCheck, AlertTriangle, Pill } from 'lucide-react';

export const PrescriptionPrintModal = ({ isOpen, onClose, printData }) => {
  const printContentRef = useRef(null);

  if (!isOpen || !printData) return null;

  const { clinic, doctor, patient, prescription, items } = printData;

  const handlePrint = () => {
    window.print();
  };

  // Calculate age if DOB present
  let age = 'N/A';
  if (patient?.dateOfBirth) {
    const dob = new Date(patient.dateOfBirth);
    const diff = Date.now() - dob.getTime();
    age = Math.abs(new Date(diff).getUTCFullYear() - 1970) + ' yrs';
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      {/* Print-specific style tag injected for browser print dialog */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #prescription-print-document, #prescription-print-document * {
            visibility: visible;
          }
          #prescription-print-document {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Top Control Bar (Hidden on print) */}
        <div className="no-print p-4 bg-slate-800 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <Printer className="w-5 h-5 text-teal-400" />
            <span className="font-bold text-sm tracking-wide">
              Official Prescription Print Preview — {prescription?.prescriptionNumber}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-lg transition shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save as PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Prescription Body */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50 flex justify-center">
          <div
            id="prescription-print-document"
            ref={printContentRef}
            className="bg-white w-full max-w-3xl p-8 rounded-xl border border-slate-200 shadow-sm text-slate-800 text-xs font-sans space-y-6"
          >
            {/* Header: Clinic Branding & Location */}
            <div className="flex items-start justify-between border-b-2 border-teal-600 pb-5">
              <div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-lg font-serif">
                    Rx
                  </div>
                  <div>
                    <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                      {clinic?.name || 'VoiceGate Dental Clinic'}
                    </h1>
                    <p className="text-xs text-teal-700 font-semibold">
                      {clinic?.branchName} ({clinic?.branchCode})
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 max-w-md">
                  {clinic?.address || 'Main Clinic Facility'}
                  {clinic?.phone ? ` • Tel: ${clinic.phone}` : ''}
                </p>
              </div>

              <div className="text-right">
                <div className="inline-block bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg text-right">
                  <span className="block text-[10px] uppercase font-bold text-teal-800 tracking-wider">
                    Prescription ID
                  </span>
                  <span className="text-base font-extrabold font-mono text-teal-900">
                    {prescription?.prescriptionNumber}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 font-medium">
                  Date: {prescription?.prescriptionDate ? new Date(prescription.prescriptionDate).toLocaleDateString() : 'Today'}
                </p>
                {prescription?.visitToken && (
                  <p className="text-[10px] text-indigo-700 font-mono font-bold">
                    Visit Token: #{prescription.visitToken}
                  </p>
                )}
              </div>
            </div>

            {/* Doctor & Patient Information Band */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200/80 text-[11px]">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">
                  Patient Details
                </span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  {patient?.name}
                </p>
                <div className="text-slate-600 space-y-0.5 mt-1 font-medium">
                  <p>
                    Patient ID:{' '}
                    <strong className="text-slate-800 font-mono">
                      #{patient?.patientNumber}
                    </strong>
                    {' '}• Age: {age} • Gender: <span className="capitalize">{patient?.gender || 'Unspecified'}</span>
                  </p>
                  {patient?.phone && <p>Contact: {patient.phone}</p>}
                </div>
              </div>

              <div className="border-l border-slate-200 pl-4">
                <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">
                  Prescribing Practitioner
                </span>
                <p className="text-sm font-bold text-teal-950 mt-0.5">
                  {doctor?.signedDoctorName || doctor?.name || 'Authorized Dentist'}
                </p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Department of Dental Surgery & Oral Health
                </p>
                {doctor?.email && (
                  <p className="text-slate-400 text-[10px] mt-0.5">{doctor.email}</p>
                )}
              </div>
            </div>

            {/* Clinical Diagnosis / Indication */}
            {prescription?.diagnosis && (
              <div className="bg-white border-l-4 border-teal-500 pl-3 py-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Clinical Indication / Diagnosis
                </span>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">
                  {prescription.diagnosis}
                </p>
              </div>
            )}

            {/* Medical Safety Disclaimer / Patient Allergies Note */}
            <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start space-x-2 text-[11px] text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Recorded Allergies & Clinical Alerts: </strong>
                <span>{patient?.allergies || 'No known allergies reported (verified)'}</span>
              </div>
            </div>

            {/* Medications Table (Rx Symbol) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center space-x-2 border-b border-slate-300 pb-1.5">
                <span className="text-xl font-serif font-black text-teal-800 italic">
                  ℞
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Prescribed Medications ({items?.length || 0})
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider bg-slate-50">
                      <th className="py-2 px-2.5 w-8">#</th>
                      <th className="py-2 px-2.5">Medication & Strength</th>
                      <th className="py-2 px-2.5">Form / Route</th>
                      <th className="py-2 px-2.5">Dosage / Frequency</th>
                      <th className="py-2 px-2.5">Duration</th>
                      <th className="py-2 px-2.5 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items && items.length > 0 ? (
                      items.map((item, idx) => (
                        <tr key={item.id || idx} className="align-top">
                          <td className="py-2.5 px-2.5 font-bold text-slate-400">
                            {idx + 1}.
                          </td>
                          <td className="py-2.5 px-2.5">
                            <span className="font-bold text-slate-900 block text-xs">
                              {item.medicineName}
                            </span>
                            {item.genericName && (
                              <span className="text-[10px] text-slate-500 block italic">
                                ({item.genericName})
                              </span>
                            )}
                            {item.instructions && (
                              <span className="text-[11px] text-teal-800 font-medium block mt-1 bg-teal-50/70 p-1 rounded">
                                Directions: {item.instructions}
                              </span>
                            )}
                            {item.isPrn && (
                              <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                PRN (As Needed): {item.prnIndication || 'Take when required'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 capitalize text-slate-600">
                            <span>{item.dosageForm}</span>
                            <span className="block text-[10px] text-slate-400">
                              {item.route}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5">
                            <span className="font-bold text-slate-800 block">
                              {item.dosage}
                            </span>
                            <span className="text-slate-600 text-[11px] block">
                              {item.frequency}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 font-semibold text-slate-700">
                            {item.duration}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-bold text-slate-900">
                            {item.quantity} {item.quantityUnit}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="py-6 text-center text-slate-400">
                          No medication items recorded in this prescription.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* General Instructions & Dietary Advice */}
            {(prescription?.generalInstructions || prescription?.dietaryAdvice) && (
              <div className="bg-slate-50/80 p-3.5 rounded-lg border border-slate-200/80 space-y-2 text-[11px]">
                {prescription?.generalInstructions && (
                  <div>
                    <strong className="text-slate-700 block font-bold">
                      General Instructions:
                    </strong>
                    <p className="text-slate-600 mt-0.5 whitespace-pre-line">
                      {prescription.generalInstructions}
                    </p>
                  </div>
                )}
                {prescription?.dietaryAdvice && (
                  <div className="pt-1 border-t border-slate-200/60">
                    <strong className="text-slate-700 block font-bold">
                      Dietary & Post-Treatment Advice:
                    </strong>
                    <p className="text-slate-600 mt-0.5">
                      {prescription.dietaryAdvice}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Footer & Signature Section */}
            <div className="pt-8 border-t border-slate-200 flex items-end justify-between">
              <div className="text-[10px] text-slate-400 max-w-sm space-y-1">
                <p>
                  • Please present this prescription to your licensed pharmacist.
                </p>
                <p>
                  • For inquiries or adverse reactions, contact the clinic immediately.
                </p>
                <p className="font-mono text-[9px] text-slate-300">
                  Generated by VoiceGate Dental ERP • System Record Hash: {prescription?.id?.slice(0, 16)}
                </p>
              </div>

              <div className="text-right">
                {prescription?.isSigned ? (
                  <div className="space-y-1">
                    <div className="inline-flex items-center space-x-1 text-emerald-700 font-bold text-[11px] bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Digitally Signed & Certified</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 mt-2">
                      {doctor?.signedDoctorName || doctor?.name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Signed: {prescription?.signedAt ? new Date(prescription.signedAt).toLocaleString() : 'Recorded'}
                    </p>
                  </div>
                ) : (
                  <div className="w-48 text-center pt-8 border-t border-slate-400">
                    <p className="text-xs font-bold text-slate-800">
                      Dr. {doctor?.name || 'Practitioner'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Dentist Signature
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionPrintModal;
