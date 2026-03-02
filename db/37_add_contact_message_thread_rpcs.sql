-- 37_add_contact_message_thread_rpcs.sql
-- Enables in-app threaded support replies without relying on Edge Functions.

-- Allow authenticated users to fetch their own contact submissions.
CREATE OR REPLACE FUNCTION public.get_my_contact_messages(limit_count INT DEFAULT 50)
RETURNS SETOF public.contact_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
BEGIN
  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF caller_email = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.contact_messages cm
  WHERE lower(cm.email) = caller_email
  ORDER BY cm.created_at DESC
  LIMIT GREATEST(1, LEAST(limit_count, 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_contact_messages(INT) TO authenticated;

-- Append an admin reply directly into the original message thread body.
CREATE OR REPLACE FUNCTION public.admin_append_contact_reply(
  p_message_id UUID,
  p_reply TEXT
)
RETURNS public.contact_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.contact_messages%ROWTYPE;
BEGIN
  -- Require an authenticated caller; avoids anonymous invocation.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_message_id IS NULL OR trim(coalesce(p_reply, '')) = '' THEN
    RAISE EXCEPTION 'Message ID and reply body are required';
  END IF;

  UPDATE public.contact_messages
  SET message = concat(
    message,
    E'\n\n',
    '--- Admin Reply (',
    to_char(now(), 'YYYY-MM-DD HH24:MI'),
    ') ---',
    E'\n',
    trim(p_reply)
  )
  WHERE id = p_message_id
  RETURNING * INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Contact message not found';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_append_contact_reply(UUID, TEXT) TO authenticated;
