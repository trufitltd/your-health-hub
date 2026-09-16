-- 20260827000000_fix_critical_security_vulnerabilities.sql
-- Phase 0: Fix critical security vulnerabilities identified in architecture audit.
--
-- Fixes:
-- 1. admin_delete_appointment: add server-side is_admin_or_coo() check
-- 2. coo_messages: restrict SELECT to COO/admin and thread participants
-- 3. Pricing tables: restrict writes to admin/COO only
-- 4. doctor_registrations / patient_registrations: drop USING (true) re-introduced by db/ scripts
-- 5. sms_logs: restrict doctor SELECT to their own patients only
-- 6. Admin RPC functions: add is_admin_or_coo() authorization checks

-- ---------------------------------------------------------------------------
-- 1. Harden admin_delete_appointment with server-side authorization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_appointment(p_appointment_id UUID)
RETURNS void
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
    RAISE EXCEPTION 'Forbidden: admin or COO role required';
  END IF;

  DELETE FROM public.appointments WHERE id = p_appointment_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Fix coo_messages RLS: restrict SELECT to COO/admin and thread participants
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS coo_messages_select ON public.coo_messages;
DROP POLICY IF EXISTS "coo_messages_select" ON public.coo_messages;

CREATE POLICY coo_messages_select
  ON public.coo_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_coo(auth.uid())
    OR
    (
      sender_id = auth.uid()
      OR thread_id = auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Revoke public EXECUTE on admin_delete_appointment
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_delete_appointment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_appointment(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fix pricing table RLS: restrict mutation to admin/COO only
-- ---------------------------------------------------------------------------

-- 4a. pricing_profiles
DROP POLICY IF EXISTS pricing_profiles_admin_manage ON public.pricing_profiles;
DROP POLICY IF EXISTS "Authenticated users can manage pricing_profiles" ON public.pricing_profiles;
CREATE POLICY pricing_profiles_admin_manage
  ON public.pricing_profiles
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()))
  WITH CHECK (public.is_admin_or_coo(auth.uid()));

-- 4b. pricing_rules
DROP POLICY IF EXISTS pricing_rules_admin_manage ON public.pricing_rules;
DROP POLICY IF EXISTS "Authenticated users can manage pricing_rules" ON public.pricing_rules;
CREATE POLICY pricing_rules_admin_manage
  ON public.pricing_rules
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()))
  WITH CHECK (public.is_admin_or_coo(auth.uid()));

-- 4c. pricing_feature_flags
DROP POLICY IF EXISTS pricing_feature_flags_admin_manage ON public.pricing_feature_flags;
DROP POLICY IF EXISTS "Authenticated users can manage pricing_feature_flags" ON public.pricing_feature_flags;
CREATE POLICY pricing_feature_flags_admin_manage
  ON public.pricing_feature_flags
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()))
  WITH CHECK (public.is_admin_or_coo(auth.uid()));

-- 4d. consultation_types
DROP POLICY IF EXISTS consultation_types_admin_manage ON public.consultation_types;
DROP POLICY IF EXISTS "Authenticated users can manage consultation_types" ON public.consultation_types;
CREATE POLICY consultation_types_admin_manage
  ON public.consultation_types
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()))
  WITH CHECK (public.is_admin_or_coo(auth.uid()));

-- 4e. doctor_tiers
DROP POLICY IF EXISTS doctor_tiers_admin_manage ON public.doctor_tiers;
DROP POLICY IF EXISTS "Authenticated users can manage doctor_tiers" ON public.doctor_tiers;
CREATE POLICY doctor_tiers_admin_manage
  ON public.doctor_tiers
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()))
  WITH CHECK (public.is_admin_or_coo(auth.uid()));

