-- Admin RPC to list all patient wallets with balances
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
  GROUP BY pr.user_id, pr.full_name, pr.email, pw.available_balance
  ORDER BY COALESCE(pw.available_balance, 0) DESC, pr.full_name ASC
  LIMIT LEAST(p_limit, 200)
  OFFSET p_offset;
END;
$$;

-- Admin RPC to get a single patient's wallet and transactions
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
    'transactions',      COALESCE((
      SELECT jsonb_agg(t ORDER BY t.created_at DESC)
      FROM (
        SELECT
          wt.id, wt.amount, wt.direction, wt.transaction_type,
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

-- Admin RPC to adjust (credit or debit) a patient wallet
CREATE OR REPLACE FUNCTION public.admin_adjust_patient_wallet(
  p_patient_id UUID,
  p_amount     NUMERIC,
  p_direction  TEXT, -- 'credit' or 'debit'
  p_reason     TEXT
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

  -- Ensure wallet row exists
  INSERT INTO public.patient_wallet (patient_id, available_balance)
  VALUES (p_patient_id, 0)
  ON CONFLICT (patient_id) DO NOTHING;

  SELECT available_balance INTO v_balance
  FROM public.patient_wallet
  WHERE patient_id = p_patient_id
  FOR UPDATE;

  IF p_direction = 'debit' AND v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Current balance: %', v_balance;
  END IF;

  v_new_balance := CASE
    WHEN p_direction = 'credit' THEN ROUND(v_balance + p_amount, 2)
    ELSE ROUND(v_balance - p_amount, 2)
  END;

  UPDATE public.patient_wallet
  SET available_balance = v_new_balance
  WHERE patient_id = p_patient_id;

  INSERT INTO public.patient_wallet_transactions (
    patient_id, amount, direction, transaction_type, status, narration
  ) VALUES (
    p_patient_id, p_amount, p_direction, 'adjustment', 'completed',
    COALESCE(p_reason, 'Admin adjustment') || ' (by admin ' || v_uid::TEXT || ')'
  );

  RETURN jsonb_build_object(
    'patient_id',     p_patient_id,
    'direction',      p_direction,
    'amount',         p_amount,
    'balance_before', v_balance,
    'balance_after',  v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_patient_wallets(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_patient_wallet_detail(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_patient_wallet(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
