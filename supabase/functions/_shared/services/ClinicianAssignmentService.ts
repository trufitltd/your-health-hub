import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyPatientAssigned, notifyAdminAssignmentFailed } from '../notification-helpers.ts';

export interface AssignmentResult {
  success: boolean;
  doctorId?: string;
  doctorName?: string;
  appointmentId: string;
  error?: string;
  retryable?: boolean;
  pipeline?: {
    serviceFound: boolean;
    requiredSpecialties: string[];
    organisationMemberCount: number;
    qualifiedCount: number;
    availableCount: number;
    conflictFreeCount: number;
    selectedDoctorId?: string;
  };
}

const MAX_RETRY_COUNT = 5;

/**
 * ClinicianAssignmentService — internal clinician assignment pipeline.
 *
 * Pipeline:
 *   1. CIBA Service           → load service from organisation_services
 *   2. Required clinician capability → read required_specialties from service
 *   3. Organisation members   → find all active doctors in the org
 *   4. Qualified clinicians   → filter by specialty match
 *   5. Available at requested time → check doctor_schedules
 *   6. No conflicting appointment  → check existing appointments
 *   7. Select clinician       → round-robin (fewest recent assignments)
 *   8. pending_approval       → update appointment status
 *
 * Idempotency: Checks appointment status before and during assignment.
 * Concurrency: Uses optimistic locking via status check + update atomically.
 */
export class ClinicianAssignmentService {
  constructor(
    private readonly supabase: SupabaseClient,
  ) {}

  async assignClinician(appointmentId: string): Promise<AssignmentResult> {
    const pipeline = {
      serviceFound: false,
      requiredSpecialties: [] as string[],
      organisationMemberCount: 0,
      qualifiedCount: 0,
      availableCount: 0,
      conflictFreeCount: 0,
      selectedDoctorId: undefined as string | undefined,
    };

    // ── Step 1: Load appointment ──────────────────────────────────────
    const { data: appointment, error: apptError } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptError || !appointment) {
      return { success: false, appointmentId, error: `Appointment not found: ${apptError?.message || 'unknown'}`, pipeline };
    }

    // ── Idempotency: Already assigned or not pending ──────────────────
    if (appointment.status !== 'pending_assignment') {
      return {
        success: false,
        appointmentId,
        error: `Appointment is not in pending_assignment status (current: ${appointment.status})`,
        retryable: false,
        pipeline,
      };
    }

    if (appointment.doctor_id) {
      return {
        success: false,
        appointmentId,
        error: 'Appointment already has a doctor assigned',
        retryable: false,
        pipeline,
      };
    }

    // ── Retry limit check ────────────────────────────────────────────
    if ((appointment.assignment_retry_count || 0) >= MAX_RETRY_COUNT) {
      return {
        success: false,
        appointmentId,
        error: `Max retry attempts (${MAX_RETRY_COUNT}) reached. Requires manual assignment.`,
        retryable: false,
        pipeline,
      };
    }

    const organisationId = appointment.organisation_id;
    if (!organisationId) {
      return { success: false, appointmentId, error: 'Appointment has no organisation assigned', retryable: false, pipeline };
    }

    const serviceName = appointment.service_type;
    if (!serviceName) {
      return { success: false, appointmentId, error: 'Appointment has no service_type set', retryable: false, pipeline };
    }

    const appointmentDate = appointment.date;
    const appointmentTime = appointment.time;
    const durationMinutes = appointment.duration_minutes || 30;

    // ── Step 2: CIBA Service → load from organisation_services ────────
    const { data: orgService, error: svcError } = await this.supabase
      .from('organisation_services')
      .select('id, name, required_specialties, consultation_mode')
      .eq('organisation_id', organisationId)
      .eq('name', serviceName)
      .eq('active', true)
      .maybeSingle();

    if (svcError || !orgService) {
      await this.recordAttempt(appointmentId, false, `Service "${serviceName}" not found or inactive`);
      return { success: false, appointmentId, error: `Service "${serviceName}" not found or inactive for this organisation`, pipeline };
    }

