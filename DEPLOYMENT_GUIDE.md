# Doctor Schedule System - Deployment & Troubleshooting

## Deployment Order (CRITICAL)

Run migrations **in this exact order** in Supabase SQL Editor:

### Step 1: Doctor Sync (if not already done)

```sql
-- Paste entire contents of: db/05_sync_auth_doctors_to_doctors_table.sql
```

**What it does:**

- Creates `doctors` table linked to `auth.users.id`
- Creates triggers to auto-sync doctor signups
- Sets up RLS policies

**Verify:**

```sql
SELECT COUNT(*) FROM public.doctors WHERE is_active = true;
```

Should show at least your one signed-up doctor.

---

### Step 2: Update Schedules Migration

```sql
-- Paste entire contents of: db/02_create_doctors_schedules.sql
```

**What it does:**

- Creates/updates `doctor_schedules` table
- Adds RLS policies for schedule management
- Creates `available_slots` view

**Verify:**

```sql
SELECT * FROM public.doctor_schedules LIMIT 1;
```

Should return doctor schedule structure.

---

### Step 3: Cleanup & Initialize (IMPORTANT!)

```sql
-- Paste entire contents of: db/06_cleanup_and_verify_schedules.sql
```

**What it does:**

- Deletes orphaned schedules for inactive doctors
- Creates default schedules (Mon-Fri 9-5) for any doctor without schedules
- Verifies RLS policies are correct
- Ensures all doctors have `is_active = true`

**Verify:**

```sql
-- Check if your doctor has schedules
SELECT * FROM public.doctor_schedules
WHERE doctor_id = (SELECT id FROM public.doctors LIMIT 1)
ORDER BY day_of_week;
```

Should show 5 rows (Mon-Fri with 09:00-17:00 times).

---

## Verification Checklist

Run these queries to verify everything is set up correctly:

### 1. Doctor Profile Exists

```sql
SELECT id, name, email, is_active FROM public.doctors
WHERE email = 'your-doctor@email.com';
```

✓ Should return 1 row with `is_active = true`

### 2. Doctor Has Schedules

```sql
SELECT day_of_week, start_time, end_time, is_available
FROM public.doctor_schedules
WHERE doctor_id = 'doctor-uuid-here'
ORDER BY day_of_week;
```

✓ Should return 5 rows (Monday=1 through Friday=5)

### 3. Doctor Appears in Patient Query

```sql
SELECT DISTINCT d.id, d.name, d.specialty
FROM public.doctors d
JOIN public.doctor_schedules ds ON d.id = ds.doctor_id
WHERE d.is_active = true AND ds.is_available = true
ORDER BY d.name;
```

✓ Your doctor should appear in results

### 4. RLS Policies Work

```sql
-- As authenticated user (any patient)
SELECT * FROM public.doctors WHERE is_active = true;
```

✓ Should return all active doctors (public view)

---

## Frontend Testing

### Test 1: Doctor Signup & Auto-Schedule

1. **Register as doctor**
   - Email: `testdoctor@example.com`
   - Password: `TestPassword123!`
   - Full name: `Dr. Test Doctor`
   - Role: Doctor
2. **Check database:**
   ```sql
   SELECT COUNT(*) FROM public.doctor_schedules
   WHERE doctor_id = (SELECT id FROM public.doctors WHERE email = 'testdoctor@example.com');
   ```
   ✓ Should return `5` (Mon-Fri)

### Test 2: Doctor Dashboard - Availability Tab

1. **Login as doctor**
2. **Navigate to Doctor Portal**
3. **Click "Availability" tab**
4. **Verify:**
   - ✓ All 7 days visible (Mon-Sun)
   - ✓ Mon-Fri toggled ON
   - ✓ Sat-Sun toggled OFF
   - ✓ Time slots show "09:00 - 17:00"

### Test 3: Edit Schedule

1. **Click "Edit" on Monday**
2. **Change start time to 08:00**
3. **Change end time to 18:00**
4. **Click "Save Schedule"**
5. **Verify:**
   - ✓ Toast shows success message
   - ✓ Database updated:
     ```sql
     SELECT start_time, end_time FROM public.doctor_schedules
     WHERE doctor_id = 'uuid' AND day_of_week = 1;
     ```
   - ✓ Should show `08:00` and `18:00`

### Test 4: Patient Booking Portal

1. **Logout and login as patient**
2. **Go to Patient Portal → Book Appointment**
3. **Verify:**
   - ✓ Doctor appears in "Available Doctors" list
   - ✓ Can select doctor
   - ✓ Available slots show for Monday (08:00-18:00)
   - ✓ Saturday/Sunday have no slots
   - ✓ Can book appointment for available time

---

## Troubleshooting

### Problem: No doctors appear in patient portal

**Check 1: Doctors table is empty**

```sql
SELECT COUNT(*) FROM public.doctors WHERE is_active = true;
```

- If 0: No doctors signed up yet. Have a doctor sign up.
- Solution: Go to Auth page, register as doctor

**Check 2: Doctor has no schedules**

```sql
SELECT COUNT(*) FROM public.doctor_schedules
WHERE doctor_id = 'doctor-uuid';
```

- If 0: Schedules weren't created
- Solution: Run migration 06_cleanup_and_verify_schedules.sql again

**Check 3: RLS policy blocking access**

- Run as authenticated user:

