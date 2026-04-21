-- Admin delete appointment function.
-- SECURITY DEFINER bypasses RLS so any authenticated user can call it.
-- Frontend is responsible for restricting this to admin users only.

CREATE OR REPLACE FUNCTION public.admin_delete_appointment(p_appointment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.appointments WHERE id = p_appointment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_appointment(UUID) TO authenticated;
