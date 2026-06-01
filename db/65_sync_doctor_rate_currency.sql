-- Keep doctor consultation rate and currency consistent across profile save,
-- public doctor rows, and booking price previews.

ALTER TABLE public.doctor_registrations
  ADD COLUMN IF NOT EXISTS consultation_currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (consultation_currency IN ('NGN', 'USD'));

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS consultation_currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (consultation_currency IN ('NGN', 'USD'));

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
    consultation_currency,
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
    COALESCE(NULLIF(NEW.consultation_currency, ''), 'NGN'),
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
    consultation_currency = COALESCE(EXCLUDED.consultation_currency, public.doctors.consultation_currency, 'NGN'),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_registrations_sync_doctors ON public.doctor_registrations;
CREATE TRIGGER trg_doctor_registrations_sync_doctors
  AFTER INSERT OR UPDATE OF user_id, full_name, specialty, email, phone_number, bio, profile_picture_url, rate_per_consultation, consultation_currency
  ON public.doctor_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_doctors_from_registration();

UPDATE public.doctors d
SET
  rate_per_consultation = COALESCE(dr.rate_per_consultation, d.rate_per_consultation),
  consultation_currency = COALESCE(NULLIF(dr.consultation_currency, ''), d.consultation_currency, 'NGN'),
  updated_at = now()
FROM public.doctor_registrations dr
WHERE dr.user_id = d.id
  AND (
    d.rate_per_consultation IS DISTINCT FROM dr.rate_per_consultation
    OR d.consultation_currency IS DISTINCT FROM COALESCE(NULLIF(dr.consultation_currency, ''), 'NGN')
  );

GRANT EXECUTE ON FUNCTION public.sync_doctors_from_registration() TO service_role;
