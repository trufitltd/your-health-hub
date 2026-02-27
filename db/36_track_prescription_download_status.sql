-- Track one-time prescription download state in DB (not browser cache).

BEGIN;

ALTER TABLE public.prescription_verifications
  ADD COLUMN IF NOT EXISTS is_downloaded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.mark_prescription_downloaded(
  p_note_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid()::uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_note_ids IS NULL OR array_length(p_note_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.prescription_verifications
  SET
    is_downloaded = true,
    downloaded_at = COALESCE(downloaded_at, now()),
    updated_at = now()
  WHERE note_id = ANY(p_note_ids)
    AND patient_id = caller;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_prescription_public(p_code TEXT)
RETURNS TABLE (
  code TEXT,
  patient_name TEXT,
  drug_list TEXT,
  date_issued TIMESTAMPTZ,
  prescribing_doctor TEXT,
  doctor_license_status TEXT,
  prescription_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pv.code,
    COALESCE(pr.full_name, 'Patient') AS patient_name,
    pv.drug_list,
    pv.date_issued,
    COALESCE(dr.full_name, 'Doctor') AS prescribing_doctor,
    COALESCE(initcap(dr.verification_status), 'Unknown') AS doctor_license_status,
    CASE
      WHEN pv.status = 'dispensed' OR pv.is_downloaded THEN 'Dispensed'
      WHEN COALESCE(pv.expires_at, pv.date_issued + INTERVAL '90 days') < now() THEN 'Expired'
      WHEN pv.status = 'expired' THEN 'Expired'
      ELSE 'Active'
    END AS prescription_status
  FROM public.prescription_verifications pv
  LEFT JOIN public.patient_registrations pr ON pr.user_id = pv.patient_id
  LEFT JOIN public.doctor_registrations dr ON dr.user_id = pv.doctor_id
  WHERE upper(pv.code) = upper(p_code)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_prescription_downloaded(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_prescription_public(TEXT) TO anon, authenticated;

COMMIT;
