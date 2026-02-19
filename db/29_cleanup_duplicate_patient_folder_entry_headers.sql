-- One-time cleanup: normalize duplicated doctor entry headers in stored text fields.
-- This fixes legacy data where lines inside one clerking note were stored with
-- repeated "--- Entry: ... by doctor:..." headers.

BEGIN;

CREATE OR REPLACE FUNCTION public._normalize_doctor_entry_headers(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  line TEXT;
  normalized_lines TEXT[] := ARRAY[]::TEXT[];
  prev_header TEXT := NULL;
  trimmed TEXT;
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN p_input;
  END IF;

  FOR line IN
    SELECT * FROM regexp_split_to_table(p_input, E'\\r?\\n')
  LOOP
    trimmed := regexp_replace(line, E'\\s+$', '');

    -- skip fully blank lines
    IF btrim(trimmed) = '' THEN
      CONTINUE;
    END IF;

    -- collapse consecutive duplicate entry headers
    IF trimmed ~ '^---\\s*Entry:\\s*.+\\s+by doctor:[0-9a-fA-F-]{36}\\s*$' THEN
      IF prev_header = trimmed THEN
        CONTINUE;
      END IF;
      prev_header := trimmed;
    END IF;

    normalized_lines := array_append(normalized_lines, trimmed);
  END LOOP;

  RETURN array_to_string(normalized_lines, E'\n');
END;
$$;

-- patient_folders cleanup
UPDATE public.patient_folders
SET
  medical_history = public._normalize_doctor_entry_headers(medical_history),
  presenting_complaint = public._normalize_doctor_entry_headers(presenting_complaint),
  history_of_presenting_complaint = public._normalize_doctor_entry_headers(history_of_presenting_complaint),
  past_medical_history = public._normalize_doctor_entry_headers(past_medical_history),
  past_drug_history = public._normalize_doctor_entry_headers(past_drug_history),
  allergies = public._normalize_doctor_entry_headers(allergies),
  family_social_history = public._normalize_doctor_entry_headers(family_social_history),
  clinical_examination = public._normalize_doctor_entry_headers(clinical_examination),
  assessment = public._normalize_doctor_entry_headers(assessment),
  treatment_plan = public._normalize_doctor_entry_headers(treatment_plan),
  investigations = public._normalize_doctor_entry_headers(investigations),
  e_prescription = public._normalize_doctor_entry_headers(e_prescription),
  current_medications = public._normalize_doctor_entry_headers(current_medications),
  previous_diagnoses = public._normalize_doctor_entry_headers(previous_diagnoses),
  updated_at = now()
WHERE
  medical_history IS NOT NULL
  OR presenting_complaint IS NOT NULL
  OR history_of_presenting_complaint IS NOT NULL
  OR past_medical_history IS NOT NULL
  OR past_drug_history IS NOT NULL
  OR allergies IS NOT NULL
  OR family_social_history IS NOT NULL
  OR clinical_examination IS NOT NULL
  OR assessment IS NOT NULL
  OR treatment_plan IS NOT NULL
  OR investigations IS NOT NULL
  OR e_prescription IS NOT NULL
  OR current_medications IS NOT NULL
  OR previous_diagnoses IS NOT NULL;

-- doctor consultation notes cleanup
UPDATE public.doctor_consultation_notes
SET
  follow_up_notes = public._normalize_doctor_entry_headers(follow_up_notes),
  diagnosis = public._normalize_doctor_entry_headers(diagnosis),
  treatment_plan = public._normalize_doctor_entry_headers(treatment_plan),
  prescriptions = public._normalize_doctor_entry_headers(prescriptions),
  updated_at = now()
WHERE
  follow_up_notes IS NOT NULL
  OR diagnosis IS NOT NULL
  OR treatment_plan IS NOT NULL
  OR prescriptions IS NOT NULL;

DROP FUNCTION public._normalize_doctor_entry_headers(TEXT);

COMMIT;

