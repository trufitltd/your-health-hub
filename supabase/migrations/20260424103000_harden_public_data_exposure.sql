-- 20260424103000_harden_public_data_exposure.sql
-- Hardening pass:
-- 1) Remove broad public-read policies that expose sensitive datasets.
-- 2) Add explicit admin/coo gated read path for admin portals.
-- 3) Provide safe public discovery RPCs (limited columns only).
-- 4) Require admin/coo authorization inside admin listing RPCs.

-- ---------------------------------------------------------------------------
-- Admin authorization helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_or_coo(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid UUID := p_uid;
  v_role TEXT := lower(
    COALESCE(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      ''
    )
  );
  v_email TEXT := lower(
    trim(
      COALESCE(
        auth.jwt() ->> 'email',
        auth.jwt() -> 'user_metadata' ->> 'email',
        auth.jwt() -> 'app_metadata' ->> 'email',
        ''
      )
    )
  );
  v_is_admin BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF v_role IN ('admin', 'coo') THEN
    RETURN true;
  END IF;

  IF to_regclass('public.admin_users') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.user_id = v_uid
    ) INTO v_is_admin;
    IF v_is_admin THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.profile_roles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.profile_roles pr
      WHERE pr.user_id = v_uid
        AND pr.role IN ('admin', 'coo')
    ) INTO v_is_admin;
    IF v_is_admin THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_uid
        AND lower(COALESCE(p.role, '')) IN ('admin', 'coo')
    ) INTO v_is_admin;
    IF v_is_admin THEN
      RETURN true;
    END IF;
  END IF;

  -- Email allowlist fallback: mirrors current frontend .env gating
  -- (VITE_ADMIN_EMAILS and VITE_COO_EMAILS). Keep this list in sync manually.
  IF v_email <> '' THEN
    RETURN v_email = ANY (ARRAY[
      'tj@gmail.com',
      'myedoctoronline@gmail.com',
      'ramadan@gmail.com',
      'ibtisama.ramadan@gmail.com',
      'aliyuammar@gmail.com'
    ]);
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_coo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_coo(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Remove unsafe public-read policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access to appointments" ON public.appointments;
DROP POLICY IF EXISTS "Allow public read access to doctor registrations" ON public.doctor_registrations;
DROP POLICY IF EXISTS "Allow public read access to patient registrations" ON public.patient_registrations;
DROP POLICY IF EXISTS "Admin can read all appointments" ON public.appointments;

-- ---------------------------------------------------------------------------
-- Add safe admin/coo read policies for direct admin dashboards
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS appointments_admin_coo_read ON public.appointments;
CREATE POLICY appointments_admin_coo_read
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()));

DROP POLICY IF EXISTS doctor_registrations_admin_coo_read ON public.doctor_registrations;
CREATE POLICY doctor_registrations_admin_coo_read
  ON public.doctor_registrations
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()));

DROP POLICY IF EXISTS patient_registrations_admin_coo_read ON public.patient_registrations;
CREATE POLICY patient_registrations_admin_coo_read
  ON public.patient_registrations
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()));

