-- Create SMS logs table to track all SMS communications
CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone_number TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('welcome', 'appointment_confirmation', 'appointment_reminder', 'general')),
    content TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_by UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sms_logs_phone_number ON sms_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_logs_message_type ON sms_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON sms_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs(status);

-- Enable RLS
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view SMS logs they sent" ON sms_logs
    FOR SELECT USING (sent_by = auth.uid());

CREATE POLICY "Users can insert SMS logs" ON sms_logs
    FOR INSERT WITH CHECK (sent_by = auth.uid() OR sent_by IS NULL);

-- Doctors can view SMS logs for their patients
CREATE POLICY "Doctors can view patient SMS logs" ON sms_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM doctors 
            WHERE doctors.user_id = auth.uid()
        )
    );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sms_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sms_logs_updated_at
    BEFORE UPDATE ON sms_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_logs_updated_at();

-- Add comment
COMMENT ON TABLE sms_logs IS 'Tracks all SMS communications sent through the system';