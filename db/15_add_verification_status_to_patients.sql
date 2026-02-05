-- Add verification_status column to patient_registrations table
ALTER TABLE patient_registrations 
ADD COLUMN verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected'));