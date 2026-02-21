-- Normalize appointment statuses to canonical lowercase values.
-- Keeps marketplace internal states (`pending_payment`, `expired`) while
-- removing legacy case and naming variants.

UPDATE public.appointments
SET status = lower(trim(status))
WHERE status IS NOT NULL
  AND status <> lower(trim(status));

UPDATE public.appointments
SET status = 'in_progress'
WHERE status IN ('in progress', 'in-progress', 'inprogress');

UPDATE public.appointments
SET status = 'cancelled'
WHERE status = 'canceled';

UPDATE public.appointments
SET status = 'pending'
WHERE status IN ('requested', 'awaiting_approval');

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

  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_status_marketplace_check
      CHECK (
        status IS NULL
        OR status IN (
          'pending',
          'confirmed',
          'in_progress',
          'completed',
          'cancelled',
          'rejected',
          'pending_payment',
          'expired'
        )
      );
END $$;
