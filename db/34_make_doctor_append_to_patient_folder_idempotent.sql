-- Prevent rapid duplicate appends to patient_folders.medical_history when
-- clerking save is triggered multiple times in quick succession.

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
  existing_medical_history TEXT;
  existing_updated_at TIMESTAMPTZ;
  normalized_note TEXT;
  normalized_tail TEXT;
  should_append BOOLEAN := TRUE;
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
    SELECT pf.medical_history, pf.updated_at
    INTO existing_medical_history, existing_updated_at
    FROM public.patient_folders pf
    WHERE pf.patient_id = p_patient_id
    LIMIT 1;

    -- Idempotency guard:
    -- If the same note was effectively just appended (within 5 minutes),
    -- do not append it again. Structured columns still update.
    normalized_note := lower(regexp_replace(COALESCE(p_note_text, ''), E'\\s+', ' ', 'g'));
    normalized_note := btrim(normalized_note);

    IF normalized_note = '' THEN
      should_append := FALSE;
    ELSIF existing_medical_history IS NOT NULL
      AND existing_updated_at IS NOT NULL
      AND existing_updated_at >= (now() - INTERVAL '5 minutes')
    THEN
      normalized_tail := lower(
        regexp_replace(
          right(existing_medical_history, GREATEST(length(COALESCE(p_note_text, '')) * 2, 4000)),
          E'\\s+',
          ' ',
          'g'
        )
      );
      normalized_tail := btrim(normalized_tail);

      IF position(normalized_note IN normalized_tail) > 0 THEN
        should_append := FALSE;
      END IF;
    END IF;

    UPDATE public.patient_folders
    SET
      medical_history = CASE
        WHEN should_append THEN
          COALESCE(medical_history, '') || E'\n\n--- Entry: ' || now()::text || ' by doctor:' || caller::text || E'\n' || COALESCE(p_note_text, '')
        ELSE
          medical_history
      END,
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
