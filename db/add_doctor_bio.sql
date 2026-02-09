-- Add bio column to doctor_registrations table
ALTER TABLE doctor_registrations 
ADD COLUMN IF NOT EXISTS bio TEXT;
