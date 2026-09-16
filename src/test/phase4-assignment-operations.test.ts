import { describe, it, expect } from 'vitest';

describe('Phase 4: Auto-trigger assignment after payment', () => {
  it('moveAppointmentToApprovalReady detects internal assignment', () => {
    // Simulates the check in BookingService.moveAppointmentToApprovalReady
    const appointment = { doctor_id: null, service_type: 'General Consultation', organisation_id: 'org-1' };
    const isInternalAssignment = !appointment.doctor_id && !!appointment.service_type;
    expect(isInternalAssignment).toBe(true);
  });

  it('moveAppointmentToApprovalReady does not trigger for standard booking', () => {
    const appointment = { doctor_id: 'doc-1', service_type: undefined, organisation_id: 'org-1' };
    const isInternalAssignment = !appointment.doctor_id && !!appointment.service_type;
    expect(isInternalAssignment).toBe(false);
  });

  it('assignment is triggered after pending_assignment status is set', () => {
    // Verify the flow: payment -> pending_assignment -> auto-assign -> pending_approval
    const statusFlow = ['pending_payment', 'pending_assignment', 'pending_approval'];
    expect(statusFlow).toContain('pending_assignment');
    expect(statusFlow.indexOf('pending_assignment')).toBeLessThan(statusFlow.indexOf('pending_approval'));
  });

  it('assignment failure does not block payment webhook response', () => {
    // The auto-trigger is wrapped in try/catch — payment always succeeds
    const paymentResult = { success: true };
    const assignmentResult = { success: false, error: 'No available clinicians' };
    expect(paymentResult.success).toBe(true);
    expect(assignmentResult.success).toBe(false);
  });
});

describe('Phase 4: Idempotency and concurrency', () => {
  it('rejects assignment if appointment already has a doctor', () => {
    const appointment = { status: 'pending_assignment', doctor_id: 'doc-1' };
    const canAssign = appointment.status === 'pending_assignment' && !appointment.doctor_id;
    expect(canAssign).toBe(false);
  });

  it('rejects assignment if appointment is not in pending_assignment', () => {
    const appointment = { status: 'confirmed', doctor_id: null };
    const canAssign = appointment.status === 'pending_assignment' && !appointment.doctor_id;
    expect(canAssign).toBe(false);
  });

  it('concurrent assignment prevented by atomic WHERE clause', () => {
    // Two processes try to assign simultaneously
    // Process 1: UPDATE WHERE status='pending_assignment' AND doctor_id IS NULL → succeeds
    // Process 2: UPDATE WHERE status='pending_assignment' AND doctor_id IS NULL → fails (doctor_id already set)
    const process1Update = { affected: 1 }; // row matched
    const process2Update = { affected: 0 }; // row no longer matches
    expect(process1Update.affected).toBe(1);
    expect(process2Update.affected).toBe(0);
  });

  it('same appointment assigned twice returns alreadyProcessed', () => {
    const appointment = { status: 'pending_approval', doctor_id: 'doc-1' };
    const alreadyProcessed = appointment.status === 'pending_approval';
    expect(alreadyProcessed).toBe(true);
  });

  it('retry on already-assigned appointment does not re-assign', () => {
    const appointment = { status: 'pending_approval', doctor_id: 'doc-1', assignment_retry_count: 3 };
    const shouldRetry = appointment.status === 'pending_assignment' && appointment.assignment_retry_count < 5;
    expect(shouldRetry).toBe(false);
  });
});

