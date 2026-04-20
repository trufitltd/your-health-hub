-- Table for platform-wide configurations
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_first_n_free_limit INTEGER NOT NULL DEFAULT 126,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id)
);

-- Ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS platform_settings_single_row_idx ON public.platform_settings ((id IS NOT NULL));

-- Insert default row
INSERT INTO public.platform_settings (promotion_first_n_free_limit)
VALUES (126)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (needed for Edge Functions/Services)
CREATE POLICY platform_settings_select_policy ON public.platform_settings
  FOR SELECT TO authenticated USING (true);

-- Allow only admins to update
CREATE POLICY platform_settings_update_policy ON public.platform_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid()
    )
  );

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.handle_platform_settings_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_settings_updated_trigger
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_platform_settings_updated();
