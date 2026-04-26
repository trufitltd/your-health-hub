-- Ensure accepted reschedules immediately reflect on appointment cards.
-- Fixes two issues in respond_appointment_reschedule:
-- 1) update updated_at so realtime/list queries reliably refresh
-- 2) return new_date/new_time for instant frontend cache patching

CREATE OR REPLACE FUNCTION public.respond_appointment_reschedule(
  p_appointment_id UUID,
  p_action TEXT,
  p_response_note TEXT DEFAULT NULL
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
  v_request_status TEXT;
  v_requested_by TEXT;
  v_proposed_date DATE;
  v_proposed_time TEXT;
  v_proposed_duration INTEGER;
  v_current_final_price NUMERIC := 0;
  v_proposed_final_price NUMERIC := 0;
  v_upgrade_amount NUMERIC := 0;
  v_action TEXT;
  v_slot_conflict BOOLEAN := FALSE;
  v_wallet_balance NUMERIC := 0;
  v_has_successful_external_upgrade_payment BOOLEAN := FALSE;
  v_target_datetime TIMESTAMPTZ;
  v_refund_payload JSONB;
  v_refunded_upgrade_amount NUMERIC := 0;
  v_proposed_start_ts TIMESTAMP;
  v_proposed_end_ts TIMESTAMP;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_action := lower(trim(COALESCE(p_action, '')));
  IF v_action NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'Action must be approve or decline';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id,
    COALESCE(a.reschedule_request_status, 'none'),
    a.reschedule_requested_by,
    a.reschedule_proposed_date,
    left(COALESCE(a.reschedule_proposed_time, ''), 5),
    COALESCE(a.reschedule_proposed_duration_minutes, COALESCE(a.duration_minutes, 30)),
    COALESCE(a.final_price, 0),
    COALESCE(a.reschedule_proposed_final_price, COALESCE(a.final_price, 0)),
    COALESCE(a.reschedule_upgrade_amount, 0)
  INTO
    v_status,
    v_patient_id,
    v_doctor_id,
    v_request_status,
    v_requested_by,
    v_proposed_date,
    v_proposed_time,
    v_proposed_duration,
    v_current_final_price,
    v_proposed_final_price,
    v_upgrade_amount
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
    RAISE EXCEPTION 'Not authorized for this appointment';
  END IF;

  IF lower(trim(COALESCE(v_request_status, 'none'))) <> 'pending' THEN
    RAISE EXCEPTION 'No pending reschedule request for this appointment';
  END IF;

  IF COALESCE(v_requested_by, '') = '' THEN
    RAISE EXCEPTION 'Reschedule requester is missing';
  END IF;

  IF v_requested_by = v_actor_role THEN
    RAISE EXCEPTION 'Requester cannot approve or decline their own reschedule request';
  END IF;

  IF v_action = 'decline' THEN
    UPDATE public.appointments
    SET
      reschedule_request_status = 'declined',
      reschedule_decision_at = now(),
      reschedule_response_note = p_response_note,
      updated_at = now()
    WHERE id = p_appointment_id;

    IF lower(trim(COALESCE(v_requested_by, ''))) = 'patient' THEN
      v_refund_payload := public.apply_appointment_refund_to_wallet(
        p_appointment_id,
        COALESCE(p_response_note, 'Reschedule request declined refund'),
        v_current_final_price
      );
      v_refunded_upgrade_amount := COALESCE((v_refund_payload->>'refund_amount')::NUMERIC, 0);
    END IF;

    RETURN jsonb_build_object(
      'appointment_id', p_appointment_id,
      'action', 'decline',
      'reschedule_request_status', 'declined',
      'status', v_status,
      'charged_upgrade_amount', 0,
      'refunded_upgrade_amount', ROUND(v_refunded_upgrade_amount, 2)
    );
  END IF;

  IF v_proposed_date IS NULL OR COALESCE(v_proposed_time, '') = '' THEN
    RAISE EXCEPTION 'Reschedule proposal is incomplete';
  END IF;

  BEGIN
    v_target_datetime := ((v_proposed_date::text || ' ' || v_proposed_time)::timestamp)::timestamptz;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid proposed date/time';
  END;

  IF v_target_datetime <= now() THEN
    RAISE EXCEPTION 'Proposed date/time is in the past';
  END IF;

  v_proposed_start_ts := (v_proposed_date::text || ' ' || left(v_proposed_time, 5))::timestamp;
  v_proposed_end_ts := v_proposed_start_ts + make_interval(mins => COALESCE(v_proposed_duration, 30));

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.doctor_id = v_doctor_id
      AND a.id <> p_appointment_id
      AND (
        (
          a.date = v_proposed_date
          AND left(COALESCE(a.time, ''), 5) ~ '^[0-9]{2}:[0-9]{2}$'
          AND tsrange(
            (a.date::text || ' ' || left(COALESCE(a.time, ''), 5))::timestamp,
            (a.date::text || ' ' || left(COALESCE(a.time, ''), 5))::timestamp
              + make_interval(mins => COALESCE(a.duration_minutes, 30)),
            '[)'
          ) && tsrange(v_proposed_start_ts, v_proposed_end_ts, '[)')
          AND (
            lower(trim(COALESCE(a.status, ''))) IN ('pending_approval', 'confirmed', 'in_progress', 'completed')
            OR (
              lower(trim(COALESCE(a.status, ''))) = 'pending_payment'
              AND a.slot_locked_until IS NOT NULL
              AND a.slot_locked_until > now()
            )
          )
        )
        OR (
          COALESCE(a.reschedule_request_status, 'none') = 'pending'
          AND a.reschedule_proposed_date = v_proposed_date
          AND left(COALESCE(a.reschedule_proposed_time, ''), 5) ~ '^[0-9]{2}:[0-9]{2}$'
          AND tsrange(
            (a.reschedule_proposed_date::text || ' ' || left(COALESCE(a.reschedule_proposed_time, ''), 5))::timestamp,
            (a.reschedule_proposed_date::text || ' ' || left(COALESCE(a.reschedule_proposed_time, ''), 5))::timestamp
              + make_interval(mins => COALESCE(a.reschedule_proposed_duration_minutes, COALESCE(a.duration_minutes, 30))),
            '[)'
          ) && tsrange(v_proposed_start_ts, v_proposed_end_ts, '[)')
        )
      )
  ) INTO v_slot_conflict;

  IF v_slot_conflict THEN
    RAISE EXCEPTION 'Selected doctor slot is no longer available';
  END IF;

  IF v_upgrade_amount > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.appointment_id = p_appointment_id
        AND lower(COALESCE(p.status, '')) IN ('completed', 'success', 'paid', 'succeeded')
        AND COALESCE(p.metadata->>'type', '') = 'reschedule_upgrade'
    ) INTO v_has_successful_external_upgrade_payment;

    IF v_has_successful_external_upgrade_payment THEN
      v_upgrade_amount := 0;
    ELSE
      INSERT INTO public.patient_wallet (patient_id, available_balance)
      VALUES (v_patient_id, 0)
      ON CONFLICT (patient_id) DO NOTHING;

      SELECT COALESCE(available_balance, 0)
      INTO v_wallet_balance
      FROM public.patient_wallet
      WHERE patient_id = v_patient_id
      FOR UPDATE;

      IF v_wallet_balance < v_upgrade_amount THEN
        RAISE EXCEPTION 'Insufficient wallet balance for upgrade amount of %', v_upgrade_amount;
      END IF;

      UPDATE public.patient_wallet
      SET available_balance = ROUND(COALESCE(available_balance, 0) - v_upgrade_amount, 2)
      WHERE patient_id = v_patient_id;

      INSERT INTO public.patient_wallet_transactions (
        patient_id,
        appointment_id,
        amount,
        direction,
        transaction_type,
        status,
        narration
      ) VALUES (
        v_patient_id,
        p_appointment_id,
        v_upgrade_amount,
        'debit',
        'booking_wallet_use',
        'completed',
        'Reschedule upgrade payment from wallet'
      );
    END IF;
  END IF;

  UPDATE public.appointments
  SET
    date = v_proposed_date,
    time = v_proposed_time,
    duration_minutes = v_proposed_duration,
    final_price = v_proposed_final_price,
    status = CASE WHEN v_status = 'pending_approval' THEN 'pending_approval' ELSE 'confirmed' END,
    slot_locked_until = NULL,
    reschedule_request_status = 'approved',
    reschedule_decision_at = now(),
    reschedule_response_note = p_response_note,
    updated_at = now()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'action', 'approve',
    'reschedule_request_status', 'approved',
    'status', CASE WHEN v_status = 'pending_approval' THEN 'pending_approval' ELSE 'confirmed' END,
    'charged_upgrade_amount', ROUND(v_upgrade_amount, 2),
    'refunded_upgrade_amount', 0,
    'new_date', v_proposed_date,
    'new_time', v_proposed_time
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_appointment_reschedule(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_appointment_reschedule(UUID, TEXT, TEXT) TO authenticated;