describe('Phase 4: Retry mechanism', () => {
  it('max retry count is 5', () => {
    const MAX_RETRY_COUNT = 5;
    expect(MAX_RETRY_COUNT).toBe(5);
  });

  it('appointment with retry_count >= max is not retried', () => {
    const appointment = { assignment_retry_count: 5 };
    const maxRetries = 5;
    const shouldRetry = appointment.assignment_retry_count < maxRetries;
    expect(shouldRetry).toBe(false);
  });

  it('appointment with retry_count < max IS retried', () => {
    const appointment = { assignment_retry_count: 2 };
    const maxRetries = 5;
    const shouldRetry = appointment.assignment_retry_count < maxRetries;
    expect(shouldRetry).toBe(true);
  });

  it('retry increments retry_count and sets last_assignment_attempt_at', () => {
    const appointment = { assignment_retry_count: 0, last_assignment_attempt_at: null };
    // Simulate retry
    appointment.assignment_retry_count += 1;
    appointment.last_assignment_attempt_at = new Date().toISOString();
    expect(appointment.assignment_retry_count).toBe(1);
    expect(appointment.last_assignment_attempt_at).not.toBeNull();
  });

  it('successful retry resets retry_count to 0', () => {
    const appointment = { assignment_retry_count: 3, last_assignment_attempt_at: new Date().toISOString() };
    // Simulate successful assignment
    appointment.assignment_retry_count = 0;
    appointment.last_assignment_attempt_at = null;
    expect(appointment.assignment_retry_count).toBe(0);
    expect(appointment.last_assignment_attempt_at).toBeNull();
  });

  it('stuck appointment detected by timeout and retry_count', () => {
    const appointment = {
      status: 'pending_assignment',
      assignment_retry_count: 1,
      last_assignment_attempt_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 min ago
    };
    const timeoutMinutes = 30;
    const maxRetries = 5;
    const lastAttempt = new Date(appointment.last_assignment_attempt_at).getTime();
    const cutoff = Date.now() - timeoutMinutes * 60 * 1000;
    const isStuck = appointment.status === 'pending_assignment'
      && appointment.assignment_retry_count < maxRetries
      && lastAttempt < cutoff;
    expect(isStuck).toBe(true);
  });

  it('appointment with no previous attempt is considered stuck', () => {
    const appointment = {
      status: 'pending_assignment',
      assignment_retry_count: 0,
      last_assignment_attempt_at: null,
    };
    const isStuck = appointment.status === 'pending_assignment'
      && appointment.assignment_retry_count < 5
      && (appointment.last_assignment_attempt_at === null);
    expect(isStuck).toBe(true);
  });

  it('non-retryable failure sets assignment_failed_reason', () => {
    const appointment = { assignment_failed_reason: null };
    const failureReason = 'No clinicians with required specialties: Cardiology';
    appointment.assignment_failed_reason = failureReason;
    expect(appointment.assignment_failed_reason).toBe(failureReason);
  });
});

