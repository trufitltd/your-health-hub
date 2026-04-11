-- Store browser push subscriptions so the server can send push notifications
-- to users even when they are offline or not logged in.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions; anonymous subscriptions allowed for guest push
CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE USING (user_id = auth.uid() OR user_id IS NULL);

-- Service role can read all (needed by Edge Function to send pushes)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated, anon;
