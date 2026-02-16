-- Keep patient_folders in sync with consultation clerking fields.
-- Adds structured clerking columns and updates doctor_append_to_patient_folder RPC
-- so doctors can write all clerking sections into patient_folders.

ALTER TABLE public.patient_folders
  ADD COLUMN IF NOT EXISTS presenting_complaint TEXT,
  ADD COLUMN IF NOT EXISTS history_of_presenting_complaint TEXT,
  ADD COLUMN IF NOT EXISTS past_medical_history TEXT,
  ADD COLUMN IF NOT EXISTS past_drug_history TEXT,
  ADD COLUMN IF NOT EXISTS family_social_history TEXT,
  ADD COLUMN IF NOT EXISTS clinical_examination TEXT,
  ADD COLUMN IF NOT EXISTS assessment TEXT,
  ADD COLUMN IF NOT EXISTS treatment_plan TEXT,
  ADD COLUMN IF NOT EXISTS investigations TEXT,
  ADD COLUMN IF NOT EXISTS e_prescription TEXT;

CREATE OR REPLACE FUNCTION public.doctor_append_to_patient_folder(
  p_patient_id UUID,
  p_note_text TEXT,
  p_presenting_complaint TEXT DEFAULT NULL,
  p_history_of_presenting_complaint TEXT DEFAULT NULL,
  p_past_medical_history TEXT DEFAULT NULL,
  p_past_drug_history TEXT DEFAULT NULL,
  p_allergies TEXT DEFAULT NULL,
  p_family_social_history TEXT DEFAULT NULL,
  p_clinical_examination TEXT DEFAULT NULL,
  p_assessment TEXT DEFAULT NULL,
  p_treatment_plan TEXT DEFAULT NULL,
  p_investigations TEXT DEFAULT NULL,
  p_e_prescription TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller uuid := auth.uid()::uuid;
BEGIN
  -- Verify caller is a doctor related to this patient by appointment or consultation session.
  IF NOT EXISTS (
    SELECT 1
    FROM public.consultation_sessions cs
    WHERE cs.patient_id = p_patient_id
      AND cs.doctor_id = caller
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.patient_id = p_patient_id
      AND a.doctor_id = caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller is not the assigned doctor for this patient';
  END IF;

  IF EXISTS (SELECT 1 FROM public.patient_folders pf WHERE pf.patient_id = p_patient_id) THEN
    UPDATE public.patient_folders
    SET
      -- Keep legacy text trail for backwards compatibility
      medical_history = COALESCE(medical_history, '') || E'\n\n--- Entry: ' || now()::text || ' by doctor:' || caller::text || E'\n' || COALESCE(p_note_text, ''),
      allergies = COALESCE(NULLIF(p_allergies, ''), allergies),
      current_medications = COALESCE(NULLIF(p_e_prescription, ''), current_medications),
      previous_diagnoses = COALESCE(NULLIF(p_assessment, ''), previous_diagnoses),
      presenting_complaint = COALESCE(NULLIF(p_presenting_complaint, ''), presenting_complaint),
      history_of_presenting_complaint = COALESCE(NULLIF(p_history_of_presenting_complaint, ''), history_of_presenting_complaint),
      past_medical_history = COALESCE(NULLIF(p_past_medical_history, ''), past_medical_history),
      past_drug_history = COALESCE(NULLIF(p_past_drug_history, ''), past_drug_history),
      family_social_history = COALESCE(NULLIF(p_family_social_history, ''), family_social_history),
      clinical_examination = COALESCE(NULLIF(p_clinical_examination, ''), clinical_examination),
      assessment = COALESCE(NULLIF(p_assessment, ''), assessment),
      treatment_plan = COALESCE(NULLIF(p_treatment_plan, ''), treatment_plan),
      investigations = COALESCE(NULLIF(p_investigations, ''), investigations),
      e_prescription = COALESCE(NULLIF(p_e_prescription, ''), e_prescription),
      updated_at = now()
    WHERE patient_id = p_patient_id;
  ELSE
    INSERT INTO public.patient_folders (
      patient_id,
      patient_type,
      medical_history,
      allergies,
      current_medications,
      previous_diagnoses,
      presenting_complaint,
      history_of_presenting_complaint,
      past_medical_history,
      past_drug_history,
      family_social_history,
      clinical_examination,
      assessment,
      treatment_plan,
      investigations,
      e_prescription,
      created_at,
      updated_at
    )
    VALUES (
      p_patient_id,
      'returning',
      COALESCE(NULLIF(p_past_medical_history, ''), p_note_text),
      NULLIF(p_allergies, ''),
      NULLIF(p_e_prescription, ''),
      NULLIF(p_assessment, ''),
      NULLIF(p_presenting_complaint, ''),
      NULLIF(p_history_of_presenting_complaint, ''),
      NULLIF(p_past_medical_history, ''),
      NULLIF(p_past_drug_history, ''),
      NULLIF(p_family_social_history, ''),
      NULLIF(p_clinical_examination, ''),
      NULLIF(p_assessment, ''),
      NULLIF(p_treatment_plan, ''),
      NULLIF(p_investigations, ''),
      NULLIF(p_e_prescription, ''),
      now(),
      now()
    );
  END IF;
END;
$$;

