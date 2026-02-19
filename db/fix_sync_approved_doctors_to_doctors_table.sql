-- Fix sync: Remove incorrectly synced doctors and sync with correct user_id relationship

-- Step 1: Delete doctors that were synced with wrong ID (where doctor.id = doctor_registrations.id instead of .user_id)
-- Keep only those where doctor.id matches a doctor_registrations.user_id
DELETE FROM doctors d
WHERE NOT EXISTS (
  SELECT 1 FROM doctor_registrations dr 
  WHERE dr.user_id = d.id
);

-- Step 2: Now sync all approved doctors with CORRECT user_id mapping
INSERT INTO doctors (
  id,
  name,
  specialty,
  rate_per_consultation,
  bio,
  phone,
  email,
  avatar_url,
  is_active,
  created_at,
  updated_at
)
SELECT 
  dr.user_id,
  dr.full_name,
  dr.specialty,
  dr.rate_per_consultation,
  dr.bio,
  dr.phone_number,
  dr.email,
  dr.profile_picture_url,
  true AS is_active,
  NOW(),
  NOW()
FROM doctor_registrations dr
WHERE dr.verification_status = 'approved'
  AND dr.user_id IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  specialty = EXCLUDED.specialty,
  rate_per_consultation = EXCLUDED.rate_per_consultation,
  bio = EXCLUDED.bio,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  avatar_url = EXCLUDED.avatar_url,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;
