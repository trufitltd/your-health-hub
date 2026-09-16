# Phase 4: Assignment Operations Report

**Status:** ✅ COMPLETE  
**Date:** 2026-08-30  
**Tests:** 122 passing (22 original + 21 Phase 2 + 39 Phase 3 + 40 Phase 4)

---

## Executive Summary

Phase 4 makes CIBA's internal clinician assignment production-ready. After successful payment, the system now automatically assigns a clinician using the 8-step pipeline — no manual trigger required. Assignments are idempotent, concurrent-safe, and include retry/failure handling. Organisation admins receive a dashboard to view and manage assignments, and patients receive notifications when a clinician is assigned. MyE-Doctor remains completely unchanged.

---

## Architecture Implemented

### Automatic Assignment Trigger

```
Payment Success → finalizeSuccessfulPayment()
  → moveAppointmentToApprovalReady()
    → Detects internal assignment (!doctor_id && service_type)
    → Moves to pending_assignment
    → Triggers ClinicianAssignmentService.assignClinician()
      → If succeeds: appointment → pending_approval (patient notified)
      → If fails: appointment stays pending_assignment (retry mechanism)
    → Payment webhook always returns 200 (assignment failure does not block payment)
```

### Key Design Decisions

1. **Non-blocking assignment**: Payment webhook always succeeds. Assignment failures are logged and retried later.
2. **Optimistic locking**: Atomic `UPDATE WHERE status='pending_assignment' AND doctor_id IS NULL` prevents concurrent assignment.
3. **Retry with backoff**: Max 5 retries, 30-minute timeout between attempts, manual override after exhaustion.
4. **Org-scoped isolation**: Assignment dashboard respects RLS — org admins see only their org's data.

---

## Automatic Assignment Architecture

### Trigger Mechanism

**Primary trigger** — `BookingService.moveAppointmentToApprovalReady()`:
- After payment success, detects internal assignment by checking `!doctor_id && service_type`
- Moves appointment to `pending_assignment`
- Immediately calls `ClinicianAssignmentService.assignClinician()`
- Assignment runs synchronously within the payment confirmation flow
- If assignment succeeds, appointment moves to `pending_approval` in the same request
- If assignment fails, appointment stays in `pending_assignment` for retry

**Re-trigger** — `BookingService.finalizeSuccessfulPayment()`:
- If appointment is already in `pending_assignment` (e.g., duplicate webhook), attempts assignment again
- Handles the case where a previous assignment attempt failed

**Retry trigger** — `retry-assignments` edge function:
- Processes stuck `pending_assignment` appointments
- Can be called by cron job, admin, or frontend
- Finds appointments with `retry_count < 5` and no recent attempt (30min timeout)

### Flow Diagrams

**Successful assignment (happy path):**
```
Patient pays → Payment verified → pending_assignment → Auto-assign → pending_approval → Doctor notified
```

**Assignment failure with retry:**
```
Patient pays → Payment verified → pending_assignment → Auto-assign FAILS → pending_assignment (retry_count: 1)
  → ... 30 minutes pass ...
  → retry-assignments called → Auto-assign FAILS → pending_assignment (retry_count: 2)
  → ... (up to 5 retries) ...
  → retry_count: 5 → Admin notified → Manual assignment required
```

**Concurrent payment (duplicate webhook):**
```
Webhook 1: finalize → pending_assignment → Auto-assign → pending_approval ✓
Webhook 2: finalize → already in pending_approval → alreadyProcessed: true (no re-assignment)
```

---

## Idempotency and Concurrency Strategy

### Idempotency

| Scenario | Handling |
|----------|----------|
| Duplicate webhook | `finalizeSuccessfulPayment()` returns `alreadyProcessed: true` if status is already `pending_assignment` or higher |
| Re-trigger on stuck appointment | Attempts assignment — if already assigned, atomic UPDATE returns 0 rows affected |
| Manual reassignment | `assignSpecificClinician()` checks status is `pending_assignment` before proceeding |

