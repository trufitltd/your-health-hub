-- Add preferred consultation languages for doctor signup/profile sync.

BEGIN;

ALTER TABLE public.doctor_registrations
  ADD COLUMN IF NOT EXISTS preferred_consultation_languages TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS preferred_consultation_languages TEXT[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_registrations_preferred_consultation_languages_not_empty_values'
  ) THEN
    ALTER TABLE public.doctor_registrations
      ADD CONSTRAINT doctor_registrations_preferred_consultation_languages_not_empty_values
      CHECK (NOT preferred_consultation_languages @> ARRAY['']::text[]);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctors_preferred_consultation_languages_not_empty_values'
  ) THEN
    ALTER TABLE public.doctors
      ADD CONSTRAINT doctors_preferred_consultation_languages_not_empty_values
      CHECK (NOT preferred_consultation_languages @> ARRAY['']::text[]);
  END IF;
END $$;

UPDATE public.doctors d
SET
  preferred_consultation_languages = COALESCE(dr.preferred_consultation_languages, '{}'::text[]),
  updated_at = NOW()
FROM public.doctor_registrations dr
WHERE dr.user_id = d.id
  AND COALESCE(array_length(dr.preferred_consultation_languages, 1), 0) > 0;

CREATE OR REPLACE FUNCTION public.handle_doctor_registration_approved()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.verification_status = 'approved') THEN
    INSERT INTO public.doctors (
      id, name, specialty, rate_per_consultation, preferred_consultation_languages, bio, phone, email, avatar_url, is_active, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      NEW.full_name,
      NEW.specialty,
      NEW.rate_per_consultation,
      COALESCE(NEW.preferred_consultation_languages, '{}'::text[]),
      NEW.bio,
      NEW.phone_number,
      NEW.email,
      NEW.profile_picture_url,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      specialty = EXCLUDED.specialty,
      rate_per_consultation = EXCLUDED.rate_per_consultation,
      preferred_consultation_languages = EXCLUDED.preferred_consultation_languages,
      bio = EXCLUDED.bio,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at;

    IF NEW.user_id IS NOT NULL THEN
      UPDATE auth.users u
      SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'doctor')
      WHERE u.id = NEW.user_id;
    END IF;
  ELSIF (TG_OP = 'UPDATE' AND NEW.verification_status = 'approved' AND (OLD.verification_status IS DISTINCT FROM NEW.verification_status)) THEN
    INSERT INTO public.doctors (
      id, name, specialty, rate_per_consultation, preferred_consultation_languages, bio, phone, email, avatar_url, is_active, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      NEW.full_name,
      NEW.specialty,
      NEW.rate_per_consultation,
      COALESCE(NEW.preferred_consultation_languages, '{}'::text[]),
      NEW.bio,
      NEW.phone_number,
      NEW.email,
      NEW.profile_picture_url,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      specialty = EXCLUDED.specialty,
      rate_per_consultation = EXCLUDED.rate_per_consultation,
      preferred_consultation_languages = EXCLUDED.preferred_consultation_languages,
      bio = EXCLUDED.bio,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at;

    IF NEW.user_id IS NOT NULL THEN
      UPDATE auth.users u
      SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'doctor')
      WHERE u.id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
