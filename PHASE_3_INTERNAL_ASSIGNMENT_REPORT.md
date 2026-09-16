# Phase 3: Internal Clinician Assignment Report

**Status:** ✅ COMPLETE  
**Date:** 2026-08-29  
**Tests:** 82 passing (22 original + 21 Phase 2 + 39 Phase 3)

---

## Executive Summary

Phase 3 adds an organisation-assigned clinician workflow alongside the existing patient-selected clinician flow. CIBA Wellness patients now select a service type and time, and the system internally assigns an available clinician. MyE-Doctor remains completely unchanged.

---

## Architecture Implemented

### Two Booking Modes

| Mode | Flow | Used By |
|------|------|---------|
| `patient_select` | Patient → Doctor Selection → Time → Payment → Doctor Approval → Consultation | MyE-Doctor |
| `internal_assign` | Patient → Service Type → Time → Payment → Internal Clinician Assignment → Clinician Approval → Consultation | CIBA Wellness |

### How It Works

1. **Organisation config** determines which mode is active (`clinician_selection_mode`)
2. **Frontend** conditionally renders doctor directory or service selection based on mode
3. **Booking-initiate** edge function handles both flows:
   - With `doctorId`: standard MyE-Doctor flow
   - With `serviceType`: internal assignment flow
4. **ClinicianAssignmentService** runs the assignment pipeline:
   - CIBA Service → Required clinician capability → Organisation members → Qualified clinicians → Available at requested time → No conflicting appointment → Select clinician → pending_approval
5. **assign-clinician** edge function triggers assignment after payment

---

## Database Changes

### Migration: `20260829000000_phase3_internal_assignment.sql`

#### New Tables

| Table | Purpose |
|-------|---------|
| `organisation_services` | Org-specific service offerings (e.g., "General Consultation", "Physiotherapy") |
| `assign_clinician_queue` | Audit trail of clinician assignments |

#### Columns Added

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| `appointments` | `service_type` | TEXT NULL | Stores service name for internal-assignment bookings |

#### Constraint Changes

| Table | Change |
|-------|--------|
| `appointments` | Status check constraint updated to include `pending_assignment` |
| `consultation_sessions` | `doctor_id` made nullable (for sessions created before assignment) |

#### New Functions

| Function | Purpose |
|----------|---------|
| `get_org_config(org_id, key)` | Read a config value from `organisation_config` |

#### Updated Functions

| Function | Change |
|----------|--------|
| `get_appointment_org_id()` | Now falls back to `appointments.organisation_id` when `doctor_id` is NULL |
| `list_public_doctors()` | Added optional `p_organisation_id` parameter to filter by org |

### Migration: `20260829100000_add_required_specialties_to_org_services.sql`

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| `organisation_services` | `required_specialties` | TEXT[] DEFAULT '{}' | Array of specialty strings for assignment pipeline matching (e.g., `{GP}`, `{Physiotherapy, Rehabilitation}`). Empty means any qualified doctor in the org. |

#### Config Seeded for MyE-Doctor

| Key | Value |
|-----|-------|
| `clinician_selection_mode` | `patient_select` |
| `show_doctor_directory` | `true` |
| `show_ratings` | `true` |
| `show_reviews` | `true` |
| `enable_service_types` | `false` |

---

## Booking Flows

### MyE-Doctor Flow (Unchanged)

```
Patient → /doctor-discovery → Select Doctor → /slot-selection → Select Time → Payment → pending_approval → Doctor Approves → Consultation
```

- `doctorId` is required
- Availability check against specific doctor
- Pricing from doctor's rate or rule engine
- Wallet earnings created immediately
- Status: `pending_payment` → `pending_approval`

### CIBA Wellness Flow (New)

```
Patient → /service-discovery?organisationId=... → Select Service → /slot-selection → Select Time → Payment → pending_assignment → assign-clinician → pending_approval → Doctor Approves → Consultation
```

- `doctorId` is NULL, `serviceType` is required
- No specific doctor availability check at booking time
- Pricing from `organisation_services.base_price` or pricing rules with `service_type` condition
- Wallet earnings deferred until doctor is assigned
- Status: `pending_payment` → `pending_assignment` → `pending_approval`

---

## Clinician Assignment Logic

### ClinicianAssignmentService

