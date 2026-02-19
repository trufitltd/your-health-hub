-- One-time cleanup: aggressively dedupe repeated medical_history entry blocks.
-- Keeps first occurrence of each (doctor + canonicalized-body) block.
--
-- Canonicalization here is strict:
-- - lower-case
-- - remove all non-alphanumeric characters
-- This catches duplicates with small punctuation/spacing differences.

BEGIN;

CREATE OR REPLACE FUNCTION public._aggressive_dedupe_medical_history(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  ln TEXT;
  trimmed TEXT;
  raw_header_match TEXT[];
  readable_header_match TEXT[];
  current_header TEXT := NULL;
  current_doctor_marker TEXT := NULL;
  current_body TEXT := '';
  preamble TEXT := '';
  out_blocks TEXT[] := ARRAY[]::TEXT[];
  seen_keys TEXT[] := ARRAY[]::TEXT[];
  canonical_body TEXT;
  dedupe_key TEXT;
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN p_input;
  END IF;

  FOR ln IN
    SELECT * FROM regexp_split_to_table(p_input, E'\\r?\\n')
  LOOP
    trimmed := regexp_replace(ln, E'^\\s+|\\s+$', '', 'g');

    raw_header_match := regexp_match(
      trimmed,
      '^---\\s*Entry:\\s*(.+?)\\s+by doctor:([0-9a-fA-F-]{36})\\s*$'
    );
    readable_header_match := regexp_match(
      trimmed,
      '^Entry:\\s*(.+?)\\s+by\\s+(Dr\\.?\\s+.+?)\\s*$',
      'i'
    );

    IF raw_header_match IS NOT NULL OR readable_header_match IS NOT NULL THEN
      IF current_header IS NOT NULL THEN
        canonical_body := lower(regexp_replace(COALESCE(current_body, ''), '[^a-z0-9]+', '', 'g'));
        dedupe_key := COALESCE(current_doctor_marker, 'unknown') || '|' || md5(canonical_body);
        IF NOT (dedupe_key = ANY(seen_keys)) THEN
          seen_keys := array_append(seen_keys, dedupe_key);
          out_blocks := array_append(out_blocks, current_header || E'\n' || btrim(current_body));
        END IF;
      END IF;

      current_header := trimmed;
      current_doctor_marker := lower(COALESCE(raw_header_match[2], readable_header_match[2], 'unknown'));
      current_body := '';
      CONTINUE;
    END IF;

    IF current_header IS NULL THEN
      IF trimmed <> '' THEN
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
    canonical_body := lower(regexp_replace(COALESCE(current_body, ''), '[^a-z0-9]+', '', 'g'));
    dedupe_key := COALESCE(current_doctor_marker, 'unknown') || '|' || md5(canonical_body);
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
  medical_history = public._aggressive_dedupe_medical_history(medical_history),
  updated_at = now()
WHERE medical_history IS NOT NULL
  AND medical_history <> public._aggressive_dedupe_medical_history(medical_history);

DROP FUNCTION public._aggressive_dedupe_medical_history(TEXT);

COMMIT;
