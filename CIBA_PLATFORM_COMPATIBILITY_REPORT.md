# CIBA Wellness Platform Compatibility Report

**Date:** 2026-08-28  
**Status:** Analysis complete — no code changes made  
**Purpose:** Assess whether the current multi-tenant architecture supports both MyE-Doctor (patient-selected clinician) and CIBA Wellness (internally-assigned clinician) workflows.

---

## 1. Executive Summary

The current platform is built **entirely around patient-selected clinicians**. Every layer — discovery, booking, pricing, slot selection, consultation — assumes the patient picks a specific doctor before any other action.

**CIBA Wellness requires the opposite:** the patient selects a service type and time, and the organisation internally assigns an appropriate clinician.

**Verdict:** The current architecture **cannot support CIBA without changes**, but the changes are **additive and contained**. The multi-tenant foundation (Phase 1-2) provides the right hooks. No MyE-Doctor functionality needs to be removed.

---

## 2. Current Assumptions Discovered

### 2a. Doctor Discovery Assumes Patient Browses All Doctors

**File:** `src/pages/DoctorDiscovery.tsx`  
**RPC:** `list_public_doctors()` in `supabase/migrations/20260602110000_add_currency_to_list_public_doctors.sql`

- The RPC returns **all approved doctors** across all organisations (no `organisation_id` filter)
- The frontend displays: full name, specialty, profile picture, city/state, rate, rating, total reviews, recent reviews, bio, experience
- The patient clicks a doctor card → navigates to `/slot-selection?doctorId=...`
- There is no concept of "browse services instead of doctors"

**Impact:** CIBA patients would see MyE-Doctor's full doctor directory. There is no way to hide it or show a service-centric view instead.

### 2b. Booking Requires a Doctor ID

**File:** `supabase/functions/booking-initiate/index.ts` (line 77)  
**File:** `supabase/functions/_shared/services/BookingService.ts` (line 320)

```typescript
// booking-initiate requires payload.doctorId
const result = await bookingService.initiateBooking({
  patientId: user.id,
  doctorId: payload.doctorId,  // REQUIRED
  preferredDate: payload.preferredDate,
  preferredTime: payload.preferredTime,
  ...
});
```

- `BookingService.initiateBooking()` throws if `doctorId` is missing
- The appointment row is created with `doctor_id: input.doctorId`
- Organisation is resolved **from the doctor** (`doctors.organisation_id`)

**Impact:** There is no booking path where the doctor is assigned later. The doctor must be known at booking time.

### 2c. Slot Selection Is Per-Doctor

**File:** `src/pages/SlotSelection.tsx`

- The page loads doctor info via `slot-selection-doctor-info` query
- Available slots are fetched for that specific doctor
- Price preview is calculated for that specific doctor
- The booking is initiated with that specific doctor

**Impact:** CIBA cannot use the current SlotSelection flow because the patient should not see or select a specific doctor.

### 2d. Ratings/Reviews Are Displayed in Discovery

**File:** `src/pages/DoctorDiscovery.tsx` (lines 1408-1447)

- Each doctor card shows star ratings and recent reviews
- Reviews are fetched from `appointments` table where `rating IS NOT NULL`
- A `minRating` filter exists in the discovery page
- Reviews include reviewer name, rating, and comment

**Impact:** If CIBA does not want patients to see or compare clinicians, the current discovery page shows too much clinician-specific information.

### 2e. Pricing Can Be Per-Doctor (Rate Override)

**File:** `supabase/functions/_shared/services/BookingService.ts` (lines 110-132)

```typescript
// If doctor has a personal rate, pricing engine is BYPASSED
const registrationRateRaw = Number(doctorRegistration?.rate_per_consultation);
if (Number.isFinite(registrationRateRaw) && registrationRateRaw > 0) {
  ratePerConsultation = roundMoney(registrationRateRaw);
  // PricingService.calculatePrice() is NOT called
}
```

- If a doctor has `rate_per_consultation > 0`, the rule engine is skipped entirely
- The doctor's personal rate becomes the final price
- This is a per-doctor override, not per-org

**Impact:** CIBA could use this for doctors with fixed rates, but it's per-doctor, not per-service-type. CIBA likely wants per-service pricing (e.g., "Physiotherapy session = X").

### 2f. Consultation Types Exist But Are Not Service Types

**File:** `supabase/migrations/20260602110000_add_currency_to_list_public_doctors.sql`

- `consultation_types` table has: `name` (chat/voice/video), `active`, `flat_rate`
- These are **delivery modes**, not medical service types
- The `consultation_type_pricing` feature flag is `false` by default
- When disabled, all consultations default to `video`

**Impact:** CIBA needs "service types" (e.g., General Consultation, Physiotherapy, Mental Health) which are conceptually different from "consultation modes" (video/voice/chat).

### 2g. No Internal Assignment Mechanism Exists

- No doctor queue, matching algorithm, or assignment logic in any edge function
- No "pending assignment" appointment status
- The `pending_approval` status means "doctor was selected, waiting for doctor to accept" — not "waiting for assignment"

**Impact:** A new assignment service and possibly a new appointment status are required.

