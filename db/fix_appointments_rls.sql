-- Comprehensive RLS policies for appointments table
-- Run this to fix doctor appointment access issues

-- First, check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'appointments';

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Allow patient insert" ON public.appointments;
DROP POLICY IF EXISTS "Allow patient select" ON public.appointments;
DROP POLICY IF EXISTS "Allow patient update" ON public.appointments;
DROP POLICY IF EXISTS "Allow patient delete" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can view their appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can update their appointments" ON public.appointments;
DROP POLICY IF EXISTS "Admin can read all appointments" ON public.appointments;

-- Patient policies
CREATE POLICY "Patients can insert own appointments" ON public.appointments
  FOR INSERT
  WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can view own appointments" ON public.appointments
  FOR SELECT
  USING (patient_id = auth.uid());

CREATE POLICY "Patients can update own appointments" ON public.appointments
  FOR UPDATE
  USING (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can delete own appointments" ON public.appointments
  FOR DELETE
  USING (patient_id = auth.uid());

-- Doctor policies (CRITICAL for accepting/rejecting appointments)
CREATE POLICY "Doctors can view their appointments" ON public.appointments
  FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Doctors can update their appointments" ON public.appointments
  FOR UPDATE
  USING (doctor_id = auth.uid());

-- Admin policy (for central admin access)
CREATE POLICY "Admin can read all appointments" ON public.appointments
  FOR SELECT
  USING (true);
