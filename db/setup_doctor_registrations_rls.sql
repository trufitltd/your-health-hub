-- Enable RLS on doctor_registrations if not already enabled
ALTER TABLE doctor_registrations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow doctors to view own registration" ON doctor_registrations;
DROP POLICY IF EXISTS "Allow doctors to update own registration" ON doctor_registrations;
DROP POLICY IF EXISTS "Allow doctors to insert own registration" ON doctor_registrations;
DROP POLICY IF EXISTS "Allow public read access to doctor registrations" ON doctor_registrations;

-- Policy: Doctors can view their own registration
CREATE POLICY "Allow doctors to view own registration"
ON doctor_registrations
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Doctors can update their own registration
CREATE POLICY "Allow doctors to update own registration"
ON doctor_registrations
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Doctors can insert their own registration
CREATE POLICY "Allow doctors to insert own registration"
ON doctor_registrations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow public read access to all doctor registrations
-- This allows the admin (and anyone) to view all doctor registrations
-- You can make this more restrictive by checking admin emails if needed
CREATE POLICY "Allow public read access to doctor registrations"
ON doctor_registrations
FOR SELECT
USING (true);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON doctor_registrations TO authenticated;
GRANT SELECT ON doctor_registrations TO anon;