---

## 3. Architectural Changes Required

### 3a. Organisation Configuration: Clinician Selection Mode

**Recommendation:** Add a `clinician_selection_mode` field to `organisation_config`.

| Value | Meaning | Used By |
|-------|---------|---------|
| `patient_select` | Patient browses and picks a clinician | MyE-Doctor (default) |
| `internal_assign` | Patient picks service + time; org assigns clinician | CIBA Wellness |

**Implementation:**
- Add to `organisation_config` table or a new `organisations.booking_config` JSONB column
- Read in booking-initiate to determine flow
- Read in frontend to toggle discovery vs service-selection UI

### 3b. Service Types (Distinct from Consultation Modes)

**Recommendation:** Create an `organisation_services` table.

```
organisation_services
  id UUID PK
  organisation_id UUID FK
  name TEXT              -- "General Consultation", "Physiotherapy"
  description TEXT
  default_duration_minutes INTEGER
  consultation_mode TEXT  -- 'video', 'voice', 'chat'
  base_price NUMERIC
  currency TEXT
  active BOOLEAN
  sort_order INTEGER
```

- MyE-Doctor: does not use this table (continues with current flow)
- CIBA: patient selects from this list instead of browsing doctors

### 3c. Hide Doctor Directory Per Organisation

**Recommendation:** Use `clinician_selection_mode` in the frontend to conditionally render:

| Mode | Discovery Page Shows |
|------|---------------------|
| `patient_select` | Doctor cards with ratings, reviews, bios (current) |
| `internal_assign` | Service type cards with descriptions and prices |

**Files to modify:**
- `src/pages/DoctorDiscovery.tsx` — add mode check, render service list when `internal_assign`
- `list_public_doctors` RPC — add optional `p_organisation_id` filter (or create a separate `list_org_services` RPC)

### 3d. Disable Ratings/Reviews Per Organisation

**Recommendation:** Add `show_ratings` and `show_reviews` booleans to `organisation_config`.

- MyE-Doctor: `show_ratings: true`, `show_reviews: true` (current)
- CIBA: `show_ratings: false`, `show_reviews: false`

**Files to modify:**
- `src/pages/DoctorDiscovery.tsx` — conditionally hide rating stars and review sections
- `list_public_doctors` RPC — optionally exclude rating summary when org config says so

### 3e. Internal Clinician Assignment Service

**Recommendation:** Create a new edge function `assign-clinician` and a new table `clinician_assignment_queue`.

**Flow:**
1. Patient selects service type + preferred time → booking is created with `doctor_id: NULL`
2. Appointment status: `pending_assignment` (new status)
3. `assign-clinician` edge function:
   - Queries `doctors` table for org members matching the service type
   - Filters by availability (using `AvailabilityService`)
   - Selects the best available clinician (round-robin, load-balanced, or rules-based)
   - Updates `appointments.doctor_id` and status to `pending_approval`
4. Optionally: admin/organisational-override to manually assign

**New table:**
```
clinician_assignment_queue
  id UUID PK
  appointment_id UUID FK
  organisation_id UUID FK
  service_type TEXT
  preferred_date DATE
  preferred_time TEXT
  status TEXT  -- 'pending', 'assigned', 'failed'
  assigned_doctor_id UUID FK NULL
  assigned_at TIMESTAMPTZ NULL
  created_at TIMESTAMPTZ DEFAULT now()
```

### 3f. Appointment Model: Support doctor_id = NULL

**Current state:** `appointments.doctor_id` is nullable (UUID, no NOT NULL constraint).

**Good news:** The schema already allows `doctor_id` to be NULL. The issue is in the application logic:

- `BookingService.initiateBooking()` requires `doctorId` in input (line 320)
- `booking-initiate` edge function requires `payload.doctorId`
- `consultation_sessions` requires `doctor_id` (NOT NULL)
- `get_appointment_org_id()` function joins through `doctors` table

**Changes needed:**
- `BookingService.initiateBooking()`: make `doctorId` optional; when null, insert appointment with `doctor_id: NULL` and status `pending_assignment`
- `consultation_sessions`: allow `doctor_id` to be NULL until assignment
- `get_appointment_org_id()`: fallback to `appointments.organisation_id` when doctor is NULL
- Add `pending_assignment` to the appointment status check constraint

### 3g. CIBA Using Existing Pricing/Payment Infrastructure

**Yes, CIBA can use the existing infrastructure:**

- `pricing_profiles`, `pricing_rules`, `pricing_feature_flags` are all `organisation_id`-scoped
- CIBA can create its own pricing profile with service-type-based rules
- `platform_fee_rules` are org-scoped — CIBA can set its own commission rates
- `doctor_wallet` is org-scoped — CIBA doctors get their own wallets
- Payment processing (Paystack) is shared but amounts are per-appointment

**What CIBA cannot do today:**
- Price per service type (only per doctor type, duration, tier, consultation mode)
- Need to add `service_type` as a new `condition_type` in `pricing_rules`

**Recommendation:** Add `service_type` as a pricing rule condition type. This allows CIBA to set different base prices for different services without changing the pricing engine architecture.

---

