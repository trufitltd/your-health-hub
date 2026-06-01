-- Make rate enforcement currency-aware.
-- NGN minimums (5000 GP default, 10000 specialist) only apply when currency is NGN.
-- USD rates are accepted as-is as long as they are > 0 (GP) or > 0 (specialist).

-- Remove legacy fixed-GP-rate triggers/constraints. These overwrite USD GP
-- rates (for example $20) back to 5000 even after currency-aware enforcement.
DROP TRIGGER IF EXISTS trg_doctor_registrations_enforce_gp_fixed_rate ON public.doctor_registrations;
DROP TRIGGER IF EXISTS trg_doctors_enforce_gp_fixed_rate ON public.doctors;

DROP FUNCTION IF EXISTS public.enforce_gp_fixed_rate_on_doctor_registrations();
DROP FUNCTION IF EXISTS public.enforce_gp_fixed_rate_on_doctors();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doctor_registrations_gp_fixed_rate_check'
      AND conrelid = 'public.doctor_registrations'::regclass
  ) THEN
    ALTER TABLE public.doctor_registrations DROP CONSTRAINT doctor_registrations_gp_fixed_rate_check;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doctors_gp_fixed_rate_check'
      AND conrelid = 'public.doctors'::regclass
  ) THEN
    ALTER TABLE public.doctors DROP CONSTRAINT doctors_gp_fixed_rate_check;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_specialist_min_rate_on_doctor_registrations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency TEXT;
BEGIN
  v_currency := UPPER(COALESCE(NULLIF(trim(NEW.consultation_currency), ''), 'NGN'));

  IF public.is_general_practice_specialty(NEW.specialty) THEN
    -- GP: keep a safe NGN default only when currency is NGN and rate is missing/zero.
    IF v_currency = 'NGN' AND (NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation <= 0) THEN
      NEW.rate_per_consultation := 5000;
    ELSIF v_currency != 'NGN' AND (NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation <= 0) THEN
      NEW.rate_per_consultation := 5; -- sensible USD default
    END IF;
    NEW.proposed_rate_per_consultation := NULL;
  ELSE
    -- Specialist: enforce NGN minimum only for NGN currency.
    IF v_currency = 'NGN' THEN
      IF NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation < 10000 THEN
        NEW.rate_per_consultation := 10000;
      END IF;
      IF NEW.proposed_rate_per_consultation IS NOT NULL AND NEW.proposed_rate_per_consultation < 10000 THEN
        NEW.proposed_rate_per_consultation := 10000;
      END IF;
    ELSE
      IF NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation <= 0 THEN
        NEW.rate_per_consultation := 10; -- sensible USD default
      END IF;
      IF NEW.proposed_rate_per_consultation IS NOT NULL AND NEW.proposed_rate_per_consultation <= 0 THEN
        NEW.proposed_rate_per_consultation := 10;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_registrations_enforce_specialist_min_rate ON public.doctor_registrations;
CREATE TRIGGER trg_doctor_registrations_enforce_specialist_min_rate
  BEFORE INSERT OR UPDATE OF specialty, rate_per_consultation, proposed_rate_per_consultation, consultation_currency
  ON public.doctor_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_specialist_min_rate_on_doctor_registrations();

CREATE OR REPLACE FUNCTION public.enforce_specialist_min_rate_on_doctors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency TEXT;
BEGIN
  v_currency := UPPER(COALESCE(NULLIF(trim(NEW.consultation_currency), ''), 'NGN'));

  IF public.is_general_practice_specialty(NEW.specialty) THEN
    IF v_currency = 'NGN' AND (NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation <= 0) THEN
      NEW.rate_per_consultation := 5000;
    ELSIF v_currency != 'NGN' AND (NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation <= 0) THEN
      NEW.rate_per_consultation := 5;
    END IF;
  ELSE
    IF v_currency = 'NGN' THEN
      IF NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation < 10000 THEN
        NEW.rate_per_consultation := 10000;
      END IF;
    ELSE
      IF NEW.rate_per_consultation IS NULL OR NEW.rate_per_consultation <= 0 THEN
        NEW.rate_per_consultation := 10;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doctors_enforce_specialist_min_rate ON public.doctors;
CREATE TRIGGER trg_doctors_enforce_specialist_min_rate
  BEFORE INSERT OR UPDATE OF specialty, rate_per_consultation, consultation_currency
  ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_specialist_min_rate_on_doctors();

-- Drop the NGN-only CHECK constraints that block valid USD rates.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doctor_registrations_specialist_min_rate_check'
      AND conrelid = 'public.doctor_registrations'::regclass
  ) THEN
    ALTER TABLE public.doctor_registrations DROP CONSTRAINT doctor_registrations_specialist_min_rate_check;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'doctors_specialist_min_rate_check'
      AND conrelid = 'public.doctors'::regclass
  ) THEN
    ALTER TABLE public.doctors DROP CONSTRAINT doctors_specialist_min_rate_check;
  END IF;
END;
$$;

-- Replace with currency-aware constraints.
ALTER TABLE public.doctor_registrations
  ADD CONSTRAINT doctor_registrations_specialist_min_rate_check
  CHECK (
    public.is_general_practice_specialty(specialty)
    OR COALESCE(rate_per_consultation, 0) > 0
  );

ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_specialist_min_rate_check
  CHECK (
    public.is_general_practice_specialty(specialty)
    OR COALESCE(rate_per_consultation, 0) > 0
  );

-- Update the rate-change RPC to be currency-aware.
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
  v_currency TEXT;
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

  SELECT
    lower(trim(COALESCE(specialty, ''))),
    UPPER(COALESCE(NULLIF(trim(consultation_currency), ''), 'NGN'))
  INTO v_specialty, v_currency
  FROM public.doctor_registrations
  WHERE user_id = v_user_id;

  IF v_specialty IS NULL THEN
    RAISE EXCEPTION 'Doctor registration not found';
  END IF;

  IF v_specialty IN ('general practice', 'general_practice', 'gp', 'general practitioner', 'general_practitioner') THEN
    RAISE EXCEPTION 'General practitioners cannot request specialist rate changes';
  END IF;

  -- Enforce minimum only for NGN.
  IF v_currency = 'NGN' AND p_new_rate < 10000 THEN
    RAISE EXCEPTION 'Specialist NGN rate must be at least NGN 10,000';
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
