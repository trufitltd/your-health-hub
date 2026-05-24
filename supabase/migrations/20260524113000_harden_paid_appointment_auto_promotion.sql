-- Harden payment -> appointment auto-promotion by normalizing status values.
-- Fixes cases where appointment status is stored as "pending payment" or "pending-payment"
-- instead of "pending_payment".

CREATE OR REPLACE FUNCTION public.sync_appointment_status_from_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_status TEXT := lower(trim(COALESCE(NEW.status, '')));
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_payment_status IN ('success', 'successful', 'succeeded', 'paid', 'completed')
     OR NEW.verified_at IS NOT NULL THEN
    UPDATE public.appointments a
    SET
      status = 'pending_approval',
      slot_locked_until = NULL,
      updated_at = now()
    WHERE a.id = NEW.appointment_id
      AND lower(regexp_replace(trim(COALESCE(a.status, '')), '[\\s-]+', '_', 'g'))
        IN ('pending_payment', 'payment_processing', 'pending');
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill already-paid appointments still stuck due legacy status formatting.
UPDATE public.appointments a
SET
  status = 'pending_approval',
  slot_locked_until = NULL,
  updated_at = now()
WHERE lower(regexp_replace(trim(COALESCE(a.status, '')), '[\\s-]+', '_', 'g'))
    IN ('pending_payment', 'payment_processing', 'pending')
  AND EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.appointment_id = a.id
      AND (
        lower(trim(COALESCE(p.status, ''))) IN ('success', 'successful', 'succeeded', 'paid', 'completed')
        OR p.verified_at IS NOT NULL
      )
  );
