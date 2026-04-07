-- Admin-controlled doctor signup round open/close switch.

CREATE TABLE IF NOT EXISTS public.platform_signup_controls (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  doctor_signup_open BOOLEAN NOT NULL DEFAULT true,
  doctor_signup_closed_message TEXT NOT NULL DEFAULT 'Doctor sign up has been closed for this round and will resume soon. Please keep checking the site.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.platform_signup_controls (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_signup_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_signup_controls_select_policy ON public.platform_signup_controls;
CREATE POLICY platform_signup_controls_select_policy
  ON public.platform_signup_controls
  FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.get_doctor_signup_status()
RETURNS TABLE (
  doctor_signup_open BOOLEAN,
  doctor_signup_closed_message TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    doctor_signup_open,
    doctor_signup_closed_message
  FROM public.platform_signup_controls
  WHERE id = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_doctor_signup_status(
  p_doctor_signup_open BOOLEAN,
  p_doctor_signup_closed_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := lower(
    COALESCE(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      ''
    )
  );
  v_is_admin_user BOOLEAN := false;
  v_message TEXT := NULLIF(trim(COALESCE(p_doctor_signup_closed_message, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.admin_users au WHERE au.user_id = v_uid
    )
    INTO v_is_admin_user;
  END IF;

  IF NOT (v_role IN ('admin', 'coo') OR v_is_admin_user) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.platform_signup_controls (
    id,
    doctor_signup_open,
    doctor_signup_closed_message,
    updated_at,
    updated_by
  )
  VALUES (
    true,
    COALESCE(p_doctor_signup_open, true),
    COALESCE(
      v_message,
      'Doctor sign up has been closed for this round and will resume soon. Please keep checking the site.'
    ),
    now(),
    v_uid
  )
  ON CONFLICT (id)
  DO UPDATE SET
    doctor_signup_open = COALESCE(p_doctor_signup_open, public.platform_signup_controls.doctor_signup_open),
    doctor_signup_closed_message = COALESCE(
      v_message,
      public.platform_signup_controls.doctor_signup_closed_message
    ),
    updated_at = now(),
    updated_by = v_uid;
END;
$$;

-- Server-side enforcement: block doctor signup when round is closed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  role_candidate text := lower(trim(COALESCE(new.raw_user_meta_data->>'role', 'patient')));
  doctor_signup_open_flag BOOLEAN := true;
BEGIN
  IF role_candidate NOT IN ('patient', 'doctor') THEN
    role_candidate := 'patient';
  END IF;

  IF role_candidate = 'doctor' THEN
    SELECT COALESCE(psc.doctor_signup_open, true)
    INTO doctor_signup_open_flag
    FROM public.platform_signup_controls psc
    WHERE psc.id = true
    LIMIT 1;

    IF NOT COALESCE(doctor_signup_open_flag, true) THEN
      RAISE EXCEPTION 'Doctor signup is currently closed';
    END IF;
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

  RETURN new;
END;
$$;

GRANT SELECT ON public.platform_signup_controls TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_signup_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_doctor_signup_status(BOOLEAN, TEXT) TO authenticated;
