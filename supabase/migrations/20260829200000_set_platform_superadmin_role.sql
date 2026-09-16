-- Platform Super Admin role assignment
-- Sets ramadan@gmail.com as platform_superadmin so RLS policies allow org management

-- 1. Grant authenticated role access to organisations table (RLS handles row filtering)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;

-- 2. Ensure profiles row exists with platform_superadmin role
DO $$
DECLARE
  user_uuid UUID;
BEGIN
  SELECT id INTO user_uuid FROM auth.users WHERE lower(email) = lower('ramadan@gmail.com');

  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User ramadan@gmail.com not found in auth.users';
  END IF;

  RAISE NOTICE 'Found user: %', user_uuid;

  -- Upsert profile with platform_superadmin role
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (user_uuid, 'Platform Admin', 'platform_superadmin')
  ON CONFLICT (id) DO UPDATE SET role = 'platform_superadmin';

  RAISE NOTICE 'Profile role set to platform_superadmin for %', user_uuid;

  -- Update auth.users metadata
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "platform_superadmin"}'::jsonb
  WHERE id = user_uuid;

  RAISE NOTICE 'Auth metadata updated for %', user_uuid;
END $$;
