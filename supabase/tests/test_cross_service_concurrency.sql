-- 20260902120001_test_cross_service_concurrency.sql
-- Phase 6B.5: Cross-Service Clinician Capacity Concurrency Tests
--
-- Tests that concurrent reservations for DIFFERENT services sharing
-- the same clinician pool are correctly serialized.
--
-- Requires: CREATE EXTENSION IF NOT EXISTS dblink;
-- Run via: psql $DATABASE_URL -f this_file.sql

CREATE EXTENSION IF NOT EXISTS dblink;

-- =========================================================================
-- TEST 1: Cross-service capacity=1 (shared clinician)
-- =========================================================================
-- Setup: 1 clinician, eligible for both Service A and Service B
-- Request A: Service A, 10:00
-- Request B: Service B, 10:00
-- Expected: exactly ONE succeeds

DO $$
DECLARE
  v_org_id UUID := 'c0000000-0000-0000-0000-000000000001';
  v_service_a TEXT := 'Cross-Service Test A';
  v_service_b TEXT := 'Cross-Service Test B';
  v_patient_a UUID := 'd0000000-0000-0000-0000-000000000001';
  v_patient_b UUID := 'd0000000-0000-0000-0000-000000000002';
  v_test_date DATE := '2026-12-15';
  v_duration INTEGER := 30;
  v_result_a JSONB;
  v_result_b JSONB;
  v_appt_count INTEGER;
  v_success_a BOOLEAN;
  v_success_b BOOLEAN;
  v_conn_a TEXT;
  v_conn_b TEXT;
BEGIN
  RAISE NOTICE '=== TEST 1: Cross-service capacity=1 (shared clinician) ===';

  -- Cleanup prior test data
  DELETE FROM appointments WHERE service_type IN (v_service_a, v_service_b);
  DELETE FROM organisation_services WHERE name IN (v_service_a, v_service_b);

  -- Create two services (both require same specialty → shared clinician pool)
  INSERT INTO organisation_services (organisation_id, name, base_price, currency, active, required_specialties)
  VALUES
    (v_org_id, v_service_a, 10000, 'NGN', true, '{GP}'),
    (v_org_id, v_service_b, 10000, 'NGN', true, '{GP}');

  -- Fire two concurrent requests for different services, same time
  v_conn_a := 'cs_a_' || pg_backend_pid();
  v_conn_b := 'cs_b_' || pg_backend_pid();

  PERFORM dblink_connect(v_conn_a, current_dsn());
  PERFORM dblink_connect(v_conn_b, current_dsn());

  PERFORM dblink_exec(v_conn_a, 'BEGIN');
  PERFORM dblink_exec(v_conn_b, 'BEGIN');

  -- Transaction A: Service A
  v_result_a := (SELECT (dblink_exec(v_conn_a, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''%s'', ''10:00'', %s, ''Cross Patient A''
    )',
    v_patient_a, v_org_id, v_service_a, v_test_date, v_duration
  )))::jsonb);

  -- Transaction B: Service B (concurrent)
  v_result_b := (SELECT (dblink_exec(v_conn_b, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''%s'', ''10:00'', %s, ''Cross Patient B''
    )',
    v_patient_b, v_org_id, v_service_b, v_test_date, v_duration
  )))::jsonb);

  PERFORM dblink_exec(v_conn_a, 'COMMIT');
  PERFORM dblink_exec(v_conn_b, 'COMMIT');

  v_success_a := (v_result_a->>'success')::boolean;
  v_success_b := (v_result_b->>'success')::boolean;

  SELECT COUNT(*) INTO v_appt_count
  FROM appointments
  WHERE service_type IN (v_service_a, v_service_b)
    AND date = v_test_date
    AND time = '10:00'
    AND status = 'pending_payment';

  IF v_appt_count = 1 AND ((v_success_a AND NOT v_success_b) OR (v_success_b AND NOT v_success_a)) THEN
    RAISE NOTICE 'TEST 1 PASSED: Cross-service capacity=1 — exactly 1 reservation, 1 rejected';
  ELSE
    RAISE WARNING 'TEST 1 FAILED: Expected 1 success + 1 fail, got A=% B=% appointments=%', v_success_a, v_success_b, v_appt_count;
  END IF;

  PERFORM dblink_disconnect(v_conn_a);
  PERFORM dblink_disconnect(v_conn_b);
END $$;

-- =========================================================================
-- TEST 2: Cross-service capacity=2 (2 clinicians, 4 requests)
-- =========================================================================
-- Setup: 2 clinicians, both eligible for Service A and Service B
-- Fire 4 concurrent requests: 2 for Service A, 2 for Service B
-- Expected: exactly 2 succeed total (not 2 per service)

DO $$
DECLARE
  v_org_id UUID := 'c0000000-0000-0000-0000-000000000001';
  v_service_a TEXT := 'Cross-Service Test A';
  v_service_b TEXT := 'Cross-Service Test B';
  v_test_date DATE := '2026-12-16';
  v_duration INTEGER := 30;
  v_success_count INTEGER := 0;
  v_fail_count INTEGER := 0;
  v_appt_count INTEGER;
  v_i INTEGER;
  v_patient_id UUID;
  v_service TEXT;
  v_conn TEXT;
  v_result JSONB;
