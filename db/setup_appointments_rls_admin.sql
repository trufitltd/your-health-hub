-- Check if RLS is enabled on appointments
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'appointments';

-- Show existing policies on appointments
SELECT policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'appointments';

-- Add policy to allow reading all appointments for admin purposes
DROP POLICY IF EXISTS "Allow public read access to appointments" ON appointments;

CREATE POLICY "Allow public read access to appointments"
ON appointments
FOR SELECT
USING (true);

-- Grant permissions
GRANT SELECT ON appointments TO authenticated;
GRANT SELECT ON appointments TO anon;
