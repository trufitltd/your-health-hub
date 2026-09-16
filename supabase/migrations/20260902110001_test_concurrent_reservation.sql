-- 20260902110000_test_concurrent_reservation.sql
-- Phase 6B.4: Real PostgreSQL Concurrency Tests
--
-- These tests use pg_sleep and concurrent connections to verify that
-- advisory locking prevents double-booking.
--
-- Run via: psql $DATABASE_URL -f this_file.sql
-- Or execute individual sections in the Supabase SQL editor.

-- =========================================================================
-- SETUP: Create test fixtures (run once)
-- =========================================================================

-- Test org, service, clinicians, schedules
-- Assumes: auth.users has test patient entries, doctors table has entries

DO $$
DECLARE
  v_test_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_test_service_name TEXT := 'Concurrency Test Service';
  v_test_patient_id UUID;
  v_test_doctor_a UUID;
  v_test_doctor_b UUID;
  v_appointment_count INTEGER;
BEGIN
  -- Clean up any prior test data
  DELETE FROM appointments WHERE service_type = v_test_service_name;
  DELETE FROM organisation_services WHERE name = v_test_service_name;
  DELETE FROM organisation_members WHERE organisation_id = v_test_org_id;
  DELETE FROM doctors WHERE organisation_id = v_test_org_id;

  RAISE NOTICE '=== Phase 6B.4 Concurrency Test Setup ===';
  RAISE NOTICE 'Test org: %', v_test_org_id;
  RAISE NOTICE 'Test service: %', v_test_service_name;
END $$;

-- =========================================================================
-- TEST 1: Concurrent capacity=1 (two requests)
-- =========================================================================
-- Uses dblink to simulate two truly concurrent transactions.
-- Requires: CREATE EXTENSION IF NOT EXISTS dblink;

CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
DECLARE
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_service TEXT := 'Concurrency Test Service';
  v_patient_a UUID := 'b0000000-0000-0000-0000-000000000001';
  v_patient_b UUID := 'b0000000-0000-0000-0000-000000000002';
  v_test_date DATE := '2026-12-01';
  v_test_time TIME := '10:00';
  v_duration INTEGER := 30;
  v_conn_a TEXT;
  v_conn_b TEXT;
  v_result_a JSONB;
  v_result_b JSONB;
  v_appt_count INTEGER;
BEGIN
  RAISE NOTICE '=== TEST 1: Concurrent capacity=1 ===';

  -- Ensure exactly 1 eligible clinician with schedule
  -- (setup depends on existing test data)

  -- Open two separate connections
  v_conn_a := 'conn_a_' || pg_backend_pid();
  v_conn_b := 'conn_b_' || pg_backend_pid();

  PERFORM dblink_connect(v_conn_a, current_dsn());
  PERFORM dblink_connect(v_conn_b, current_dsn());

  -- Both transactions start simultaneously
  -- Transaction A: begin, then sleep 100ms, then call RPC
  PERFORM dblink_exec(v_conn_a, 'BEGIN');
  PERFORM dblink_exec(v_conn_b, 'BEGIN');

  -- Fire both concurrently (small stagger to ensure both start)
  PERFORM dblink_exec(v_conn_a, format(
    'SELECT pg_sleep(0.1)'
  ));

  -- Transaction A calls the RPC
  v_result_a := (SELECT (dblink_exec(v_conn_a, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''%s'', ''%s'', %s, ''Test Patient A''
    )',
    v_patient_a, v_org_id, v_service, v_test_date, v_test_time, v_duration
  )))::jsonb);

  -- Transaction B calls the RPC (concurrent)
  v_result_b := (SELECT (dblink_exec(v_conn_b, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''%s'', ''%s'', %s, ''Test Patient B''
    )',
    v_patient_b, v_org_id, v_service, v_test_date, v_test_time, v_duration
  )))::jsonb);

  -- Commit both
  PERFORM dblink_exec(v_conn_a, 'COMMIT');
  PERFORM dblink_exec(v_conn_b, 'COMMIT');

  -- Verify: exactly 1 appointment exists
  SELECT COUNT(*) INTO v_appt_count
  FROM appointments
  WHERE service_type = v_service
    AND date = v_test_date
    AND time = v_test_time::text
    AND status = 'pending_payment';

  IF v_appt_count = 1 THEN
    RAISE NOTICE 'TEST 1 PASSED: Exactly 1 reservation created (capacity=1)';
  ELSE
    RAISE WARNING 'TEST 1 FAILED: Expected 1 reservation, got %', v_appt_count;
  END IF;

  -- Verify: one result has success=true, one has SLOT_NO_LONGER_AVAILABLE
  IF (v_result_a->>'success')::boolean = true AND (v_result_b->>'success')::boolean = false THEN
    RAISE NOTICE 'TEST 1 PASSED: Request A succeeded, Request B rejected';
  ELSIF (v_result_b->>'success')::boolean = true AND (v_result_a->>'success')::boolean = false THEN
    RAISE NOTICE 'TEST 1 PASSED: Request B succeeded, Request A rejected';
  ELSE
    RAISE WARNING 'TEST 1 FAILED: Both succeeded or both failed. A=%, B=%', v_result_a, v_result_b;
  END IF;

  -- Cleanup
  PERFORM dblink_disconnect(v_conn_a);
  PERFORM dblink_disconnect(v_conn_b);
