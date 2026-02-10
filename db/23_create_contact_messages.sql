-- 23_create_contact_messages.sql
-- Stores contact form submissions from the public contact page

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit the contact form
DROP POLICY IF EXISTS "Allow public insert contact messages" ON public.contact_messages;
CREATE POLICY "Allow public insert contact messages"
  ON public.contact_messages
  FOR INSERT
  WITH CHECK (true);

-- Optional: allow admins/service role to read messages
DROP POLICY IF EXISTS "Allow service role read contact messages" ON public.contact_messages;
CREATE POLICY "Allow service role read contact messages"
  ON public.contact_messages
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');