**Location:** `supabase/functions/_shared/services/ClinicianAssignmentService.ts`

**Pipeline (8 steps):**

1. **CIBA Service** → Load the service from `organisation_services` by org + service name
2. **Required clinician capability** → Read `required_specialties` array from the service (e.g., `['gp']`, `['physiotherapy', 'rehabilitation']`)
3. **Organisation members** → Find all active doctors in the organisation (`doctors` table filtered by `organisation_id`)
4. **Qualified clinicians** → Filter doctors by matching their `specialty` (from `doctor_registrations`) against required specialties (handles GP/General Practice/General Practitioner aliases). Empty `required_specialties` = all org doctors qualify.
5. **Available at requested time** → For each qualified doctor, check `doctor_schedules` for the day of week
6. **No conflicting appointment** → For each available doctor, check existing appointments for time overlaps ( statuses: confirmed, pending_approval, in_progress, completed, pending_payment)
7. **Select clinician** → Round-robin: count assignments in last 7 days, select doctor with fewest
8. **pending_approval** → Update appointment: set `doctor_id`, change status to `pending_approval`

**Pipeline result object:** Every assignment returns a `pipeline` field showing exactly which step succeeded/failed and counts at each stage (e.g., `organisationMemberCount: 5, qualifiedCount: 3, availableCount: 2, conflictFreeCount: 1`).

**Admin Override:** `assignSpecificClinician(appointmentId, doctorId)` allows manual assignment with schedule and conflict validation.

### assign-clinician Edge Function

**Location:** `supabase/functions/assign-clinician/index.ts`

- Accepts `appointmentId` and optional `doctorId`
- Without `doctorId`: automatic round-robin assignment
- With `doctorId`: admin override assignment
- Returns assignment result with doctor name

---

## Pricing Changes

### service_type Condition Type

`pricing_rules.condition_type` now supports `service_type` as a modifier:

```
rule_type: 'modifier'
condition_type: 'service_type'
condition_value: 'physiotherapy'
price_action: 'multiply'
amount: 1.5
```

### Pricing Flow for Internal Assignment

1. Load `organisation_services` for the org and service name
2. Try pricing engine with `serviceType` parameter
3. If pricing engine succeeds, use its result
4. If pricing engine fails (no base rule), fall back to `organisation_services.base_price`

---

## RLS/Security Changes

| Table | Policy | Change |
|-------|--------|--------|
| `organisation_services` | `org_services_read` | SELECT for org members and superadmins |
| `organisation_services` | `org_services_admin_manage` | ALL for org admins and superadmins |
| `assign_clinician_queue` | `assign_queue_admin_read` | SELECT for org admins and superadmins |
| `organisation_config` | `org_config_read` | Already existed (Phase 2) |

### Security Notes

- Clinician assignment is server-side only — never exposed to patients
- `assign-clinician` edge function requires authentication
- Assignment queue is only readable by org admins and superadmins
- No patient can see the assignment algorithm or assigned clinician before assignment

---

## Files Modified

### Backend (Edge Functions & Services)

| File | Change |
|------|--------|
| `supabase/migrations/20260829000000_phase3_internal_assignment.sql` | New migration |
| `supabase/migrations/20260829100000_add_required_specialties_to_org_services.sql` | New migration — adds `required_specialties` column |
| `supabase/functions/_shared/marketplace-types.ts` | Added `pending_assignment` status, `serviceType` to inputs |
| `supabase/functions/_shared/services/PricingService.ts` | Added `service_type` condition type |
| `supabase/functions/_shared/services/BookingService.ts` | Optional `doctorId`, internal assignment flow, `processPayment` extraction |
| `supabase/functions/_shared/services/ClinicianAssignmentService.ts` | 8-step assignment pipeline with required_specialties matching |
| `supabase/functions/booking-initiate/index.ts` | Internal assignment mode, org config check |
| `supabase/functions/assign-clinician/index.ts` | New edge function |

### Frontend

| File | Change |
|------|--------|
| `src/services/marketplaceTypes.ts` | Added `serviceType`, `organisationId`, `pendingAssignment` to types |
| `src/hooks/useOrgBookingConfig.ts` | New hook |
| `src/hooks/useOrganisationServices.ts` | New hook — includes `required_specialties` |
| `src/components/service-selection/ServiceSelection.tsx` | New component |
| `src/pages/ServiceDiscovery.tsx` | New page |
| `src/pages/SlotSelection.tsx` | Internal assignment support |
| `src/App.tsx` | Added `/service-discovery` route |