-- ---------------------------------------------------------------------------
-- Safe public discovery RPC: approved doctors with aggregated ratings only
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_public_doctors(INTEGER, INTEGER);
CREATE FUNCTION public.list_public_doctors(
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  user_id UUID,
  full_name TEXT,
  specialty TEXT,
  rate_per_consultation NUMERIC,
  hospital_affiliation TEXT,
  profile_picture_url TEXT,
  city TEXT,
  state TEXT,
  bio TEXT,
  experience TEXT,
  preferred_consultation_languages TEXT[],
  bio_translations JSONB,
  rating NUMERIC,
  total_reviews INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rating_summary AS (
    SELECT
      a.doctor_id,
      ROUND(AVG(a.rating)::NUMERIC, 2) AS rating,
      COUNT(*)::INTEGER AS total_reviews
    FROM public.appointments a
    WHERE a.rating IS NOT NULL
      AND a.doctor_id IS NOT NULL
    GROUP BY a.doctor_id
  )
  SELECT
    dr.user_id::UUID,
    dr.full_name::TEXT,
    dr.specialty::TEXT,
    dr.rate_per_consultation::NUMERIC,
    dr.hospital_affiliation::TEXT,
    dr.profile_picture_url::TEXT,
    dr.city::TEXT,
    dr.state::TEXT,
    dr.bio::TEXT,
    dr.experience::TEXT,
    ARRAY[]::TEXT[] AS preferred_consultation_languages,
    '{}'::JSONB AS bio_translations,
    COALESCE(rs.rating, 0)::NUMERIC AS rating,
    COALESCE(rs.total_reviews, 0)::INTEGER AS total_reviews
  FROM public.doctor_registrations dr
  LEFT JOIN rating_summary rs
    ON rs.doctor_id = dr.user_id
  WHERE dr.user_id IS NOT NULL
    AND dr.verification_status = 'approved'
    AND NULLIF(trim(COALESCE(dr.medical_license_url, '')), '') IS NOT NULL
    AND lower(trim(COALESCE(dr.full_name, ''))) <> 'test doctor'
  ORDER BY dr.full_name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.list_public_doctors(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_doctors(INTEGER, INTEGER) TO anon, authenticated;

-- Safe public discovery RPC: booked slots (no patient identifiers)
DROP FUNCTION IF EXISTS public.public_list_doctor_booked_slots(UUID, DATE);
CREATE FUNCTION public.public_list_doctor_booked_slots(
  p_doctor_id UUID,
  p_date DATE
)
RETURNS TABLE(
  "time" TEXT,
  duration_minutes INTEGER,
  status TEXT,
  slot_locked_until TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.time::TEXT AS "time",
    a.duration_minutes::INTEGER,
    a.status::TEXT,
    a.slot_locked_until::TIMESTAMPTZ
  FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.date = p_date;
$$;

REVOKE ALL ON FUNCTION public.public_list_doctor_booked_slots(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_doctor_booked_slots(UUID, DATE) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Harden admin listing RPCs with explicit authorization checks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_payments(
  p_status TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  appointment_id UUID,
  patient_id UUID,
  amount NUMERIC,
  status TEXT,
  provider TEXT,
  payment_method TEXT,
  payment_reference TEXT,
  provider_reference TEXT,
  created_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status_filter TEXT := lower(trim(COALESCE(p_status, '')));
  v_provider_filter TEXT := lower(trim(COALESCE(p_provider, '')));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin_or_coo(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id::UUID,
    p.appointment_id::UUID,
    p.patient_id::UUID,
    p.amount::NUMERIC,
    p.status::TEXT,
    p.provider::TEXT,
    p.payment_method::TEXT,
    p.payment_reference::TEXT,
    p.provider_reference::TEXT,
    p.created_at::TIMESTAMPTZ,
    p.verified_at::TIMESTAMPTZ,
    p.metadata::JSONB
  FROM public.payments p
  WHERE
    (v_status_filter = '' OR v_status_filter = 'all' OR lower(COALESCE(p.status, '')) = v_status_filter)
    AND (
      v_provider_filter = ''
      OR v_provider_filter = 'all'
      OR lower(COALESCE(p.provider, p.payment_method, '')) = v_provider_filter
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_patient_wallet_transactions(
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  patient_id UUID,
  appointment_id UUID,
  amount NUMERIC,
  direction TEXT,
  transaction_type TEXT,
  status TEXT,
  narration TEXT,
  created_at TIMESTAMPTZ
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

  IF NOT public.is_admin_or_coo(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    t.id::UUID,
    t.patient_id::UUID,
    t.appointment_id::UUID,
    t.amount::NUMERIC,
    t.direction::TEXT,
    t.transaction_type::TEXT,
    t.status::TEXT,
    t.narration::TEXT,
    t.created_at::TIMESTAMPTZ
  FROM public.patient_wallet_transactions t
  ORDER BY t.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_patient_wallet_withdrawal_requests(
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_email TEXT,
  patient_phone TEXT,
  amount NUMERIC,
  status TEXT,
  narration TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  processed_by UUID,
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  admin_note TEXT,
  payout_reference TEXT,
  wallet_reversed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status_filter TEXT := lower(trim(COALESCE(p_status, '')));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin_or_coo(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    wr.id::UUID,
    wr.patient_id::UUID,
    pr.full_name::TEXT,
    pr.email::TEXT,
    pr.phone_number::TEXT,
    wr.amount::NUMERIC,
    wr.status::TEXT,
    wr.narration::TEXT,
    wr.created_at::TIMESTAMPTZ,
    wr.updated_at::TIMESTAMPTZ,
    wr.sla_due_at::TIMESTAMPTZ,
    wr.processed_by::UUID,
    wr.processed_at::TIMESTAMPTZ,
    wr.completed_at::TIMESTAMPTZ,
    wr.admin_note::TEXT,
    wr.payout_reference::TEXT,
    wr.wallet_reversed_at::TIMESTAMPTZ
  FROM public.patient_wallet_withdrawal_requests wr
  LEFT JOIN public.patient_registrations pr ON pr.user_id = wr.patient_id
  WHERE
    v_status_filter = ''
    OR v_status_filter = 'all'
    OR lower(COALESCE(wr.status, '')) = v_status_filter
  ORDER BY wr.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 2000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_patient_folders(
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
  uploaded_investigations_count INTEGER,
  latest_uploaded_investigation_at TIMESTAMPTZ,
  uploaded_investigations JSONB,
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

  IF NOT public.is_admin_or_coo(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
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
  upload_summary AS (
    SELECT
      hr.patient_id,
      COUNT(*)::INTEGER AS uploaded_investigations_count,
      MAX(hr.uploaded_at)::TIMESTAMPTZ AS latest_uploaded_investigation_at,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', hr.id,
            'file_name', hr.file_name,
            'file_url', hr.file_url,
            'file_type', hr.file_type,
            'file_size', hr.file_size,
            'uploaded_at', hr.uploaded_at,
            'notes', hr.notes
          )
          ORDER BY hr.uploaded_at DESC
        ),
        '[]'::JSONB
      ) AS uploaded_investigations
    FROM public.health_records hr
    WHERE hr.patient_id IS NOT NULL
    GROUP BY hr.patient_id
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
    UNION
    SELECT us.patient_id FROM upload_summary us
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
    COALESCE(us.uploaded_investigations_count, 0)::INTEGER AS uploaded_investigations_count,
    us.latest_uploaded_investigation_at::TIMESTAMPTZ,
    COALESCE(us.uploaded_investigations, '[]'::JSONB) AS uploaded_investigations,
    fb.created_at::TIMESTAMPTZ,
    COALESCE(
      fb.updated_at,
      us.latest_uploaded_investigation_at,
      ns.latest_note_at,
      fb.created_at
    )::TIMESTAMPTZ AS updated_at
  FROM patient_index pi
  LEFT JOIN folder_base fb
    ON fb.patient_id = pi.patient_id
  LEFT JOIN note_summary ns
    ON ns.patient_id = pi.patient_id
  LEFT JOIN upload_summary us
    ON us.patient_id = pi.patient_id
  LEFT JOIN public.patient_registrations pr
    ON pr.user_id = pi.patient_id
  ORDER BY COALESCE(fb.updated_at, us.latest_uploaded_investigation_at, ns.latest_note_at, fb.created_at) DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