    pipeline.serviceFound = true;

    // ── Step 3: Required clinician capability ─────────────────────────
    const requiredSpecialties: string[] = Array.isArray(orgService.required_specialties)
      ? orgService.required_specialties
      : [];

    pipeline.requiredSpecialties = requiredSpecialties;

    // ── Step 4: Organisation members → find all active doctors ────────
    const { data: orgDoctors, error: doctorsError } = await this.supabase
      .from('doctors')
      .select('id, user_id')
      .eq('organisation_id', organisationId)
      .eq('is_active', true);

    if (doctorsError) {
      await this.recordAttempt(appointmentId, false, `Failed to load organisation doctors: ${doctorsError.message}`);
      return { success: false, appointmentId, error: `Failed to load organisation doctors: ${doctorsError.message}`, retryable: true, pipeline };
    }

    const allOrgDoctors = orgDoctors || [];
    pipeline.organisationMemberCount = allOrgDoctors.length;

    if (allOrgDoctors.length === 0) {
      await this.recordAttempt(appointmentId, false, 'No active doctors in this organisation');
      return { success: false, appointmentId, error: 'No active doctors in this organisation', retryable: false, pipeline };
    }

    // ── Step 5: Qualified clinicians → filter by specialty ────────────
    let qualifiedDoctors = allOrgDoctors;

    if (requiredSpecialties.length > 0) {
      const userIds = allOrgDoctors.map((d) => d.user_id);
      const { data: registrations } = await this.supabase
        .from('doctor_registrations')
        .select('user_id, specialty')
        .in('user_id', userIds);

      const regMap = new Map<string, string>();
      (registrations || []).forEach((r: any) => {
        regMap.set(r.user_id, (r.specialty || '').toLowerCase().trim());
      });

      const normalizedRequired = requiredSpecialties.map((s) => s.toLowerCase().trim());

      qualifiedDoctors = allOrgDoctors.filter((doc) => {
        const specialty = regMap.get(doc.user_id) || '';
        return normalizedRequired.some((req) => {
          if (req === 'gp' || req === 'general practice' || req === 'general practitioner') {
            return specialty === 'gp' || specialty === 'general practice' || specialty === 'general practitioner';
          }
          return specialty.includes(req) || req.includes(specialty);
        });
      });

      pipeline.qualifiedCount = qualifiedDoctors.length;

      if (qualifiedDoctors.length === 0) {
        await this.recordAttempt(appointmentId, false, `No clinicians with required specialties: ${requiredSpecialties.join(', ')}`);
        return {
          success: false,
          appointmentId,
          error: `No clinicians qualified for this service (required: ${requiredSpecialties.join(', ')})`,
          retryable: false,
          pipeline,
        };
      }
    } else {
      pipeline.qualifiedCount = qualifiedDoctors.length;
    }

    // ── Step 6: Available at requested time → check schedules ─────────
    const dayOfWeek = new Date(appointmentDate).getDay();
    const availableDoctors: string[] = [];

    for (const doctor of qualifiedDoctors) {
      const { data: schedule } = await this.supabase
        .from('doctor_schedules')
        .select('id')
        .eq('doctor_id', doctor.user_id)
        .eq('organisation_id', organisationId)
        .eq('day_of_week', dayOfWeek)
        .eq('active', true)
        .maybeSingle();

      if (schedule) {
        availableDoctors.push(doctor.user_id);
      }
    }

    pipeline.availableCount = availableDoctors.length;

    if (availableDoctors.length === 0) {
      await this.recordAttempt(appointmentId, false, 'No qualified clinicians available on this day');
      return {
        success: false,
        appointmentId,
        error: 'No qualified clinicians available on this day of the week',
        retryable: true,
        pipeline,
      };
    }

    // ── Step 7: No conflicting appointment ────────────────────────────
    const appointmentStartMinutes = this.timeToMinutes(appointmentTime);
    const appointmentEndMinutes = appointmentStartMinutes + durationMinutes;

