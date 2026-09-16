-- 20260828100000_add_org_context_to_services.sql
-- Phase 2: Make core telemedicine services organisation-aware.
--
-- This migration:
-- 1. Adds organisation_id to remaining service tables
-- 2. Creates organisation_config for per-org branding/settings
-- 3. Creates helper function to derive org from doctor_id
-- 4. Adds RLS policies for newly org-scoped tables
-- 5. Seeds MyE-Doctor organisation_config with existing branding
--
-- SAFETY: All changes are additive. Existing data is backfilled.
-- MyE-Doctor workflow continues unchanged.

-- =========================================================================
-- SECTION 1: Add organisation_id to Remaining Service Tables
-- =========================================================================

-- 1a. doctor_wallet: isolate wallets per org
ALTER TABLE public.doctor_wallet
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

CREATE INDEX IF NOT EXISTS idx_doctor_wallet_org ON public.doctor_wallet(organisation_id);

-- 1b. doctor_wallet_transactions: isolate wallet transactions per org
ALTER TABLE public.doctor_wallet_transactions
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

CREATE INDEX IF NOT EXISTS idx_doctor_wallet_transactions_org ON public.doctor_wallet_transactions(organisation_id);

-- 1c. doctor_schedules: isolate schedules per org
ALTER TABLE public.doctor_schedules
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

CREATE INDEX IF NOT EXISTS idx_doctor_schedules_org ON public.doctor_schedules(organisation_id);

-- 1d. pricing_rules: isolate pricing rules per org (via pricing_profiles)
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- 1e. pricing_feature_flags: isolate feature flags per org
ALTER TABLE public.pricing_feature_flags
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- 1f. platform_fee_rules: isolate fee rules per org
--     (organisation_id already added in Phase 1 migration)

-- =========================================================================
-- SECTION 2: Organisation Configuration Table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.organisation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organisation_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_org_config_org ON public.organisation_config(organisation_id);

ALTER TABLE public.organisation_config ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read config, org admins can manage
DROP POLICY IF EXISTS org_config_read ON public.organisation_config;
CREATE POLICY org_config_read
  ON public.organisation_config
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS org_config_admin_manage ON public.organisation_config;
CREATE POLICY org_config_admin_manage
  ON public.organisation_config
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

