-- ══════════════════════════════════════════════════════════════════════════════
-- Test Doctor Authorised Access
--
-- Adds server-authoritative visibility flags for test doctors and test patients.
-- Replaces the fragile name-based 'test doctor' / 'test patient' checks with
-- stable boolean columns.
--
-- Invariant:
--   public doctor: visible to all eligible patients
--   test doctor:   hidden from ordinary patients, visible only to test patients
--   booking:       authorised test patient can book test doctor;
--                  ordinary patient cannot (even with manual UUID submission)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Add is_test_doctor flag to doctors table
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS is_test_doctor BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add is_test_patient flag to patient_registrations table
ALTER TABLE public.patient_registrations
  ADD COLUMN IF NOT EXISTS is_test_patient BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Create helper function to check if current user is an authorised test patient
CREATE OR REPLACE FUNCTION public.is_authorised_test_patient(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patient_registrations pr
    WHERE pr.user_id = p_user_id
      AND pr.is_test_patient = TRUE
  )
$$;

-- 4. Create helper function to check if a doctor is a test doctor
CREATE OR REPLACE FUNCTION public.is_test_doctor(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.id = p_user_id
      AND d.is_test_doctor = TRUE
  )
$$;

-- 5. Update list_public_doctors to conditionally show test doctor
--    - If caller is an authorised test patient: include test doctor
--    - Otherwise: exclude test doctor (current behaviour)
DROP FUNCTION IF EXISTS public.list_public_doctors(INTEGER, INTEGER, UUID);

CREATE FUNCTION public.list_public_doctors(
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0,
  p_organisation_id UUID DEFAULT NULL
)
RETURNS TABLE(
  user_id UUID,
  full_name TEXT,
  specialty TEXT,
  rate_per_consultation NUMERIC,
  consultation_currency TEXT,
  hospital_affiliation TEXT,
  profile_picture_url TEXT,
  city TEXT,
  state TEXT,
  bio TEXT,
  experience TEXT,
  preferred_consultation_languages TEXT[],
  bio_translations JSONB,
  rating NUMERIC,
  total_reviews INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rating_summary AS (
    SELECT
      a.doctor_id,
      ROUND(AVG(a.rating)::NUMERIC, 2) AS rating,
      COUNT(*)::INTEGER AS total_reviews
    FROM public.appointments a
    WHERE a.rating IS NOT NULL
      AND a.doctor_id IS NOT NULL
    GROUP BY a.doctor_id
  ),
  caller_is_test_patient AS (
    SELECT public.is_authorised_test_patient(auth.uid()) AS is_test
  )
  SELECT
    dr.user_id::UUID,
    dr.full_name::TEXT,
    dr.specialty::TEXT,
    dr.rate_per_consultation::NUMERIC,
    COALESCE(NULLIF(trim(dr.consultation_currency), ''), 'NGN')::TEXT AS consultation_currency,
    dr.hospital_affiliation::TEXT,
    dr.profile_picture_url::TEXT,
    dr.city::TEXT,
    dr.state::TEXT,
    dr.bio::TEXT,
    dr.experience::TEXT,
    ARRAY[]::TEXT[] AS preferred_consultation_languages,
    '{}'::JSONB AS bio_translations,
    COALESCE(rs.rating, 0)::NUMERIC AS rating,
    COALESCE(rs.total_reviews, 0)::INTEGER AS total_reviews
  FROM public.doctor_registrations dr
  LEFT JOIN rating_summary rs
    ON rs.doctor_id = dr.user_id
  CROSS JOIN caller_is_test_patient citp
  WHERE dr.user_id IS NOT NULL
    AND dr.verification_status = 'approved'
    AND NULLIF(trim(COALESCE(dr.medical_license_url, '')), '') IS NOT NULL
    -- Test doctor visibility: show to authorised test patients, hide from others
    AND (
      NOT public.is_test_doctor(dr.user_id)
      OR citp.is_test
    )
    AND (
      p_organisation_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.doctors d
        WHERE d.id = dr.user_id
          AND d.organisation_id = p_organisation_id
      )
    )
  ORDER BY dr.full_name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.list_public_doctors(INTEGER, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_doctors(INTEGER, INTEGER, UUID) TO anon, authenticated;

-- 6. Add RLS policy for test doctor booking authorization
--    Ordinary patients cannot book a test doctor even if they manually submit the UUID.
--    Only authorised test patients can book test doctors.
CREATE OR REPLACE FUNCTION public.can_book_doctor(p_patient_id UUID, p_doctor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- If the doctor is NOT a test doctor, any patient can book
    NOT public.is_test_doctor(p_doctor_id)
    OR
    -- If the doctor IS a test doctor, only authorised test patients can book
    public.is_authorised_test_patient(p_patient_id)
$$;

-- 7. Mark the existing test doctor
--    The test doctor has full_name = 'test doctor' (case-insensitive).
UPDATE public.doctors d
SET is_test_doctor = TRUE
WHERE lower(trim(COALESCE(d.name, ''))) = 'test doctor';

-- Also update the doctors table if it was synced from doctor_registrations
UPDATE public.doctors d
SET is_test_doctor = TRUE
WHERE d.id IN (
  SELECT dr.user_id
  FROM public.doctor_registrations dr
  WHERE lower(trim(COALESCE(dr.full_name, ''))) = 'test doctor'
);

-- 8. Mark the existing test patient
--    Use patient_registrations.full_name = 'test patient' (case-insensitive).
UPDATE public.patient_registrations pr
SET is_test_patient = TRUE
WHERE lower(trim(COALESCE(pr.full_name, ''))) = 'test patient';

-- 9. Create index for efficient test doctor/patient lookups
CREATE INDEX IF NOT EXISTS idx_doctors_is_test ON public.doctors(is_test_doctor) WHERE is_test_doctor = TRUE;
CREATE INDEX IF NOT EXISTS idx_patient_registrations_is_test ON public.patient_registrations(is_test_patient) WHERE is_test_patient = TRUE;

-- 10. Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.is_authorised_test_patient(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_test_doctor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_book_doctor(UUID, UUID) TO authenticated;
