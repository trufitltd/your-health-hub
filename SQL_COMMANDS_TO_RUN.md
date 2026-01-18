# SQL Commands to Run - Copy & Paste

## IMPORTANT: Run these in Supabase SQL Editor in this exact order

---

## STEP 1: Run Doctor Sync Migration

**File:** `db/05_sync_auth_doctors_to_doctors_table.sql`

Copy the entire file contents and paste into Supabase SQL Editor. Click "Run".

After success, verify:

```sql
SELECT COUNT(*) as active_doctors FROM public.doctors WHERE is_active = true;
```

Should show at least 1 doctor.

---

## STEP 2: Update Schedules Migration

**File:** `db/02_create_doctors_schedules.sql`

Copy the entire file contents and paste into Supabase SQL Editor. Click "Run".

After success, verify:

```sql
SELECT COUNT(*) as schedule_tables FROM information_schema.tables
WHERE table_name = 'doctor_schedules';
```

Should show 1.

---

## STEP 3: Cleanup & Verify (CRITICAL)

**File:** `db/06_cleanup_and_verify_schedules.sql`

Copy the entire file contents and paste into Supabase SQL Editor. Click "Run".

This step:

- ✓ Removes orphaned schedules
- ✓ Creates default schedules for all doctors
- ✓ Fixes RLS policies
- ✓ Ensures all doctors have is_active = true

---

## STEP 4: Final Verification

Run these commands one by one:

### Check 1: Count active doctors

```sql
SELECT COUNT(*) FROM public.doctors WHERE is_active = true;
```

✓ Should be >= 1

### Check 2: Count doctor schedules

```sql
SELECT COUNT(*) FROM public.doctor_schedules;
```

✓ Should be >= 5

### Check 3: See all schedules for one doctor

```sql
SELECT d.name, ds.day_of_week, ds.start_time, ds.end_time, ds.is_available
FROM public.doctor_schedules ds
JOIN public.doctors d ON ds.doctor_id = d.id
ORDER BY d.name, ds.day_of_week;
```

✓ Should show multiple rows with Mon-Fri available

### Check 4: Verify view works

```sql
SELECT * FROM public.available_slots LIMIT 5;
```

✓ Should return slot data

---

## Troubleshooting If Something Fails

### If migration doesn't run:

1. Check for syntax errors in the SQL file
2. Ensure you're copy-pasting the entire file
3. Check Supabase error message
4. Try running it line by line to find the issue

### If doctor doesn't appear:

1. Have a doctor sign up first (register from Auth page)
2. Then run Step 3 again
3. This will create default schedules

### If migrations conflict:

1. Check Supabase logs for duplicate table errors
2. Run DROP commands if needed:

```sql
DROP TABLE IF EXISTS public.doctor_schedules CASCADE;
DROP POLICY IF EXISTS "Allow public select schedules" ON public.doctor_schedules;
```

3. Then re-run the migration

---

## After Deployment - Frontend Testing

### Test 1: Doctor Signup

1. Go to app: http://localhost:5173/auth?mode=register
2. Select "Doctor" role
3. Fill in email, password, name
4. Click "Create Account"
5. Check database:

```sql
SELECT * FROM public.doctors
WHERE email = 'your-test@email.com';
```

✓ Should show new doctor with is_active = true

### Test 2: Doctor Dashboard

1. Login with the doctor account
2. Should redirect to `/doctor-portal`
3. Click "Availability" tab
4. Should see all 7 days with times
5. Mon-Fri should be enabled (ON)
6. Sat-Sun should be disabled (OFF)

### Test 3: Edit Schedule

1. In Availability tab, click "Edit" on Monday
2. Change start time to 08:00
3. Change end time to 18:00
4. Click "Save Schedule"
5. Should see success toast
6. Check database:

```sql
SELECT start_time, end_time FROM public.doctor_schedules
WHERE day_of_week = 1
  AND doctor_id = (SELECT id FROM public.doctors
                   WHERE email = 'your-test@email.com');
```

✓ Should show 08:00 and 18:00

### Test 4: Patient Portal

1. Logout
2. Login as patient (or register new patient)
3. Go to Patient Portal → Book Appointment
4. Doctor should appear in the list
5. Select doctor to see available slots
6. Monday should show slots from 08:00-18:00 (because we edited it)

---

## Quick Reference

| File                        | What it does                            | When to run       |
| --------------------------- | --------------------------------------- | ----------------- |
| 05_sync_auth_doctors        | Links doctors to auth, creates triggers | First (one-time)  |
| 02_create_doctors_schedules | Creates schedules table                 | Second (one-time) |
| 06_cleanup_and_verify       | Creates default schedules, fixes RLS    | Third (one-time)  |

## If You Need to Re-run Step 3

If doctors still don't have schedules after step 3, run this:

```sql
-- This will create Mon-Fri 9-5 for ALL doctors
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time)
SELECT d.id, dow, '09:00'::time, '17:00'::time
FROM public.doctors d
CROSS JOIN (SELECT 1 as dow UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) days
WHERE d.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.doctor_schedules ds
    WHERE ds.doctor_id = d.id AND ds.day_of_week = dow
  )
ON CONFLICT (doctor_id, day_of_week, start_time, end_time) DO NOTHING;
```

---

## Support Commands

**See all doctors and their email:**

```sql
SELECT id, name, email, is_active FROM public.doctors ORDER BY created_at DESC;
```

**See all schedules for all doctors:**

```sql
SELECT d.name, 'Mon'::text as day_name, ds.day_of_week, ds.start_time, ds.end_time, ds.is_available
FROM public.doctor_schedules ds
JOIN public.doctors d ON ds.doctor_id = d.id
ORDER BY d.name, ds.day_of_week;
```

**Reset a doctor's schedule to default (Mon-Fri 9-5):**

```sql
-- First delete old schedules
DELETE FROM public.doctor_schedules
WHERE doctor_id = 'DOCTOR-UUID-HERE';

-- Then create new ones
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time)
VALUES
  ('DOCTOR-UUID-HERE', 1, '09:00', '17:00'),
  ('DOCTOR-UUID-HERE', 2, '09:00', '17:00'),
  ('DOCTOR-UUID-HERE', 3, '09:00', '17:00'),
  ('DOCTOR-UUID-HERE', 4, '09:00', '17:00'),
  ('DOCTOR-UUID-HERE', 5, '09:00', '17:00');
```

**Deactivate a doctor:**

```sql
UPDATE public.doctors SET is_active = false WHERE email = 'doctor@email.com';
```

**Reactivate a doctor:**

```sql
UPDATE public.doctors SET is_active = true WHERE email = 'doctor@email.com';
```

---

## Common Errors & Fixes

### "ERROR: relation "doctor_schedules" already exists"

```sql
DROP TABLE IF EXISTS public.doctor_schedules CASCADE;
-- Then re-run Step 2
```

### "ERROR: relation "doctors" does not exist"

```sql
-- Step 1 (doctor sync) hasn't been run yet
-- Run Step 1 first
```

### "ERROR: no unique or exclusion constraint matching given keys"

```sql
-- Drop the offending schedule and re-insert
DELETE FROM public.doctor_schedules WHERE doctor_id = 'uuid';
-- Re-run the insert
```

### "ERROR: schema "public" does not exist"

This shouldn't happen, but if it does, contact Supabase support.

---

**You're all set! Follow the 4 steps above and your doctor schedule system will be live.** ✓
