-- Enforce fixed consultation rate for General Practitioners (GP) at NGN 5,000.

CREATE OR REPLACE FUNCTION public.is_general_practice_specialty(p_specialty TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(COALESCE(p_specialty, ''), '[_-]+', ' ', 'g')) IN (
    'general practice',
    'general practitioner',
    'gp'
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_gp_fixed_rate_on_doctor_registrations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_general_practice_specialty(NEW.specialty) THEN
    NEW.rate_per_consultation := 5000;
    -- GP should never carry specialist pending rate proposals.
    IF NEW.proposed_rate_per_consultation IS NOT NULL THEN
      NEW.proposed_rate_per_consultation := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_registrations_enforce_gp_fixed_rate ON public.doctor_registrations;
CREATE TRIGGER trg_doctor_registrations_enforce_gp_fixed_rate
  BEFORE INSERT OR UPDATE OF specialty, rate_per_consultation, proposed_rate_per_consultation
  ON public.doctor_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_gp_fixed_rate_on_doctor_registrations();

CREATE OR REPLACE FUNCTION public.enforce_gp_fixed_rate_on_doctors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_general_practice_specialty(NEW.specialty) THEN
    NEW.rate_per_consultation := 5000;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctors_enforce_gp_fixed_rate ON public.doctors;
CREATE TRIGGER trg_doctors_enforce_gp_fixed_rate
  BEFORE INSERT OR UPDATE OF specialty, rate_per_consultation
  ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_gp_fixed_rate_on_doctors();

-- Backfill existing records.
UPDATE public.doctor_registrations
SET rate_per_consultation = 5000,
    proposed_rate_per_consultation = NULL,
    updated_at = now()
WHERE public.is_general_practice_specialty(specialty)
  AND (
    rate_per_consultation IS DISTINCT FROM 5000
    OR proposed_rate_per_consultation IS NOT NULL
  );

UPDATE public.doctors
SET rate_per_consultation = 5000,
    updated_at = now()
WHERE public.is_general_practice_specialty(specialty)
  AND rate_per_consultation IS DISTINCT FROM 5000;

-- Guardrail constraints.
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

ALTER TABLE public.doctor_registrations
  ADD CONSTRAINT doctor_registrations_gp_fixed_rate_check
  CHECK (
    NOT public.is_general_practice_specialty(specialty)
    OR rate_per_consultation = 5000
  );

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

ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_gp_fixed_rate_check
  CHECK (
    NOT public.is_general_practice_specialty(specialty)
    OR rate_per_consultation = 5000
  );
