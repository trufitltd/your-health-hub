-- Allow multiple active patient withdrawal requests while preserving safe retries.

ALTER TABLE public.patient_wallet_withdrawal_requests
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

UPDATE public.patient_wallet_withdrawal_requests
SET idempotency_key = NULL
WHERE idempotency_key IS NOT NULL
  AND btrim(idempotency_key) = '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_patient_wallet_withdrawal_requests_patient_idempotency
  ON public.patient_wallet_withdrawal_requests(patient_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP FUNCTION IF EXISTS public.request_patient_wallet_withdrawal(NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.request_patient_wallet_withdrawal(NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.request_patient_wallet_withdrawal(
  p_amount NUMERIC,
  p_narration TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_request_status TEXT;
  v_request_amount NUMERIC(12,2);
  v_request_sla_due_at TIMESTAMPTZ;
  v_sla_due_at TIMESTAMPTZ := now() + INTERVAL '48 hours';
  v_idempotency_key TEXT := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be greater than zero';
  END IF;

  IF v_idempotency_key IS NOT NULL AND char_length(v_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'Idempotency key must not exceed 128 characters';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT wr.id, wr.status, wr.amount, wr.sla_due_at
    INTO v_request_id, v_request_status, v_request_amount, v_request_sla_due_at
    FROM public.patient_wallet_withdrawal_requests wr
    WHERE wr.patient_id = v_actor
      AND wr.idempotency_key = v_idempotency_key
    LIMIT 1;

    IF v_request_id IS NOT NULL THEN
      IF ROUND(COALESCE(v_request_amount, 0), 2) <> v_amount THEN
        RAISE EXCEPTION 'Idempotency key already used with a different withdrawal amount';
      END IF;

      SELECT COALESCE(available_balance, 0)
      INTO v_wallet_balance
      FROM public.patient_wallet
      WHERE patient_id = v_actor;

      RETURN jsonb_build_object(
        'request_id', v_request_id,
        'patient_id', v_actor,
        'status', COALESCE(v_request_status, 'pending'),
        'amount', ROUND(COALESCE(v_request_amount, 0), 2),
        'balance_after', ROUND(COALESCE(v_wallet_balance, 0), 2),
        'sla_due_at', v_request_sla_due_at,
        'idempotency_key', v_idempotency_key,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  INSERT INTO public.patient_wallet (patient_id, available_balance)
  VALUES (v_actor, 0)
  ON CONFLICT (patient_id) DO NOTHING;

  BEGIN
    INSERT INTO public.patient_wallet_withdrawal_requests (
      patient_id,
      amount,
      status,
      narration,
      sla_due_at,
      idempotency_key
    ) VALUES (
      v_actor,
      v_amount,
      'pending',
      COALESCE(p_narration, 'Patient wallet withdrawal request'),
      v_sla_due_at,
      v_idempotency_key
    )
    RETURNING id, status, amount, sla_due_at
    INTO v_request_id, v_request_status, v_request_amount, v_request_sla_due_at;
  EXCEPTION
    WHEN unique_violation THEN
      IF v_idempotency_key IS NULL THEN
        RAISE;
      END IF;

      SELECT wr.id, wr.status, wr.amount, wr.sla_due_at
      INTO v_request_id, v_request_status, v_request_amount, v_request_sla_due_at
      FROM public.patient_wallet_withdrawal_requests wr
      WHERE wr.patient_id = v_actor
        AND wr.idempotency_key = v_idempotency_key
      LIMIT 1;

      IF v_request_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve existing withdrawal request for idempotency key';
      END IF;

      IF ROUND(COALESCE(v_request_amount, 0), 2) <> v_amount THEN
        RAISE EXCEPTION 'Idempotency key already used with a different withdrawal amount';
      END IF;

      SELECT COALESCE(available_balance, 0)
      INTO v_wallet_balance
      FROM public.patient_wallet
      WHERE patient_id = v_actor;

      RETURN jsonb_build_object(
        'request_id', v_request_id,
        'patient_id', v_actor,
        'status', COALESCE(v_request_status, 'pending'),
        'amount', ROUND(COALESCE(v_request_amount, 0), 2),
        'balance_after', ROUND(COALESCE(v_wallet_balance, 0), 2),
        'sla_due_at', v_request_sla_due_at,
        'idempotency_key', v_idempotency_key,
        'idempotent_replay', true
      );
  END;

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

  SELECT COALESCE(available_balance, 0)
  INTO v_wallet_balance
  FROM public.patient_wallet
  WHERE patient_id = v_actor;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'patient_id', v_actor,
    'status', COALESCE(v_request_status, 'pending'),
    'amount', ROUND(COALESCE(v_request_amount, v_amount), 2),
    'balance_after', ROUND(v_wallet_balance, 2),
    'sla_due_at', v_request_sla_due_at,
    'idempotency_key', v_idempotency_key,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_patient_wallet_withdrawal(NUMERIC, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_patient_wallet_withdrawal(NUMERIC, TEXT, TEXT) TO authenticated;
