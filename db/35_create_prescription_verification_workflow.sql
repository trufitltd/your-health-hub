-- Prescription verification workflow:
-- - stores verification codes for generated prescriptions
-- - exposes secure RPC for generating codes by patient/doctor
-- - exposes public RPC for verification page lookup by code

BEGIN;

CREATE TABLE IF NOT EXISTS public.prescription_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  note_id UUID NOT NULL UNIQUE REFERENCES public.doctor_consultation_notes(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.consultation_sessions(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drug_list TEXT NOT NULL,
  date_issued TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dispensed', 'expired')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescription_verifications_code ON public.prescription_verifications(code);
CREATE INDEX IF NOT EXISTS idx_prescription_verifications_patient_id ON public.prescription_verifications(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_verifications_doctor_id ON public.prescription_verifications(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescription_verifications_note_id ON public.prescription_verifications(note_id);

ALTER TABLE public.prescription_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view own prescription verifications" ON public.prescription_verifications;
CREATE POLICY "Patients can view own prescription verifications"
  ON public.prescription_verifications
  FOR SELECT
  USING (patient_id = auth.uid()::uuid);

DROP POLICY IF EXISTS "Doctors can view own prescription verifications" ON public.prescription_verifications;
CREATE POLICY "Doctors can view own prescription verifications"
  ON public.prescription_verifications
  FOR SELECT
  USING (doctor_id = auth.uid()::uuid);

DROP POLICY IF EXISTS "Doctors can update own prescription verifications" ON public.prescription_verifications;
CREATE POLICY "Doctors can update own prescription verifications"
  ON public.prescription_verifications
  FOR UPDATE
  USING (doctor_id = auth.uid()::uuid)
  WITH CHECK (doctor_id = auth.uid()::uuid);

CREATE OR REPLACE FUNCTION public._generate_unique_rx_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := 'RX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.prescription_verifications pv WHERE pv.code = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_prescription_verification(
  p_note_id UUID,
  p_session_id UUID,
  p_patient_id UUID,
  p_doctor_id UUID,
  p_drug_list TEXT,
  p_date_issued TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid()::uuid;
  existing_code TEXT;
  new_code TEXT;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF caller <> p_patient_id AND caller <> p_doctor_id AND auth.jwt() ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT code INTO existing_code
  FROM public.prescription_verifications
  WHERE note_id = p_note_id
  LIMIT 1;

  IF existing_code IS NOT NULL THEN
    UPDATE public.prescription_verifications
    SET
      session_id = COALESCE(p_session_id, session_id),
      patient_id = p_patient_id,
      doctor_id = p_doctor_id,
      drug_list = COALESCE(NULLIF(p_drug_list, ''), drug_list),
      date_issued = COALESCE(p_date_issued, date_issued),
      updated_at = now()
    WHERE note_id = p_note_id;
    RETURN existing_code;
  END IF;

  new_code := public._generate_unique_rx_code();

  INSERT INTO public.prescription_verifications (
    code,
    note_id,
    session_id,
    patient_id,
    doctor_id,
    drug_list,
    date_issued,
    status,
    expires_at,
    created_at,
    updated_at
  )
  VALUES (
    new_code,
    p_note_id,
    p_session_id,
    p_patient_id,
    p_doctor_id,
    COALESCE(NULLIF(p_drug_list, ''), 'Not specified'),
    COALESCE(p_date_issued, now()),
    'active',
    COALESCE(p_date_issued, now()) + INTERVAL '90 days',
    now(),
    now()
  );

  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_prescription_public(p_code TEXT)
RETURNS TABLE (
  code TEXT,
  patient_name TEXT,
  drug_list TEXT,
  date_issued TIMESTAMPTZ,
  prescribing_doctor TEXT,
  doctor_license_status TEXT,
  prescription_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pv.code,
    COALESCE(pr.full_name, 'Patient') AS patient_name,
    pv.drug_list,
    pv.date_issued,
    COALESCE(dr.full_name, 'Doctor') AS prescribing_doctor,
    COALESCE(initcap(dr.verification_status), 'Unknown') AS doctor_license_status,
    CASE
      WHEN pv.status = 'dispensed' THEN 'Dispensed'
      WHEN COALESCE(pv.expires_at, pv.date_issued + INTERVAL '90 days') < now() THEN 'Expired'
      WHEN pv.status = 'expired' THEN 'Expired'
      ELSE 'Active'
    END AS prescription_status
  FROM public.prescription_verifications pv
  LEFT JOIN public.patient_registrations pr ON pr.user_id = pv.patient_id
  LEFT JOIN public.doctor_registrations dr ON dr.user_id = pv.doctor_id
  WHERE upper(pv.code) = upper(p_code)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_prescription_verification(UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_prescription_public(TEXT) TO anon, authenticated;

COMMIT;
