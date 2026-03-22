-- 45_fix_doctor_files_storage_rls.sql
-- Ensures doctor signup file uploads (profile + medical license) can succeed.

-- Ensure bucket exists and is public (public URL needed for admin review).
INSERT INTO storage.buckets (id, name, public)
VALUES ('doctor-files', 'doctor-files', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Remove conflicting legacy policies first.
DROP POLICY IF EXISTS "Users can upload their own doctor files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own doctor files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own doctor files" ON storage.objects;
DROP POLICY IF EXISTS "doctor_files_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "doctor_files_select_own" ON storage.objects;
DROP POLICY IF EXISTS "doctor_files_update_own" ON storage.objects;

-- Authenticated doctor can upload only under own top-level folder.
CREATE POLICY "doctor_files_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'doctor-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated doctor can update only own files.
CREATE POLICY "doctor_files_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'doctor-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'doctor-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated doctor can view only own files directly.
CREATE POLICY "doctor_files_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'doctor-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
