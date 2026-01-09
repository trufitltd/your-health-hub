-- 02_create_doctors_schedules.sql
-- Creates the `doctors_schedules` table and related lookup/index tables.

-- Create doctors table (basic information)
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create doctor schedules (weekly availability)
-- Each row represents one time slot per day of week
CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week INT CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INT DEFAULT 30,
  max_patients_per_slot INT DEFAULT 1,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(doctor_id, day_of_week, start_time, end_time)
);

-- Index for fast doctor lookups
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor_id ON public.doctor_schedules (doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_day_of_week ON public.doctor_schedules (day_of_week);

-- Enable RLS on doctors table
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view doctors (public discovery)
CREATE POLICY "Allow public select doctors" ON public.doctors
  FOR SELECT
  USING (true);

-- Enable RLS on doctor_schedules
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view schedules (public discovery)
CREATE POLICY "Allow public select schedules" ON public.doctor_schedules
  FOR SELECT
  USING (true);

-- Insert sample doctors and schedules
INSERT INTO public.doctors (id, name, specialty, email, phone, bio)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440001', 'Dr. Adam Mohammad', 'Cardiologist', 'adam.mohammad@hospital.com', '+234 (555) 100-0001', 'Specialist in cardiovascular health'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Dr. Aisha Usman', 'General Medicine', 'aisha.usman@hospital.com', '+234 (555) 100-0002', 'General practitioner with 15 years of experience'),
  ('550e8400-e29b-41d4-a716-446655440003', 'Dr. John Michael', 'Dermatologist', 'john.michael@hospital.com', '+234 (555) 100-0003', 'Dermatology and skin care specialist'),
  ('550e8400-e29b-41d4-a716-446655440004', 'Dr. James Wilson', 'General Medicine', 'james.wilson@hospital.com', '+234 (555) 100-0004', 'Preventive care and wellness expert')
ON CONFLICT DO NOTHING;

-- Insert sample schedules (Monday-Friday, 9 AM - 5 PM)
INSERT INTO public.doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, max_patients_per_slot)
SELECT
  d.id,
  dow,
  start_t,
  end_t,
  30,
  1
FROM (SELECT id FROM public.doctors) d
CROSS JOIN (
  -- Monday to Friday (1-5), 9 AM to 5 PM
  SELECT dow, start_t, end_t
  FROM (VALUES 
    (1, '09:00'::time, '17:00'::time),
    (2, '09:00'::time, '17:00'::time),
    (3, '09:00'::time, '17:00'::time),
    (4, '09:00'::time, '17:00'::time),
    (5, '09:00'::time, '17:00'::time)
  ) AS t(dow, start_t, end_t)
) schedules
ON CONFLICT (doctor_id, day_of_week, start_time, end_time) DO NOTHING;

-- HELPER VIEW: Available appointment slots
-- This view shows potential slots based on doctor schedules and existing appointments
-- Ensure the appointments table has a doctor_id column before creating the view.
-- If you already ran a migration that adds doctor_id (03_add_doctor_id_to_appointments.sql), this is safe and will do nothing.
ALTER TABLE IF EXISTS public.appointments
  ADD COLUMN IF NOT EXISTS doctor_id UUID;

-- Add an index to speed up lookups by doctor
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments (doctor_id);

-- Add a foreign key constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_appointments_doctor_id'
  ) THEN
    BEGIN
      ALTER TABLE public.appointments
        ADD CONSTRAINT fk_appointments_doctor_id
        FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      -- ignore if created concurrently
      NULL;
    END;
  END IF;
END$$;

CREATE OR REPLACE VIEW public.available_slots AS
SELECT
  ds.id as schedule_id,
  d.id as doctor_id,
  d.name as doctor_name,
  d.specialty,
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
LEFT JOIN public.appointments a ON 
  d.id = a.doctor_id AND
  EXTRACT(DOW FROM a.date::date) = ds.day_of_week AND
  a.time >= ds.start_time::text AND
  a.time < (ds.end_time::time - make_interval(mins => ds.slot_duration_minutes))::text AND
  a.status != 'cancelled'
WHERE ds.is_available = true
GROUP BY ds.id, d.id, d.name, d.specialty, ds.day_of_week, ds.start_time, ds.end_time, ds.slot_duration_minutes, ds.max_patients_per_slot;

-- Notes:
-- 1. Add `doctor_id` column to the `appointments` table to track which doctor the appointment is with.
-- 2. Update the RLS policies on `appointments` to allow doctors to read all appointments for their schedule.
-- 3. The `available_slots` view simplifies finding available time slots and detecting conflicts.
-- 4. When booking, check that `available_slots > 0` before inserting.
