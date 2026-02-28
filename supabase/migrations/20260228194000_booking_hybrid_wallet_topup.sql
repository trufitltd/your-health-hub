-- Hybrid booking wallet support:
-- atomically debit up to the requested amount instead of requiring full balance.

CREATE OR REPLACE FUNCTION public.debit_patient_wallet_for_booking_up_to(
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
  v_requested_amount NUMERIC(12,2) := ROUND(COALESCE(p_amount, 0), 2);
  v_wallet_balance NUMERIC(12,2) := 0;
  v_charge_amount NUMERIC(12,2) := 0;
BEGIN
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'Patient id is required';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Appointment id is required';
  END IF;

  IF v_requested_amount <= 0 THEN
    RETURN jsonb_build_object(
      'patient_id', p_patient_id,
      'appointment_id', p_appointment_id,
      'requested_amount', 0,
      'charged_amount', 0,
      'remaining_amount', 0,
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

  v_charge_amount := ROUND(LEAST(v_wallet_balance, v_requested_amount), 2);

  IF v_charge_amount > 0 THEN
    UPDATE public.patient_wallet
    SET available_balance = ROUND(COALESCE(available_balance, 0) - v_charge_amount, 2)
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
      v_charge_amount,
      'debit',
      'booking_wallet_use',
      'completed',
      COALESCE(p_narration, 'Hybrid appointment payment from wallet')
    );
  END IF;

  SELECT COALESCE(available_balance, 0)
  INTO v_wallet_balance
  FROM public.patient_wallet
  WHERE patient_id = p_patient_id;

  RETURN jsonb_build_object(
    'patient_id', p_patient_id,
    'appointment_id', p_appointment_id,
    'requested_amount', v_requested_amount,
    'charged_amount', v_charge_amount,
    'remaining_amount', ROUND(GREATEST(v_requested_amount - v_charge_amount, 0), 2),
    'balance_after', ROUND(v_wallet_balance, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.debit_patient_wallet_for_booking_up_to(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_patient_wallet_for_booking_up_to(UUID, UUID, NUMERIC, TEXT) TO service_role;
