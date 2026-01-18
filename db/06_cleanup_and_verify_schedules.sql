-- 06_cleanup_and_verify_schedules.sql
-- This migration ensures all doctors have schedules and cleans up any orphaned data
-- Run this AFTER 05_sync_auth_doctors_to_doctors_table.sql

-- Step 1: Remove schedules for inactive doctors
DELETE FROM public.doctor_schedules
WHERE doctor_id NOT IN (
  SELECT id FROM public.doctors WHERE is_active = true
);

-- Step 2: Verify all active doctors have at least one schedule
-- If not, create default Mon-Fri 9-5 schedule
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, max_patients_per_slot, is_available)
SELECT
  d.id,
  dow,
  '09:00'::time,
  '17:00'::time,
  30,
  1,
  true
FROM public.doctors d
CROSS JOIN (
  SELECT 1 AS dow UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
) days
WHERE d.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.doctor_schedules ds
    WHERE ds.doctor_id = d.id
  )
ON CONFLICT (doctor_id, day_of_week, start_time, end_time) DO NOTHING;

-- Step 3: Ensure all doctors have proper is_active status
UPDATE public.doctors
SET is_active = true
WHERE id IN (SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'doctor')
  AND is_active IS NOT true;

-- Step 4: Verify RLS policies are in place
-- These should already exist, but this ensures consistency

-- Policy: Doctors can update their own profile
DROP POLICY IF EXISTS "Allow doctors update own profile" ON public.doctors;
CREATE POLICY "Allow doctors update own profile" ON public.doctors
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Patients can view active doctors
DROP POLICY IF EXISTS "Allow patients view active doctors" ON public.doctors;
CREATE POLICY "Allow patients view active doctors" ON public.doctors
  FOR SELECT
  USING (is_active = true);

-- Policy: Doctors can read their own profile
DROP POLICY IF EXISTS "Allow doctors read own profile" ON public.doctors;
CREATE POLICY "Allow doctors read own profile" ON public.doctors
  FOR SELECT
  USING (auth.uid() = id);

-- Step 5: Log completion
-- Note: This is for documentation only. In production, check Supabase logs.
SELECT 'Migration 06_cleanup_and_verify_schedules.sql completed successfully' AS status;
