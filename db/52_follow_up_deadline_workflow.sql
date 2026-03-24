-- 52_follow_up_deadline_workflow.sql
-- Enforces a 7-day follow-up window for appointments marked as needing follow-up.
-- After deadline, appointments are auto-marked completed via RPC.

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS needs_follow_up BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS follow_up_marked_at TIMESTAMPTZ;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS follow_up_deadline_at TIMESTAMPTZ;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS follow_up_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_appointments_follow_up_deadline
  ON public.appointments(follow_up_deadline_at)
  WHERE needs_follow_up = true;

CREATE OR REPLACE FUNCTION public.mark_appointment_needs_follow_up(
  p_appointment_id UUID
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.appointments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Appointment ID is required';
  END IF;

  UPDATE public.appointments a
  SET
    needs_follow_up = true,
    follow_up_marked_at = now(),
    follow_up_deadline_at = now() + interval '7 days',
    follow_up_completed_at = NULL,
    status = CASE
      WHEN lower(coalesce(a.status, '')) IN ('confirmed', 'in_progress')
        THEN 'in_progress'
      ELSE a.status
    END
  WHERE a.id = p_appointment_id
    AND a.doctor_id = auth.uid()
    AND lower(coalesce(a.status, '')) IN ('confirmed', 'in_progress')
  RETURNING a.* INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found or not authorized';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_appointment_needs_follow_up(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_overdue_follow_up_appointments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count INTEGER := 0;
BEGIN
  UPDATE public.appointments a
  SET
    status = 'completed',
    needs_follow_up = false,
    follow_up_completed_at = now()
  WHERE a.needs_follow_up = true
    AND a.follow_up_deadline_at IS NOT NULL
    AND a.follow_up_deadline_at <= now()
    AND lower(coalesce(a.status, '')) IN ('confirmed', 'in_progress');

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_overdue_follow_up_appointments() TO authenticated;
