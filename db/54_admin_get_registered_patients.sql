-- 54_admin_get_registered_patients.sql
-- RPC for admins to get a list of all registered patients.

CREATE OR REPLACE FUNCTION public.get_registered_patients(limit_count INT DEFAULT 1000)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the user is an admin.
  -- This is a placeholder for your actual admin check.
  -- You might need to adjust this to your authentication setup (e.g., checking a role in auth.jwt()).
  IF NOT (SELECT auth.uid() IN (SELECT user_id FROM public.admin_users)) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can access this resource.';
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.user_id,
    pr.full_name,
    pr.email,
    pr.created_at
  FROM public.patient_registrations pr
  ORDER BY pr.created_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 5000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_registered_patients(INT) TO authenticated;
