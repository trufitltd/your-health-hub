-- Drop legacy fixed-GP-rate enforcement that can still overwrite doctor-set
-- GP rates to 5000 after the currency-aware rate migration has been applied.

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
