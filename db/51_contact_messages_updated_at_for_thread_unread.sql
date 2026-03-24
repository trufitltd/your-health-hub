-- 51_contact_messages_updated_at_for_thread_unread.sql
-- Ensure thread replies bump recency so unread badge can detect replied older threads.

ALTER TABLE public.contact_messages
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.contact_messages
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_contact_messages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_messages_updated_at ON public.contact_messages;
CREATE TRIGGER trg_contact_messages_updated_at
  BEFORE UPDATE ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_contact_messages_updated_at();

-- Reorder admin message polling by latest activity (updated_at) not only initial creation.
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
  ORDER BY COALESCE(updated_at, created_at) DESC
  LIMIT GREATEST(1, LEAST(limit_count, 5000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_messages(INT) TO authenticated;

-- Reorder paginated inbox by latest thread activity.
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
    AND (start_date IS NULL OR COALESCE(cm.updated_at, cm.created_at) >= start_date)
  ORDER BY COALESCE(cm.updated_at, cm.created_at) DESC
  LIMIT GREATEST(1, LEAST(limit_count, 100))
  OFFSET GREATEST(0, offset_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_messages_inbox(TEXT, TIMESTAMPTZ, INT, INT) TO authenticated;
