-- 20260828000000_add_multitenancy_foundation.sql
-- Phase 1: Add multi-tenancy foundation.
--
-- This migration introduces the organisation model while preserving
-- all existing MyE-Doctor data, workflows, and access patterns.
--
-- SAFETY: All changes are additive. No existing data is deleted.
-- Existing users, appointments, payments, doctors, patients, pricing,
-- wallets, and consultation data continue working unchanged.

-- =========================================================================
-- SECTION 1: Core Organisation Tables
-- =========================================================================

-- 1a. organisations: top-level tenant entity
CREATE TABLE IF NOT EXISTS public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  country_code TEXT DEFAULT 'NG',
  currency TEXT DEFAULT 'NGN',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organisations_slug ON public.organisations(slug);
CREATE INDEX IF NOT EXISTS idx_organisations_active ON public.organisations(active);

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- 1b. organisation_members: maps users to organisations with scoped roles
CREATE TABLE IF NOT EXISTS public.organisation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('org_admin', 'org_member', 'org_doctor', 'org_patient')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organisation_members(organisation_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organisation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON public.organisation_members(organisation_id, user_id);

ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- SECTION 2: Organisation-Aware Helper Functions
-- =========================================================================

-- 2a. Check if user is a member of a specific organisation
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_members om
    WHERE om.organisation_id = p_org_id
      AND om.user_id = p_user_id
      AND om.active = true
  );
$$;

-- 2b. Check if user is an admin of a specific organisation
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_members om
    WHERE om.organisation_id = p_org_id
      AND om.user_id = p_user_id
      AND om.role = 'org_admin'
      AND om.active = true
  );
$$;

-- 2c. Check if user is platform superadmin
CREATE OR REPLACE FUNCTION public.is_platform_superadmin(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = p_uid
      AND lower(COALESCE(pr.role, '')) = 'platform_superadmin'
  );
$$;

-- 2d. Get all organisation IDs a user belongs to
CREATE OR REPLACE FUNCTION public.get_user_org_ids(p_user_id UUID DEFAULT auth.uid())
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organisation_id
  FROM public.organisation_members om
  WHERE om.user_id = p_user_id
    AND om.active = true;
$$;

-- 2e. get_appointment_org_id is created in Section 3k (after column additions)

-- =========================================================================
-- SECTION 3: Add organisation_id to Tables That Need Direct Ownership
-- =========================================================================

-- 3a. doctors: each doctor belongs to one organisation
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

CREATE INDEX IF NOT EXISTS idx_doctors_org ON public.doctors(organisation_id);

-- 3b. doctor_registrations: doctor signup is org-scoped
ALTER TABLE public.doctor_registrations
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

CREATE INDEX IF NOT EXISTS idx_doctor_registrations_org ON public.doctor_registrations(organisation_id);

-- 3c. appointments: appointments are org-scoped through the doctor
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

CREATE INDEX IF NOT EXISTS idx_appointments_org ON public.appointments(organisation_id);

-- 3d. pricing_profiles: pricing is per-org
ALTER TABLE public.pricing_profiles
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

CREATE INDEX IF NOT EXISTS idx_pricing_profiles_org ON public.pricing_profiles(organisation_id);

-- 3e. consultation_types: consultation types are per-org
ALTER TABLE public.consultation_types
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- 3f. doctor_tiers: tiers are per-org
ALTER TABLE public.doctor_tiers
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- 3g. platform_fee_rules: fee rules are per-org
ALTER TABLE public.platform_fee_rules
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- 3h. doctor_wallet: wallet is per-doctor (already has doctor_id FK)
-- No org_id needed — derived through doctors table.

-- 3i. consultation_sessions: derived through appointments
-- No org_id needed — derived through appointments table.

-- 3j. payments: derived through appointments
-- No org_id needed — derived through appointments table.

