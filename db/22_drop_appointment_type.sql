-- Drop the legacy appointment type column now that appointment types are removed from the UI
ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS type;

-- Note: run this in Supabase SQL Editor when you are ready. This is irreversible for existing data in that column.
