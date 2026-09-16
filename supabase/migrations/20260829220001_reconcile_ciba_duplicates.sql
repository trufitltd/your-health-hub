-- CIBA Duplicate Tenant Reconciliation
-- Canonical org: slug='ciba' (what CIBA frontend resolves to)
-- Duplicate org: slug='ciba-wellness-center' (created via Platform Admin UI)
--
-- Actions:
-- 1. Update canonical config to match UI-set values
-- 2. Move any members from duplicate to canonical
-- 3. Deactivate duplicate (NOT delete)

DO $$
DECLARE
  v_canonical_id UUID;
  v_duplicate_id UUID;
  v_count INTEGER;
  v_rec RECORD;
BEGIN
  -- 1. Find canonical (slug='ciba') and duplicate (slug='ciba-wellness-center')
  SELECT id INTO v_canonical_id FROM public.organisations WHERE slug = 'ciba';
  SELECT id INTO v_duplicate_id FROM public.organisations WHERE slug = 'ciba-wellness-center';

  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'Canonical CIBA org (slug=ciba) not found';
  END IF;

  IF v_duplicate_id IS NULL THEN
    RAISE NOTICE 'No duplicate found. Nothing to reconcile.';
    RETURN;
  END IF;

  RAISE NOTICE 'Canonical: % | Duplicate: %', v_canonical_id, v_duplicate_id;

  -- 2. Update canonical config to match UI-set values
  UPDATE public.organisation_config
  SET config_value = 'true'
  WHERE organisation_id = v_canonical_id AND config_key = 'show_doctor_directory';

  UPDATE public.organisation_config
  SET config_value = 'true'
  WHERE organisation_id = v_canonical_id AND config_key = 'show_ratings';

  UPDATE public.organisation_config
  SET config_value = 'true'
  WHERE organisation_id = v_canonical_id AND config_key = 'show_reviews';

  RAISE NOTICE 'Updated canonical config to match UI values';

  -- 3. Move any members from duplicate to canonical
  FOR v_rec IN
    SELECT user_id, role, active
    FROM public.organisation_members
    WHERE organisation_id = v_duplicate_id
  LOOP
    INSERT INTO public.organisation_members (organisation_id, user_id, role, active)
    VALUES (v_canonical_id, v_rec.user_id, v_rec.role, v_rec.active)
    ON CONFLICT (organisation_id, user_id, role) DO UPDATE
    SET active = EXCLUDED.active;
  END LOOP;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Moved % member records', v_count;

  -- 4. Move any doctors from duplicate to canonical
  UPDATE public.doctors SET organisation_id = v_canonical_id
  WHERE organisation_id = v_duplicate_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Moved % doctor records', v_count;

  -- 5. Move any appointments from duplicate to canonical
  UPDATE public.appointments SET organisation_id = v_canonical_id
  WHERE organisation_id = v_duplicate_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Moved % appointment records', v_count;

  -- 6. Deactivate duplicate
  UPDATE public.organisations
  SET active = false,
      name = name || ' [DEPRECATED - merged into ciba]'
  WHERE id = v_duplicate_id;

  RAISE NOTICE 'Deactivated duplicate: ciba-wellness-center';

  -- 7. Final verification
  RAISE NOTICE '=== RECONCILIATION COMPLETE ===';
  FOR v_rec IN
    SELECT slug, active::text FROM public.organisations
    WHERE lower(name) LIKE '%ciba%' OR lower(slug) LIKE '%ciba%'
  LOOP
    RAISE NOTICE '  org: % | active: %', v_rec.slug, v_rec.active;
  END LOOP;

END $$;