-- 3k. Create the get_appointment_org_id function (now that doctors.organisation_id exists)
CREATE OR REPLACE FUNCTION public.get_appointment_org_id(p_appointment_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.organisation_id
  FROM public.appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  WHERE a.id = p_appointment_id;
$$;

-- =========================================================================
-- SECTION 4: Organisation RLS Policies
-- =========================================================================

-- 4a. organisations: everyone can read (for discovery), only superadmins create
DROP POLICY IF EXISTS organisations_read ON public.organisations;
CREATE POLICY organisations_read
  ON public.organisations
  FOR SELECT
  TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS organisations_superadmin_manage ON public.organisations;
CREATE POLICY organisations_superadmin_manage
  ON public.organisations
  FOR ALL
  TO authenticated
  USING (public.is_platform_superadmin(auth.uid()))
  WITH CHECK (public.is_platform_superadmin(auth.uid()));

-- 4b. organisation_members: users can see their own memberships;
--     org admins can manage their org's members; superadmins see all
DROP POLICY IF EXISTS org_members_own_read ON public.organisation_members;
CREATE POLICY org_members_own_read
  ON public.organisation_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS org_members_admin_manage ON public.organisation_members;
CREATE POLICY org_members_admin_manage
  ON public.organisation_members
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

-- =========================================================================
-- SECTION 5: Create Default MyE-Doctor Organisation
-- =========================================================================

-- 5a. Create the default MyE-Doctor organisation
INSERT INTO public.organisations (name, slug, description, contact_email, country_code, currency)
VALUES (
  'MyE-Doctor',
  'myedoctor',
  'MyE-Doctor telemedicine platform — the original and default organisation.',
  'myedoctoronline@gmail.com',
  'NG',
  'NGN'
)
ON CONFLICT (slug) DO NOTHING;

-- 5b. Get the MyE-Doctor org ID for use in subsequent statements
DO $$
DECLARE
  v_myedoctor_org_id UUID;
BEGIN
  SELECT id INTO v_myedoctor_org_id
  FROM public.organisations
  WHERE slug = 'myedoctor';

  -- Backfill doctors table
  UPDATE public.doctors
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill doctor_registrations table
  UPDATE public.doctor_registrations
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill appointments table (derived from doctor's org)
  UPDATE public.appointments a
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill pricing_profiles
  UPDATE public.pricing_profiles
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill consultation_types
  UPDATE public.consultation_types
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill doctor_tiers
  UPDATE public.doctor_tiers
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill platform_fee_rules
  UPDATE public.platform_fee_rules
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Create organisation memberships for existing admin users
  -- Admin users get org_admin role in MyE-Doctor
  INSERT INTO public.organisation_members (organisation_id, user_id, role)
  SELECT v_myedoctor_org_id, au.id, 'org_admin'
  FROM auth.users au
  WHERE lower(COALESCE(au.raw_user_meta_data ->> 'role', '')) IN ('admin', 'coo')
  ON CONFLICT (organisation_id, user_id, role) DO NOTHING;

  -- COO users also get org_admin
  -- (already handled above since both admin and coo are included)

  -- Doctor users get org_doctor role
  INSERT INTO public.organisation_members (organisation_id, user_id, role)
  SELECT v_myedoctor_org_id, d.id, 'org_doctor'
  FROM public.doctors d
  WHERE d.organisation_id = v_myedoctor_org_id
  ON CONFLICT (organisation_id, user_id, role) DO NOTHING;

  -- Patient users get org_patient role (from patient_registrations)
  INSERT INTO public.organisation_members (organisation_id, user_id, role)
  SELECT v_myedoctor_org_id, pr.user_id, 'org_patient'
  FROM public.patient_registrations pr
  ON CONFLICT (organisation_id, user_id, role) DO NOTHING;

END $$;

-- =========================================================================
-- SECTION 6: Organisation-Scoped RLS for Core Tables
-- =========================================================================

-- NOTE: These policies are ADDITIVE. Existing user-scoped policies remain.
-- This ensures backward compatibility — existing queries still work.

-- 6a. doctors: org members can read doctors in their org
--     (existing policies still apply for direct access)
DROP POLICY IF EXISTS doctors_org_read ON public.doctors;
CREATE POLICY doctors_org_read
  ON public.doctors
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IS NULL  -- backward compat: unassigned doctors visible
    OR public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- 6b. appointments: org members can see appointments in their org
DROP POLICY IF EXISTS appointments_org_read ON public.appointments;
CREATE POLICY appointments_org_read
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IS NULL  -- backward compat: unassigned appointments visible
    OR public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- 6c. pricing_profiles: org members can read pricing in their org
DROP POLICY IF EXISTS pricing_profiles_org_read ON public.pricing_profiles;
CREATE POLICY pricing_profiles_org_read
  ON public.pricing_profiles
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IS NULL
    OR public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- =========================================================================
-- SECTION 7: Add platform_superadmin Role Support
-- =========================================================================

-- 7a. Update is_admin_or_coo() to also recognize platform_superadmin
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

  -- Platform superadmins have full admin access
  IF v_role IN ('admin', 'coo', 'platform_superadmin') THEN
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
        AND pr.role IN ('admin', 'coo', 'platform_superadmin')
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
        AND lower(COALESCE(p.role, '')) IN ('admin', 'coo', 'platform_superadmin')
    ) INTO v_is_admin;
    IF v_is_admin THEN
      RETURN true;
    END IF;
  END IF;

  -- Email allowlist fallback
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

-- 7b. Update the profiles role check constraint to include new roles
--     (safe: existing role values remain valid)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'patient', 'doctor', 'admin', 'coo', 'healthlink',
    'platform_superadmin', 'organisation_admin'
  ]));

-- 7b. Revoke anon EXECUTE on organisation helper functions (security)
REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_platform_superadmin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_org_ids(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_appointment_org_id(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointment_org_id(UUID) TO authenticated;

-- =========================================================================
-- SECTION 8: updated_at Triggers for New Tables
-- =========================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_organisations_updated_at ON public.organisations;
CREATE TRIGGER set_organisations_updated_at
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_org_members_updated_at ON public.organisation_members;
CREATE TRIGGER set_org_members_updated_at
  BEFORE UPDATE ON public.organisation_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
