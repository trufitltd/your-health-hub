-- Add blood_type column to patient_registrations table
ALTER TABLE patient_registrations
ADD COLUMN IF NOT EXISTS blood_type TEXT;
