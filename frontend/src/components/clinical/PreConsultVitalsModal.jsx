import React, { useState, useEffect, useMemo } from 'react';
import {
  HeartPulse,
  Activity,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import clinicalService from '../../services/clinicalService';

export const PreConsultVitalsModal = ({
  isOpen,
  onClose,
  appointment,
  visit,
  onSuccess,
}) => {
  const visitId = visit?.id || appointment?.visit_id;
  const patientId = appointment?.patient_id || visit?.patient_id;
  const appointmentId = appointment?.id || visit?.appointment_id;

  const [formData, setFormData] = useState({
    blood_pressure: '',
    pulse_bpm: '',
    temperature_f: '',
    spo2_percent: '',
    respiratory_rate: '',
    weight_kg: '',
    height_cm: '',
    triage_priority: 'routine',
    triage_notes: '',
  });

  const [existingVitalsList, setExistingVitalsList] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-calculate BMI
  const calculatedBmi = useMemo(() => {
    const weight = parseFloat(formData.weight_kg);
    const height = parseFloat(formData.height_cm);
    if (weight > 0 && height > 0) {
      const heightM = height / 100;
      return (weight / (heightM * heightM)).toFixed(1);
    }
    return '';
  }, [formData.weight_kg, formData.height_cm]);

  // BMI Category
  const bmiCategory = useMemo(() => {
    const bmi = parseFloat(calculatedBmi);
    if (!bmi) return null;
    if (bmi < 18.5) return { label: 'Underweight', color: 'text-amber-600 bg-amber-50 border-amber-200' };
    if (bmi < 25) return { label: 'Normal', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
    if (bmi < 30) return { label: 'Overweight', color: 'text-amber-600 bg-amber-50 border-amber-200' };
    return { label: 'Obese', color: 'text-rose-600 bg-rose-50 border-rose-200' };
  }, [calculatedBmi]);

  // Load vitals history for this visit
  useEffect(() => {
    if (isOpen && visitId) {
      setIsLoadingHistory(true);
      clinicalService
        .getVisitVitals(visitId)
        .then((res) => {
          const list = res.vitals || [];
          setExistingVitalsList(list);
          if (list.length > 0) {
            const latest = list[0];
            setFormData({
              blood_pressure: latest.blood_pressure || '',
              pulse_bpm: latest.pulse_bpm || '',
              temperature_f: latest.temperature_f || '',
              spo2_percent: latest.spo2_percent || '',
              respiratory_rate: latest.respiratory_rate || '',
              weight_kg: latest.weight_kg || '',
              height_cm: latest.height_cm || '',
              triage_priority: latest.triage_priority || 'routine',
              triage_notes: latest.triage_notes || '',
            });
          } else {
            setFormData({
              blood_pressure: '',
              pulse_bpm: '',
              temperature_f: '',
              spo2_percent: '',
              respiratory_rate: '',
              weight_kg: '',
              height_cm: '',
              triage_priority: 'routine',
              triage_notes: '',
            });
          }
        })
        .catch(() => setExistingVitalsList([]))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [isOpen, visitId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!visitId) {
      toast.error('No active visit encounter found. Please ensure the patient is checked in.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        visit_id: visitId,
        patient_id: patientId,
        appointment_id: appointmentId,
        blood_pressure: formData.blood_pressure.trim() || null,
        pulse_bpm: formData.pulse_bpm ? parseInt(formData.pulse_bpm, 10) : null,
        temperature_f: formData.temperature_f ? parseFloat(formData.temperature_f) : null,
        spo2_percent: formData.spo2_percent ? parseInt(formData.spo2_percent, 10) : null,
        respiratory_rate: formData.respiratory_rate ? parseInt(formData.respiratory_rate, 10) : null,
        weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
        height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
        bmi: calculatedBmi ? parseFloat(calculatedBmi) : null,
        triage_priority: formData.triage_priority,
        triage_notes: formData.triage_notes.trim() || null,
      };

      const res = await clinicalService.recordVisitVitals(payload);
      toast.success('Pre-consultation vitals and triage assessment saved.');
      if (onSuccess) onSuccess(res.vitals);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to record vitals.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const patientName = appointment
    ? `${appointment.patient_first_name || ''} ${appointment.patient_last_name || ''}`.trim()
    : 'Patient';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-rose-50/50 via-teal-50/30 to-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Pre-Consultation Vitals & Triage
                </h3>
                {appointment?.visit_token_display && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                    Token #{appointment.visit_token_display}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Patient: <strong className="text-slate-800">{patientName}</strong>
                {appointment?.patient_number && ` (#${appointment.patient_number})`}
                {appointment?.doctor_first_name && (
                  <span className="ml-2">
                    | Doctor: <span className="text-slate-700">Dr. {appointment.doctor_first_name} {appointment.doctor_last_name}</span>
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Triage Priority Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Triage Priority Assessment <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {/* Routine */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, triage_priority: 'routine' })}
                className={`p-3 rounded-xl border text-left transition flex flex-col items-start ${
                  formData.triage_priority === 'routine'
                    ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      formData.triage_priority === 'routine' ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                  <span
                    className={`text-xs font-bold ${
                      formData.triage_priority === 'routine' ? 'text-emerald-900' : 'text-slate-700'
                    }`}
                  >
                    Routine
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 leading-tight">
                  Standard consultation, stable vitals, no acute distress
                </span>
              </button>

              {/* Priority */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, triage_priority: 'priority' })}
                className={`p-3 rounded-xl border text-left transition flex flex-col items-start ${
                  formData.triage_priority === 'priority'
                    ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20 shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <AlertTriangle
                    className={`w-4 h-4 ${
                      formData.triage_priority === 'priority' ? 'text-amber-600' : 'text-slate-400'
                    }`}
                  />
                  <span
                    className={`text-xs font-bold ${
                      formData.triage_priority === 'priority' ? 'text-amber-900' : 'text-slate-700'
                    }`}
                  >
                    Priority
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 leading-tight">
                  Moderate pain, localized swelling, needs expedited review
                </span>
              </button>

              {/* Urgent */}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, triage_priority: 'urgent' })}
                className={`p-3 rounded-xl border text-left transition flex flex-col items-start ${
                  formData.triage_priority === 'urgent'
                    ? 'border-rose-500 bg-rose-50/70 ring-2 ring-rose-500/20 shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-1.5 mb-1">
                  <Activity
                    className={`w-4 h-4 ${
                      formData.triage_priority === 'urgent' ? 'text-rose-600 animate-pulse' : 'text-slate-400'
                    }`}
                  />
                  <span
                    className={`text-xs font-bold ${
                      formData.triage_priority === 'urgent' ? 'text-rose-900' : 'text-slate-700'
                    }`}
                  >
                    Urgent
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 leading-tight">
                  Severe trauma, bleeding, acute cellulitis, fever, immediate doctor
                </span>
              </button>
            </div>
          </div>

          {/* Vitals Form Grid */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
              <Activity className="w-4 h-4 text-rose-500" />
              <span>Vital Signs Measurements</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* Blood Pressure */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Blood Pressure (mmHg)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 120/80"
                  value={formData.blood_pressure}
                  onChange={(e) => setFormData({ ...formData, blood_pressure: e.target.value })}
                  className="w-full text-xs rounded-lg border-slate-300 py-2 px-3 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>

              {/* Pulse */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Pulse (bpm)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 72"
                  value={formData.pulse_bpm}
                  onChange={(e) => setFormData({ ...formData, pulse_bpm: e.target.value })}
                  className="w-full text-xs rounded-lg border-slate-300 py-2 px-3 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>

              {/* Temperature */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Temperature (°F)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 98.6"
                  value={formData.temperature_f}
                  onChange={(e) => setFormData({ ...formData, temperature_f: e.target.value })}
                  className="w-full text-xs rounded-lg border-slate-300 py-2 px-3 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>

              {/* SpO2 */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  SpO2 (%)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 98"
                  value={formData.spo2_percent}
                  onChange={(e) => setFormData({ ...formData, spo2_percent: e.target.value })}
                  className="w-full text-xs rounded-lg border-slate-300 py-2 px-3 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>

              {/* Respiratory Rate */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Resp. Rate (/min)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 16"
                  value={formData.respiratory_rate}
                  onChange={(e) => setFormData({ ...formData, respiratory_rate: e.target.value })}
                  className="w-full text-xs rounded-lg border-slate-300 py-2 px-3 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Height, Weight & Calculated BMI */}
            <div className="pt-2 border-t border-slate-200/80">
              <span className="block text-[11px] font-bold text-slate-700 mb-2">
                Anthropometric & Body Mass Index
              </span>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 170"
                    value={formData.height_cm}
                    onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                    className="w-full text-xs rounded-lg border-slate-300 py-2 px-3 focus:border-teal-500 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 68"
                    value={formData.weight_kg}
                    onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                    className="w-full text-xs rounded-lg border-slate-300 py-2 px-3 focus:border-teal-500 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    BMI (kg/m²)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      placeholder="Auto"
                      value={calculatedBmi}
                      className="w-full text-xs rounded-lg bg-slate-100 border-slate-300 py-2 px-3 font-semibold text-slate-800"
                    />
                    {bmiCategory && (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md border shrink-0 ${bmiCategory.color}`}>
                        {bmiCategory.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Triage Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Triage & Nursing Assessment Notes
            </label>
            <textarea
              rows={3}
              placeholder="Record chief complaint details, duration, allergies reported, pain intensity (e.g. 7/10), or any acute observations..."
              value={formData.triage_notes}
              onChange={(e) => setFormData({ ...formData, triage_notes: e.target.value })}
              className="w-full text-xs rounded-lg border-slate-300 p-2.5 focus:border-teal-500 focus:ring-teal-500"
            />
          </div>

          {/* Vitals History if already recorded */}
          {existingVitalsList.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <span className="block text-[11px] font-bold text-slate-700 mb-2">
                Previous Vitals Recorded This Encounter ({existingVitalsList.length})
              </span>
              <div className="space-y-2">
                {existingVitalsList.map((v) => (
                  <div key={v.id} className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            v.triage_priority === 'urgent'
                              ? 'bg-rose-100 text-rose-800'
                              : v.triage_priority === 'priority'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {v.triage_priority}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          by {v.recorded_by_first_name} {v.recorded_by_last_name} ({v.recorded_by_role})
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(v.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                      {v.blood_pressure && <span>BP: <strong>{v.blood_pressure}</strong></span>}
                      {v.pulse_bpm && <span>Pulse: <strong>{v.pulse_bpm} bpm</strong></span>}
                      {v.temperature_f && <span>Temp: <strong>{v.temperature_f} °F</strong></span>}
                      {v.spo2_percent && <span>SpO2: <strong>{v.spo2_percent}%</strong></span>}
                      {v.bmi && <span>BMI: <strong>{v.bmi}</strong></span>}
                    </div>
                    {v.triage_notes && (
                      <p className="text-[11px] text-slate-500 italic mt-1 bg-slate-50 p-1.5 rounded">
                        "{v.triage_notes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !visitId}
            className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition shadow-2xs flex items-center space-x-1.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Activity className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Vitals...</span>
              </>
            ) : (
              <>
                <HeartPulse className="w-3.5 h-3.5" />
                <span>Save Vitals & Triage</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreConsultVitalsModal;
