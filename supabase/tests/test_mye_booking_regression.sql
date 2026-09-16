-- ══════════════════════════════════════════════════════════════════════════════
-- MyE-Doctor Booking Regression Tests
--
-- Tests for:
-- 1. Test Doctor visibility (server-authoritative)
-- 2. Test Patient booking authorization
-- 3. Ordinary patient cannot book test doctor
-- 4. list_public_doctors conditional test doctor visibility
-- ══════════════════════════════════════════════════════════════════════════════

-- Test 1: Verify is_test_doctor flag exists on test doctor
SELECT
  d.id,
  d.name,
  d.is_test_doctor,
  CASE WHEN d.is_test_doctor = TRUE THEN 'PASS' ELSE 'FAIL' END AS test_result
FROM public.doctors d
WHERE lower(trim(COALESCE(d.name, ''))) = 'test doctor';

-- Test 2: Verify is_test_patient flag exists on test patient
SELECT
  pr.user_id,
  pr.full_name,
  pr.is_test_patient,
  CASE WHEN pr.is_test_patient = TRUE THEN 'PASS' ELSE 'FAIL' END AS test_result
FROM public.patient_registrations pr
WHERE lower(trim(COALESCE(pr.full_name, ''))) = 'test patient';

-- Test 3: Verify can_book_doctor function works for authorised test patient
-- (Requires test patient and test doctor UUIDs to be set up)
-- SELECT
--   public.can_book_doctor('TEST_PATIENT_UUID', 'TEST_DOCTOR_UUID') AS can_book,
--   CASE WHEN public.can_book_doctor('TEST_PATIENT_UUID', 'TEST_DOCTOR_UUID') = TRUE
--     THEN 'PASS' ELSE 'FAIL' END AS test_result;

-- Test 4: Verify can_book_doctor rejects ordinary patient for test doctor
-- (Requires ordinary patient UUID and test doctor UUID)
-- SELECT
--   public.can_book_doctor('ORDINARY_PATIENT_UUID', 'TEST_DOCTOR_UUID') AS can_book,
--   CASE WHEN public.can_book_doctor('ORDINARY_PATIENT_UUID', 'TEST_DOCTOR_UUID') = FALSE
--     THEN 'PASS' ELSE 'FAIL' END AS test_result;

-- Test 5: Verify list_public_doctors excludes test doctor for ordinary user
-- Run as an authenticated user who is NOT a test patient
-- SELECT count(*) AS test_doctor_count
-- FROM public.list_public_doctors(1000, 0, NULL) lpd
-- WHERE lower(trim(COALESCE(lpd.full_name, ''))) = 'test doctor';
-- Expected: 0 (test doctor excluded)

-- Test 6: Verify list_public_doctors includes test doctor for test patient
-- Run as an authenticated user who IS a test patient
-- SELECT count(*) AS test_doctor_count
-- FROM public.list_public_doctors(1000, 0, NULL) lpd
-- WHERE lower(trim(COALESCE(lpd.full_name, ''))) = 'test doctor';
-- Expected: 1 (test doctor included for test patient)

-- Test 7: Verify is_authorised_test_patient function
-- SELECT
--   public.is_authorised_test_patient('TEST_PATIENT_UUID') AS is_test,
--   CASE WHEN public.is_authorised_test_patient('TEST_PATIENT_UUID') = TRUE
--     THEN 'PASS' ELSE 'FAIL' END AS test_result;

-- Test 8: Verify is_test_doctor function
-- SELECT
--   public.is_test_doctor('TEST_DOCTOR_UUID') AS is_test,
--   CASE WHEN public.is_test_doctor('TEST_DOCTOR_UUID') = TRUE
--     THEN 'PASS' ELSE 'FAIL' END AS test_result;

-- Diagnostic: List all doctors with their test status
SELECT
  d.id,
  d.name,
  d.is_test_doctor,
  d.is_active,
  d.organisation_id
FROM public.doctors d
ORDER BY d.name;

-- Diagnostic: List all patients with their test status
SELECT
  pr.user_id,
  pr.full_name,
  pr.is_test_patient
FROM public.patient_registrations pr
ORDER BY pr.full_name;
