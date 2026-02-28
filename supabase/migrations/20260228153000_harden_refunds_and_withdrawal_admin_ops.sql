-- 20260228153000_harden_refunds_and_withdrawal_admin_ops.sql
-- Hardens appointment refund computation (including wallet-only upgrade debits),
-- adds reschedule-decline refunds, and introduces admin withdrawal processing workflow.

-- -----------------------------------------------------------------------------
-- Withdrawal workflow hardening
-- -----------------------------------------------------------------------------
ALTER TABLE public.patient_wallet_withdrawal_requests
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS payout_reference TEXT,
  ADD COLUMN IF NOT EXISTS wallet_reversed_at TIMESTAMPTZ;

UPDATE public.patient_wallet_withdrawal_requests
SET sla_due_at = COALESCE(sla_due_at, created_at + INTERVAL '48 hours')
WHERE sla_due_at IS NULL;

ALTER TABLE public.patient_wallet_withdrawal_requests
  ALTER COLUMN sla_due_at SET DEFAULT (now() + INTERVAL '48 hours');

ALTER TABLE public.patient_wallet_withdrawal_requests
  ALTER COLUMN sla_due_at SET NOT NULL;

DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.patient_wallet_withdrawal_requests'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.patient_wallet_withdrawal_requests DROP CONSTRAINT IF EXISTS %I',
      v_constraint.conname
    );
  END LOOP;
END;
$$;

UPDATE public.patient_wallet_withdrawal_requests
SET status = 'completed'
WHERE lower(COALESCE(status, '')) IN ('approved', 'paid');

ALTER TABLE public.patient_wallet_withdrawal_requests
  ADD CONSTRAINT patient_wallet_withdrawal_requests_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_patient_wallet_withdrawal_requests_status_time
  ON public.patient_wallet_withdrawal_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_wallet_withdrawal_requests_sla_due
  ON public.patient_wallet_withdrawal_requests(sla_due_at)
  WHERE status IN ('pending', 'processing');

