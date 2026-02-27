-- Add multilingual storage support for doctor profile content.
-- Includes:
-- 1) Explicit language columns (bio_<lang>)
-- 2) Flexible JSONB translation objects (bio_translations, specialty_translations)
-- 3) Backfill from existing English data
-- 4) Trigger to keep column + JSON representations in sync

BEGIN;

ALTER TABLE public.doctor_registrations
  ADD COLUMN IF NOT EXISTS bio_ha TEXT,
  ADD COLUMN IF NOT EXISTS bio_ig TEXT,
  ADD COLUMN IF NOT EXISTS bio_yo TEXT,
  ADD COLUMN IF NOT EXISTS bio_sw TEXT,
  ADD COLUMN IF NOT EXISTS bio_ar TEXT,
  ADD COLUMN IF NOT EXISTS bio_fr TEXT,
  ADD COLUMN IF NOT EXISTS bio_es TEXT,
  ADD COLUMN IF NOT EXISTS bio_pt TEXT,
  ADD COLUMN IF NOT EXISTS bio_nl TEXT,
  ADD COLUMN IF NOT EXISTS bio_zh TEXT,
  ADD COLUMN IF NOT EXISTS bio_de TEXT,
  ADD COLUMN IF NOT EXISTS bio_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS specialty_translations JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Ensure translation containers are JSON objects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_registrations_bio_translations_is_object'
  ) THEN
    ALTER TABLE public.doctor_registrations
      ADD CONSTRAINT doctor_registrations_bio_translations_is_object
      CHECK (jsonb_typeof(bio_translations) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_registrations_specialty_translations_is_object'
  ) THEN
    ALTER TABLE public.doctor_registrations
      ADD CONSTRAINT doctor_registrations_specialty_translations_is_object
      CHECK (jsonb_typeof(specialty_translations) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_doctor_registrations_bio_translations_gin
  ON public.doctor_registrations
  USING GIN (bio_translations);

CREATE INDEX IF NOT EXISTS idx_doctor_registrations_specialty_translations_gin
  ON public.doctor_registrations
  USING GIN (specialty_translations);

CREATE OR REPLACE FUNCTION public.sync_doctor_registration_i18n_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Normalize blank strings to NULL so we don't store empty translations.
  NEW.bio := NULLIF(btrim(NEW.bio), '');
  NEW.bio_ha := NULLIF(btrim(NEW.bio_ha), '');
  NEW.bio_ig := NULLIF(btrim(NEW.bio_ig), '');
  NEW.bio_yo := NULLIF(btrim(NEW.bio_yo), '');
  NEW.bio_sw := NULLIF(btrim(NEW.bio_sw), '');
  NEW.bio_ar := NULLIF(btrim(NEW.bio_ar), '');
  NEW.bio_fr := NULLIF(btrim(NEW.bio_fr), '');
  NEW.bio_es := NULLIF(btrim(NEW.bio_es), '');
  NEW.bio_pt := NULLIF(btrim(NEW.bio_pt), '');
  NEW.bio_nl := NULLIF(btrim(NEW.bio_nl), '');
  NEW.bio_zh := NULLIF(btrim(NEW.bio_zh), '');
  NEW.bio_de := NULLIF(btrim(NEW.bio_de), '');
  NEW.specialty := NULLIF(btrim(NEW.specialty), '');

  NEW.bio_translations := COALESCE(NEW.bio_translations, '{}'::jsonb);
  NEW.specialty_translations := COALESCE(NEW.specialty_translations, '{}'::jsonb);

  -- Always persist English defaults when present.
  IF NEW.bio IS NOT NULL THEN
    NEW.bio_translations := NEW.bio_translations || jsonb_build_object('en', NEW.bio);
  ELSIF NULLIF(btrim(NEW.bio_translations ->> 'en'), '') IS NOT NULL THEN
    NEW.bio := NEW.bio_translations ->> 'en';
  END IF;

  IF NEW.specialty IS NOT NULL THEN
    NEW.specialty_translations := NEW.specialty_translations || jsonb_build_object('en', NEW.specialty);
  ELSIF NULLIF(btrim(NEW.specialty_translations ->> 'en'), '') IS NOT NULL THEN
    NEW.specialty := NEW.specialty_translations ->> 'en';
  END IF;

  -- From explicit language columns -> JSON
  IF NEW.bio_ha IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('ha', NEW.bio_ha); END IF;
  IF NEW.bio_ig IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('ig', NEW.bio_ig); END IF;
  IF NEW.bio_yo IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('yo', NEW.bio_yo); END IF;
  IF NEW.bio_sw IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('sw', NEW.bio_sw); END IF;
  IF NEW.bio_ar IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('ar', NEW.bio_ar); END IF;
  IF NEW.bio_fr IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('fr', NEW.bio_fr); END IF;
  IF NEW.bio_es IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('es', NEW.bio_es); END IF;
  IF NEW.bio_pt IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('pt', NEW.bio_pt); END IF;
  IF NEW.bio_nl IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('nl', NEW.bio_nl); END IF;
  IF NEW.bio_zh IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('zh', NEW.bio_zh); END IF;
  IF NEW.bio_de IS NOT NULL THEN NEW.bio_translations := NEW.bio_translations || jsonb_build_object('de', NEW.bio_de); END IF;

  -- From JSON -> explicit language columns (only fill when empty)
  IF NEW.bio_ha IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'ha'), '') IS NOT NULL THEN NEW.bio_ha := NEW.bio_translations ->> 'ha'; END IF;
  IF NEW.bio_ig IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'ig'), '') IS NOT NULL THEN NEW.bio_ig := NEW.bio_translations ->> 'ig'; END IF;
  IF NEW.bio_yo IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'yo'), '') IS NOT NULL THEN NEW.bio_yo := NEW.bio_translations ->> 'yo'; END IF;
  IF NEW.bio_sw IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'sw'), '') IS NOT NULL THEN NEW.bio_sw := NEW.bio_translations ->> 'sw'; END IF;
  IF NEW.bio_ar IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'ar'), '') IS NOT NULL THEN NEW.bio_ar := NEW.bio_translations ->> 'ar'; END IF;
  IF NEW.bio_fr IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'fr'), '') IS NOT NULL THEN NEW.bio_fr := NEW.bio_translations ->> 'fr'; END IF;
  IF NEW.bio_es IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'es'), '') IS NOT NULL THEN NEW.bio_es := NEW.bio_translations ->> 'es'; END IF;
  IF NEW.bio_pt IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'pt'), '') IS NOT NULL THEN NEW.bio_pt := NEW.bio_translations ->> 'pt'; END IF;
  IF NEW.bio_nl IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'nl'), '') IS NOT NULL THEN NEW.bio_nl := NEW.bio_translations ->> 'nl'; END IF;
  IF NEW.bio_zh IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'zh'), '') IS NOT NULL THEN NEW.bio_zh := NEW.bio_translations ->> 'zh'; END IF;
  IF NEW.bio_de IS NULL AND NULLIF(btrim(NEW.bio_translations ->> 'de'), '') IS NOT NULL THEN NEW.bio_de := NEW.bio_translations ->> 'de'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS doctor_registrations_sync_i18n_trigger ON public.doctor_registrations;
