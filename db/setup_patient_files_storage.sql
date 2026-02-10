-- Storage policies for patient-files bucket-- IMPORTANT: First create the 'patient-files' bucket in Supabase Dashboard > Storage
-- Make sure the bucket is set to PUBLIC

-- Drop existing policies if any
DROP POLICY IF EXISTS "Patients can upload own files" ON storage.objects;
DROP POLICY IF EXISTS "Patients can view own files" ON storage.objects;
DROP POLICY IF EXISTS "Patients can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Doctors can view patient files" ON storage.objects;

-- Patients can upload their own files
CREATE POLICY "Patients can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'patient-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Patients can view their own files
CREATE POLICY "Patients can view own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'patient-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Patients can delete their own files
CREATE POLICY "Patients can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'patient-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Doctors can view files of their patients
CREATE POLICY "Doctors can view patient files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'patient-files' AND
  EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.patient_id::text = (storage.foldername(name))[1]
    AND appointments.doctor_id = auth.uid()
  )
);
