-- Update verification_status constraint to include 'approved' status
-- This allows for a proper workflow: pending -> approved -> (accepted/rejected)

-- First, remove the old constraint to allow the data migration
ALTER TABLE doctor_registrations 
DROP CONSTRAINT IF EXISTS doctor_registrations_verification_status_check;

-- Then, migrate any existing 'verified' status to 'approved' to maintain data integrity
UPDATE doctor_registrations 
SET verification_status = 'approved' 
WHERE verification_status = 'verified';

-- Add the new constraint with 'approved' status (replacing 'verified' with 'approved')
ALTER TABLE doctor_registrations
ADD CONSTRAINT doctor_registrations_verification_status_check 
CHECK (verification_status IN ('pending', 'approved', 'rejected'));
