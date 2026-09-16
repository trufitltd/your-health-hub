-- 20260830000000_phase4_assignment_operations.sql
-- Phase 4: Assignment operations — auto-trigger, retry, idempotency.
--
-- This migration:
-- 1. Adds retry tracking columns to appointments
-- 2. Adds assignment tracking columns to appointments
-- 3. Creates index for stuck appointment queries
-- 4. Adds org admin notification config keys
--
-- SAFETY: All changes are additive. No existing data changes.

-- =========================================================================
-- SECTION 1: Retry tracking on appointments
-- =========================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS assignment_retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS last_assignment_attempt_at TIMESTAMPTZ NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS assignment_failed_reason TEXT NULL;

COMMENT ON COLUMN public.appointments.assignment_retry_count
  IS 'Number of automatic assignment attempts. Max 5 before requiring manual intervention.';
COMMENT ON COLUMN public.appointments.last_assignment_attempt_at
  IS 'Timestamp of last automatic assignment attempt.';
COMMENT ON COLUMN public.appointments.assignment_failed_reason
  IS 'Reason for last assignment failure, if any.';

-- Index for finding stuck pending_assignment appointments
CREATE INDEX IF NOT EXISTS idx_appointments_pending_assignment
  ON public.appointments(status, created_at)
  WHERE status = 'pending_assignment';

-- Index for assignment retry queries
CREATE INDEX IF NOT EXISTS idx_appointments_assignment_retry
  ON public.appointments(status, assignment_retry_count, last_assignment_attempt_at)
  WHERE status = 'pending_assignment';

-- =========================================================================
-- SECTION 2: Org admin notification config
-- =========================================================================

-- Add notification config keys for organisations
-- admin_notifications_enabled: whether org admins get notified on failures
-- notification_phone: phone number for SMS notifications to org admins
-- notification_email: email for notifications to org admins

-- These are seeded per-org as needed. No default insert here to avoid
-- breaking existing organisations.

-- =========================================================================
-- SECTION 3: Assignment queue indexes
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_assign_queue_org_status
  ON public.assign_clinician_queue(organisation_id, status);

CREATE INDEX IF NOT EXISTS idx_assign_queue_appointment
  ON public.assign_clinician_queue(appointment_id);

-- =========================================================================
-- SECTION 4: Organisation config additions
-- =========================================================================

-- max_assignment_retries: how many automatic retries before manual intervention
-- assignment_timeout_minutes: how long before a stuck appointment is considered failed
-- auto_assign_enabled: whether to auto-assign after payment (default true for internal_assign)
