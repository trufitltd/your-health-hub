-- 35_marketplace_pricing_wallet_refactor.sql
-- Marketplace pricing + booking + wallet foundations (additive, backward compatible).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- Pricing Profiles ----------
CREATE TABLE IF NOT EXISTS public.pricing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'NG',
  currency TEXT NOT NULL DEFAULT 'NGN',
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_profiles_name ON public.pricing_profiles(name);
CREATE INDEX IF NOT EXISTS idx_pricing_profiles_active ON public.pricing_profiles(active);

-- ---------- Pricing Rules ----------
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_profile_id UUID NOT NULL REFERENCES public.pricing_profiles(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('base', 'modifier')),
  condition_type TEXT NOT NULL CHECK (condition_type IN ('doctor_type', 'duration', 'tier', 'consultation_type')),
  condition_value TEXT NOT NULL,
  price_action TEXT NOT NULL CHECK (price_action IN ('set', 'add', 'multiply')),
  amount NUMERIC(12,2) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_profile ON public.pricing_rules(pricing_profile_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active_priority ON public.pricing_rules(active, priority);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_condition ON public.pricing_rules(condition_type, condition_value);

-- ---------- Pricing Feature Flags ----------
CREATE TABLE IF NOT EXISTS public.pricing_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name TEXT NOT NULL UNIQUE CHECK (feature_name IN ('duration_pricing', 'tier_pricing', 'consultation_type_pricing')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Consultation Types ----------
CREATE TABLE IF NOT EXISTS public.consultation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (name IN ('chat', 'voice', 'video')),
  active BOOLEAN NOT NULL DEFAULT true,
  flat_rate NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Doctor Tiers ----------
CREATE TABLE IF NOT EXISTS public.doctor_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  experience_min INTEGER NOT NULL,
  experience_max INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (experience_min >= 0),
  CHECK (experience_max IS NULL OR experience_max >= experience_min)
);

-- Optional mapping to keep a stable tier per doctor profile.
ALTER TABLE public.doctor_registrations
ADD COLUMN IF NOT EXISTS doctor_tier_id UUID REFERENCES public.doctor_tiers(id);

-- ---------- Platform Fee Rules ----------
CREATE TABLE IF NOT EXISTS public.platform_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_type TEXT NOT NULL CHECK (doctor_type IN ('GP', 'Specialist')),
  fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
  value NUMERIC(12,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_rules_doctor_type_active
  ON public.platform_fee_rules(doctor_type, active);

-- ---------- Doctor Wallet ----------
CREATE TABLE IF NOT EXISTS public.doctor_wallet (
  doctor_id UUID PRIMARY KEY REFERENCES public.doctors(id) ON DELETE CASCADE,
  pending_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pending_balance >= 0),
  CHECK (available_balance >= 0)
);

CREATE OR REPLACE FUNCTION public.update_doctor_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doctor_wallet_updated_at ON public.doctor_wallet;
CREATE TRIGGER trg_doctor_wallet_updated_at
  BEFORE UPDATE ON public.doctor_wallet
  FOR EACH ROW
  EXECUTE FUNCTION public.update_doctor_wallet_updated_at();

CREATE TABLE IF NOT EXISTS public.doctor_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'reversed')),
  available_after TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_txn_doctor_status_time
  ON public.doctor_wallet_transactions(doctor_id, status, available_after);

-- ---------- Appointments Extensions ----------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS final_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS price_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS doctor_earning NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS pricing_profile_id UUID REFERENCES public.pricing_profiles(id),
  ADD COLUMN IF NOT EXISTS slot_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_type_id UUID REFERENCES public.consultation_types(id),
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE public.appointments
SET price_breakdown = '{}'::jsonb
WHERE price_breakdown IS NULL;

ALTER TABLE public.appointments
  ALTER COLUMN price_breakdown SET DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date_time
  ON public.appointments(doctor_id, date, time);
CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_slot_locked_until
  ON public.appointments(slot_locked_until);
CREATE INDEX IF NOT EXISTS idx_appointments_payment_reference
  ON public.appointments(payment_reference);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_status_marketplace_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments DROP CONSTRAINT appointments_status_marketplace_check;
  END IF;

  ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_marketplace_check
  CHECK (
    status IS NULL OR status IN (
      'pending','confirmed','in_progress','completed','cancelled','rejected','pending_payment','expired',
      'PENDING_PAYMENT','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED','REJECTED'
    )
  );
END $$;

-- Keep availability view aligned with lock-based booking statuses.
CREATE OR REPLACE VIEW public.available_slots AS
SELECT
  ds.id AS schedule_id,
  d.id AS doctor_id,
  d.name AS doctor_name,
  COALESCE(dr.specialty, d.specialty) AS specialty,
  ds.day_of_week,
  ds.start_time,
  ds.end_time,
  ds.slot_duration_minutes,
  ds.max_patients_per_slot,
  COALESCE(COUNT(a.id), 0) AS booked_count,
  (ds.max_patients_per_slot - COALESCE(COUNT(a.id), 0)) AS available_slots
