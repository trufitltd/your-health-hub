-- Recover appointments stuck in pending_payment that have a successful payment record.
-- Run this manually or schedule it to catch any that slipped through.

CREATE OR REPLACE FUNCTION public.recover_stuck_pending_payment_appointments()
RETURNS TABLE(appointment_id UUID, payment_reference TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH recovered AS (
    UPDATE public.appointments a
    SET
      status           = 'pending_approval',
      slot_locked_until = NULL,
      updated_at       = now()
    FROM public.payments p
    WHERE a.id = p.appointment_id
      AND lower(trim(COALESCE(a.status, ''))) = 'pending_payment'
      AND lower(trim(COALESCE(p.status, ''))) IN ('success', 'successful', 'succeeded', 'paid', 'completed')
    RETURNING a.id AS appointment_id, p.payment_reference
  )
  SELECT * FROM recovered;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_stuck_pending_payment_appointments() TO authenticated;
