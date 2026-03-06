


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_generate_unique_rx_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := 'RX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.prescription_verifications pv WHERE pv.code = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;


ALTER FUNCTION "public"."_generate_unique_rx_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("user_id_to_delete" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  -- Delete from related tables (cascading will handle most, but we'll be explicit)
  DELETE FROM doctor_registrations WHERE user_id = user_id_to_delete;
  DELETE FROM patient_registrations WHERE user_id = user_id_to_delete;
  DELETE FROM doctors WHERE id = user_id_to_delete;
  DELETE FROM appointments WHERE patient_id = user_id_to_delete OR doctor_id = user_id_to_delete;
  DELETE FROM health_records WHERE patient_id = user_id_to_delete;
  DELETE FROM consultation_sessions WHERE patient_id = user_id_to_delete OR doctor_id = user_id_to_delete;
  DELETE FROM doctor_consultation_notes WHERE patient_id = user_id_to_delete OR doctor_id = user_id_to_delete;
  DELETE FROM patient_folders WHERE patient_id = user_id_to_delete;
  
  -- Delete from auth.users (this is the critical part that requires SECURITY DEFINER)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
  
  result := json_build_object(
    'success', true,
    'message', 'User deleted successfully'
  );
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    result := json_build_object(
      'success', false,
      'message', SQLERRM
    );
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."admin_delete_user"("user_id_to_delete" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_doctor_registration"("p_user_id" "uuid", "p_verification_status" "text", "p_verification_notes" "text", "p_verified_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.doctor_registrations
  SET verification_status = p_verification_status,
      verification_notes = p_verification_notes,
      verified_at = p_verified_at,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."admin_update_doctor_registration"("p_user_id" "uuid", "p_verification_status" "text", "p_verification_notes" "text", "p_verified_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_patient_registration_from_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_phone TEXT;
  v_full_name TEXT;
BEGIN
  -- Only create for patients
  IF (NEW.user_metadata->>'role') IS DISTINCT FROM NULL AND (NEW.user_metadata->>'role') = 'patient' THEN
    v_phone := COALESCE(NEW.user_metadata->>'phone', '');
    v_full_name := COALESCE(NEW.user_metadata->>'full_name', NEW.email);

    BEGIN
      -- Insert a minimal but valid patient_registrations row only if one does not exist
      INSERT INTO public.patient_registrations (
        user_id, profile_picture_url, full_name, gender, age, phone_number, email, city, state, country,
        marital_status, emergency_contact_name, emergency_contact_phone, identification_type, identification_number, created_at, updated_at
      )
      SELECT
        NEW.id,
        NULL,
        v_full_name,
        'other',
        18,
        v_phone,
        NEW.email,
        'Unknown',
        'Unknown',
        'Unknown',
        'single',
        'Not Provided',
        v_phone,
        'nin',
        -- Use user_id as part of identification_number for guaranteed uniqueness per user
        substring(NEW.id::text, 1, 16),
        NOW(), 
        NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.patient_registrations pr WHERE pr.user_id = NEW.id
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log the error but don't fail the auth.users insert
      RAISE WARNING 'Failed to create patient_registrations for user %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_patient_registration_from_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."doctor_append_to_patient_folder"("p_patient_id" "uuid", "p_note_text" "text", "p_presenting_complaint" "text" DEFAULT NULL::"text", "p_history_of_presenting_complaint" "text" DEFAULT NULL::"text", "p_past_medical_history" "text" DEFAULT NULL::"text", "p_past_drug_history" "text" DEFAULT NULL::"text", "p_allergies" "text" DEFAULT NULL::"text", "p_family_social_history" "text" DEFAULT NULL::"text", "p_clinical_examination" "text" DEFAULT NULL::"text", "p_assessment" "text" DEFAULT NULL::"text", "p_treatment_plan" "text" DEFAULT NULL::"text", "p_investigations" "text" DEFAULT NULL::"text", "p_e_prescription" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  caller uuid := auth.uid()::uuid;
  existing_medical_history TEXT;
  existing_updated_at TIMESTAMPTZ;
  normalized_note TEXT;
  normalized_tail TEXT;
  should_append BOOLEAN := TRUE;
BEGIN
  -- Verify caller is a doctor related to this patient by appointment or consultation session.
  IF NOT EXISTS (
    SELECT 1
    FROM public.consultation_sessions cs
    WHERE cs.patient_id = p_patient_id
      AND cs.doctor_id = caller
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.patient_id = p_patient_id
      AND a.doctor_id = caller
  ) THEN
    RAISE EXCEPTION 'Unauthorized: caller is not the assigned doctor for this patient';
  END IF;

  IF EXISTS (SELECT 1 FROM public.patient_folders pf WHERE pf.patient_id = p_patient_id) THEN
    SELECT pf.medical_history, pf.updated_at
    INTO existing_medical_history, existing_updated_at
    FROM public.patient_folders pf
    WHERE pf.patient_id = p_patient_id
    LIMIT 1;

    -- Idempotency guard:
    -- If the same note was effectively just appended (within 5 minutes),
    -- do not append it again. Structured columns still update.
    normalized_note := lower(regexp_replace(COALESCE(p_note_text, ''), E'\\s+', ' ', 'g'));
    normalized_note := btrim(normalized_note);

    IF normalized_note = '' THEN
      should_append := FALSE;
    ELSIF existing_medical_history IS NOT NULL
      AND existing_updated_at IS NOT NULL
      AND existing_updated_at >= (now() - INTERVAL '5 minutes')
    THEN
      normalized_tail := lower(
        regexp_replace(
          right(existing_medical_history, GREATEST(length(COALESCE(p_note_text, '')) * 2, 4000)),
          E'\\s+',
          ' ',
          'g'
        )
      );
      normalized_tail := btrim(normalized_tail);

      IF position(normalized_note IN normalized_tail) > 0 THEN
        should_append := FALSE;
      END IF;
    END IF;

    UPDATE public.patient_folders
    SET
      medical_history = CASE
        WHEN should_append THEN
          COALESCE(medical_history, '') || E'\n\n--- Entry: ' || now()::text || ' by doctor:' || caller::text || E'\n' || COALESCE(p_note_text, '')
        ELSE
          medical_history
      END,
      allergies = COALESCE(NULLIF(p_allergies, ''), allergies),
      current_medications = COALESCE(NULLIF(p_e_prescription, ''), current_medications),
      previous_diagnoses = COALESCE(NULLIF(p_assessment, ''), previous_diagnoses),
      presenting_complaint = COALESCE(NULLIF(p_presenting_complaint, ''), presenting_complaint),
      history_of_presenting_complaint = COALESCE(NULLIF(p_history_of_presenting_complaint, ''), history_of_presenting_complaint),
      past_medical_history = COALESCE(NULLIF(p_past_medical_history, ''), past_medical_history),
      past_drug_history = COALESCE(NULLIF(p_past_drug_history, ''), past_drug_history),
      family_social_history = COALESCE(NULLIF(p_family_social_history, ''), family_social_history),
      clinical_examination = COALESCE(NULLIF(p_clinical_examination, ''), clinical_examination),
      assessment = COALESCE(NULLIF(p_assessment, ''), assessment),
      treatment_plan = COALESCE(NULLIF(p_treatment_plan, ''), treatment_plan),
      investigations = COALESCE(NULLIF(p_investigations, ''), investigations),
      e_prescription = COALESCE(NULLIF(p_e_prescription, ''), e_prescription),
      updated_at = now()
    WHERE patient_id = p_patient_id;
  ELSE
    INSERT INTO public.patient_folders (
      patient_id,
      patient_type,
      medical_history,
      allergies,
      current_medications,
      previous_diagnoses,
      presenting_complaint,
      history_of_presenting_complaint,
      past_medical_history,
      past_drug_history,
      family_social_history,
      clinical_examination,
      assessment,
      treatment_plan,
      investigations,
      e_prescription,
      created_at,
      updated_at
    )
    VALUES (
      p_patient_id,
      'returning',
      COALESCE(NULLIF(p_past_medical_history, ''), p_note_text),
      NULLIF(p_allergies, ''),
      NULLIF(p_e_prescription, ''),
      NULLIF(p_assessment, ''),
      NULLIF(p_presenting_complaint, ''),
      NULLIF(p_history_of_presenting_complaint, ''),
      NULLIF(p_past_medical_history, ''),
      NULLIF(p_past_drug_history, ''),
      NULLIF(p_family_social_history, ''),
      NULLIF(p_clinical_examination, ''),
      NULLIF(p_assessment, ''),
      NULLIF(p_treatment_plan, ''),
      NULLIF(p_investigations, ''),
      NULLIF(p_e_prescription, ''),
      now(),
      now()
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."doctor_append_to_patient_folder"("p_patient_id" "uuid", "p_note_text" "text", "p_presenting_complaint" "text", "p_history_of_presenting_complaint" "text", "p_past_medical_history" "text", "p_past_drug_history" "text", "p_allergies" "text", "p_family_social_history" "text", "p_clinical_examination" "text", "p_assessment" "text", "p_treatment_plan" "text", "p_investigations" "text", "p_e_prescription" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_patient_registration"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text", "p_email" "text", "p_gender" "text", "p_age" integer, "p_city" "text", "p_state" "text", "p_country" "text", "p_marital_status" "text", "p_emergency_contact_name" "text", "p_emergency_contact_phone" "text", "p_identification_type" "text", "p_identification_number" "text") RETURNS TABLE("success" boolean, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Simple upsert: insert or do nothing on conflict, then update only if needed
  INSERT INTO public.patient_registrations (
    user_id, full_name, gender, age, phone_number, email, city, state, country,
    marital_status, emergency_contact_name, emergency_contact_phone, 
    identification_type, identification_number
  )
  VALUES (
    p_user_id,
    COALESCE(p_full_name, 'Patient'),
    COALESCE(p_gender, 'other'),
    COALESCE(p_age, 18),
    COALESCE(p_phone_number, ''),
    COALESCE(p_email, ''),
    COALESCE(p_city, 'Unknown'),
    COALESCE(p_state, 'Unknown'),
    COALESCE(p_country, 'Unknown'),
    COALESCE(p_marital_status, 'single'),
    COALESCE(p_emergency_contact_name, 'Not Provided'),
    COALESCE(p_emergency_contact_phone, ''),
    COALESCE(p_identification_type, 'nin'),
    COALESCE(p_identification_number, substring(p_user_id::text, 1, 16))
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = COALESCE(NULLIF(p_full_name, ''), patient_registrations.full_name),
    gender = COALESCE(NULLIF(p_gender, ''), patient_registrations.gender),
    age = COALESCE(NULLIF(p_age, 0), patient_registrations.age),
    phone_number = COALESCE(NULLIF(p_phone_number, ''), patient_registrations.phone_number),
    email = COALESCE(NULLIF(p_email, ''), patient_registrations.email),
    updated_at = NOW();

  RETURN QUERY SELECT true::BOOLEAN, 'Patient registration saved'::TEXT;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail - return success=true so signup continues
  RAISE WARNING 'ensure_patient_registration error for user %: %', p_user_id, SQLERRM;
  RETURN QUERY SELECT true::BOOLEAN, 'Patient registration attempted'::TEXT;
END;
$$;


ALTER FUNCTION "public"."ensure_patient_registration"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text", "p_email" "text", "p_gender" "text", "p_age" integer, "p_city" "text", "p_state" "text", "p_country" "text", "p_marital_status" "text", "p_emergency_contact_name" "text", "p_emergency_contact_phone" "text", "p_identification_type" "text", "p_identification_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_prescription_verification"("p_note_id" "uuid", "p_session_id" "uuid", "p_patient_id" "uuid", "p_doctor_id" "uuid", "p_drug_list" "text", "p_date_issued" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  caller UUID := auth.uid()::uuid;
  existing_code TEXT;
  new_code TEXT;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF caller <> p_patient_id AND caller <> p_doctor_id AND auth.jwt() ->> 'role' <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT code INTO existing_code
  FROM public.prescription_verifications
  WHERE note_id = p_note_id
  LIMIT 1;

  IF existing_code IS NOT NULL THEN
    UPDATE public.prescription_verifications
    SET
      session_id = COALESCE(p_session_id, session_id),
      patient_id = p_patient_id,
      doctor_id = p_doctor_id,
      drug_list = COALESCE(NULLIF(p_drug_list, ''), drug_list),
      date_issued = COALESCE(p_date_issued, date_issued),
      updated_at = now()
    WHERE note_id = p_note_id;
    RETURN existing_code;
  END IF;

  new_code := public._generate_unique_rx_code();

  INSERT INTO public.prescription_verifications (
    code,
    note_id,
    session_id,
    patient_id,
    doctor_id,
    drug_list,
    date_issued,
    status,
    expires_at,
    created_at,
    updated_at
  )
  VALUES (
    new_code,
    p_note_id,
    p_session_id,
    p_patient_id,
    p_doctor_id,
    COALESCE(NULLIF(p_drug_list, ''), 'Not specified'),
    COALESCE(p_date_issued, now()),
    'active',
    COALESCE(p_date_issued, now()) + INTERVAL '90 days',
    now(),
    now()
  );

  RETURN new_code;
END;
$$;


ALTER FUNCTION "public"."ensure_prescription_verification"("p_note_id" "uuid", "p_session_id" "uuid", "p_patient_id" "uuid", "p_doctor_id" "uuid", "p_drug_list" "text", "p_date_issued" timestamp with time zone) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_contact_messages"("limit_count" integer DEFAULT 50) RETURNS SETOF "public"."contact_messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    RETURN QUERY
    SELECT *
    FROM public.contact_messages
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(limit_count, 200));
  END;
  $$;


ALTER FUNCTION "public"."get_contact_messages"("limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_contact_messages_inbox"("search_term" "text" DEFAULT NULL::"text", "start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "limit_count" integer DEFAULT 20, "offset_count" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "email" "text", "phone" "text", "subject" "text", "message" "text", "created_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    RETURN QUERY
    SELECT
      cm.id,
      cm.first_name,
      cm.last_name,
      cm.email,
      cm.phone,
      cm.subject,
      cm.message,
      cm.created_at,
      COUNT(*) OVER() AS total_count
    FROM public.contact_messages cm
    WHERE
      (search_term IS NULL OR (
        cm.first_name ILIKE '%' || search_term || '%'
        OR cm.last_name ILIKE '%' || search_term || '%'
        OR cm.email ILIKE '%' || search_term || '%'
        OR cm.subject ILIKE '%' || search_term || '%'
        OR cm.message ILIKE '%' || search_term || '%'
      ))
      AND (start_date IS NULL OR cm.created_at >= start_date)
    ORDER BY cm.created_at DESC
    LIMIT GREATEST(1, LEAST(limit_count, 100))
    OFFSET GREATEST(0, offset_count);
  END;
  $$;


ALTER FUNCTION "public"."get_contact_messages_inbox"("search_term" "text", "start_date" timestamp with time zone, "limit_count" integer, "offset_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_doctor_registration_approved"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.verification_status = 'approved') THEN
    INSERT INTO public.doctors (
      id, name, specialty, rate_per_consultation, bio, phone, email, avatar_url, is_active, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      NEW.full_name,
      NEW.specialty,
      NEW.rate_per_consultation,
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
      rate_per_consultation = EXCLUDED.rate_per_consultation,
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
  ELSIF (TG_OP = 'UPDATE' AND NEW.verification_status = 'approved' AND (OLD.verification_status IS DISTINCT FROM NEW.verification_status)) THEN
    INSERT INTO public.doctors (
      id, name, specialty, rate_per_consultation, bio, phone, email, avatar_url, is_active, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      NEW.full_name,
      NEW.specialty,
      NEW.rate_per_consultation,
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
      rate_per_consultation = EXCLUDED.rate_per_consultation,
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
$$;


ALTER FUNCTION "public"."handle_doctor_registration_approved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_doctor_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only create doctor profile if user_metadata has role = 'doctor'
  IF NEW.raw_user_meta_data->>'role' = 'doctor' THEN
    INSERT INTO public.doctors (id, name, email, is_active)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NEW.email,
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_doctor_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'patient')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_prescription_downloaded"("p_note_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  caller UUID := auth.uid()::uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_note_ids IS NULL OR array_length(p_note_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.prescription_verifications
  SET
    is_downloaded = true,
    downloaded_at = COALESCE(downloaded_at, now()),
    updated_at = now()
  WHERE note_id = ANY(p_note_ids)
    AND patient_id = caller;
END;
$$;


ALTER FUNCTION "public"."mark_prescription_downloaded"("p_note_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_payments_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_payments_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.doctors (id, name, specialty, email, phone, avatar_url, is_active)
  VALUES (p_doctor_id, p_name, p_specialty, p_email, p_phone, p_avatar_url, p_is_active)
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(p_name, doctors.name),
    specialty = COALESCE(p_specialty, doctors.specialty),
    email = COALESCE(p_email, doctors.email),
    phone = COALESCE(p_phone, doctors.phone),
    avatar_url = COALESCE(p_avatar_url, doctors.avatar_url),
    is_active = COALESCE(p_is_active, doctors.is_active),
    updated_at = now();
END;
$$;


ALTER FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean, "p_rate_per_consultation" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.doctors (
    id, name, specialty, email, phone, avatar_url, is_active, rate_per_consultation
  )
  VALUES (
    p_doctor_id, p_name, p_specialty, p_email, p_phone, p_avatar_url, p_is_active, p_rate_per_consultation
  )
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(p_name, doctors.name),
    specialty = COALESCE(p_specialty, doctors.specialty),
    email = COALESCE(p_email, doctors.email),
    phone = COALESCE(p_phone, doctors.phone),
    avatar_url = COALESCE(p_avatar_url, doctors.avatar_url),
    is_active = COALESCE(p_is_active, doctors.is_active),
    rate_per_consultation = COALESCE(p_rate_per_consultation, doctors.rate_per_consultation),
    updated_at = now();
END;
$$;


ALTER FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean, "p_rate_per_consultation" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_prescription_public"("p_code" "text") RETURNS TABLE("code" "text", "patient_name" "text", "drug_list" "text", "date_issued" timestamp with time zone, "prescribing_doctor" "text", "doctor_license_status" "text", "prescription_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    pv.code,
    COALESCE(pr.full_name, 'Patient') AS patient_name,
    pv.drug_list,
    pv.date_issued,
    COALESCE(dr.full_name, 'Doctor') AS prescribing_doctor,
    COALESCE(initcap(dr.verification_status), 'Unknown') AS doctor_license_status,
    CASE
      WHEN pv.status = 'dispensed' OR pv.is_downloaded THEN 'Dispensed'
      WHEN COALESCE(pv.expires_at, pv.date_issued + INTERVAL '90 days') < now() THEN 'Expired'
      WHEN pv.status = 'expired' THEN 'Expired'
      ELSE 'Active'
    END AS prescription_status
  FROM public.prescription_verifications pv
  LEFT JOIN public.patient_registrations pr ON pr.user_id = pv.patient_id
  LEFT JOIN public.doctor_registrations dr ON dr.user_id = pv.doctor_id
  WHERE upper(pv.code) = upper(p_code)
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."verify_prescription_public"("p_code" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid",
    "patient_name" "text",
    "specialist_name" "text",
    "date" "date",
    "time" "text",
    "notes" "text",
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "doctor_id" "uuid",
    "rating" integer,
    "review_comment" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "appointments_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."appointments"."rating" IS 'Patient rating for the doctor (1-5 stars) after completed appointment';



COMMENT ON COLUMN "public"."appointments"."review_comment" IS 'Patient review comment for the doctor after completed appointment';



CREATE TABLE IF NOT EXISTS "public"."doctor_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "full_name" "text" NOT NULL,
    "gender" "text" NOT NULL,
    "age" integer NOT NULL,
    "phone_number" "text" NOT NULL,
    "email" "text",
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "country" "text" NOT NULL,
    "marital_status" "text" NOT NULL,
    "hospital_affiliation" "text" NOT NULL,
    "specialty" "text" NOT NULL,
    "profile_picture_url" "text",
    "medical_license_url" "text" NOT NULL,
    "identification_type" "text" NOT NULL,
    "identification_number" "text" NOT NULL,
    "verification_status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "verification_notes" "text",
    "verified_at" timestamp with time zone,
    "experience" "text",
    "bio" "text",
    "rate_per_consultation" numeric(10,2),
    CONSTRAINT "doctor_registrations_age_check" CHECK ((("age" > 0) AND ("age" < 150))),
    CONSTRAINT "doctor_registrations_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text"]))),
    CONSTRAINT "doctor_registrations_identification_type_check" CHECK (("identification_type" = ANY (ARRAY['nin'::"text", 'passport'::"text"]))),
    CONSTRAINT "doctor_registrations_marital_status_check" CHECK (("marital_status" = ANY (ARRAY['single'::"text", 'married'::"text", 'divorced'::"text", 'widowed'::"text"]))),
    CONSTRAINT "doctor_registrations_rate_per_consultation_positive" CHECK ((("rate_per_consultation" IS NULL) OR ("rate_per_consultation" > (0)::numeric))),
    CONSTRAINT "doctor_registrations_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."doctor_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "day_of_week" integer,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "slot_duration_minutes" integer DEFAULT 30,
    "max_patients_per_slot" integer DEFAULT 1,
    "is_available" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "doctor_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."doctor_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctors" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "specialty" "text",
    "email" "text",
    "phone" "text",
    "bio" "text",
    "avatar_url" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "rate_per_consultation" numeric(10,2),
    CONSTRAINT "doctors_rate_per_consultation_positive" CHECK ((("rate_per_consultation" IS NULL) OR ("rate_per_consultation" > (0)::numeric)))
);


ALTER TABLE "public"."doctors" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."available_slots" WITH ("security_invoker"='on') AS
 SELECT "ds"."id" AS "schedule_id",
    "d"."id" AS "doctor_id",
    "d"."name" AS "doctor_name",
    COALESCE("dr"."specialty", "d"."specialty") AS "specialty",
    "ds"."day_of_week",
    "ds"."start_time",
    "ds"."end_time",
    "ds"."slot_duration_minutes",
    "ds"."max_patients_per_slot",
    COALESCE("count"("a"."id"), (0)::bigint) AS "booked_count",
    ("ds"."max_patients_per_slot" - COALESCE("count"("a"."id"), (0)::bigint)) AS "available_slots"
   FROM ((("public"."doctor_schedules" "ds"
     JOIN "public"."doctors" "d" ON (("ds"."doctor_id" = "d"."id")))
     LEFT JOIN "public"."doctor_registrations" "dr" ON (("dr"."user_id" = "d"."id")))
     LEFT JOIN "public"."appointments" "a" ON ((("d"."id" = "a"."doctor_id") AND (EXTRACT(dow FROM "a"."date") = ("ds"."day_of_week")::numeric) AND ("a"."time" >= ("ds"."start_time")::"text") AND ("a"."time" < (("ds"."end_time" - "make_interval"("mins" => "ds"."slot_duration_minutes")))::"text") AND ("a"."status" <> 'cancelled'::"text"))))
  WHERE (("ds"."is_available" = true) AND ("d"."is_active" = true) AND (("dr"."verification_status" = 'approved'::"text") OR ("dr"."verification_status" IS NULL)))
  GROUP BY "ds"."id", "d"."id", "d"."name", "d"."specialty", "dr"."specialty", "ds"."day_of_week", "ds"."start_time", "ds"."end_time", "ds"."slot_duration_minutes", "ds"."max_patients_per_slot";


ALTER VIEW "public"."available_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_role" "text" NOT NULL,
    "sender_name" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "file_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "consultation_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'file'::"text", 'system'::"text"]))),
    CONSTRAINT "consultation_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['patient'::"text", 'doctor'::"text"])))
);


