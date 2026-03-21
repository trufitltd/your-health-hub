-- 43_backfill_and_autosync_missing_registration_rows.sql
-- Goal:
-- 1) Backfill existing auth.users that are missing from BOTH doctor_registrations and patient_registrations.
-- 2) Add a safe future-sync trigger so new auth.users always get at least a patient_registrations row.
--
-- Notes:
-- - We intentionally do NOT auto-create doctor_registrations rows because that table requires
--   doctor-specific mandatory fields and could interfere with the doctor verification flow.
-- - This migration acts as a safety net only when neither registration row exists.

CREATE OR REPLACE FUNCTION public.ensure_auth_user_has_registration_row(
  p_user_id UUID,
  p_email TEXT,
  p_phone TEXT,
  p_full_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- If already registered as doctor or patient, do nothing.
  IF EXISTS (SELECT 1 FROM public.doctor_registrations dr WHERE dr.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.patient_registrations pr WHERE pr.user_id = p_user_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.patient_registrations (
    user_id,
    full_name,
    gender,
    age,
    phone_number,
    email,
    city,
    state,
    country,
    marital_status,
    emergency_contact_name,
    emergency_contact_phone,
    identification_type,
    identification_number,
    verification_status
  )
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_full_name), ''), 'User'),
    'other',
    18,
    COALESCE(NULLIF(p_phone, ''), 'N/A'),
    NULLIF(trim(COALESCE(p_email, '')), ''),
    'Unknown',
    'Unknown',
    'Unknown',
    'single',
    'Not Provided',
    COALESCE(NULLIF(p_phone, ''), 'N/A'),
    'hospital_id',
    p_user_id::text,
    'pending'
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Correct existing rows where full_name was accidentally stored as the email address.
UPDATE public.patient_registrations pr
SET full_name = meta.full_name
FROM (
  SELECT
    au.id AS user_id,
    NULLIF(trim(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name')), '') AS full_name
  FROM auth.users au
) AS meta
WHERE pr.user_id = meta.user_id
  AND meta.full_name IS NOT NULL
  AND pr.email IS NOT NULL
  AND (
    lower(trim(pr.full_name)) = lower(trim(pr.email))
    OR lower(trim(pr.full_name)) = lower(split_part(trim(pr.email), '@', 1))
  );

UPDATE public.doctor_registrations dr
SET full_name = meta.full_name
FROM (
  SELECT
    au.id AS user_id,
    NULLIF(trim(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name')), '') AS full_name
  FROM auth.users au
) AS meta
WHERE dr.user_id = meta.user_id
  AND meta.full_name IS NOT NULL
  AND dr.email IS NOT NULL
  AND (
    lower(trim(dr.full_name)) = lower(trim(dr.email))
    OR lower(trim(dr.full_name)) = lower(split_part(trim(dr.email), '@', 1))
  );

-- Backfill existing auth.users that have no doctor_registrations and no patient_registrations.
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN
    SELECT
      au.id,
      au.email,
      au.phone,
      COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name') AS full_name
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.doctor_registrations dr WHERE dr.user_id = au.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.patient_registrations pr WHERE pr.user_id = au.id
    )
  LOOP
    PERFORM public.ensure_auth_user_has_registration_row(u.id, u.email, u.phone, u.full_name);
  END LOOP;
END;
$$;

-- Trigger function for future auth.users inserts.
CREATE OR REPLACE FUNCTION public.handle_auth_user_registration_fallback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_auth_user_has_registration_row(
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_registration_fallback ON auth.users;
CREATE TRIGGER on_auth_user_registration_fallback
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_registration_fallback();

-- Allow trigger function execution in Supabase runtime roles.
GRANT EXECUTE ON FUNCTION public.ensure_auth_user_has_registration_row(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_auth_user_registration_fallback() TO authenticated;
