-- 20260229013000_force_recreate_admin_payment_listing_rpcs.sql
-- Force-recreate admin payment/withdrawal listing RPCs so stale return
-- signatures cannot trigger "structure of query does not match function result type".

DROP FUNCTION IF EXISTS public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.admin_list_patient_wallet_transactions(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.admin_list_patient_wallet_withdrawal_requests(TEXT, INTEGER, INTEGER);

CREATE FUNCTION public.admin_list_payments(
  p_status TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000,
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
    p.id::UUID,
    p.appointment_id::UUID,
    p.patient_id::UUID,
    p.amount::NUMERIC,
    p.status::TEXT,
    p.provider::TEXT,
    p.payment_method::TEXT,
    p.payment_reference::TEXT,
    p.provider_reference::TEXT,
    p.created_at::TIMESTAMPTZ,
    p.verified_at::TIMESTAMPTZ,
    p.metadata::JSONB
  FROM public.payments p
  WHERE
    (v_status_filter = '' OR v_status_filter = 'all' OR lower(COALESCE(p.status, '')) = v_status_filter)
    AND (
      v_provider_filter = ''
      OR v_provider_filter = 'all'
      OR lower(COALESCE(p.provider, p.payment_method, '')) = v_provider_filter
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE FUNCTION public.admin_list_patient_wallet_transactions(
  p_limit INTEGER DEFAULT 1000,
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
    t.id::UUID,
    t.patient_id::UUID,
    t.appointment_id::UUID,
    t.amount::NUMERIC,
    t.direction::TEXT,
    t.transaction_type::TEXT,
    t.status::TEXT,
    t.narration::TEXT,
    t.created_at::TIMESTAMPTZ
  FROM public.patient_wallet_transactions t
  ORDER BY t.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE FUNCTION public.admin_list_patient_wallet_withdrawal_requests(
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000,
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
    wr.id::UUID,
    wr.patient_id::UUID,
    pr.full_name::TEXT,
    pr.email::TEXT,
    pr.phone_number::TEXT,
    wr.amount::NUMERIC,
    wr.status::TEXT,
    wr.narration::TEXT,
    wr.created_at::TIMESTAMPTZ,
    wr.updated_at::TIMESTAMPTZ,
    wr.sla_due_at::TIMESTAMPTZ,
    wr.processed_by::UUID,
    wr.processed_at::TIMESTAMPTZ,
    wr.completed_at::TIMESTAMPTZ,
    wr.admin_note::TEXT,
    wr.payout_reference::TEXT,
    wr.wallet_reversed_at::TIMESTAMPTZ
  FROM public.patient_wallet_withdrawal_requests wr
  LEFT JOIN public.patient_registrations pr ON pr.user_id = wr.patient_id
  WHERE
    v_status_filter = ''
    OR v_status_filter = 'all'
    OR lower(COALESCE(wr.status, '')) = v_status_filter
  ORDER BY wr.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_patient_wallet_transactions(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_patient_wallet_withdrawal_requests(TEXT, INTEGER, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_patient_wallet_transactions(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_patient_wallet_withdrawal_requests(TEXT, INTEGER, INTEGER) TO authenticated;
