-- Create health_records table
CREATE TABLE IF NOT EXISTS health_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;

-- Policy: Patients can view their own records
CREATE POLICY "Patients can view own health records"
  ON health_records FOR SELECT
  USING (auth.uid() = patient_id);

-- Policy: Patients can insert their own records
CREATE POLICY "Patients can upload own health records"
  ON health_records FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

-- Policy: Patients can delete their own records
CREATE POLICY "Patients can delete own health records"
  ON health_records FOR DELETE
  USING (auth.uid() = patient_id);

-- Policy: Doctors can view records of their patients (patients with appointments)
CREATE POLICY "Doctors can view patient health records"
  ON health_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.patient_id = health_records.patient_id
      AND appointments.doctor_id = auth.uid()
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_health_records_patient_id ON health_records(patient_id);
