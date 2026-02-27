-- 37_patient_wallet_refund_flows.sql
-- Adds patient wallet ledger and implements refund flows for cancellation and no-show.

CREATE TABLE IF NOT EXISTS public.patient_wallet (
  patient_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (available_balance >= 0)
);

CREATE OR REPLACE FUNCTION public.update_patient_wallet_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_wallet_updated_at ON public.patient_wallet;
CREATE TRIGGER trg_patient_wallet_updated_at
  BEFORE UPDATE ON public.patient_wallet
  FOR EACH ROW
  EXECUTE FUNCTION public.update_patient_wallet_updated_at();

CREATE TABLE IF NOT EXISTS public.patient_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('refund', 'booking_wallet_use', 'adjustment')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
  narration TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_patient_wallet_txn_patient_time
  ON public.patient_wallet_transactions(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_wallet_txn_appointment
  ON public.patient_wallet_transactions(appointment_id);

ALTER TABLE public.patient_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view own wallet" ON public.patient_wallet;
CREATE POLICY "Patients can view own wallet"
  ON public.patient_wallet FOR SELECT
  USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "Patients can view own wallet transactions" ON public.patient_wallet_transactions;
CREATE POLICY "Patients can view own wallet transactions"
  ON public.patient_wallet_transactions FOR SELECT
  USING (auth.uid() = patient_id);

CREATE OR REPLACE FUNCTION public.reverse_doctor_wallet_for_appointment(
  p_appointment_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id UUID;
  v_pending_total NUMERIC := 0;
  v_available_total NUMERIC := 0;
BEGIN
  SELECT doctor_id
  INTO v_doctor_id
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF v_doctor_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'available' THEN amount ELSE 0 END), 0)
  INTO v_pending_total, v_available_total
  FROM public.doctor_wallet_transactions
  WHERE appointment_id = p_appointment_id
    AND status IN ('pending', 'available');

  IF (v_pending_total + v_available_total) <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.doctor_wallet
  SET
    pending_balance = GREATEST(COALESCE(pending_balance, 0) - v_pending_total, 0),
    available_balance = GREATEST(COALESCE(available_balance, 0) - v_available_total, 0)
  WHERE doctor_id = v_doctor_id;

  UPDATE public.doctor_wallet_transactions
  SET status = 'reversed',
      released_at = now()
  WHERE appointment_id = p_appointment_id
    AND status IN ('pending', 'available');

  RETURN ROUND(v_pending_total + v_available_total, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_with_refund(
  p_appointment_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status TEXT;
  v_patient_id UUID;
  v_doctor_id UUID;
  v_appointment_at TIMESTAMPTZ := NULL;
  v_final_price NUMERIC := 0;
  v_paid_amount NUMERIC := 0;
  v_existing_refunds NUMERIC := 0;
  v_refund_amount NUMERIC := 0;
  v_reversed_doctor_amount NUMERIC := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id,
    COALESCE(a.final_price, 0)
  INTO v_status, v_patient_id, v_doctor_id, v_final_price
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_actor <> v_patient_id AND v_actor <> v_doctor_id THEN
    RAISE EXCEPTION 'Not authorized to cancel this appointment';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'appointment_id', p_appointment_id,
      'status', 'cancelled',
      'refund_amount', 0,
      'already_cancelled', true
    );
  END IF;

  IF v_status IN ('completed', 'no_show') THEN
    RAISE EXCEPTION 'Cannot cancel appointment in status %', v_status;
  END IF;

  IF v_status NOT IN ('pending_payment', 'pending_approval', 'confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot cancel appointment in status %', v_status;
  END IF;

  UPDATE public.appointments
  SET status = 'cancelled',
      slot_locked_until = NULL
  WHERE id = p_appointment_id;

  SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_paid_amount
  FROM public.payments
  WHERE appointment_id = p_appointment_id
    AND lower(COALESCE(status, '')) IN ('completed', 'success');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_refunds
  FROM public.patient_wallet_transactions
  WHERE appointment_id = p_appointment_id
    AND transaction_type = 'refund'
    AND direction = 'credit'
    AND status = 'completed';

  v_refund_amount := LEAST(v_paid_amount, v_final_price);
  v_refund_amount := GREATEST(v_refund_amount - v_existing_refunds, 0);

  IF v_refund_amount > 0 THEN
    INSERT INTO public.patient_wallet (patient_id, available_balance)
    VALUES (v_patient_id, 0)
    ON CONFLICT (patient_id) DO NOTHING;

    UPDATE public.patient_wallet
    SET available_balance = ROUND(COALESCE(available_balance, 0) + v_refund_amount, 2)
    WHERE patient_id = v_patient_id;

    INSERT INTO public.patient_wallet_transactions (
      patient_id,
      appointment_id,
      amount,
      direction,
      transaction_type,
      status,
      narration
    ) VALUES (
      v_patient_id,
      p_appointment_id,
      v_refund_amount,
      'credit',
      'refund',
      'completed',
      COALESCE(p_reason, 'Appointment cancelled refund')
    );
  END IF;

  v_reversed_doctor_amount := public.reverse_doctor_wallet_for_appointment(p_appointment_id);

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'status', 'cancelled',
    'refund_amount', ROUND(v_refund_amount, 2),
    'doctor_reversal_amount', ROUND(v_reversed_doctor_amount, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_appointment_no_show(
  p_appointment_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_status TEXT;
  v_patient_id UUID;
  v_doctor_id UUID;
  v_appointment_at TIMESTAMPTZ := NULL;
  v_final_price NUMERIC := 0;
  v_paid_amount NUMERIC := 0;
  v_existing_refunds NUMERIC := 0;
  v_refund_amount NUMERIC := 0;
  v_reversed_doctor_amount NUMERIC := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id,
    COALESCE(a.final_price, 0)
  INTO v_status, v_patient_id, v_doctor_id, v_final_price
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_actor <> v_doctor_id THEN
    RAISE EXCEPTION 'Only the assigned doctor can mark no-show';
  END IF;

  IF v_status = 'no_show' THEN
    RETURN jsonb_build_object(
      'appointment_id', p_appointment_id,
      'status', 'no_show',
      'refund_amount', 0,
      'already_no_show', true
    );
  END IF;

  IF v_status NOT IN ('confirmed', 'in_progress') THEN
    RAISE EXCEPTION 'Cannot mark no-show for appointment in status %', v_status;
  END IF;

  BEGIN
    SELECT ((a.date::text || ' ' || a.time::text)::timestamptz)
    INTO v_appointment_at
    FROM public.appointments a
    WHERE a.id = p_appointment_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_appointment_at := NULL;
  END;

  IF v_appointment_at IS NOT NULL AND v_appointment_at > now() THEN
    RAISE EXCEPTION 'Cannot mark no-show before appointment time';
  END IF;

  UPDATE public.appointments
  SET status = 'no_show',
      slot_locked_until = NULL
  WHERE id = p_appointment_id;

  SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
  INTO v_paid_amount
  FROM public.payments
  WHERE appointment_id = p_appointment_id
    AND lower(COALESCE(status, '')) IN ('completed', 'success');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_refunds
  FROM public.patient_wallet_transactions
  WHERE appointment_id = p_appointment_id
    AND transaction_type = 'refund'
    AND direction = 'credit'
    AND status = 'completed';

  v_refund_amount := LEAST(v_paid_amount, v_final_price);
  v_refund_amount := GREATEST(v_refund_amount - v_existing_refunds, 0);

  IF v_refund_amount > 0 THEN
    INSERT INTO public.patient_wallet (patient_id, available_balance)
    VALUES (v_patient_id, 0)
    ON CONFLICT (patient_id) DO NOTHING;

    UPDATE public.patient_wallet
    SET available_balance = ROUND(COALESCE(available_balance, 0) + v_refund_amount, 2)
    WHERE patient_id = v_patient_id;

    INSERT INTO public.patient_wallet_transactions (
      patient_id,
      appointment_id,
      amount,
      direction,
      transaction_type,
      status,
      narration
    ) VALUES (
      v_patient_id,
      p_appointment_id,
      v_refund_amount,
      'credit',
      'refund',
      'completed',
      COALESCE(p_reason, 'Appointment marked no-show refund')
    );
  END IF;

  v_reversed_doctor_amount := public.reverse_doctor_wallet_for_appointment(p_appointment_id);

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'status', 'no_show',
    'refund_amount', ROUND(v_refund_amount, 2),
    'doctor_reversal_amount', ROUND(v_reversed_doctor_amount, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_doctor_wallet_for_appointment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_appointment_with_refund(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_appointment_no_show(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cancel_appointment_with_refund(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_appointment_no_show(UUID, TEXT) TO authenticated;
-- 38_appointment_reschedule_request_flow.sql
-- Adds request/approval-based reschedule flow while keeping canonical appointment statuses.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reschedule_request_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reschedule_requested_by TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_date DATE,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_time TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_consultation_type TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_proposed_final_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS reschedule_upgrade_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS reschedule_request_note TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_response_note TEXT;

UPDATE public.appointments
SET status = lower(trim(status))
WHERE status IS NOT NULL
  AND status <> lower(trim(status));

UPDATE public.appointments
SET reschedule_request_status = lower(trim(COALESCE(reschedule_request_status, 'none')));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_reschedule_request_status_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      DROP CONSTRAINT appointments_reschedule_request_status_check;
  END IF;

  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_reschedule_request_status_check
      CHECK (
        reschedule_request_status IN ('none', 'pending', 'approved', 'declined', 'cancelled', 'expired')
      );
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_reschedule_requested_by_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      DROP CONSTRAINT appointments_reschedule_requested_by_check;
  END IF;

  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_reschedule_requested_by_check
      CHECK (
        reschedule_requested_by IS NULL
        OR reschedule_requested_by IN ('patient', 'doctor')
      );
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_reschedule_pending
  ON public.appointments(reschedule_request_status)
  WHERE reschedule_request_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_appointments_reschedule_proposed_slot
  ON public.appointments(doctor_id, reschedule_proposed_date, reschedule_proposed_time)
  WHERE reschedule_request_status = 'pending';

CREATE OR REPLACE FUNCTION public.request_appointment_reschedule(
  p_appointment_id UUID,
  p_proposed_date DATE,
  p_proposed_time TEXT,
  p_proposed_duration_minutes INTEGER DEFAULT NULL,
  p_proposed_final_price NUMERIC DEFAULT NULL,
  p_proposed_consultation_type TEXT DEFAULT NULL,
  p_request_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_role TEXT;
  v_status TEXT;
  v_patient_id UUID;
  v_doctor_id UUID;
  v_existing_request_status TEXT;
  v_current_duration INTEGER := 30;
  v_requested_duration INTEGER := 30;
  v_current_final_price NUMERIC := 0;
  v_proposed_final_price NUMERIC := 0;
  v_upgrade_amount NUMERIC := 0;
  v_proposed_time TEXT;
  v_slot_conflict BOOLEAN := FALSE;
  v_target_datetime TIMESTAMPTZ;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_appointment_id IS NULL OR p_proposed_date IS NULL OR COALESCE(trim(p_proposed_time), '') = '' THEN
    RAISE EXCEPTION 'Appointment id, proposed date and proposed time are required';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id,
    COALESCE(a.reschedule_request_status, 'none'),
    COALESCE(a.duration_minutes, 30),
    COALESCE(a.final_price, 0)
  INTO
    v_status,
    v_patient_id,
    v_doctor_id,
    v_existing_request_status,
    v_current_duration,
    v_current_final_price
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_actor = v_patient_id THEN
    v_actor_role := 'patient';
  ELSIF v_actor = v_doctor_id THEN
    v_actor_role := 'doctor';
  ELSE
    RAISE EXCEPTION 'Not authorized to request reschedule for this appointment';
  END IF;

  IF v_status NOT IN ('pending_approval', 'confirmed', 'no_show') THEN
    RAISE EXCEPTION 'Cannot request reschedule for appointment in status %', v_status;
  END IF;

  IF lower(trim(COALESCE(v_existing_request_status, 'none'))) = 'pending' THEN
    RAISE EXCEPTION 'There is already a pending reschedule request for this appointment';
  END IF;

  v_proposed_time := left(trim(p_proposed_time), 5);
  IF v_proposed_time !~ '^\d{2}:\d{2}$' THEN
    RAISE EXCEPTION 'Invalid proposed time format. Use HH:MM';
  END IF;

  BEGIN
    v_target_datetime := ((p_proposed_date::text || ' ' || v_proposed_time)::timestamp)::timestamptz;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid proposed date/time';
  END;

  IF v_target_datetime <= now() THEN
    RAISE EXCEPTION 'Proposed date/time must be in the future';
  END IF;

  v_requested_duration := COALESCE(p_proposed_duration_minutes, v_current_duration);
  IF v_requested_duration < v_current_duration THEN
    RAISE EXCEPTION 'Only duration upgrades are allowed';
  END IF;

  IF v_actor_role = 'doctor' AND v_requested_duration <> v_current_duration THEN
    RAISE EXCEPTION 'Doctor-initiated reschedule can only change date/time';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.doctor_id = v_doctor_id
      AND a.id <> p_appointment_id
      AND a.date = p_proposed_date
      AND left(COALESCE(a.time, ''), 5) = v_proposed_time
      AND (
        lower(trim(COALESCE(a.status, ''))) IN ('pending_approval', 'confirmed', 'in_progress', 'completed')
        OR (
          lower(trim(COALESCE(a.status, ''))) = 'pending_payment'
          AND a.slot_locked_until IS NOT NULL
          AND a.slot_locked_until > now()
        )
        OR (
          COALESCE(a.reschedule_request_status, 'none') = 'pending'
          AND a.reschedule_proposed_date = p_proposed_date
          AND left(COALESCE(a.reschedule_proposed_time, ''), 5) = v_proposed_time
        )
      )
  ) INTO v_slot_conflict;

  IF v_slot_conflict THEN
    RAISE EXCEPTION 'Selected doctor slot is not available';
  END IF;

  v_proposed_final_price := COALESCE(p_proposed_final_price, v_current_final_price);
  IF v_proposed_final_price < v_current_final_price THEN
    v_proposed_final_price := v_current_final_price;
  END IF;

  v_proposed_final_price := ROUND(v_proposed_final_price, 2);
  v_upgrade_amount := ROUND(GREATEST(v_proposed_final_price - v_current_final_price, 0), 2);

  -- If the patient initiated the reschedule request and there is an upgrade amount,
  -- debit the patient's wallet immediately so doctor approval does not re-charge.
  IF v_actor_role = 'patient' AND v_upgrade_amount > 0 THEN
    INSERT INTO public.patient_wallet (patient_id, available_balance)
    VALUES (v_patient_id, 0)
    ON CONFLICT (patient_id) DO NOTHING;

    SELECT COALESCE(available_balance, 0)
    INTO v_wallet_balance
    FROM public.patient_wallet
    WHERE patient_id = v_patient_id
    FOR UPDATE;

    IF v_wallet_balance < v_upgrade_amount THEN
      RAISE EXCEPTION 'Insufficient wallet balance for upgrade amount of %', v_upgrade_amount;
    END IF;

    UPDATE public.patient_wallet
    SET available_balance = ROUND(COALESCE(available_balance, 0) - v_upgrade_amount, 2)
    WHERE patient_id = v_patient_id;

    INSERT INTO public.patient_wallet_transactions (
      patient_id,
      appointment_id,
      amount,
      direction,
      transaction_type,
      status,
      narration
    ) VALUES (
      v_patient_id,
      p_appointment_id,
      v_upgrade_amount,
      'debit',
      'booking_wallet_use',
      'completed',
      'Reschedule upgrade payment from wallet (at request)'
    );

    -- Mark that the upgrade has been taken care of for later approval flow
    v_upgrade_amount := 0;
  END IF;

  UPDATE public.appointments
  SET
    reschedule_request_status = 'pending',
    reschedule_requested_by = v_actor_role,
    reschedule_requested_at = now(),
    reschedule_decision_at = NULL,
    reschedule_proposed_date = p_proposed_date,
    reschedule_proposed_time = v_proposed_time,
    reschedule_proposed_duration_minutes = v_requested_duration,
    reschedule_proposed_consultation_type = COALESCE(p_proposed_consultation_type, 
      (SELECT reschedule_proposed_consultation_type FROM public.appointments WHERE id = p_appointment_id)),
    reschedule_proposed_final_price = v_proposed_final_price,
    reschedule_upgrade_amount = v_upgrade_amount,
    reschedule_request_note = p_request_note,
    reschedule_response_note = NULL
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'reschedule_request_status', 'pending',
    'requested_by', v_actor_role,
    'proposed_date', p_proposed_date,
    'proposed_time', v_proposed_time,
    'proposed_duration_minutes', v_requested_duration,
    'proposed_final_price', v_proposed_final_price,
    'upgrade_amount', v_upgrade_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_appointment_reschedule(
  p_appointment_id UUID,
  p_action TEXT,
  p_response_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_role TEXT;
  v_status TEXT;
  v_patient_id UUID;
  v_doctor_id UUID;
  v_request_status TEXT;
  v_requested_by TEXT;
  v_proposed_date DATE;
  v_proposed_time TEXT;
  v_proposed_duration INTEGER;
  v_proposed_final_price NUMERIC := 0;
  v_upgrade_amount NUMERIC := 0;
  v_action TEXT;
  v_slot_conflict BOOLEAN := FALSE;
  v_wallet_balance NUMERIC := 0;
  v_target_datetime TIMESTAMPTZ;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_action := lower(trim(COALESCE(p_action, '')));
  IF v_action NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'Action must be approve or decline';
  END IF;

  SELECT
    lower(trim(COALESCE(a.status, ''))),
    a.patient_id,
    a.doctor_id,
    COALESCE(a.reschedule_request_status, 'none'),
    a.reschedule_requested_by,
    a.reschedule_proposed_date,
    left(COALESCE(a.reschedule_proposed_time, ''), 5),
    COALESCE(a.reschedule_proposed_duration_minutes, COALESCE(a.duration_minutes, 30)),
    COALESCE(a.reschedule_proposed_final_price, COALESCE(a.final_price, 0)),
    COALESCE(a.reschedule_upgrade_amount, 0)
  INTO
    v_status,
    v_patient_id,
    v_doctor_id,
    v_request_status,
    v_requested_by,
    v_proposed_date,
    v_proposed_time,
    v_proposed_duration,
    v_proposed_final_price,
    v_upgrade_amount
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF v_actor = v_patient_id THEN
    v_actor_role := 'patient';
  ELSIF v_actor = v_doctor_id THEN
    v_actor_role := 'doctor';
  ELSE
    RAISE EXCEPTION 'Not authorized for this appointment';
  END IF;

  IF lower(trim(COALESCE(v_request_status, 'none'))) <> 'pending' THEN
    RAISE EXCEPTION 'No pending reschedule request for this appointment';
  END IF;

  IF COALESCE(v_requested_by, '') = '' THEN
    RAISE EXCEPTION 'Reschedule requester is missing';
  END IF;

  IF v_requested_by = v_actor_role THEN
    RAISE EXCEPTION 'Requester cannot approve or decline their own reschedule request';
  END IF;

  IF v_action = 'decline' THEN
    UPDATE public.appointments
    SET
      reschedule_request_status = 'declined',
      reschedule_decision_at = now(),
      reschedule_response_note = p_response_note
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object(
      'appointment_id', p_appointment_id,
      'action', 'decline',
      'reschedule_request_status', 'declined',
      'status', v_status,
      'charged_upgrade_amount', 0
    );
  END IF;

  IF v_proposed_date IS NULL OR COALESCE(v_proposed_time, '') = '' THEN
    RAISE EXCEPTION 'Reschedule proposal is incomplete';
  END IF;

  BEGIN
    v_target_datetime := ((v_proposed_date::text || ' ' || v_proposed_time)::timestamp)::timestamptz;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid proposed date/time';
  END;

  IF v_target_datetime <= now() THEN
    RAISE EXCEPTION 'Proposed date/time is in the past';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.doctor_id = v_doctor_id
      AND a.id <> p_appointment_id
      AND a.date = v_proposed_date
      AND left(COALESCE(a.time, ''), 5) = left(v_proposed_time, 5)
      AND (
        lower(trim(COALESCE(a.status, ''))) IN ('pending_approval', 'confirmed', 'in_progress', 'completed')
        OR (
          lower(trim(COALESCE(a.status, ''))) = 'pending_payment'
          AND a.slot_locked_until IS NOT NULL
          AND a.slot_locked_until > now()
        )
        OR (
          COALESCE(a.reschedule_request_status, 'none') = 'pending'
          AND a.reschedule_proposed_date = v_proposed_date
          AND left(COALESCE(a.reschedule_proposed_time, ''), 5) = left(v_proposed_time, 5)
        )
      )
  ) INTO v_slot_conflict;

  IF v_slot_conflict THEN
    RAISE EXCEPTION 'Selected doctor slot is no longer available';
  END IF;

  IF v_upgrade_amount > 0 THEN
    -- If the patient originally requested the reschedule then the upgrade amount
    -- should already have been collected at request time; skip wallet debit here.
    IF lower(trim(COALESCE(v_requested_by, ''))) = 'patient' THEN
      v_upgrade_amount := 0;
    ELSE
      -- If an external payment for this reschedule upgrade already completed (e.g. Paystack),
      -- prefer that and skip debiting the patient's wallet here to avoid double-charging
      IF EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.appointment_id = p_appointment_id
          AND lower(COALESCE(p.status, '')) IN ('completed', 'success')
          AND COALESCE(p.metadata->>'type', '') = 'reschedule_upgrade'
      ) THEN
        -- External payment already completed; do not touch wallet
        v_upgrade_amount := 0;
      ELSE
        INSERT INTO public.patient_wallet (patient_id, available_balance)
        VALUES (v_patient_id, 0)
        ON CONFLICT (patient_id) DO NOTHING;

        SELECT COALESCE(available_balance, 0)
        INTO v_wallet_balance
        FROM public.patient_wallet
        WHERE patient_id = v_patient_id
        FOR UPDATE;

        IF v_wallet_balance < v_upgrade_amount THEN
          RAISE EXCEPTION 'Insufficient wallet balance for upgrade amount of %', v_upgrade_amount;
        END IF;

        UPDATE public.patient_wallet
        SET available_balance = ROUND(COALESCE(available_balance, 0) - v_upgrade_amount, 2)
        WHERE patient_id = v_patient_id;

        INSERT INTO public.patient_wallet_transactions (
          patient_id,
          appointment_id,
          amount,
          direction,
          transaction_type,
          status,
          narration
        ) VALUES (
          v_patient_id,
          p_appointment_id,
          v_upgrade_amount,
          'debit',
          'booking_wallet_use',
          'completed',
          'Reschedule upgrade payment from wallet'
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.appointments
  SET
    date = v_proposed_date,
    time = v_proposed_time,
    duration_minutes = v_proposed_duration,
    final_price = v_proposed_final_price,
    status = CASE WHEN v_status = 'pending_approval' THEN 'pending_approval' ELSE 'confirmed' END,
    slot_locked_until = NULL,
    reschedule_request_status = 'approved',
    reschedule_decision_at = now(),
    reschedule_response_note = p_response_note
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'action', 'approve',
    'reschedule_request_status', 'approved',
    'status', CASE WHEN v_status = 'pending_approval' THEN 'pending_approval' ELSE 'confirmed' END,
    'charged_upgrade_amount', ROUND(v_upgrade_amount, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_appointment_reschedule(UUID, DATE, TEXT, INTEGER, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_appointment_reschedule(UUID, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_appointment_reschedule(UUID, DATE, TEXT, INTEGER, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_appointment_reschedule(UUID, TEXT, TEXT) TO authenticated;
