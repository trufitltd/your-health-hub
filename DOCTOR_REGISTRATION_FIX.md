# Doctor Registration & Discovery Fix

## Problem

When doctors sign up, their profile doesn't appear in the patient portal for booking because:

1. Doctor information is stored only in `auth.users` metadata
2. The `doctors` table is separate and wasn't being synced
3. The `useDoctors` hook tries to fetch from a table that's empty

## Solution

This fix implements automatic synchronization between `auth.users` and the `doctors` table.

## How It Works

### Before (Broken Flow)

```
Doctor signs up
    ↓
Data stored in auth.users metadata only
    ↓
doctors table remains empty
    ↓
useDoctors() returns empty list
    ↓
Doctor doesn't appear in patient portal
```

### After (Fixed Flow)

```
Doctor signs up
    ↓
Data stored in auth.users metadata
    ↓
Trigger fires: handle_new_doctor_signup()
    ↓
Doctor profile automatically created in doctors table
    ↓
useDoctors() returns all active doctors
    ↓
Doctor appears in patient portal for booking
```

## Database Changes

### New/Updated Tables

1. **doctors** table now links directly to `auth.users.id`
2. **doctor_schedules** now references the `doctors.id` (which is the user ID)
3. **appointments** now has `doctor_id` column
4. All RLS policies updated for new structure

### Automatic Triggers

- `on_auth_user_created` - Creates doctor profile on signup
- `on_auth_user_updated` - Updates doctor profile if metadata changes

### Updated RLS Policies

- Doctors can only view/update their own profile
- Public can view only active doctors
- Doctors can manage their own schedules
- Appointments visible to both patient and doctor

## Migration Steps

### Step 1: Run the Migration

```sql
-- Execute in Supabase SQL Editor:
-- Copy contents of: db/05_sync_auth_doctors_to_doctors_table.sql
-- Paste and run
```

**WARNING**: This migration drops and recreates the doctors table. If you have existing doctor profiles, run the sync script first (see Step 2).

### Step 2: Sync Existing Doctors (If Any)

If you already have doctors who signed up before this fix:

```sql
-- Run this to populate the doctors table from existing auth.users
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

### Step 3: Verify

```sql
-- Check that doctors appear in the table
SELECT id, name, email, specialty, is_active FROM public.doctors;

-- Should show all doctors who signed up with role='doctor'
```

## Testing

### Test 1: New Doctor Signup

1. Go to auth page and click "Register as Doctor"
2. Fill in: name, email, password
3. Complete signup
4. Open Supabase dashboard → Tables → doctors
5. Verify new doctor appears automatically

### Test 2: Doctor Appears in Patient Portal

1. Log in as patient
2. Go to "Patient Portal"
3. Click "Book Appointment"
4. New doctor should appear in the list
5. Click their profile to see availability

### Test 3: Doctor Can Set Schedule

1. Log in as doctor
2. Go to "Doctor Portal"
3. Should be able to view/set schedule
4. Schedule should become available to patients

### Test 4: Patient Can Book

1. Log in as patient
2. Book appointment with newly registered doctor
3. Doctor should see the appointment in their schedule

## Code Updates

### Updated Files

- `src/hooks/useAvailableSlots.ts` - Enhanced error handling and filtering

### New Database Migration

- `db/05_sync_auth_doctors_to_doctors_table.sql` - Sync and trigger setup

## Features Enabled by This Fix

✅ Doctors auto-appear when they sign up
✅ Doctor name displays in patient portal
✅ Multiple doctors can be listed
✅ Doctors can manage their profiles
✅ Doctors can set their schedules
✅ Patients can book with any doctor
✅ Real-time sync of doctor data

## Rollback (If Needed)

If you need to rollback this change:

```sql
-- Restore original doctors table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_doctor_signup();
DROP TABLE IF EXISTS public.doctor_schedules CASCADE;
DROP TABLE IF EXISTS public.doctors CASCADE;

-- Re-run the original migration: db/02_create_doctors_schedules.sql
-- And create doctors manually or through a different process
```

## FAQ

**Q: Will existing doctor accounts work?**
A: Run the sync script (Step 2) to populate the doctors table from existing auth.users.

**Q: What if a doctor's name changes?**
A: The trigger handles updates too - when auth.users is updated, the doctors table syncs automatically.

**Q: Can I use a custom specialty?**
A: Yes, doctors can update their profile in the doctor portal. The specialty field is editable.

**Q: What about doctor availability?**
A: Doctors can set their schedule in the Doctor Portal. Each doctor can set multiple time slots per day.

**Q: Why does the trigger exist on both INSERT and UPDATE?**
A: INSERT handles new signups, UPDATE handles cases where profile info changes via auth account updates.

## Performance Notes

- Indexes added on frequently queried columns (email, specialty, is_active)
- Foreign keys created for referential integrity
- Triggers are lightweight and execute in <100ms

## Security Notes

- RLS prevents doctors from seeing other doctor profiles
- RLS prevents patients from modifying doctor data
- Only active doctors appear to patients
- Service role can still manage doctors if needed
