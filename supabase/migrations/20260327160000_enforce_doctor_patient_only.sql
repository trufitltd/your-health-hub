-- Enforce only doctor/patient roles and stop auto-creating patient rows for doctor signups.

-- 0) Remove multi-role bundle artifacts if present.
DROP TRIGGER IF EXISTS trg_auth_user_role_sync ON auth.users;
DROP TRIGGER IF EXISTS trg_profiles_sync_profile_roles ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_from_auth_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.sync_profile_roles_from_profiles() CASCADE;
DROP FUNCTION IF EXISTS public.assign_profile_roles(UUID, TEXT) CASCADE;
DROP TABLE IF EXISTS public.profile_roles;

-- Normalize auth metadata to doctor/patient and remove legacy multi-role arrays.
UPDATE auth.users u
SET raw_user_meta_data =
  (
    COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      - 'roles'
      - 'role'
  )
  || jsonb_build_object(
    'role',
    CASE
      WHEN EXISTS (SELECT 1 FROM public.doctor_registrations dr WHERE dr.user_id = u.id) THEN 'doctor'
      ELSE 'patient'
    END
  );

-- 1) Normalize existing profiles to doctor/patient only.
--    If user exists in doctor_registrations, force doctor; otherwise patient.
UPDATE public.profiles p
SET role = CASE
  WHEN EXISTS (SELECT 1 FROM public.doctor_registrations dr WHERE dr.user_id = p.id) THEN 'doctor'
  ELSE 'patient'
END
WHERE p.role NOT IN ('doctor', 'patient')
   OR p.role IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['patient'::text, 'doctor'::text]));

-- 2) Signup trigger now accepts only doctor/patient.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  role_candidate text := lower(trim(COALESCE(new.raw_user_meta_data->>'role', 'patient')));
BEGIN
  IF role_candidate NOT IN ('patient', 'doctor') THEN
    role_candidate := 'patient';
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    role_candidate
  )
  ON CONFLICT (id)
  DO UPDATE SET
    role = EXCLUDED.role,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);

  RETURN new;
END;
$$;

-- 3) Make auth fallback role-aware: only auto-create patient row for patient signups.
CREATE OR REPLACE FUNCTION public.ensure_auth_user_has_registration_row(
  p_user_id UUID,
  p_email TEXT,
  p_phone TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'patient'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := lower(trim(COALESCE(p_role, 'patient')));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Doctors should never be auto-inserted into patient_registrations by fallback.
  IF v_role = 'doctor' THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.patient_registrations pr WHERE pr.user_id = p_user_id) THEN
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

-- Backward-compatible wrapper for older callers with 4 args.
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
  PERFORM public.ensure_auth_user_has_registration_row(
    p_user_id,
    p_email,
    p_phone,
    p_full_name,
    'patient'
  );
END;
$$;

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
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'patient')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_registration_fallback ON auth.users;
CREATE TRIGGER on_auth_user_registration_fallback
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_registration_fallback();

-- 4) Ensure doctor registration sync writes doctor role only.
CREATE OR REPLACE FUNCTION public.sync_profile_from_doctor_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.user_id,
    COALESCE(NULLIF(trim(NEW.full_name), ''), 'Doctor'),
    'doctor'
  )
  ON CONFLICT (id)
  DO UPDATE SET
    full_name = COALESCE(NULLIF(trim(EXCLUDED.full_name), ''), public.profiles.full_name),
    role = 'doctor';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_registrations_sync_profile ON public.doctor_registrations;
CREATE TRIGGER trg_doctor_registrations_sync_profile
  AFTER INSERT OR UPDATE OF user_id, full_name ON public.doctor_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_doctor_registration();

-- 5) Clean up existing wrong patient rows for doctors.
DELETE FROM public.patient_registrations pr
USING public.doctor_registrations dr
WHERE pr.user_id = dr.user_id;

-- 6) Keep profiles complete for all existing doctors.
INSERT INTO public.profiles (id, full_name, role)
SELECT
  dr.user_id,
  COALESCE(NULLIF(trim(dr.full_name), ''), 'Doctor'),
  'doctor'
FROM public.doctor_registrations dr
LEFT JOIN public.profiles p ON p.id = dr.user_id
WHERE dr.user_id IS NOT NULL
  AND p.id IS NULL;

UPDATE public.profiles p
SET
  role = 'doctor',
  full_name = COALESCE(NULLIF(trim(dr.full_name), ''), p.full_name)
FROM public.doctor_registrations dr
WHERE dr.user_id = p.id;

GRANT EXECUTE ON FUNCTION public.ensure_auth_user_has_registration_row(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_auth_user_has_registration_row(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_auth_user_registration_fallback() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_from_doctor_registration() TO service_role;
