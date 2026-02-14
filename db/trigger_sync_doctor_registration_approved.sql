-- Trigger: auto-sync approved doctor_registrations to public.doctors
-- 1) Upserts a doctor record into `public.doctors` with id = doctor_registrations.user_id
-- 2) Sets the auth.users raw_user_meta_data.role to 'doctor'
-- Run this in the Supabase SQL editor as a project owner (SQL editor / SQL query).

-- Create function
CREATE OR REPLACE FUNCTION public.handle_doctor_registration_approved()
RETURNS trigger AS $$
BEGIN
  -- Handle INSERT where record is already approved
  IF (TG_OP = 'INSERT' AND NEW.verification_status = 'approved') THEN
    -- Upsert into public.doctors using the correct user_id as id
    INSERT INTO public.doctors (
      id, name, specialty, bio, phone, email, avatar_url, is_active, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      NEW.full_name,
      NEW.specialty,
      NEW.bio,
      NEW.phone_number,
      NEW.email,
      NEW.profile_picture_url,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      specialty = EXCLUDED.specialty,
      bio = EXCLUDED.bio,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at;

    -- Update auth.users metadata to include role = 'doctor'
    IF NEW.user_id IS NOT NULL THEN
      UPDATE auth.users u
      SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'doctor')
      WHERE u.id = NEW.user_id;
    END IF;

  -- Handle UPDATE transitions to 'approved'
  ELSIF (TG_OP = 'UPDATE' AND NEW.verification_status = 'approved' AND (OLD.verification_status IS DISTINCT FROM NEW.verification_status)) THEN
    INSERT INTO public.doctors (
      id, name, specialty, bio, phone, email, avatar_url, is_active, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      NEW.full_name,
      NEW.specialty,
      NEW.bio,
      NEW.phone_number,
      NEW.email,
      NEW.profile_picture_url,
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      specialty = EXCLUDED.specialty,
      bio = EXCLUDED.bio,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at;

    IF NEW.user_id IS NOT NULL THEN
      UPDATE auth.users u
      SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'doctor')
      WHERE u.id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on doctor_registrations for INSERT and UPDATE
DROP TRIGGER IF EXISTS doctor_registrations_sync_trigger ON public.doctor_registrations;
CREATE TRIGGER doctor_registrations_sync_trigger
AFTER INSERT OR UPDATE ON public.doctor_registrations
FOR EACH ROW EXECUTE FUNCTION public.handle_doctor_registration_approved();

-- Notes:
-- - This function runs as the database role that owns the function (SECURITY DEFINER). Run the SQL as a project owner in Supabase.
-- - If your Supabase setup stores auth metadata in a different column name, adjust `raw_user_meta_data` accordingly.
-- - After deploying, test by creating or updating a doctor_registration to `verification_status = 'approved'` and confirm the `doctors` row and `auth.users` metadata update.