    const conflictFreeDoctors: string[] = [];

    for (const doctorId of availableDoctors) {
      const { data: conflicts } = await this.supabase
        .from('appointments')
        .select('id, time, duration_minutes')
        .eq('doctor_id', doctorId)
        .eq('date', appointmentDate)
        .in('status', ['confirmed', 'pending_approval', 'in_progress', 'completed', 'pending_payment'])
        .not('id', 'eq', appointmentId);

      const hasConflict = (conflicts || []).some((conflict: any) => {
        const conflictStart = this.timeToMinutes(conflict.time);
        const conflictEnd = conflictStart + (conflict.duration_minutes || 30);
        return appointmentStartMinutes < conflictEnd && appointmentEndMinutes > conflictStart;
      });

      if (!hasConflict) {
        conflictFreeDoctors.push(doctorId);
      }
    }

    pipeline.conflictFreeCount = conflictFreeDoctors.length;

    if (conflictFreeDoctors.length === 0) {
      await this.recordAttempt(appointmentId, false, 'All qualified clinicians have conflicting appointments at this time');
      return {
        success: false,
        appointmentId,
        error: 'No qualified clinician is free at the requested time',
        retryable: true,
        pipeline,
      };
    }

    // ── Step 8: Select clinician → round-robin ────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentAssignments } = await this.supabase
      .from('appointments')
      .select('doctor_id')
      .eq('organisation_id', organisationId)
      .in('doctor_id', conflictFreeDoctors)
      .gte('created_at', sevenDaysAgo)
      .not('doctor_id', 'is', null);

    const assignmentCounts: Record<string, number> = {};
    conflictFreeDoctors.forEach((id) => { assignmentCounts[id] = 0; });
    (recentAssignments || []).forEach((row: any) => {
      if (row.doctor_id && assignmentCounts[row.doctor_id] !== undefined) {
        assignmentCounts[row.doctor_id]++;
      }
    });

    const selectedDoctorId = conflictFreeDoctors.reduce((best, current) =>
      (assignmentCounts[current] < assignmentCounts[best]) ? current : best
    );

    pipeline.selectedDoctorId = selectedDoctorId;

    // ── Step 9: Atomic update — prevents concurrent assignment ─────────
    // Use status check in WHERE to ensure only one assignment succeeds
    const { data: updated, error: updateError } = await this.supabase
      .from('appointments')
      .update({
        doctor_id: selectedDoctorId,
        status: 'pending_approval',
        slot_locked_until: null,
        assignment_retry_count: 0,
        last_assignment_attempt_at: null,
        assignment_failed_reason: null,
      })
      .eq('id', appointmentId)
      .eq('status', 'pending_assignment')
      .is('doctor_id', null)
      .select('id')
      .maybeSingle();

    if (updateError || !updated) {
      // Another process likely assigned this appointment already
      await this.recordAttempt(appointmentId, false, 'Concurrent assignment detected — appointment was modified');
      return {
        success: false,
        appointmentId,
        error: 'Appointment was concurrently modified. Another assignment may have succeeded.',
        retryable: false,
        pipeline,
      };
    }

    // ── Record successful assignment ──────────────────────────────────
    await this.supabase.from('assign_clinician_queue').insert({
      appointment_id: appointmentId,
      organisation_id: organisationId,
      service_name: serviceName,
      preferred_date: appointmentDate,
      preferred_time: appointmentTime,
      preferred_duration_minutes: durationMinutes,
      status: 'assigned',
      assigned_doctor_id: selectedDoctorId,
      assigned_at: new Date().toISOString(),
    });

    // Get doctor name
    const { data: doctorReg } = await this.supabase
      .from('doctor_registrations')
      .select('full_name')
      .eq('user_id', selectedDoctorId)
      .maybeSingle();

    const doctorName = doctorReg?.full_name || 'Doctor';

