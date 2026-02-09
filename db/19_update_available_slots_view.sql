-- Update the available_slots view to only show slots for approved doctors

DROP VIEW IF EXISTS public.available_slots;

CREATE VIEW public.available_slots AS
SELECT
  ds.id as schedule_id,
  d.id as doctor_id,
  d.name as doctor_name,
  COALESCE(dr.specialty, d.specialty) as specialty,
  ds.day_of_week,
  ds.start_time,
  ds.end_time,
  ds.slot_duration_minutes,
  ds.max_patients_per_slot,
  -- Count existing appointments in this schedule window
  COALESCE(COUNT(a.id), 0) as booked_count,
  (ds.max_patients_per_slot - COALESCE(COUNT(a.id), 0)) as available_slots
FROM public.doctor_schedules ds
JOIN public.doctors d ON ds.doctor_id = d.id
LEFT JOIN public.doctor_registrations dr ON dr.user_id = d.id
LEFT JOIN public.appointments a ON 
  d.id = a.doctor_id AND
  EXTRACT(DOW FROM a.date::date) = ds.day_of_week AND
  a.time >= ds.start_time::text AND
  a.time < (ds.end_time::time - make_interval(mins => ds.slot_duration_minutes))::text AND
  a.status != 'cancelled'
-- Only show slots for doctors that are:
-- 1. Active (is_active = true)
-- 2. Approved (verification_status = 'approved')
-- 3. Have available slots (is_available = true)
WHERE ds.is_available = true 
  AND d.is_active = true
  AND (dr.verification_status = 'approved' OR dr.verification_status IS NULL)
GROUP BY ds.id, d.id, d.name, d.specialty, dr.specialty, ds.day_of_week, ds.start_time, ds.end_time, ds.slot_duration_minutes, ds.max_patients_per_slot;
