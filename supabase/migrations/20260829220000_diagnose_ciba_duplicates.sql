-- Diagnostic: Identify all CIBA-related organisations and their dependencies
-- Returns actual result rows (not notices) for Supabase SQL Editor

-- 1. All organisations
SELECT 'ALL_ORGS' as section, id::text, name, slug, active::text, country_code, currency,
       created_at::text, updated_at::text
FROM public.organisations
ORDER BY created_at;

-- 2. CIBA-related organisations
SELECT 'CIBA_ORGS' as section, id::text, name, slug, active::text, created_at::text
FROM public.organisations
WHERE lower(name) LIKE '%ciba%' OR lower(slug) LIKE '%ciba%';

-- 3. Organisation config for CIBA orgs
SELECT 'CIBA_CONFIG' as section, o.slug, oc.config_key, oc.config_value
FROM public.organisations o
JOIN public.organisation_config oc ON oc.organisation_id = o.id
WHERE lower(o.name) LIKE '%ciba%' OR lower(o.slug) LIKE '%ciba%'
ORDER BY o.slug, oc.config_key;

-- 4. Organisation services for CIBA orgs
SELECT 'CIBA_SERVICES' as section, o.slug, os.name as service_name, os.id::text as service_id,
       os.default_duration_minutes::text, os.base_price::text, os.active::text, os.sort_order::text
FROM public.organisations o
JOIN public.organisation_services os ON os.organisation_id = o.id
WHERE lower(o.name) LIKE '%ciba%' OR lower(o.slug) LIKE '%ciba%'
ORDER BY o.slug, os.sort_order;

-- 5. Organisation members for CIBA orgs
SELECT 'CIBA_MEMBERS' as section, o.slug, om.user_id::text, om.role, om.active::text,
       om.created_at::text
FROM public.organisations o
JOIN public.organisation_members om ON om.organisation_id = o.id
WHERE lower(o.name) LIKE '%ciba%' OR lower(o.slug) LIKE '%ciba%'
ORDER BY o.slug, om.role;

-- 6. Doctors belonging to CIBA orgs
SELECT 'CIBA_DOCTORS' as section, o.slug, d.id::text as doctor_id, d.name, d.email,
       d.organisation_id::text
FROM public.organisations o
JOIN public.doctors d ON d.organisation_id = o.id
WHERE lower(o.name) LIKE '%ciba%' OR lower(o.slug) LIKE '%ciba%';

-- 7. Appointments belonging to CIBA orgs
SELECT 'CIBA_APPOINTMENTS' as section, o.slug, count(*)::text as appointment_count
FROM public.organisations o
LEFT JOIN public.appointments apt ON apt.organisation_id = o.id
WHERE lower(o.name) LIKE '%ciba%' OR lower(o.slug) LIKE '%ciba%'
GROUP BY o.slug;

-- 8. Assignment queue for CIBA orgs
SELECT 'CIBA_QUEUE' as section, o.slug, count(*)::text as queue_count
FROM public.organisations o
LEFT JOIN public.assign_clinician_queue acq ON acq.organisation_id = o.id
WHERE lower(o.name) LIKE '%ciba%' OR lower(o.slug) LIKE '%ciba%'
GROUP BY o.slug;

-- 9. Summary
SELECT 'SUMMARY' as section,
       (SELECT count(*)::text FROM public.organisations WHERE lower(name) LIKE '%ciba%' OR lower(slug) LIKE '%ciba%') as ciba_org_count,
       (SELECT count(*)::text FROM public.organisations) as total_org_count,
       (SELECT string_agg(slug, ', ' ORDER BY created_at) FROM public.organisations WHERE lower(name) LIKE '%ciba%' OR lower(slug) LIKE '%ciba%') as ciba_slugs;
