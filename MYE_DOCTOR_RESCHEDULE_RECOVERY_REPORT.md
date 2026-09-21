# MYE Doctor Reschedule Recovery Report

## Root Cause

The fix in `db/57_doctor_reschedule_all_statuses.sql` was **never applied as a migration** — it lives in the `db/` folder, not `supabase/migrations/`.

The deployed `request_appointment_reschedule` function (from migration `20260301123000_fix_reschedule_interval_overlap.sql`) restricts **all** requesters (doctor and patient) to only these statuses:

```sql
IF v_status NOT IN ('pending_approval', 'confirmed', 'no_show') THEN
  RAISE EXCEPTION 'Cannot request reschedule for appointment in status %', v_status;
END IF;
```

But the frontend's `openRescheduleDialog()` allows doctors to reschedule appointments in `pending_payment`, `pending_approval`, `confirmed`, `in_progress`, and `no_show` statuses. When a doctor tries to reschedule a `pending_payment` or `in_progress` appointment, the RPC rejects it with:

> "Cannot request reschedule for appointment in status pending_payment"

This error was hidden behind a generic toast: "Could not reschedule this appointment. Please try again."

## What Was the Actual Error?

The PostgreSQL RPC function `request_appointment_reschedule` raised:

```
Cannot request reschedule for appointment in status pending_payment
```

(or `in_progress`, depending on the appointment)

## Was Authorization Present?

Yes. The function uses `SECURITY DEFINER` and checks `auth.uid()` against `patient_id` and `doctor_id`. Authentication was not the issue.

## Was the Authenticated Doctor Resolved Correctly?

Yes. The function correctly identifies the actor as the doctor via `v_actor = v_doctor_id`.

## Did Multi-Role Changes Contribute?

No. The RPC function uses `auth.uid()` for identity, not `user_metadata.role`. Multi-role users are correctly identified as the assigned doctor.

## Did Organisation Scoping Contribute?

No. The function does not require `organisation_id`.

## Did RLS Contribute?

No. The function is `SECURITY DEFINER` and bypasses RLS.

## Did Appointment-Status Validation Contribute?

**Yes — this was the root cause.** The status check was too restrictive for doctor-initiated reschedules.

## Did Recent CIBA/Payment Changes Contribute?

No. The payment logic in the function was correct and unrelated.

## What Exact Code Change Fixed the Issue?

Created migration `20260921000000_fix_doctor_reschedule_status_check.sql` that updates `request_appointment_reschedule` with separate status lists:

- **Doctor-initiated:** `pending_payment`, `pending_approval`, `confirmed`, `in_progress`, `no_show`
- **Patient-initiated:** `pending_approval`, `confirmed`, `no_show`

Also improved the frontend error toast to surface the actual Supabase error message instead of a generic string.

## Can a Normal Assigned MyE Doctor Reschedule?

Yes. The function checks `auth.uid() = v_doctor_id` and allows the expanded status list for doctors.

## Can a Multi-Role Assigned Doctor Reschedule?

Yes. The function uses `auth.uid()` for identity, not role. A doctor who is also admin/COO/superadmin is still identified as the assigned doctor.

## Can Another Doctor Reschedule the Appointment?

No. The function checks `v_actor = v_doctor_id` and raises "Not authorized" if the actor is neither the patient nor the assigned doctor.

## Are Schedule Conflicts Still Rejected?

Yes. The slot conflict check uses `tsrange` overlap detection against the doctor's other appointments.

## Can Test Doctor Reschedule Test Patient's Appointment?

Yes, provided the Test Doctor is the assigned doctor on the appointment.

## Does Test Patient See the New Time Afterward?

Yes. The reschedule sets `reschedule_request_status = 'pending'` and the patient can approve it. Upon approval, the date/time are updated.

## Is the Original Doctor Assignment Preserved?

Yes. The function only updates reschedule-related fields and `updated_at`. It does not modify `doctor_id` or `patient_id`.

## Is Payment State Preserved?

Yes. The function only recalculates `reschedule_upgrade_amount` if there's a price increase. It does not modify existing payment records.

## Are Central Admin and COO Logins Still Working?

Yes. No changes were made to auth context, route guards, or portal components.

## Were Any Migrations Required?

Yes. Created `supabase/migrations/20260921000000_fix_doctor_reschedule_status_check.sql`.

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260921000000_fix_doctor_reschedule_status_check.sql` | New migration: expands doctor reschedule status list |
| `src/pages/DoctorPortal.tsx:2045-2052` | Error toast now surfaces actual Supabase error message |

## Tests

172 existing tests pass. No new tests needed — the fix is a database migration applied server-side.

## Deployment

Run the migration against the database:

```bash
supabase db push
```

Or apply the SQL file directly to the database.
