-- Specialist rate-change request workflow with admin notifications.

ALTER TABLE public.doctor_registrations
  ADD COLUMN IF NOT EXISTS proposed_rate_per_consultation NUMERIC,
  ADD COLUMN IF NOT EXISTS rate_change_reason TEXT,
  ADD COLUMN IF NOT EXISTS rate_change_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rate_change_seen_by_admin BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rate_change_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rate_change_admin_note TEXT;

CREATE OR REPLACE FUNCTION public.doctor_request_rate_change(
  p_new_rate NUMERIC,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_specialty TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_new_rate IS NULL OR p_new_rate <= 0 THEN
    RAISE EXCEPTION 'New rate must be greater than zero';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Rate change reason is required';
  END IF;

  SELECT lower(trim(COALESCE(specialty, '')))
  INTO v_specialty
  FROM public.doctor_registrations
  WHERE user_id = v_user_id;

  IF v_specialty IS NULL THEN
    RAISE EXCEPTION 'Doctor registration not found';
  END IF;

  IF v_specialty IN ('general practice', 'general_practice', 'gp', 'general practitioner', 'general_practitioner') THEN
    RAISE EXCEPTION 'General practitioners cannot request specialist rate changes';
  END IF;

  UPDATE public.doctor_registrations
  SET proposed_rate_per_consultation = p_new_rate,
      rate_change_reason = v_reason,
      rate_change_requested_at = now(),
      rate_change_seen_by_admin = false,
      rate_change_reviewed_at = NULL,
      rate_change_admin_note = NULL,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_rate_change_seen(
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.doctor_registrations
  SET rate_change_seen_by_admin = true,
      updated_at = now()
  WHERE user_id = p_user_id
    AND proposed_rate_per_consultation IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_doctor_rate_change(
  p_user_id UUID,
  p_action TEXT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT := lower(trim(COALESCE(p_action, '')));
  v_proposed_rate NUMERIC;
BEGIN
  IF v_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  SELECT proposed_rate_per_consultation
  INTO v_proposed_rate
  FROM public.doctor_registrations
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_proposed_rate IS NULL THEN
    RAISE EXCEPTION 'No pending rate change request for this doctor';
  END IF;

  IF v_action = 'approve' THEN
    UPDATE public.doctor_registrations
    SET rate_per_consultation = v_proposed_rate,
        proposed_rate_per_consultation = NULL,
        rate_change_reason = NULL,
        rate_change_requested_at = NULL,
        rate_change_seen_by_admin = true,
        rate_change_reviewed_at = now(),
        rate_change_admin_note = NULLIF(trim(COALESCE(p_admin_note, '')), ''),
        updated_at = now()
    WHERE user_id = p_user_id;

    UPDATE public.doctors
    SET rate_per_consultation = v_proposed_rate,
        updated_at = now()
    WHERE id = p_user_id;
  ELSE
    UPDATE public.doctor_registrations
    SET proposed_rate_per_consultation = NULL,
        rate_change_reason = NULL,
        rate_change_requested_at = NULL,
        rate_change_seen_by_admin = true,
        rate_change_reviewed_at = now(),
        rate_change_admin_note = NULLIF(trim(COALESCE(p_admin_note, '')), ''),
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_request_rate_change(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_rate_change_seen(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_doctor_rate_change(UUID, TEXT, TEXT) TO authenticated;