## 4. Recommended Configuration Model

### organisation_config additions

| config_key | type | MyE-Doctor default | CIBA value |
|------------|------|--------------------|------------|
| `clinician_selection_mode` | text | `patient_select` | `internal_assign` |
| `show_ratings` | text | `true` | `false` |
| `show_reviews` | text | `true` | `false` |
| `show_doctor_directory` | text | `true` | `false` |
| `enable_service_types` | text | `false` | `true` |

### organisations table additions (or organisation_config)

| Column | Purpose |
|--------|---------|
| `booking_config` | JSONB — flexible config bag for booking behaviour |

---

## 5. Recommended Clinician-Assignment Approach

**Phase 3 implementation:**

1. **Simple round-robin** for MVP: assign the next available doctor matching the service type and time
2. **Availability check**: use existing `AvailabilityService.getAvailableSlots()` to verify the doctor is free
3. **Fallback**: if no doctor is available, return an error message ("No clinicians available for this time")
4. **Future**: load-balancing, skill-matching, admin override queue

**New edge function: `assign-clinician`**
- Input: `appointment_id`
- Logic: query available doctors for the org + service type, pick the first available, update appointment
- Called from: `booking-initiate` (when mode is `internal_assign`) or as a separate admin action

---

## 6. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `doctor_id` NULL breaks existing queries | High | Audit all queries that join on `doctor_id`; add COALESCE/fallback |
| `pending_assignment` status not in existing constraint | Medium | Add to check constraint in migration |
| `consultation_sessions.doctor_id` NOT NULL | Medium | Make nullable or create session only after assignment |
| Frontend routing assumes doctor selection | Medium | Add conditional routing based on `clinician_selection_mode` |
| Discovery page shows all doctors regardless of org | High | Add org filter to `list_public_doctors` RPC |
| CIBA service types not representable in current pricing | Medium | Add `service_type` condition type to pricing rules |
| Assignment algorithm complexity | Low | Start with simple round-robin; iterate |

---

## 7. Exact Recommendation for Phase 3

### Step 1: Add org-level booking configuration
- Extend `organisation_config` with `clinician_selection_mode`, `show_ratings`, `show_reviews`, `show_doctor_directory`, `enable_service_types`
- Seed MyE-Doctor with current defaults

### Step 2: Create `organisation_services` table
- For CIBA to define service types with pricing
- MyE-Doctor ignores this table

### Step 3: Make `list_public_doctors` org-aware
- Add optional `p_organisation_id` parameter
- When provided, filter by `doctors.organisation_id`
- When not provided, return all (backward compat)

### Step 4: Add `service_type` to pricing rules
- New `condition_type` value in `pricing_rules`
- Allows per-service pricing for CIBA

### Step 5: Add `pending_assignment` appointment status
- Update the check constraint
- Add to `normalizeAppointmentStatusRaw`

### Step 6: Make `doctor_id` optional in booking flow
- `BookingService.initiateBooking()`: accept optional `doctorId`
- When null: insert with `doctor_id: NULL`, status `pending_assignment`
- When not null: current flow (MyE-Doctor)

### Step 7: Create `assign-clinician` edge function
- Simple round-robin assignment
- Called after booking when mode is `internal_assign`

### Step 8: Frontend conditional rendering
- DoctorDiscovery: show doctor cards OR service cards based on config
- SlotSelection: show slot picker for selected doctor OR service+time picker
- Hide ratings/reviews when config says so

### Step 9: Ensure existing MyE-Doctor flow is untouched
- Default `clinician_selection_mode` = `patient_select`
- All existing code paths work when config is absent or defaulted
- No breaking changes to existing API contracts

---

## 8. What Does NOT Need to Change

- Payment processing (Paystack, wallet, hybrid) — works as-is
- Consultation room (WebRTC, chat) — works once doctor is assigned
- Doctor wallet and earnings — works as-is per-org
- Platform fee rules — works as-is per-org
- Doctor registration and approval workflow — works as-is
- Patient registration — works as-is
- Reschedule flow — works as-is (after doctor is assigned)
- Promotion system — works as-is
- Admin/COO portals — work as-is

---

## 9. Summary Table

| Capability | MyE-Doctor | CIBA Wellness | Current Support |
|------------|-----------|---------------|-----------------|
| Patient selects doctor | ✅ | ❌ | ✅ Built-in |
| Internal doctor assignment | ❌ | ✅ | ❌ Not built |
| Service-type selection | ❌ | ✅ | ❌ Not built |
| Doctor directory visible | ✅ | ❌ | ❌ No toggle |
| Ratings/reviews shown | ✅ | ❌ | ❌ No toggle |
| Per-org pricing | ✅ | ✅ | ✅ Phase 2 |
| Per-org payment processing | ✅ | ✅ | ✅ Shared Paystack |
| Per-org wallet/earnings | ✅ | ✅ | ✅ Phase 2 |
| Per-org branding | ✅ | ✅ | ✅ Phase 2 |
| Consultation modes | ✅ | ✅ | ✅ Built-in |
| Appointment with NULL doctor | ❌ | ✅ | ⚠️ Schema allows, logic doesn't |
