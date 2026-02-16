-- Expand patient folder access for doctors:
-- Doctors should be able to view folders for any patient who has booked an appointment with them,
-- not only patients with completed consultation sessions.

CREATE POLICY "Allow doctors to view patient folders for booked appointments"
ON public.patient_folders
FOR SELECT
USING (
  patient_id IN (
    SELECT DISTINCT a.patient_id
    FROM public.appointments a
    WHERE a.doctor_id = auth.uid()::uuid
  )
  OR auth.jwt() ->> 'role' = 'service_role'
);