FROM public.doctor_schedules ds
JOIN public.doctors d ON ds.doctor_id = d.id
LEFT JOIN public.doctor_registrations dr ON dr.user_id = d.id
LEFT JOIN public.appointments a ON
  d.id = a.doctor_id
  AND EXTRACT(DOW FROM a.date::date) = ds.day_of_week
  AND a.time >= ds.start_time::text
  AND a.time < (ds.end_time::time - make_interval(mins => ds.slot_duration_minutes))::text
  AND (
    lower(coalesce(a.status, '')) IN ('pending', 'confirmed', 'in_progress', 'completed')
    OR (
      lower(coalesce(a.status, '')) = 'pending_payment'
      AND a.slot_locked_until IS NOT NULL
      AND a.slot_locked_until > now()
    )
  )
WHERE ds.is_available = true
  AND d.is_active = true
GROUP BY
  ds.id,
  d.id,
  d.name,
  d.specialty,
  dr.specialty,
  ds.day_of_week,
  ds.start_time,
  ds.end_time,
  ds.slot_duration_minutes,
  ds.max_patients_per_slot;

-- ---------- Payments Extensions ----------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Keep compatibility with old fields.
UPDATE public.payments
SET provider = COALESCE(provider, payment_method, 'paystack')
WHERE provider IS NULL;

UPDATE public.payments
SET provider_reference = COALESCE(provider_reference, payment_reference)
WHERE provider_reference IS NULL;

UPDATE public.payments
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

ALTER TABLE public.payments
  ALTER COLUMN provider SET DEFAULT 'paystack',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_payments_provider_reference ON public.payments(provider_reference);
CREATE INDEX IF NOT EXISTS idx_payments_provider_status ON public.payments(provider, status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_status_marketplace_check'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments DROP CONSTRAINT payments_status_marketplace_check;
  END IF;

  ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_marketplace_check
  CHECK (
    status IS NULL OR status IN ('pending', 'completed', 'failed', 'PENDING', 'SUCCESS', 'FAILED')
  );
END $$;

-- ---------- RLS for new tables ----------
ALTER TABLE public.pricing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view pricing_profiles" ON public.pricing_profiles;
CREATE POLICY "Authenticated users can view pricing_profiles"
  ON public.pricing_profiles FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage pricing_profiles" ON public.pricing_profiles;
CREATE POLICY "Authenticated users can manage pricing_profiles"
  ON public.pricing_profiles FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can view pricing_rules" ON public.pricing_rules;
CREATE POLICY "Authenticated users can view pricing_rules"
  ON public.pricing_rules FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage pricing_rules" ON public.pricing_rules;
CREATE POLICY "Authenticated users can manage pricing_rules"
  ON public.pricing_rules FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can view pricing_feature_flags" ON public.pricing_feature_flags;
CREATE POLICY "Authenticated users can view pricing_feature_flags"
  ON public.pricing_feature_flags FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage pricing_feature_flags" ON public.pricing_feature_flags;
CREATE POLICY "Authenticated users can manage pricing_feature_flags"
  ON public.pricing_feature_flags FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can view consultation_types" ON public.consultation_types;
CREATE POLICY "Authenticated users can view consultation_types"
  ON public.consultation_types FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage consultation_types" ON public.consultation_types;
CREATE POLICY "Authenticated users can manage consultation_types"
  ON public.consultation_types FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can view doctor_tiers" ON public.doctor_tiers;
CREATE POLICY "Authenticated users can view doctor_tiers"
  ON public.doctor_tiers FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage doctor_tiers" ON public.doctor_tiers;
CREATE POLICY "Authenticated users can manage doctor_tiers"
  ON public.doctor_tiers FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can view platform_fee_rules" ON public.platform_fee_rules;
CREATE POLICY "Authenticated users can view platform_fee_rules"
  ON public.platform_fee_rules FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage platform_fee_rules" ON public.platform_fee_rules;
CREATE POLICY "Authenticated users can manage platform_fee_rules"
  ON public.platform_fee_rules FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Doctors can view own wallet" ON public.doctor_wallet;
CREATE POLICY "Doctors can view own wallet"
  ON public.doctor_wallet FOR SELECT USING (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Authenticated users can view wallet transactions" ON public.doctor_wallet_transactions;
CREATE POLICY "Authenticated users can view wallet transactions"
  ON public.doctor_wallet_transactions FOR SELECT USING (auth.role() = 'authenticated');

-- ---------- Seed defaults ----------
INSERT INTO public.pricing_profiles (name, country_code, currency, is_default, active)
VALUES ('Default Nigeria Pricing', 'NG', 'NGN', true, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.pricing_feature_flags (feature_name, enabled)
VALUES
  ('duration_pricing', true),
  ('tier_pricing', true),
  ('consultation_type_pricing', false)
ON CONFLICT (feature_name)
DO NOTHING;

INSERT INTO public.consultation_types (name, active, flat_rate)
VALUES
  ('chat', true, NULL),
  ('voice', true, NULL),
  ('video', true, NULL)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.doctor_tiers (name, experience_min, experience_max, active)
VALUES
  ('Junior', 0, 4, true),
  ('Mid', 5, 9, true),
  ('Senior', 10, NULL, true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.platform_fee_rules (doctor_type, fee_type, value, active)
SELECT 'GP', 'percentage', 10, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_fee_rules
  WHERE doctor_type = 'GP' AND fee_type = 'percentage' AND value = 10 AND active = true
);

INSERT INTO public.platform_fee_rules (doctor_type, fee_type, value, active)
SELECT 'Specialist', 'percentage', 15, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_fee_rules
  WHERE doctor_type = 'Specialist' AND fee_type = 'percentage' AND value = 15 AND active = true
);
