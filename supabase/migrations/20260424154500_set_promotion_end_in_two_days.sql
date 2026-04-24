-- Make promotion time-based and set end date to 2 days from migration run time.

ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS promotion_ends_at TIMESTAMPTZ;

UPDATE public.platform_settings
SET promotion_ends_at = (now() + interval '2 days'),
    updated_at = now();

