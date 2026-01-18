-- 05_sync_auth_doctors_to_doctors_table.sql
-- This migration updates the doctors table structure to link with auth.users
-- and adds a trigger to automatically create doctor profiles on signup

-- Drop the old doctors table if it exists and recreate it
DROP TABLE IF EXISTS public.doctor_schedules CASCADE;
DROP TABLE IF EXISTS public.doctors CASCADE;

-- Create updated doctors table that links to auth.users
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create doctor schedules (weekly availability)
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

-- Add doctor_id column to appointments table
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_doctors_email ON public.doctors (email);
CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON public.doctors (specialty);
CREATE INDEX IF NOT EXISTS idx_doctors_is_active ON public.doctors (is_active);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor_id ON public.doctor_schedules (doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_day_of_week ON public.doctor_schedules (day_of_week);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments (doctor_id);

-- Enable RLS on doctors table
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public select doctors" ON public.doctors;
DROP POLICY IF EXISTS "Allow doctors view own profile" ON public.doctors;
DROP POLICY IF EXISTS "Allow doctors update own profile" ON public.doctors;

-- Policy: Everyone can view active doctors (public discovery)
CREATE POLICY "Allow public select doctors" ON public.doctors
  FOR SELECT
  USING (is_active = true);

-- Policy: Doctors can view their own profile
CREATE POLICY "Allow doctors view own profile" ON public.doctors
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Doctors can update their own profile
CREATE POLICY "Allow doctors update own profile" ON public.doctors
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

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

-- Create function to automatically create doctor profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_doctor_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create doctor profile if user_metadata has role = 'doctor'
  IF NEW.raw_user_meta_data->>'role' = 'doctor' THEN
    INSERT INTO public.doctors (id, name, email, is_active)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NEW.email,
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to call the function on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_doctor_signup();

-- Also handle updates to user metadata (in case role changes)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_doctor_signup();

-- Update appointments table RLS to include doctor access
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow doctors view their appointments" ON public.appointments;
DROP POLICY IF EXISTS "Allow doctors update their appointments" ON public.appointments;

-- Policy: Doctors can view appointments assigned to them
CREATE POLICY "Allow doctors view their appointments" ON public.appointments
  FOR SELECT
  USING (
    doctor_id = auth.uid()
    OR patient_id = auth.uid()
    OR (patient_id IS NULL AND doctor_id IS NULL) -- allow creation
  );

-- Policy: Doctors can update their appointments
CREATE POLICY "Allow doctors update their appointments" ON public.appointments
  FOR UPDATE
  USING (doctor_id = auth.uid() OR patient_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid() OR patient_id = auth.uid());

-- Add appointment doctor_id column index for queries
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id_status ON public.appointments (doctor_id, status);
