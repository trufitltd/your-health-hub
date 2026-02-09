-- Add experience column to doctor_registrations table
ALTER TABLE doctor_registrations 
ADD COLUMN IF NOT EXISTS experience TEXT;
