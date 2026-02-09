-- Temporarily disable auth triggers to debug signup error
-- This migration disables the triggers that fire on auth.users changes

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

-- Create a disabled version of the trigger that just logs (for debugging)
-- We'll recreate the original triggers after confirming signup works

-- Test signup without triggers
-- Once working, re-enable triggers with: psql ... -f db/21_reenable_auth_triggers.sql
