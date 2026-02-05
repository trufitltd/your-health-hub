-- Add SMS tracking columns to appointments table
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS confirmation_sms_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confirmation_sms_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reminder_sms_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_sms_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancellation_sms_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cancellation_sms_sent_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for SMS tracking columns
CREATE INDEX IF NOT EXISTS idx_appointments_confirmation_sms ON appointments(confirmation_sms_sent);
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_sms ON appointments(reminder_sms_sent);

-- Add comments
COMMENT ON COLUMN appointments.confirmation_sms_sent IS 'Whether confirmation SMS has been sent to patient';
COMMENT ON COLUMN appointments.confirmation_sms_sent_at IS 'When confirmation SMS was sent';
COMMENT ON COLUMN appointments.reminder_sms_sent IS 'Whether reminder SMS has been sent to patient';
COMMENT ON COLUMN appointments.reminder_sms_sent_at IS 'When reminder SMS was sent';
COMMENT ON COLUMN appointments.cancellation_sms_sent IS 'Whether cancellation SMS has been sent to patient';
COMMENT ON COLUMN appointments.cancellation_sms_sent_at IS 'When cancellation SMS was sent';