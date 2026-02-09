-- Create admin RPC to update doctor_registrations bypassing RLS

CREATE OR REPLACE FUNCTION public.admin_update_doctor_registration(
  p_user_id UUID,
  p_verification_status TEXT,
  p_verification_notes TEXT,
  p_verified_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.doctor_registrations
  SET verification_status = p_verification_status,
      verification_notes = p_verification_notes,
      verified_at = p_verified_at,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Grant execute to authenticated so the app can call it (administration controlled by app level checks)
GRANT EXECUTE ON FUNCTION public.admin_update_doctor_registration TO authenticated;
