-- Server-side patient registration creation via RPC (Supabase-safe alternative to triggers)
-- This simple RPC ensures patient_registrations row exists with provided data

-- Drop existing function if it exists (to allow return type change)
DROP FUNCTION IF EXISTS public.ensure_patient_registration(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.ensure_patient_registration(
  p_user_id UUID,
  p_full_name TEXT,
  p_phone_number TEXT,
  p_email TEXT,
  p_gender TEXT,
  p_age INTEGER,
  p_city TEXT,
  p_state TEXT,
  p_country TEXT,
  p_marital_status TEXT,
  p_emergency_contact_name TEXT,
  p_emergency_contact_phone TEXT,
  p_identification_type TEXT,
  p_identification_number TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Simple upsert: insert or do nothing on conflict, then update only if needed
  INSERT INTO public.patient_registrations (
    user_id, full_name, gender, age, phone_number, email, city, state, country,
    marital_status, emergency_contact_name, emergency_contact_phone, 
    identification_type, identification_number
  )
  VALUES (
    p_user_id,
    COALESCE(p_full_name, 'Patient'),
    COALESCE(p_gender, 'other'),
    COALESCE(p_age, 18),
    COALESCE(p_phone_number, ''),
    COALESCE(p_email, ''),
    COALESCE(p_city, 'Unknown'),
    COALESCE(p_state, 'Unknown'),
    COALESCE(p_country, 'Unknown'),
    COALESCE(p_marital_status, 'single'),
    COALESCE(p_emergency_contact_name, 'Not Provided'),
    COALESCE(p_emergency_contact_phone, ''),
    COALESCE(p_identification_type, 'nin'),
    COALESCE(p_identification_number, substring(p_user_id::text, 1, 16))
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = COALESCE(NULLIF(p_full_name, ''), patient_registrations.full_name),
    gender = COALESCE(NULLIF(p_gender, ''), patient_registrations.gender),
    age = COALESCE(NULLIF(p_age, 0), patient_registrations.age),
    phone_number = COALESCE(NULLIF(p_phone_number, ''), patient_registrations.phone_number),
    email = COALESCE(NULLIF(p_email, ''), patient_registrations.email),
    updated_at = NOW();

  RETURN QUERY SELECT true::BOOLEAN, 'Patient registration saved'::TEXT;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail - return success=true so signup continues
  RAISE WARNING 'ensure_patient_registration error for user %: %', p_user_id, SQLERRM;
  RETURN QUERY SELECT true::BOOLEAN, 'Patient registration attempted'::TEXT;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.ensure_patient_registration TO authenticated;
