-- 20260423101000_add_admin_list_patient_folders_rpc.sql
-- Admin RPC for listing patient folders with patient identity and notes summary.

DROP FUNCTION IF EXISTS public.admin_list_patient_folders(INTEGER, INTEGER);

CREATE FUNCTION public.admin_list_patient_folders(
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_email TEXT,
  patient_phone TEXT,
  patient_type TEXT,
  presenting_complaint TEXT,
  history_of_presenting_complaint TEXT,
  past_medical_history TEXT,
  past_drug_history TEXT,
  allergies TEXT,
  family_social_history TEXT,
  clinical_examination TEXT,
  assessment TEXT,
  treatment_plan TEXT,
  investigations TEXT,
  e_prescription TEXT,
  medical_history TEXT,
  current_medications TEXT,
  previous_diagnoses TEXT,
  notes_count INTEGER,
  latest_note_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  WITH note_summary AS (
    SELECT
      dcn.patient_id,
      COUNT(*)::INTEGER AS notes_count,
      MAX(dcn.created_at)::TIMESTAMPTZ AS latest_note_at
    FROM public.doctor_consultation_notes dcn
    WHERE dcn.patient_id IS NOT NULL
    GROUP BY dcn.patient_id
  ),
  folder_base AS (
    SELECT
      pf.id,
      pf.patient_id,
      pf.patient_type,
      pf.presenting_complaint,
      pf.history_of_presenting_complaint,
      pf.past_medical_history,
      pf.past_drug_history,
      pf.allergies,
      pf.family_social_history,
      pf.clinical_examination,
      pf.assessment,
      pf.treatment_plan,
      pf.investigations,
      pf.e_prescription,
      pf.medical_history,
      pf.current_medications,
      pf.previous_diagnoses,
      pf.created_at,
      pf.updated_at
    FROM public.patient_folders pf
    WHERE pf.patient_id IS NOT NULL
  ),
  patient_index AS (
    SELECT fb.patient_id FROM folder_base fb
    UNION
    SELECT ns.patient_id FROM note_summary ns
  )
  SELECT
    fb.id::UUID,
    pi.patient_id::UUID,
    pr.full_name::TEXT AS patient_name,
    pr.email::TEXT AS patient_email,
    pr.phone_number::TEXT AS patient_phone,
    fb.patient_type::TEXT,
    fb.presenting_complaint::TEXT,
    fb.history_of_presenting_complaint::TEXT,
    fb.past_medical_history::TEXT,
    fb.past_drug_history::TEXT,
    fb.allergies::TEXT,
    fb.family_social_history::TEXT,
    fb.clinical_examination::TEXT,
    fb.assessment::TEXT,
    fb.treatment_plan::TEXT,
    fb.investigations::TEXT,
    fb.e_prescription::TEXT,
    fb.medical_history::TEXT,
    fb.current_medications::TEXT,
    fb.previous_diagnoses::TEXT,
    COALESCE(ns.notes_count, 0)::INTEGER AS notes_count,
    ns.latest_note_at::TIMESTAMPTZ,
    fb.created_at::TIMESTAMPTZ,
    COALESCE(fb.updated_at, ns.latest_note_at, fb.created_at)::TIMESTAMPTZ AS updated_at
  FROM patient_index pi
  LEFT JOIN folder_base fb
    ON fb.patient_id = pi.patient_id
  LEFT JOIN note_summary ns
    ON ns.patient_id = pi.patient_id
  LEFT JOIN public.patient_registrations pr
    ON pr.user_id = pi.patient_id
  ORDER BY COALESCE(fb.updated_at, ns.latest_note_at, fb.created_at) DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_patient_folders(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_patient_folders(INTEGER, INTEGER) TO authenticated;
