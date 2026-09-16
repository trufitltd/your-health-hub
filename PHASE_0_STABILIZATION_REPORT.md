# Phase 0: Architecture Stabilisation Report

**Date:** 2026-08-27
**Status:** Complete

---

## 1. Authoritative Database Schema Source

**Decision:** `supabase/migrations/` is the authoritative schema source.

| Source | Purpose | Trust Level |
|--------|---------|-------------|
| `supabase/migrations/` (57+ files) | Supabase CLI-tracked migrations, applied in order | **Authoritative** |
| `db/` (101 files) | Hand-written SQL scripts, manual execution | Supplementary |

**Key finding:** The `db/` directory contains ad-hoc fixes, diagnostics, and data cleanup scripts. Some are AI-generated outputs pasted verbatim. These scripts can conflict with the migration chain if run out of order — several `db/` scripts reintroduced vulnerabilities that the hardening migration had already dropped.

---

## 2. Security Vulnerabilities Fixed

### 2.1 `admin_delete_appointment` — Privilege Escalation (CRITICAL)

**Before:** Any authenticated user could delete any appointment via `supabase.rpc('admin_delete_appointment')`.

**After:** Server-side `is_admin_or_coo()` check added. Only admin/COO users can delete appointments.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:13-32`

### 2.2 Admin/COO Portal Route Protection (CRITICAL)

**Before:** `/admin` and `/coo` routes had no `ProtectedRoute` wrapper.

**After:** Both routes wrapped with `<ProtectedRoute requiredRole="admin">` and `<ProtectedRoute requiredRole="coo">`.

**File:** `src/App.tsx:272-286`

### 2.3 Pricing Table RLS — Business Logic Vulnerability (CRITICAL)

**Before:** 12 RLS policies across 6 pricing tables allowed any authenticated user to modify platform pricing, tiers, feature flags, and fee rules.

**After:** Write policies restricted to admin/COO only via `is_admin_or_coo()`.

**Affected tables:** `pricing_profiles`, `pricing_rules`, `pricing_feature_flags`, `consultation_types`, `doctor_tiers`, `platform_fee_rules`

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:62-120`

### 2.4 COO Messages — Data Exposure (HIGH)

**Before:** `coo_messages` SELECT policy was `USING (true)` — any authenticated user could read all COO/admin/patient messages.

**After:** Restricted to COO/admin users and thread participants only.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:37-52`

### 2.5 `doctor_registrations` — Public Read of Medical Credentials (CRITICAL)

**Before:** `db/setup_doctor_registrations_rls.sql` re-created `"Allow public read access to doctor registrations"` with `USING (true)`, undoing the hardening migration. Any anonymous visitor could read license files, medical credentials, emails, phone numbers.

**After:** Policy dropped, `anon` SELECT revoked. Access restricted to admin/COO read + owner policies.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:124-126`

### 2.6 `patient_registrations` — Public Read of Patient PII (CRITICAL)

**Before:** `db/setup_patient_registrations_rls.sql` re-created `"Allow public read access to patient registrations"` with `USING (true)`, undoing the hardening migration. Any anonymous visitor could read patient names, emails, phone numbers, identification numbers, ages, medical info.

**After:** Policy dropped, `anon` SELECT revoked. Access restricted to admin/COO read + owner policies.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:128-130`

### 2.7 `sms_logs` — Doctor Reads All SMS Logs (HIGH)

**Before:** `"Doctors can view patient SMS logs"` used `EXISTS (SELECT 1 FROM doctors WHERE doctors.user_id = auth.uid())` — any approved doctor could read ALL SMS logs, not just their patients'. Also, INSERT allowed `sent_by IS NULL`.

**After:** New policy requires the doctor to have an appointment with the patient whose phone number matches the SMS log. Also restricted INSERT to own records or admin/COO.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:132-161`

### 2.8 `get_incomplete_patient_profiles` — Unauthenticated Enumeration (HIGH)

**Before:** Any authenticated user could call this RPC to enumerate all patients who hadn't completed registration (user IDs + full names).

**After:** Server-side `is_admin_or_coo()` check added.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:165-188`

### 2.9 `admin_request_doctor_license_reupload` — Doctor Disruption (HIGH)

**Before:** Any authenticated user could set any doctor's registration to `pending` and require license re-upload.

**After:** Server-side `is_admin_or_coo()` check added.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:190-214`

