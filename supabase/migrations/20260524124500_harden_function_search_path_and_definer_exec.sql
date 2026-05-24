-- Security hardening migration
-- 1) Fix function_search_path_mutable warnings by pinning search_path to public
-- 2) Reduce SECURITY DEFINER exposure by revoking anon EXECUTE on all
--    SECURITY DEFINER functions in public schema
--
-- Notes:
-- - This keeps existing authenticated/service_role grants unchanged to avoid
--   breaking currently-used RPC flows.
-- - A follow-up migration can further tighten authenticated EXECUTE grants
--   function-by-function once usage is audited.

DO $$
DECLARE
  fn RECORD;
BEGIN
  -- Pin search_path for all user-defined functions in public schema.
  FOR fn IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  fn RECORD;
BEGIN
  -- Revoke anonymous execution for all SECURITY DEFINER functions in public.
  FOR fn IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  END LOOP;
END
$$;
