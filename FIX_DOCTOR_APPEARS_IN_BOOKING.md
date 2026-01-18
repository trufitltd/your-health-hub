# Quick Fix: Doctor Name Not Appearing in Patient Portal

## The Issue

When you sign up as a doctor, your name doesn't appear in the patient portal booking screen.

## The Root Cause

Doctor info is stored in the authentication system but not synced to the doctors table that the booking system reads from.

## The Fix (3 Steps)

### Step 1: Run Migration

Go to your Supabase project → SQL Editor and run:

```
db/05_sync_auth_doctors_to_doctors_table.sql
```

### Step 2: Sync Existing Doctors (if you have any)

If doctors already signed up before the fix, run this in SQL Editor:

```sql
INSERT INTO public.doctors (id, name, email, is_active)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  u.email,
  true
FROM auth.users u
WHERE u.raw_user_meta_data->>'role' = 'doctor'
  AND u.id NOT IN (SELECT id FROM public.doctors)
ON CONFLICT (id) DO NOTHING;
```

### Step 3: Test

1. Sign up as a new doctor
2. Log in as a patient
3. Go to Patient Portal → Book Appointment
4. Your doctor name should now appear in the list

## What Changed

### Before

- Doctor signs up
- Info stored only in auth.users
- doctors table is empty
- Booking shows no doctors

### After

- Doctor signs up
- Info automatically synced to doctors table
- doctors table has all active doctors
- Booking shows all doctors

## How It Works Now

**Automatic Sync:**

- When a doctor signs up → automatic trigger creates their profile
- When a doctor updates their account → profile auto-updates
- Patients see all active doctors in booking

**Doctor Control:**

- Doctors can update their profile (name, specialty, phone, bio)
- Doctors can set their availability schedule
- Doctors can activate/deactivate their profile

## Files Changed

✅ `db/05_sync_auth_doctors_to_doctors_table.sql` (New)
✅ `src/hooks/useAvailableSlots.ts` (Updated)
✅ `DOCTOR_REGISTRATION_FIX.md` (Documentation)

## Verification

Check that it's working:

```sql
-- Open Supabase SQL Editor and run:
SELECT id, name, email, specialty, is_active FROM public.doctors;
```

You should see all doctors who signed up with role='doctor'.

## Next Steps

After applying this fix, doctors can:

1. Complete their profile in Doctor Portal
2. Set their availability schedule
3. Start receiving patient appointments

Patients can:

1. See all doctors in the booking system
2. View doctor availability
3. Book appointments with any doctor

## Need Help?

See detailed documentation:

- `DOCTOR_REGISTRATION_FIX.md` - Full explanation and troubleshooting
- `db/05_sync_auth_doctors_to_doctors_table.sql` - Migration code
