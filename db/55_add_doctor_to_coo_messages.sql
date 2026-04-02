-- Update coo_messages table to support doctor threads and roles

-- First, drop the existing constraints
ALTER TABLE public.coo_messages DROP CONSTRAINT IF EXISTS coo_messages_thread_type_check;
ALTER TABLE public.coo_messages DROP CONSTRAINT IF EXISTS coo_messages_sender_role_check;

-- Add the updated constraints
ALTER TABLE public.coo_messages ADD CONSTRAINT coo_messages_thread_type_check 
  CHECK (thread_type IN ('admin', 'patient', 'doctor'));

ALTER TABLE public.coo_messages ADD CONSTRAINT coo_messages_sender_role_check 
  CHECK (sender_role IN ('coo', 'admin', 'patient', 'doctor'));
