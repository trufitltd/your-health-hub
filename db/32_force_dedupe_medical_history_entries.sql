-- One-time cleanup: aggressively dedupe repeated medical_history entries
-- even when entry header formatting is inconsistent.
--
-- This migration is intentionally more tolerant than db/30 and db/31.

BEGIN;

CREATE OR REPLACE FUNCTION public._force_dedupe_medical_history_entries(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  ln TEXT;
  trimmed TEXT;
  header_match TEXT[];
  current_header TEXT := NULL;
  current_identity TEXT := NULL;
  current_body TEXT := '';
  preamble TEXT := '';
  kept_entries TEXT[] := ARRAY[]::TEXT[];
  seen_keys TEXT[] := ARRAY[]::TEXT[];
  body_norm TEXT;
  key TEXT;
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN p_input;
  END IF;

  FOR ln IN
    SELECT * FROM regexp_split_to_table(p_input, E'\\r?\\n')
  LOOP
    trimmed := regexp_replace(ln, E'^\\s+|\\s+$', '', 'g');

    -- Match all common header variants:
    --   --- Entry: ... by doctor:<uuid>
    --   Entry: ... by Dr. Name
    -- Also tolerates case and extra spaces.
    header_match := regexp_match(
      trimmed,
      '^(?:---\\s*)?entry:\\s*(.+?)\\s+by\\s+(?:doctor:([0-9a-fA-F-]{36})|(dr\\.?\\s+.+))\\s*$',
      'i'
    );

    IF header_match IS NOT NULL THEN
      IF current_header IS NOT NULL THEN
        body_norm := lower(btrim(regexp_replace(current_body, E'\\s+', ' ', 'g')));
        key := current_identity || '|' || md5(body_norm);
        IF NOT (key = ANY(seen_keys)) THEN
          seen_keys := array_append(seen_keys, key);
          kept_entries := array_append(
            kept_entries,
            current_header || E'\n' || btrim(current_body)
          );
        END IF;
      END IF;

      current_header := trimmed;
      current_identity := COALESCE(header_match[2], header_match[3], 'unknown');
      current_identity := lower(regexp_replace(current_identity, '[^a-z0-9]+', '', 'g'));
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
    body_norm := lower(btrim(regexp_replace(current_body, E'\\s+', ' ', 'g')));
    key := current_identity || '|' || md5(body_norm);
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
  medical_history = public._force_dedupe_medical_history_entries(medical_history),
  updated_at = now()
WHERE medical_history IS NOT NULL
  AND medical_history <> public._force_dedupe_medical_history_entries(medical_history);

DROP FUNCTION public._force_dedupe_medical_history_entries(TEXT);

COMMIT;
