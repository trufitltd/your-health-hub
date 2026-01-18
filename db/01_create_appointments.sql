-- 01_create_appointments.sql
-- Creates the `appointments` table for the app and basic RLS policies.

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID,
  patient_name TEXT,
  specialist_name TEXT,
  date DATE,
  time TEXT,
  type TEXT,
  notes TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments (date);

-- Enable Row Level Security so we can add fine-grained policies
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Policy: patients may INSERT appointments where patient_id matches their auth uid
CREATE POLICY "Allow patient insert" ON public.appointments
  FOR INSERT
  WITH CHECK (patient_id = auth.uid()::uuid);

-- Policy: patients may SELECT only their own appointments
CREATE POLICY "Allow patient select" ON public.appointments
  FOR SELECT
  USING (patient_id = auth.uid()::uuid);

-- Policy: patients may UPDATE their own appointments
CREATE POLICY "Allow patient update" ON public.appointments
  FOR UPDATE
  USING (patient_id = auth.uid()::uuid)
  WITH CHECK (patient_id = auth.uid()::uuid);

-- Policy: patients may DELETE their own appointments
CREATE POLICY "Allow patient delete" ON public.appointments
  FOR DELETE
  USING (patient_id = auth.uid()::uuid);

-- Note:
-- - The policies above assume your auth.users.id values are UUIDs (the default in Supabase).
-- - If you need doctors or admin roles to read/modify appointments, add policies allowing access based on
--   user metadata (e.g. auth.role) or create a server-side function that performs privileged actions.
-- - Run this migration in the SQL editor of your Supabase project or via your preferred migration tool.
