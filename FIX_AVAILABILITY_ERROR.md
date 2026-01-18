# Troubleshooting: "Failed to update availability" Error

## What Changed

I've updated the RLS policies for `doctor_schedules` to be more explicit about INSERT, UPDATE, and DELETE permissions. The issue was that the previous `FOR ALL` policy wasn't working correctly for all operations.

## How to Fix

### Step 1: Re-run the migrations with updated policies

1. **Delete old policies manually** (optional, but recommended):

   Go to Supabase SQL Editor and run:

   ```sql
   DROP POLICY IF EXISTS "Allow doctors manage own schedules" ON public.doctor_schedules;
   ```

2. **Re-run migration 05:**

   - Copy entire `db/05_sync_auth_doctors_to_doctors_table.sql`
   - Paste into Supabase SQL Editor
   - Click "Run"

3. **Re-run migration 02:**
   - Copy entire `db/02_create_doctors_schedules.sql`
   - Paste into Supabase SQL Editor
   - Click "Run"

### Step 2: Verify policies are correct

In Supabase SQL Editor, run:

```sql
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'doctor_schedules'
ORDER BY policyname;
```

You should see 4 policies:

- ✓ `Allow doctors delete own schedules`
- ✓ `Allow doctors insert own schedules`
- ✓ `Allow doctors update own schedules`
- ✓ `Allow public select schedules`

### Step 3: Test in Doctor Portal

1. Login as doctor
2. Go to Availability tab
3. Try toggling a day ON/OFF
4. Should see success toast (not error)

---

## What Was Fixed

**Old Policy:**

```sql
CREATE POLICY "Allow doctors manage own schedules" ON public.doctor_schedules
  FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
```

**New Policies (Explicit):**

```sql
-- SELECT
CREATE POLICY "Allow public select schedules" ON public.doctor_schedules
  FOR SELECT
  USING (true);

-- INSERT
CREATE POLICY "Allow doctors insert own schedules" ON public.doctor_schedules
  FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

-- UPDATE
CREATE POLICY "Allow doctors update own schedules" ON public.doctor_schedules
  FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- DELETE
CREATE POLICY "Allow doctors delete own schedules" ON public.doctor_schedules
  FOR DELETE
  USING (doctor_id = auth.uid());
```

---

## Why This Works Better

The `FOR ALL` policy sometimes doesn't work properly for all operations in Supabase. By explicitly defining:

- **SELECT**: Everyone can view (for patient booking)
- **INSERT**: Only the doctor can insert (when creating new day schedule)
- **UPDATE**: Only the doctor can update (when toggling or editing)
- **DELETE**: Only the doctor can delete (when removing schedule)

This ensures each operation has the correct permissions.

---

## If You Still Get an Error

1. **Check browser Console** (F12):

   - Look for the actual error message
   - It should now show more detail about what failed

2. **Verify you're logged in as a doctor:**

   ```sql
   -- In Supabase SQL Editor, check:
   SELECT * FROM auth.users LIMIT 1;
   -- Look for: raw_user_meta_data->>'role' = 'doctor'
   ```

3. **Check if doctor profile exists:**

   ```sql
   SELECT * FROM public.doctors WHERE id = 'YOUR-DOCTOR-UUID';
   ```

4. **Check if schedules exist:**
   ```sql
   SELECT * FROM public.doctor_schedules
   WHERE doctor_id = 'YOUR-DOCTOR-UUID';
   ```

---

## Quick Command to Re-Apply Just the Policies

If you only want to update the policies without re-running full migrations:

```sql
-- Drop old ones
DROP POLICY IF EXISTS "Allow doctors manage own schedules" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Allow public select schedules" ON public.doctor_schedules;

-- Create new explicit ones
CREATE POLICY "Allow public select schedules" ON public.doctor_schedules
  FOR SELECT
  USING (true);

CREATE POLICY "Allow doctors insert own schedules" ON public.doctor_schedules
  FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Allow doctors update own schedules" ON public.doctor_schedules
  FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Allow doctors delete own schedules" ON public.doctor_schedules
  FOR DELETE
  USING (doctor_id = auth.uid());
```

---

## What's Better Now

✅ More detailed error messages (shows actual database error)
✅ Explicit RLS policies for each operation
✅ Better error handling in frontend
✅ Console logs for debugging

Try toggling a schedule again - it should work now!