### Tests

| File | Tests |
|------|-------|
| `src/test/phase3-internal-assignment.test.ts` | 39 tests covering assignment pipeline, specialty matching, status model, booking flow, services, pricing, isolation, regression, routing |

---

## Tests and Results

```
 Test Files  4 passed (4)
      Tests  82 passed (82)

 ✅ src/test/auth.test.ts (6 tests)
 ✅ src/test/multitenancy.test.ts (16 tests)
 ✅ src/test/multitenancy-services.test.ts (21 tests)
 ✅ src/test/phase3-internal-assignment.test.ts (39 tests)
```

### Test Coverage

- Appointment status model (pending_assignment handling)
- Booking flow (optional doctorId, serviceType validation)
- Organisation services model (including required_specialties)
- Organisation booking config
- Pricing engine service_type support
- Assignment pipeline (8 steps: service → capability → members → qualified → available → conflict-free → select → pending_approval)
- Specialty matching (GP aliases, empty required_specialties, Physiotherapy)
- Double-booking prevention (time overlap detection)
- Round-robin selection (fewest recent assignments)
- Cross-organisation isolation
- MyE-Doctor regression
- Frontend routing
- RPC function org-awareness

---

## MyE-Doctor Regression Results

All existing MyE-Doctor functionality preserved:

| Feature | Status | Evidence |
|---------|--------|----------|
| Doctor discovery page | ✅ Unchanged | `/doctor-discovery` route intact |
| Doctor selection | ✅ Unchanged | `doctorId` still required for patient_select |
| Slot selection | ✅ Unchanged | Works exactly as before for patient_select |
| Pricing engine | ✅ Unchanged | No service_type when not provided |
| Payment processing | ✅ Unchanged | Paystack, wallet, hybrid all work |
| Wallet earnings | ✅ Unchanged | Created immediately for patient_select |
| Doctor approval | ✅ Unchanged | `pending_approval` status unchanged |
| Consultation room | ✅ Unchanged | WebRTC, chat work as before |
| Admin portals | ✅ Unchanged | Central Admin, COO, Doctor portals work |
| Default config | ✅ `patient_select` | MyE-Doctor seeded with patient_select mode |

---

## Known Limitations

1. **Automatic assignment not triggered automatically** — the `assign-clinician` function must be called explicitly after payment. In a production system, this would be triggered by a webhook or queue processor.

2. **Service-type pricing uses GP doctor type as fallback** — when no specific doctor is assigned, the pricing engine defaults to GP type. This can be customised per-org via pricing rules.

3. **No admin UI for assignment queue** — the `assign_clinician_queue` table exists but there's no admin dashboard to view/pending assignments. This is recommended for Phase 4.

4. **Frontend ServiceSelection is basic** — the service cards show name, description, price, and mode. More rich UI (images, categories) can be added in Phase 4.

---

## Recommended Phase 4

1. **Admin assignment dashboard** — UI to view pending assignments, manually assign/reassign clinicians
2. **Automatic assignment trigger** — webhook or queue processor to auto-assign after payment
3. **Load balancing strategies** — round-robin, least-busy, skill-based, or priority-based assignment
4. **Rich service selection UI** — images, categories, descriptions, popular services
5. **Service discovery page improvements** — filtering, search, service categories
6. **Email/SMS notifications** — notify patient when clinician is assigned
7. **CIBA-specific branding** — custom colours, logo, layout for CIBA portal
8. **Service-type pricing admin UI** — manage service prices in the admin panel
9. **Assignment metrics** — average assignment time, success rate, doctor utilisation

---

## Edge Functions to Redeploy

For Phase 3 to be fully functional, deploy:

1. **`booking-initiate`** — updated with internal assignment mode
2. **`assign-clinician`** — new edge function
3. **`send-sms`** — already updated in Phase 2 (org config)
4. **`send-push`** — already updated in Phase 2 (org config)

**Pre-requisite:** Migrations must be applied first:
1. `20260829000000_phase3_internal_assignment.sql`
2. `20260829100000_add_required_specialties_to_org_services.sql`
