/**
 * Migration 007: Consultation Payments, Receipts, and Balances
 *
 * Implements:
 * 1. appointment_payments: Transactions, partial balances, discounts, and printable receipt generation
 * 2. Indexes and constraints ensuring exact decimal precision and auditability
 */

module.exports = {
  version: '007',
  name: '007_consultation_billing_and_receipts',

  async up(client) {
    console.log('[Migration 007] Executing Consultation Billing & Receipts schema changes...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS appointment_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        receipt_number VARCHAR(50) NOT NULL,
        amount_paid NUMERIC(10,2) NOT NULL CHECK (amount_paid >= 0),
        gross_amount NUMERIC(10,2) NOT NULL CHECK (gross_amount >= 0),
        discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
        discount_reason TEXT,
        remaining_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (remaining_balance >= 0),
        payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other')),
        payment_reference VARCHAR(100),
        payment_status VARCHAR(30) NOT NULL DEFAULT 'completed' CHECK (payment_status IN ('completed', 'reversed', 'refunded')),
        notes TEXT,
        received_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_receipt_number UNIQUE (clinic_id, receipt_number)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointment_payments_lookup 
        ON appointment_payments(clinic_id, branch_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_appointment_payments_patient 
        ON appointment_payments(patient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_appointment_payments_appt 
        ON appointment_payments(appointment_id);
      CREATE INDEX IF NOT EXISTS idx_appointment_payments_receipt 
        ON appointment_payments(clinic_id, receipt_number);
    `);

    console.log('[Migration 007] Successfully applied Consultation Billing and Receipts schema changes.');
  },
};
