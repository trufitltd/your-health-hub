-- Test script to mark some appointments as completed for testing
-- This will help verify if the recent consultations feature is working

-- Update a few appointments to completed status for testing
UPDATE appointments 
SET status = 'completed' 
WHERE status = 'confirmed' 
AND date < CURRENT_DATE 
LIMIT 3;

-- Check if there are any completed appointments
SELECT id, patient_name, specialist_name, date, time, status 
FROM appointments 
WHERE status = 'completed' 
ORDER BY date DESC 
LIMIT 5;