ALTER TABLE "public"."consultation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultation_recordings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "recording_url" "text",
    "duration_seconds" integer,
    "file_size_mb" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."consultation_recordings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultation_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "consultation_type" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "consultation_sessions_consultation_type_check" CHECK (("consultation_type" = ANY (ARRAY['video'::"text", 'audio'::"text", 'chat'::"text"]))),
    CONSTRAINT "consultation_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'ended'::"text", 'paused'::"text", 'waiting'::"text"]))),
    CONSTRAINT "consultation_sessions_status_check1" CHECK (("status" = ANY (ARRAY['active'::"text", 'ended'::"text", 'paused'::"text", 'waiting'::"text"])))
);


ALTER TABLE "public"."consultation_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_consultation_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "diagnosis" "text",
    "prescriptions" "text",
    "treatment_plan" "text",
    "follow_up_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."doctor_consultation_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."health_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text",
    "file_size" integer,
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."health_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "patient_type" "text" NOT NULL,
    "medical_history" "text",
    "allergies" "text",
    "current_medications" "text",
    "previous_diagnoses" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "presenting_complaint" "text",
    "history_of_presenting_complaint" "text",
    "past_medical_history" "text",
    "past_drug_history" "text",
    "family_social_history" "text",
    "clinical_examination" "text",
    "assessment" "text",
    "treatment_plan" "text",
    "investigations" "text",
    "e_prescription" "text",
    CONSTRAINT "patient_folders_patient_type_check" CHECK (("patient_type" = ANY (ARRAY['new'::"text", 'returning'::"text"])))
);


