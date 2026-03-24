-- 50_add_user_append_contact_reply_rpc.sql
-- Allows authenticated recipients (doctor/patient/coo/admin user) to reply in the same contact thread row.

CREATE OR REPLACE FUNCTION public.user_append_contact_reply(
  p_message_id UUID,
  p_reply TEXT,
  p_sender_role TEXT DEFAULT 'user',
  p_sender_user_id UUID DEFAULT NULL,
  p_sender_name TEXT DEFAULT NULL,
  p_sender_phone TEXT DEFAULT NULL
)
RETURNS public.contact_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.contact_messages%ROWTYPE;
  caller_email TEXT;
BEGIN
  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF caller_email = '' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_message_id IS NULL OR trim(coalesce(p_reply, '')) = '' THEN
    RAISE EXCEPTION 'Message ID and reply body are required';
  END IF;

  UPDATE public.contact_messages cm
  SET message = concat(
    cm.message,
    E'\n\n',
    '--- User Reply (',
    to_char(now(), 'YYYY-MM-DD HH24:MI'),
    ') ---',
    E'\n',
    trim(p_reply),
    E'\n\n',
    'Sender Role: ',
    coalesce(nullif(trim(p_sender_role), ''), 'user'),
    E'\n',
    'Sender User ID: ',
    coalesce(p_sender_user_id::text, 'N/A'),
    E'\n',
    'Sender Name: ',
    coalesce(nullif(trim(p_sender_name), ''), 'N/A'),
    E'\n',
    'Sender Email: ',
    caller_email,
    E'\n',
    'Sender Phone: ',
    coalesce(nullif(trim(p_sender_phone), ''), 'N/A')
  )
  WHERE cm.id = p_message_id
    AND lower(coalesce(cm.email, '')) = caller_email
  RETURNING cm.* INTO updated_row;

  IF updated_row.id IS NULL THEN
    RAISE EXCEPTION 'Contact message not found for this user';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_append_contact_reply(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