```sql
SELECT * FROM public.doctors WHERE is_active = true;
```

- If no results: RLS policy wrong
- Solution: Check that "Allow patients view active doctors" policy exists

**Check 4: is_active flag is false**

```sql
SELECT id, name, is_active FROM public.doctors;
```

- If is_active = false: Doctor deactivated
- Solution:

```sql
UPDATE public.doctors SET is_active = true WHERE id = 'doctor-uuid';
```

---

### Problem: Doctor dashboard doesn't show schedules

**Check 1: useSchedules hook not loading**

- Open browser DevTools → Console
- Look for errors about `schedules` or `useQuery`
- Check Network tab: are API calls failing?

**Check 2: Doctor ID mismatch**

- In Doctor Portal, check that `user.id` matches doctor in database:

```sql
SELECT id FROM public.doctors WHERE email = 'doctor@email.com';
-- Should match auth.users.id
```

**Check 3: Query returns empty**

```sql
SELECT * FROM public.doctor_schedules
WHERE doctor_id = (SELECT auth.uid());
```

- If no results: Run migration 06_cleanup_and_verify_schedules.sql

**Check 4: RLS policy blocking doctor**

- Doctor should be able to read own schedules:

```sql
-- As doctor user
SELECT * FROM public.doctor_schedules
WHERE doctor_id = auth.uid();
```

- Should return their schedules

---

### Problem: Can't edit schedule

**Check 1: Update permission denied**

```sql
-- As doctor user, try:
UPDATE public.doctor_schedules
SET start_time = '08:00'
WHERE doctor_id = auth.uid()
  AND day_of_week = 1;
```

- If denied: RLS policy issue
- Solution: Verify `doctor_id = auth.uid()` policy exists

**Check 2: Time validation error**

- Error message: "End time must be after start time"
- Check that you're setting end time AFTER start time
- Example: Start 09:00, End 17:00 ✓ | Start 17:00, End 09:00 ✗

**Check 3: Database constraint violation**

- Error: "duplicate key value violates unique constraint"
- Cause: Same day_of_week + start_time + end_time already exists
- Solution: Delete the old schedule first, then create new one

---

### Problem: Doctor not syncing from auth.users

**Check 1: Trigger fired**

- Signup should fire `handle_new_doctor_signup()` trigger
- Check Supabase logs for trigger execution

**Check 2: User role set correctly**

```sql
SELECT id, email, raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email = 'doctor@email.com';
```

- Should show role = `'doctor'`
- If not: Doctor didn't register as "Doctor" role

**Check 3: Trigger condition**

- Trigger only creates profile if `role = 'doctor'`
- Verify:

```sql
SELECT id, name FROM public.doctors
WHERE email = 'doctor@email.com';
```

- If no result: Trigger didn't fire

**Fix: Manually create doctor profile**

```sql
INSERT INTO public.doctors (id, name, email, is_active)
SELECT
  id,
  raw_user_meta_data->>'full_name',
  email,
  true
FROM auth.users
WHERE email = 'doctor@email.com'
  AND raw_user_meta_data->>'role' = 'doctor'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  is_active = true;
```

---

## Performance Optimization

### Database Indexes

All performance-critical indexes are created:

- ✓ `idx_doctor_schedules_doctor_id` - for doctor lookup
- ✓ `idx_doctor_schedules_day_of_week` - for filtering by day
- ✓ `idx_doctor_schedules_is_available` - for availability queries
- ✓ `idx_appointments_doctor_id` - for appointment lookup

### Query Optimization

The `useSchedules` hook uses:

- React Query caching (5-minute stale time)
- Query invalidation on mutations
- Parallel queries for raw + formatted schedules

### View Performance

The `available_slots` view:

- Uses efficient JOINs
- Filters by `is_active = true` early
- Counts appointments only in same time window

---

## Common Questions

**Q: Do I need to re-run migrations after each doctor signup?**
A: No! Migrations run once. Doctor signup triggers automatically create schedules.

**Q: Can doctors change their schedule after signup?**
A: Yes! Edit button in Availability tab. Changes saved immediately to database.

**Q: What happens if a doctor doesn't create a schedule?**
A: Run migration 06 to auto-create Mon-Fri 9-5 schedule.

**Q: Can patients see the schedules?**
A: Yes, indirectly. When booking, they see available slots based on schedules.

**Q: What time format should I use?**
A: 24-hour format. Examples: 09:00 (9 AM), 17:00 (5 PM), 14:30 (2:30 PM)

**Q: Can a doctor have multiple schedules for the same day?**
A: Currently, one schedule per day per doctor. Modify UNIQUE constraint to allow multiple.

---

## Rollback Steps

If something goes wrong:

1. **Remove schedules for specific doctor:**

```sql
DELETE FROM public.doctor_schedules WHERE doctor_id = 'uuid';
```

2. **Revert to old doctors table structure:**

   - Don't do this unless absolutely necessary
   - You'd lose auth.users sync

3. **Restore from backup:**
   - Use Supabase's point-in-time restore feature
   - Contact Supabase support if needed

---

## Next Steps

- [x] Deploy migrations in order
- [x] Verify doctor has schedules
- [x] Test doctor dashboard
- [x] Test patient booking
- [ ] Monitor Supabase logs for errors
- [ ] Collect user feedback
- [ ] Optimize performance if needed
