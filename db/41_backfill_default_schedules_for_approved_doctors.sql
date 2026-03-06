-- 41_backfill_default_schedules_for_approved_doctors.sql
-- Ensures already-approved doctors with no schedules become bookable.
-- Default schedule: Monday-Saturday, 09:00-23:00.

WITH approved_doctors AS (
  SELECT dr.user_id AS doctor_id
  FROM public.doctor_registrations dr
  WHERE dr.verification_status = 'approved'
),
doctors_without_schedules AS (
  SELECT ad.doctor_id
  FROM approved_doctors ad
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.doctor_schedules ds
    WHERE ds.doctor_id = ad.doctor_id
  )
)
INSERT INTO public.doctor_schedules (
  doctor_id,
  day_of_week,
  start_time,
  end_time,
  slot_duration_minutes,
  max_patients_per_slot,
  is_available
)
SELECT
  dws.doctor_id,
  day_num.day_of_week,
  '09:00'::time,
  '23:00'::time,
  15,
  1,
  true
FROM doctors_without_schedules dws
CROSS JOIN (
  SELECT 1 AS day_of_week
  UNION ALL SELECT 2
  UNION ALL SELECT 3
  UNION ALL SELECT 4
  UNION ALL SELECT 5
  UNION ALL SELECT 6
) AS day_num;

-- Ensure approved doctors are marked active in public.doctors for legacy consumers.
UPDATE public.doctors d
SET is_active = true
WHERE d.id IN (
  SELECT dr.user_id
  FROM public.doctor_registrations dr
  WHERE dr.verification_status = 'approved'
);
