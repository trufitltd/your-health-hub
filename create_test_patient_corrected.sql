-- Create test patient user in Supabase (corrected version)
-- Step 1: Insert into auth.users table
INSERT INTO auth.users (
    instance_id,
    id,
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
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'testpatient@example.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '+15551234567',
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"full_name": "Test Patient", "role": "patient"}',
    false,
    NOW(),
    NOW()
);

-- Step 2: Insert into patient_registrations table using the user we just created
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
) VALUES (
    (SELECT id FROM auth.users WHERE email = 'testpatient@example.com' ORDER BY created_at DESC LIMIT 1),
    'Test Patient',
    'male',
    30,
    '+15551234567',
    'testpatient@example.com',
    'Lagos',
    'Lagos',
    'Nigeria',
    'single',
    'Emergency Contact',
    '+2348111111111',
    'nin',
    '12345678901'
);