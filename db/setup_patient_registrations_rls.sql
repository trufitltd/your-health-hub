-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Allow public read access to patient registrations" ON patient_registrations;

-- Create new policy for admin to read patient_registrations
CREATE POLICY "Allow public read access to patient registrations"
ON patient_registrations
FOR SELECT
USING (true);

-- Grant necessary permissions
GRANT SELECT ON patient_registrations TO authenticated;
GRANT SELECT ON patient_registrations TO anon;
