-- 37_patient_wallet_refund_flows.sql
-- Adds patient wallet ledger and implements refund flows for cancellation and no-show.

CREATE TABLE IF NOT EXISTS public.patient_wallet (
  patient_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (available_balance >= 0)
);

CREATE OR REPLACE FUNCTION public.update_patient_wallet_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_wallet_updated_at ON public.patient_wallet;
CREATE TRIGGER trg_patient_wallet_updated_at
  BEFORE UPDATE ON public.patient_wallet
  FOR EACH ROW
  EXECUTE FUNCTION public.update_patient_wallet_updated_at();

CREATE TABLE IF NOT EXISTS public.patient_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('refund', 'booking_wallet_use', 'adjustment')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
  narration TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_patient_wallet_txn_patient_time
  ON public.patient_wallet_transactions(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_wallet_txn_appointment
  ON public.patient_wallet_transactions(appointment_id);

ALTER TABLE public.patient_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view own wallet" ON public.patient_wallet;
CREATE POLICY "Patients can view own wallet"
  ON public.patient_wallet FOR SELECT
  USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "Patients can view own wallet transactions" ON public.patient_wallet_transactions;
CREATE POLICY "Patients can view own wallet transactions"
  ON public.patient_wallet_transactions FOR SELECT
  USING (auth.uid() = patient_id);

CREATE OR REPLACE FUNCTION public.reverse_doctor_wallet_for_appointment(
  p_appointment_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id UUID;
  v_pending_total NUMERIC := 0;
  v_available_total NUMERIC := 0;
BEGIN
  SELECT doctor_id
  INTO v_doctor_id
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF v_doctor_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'available' THEN amount ELSE 0 END), 0)
  INTO v_pending_total, v_available_total
  FROM public.doctor_wallet_transactions
  WHERE appointment_id = p_appointment_id
    AND status IN ('pending', 'available');

  IF (v_pending_total + v_available_total) <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.doctor_wallet
  SET
    pending_balance = GREATEST(COALESCE(pending_balance, 0) - v_pending_total, 0),
    available_balance = GREATEST(COALESCE(available_balance, 0) - v_available_total, 0)
  WHERE doctor_id = v_doctor_id;

  UPDATE public.doctor_wallet_transactions
  SET status = 'reversed',
      released_at = now()
  WHERE appointment_id = p_appointment_id
    AND status IN ('pending', 'available');

  RETURN ROUND(v_pending_total + v_available_total, 2);
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
  v_appointment_at TIMESTAMPTZ := NULL;
  v_final_price NUMERIC := 0;
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
    a.doctor_id,
    COALESCE(a.final_price, 0)
  INTO v_status, v_patient_id, v_doctor_id, v_final_price
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
  v_final_price NUMERIC := 0;
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
    a.doctor_id,
    COALESCE(a.final_price, 0)
  INTO v_status, v_patient_id, v_doctor_id, v_final_price
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

REVOKE ALL ON FUNCTION public.reverse_doctor_wallet_for_appointment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_appointment_with_refund(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_appointment_no_show(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cancel_appointment_with_refund(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_appointment_no_show(UUID, TEXT) TO authenticated;
