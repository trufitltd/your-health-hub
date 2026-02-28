-- 20260228235500_normalize_appointment_status_constraint.sql
-- Normalize appointment statuses to canonical marketplace values and enforce
-- a consistent appointments_status_marketplace_check constraint.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_status_marketplace_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      DROP CONSTRAINT appointments_status_marketplace_check;
  END IF;
END $$;

UPDATE public.appointments
SET status = lower(trim(status))
WHERE status IS NOT NULL
  AND status <> lower(trim(status));

UPDATE public.appointments
SET status = 'in_progress'
WHERE status IN ('in progress', 'in-progress', 'inprogress');

UPDATE public.appointments
SET status = 'cancelled'
WHERE status IN ('canceled', 'rejected', 'declined', 'expired');

UPDATE public.appointments
SET status = 'pending_approval'
WHERE status IN ('pending', 'requested', 'awaiting_approval', 'pending_doctor_acceptance');

UPDATE public.appointments
SET status = 'no_show'
WHERE status IN ('no show', 'no-show', 'noshow');

UPDATE public.appointments
SET status = 'cancelled'
WHERE status IS NOT NULL
  AND status NOT IN (
    'pending_payment',
    'pending_approval',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'no_show'
  );

DO $$
BEGIN
  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_status_marketplace_check
      CHECK (
        status IS NULL
        OR status IN (
          'pending_payment',
          'pending_approval',
          'confirmed',
          'in_progress',
          'completed',
          'cancelled',
          'no_show'
        )
      );
END $$;
