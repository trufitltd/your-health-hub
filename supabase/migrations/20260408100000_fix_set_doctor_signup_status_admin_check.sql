-- Fix set_doctor_signup_status to allow users whose email is in the
-- admin list, regardless of their JWT role (e.g. a doctor-role user
-- who is also a platform admin).

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
  v_uid    UUID := auth.uid();
  v_email  TEXT := lower(trim(COALESCE(auth.email(), '')));
  v_role   TEXT := lower(COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  ));
  v_is_admin BOOLEAN := false;
  v_message  TEXT := NULLIF(trim(COALESCE(p_doctor_signup_closed_message, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 1. Role-based check (admin / coo in JWT metadata)
  IF v_role IN ('admin', 'coo') THEN
    v_is_admin := true;
  END IF;

  -- 2. admin_users table check (if the table exists)
  IF NOT v_is_admin AND to_regclass('public.admin_users') IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.admin_users au WHERE au.user_id = v_uid
    ) INTO v_is_admin;
  END IF;

  -- 3. profiles table check — user whose profile role is 'admin' or 'coo'
  IF NOT v_is_admin AND to_regclass('public.profiles') IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid AND p.role IN ('admin', 'coo')
    ) INTO v_is_admin;
  END IF;

  -- 4. Hardcoded admin email list (mirrors VITE_ADMIN_EMAILS on the frontend)
  IF NOT v_is_admin AND v_email <> '' THEN
    SELECT v_email = ANY(ARRAY[
      'tj@gmail.com',
      'myedoctoronline@gmail.com',
      'ramadan@gmail.com',
      'ibtisama.ramadan@gmail.com'
    ]) INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
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

GRANT EXECUTE ON FUNCTION public.set_doctor_signup_status(BOOLEAN, TEXT) TO authenticated;
