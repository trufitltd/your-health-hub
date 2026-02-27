-- Add multilingual support for patient folder and doctor clerking fields.
-- - Stores per-language content in JSONB translation columns.
-- - Backfills existing English content.
-- - Extends doctor_append_to_patient_folder RPC to write translations.

BEGIN;

ALTER TABLE public.patient_folders
  ADD COLUMN IF NOT EXISTS medical_history_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS presenting_complaint_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS history_of_presenting_complaint_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS past_medical_history_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS past_drug_history_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS allergies_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS family_social_history_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS clinical_examination_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS assessment_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS treatment_plan_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS investigations_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS e_prescription_translations JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.doctor_consultation_notes
  ADD COLUMN IF NOT EXISTS diagnosis_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS treatment_plan_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prescriptions_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS follow_up_notes_translations JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_medical_history_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_medical_history_translations_obj CHECK (jsonb_typeof(medical_history_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_presenting_complaint_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_presenting_complaint_translations_obj CHECK (jsonb_typeof(presenting_complaint_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_hopc_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_hopc_translations_obj CHECK (jsonb_typeof(history_of_presenting_complaint_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_pmh_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_pmh_translations_obj CHECK (jsonb_typeof(past_medical_history_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_pdh_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_pdh_translations_obj CHECK (jsonb_typeof(past_drug_history_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_allergies_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_allergies_translations_obj CHECK (jsonb_typeof(allergies_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_fsh_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_fsh_translations_obj CHECK (jsonb_typeof(family_social_history_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_ce_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_ce_translations_obj CHECK (jsonb_typeof(clinical_examination_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_assessment_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_assessment_translations_obj CHECK (jsonb_typeof(assessment_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_tplan_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_tplan_translations_obj CHECK (jsonb_typeof(treatment_plan_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_investigations_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_investigations_translations_obj CHECK (jsonb_typeof(investigations_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pf_eprescription_translations_obj') THEN
    ALTER TABLE public.patient_folders ADD CONSTRAINT pf_eprescription_translations_obj CHECK (jsonb_typeof(e_prescription_translations) = 'object');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dcn_diagnosis_translations_obj') THEN
    ALTER TABLE public.doctor_consultation_notes ADD CONSTRAINT dcn_diagnosis_translations_obj CHECK (jsonb_typeof(diagnosis_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dcn_tplan_translations_obj') THEN
    ALTER TABLE public.doctor_consultation_notes ADD CONSTRAINT dcn_tplan_translations_obj CHECK (jsonb_typeof(treatment_plan_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dcn_prescriptions_translations_obj') THEN
    ALTER TABLE public.doctor_consultation_notes ADD CONSTRAINT dcn_prescriptions_translations_obj CHECK (jsonb_typeof(prescriptions_translations) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dcn_followup_translations_obj') THEN
    ALTER TABLE public.doctor_consultation_notes ADD CONSTRAINT dcn_followup_translations_obj CHECK (jsonb_typeof(follow_up_notes_translations) = 'object');
  END IF;
END $$;

UPDATE public.patient_folders
SET
  medical_history_translations = COALESCE(medical_history_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(medical_history), '') IS NOT NULL THEN jsonb_build_object('en', btrim(medical_history)) ELSE '{}'::jsonb END,
  presenting_complaint_translations = COALESCE(presenting_complaint_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(presenting_complaint), '') IS NOT NULL THEN jsonb_build_object('en', btrim(presenting_complaint)) ELSE '{}'::jsonb END,
  history_of_presenting_complaint_translations = COALESCE(history_of_presenting_complaint_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(history_of_presenting_complaint), '') IS NOT NULL THEN jsonb_build_object('en', btrim(history_of_presenting_complaint)) ELSE '{}'::jsonb END,
  past_medical_history_translations = COALESCE(past_medical_history_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(past_medical_history), '') IS NOT NULL THEN jsonb_build_object('en', btrim(past_medical_history)) ELSE '{}'::jsonb END,
  past_drug_history_translations = COALESCE(past_drug_history_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(past_drug_history), '') IS NOT NULL THEN jsonb_build_object('en', btrim(past_drug_history)) ELSE '{}'::jsonb END,
  allergies_translations = COALESCE(allergies_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(allergies), '') IS NOT NULL THEN jsonb_build_object('en', btrim(allergies)) ELSE '{}'::jsonb END,
  family_social_history_translations = COALESCE(family_social_history_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(family_social_history), '') IS NOT NULL THEN jsonb_build_object('en', btrim(family_social_history)) ELSE '{}'::jsonb END,
  clinical_examination_translations = COALESCE(clinical_examination_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(clinical_examination), '') IS NOT NULL THEN jsonb_build_object('en', btrim(clinical_examination)) ELSE '{}'::jsonb END,
  assessment_translations = COALESCE(assessment_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(assessment), '') IS NOT NULL THEN jsonb_build_object('en', btrim(assessment)) ELSE '{}'::jsonb END,
  treatment_plan_translations = COALESCE(treatment_plan_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(treatment_plan), '') IS NOT NULL THEN jsonb_build_object('en', btrim(treatment_plan)) ELSE '{}'::jsonb END,
  investigations_translations = COALESCE(investigations_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(investigations), '') IS NOT NULL THEN jsonb_build_object('en', btrim(investigations)) ELSE '{}'::jsonb END,
  e_prescription_translations = COALESCE(e_prescription_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(e_prescription), '') IS NOT NULL THEN jsonb_build_object('en', btrim(e_prescription)) ELSE '{}'::jsonb END,
  updated_at = now();

UPDATE public.doctor_consultation_notes
SET
  diagnosis_translations = COALESCE(diagnosis_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(diagnosis), '') IS NOT NULL THEN jsonb_build_object('en', btrim(diagnosis)) ELSE '{}'::jsonb END,
  treatment_plan_translations = COALESCE(treatment_plan_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(treatment_plan), '') IS NOT NULL THEN jsonb_build_object('en', btrim(treatment_plan)) ELSE '{}'::jsonb END,
  prescriptions_translations = COALESCE(prescriptions_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(prescriptions), '') IS NOT NULL THEN jsonb_build_object('en', btrim(prescriptions)) ELSE '{}'::jsonb END,
  follow_up_notes_translations = COALESCE(follow_up_notes_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(follow_up_notes), '') IS NOT NULL THEN jsonb_build_object('en', btrim(follow_up_notes)) ELSE '{}'::jsonb END,
  updated_at = now();

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
  p_e_prescription TEXT DEFAULT NULL,
  p_medical_history_translations JSONB DEFAULT NULL,
  p_presenting_complaint_translations JSONB DEFAULT NULL,
  p_history_of_presenting_complaint_translations JSONB DEFAULT NULL,
  p_past_medical_history_translations JSONB DEFAULT NULL,
  p_past_drug_history_translations JSONB DEFAULT NULL,
  p_allergies_translations JSONB DEFAULT NULL,
  p_family_social_history_translations JSONB DEFAULT NULL,
  p_clinical_examination_translations JSONB DEFAULT NULL,
  p_assessment_translations JSONB DEFAULT NULL,
  p_treatment_plan_translations JSONB DEFAULT NULL,
  p_investigations_translations JSONB DEFAULT NULL,
  p_e_prescription_translations JSONB DEFAULT NULL
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
      medical_history_translations = COALESCE(medical_history_translations, '{}'::jsonb) || COALESCE(p_medical_history_translations, '{}'::jsonb),
      allergies = COALESCE(NULLIF(p_allergies, ''), allergies),
      allergies_translations = COALESCE(allergies_translations, '{}'::jsonb) || COALESCE(p_allergies_translations, '{}'::jsonb),
      current_medications = COALESCE(NULLIF(p_e_prescription, ''), current_medications),
      previous_diagnoses = COALESCE(NULLIF(p_assessment, ''), previous_diagnoses),
      presenting_complaint = COALESCE(NULLIF(p_presenting_complaint, ''), presenting_complaint),
      presenting_complaint_translations = COALESCE(presenting_complaint_translations, '{}'::jsonb) || COALESCE(p_presenting_complaint_translations, '{}'::jsonb),
      history_of_presenting_complaint = COALESCE(NULLIF(p_history_of_presenting_complaint, ''), history_of_presenting_complaint),
      history_of_presenting_complaint_translations = COALESCE(history_of_presenting_complaint_translations, '{}'::jsonb) || COALESCE(p_history_of_presenting_complaint_translations, '{}'::jsonb),
      past_medical_history = COALESCE(NULLIF(p_past_medical_history, ''), past_medical_history),
      past_medical_history_translations = COALESCE(past_medical_history_translations, '{}'::jsonb) || COALESCE(p_past_medical_history_translations, '{}'::jsonb),
      past_drug_history = COALESCE(NULLIF(p_past_drug_history, ''), past_drug_history),
      past_drug_history_translations = COALESCE(past_drug_history_translations, '{}'::jsonb) || COALESCE(p_past_drug_history_translations, '{}'::jsonb),
      family_social_history = COALESCE(NULLIF(p_family_social_history, ''), family_social_history),
      family_social_history_translations = COALESCE(family_social_history_translations, '{}'::jsonb) || COALESCE(p_family_social_history_translations, '{}'::jsonb),
      clinical_examination = COALESCE(NULLIF(p_clinical_examination, ''), clinical_examination),
      clinical_examination_translations = COALESCE(clinical_examination_translations, '{}'::jsonb) || COALESCE(p_clinical_examination_translations, '{}'::jsonb),
      assessment = COALESCE(NULLIF(p_assessment, ''), assessment),
      assessment_translations = COALESCE(assessment_translations, '{}'::jsonb) || COALESCE(p_assessment_translations, '{}'::jsonb),
      treatment_plan = COALESCE(NULLIF(p_treatment_plan, ''), treatment_plan),
      treatment_plan_translations = COALESCE(treatment_plan_translations, '{}'::jsonb) || COALESCE(p_treatment_plan_translations, '{}'::jsonb),
      investigations = COALESCE(NULLIF(p_investigations, ''), investigations),
      investigations_translations = COALESCE(investigations_translations, '{}'::jsonb) || COALESCE(p_investigations_translations, '{}'::jsonb),
      e_prescription = COALESCE(NULLIF(p_e_prescription, ''), e_prescription),
      e_prescription_translations = COALESCE(e_prescription_translations, '{}'::jsonb) || COALESCE(p_e_prescription_translations, '{}'::jsonb),
      updated_at = now()
    WHERE patient_id = p_patient_id;
  ELSE
    INSERT INTO public.patient_folders (
      patient_id,
      patient_type,
      medical_history,
      medical_history_translations,
      allergies,
      allergies_translations,
      current_medications,
      previous_diagnoses,
      presenting_complaint,
      presenting_complaint_translations,
      history_of_presenting_complaint,
      history_of_presenting_complaint_translations,
      past_medical_history,
      past_medical_history_translations,
      past_drug_history,
      past_drug_history_translations,
      family_social_history,
      family_social_history_translations,
      clinical_examination,
      clinical_examination_translations,
      assessment,
      assessment_translations,
      treatment_plan,
      treatment_plan_translations,
      investigations,
      investigations_translations,
      e_prescription,
      e_prescription_translations,
      created_at,
      updated_at
    )
    VALUES (
      p_patient_id,
      'returning',
      COALESCE(NULLIF(p_past_medical_history, ''), p_note_text),
      COALESCE(p_medical_history_translations, '{}'::jsonb),
      NULLIF(p_allergies, ''),
      COALESCE(p_allergies_translations, '{}'::jsonb),
      NULLIF(p_e_prescription, ''),
      NULLIF(p_assessment, ''),
      NULLIF(p_presenting_complaint, ''),
      COALESCE(p_presenting_complaint_translations, '{}'::jsonb),
      NULLIF(p_history_of_presenting_complaint, ''),
      COALESCE(p_history_of_presenting_complaint_translations, '{}'::jsonb),
      NULLIF(p_past_medical_history, ''),
      COALESCE(p_past_medical_history_translations, '{}'::jsonb),
      NULLIF(p_past_drug_history, ''),
      COALESCE(p_past_drug_history_translations, '{}'::jsonb),
      NULLIF(p_family_social_history, ''),
      COALESCE(p_family_social_history_translations, '{}'::jsonb),
      NULLIF(p_clinical_examination, ''),
      COALESCE(p_clinical_examination_translations, '{}'::jsonb),
      NULLIF(p_assessment, ''),
      COALESCE(p_assessment_translations, '{}'::jsonb),
      NULLIF(p_treatment_plan, ''),
      COALESCE(p_treatment_plan_translations, '{}'::jsonb),
      NULLIF(p_investigations, ''),
      COALESCE(p_investigations_translations, '{}'::jsonb),
      NULLIF(p_e_prescription, ''),
      COALESCE(p_e_prescription_translations, '{}'::jsonb),
      now(),
      now()
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_append_to_patient_folder(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated;

COMMIT;
