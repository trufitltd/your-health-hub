-- 38_appointment_reschedule_request_flow.sql
-- Adds request/approval-based reschedule flow while keeping canonical appointment statuses.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reschedule_request_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reschedule_requested_by TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_date DATE,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_time TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_consultation_type TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_final_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS reschedule_upgrade_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS reschedule_request_note TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_response_note TEXT;

UPDATE public.appointments
SET status = lower(trim(status))
WHERE status IS NOT NULL
  AND status <> lower(trim(status));

UPDATE public.appointments
SET reschedule_request_status = lower(trim(COALESCE(reschedule_request_status, 'none')));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_reschedule_request_status_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      DROP CONSTRAINT appointments_reschedule_request_status_check;
  END IF;

  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_reschedule_request_status_check
      CHECK (
        reschedule_request_status IN ('none', 'pending', 'approved', 'declined', 'cancelled', 'expired')
      );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_reschedule_requested_by_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      DROP CONSTRAINT appointments_reschedule_requested_by_check;
  END IF;

  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_reschedule_requested_by_check
      CHECK (
        reschedule_requested_by IS NULL
        OR reschedule_requested_by IN ('patient', 'doctor')
      );
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_reschedule_pending
  ON public.appointments(reschedule_request_status)
  WHERE reschedule_request_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_appointments_reschedule_proposed_slot
  ON public.appointments(doctor_id, reschedule_proposed_date, reschedule_proposed_time)
  WHERE reschedule_request_status = 'pending';

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
  v_wallet_balance NUMERIC := 0;
  v_has_successful_external_upgrade_payment BOOLEAN := FALSE;
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

  -- If a successful external upgrade payment already exists (Paystack webhook path),
  -- do not debit wallet again during request.
  IF v_upgrade_amount > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.appointment_id = p_appointment_id
        AND lower(COALESCE(p.status, '')) IN ('completed', 'success', 'paid', 'succeeded')
        AND COALESCE(p.metadata->>'type', '') = 'reschedule_upgrade'
    ) INTO v_has_successful_external_upgrade_payment;
  END IF;

  -- If the patient initiated the reschedule request and there is an upgrade amount
  -- not already covered by external payment, debit patient wallet at request time.
  IF v_actor_role = 'patient' AND v_upgrade_amount > 0 THEN
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
        'Reschedule upgrade payment from wallet (at request)'
      );

      -- Mark that the upgrade has been taken care of for later approval flow
      v_upgrade_amount := 0;
    END IF;
  END IF;

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
  v_proposed_final_price NUMERIC := 0;
  v_upgrade_amount NUMERIC := 0;
  v_action TEXT;
  v_slot_conflict BOOLEAN := FALSE;
  v_wallet_balance NUMERIC := 0;
  v_has_successful_external_upgrade_payment BOOLEAN := FALSE;
  v_target_datetime TIMESTAMPTZ;
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
      reschedule_response_note = p_response_note
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object(
      'appointment_id', p_appointment_id,
      'action', 'decline',
      'reschedule_request_status', 'declined',
      'status', v_status,
      'charged_upgrade_amount', 0
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

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.doctor_id = v_doctor_id
      AND a.id <> p_appointment_id
      AND a.date = v_proposed_date
      AND left(COALESCE(a.time, ''), 5) = left(v_proposed_time, 5)
      AND (
        lower(trim(COALESCE(a.status, ''))) IN ('pending_approval', 'confirmed', 'in_progress', 'completed')
        OR (
          lower(trim(COALESCE(a.status, ''))) = 'pending_payment'
          AND a.slot_locked_until IS NOT NULL
          AND a.slot_locked_until > now()
        )
        OR (
          COALESCE(a.reschedule_request_status, 'none') = 'pending'
          AND a.reschedule_proposed_date = v_proposed_date
          AND left(COALESCE(a.reschedule_proposed_time, ''), 5) = left(v_proposed_time, 5)
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
      -- External payment already completed; do not touch wallet
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
    reschedule_response_note = p_response_note
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'action', 'approve',
    'reschedule_request_status', 'approved',
    'status', CASE WHEN v_status = 'pending_approval' THEN 'pending_approval' ELSE 'confirmed' END,
    'charged_upgrade_amount', ROUND(v_upgrade_amount, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_appointment_reschedule(UUID, DATE, TEXT, INTEGER, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_appointment_reschedule(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_appointment_reschedule(UUID, DATE, TEXT, INTEGER, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_appointment_reschedule(UUID, TEXT, TEXT) TO authenticated;