    // ── Send patient notification (non-blocking) ──────────────────────
    try {
      // Load patient details
      const { data: patientProfile } = await this.supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', appointment.patient_id)
        .maybeSingle();

      await notifyPatientAssigned(this.supabase, {
        organisationId,
        appointmentId,
        patientId: appointment.patient_id,
        patientName: patientProfile?.full_name || undefined,
        patientPhone: patientProfile?.phone || undefined,
        doctorName,
        serviceName,
        appointmentDate,
        appointmentTime,
      });
    } catch (notifError) {
      console.warn('[ClinicianAssignmentService] Patient notification failed:', notifError);
    }

    return {
      success: true,
      doctorId: selectedDoctorId,
      doctorName,
      appointmentId,
      pipeline,
    };
  }

  async assignSpecificClinician(appointmentId: string, doctorId: string): Promise<AssignmentResult> {
    const pipeline = {
      serviceFound: false,
      requiredSpecialties: [] as string[],
      organisationMemberCount: 0,
      qualifiedCount: 0,
      availableCount: 0,
      conflictFreeCount: 0,
      selectedDoctorId: doctorId,
    };

    const { data: appointment, error: apptError } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();

    if (apptError || !appointment) {
      return { success: false, appointmentId, error: `Appointment not found: ${apptError?.message || 'unknown'}`, pipeline };
    }

    if (appointment.status !== 'pending_assignment') {
      return { success: false, appointmentId, error: `Appointment is not in pending_assignment status (current: ${appointment.status})`, retryable: false, pipeline };
    }

    // Verify doctor belongs to same org
    const { data: doctor } = await this.supabase
      .from('doctors')
      .select('id, organisation_id')
      .eq('id', doctorId)
      .eq('organisation_id', appointment.organisation_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!doctor) {
      return { success: false, appointmentId, error: 'Doctor not found or not in the same organisation', retryable: false, pipeline };
    }

    // Check schedule
    const dayOfWeek = new Date(appointment.date).getDay();
    const { data: schedule } = await this.supabase
      .from('doctor_schedules')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('organisation_id', appointment.organisation_id)
      .eq('day_of_week', dayOfWeek)
      .eq('active', true)
      .maybeSingle();

    if (!schedule) {
      return { success: false, appointmentId, error: 'Doctor is not scheduled for this day', retryable: false, pipeline };
    }

    // Check conflicts
    const appointmentStartMinutes = this.timeToMinutes(appointment.time);
    const appointmentEndMinutes = appointmentStartMinutes + (appointment.duration_minutes || 30);

    const { data: conflicts } = await this.supabase
      .from('appointments')
      .select('id, time, duration_minutes')
      .eq('doctor_id', doctorId)
      .eq('date', appointment.date)
      .in('status', ['confirmed', 'pending_approval', 'in_progress', 'completed', 'pending_payment'])
      .not('id', 'eq', appointmentId);

    const hasConflict = (conflicts || []).some((conflict: any) => {
      const conflictStart = this.timeToMinutes(conflict.time);
      const conflictEnd = conflictStart + (conflict.duration_minutes || 30);
      return appointmentStartMinutes < conflictEnd && appointmentEndMinutes > conflictStart;
    });

    if (hasConflict) {
      return { success: false, appointmentId, error: 'Doctor has a conflicting appointment at this time', retryable: false, pipeline };
    }

    // Atomic update with concurrency guard
    const { data: updated, error: updateError } = await this.supabase
      .from('appointments')
      .update({
        doctor_id: doctorId,
        status: 'pending_approval',
        slot_locked_until: null,
        assignment_retry_count: 0,
        last_assignment_attempt_at: null,
        assignment_failed_reason: null,
      })
      .eq('id', appointmentId)
      .eq('status', 'pending_assignment')
      .is('doctor_id', null)
      .select('id')
      .maybeSingle();

    if (updateError || !updated) {
      return { success: false, appointmentId, error: 'Appointment was concurrently modified', retryable: false, pipeline };
    }

    await this.supabase.from('assign_clinician_queue').insert({
      appointment_id: appointmentId,
      organisation_id: appointment.organisation_id,
      service_name: appointment.service_type || 'unknown',
      preferred_date: appointment.date,
      preferred_time: appointment.time,
      preferred_duration_minutes: appointment.duration_minutes || 30,
      status: 'assigned',
      assigned_doctor_id: doctorId,
      assigned_at: new Date().toISOString(),
    });

    const { data: doctorReg } = await this.supabase
      .from('doctor_registrations')
      .select('full_name')
      .eq('user_id', doctorId)
      .maybeSingle();

    return {
      success: true,
      doctorId,
      doctorName: doctorReg?.full_name || 'Doctor',
      appointmentId,
      pipeline,
    };
  }

  /**
   * Process stuck pending_assignment appointments.
   * Called by the retry edge function or cron.
   */
  async processStuckAppointments(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  }> {
    const maxRetries = MAX_RETRY_COUNT;
    const timeoutMinutes = 30;

    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    const { data: stuckAppointments, error } = await this.supabase
      .from('appointments')
      .select('id')
      .eq('status', 'pending_assignment')
      .lt('assignment_retry_count', maxRetries)
      .or(`last_assignment_attempt_at.is.null,last_assignment_attempt_at.lt.${cutoff}`)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error || !stuckAppointments) {
      return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    for (const apt of stuckAppointments) {
      // Increment retry count first
      await this.supabase
        .from('appointments')
        .update({
          assignment_retry_count: (await this.getRetryCount(apt.id)) + 1,
          last_assignment_attempt_at: new Date().toISOString(),
        })
        .eq('id', apt.id);

      const result = await this.assignClinician(apt.id);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
        const currentRetryCount = (await this.getRetryCount(apt.id));
        const retriesExhausted = currentRetryCount >= MAX_RETRY_COUNT;

        if (result.retryable === false || retriesExhausted) {
          // Mark with reason
          await this.supabase
            .from('appointments')
            .update({ assignment_failed_reason: result.error })
            .eq('id', apt.id);

          // Notify org admins
          try {
            const { data: aptDetails } = await this.supabase
              .from('appointments')
              .select('organisation_id, patient_id, service_type, date, time')
              .eq('id', apt.id)
              .maybeSingle();

            if (aptDetails) {
              const { data: patientProfile } = await this.supabase
                .from('profiles')
                .select('full_name')
                .eq('id', aptDetails.patient_id)
                .maybeSingle();

              const { data: service } = await this.supabase
                .from('organisation_services')
                .select('name')
                .eq('organisation_id', aptDetails.organisation_id)
                .eq('name', aptDetails.service_type)
                .maybeSingle();

              await notifyAdminAssignmentFailed(this.supabase, {
                organisationId: aptDetails.organisation_id,
                appointmentId: apt.id,
                patientName: patientProfile?.full_name || undefined,
                serviceName: service?.name || aptDetails.service_type || undefined,
                appointmentDate: aptDetails.date,
                appointmentTime: aptDetails.time,
                failureReason: result.error || 'Unknown error',
              });
            }
          } catch (notifError) {
            console.warn('[ClinicianAssignmentService] Admin notification failed:', notifError);
          }
        }
      }
    }

    return {
      processed: stuckAppointments.length,
      succeeded,
      failed,
      skipped: 0,
    };
  }

  private async getRetryCount(appointmentId: string): Promise<number> {
    const { data } = await this.supabase
      .from('appointments')
      .select('assignment_retry_count')
      .eq('id', appointmentId)
      .maybeSingle();
    return data?.assignment_retry_count || 0;
  }

  private async recordAttempt(appointmentId: string, success: boolean, reason?: string) {
    await this.supabase
      .from('appointments')
      .update({
        last_assignment_attempt_at: new Date().toISOString(),
        assignment_failed_reason: success ? null : reason || null,
      })
      .eq('id', appointmentId);
  }

  private timeToMinutes(time: string | null): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
}
