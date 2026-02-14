-- Set auth.users.user_metadata.role = 'doctor' for approved doctor_registrations
-- Run this as a Supabase SQL admin (SQL editor) and then ask affected users to sign out and sign back in.

UPDATE auth.users u
SET user_metadata = u.user_metadata || jsonb_build_object('role', 'doctor')
FROM doctor_registrations dr
WHERE u.id = dr.user_id
  AND dr.verification_status = 'approved'
  AND dr.user_id IS NOT NULL
  AND (u.user_metadata->>'role') IS DISTINCT FROM 'doctor'
RETURNING u.id, u.email, u.user_metadata;