-- 4f. platform_fee_rules
DROP POLICY IF EXISTS platform_fee_rules_admin_manage ON public.platform_fee_rules;
DROP POLICY IF EXISTS "Authenticated users can manage platform_fee_rules" ON public.platform_fee_rules;
CREATE POLICY platform_fee_rules_admin_manage
  ON public.platform_fee_rules
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_coo(auth.uid()))
  WITH CHECK (public.is_admin_or_coo(auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Drop USING (true) policies re-introduced by db/ scripts
--    These undo the hardening migration (20260424103000) which dropped them.
-- ---------------------------------------------------------------------------

-- 5a. doctor_registrations: drop public read, keep admin/COO read + owner policies
DROP POLICY IF EXISTS "Allow public read access to doctor registrations" ON public.doctor_registrations;
REVOKE SELECT ON public.doctor_registrations FROM anon;

-- 5b. patient_registrations: drop public read, keep admin/COO read + owner policies
DROP POLICY IF EXISTS "Allow public read access to patient registrations" ON public.patient_registrations;
REVOKE SELECT ON public.patient_registrations FROM anon;

-- ---------------------------------------------------------------------------
-- 6. Fix sms_logs: restrict doctor SELECT to their own patients only
--    Old policy allowed ANY approved doctor to read ALL SMS logs.
--    New policy requires the doctor to have an appointment with the patient
--    whose phone number appears in the SMS log.
--    NOTE: Table may not exist if db/12_create_sms_logs.sql was never run.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sms_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Doctors can view patient SMS logs" ON public.sms_logs;
    DROP POLICY IF EXISTS sms_logs_doctor_patient_read ON public.sms_logs;

    CREATE POLICY sms_logs_doctor_patient_read
      ON public.sms_logs
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.appointments a
          WHERE a.doctor_id = auth.uid()
            AND a.patient_id IN (
              SELECT p.id FROM public.profiles p
              WHERE p.phone = public.sms_logs.phone_number
            )
        )
        OR sent_by = auth.uid()
        OR public.is_admin_or_coo(auth.uid())
      );

    DROP POLICY IF EXISTS "Users can insert SMS logs" ON public.sms_logs;
    DROP POLICY IF EXISTS sms_logs_insert ON public.sms_logs;

    CREATE POLICY sms_logs_insert
      ON public.sms_logs
      FOR INSERT
      TO authenticated
      WITH CHECK (
        sent_by = auth.uid()
        OR public.is_admin_or_coo(auth.uid())
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Harden admin RPC functions: add is_admin_or_coo() checks
-- ---------------------------------------------------------------------------

-- 7a. get_incomplete_patient_profiles: was callable by any authenticated user
CREATE OR REPLACE FUNCTION public.get_incomplete_patient_profiles()
RETURNS TABLE (id uuid, full_name text)
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
    RAISE EXCEPTION 'Forbidden: admin or COO role required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.role = 'patient'
    AND NOT EXISTS (
      SELECT 1 FROM public.patient_registrations pr
      WHERE pr.user_id = p.id
    );
END;
$$;

-- 7b. admin_request_doctor_license_reupload: was callable by any authenticated user
CREATE OR REPLACE FUNCTION public.admin_request_doctor_license_reupload(
  p_user_id UUID,
  p_reupload_reason TEXT DEFAULT NULL
)
RETURNS void
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
    RAISE EXCEPTION 'Forbidden: admin or COO role required';
  END IF;

  UPDATE public.doctor_registrations
  SET
    medical_license_reupload_required = true,
    medical_license_reupload_reason = COALESCE(p_reupload_reason, 'Please re-upload your medical license.'),
    medical_license_reupload_requested_at = now(),
    verification_status = 'pending'
  WHERE user_id = p_user_id;
END;
$$;

-- 7c. admin_update_doctor_registration: was callable by any authenticated user
CREATE OR REPLACE FUNCTION public.admin_update_doctor_registration(
  p_user_id UUID,
  p_verification_status TEXT,
  p_verification_notes TEXT,
  p_verified_at TIMESTAMPTZ
)
RETURNS void
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
    RAISE EXCEPTION 'Forbidden: admin or COO role required';
  END IF;

  UPDATE public.doctor_registrations
  SET verification_status = p_verification_status,
      verification_notes = p_verification_notes,
      verified_at = p_verified_at,
      medical_license_reupload_required = false
  WHERE user_id = p_user_id;
END;
$$;

-- 7d. admin_mark_license_reupload_seen: was callable by any authenticated user
CREATE OR REPLACE FUNCTION public.admin_mark_license_reupload_seen(p_user_id UUID)
RETURNS void
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
    RAISE EXCEPTION 'Forbidden: admin or COO role required';
  END IF;

  UPDATE public.doctor_registrations
  SET medical_license_reupload_seen = true
  WHERE user_id = p_user_id;
END;
$$;
