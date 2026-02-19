-- Follow-up one-time cleanup for patient_folders.medical_history.
-- Dedupes repeated full clerking blocks that were appended multiple times.
--
-- This is intentionally more tolerant than db/30:
-- - supports both raw headers:
--     --- Entry: <timestamp> by doctor:<uuid>
--   and already-formatted headers:
--     Entry: <timestamp> by Dr. <name>
-- - dedupes by (doctor marker + normalized body), ignoring timestamp.

BEGIN;

CREATE OR REPLACE FUNCTION public._dedupe_history_blocks_v2(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  ln TEXT;
  line TEXT;
  raw_header_match TEXT[];
  formatted_header_match TEXT[];
  current_header TEXT := NULL;
  current_doctor_marker TEXT := NULL;
  current_body TEXT := '';
  preamble TEXT := '';
  out_blocks TEXT[] := ARRAY[]::TEXT[];
  seen_keys TEXT[] := ARRAY[]::TEXT[];
  norm_body TEXT;
  dedupe_key TEXT;
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN p_input;
  END IF;

  FOR ln IN
    SELECT * FROM regexp_split_to_table(p_input, E'\\r?\\n')
  LOOP
    line := regexp_replace(ln, E'\\s+$', '');

    raw_header_match := regexp_match(
      line,
      '^---\\s*Entry:\\s*(.+?)\\s+by doctor:([0-9a-fA-F-]{36})\\s*$'
    );
    formatted_header_match := regexp_match(
      line,
      '^Entry:\\s*(.+?)\\s+by\\s+Dr\\.\\s*(.+?)\\s*$'
    );

    IF raw_header_match IS NOT NULL OR formatted_header_match IS NOT NULL THEN
      -- flush active block
      IF current_header IS NOT NULL THEN
        norm_body := lower(btrim(regexp_replace(current_body, E'\\s+', ' ', 'g')));
        dedupe_key := COALESCE(current_doctor_marker, 'unknown') || '|' || md5(norm_body);
        IF NOT (dedupe_key = ANY(seen_keys)) THEN
          seen_keys := array_append(seen_keys, dedupe_key);
          out_blocks := array_append(out_blocks, current_header || E'\n' || btrim(current_body));
        END IF;
      END IF;

      current_header := line;
      current_doctor_marker := COALESCE(raw_header_match[2], formatted_header_match[2], 'unknown');
      current_body := '';
      CONTINUE;
    END IF;

    IF current_header IS NULL THEN
      IF btrim(line) <> '' THEN
        preamble := CASE
          WHEN preamble = '' THEN line
          ELSE preamble || E'\n' || line
        END;
      END IF;
    ELSE
      current_body := CASE
        WHEN current_body = '' THEN COALESCE(line, '')
        ELSE current_body || E'\n' || COALESCE(line, '')
      END;
    END IF;
  END LOOP;

  -- flush trailing block
  IF current_header IS NOT NULL THEN
    norm_body := lower(btrim(regexp_replace(current_body, E'\\s+', ' ', 'g')));
    dedupe_key := COALESCE(current_doctor_marker, 'unknown') || '|' || md5(norm_body);
    IF NOT (dedupe_key = ANY(seen_keys)) THEN
      out_blocks := array_append(out_blocks, current_header || E'\n' || btrim(current_body));
    END IF;
  END IF;

  IF array_length(out_blocks, 1) IS NULL THEN
    RETURN NULLIF(preamble, '');
  END IF;

  IF btrim(preamble) = '' THEN
    RETURN array_to_string(out_blocks, E'\n\n');
  END IF;

  RETURN preamble || E'\n\n' || array_to_string(out_blocks, E'\n\n');
END;
$$;

UPDATE public.patient_folders
SET
  medical_history = public._dedupe_history_blocks_v2(medical_history),
  updated_at = now()
WHERE medical_history IS NOT NULL
  AND medical_history <> public._dedupe_history_blocks_v2(medical_history);

DROP FUNCTION public._dedupe_history_blocks_v2(TEXT);

COMMIT;

