-- Check if the doctor's user_id exists in auth.users
SELECT id, phone, email, raw_user_meta_data, created_at 
FROM auth.users 
WHERE id = 'a10c88ac-0594-4ce7-82f8-68ed4c4cd089';

-- If no result above, create the missing auth.users record for your doctor account
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    phone,
    email,
    encrypted_password,
    phone_confirmed_at,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'a10c88ac-0594-4ce7-82f8-68ed4c4cd089',
    'authenticated',
    'authenticated',
    '+2348106733459',
    'health.service820@gmail.com',
    crypt('yourpassword', gen_salt('bf')), -- Replace 'yourpassword' with your actual password
    NOW(),
    NOW(),
    '{"full_name": "Adam Usman", "role": "doctor"}',
    '2026-02-04 09:08:33.663358+00',
    NOW()
);