-- Returns user IDs and names of patients who have a profiles row
-- but no patient_registrations row (incomplete registration).
-- SECURITY DEFINER bypasses RLS so any authenticated user can call it.

DROP FUNCTION IF EXISTS public.get_incomplete_patient_profiles();

CREATE OR REPLACE FUNCTION public.get_incomplete_patient_profiles()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.role = 'patient'
    AND NOT EXISTS (
      SELECT 1 FROM public.patient_registrations pr
      WHERE pr.user_id = p.id
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_incomplete_patient_profiles() TO authenticated;
