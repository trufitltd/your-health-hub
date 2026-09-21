# MYE Test Patient → Test Doctor Payment Bypass Report

## 1. What IDs identify Test Patient and Test Doctor?

Configured via **backend-only** environment variables:

```
MYE_TEST_PATIENT_USER_ID=<uuid>
MYE_TEST_DOCTOR_USER_ID=<uuid>
```

These are Supabase Auth user IDs (the `id` column in `auth.users`). The doctor ID is the `doctors.id` value (which equals the auth user ID since `doctors.id` references `auth.users.id`).

The IDs must be set in the Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets), NOT in `.env` or `VITE_*` variables.

## 2. Where is test mode configured?

In Supabase Edge Function environment variables:

```
MYE_TEST_MODE_ENABLED=true
MYE_TEST_PATIENT_USER_ID=<uuid>
MYE_TEST_DOCTOR_USER_ID=<uuid>
```

Set via: Supabase Dashboard → Project Settings → Edge Functions → Secrets

## 3. Is the configuration backend-only?

Yes. The `MYE_TEST_*` variables are `Deno.env.get()` calls inside the Edge Function runtime. They are never exposed to the browser. The frontend has no knowledge of test mode configuration.

## 4. How does the server authenticate Test Patient?

Via the standard Supabase Auth JWT. The `booking-initiate` Edge Function verifies the Bearer token:

```typescript
const { data: { user }, error: authError } = token
  ? await serviceClient.auth.getUser(token)
  : { data: { user: null }, error: new Error('No token') };
```

The authenticated `user.id` is compared against `MYE_TEST_PATIENT_USER_ID`.

## 5. How does it verify Test Doctor?

The `appointment.doctor_id` (set during appointment creation from the selected doctor) is compared against `MYE_TEST_DOCTOR_USER_ID`.

Both conditions must be true:
- `patientId === testPatientId`
- `appointment.doctor_id === testDoctorId`

## 6. Can the browser request payment bypass directly?

No. There is no `skipPayment` parameter in the `BookingInitiateRequest` type. The bypass is determined entirely server-side by matching the authenticated user ID and doctor ID against the configured test pair.

## 7. What happens if an ordinary patient submits the Test Doctor UUID?

The `can_book_doctor()` RPC (from migration `20260916000000`) rejects the booking because Test Doctor is private and the patient is not an authorized test patient. The booking never reaches the payment stage.

Even if it did reach `processPayment`, the test bypass check requires `patientId === testPatientId`, which would be false for an ordinary patient.

## 8. What happens if Test Patient books an ordinary doctor?

The test bypass check requires `appointment.doctor_id === testDoctorId`, which would be false for an ordinary doctor. Normal Paystack payment flow proceeds.

## 9. Is Paystack called for the authorized test pair?

No. The test bypass path returns `paymentInitialization: null` and `paystackAmountDue: 0` before any Paystack API call. No Paystack checkout is opened, no Paystack transaction is created.

## 10. What appointment state is created after bypass?

The appointment enters `pending_approval` — the same state as a successfully paid MyE appointment. The standard MyE doctor-approval lifecycle continues from there.

## 11. Is the normal MyE doctor approval lifecycle preserved?

Yes. The appointment is in `pending_approval` with a real `doctor_id`, `patient_id`, `date`, `time`, and `final_price`. The Test Doctor can approve, reject, reschedule, and enter consultation exactly as with any real booking.

## 12. How is the bypass represented in payment/audit data?

A `payments` record is created with:

| Field | Value |
|---|---|
| `status` | `completed` |
| `provider` | `test_bypass` |
| `payment_method` | `test_bypass` |
| `payment_reference` | `TEST-BYPASS-{timestamp}-{appointment_id_prefix}` |
| `provider_reference` | Same as payment_reference |
| `amount` | The real calculated price (e.g., ₦5,000) |
| `metadata` | `{ test_mode: true, payment_bypassed: true, reason: "authorized_test_patient_test_doctor_pair" }` |

Server-side console log: `TEST_PAYMENT_BYPASS` with `appointment_id`, `test_patient_user_id`, `test_doctor_id`, `timestamp`.

No fake Paystack reference is created.

## 13. Is the normal consultation price still calculated?

Yes. The full pricing pipeline runs: doctor tier, duration, consultation type, currency. The `final_price` on the appointment reflects the real price. Only the payment collection is bypassed.

## 14. Is any real doctor wallet balance credited?

No. The `addPendingEarning` call is skipped for test bypass. The test bypass path returns early before reaching wallet logic. No `doctor_wallet_transactions` record is created.

## 15. Can Test Doctor approve the appointment?

Yes. The appointment is in `pending_approval` with the Test Doctor's `doctor_id`. The doctor approval flow works identically to real bookings.

## 16. Can Test Doctor reschedule the appointment?

Yes. The `request_appointment_reschedule` RPC checks `auth.uid() = v_doctor_id`, which matches for the Test Doctor. The status check allows rescheduling from `pending_approval`.

## 17. Can Test Patient and Test Doctor enter the consultation normally?

Yes. After approval, the appointment is in `confirmed` status. The consultation room, video/chat/voice features, and post-consultation flow all work normally.

## 18. Is RLS still enforced?

Yes. The Edge Function uses the service client for privileged operations, but the user's JWT is verified. RLS policies on `appointments`, `payments`, and other tables remain active. The test bypass does not disable or bypass RLS.

## 19. Is authentication still required?

Yes. The `booking-initiate` Edge Function requires a valid Bearer token. The `auth.uid()` is verified and used as the `patientId`.

## 20. Is CIBA completely excluded?

Yes. The test bypass only triggers for the standard patient-select-doctor flow (`doctorId` is present). The CIBA internal-assignment flow (`serviceType` without `doctorId`) is not affected.

## 21. Does disabling MYE_TEST_MODE_ENABLED restore normal Paystack behavior?

Yes. If `MYE_TEST_MODE_ENABLED` is not `true` (or unset), the test bypass check is skipped entirely. All bookings go through the normal payment flow.

## 22. What files changed?

| File | Change |
|---|---|
| `supabase/functions/_shared/marketplace-types.ts` | Added `testBypass?: boolean` to `BookingInitiateResult` |
| `supabase/functions/_shared/services/BookingService.ts` | Added test bypass logic at start of `processPayment()` |
| `src/services/marketplaceTypes.ts` | Added `testBypass?: boolean` to `BookingInitiateResponse` |
| `src/pages/SlotSelection.tsx` | Handle `testBypass` in success path with test-specific toast |

## 23. Were migrations required?

No. The implementation uses existing `payments` columns (`provider`, `payment_method`, `metadata`) to store the test bypass record. No schema changes needed.

## 24. What tests passed?

172 existing tests pass. The test bypass logic is server-side in the Edge Function and cannot be unit-tested without a running Supabase instance. Manual end-to-end testing is required.

## Setup Instructions

1. Find the Test Patient and Test Doctor user IDs from the database:
   ```sql
   SELECT id FROM auth.users WHERE email = '<test_patient_email>';
   SELECT id FROM auth.users WHERE email = '<test_doctor_email>';
   ```

2. Set Edge Function secrets in Supabase Dashboard:
   ```
   MYE_TEST_MODE_ENABLED=true
   MYE_TEST_PATIENT_USER_ID=<uuid>
   MYE_TEST_DOCTOR_USER_ID=<uuid>
   ```

3. Deploy the updated Edge Functions:
   ```bash
   supabase functions deploy booking-initiate
   ```

4. Rebuild the frontend to pick up the `testBypass` type changes.