DROP TRIGGER IF EXISTS set_org_config_updated_at ON public.organisation_config;
CREATE TRIGGER set_org_config_updated_at
  BEFORE UPDATE ON public.organisation_config
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =========================================================================
-- SECTION 3: Helper Function — Derive Org from Doctor
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_doctor_org_id(p_doctor_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.organisation_id
  FROM public.doctors d
  WHERE d.id = p_doctor_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_doctor_org_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_org_id(UUID) TO authenticated;

-- =========================================================================
-- SECTION 4: Backfill organisation_id for Newly Covered Tables
-- =========================================================================

DO $$
DECLARE
  v_myedoctor_org_id UUID;
BEGIN
  SELECT id INTO v_myedoctor_org_id
  FROM public.organisations
  WHERE slug = 'myedoctor';

  IF v_myedoctor_org_id IS NULL THEN
    RAISE EXCEPTION 'MyE-Doctor organisation not found. Run Phase 1 migration first.';
  END IF;

  -- Backfill doctor_wallet: derive from doctors table
  UPDATE public.doctor_wallet dw
  SET organisation_id = d.organisation_id
  FROM public.doctors d
  WHERE dw.doctor_id = d.id
    AND dw.organisation_id IS NULL
    AND d.organisation_id IS NOT NULL;

  -- Backfill remaining doctor_wallet rows with default org
  UPDATE public.doctor_wallet
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill doctor_wallet_transactions: derive from doctor_wallet
  UPDATE public.doctor_wallet_transactions dwt
  SET organisation_id = dw.organisation_id
  FROM public.doctor_wallet dw
  WHERE dwt.doctor_id = dw.doctor_id
    AND dwt.organisation_id IS NULL
    AND dw.organisation_id IS NOT NULL;

  -- Backfill remaining with default org
  UPDATE public.doctor_wallet_transactions
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill doctor_schedules: derive from doctors table
  UPDATE public.doctor_schedules ds
  SET organisation_id = d.organisation_id
  FROM public.doctors d
  WHERE ds.doctor_id = d.id
    AND ds.organisation_id IS NULL
    AND d.organisation_id IS NOT NULL;

  -- Backfill remaining with default org
  UPDATE public.doctor_schedules
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill pricing_rules: derive from pricing_profiles
  UPDATE public.pricing_rules pr
  SET organisation_id = pp.organisation_id
  FROM public.pricing_profiles pp
  WHERE pr.pricing_profile_id = pp.id
    AND pr.organisation_id IS NULL
    AND pp.organisation_id IS NOT NULL;

  -- Backfill remaining with default org
  UPDATE public.pricing_rules
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

  -- Backfill pricing_feature_flags with default org
  UPDATE public.pricing_feature_flags
  SET organisation_id = v_myedoctor_org_id
  WHERE organisation_id IS NULL;

END $$;

-- =========================================================================
-- SECTION 5: RLS Policies for Newly Org-Scoped Tables
-- =========================================================================

-- 5a. doctor_wallet: org members can read wallets in their org
DROP POLICY IF EXISTS doctor_wallet_org_read ON public.doctor_wallet;
CREATE POLICY doctor_wallet_org_read
  ON public.doctor_wallet
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IS NULL
    OR public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- 5b. doctor_wallet_transactions: org members can read transactions in their org
DROP POLICY IF EXISTS doctor_wallet_tx_org_read ON public.doctor_wallet_transactions;
CREATE POLICY doctor_wallet_tx_org_read
  ON public.doctor_wallet_transactions
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IS NULL
    OR public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- 5c. doctor_schedules: org members can read schedules in their org
DROP POLICY IF EXISTS doctor_schedules_org_read ON public.doctor_schedules;
CREATE POLICY doctor_schedules_org_read
  ON public.doctor_schedules
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IS NULL
    OR public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- 5d. pricing_rules: org members can read rules in their org
DROP POLICY IF EXISTS pricing_rules_org_read ON public.pricing_rules;
CREATE POLICY pricing_rules_org_read
  ON public.pricing_rules
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IS NULL
    OR public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- 5e. pricing_feature_flags: org members can read flags in their org
DROP POLICY IF EXISTS pricing_feature_flags_org_read ON public.pricing_feature_flags;
CREATE POLICY pricing_feature_flags_org_read
  ON public.pricing_feature_flags
  FOR SELECT
  TO authenticated
  USING (
    organisation_id IS NULL
    OR public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- =========================================================================
-- SECTION 6: Seed MyE-Doctor Organisation Config
-- =========================================================================

INSERT INTO public.organisation_config (organisation_id, config_key, config_value)
SELECT o.id, 'brand_name', 'MyEDoctor'
FROM public.organisations o WHERE o.slug = 'myedoctor'
ON CONFLICT (organisation_id, config_key) DO NOTHING;

INSERT INTO public.organisation_config (organisation_id, config_key, config_value)
SELECT o.id, 'brand_email', 'myedoctoronline@gmail.com'
FROM public.organisations o WHERE o.slug = 'myedoctor'
ON CONFLICT (organisation_id, config_key) DO NOTHING;

INSERT INTO public.organisation_config (organisation_id, config_key, config_value)
SELECT o.id, 'support_email', 'myedoctoronline@gmail.com'
FROM public.organisations o WHERE o.slug = 'myedoctor'
ON CONFLICT (organisation_id, config_key) DO NOTHING;

INSERT INTO public.organisation_config (organisation_id, config_key, config_value)
SELECT o.id, 'sms_signature', 'MyEDoctor'
FROM public.organisations o WHERE o.slug = 'myedoctor'
ON CONFLICT (organisation_id, config_key) DO NOTHING;

INSERT INTO public.organisation_config (organisation_id, config_key, config_value)
SELECT o.id, 'vapid_subject', 'mailto:myedoctoronline@gmail.com'
FROM public.organisations o WHERE o.slug = 'myedoctor'
ON CONFLICT (organisation_id, config_key) DO NOTHING;
