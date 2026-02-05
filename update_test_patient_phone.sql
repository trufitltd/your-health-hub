-- Update the existing test patient to use Nigerian phone number
UPDATE auth.users 
SET phone = '+2349064656177'
WHERE phone = '+15551234567' AND raw_user_meta_data->>'full_name' = 'Test Patient';

-- Also update the patient_registrations table
UPDATE patient_registrations 
SET phone_number = '+2349064656177', emergency_contact_phone = '+2349064656177'
WHERE phone_number = '+15551234567';