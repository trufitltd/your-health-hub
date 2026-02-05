-- Create test patient using proper Supabase auth flow
-- This creates both auth.users record and patient_registrations record

-- First, let's create a function to properly create a test user
CREATE OR REPLACE FUNCTION create_test_patient()
RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
BEGIN
    -- Insert into auth.users with proper Supabase structure
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        phone,
        encrypted_password,
        email_confirmed_at,
        phone_confirmed_at,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        new_email,
        invited_at,
        action_link,
        email_change_token_new,
        email_change_token_current,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        'testpatient@example.com',
        '+2349064656177',
        crypt('password123', gen_salt('bf')),
        NOW(),
        NOW(),
        '{"full_name": "Test Patient", "role": "patient"}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        NULL,
        '',
        '',
        '',
        ''
    ) RETURNING id INTO new_user_id;

    -- Insert into patient_registrations
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
        new_user_id,
        'Test Patient',
        'male',
        30,
        '+2349064656177',
        'testpatient@example.com',
        'Lagos',
        'Lagos',
        'Nigeria',
        'single',
        'Emergency Contact',
        '+2349064656177',
        'nin',
        '12345678901'
    );

    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;

-- Execute the function to create the test patient
SELECT create_test_patient();