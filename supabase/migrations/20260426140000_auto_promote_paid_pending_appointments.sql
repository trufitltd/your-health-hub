-- Auto-promote paid pending appointments into doctor approval queue.
-- This fixes cases where payment succeeded but appointment status remained pending_payment.

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
      AND lower(trim(COALESCE(a.status, ''))) IN ('pending_payment', 'payment_processing', 'pending');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appointment_status_from_payment ON public.payments;
CREATE TRIGGER trg_sync_appointment_status_from_payment
AFTER INSERT OR UPDATE OF status, verified_at
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_appointment_status_from_payment();

-- Backfill already-paid appointments that were left in pending payment.
UPDATE public.appointments a
SET
  status = 'pending_approval',
  slot_locked_until = NULL,
  updated_at = now()
WHERE lower(trim(COALESCE(a.status, ''))) IN ('pending_payment', 'payment_processing', 'pending')
  AND EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.appointment_id = a.id
      AND (
        lower(trim(COALESCE(p.status, ''))) IN ('success', 'successful', 'succeeded', 'paid', 'completed')
        OR p.verified_at IS NOT NULL
      )
  );

REVOKE ALL ON FUNCTION public.sync_appointment_status_from_payment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_appointment_status_from_payment() TO authenticated;
