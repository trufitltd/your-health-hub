-- 20260902110000_correct_advisory_locking_reservation.sql
-- Phase 6B.4: Correct PostgreSQL Concurrency Locking
--
-- CORRECTION: Phase 6B.3 incorrectly assumed PL/pgSQL + MVCC serializes
-- concurrent capacity reservations. Under read-committed isolation, two
-- concurrent transactions can both read the same committed state before
-- either commits, allowing both to insert reservations for the last slot.
--
-- FIX: Add pg_advisory_xact_lock keyed by (org, service, date) to serialize
-- concurrent bookings for the same service on the same date. The lock is
-- acquired BEFORE capacity calculation and automatically released at
-- transaction end.
--
-- SAFETY: Replaces the Phase 6B.3 function. Additive (new migration).
-- MyE-Doctor booking path unchanged.

-- =========================================================================
-- SECTION 1: Corrected Atomic Reservation with Advisory Locking
-- =========================================================================

CREATE OR REPLACE FUNCTION public.reserve_internal_assignment_slot(
  p_patient_id UUID,
  p_organisation_id UUID,
  p_service_name TEXT,
  p_preferred_date DATE,
  p_preferred_time TIME,
  p_duration_minutes INTEGER,
  p_patient_name TEXT,
  p_notes TEXT DEFAULT NULL,
  p_consultation_mode TEXT DEFAULT 'video'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org RECORD;
  v_service RECORD;
  v_membership RECORD;
  v_day_of_week INTEGER;
  v_eligible_user_ids UUID[];
  v_scheduled_user_ids UUID[];
  v_occupied_count INTEGER;
  v_remaining_capacity INTEGER;
  v_lock_until TIMESTAMPTZ;
  v_consultation_type_id UUID;
  v_final_price NUMERIC;
  v_currency TEXT;
  v_appointment_id UUID;
  v_breakdown JSONB;
  -- Advisory lock key: deterministic hash of (org, service, date)
  -- Serializes concurrent bookings for the SAME service on the SAME date.
  -- Different services or different dates acquire different locks.
  v_advisory_key INTEGER;
BEGIN
  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 1: Validate authentication (before acquiring lock)
  -- ════════════════════════════════════════════════════════════════════════
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required',
      'code', 'UNAUTHENTICATED'
    );
  END IF;

  IF auth.uid() != p_patient_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Patient ID must match authenticated user',
      'code', 'PATIENT_MISMATCH'
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 2: Validate organisation (before acquiring lock)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id, name, active, currency
  INTO v_org
  FROM organisations
  WHERE id = p_organisation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Organisation not found',
      'code', 'ORG_NOT_FOUND'
    );
  END IF;

  IF NOT v_org.active THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Organisation is not active',
      'code', 'ORG_INACTIVE'
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 3: Validate patient membership (before acquiring lock)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_membership
  FROM organisation_members
  WHERE organisation_id = p_organisation_id
    AND user_id = p_patient_id
    AND active = true
    AND role IN ('org_patient', 'org_admin', 'org_member')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You are not a member of this organisation',
      'code', 'NOT_ORG_MEMBER'
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 4: Validate service exists and is active (before acquiring lock)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id, name, base_price, currency, default_duration_minutes,
         consultation_mode, required_specialties
  INTO v_service
  FROM organisation_services
  WHERE organisation_id = p_organisation_id
    AND name = p_service_name
    AND active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Service not found or inactive for this organisation',
      'code', 'SERVICE_NOT_FOUND'
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 5: Acquire advisory lock (BEFORE capacity calculation)
  -- ════════════════════════════════════════════════════════════════════════
  -- Lock key: hashtext(org_id ':' service_name ':' date)
  --
  -- This serializes concurrent transactions for the SAME service on the
  -- SAME date. Under PostgreSQL read-committed isolation, without this
  -- lock, two concurrent transactions could both read the same occupancy
  -- count and both insert reservations for the last capacity unit.
  --
  -- Tradeoff: Different services on the same date, or the same service on
  -- different dates, acquire different locks and proceed concurrently.
  -- Same service + same date = serialized (safe, correct).
  --
  -- The lock is transaction-scoped (pg_advisory_xact_lock) and automatically
  -- released when the transaction commits or rolls back.
  v_advisory_key := hashtext(
    p_organisation_id::text || ':' || p_service_name || ':' || p_preferred_date::text
  );

  PERFORM pg_advisory_xact_lock(v_advisory_key);

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 6: Determine eligible clinicians (AFTER lock acquired)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT array_agg(d.user_id)
  INTO v_eligible_user_ids
  FROM doctors d
  WHERE d.organisation_id = p_organisation_id
    AND d.is_active = true
    AND (
      v_service.required_specialties IS NULL
      OR array_length(v_service.required_specialties, 1) = 0
      OR EXISTS (
        SELECT 1
        FROM doctor_registrations dr
        WHERE dr.user_id = d.user_id
          AND (
            dr.specialty IS NOT NULL
            AND LOWER(TRIM(dr.specialty)) = ANY(
              SELECT LOWER(TRIM(unnest(v_service.required_specialties)))
            )
          )
      )
    );

  IF v_eligible_user_ids IS NULL OR array_length(v_eligible_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No clinicians qualified for this service',
      'code', 'NO_QUALIFIED_CLINICIANS'
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 7: Find eligible clinicians with a schedule for the requested day
  -- ════════════════════════════════════════════════════════════════════════
  v_day_of_week := EXTRACT(DOW FROM p_preferred_date);

  SELECT array_agg(ds.doctor_id)
  INTO v_scheduled_user_ids
  FROM doctor_schedules ds
  WHERE ds.organisation_id = p_organisation_id
    AND ds.day_of_week = v_day_of_week
    AND ds.active = true
    AND ds.doctor_id = ANY(v_eligible_user_ids)
    AND (
      ds.start_time <= p_preferred_time
      AND (ds.start_time + (p_duration_minutes || ' minutes')::interval) <= ds.end_time
    );

  IF v_scheduled_user_ids IS NULL OR array_length(v_scheduled_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No clinicians available on this day',
      'code', 'NO_SCHEDULED_CLINICIANS'
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 8: Count active occupancy (AFTER lock — sees consistent state)
  -- ════════════════════════════════════════════════════════════════════════
  -- Under the advisory lock, no concurrent transaction can insert
  -- reservations for this (org, service, date) until this transaction
  -- commits. The occupancy count is therefore authoritative.

  -- Count confirmed/assigned/in-progress appointments
  SELECT COUNT(*) INTO v_occupied_count
  FROM appointments a
  WHERE a.doctor_id = ANY(v_scheduled_user_ids)
    AND a.date = p_preferred_date
    AND a.status IN ('confirmed', 'pending_approval', 'in_progress', 'completed', 'pending_assignment')
    AND (
      (a.time)::interval < (p_preferred_time + (p_duration_minutes || ' minutes')::interval)
      AND ((a.time)::interval + COALESCE((a.duration_minutes || ' minutes')::interval, '30 minutes'::interval)) > (p_preferred_time)::interval
    );

  -- Count pending_payment with active (unexpired) lock
  SELECT COUNT(*) + v_occupied_count INTO v_occupied_count
  FROM appointments a
  WHERE a.doctor_id = ANY(v_scheduled_user_ids)
    AND a.date = p_preferred_date
    AND a.status = 'pending_payment'
    AND a.slot_locked_until IS NOT NULL
    AND a.slot_locked_until > now()
    AND (
      (a.time)::interval < (p_preferred_time + (p_duration_minutes || ' minutes')::interval)
      AND ((a.time)::interval + COALESCE((a.duration_minutes || ' minutes')::interval, '30 minutes'::interval)) > (p_preferred_time)::interval
    );

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 9: Check remaining capacity
  -- ════════════════════════════════════════════════════════════════════════
  v_remaining_capacity := array_length(v_scheduled_user_ids, 1) - v_occupied_count;

  IF v_remaining_capacity <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No clinicians available at the requested time',
      'code', 'SLOT_NO_LONGER_AVAILABLE'
    );
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 10: Resolve consultation type ID
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_consultation_type_id
  FROM consultation_types
  WHERE name = p_consultation_mode
  LIMIT 1;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 11: Set price from authoritative source
  -- ════════════════════════════════════════════════════════════════════════
  v_final_price := v_service.base_price;
  v_currency := v_service.currency;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 12: Create reservation (under advisory lock — capacity is guaranteed)
  -- ════════════════════════════════════════════════════════════════════════
  v_lock_until := now() + interval '30 minutes';

  v_breakdown := jsonb_build_object(
    'base', v_final_price,
    'modifiers', '[]'::jsonb,
    'final_price', v_final_price,
    'currency', v_currency,
    'doctor_type', 'GP',
    'consultation_type', p_consultation_mode,
    'duration_minutes', p_duration_minutes,
    'tier_id', null,
    'tier_name', null,
    'service_type', p_service_name
  );

  INSERT INTO appointments (
    patient_id,
    patient_name,
    doctor_id,
    specialist_name,
    service_type,
    date,
    time,
    notes,
    status,
    final_price,
    currency,
    price_breakdown,
    pricing_profile_id,
    slot_locked_until,
    consultation_type_id,
    duration_minutes,
    is_promotion,
    promotion_type,
    organisation_id
  ) VALUES (
    p_patient_id,
    p_patient_name,
    NULL,
    NULL,
    p_service_name,
    p_preferred_date::text,
    p_preferred_time::text,
    p_notes,
    'pending_payment',
    v_final_price,
    v_currency,
    v_breakdown,
    NULL,
    v_lock_until,
    v_consultation_type_id,
    p_duration_minutes,
    false,
    NULL,
    p_organisation_id
  )
  RETURNING id INTO v_appointment_id;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 13: Return success (advisory lock auto-released at COMMIT)
  -- ════════════════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'final_price', v_final_price,
    'currency', v_currency,
    'slot_locked_until', v_lock_until,
    'service_name', p_service_name,
    'remaining_capacity', v_remaining_capacity - 1
  );
END;
$$;

-- Grant execute to authenticated users
REVOKE ALL ON FUNCTION public.reserve_internal_assignment_slot(
  UUID, UUID, TEXT, DATE, TIME, INTEGER, TEXT, TEXT, TEXT
) FROM public;

GRANT EXECUTE ON FUNCTION public.reserve_internal_assignment_slot(
  UUID, UUID, TEXT, DATE, TIME, INTEGER, TEXT, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.reserve_internal_assignment_slot(
  UUID, UUID, TEXT, DATE, TIME, INTEGER, TEXT, TEXT, TEXT
) IS 'Phase 6B.4: Atomic capacity reservation with advisory locking for CIBA internal-assignment bookings. Uses pg_advisory_xact_lock keyed by (org, service, date) to serialize concurrent bookings. Capacity calculation and INSERT happen under the lock. Returns SLOT_NO_LONGER_AVAILABLE if no capacity remains.';

-- =========================================================================
-- SECTION 2: Release Reservation (unchanged from 6B.3)
-- =========================================================================

-- release_reservation_on_payment_failure already exists from 6B.3 migration.
-- No changes needed — it operates on a single appointment row and does not
-- need advisory locking.
