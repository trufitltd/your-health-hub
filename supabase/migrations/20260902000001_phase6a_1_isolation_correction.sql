-- 20260902000001_phase6a_1_isolation_correction.sql
-- Phase 6A.1: Commercial Isolation Correction
--
-- Fixes:
-- 1. Drop redundant encrypted_webhook_secret (Paystack uses same key for API + webhooks)
-- 2. Add callback_url for tenant-aware payment redirects
-- 3. Tighten RLS: only admins/superadmins can SELECT organisation_payment_providers

-- =========================================================================
-- SECTION 1: Drop encrypted_webhook_secret
-- =========================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organisation_payment_providers'
      AND column_name = 'encrypted_webhook_secret'
  ) THEN
    ALTER TABLE public.organisation_payment_providers
      DROP COLUMN encrypted_webhook_secret;
  END IF;
END
$$;

-- =========================================================================
-- SECTION 2: Add callback_url column
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organisation_payment_providers'
      AND column_name = 'callback_url'
  ) THEN
    ALTER TABLE public.organisation_payment_providers
      ADD COLUMN callback_url TEXT NOT NULL DEFAULT '';
  END IF;
END
$$;

-- =========================================================================
-- SECTION 3: Tighten RLS — restrict SELECT to admins and superadmins only
-- =========================================================================
-- The original policy allowed any org member to SELECT payment provider config.
-- This is too permissive — doctors/patients should not see payment credentials metadata.
-- Only org admins and platform superadmins should access this table.

DROP POLICY IF EXISTS org_payment_providers_read ON public.organisation_payment_providers;

CREATE POLICY org_payment_providers_read
  ON public.organisation_payment_providers
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- =========================================================================
-- SECTION 4: Update comments
-- =========================================================================

COMMENT ON COLUMN public.organisation_payment_providers.callback_url IS 'Tenant-specific payment callback/return URL. If empty, falls back to global PAYSTACK_CALLBACK_URL.';
COMMENT ON TABLE public.organisation_payment_providers IS 'Per-organisation payment provider configuration. Secrets are encrypted and only accessible via edge functions. SELECT restricted to org admins and platform superadmins.';
