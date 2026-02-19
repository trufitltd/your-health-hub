-- One-time cleanup: dedupe repeated patient_folders.medical_history entries
-- for both legacy and human-readable entry header formats.
--
-- Handles headers like:
--   --- Entry: 18/02/2026, 20:32:53 by doctor:<uuid>
--   Entry: 18/02/2026, 20:32:53 by Dr. Firstname Lastname

BEGIN;

CREATE OR REPLACE FUNCTION public._dedupe_medical_history_all_entry_formats(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  ln TEXT;
  trimmed TEXT;
  legacy_match TEXT[];
  readable_match TEXT[];
  current_header TEXT := NULL;
  current_doctor_identity TEXT := NULL;
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
    legacy_match := regexp_match(
      trimmed,
      '^---\\s*Entry:\\s*(.+?)\\s+by doctor:([0-9a-fA-F-]{36})\\s*$'
    );
    readable_match := regexp_match(
      trimmed,
      '^Entry:\\s*(.+?)\\s+by\\s+(Dr\\.?\\s+.+?)\\s*$'
    );

    IF legacy_match IS NOT NULL OR readable_match IS NOT NULL THEN
      IF current_header IS NOT NULL THEN
        body_norm := lower(btrim(regexp_replace(current_body, E'\\s+', ' ', 'g')));
        key := current_doctor_identity || '|' || md5(body_norm);
        IF NOT (key = ANY(seen_keys)) THEN
          seen_keys := array_append(seen_keys, key);
          kept_entries := array_append(
            kept_entries,
            current_header || E'\n' || btrim(current_body)
          );
        END IF;
      END IF;

      current_header := trimmed;
      current_doctor_identity := CASE
        WHEN legacy_match IS NOT NULL THEN 'doctor:' || lower(legacy_match[2])
        ELSE lower(readable_match[2])
      END;
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

  IF current_header IS NOT NULL THEN
    body_norm := lower(btrim(regexp_replace(current_body, E'\\s+', ' ', 'g')));
    key := current_doctor_identity || '|' || md5(body_norm);
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

UPDATE public.patient_folders
SET
  medical_history = public._dedupe_medical_history_all_entry_formats(medical_history),
  updated_at = now()
WHERE medical_history IS NOT NULL
  AND medical_history <> public._dedupe_medical_history_all_entry_formats(medical_history);

DROP FUNCTION public._dedupe_medical_history_all_entry_formats(TEXT);

COMMIT;