### 2.10 `admin_update_doctor_registration` — Doctor Approval Bypass (CRITICAL)

**Before:** Any authenticated user could approve or reject any doctor's registration.

**After:** Server-side `is_admin_or_coo()` check added.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:216-240`

### 2.11 `admin_mark_license_reupload_seen` — Notification Tampering (MEDIUM)

**Before:** Any authenticated user could mark re-upload notifications as seen.

**After:** Server-side `is_admin_or_coo()` check added.

**File:** `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql:242-260`

---

## 3. Testing Foundation Established

**Installed:** vitest, @testing-library/react, @testing-library/jest-dom, jsdom

**Config:** `vitest.config.ts` with React SWC plugin, path aliases, and jsdom environment.

**Scripts added:**
- `npm test` — run tests once
- `npm run test:watch` — run tests in watch mode
- `npm run test:coverage` — run with coverage

**Initial test file:** `src/test/auth.test.ts` — tests for role parsing and default path logic.

**Verification:** All 6 tests pass. TypeScript type check passes. Vite build succeeds.

---

## 4. Complete Vulnerability Matrix

| # | Severity | Issue | Status | Fix Location |
|---|----------|-------|--------|-------------|
| 1 | CRITICAL | `admin_delete_appointment` privilege escalation | **FIXED** | Migration:13-32 |
| 2 | CRITICAL | Admin/COO portals lack ProtectedRoute | **FIXED** | App.tsx:272-286 |
| 3 | CRITICAL | Pricing tables writable by any user | **FIXED** | Migration:62-120 |
| 4 | CRITICAL | `doctor_registrations` public read | **FIXED** | Migration:124-126 |
| 5 | CRITICAL | `patient_registrations` public read | **FIXED** | Migration:128-130 |
| 6 | CRITICAL | `admin_update_doctor_registration` no auth | **FIXED** | Migration:216-240 |
| 7 | HIGH | `coo_messages` public read | **FIXED** | Migration:37-52 |
| 8 | HIGH | `sms_logs` doctor reads all logs | **FIXED** | Migration:132-161 |
| 9 | HIGH | `get_incomplete_patient_profiles` no auth | **FIXED** | Migration:165-188 |
| 10 | HIGH | `admin_request_doctor_license_reupload` no auth | **FIXED** | Migration:190-214 |
| 11 | MEDIUM | `admin_mark_license_reupload_seen` no auth | **FIXED** | Migration:242-260 |

---

## 5. Known Issues Not Addressed (Phase 1+)

| Issue | Severity | Reason Deferred |
|-------|----------|-----------------|
| `db/` scripts reintroduce vulnerabilities if re-run | INFO | Scripts documented; `db/` is not the migration source of truth |
| SECURITY DEFINER functions without `SET search_path` | RESOLVED | Hardening migration `20260524124500` retroactively pinned all functions |
| `webrtc_signals` RLS commented out | LOW | WebRTC signaling uses service role; RLS not needed |
| No error boundaries | MEDIUM | UX concern, not security |
| TypeScript strict mode disabled | LOW | Would require significant refactoring |
| Monolithic portal pages (5000+ lines each) | MEDIUM | Refactoring deferred to multi-tenancy phase |

---

## 6. Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Added `ProtectedRoute` wrapper to `/admin` and `/coo` routes |
| `supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql` | New migration fixing 11 vulnerabilities |
| `vitest.config.ts` | New vitest configuration |
| `src/test/setup.ts` | New test setup with Supabase mocks |
| `src/test/auth.test.ts` | New auth logic tests |
| `package.json` | Added vitest dependencies and test scripts |

---

## 7. Migration Deployment

The security migration must be applied to the live Supabase instance:

```bash
supabase db push --project-ref <project-ref>
```

Or via the Supabase Dashboard SQL Editor by executing the contents of:
`supabase/migrations/20260827000000_fix_critical_security_vulnerabilities.sql`

**⚠️ Important:** This migration is safe to run — it only adds restrictive policies and hardens existing functions. No data is deleted or modified. Existing admin/COO users will retain full access because `is_admin_or_coo()` recognizes them via email allowlist, `admin_users` table, and JWT role metadata.
