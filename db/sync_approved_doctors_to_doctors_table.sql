-- Sync all approved doctors from doctor_registrations to doctors table
-- This will update existing doctors or insert new ones

-- Step 1: Update existing doctors where email matches
UPDATE doctors d
SET 
  name = dr.full_name,
  specialty = dr.specialty,
  bio = dr.bio,
  phone = dr.phone_number,
  avatar_url = dr.profile_picture_url,
  is_active = true,
  updated_at = NOW()
FROM doctor_registrations dr
WHERE dr.verification_status = 'approved'
  AND d.email = dr.email;

-- Step 2: Insert new approved doctors that don't exist by email
INSERT INTO doctors (
  id,
  name,
  specialty,
  bio,
  phone,
  email,
  avatar_url,
  is_active,
  created_at,
  updated_at
)
SELECT 
  dr.id,
  dr.full_name,
  dr.specialty,
  dr.bio,
  dr.phone_number,
  dr.email,
  dr.profile_picture_url,
  true AS is_active,
  NOW(),
  NOW()
FROM doctor_registrations dr
WHERE dr.verification_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM doctors 
    WHERE email = dr.email AND email IS NOT NULL
  )
ON CONFLICT (id) DO NOTHING;
