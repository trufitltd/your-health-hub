-- Fix schema drift: consultation_messages.session_id was created as text without FK
-- in the baseline snapshot migration. PostgREST needs a real FK to resolve
-- consultation_messages -> consultation_sessions embeds.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'consultation_messages'
      AND column_name = 'session_id'
      AND data_type = 'text'
  ) THEN
    -- Remove malformed or orphaned rows before casting to UUID.
    DELETE FROM public.consultation_messages cm
    WHERE trim(cm.session_id) = ''
      OR trim(cm.session_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR NOT EXISTS (
        SELECT 1
        FROM public.consultation_sessions cs
        WHERE cs.id::text = trim(cm.session_id)
      );

    ALTER TABLE public.consultation_messages
      ALTER COLUMN session_id TYPE uuid
      USING trim(session_id)::uuid;
  END IF;
END $$;

-- Ensure there are no orphaned rows if session_id was already uuid.
DELETE FROM public.consultation_messages cm
WHERE NOT EXISTS (
  SELECT 1
  FROM public.consultation_sessions cs
  WHERE cs.id = cm.session_id
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.consultation_messages'::regclass
      AND conname = 'consultation_messages_session_id_fkey'
  ) THEN
    ALTER TABLE public.consultation_messages
      ADD CONSTRAINT consultation_messages_session_id_fkey
      FOREIGN KEY (session_id)
      REFERENCES public.consultation_sessions(id)
      ON DELETE CASCADE;
  END IF;
END $$;