ALTER TABLE "public"."patient_folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "profile_picture_url" "text",
    "full_name" "text" NOT NULL,
    "gender" "text" NOT NULL,
    "age" integer NOT NULL,
    "phone_number" "text" NOT NULL,
    "email" "text",
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "country" "text" NOT NULL,
    "marital_status" "text" NOT NULL,
    "emergency_contact_name" "text" NOT NULL,
    "emergency_contact_phone" "text" NOT NULL,
    "identification_type" "text" NOT NULL,
    "identification_number" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "verification_status" "text" DEFAULT 'pending'::"text",
    "blood_type" "text",
    CONSTRAINT "patient_registrations_age_check" CHECK ((("age" > 0) AND ("age" < 150))),
    CONSTRAINT "patient_registrations_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text"]))),
    CONSTRAINT "patient_registrations_identification_type_check" CHECK (("identification_type" = ANY (ARRAY['nin'::"text", 'student_id'::"text", 'passport'::"text", 'drivers_license'::"text", 'voters_card'::"text", 'hospital_id'::"text"]))),
    CONSTRAINT "patient_registrations_marital_status_check" CHECK (("marital_status" = ANY (ARRAY['single'::"text", 'married'::"text", 'divorced'::"text", 'widowed'::"text"]))),
    CONSTRAINT "patient_registrations_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."patient_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "appointment_id" "uuid",
    "patient_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "payment_reference" character varying(255) NOT NULL,
    "payment_method" character varying(50) DEFAULT 'paystack'::character varying NOT NULL,
    "status" character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    "payment_date" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescription_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "note_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "patient_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "drug_list" "text" NOT NULL,
    "date_issued" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_downloaded" boolean DEFAULT false NOT NULL,
    "downloaded_at" timestamp with time zone,
    CONSTRAINT "prescription_verifications_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'dispensed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."prescription_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['patient'::"text", 'doctor'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webrtc_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "signal_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webrtc_signals" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultation_messages"
    ADD CONSTRAINT "consultation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultation_recordings"
    ADD CONSTRAINT "consultation_recordings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultation_sessions"
    ADD CONSTRAINT "consultation_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_consultation_notes"
    ADD CONSTRAINT "doctor_consultation_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_registrations"
    ADD CONSTRAINT "doctor_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_registrations"
    ADD CONSTRAINT "doctor_registrations_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_doctor_id_day_of_week_start_time_end_time_key" UNIQUE ("doctor_id", "day_of_week", "start_time", "end_time");



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."health_records"
    ADD CONSTRAINT "health_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_folders"
    ADD CONSTRAINT "patient_folders_patient_id_key" UNIQUE ("patient_id");



ALTER TABLE ONLY "public"."patient_folders"
    ADD CONSTRAINT "patient_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_registrations"
    ADD CONSTRAINT "patient_registrations_identification_type_identification_nu_key" UNIQUE ("identification_type", "identification_number");



ALTER TABLE ONLY "public"."patient_registrations"
    ADD CONSTRAINT "patient_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_registrations"
    ADD CONSTRAINT "patient_registrations_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payment_reference_key" UNIQUE ("payment_reference");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescription_verifications"
    ADD CONSTRAINT "prescription_verifications_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."prescription_verifications"
    ADD CONSTRAINT "prescription_verifications_note_id_key" UNIQUE ("note_id");



ALTER TABLE ONLY "public"."prescription_verifications"
    ADD CONSTRAINT "prescription_verifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webrtc_signals"
    ADD CONSTRAINT "webrtc_signals_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_appointments_date" ON "public"."appointments" USING "btree" ("date");



CREATE INDEX "idx_appointments_doctor_id" ON "public"."appointments" USING "btree" ("doctor_id");



CREATE INDEX "idx_appointments_doctor_id_status" ON "public"."appointments" USING "btree" ("doctor_id", "status");



CREATE INDEX "idx_appointments_patient_id" ON "public"."appointments" USING "btree" ("patient_id");



CREATE INDEX "idx_consultation_messages_created_at" ON "public"."consultation_messages" USING "btree" ("created_at");



CREATE INDEX "idx_consultation_messages_sender_id" ON "public"."consultation_messages" USING "btree" ("sender_id");



CREATE INDEX "idx_consultation_messages_session_id" ON "public"."consultation_messages" USING "btree" ("session_id");



CREATE INDEX "idx_consultation_recordings_session_id" ON "public"."consultation_recordings" USING "btree" ("session_id");



CREATE INDEX "idx_consultation_sessions_appointment_id" ON "public"."consultation_sessions" USING "btree" ("appointment_id");



CREATE INDEX "idx_consultation_sessions_doctor_id" ON "public"."consultation_sessions" USING "btree" ("doctor_id");



CREATE INDEX "idx_consultation_sessions_patient_id" ON "public"."consultation_sessions" USING "btree" ("patient_id");



CREATE INDEX "idx_consultation_sessions_started_at" ON "public"."consultation_sessions" USING "btree" ("started_at");



CREATE INDEX "idx_consultation_sessions_status" ON "public"."consultation_sessions" USING "btree" ("status");



CREATE INDEX "idx_doctor_consultation_notes_doctor_id" ON "public"."doctor_consultation_notes" USING "btree" ("doctor_id");



CREATE INDEX "idx_doctor_consultation_notes_patient_id" ON "public"."doctor_consultation_notes" USING "btree" ("patient_id");



CREATE INDEX "idx_doctor_consultation_notes_session_id" ON "public"."doctor_consultation_notes" USING "btree" ("session_id");



CREATE INDEX "idx_doctor_schedules_day_of_week" ON "public"."doctor_schedules" USING "btree" ("day_of_week");



CREATE INDEX "idx_doctor_schedules_doctor_id" ON "public"."doctor_schedules" USING "btree" ("doctor_id");



CREATE INDEX "idx_doctor_schedules_is_available" ON "public"."doctor_schedules" USING "btree" ("is_available");



CREATE INDEX "idx_doctors_email" ON "public"."doctors" USING "btree" ("email");



CREATE INDEX "idx_doctors_is_active" ON "public"."doctors" USING "btree" ("is_active");



CREATE INDEX "idx_doctors_specialty" ON "public"."doctors" USING "btree" ("specialty");



CREATE INDEX "idx_health_records_patient_id" ON "public"."health_records" USING "btree" ("patient_id");



CREATE INDEX "idx_patient_folders_patient_id" ON "public"."patient_folders" USING "btree" ("patient_id");



CREATE INDEX "idx_patient_folders_patient_type" ON "public"."patient_folders" USING "btree" ("patient_type");



CREATE INDEX "idx_payments_appointment_id" ON "public"."payments" USING "btree" ("appointment_id");



CREATE INDEX "idx_payments_patient_id" ON "public"."payments" USING "btree" ("patient_id");



CREATE INDEX "idx_payments_reference" ON "public"."payments" USING "btree" ("payment_reference");



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("status");



CREATE INDEX "idx_prescription_verifications_code" ON "public"."prescription_verifications" USING "btree" ("code");



CREATE INDEX "idx_prescription_verifications_doctor_id" ON "public"."prescription_verifications" USING "btree" ("doctor_id");



CREATE INDEX "idx_prescription_verifications_note_id" ON "public"."prescription_verifications" USING "btree" ("note_id");



CREATE INDEX "idx_prescription_verifications_patient_id" ON "public"."prescription_verifications" USING "btree" ("patient_id");



CREATE INDEX "idx_webrtc_signals_created_at" ON "public"."webrtc_signals" USING "btree" ("created_at");



CREATE INDEX "idx_webrtc_signals_session_id" ON "public"."webrtc_signals" USING "btree" ("session_id");



CREATE OR REPLACE TRIGGER "doctor_registrations_sync_trigger" AFTER INSERT OR UPDATE ON "public"."doctor_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_doctor_registration_approved"();



CREATE OR REPLACE TRIGGER "payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_payments_updated_at"();



CREATE OR REPLACE TRIGGER "set_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "update_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_doctor_registrations_updated_at" BEFORE UPDATE ON "public"."doctor_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_patient_registrations_updated_at" BEFORE UPDATE ON "public"."patient_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."consultation_recordings"
    ADD CONSTRAINT "consultation_recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultation_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultation_sessions"
    ADD CONSTRAINT "consultation_sessions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_consultation_notes"
    ADD CONSTRAINT "doctor_consultation_notes_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_consultation_notes"
    ADD CONSTRAINT "doctor_consultation_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_consultation_notes"
    ADD CONSTRAINT "doctor_consultation_notes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultation_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_registrations"
    ADD CONSTRAINT "doctor_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctors"
    ADD CONSTRAINT "doctors_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."health_records"
    ADD CONSTRAINT "health_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_folders"
    ADD CONSTRAINT "patient_folders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_registrations"
    ADD CONSTRAINT "patient_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_verifications"
    ADD CONSTRAINT "prescription_verifications_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_verifications"
    ADD CONSTRAINT "prescription_verifications_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "public"."doctor_consultation_notes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_verifications"
    ADD CONSTRAINT "prescription_verifications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_verifications"
    ADD CONSTRAINT "prescription_verifications_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultation_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webrtc_signals"
    ADD CONSTRAINT "webrtc_signals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."consultation_sessions"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can read all appointments" ON "public"."appointments" FOR SELECT USING (true);



CREATE POLICY "Allow authenticated insert own doctor" ON "public"."doctors" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow authenticated update own doctor" ON "public"."doctors" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow creating consultation sessions" ON "public"."consultation_sessions" FOR INSERT WITH CHECK (((("auth"."uid"() = "patient_id") OR ("auth"."uid"() = "doctor_id")) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "Allow doctors delete own schedules" ON "public"."doctor_schedules" FOR DELETE USING (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Allow doctors insert own schedules" ON "public"."doctor_schedules" FOR INSERT WITH CHECK (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Allow doctors to insert consultation notes" ON "public"."doctor_consultation_notes" FOR INSERT WITH CHECK ((("doctor_id" = "auth"."uid"()) AND ("session_id" IN ( SELECT "consultation_sessions"."id"
   FROM "public"."consultation_sessions"
  WHERE ("consultation_sessions"."doctor_id" = "auth"."uid"())))));



CREATE POLICY "Allow doctors to insert own registration" ON "public"."doctor_registrations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow doctors to update own notes" ON "public"."doctor_consultation_notes" FOR UPDATE USING (("doctor_id" = "auth"."uid"())) WITH CHECK (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Allow doctors to update own registration" ON "public"."doctor_registrations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow doctors to view own notes" ON "public"."doctor_consultation_notes" FOR SELECT USING (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Allow doctors to view own registration" ON "public"."doctor_registrations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow doctors to view patient folders" ON "public"."patient_folders" FOR SELECT USING ((("patient_id" IN ( SELECT DISTINCT "consultation_sessions"."patient_id"
   FROM "public"."consultation_sessions"
  WHERE ("consultation_sessions"."doctor_id" = "auth"."uid"()))) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "Allow doctors to view patient folders for booked appointments" ON "public"."patient_folders" FOR SELECT USING ((("patient_id" IN ( SELECT DISTINCT "a"."patient_id"
   FROM "public"."appointments" "a"
  WHERE ("a"."doctor_id" = "auth"."uid"()))) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "Allow doctors update own schedules" ON "public"."doctor_schedules" FOR UPDATE USING (("doctor_id" = "auth"."uid"())) WITH CHECK (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Allow doctors update their appointments" ON "public"."appointments" FOR UPDATE USING ((("doctor_id" = "auth"."uid"()) OR ("patient_id" = "auth"."uid"()))) WITH CHECK ((("doctor_id" = "auth"."uid"()) OR ("patient_id" = "auth"."uid"())));



CREATE POLICY "Allow doctors view own profile" ON "public"."doctors" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Allow doctors view their appointments" ON "public"."appointments" FOR SELECT USING ((("doctor_id" = "auth"."uid"()) OR ("patient_id" = "auth"."uid"()) OR (("patient_id" IS NULL) AND ("doctor_id" IS NULL))));



CREATE POLICY "Allow patients to insert own folder" ON "public"."patient_folders" FOR INSERT WITH CHECK (("patient_id" = "auth"."uid"()));



CREATE POLICY "Allow patients to update own folder" ON "public"."patient_folders" FOR UPDATE USING (("patient_id" = "auth"."uid"())) WITH CHECK (("patient_id" = "auth"."uid"()));



CREATE POLICY "Allow patients to view own consultation notes" ON "public"."doctor_consultation_notes" FOR SELECT USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Allow patients to view own folder" ON "public"."patient_folders" FOR SELECT USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Allow public insert contact messages" ON "public"."contact_messages" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow public read access to appointments" ON "public"."appointments" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to doctor registrations" ON "public"."doctor_registrations" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to patient registrations" ON "public"."patient_registrations" FOR SELECT USING (true);



CREATE POLICY "Allow public select doctors" ON "public"."doctors" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Allow public select schedules" ON "public"."doctor_schedules" FOR SELECT USING (true);



CREATE POLICY "Allow service role read contact messages" ON "public"."contact_messages" FOR SELECT USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Allow updating own sessions" ON "public"."consultation_sessions" FOR UPDATE USING ((("patient_id" = "auth"."uid"()) OR ("doctor_id" = "auth"."uid"()) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "Allow users to view their sessions" ON "public"."consultation_sessions" FOR SELECT USING ((("patient_id" = "auth"."uid"()) OR ("doctor_id" = "auth"."uid"()) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "Allow viewing own recordings" ON "public"."consultation_recordings" FOR SELECT USING ((("session_id" IN ( SELECT "consultation_sessions"."id"
   FROM "public"."consultation_sessions"
  WHERE (("consultation_sessions"."patient_id" = "auth"."uid"()) OR ("consultation_sessions"."doctor_id" = "auth"."uid"())))) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "Doctors can update own prescription verifications" ON "public"."prescription_verifications" FOR UPDATE USING (("doctor_id" = "auth"."uid"())) WITH CHECK (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Doctors can update their appointments" ON "public"."appointments" FOR UPDATE USING (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Doctors can view appointment payments" ON "public"."payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."appointments"
  WHERE (("appointments"."id" = "payments"."appointment_id") AND ("appointments"."doctor_id" = "auth"."uid"())))));



CREATE POLICY "Doctors can view own prescription verifications" ON "public"."prescription_verifications" FOR SELECT USING (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Doctors can view patient health records" ON "public"."health_records" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."appointments"
  WHERE (("appointments"."patient_id" = "health_records"."patient_id") AND ("appointments"."doctor_id" = "auth"."uid"())))));



CREATE POLICY "Doctors can view their appointments" ON "public"."appointments" FOR SELECT USING (("doctor_id" = "auth"."uid"()));



CREATE POLICY "Doctors can view their patients' registration data" ON "public"."patient_registrations" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."appointments"
  WHERE (("appointments"."patient_id" = "patient_registrations"."user_id") AND ("appointments"."doctor_id" = "auth"."uid"()))))));



