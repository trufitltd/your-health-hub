-- RPC: Append doctor's notes to a patient's folder
-- Call this as the doctor (authenticated user). The function verifies the caller is the doctor
-- for an existing consultation session with the patient before modifying patient_folders.

CREATE OR REPLACE FUNCTION public.doctor_append_to_patient_folder(
  p_patient_id UUID,
  p_note_text TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller uuid := auth.uid()::uuid;
  exists_relation int;
  existing_medical_history TEXT;
BEGIN
  -- Verify caller is a doctor on a consultation session with this patient
  SELECT 1 INTO exists_relation FROM public.consultation_sessions cs
  WHERE cs.patient_id = p_patient_id AND cs.doctor_id = caller LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: caller is not the assigned doctor for this patient';
  END IF;

  -- Fetch existing folder
  SELECT medical_history INTO existing_medical_history FROM public.patient_folders pf
  WHERE pf.patient_id = p_patient_id LIMIT 1;

  IF FOUND THEN
    -- Append new note with timestamp and doctor id
    UPDATE public.patient_folders
    SET medical_history = COALESCE(medical_history, '') || '

--- Entry: ' || now()::text || ' by doctor:' || caller::text || '
' || p_note_text,
        updated_at = now()
    WHERE patient_id = p_patient_id;
  ELSE
    -- Create new folder with the note
    INSERT INTO public.patient_folders (patient_id, patient_type, medical_history, created_at, updated_at)
    VALUES (p_patient_id, 'returning', p_note_text, now(), now());
  END IF;
END;
$$;

-- Grant execute to authenticated users (doctors) if desired
-- GRANT EXECUTE ON FUNCTION public.doctor_append_to_patient_folder(UUID, TEXT) TO authenticated;
