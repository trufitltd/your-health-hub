-- Dedicated appointment duration options used by booking/reschedule availability checks.
-- This decouples allowed durations from pricing rules while keeping pricing modifiers optional.

CREATE TABLE IF NOT EXISTS public.appointment_duration_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  value_minutes INTEGER NOT NULL CHECK (value_minutes BETWEEN 5 AND 240),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointment_duration_options_value_minutes_key UNIQUE (value_minutes)
);

CREATE INDEX IF NOT EXISTS idx_appointment_duration_options_active_sort
  ON public.appointment_duration_options(active, sort_order, value_minutes);

CREATE OR REPLACE FUNCTION public.update_appointment_duration_options_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_duration_options_updated_at ON public.appointment_duration_options;
CREATE TRIGGER trg_appointment_duration_options_updated_at
  BEFORE UPDATE ON public.appointment_duration_options
  FOR EACH ROW
  EXECUTE FUNCTION public.update_appointment_duration_options_updated_at();

-- Migrate active duration modifiers from pricing rules into dedicated duration options.
DO $$
BEGIN
  IF to_regclass('public.pricing_rules') IS NOT NULL THEN
    INSERT INTO public.appointment_duration_options (
      name,
      value_minutes,
      active,
      sort_order
    )
    SELECT DISTINCT
      CONCAT(TRIM(pr.condition_value), ' min') AS name,
      CAST(TRIM(pr.condition_value) AS INTEGER) AS value_minutes,
      TRUE AS active,
      CAST(TRIM(pr.condition_value) AS INTEGER) AS sort_order
    FROM public.pricing_rules pr
    WHERE pr.condition_type = 'duration'
      AND pr.rule_type = 'modifier'
      AND pr.active = TRUE
      AND TRIM(COALESCE(pr.condition_value, '')) ~ '^[0-9]+$'
      AND CAST(TRIM(pr.condition_value) AS INTEGER) BETWEEN 5 AND 240
    ON CONFLICT (value_minutes) DO NOTHING;
  END IF;
END;
$$;

-- Ensure standard quick-add defaults always exist.
INSERT INTO public.appointment_duration_options (name, value_minutes, active, sort_order)
VALUES
  ('15 min', 15, TRUE, 15),
  ('30 min', 30, TRUE, 30),
  ('45 min', 45, TRUE, 45),
  ('60 min', 60, TRUE, 60)
ON CONFLICT (value_minutes) DO NOTHING;
