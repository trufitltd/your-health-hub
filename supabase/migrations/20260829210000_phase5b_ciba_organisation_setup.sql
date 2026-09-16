-- Phase 5B: CIBA Organisation Setup
-- Creates CIBA organisation, configuration, services, and grants required permissions
--
-- DESIGN NOTES:
-- - Organisation tenant seeding via migration is for deployment bootstrapping only.
-- - In production, new organisations should be created through Platform Super Admin UI.
-- - This migration is idempotent: ON CONFLICT (slug) DO NOTHING prevents duplicates.
-- - If a CIBA org already exists (created via Platform Admin), this migration is a no-op
--   for the organisation row, and only fills in missing config/services.
-- - Future tenant onboarding should NOT add new migration files. Use Platform Admin instead.

-- 0. Grant authenticated role access to all organisation tables (RLS handles row filtering)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_members TO authenticated;

-- 1. Create CIBA Wellness organisation
INSERT INTO public.organisations (name, slug, description, contact_email, contact_phone, country_code, currency, active)
VALUES (
  'CIBA Wellness Center',
  'ciba',
  'Specialist mental healthcare provider offering psychiatry, psychology, addiction recovery, and rehabilitation services.',
  NULL,
  NULL,
  'NG',
  'NGN',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Organisation configuration (internal assign, no directory, no ratings/reviews, service types enabled)
DO $$
DECLARE
  v_ciba_org_id UUID;
BEGIN
  SELECT id INTO v_ciba_org_id FROM public.organisations WHERE slug = 'ciba';

  IF v_ciba_org_id IS NULL THEN
    RAISE EXCEPTION 'CIBA organisation not found after insert';
  END IF;

  RAISE NOTICE 'CIBA organisation id: %', v_ciba_org_id;

  INSERT INTO public.organisation_config (organisation_id, config_key, config_value)
  VALUES
    (v_ciba_org_id, 'clinician_selection_mode', 'internal_assign'),
    (v_ciba_org_id, 'show_doctor_directory', 'true'),
    (v_ciba_org_id, 'show_ratings', 'true'),
    (v_ciba_org_id, 'show_reviews', 'true'),
    (v_ciba_org_id, 'enable_service_types', 'true'),
    (v_ciba_org_id, 'brand_name', 'CIBA Wellness'),
    (v_ciba_org_id, 'brand_email', 'info@cibawellness.com'),
    (v_ciba_org_id, 'support_email', 'support@cibawellness.com'),
    (v_ciba_org_id, 'sms_signature', 'CIBA'),
    (v_ciba_org_id, 'vapid_subject', 'mailto:info@cibawellness.com')
  ON CONFLICT (organisation_id, config_key) DO NOTHING;

  -- 3. Organisation services (only if CIBA has no services yet)
  IF NOT EXISTS (
    SELECT 1 FROM public.organisation_services WHERE organisation_id = v_ciba_org_id
  ) THEN
    INSERT INTO public.organisation_services (organisation_id, name, description, default_duration_minutes, consultation_mode, base_price, currency, active, sort_order, required_specialties)
    VALUES
      (v_ciba_org_id, 'Adult Psychiatry', 'Comprehensive psychiatric assessment and treatment for adults experiencing mental health conditions.', 45, 'video', 0, 'NGN', true, 1, '{}'),
      (v_ciba_org_id, 'Child & Adolescent Psychiatry', 'Specialist psychiatric care for children and adolescents with emotional, behavioural, and developmental concerns.', 45, 'video', 0, 'NGN', true, 2, '{}'),
      (v_ciba_org_id, 'Addiction & Recovery', 'Evidence-based addiction treatment including assessment, detox support, counselling, and relapse prevention.', 45, 'video', 0, 'NGN', true, 3, '{}'),
      (v_ciba_org_id, 'Psychological Services', 'Psychotherapy and psychological assessments including CBT, DBT, and trauma-focused interventions.', 45, 'video', 0, 'NGN', true, 4, '{}'),
      (v_ciba_org_id, 'Rehabilitation Services', 'Physical and cognitive rehabilitation programmes for patients recovering from injury, stroke, or chronic conditions.', 45, 'video', 0, 'NGN', true, 5, '{}'),
      (v_ciba_org_id, 'Inpatient Care', 'Residential treatment programmes for patients requiring intensive, round-the-clock psychiatric care.', 45, 'video', 0, 'NGN', true, 6, '{}'),
      (v_ciba_org_id, 'Outpatient Care', 'Regular scheduled appointments for ongoing mental health management and follow-up.', 30, 'video', 0, 'NGN', true, 7, '{}'),
      (v_ciba_org_id, 'Workplace & School Mental Health', 'Programmes supporting mental wellbeing in educational and workplace settings.', 30, 'video', 0, 'NGN', true, 8, '{}'),
      (v_ciba_org_id, 'Telepsychiatry', 'Remote video consultations for psychiatric assessment, follow-up, and medication management.', 30, 'video', 0, 'NGN', true, 9, '{}');
    RAISE NOTICE 'CIBA services inserted';
  ELSE
    RAISE NOTICE 'CIBA services already exist, skipping';
  END IF;

  RAISE NOTICE 'CIBA organisation, config, and services created successfully';
END $$;
