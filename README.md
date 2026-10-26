# Dental Clinic ERP System

A complete Dental Clinic Enterprise Resource Planning (ERP) and Practice Management platform, built with React, Vite, Tailwind CSS, Node.js, Express, and PostgreSQL.

---

## Architecture & Hierarchy

The application enforces a multi-tenant, multi-branch architectural hierarchy:

```
Organization (clinics)
       │
       ├── Branch 1 (branches: e.g. MAIN-01) ── User Assignments (user_branches)
       │
       └── Branch 2 (branches: e.g. WEST-02) ── User Assignments (user_branches)
```

- **Organization Level (`clinics`)**: Represents the top-level dental enterprise/clinic organization (e.g. `HQ-001` - DentalCare Apex Clinic & Imaging Centre).
- **Physical Locations (`branches`)**: Physical branch offices with their own branch code, address, contact information, operational status, and timezone.
- **Access Mappings (`user_branches`)**: Maps users to authorized branches. Non-admin staff (dentists, specialists, receptionists) can only access branches explicitly mapped to them. Clinic Administrators have organization-level oversight across all branches.

---

## Project Structure

```
dental-clinic-erp/
│
├── frontend/                     # React + Vite + Tailwind CSS Application
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   └── BranchSelector.jsx    # Top-bar active branch switcher
│   │   ├── layouts/
│   │   │   └── MainLayout.jsx        # Navigation shell with branch selector
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx     # Branch-aware operational metrics
│   │   │   ├── BranchManagementPage.jsx # Branch CRUD & staff assignments
│   │   │   └── LoginPage.jsx         # Authentication portal
│   │   ├── services/
│   │   │   ├── api.js                # Axios client with x-branch-id injection
│   │   │   ├── authService.js        # Auth REST endpoints
│   │   │   └── branchService.js      # Branch REST endpoints
│   │   ├── context/
│   │   │   ├── AuthContext.jsx       # Auth session context
│   │   │   └── BranchContext.jsx     # Active branch state & switcher
│   │   ├── App.jsx
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # Node.js + Express + PostgreSQL API
│   ├── config/
│   │   └── database.js           # PostgreSQL connection pool & migration trigger
│   ├── controllers/
│   │   ├── authController.js     # Auth & authorized branches in profile
│   │   ├── branchController.js   # Branch CRUD, status & staff assignments
│   │   └── healthController.js   # System health
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── branchRoutes.js       # /api/branches endpoints
│   │   └── healthRoutes.js
│   ├── middleware/
│   │   ├── auth.js               # JWT, RBAC & authorizeBranchAccess middleware
│   │   └── errorHandler.js
│   ├── validations/
│   │   └── branchValidation.js   # Branch & user assignment validation
│   ├── database/
│   │   ├── schema.sql            # Base schema & idempotent seeds
│   │   ├── migrationRunner.js    # Versioned migration engine
│   │   └── migrations/
│   │       └── 001_multi_branch_support.js # Migration 001
│   ├── tests/
│   │   └── branch.test.js        # 13 comprehensive test suites
│   ├── app.js
│   ├── server.js
│   ├── .env.example
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## Database Migration System

The backend employs an automated, versioned, transactional migration system:
1. `schema_migrations` table records applied migrations to prevent duplicate runs on server restarts.
2. `backend/database/migrations/001_multi_branch_support.js`:
   - Creates `branches` and `user_branches` tables with constraints and indexes.
   - Enforces unique branch codes per organization: `CONSTRAINT uq_clinic_branch_code UNIQUE (clinic_id, branch_code)`.
   - Adds `branch_id` to `audit_logs`.
   - Automatically migrates existing clinics by generating an initial default branch (`MAIN-01`).
   - Maps existing users (`admin@dentalerp.com`, `dentist@dentalerp.com`, `reception@dentalerp.com`) to the default branch.
3. Migrations run inside a PostgreSQL transaction (`BEGIN ... COMMIT`). If an error occurs, changes are rolled back (`ROLLBACK`) and application startup halts with descriptive diagnostics.

---

## Quick Start (Local Windows)

### 1. PostgreSQL Database Setup
Open PowerShell or SQL Shell (`psql`) and ensure the database exists:
```sql
CREATE DATABASE dental_clinic_erp;
```

### 2. Backend Setup & Run
Configure `backend/.env` with your local database credentials:
```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dental_clinic_erp
DB_USER=postgres
DB_PASSWORD=your_local_password
JWT_SECRET=your_jwt_secret_key
FRONTEND_URL=http://localhost:5173
```

Install dependencies and start the backend:
```bash
cd backend
npm install
npm run dev
```

Startup output:
```
Database connection successful.
[Database Migrations] All migrations are already up to date.
Database schema initialized successfully.
Server running at http://localhost:5000
```

### 3. Frontend Setup & Run
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Default Seed Credentials

| Role | Email | Password | Access Scope |
|------|-------|----------|--------------|
| **Clinic Administrator** | `admin@dentalerp.com` | `Admin@123` | Organization-wide; all branches, branch CRUD, staff assignments |
| **Lead Dentist** | `dentist@dentalerp.com` | `Dentist@123` | Assigned branch(es) only |
| **Receptionist** | `reception@dentalerp.com` | `Reception@123` | Assigned branch(es) only |

---

## Branch Management Usage Guide

### Creating Additional Branches
1. Log in with the **Clinic Administrator** account (`admin@dentalerp.com`).
2. Navigate to **Branch Management** from the top module tabs.
3. Click **Add New Branch**.
4. Fill in the required fields:
   - **Branch Name**: e.g., `Apex West Suburb Premium Centre`
   - **Branch Code**: e.g., `WEST-02` (must be unique within the organization)
   - **Location**: Address, City, State, Postal Code, Country
   - **Contact**: Phone, Email, Timezone
   - **Default Branch**: Check if this should be the new default branch for the clinic.
5. Click **Create Branch**.

### Assigning Personnel to Branches
1. On the **Branch Management** page, locate the target branch.
2. Click the **Staff** button (e.g., `1 Staff`).
3. In the modal, select any clinic user from the dropdown.
4. Optionally check **Set as primary branch**.
5. Click **Assign Staff**.

### Switching Active Branch
- Click the **Active Branch** selector in the top header.
- Select any authorized branch from the dropdown menu.
- Administrators can also select **All Branches (Organization Overview)** to view aggregated metrics across the organization.

---

## API Endpoints Reference

All `/api/branches` endpoints require a valid JWT token (`Authorization: Bearer <token>`).

| Method | Endpoint | Access Role | Description |
|--------|----------|-------------|-------------|
| `GET` | `/api/branches` | Authenticated | List authorized branches (Admin sees all; staff sees assigned) |
| `GET` | `/api/branches/:id` | Assigned / Admin | Retrieve single branch details and metrics |
| `POST` | `/api/branches` | Admin | Create a new branch (enforces subscription plan branch limits) |
| `PUT` | `/api/branches/:id` | Admin | Update branch information |
| `PATCH` | `/api/branches/:id/status` | Admin | Activate or deactivate a branch (prevents deactivating default branch) |
| `GET` | `/api/branches/:id/users` | Assigned / Admin | List personnel assigned to the branch (`?available=true` for unassigned) |
| `POST` | `/api/branches/:id/users` | Admin | Assign a staff member to the branch |
| `DELETE` | `/api/branches/:id/users/:userId` | Admin | Remove a staff assignment from the branch |
| `GET` | `/api/branches/:id/stats` | Assigned / Admin | Return live real staff metrics for the branch |

---

## Phase 1.6: VoiceGate SaaS Foundation & Managed Clinic Onboarding

### Two Separate Security Boundaries

1. **VoiceGate Platform Super Administrator (`is_platform_admin = true`, role `superadmin`)**:
   - Governs customer clinic organizations, subscription plans, and platform-level operations.
   - Tenant-independent (`clinic_id = NULL`).
   - Ordinary clinic administrators (`admin` role in a clinic) are strictly prevented from gaining platform privileges.
2. **Clinic Tenant Users (`is_platform_admin = false`)**:
   - Bound strictly to their organization (`clinic_id`) and authorized branches (`user_branches`).
   - Cannot access `/api/platform/*` endpoints (enforced by `authorizePlatformAdmin` middleware).
   - If a clinic's subscription is suspended, operational mutations are blocked (enforced by `requireActiveSubscription` middleware).

### Secure SuperAdmin Bootstrap

Bootstrap the initial VoiceGate Platform Super Administrator via CLI (never exposed as a public endpoint):

```bash
cd backend

# Option A: With default local development credentials
npm run bootstrap:superadmin

# Option B: With custom secure environment variables
SUPERADMIN_EMAIL="superadmin@voicegate.com" SUPERADMIN_PASSWORD="YourSecurePassword" npm run bootstrap:superadmin
```

Initial credentials for local development:
- **Email**: `superadmin@voicegate.com`
- **Password**: `SuperAdmin@VoiceGate2026`

### Platform Administration API Endpoints

All platform endpoints require JWT authentication and Platform Super Admin privileges (`authorizePlatformAdmin`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/platform/overview` | Platform overview KPIs, subscription breakdown, and recent audit activity |
| `GET` | `/api/platform/clinics` | List all clinic organizations with branch counts, staff counts, and subscription plans |
| `POST` | `/api/platform/clinics/onboard` | Atomic transactional onboarding: provisions clinic, primary branch, clinic admin, and plan |
| `GET` | `/api/platform/clinics/:id` | Retrieve detailed organization profile, provisioned branches, and staff list |
| `PUT` | `/api/platform/clinics/:id` | Update clinic organization details (name, email, phone, branch limit override) |
| `PATCH` | `/api/platform/clinics/:id/status` | Activate, suspend, or reactivate a clinic organization |
| `POST` | `/api/platform/clinics/:id/plan` | Assign, upgrade, or downgrade subscription plan for a clinic |
| `GET` | `/api/platform/plans` | List configured subscription tiers with subscriber clinic counts |
| `POST` | `/api/platform/plans` | Create a new subscription tier with branch provisioning limits |
| `PUT` | `/api/platform/plans/:id` | Update subscription plan details and branch limits |

---

## Running Automated Tests

Run the complete test suite from the `backend/` directory:
```bash
npm test
```

### Test Results (24/24 passing across 2 suites):

**Suite 1: Phase 1.5 Multi-Branch Management (13/13 passing)**
1. Existing login continues to work and returns authorized branches.
2. Idempotent initialization: running migrations repeatedly does not duplicate branches or user mappings.
3. Admin can list all branches for clinic organization.
4. Admin can create a new branch.
5. Enforces branch code uniqueness within the same organization (409 Conflict).
6. Non-admin (dentist) cannot create branches (403 Forbidden).
7. Unauthorized branch access: user assigned to Branch A cannot access unassigned Branch B (403 Forbidden).
8. Admin can assign a user to a branch.
9. Admin can update branch details.
10. Branch status check: cannot deactivate default branch (400 Bad Request).
11. Safe deactivation: admin can deactivate non-default branch and revoke clinical access.
12. Admin can remove a user assignment from a branch.
13. Branch statistics return real metrics without fake data.

**Suite 2: Phase 1.6 SaaS Foundation & Multi-Tenant Platform Administration (11/11 passing)**
1. SuperAdmin can access platform overview and metrics.
2. Clinic Administrator is strictly DENIED platform access (403 Forbidden).
3. Non-admin staff (dentist) is DENIED platform access (403 Forbidden).
4. SuperAdmin can list all subscription plans and create a custom plan.
5. Managed Onboarding: SuperAdmin atomically provisions new clinic organization.
6. Duplicate clinic code is rejected (409 Conflict).
7. Duplicate admin email is rejected (409 Conflict).
8. Newly provisioned Clinic Administrator can log in and is isolated to their clinic.
9. Branch Limit Enforcement: STARTER plan (1 branch limit) blocks adding a second branch.
10. SuperAdmin can upgrade subscription plan and clinic can now add branches.
11. Suspended clinic organization cannot perform branch operations.
