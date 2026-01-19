-- 04_create_consultation_tables.sql
-- Creates tables for real-time consultation sessions and messages

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create consultation_sessions table
CREATE TABLE IF NOT EXISTS public.consultation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  doctor_id UUID NOT NULL,
  consultation_type TEXT NOT NULL CHECK (consultation_type IN ('video', 'audio', 'chat')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'paused', 'waiting')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE
);

-- Create consultation_messages table for real-time chat
CREATE TABLE IF NOT EXISTS public.consultation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('patient', 'doctor')),
  sender_name TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'system')),
  content TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES public.consultation_sessions(id) ON DELETE CASCADE
);

-- Create consultation_recordings table for storing session recordings
CREATE TABLE IF NOT EXISTS public.consultation_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  recording_url TEXT,
  duration_seconds INT,
  file_size_mb DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (session_id) REFERENCES public.consultation_sessions(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_consultation_sessions_appointment_id ON public.consultation_sessions (appointment_id);
CREATE INDEX IF NOT EXISTS idx_consultation_sessions_patient_id ON public.consultation_sessions (patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_sessions_doctor_id ON public.consultation_sessions (doctor_id);
CREATE INDEX IF NOT EXISTS idx_consultation_sessions_status ON public.consultation_sessions (status);
CREATE INDEX IF NOT EXISTS idx_consultation_sessions_started_at ON public.consultation_sessions (started_at);

CREATE INDEX IF NOT EXISTS idx_consultation_messages_session_id ON public.consultation_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_consultation_messages_sender_id ON public.consultation_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_consultation_messages_created_at ON public.consultation_messages (created_at);

CREATE INDEX IF NOT EXISTS idx_consultation_recordings_session_id ON public.consultation_recordings (session_id);

-- Enable Row Level Security
ALTER TABLE public.consultation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_recordings ENABLE ROW LEVEL SECURITY;

-- Policies for consultation_sessions
-- Allow users to view sessions they are part of
CREATE POLICY "Allow users to view their sessions" ON public.consultation_sessions
  FOR SELECT
  USING (
    patient_id = auth.uid()::uuid 
    OR doctor_id = auth.uid()::uuid
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Allow creating new sessions
CREATE POLICY "Allow creating consultation sessions" ON public.consultation_sessions
  FOR INSERT
  WITH CHECK (
    auth.uid()::uuid IN (patient_id, doctor_id)
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Allow updating own sessions
CREATE POLICY "Allow updating own sessions" ON public.consultation_sessions
  FOR UPDATE
  USING (
    patient_id = auth.uid()::uuid 
    OR doctor_id = auth.uid()::uuid
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Policies for consultation_messages
-- Allow viewing messages from sessions you're part of
CREATE POLICY "Allow viewing messages from own sessions" ON public.consultation_messages
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.consultation_sessions 
      WHERE patient_id = auth.uid()::uuid OR doctor_id = auth.uid()::uuid
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Allow inserting messages
CREATE POLICY "Allow inserting messages" ON public.consultation_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()::uuid
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Policies for consultation_recordings
-- Allow viewing recordings from sessions you're part of
CREATE POLICY "Allow viewing own recordings" ON public.consultation_recordings
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.consultation_sessions 
      WHERE patient_id = auth.uid()::uuid OR doctor_id = auth.uid()::uuid
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );
