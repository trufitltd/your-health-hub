-- One-time cleanup: remove duplicate clerking saves and dedupe repeated
-- patient_folders.medical_history entry blocks.
--
-- Why this is needed after db/29:
-- - db/29 collapses repeated headers inside a single text block.
-- - Some records still contain multiple full duplicate entries created by
--   repeated save clicks (same session + same content).

BEGIN;

-- Build a deduped medical_history text by keeping the first occurrence of each
-- (doctor_id + entry body) combination and dropping repeated copies.
CREATE OR REPLACE FUNCTION public._dedupe_medical_history_entries(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  ln TEXT;
  trimmed TEXT;
  header_match TEXT[];
  current_header TEXT := NULL;
  current_doctor TEXT := NULL;
  current_body TEXT := '';
  preamble TEXT := '';
  seen_keys TEXT[] := ARRAY[]::TEXT[];
  kept_entries TEXT[] := ARRAY[]::TEXT[];
  key TEXT;
  body_norm TEXT;
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN p_input;
  END IF;

  FOR ln IN
    SELECT * FROM regexp_split_to_table(p_input, E'\\r?\\n')
  LOOP
    trimmed := regexp_replace(ln, E'\\s+$', '');
    header_match := regexp_match(trimmed, '^---\\s*Entry:\\s*(.+?)\\s+by doctor:([0-9a-fA-F-]{36})\\s*$');

    IF header_match IS NOT NULL THEN
      -- flush previous entry before starting a new one
      IF current_header IS NOT NULL THEN
        body_norm := btrim(regexp_replace(current_body, E'\\s+', ' ', 'g'));
        key := current_doctor || '|' || md5(body_norm);
        IF NOT (key = ANY(seen_keys)) THEN
          seen_keys := array_append(seen_keys, key);
          kept_entries := array_append(
            kept_entries,
            current_header || E'\n' || btrim(current_body)
          );
        END IF;
      END IF;

      current_header := trimmed;
      current_doctor := header_match[2];
      current_body := '';
      CONTINUE;
    END IF;

    IF current_header IS NULL THEN
      IF btrim(trimmed) <> '' THEN
        preamble := CASE
          WHEN preamble = '' THEN trimmed
          ELSE preamble || E'\n' || trimmed
        END;
      END IF;
    ELSE
      current_body := CASE
        WHEN current_body = '' THEN COALESCE(trimmed, '')
        ELSE current_body || E'\n' || COALESCE(trimmed, '')
      END;
    END IF;
  END LOOP;

  -- flush trailing entry
  IF current_header IS NOT NULL THEN
    body_norm := btrim(regexp_replace(current_body, E'\\s+', ' ', 'g'));
    key := current_doctor || '|' || md5(body_norm);
    IF NOT (key = ANY(seen_keys)) THEN
      kept_entries := array_append(
        kept_entries,
        current_header || E'\n' || btrim(current_body)
      );
    END IF;
  END IF;

  IF array_length(kept_entries, 1) IS NULL THEN
    RETURN NULLIF(preamble, '');
  END IF;

  IF btrim(preamble) = '' THEN
    RETURN array_to_string(kept_entries, E'\n\n');
  END IF;

  RETURN preamble || E'\n\n' || array_to_string(kept_entries, E'\n\n');
END;
$$;

-- 1) Remove exact duplicate doctor_consultation_notes rows within the same
-- session/doctor/content group (keeps the earliest row, deletes the rest).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        session_id,
        doctor_id,
        COALESCE(diagnosis, ''),
        COALESCE(treatment_plan, ''),
        COALESCE(prescriptions, ''),
        COALESCE(follow_up_notes, '')
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.doctor_consultation_notes
)
DELETE FROM public.doctor_consultation_notes dcn
USING ranked r
WHERE dcn.id = r.id
  AND r.rn > 1;

-- 2) Dedupe repeated medical_history entry blocks in patient_folders.
UPDATE public.patient_folders
SET
  medical_history = public._dedupe_medical_history_entries(medical_history),
  updated_at = now()
WHERE medical_history IS NOT NULL
  AND medical_history <> public._dedupe_medical_history_entries(medical_history);

DROP FUNCTION public._dedupe_medical_history_entries(TEXT);

COMMIT;

