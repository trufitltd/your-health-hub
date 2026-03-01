-- Add patient preferred UI language for default app experience.
ALTER TABLE public.patient_registrations
  ADD COLUMN IF NOT EXISTS preferred_language TEXT;

UPDATE public.patient_registrations
SET preferred_language = COALESCE(NULLIF(trim(preferred_language), ''), 'en')
WHERE preferred_language IS NULL
   OR NULLIF(trim(preferred_language), '') IS NULL;

ALTER TABLE public.patient_registrations
  ALTER COLUMN preferred_language SET DEFAULT 'en';

ALTER TABLE public.patient_registrations
  ALTER COLUMN preferred_language SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patient_registrations_preferred_language_check'
  ) THEN
    ALTER TABLE public.patient_registrations
      ADD CONSTRAINT patient_registrations_preferred_language_check
      CHECK (preferred_language = ANY (ARRAY['en','ha','ig','yo','sw','ar','fr','es','pt','nl','zh','de']::text[]));
  END IF;
END
$$;
