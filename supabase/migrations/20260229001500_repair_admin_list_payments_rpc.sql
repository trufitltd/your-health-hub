-- 20260229001500_repair_admin_list_payments_rpc.sql
-- Repair/ensure admin payment listing RPC exists so admin panel can fetch
-- complete payment rows instead of RLS-limited client fallback queries.

CREATE OR REPLACE FUNCTION public.admin_list_payments(
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
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