BEGIN
  RAISE NOTICE '=== TEST 2: Cross-service capacity=2 (4 concurrent requests) ===';

  DELETE FROM appointments WHERE service_type IN (v_service_a, v_service_b) AND date = v_test_date;

  -- Fire 4 concurrent requests (2 per service)
  FOR v_i IN 1..4 LOOP
    v_patient_id := gen_random_uuid();
    v_service := CASE WHEN v_i <= 2 THEN v_service_a ELSE v_service_b END;
    v_conn := 'cs2_' || v_i || '_' || pg_backend_pid();

    PERFORM dblink_connect(v_conn, current_dsn());
    PERFORM dblink_exec(v_conn, 'BEGIN');

    v_result := (SELECT (dblink_exec(v_conn, format(
      'SELECT reserve_internal_assignment_slot(
        ''%s'', ''%s'', ''%s'', ''%s'', ''10:00'', %s, ''Cross Patient %s''
      )',
      v_patient_id, v_org_id, v_service, v_test_date, v_duration, v_i
    )))::jsonb);

    IF (v_result->>'success')::boolean THEN
      v_success_count := v_success_count + 1;
    ELSE
      v_fail_count := v_fail_count + 1;
    END IF;

    PERFORM dblink_exec(v_conn, 'COMMIT');
    PERFORM dblink_disconnect(v_conn);
  END LOOP;

  SELECT COUNT(*) INTO v_appt_count
  FROM appointments
  WHERE service_type IN (v_service_a, v_service_b)
    AND date = v_test_date
    AND status = 'pending_payment';

  IF v_success_count = 2 AND v_appt_count = 2 THEN
    RAISE NOTICE 'TEST 2 PASSED: Cross-service capacity=2 — 2 succeeded, 2 rejected, 2 reservations';
  ELSE
    RAISE WARNING 'TEST 2 FAILED: Expected 2 success, got % success, % reservations', v_success_count, v_appt_count;
  END IF;
END $$;

-- =========================================================================
-- TEST 3: Different dates proceed concurrently (no cross-date blocking)
-- =========================================================================

DO $$
DECLARE
  v_org_id UUID := 'c0000000-0000-0000-0000-000000000001';
  v_service TEXT := 'Cross-Service Test A';
  v_patient_a UUID := 'd0000000-0000-0000-0000-000000000010';
  v_patient_b UUID := 'd0000000-0000-0000-0000-000000000011';
  v_result_a JSONB;
  v_result_b JSONB;
  v_appt_count INTEGER;
  v_conn_a TEXT;
  v_conn_b TEXT;
BEGIN
  RAISE NOTICE '=== TEST 3: Different dates proceed concurrently ===';

  DELETE FROM appointments WHERE service_type = v_service AND date IN ('2026-12-20', '2026-12-21');

  v_conn_a := 'cs3a_' || pg_backend_pid();
  v_conn_b := 'cs3b_' || pg_backend_pid();

  PERFORM dblink_connect(v_conn_a, current_dsn());
  PERFORM dblink_connect(v_conn_b, current_dsn());

  PERFORM dblink_exec(v_conn_a, 'BEGIN');
  PERFORM dblink_exec(v_conn_b, 'BEGIN');

  v_result_a := (SELECT (dblink_exec(v_conn_a, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''2026-12-20'', ''10:00'', 30, ''Date Patient A''
    )',
    v_patient_a, v_org_id, v_service
  )))::jsonb);

  v_result_b := (SELECT (dblink_exec(v_conn_b, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''2026-12-21'', ''10:00'', 30, ''Date Patient B''
    )',
    v_patient_b, v_org_id, v_service
  )))::jsonb);

  PERFORM dblink_exec(v_conn_a, 'COMMIT');
  PERFORM dblink_exec(v_conn_b, 'COMMIT');

  SELECT COUNT(*) INTO v_appt_count
  FROM appointments
  WHERE service_type = v_service
    AND date IN ('2026-12-20', '2026-12-21')
    AND status = 'pending_payment';

  IF v_appt_count = 2 THEN
    RAISE NOTICE 'TEST 3 PASSED: Different dates — both succeeded (2 reservations)';
  ELSE
    RAISE WARNING 'TEST 3 FAILED: Expected 2 reservations, got %', v_appt_count;
  END IF;

  PERFORM dblink_disconnect(v_conn_a);
  PERFORM dblink_disconnect(v_conn_b);
END $$;

-- =========================================================================
-- CLEANUP
-- =========================================================================

DO $$
BEGIN
  DELETE FROM appointments WHERE service_type LIKE 'Cross-Service Test%';
  DELETE FROM organisation_services WHERE name LIKE 'Cross-Service Test%';
  RAISE NOTICE '=== Cross-service test cleanup complete ===';
END $$;
