-- Allow admin and COO roles to read all profiles rows.
-- Needed so admin/COO portals can detect patients with incomplete registration.

DROP POLICY IF EXISTS profiles_admin_read ON public.profiles;

CREATE POLICY profiles_admin_read
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'coo')
    )
  );
