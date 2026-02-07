-- Allow doctors to view patient ages for their appointments
-- This policy allows doctors to read patient registration data for patients they have appointments with

DROP POLICY IF EXISTS "Doctors can view their patients' registration data" ON public.patient_registrations;

CREATE POLICY "Doctors can view their patients' registration data" ON public.patient_registrations
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR 
    EXISTS (
      SELECT 1 FROM public.appointments 
      WHERE appointments.patient_id = patient_registrations.user_id 
      AND appointments.doctor_id = auth.uid()
    )
  );