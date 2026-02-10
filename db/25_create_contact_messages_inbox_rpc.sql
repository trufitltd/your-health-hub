-- 25_create_contact_messages_inbox_rpc.sql
-- Paginated inbox query with optional search and date filter

CREATE OR REPLACE FUNCTION public.get_contact_messages_inbox(
  search_term TEXT DEFAULT NULL,
  start_date TIMESTAMPTZ DEFAULT NULL,
  limit_count INT DEFAULT 20,
  offset_count INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  subject TEXT,
  message TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.first_name,
    cm.last_name,
    cm.email,
    cm.phone,
    cm.subject,
    cm.message,
    cm.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.contact_messages cm
  WHERE
    (search_term IS NULL OR (
      cm.first_name ILIKE '%' || search_term || '%'
      OR cm.last_name ILIKE '%' || search_term || '%'
      OR cm.email ILIKE '%' || search_term || '%'
      OR cm.subject ILIKE '%' || search_term || '%'
      OR cm.message ILIKE '%' || search_term || '%'
    ))
    AND (start_date IS NULL OR cm.created_at >= start_date)
  ORDER BY cm.created_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 100))
  OFFSET GREATEST(0, offset_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_messages_inbox(TEXT, TIMESTAMPTZ, INT, INT) TO authenticated;
