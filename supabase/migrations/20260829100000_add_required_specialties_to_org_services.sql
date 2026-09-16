-- 20260829100000_add_required_specialties_to_org_services.sql
-- Adds required_specialties to organisation_services so the assignment
-- pipeline can match services to qualified clinicians.
--
-- SAFETY: Additive only. No existing data changes.

ALTER TABLE public.organisation_services
  ADD COLUMN IF NOT EXISTS required_specialties TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.organisation_services.required_specialties
  IS 'Array of specialty strings (e.g. {GP, Specialist, Physiotherapy). Empty means any qualified doctor in the org.';
