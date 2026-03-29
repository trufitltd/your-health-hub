-- Keep public.doctors synced from public.doctor_registrations so
-- doctor_schedules inserts do not fail with FK errors for new doctors.

CREATE OR REPLACE FUNCTION public.sync_doctors_from_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_specialty TEXT := lower(trim(COALESCE(NEW.specialty, '')));
  v_rate NUMERIC := NEW.rate_per_consultation;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_specialty IN ('general practice', 'general_practice', 'general practitioner', 'general_practitioner', 'gp') THEN
    v_rate := 5000;
  END IF;

  INSERT INTO public.doctors (
    id,
    name,
    specialty,
    email,
    phone,
    bio,
    avatar_url,
    is_active,
    rate_per_consultation,
    updated_at
  )
  VALUES (
    NEW.user_id,
    COALESCE(NULLIF(trim(NEW.full_name), ''), 'Doctor'),
    NEW.specialty,
    NEW.email,
    NEW.phone_number,
    NEW.bio,
    NEW.profile_picture_url,
    true,
    v_rate,
    now()
  )
  ON CONFLICT (id)
  DO UPDATE SET
    name = COALESCE(NULLIF(trim(EXCLUDED.name), ''), public.doctors.name),
    specialty = COALESCE(NULLIF(EXCLUDED.specialty, ''), public.doctors.specialty),
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.doctors.email),
    phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.doctors.phone),
    bio = COALESCE(EXCLUDED.bio, public.doctors.bio),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.doctors.avatar_url),
    is_active = true,
    rate_per_consultation = COALESCE(EXCLUDED.rate_per_consultation, public.doctors.rate_per_consultation),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_registrations_sync_doctors ON public.doctor_registrations;
CREATE TRIGGER trg_doctor_registrations_sync_doctors
  AFTER INSERT OR UPDATE OF user_id, full_name, specialty, email, phone_number, bio, profile_picture_url, rate_per_consultation
  ON public.doctor_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_doctors_from_registration();

-- Backfill doctors rows for existing registrations.
INSERT INTO public.doctors (
  id,
  name,
  specialty,
  email,
  phone,
  bio,
  avatar_url,
  is_active,
  rate_per_consultation,
  created_at,
  updated_at
)
SELECT
  dr.user_id,
  COALESCE(NULLIF(trim(dr.full_name), ''), 'Doctor') AS name,
  dr.specialty,
  dr.email,
  dr.phone_number AS phone,
  dr.bio,
  dr.profile_picture_url AS avatar_url,
  true AS is_active,
  CASE
    WHEN lower(trim(COALESCE(dr.specialty, ''))) IN ('general practice', 'general_practice', 'general practitioner', 'general_practitioner', 'gp')
      THEN 5000
    ELSE dr.rate_per_consultation
  END AS rate_per_consultation,
  COALESCE(dr.created_at, now()) AS created_at,
  now() AS updated_at
FROM public.doctor_registrations dr
WHERE dr.user_id IS NOT NULL
ON CONFLICT (id)
DO UPDATE SET
  name = COALESCE(NULLIF(EXCLUDED.name, ''), public.doctors.name),
  specialty = COALESCE(NULLIF(EXCLUDED.specialty, ''), public.doctors.specialty),
  email = COALESCE(NULLIF(EXCLUDED.email, ''), public.doctors.email),
  phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.doctors.phone),
  bio = COALESCE(EXCLUDED.bio, public.doctors.bio),
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.doctors.avatar_url),
  is_active = true,
  rate_per_consultation = COALESCE(EXCLUDED.rate_per_consultation, public.doctors.rate_per_consultation),
  updated_at = now();

GRANT EXECUTE ON FUNCTION public.sync_doctors_from_registration() TO service_role;
