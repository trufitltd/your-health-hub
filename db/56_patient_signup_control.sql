-- Add patient signup control columns to platform_signup_controls table
-- This extends the existing table used for doctor signup control
ALTER TABLE IF EXISTS public.platform_signup_controls ADD COLUMN IF NOT EXISTS patient_signup_open BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS public.platform_signup_controls ADD COLUMN IF NOT EXISTS patient_signup_closed_message TEXT NOT NULL DEFAULT 'Patient sign up has been closed for this round and will resume soon. Please keep checking the site.';

-- Create RPC function to get patient signup status
CREATE OR REPLACE FUNCTION get_patient_signup_status()
RETURNS TABLE(patient_signup_open BOOLEAN, patient_signup_closed_message TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    patient_signup_open,
    patient_signup_closed_message
  FROM public.platform_signup_controls
  WHERE id = true
  LIMIT 1;
$$;

-- Drop the old function if it exists with different signature
DROP FUNCTION IF EXISTS set_patient_signup_status(BOOLEAN, TEXT);

-- Create RPC function to set patient signup status
-- This mirrors the logic of set_doctor_signup_status to allow admin emails
CREATE OR REPLACE FUNCTION set_patient_signup_status(
  p_patient_signup_open BOOLEAN,
  p_patient_signup_closed_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_email  TEXT := lower(trim(COALESCE(auth.email(), '')));
  v_role   TEXT := lower(COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  ));
  v_is_admin BOOLEAN := false;
  v_message  TEXT := NULLIF(trim(COALESCE(p_patient_signup_closed_message, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 1. Role-based check (admin / coo in JWT metadata)
  IF v_role IN ('admin', 'coo') THEN
    v_is_admin := true;
  END IF;

  -- 2. admin_users table check (if the table exists)
  IF NOT v_is_admin AND to_regclass('public.admin_users') IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.admin_users au WHERE au.user_id = v_uid
    ) INTO v_is_admin;
  END IF;

  -- 3. profiles table check — user whose profile role is 'admin' or 'coo'
  IF NOT v_is_admin AND to_regclass('public.profiles') IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid AND p.role IN ('admin', 'coo')
    ) INTO v_is_admin;
  END IF;

  -- 4. Hardcoded admin email list (mirrors VITE_ADMIN_EMAILS on the frontend)
  IF NOT v_is_admin AND v_email <> '' THEN
    SELECT v_email = ANY(ARRAY[
      'tj@gmail.com',
      'myedoctoronline@gmail.com',
      'ramadan@gmail.com',
      'ibtisama.ramadan@gmail.com'
    ]) INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.platform_signup_controls
  SET 
    patient_signup_open = p_patient_signup_open,
    patient_signup_closed_message = COALESCE(v_message, 'Patient sign up has been closed for this round and will resume soon. Please keep checking the site.'),
    updated_at = now(),
    updated_by = v_uid
  WHERE id = true;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_patient_signup_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_patient_signup_status(BOOLEAN, TEXT) TO authenticated;