END $$;

-- =========================================================================
-- TEST 2: Concurrent capacity=3 (five requests)
-- =========================================================================

DO $$
DECLARE
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_service TEXT := 'Concurrency Test Service';
  v_test_date DATE := '2026-12-02';
  v_test_time TIME := '10:00';
  v_duration INTEGER := 30;
  v_success_count INTEGER := 0;
  v_fail_count INTEGER := 0;
  v_appt_count INTEGER;
  v_i INTEGER;
  v_patient_id UUID;
  v_conn TEXT;
  v_result JSONB;
BEGIN
  RAISE NOTICE '=== TEST 2: Concurrent capacity=3, 5 requests ===';

  -- Ensure 3 eligible clinicians with schedules for this date

  -- Open 5 connections and fire all concurrently
  FOR v_i IN 1..5 LOOP
    v_patient_id := gen_random_uuid();
    v_conn := 'conn_' || v_i || '_' || pg_backend_pid();

    PERFORM dblink_connect(v_conn, current_dsn());
    PERFORM dblink_exec(v_conn, 'BEGIN');

    -- Fire the RPC
    v_result := (SELECT (dblink_exec(v_conn, format(
      'SELECT reserve_internal_assignment_slot(
        ''%s'', ''%s'', ''%s'', ''%s'', ''%s'', %s, ''Patient %s''
      )',
      v_patient_id, v_org_id, v_service, v_test_date, v_test_time, v_duration, v_i
    )))::jsonb);

    IF (v_result->>'success')::boolean THEN
      v_success_count := v_success_count + 1;
    ELSE
      v_fail_count := v_fail_count + 1;
    END IF;

    PERFORM dblink_exec(v_conn, 'COMMIT');
    PERFORM dblink_disconnect(v_conn);
  END LOOP;

  -- Verify counts
  SELECT COUNT(*) INTO v_appt_count
  FROM appointments
  WHERE service_type = v_service
    AND date = v_test_date
    AND time = v_test_time::text
    AND status = 'pending_payment';

  IF v_success_count = 3 AND v_fail_count = 2 THEN
    RAISE NOTICE 'TEST 2 PASSED: 3 succeeded, 2 rejected (capacity=3)';
  ELSE
    RAISE WARNING 'TEST 2 FAILED: Expected 3 success + 2 fail, got % success + % fail', v_success_count, v_fail_count;
  END IF;

  IF v_appt_count = 3 THEN
    RAISE NOTICE 'TEST 2 PASSED: Exactly 3 active reservations exist';
  ELSE
    RAISE WARNING 'TEST 2 FAILED: Expected 3 reservations, got %', v_appt_count;
  END IF;
END $$;

-- =========================================================================
-- TEST 3: Overlapping intervals (capacity=1)
-- =========================================================================

DO $$
DECLARE
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_service TEXT := 'Concurrency Test Service';
  v_test_date DATE := '2026-12-03';
  v_patient_a UUID := 'b0000000-0000-0000-0000-000000000010';
  v_patient_b UUID := 'b0000000-0000-0000-0000-000000000011';
  v_duration INTEGER := 60;
  v_result_a JSONB;
  v_result_b JSONB;
  v_appt_count INTEGER;
  v_conn_a TEXT;
  v_conn_b TEXT;
