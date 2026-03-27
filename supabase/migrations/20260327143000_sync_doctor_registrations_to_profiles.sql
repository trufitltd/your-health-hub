-- Ensure every doctor registration has a corresponding profiles row.
-- Existing: backfill missing/inconsistent profiles from doctor_registrations.
-- Future: keep profiles synced whenever doctor_registrations is inserted/updated.

-- 1) Backfill missing profiles rows for existing doctors.
INSERT INTO public.profiles (id, full_name, role)
SELECT
  dr.user_id,
  COALESCE(NULLIF(trim(dr.full_name), ''), 'Doctor'),
  'doctor'
FROM public.doctor_registrations dr
LEFT JOIN public.profiles p ON p.id = dr.user_id
WHERE dr.user_id IS NOT NULL
  AND p.id IS NULL;

-- 2) If doctor has profile but non-admin/coo role is not doctor, normalize to doctor.
UPDATE public.profiles p
SET
  role = 'doctor',
  full_name = COALESCE(NULLIF(trim(dr.full_name), ''), p.full_name)
FROM public.doctor_registrations dr
WHERE dr.user_id = p.id
  AND p.role NOT IN ('doctor', 'admin', 'coo');

-- 3) Keep name aligned for doctor-role profiles.
UPDATE public.profiles p
SET full_name = COALESCE(NULLIF(trim(dr.full_name), ''), p.full_name)
FROM public.doctor_registrations dr
WHERE dr.user_id = p.id
  AND p.role = 'doctor'
  AND COALESCE(NULLIF(trim(dr.full_name), ''), p.full_name) IS DISTINCT FROM p.full_name;

-- 4) Sync trigger: when doctor_registrations changes, ensure profiles exists/updated.
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
    role = CASE
      WHEN public.profiles.role IN ('admin', 'coo') THEN public.profiles.role
      ELSE 'doctor'
    END;

  -- If profile_roles table exists (multi-role setup), ensure doctor membership too.
  IF to_regclass('public.profile_roles') IS NOT NULL THEN
    INSERT INTO public.profile_roles (user_id, role, assigned_by)
    VALUES (NEW.user_id, 'doctor', 'sync')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_registrations_sync_profile ON public.doctor_registrations;
CREATE TRIGGER trg_doctor_registrations_sync_profile
  AFTER INSERT OR UPDATE OF user_id, full_name ON public.doctor_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_doctor_registration();

-- 5) Backfill doctor membership in profile_roles (only if table exists).
DO $$
BEGIN
  IF to_regclass('public.profile_roles') IS NOT NULL THEN
    INSERT INTO public.profile_roles (user_id, role, assigned_by)
    SELECT dr.user_id, 'doctor', 'sync'
    FROM public.doctor_registrations dr
    WHERE dr.user_id IS NOT NULL
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_profile_from_doctor_registration() TO service_role;
