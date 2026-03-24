-- 49_admin_search_platform_users.sql
-- Lets Central Admin search all existing platform users by email/name via auth.users.

CREATE OR REPLACE FUNCTION public.admin_search_platform_users(
  search_term TEXT DEFAULT NULL,
  limit_count INT DEFAULT 25
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role_label TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  q := trim(coalesce(search_term, ''));

  RETURN QUERY
  SELECT
    au.id AS user_id,
    lower(coalesce(au.email, '')) AS email,
    COALESCE(
      NULLIF(trim(coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name')), ''),
      NULLIF(trim(coalesce(dr.full_name, '')), ''),
      NULLIF(trim(coalesce(pr.full_name, '')), ''),
      split_part(coalesce(au.email, ''), '@', 1)
    ) AS full_name,
    CASE
      WHEN dr.user_id IS NOT NULL THEN 'doctor'
      WHEN pr.user_id IS NOT NULL THEN 'patient'
      ELSE 'staff'
    END AS role_label
  FROM auth.users au
  LEFT JOIN public.doctor_registrations dr
    ON dr.user_id = au.id
  LEFT JOIN public.patient_registrations pr
    ON pr.user_id = au.id
  WHERE coalesce(au.email, '') <> ''
    AND (
      q = ''
      OR lower(coalesce(au.email, '')) LIKE '%' || lower(q) || '%'
      OR lower(coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', '')) LIKE '%' || lower(q) || '%'
    )
  ORDER BY au.created_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 100));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_search_platform_users(TEXT, INT) TO authenticated;
