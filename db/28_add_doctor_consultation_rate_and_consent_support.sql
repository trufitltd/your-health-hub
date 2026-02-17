-- Add specialist consultation rate support across doctor_registrations and doctors.
-- Also updates sync/upsert functions so approved doctors keep their configured rate.

ALTER TABLE public.doctor_registrations
ADD COLUMN IF NOT EXISTS rate_per_consultation NUMERIC(10,2);

ALTER TABLE public.doctors
ADD COLUMN IF NOT EXISTS rate_per_consultation NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_registrations_rate_per_consultation_positive'
  ) THEN
    ALTER TABLE public.doctor_registrations
    ADD CONSTRAINT doctor_registrations_rate_per_consultation_positive
    CHECK (rate_per_consultation IS NULL OR rate_per_consultation > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctors_rate_per_consultation_positive'
  ) THEN
    ALTER TABLE public.doctors
    ADD CONSTRAINT doctors_rate_per_consultation_positive
    CHECK (rate_per_consultation IS NULL OR rate_per_consultation > 0);
  END IF;
END $$;

-- Backfill doctors table from existing registrations where present.
UPDATE public.doctors d
SET
  rate_per_consultation = dr.rate_per_consultation,
  updated_at = NOW()
FROM public.doctor_registrations dr
WHERE dr.user_id = d.id
  AND dr.rate_per_consultation IS NOT NULL;

-- Keep approval-trigger sync aware of rate_per_consultation.
CREATE OR REPLACE FUNCTION public.handle_doctor_registration_approved()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.verification_status = 'approved') THEN
    INSERT INTO public.doctors (
      id, name, specialty, rate_per_consultation, bio, phone, email, avatar_url, is_active, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      NEW.full_name,
      NEW.specialty,
      NEW.rate_per_consultation,
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
      id, name, specialty, rate_per_consultation, bio, phone, email, avatar_url, is_active, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      NEW.full_name,
      NEW.specialty,
      NEW.rate_per_consultation,
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

-- Extend admin upsert RPC with optional rate argument.
CREATE OR REPLACE FUNCTION public.upsert_doctor_profile(
  p_doctor_id UUID,
  p_name TEXT,
  p_specialty TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_avatar_url TEXT,
  p_is_active BOOLEAN,
  p_rate_per_consultation NUMERIC DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.doctors (
    id, name, specialty, email, phone, avatar_url, is_active, rate_per_consultation
  )
  VALUES (
    p_doctor_id, p_name, p_specialty, p_email, p_phone, p_avatar_url, p_is_active, p_rate_per_consultation
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(p_name, doctors.name),
    specialty = COALESCE(p_specialty, doctors.specialty),
    email = COALESCE(p_email, doctors.email),
    phone = COALESCE(p_phone, doctors.phone),
    avatar_url = COALESCE(p_avatar_url, doctors.avatar_url),
    is_active = COALESCE(p_is_active, doctors.is_active),
    rate_per_consultation = COALESCE(p_rate_per_consultation, doctors.rate_per_consultation),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_doctor_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC) TO authenticated;
