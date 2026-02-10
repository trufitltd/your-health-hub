-- 24_create_contact_messages_rpc.sql
-- Allows admins to read contact messages via a security definer function

CREATE OR REPLACE FUNCTION public.get_contact_messages(limit_count INT DEFAULT 50)
RETURNS SETOF public.contact_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.contact_messages
  ORDER BY created_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_messages(INT) TO authenticated;
