import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { appointmentService } from '../../services/appointmentService';
import investigationService from '../../services/investigationService';
import { toast } from 'react-toastify';
import {
  IndianRupee,
  CreditCard,
  QrCode,
  Banknote,
  Receipt,
  CheckCircle2,
  Activity,
  AlertCircle,
  FlaskConical,
} from 'lucide-react';

export const PaymentCollectionModal = ({
  isOpen,
  onClose,
  appointment,
  onPaymentSuccess,
}) => {
  const [discountAmount, setDiscountAmount] = useState(0);
  const [payingAmount, setPayingAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingSummary, setBillingSummary] = useState(null);

  useEffect(() => {
    if (appointment && isOpen) {
      const gross = parseFloat(appointment.consultation_fee || appointment.fee_amount || 0);
      const paid = parseFloat(appointment.amount_paid || 0);
      const outstanding = Math.max(0, gross - paid);
      setPayingAmount(outstanding);
      setDiscountAmount(0);
      setPaymentMethod('cash');
      setTransactionRef('');
      setNotes('');
    }
  }, [appointment, isOpen]);

  if (!isOpen || !appointment) return null;

  const grossFee = parseFloat(appointment.consultation_fee || appointment.fee_amount || 0);
  const alreadyPaid = parseFloat(appointment.amount_paid || 0);
  const initialOutstanding = Math.max(0, grossFee - alreadyPaid);

  const discountNum = Math.max(0, parseFloat(discountAmount) || 0);
  const payingNum = Math.max(0, parseFloat(payingAmount) || 0);
  const netPayable = Math.max(0, grossFee - discountNum);
  const remainingAfterPayment = Math.max(0, parseFloat((netPayable - (alreadyPaid + payingNum)).toFixed(2)));

  const handlePayFull = () => {
    setPayingAmount(Math.max(0, netPayable - alreadyPaid));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (payingNum <= 0) {
      toast.warn('Please enter a payment amount greater than zero.');
      return;
    }

    if (alreadyPaid >= netPayable || initialOutstanding <= 0) {
      toast.warn('Consultation fee for this appointment is already fully paid.');
      return;
    }

    if (alreadyPaid + payingNum > netPayable) {
      toast.warn('Amount paid cannot exceed net billable consultation fee.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        gross_amount: grossFee,
        discount_amount: discountNum,
        amount_paid: payingNum,
        payment_method: paymentMethod,
        transaction_reference: transactionRef.trim() || null,
        notes: notes.trim() || null,
      };

      const res = await appointmentService.recordPayment(appointment.id, payload);
      toast.success(`Payment of ₹${payingNum.toFixed(2)} recorded! Receipt #${res.receipt?.receipt_number}`);
      if (onPaymentSuccess) {
        onPaymentSuccess(res.receipt);
      }
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Payment collection failed.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Collect Consultation Fee"
      subtitle={`Appointment #${appointment.appointment_number} — ${appointment.patient_first_name} ${appointment.patient_last_name}`}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bill Summary Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 divide-y divide-slate-200 text-xs">
          <div className="pb-2.5 flex items-center justify-between text-slate-700">
            <span>Doctor:</span>
            <span className="font-semibold text-slate-900">
              Dr. {appointment.doctor_first_name} {appointment.doctor_last_name}
            </span>
          </div>

          <div className="py-2.5 grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Gross Fee</span>
              <span className="text-xs font-bold text-slate-800">₹{grossFee.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Already Paid</span>
              <span className="text-xs font-semibold text-emerald-600">₹{alreadyPaid.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Outstanding</span>
              <span className="text-xs font-bold text-rose-600">₹{initialOutstanding.toFixed(2)}</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between font-medium">
            <span className="text-slate-600">Net Consultation Fee:</span>
            <span className="text-sm font-bold text-slate-900">₹{netPayable.toFixed(2)}</span>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Discount (₹)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Amount Paying (₹) *</label>
              <button
                type="button"
                onClick={handlePayFull}
                className="text-[10px] text-teal-700 font-bold hover:underline"
              >
                Pay Full
              </button>
            </div>
            <input
              type="number"
              min="1"
              step="0.01"
              value={payingAmount}
              onChange={(e) => setPayingAmount(e.target.value)}
              className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 font-bold text-slate-900 focus:border-teal-500 focus:ring-teal-500"
              required
            />
          </div>
        </div>

        {/* Payment Method Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Payment Method *
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'cash', label: 'Cash', icon: Banknote },
              { id: 'upi', label: 'UPI / QR', icon: QrCode },
              { id: 'card', label: 'Debit/Credit', icon: CreditCard },
              { id: 'bank_transfer', label: 'Bank Transfer', icon: Receipt },
            ].map((m) => {
              const Icon = m.icon;
              const isSelected = paymentMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-2 rounded-lg border text-center transition flex flex-col items-center justify-center space-y-1 ${
                    isSelected
                      ? 'border-teal-600 bg-teal-50 text-teal-800 ring-1 ring-teal-600 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[11px] leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Transaction Reference (if UPI/Card/Bank) */}
        {paymentMethod !== 'cash' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Transaction / Reference Number
            </label>
            <input
              type="text"
              placeholder="e.g. UPI Ref / Card Last 4 / Auth Code"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              className="w-full text-xs rounded-md border-slate-300 py-1.5 px-2.5 focus:border-teal-500 focus:ring-teal-500"
            />
          </div>
        )}

        {/* Real-time Remaining Balance Bar */}
        <div className="bg-slate-900 text-white rounded-lg p-3 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
              Remaining Balance After Payment
            </span>
            <span className={`text-base font-bold ${remainingAfterPayment === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              ₹{remainingAfterPayment.toFixed(2)}
            </span>
          </div>

          <div className="text-right">
            {remainingAfterPayment === 0 ? (
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full font-semibold">
                Fully Settled
              </span>
            ) : (
              <span className="text-xs bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-full font-semibold">
                Partial Payment
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || payingNum <= 0}
            className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold transition disabled:opacity-50 flex items-center space-x-1.5"
          >
            {isSubmitting ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Recording...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Collect ₹{payingNum.toFixed(2)} & Issue Receipt</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
