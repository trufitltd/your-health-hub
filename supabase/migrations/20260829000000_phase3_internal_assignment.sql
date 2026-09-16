-- 20260829000000_phase3_internal_assignment.sql
-- Phase 3: Internal clinician assignment for multi-tenant organisations.
--
-- This migration:
-- 1. Creates organisation_services table for org-specific service offerings
-- 2. Adds booking config keys to organisation_config
-- 3. Adds 'pending_assignment' to appointment status constraint
-- 4. Adds 'service_type' as a pricing rule condition type
-- 5. Makes consultation_sessions.doctor_id nullable
-- 6. Updates get_appointment_org_id() to fallback to appointments.organisation_id
-- 7. Creates assign_clinician_queue table
-- 8. Seeds MyE-Doctor defaults
--
-- SAFETY: All changes are additive. Existing MyE-Doctor data and workflows unchanged.

-- =========================================================================
-- SECTION 1: Organisation Services Table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.organisation_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  default_duration_minutes INTEGER NOT NULL DEFAULT 30,
  consultation_mode TEXT NOT NULL DEFAULT 'video' CHECK (consultation_mode IN ('video', 'voice', 'chat')),
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_services_org ON public.organisation_services(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_services_active ON public.organisation_services(active);

ALTER TABLE public.organisation_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_services_read ON public.organisation_services;
CREATE POLICY org_services_read
  ON public.organisation_services
  FOR SELECT
  TO authenticated
  USING (
    active = true
    AND (
      organisation_id IS NULL
      OR public.is_org_member(organisation_id, auth.uid())
      OR public.is_platform_superadmin(auth.uid())
    )
  );

DROP POLICY IF EXISTS org_services_admin_manage ON public.organisation_services;
CREATE POLICY org_services_admin_manage
  ON public.organisation_services
  FOR ALL
  TO authenticated
  USING (
    public.is_org_admin(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

DROP TRIGGER IF EXISTS set_org_services_updated_at ON public.organisation_services;
CREATE TRIGGER set_org_services_updated_at
  BEFORE UPDATE ON public.organisation_services
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- =========================================================================
-- SECTION 2: Organisation Booking Config
-- =========================================================================

-- Add booking-related config keys to organisation_config
-- clinician_selection_mode: 'patient_select' (default) or 'internal_assign'
-- show_doctor_directory: 'true' or 'false'
-- show_ratings: 'true' or 'false'
-- show_reviews: 'true' or 'false'
-- enable_service_types: 'true' or 'false'

-- Seed MyE-Doctor defaults (backward compatible)
DO $$
DECLARE
  v_myedoctor_org_id UUID;
BEGIN
  SELECT id INTO v_myedoctor_org_id
  FROM public.organisations
  WHERE slug = 'myedoctor';

  IF v_myedoctor_org_id IS NOT NULL THEN
    INSERT INTO public.organisation_config (organisation_id, config_key, config_value)
    VALUES
      (v_myedoctor_org_id, 'clinician_selection_mode', 'patient_select'),
      (v_myedoctor_org_id, 'show_doctor_directory', 'true'),
      (v_myedoctor_org_id, 'show_ratings', 'true'),
      (v_myedoctor_org_id, 'show_reviews', 'true'),
      (v_myedoctor_org_id, 'enable_service_types', 'false')
    ON CONFLICT (organisation_id, config_key) DO NOTHING;
  END IF;
END $$;

-- =========================================================================
-- SECTION 3: Add 'pending_assignment' to Appointment Status
-- =========================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_status_marketplace_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      DROP CONSTRAINT appointments_status_marketplace_check;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_status_marketplace_check
      CHECK (
        status IS NULL
        OR status IN (
          'pending_payment',
          'pending_assignment',
          'pending_approval',
          'confirmed',
          'in_progress',
          'completed',
          'cancelled',
          'no_show'
        )
      );
END $$;

-- =========================================================================
-- SECTION 4: Add 'service_type' to Pricing Rules
-- =========================================================================

-- The pricing_rules.condition_type column is TEXT with no CHECK constraint,
-- so 'service_type' can be used without schema changes.
-- We just need to ensure the PricingService handles it.

-- =========================================================================
-- SECTION 5: Make consultation_sessions.doctor_id Nullable
-- =========================================================================

-- consultation_sessions.doctor_id is currently NOT NULL.
-- For internal-assignment flow, the session may be created before a doctor is assigned.
-- We alter it to allow NULL (doctor assigned later).

DO $$
BEGIN
  -- Check if doctor_id has a NOT NULL constraint
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.consultation_sessions'::regclass
      AND contype = 'n'
      AND conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.consultation_sessions'::regclass AND attname = 'doctor_id')
      ]
  ) THEN
    ALTER TABLE public.consultation_sessions
      ALTER COLUMN doctor_id DROP NOT NULL;
  END IF;
END $$;

-- =========================================================================
-- SECTION 6: Update get_appointment_org_id() to Fallback
-- =========================================================================

-- When doctor_id is NULL (internal assignment), fall back to appointments.organisation_id

CREATE OR REPLACE FUNCTION public.get_appointment_org_id(p_appointment_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    d.organisation_id,
    a.organisation_id
  )
  FROM public.appointments a
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE a.id = p_appointment_id;
$$;

-- =========================================================================
-- SECTION 7: Clinician Assignment Queue Table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.assign_clinician_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES public.organisations(id),
  service_name TEXT NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time TEXT NOT NULL,
  preferred_duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'failed')),
  assigned_doctor_id UUID NULL,
  assigned_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assign_queue_org ON public.assign_clinician_queue(organisation_id);
