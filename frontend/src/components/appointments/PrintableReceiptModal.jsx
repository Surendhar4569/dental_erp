import React, { useRef } from 'react';
import { Modal } from '../common/Modal';
import { Printer, CheckCircle, ShieldCheck, IndianRupee, Building2 } from 'lucide-react';

export const PrintableReceiptModal = ({ isOpen, onClose, receipt }) => {
  const receiptRef = useRef(null);

  if (!isOpen || !receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  const gross = parseFloat(receipt.gross_amount || 0);
  const discount = parseFloat(receipt.discount_amount || 0);
  const paid = parseFloat(receipt.amount_paid || 0);
  const balance = parseFloat(receipt.remaining_balance || 0);

  const formattedDate = (() => {
    try {
      if (!receipt.created_at) {
        return new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      }
      const d = new Date(receipt.created_at);
      return isNaN(d.getTime())
        ? String(receipt.created_at)
        : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return String(receipt.created_at || 'Just now');
    }
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Consultation Payment Receipt"
      subtitle={`Receipt #${receipt.receipt_number}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {/* Printable Paper Canvas */}
        <div
          ref={receiptRef}
          id="printable-receipt"
          className="p-5 border border-slate-200 rounded-lg bg-white shadow-xs font-sans text-slate-800 printable-area"
        >
          {/* Header */}
          <div className="text-center pb-3 border-b border-dashed border-slate-300">
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
              {receipt.clinic_name || 'VoiceGate Dental Clinic'}
            </h2>
            <p className="text-xs font-medium text-slate-600">
              {receipt.branch_name}
            </p>
            {receipt.address_line1 && (
              <p className="text-[11px] text-slate-500">
                {receipt.address_line1}, {receipt.city} {receipt.postal_code}
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              Phone: {receipt.branch_phone || 'Clinic Reception'}
            </p>

            <div className="mt-2 inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              <span>OFFICIAL PAYMENT RECEIPT</span>
              {receipt.reprint_count > 0 && (
                <span className="text-rose-600 font-semibold ml-1">(REPRINT #{receipt.reprint_count})</span>
              )}
            </div>
          </div>

          {/* Meta Info */}
          <div className="py-3 border-b border-slate-100 text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Receipt No:</span>
              <span className="font-bold font-mono text-slate-900">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date & Time:</span>
              <span className="text-slate-700">{formattedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Appointment No:</span>
              <span className="font-semibold text-slate-800">{receipt.appointment_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Patient:</span>
              <span className="font-bold text-slate-900">
                {receipt.patient_first_name} {receipt.patient_last_name}{' '}
                <span className="text-slate-500 font-normal font-mono">(#{receipt.patient_number})</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Consulting Doctor:</span>
              <span className="font-semibold text-slate-800">
                Dr. {receipt.doctor_first_name} {receipt.doctor_last_name}
              </span>
            </div>
          </div>

          {/* Charges Breakdown */}
          <div className="py-3 border-b border-dashed border-slate-300 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Consultation Gross Fee:</span>
              <span>₹{gross.toFixed(2)}</span>
            </div>

            {discount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Discount / Concession:</span>
                <span>- ₹{discount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between font-bold text-slate-900 text-sm pt-1 border-t border-slate-100">
              <span>Amount Paid:</span>
              <span className="text-emerald-600">₹{paid.toFixed(2)}</span>
            </div>

            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Payment Mode:</span>
              <span className="uppercase font-semibold">
                {receipt.payment_method}
                {receipt.transaction_reference ? ` (${receipt.transaction_reference})` : ''}
              </span>
            </div>

            <div className="flex justify-between text-xs pt-1 font-medium">
              <span className="text-slate-500">Balance Due:</span>
              <span className={balance > 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                ₹{balance.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Footer note & cashier signature */}
          <div className="pt-3 text-[10px] text-slate-400 text-center space-y-1">
            <p>Cashier: {receipt.cashier_first_name ? `${receipt.cashier_first_name} ${receipt.cashier_last_name || ''}` : 'Front Desk'}</p>
            <p className="italic">Thank you for visiting VoiceGate Dental ERP. Get well soon!</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-medium"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold transition flex items-center space-x-1.5 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Receipt</span>
          </button>
        </div>
      </div>

      {/* Print CSS styling */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-receipt, #printable-receipt * {
            visibility: visible;
          }
          #printable-receipt {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 400px;
            margin: 0 auto;
            border: none;
            box-shadow: none;
            padding: 10px;
          }
        }
      `}</style>
    </Modal>
  );
};