### Concurrency Prevention

The assignment uses an **optimistic locking** pattern:

```sql
UPDATE appointments
SET doctor_id = $1, status = 'pending_approval', ...
WHERE id = $2
  AND status = 'pending_assignment'
  AND doctor_id IS NULL
```

- If two processes try to assign simultaneously, only one will match the WHERE clause
- The other returns 0 rows affected → treated as "concurrently modified"
- No database locks, no deadlocks, no blocking

### Race Condition Scenarios

| Scenario | Result |
|----------|--------|
| Two auto-assignment attempts | First succeeds, second finds status already `pending_approval` → rejected |
| Auto-assign + manual assign | First to execute atomic UPDATE wins |
| Webhook + client confirm | Both call `finalizeSuccessfulPayment()` — first to detect status wins |
| Payment confirm + retry-assign | Retry finds appointment already assigned → rejected |

---

## Retry/Failure Handling

### Retry Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `MAX_RETRY_COUNT` | 5 | Max automatic attempts before manual intervention |
| Timeout | 30 minutes | Minimum time between retry attempts |
| Batch size | 10 | Max appointments processed per retry run |

### Retry Flow

1. `retry-assignments` edge function queries for stuck appointments:
   - Status = `pending_assignment`
   - `assignment_retry_count < 5`
   - Either no previous attempt OR last attempt > 30 minutes ago
2. For each stuck appointment:
   - Increment `assignment_retry_count`
   - Set `last_assignment_attempt_at` to now
   - Call `assignClinician()`
   - If succeeds: reset retry counters
   - If fails: record failure reason
   - If retries exhausted OR non-retryable failure: notify org admins

### Failure Categories

| Failure | Retryable? | Action |
|---------|------------|--------|
| No active doctors in org | No | Mark failed, notify admins |
| No qualified clinicians (specialty) | No | Mark failed, notify admins |
| No schedule for day of week | Yes | Retry later |
| All clinicians have conflicts | Yes | Retry later (slots may free up) |
| Concurrent modification | No | Another process assigned |
| Service not found | No | Mark failed, notify admins |
| Max retries reached | No | Manual assignment required |

### Retry Counters (on `appointments` table)

| Column | Type | Purpose |
|--------|------|---------|
| `assignment_retry_count` | INTEGER DEFAULT 0 | Number of automatic attempts |
| `last_assignment_attempt_at` | TIMESTAMPTZ NULL | When last attempt was made |
| `assignment_failed_reason` | TEXT NULL | Reason for latest failure |

---

## Admin Assignment Dashboard

### Location

`src/components/admin/AdminAssignmentDashboard.tsx` — added as "Assignments" tab in CentralAdmin.

### Features

| Feature | Description |
|---------|-------------|
| View queue | Shows all assignment queue entries with patient name, service, date/time, org, status, doctor, failure reason |
| Org filter | Platform superadmins can filter by organisation; org admins see only their org |
| Status filter | Filter by pending/assigned/failed |
| Retry all | Button to trigger `retry-assignments` for all stuck appointments |
| Manual retry | Per-row retry button for failed appointments |

### Security

- **RLS on `assign_clinician_queue`**: Only org admins and platform superadmins can read
- **Org scoping**: Org admins see only their org's assignments (enforced by RLS)
- **Platform superadmins**: Can see all orgs, filter by specific org
- **MyE-Doctor isolation**: Central Admin shows all data; the Assignments tab respects the same RLS

---

## Notification Workflow

### Patient Notification (on successful assignment)

**Trigger**: `ClinicianAssignmentService.assignClinician()` succeeds  
**Channels**: Push notification + SMS (if phone available)  
**Content**:
- Push: `{brand_name} - Clinician Assigned` / `Dr. {name} has been assigned to your {service} appointment on {date} at {time}.`
- SMS: Same content via Twilio

