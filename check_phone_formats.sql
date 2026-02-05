-- Check existing phone formats in auth.users
SELECT phone, email, raw_user_meta_data 
FROM auth.users 
WHERE phone IS NOT NULL 
ORDER BY created_at DESC 
LIMIT 5;

-- Also check if the test patient was created
SELECT phone, email, created_at 
FROM auth.users 
WHERE phone = '+2349064656177' OR email = 'testpatient@example.com';