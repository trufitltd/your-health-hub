-- 09_create_patient_folders_and_notes.sql
-- Creates tables for patient folders and doctor consultation notes

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create patient_folders table
CREATE TABLE IF NOT EXISTS public.patient_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL,
  patient_type TEXT NOT NULL CHECK (patient_type IN ('new', 'returning')),
  medical_history TEXT,
  allergies TEXT,
  current_medications TEXT,
  previous_diagnoses TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(patient_id)
);

-- Create doctor_consultation_notes table
CREATE TABLE IF NOT EXISTS public.doctor_consultation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  doctor_id UUID NOT NULL,
  diagnosis TEXT,
  prescriptions TEXT,
  treatment_plan TEXT,
  follow_up_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES public.consultation_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_patient_folders_patient_id ON public.patient_folders (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_folders_patient_type ON public.patient_folders (patient_type);
CREATE INDEX IF NOT EXISTS idx_doctor_consultation_notes_session_id ON public.doctor_consultation_notes (session_id);
CREATE INDEX IF NOT EXISTS idx_doctor_consultation_notes_patient_id ON public.doctor_consultation_notes (patient_id);
CREATE INDEX IF NOT EXISTS idx_doctor_consultation_notes_doctor_id ON public.doctor_consultation_notes (doctor_id);

-- Enable Row Level Security
ALTER TABLE public.patient_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_consultation_notes ENABLE ROW LEVEL SECURITY;

-- Policies for patient_folders
-- Patients can view their own folder
CREATE POLICY "Allow patients to view own folder" ON public.patient_folders
  FOR SELECT
  USING (patient_id = auth.uid()::uuid);

-- Doctors can view patient folders for their consultations
CREATE POLICY "Allow doctors to view patient folders" ON public.patient_folders
  FOR SELECT
  USING (
    patient_id IN (
      SELECT DISTINCT patient_id FROM public.consultation_sessions 
      WHERE doctor_id = auth.uid()::uuid
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Patients can update their own folder
CREATE POLICY "Allow patients to update own folder" ON public.patient_folders
  FOR UPDATE
  USING (patient_id = auth.uid()::uuid)
  WITH CHECK (patient_id = auth.uid()::uuid);

-- Patients can insert their own folder
CREATE POLICY "Allow patients to insert own folder" ON public.patient_folders
  FOR INSERT
  WITH CHECK (patient_id = auth.uid()::uuid);

-- Policies for doctor_consultation_notes
-- Patients can view notes from their consultations
CREATE POLICY "Allow patients to view own consultation notes" ON public.doctor_consultation_notes
  FOR SELECT
  USING (patient_id = auth.uid()::uuid);

-- Doctors can view notes they created
CREATE POLICY "Allow doctors to view own notes" ON public.doctor_consultation_notes
  FOR SELECT
  USING (doctor_id = auth.uid()::uuid);

-- Doctors can insert notes for their consultations
CREATE POLICY "Allow doctors to insert consultation notes" ON public.doctor_consultation_notes
  FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()::uuid
    AND session_id IN (
      SELECT id FROM public.consultation_sessions 
      WHERE doctor_id = auth.uid()::uuid
    )
  );

-- Doctors can update their own notes
CREATE POLICY "Allow doctors to update own notes" ON public.doctor_consultation_notes
  FOR UPDATE
  USING (doctor_id = auth.uid()::uuid)
  WITH CHECK (doctor_id = auth.uid()::uuid);
