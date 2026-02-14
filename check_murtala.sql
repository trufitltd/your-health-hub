SELECT 
  d.id as doctors_id,
  d.name,
  d.email,
  dr.id as registration_id,
  dr.user_id,
  dr.full_name,
  dr.email as reg_email
FROM doctors d
LEFT JOIN doctor_registrations dr ON d.email = dr.email
WHERE d.email = 'ramadan.isa@gmail.com';
