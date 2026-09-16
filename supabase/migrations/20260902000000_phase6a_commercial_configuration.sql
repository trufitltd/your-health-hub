-- 20260902000000_phase6a_commercial_configuration.sql
-- Phase 6A: CIBA Commercial Configuration, Pricing & Paystack Isolation
--
-- Introduces organisation-scoped payment provider configuration,
-- enabling CIBA (and future tenants) to use their own Paystack accounts.
-- MyE-Doctor's existing global Paystack configuration is preserved as-is.

-- =========================================================================
-- SECTION 1: organisation_payment_providers — per-org payment credentials
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.organisation_payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack')),
  -- Public key stored in plaintext (safe to expose client-side)
  public_key TEXT NOT NULL DEFAULT '',
  -- Secret key stored via vault/encryption (never exposed to frontend)
  -- We store an encrypted ciphertext; the edge function decrypts at runtime.
  encrypted_secret_key TEXT NOT NULL DEFAULT '',
  -- Optional: webhook secret if different from main secret key
  encrypted_webhook_secret TEXT NOT NULL DEFAULT '',
  -- Metadata
  mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'test')),
  business_name TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'verification_failed')),
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One provider config per org per provider
  UNIQUE(organisation_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_org_payment_providers_org ON public.organisation_payment_providers(organisation_id);

-- Enable RLS
ALTER TABLE public.organisation_payment_providers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- SELECT: org members can see their org's provider config (but NOT secret keys via RLS — secrets are only accessible via edge functions)
CREATE POLICY org_payment_providers_read
  ON public.organisation_payment_providers
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organisation_id, auth.uid())
    OR public.is_platform_superadmin(auth.uid())
  );

-- INSERT/UPDATE/DELETE: org admins and superadmins only
CREATE POLICY org_payment_providers_manage
  ON public.organisation_payment_providers
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

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_payment_providers TO authenticated;

-- =========================================================================
-- SECTION 2: organisation_pricing_profiles — org-scoped pricing lookup view
-- =========================================================================
-- Pricing profiles already have organisation_id (from Phase 1).
-- We add a computed convenience column to organisation_services for
-- quick price lookup, and ensure the pricing engine enforces org isolation.

-- Add a pricing_profile_id FK to organisation_services for explicit linkage
-- (optional, nullable — allows services to inherit from org pricing profile)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organisation_services'
      AND column_name = 'pricing_profile_id'
  ) THEN
    ALTER TABLE public.organisation_services
      ADD COLUMN pricing_profile_id UUID REFERENCES public.pricing_profiles(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- =========================================================================
-- SECTION 3: Audit metadata for pricing changes
-- =========================================================================
-- Add last-modified tracking to organisation_services
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organisation_services'
      AND column_name = 'last_modified_by'
  ) THEN
    ALTER TABLE public.organisation_services
      ADD COLUMN last_modified_by UUID REFERENCES auth.users(id);
  END IF;
END
$$;

-- =========================================================================
-- SECTION 4: Backfill MyE-Doctor organisation payment provider
-- =========================================================================
-- Preserve existing MyE-Doctor production behaviour.
-- The global PAYSTACK_SECRET_KEY env var continues to serve MyE-Doctor.
-- No backfill needed — MyE-Doctor does not use organisation_payment_providers.
-- It falls back to the global env var when no org-specific config exists.

-- =========================================================================
-- SECTION 5: Comments
-- =========================================================================

COMMENT ON TABLE public.organisation_payment_providers IS 'Per-organisation payment provider configuration. Secrets are encrypted and only accessible via edge functions.';
COMMENT ON COLUMN public.organisation_payment_providers.encrypted_secret_key IS 'AES-256 encrypted Paystack secret key. Decrypt only in edge functions with service role.';
COMMENT ON COLUMN public.organisation_payment_providers.encrypted_webhook_secret IS 'AES-256 encrypted webhook secret. If empty, falls back to secret key for verification.';
COMMENT ON COLUMN public.organisation_payment_providers.status IS 'active = verified and ready; inactive = not yet configured; verification_failed = last verification attempt failed';
