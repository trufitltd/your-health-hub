-- 40_fix_patient_files_and_health_records_rls.sql
-- Fixes upload failures caused by missing/incorrect RLS policies for:
-- 1) storage.objects in the patient-files bucket
-- 2) public.health_records inserts/selects/deletes

-- Ensure RLS is enabled on health_records.
ALTER TABLE IF EXISTS public.health_records ENABLE ROW LEVEL SECURITY;

-- Remove conflicting legacy policies if present.
DROP POLICY IF EXISTS "Patients can view own health records" ON public.health_records;
DROP POLICY IF EXISTS "Patients can upload own health records" ON public.health_records;
DROP POLICY IF EXISTS "Patients can delete own health records" ON public.health_records;
DROP POLICY IF EXISTS "Doctors can view patient health records" ON public.health_records;
DROP POLICY IF EXISTS "health_records_select_own" ON public.health_records;
DROP POLICY IF EXISTS "health_records_insert_own" ON public.health_records;
DROP POLICY IF EXISTS "health_records_delete_own" ON public.health_records;
DROP POLICY IF EXISTS "health_records_doctor_select" ON public.health_records;

-- Patient owns their own health records.
CREATE POLICY "health_records_select_own"
ON public.health_records
FOR SELECT
TO authenticated
USING (auth.uid() = patient_id);

CREATE POLICY "health_records_insert_own"
ON public.health_records
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "health_records_delete_own"
ON public.health_records
FOR DELETE
TO authenticated
USING (auth.uid() = patient_id);

-- Doctors can read records of patients they have appointments with.
CREATE POLICY "health_records_doctor_select"
ON public.health_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.patient_id = health_records.patient_id
      AND a.doctor_id = auth.uid()
  )
);

-- Storage bucket policies for patient-files.
-- Drop possible conflicting legacy names.
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Patients can upload own files" ON storage.objects;
DROP POLICY IF EXISTS "Patients can view own files" ON storage.objects;
DROP POLICY IF EXISTS "Patients can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Doctors can view patient files" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_select_own" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "patient_files_doctor_select" ON storage.objects;

-- Authenticated user can upload/view/delete only inside their own top-level folder.
CREATE POLICY "patient_files_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'patient-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "patient_files_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'patient-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "patient_files_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'patient-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Doctors can view files of patients they have appointments with.
CREATE POLICY "patient_files_doctor_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'patient-files'
  AND EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.patient_id::text = (storage.foldername(name))[1]
      AND a.doctor_id = auth.uid()
  )
);
