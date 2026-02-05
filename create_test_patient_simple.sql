-- Create test patient user in Supabase (simplified)
-- Step 1: Insert into auth.users table with only essential columns
INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    phone,
    phone_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    confirmed_at
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'testpatient@example.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '+2348106733459',
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"full_name": "Test Patient", "role": "patient"}',
    false,
    NOW(),
    NOW(),
    NOW()
);

-- Step 2: Insert into patient_registrations table
WITH new_user AS (
    SELECT id FROM auth.users WHERE email = 'testpatient@example.com' ORDER BY created_at DESC LIMIT 1
)
INSERT INTO patient_registrations (
    user_id,
    full_name,
    gender,
    age,
    phone_number,
    email,
    city,
    state,
    country,
    marital_status,
    emergency_contact_name,
    emergency_contact_phone,
    identification_type,
    identification_number
) 
SELECT 
    new_user.id,
    'Test Patient',
    'male',
    30,
    '+2348106733459',
    'testpatient@example.com',
    'Lagos',
    'Lagos',
    'Nigeria',
    'single',
    'Emergency Contact',
    '+2348111111111',
    'nin',
    '12345678901'
FROM new_user;