CREATE INDEX IF NOT EXISTS idx_assign_queue_status ON public.assign_clinician_queue(status);
CREATE INDEX IF NOT EXISTS idx_assign_queue_appointment ON public.assign_clinician_queue(appointment_id);

ALTER TABLE public.assign_clinician_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assign_queue_admin_read ON public.assign_clinician_queue;
CREATE POLICY assign_queue_admin_read
  ON public.assign_clinician_queue
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- Service role handles all inserts/updates via edge functions

-- =========================================================================
-- SECTION 8: Add 'service_type' Column to Appointments
-- =========================================================================

-- Stores the organisation service name/type for internal-assignment bookings
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_type TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_service_type ON public.appointments(service_type) WHERE service_type IS NOT NULL;

-- =========================================================================
-- SECTION 9: Function to Get Org Config Value
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_org_config(p_org_id UUID, p_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oc.config_value
  FROM public.organisation_config oc
  WHERE oc.organisation_id = p_org_id
    AND oc.config_key = p_key
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_org_config(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_config(UUID, TEXT) TO authenticated;

-- =========================================================================
-- SECTION 10: Org-Aware list_public_doctors RPC
-- =========================================================================

-- Add optional p_organisation_id parameter to filter doctors by org
-- When NULL, returns all doctors (backward compatible for MyE-Doctor)

DROP FUNCTION IF EXISTS public.list_public_doctors(INTEGER, INTEGER);

CREATE FUNCTION public.list_public_doctors(
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0,
  p_organisation_id UUID DEFAULT NULL
)
RETURNS TABLE(
  user_id UUID,
  full_name TEXT,
  specialty TEXT,
  rate_per_consultation NUMERIC,
  consultation_currency TEXT,
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
    COALESCE(NULLIF(trim(dr.consultation_currency), ''), 'NGN')::TEXT AS consultation_currency,
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
    AND (
      p_organisation_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.doctors d
        WHERE d.id = dr.user_id
          AND d.organisation_id = p_organisation_id
      )
    )
  ORDER BY dr.full_name
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.list_public_doctors(INTEGER, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_doctors(INTEGER, INTEGER, UUID) TO anon, authenticated;
