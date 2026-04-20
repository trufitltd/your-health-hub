-- Migration to add promotion tracking to appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN DEFAULT false;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS promotion_type TEXT;

-- Index for fast counts
CREATE INDEX IF NOT EXISTS idx_appointments_promotion ON public.appointments (is_promotion, promotion_type) WHERE is_promotion = true;
