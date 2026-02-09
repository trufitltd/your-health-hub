-- Add verification_notes column to doctor_registrations table
ALTER TABLE doctor_registrations 
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Add verified_at timestamp column to track when verification was completed
ALTER TABLE doctor_registrations 
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
