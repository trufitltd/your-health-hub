-- Give central admins bundled secondary roles (doctor + patient)
-- while preserving a primary role in public.profiles.

CREATE TABLE IF NOT EXISTS public.profile_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  assigned_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_roles_role_check CHECK (role = ANY (ARRAY['patient'::text, 'doctor'::text, 'admin'::text, 'coo'::text])),
  CONSTRAINT profile_roles_assigned_by_check CHECK (assigned_by = ANY (ARRAY['primary'::text, 'admin_bundle'::text, 'sync'::text, 'manual'::text, 'system'::text])),
  CONSTRAINT profile_roles_pkey PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_profile_roles_role ON public.profile_roles(role);

CREATE OR REPLACE FUNCTION public.assign_profile_roles(
  p_user_id UUID,
  p_primary_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_role TEXT := lower(trim(COALESCE(p_primary_role, 'patient')));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF v_primary_role NOT IN ('patient', 'doctor', 'admin', 'coo') THEN
    v_primary_role := 'patient';
  END IF;

  -- Keep one deterministic primary role assignment synced with profiles.role
  DELETE FROM public.profile_roles
  WHERE user_id = p_user_id
    AND assigned_by = 'primary'
    AND role <> v_primary_role;

  INSERT INTO public.profile_roles (user_id, role, assigned_by)
  VALUES (p_user_id, v_primary_role, 'primary')
  ON CONFLICT (user_id, role)
  DO UPDATE SET assigned_by = 'primary';

  -- Admins should also have doctor + patient secondary role memberships.
  IF v_primary_role = 'admin' THEN
    INSERT INTO public.profile_roles (user_id, role, assigned_by)
    VALUES
      (p_user_id, 'doctor', 'admin_bundle'),
      (p_user_id, 'patient', 'admin_bundle')
    ON CONFLICT (user_id, role)
    DO UPDATE SET assigned_by = 'admin_bundle';
  ELSE
    -- If user is no longer admin, remove only auto-bundled secondary roles.
    DELETE FROM public.profile_roles
    WHERE user_id = p_user_id
      AND assigned_by = 'admin_bundle';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_roles_from_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assign_profile_roles(NEW.id, NEW.role);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_profile_roles ON public.profiles;
CREATE TRIGGER trg_profiles_sync_profile_roles
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_roles_from_profiles();

-- Sync profile role when auth metadata role is updated (e.g. admin login promotion).
CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  v_full_name TEXT := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')), '');
BEGIN
  IF v_role NOT IN ('patient', 'doctor', 'admin', 'coo') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(v_full_name, split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    v_role
  )
  ON CONFLICT (id)
  DO UPDATE SET
    role = EXCLUDED.role,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);

  PERFORM public.assign_profile_roles(NEW.id, v_role);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_user_role_sync ON auth.users;
CREATE TRIGGER trg_auth_user_role_sync
  AFTER UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW
  WHEN (NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data)
  EXECUTE FUNCTION public.sync_profile_from_auth_user_role();

-- Backfill: align profiles.role to admin/coo for users already tagged in auth metadata.
UPDATE public.profiles p
SET role = role_source.role_candidate
FROM (
  SELECT
    u.id,
    lower(trim(COALESCE(u.raw_user_meta_data->>'role', ''))) AS role_candidate
  FROM auth.users u
  WHERE lower(trim(COALESCE(u.raw_user_meta_data->>'role', ''))) IN ('admin', 'coo')
) AS role_source
WHERE p.id = role_source.id
  AND p.role IS DISTINCT FROM role_source.role_candidate;

-- Backfill profile_roles for all profiles.
INSERT INTO public.profile_roles (user_id, role, assigned_by)
SELECT p.id, lower(trim(p.role)), 'primary'
FROM public.profiles p
WHERE lower(trim(p.role)) IN ('patient', 'doctor', 'admin', 'coo')
ON CONFLICT (user_id, role) DO UPDATE SET assigned_by = 'primary';

-- Backfill admin bundled memberships for existing central admins.
INSERT INTO public.profile_roles (user_id, role, assigned_by)
SELECT p.id, r.role_value, 'admin_bundle'
FROM public.profiles p
CROSS JOIN (VALUES ('doctor'::text), ('patient'::text)) AS r(role_value)
WHERE p.role = 'admin'
ON CONFLICT (user_id, role) DO UPDATE SET assigned_by = 'admin_bundle';

-- Ensure signup trigger also writes into profile_roles immediately.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  role_candidate text := lower(trim(COALESCE(new.raw_user_meta_data->>'role', 'patient')));
BEGIN
  IF role_candidate NOT IN ('patient', 'doctor', 'admin', 'coo') THEN
    role_candidate := 'patient';
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    role_candidate
  )
  ON CONFLICT (id)
  DO UPDATE SET
    role = EXCLUDED.role,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);

  PERFORM public.assign_profile_roles(new.id, role_candidate);

  RETURN new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_profile_roles(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_profile_roles_from_profiles() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_profile_from_auth_user_role() TO service_role;