-- -----------------------------------------------------------------------------
-- Appointment paid/refund helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_appointment_effective_paid_amount(
  p_appointment_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payments_total NUMERIC := 0;
  v_wallet_debits_total NUMERIC := 0;
  v_wallet_payments_total NUMERIC := 0;
  v_adjustment_credits_total NUMERIC := 0;
  v_untracked_wallet_paid NUMERIC := 0;
BEGIN
  IF p_appointment_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(COALESCE(p.amount, 0)), 0)
  INTO v_payments_total
  FROM public.payments p
  WHERE p.appointment_id = p_appointment_id
    AND lower(COALESCE(p.status, '')) IN ('completed', 'success', 'paid', 'succeeded');

  SELECT COALESCE(SUM(COALESCE(t.amount, 0)), 0)
  INTO v_wallet_debits_total
  FROM public.patient_wallet_transactions t
  WHERE t.appointment_id = p_appointment_id
    AND t.direction = 'debit'
    AND t.transaction_type = 'booking_wallet_use'
    AND t.status = 'completed';

  SELECT COALESCE(SUM(COALESCE(p.amount, 0)), 0)
  INTO v_wallet_payments_total
  FROM public.payments p
  WHERE p.appointment_id = p_appointment_id
    AND lower(COALESCE(p.status, '')) IN ('completed', 'success', 'paid', 'succeeded')
    AND lower(COALESCE(p.provider, p.payment_method, '')) = 'wallet';

  SELECT COALESCE(SUM(COALESCE(t.amount, 0)), 0)
  INTO v_adjustment_credits_total
  FROM public.patient_wallet_transactions t
  WHERE t.appointment_id = p_appointment_id
    AND t.direction = 'credit'
    AND t.transaction_type = 'adjustment'
    AND t.status = 'completed';

  -- Wallet debits can exceed wallet payment rows for reschedule upgrades charged directly
  -- from wallet via RPC. Count only the additional uncompensated wallet debits.
  v_untracked_wallet_paid := GREATEST(
    v_wallet_debits_total - v_wallet_payments_total - v_adjustment_credits_total,
    0
  );

  RETURN ROUND(v_payments_total + v_untracked_wallet_paid, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_appointment_refund_to_wallet(
  p_appointment_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_target_retained_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_paid_amount NUMERIC := 0;
  v_existing_refunds NUMERIC := 0;
  v_target_retained NUMERIC := 0;
  v_refund_amount NUMERIC := 0;
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Appointment id is required';
  END IF;

  SELECT a.patient_id
  INTO v_patient_id
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  v_paid_amount := public.get_appointment_effective_paid_amount(p_appointment_id);

  SELECT COALESCE(SUM(COALESCE(t.amount, 0)), 0)
  INTO v_existing_refunds
  FROM public.patient_wallet_transactions t
  WHERE t.appointment_id = p_appointment_id
    AND t.transaction_type = 'refund'
    AND t.direction = 'credit'
    AND t.status = 'completed';

  v_target_retained := ROUND(GREATEST(COALESCE(p_target_retained_amount, 0), 0), 2);
  v_refund_amount := ROUND(
    GREATEST(v_paid_amount - v_target_retained - v_existing_refunds, 0),
    2
  );

  IF v_refund_amount > 0 THEN
    INSERT INTO public.patient_wallet (patient_id, available_balance)
    VALUES (v_patient_id, 0)
    ON CONFLICT (patient_id) DO NOTHING;

    UPDATE public.patient_wallet
    SET available_balance = ROUND(COALESCE(available_balance, 0) + v_refund_amount, 2)
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
      v_refund_amount,
      'credit',
      'refund',
      'completed',
      COALESCE(p_reason, 'Appointment refund')
    );
  END IF;

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'paid_amount', ROUND(v_paid_amount, 2),
    'target_retained_amount', ROUND(v_target_retained, 2),
    'existing_refunds', ROUND(v_existing_refunds, 2),
    'refund_amount', ROUND(v_refund_amount, 2)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Refund-aware cancellation/no-show functions
-- -----------------------------------------------------------------------------
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
  v_refund_payload JSONB;
  v_refund_amount NUMERIC := 0;
  v_reversed_doctor_amount NUMERIC := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id
  INTO v_status, v_patient_id, v_doctor_id
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
      slot_locked_until = NULL
  WHERE id = p_appointment_id;

  v_refund_payload := public.apply_appointment_refund_to_wallet(
    p_appointment_id,
    COALESCE(p_reason, 'Appointment cancelled refund'),
    0
  );
  v_refund_amount := COALESCE((v_refund_payload->>'refund_amount')::NUMERIC, 0);

  v_reversed_doctor_amount := public.reverse_doctor_wallet_for_appointment(p_appointment_id);

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'status', 'cancelled',
    'refund_amount', ROUND(v_refund_amount, 2),
    'doctor_reversal_amount', ROUND(v_reversed_doctor_amount, 2)
  );
END;
$$;

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
  v_refund_payload JSONB;
  v_refund_amount NUMERIC := 0;
  v_reversed_doctor_amount NUMERIC := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id
  INTO v_status, v_patient_id, v_doctor_id
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
    SELECT ((a.date::text || ' ' || a.time::text)::timestamptz)
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
      slot_locked_until = NULL
  WHERE id = p_appointment_id;

  v_refund_payload := public.apply_appointment_refund_to_wallet(
    p_appointment_id,
    COALESCE(p_reason, 'Appointment marked no-show refund'),
    0
  );
  v_refund_amount := COALESCE((v_refund_payload->>'refund_amount')::NUMERIC, 0);

  v_reversed_doctor_amount := public.reverse_doctor_wallet_for_appointment(p_appointment_id);

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'status', 'no_show',
    'refund_amount', ROUND(v_refund_amount, 2),
    'doctor_reversal_amount', ROUND(v_reversed_doctor_amount, 2)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Reschedule response hardening (refund paid upgrade delta when declined)
