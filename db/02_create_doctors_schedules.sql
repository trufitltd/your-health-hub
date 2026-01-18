-- 02_create_doctors_schedules.sql
-- Creates the `doctors_schedules` table for managing doctor availability
-- Note: The `doctors` table is created by 05_sync_auth_doctors_to_doctors_table.sql
-- This migration only creates the schedules table and policies

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
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(doctor_id, day_of_week, start_time, end_time)
);

-- Index for fast doctor lookups
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor_id ON public.doctor_schedules (doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_day_of_week ON public.doctor_schedules (day_of_week);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_is_available ON public.doctor_schedules (is_available);

-- Enable RLS on doctor_schedules
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public select schedules" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Allow doctors manage own schedules" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Allow doctors insert own schedules" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Allow doctors update own schedules" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Allow doctors delete own schedules" ON public.doctor_schedules;

-- Policy: Everyone can view schedules (public discovery)
CREATE POLICY "Allow public select schedules" ON public.doctor_schedules
  FOR SELECT
  USING (true);

-- Policy: Doctors can insert their own schedules
CREATE POLICY "Allow doctors insert own schedules" ON public.doctor_schedules
  FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

-- Policy: Doctors can update their own schedules
CREATE POLICY "Allow doctors update own schedules" ON public.doctor_schedules
  FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Policy: Doctors can delete their own schedules
CREATE POLICY "Allow doctors delete own schedules" ON public.doctor_schedules
  FOR DELETE
  USING (doctor_id = auth.uid());

-- Add doctor_id column to appointments table if not exists
ALTER TABLE IF EXISTS public.appointments
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL;

-- Add indexes to speed up lookups by doctor
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments (doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id_status ON public.appointments (doctor_id, status);

-- View: Available appointment slots
-- This view shows potential slots based on doctor schedules and existing appointments
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
WHERE ds.is_available = true AND d.is_active = true
GROUP BY ds.id, d.id, d.name, d.specialty, ds.day_of_week, ds.start_time, ds.end_time, ds.slot_duration_minutes, ds.max_patients_per_slot;

