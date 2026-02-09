-- Alternative fix: Remove trigger dependency on role metadata
-- Since we're no longer storing role in user_metadata, simplify the trigger

-- Create a simpler version that just tracks new users without role checking
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Don't try to determine role from metadata - just acknowledge the new user
  -- Role-specific setup (doctor vs patient) will happen after email verification
  -- via the direct database upserts in the frontend
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate triggers with simplified function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
