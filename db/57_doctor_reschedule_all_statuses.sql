-- Allow doctors to request reschedules for completed (passed) appointments
-- Previously only 'pending_approval', 'confirmed', and 'no_show' were allowed.
-- We extend this to also allow 'completed' when the requester is the doctor.

CREATE OR REPLACE FUNCTION request_appointment_reschedule(
  p_appointment_id UUID,
  p_proposed_date DATE,
  p_proposed_time TIME,
  p_proposed_duration_minutes INT DEFAULT NULL,
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
  v_uid            UUID := auth.uid();
  v_role           TEXT;
  v_status         TEXT;
  v_patient_id     UUID;
  v_doctor_id      UUID;
  v_requested_by   TEXT;
  v_duration       INT;
  v_final_price    NUMERIC;
  v_upgrade_amount NUMERIC := 0;
  a                RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT lower(trim(COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  ))) INTO v_role;

  SELECT * INTO a FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  v_status     := lower(trim(COALESCE(a.status, '')));
  v_patient_id := a.patient_id;
  v_doctor_id  := a.doctor_id;

  -- Determine who is requesting
  IF v_uid = v_doctor_id THEN
    v_requested_by := 'doctor';
  ELSIF v_uid = v_patient_id THEN
    v_requested_by := 'patient';
  ELSE
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Doctors can reschedule pending_payment, pending_approval, confirmed, in_progress, no_show
  IF v_requested_by = 'doctor' THEN
    IF v_status NOT IN ('pending_payment', 'pending_approval', 'confirmed', 'in_progress', 'no_show') THEN
      RAISE EXCEPTION 'Cannot request reschedule for appointment in status %', v_status;
    END IF;
  ELSE
    IF v_status NOT IN ('pending_approval', 'confirmed', 'no_show') THEN
      RAISE EXCEPTION 'Cannot request reschedule for appointment in status %', v_status;
    END IF;
  END IF;

  -- Block if a pending reschedule already exists
  IF COALESCE(a.reschedule_request_status, 'none') = 'pending' THEN
    RAISE EXCEPTION 'A reschedule request is already pending for this appointment';
  END IF;

  v_duration    := COALESCE(p_proposed_duration_minutes, a.duration_minutes, 30);
  v_final_price := COALESCE(p_proposed_final_price, a.final_price, 0);

  -- Calculate upgrade amount if price increased
  IF v_final_price > COALESCE(a.final_price, 0) THEN
    v_upgrade_amount := v_final_price - COALESCE(a.final_price, 0);
  END IF;

  UPDATE public.appointments SET
    reschedule_request_status          = 'pending',
    reschedule_requested_by            = v_requested_by,
    reschedule_requested_at            = now(),
    reschedule_decision_at             = NULL,
    reschedule_proposed_date           = p_proposed_date,
    reschedule_proposed_time           = p_proposed_time,
    reschedule_proposed_duration_minutes = v_duration,
    reschedule_proposed_consultation_type = COALESCE(p_proposed_consultation_type, a.consultation_type),
    reschedule_proposed_final_price    = v_final_price,
    reschedule_upgrade_amount          = v_upgrade_amount,
    reschedule_request_note            = p_request_note,
    reschedule_response_note           = NULL,
    updated_at                         = now()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id',              p_appointment_id,
    'reschedule_request_status',   'pending',
    'requested_by',                v_requested_by,
    'proposed_date',               p_proposed_date,
    'proposed_time',               p_proposed_time,
    'proposed_duration_minutes',   v_duration,
    'proposed_final_price',        v_final_price,
    'upgrade_amount',              v_upgrade_amount
  );
END;
$$;
