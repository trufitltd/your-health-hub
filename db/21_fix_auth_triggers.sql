-- Fix auth user creation triggers - make them more robust
-- The trigger was failing silently when trying to create doctors

-- Recreate the function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_doctor_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create doctor profile if user_metadata has role = 'doctor'
  IF NEW.raw_user_meta_data->>'role' = 'doctor' THEN
    BEGIN
      INSERT INTO public.doctors (id, name, email, is_active)
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        updated_at = now();
    EXCEPTION WHEN OTHERS THEN
      -- Log the error but don't fail the trigger
      RAISE WARNING 'Failed to create doctor profile for user %: %', NEW.id, SQLERRM;
    END;
  END IF;
  
  -- Always return NEW to allow the INSERT to succeed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_doctor_signup();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_doctor_signup();
