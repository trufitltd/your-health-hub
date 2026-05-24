-- Resolve Supabase security advisor warnings:
-- 1) public.appointment_duration_options has no RLS
-- 2) public.available_slots view runs with definer semantics

-- ---------------------------------------------------------------------------
-- 1) appointment_duration_options: enable RLS and add explicit read policy
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.appointment_duration_options
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active appointment duration options"
  ON public.appointment_duration_options;

CREATE POLICY "Public read active appointment duration options"
  ON public.appointment_duration_options
  FOR SELECT
  USING (active = true);

-- Keep table read-only from client roles; writes remain through privileged roles.
REVOKE ALL ON TABLE public.appointment_duration_options FROM anon, authenticated;
GRANT SELECT ON TABLE public.appointment_duration_options TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) available_slots: enforce invoker security semantics
-- ---------------------------------------------------------------------------
-- For Postgres views, default behavior is effectively definer-based permissions.
-- security_invoker=on ensures underlying table permissions/RLS are evaluated as
-- the querying user.
DO $$
BEGIN
  IF to_regclass('public.available_slots') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.available_slots SET (security_invoker = true)';
  END IF;
END
$$;
