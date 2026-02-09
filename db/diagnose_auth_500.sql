-- Diagnostic and Fix for Auth Signup 500 Error
-- Run this in Supabase SQL Editor

-- Step 1: Check all triggers on auth.users
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND event_object_schema = 'auth';

-- Step 2: Drop ALL triggers on auth.users (they may be causing issues)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'users'
        AND event_object_schema = 'auth'
    ) LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON auth.users CASCADE';
    END LOOP;
END $$;

-- Step 3: Check if there are any functions that might be problematic
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%auth%'
OR routine_name LIKE '%user%';

-- Step 4: Recreate a minimal, safe trigger
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Do nothing, just allow the insert/update to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create the trigger (optional - only if you need it)
-- Comment this out if you don't need any triggers
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION public.handle_new_auth_user();

-- Step 6: Check RLS policies on related tables
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename IN ('patient_registrations', 'doctor_registrations', 'doctors')
ORDER BY tablename, policyname;

-- Step 7: Ensure auth.users table is accessible (should be by default)
-- This is just a check, don't modify auth schema directly
SELECT COUNT(*) as user_count FROM auth.users;
