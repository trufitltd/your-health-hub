-- Patient wallet enhancements:
-- 1) Atomic wallet debit helper for booking payments.
-- 2) Patient withdrawal request flow.
-- 3) Refund logic hardening for cancellation / no-show.

CREATE TABLE IF NOT EXISTS public.patient_wallet_withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  narration TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_wallet_withdrawal_requests_patient_time
  ON public.patient_wallet_withdrawal_requests(patient_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_patient_wallet_withdrawal_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_wallet_withdrawal_requests_updated_at ON public.patient_wallet_withdrawal_requests;
CREATE TRIGGER trg_patient_wallet_withdrawal_requests_updated_at
  BEFORE UPDATE ON public.patient_wallet_withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_patient_wallet_withdrawal_requests_updated_at();

ALTER TABLE public.patient_wallet_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view own withdrawal requests" ON public.patient_wallet_withdrawal_requests;
CREATE POLICY "Patients can view own withdrawal requests"
  ON public.patient_wallet_withdrawal_requests FOR SELECT
  USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "Patients can create own withdrawal requests" ON public.patient_wallet_withdrawal_requests;
CREATE POLICY "Patients can create own withdrawal requests"
  ON public.patient_wallet_withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

CREATE OR REPLACE FUNCTION public.debit_patient_wallet_for_booking(
  p_patient_id UUID,
  p_appointment_id UUID,
  p_amount NUMERIC,
  p_narration TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_wallet_balance NUMERIC(12,2) := 0;
BEGIN
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'Patient id is required';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Appointment id is required';
  END IF;

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object(
      'patient_id', p_patient_id,
      'appointment_id', p_appointment_id,
      'charged_amount', 0,
      'balance_after', NULL,
      'skipped', true
    );
  END IF;

  INSERT INTO public.patient_wallet (patient_id, available_balance)
  VALUES (p_patient_id, 0)
  ON CONFLICT (patient_id) DO NOTHING;

  SELECT COALESCE(available_balance, 0)
  INTO v_wallet_balance
  FROM public.patient_wallet
  WHERE patient_id = p_patient_id
  FOR UPDATE;

  IF v_wallet_balance < v_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance for booking amount of %', v_amount;
  END IF;

  UPDATE public.patient_wallet
  SET available_balance = ROUND(COALESCE(available_balance, 0) - v_amount, 2)
  WHERE patient_id = p_patient_id;

  INSERT INTO public.patient_wallet_transactions (
    patient_id,
    appointment_id,
    amount,
    direction,
    transaction_type,
    status,
    narration
  ) VALUES (
    p_patient_id,
    p_appointment_id,
    v_amount,
    'debit',
    'booking_wallet_use',
    'completed',
    COALESCE(p_narration, 'Appointment payment from wallet')
  );

  SELECT COALESCE(available_balance, 0)
  INTO v_wallet_balance
  FROM public.patient_wallet
  WHERE patient_id = p_patient_id;

  RETURN jsonb_build_object(
    'patient_id', p_patient_id,
    'appointment_id', p_appointment_id,
    'charged_amount', v_amount,
    'balance_after', ROUND(v_wallet_balance, 2)
  );
END;
$$;

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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
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
    narration
  ) VALUES (
    v_actor,
    v_amount,
    'pending',
    COALESCE(p_narration, 'Patient wallet withdrawal request')
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
    'balance_after', ROUND(v_wallet_balance, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_patient_wallet_adjustment(
  p_patient_id UUID,
  p_appointment_id UUID,
  p_amount NUMERIC,
  p_narration TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_wallet_balance NUMERIC(12,2) := 0;
BEGIN
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'Patient id is required';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero';
  END IF;

  INSERT INTO public.patient_wallet (patient_id, available_balance)
  VALUES (p_patient_id, 0)
  ON CONFLICT (patient_id) DO NOTHING;

  UPDATE public.patient_wallet
  SET available_balance = ROUND(COALESCE(available_balance, 0) + v_amount, 2)
  WHERE patient_id = p_patient_id;

  INSERT INTO public.patient_wallet_transactions (
    patient_id,
    appointment_id,
    amount,
    direction,
    transaction_type,
    status,
    narration
  ) VALUES (
    p_patient_id,
    p_appointment_id,
    v_amount,
    'credit',
    'adjustment',
    'completed',
    COALESCE(p_narration, 'Wallet credit adjustment')
  );

  SELECT COALESCE(available_balance, 0)
  INTO v_wallet_balance
  FROM public.patient_wallet
  WHERE patient_id = p_patient_id;

  RETURN jsonb_build_object(
    'patient_id', p_patient_id,
    'appointment_id', p_appointment_id,
    'credited_amount', v_amount,
    'balance_after', ROUND(v_wallet_balance, 2)
  );
END;
$$;

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
  v_paid_amount NUMERIC := 0;
  v_existing_refunds NUMERIC := 0;
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

  SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_paid_amount
  FROM public.payments
  WHERE appointment_id = p_appointment_id
    AND lower(COALESCE(status, '')) IN ('completed', 'success', 'paid', 'succeeded');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_refunds
  FROM public.patient_wallet_transactions
  WHERE appointment_id = p_appointment_id
    AND transaction_type = 'refund'
    AND direction = 'credit'
    AND status = 'completed';

  v_refund_amount := ROUND(GREATEST(v_paid_amount - v_existing_refunds, 0), 2);

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
      COALESCE(p_reason, 'Appointment cancelled refund')
    );
  END IF;

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
  v_paid_amount NUMERIC := 0;
  v_existing_refunds NUMERIC := 0;
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

  SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_paid_amount
  FROM public.payments
  WHERE appointment_id = p_appointment_id
    AND lower(COALESCE(status, '')) IN ('completed', 'success', 'paid', 'succeeded');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_refunds
  FROM public.patient_wallet_transactions
  WHERE appointment_id = p_appointment_id
    AND transaction_type = 'refund'
    AND direction = 'credit'
    AND status = 'completed';

  v_refund_amount := ROUND(GREATEST(v_paid_amount - v_existing_refunds, 0), 2);

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
      COALESCE(p_reason, 'Appointment marked no-show refund')
    );
  END IF;

  v_reversed_doctor_amount := public.reverse_doctor_wallet_for_appointment(p_appointment_id);

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'status', 'no_show',
    'refund_amount', ROUND(v_refund_amount, 2),
    'doctor_reversal_amount', ROUND(v_reversed_doctor_amount, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.debit_patient_wallet_for_booking(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_patient_wallet_withdrawal(NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_patient_wallet_adjustment(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.debit_patient_wallet_for_booking(UUID, UUID, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_patient_wallet_withdrawal(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_patient_wallet_adjustment(UUID, UUID, NUMERIC, TEXT) TO service_role;

GRANT SELECT ON public.patient_wallet_withdrawal_requests TO authenticated;
