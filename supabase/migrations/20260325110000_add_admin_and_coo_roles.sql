-- Allow admin/coo as first-class roles in profiles and signup trigger.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT profiles_role_check;
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['patient'::text, 'doctor'::text, 'admin'::text, 'coo'::text]));

UPDATE public.profiles
SET role = lower(trim(role))
WHERE role IS NOT NULL;

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
  );

  RETURN new;
END;
$$;
