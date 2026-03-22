-- 48_add_email_exists_rpc.sql
-- Reliable duplicate-email check for signup flow.
-- Uses SECURITY DEFINER to safely check auth.users from frontend via RPC.

CREATE OR REPLACE FUNCTION public.is_email_registered(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_email TEXT;
BEGIN
  normalized_email := lower(trim(coalesce(p_email, '')));
  IF normalized_email = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE lower(coalesce(au.email, '')) = normalized_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_email_registered(TEXT) TO anon, authenticated;
