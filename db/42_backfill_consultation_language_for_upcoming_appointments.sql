-- 42_backfill_consultation_language_for_upcoming_appointments.sql
-- One-time backfill to reliably persist consultation language for join/waiting flow.
--
-- Strategy per upcoming appointment:
-- 1) Keep existing language in price_breakdown (if present)
-- 2) Else parse language marker from notes (if present)
-- 3) Else use patient's preferred_language when doctor supports it
-- 4) Else use doctor's first preferred consultation language
-- 5) Else default to english
--
-- Persists result in:
-- - appointments.price_breakdown->consultation_language
-- - appointments.notes marker: [consultation_language:<value>]

WITH normalized AS (
  SELECT
    a.id,
    a.notes,
    COALESCE(a.price_breakdown, '{}'::jsonb) AS price_breakdown,
    a.doctor_id,
    a.patient_id,

    -- Existing language from json payload (supports multiple legacy/new keys)
    NULLIF(
      lower(
        regexp_replace(
          COALESCE(
            a.price_breakdown->>'consultation_language',
            a.price_breakdown->>'consultationLanguage',
            a.price_breakdown->>'selected_consultation_language',
            a.price_breakdown->>'selectedConsultationLanguage',
            a.price_breakdown->>'selected_language',
            a.price_breakdown->>'selectedLanguage',
            a.price_breakdown->>'language',
            a.price_breakdown->'metadata'->>'consultation_language',
            a.price_breakdown->'metadata'->>'consultationLanguage',
            a.price_breakdown->'metadata'->>'selected_consultation_language',
            a.price_breakdown->'metadata'->>'selectedConsultationLanguage',
            a.price_breakdown->'metadata'->>'selected_language',
            a.price_breakdown->'metadata'->>'selectedLanguage',
            a.price_breakdown->'metadata'->>'language',
            ''
          ),
          '[[:space:]-]+',
          '_',
          'g'
        )
      ),
      ''
    ) AS lang_from_json,

    -- Existing language marker in notes: [consultation_language:<value>]
    NULLIF(
      lower(
        regexp_replace(
          COALESCE(
            (regexp_match(COALESCE(a.notes, ''), '[[]consultation_language:([^]]+)[]]', 'i'))[1],
            ''
          ),
          '[[:space:]-]+',
          '_',
          'g'
        )
      ),
      ''
    ) AS lang_from_notes
  FROM public.appointments a
  WHERE a.date >= CURRENT_DATE
    AND COALESCE(a.status, '') IN ('pending_approval', 'confirmed', 'in_progress', 'pending_payment')
),
doctor_and_patient_lang AS (
  SELECT
    n.*,
    -- Merge preferred doctor languages from doctor_registrations + doctors
    ARRAY(
      SELECT DISTINCT normalized_lang
      FROM (
        SELECT NULLIF(
          lower(regexp_replace(COALESCE(lang, ''), '[[:space:]-]+', '_', 'g')),
          ''
        ) AS normalized_lang
        FROM unnest(
        COALESCE(dr.preferred_consultation_languages, '{}'::text[])
        || COALESCE(d.preferred_consultation_languages, '{}'::text[])
        ) AS lang
      ) normalized
      WHERE normalized_lang IS NOT NULL
    ) AS doctor_languages,
    NULLIF(
      lower(
        regexp_replace(
          COALESCE(pr.preferred_language, ''),
          '[[:space:]-]+',
          '_',
          'g'
        )
      ),
      ''
    ) AS patient_preferred_language
  FROM normalized n
  LEFT JOIN public.doctor_registrations dr ON dr.user_id = n.doctor_id
  LEFT JOIN public.doctors d ON d.id = n.doctor_id
  LEFT JOIN public.patient_registrations pr ON pr.user_id = n.patient_id
),
resolved AS (
  SELECT
    dpl.id,
    dpl.notes,
    dpl.price_breakdown,
    COALESCE(
      dpl.lang_from_json,
      dpl.lang_from_notes,
      CASE
        WHEN dpl.patient_preferred_language IS NOT NULL
             AND dpl.patient_preferred_language = ANY(dpl.doctor_languages)
          THEN dpl.patient_preferred_language
        ELSE NULL
      END,
      dpl.doctor_languages[1],
      'english'
    ) AS resolved_language
  FROM doctor_and_patient_lang dpl
)
UPDATE public.appointments a
SET
  price_breakdown = jsonb_set(
    COALESCE(a.price_breakdown, '{}'::jsonb),
    '{consultation_language}',
    to_jsonb(r.resolved_language),
    true
  ),
  notes = CASE
    WHEN COALESCE(a.notes, '') ~* '[[]consultation_language:[^]]+[]]'
      THEN regexp_replace(
        a.notes,
        '[[]consultation_language:[^]]+[]]',
        '[consultation_language:' || r.resolved_language || ']',
        'ig'
      )
    WHEN COALESCE(a.notes, '') = ''
      THEN '[consultation_language:' || r.resolved_language || ']'
    ELSE a.notes || E'\\n[consultation_language:' || r.resolved_language || ']'
  END
FROM resolved r
WHERE a.id = r.id
  AND (
    COALESCE(a.price_breakdown->>'consultation_language', '') IS DISTINCT FROM r.resolved_language
    OR COALESCE(a.notes, '') !~* ('[[]consultation_language:' || r.resolved_language || '[]]')
  );