**Implementation**: `notifyPatientAssigned()` in `_shared/notification-helpers.ts`
- Non-blocking: notification failure does not affect assignment success
- Uses existing `send-push` and `send-sms` edge functions
- Resolves brand name from `organisation_config`

### Admin Notification (on assignment failure)

**Trigger**: Retry count reaches max (5) OR non-retryable failure  
**Channels**: Push notification to all org admins  
**Content**:
- Push: `{brand_name} - Assignment Failed` / `Automatic clinician assignment failed for {patient}'s {service} on {date} at {time}. Reason: {reason}. Manual assignment required.`

**Implementation**: `notifyAdminAssignmentFailed()` in `_shared/notification-helpers.ts`
- Queries `organisation_members` for org_admin role
- Sends push notification to each admin
- Non-blocking: notification failure is logged but does not affect the assignment system

---

## Database Changes

### Migration: `20260830000000_phase4_assignment_operations.sql`

#### Columns Added

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| `appointments` | `assignment_retry_count` | INTEGER DEFAULT 0 | Tracks automatic retry attempts |
| `appointments` | `last_assignment_attempt_at` | TIMESTAMPTZ NULL | When last retry was attempted |
| `appointments` | `assignment_failed_reason` | TEXT NULL | Reason for latest failure |

#### Indexes Added

| Index | Purpose |
|-------|---------|
| `idx_appointments_pending_assignment` | Fast lookup of stuck pending_assignment appointments |
| `idx_appointments_assignment_retry` | Retry query optimization |
| `idx_assign_queue_org_status` | Org-scoped queue queries |
| `idx_assign_queue_appointment` | Appointment lookup in queue |

---

## Files Modified

### Backend (Edge Functions & Services)

| File | Change |
|------|--------|
| `supabase/migrations/20260830000000_phase4_assignment_operations.sql` | New migration — retry columns, indexes |
| `supabase/functions/_shared/services/ClinicianAssignmentService.ts` | Idempotency (atomic WHERE), retry logic, notification integration, `processStuckAppointments()` |
| `supabase/functions/_shared/services/BookingService.ts` | Import ClinicianAssignmentService, `moveAppointmentToApprovalReady()` auto-triggers assignment for internal_assign, `finalizeSuccessfulPayment()` re-triggers on stuck appointments |
| `supabase/functions/_shared/notification-helpers.ts` | New — `notifyPatientAssigned()`, `notifyAdminAssignmentFailed()` |
| `supabase/functions/assign-clinician/index.ts` | Unchanged (manual trigger still works) |
| `supabase/functions/retry-assignments/index.ts` | New edge function — processes stuck appointments |

### Frontend

| File | Change |
|------|--------|
| `src/services/marketplaceTypes.ts` | Added `pending_assignment` to `AppointmentStatus` type and `isSlotBlockingAppointmentStatus` |
| `src/components/admin/AdminAssignmentDashboard.tsx` | New — org-scoped assignment queue dashboard |
| `src/pages/CentralAdmin.tsx` | Added "Assignments" tab with `AdminAssignmentDashboard` |

### Tests

| File | Tests |
|------|-------|
| `src/test/phase4-assignment-operations.test.ts` | 40 tests covering auto-trigger, idempotency, concurrency, retry, double-booking, manual assignment, notifications, isolation, MyE-Doctor regression |

---

## Tests and Results

```
 Test Files  5 passed (5)
      Tests  122 passed (122)

 ✅ src/test/auth.test.ts (6 tests)
 ✅ src/test/multitenancy.test.ts (16 tests)
 ✅ src/test/multitenancy-services.test.ts (21 tests)
 ✅ src/test/phase3-internal-assignment.test.ts (39 tests)
 ✅ src/test/phase4-assignment-operations.test.ts (40 tests)
```

### Test Coverage

