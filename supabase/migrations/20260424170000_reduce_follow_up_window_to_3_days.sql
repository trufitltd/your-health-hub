-- Reduce follow-up lifecycle window from 7 days to 3 days.
-- This updates the RPCs used by the frontend to mark and auto-complete follow-up appointments.

DROP FUNCTION IF EXISTS public.mark_appointment_needs_follow_up(UUID);
DROP FUNCTION IF EXISTS public.complete_overdue_follow_up_appointments();

CREATE FUNCTION public.mark_appointment_needs_follow_up(
  p_appointment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.appointments
  SET
    needs_follow_up = true,
    follow_up_marked_at = now(),
    follow_up_deadline_at = now() + interval '3 days',
    follow_up_completed_at = NULL,
    status = 'in_progress',
    updated_at = now()
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_appointment_needs_follow_up(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_appointment_needs_follow_up(UUID) TO authenticated;

CREATE FUNCTION public.complete_overdue_follow_up_appointments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE public.appointments
  SET
    needs_follow_up = false,
    follow_up_completed_at = COALESCE(follow_up_completed_at, now()),
    status = 'completed',
    updated_at = now()
  WHERE
    COALESCE(needs_follow_up, false) = true
    AND follow_up_deadline_at IS NOT NULL
    AND follow_up_deadline_at <= now()
    AND status IN ('confirmed', 'in_progress', 'completed');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_overdue_follow_up_appointments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_overdue_follow_up_appointments() TO authenticated;
