-- Create doctor_registrations table
CREATE TABLE IF NOT EXISTS doctor_registrations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
    age INTEGER NOT NULL CHECK (age > 0 AND age < 150),
    phone_number TEXT NOT NULL,
    email TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    country TEXT NOT NULL,
    marital_status TEXT NOT NULL CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
    hospital_affiliation TEXT NOT NULL,
    specialty TEXT NOT NULL,
    profile_picture_url TEXT,
    medical_license_url TEXT NOT NULL,
    identification_type TEXT NOT NULL CHECK (identification_type IN ('nin', 'passport')),
    identification_number TEXT NOT NULL,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create storage bucket for doctor files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('doctor-files', 'doctor-files', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for doctor_registrations
ALTER TABLE doctor_registrations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own registration
CREATE POLICY "Users can view own doctor registration" ON doctor_registrations
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own registration
CREATE POLICY "Users can insert own doctor registration" ON doctor_registrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own registration
CREATE POLICY "Users can update own doctor registration" ON doctor_registrations
    FOR UPDATE USING (auth.uid() = user_id);

-- Set up storage policies for doctor-files bucket
CREATE POLICY "Users can upload their own doctor files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'doctor-files' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view their own doctor files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'doctor-files' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can update their own doctor files" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'doctor-files' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_doctor_registrations_updated_at 
    BEFORE UPDATE ON doctor_registrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();