- Auto-trigger after payment (detection, flow, non-blocking)
- Idempotency (already assigned, already processed, duplicate webhooks)
- Concurrency (atomic WHERE, concurrent modification, race conditions)
- Retry mechanism (max count, timeout, retry count increment/reset, stuck detection, failure categories)
- Double-booking prevention (time overlap, conflict statuses)
- Manual assignment (org validation, schedule check, reassignment)
- Notifications (patient success, admin failure, brand config, non-blocking)
- Cross-organisation isolation (RLS, superadmin vs org admin)
- MyE-Doctor regression (standard flow unchanged, wallet earnings, doctor discovery, slot selection, pending_assignment in types and slot blocking)

---

## MyE-Doctor Regression Results

All existing MyE-Doctor functionality preserved:

| Feature | Status | Evidence |
|---------|--------|----------|
| Doctor discovery page | ✅ Unchanged | No Phase 4 imports or references |
| Doctor selection | ✅ Unchanged | `doctorId` still required for patient_select |
| Slot selection | ✅ Unchanged | `isInternalAssignment` check unchanged |
| Booking initiation | ✅ Unchanged | `initiateBooking()` with doctorId follows original path |
| Payment processing | ✅ Unchanged | `finalizeSuccessfulPayment()` standard path goes to `pending_approval` |
| Wallet earnings | ✅ Unchanged | Created immediately when `doctor_id` is present |
| Doctor approval | ✅ Unchanged | `pending_approval` status unchanged |
| Consultation room | ✅ Unchanged | WebRTC, chat work as before |
| Admin portals | ✅ Unchanged | Central Admin, COO, Doctor portals work |
| Default config | ✅ `patient_select` | MyE-Doctor seeded with patient_select mode |

**Verification**: 7/7 checks confirmed — ClinicianAssignmentService is only imported and instantiated in internal-assignment-gated code paths (`!doctor_id && service_type`).

---

## Known Limitations

1. **Retry scheduling is time-based, not event-based** — retries happen when `retry-assignments` is called (by cron, admin, or frontend). In a production system, this would be a scheduled Supabase cron job or database trigger.

2. **No real-time assignment status for patients** — patients don't see real-time updates when a clinician is assigned. They must refresh or navigate to see the status change. Phase 5 could add Supabase Realtime subscriptions.

3. **Admin dashboard is a tab in CentralAdmin** — not a standalone page. For organisations with their own admin portal, a dedicated route would be needed.

4. **No batch assignment** — each appointment is assigned individually. For high-volume scenarios, batch processing could be optimised.

5. **Notification delivery is best-effort** — push and SMS failures are logged but not retried. A dead-letter queue for failed notifications could improve reliability.

---

## Recommended Phase 5

1. **Scheduled retry cron job** — Supabase cron to call `retry-assignments` every 5 minutes
2. **Real-time assignment status** — Supabase Realtime subscriptions for patients to see when clinician is assigned
3. **Standalone admin portal** — Dedicated `/admin/assignments` route for organisation admins
4. **Assignment metrics dashboard** — Average assignment time, success rate, doctor utilisation, failure reasons
5. **Escalation rules** — Configurable escalation after N failures (e.g., SMS to COO)
6. **Doctor acceptance flow** — Allow assigned doctors to accept/decline before patient is notified
7. **Batch assignment** — Process multiple stuck appointments in parallel
8. **Notification retry queue** — Dead-letter queue for failed push/SMS notifications
9. **CIBA-specific admin portal** — Organisation-scoped admin interface with assignment management

---

## Edge Functions to Redeploy

For Phase 4 to be fully functional, deploy:

1. **`booking-initiate`** — already deployed in Phase 3 (no changes)
2. **`assign-clinician`** — already deployed in Phase 3 (no changes)
3. **`retry-assignments`** — new edge function
4. **`send-sms`** — already deployed in Phase 2 (no changes)
5. **`send-push`** — already deployed in Phase 2 (no changes)

**Pre-requisite:** Migration must be applied first:
1. `20260830000000_phase4_assignment_operations.sql`