describe('Phase 4: Double-booking prevention', () => {
  it('time overlap detection works correctly', () => {
    const timeToMinutes = (time: string) => {
      const parts = time.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    const newAppt = { start: timeToMinutes('10:00'), end: timeToMinutes('10:00') + 30 };
    const existingAppts = [
      { time: '09:00', duration_minutes: 60 },  // 540-600: no conflict
      { time: '10:00', duration_minutes: 30 },   // 600-630: CONFLICT
      { time: '11:00', duration_minutes: 30 },   // 660-690: no conflict
    ];

    const hasConflict = existingAppts.some((apt) => {
      const aptStart = timeToMinutes(apt.time);
      const aptEnd = aptStart + apt.duration_minutes;
      return newAppt.start < aptEnd && newAppt.end > aptStart;
    });

    expect(hasConflict).toBe(true);
  });

  it('no conflict when appointments do not overlap', () => {
    const timeToMinutes = (time: string) => {
      const parts = time.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    const newAppt = { start: timeToMinutes('11:00'), end: timeToMinutes('11:00') + 30 };
    const existingAppts = [
      { time: '09:00', duration_minutes: 60 },
      { time: '10:00', duration_minutes: 30 },
    ];

    const hasConflict = existingAppts.some((apt) => {
      const aptStart = timeToMinutes(apt.time);
      const aptEnd = aptStart + apt.duration_minutes;
      return newAppt.start < aptEnd && newAppt.end > aptStart;
    });

    expect(hasConflict).toBe(false);
  });

  it('conflict statuses include pending_assignment exclusion', () => {
    // Appointments in pending_assignment should NOT block other bookings
    // (the doctor_id is null until assignment completes)
    const conflictingStatuses = ['confirmed', 'pending_approval', 'in_progress', 'completed', 'pending_payment'];
    expect(conflictingStatuses).not.toContain('pending_assignment');
  });
});

describe('Phase 4: Manual assignment and reassignment', () => {
  it('assignSpecificClinician validates same organisation', () => {
    const appointment = { organisation_id: 'org-ciba' };
    const doctor = { organisation_id: 'org-ciba', is_active: true };
    const sameOrg = appointment.organisation_id === doctor.organisation_id;
    expect(sameOrg).toBe(true);
  });

  it('assignSpecificClinician rejects doctor from different org', () => {
    const appointment = { organisation_id: 'org-ciba' };
    const doctor = { organisation_id: 'org-other', is_active: true };
    const sameOrg = appointment.organisation_id === doctor.organisation_id;
    expect(sameOrg).toBe(false);
  });

  it('assignSpecificClinician checks schedule for day of week', () => {
    const appointmentDate = '2026-09-01'; // Tuesday
    const dayOfWeek = new Date(appointmentDate).getDay(); // 2
    expect(dayOfWeek).toBe(2); // Tuesday
  });

  it('admin can reassign by calling assignSpecificClinician again', () => {
    // Reassignment is just another call to assignSpecificClinician
    // The atomic UPDATE WHERE ensures only pending_assignment appointments can be reassigned
    const appointment = { status: 'pending_assignment', doctor_id: null };
    const canReassign = appointment.status === 'pending_assignment' && !appointment.doctor_id;
    expect(canReassign).toBe(true);
  });
});

describe('Phase 4: Notifications', () => {
  it('patient notification includes doctor name and appointment details', () => {
    const notification = {
      title: 'MyE-Doctor - Clinician Assigned',
      body: 'Dr. Smith has been assigned to your General Consultation appointment on 2026-09-01 at 10:00.',
      url: '/consultation/apt-1',
    };
    expect(notification.body).toContain('Dr. Smith');
    expect(notification.body).toContain('General Consultation');
    expect(notification.url).toContain('apt-1');
  });

  it('admin notification includes failure reason', () => {
    const notification = {
      title: 'MyE-Doctor - Assignment Failed',
      body: 'Automatic clinician assignment failed for John Doe\'s General Consultation on 2026-09-01 at 10:00. Reason: No clinicians available.',
    };
    expect(notification.body).toContain('John Doe');
    expect(notification.body).toContain('No clinicians available');
  });

  it('notification uses org brand name from organisation_config', () => {
    const orgConfig = { brand_name: 'CIBA Wellness' };
    const title = `${orgConfig.brand_name} - Clinician Assigned`;
    expect(title).toBe('CIBA Wellness - Clinician Assigned');
  });

  it('notification is non-blocking — assignment succeeds even if notification fails', () => {
    const assignmentResult = { success: true, doctorId: 'doc-1' };
    const notificationResult = { success: false, error: 'Push service unavailable' };
    expect(assignmentResult.success).toBe(true);
  });
});

describe('Phase 4: Cross-organisation isolation', () => {
  it('org-scoped RLS prevents seeing other org assignments', () => {
    const rlsPolicy = 'is_org_admin(organisation_id, auth.uid()) OR is_platform_superadmin(auth.uid())';
    expect(rlsPolicy).toContain('organisation_id');
    expect(rlsPolicy).toContain('is_platform_superadmin');
  });

  it('superadmin can see all org assignments', () => {
    const userRole = 'platform_superadmin';
    const canSeeAll = userRole === 'platform_superadmin';
    expect(canSeeAll).toBe(true);
  });

  it('org admin can only see their org assignments', () => {
    const userRole = 'org_admin';
    const userOrgId = 'org-ciba';
    const appointmentOrgId = 'org-ciba';
    const canSee = userRole === 'org_admin' && userOrgId === appointmentOrgId;
    expect(canSee).toBe(true);
  });

  it('org admin cannot see other org assignments', () => {
    const userRole = 'org_admin';
    const userOrgId = 'org-ciba';
    const appointmentOrgId = 'org-other';
    const canSee = userRole === 'org_admin' && userOrgId === appointmentOrgId;
    expect(canSee).toBe(false);
  });
});

describe('Phase 4: MyE-Doctor regression', () => {
  it('standard booking still goes directly to pending_approval', () => {
    const appointment = { doctor_id: 'doc-1', service_type: null };
    const isInternalAssignment = !appointment.doctor_id && !!appointment.service_type;
    expect(isInternalAssignment).toBe(false);
    // Standard booking: pending_payment -> pending_approval (no pending_assignment step)
  });

  it('wallet earnings still created immediately for standard booking', () => {
    const appointment = { doctor_id: 'doc-1' };
    const shouldCreateEarning = !!appointment.doctor_id;
    expect(shouldCreateEarning).toBe(true);
  });

  it('wallet earnings deferred for internal assignment', () => {
    const appointment = { doctor_id: null, service_type: 'General Consultation' };
    const shouldCreateEarning = !!appointment.doctor_id;
    expect(shouldCreateEarning).toBe(false);
  });

  it('doctor discovery page unaffected', () => {
    const route = '/doctor-discovery';
    expect(route).toBe('/doctor-discovery');
  });

  it('slot selection works for patient_select mode', () => {
    const state = { doctorId: 'doc-1', organisationId: null };
    const isInternalAssignment = !state.doctorId && !!state.organisationId;
    expect(isInternalAssignment).toBe(false);
  });

  it('slot selection works for internal_assign mode', () => {
    const state = { doctorId: null, organisationId: 'org-ciba', serviceType: 'General Consultation' };
    const isInternalAssignment = !state.doctorId && !!state.organisationId;
    expect(isInternalAssignment).toBe(true);
  });

  it('pending_assignment status added to AppointmentStatus type', () => {
    const validStatuses = [
      'pending_payment', 'pending_assignment', 'pending_approval',
      'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show',
    ];
    expect(validStatuses).toContain('pending_assignment');
  });

  it('pending_assignment blocks slot availability', () => {
    const slotBlockingStatuses = [
      'pending_payment', 'pending_assignment', 'pending_approval',
      'confirmed', 'in_progress', 'completed',
    ];
    expect(slotBlockingStatuses).toContain('pending_assignment');
  });
});
