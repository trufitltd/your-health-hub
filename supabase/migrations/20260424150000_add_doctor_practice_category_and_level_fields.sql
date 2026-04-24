-- Add doctor onboarding fields for practice category and specialist level flow.

ALTER TABLE public.doctor_registrations
ADD COLUMN IF NOT EXISTS practice_category TEXT,
ADD COLUMN IF NOT EXISTS specialist_level TEXT,
ADD COLUMN IF NOT EXISTS fellowship_number TEXT,
ADD COLUMN IF NOT EXISTS residency_training_evidence_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_registrations_practice_category_check'
      AND conrelid = 'public.doctor_registrations'::regclass
  ) THEN
    ALTER TABLE public.doctor_registrations
      ADD CONSTRAINT doctor_registrations_practice_category_check
      CHECK (
        practice_category IS NULL
        OR practice_category IN ('general_practitioner', 'specialist')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_registrations_specialist_level_check'
      AND conrelid = 'public.doctor_registrations'::regclass
  ) THEN
    ALTER TABLE public.doctor_registrations
      ADD CONSTRAINT doctor_registrations_specialist_level_check
      CHECK (
        specialist_level IS NULL
        OR specialist_level IN ('senior_registrar', 'consultant')
      );
  END IF;
END;
$$;

