-- Check current auth.users data
SELECT id, phone, email, raw_user_meta_data, created_at 
FROM auth.users 
WHERE phone = '+2348106733459' OR email LIKE '%trufit%';

-- Check current doctor_registrations data  
SELECT user_id, full_name, phone_number, email, created_at
FROM doctor_registrations
WHERE phone_number = '+2348106733459' OR email LIKE '%trufit%';

-- Check if there are any orphaned doctor registrations (without auth.users)
SELECT dr.*, au.id as auth_user_exists
FROM doctor_registrations dr
LEFT JOIN auth.users au ON dr.user_id = au.id
WHERE au.id IS NULL;