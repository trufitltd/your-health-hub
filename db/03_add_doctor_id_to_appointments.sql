-- 03_add_doctor_id_to_appointments.sql
-- Adds doctor_id column to appointments table to track which doctor the appointment is with.

-- Add doctor_id column (nullable initially for existing records)
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS doctor_id UUID;

-- Add foreign key constraint
-- Add foreign key constraint only if it doesn't already exist (safe to run repeatedly)
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
			-- If constraint was created concurrently, ignore the error
			NULL;
		END;
	END IF;
END$$;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments (doctor_id);

-- Notes:
-- When creating a new appointment, populate the doctor_id based on the doctor selected by the patient.
-- This allows conflict detection: check that no other appointment exists for the same doctor
-- at the same date/time with status != 'cancelled'.
