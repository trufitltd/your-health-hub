-- Normalize appointment statuses to canonical lowercase values.
-- Canonical marketplace lifecycle:
-- pending_payment -> pending_approval -> confirmed -> in_progress -> completed
-- cancellation endpoints: cancelled, no_show

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
SET status = 'pending_approval'
WHERE status IN ('requested', 'awaiting_approval', 'pending');

UPDATE public.appointments a
SET status = 'pending_approval'
WHERE a.status = 'pending_payment'
  AND (
    EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.appointment_id = a.id
        AND lower(trim(COALESCE(p.status, ''))) IN ('completed', 'success')
    )
    OR a.slot_locked_until IS NULL
    OR a.slot_locked_until < now()
    OR a.created_at < now() - interval '30 minutes'
  );

UPDATE public.appointments
SET status = 'cancelled'
WHERE status IN ('rejected', 'declined', 'expired');

UPDATE public.appointments
SET status = 'no_show'
WHERE status IN ('no show', 'no-show', 'noshow');

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
