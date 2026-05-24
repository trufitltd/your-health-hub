-- Admin helper: request top-up for underpaid appointments by moving back to pending payment
-- and aligning appointment final price with doctor rate (or explicit target).

CREATE OR REPLACE FUNCTION public.admin_request_appointment_topup(
  p_appointment_id UUID,
  p_target_amount NUMERIC DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_is_admin BOOLEAN := FALSE;
  v_appointment RECORD;
  v_doctor_rate NUMERIC := NULL;
  v_target_amount NUMERIC := 0;
  v_paid_total NUMERIC := 0;
  v_shortfall NUMERIC := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(public.is_admin_or_coo(v_actor), FALSE)
  INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized to request appointment top-up';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Appointment id is required';
  END IF;

  SELECT a.*
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_appointment.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  SELECT COALESCE(dr.rate_per_consultation, d.rate_per_consultation)
  INTO v_doctor_rate
  FROM public.doctors d
  LEFT JOIN public.doctor_registrations dr ON dr.user_id = d.id
  WHERE d.id = v_appointment.doctor_id;

  v_target_amount := ROUND(
    GREATEST(
      COALESCE(p_target_amount, 0),
      COALESCE(v_doctor_rate, 0),
      COALESCE(v_appointment.final_price, 0)
    ),
    2
  );

  IF v_target_amount <= 0 THEN
    RAISE EXCEPTION 'Unable to determine valid target amount for top-up';
  END IF;

  SELECT COALESCE(SUM(COALESCE(p.amount, 0)), 0)
  INTO v_paid_total
  FROM public.payments p
  WHERE p.appointment_id = p_appointment_id
    AND lower(trim(COALESCE(p.status, ''))) IN ('success', 'successful', 'succeeded', 'paid', 'completed');

  v_paid_total := ROUND(COALESCE(v_paid_total, 0), 2);
  v_shortfall := ROUND(GREATEST(v_target_amount - v_paid_total, 0), 2);

  IF v_shortfall <= 0 THEN
    RETURN jsonb_build_object(
      'appointment_id', p_appointment_id,
      'status', 'already_fully_paid',
      'target_amount', v_target_amount,
      'paid_total', v_paid_total,
      'shortfall', 0
    );
  END IF;

  UPDATE public.appointments
  SET
    final_price = v_target_amount,
    status = 'pending_payment',
    slot_locked_until = GREATEST(COALESCE(slot_locked_until, now()), now() + interval '24 hours'),
    updated_at = now()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'status', 'topup_requested',
    'target_amount', v_target_amount,
    'paid_total', v_paid_total,
    'shortfall', v_shortfall,
    'note', COALESCE(NULLIF(trim(p_note), ''), 'Top-up requested by admin')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_request_appointment_topup(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_request_appointment_topup(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_request_appointment_topup(UUID, NUMERIC, TEXT) TO service_role;
