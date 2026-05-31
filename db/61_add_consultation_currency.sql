-- Add consultation_currency to doctor_registrations and doctors tables
ALTER TABLE public.doctor_registrations
  ADD COLUMN IF NOT EXISTS consultation_currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (consultation_currency IN ('NGN', 'USD'));

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS consultation_currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (consultation_currency IN ('NGN', 'USD'));

-- Sync currency from doctor_registrations to doctors on update
CREATE OR REPLACE FUNCTION public.sync_doctor_consultation_currency()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.doctors
  SET consultation_currency = NEW.consultation_currency
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_doctor_consultation_currency ON public.doctor_registrations;
CREATE TRIGGER trg_sync_doctor_consultation_currency
  AFTER INSERT OR UPDATE OF consultation_currency ON public.doctor_registrations
  FOR EACH ROW EXECUTE FUNCTION public.sync_doctor_consultation_currency();
