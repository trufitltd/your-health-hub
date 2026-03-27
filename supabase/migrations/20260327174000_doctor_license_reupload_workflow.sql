-- Admin-requested medical license re-upload workflow for doctors.

ALTER TABLE public.doctor_registrations
  ADD COLUMN IF NOT EXISTS medical_license_reupload_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS medical_license_reupload_reason TEXT,
  ADD COLUMN IF NOT EXISTS medical_license_reupload_requested_at TIMESTAMPTZ;

-- Admin can request a re-upload when current license is unclear.
CREATE OR REPLACE FUNCTION public.admin_request_doctor_license_reupload(
  p_user_id UUID,
  p_reupload_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.doctor_registrations
  SET
    medical_license_reupload_required = true,
    medical_license_reupload_reason = NULLIF(trim(COALESCE(p_reupload_reason, '')), ''),
    medical_license_reupload_requested_at = now(),
    verification_status = 'pending',
    verification_notes = COALESCE(NULLIF(trim(COALESCE(p_reupload_reason, '')), ''), verification_notes),
    verified_at = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Extend existing admin verification RPC to clear re-upload request once processed.
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
      medical_license_reupload_required = false,
      medical_license_reupload_reason = NULL,
      medical_license_reupload_requested_at = NULL,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_request_doctor_license_reupload(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_doctor_registration(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
