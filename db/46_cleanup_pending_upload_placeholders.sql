-- 46_cleanup_pending_upload_placeholders.sql
-- Remove placeholder values that were treated as app routes (e.g. /pending_upload).

UPDATE public.doctor_registrations
SET medical_license_url = ''
WHERE lower(coalesce(trim(medical_license_url), '')) IN (
  'pending_upload',
  '/pending_upload'
);

UPDATE public.doctor_registrations
SET profile_picture_url = NULL
WHERE lower(coalesce(trim(profile_picture_url), '')) IN (
  'pending_upload',
  '/pending_upload'
);

UPDATE public.patient_registrations
SET profile_picture_url = NULL
WHERE lower(coalesce(trim(profile_picture_url), '')) IN (
  'pending_upload',
  '/pending_upload'
);
