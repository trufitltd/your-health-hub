-- Fix RLS policies on doctors table to allow admin operations and authenticated users to manage their profiles

-- Drop existing policies
DROP POLICY IF EXISTS "Allow public select doctors" ON public.doctors;
DROP POLICY IF EXISTS "Allow doctors view own profile" ON public.doctors;
DROP POLICY IF EXISTS "Allow doctors update own profile" ON public.doctors;
DROP POLICY IF EXISTS "Allow service role to manage doctors" ON public.doctors;

-- Policy: Everyone can view active doctors (public discovery)
CREATE POLICY "Allow public select doctors" ON public.doctors
  FOR SELECT
  USING (is_active = true);

-- Policy: Doctors can view their own profile
CREATE POLICY "Allow doctors view own profile" ON public.doctors
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Authenticated users can insert their own doctor profile
-- This enables doctors to create their profile during signup
CREATE POLICY "Allow authenticated insert own doctor" ON public.doctors
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policy: Authenticated users can update their own doctor profile
-- This enables doctors to update their profile
CREATE POLICY "Allow authenticated update own doctor" ON public.doctors
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create a stored function to handle admin doctor profile creation/updates
-- This function bypasses RLS and is used by admins when approving doctors
CREATE OR REPLACE FUNCTION public.upsert_doctor_profile(
  p_doctor_id UUID,
  p_name TEXT,
  p_specialty TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_avatar_url TEXT,
  p_is_active BOOLEAN,
  p_rate_per_consultation NUMERIC DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.doctors (id, name, specialty, email, phone, avatar_url, is_active, rate_per_consultation)
  VALUES (p_doctor_id, p_name, p_specialty, p_email, p_phone, p_avatar_url, p_is_active, p_rate_per_consultation)
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(p_name, doctors.name),
    specialty = COALESCE(p_specialty, doctors.specialty),
    email = COALESCE(p_email, doctors.email),
    phone = COALESCE(p_phone, doctors.phone),
    avatar_url = COALESCE(p_avatar_url, doctors.avatar_url),
    is_active = COALESCE(p_is_active, doctors.is_active),
    rate_per_consultation = COALESCE(p_rate_per_consultation, doctors.rate_per_consultation),
    updated_at = now();
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_doctor_profile TO authenticated;
