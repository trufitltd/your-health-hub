-- Allow GPs to set their consultation rate from settings.
-- Keep specialist minimum rate enforcement at NGN 10,000.

-- Remove any legacy fixed-GP-rate constraints if they still exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_registrations_gp_fixed_rate_check'
      AND conrelid = 'public.doctor_registrations'::regclass
  ) THEN
    ALTER TABLE public.doctor_registrations
      DROP CONSTRAINT doctor_registrations_gp_fixed_rate_check;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctors_gp_fixed_rate_check'
      AND conrelid = 'public.doctors'::regclass
  ) THEN
    ALTER TABLE public.doctors
      DROP CONSTRAINT doctors_gp_fixed_rate_check;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_specialist_min_rate_on_doctor_registrations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_general_practice_specialty(NEW.specialty) THEN
    -- GP rates are editable. Keep a safe default if empty.
    IF NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation <= 0 THEN
      NEW.rate_per_consultation := 5000;
    END IF;

    -- GP does not use specialist proposal workflow.
    NEW.proposed_rate_per_consultation := NULL;
  ELSE
    IF NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation < 10000 THEN
      NEW.rate_per_consultation := 10000;
    END IF;

    IF NEW.proposed_rate_per_consultation IS NOT NULL AND NEW.proposed_rate_per_consultation < 10000 THEN
      NEW.proposed_rate_per_consultation := 10000;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_registrations_enforce_specialist_min_rate ON public.doctor_registrations;
CREATE TRIGGER trg_doctor_registrations_enforce_specialist_min_rate
  BEFORE INSERT OR UPDATE OF specialty, rate_per_consultation, proposed_rate_per_consultation
  ON public.doctor_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_specialist_min_rate_on_doctor_registrations();

CREATE OR REPLACE FUNCTION public.enforce_specialist_min_rate_on_doctors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_general_practice_specialty(NEW.specialty) THEN
    -- GP rates are editable. Keep a safe default if empty.
    IF NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation <= 0 THEN
      NEW.rate_per_consultation := 5000;
    END IF;
  ELSE
    IF NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation < 10000 THEN
      NEW.rate_per_consultation := 10000;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctors_enforce_specialist_min_rate ON public.doctors;
CREATE TRIGGER trg_doctors_enforce_specialist_min_rate
  BEFORE INSERT OR UPDATE OF specialty, rate_per_consultation
  ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_specialist_min_rate_on_doctors();

-- Keep doctors table in sync with registration rate for GP and specialist.
CREATE OR REPLACE FUNCTION public.sync_doctors_from_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
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
    NEW.rate_per_consultation,
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

-- Backfill doctors rate to match current registration rate.
UPDATE public.doctors d
SET rate_per_consultation = dr.rate_per_consultation,
    updated_at = now()
FROM public.doctor_registrations dr
WHERE dr.user_id = d.id
  AND dr.rate_per_consultation IS NOT NULL
  AND d.rate_per_consultation IS DISTINCT FROM dr.rate_per_consultation;

GRANT EXECUTE ON FUNCTION public.sync_doctors_from_registration() TO service_role;
