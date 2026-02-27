-- Fix: replace consultation_type with reschedule_proposed_consultation_type in reschedule function

CREATE OR REPLACE FUNCTION public.request_appointment_reschedule(
  p_appointment_id UUID,
  p_proposed_date DATE,
  p_proposed_time TEXT,
  p_proposed_duration_minutes INTEGER DEFAULT NULL,
  p_proposed_final_price NUMERIC DEFAULT NULL,
  p_proposed_consultation_type TEXT DEFAULT NULL,
  p_request_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_role TEXT;
  v_status TEXT;
  v_patient_id UUID;
  v_doctor_id UUID;
  v_existing_request_status TEXT;
  v_current_duration INTEGER := 30;
  v_requested_duration INTEGER := 30;
  v_current_final_price NUMERIC := 0;
  v_proposed_final_price NUMERIC := 0;
  v_upgrade_amount NUMERIC := 0;
  v_proposed_time TEXT;
  v_slot_conflict BOOLEAN := FALSE;
  v_target_datetime TIMESTAMPTZ;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_appointment_id IS NULL OR p_proposed_date IS NULL OR COALESCE(trim(p_proposed_time), '') = '' THEN
    RAISE EXCEPTION 'Appointment id, proposed date and proposed time are required';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id,
    COALESCE(a.reschedule_request_status, 'none'),
    COALESCE(a.duration_minutes, 30),
    COALESCE(a.final_price, 0)
  INTO
    v_status,
    v_patient_id,
    v_doctor_id,
    v_existing_request_status,
    v_current_duration,
    v_current_final_price
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_actor = v_patient_id THEN
    v_actor_role := 'patient';
  ELSIF v_actor = v_doctor_id THEN
    v_actor_role := 'doctor';
  ELSE
    RAISE EXCEPTION 'Not authorized to request reschedule for this appointment';
  END IF;

  IF v_status NOT IN ('pending_approval', 'confirmed', 'no_show') THEN
    RAISE EXCEPTION 'Cannot request reschedule for appointment in status %', v_status;
  END IF;

  IF lower(trim(COALESCE(v_existing_request_status, 'none'))) = 'pending' THEN
    RAISE EXCEPTION 'There is already a pending reschedule request for this appointment';
  END IF;

  v_proposed_time := left(trim(p_proposed_time), 5);
  IF v_proposed_time !~ '^\d{2}:\d{2}$' THEN
    RAISE EXCEPTION 'Invalid proposed time format. Use HH:MM';
  END IF;

  BEGIN
    v_target_datetime := ((p_proposed_date::text || ' ' || v_proposed_time)::timestamp)::timestamptz;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid proposed date/time';
  END;

  IF v_target_datetime <= now() THEN
    RAISE EXCEPTION 'Proposed date/time must be in the future';
  END IF;

  v_requested_duration := COALESCE(p_proposed_duration_minutes, v_current_duration);
  IF v_requested_duration < v_current_duration THEN
    RAISE EXCEPTION 'Only duration upgrades are allowed';
  END IF;

  IF v_actor_role = 'doctor' AND v_requested_duration <> v_current_duration THEN
    RAISE EXCEPTION 'Doctor-initiated reschedule can only change date/time';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.doctor_id = v_doctor_id
      AND a.id <> p_appointment_id
      AND a.date = p_proposed_date
      AND left(COALESCE(a.time, ''), 5) = v_proposed_time
      AND (
        lower(trim(COALESCE(a.status, ''))) IN ('pending_approval', 'confirmed', 'in_progress', 'completed')
        OR (
          lower(trim(COALESCE(a.status, ''))) = 'pending_payment'
          AND a.slot_locked_until IS NOT NULL
          AND a.slot_locked_until > now()
        )
        OR (
          COALESCE(a.reschedule_request_status, 'none') = 'pending'
          AND a.reschedule_proposed_date = p_proposed_date
          AND left(COALESCE(a.reschedule_proposed_time, ''), 5) = v_proposed_time
        )
      )
  ) INTO v_slot_conflict;

  IF v_slot_conflict THEN
    RAISE EXCEPTION 'Selected doctor slot is not available';
  END IF;

  v_proposed_final_price := COALESCE(p_proposed_final_price, v_current_final_price);
  IF v_proposed_final_price < v_current_final_price THEN
    v_proposed_final_price := v_current_final_price;
  END IF;

  v_proposed_final_price := ROUND(v_proposed_final_price, 2);
  v_upgrade_amount := ROUND(GREATEST(v_proposed_final_price - v_current_final_price, 0), 2);

  UPDATE public.appointments
  SET
    reschedule_request_status = 'pending',
    reschedule_requested_by = v_actor_role,
    reschedule_requested_at = now(),
    reschedule_decision_at = NULL,
    reschedule_proposed_date = p_proposed_date,
    reschedule_proposed_time = v_proposed_time,
    reschedule_proposed_duration_minutes = v_requested_duration,
    reschedule_proposed_consultation_type = COALESCE(p_proposed_consultation_type, 
      (SELECT reschedule_proposed_consultation_type FROM public.appointments WHERE id = p_appointment_id)),
    reschedule_proposed_final_price = v_proposed_final_price,
    reschedule_upgrade_amount = v_upgrade_amount,
    reschedule_request_note = p_request_note,
    reschedule_response_note = NULL
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'reschedule_request_status', 'pending',
    'requested_by', v_actor_role,
    'proposed_date', p_proposed_date,
    'proposed_time', v_proposed_time,
    'proposed_duration_minutes', v_requested_duration,
    'proposed_final_price', v_proposed_final_price,
    'upgrade_amount', v_upgrade_amount
  );
END;
$$;
