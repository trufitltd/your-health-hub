-- Keep appointment date/time in sync when reschedule is approved.
-- This protects against any code path that sets reschedule_request_status='approved'
-- without copying proposed slot into the canonical appointment date/time fields.

CREATE OR REPLACE FUNCTION public.sync_approved_reschedule_datetime()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.reschedule_request_status, '') = 'approved'
     AND NEW.reschedule_proposed_date IS NOT NULL
     AND COALESCE(NEW.reschedule_proposed_time, '') <> '' THEN
    NEW.date := NEW.reschedule_proposed_date;
    NEW.time := left(NEW.reschedule_proposed_time, 5);
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_approved_reschedule_datetime ON public.appointments;
CREATE TRIGGER trg_sync_approved_reschedule_datetime
BEFORE INSERT OR UPDATE OF reschedule_request_status, reschedule_proposed_date, reschedule_proposed_time
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_approved_reschedule_datetime();

-- One-time backfill for rows already marked approved but still on old slot.
UPDATE public.appointments
SET
  date = reschedule_proposed_date,
  time = left(COALESCE(reschedule_proposed_time, time), 5),
  updated_at = now()
WHERE COALESCE(reschedule_request_status, '') = 'approved'
  AND reschedule_proposed_date IS NOT NULL
  AND COALESCE(reschedule_proposed_time, '') <> ''
  AND (
    date IS DISTINCT FROM reschedule_proposed_date
    OR left(COALESCE(time, ''), 5) IS DISTINCT FROM left(reschedule_proposed_time, 5)
  );