CREATE TRIGGER doctor_registrations_sync_i18n_trigger
  BEFORE INSERT OR UPDATE ON public.doctor_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_doctor_registration_i18n_fields();

-- One-time backfill from existing base columns.
UPDATE public.doctor_registrations
SET
  bio_translations = COALESCE(bio_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(bio), '') IS NOT NULL THEN jsonb_build_object('en', btrim(bio)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_ha), '') IS NOT NULL THEN jsonb_build_object('ha', btrim(bio_ha)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_ig), '') IS NOT NULL THEN jsonb_build_object('ig', btrim(bio_ig)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_yo), '') IS NOT NULL THEN jsonb_build_object('yo', btrim(bio_yo)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_sw), '') IS NOT NULL THEN jsonb_build_object('sw', btrim(bio_sw)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_ar), '') IS NOT NULL THEN jsonb_build_object('ar', btrim(bio_ar)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_fr), '') IS NOT NULL THEN jsonb_build_object('fr', btrim(bio_fr)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_es), '') IS NOT NULL THEN jsonb_build_object('es', btrim(bio_es)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_pt), '') IS NOT NULL THEN jsonb_build_object('pt', btrim(bio_pt)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_nl), '') IS NOT NULL THEN jsonb_build_object('nl', btrim(bio_nl)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_zh), '') IS NOT NULL THEN jsonb_build_object('zh', btrim(bio_zh)) ELSE '{}'::jsonb END
    || CASE WHEN NULLIF(btrim(bio_de), '') IS NOT NULL THEN jsonb_build_object('de', btrim(bio_de)) ELSE '{}'::jsonb END,
  specialty_translations = COALESCE(specialty_translations, '{}'::jsonb)
    || CASE WHEN NULLIF(btrim(specialty), '') IS NOT NULL THEN jsonb_build_object('en', btrim(specialty)) ELSE '{}'::jsonb END,
  updated_at = now();

COMMIT;
