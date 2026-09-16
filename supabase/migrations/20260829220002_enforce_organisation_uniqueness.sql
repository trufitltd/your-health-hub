-- Enforce slug uniqueness and domain uniqueness for organisations
-- This is a safety net: the slug UNIQUE constraint already exists,
-- but this adds a named constraint and a domain uniqueness index.

-- 1. Add a formal named unique constraint on slug (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organisations_slug_unique'
      AND conrelid = 'public.organisations'::regclass
  ) THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_slug_unique UNIQUE (slug);
    RAISE NOTICE 'Added unique constraint on organisations.slug';
  ELSE
    RAISE NOTICE 'Unique constraint on organisations.slug already exists';
  END IF;
END $$;

-- 2. Add a unique index on lower(slug) for case-insensitive uniqueness (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_organisations_slug_lower
  ON public.organisations (lower(slug));

-- 3. Add a unique index on lower(contact_email) domain for domain uniqueness (idempotent)
--    Only indexes non-null emails, extracts domain part
CREATE UNIQUE INDEX IF NOT EXISTS idx_organisations_email_domain
  ON public.organisations (lower(split_part(contact_email, '@', 2)))
  WHERE contact_email IS NOT NULL AND contact_email != '';

-- 4. Verify constraints
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '=== ORGANISATIONS UNIQUE CONSTRAINTS ===';
  FOR rec IN
    SELECT conname, contype
    FROM pg_constraint
    WHERE conrelid = 'public.organisations'::regclass
      AND contype IN ('u', 'p')
  LOOP
    RAISE NOTICE '  constraint=% type=%', rec.conname, rec.contype;
  END LOOP;

  RAISE NOTICE '=== ORGANISATIONS INDEXES ===';
  FOR rec IN
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'organisations'
      AND schemaname = 'public'
  LOOP
    RAISE NOTICE '  index=% | def=%', rec.indexname, rec.indexdef;
  END LOOP;
END $$;