-- -----------------------------------------------------------------------------
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
      reschedule_response_note = p_response_note
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
    'charged_upgrade_amount', ROUND(v_upgrade_amount, 2),
    'refunded_upgrade_amount', 0
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Withdrawal request submission hardening
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_patient_wallet_withdrawal(
  p_amount NUMERIC,
  p_narration TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_wallet_balance NUMERIC(12,2) := 0;
  v_request_id UUID;
  v_sla_due_at TIMESTAMPTZ := now() + INTERVAL '48 hours';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.patient_wallet_withdrawal_requests wr
    WHERE wr.patient_id = v_actor
      AND wr.status IN ('pending', 'processing')
  ) THEN
    RAISE EXCEPTION 'You already have an active withdrawal request being processed';
  END IF;

  INSERT INTO public.patient_wallet (patient_id, available_balance)
  VALUES (v_actor, 0)
  ON CONFLICT (patient_id) DO NOTHING;

  SELECT COALESCE(available_balance, 0)
  INTO v_wallet_balance
  FROM public.patient_wallet
  WHERE patient_id = v_actor
  FOR UPDATE;

  IF v_wallet_balance < v_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance for withdrawal amount of %', v_amount;
  END IF;

  UPDATE public.patient_wallet
  SET available_balance = ROUND(COALESCE(available_balance, 0) - v_amount, 2)
  WHERE patient_id = v_actor;

  INSERT INTO public.patient_wallet_transactions (
    patient_id,
    appointment_id,
    amount,
    direction,
    transaction_type,
    status,
    narration
  ) VALUES (
    v_actor,
    NULL,
    v_amount,
    'debit',
    'adjustment',
    'completed',
    COALESCE(p_narration, 'Patient wallet withdrawal request')
  );

  INSERT INTO public.patient_wallet_withdrawal_requests (
    patient_id,
    amount,
    status,
    narration,
    sla_due_at
  ) VALUES (
    v_actor,
    v_amount,
    'pending',
    COALESCE(p_narration, 'Patient wallet withdrawal request'),
    v_sla_due_at
  )
  RETURNING id INTO v_request_id;

  SELECT COALESCE(available_balance, 0)
  INTO v_wallet_balance
  FROM public.patient_wallet
  WHERE patient_id = v_actor;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'patient_id', v_actor,
    'status', 'pending',
    'amount', v_amount,
    'balance_after', ROUND(v_wallet_balance, 2),
    'sla_due_at', v_sla_due_at
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Admin withdrawal operations
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_patient_wallet_withdrawal_requests(
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 200,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_email TEXT,
  patient_phone TEXT,
  amount NUMERIC,
  status TEXT,
  narration TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  processed_by UUID,
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  admin_note TEXT,
  payout_reference TEXT,
  wallet_reversed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status_filter TEXT := lower(trim(COALESCE(p_status, '')));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    wr.id,
    wr.patient_id,
    pr.full_name,
    pr.email,
    pr.phone_number,
    wr.amount,
    wr.status,
    wr.narration,
    wr.created_at,
    wr.updated_at,
    wr.sla_due_at,
    wr.processed_by,
    wr.processed_at,
    wr.completed_at,
    wr.admin_note,
    wr.payout_reference,
    wr.wallet_reversed_at
  FROM public.patient_wallet_withdrawal_requests wr
  LEFT JOIN public.patient_registrations pr ON pr.user_id = wr.patient_id
  WHERE
    v_status_filter = ''
    OR v_status_filter = 'all'
    OR lower(COALESCE(wr.status, '')) = v_status_filter
  ORDER BY wr.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_payments(
  p_status TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 400,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  appointment_id UUID,
  patient_id UUID,
  amount NUMERIC,
  status TEXT,
  provider TEXT,
  payment_method TEXT,
  payment_reference TEXT,
  provider_reference TEXT,
  created_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status_filter TEXT := lower(trim(COALESCE(p_status, '')));
  v_provider_filter TEXT := lower(trim(COALESCE(p_provider, '')));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.appointment_id,
    p.patient_id,
    p.amount,
    p.status,
    p.provider,
    p.payment_method,
    p.payment_reference,
    p.provider_reference,
    p.created_at,
    p.verified_at,
    p.metadata
  FROM public.payments p
  WHERE
    (v_status_filter = '' OR v_status_filter = 'all' OR lower(COALESCE(p.status, '')) = v_status_filter)
    AND (
      v_provider_filter = ''
      OR v_provider_filter = 'all'
      OR lower(COALESCE(p.provider, p.payment_method, '')) = v_provider_filter
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 400), 1000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_patient_wallet_transactions(
  p_limit INTEGER DEFAULT 400,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  patient_id UUID,
  appointment_id UUID,
  amount NUMERIC,
  direction TEXT,
  transaction_type TEXT,
  status TEXT,
  narration TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.patient_id,
    t.appointment_id,
    t.amount,
    t.direction,
    t.transaction_type,
    t.status,
    t.narration,
    t.created_at
  FROM public.patient_wallet_transactions t
  ORDER BY t.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 400), 1000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_patient_wallet_withdrawal_request(
  p_request_id UUID,
  p_status TEXT,
  p_admin_note TEXT DEFAULT NULL,
  p_payout_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_next_status TEXT := lower(trim(COALESCE(p_status, '')));
  v_request public.patient_wallet_withdrawal_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Request id is required';
  END IF;

  IF v_next_status NOT IN ('pending', 'processing', 'completed', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid withdrawal request status %', p_status;
  END IF;

  SELECT *
  INTO v_request
  FROM public.patient_wallet_withdrawal_requests wr
  WHERE wr.id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;

  IF v_request.status = 'completed' AND v_next_status <> 'completed' THEN
    RAISE EXCEPTION 'Completed withdrawal requests cannot be changed';
  END IF;

  IF v_request.status IN ('rejected', 'cancelled') AND v_next_status <> v_request.status THEN
    RAISE EXCEPTION 'Finalized withdrawal request cannot be changed from %', v_request.status;
  END IF;

  IF v_request.status = 'processing' AND v_next_status = 'pending' THEN
    RAISE EXCEPTION 'Cannot move processing withdrawal back to pending';
  END IF;

  IF v_next_status = 'completed' AND COALESCE(NULLIF(trim(COALESCE(p_payout_reference, '')), ''), '') = '' THEN
    RAISE EXCEPTION 'Payout reference is required when completing withdrawal request';
  END IF;

  IF v_next_status IN ('rejected', 'cancelled') AND v_request.wallet_reversed_at IS NULL THEN
    INSERT INTO public.patient_wallet (patient_id, available_balance)
    VALUES (v_request.patient_id, 0)
    ON CONFLICT (patient_id) DO NOTHING;

    UPDATE public.patient_wallet
    SET available_balance = ROUND(COALESCE(available_balance, 0) + COALESCE(v_request.amount, 0), 2)
    WHERE patient_id = v_request.patient_id;

    INSERT INTO public.patient_wallet_transactions (
      patient_id,
      appointment_id,
      amount,
      direction,
      transaction_type,
      status,
      narration
    ) VALUES (
      v_request.patient_id,
      NULL,
      COALESCE(v_request.amount, 0),
      'credit',
      'adjustment',
      'completed',
      format('Withdrawal request reversal (%s)', v_request.id)
    );

    v_request.wallet_reversed_at := v_now;
  END IF;

  UPDATE public.patient_wallet_withdrawal_requests
  SET
    status = v_next_status,
    processed_by = v_actor,
    processed_at = CASE
      WHEN v_next_status IN ('processing', 'completed', 'rejected', 'cancelled') THEN v_now
      ELSE processed_at
    END,
    completed_at = CASE
      WHEN v_next_status = 'completed' THEN v_now
      ELSE completed_at
    END,
    admin_note = COALESCE(NULLIF(p_admin_note, ''), admin_note),
    payout_reference = CASE
      WHEN v_next_status = 'completed' THEN NULLIF(trim(COALESCE(p_payout_reference, '')), '')
      ELSE payout_reference
    END,
    wallet_reversed_at = COALESCE(wallet_reversed_at, v_request.wallet_reversed_at),
    updated_at = v_now
  WHERE id = p_request_id;

  SELECT *
  INTO v_request
  FROM public.patient_wallet_withdrawal_requests wr
  WHERE wr.id = p_request_id;

  RETURN jsonb_build_object(
    'id', v_request.id,
    'patient_id', v_request.patient_id,
    'amount', COALESCE(v_request.amount, 0),
    'status', v_request.status,
    'processed_by', v_request.processed_by,
    'processed_at', v_request.processed_at,
    'completed_at', v_request.completed_at,
    'admin_note', v_request.admin_note,
    'payout_reference', v_request.payout_reference,
    'wallet_reversed_at', v_request.wallet_reversed_at,
    'sla_due_at', v_request.sla_due_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_appointment_effective_paid_amount(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_appointment_refund_to_wallet(UUID, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_patient_wallet_withdrawal_requests(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_patient_wallet_transactions(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_patient_wallet_withdrawal_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_appointment_effective_paid_amount(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_appointment_refund_to_wallet(UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_patient_wallet_withdrawal_requests(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_patient_wallet_transactions(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_patient_wallet_withdrawal_request(UUID, TEXT, TEXT, TEXT) TO authenticated;
