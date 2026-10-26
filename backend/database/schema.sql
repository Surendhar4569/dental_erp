-- ============================================================================
-- Dental Clinic ERP - Phase 1 Database Schema
-- Modules: Foundational Identity, Clinics, Roles, Users & Audit Trail
-- ============================================================================

-- Enable pgcrypto for UUID generation functions if not present
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Clinics Table
-- Represents dental clinic branches / headquarters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(254),
    address TEXT,
    timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Roles Table
-- Role-Based Access Control (RBAC) roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Users Table
-- Staff accounts (Dentists, Specialists, Administrators, Receptionists, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    email VARCHAR(254) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    phone VARCHAR(30),
    specialization VARCHAR(100),
    license_number VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. Branches Table (Phase 1.5 Multi-Branch Support)
-- Represents physical clinic branches under an organization
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    branch_code VARCHAR(50) NOT NULL,
    branch_name VARCHAR(200) NOT NULL,
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    phone VARCHAR(30),
    email VARCHAR(254),
    timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_clinic_branch_code UNIQUE (clinic_id, branch_code)
);

-- ----------------------------------------------------------------------------
-- 5. User Branches Table (Phase 1.5 Multi-Branch Access Mapping)
-- Maps authorized users to physical branches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT false,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_branch UNIQUE (user_id, branch_id)
);

-- ----------------------------------------------------------------------------
-- 6. Audit Logs Table
-- Immutable audit log for security, authentication, and clinical tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Indexes for High Performance Querying
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_clinic_id ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_branches_clinic_id ON branches(clinic_id);
CREATE INDEX IF NOT EXISTS idx_branches_branch_code ON branches(branch_code);
CREATE INDEX IF NOT EXISTS idx_branches_is_active ON branches(is_active);
CREATE INDEX IF NOT EXISTS idx_branches_is_default ON branches(is_default);
CREATE INDEX IF NOT EXISTS idx_user_branches_user_id ON user_branches(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branches_branch_id ON user_branches(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs(branch_id);

-- ============================================================================
-- Idempotent Seed Data (Executes safely; never creates duplicates on restart)
-- ============================================================================

-- 1. Default Main Clinic (Organization)
INSERT INTO clinics (code, name, phone, email, address, timezone)
VALUES (
    'HQ-001',
    'DentalCare Apex Clinic & Imaging Centre',
    '+91 98765 43210',
    'contact@dentalcare-apex.com',
    '101 Medical Enclave, Healthcare Boulevard, Metro City',
    'Asia/Kolkata'
)
ON CONFLICT (code) DO NOTHING;

-- 2. System Roles (Defined in ERP Specification Section 9)
INSERT INTO roles (name, display_name, description) VALUES
    ('admin', 'Clinic Administrator', 'Full clinic configuration, user administration, branch operations and audit oversight'),
    ('dentist', 'Dentist', 'Clinical examinations, dental charting, diagnoses, treatment planning and procedure records'),
    ('specialist', 'Dental Specialist', 'Specialty treatments (Endodontics, Orthodontics, Periodontics, Oral Surgery, Prosthodontics)'),
    ('radiologist', 'Dental Radiologist', 'Radiology review, 2D/3D CBCT interpretation, annotations and signed reporting'),
    ('assistant', 'Dental Assistant', 'Assigned clinical tasks, chairside assistance, and permitted documentation'),
    ('receptionist', 'Receptionist', 'Front desk registration, appointments, calendar, patient queue, and check-in'),
    ('billing', 'Billing Staff', 'Fee schedules, invoices, payments, receipts, and revenue reconciliation'),
    ('inventory', 'Inventory Manager', 'Stock management, dental materials, procurement, and supplier orders'),
    ('patient', 'Patient', 'Patient portal access to released records, appointments, and treatment estimates')
ON CONFLICT (name) DO NOTHING;

-- 3. Default Seed Users
-- Password for all seed users is formatted as: [RoleName]@123 (e.g., Admin@123, Dentist@123, Reception@123)
-- Hashes generated via bcryptjs (10 rounds):
-- Admin@123     -> $2a$10$4qr5YbsawcrYf5KMF6P4TOxtABOLPdrEIzJBCO41LrKQvgr.BeI7e
-- Dentist@123   -> $2a$10$VylxJ8XdxOyfQDpj43dYeer3o0oV5dVe2SgKHYMth0pX4raSbOC56
-- Reception@123 -> $2a$10$lFJRjk8JrSJWm1bwN98qrOWouEjMEbj8tI39oDzst8p5bcvWJg0SK

-- Seed Administrator
INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, phone)
SELECT
    c.id,
    r.id,
    'admin@dentalerp.com',
    '$2a$10$4qr5YbsawcrYf5KMF6P4TOxtABOLPdrEIzJBCO41LrKQvgr.BeI7e',
    'System',
    'Administrator',
    '+91 99000 00001'
FROM clinics c, roles r
WHERE c.code = 'HQ-001' AND r.name = 'admin'
ON CONFLICT (email) DO NOTHING;

-- Seed Lead Dentist
INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, phone, specialization, license_number)
SELECT
    c.id,
    r.id,
    'dentist@dentalerp.com',
    '$2a$10$VylxJ8XdxOyfQDpj43dYeer3o0oV5dVe2SgKHYMth0pX4raSbOC56',
    'Dr. Sarah',
    'Mitchell',
    '+91 99000 00002',
    'General Dentistry & Endodontics',
    'DENT-LIC-2024-8841'
FROM clinics c, roles r
WHERE c.code = 'HQ-001' AND r.name = 'dentist'
ON CONFLICT (email) DO NOTHING;

-- Seed Receptionist
INSERT INTO users (clinic_id, role_id, email, password_hash, first_name, last_name, phone)
SELECT
    c.id,
    r.id,
    'reception@dentalerp.com',
    '$2a$10$lFJRjk8JrSJWm1bwN98qrOWouEjMEbj8tI39oDzst8p5bcvWJg0SK',
    'Emily',
    'Watson',
    '+91 99000 00003'
FROM clinics c, roles r
WHERE c.code = 'HQ-001' AND r.name = 'receptionist'
ON CONFLICT (email) DO NOTHING;

-- 4. Seed Default Branch for HQ-001
INSERT INTO branches (clinic_id, branch_code, branch_name, address_line1, city, state, postal_code, country, phone, email, timezone, is_active, is_default)
SELECT
    c.id,
    'MAIN-01',
    'Apex Downtown Main Branch',
    '101 Medical Enclave, Healthcare Boulevard',
    'Metro City',
    'State Central',
    '400001',
    'India',
    '+91 98765 43210',
    'contact@dentalcare-apex.com',
    'Asia/Kolkata',
    true,
    true
FROM clinics c
WHERE c.code = 'HQ-001'
ON CONFLICT (clinic_id, branch_code) DO NOTHING;

-- 5. Seed Default User Branch Mappings
INSERT INTO user_branches (user_id, branch_id, is_default)
SELECT
    u.id,
    b.id,
    true
FROM users u
JOIN clinics c ON u.clinic_id = c.id
JOIN branches b ON b.clinic_id = c.id AND b.branch_code = 'MAIN-01'
WHERE c.code = 'HQ-001'
ON CONFLICT (user_id, branch_id) DO NOTHING;

