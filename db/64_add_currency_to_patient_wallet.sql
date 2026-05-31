-- 64_add_currency_to_patient_wallet.sql
-- Add currency columns to patient_wallet and patient_wallet_transactions,
-- and update the related RPCs/functions to prevent mixed-currency wallets.

-- 1. Add currency column to patient_wallet
ALTER TABLE public.patient_wallet
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (currency IN ('NGN', 'USD'));

-- 2. Add currency column to patient_wallet_transactions
ALTER TABLE public.patient_wallet_transactions
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (currency IN ('NGN', 'USD'));

-- Drop existing functions before redefining to prevent return type/parameter mismatches
DROP FUNCTION IF EXISTS public.cancel_appointment_with_refund(UUID, TEXT);
DROP FUNCTION IF EXISTS public.mark_appointment_no_show(UUID, TEXT);
DROP FUNCTION IF EXISTS public.request_appointment_reschedule(UUID, DATE, TEXT, INTEGER, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.respond_appointment_reschedule(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_list_patient_wallets(TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.admin_get_patient_wallet_detail(UUID);
DROP FUNCTION IF EXISTS public.admin_adjust_patient_wallet(UUID, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_adjust_patient_wallet(UUID, NUMERIC, TEXT, TEXT, TEXT);

-- 3. Redefine cancel_appointment_with_refund to support currency
CREATE OR REPLACE FUNCTION public.cancel_appointment_with_refund(
  p_appointment_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status TEXT;
  v_patient_id UUID;
  v_doctor_id UUID;
  v_final_price NUMERIC := 0;
  v_paid_amount NUMERIC := 0;
  v_existing_refunds NUMERIC := 0;
  v_refund_amount NUMERIC := 0;
  v_reversed_doctor_amount NUMERIC := 0;
  v_currency TEXT := 'NGN';
  v_wallet_balance NUMERIC := 0;
  v_wallet_currency TEXT := 'NGN';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id,
    COALESCE(a.final_price, 0),
    COALESCE(a.currency, 'NGN')
  INTO v_status, v_patient_id, v_doctor_id, v_final_price, v_currency
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_actor <> v_patient_id AND v_actor <> v_doctor_id THEN
    RAISE EXCEPTION 'Not authorized to cancel this appointment';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'appointment_id', p_appointment_id,
      'status', 'cancelled',
      'refund_amount', 0,
      'already_cancelled', true
    );
  END IF;

  IF v_status IN ('completed', 'no_show') THEN
    RAISE EXCEPTION 'Cannot cancel appointment in status %', v_status;
  END IF;

  IF v_status NOT IN ('pending_payment', 'pending_approval', 'confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot cancel appointment in status %', v_status;
  END IF;

  UPDATE public.appointments
  SET status = 'cancelled',
      slot_locked_until = NULL,
      updated_at = now()
  WHERE id = p_appointment_id;

  SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_paid_amount
  FROM public.payments
  WHERE appointment_id = p_appointment_id
    AND lower(COALESCE(status, '')) IN ('completed', 'success');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_refunds
  FROM public.patient_wallet_transactions
  WHERE appointment_id = p_appointment_id
    AND transaction_type = 'refund'
    AND direction = 'credit'
    AND status = 'completed';

  v_refund_amount := LEAST(v_paid_amount, v_final_price);
  v_refund_amount := GREATEST(v_refund_amount - v_existing_refunds, 0);

  IF v_refund_amount > 0 THEN
    -- Ensure wallet exists
    INSERT INTO public.patient_wallet (patient_id, available_balance, currency)
    VALUES (v_patient_id, 0, v_currency)
    ON CONFLICT (patient_id) DO NOTHING;

    -- Fetch current wallet details
    SELECT available_balance, currency INTO v_wallet_balance, v_wallet_currency
    FROM public.patient_wallet
    WHERE patient_id = v_patient_id
    FOR UPDATE;

    -- Update currency if wallet is empty and has a different currency
    IF v_wallet_currency <> v_currency THEN
      IF v_wallet_balance = 0 THEN
        UPDATE public.patient_wallet
        SET currency = v_currency
        WHERE patient_id = v_patient_id;
        v_wallet_currency := v_currency;
      ELSE
        RAISE EXCEPTION 'Wallet currency (%) does not match refund currency (%). Currency conversion is not supported.', v_wallet_currency, v_currency;
      END IF;
    END IF;

    UPDATE public.patient_wallet
    SET available_balance = ROUND(COALESCE(available_balance, 0) + v_refund_amount, 2)
    WHERE patient_id = v_patient_id;

    INSERT INTO public.patient_wallet_transactions (
      patient_id,
      appointment_id,
      amount,
      currency,
      direction,
      transaction_type,
      status,
      narration
    ) VALUES (
      v_patient_id,
      p_appointment_id,
      v_refund_amount,
      v_currency,
      'credit',
      'refund',
      'completed',
      COALESCE(p_reason, 'Appointment cancelled refund')
    );
  END IF;

  v_reversed_doctor_amount := public.reverse_doctor_wallet_for_appointment(p_appointment_id);

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'status', 'cancelled',
    'refund_amount', ROUND(v_refund_amount, 2),
    'currency', v_currency,
    'doctor_reversal_amount', ROUND(v_reversed_doctor_amount, 2)
  );
END;
$$;

-- 4. Redefine mark_appointment_no_show to support currency
CREATE OR REPLACE FUNCTION public.mark_appointment_no_show(
  p_appointment_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status TEXT;
  v_patient_id UUID;
  v_doctor_id UUID;
  v_appointment_at TIMESTAMPTZ := NULL;
  v_final_price NUMERIC := 0;
  v_paid_amount NUMERIC := 0;
  v_existing_refunds NUMERIC := 0;
  v_refund_amount NUMERIC := 0;
  v_reversed_doctor_amount NUMERIC := 0;
  v_currency TEXT := 'NGN';
  v_wallet_balance NUMERIC := 0;
  v_wallet_currency TEXT := 'NGN';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id,
    COALESCE(a.final_price, 0),
    COALESCE(a.currency, 'NGN')
  INTO v_status, v_patient_id, v_doctor_id, v_final_price, v_currency
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_actor <> v_doctor_id THEN
    RAISE EXCEPTION 'Only the assigned doctor can mark no-show';
  END IF;

  IF v_status = 'no_show' THEN
    RETURN jsonb_build_object(
      'appointment_id', p_appointment_id,
      'status', 'no_show',
      'refund_amount', 0,
      'already_no_show', true
    );
  END IF;

  IF v_status NOT IN ('confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot mark no-show for appointment in status %', v_status;
  END IF;

  BEGIN
    SELECT ((a.date::text || ' ' || a.time::text)::timestamp)::timestamptz
    INTO v_appointment_at
    FROM public.appointments a
    WHERE a.id = p_appointment_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_appointment_at := NULL;
  END;

  IF v_appointment_at IS NOT NULL AND v_appointment_at > now() THEN
    RAISE EXCEPTION 'Cannot mark no-show before appointment time';
  END IF;

  UPDATE public.appointments
  SET status = 'no_show',
      slot_locked_until = NULL,
      updated_at = now()
  WHERE id = p_appointment_id;

  SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_paid_amount
  FROM public.payments
  WHERE appointment_id = p_appointment_id
    AND lower(COALESCE(status, '')) IN ('completed', 'success');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_refunds
  FROM public.patient_wallet_transactions
  WHERE appointment_id = p_appointment_id
    AND transaction_type = 'refund'
    AND direction = 'credit'
    AND status = 'completed';

  v_refund_amount := LEAST(v_paid_amount, v_final_price);
  v_refund_amount := GREATEST(v_refund_amount - v_existing_refunds, 0);

  IF v_refund_amount > 0 THEN
    -- Ensure wallet exists
    INSERT INTO public.patient_wallet (patient_id, available_balance, currency)
    VALUES (v_patient_id, 0, v_currency)
    ON CONFLICT (patient_id) DO NOTHING;

    -- Fetch current wallet details
    SELECT available_balance, currency INTO v_wallet_balance, v_wallet_currency
    FROM public.patient_wallet
    WHERE patient_id = v_patient_id
    FOR UPDATE;

    -- Update currency if wallet is empty and has a different currency
    IF v_wallet_currency <> v_currency THEN
      IF v_wallet_balance = 0 THEN
        UPDATE public.patient_wallet
        SET currency = v_currency
        WHERE patient_id = v_patient_id;
        v_wallet_currency := v_currency;
      ELSE
        RAISE EXCEPTION 'Wallet currency (%) does not match refund currency (%). Currency conversion is not supported.', v_wallet_currency, v_currency;
      END IF;
    END IF;

    UPDATE public.patient_wallet
    SET available_balance = ROUND(COALESCE(available_balance, 0) + v_refund_amount, 2)
    WHERE patient_id = v_patient_id;

    INSERT INTO public.patient_wallet_transactions (
      patient_id,
      appointment_id,
      amount,
      currency,
      direction,
      transaction_type,
      status,
      narration
    ) VALUES (
      v_patient_id,
      p_appointment_id,
      v_refund_amount,
      v_currency,
      'credit',
      'refund',
      'completed',
      COALESCE(p_reason, 'Appointment marked no-show refund')
    );
  END IF;

  v_reversed_doctor_amount := public.reverse_doctor_wallet_for_appointment(p_appointment_id);

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'status', 'no_show',
    'refund_amount', ROUND(v_refund_amount, 2),
    'currency', v_currency,
    'doctor_reversal_amount', ROUND(v_reversed_doctor_amount, 2)
  );
END;
$$;

-- 5. Redefine request_appointment_reschedule to support currency
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
  v_wallet_currency TEXT := 'NGN';
  v_has_successful_external_upgrade_payment BOOLEAN := FALSE;
  v_slot_conflict BOOLEAN := FALSE;
  v_target_datetime TIMESTAMPTZ;
  v_currency TEXT := 'NGN';
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
    COALESCE(a.final_price, 0),
    COALESCE(a.currency, 'NGN')
  INTO
    v_status,
    v_patient_id,
    v_doctor_id,
    v_existing_request_status,
    v_current_duration,
    v_current_final_price,
    v_currency
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

  IF v_upgrade_amount > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.appointment_id = p_appointment_id
        AND lower(COALESCE(p.status, '')) IN ('completed', 'success', 'paid', 'succeeded')
        AND COALESCE(p.metadata->>'type', '') = 'reschedule_upgrade'
    ) INTO v_has_successful_external_upgrade_payment;
  END IF;

  IF v_actor_role = 'patient' AND v_upgrade_amount > 0 THEN
    IF v_has_successful_external_upgrade_payment THEN
      v_upgrade_amount := 0;
    ELSE
      INSERT INTO public.patient_wallet (patient_id, available_balance, currency)
      VALUES (v_patient_id, 0, v_currency)
      ON CONFLICT (patient_id) DO NOTHING;

      SELECT available_balance, currency
      INTO v_wallet_balance, v_wallet_currency
      FROM public.patient_wallet
      WHERE patient_id = v_patient_id
      FOR UPDATE;

      IF v_wallet_currency <> v_currency THEN
        RAISE EXCEPTION 'Cannot pay upgrade in % because your wallet is in %', v_currency, v_wallet_currency;
      END IF;

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
        currency,
        direction,
        transaction_type,
        status,
        narration
      ) VALUES (
        v_patient_id,
        p_appointment_id,
        v_upgrade_amount,
        v_currency,
        'debit',
        'booking_wallet_use',
        'completed',
        'Reschedule upgrade payment from wallet (at request)'
      );

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
    reschedule_response_note = NULL,
    updated_at = now()
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

-- 6. Redefine respond_appointment_reschedule to support currency
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
  v_wallet_currency TEXT := 'NGN';
  v_has_successful_external_upgrade_payment BOOLEAN := FALSE;
  v_target_datetime TIMESTAMPTZ;
  v_currency TEXT := 'NGN';
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
    COALESCE(a.reschedule_upgrade_amount, 0),
    COALESCE(a.currency, 'NGN')
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
    v_upgrade_amount,
    v_currency
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
      reschedule_decision_at    = now(),
      reschedule_response_note  = p_response_note,
      updated_at                = now()
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object(
      'appointment_id',            p_appointment_id,
      'action',                    'decline',
      'reschedule_request_status', 'declined',
      'status',                    v_status,
      'charged_upgrade_amount',    0
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
      v_upgrade_amount := 0;
    ELSE
      INSERT INTO public.patient_wallet (patient_id, available_balance, currency)
      VALUES (v_patient_id, 0, v_currency)
      ON CONFLICT (patient_id) DO NOTHING;

      SELECT available_balance, currency
      INTO v_wallet_balance, v_wallet_currency
      FROM public.patient_wallet
      WHERE patient_id = v_patient_id
      FOR UPDATE;

      IF v_wallet_currency <> v_currency THEN
        RAISE EXCEPTION 'Cannot pay upgrade in % because your wallet is in %', v_currency, v_wallet_currency;
      END IF;

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
        currency,
        direction,
        transaction_type,
        status,
        narration
      ) VALUES (
        v_patient_id,
        p_appointment_id,
        v_upgrade_amount,
        v_currency,
        'debit',
        'booking_wallet_use',
        'completed',
        'Reschedule upgrade payment from wallet'
      );
    END IF;
  END IF;

  UPDATE public.appointments
  SET
    date                      = v_proposed_date,
    time                      = v_proposed_time,
    duration_minutes          = v_proposed_duration,
    final_price               = v_proposed_final_price,
    status                    = CASE WHEN v_status = 'pending_approval' THEN 'pending_approval' ELSE 'confirmed' END,
    slot_locked_until         = NULL,
    reschedule_request_status = 'approved',
    reschedule_decision_at    = now(),
    reschedule_response_note  = p_response_note,
    updated_at                = now()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id',            p_appointment_id,
    'action',                    'approve',
    'reschedule_request_status', 'approved',
    'status',                    CASE WHEN v_status = 'pending_approval' THEN 'pending_approval' ELSE 'confirmed' END,
    'charged_upgrade_amount',    ROUND(v_upgrade_amount, 2),
    'new_date',                  v_proposed_date,
    'new_time',                  v_proposed_time
  );
END;
$$;

-- 7. Redefine admin_list_patient_wallets to support currency
CREATE OR REPLACE FUNCTION public.admin_list_patient_wallets(
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  patient_id UUID,
  full_name TEXT,
  email TEXT,
  available_balance NUMERIC,
  currency TEXT,
  total_credited NUMERIC,
  total_debited NUMERIC,
  last_transaction_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT := lower(trim(COALESCE(auth.email(), '')));
  v_is_admin BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT v_email = ANY(ARRAY[
    'tj@gmail.com','myedoctoronline@gmail.com','ramadan@gmail.com','ibtisama.ramadan@gmail.com'
  ]) INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role IN ('admin','coo'))
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN RAISE EXCEPTION 'Forbidden'; END IF;

  RETURN QUERY
  SELECT
    pr.user_id,
    COALESCE(pr.full_name, 'Unknown')::TEXT,
    COALESCE(pr.email, '')::TEXT,
    ROUND(COALESCE(pw.available_balance, 0), 2),
    COALESCE(pw.currency, 'NGN')::TEXT,
    ROUND(COALESCE(SUM(CASE WHEN wt.direction = 'credit' THEN wt.amount ELSE 0 END), 0), 2),
    ROUND(COALESCE(SUM(CASE WHEN wt.direction = 'debit'  THEN wt.amount ELSE 0 END), 0), 2),
    MAX(wt.created_at)
  FROM public.patient_registrations pr
  LEFT JOIN public.patient_wallet pw ON pw.patient_id = pr.user_id
  LEFT JOIN public.patient_wallet_transactions wt ON wt.patient_id = pr.user_id
  WHERE (
    p_search IS NULL OR p_search = '' OR
    pr.full_name ILIKE '%' || p_search || '%' OR
    pr.email ILIKE '%' || p_search || '%'
  )
  GROUP BY pr.user_id, pr.full_name, pr.email, pw.available_balance, pw.currency
  ORDER BY COALESCE(pw.available_balance, 0) DESC, pr.full_name ASC
  LIMIT LEAST(p_limit, 200)
  OFFSET p_offset;
END;
$$;

-- 8. Redefine admin_get_patient_wallet_detail to return currency
CREATE OR REPLACE FUNCTION public.admin_get_patient_wallet_detail(p_patient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_email    TEXT := lower(trim(COALESCE(auth.email(), '')));
  v_is_admin BOOLEAN := false;
  v_result   JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT v_email = ANY(ARRAY[
    'tj@gmail.com','myedoctoronline@gmail.com','ramadan@gmail.com','ibtisama.ramadan@gmail.com'
  ]) INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role IN ('admin','coo'))
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT jsonb_build_object(
    'patient_id',        pw.patient_id,
    'full_name',         COALESCE(pr.full_name, 'Unknown'),
    'email',             COALESCE(pr.email, ''),
    'available_balance', ROUND(COALESCE(pw.available_balance, 0), 2),
    'currency',          COALESCE(pw.currency, 'NGN'),
    'transactions',      COALESCE((
      SELECT jsonb_agg(t ORDER BY t.created_at DESC)
      FROM (
        SELECT
          wt.id, wt.amount, wt.currency, wt.direction, wt.transaction_type,
          wt.status, wt.narration, wt.created_at, wt.appointment_id
        FROM public.patient_wallet_transactions wt
        WHERE wt.patient_id = p_patient_id
        ORDER BY wt.created_at DESC
        LIMIT 100
      ) t
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.patient_wallet pw
  LEFT JOIN public.patient_registrations pr ON pr.user_id = pw.patient_id
  WHERE pw.patient_id = p_patient_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Patient wallet not found';
  END IF;

  RETURN v_result;
END;
$$;

-- 9. Redefine admin_adjust_patient_wallet to support currency adjustments
CREATE OR REPLACE FUNCTION public.admin_adjust_patient_wallet(
  p_patient_id UUID,
  p_amount     NUMERIC,
  p_direction  TEXT, -- 'credit' or 'debit'
  p_reason     TEXT,
  p_currency   TEXT DEFAULT 'NGN'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_email        TEXT := lower(trim(COALESCE(auth.email(), '')));
  v_is_admin     BOOLEAN := false;
  v_balance      NUMERIC;
  v_new_balance  NUMERIC;
  v_currency     TEXT := 'NGN';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT v_email = ANY(ARRAY[
    'tj@gmail.com','myedoctoronline@gmail.com','ramadan@gmail.com','ibtisama.ramadan@gmail.com'
  ]) INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role IN ('admin','coo'))
    INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF p_direction NOT IN ('credit', 'debit') THEN RAISE EXCEPTION 'Direction must be credit or debit'; END IF;
  IF p_currency NOT IN ('NGN', 'USD') THEN RAISE EXCEPTION 'Currency must be NGN or USD'; END IF;

  -- Ensure wallet row exists
  INSERT INTO public.patient_wallet (patient_id, available_balance, currency)
  VALUES (p_patient_id, 0, p_currency)
  ON CONFLICT (patient_id) DO NOTHING;

  SELECT available_balance, currency INTO v_balance, v_currency
  FROM public.patient_wallet
  WHERE patient_id = p_patient_id
  FOR UPDATE;

  -- If currency changed and balance is zero, update it
  IF v_currency <> p_currency THEN
    IF v_balance = 0 THEN
      UPDATE public.patient_wallet
      SET currency = p_currency
      WHERE patient_id = p_patient_id;
      v_currency := p_currency;
    ELSE
      RAISE EXCEPTION 'Cannot adjust wallet in % because the wallet is in % and has a non-zero balance', p_currency, v_currency;
    END IF;
  END IF;

  IF p_direction = 'debit' AND v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current balance: % %', v_balance, v_currency;
  END IF;

  v_new_balance := CASE
    WHEN p_direction = 'credit' THEN ROUND(v_balance + p_amount, 2)
    ELSE ROUND(v_balance - p_amount, 2)
  END;

  UPDATE public.patient_wallet
  SET available_balance = v_new_balance
  WHERE patient_id = p_patient_id;

  INSERT INTO public.patient_wallet_transactions (
    patient_id, amount, currency, direction, transaction_type, status, narration
  ) VALUES (
    p_patient_id, p_amount, v_currency, p_direction, 'adjustment', 'completed',
    COALESCE(p_reason, 'Admin adjustment') || ' (by admin ' || v_uid::TEXT || ')'
  );

  RETURN jsonb_build_object(
    'patient_id',     p_patient_id,
    'direction',      p_direction,
    'amount',         p_amount,
    'currency',       v_currency,
    'balance_before', v_balance,
    'balance_after',  v_new_balance
  );
END;
$$;

-- 10. Re-grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_list_patient_wallets(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_patient_wallet_detail(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_patient_wallet(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_appointment_reschedule(UUID, DATE, TEXT, INTEGER, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_appointment_reschedule(UUID, TEXT, TEXT) TO authenticated;
