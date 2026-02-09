-- SIMPLE FIX: Remove ALL auth triggers causing 500 error
-- Run this in Supabase SQL Editor

-- Drop all triggers on auth.users table
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
        RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
    END LOOP;
END $$;

-- Drop the function if it exists
DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;

-- Verify no triggers remain
SELECT 
    trigger_name,
    event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND event_object_schema = 'auth';

-- If the above query returns no rows, the fix is complete!
