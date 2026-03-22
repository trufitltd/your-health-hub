-- 47_add_patient_post_auth_prompt_completed.sql
-- Persist one-time patient post-auth completion in DB (cross-device), not localStorage.

ALTER TABLE public.patient_registrations
ADD COLUMN IF NOT EXISTS post_auth_prompt_completed BOOLEAN NOT NULL DEFAULT false;

-- Backfill: if a patient already has a profile picture, consider prompt completed.
UPDATE public.patient_registrations
SET post_auth_prompt_completed = true
WHERE COALESCE(trim(profile_picture_url), '') <> '';
