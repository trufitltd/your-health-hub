-- Add consultation_currency to list_public_doctors so the discovery page
-- can display each doctor's price in their own currency.

DROP FUNCTION IF EXISTS public.list_public_doctors(INTEGER, INTEGER);

CREATE FUNCTION public.list_public_doctors(
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
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
  WHERE dr.user_id IS NOT NULL
    AND dr.verification_status = 'approved'
    AND NULLIF(trim(COALESCE(dr.medical_license_url, '')), '') IS NOT NULL
    AND lower(trim(COALESCE(dr.full_name, ''))) <> 'test doctor'
  ORDER BY dr.full_name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.list_public_doctors(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_doctors(INTEGER, INTEGER) TO anon, authenticated;
