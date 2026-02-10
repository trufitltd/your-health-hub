-- Allow doctors to update appointments assigned to them
-- This enables doctors to accept/reject appointment requests

-- Drop existing doctor policies if any
DROP POLICY IF EXISTS "Doctors can view their appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can update their appointments" ON public.appointments;

-- Policy: doctors can SELECT appointments where doctor_id matches their auth uid
CREATE POLICY "Doctors can view their appointments" ON public.appointments
  FOR SELECT
  USING (doctor_id = auth.uid());

-- Policy: doctors can UPDATE appointments where doctor_id matches their auth uid
CREATE POLICY "Doctors can update their appointments" ON public.appointments
  FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
