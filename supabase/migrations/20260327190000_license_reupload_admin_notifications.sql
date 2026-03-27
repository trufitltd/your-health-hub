-- Track doctor medical-license re-upload notifications for admin review.

ALTER TABLE public.doctor_registrations
  ADD COLUMN IF NOT EXISTS medical_license_reuploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS medical_license_reupload_seen_by_admin BOOLEAN NOT NULL DEFAULT true;

-- When admin requests re-upload, reset prior submission notification state.
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
    medical_license_reuploaded_at = NULL,
    medical_license_reupload_seen_by_admin = true,
    verification_status = 'pending',
    verification_notes = COALESCE(NULLIF(trim(COALESCE(p_reupload_reason, '')), ''), verification_notes),
    verified_at = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Once admin approves/rejects, clear re-upload workflow markers.
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
      medical_license_reuploaded_at = NULL,
      medical_license_reupload_seen_by_admin = true,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_license_reupload_seen(
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.doctor_registrations
  SET medical_license_reupload_seen_by_admin = true,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_request_doctor_license_reupload(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_doctor_registration(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_license_reupload_seen(UUID) TO authenticated;
