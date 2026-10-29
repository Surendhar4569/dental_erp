/**
 * Migration 022: Laboratory, Diagnostics, Investigation Management & Central Billing Integration
 *
 * Implements:
 * 1. investigation_catalogue: Clinic-scoped investigation master with pricing, specimen requirements, reference ranges
 * 2. investigation_orders: Doctor orders linked to visit, patient, branch, with clinic-unique order numbers (INV-10001+)
 * 3. investigation_order_items: Line items with snapshot of code, name, and unit price
 * 4. investigation_status_history: Audit trail of all workflow lifecycle transitions
 * 5. investigation_results: Structured and text findings, abnormal/critical flags, practitioner authorization
 * 6. investigation_result_amendments: Immutable audit trail for authorized result amendments
 * 7. investigation_attachments: Uploaded lab documents and reports with security metadata
 * 8. billing_charges: Central Billing extension holding billable charges with unique constraints preventing duplicate billing
 * 9. appointment_payments: Additive columns linking payments to visits, charges, and orders
 * 10. Seed standard dental investigations for existing clinics
 */

module.exports = {
  version: '022',
  name: '022_investigation_management_and_central_billing',

  async up(client) {
    console.log('[Migration 022] Applying Phase 6: Investigation Management & Central Billing schema...');

    // 1. Investigation Catalogue
    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_catalogue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL CHECK (category IN ('laboratory', 'radiology', 'diagnostic', 'dental_investigation', 'external_lab', 'other')),
        description TEXT,
        sample_required BOOLEAN NOT NULL DEFAULT false,
        specimen_type VARCHAR(100),
        preparation_instructions TEXT,
        price NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
        turnaround_time_hours INT DEFAULT 24,
        reference_ranges JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_investigation_code UNIQUE (clinic_id, code)
      );

      CREATE INDEX IF NOT EXISTS idx_investigation_catalogue_lookup
        ON investigation_catalogue (clinic_id, category, is_active);
      CREATE INDEX IF NOT EXISTS idx_investigation_catalogue_code
        ON investigation_catalogue (clinic_id, code);
    `);

    // 2. Investigation Orders
    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        order_number VARCHAR(50) NOT NULL,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
        appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        ordered_by_doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        clinical_indication TEXT,
        priority VARCHAR(20) NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
        status VARCHAR(30) NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'sample_collected', 'in_progress', 'result_entered', 'authorized', 'completed', 'cancelled')),
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
        notes TEXT,
        cancellation_reason TEXT,
        cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_clinic_inv_order_number UNIQUE (clinic_id, order_number)
      );

      CREATE INDEX IF NOT EXISTS idx_investigation_orders_lookup
        ON investigation_orders (clinic_id, branch_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_investigation_orders_patient
        ON investigation_orders (patient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_investigation_orders_visit
        ON investigation_orders (visit_id);
    `);

    // 3. Investigation Order Items
    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES investigation_orders(id) ON DELETE CASCADE,
        investigation_id UUID REFERENCES investigation_catalogue(id) ON DELETE RESTRICT,
        investigation_code VARCHAR(50) NOT NULL,
        investigation_name VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        specimen_type VARCHAR(100),
        unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
        quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
        total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
        sample_required BOOLEAN NOT NULL DEFAULT false,
        sample_collected_at TIMESTAMPTZ,
        sample_collected_by UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'sample_collected', 'in_progress', 'result_entered', 'authorized', 'completed', 'cancelled')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_inv_order_items_order
        ON investigation_order_items (order_id);
      CREATE INDEX IF NOT EXISTS idx_inv_order_items_clinic_status
        ON investigation_order_items (clinic_id, status);
    `);

    // 4. Investigation Status History
    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES investigation_orders(id) ON DELETE CASCADE,
        item_id UUID REFERENCES investigation_order_items(id) ON DELETE CASCADE,
        from_status VARCHAR(30),
        to_status VARCHAR(30) NOT NULL,
        notes TEXT,
        changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_inv_status_history_order
        ON investigation_status_history (order_id, created_at ASC);
    `);

    // 5. Investigation Results
    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES investigation_orders(id) ON DELETE CASCADE,
        order_item_id UUID NOT NULL REFERENCES investigation_order_items(id) ON DELETE CASCADE,
        investigation_id UUID REFERENCES investigation_catalogue(id) ON DELETE RESTRICT,
        result_type VARCHAR(30) NOT NULL DEFAULT 'structured' CHECK (result_type IN ('numeric', 'text', 'qualitative', 'structured')),
        results_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        observations TEXT,
        abnormal_flag BOOLEAN NOT NULL DEFAULT false,
        critical_flag BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'authorized', 'amended')),
        recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
        authorized_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_inv_order_item_result UNIQUE (order_item_id)
      );

      CREATE INDEX IF NOT EXISTS idx_inv_results_order
        ON investigation_results (order_id);
      CREATE INDEX IF NOT EXISTS idx_inv_results_item
        ON investigation_results (order_item_id);
    `);

    // 6. Investigation Result Amendments
    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_result_amendments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        result_id UUID NOT NULL REFERENCES investigation_results(id) ON DELETE CASCADE,
        amended_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        reason TEXT NOT NULL,
        previous_data JSONB NOT NULL,
        new_data JSONB NOT NULL,
        amended_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_inv_result_amendments_result
        ON investigation_result_amendments (result_id, amended_at DESC);
    `);

    // 7. Investigation Attachments
    await client.query(`
      CREATE TABLE IF NOT EXISTS investigation_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES investigation_orders(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(100) NOT NULL,
        file_size INT NOT NULL,
        file_path TEXT NOT NULL,
        description TEXT,
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_inv_attachments_order
        ON investigation_attachments (order_id);
    `);

    // 8. Central Billing Extension: billing_charges
    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_charges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
        appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        charge_type VARCHAR(50) NOT NULL CHECK (charge_type IN ('consultation', 'investigation', 'procedure', 'other')),
        source_id UUID,
        source_reference VARCHAR(100),
        item_code VARCHAR(50),
        description VARCHAR(255) NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
        quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
        gross_amount NUMERIC(10,2) NOT NULL CHECK (gross_amount >= 0),
        discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
        net_amount NUMERIC(10,2) NOT NULL CHECK (net_amount >= 0),
        amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
        status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'cancelled', 'refunded')),
        notes TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_billing_charge_source UNIQUE (clinic_id, charge_type, source_id)
      );

      CREATE INDEX IF NOT EXISTS idx_billing_charges_patient
        ON billing_charges (patient_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_billing_charges_visit
        ON billing_charges (visit_id, status);
      CREATE INDEX IF NOT EXISTS idx_billing_charges_appointment
        ON billing_charges (appointment_id);
      CREATE INDEX IF NOT EXISTS idx_billing_charges_clinic_branch
        ON billing_charges (clinic_id, branch_id, status);
    `);

    // 9. Additive columns on appointment_payments
    await client.query(`
      ALTER TABLE appointment_payments
        ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS charge_id UUID REFERENCES billing_charges(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS investigation_order_id UUID REFERENCES investigation_orders(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_appointment_payments_visit
        ON appointment_payments (visit_id);
      CREATE INDEX IF NOT EXISTS idx_appointment_payments_charge
        ON appointment_payments (charge_id);
      CREATE INDEX IF NOT EXISTS idx_appointment_payments_inv_order
        ON appointment_payments (investigation_order_id);
    `);

    // 10. Seed standard investigation catalogue for all existing clinics
    const clinicsRes = await client.query('SELECT id FROM clinics');
    for (const c of clinicsRes.rows) {
      const standardInvestigations = [
        {
          code: 'IOPA',
          name: 'Intraoral Periapical Radiograph (IOPA)',
          category: 'radiology',
          specimen_type: null,
          sample_required: false,
          description: 'High-resolution single tooth periapical radiograph for endodontic and periodontal assessment.',
          preparation_instructions: 'Remove intraoral metallic appliances or jewelry prior to exposure.',
          price: 250.00,
          turnaround_time_hours: 1,
          reference_ranges: JSON.stringify([{ parameter: 'Impression', unit: 'Text', normal: 'Intact lamina dura, no periapical radiolucency' }]),
        },
        {
          code: 'OPG',
          name: 'Orthopantomogram (Full Mouth Panoramic X-Ray)',
          category: 'radiology',
          specimen_type: null,
          sample_required: false,
          description: 'Comprehensive 2D panoramic scanning dental X-ray of upper and lower jaws.',
          preparation_instructions: 'Remove hair pins, eyeglasses, dentures and metallic neck chains.',
          price: 800.00,
          turnaround_time_hours: 2,
          reference_ranges: JSON.stringify([{ parameter: 'Impression', unit: 'Text', normal: 'Normal alveolar bone architecture and TMJ condylar contours' }]),
        },
        {
          code: 'CBC',
          name: 'Complete Blood Count (CBC)',
          category: 'laboratory',
          specimen_type: 'Blood (EDTA)',
          sample_required: true,
          description: 'Automated full blood count including Hemoglobin, Total Leukocytes, Platelets, and Differential.',
          preparation_instructions: 'No special fasting required.',
          price: 350.00,
          turnaround_time_hours: 12,
          reference_ranges: JSON.stringify([
            { parameter: 'Hemoglobin', unit: 'g/dL', min: 13.0, max: 17.0 },
            { parameter: 'WBC (Total)', unit: 'cells/mcL', min: 4000, max: 11000 },
            { parameter: 'Platelet Count', unit: '/mcL', min: 150000, max: 450000 },
          ]),
        },
        {
          code: 'BS_RANDOM',
          name: 'Blood Glucose (Random)',
          category: 'laboratory',
          specimen_type: 'Blood (Fluoride Plasma)',
          sample_required: true,
          description: 'Rapid glucose evaluation before minor/major oral surgery.',
          preparation_instructions: 'Note time elapsed since last meal.',
          price: 150.00,
          turnaround_time_hours: 2,
          reference_ranges: JSON.stringify([
            { parameter: 'Random Blood Sugar', unit: 'mg/dL', min: 70, max: 140 },
          ]),
        },
        {
          code: 'BT_CT',
          name: 'Bleeding Time & Clotting Time (BT/CT)',
          category: 'laboratory',
          specimen_type: 'Capillary / Whole Blood',
          sample_required: true,
          description: 'Pre-extraction bleeding and coagulation screening.',
          preparation_instructions: 'Perform prior to elective surgical extractions.',
          price: 200.00,
          turnaround_time_hours: 1,
          reference_ranges: JSON.stringify([
            { parameter: 'Bleeding Time (Duke)', unit: 'minutes', min: 1, max: 5 },
            { parameter: 'Clotting Time (Lee-White)', unit: 'minutes', min: 5, max: 11 },
          ]),
        },
        {
          code: 'BIOPSY_ORAL',
          name: 'Oral Soft Tissue Histopathology Biopsy',
          category: 'external_lab',
          specimen_type: 'Tissue (Formalin 10%)',
          sample_required: true,
          description: 'Excisional or incisional biopsy specimen submitted for histopathological diagnostic reporting.',
          preparation_instructions: 'Specimen immersed immediately in 10% neutral buffered formalin container.',
          price: 1800.00,
          turnaround_time_hours: 72,
          reference_ranges: JSON.stringify([
            { parameter: 'Histopathological Diagnosis', unit: 'Text', normal: 'Benign squamous mucosa without dysplasia or malignancy' },
          ]),
        },
      ];

      for (const inv of standardInvestigations) {
        await client.query(`
          INSERT INTO investigation_catalogue (
            clinic_id, code, name, category, specimen_type, sample_required,
            description, preparation_instructions, price, turnaround_time_hours, reference_ranges, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
          ON CONFLICT (clinic_id, code) DO NOTHING
        `, [
          c.id,
          inv.code,
          inv.name,
          inv.category,
          inv.specimen_type,
          inv.sample_required,
          inv.description,
          inv.preparation_instructions,
          inv.price,
          inv.turnaround_time_hours,
          inv.reference_ranges,
        ]);
      }
    }

    console.log('[Migration 022] Migration applied successfully.');
  },

  async down(client) {
    console.log('[Migration 022] Rolling back migration 022...');
    await client.query('DROP TABLE IF EXISTS investigation_result_amendments CASCADE;');
    await client.query('DROP TABLE IF EXISTS investigation_results CASCADE;');
    await client.query('DROP TABLE IF EXISTS investigation_attachments CASCADE;');
    await client.query('DROP TABLE IF EXISTS investigation_status_history CASCADE;');
    await client.query('DROP TABLE IF EXISTS investigation_order_items CASCADE;');
    await client.query('DROP TABLE IF EXISTS investigation_orders CASCADE;');
    await client.query('DROP TABLE IF EXISTS investigation_catalogue CASCADE;');
    await client.query('DROP TABLE IF EXISTS billing_charges CASCADE;');
  },
};