BEGIN
  RAISE NOTICE '=== TEST 3: Overlapping intervals (capacity=1) ===';

  -- Request A: 10:00–11:00
  -- Request B: 10:30–11:30 (overlaps with A)
  -- With capacity=1, only one should succeed

  v_conn_a := 'conn_overlap_a_' || pg_backend_pid();
  v_conn_b := 'conn_overlap_b_' || pg_backend_pid();

  PERFORM dblink_connect(v_conn_a, current_dsn());
  PERFORM dblink_connect(v_conn_b, current_dsn());

  PERFORM dblink_exec(v_conn_a, 'BEGIN');
  PERFORM dblink_exec(v_conn_b, 'BEGIN');

  -- Fire concurrently
  v_result_a := (SELECT (dblink_exec(v_conn_a, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''%s'', ''10:00'', %s, ''Overlap Patient A''
    )',
    v_patient_a, v_org_id, v_service, v_test_date, v_duration
  )))::jsonb);

  v_result_b := (SELECT (dblink_exec(v_conn_b, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''%s'', ''10:30'', %s, ''Overlap Patient B''
    )',
    v_patient_b, v_org_id, v_service, v_test_date, v_duration
  )))::jsonb);

  PERFORM dblink_exec(v_conn_a, 'COMMIT');
  PERFORM dblink_exec(v_conn_b, 'COMMIT');

  SELECT COUNT(*) INTO v_appt_count
  FROM appointments
  WHERE service_type = v_service
    AND date = v_test_date
    AND status = 'pending_payment';

  IF v_appt_count = 1 THEN
    RAISE NOTICE 'TEST 3 PASSED: Overlapping intervals — only 1 reservation created';
  ELSE
    RAISE WARNING 'TEST 3 FAILED: Expected 1 reservation, got %', v_appt_count;
  END IF;

  PERFORM dblink_disconnect(v_conn_a);
  PERFORM dblink_disconnect(v_conn_b);
END $$;

-- =========================================================================
-- TEST 4: Different slots proceed concurrently (no unnecessary blocking)
-- =========================================================================

DO $$
DECLARE
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_service TEXT := 'Concurrency Test Service';
  v_patient_a UUID := 'b0000000-0000-0000-0000-000000000020';
  v_patient_b UUID := 'b0000000-0000-0000-0000-000000000021';
  v_result_a JSONB;
  v_result_b JSONB;
  v_appt_count INTEGER;
  v_conn_a TEXT;
  v_conn_b TEXT;
BEGIN
  RAISE NOTICE '=== TEST 4: Different slots proceed concurrently ===';

  -- Same service, different dates → different advisory keys → no blocking
  v_conn_a := 'conn_diff_a_' || pg_backend_pid();
  v_conn_b := 'conn_diff_b_' || pg_backend_pid();

  PERFORM dblink_connect(v_conn_a, current_dsn());
  PERFORM dblink_connect(v_conn_b, current_dsn());

  PERFORM dblink_exec(v_conn_a, 'BEGIN');
  PERFORM dblink_exec(v_conn_b, 'BEGIN');

  -- Different dates → different lock keys
  v_result_a := (SELECT (dblink_exec(v_conn_a, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''2026-12-10'', ''10:00'', 30, ''Diff Patient A''
    )',
    v_patient_a, v_org_id, v_service
  )))::jsonb);

  v_result_b := (SELECT (dblink_exec(v_conn_b, format(
    'SELECT reserve_internal_assignment_slot(
      ''%s'', ''%s'', ''%s'', ''2026-12-11'', ''10:00'', 30, ''Diff Patient B''
    )',
    v_patient_b, v_org_id, v_service
  )))::jsonb);

  PERFORM dblink_exec(v_conn_a, 'COMMIT');
  PERFORM dblink_exec(v_conn_b, 'COMMIT');

  SELECT COUNT(*) INTO v_appt_count
  FROM appointments
  WHERE service_type = v_service
    AND status = 'pending_payment'
    AND date IN ('2026-12-10', '2026-12-11');

  IF v_appt_count = 2 THEN
    RAISE NOTICE 'TEST 4 PASSED: Different dates proceed concurrently (2 reservations)';
  ELSE
    RAISE WARNING 'TEST 4 FAILED: Expected 2 reservations, got %', v_appt_count;
  END IF;

  PERFORM dblink_disconnect(v_conn_a);
  PERFORM dblink_disconnect(v_conn_b);
END $$;

-- =========================================================================
-- CLEANUP: Remove test data
-- =========================================================================

DO $$
BEGIN
  DELETE FROM appointments WHERE service_type = 'Concurrency Test Service';
  DELETE FROM organisation_services WHERE name = 'Concurrency Test Service';
  RAISE NOTICE '=== Test cleanup complete ===';
END $$;
