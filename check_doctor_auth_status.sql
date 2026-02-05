-- Check the actual auth.users record for your doctor
SELECT 
    id, 
    phone, 
    email, 
    phone_confirmed_at,
    email_confirmed_at,
    raw_user_meta_data,
    created_at
FROM auth.users 
WHERE id = 'a10c88ac-0594-4ce7-82f8-68ed4c4cd089';

-- Also check the doctor_registrations record
SELECT 
    user_id,
    full_name,
    phone_number,
    email,
    state,
    created_at
FROM doctor_registrations 
WHERE user_id = 'a10c88ac-0594-4ce7-82f8-68ed4c4cd089';