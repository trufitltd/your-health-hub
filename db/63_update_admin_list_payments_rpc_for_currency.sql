-- Update admin_list_payments RPC to include currency
DROP FUNCTION IF EXISTS public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER);

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
  currency TEXT,
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
    p.currency::TEXT,
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

GRANT EXECUTE ON FUNCTION public.admin_list_payments(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
