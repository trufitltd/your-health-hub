-- 44_fix_full_name_sync_for_new_signups.sql
-- Ensures fallback registration never derives full_name from email,
-- and repairs rows where full_name accidentally equals email.

CREATE OR REPLACE FUNCTION public.ensure_auth_user_has_registration_row(
  p_user_id UUID,
  p_email TEXT,
  p_phone TEXT,
  p_full_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.doctor_registrations dr WHERE dr.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.patient_registrations pr WHERE pr.user_id = p_user_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.patient_registrations (
    user_id,
    full_name,
    gender,
    age,
    phone_number,
    email,
    city,
    state,
    country,
    marital_status,
    emergency_contact_name,
    emergency_contact_phone,
    identification_type,
    identification_number,
    verification_status
  )
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_full_name), ''), 'User'),
    'other',
    18,
    COALESCE(NULLIF(p_phone, ''), 'N/A'),
    NULLIF(trim(COALESCE(p_email, '')), ''),
    'Unknown',
    'Unknown',
    'Unknown',
    'single',
    'Not Provided',
    COALESCE(NULLIF(p_phone, ''), 'N/A'),
    'hospital_id',
    p_user_id::text,
    'pending'
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

UPDATE public.patient_registrations pr
SET full_name = meta.full_name
FROM (
  SELECT
    au.id AS user_id,
    NULLIF(trim(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name')), '') AS full_name
  FROM auth.users au
) AS meta
WHERE pr.user_id = meta.user_id
  AND meta.full_name IS NOT NULL
  AND pr.email IS NOT NULL
  AND (
    lower(trim(pr.full_name)) = lower(trim(pr.email))
    OR lower(trim(pr.full_name)) = lower(split_part(trim(pr.email), '@', 1))
  );

UPDATE public.doctor_registrations dr
SET full_name = meta.full_name
FROM (
  SELECT
    au.id AS user_id,
    NULLIF(trim(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name')), '') AS full_name
  FROM auth.users au
) AS meta
WHERE dr.user_id = meta.user_id
  AND meta.full_name IS NOT NULL
  AND dr.email IS NOT NULL
  AND (
    lower(trim(dr.full_name)) = lower(trim(dr.email))
    OR lower(trim(dr.full_name)) = lower(split_part(trim(dr.email), '@', 1))
  );
