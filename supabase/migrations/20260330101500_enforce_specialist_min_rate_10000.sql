-- Enforce specialist consultation rates to be at least NGN 10,000.

-- Ensure helper exists for GP detection.
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

CREATE OR REPLACE FUNCTION public.enforce_specialist_min_rate_on_doctor_registrations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_general_practice_specialty(NEW.specialty) THEN
    NEW.rate_per_consultation := 5000;
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
    NEW.rate_per_consultation := 5000;
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

-- Backfill existing non-GP doctors in both tables.
UPDATE public.doctor_registrations
SET rate_per_consultation = 10000,
    updated_at = now()
WHERE NOT public.is_general_practice_specialty(specialty)
  AND COALESCE(rate_per_consultation, 0) < 10000;

UPDATE public.doctor_registrations
SET proposed_rate_per_consultation = 10000,
    updated_at = now()
WHERE NOT public.is_general_practice_specialty(specialty)
  AND proposed_rate_per_consultation IS NOT NULL
  AND proposed_rate_per_consultation < 10000;

UPDATE public.doctors
SET rate_per_consultation = 10000,
    updated_at = now()
WHERE NOT public.is_general_practice_specialty(specialty)
  AND COALESCE(rate_per_consultation, 0) < 10000;

-- Guardrail constraints.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_registrations_specialist_min_rate_check'
      AND conrelid = 'public.doctor_registrations'::regclass
  ) THEN
    ALTER TABLE public.doctor_registrations
      DROP CONSTRAINT doctor_registrations_specialist_min_rate_check;
  END IF;
END;
$$;

ALTER TABLE public.doctor_registrations
  ADD CONSTRAINT doctor_registrations_specialist_min_rate_check
  CHECK (
    public.is_general_practice_specialty(specialty)
    OR COALESCE(rate_per_consultation, 0) >= 10000
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctors_specialist_min_rate_check'
      AND conrelid = 'public.doctors'::regclass
  ) THEN
    ALTER TABLE public.doctors
      DROP CONSTRAINT doctors_specialist_min_rate_check;
  END IF;
END;
$$;

ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_specialist_min_rate_check
  CHECK (
    public.is_general_practice_specialty(specialty)
    OR COALESCE(rate_per_consultation, 0) >= 10000
  );

-- Update specialist rate request workflow to reject rates below minimum.
CREATE OR REPLACE FUNCTION public.doctor_request_rate_change(
  p_new_rate NUMERIC,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_specialty TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_new_rate IS NULL OR p_new_rate <= 0 THEN
    RAISE EXCEPTION 'New rate must be greater than zero';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Rate change reason is required';
  END IF;

  SELECT lower(trim(COALESCE(specialty, '')))
  INTO v_specialty
  FROM public.doctor_registrations
  WHERE user_id = v_user_id;

  IF v_specialty IS NULL THEN
    RAISE EXCEPTION 'Doctor registration not found';
  END IF;

  IF v_specialty IN ('general practice', 'general_practice', 'gp', 'general practitioner', 'general_practitioner') THEN
    RAISE EXCEPTION 'General practitioners cannot request specialist rate changes';
  END IF;

  IF p_new_rate < 10000 THEN
    RAISE EXCEPTION 'Specialist rate must be at least NGN 10,000';
  END IF;

  UPDATE public.doctor_registrations
  SET proposed_rate_per_consultation = p_new_rate,
      rate_change_reason = v_reason,
      rate_change_requested_at = now(),
      rate_change_seen_by_admin = false,
      rate_change_reviewed_at = NULL,
      rate_change_admin_note = NULL,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_request_rate_change(NUMERIC, TEXT) TO authenticated;