CREATE POLICY "Enable delete for own messages" ON "public"."consultation_messages" FOR DELETE USING (("sender_id" = "auth"."uid"()));



CREATE POLICY "Enable insert for authenticated users" ON "public"."consultation_messages" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for all users" ON "public"."consultation_messages" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable update for own messages" ON "public"."consultation_messages" FOR UPDATE USING (("sender_id" = "auth"."uid"()));



CREATE POLICY "Patients can delete own appointments" ON "public"."appointments" FOR DELETE USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Patients can delete own health records" ON "public"."health_records" FOR DELETE USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patients can insert own appointments" ON "public"."appointments" FOR INSERT WITH CHECK (("patient_id" = "auth"."uid"()));



CREATE POLICY "Patients can update own appointments" ON "public"."appointments" FOR UPDATE USING (("patient_id" = "auth"."uid"())) WITH CHECK (("patient_id" = "auth"."uid"()));



CREATE POLICY "Patients can upload own health records" ON "public"."health_records" FOR INSERT WITH CHECK (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patients can view own appointments" ON "public"."appointments" FOR SELECT USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Patients can view own health records" ON "public"."health_records" FOR SELECT USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patients can view own payments" ON "public"."payments" FOR SELECT USING (("auth"."uid"() = "patient_id"));



CREATE POLICY "Patients can view own prescription verifications" ON "public"."prescription_verifications" FOR SELECT USING (("patient_id" = "auth"."uid"()));



CREATE POLICY "Service role can insert payments" ON "public"."payments" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can insert own doctor registration" ON "public"."doctor_registrations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own registration" ON "public"."patient_registrations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own signals" ON "public"."webrtc_signals" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own doctor registration" ON "public"."doctor_registrations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own registration" ON "public"."patient_registrations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own doctor registration" ON "public"."doctor_registrations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view signals for their sessions" ON "public"."webrtc_signals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."consultation_sessions" "cs"
  WHERE (("cs"."id" = "webrtc_signals"."session_id") AND (("cs"."patient_id" = "auth"."uid"()) OR ("cs"."doctor_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their own registration" ON "public"."patient_registrations" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultation_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultation_recordings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultation_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_consultation_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prescription_verifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webrtc_signals" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."appointments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."consultation_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."consultation_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."doctor_registrations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."webrtc_signals";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."_generate_unique_rx_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."_generate_unique_rx_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_generate_unique_rx_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_user"("user_id_to_delete" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("user_id_to_delete" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("user_id_to_delete" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_doctor_registration"("p_user_id" "uuid", "p_verification_status" "text", "p_verification_notes" "text", "p_verified_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_doctor_registration"("p_user_id" "uuid", "p_verification_status" "text", "p_verification_notes" "text", "p_verified_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_doctor_registration"("p_user_id" "uuid", "p_verification_status" "text", "p_verification_notes" "text", "p_verified_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_patient_registration_from_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_patient_registration_from_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_patient_registration_from_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."doctor_append_to_patient_folder"("p_patient_id" "uuid", "p_note_text" "text", "p_presenting_complaint" "text", "p_history_of_presenting_complaint" "text", "p_past_medical_history" "text", "p_past_drug_history" "text", "p_allergies" "text", "p_family_social_history" "text", "p_clinical_examination" "text", "p_assessment" "text", "p_treatment_plan" "text", "p_investigations" "text", "p_e_prescription" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."doctor_append_to_patient_folder"("p_patient_id" "uuid", "p_note_text" "text", "p_presenting_complaint" "text", "p_history_of_presenting_complaint" "text", "p_past_medical_history" "text", "p_past_drug_history" "text", "p_allergies" "text", "p_family_social_history" "text", "p_clinical_examination" "text", "p_assessment" "text", "p_treatment_plan" "text", "p_investigations" "text", "p_e_prescription" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."doctor_append_to_patient_folder"("p_patient_id" "uuid", "p_note_text" "text", "p_presenting_complaint" "text", "p_history_of_presenting_complaint" "text", "p_past_medical_history" "text", "p_past_drug_history" "text", "p_allergies" "text", "p_family_social_history" "text", "p_clinical_examination" "text", "p_assessment" "text", "p_treatment_plan" "text", "p_investigations" "text", "p_e_prescription" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_patient_registration"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text", "p_email" "text", "p_gender" "text", "p_age" integer, "p_city" "text", "p_state" "text", "p_country" "text", "p_marital_status" "text", "p_emergency_contact_name" "text", "p_emergency_contact_phone" "text", "p_identification_type" "text", "p_identification_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_patient_registration"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text", "p_email" "text", "p_gender" "text", "p_age" integer, "p_city" "text", "p_state" "text", "p_country" "text", "p_marital_status" "text", "p_emergency_contact_name" "text", "p_emergency_contact_phone" "text", "p_identification_type" "text", "p_identification_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_patient_registration"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text", "p_email" "text", "p_gender" "text", "p_age" integer, "p_city" "text", "p_state" "text", "p_country" "text", "p_marital_status" "text", "p_emergency_contact_name" "text", "p_emergency_contact_phone" "text", "p_identification_type" "text", "p_identification_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_prescription_verification"("p_note_id" "uuid", "p_session_id" "uuid", "p_patient_id" "uuid", "p_doctor_id" "uuid", "p_drug_list" "text", "p_date_issued" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_prescription_verification"("p_note_id" "uuid", "p_session_id" "uuid", "p_patient_id" "uuid", "p_doctor_id" "uuid", "p_drug_list" "text", "p_date_issued" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_prescription_verification"("p_note_id" "uuid", "p_session_id" "uuid", "p_patient_id" "uuid", "p_doctor_id" "uuid", "p_drug_list" "text", "p_date_issued" timestamp with time zone) TO "service_role";



GRANT ALL ON TABLE "public"."contact_messages" TO "anon";
GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_contact_messages"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_contact_messages"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_contact_messages"("limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_contact_messages_inbox"("search_term" "text", "start_date" timestamp with time zone, "limit_count" integer, "offset_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_contact_messages_inbox"("search_term" "text", "start_date" timestamp with time zone, "limit_count" integer, "offset_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_contact_messages_inbox"("search_term" "text", "start_date" timestamp with time zone, "limit_count" integer, "offset_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_doctor_registration_approved"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_doctor_registration_approved"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_doctor_registration_approved"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_doctor_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_doctor_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_doctor_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_prescription_downloaded"("p_note_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_prescription_downloaded"("p_note_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_prescription_downloaded"("p_note_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_payments_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_payments_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_payments_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean, "p_rate_per_consultation" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean, "p_rate_per_consultation" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_doctor_profile"("p_doctor_id" "uuid", "p_name" "text", "p_specialty" "text", "p_email" "text", "p_phone" "text", "p_avatar_url" "text", "p_is_active" boolean, "p_rate_per_consultation" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_prescription_public"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_prescription_public"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_prescription_public"("p_code" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_registrations" TO "anon";
GRANT ALL ON TABLE "public"."doctor_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_schedules" TO "anon";
GRANT ALL ON TABLE "public"."doctor_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."doctors" TO "anon";
GRANT ALL ON TABLE "public"."doctors" TO "authenticated";
GRANT ALL ON TABLE "public"."doctors" TO "service_role";



GRANT ALL ON TABLE "public"."available_slots" TO "anon";
GRANT ALL ON TABLE "public"."available_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."available_slots" TO "service_role";



GRANT ALL ON TABLE "public"."consultation_messages" TO "anon";
GRANT ALL ON TABLE "public"."consultation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."consultation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."consultation_recordings" TO "anon";
GRANT ALL ON TABLE "public"."consultation_recordings" TO "authenticated";
GRANT ALL ON TABLE "public"."consultation_recordings" TO "service_role";



GRANT ALL ON TABLE "public"."consultation_sessions" TO "anon";
GRANT ALL ON TABLE "public"."consultation_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."consultation_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_consultation_notes" TO "anon";
GRANT ALL ON TABLE "public"."doctor_consultation_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_consultation_notes" TO "service_role";



GRANT ALL ON TABLE "public"."health_records" TO "anon";
GRANT ALL ON TABLE "public"."health_records" TO "authenticated";
GRANT ALL ON TABLE "public"."health_records" TO "service_role";



GRANT ALL ON TABLE "public"."patient_folders" TO "anon";
GRANT ALL ON TABLE "public"."patient_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_folders" TO "service_role";



GRANT ALL ON TABLE "public"."patient_registrations" TO "anon";
GRANT ALL ON TABLE "public"."patient_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."prescription_verifications" TO "anon";
GRANT ALL ON TABLE "public"."prescription_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."prescription_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."webrtc_signals" TO "anon";
GRANT ALL ON TABLE "public"."webrtc_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."webrtc_signals" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































