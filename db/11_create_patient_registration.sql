-- Create patient_registrations table
CREATE TABLE patient_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_picture_url TEXT,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  age INTEGER NOT NULL CHECK (age > 0 AND age < 150),
  phone_number TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL,
  marital_status TEXT NOT NULL CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
  emergency_contact_name TEXT NOT NULL,
  emergency_contact_phone TEXT NOT NULL,
  identification_type TEXT NOT NULL CHECK (identification_type IN ('nin', 'student_id', 'passport', 'drivers_license', 'voters_card', 'hospital_id')),
  identification_number TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(identification_type, identification_number)
);

-- Enable RLS
ALTER TABLE patient_registrations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own registration" ON patient_registrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own registration" ON patient_registrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own registration" ON patient_registrations
  FOR UPDATE USING (auth.uid() = user_id);

-- Create storage bucket for patient files (if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('patient-files', 'patient-files', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies
CREATE POLICY "Users can upload their own files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'patient-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own files" ON storage.objects
  FOR SELECT USING (bucket_id = 'patient-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'patient-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public access to profile pictures
CREATE POLICY "Public can view profile pictures" ON storage.objects
  FOR SELECT USING (bucket_id = 'patient-files' AND (storage.foldername(name))[1] = 'profile-pictures');

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
CREATE TRIGGER update_patient_registrations_updated_at
  BEFORE UPDATE ON patient_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();