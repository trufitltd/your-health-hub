-- Add currency to appointments and payments tables
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (currency IN ('NGN', 'USD'));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (currency IN ('NGN', 'USD'));

ALTER TABLE public.doctor_wallet
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (currency IN ('NGN', 'USD'));
