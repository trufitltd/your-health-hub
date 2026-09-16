import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  BookingInitiateInput,
  BookingInitiateResult,
  DoctorType,
  PricePreviewInput,
  PricePreviewResult,
} from '../marketplace-types.ts';
import {
  DEFAULT_BOOKING_DURATION_MINUTES,
  DEFAULT_CONSULTATION_TYPE,
  normalizeAppointmentStatusRaw,
  normalizeDoctorType,
  roundMoney,
} from '../marketplace-types.ts';
import { PricingService } from './PricingService.ts';
import { AvailabilityService } from './AvailabilityService.ts';
import { PaymentService } from './PaymentService.ts';
import { WalletService } from './WalletService.ts';
import { PromotionService } from './PromotionService.ts';
import { ClinicianAssignmentService } from './ClinicianAssignmentService.ts';

type DoctorTierRow = {
  id: string;
  name: string;
  experience_min: number;
  experience_max: number | null;
};

const parseExperienceYears = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const direct = Number(trimmed);
  if (!Number.isNaN(direct)) return direct;
  const match = trimmed.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeConsultationLanguage = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized || null;
};

export class BookingService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly pricingService: PricingService,
    private readonly availabilityService: AvailabilityService,
    private readonly paymentService: PaymentService,
    private readonly walletService: WalletService,
    private readonly promotionService: PromotionService,
    private readonly organisationId?: string | null,
  ) {}

  private async getDoctorContext(doctorId: string) {
    const { data: doctorRegistration, error: regError } = await this.supabase
      .from('doctor_registrations')
      .select('full_name, specialty, experience, doctor_tier_id, rate_per_consultation, consultation_currency')
      .eq('user_id', doctorId)
      .maybeSingle();

    if (regError) throw new Error(`Failed loading doctor registration: ${regError.message}`);

    const doctorType = normalizeDoctorType(doctorRegistration?.specialty);

    let tierId = doctorRegistration?.doctor_tier_id || null;
    let tierName: string | null = null;

    if (tierId) {
      const { data: tierById, error: tierByIdError } = await this.supabase
        .from('doctor_tiers')
        .select('name')
        .eq('id', tierId)
        .maybeSingle();
      if (tierByIdError) throw new Error(`Failed loading doctor tier by id: ${tierByIdError.message}`);
      tierName = tierById?.name || null;
    }

    if (!tierId && doctorRegistration?.experience !== null && doctorRegistration?.experience !== undefined) {
      const experienceYears = parseExperienceYears(doctorRegistration.experience);
      if (experienceYears !== null) {
        const { data: tiers, error: tierError } = await this.supabase
          .from('doctor_tiers')
          .select('id, name, experience_min, experience_max')
          .eq('active', true)
          .order('experience_min', { ascending: true });

        if (tierError) throw new Error(`Failed loading doctor tiers: ${tierError.message}`);

        const inferred = (tiers || []).find((tier) => {
          const typedTier = tier as DoctorTierRow;
          const min = Number(typedTier.experience_min || 0);
          const max = typedTier.experience_max === null || typedTier.experience_max === undefined
            ? Number.POSITIVE_INFINITY
            : Number(typedTier.experience_max);
          return experienceYears >= min && experienceYears <= max;
        });

        tierId = inferred?.id || null;
        tierName = inferred?.name || null;
      }
    }

    let ratePerConsultation: number | null = null;
    let consultationCurrency = doctorRegistration?.consultation_currency || 'NGN';

    const registrationRateRaw = Number(doctorRegistration?.rate_per_consultation);
    if (Number.isFinite(registrationRateRaw) && registrationRateRaw > 0) {
      ratePerConsultation = roundMoney(registrationRateRaw);
    } else {
      const { data: doctorRow, error: doctorLookupError } = await this.supabase
        .from('doctors')
        .select('rate_per_consultation, consultation_currency')
        .eq('id', doctorId)
        .maybeSingle();
      if (doctorLookupError) {
        throw new Error(`Failed loading doctor rate: ${doctorLookupError.message}`);
      }
      const doctorRateRaw = Number(doctorRow?.rate_per_consultation);
      if (Number.isFinite(doctorRateRaw) && doctorRateRaw > 0) {
        ratePerConsultation = roundMoney(doctorRateRaw);
      }
      if (doctorRow?.consultation_currency) {
        consultationCurrency = doctorRow.consultation_currency;
      }
    }

    return {
      doctorName: doctorRegistration?.full_name || 'Doctor',
      doctorType,
      tierId,
      tierName,
      ratePerConsultation,
      consultationCurrency,
    };
  }

  private async getPatientContext(patientId: string) {
    const { data: patientRegistration } = await this.supabase
      .from('patient_registrations')
      .select('full_name')
      .eq('user_id', patientId)
      .maybeSingle();

    return {
      patientName: patientRegistration?.full_name || null,
    };
  }

  private isDisallowedPatientName(name: string | null | undefined) {
    const normalized = String(name || '').trim().toLowerCase();
    return normalized === 'user';
  }

  private timeToMinutes(time: string | null): number {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  /**
   * #6: Revalidate a slot for internal-assignment bookings.
   * Uses the same eligibility pipeline as ClinicianAssignmentService:
   *   1. Service exists and is active
   *   2. At least one eligible clinician (specialty match)
   *   3. Clinician has a schedule for the requested day
   *   4. No conflicting appointment for any eligible clinician
   *
   * Returns { available: true } or { available: false, reason: string }.
   */
  private async revalidateSlotForInternalAssignment(
    organisationId: string,
    serviceName: string,
    date: string,
    time: string,
    durationMinutes: number,
  ): Promise<{ available: boolean; reason?: string }> {
    // Step 1: Verify service exists and is active
    const { data: orgService } = await this.supabase
      .from('organisation_services')
      .select('id, required_specialties')
      .eq('organisation_id', organisationId)
      .eq('name', serviceName)
      .eq('active', true)
      .maybeSingle();

    if (!orgService) {
      return { available: false, reason: 'Service not found or inactive' };
    }

    const requiredSpecialties: string[] = Array.isArray(orgService.required_specialties)
      ? orgService.required_specialties
      : [];

    // Step 2: Find eligible clinicians (same logic as ClinicianAssignmentService)
    const { data: orgDoctors } = await this.supabase
      .from('doctors')
      .select('id, user_id')
      .eq('organisation_id', organisationId)
      .eq('is_active', true);

    if (!orgDoctors || orgDoctors.length === 0) {
      return { available: false, reason: 'No active clinicians in this organisation' };
    }

    let eligibleUserIds: string[] = [];

    if (requiredSpecialties.length === 0) {
      eligibleUserIds = orgDoctors.map((d) => d.user_id);
    } else {
      const userIds = orgDoctors.map((d) => d.user_id);
      const { data: registrations } = await this.supabase
        .from('doctor_registrations')
        .select('user_id, specialty')
        .in('user_id', userIds);

      const regMap = new Map<string, string>();
      (registrations || []).forEach((r: any) => {
        regMap.set(r.user_id, (r.specialty || '').toLowerCase().trim());
      });

      const normalizedRequired = requiredSpecialties.map((s) => s.toLowerCase().trim());

      eligibleUserIds = orgDoctors
        .filter((doc) => {
          const specialty = regMap.get(doc.user_id) || '';
          return normalizedRequired.some((req) => {
            if (req === 'gp' || req === 'general practice' || req === 'general practitioner') {
              return specialty === 'gp' || specialty === 'general practice' || specialty === 'general practitioner';
            }
            return specialty.includes(req) || req.includes(specialty);
          });
        })
        .map((doc) => doc.user_id);
    }

    if (eligibleUserIds.length === 0) {
      return { available: false, reason: 'No clinicians qualified for this service' };
    }

    // Step 3: Check schedules for the requested day
    const dayOfWeek = new Date(date).getDay();
    const { data: schedules } = await this.supabase
      .from('doctor_schedules')
      .select('doctor_id')
      .in('doctor_id', eligibleUserIds)
      .eq('organisation_id', organisationId)
      .eq('day_of_week', dayOfWeek)
      .eq('active', true);

    if (!schedules || schedules.length === 0) {
      return { available: false, reason: 'No clinicians available on this day' };
    }

    const scheduledUserIds = schedules.map((s) => s.doctor_id);

    // Step 4: Check for conflicting appointments
    // Includes pending_payment with active slot_locked_until — these hold capacity
    // for the requesting patient. Without this, two patients could simultaneously
    // pass revalidation for the last available slot.
    const requestedStart = this.timeToMinutes(time);
    const requestedEnd = requestedStart + durationMinutes;

    const { data: conflicts } = await this.supabase
      .from('appointments')
      .select('doctor_id, time, duration_minutes, status, slot_locked_until')
      .in('doctor_id', scheduledUserIds)
      .eq('date', date)
      .in('status', ['confirmed', 'pending_approval', 'in_progress', 'completed', 'pending_assignment', 'pending_payment']);

    // Count remaining capacity: eligible clinicians with no conflicting appointment
    // Capacity = eligible_scheduled_clinicians - occupied_by_active_appointments
    let remainingCapacity = 0;

    for (const doctorUserId of scheduledUserIds) {
      const doctorConflicts = (conflicts || []).filter((c: any) => c.doctor_id === doctorUserId);
      const hasConflict = doctorConflicts.some((c: any) => {
        const conflictStart = this.timeToMinutes(c.time);
        const conflictEnd = conflictStart + (c.duration_minutes || 30);
        const overlaps = requestedStart < conflictEnd && requestedEnd > conflictStart;
        if (!overlaps) return false;
        // For pending_payment, only conflict if the lock is still active
        if (c.status === 'pending_payment') {
          return !c.slot_locked_until || new Date(c.slot_locked_until) > new Date();
        }
        return true;
      });

      if (!hasConflict) {
        remainingCapacity++;
      }
    }

    if (remainingCapacity > 0) {
      return { available: true };
    }

    return { available: false, reason: 'No clinicians available at the requested time' };
  }

  private async calculatePriceForDoctor(input: {
    doctorId: string;
    patientId?: string;
    duration: number;
    consultationType?: 'chat' | 'voice' | 'video';
    doctorContext?: {
      doctorName: string;
      doctorType: DoctorType;
      tierId: string | null;
      tierName: string | null;
      ratePerConsultation: number | null;
      consultationCurrency: string;
    };
  }) {
    const doctor = input.doctorContext || await this.getDoctorContext(input.doctorId);
    const consultationType = input.consultationType || DEFAULT_CONSULTATION_TYPE;

    // When the doctor has their own rate, use it directly and skip the pricing
    // rule engine entirely, avoiding a 400 crash when base rules are disabled.
    let price: Awaited<ReturnType<PricingService['calculatePrice']>>;
    let finalPrice: number;

    if (doctor.ratePerConsultation !== null && doctor.ratePerConsultation > 0) {
      finalPrice = doctor.ratePerConsultation;
      price = {
        base: finalPrice,
        modifiers: [],
        finalPrice,
        pricingProfileId: null,
        featureFlags: await this.pricingService.getFeatureFlags(),
      };
    } else {
      price = await this.pricingService.calculatePrice({
        doctorType: doctor.doctorType,
        duration: input.duration,
        consultationType,
        tierId: doctor.tierId,
        tierName: doctor.tierName,
      });
      finalPrice = price.finalPrice;
    }
    let isPromotion = false;
    let promotionType: string | undefined = undefined;

    if (input.patientId) {
      const eligibility = await this.promotionService.checkEligibility(input.patientId, input.doctorId);
      if (eligibility.eligible) {
        finalPrice = 0;
        isPromotion = true;
        promotionType = eligibility.promotionType;
      }
    }

    return { 
      doctor, 
      consultationType, 
      price: { ...price, finalPrice },
      isPromotion,
      promotionType,
      currency: doctor.consultationCurrency
    };
  }

  async previewPrice(input: PricePreviewInput): Promise<PricePreviewResult> {
    if (!input.doctorId) throw new Error('Missing doctorId');

    const pricingFeatureFlags = await this.pricingService.getFeatureFlags();

    const durationMinutes = pricingFeatureFlags.duration_pricing
      ? Math.max(5, Number(input.duration || DEFAULT_BOOKING_DURATION_MINUTES))
      : DEFAULT_BOOKING_DURATION_MINUTES;

    if (pricingFeatureFlags.duration_pricing) {
      const allowedDurations = await this.availabilityService.getAllowedDurations();
      if (!allowedDurations.includes(durationMinutes)) {
        throw new Error(`Unsupported duration selected. Allowed durations: ${allowedDurations.join(', ')} minutes`);
      }
    }

    const normalizedConsultationType = pricingFeatureFlags.consultation_type_pricing
      ? input.consultationType
      : DEFAULT_CONSULTATION_TYPE;

    const { consultationType, price, isPromotion, promotionType, currency } = await this.calculatePriceForDoctor({
      doctorId: input.doctorId,
      patientId: input.patientId,
      duration: durationMinutes,
      consultationType: normalizedConsultationType,
    });

    return {
      finalPrice: price.finalPrice,
      currency,
      base: price.base,
      modifiers: price.modifiers,
      pricingProfileId: price.pricingProfileId,
      featureFlags: price.featureFlags,
      durationMinutes,
      consultationType,
      isPromotion,
      promotionType,
    };
  }

  private async moveAppointmentToApprovalReady(appointmentId: string, paymentReference?: string | null) {
    console.log('[BookingService] moveAppointmentToApprovalReady started', { appointmentId, paymentReference });

    // Check if this is an internal assignment appointment (no doctor, has service_type)
    const { data: aptCheck } = await this.supabase
      .from('appointments')
      .select('doctor_id, service_type, organisation_id')
      .eq('id', appointmentId)
      .maybeSingle();

    const isInternalAssignment = aptCheck && !aptCheck.doctor_id && !!aptCheck.service_type;

    if (isInternalAssignment) {
      // Move to pending_assignment and trigger auto-assignment
      const updatePayload: Record<string, unknown> = {
        status: 'pending_assignment',
        slot_locked_until: null,
      };
      if (paymentReference) {
        updatePayload.payment_reference = paymentReference;
      }

      const { error } = await this.supabase
        .from('appointments')
        .update(updatePayload)
        .eq('id', appointmentId);

      if (error) {
        console.error('[BookingService] moveAppointmentToApprovalReady failed for internal assignment:', error.message);
        throw new Error(`Failed to move to pending_assignment: ${error.message}`);
      }

      // Auto-trigger clinician assignment (non-blocking — failures handled by retry mechanism)
      try {
        const assignmentService = new ClinicianAssignmentService(this.supabase);
        const result = await assignmentService.assignClinician(appointmentId);
        if (result.success) {
          console.log('[BookingService] Auto-assignment succeeded', { appointmentId, doctorId: result.doctorId });
        } else {
          console.warn('[BookingService] Auto-assignment failed, will be retried', { appointmentId, error: result.error });
        }
      } catch (assignError) {
        console.warn('[BookingService] Auto-assignment threw error, will be retried', { appointmentId, error: String(assignError) });
      }

      return;
    }

    // Standard flow: move to pending_approval
    const updatePayload: Record<string, unknown> = {
      status: 'pending_approval',
      slot_locked_until: null,
    };
    if (paymentReference) {
      updatePayload.payment_reference = paymentReference;
    }

    const { error: confirmError } = await this.supabase
      .from('appointments')
      .update(updatePayload)
      .eq('id', appointmentId);

    if (!confirmError) {
      console.log('[BookingService] moveAppointmentToApprovalReady success');
      return;
    }

    console.warn('[BookingService] moveAppointmentToApprovalReady first attempt failed:', confirmError.message);

    const message = String(confirmError.message || '');
    const statusConstraintError =
      message.includes('appointments_status_marketplace_check')
      || message.toLowerCase().includes('violates check constraint')
      || message.toLowerCase().includes('invalid status');

    if (!statusConstraintError) {
      console.error('[BookingService] moveAppointmentToApprovalReady failed with non-constraint error:', confirmError);
      throw new Error(`Failed to update appointment status: ${confirmError.message}`);
    }

    console.log('[BookingService] Status constraint error detected, trying legacy "pending" status...');

    const legacyUpdatePayload: Record<string, unknown> = {
      ...updatePayload,
      status: 'pending',
    };

    const { error: legacyConfirmError } = await this.supabase
      .from('appointments')
      .update(legacyUpdatePayload)
      .eq('id', appointmentId);

    if (legacyConfirmError) {
      console.error('[BookingService] moveAppointmentToApprovalReady legacy attempt failed:', legacyConfirmError);
      throw new Error(`Failed to update appointment status (legacy): ${legacyConfirmError.message}`);
    }
    console.log('[BookingService] moveAppointmentToApprovalReady legacy success');
  }

  async initiateBooking(input: BookingInitiateInput): Promise<BookingInitiateResult> {
    console.log('[BookingService] initiateBooking started', { patientId: input.patientId, doctorId: input.doctorId });
    if (!input.patientId) throw new Error('Missing patientId');
    if (!input.doctorId && !input.serviceType) throw new Error('Missing doctorId or serviceType');

    const isInternalAssignment = !input.doctorId && !!input.serviceType;

    // ── #8: Cleanup expired pending_payment locks ──
    // This expires abandoned bookings that never completed payment.
    // For internal assignment, we clean up org-wide expired locks.
    try {
      if (input.doctorId) {
        await this.availabilityService.cleanupExpiredPendingLocks(input.doctorId);
      } else if (isInternalAssignment && this.organisationId) {
        // For internal assignment, clean up all expired locks for this org
        // (no specific doctor to filter by)
        await this.availabilityService.cleanupExpiredPendingLocks();
      }
    } catch (e) {
      console.warn('[BookingService] cleanupExpiredPendingLocks failed:', e);
    }

    console.log('[BookingService] Fetching context and flags...');
    const patient = await this.getPatientContext(input.patientId);
    const pricingFeatureFlags = await this.pricingService.getFeatureFlags();

    if (this.isDisallowedPatientName(patient.patientName)) {
      throw new Error('Invalid patient name. Please update your profile before booking.');
    }

    const requestedDuration = pricingFeatureFlags.duration_pricing
      ? Math.max(5, Number(input.duration || DEFAULT_BOOKING_DURATION_MINUTES))
      : DEFAULT_BOOKING_DURATION_MINUTES;

    if (pricingFeatureFlags.duration_pricing) {
      const allowedDurations = await this.availabilityService.getAllowedDurations();
      if (!allowedDurations.includes(requestedDuration)) {
        throw new Error(`Unsupported duration selected. Allowed durations: ${allowedDurations.join(', ')} minutes`);
      }
    }

    if (!input.preferredDate || !input.preferredTime) {
      throw new Error('Date and time are required');
    }

    // For internal assignment: use service-based pricing from organisation_services
    if (isInternalAssignment) {
      return this.initiateInternalAssignmentBooking({
        input,
        patient,
        pricingFeatureFlags,
        requestedDuration,
      });
    }

    // Standard patient-select flow (MyE-Doctor)
    const doctor = await this.getDoctorContext(input.doctorId!);
    console.log('[BookingService] Context fetched', { doctorName: doctor.doctorName, patientName: patient.patientName });

    const check = await this.availabilityService.validateAvailability({
      doctorId: input.doctorId!,
      date: input.preferredDate,
      time: input.preferredTime,
      durationMinutes: requestedDuration,
    });

    if (!check.available) {
      throw new Error(check.reason || 'Selected slot is unavailable');
    }

    const slot = {
      date: input.preferredDate,
      time: input.preferredTime,
      durationMinutes: requestedDuration,
    };

    const normalizedConsultationType = pricingFeatureFlags.consultation_type_pricing
      ? input.consultationType
      : DEFAULT_CONSULTATION_TYPE;

    const { consultationType, price, isPromotion, promotionType, currency } = await this.calculatePriceForDoctor({
      doctorId: input.doctorId!,
      patientId: input.patientId,
      duration: slot.durationMinutes,
      consultationType: normalizedConsultationType,
      doctorContext: doctor,
    });

    const { data: consultationTypeRow } = await this.supabase
      .from('consultation_types')
      .select('id')
      .eq('name', consultationType)
      .maybeSingle();

    const requestedPaymentMethod: 'paystack' | 'wallet' | 'hybrid' = input.paymentMethod === 'wallet'
      ? 'wallet'
      : input.paymentMethod === 'hybrid'
      ? 'hybrid'
      : 'paystack';
    const lockUntil = new Date(Date.now() + (30 * 60 * 1000)).toISOString();

    const breakdown = {
      base: price.base,
      modifiers: price.modifiers,
      final_price: price.finalPrice,
      currency,
      doctor_type: doctor.doctorType,
      consultation_type: consultationType,
      consultation_language: normalizeConsultationLanguage(input.consultationLanguage),
      duration_minutes: slot.durationMinutes,
      tier_id: doctor.tierId,
      tier_name: doctor.tierName,
      feature_flags: price.featureFlags,
      is_promotion: isPromotion,
      promotion_type: promotionType,
    };

    const { data: appointment, error: appointmentError } = await this.supabase
      .from('appointments')
      .insert({
        patient_id: input.patientId,
        patient_name: patient.patientName,
        doctor_id: input.doctorId!,
        specialist_name: doctor.doctorName,
        date: slot.date,
        time: slot.time,
        notes: input.notes || null,
        status: 'pending_payment',
        final_price: price.finalPrice,
        currency,
        price_breakdown: breakdown,
        pricing_profile_id: price.pricingProfileId,
        slot_locked_until: lockUntil,
        consultation_type_id: consultationTypeRow?.id || null,
        duration_minutes: slot.durationMinutes,
        is_promotion: isPromotion,
        promotion_type: promotionType,
        organisation_id: this.organisationId || null,
      })
      .select('*')
      .single();

    if (appointmentError) {
      throw new Error(`Failed creating pending appointment: ${appointmentError.message}`);
    }

    return this.processPayment({
      appointment,
      amount: Number(appointment.final_price || price.finalPrice),
      isPromotion,
      promotionType,
      currency,
      slot,
      consultationType,
      patientId: input.patientId,
      patientEmail: input.patientEmail,
      requestedPaymentMethod,
      basePaymentMetadata: {
        appointment_date: slot.date,
        appointment_time: slot.time,
        duration_minutes: slot.durationMinutes,
        consultation_type: consultationType,
      },
    });
  }

  private async initiateInternalAssignmentBooking(params: {
    input: BookingInitiateInput;
    patient: { patientName: string | null };
    pricingFeatureFlags: Record<FeatureFlagName, boolean>;
    requestedDuration: number;
  }): Promise<BookingInitiateResult> {
    const { input, patient, pricingFeatureFlags, requestedDuration } = params;

    console.log('[BookingService] initiateInternalAssignmentBooking started', { serviceType: input.serviceType });

    const slot = {
      date: input.preferredDate!,
      time: input.preferredTime!,
      durationMinutes: requestedDuration,
    };

    // ══════════════════════════════════════════════════════════════════════
    // Phase 6B.3: Atomic capacity reservation via RPC
    // The RPC validates org, service, membership, clinician capacity, and
    // creates the pending_payment appointment in a single transaction.
    // This eliminates the TOCTOU race between revalidation and insert.
    // ══════════════════════════════════════════════════════════════════════
    const consultationMode = pricingFeatureFlags.consultation_type_pricing
      ? (input.consultationType || 'video')
      : 'video';

    const { data: rpcResult, error: rpcError } = await this.supabase.rpc(
      'reserve_internal_assignment_slot',
      {
        p_patient_id: input.patientId,
        p_organisation_id: this.organisationId,
        p_service_name: input.serviceType,
        p_preferred_date: slot.date,
        p_preferred_time: slot.time,
        p_duration_minutes: slot.durationMinutes,
        p_patient_name: patient.patientName,
        p_notes: input.notes || null,
        p_consultation_mode: consultationMode,
      },
    );

    if (rpcError) {
      throw new Error(`Atomic reservation failed: ${rpcError.message}`);
    }

    const result = rpcResult as Record<string, unknown>;
    if (!result.success) {
      throw new Error(result.error || 'SLOT_NO_LONGER_AVAILABLE');
    }

    const appointmentId = result.appointment_id as string;
    const finalPrice = Number(result.final_price);
    const currency = (result.currency as string) || 'NGN';

    // Load the created appointment for payment processing
    const { data: appointment, error: appointmentError } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();

    if (appointmentError || !appointment) {
      throw new Error(`Failed loading reserved appointment: ${appointmentError?.message || 'not found'}`);
    }

    // For zero-price bookings, move to pending_assignment (not pending_approval)
    if (finalPrice === 0) {
      await this.supabase
        .from('appointments')
        .update({ status: 'pending_assignment', slot_locked_until: null })
        .eq('id', appointmentId);

      return {
        appointmentId,
        finalPrice: 0,
        currency,
        slot,
        paymentInitialization: null,
        paymentMethod: 'paystack',
        paidWithWallet: false,
        walletChargedAmount: 0,
        paystackAmountDue: 0,
        pendingAssignment: true,
      };
    }

    // Check for promotional eligibility (skipped for internal assignment — no doctorId)
    const isPromotion = false;
    const promotionType: string | undefined = undefined;

    const normalizedConsultationType = pricingFeatureFlags.consultation_type_pricing
      ? (input.consultationType || consultationMode)
      : DEFAULT_CONSULTATION_TYPE;

    const requestedPaymentMethod: 'paystack' | 'wallet' | 'hybrid' = input.paymentMethod === 'wallet'
      ? 'wallet'
      : input.paymentMethod === 'hybrid'
      ? 'hybrid'
      : 'paystack';

    try {
      const paymentResult = await this.processPayment({
        appointment,
        amount: finalPrice,
        isPromotion,
        promotionType,
        currency,
        slot,
        consultationType: normalizedConsultationType,
        patientId: input.patientId,
        requestedPaymentMethod,
        basePaymentMetadata: {
          appointment_date: slot.date,
          appointment_time: slot.time,
          duration_minutes: slot.durationMinutes,
          consultation_type: normalizedConsultationType,
          service_type: input.serviceType,
        },
        pendingAssignment: true,
      });

      return paymentResult;
    } catch (paymentError) {
      // ════════════════════════════════════════════════════════════════════
      // Phase 6B.3 #12: Paystack initialization failure after reservation
      // Release the reservation immediately so capacity is not held for
      // the full 30-minute TTL unnecessarily.
      // ════════════════════════════════════════════════════════════════════
      console.warn('[BookingService] Payment init failed after reservation, releasing', {
        appointmentId,
        error: String(paymentError),
      });

      try {
        await this.supabase.rpc('release_reservation_on_payment_failure', {
          p_appointment_id: appointmentId,
        });
      } catch (releaseError) {
        console.warn('[BookingService] Failed to release reservation:', String(releaseError));
      }

      throw paymentError;
    }
  }

  private async processPayment(params: {
    appointment: any;
    amount: number;
    isPromotion: boolean;
    promotionType?: string;
    currency: string;
    slot: { date: string; time: string; durationMinutes: number };
    consultationType: string;
    patientId: string;
    patientEmail?: string;
    requestedPaymentMethod: 'paystack' | 'wallet' | 'hybrid';
    basePaymentMetadata: Record<string, unknown>;
    pendingAssignment?: boolean;
  }): Promise<BookingInitiateResult> {
    const {
      appointment, amount, isPromotion, promotionType, currency, slot,
      consultationType, patientId, requestedPaymentMethod, basePaymentMetadata,
      pendingAssignment,
    } = params;

    const isInternalAssignment = !!pendingAssignment;

    // Determine the target status after payment
    const postPaymentStatus = isInternalAssignment ? 'pending_assignment' : 'pending_approval';

    // Helper to move appointment to post-payment status
    const moveToPostPaymentStatus = async (apptId: string, ref?: string | null) => {
      if (isInternalAssignment) {
        // For internal assignment, go to pending_assignment
        const updatePayload: Record<string, unknown> = { status: 'pending_assignment', slot_locked_until: null };
        if (ref) updatePayload.payment_reference = ref;
        const { error } = await this.supabase.from('appointments').update(updatePayload).eq('id', apptId);
        if (error) throw new Error(`Failed to move to pending_assignment: ${error.message}`);
      } else {
        await this.moveAppointmentToApprovalReady(apptId, ref);
      }
    };

    // Handle zero-price promotional bookings
    if (amount === 0 && isPromotion) {
      try {
        await moveToPostPaymentStatus(appointment.id, `PROMO-${promotionType}-${Date.now()}`);

        return {
          appointmentId: appointment.id,
          finalPrice: 0,
          currency,
          slot,
          paymentInitialization: null,
          paymentMethod: 'paystack',
          paidWithWallet: false,
          walletChargedAmount: 0,
          paystackAmountDue: 0,
          pendingAssignment: isInternalAssignment || undefined,
        };
      } catch (promoConfirmError) {
        await this.supabase
          .from('appointments')
          .update({ status: 'cancelled', slot_locked_until: null })
          .eq('id', appointment.id);
        throw new Error(`Failed to confirm promotional booking: ${promoConfirmError instanceof Error ? promoConfirmError.message : String(promoConfirmError)}`);
      }
    }

    const cancelPendingAppointment = async () => {
      await this.supabase
        .from('appointments')
        .update({ status: 'cancelled', slot_locked_until: null })
        .eq('id', appointment.id);
    };

    if (requestedPaymentMethod === 'wallet') {
      const walletReference = `WALLET-${Date.now()}-${appointment.id.slice(0, 8)}`;
      const nowIso = new Date().toISOString();

      const { error: walletPaymentInitError } = await this.supabase.from('payments').insert({
        appointment_id: appointment.id,
        patient_id: patientId,
        amount,
        status: 'pending',
        provider_reference: walletReference,
        provider: 'wallet',
        payment_reference: walletReference,
        payment_method: 'wallet',
        metadata: {
          ...basePaymentMetadata,
          type: 'booking_wallet',
        },
      });

      if (walletPaymentInitError) {
        await cancelPendingAppointment();
        throw new Error(`Failed to initialize wallet booking payment: ${walletPaymentInitError.message}`);
      }

      let chargedAmount = 0;

      try {
        const { data: walletDebitData, error: walletDebitError } = await this.supabase.rpc(
          'debit_patient_wallet_for_booking',
          {
            p_patient_id: patientId,
            p_appointment_id: appointment.id,
            p_amount: amount,
            p_narration: `Appointment payment from wallet (${appointment.id})`,
          },
        );

        if (walletDebitError) {
          throw new Error(walletDebitError.message || 'Wallet debit failed');
        }

        const walletDebit = (walletDebitData || {}) as Record<string, unknown>;
        chargedAmount = Number(walletDebit.charged_amount || 0);
        const balanceAfterRaw = Number(walletDebit.balance_after);
        const balanceAfter = Number.isFinite(balanceAfterRaw) ? balanceAfterRaw : null;

        if (!Number.isFinite(chargedAmount) || chargedAmount <= 0) {
          throw new Error('Wallet debit returned invalid charged amount');
        }

        const { error: walletPaymentSuccessError } = await this.supabase
          .from('payments')
          .update({
            status: 'completed',
            verified_at: nowIso,
            metadata: {
              ...basePaymentMetadata,
              type: 'booking_wallet',
              charged_amount: chargedAmount,
              balance_after: balanceAfter,
              verified_at: nowIso,
            },
          })
          .or(`provider_reference.eq.${walletReference},payment_reference.eq.${walletReference}`);

        if (walletPaymentSuccessError) {
          throw new Error(`Failed to mark wallet payment success: ${walletPaymentSuccessError.message}`);
        }

        try {
          await moveToPostPaymentStatus(appointment.id, walletReference);
        } catch (confirmError: any) {
          throw new Error(`Failed to confirm wallet booking: ${confirmError?.message || confirmError}`);
        }

        // Only add pending earning when doctor is assigned (not for internal assignment)
        if (appointment.doctor_id) {
          await this.walletService.addPendingEarning({
            id: appointment.id,
            doctor_id: appointment.doctor_id,
            final_price: amount,
            currency,
            price_breakdown: (appointment.price_breakdown || {}) as Record<string, unknown>,
          });
        }

        return {
          appointmentId: appointment.id,
          finalPrice: amount,
          currency,
          slot,
          paymentInitialization: null,
          paymentMethod: 'wallet',
          paidWithWallet: true,
          walletChargedAmount: chargedAmount,
          paystackAmountDue: 0,
          pendingAssignment: isInternalAssignment || undefined,
        };
      } catch (walletFlowError) {
        const message = walletFlowError instanceof Error ? walletFlowError.message : String(walletFlowError);

        if (chargedAmount > 0) {
          const { error: rollbackError } = await this.supabase.rpc('credit_patient_wallet_adjustment', {
            p_patient_id: patientId,
            p_appointment_id: appointment.id,
            p_amount: chargedAmount,
            p_narration: `Rollback for failed wallet booking (${appointment.id})`,
          });
          if (rollbackError) {
            console.error('[booking-service] wallet rollback failed', rollbackError.message);
          }
        }

        await this.supabase
          .from('payments')
          .update({
            status: 'failed',
            metadata: {
              ...basePaymentMetadata,
              type: 'booking_wallet',
              failure_reason: message,
              failed_at: new Date().toISOString(),
            },
          })
          .or(`provider_reference.eq.${walletReference},payment_reference.eq.${walletReference}`);

        await cancelPendingAppointment();

        throw new Error(message || 'Wallet booking failed');
      }
    }

    if (requestedPaymentMethod === 'hybrid') {
      const walletReference = `WALLET-HYB-${Date.now()}-${appointment.id.slice(0, 8)}`;
      const nowIso = new Date().toISOString();
      let walletChargedAmount = 0;
      let balanceAfter: number | null = null;

      try {
        let walletDebitData: any = null;
        let walletDebitError: any = null;

        const walletDebitResponse = await this.supabase.rpc(
          'debit_patient_wallet_for_booking_up_to',
          {
            p_patient_id: patientId,
            p_appointment_id: appointment.id,
            p_amount: amount,
            p_narration: `Hybrid booking wallet debit (${appointment.id})`,
          },
        );

        walletDebitData = walletDebitResponse.data;
        walletDebitError = walletDebitResponse.error;

        if (walletDebitError) {
          const walletDebitMessage = String(walletDebitError.message || '');
          const isMissingRpc = walletDebitMessage.includes('debit_patient_wallet_for_booking_up_to');
          if (!isMissingRpc) {
            throw new Error(walletDebitMessage || 'Hybrid wallet debit failed');
          }

          // Backward-compatible fallback when the newest migration has not been applied yet.
          const { data: walletRow, error: walletLookupError } = await this.supabase
            .from('patient_wallet')
            .select('available_balance')
            .eq('patient_id', patientId)
            .maybeSingle();

          if (walletLookupError) {
            throw new Error(`Hybrid wallet fallback lookup failed: ${walletLookupError.message}`);
          }

          const fallbackChargeAmount = roundMoney(Math.max(Math.min(Number(walletRow?.available_balance || 0), amount), 0));
          if (fallbackChargeAmount > 0) {
            const fallbackDebitResponse = await this.supabase.rpc(
              'debit_patient_wallet_for_booking',
              {
                p_patient_id: patientId,
                p_appointment_id: appointment.id,
                p_amount: fallbackChargeAmount,
                p_narration: `Hybrid booking wallet debit (${appointment.id})`,
              },
            );
            if (fallbackDebitResponse.error) {
              throw new Error(fallbackDebitResponse.error.message || 'Hybrid wallet fallback debit failed');
            }
            walletDebitData = fallbackDebitResponse.data;
          } else {
            walletDebitData = {
              charged_amount: 0,
              balance_after: Number(walletRow?.available_balance || 0),
            };
          }
        }

        const walletDebit = (walletDebitData || {}) as Record<string, unknown>;
        const chargedRaw = Number(walletDebit.charged_amount || 0);
        const balanceAfterRaw = Number(walletDebit.balance_after);
        walletChargedAmount = Number.isFinite(chargedRaw) && chargedRaw > 0 ? roundMoney(chargedRaw) : 0;
        balanceAfter = Number.isFinite(balanceAfterRaw) ? roundMoney(balanceAfterRaw) : null;

        if (walletChargedAmount > 0) {
          const { error: walletPaymentInitError } = await this.supabase.from('payments').insert({
            appointment_id: appointment.id,
            patient_id: patientId,
            amount: walletChargedAmount,
            status: 'pending',
            provider_reference: walletReference,
            provider: 'wallet',
            payment_reference: walletReference,
            payment_method: 'wallet',
            metadata: {
              ...basePaymentMetadata,
              type: 'booking_hybrid_wallet',
              charged_amount: walletChargedAmount,
              balance_after: balanceAfter,
              stage: 'wallet_charged_pending_paystack',
            },
          });

          if (walletPaymentInitError) {
            throw new Error(`Failed to initialize hybrid wallet payment row: ${walletPaymentInitError.message}`);
          }
        }

        const paystackAmountDue = roundMoney(Math.max(amount - walletChargedAmount, 0));

        if (paystackAmountDue <= 0) {
          if (walletChargedAmount <= 0) {
            throw new Error('No payable amount was available for hybrid booking');
          }

          const { error: walletFinalizeError } = await this.supabase
            .from('payments')
            .update({
              status: 'completed',
              verified_at: nowIso,
              metadata: {
                ...basePaymentMetadata,
                type: 'booking_hybrid_wallet',
                charged_amount: walletChargedAmount,
                balance_after: balanceAfter,
                stage: 'wallet_only_completed',
                verified_at: nowIso,
              },
            })
            .or(`provider_reference.eq.${walletReference},payment_reference.eq.${walletReference}`);

          if (walletFinalizeError) {
            throw new Error(`Failed to finalize hybrid wallet payment: ${walletFinalizeError.message}`);
          }

          try {
            await moveToPostPaymentStatus(appointment.id, walletReference);
          } catch (confirmError: any) {
            throw new Error(`Failed to confirm wallet-only hybrid booking: ${confirmError?.message || confirmError}`);
          }

          // Only add pending earning when doctor is assigned
          if (appointment.doctor_id) {
            await this.walletService.addPendingEarning({
              id: appointment.id,
              doctor_id: appointment.doctor_id,
              final_price: amount,
              currency,
              price_breakdown: (appointment.price_breakdown || {}) as Record<string, unknown>,
            });
          }

          return {
            appointmentId: appointment.id,
            finalPrice: amount,
            currency,
            slot,
            paymentInitialization: null,
            paymentMethod: 'wallet',
            paidWithWallet: true,
            walletChargedAmount,
            paystackAmountDue: 0,
            pendingAssignment: isInternalAssignment || undefined,
          };
        }

        const paystackMetadata = {
          ...basePaymentMetadata,
          type: 'booking_hybrid_paystack',
          total_amount: amount,
          currency,
          wallet_applied_amount: walletChargedAmount,
          balance_due_amount: paystackAmountDue,
          ...(walletChargedAmount > 0 ? { wallet_payment_reference: walletReference } : {}),
        };

        const hybridPatientEmail = String(params.patientEmail || '').trim();
        if (!hybridPatientEmail) {
          console.error('[BookingService] PATIENT_EMAIL_REQUIRED', {
            appointmentId: appointment.id,
            patientId,
            bookingPath: 'hybrid',
          });
          await cancelPendingAppointment();
          throw new Error('PATIENT_EMAIL_REQUIRED: Patient email is required to initialize payment. Please update your profile and try again.');
        }

        const paymentInitialization = await this.paymentService.createPaymentIntent({
          appointmentId: appointment.id,
          patientId: patientId,
          doctorId: appointment.doctor_id || null,
          email: hybridPatientEmail,
          amount: paystackAmountDue,
          currency,
          metadata: paystackMetadata,
        });

        return {
          appointmentId: appointment.id,
          finalPrice: amount,
          currency,
          slot,
          paymentInitialization,
          paymentMethod: 'hybrid',
          paidWithWallet: false,
          walletChargedAmount,
          paystackAmountDue,
        };
      } catch (hybridFlowError) {
        const message = hybridFlowError instanceof Error ? hybridFlowError.message : String(hybridFlowError);

        if (walletChargedAmount > 0) {
          const { error: rollbackError } = await this.supabase.rpc('credit_patient_wallet_adjustment', {
            p_patient_id: patientId,
            p_appointment_id: appointment.id,
            p_amount: walletChargedAmount,
            p_narration: `Rollback for failed hybrid booking (${appointment.id})`,
          });
          if (rollbackError) {
            console.error('[booking-service] hybrid wallet rollback failed', rollbackError.message);
          }
        }

        await this.supabase
          .from('payments')
          .update({
            status: 'failed',
            metadata: {
              ...basePaymentMetadata,
              type: 'booking_hybrid_wallet',
              failure_reason: message,
              failed_at: new Date().toISOString(),
            },
          })
          .or(`provider_reference.eq.${walletReference},payment_reference.eq.${walletReference}`);

        await cancelPendingAppointment();
        throw new Error(message || 'Hybrid booking failed');
      }
    }

    const patientEmail = String(params.patientEmail || '').trim();
    if (!patientEmail) {
      console.error('[BookingService] PATIENT_EMAIL_REQUIRED', {
        appointmentId: appointment.id,
        patientId,
        bookingPath: isInternalAssignment ? 'internal_assignment' : 'doctor_select',
      });
      await this.supabase
        .from('appointments')
        .update({ status: 'cancelled', slot_locked_until: null })
        .eq('id', appointment.id);
      throw new Error('PATIENT_EMAIL_REQUIRED: Patient email is required to initialize payment. Please update your profile and try again.');
    }

    const paymentInitialization = await this.paymentService.createPaymentIntent({
      appointmentId: appointment.id,
      patientId: patientId,
      doctorId: appointment.doctor_id || null,
      email: patientEmail,
      amount,
      currency,
      metadata: { ...basePaymentMetadata, currency },
    });

    return {
      appointmentId: appointment.id,
      finalPrice: amount,
      currency,
      slot,
      paymentInitialization,
      paymentMethod: 'paystack',
      paidWithWallet: false,
      walletChargedAmount: 0,
      paystackAmountDue: amount,
      pendingAssignment: isInternalAssignment || undefined,
    };
  }

  async finalizeSuccessfulPayment(reference: string, paystackVerification?: Record<string, unknown>) {
    const payment = await this.paymentService.getPaymentByReference(reference);
    if (!payment) throw new Error('Payment not found for reference');

    const { data: appointment, error: appointmentError } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('id', payment.appointment_id)
      .maybeSingle();

    if (appointmentError) {
      throw new Error(`Failed loading appointment for payment: ${appointmentError.message}`);
    }
    if (!appointment) throw new Error('Appointment not found for payment');

    const status = normalizeAppointmentStatusRaw(appointment.status);
    if (status === 'pending_assignment') {
      // Appointment already in pending_assignment — try assignment in case previous attempt failed
      try {
        const assignmentService = new ClinicianAssignmentService(this.supabase);
        const result = await assignmentService.assignClinician(appointment.id);
        if (result.success) {
          console.log('[BookingService] Re-triggered assignment succeeded', { appointmentId: appointment.id });
        }
      } catch {
        // Assignment will be retried by the retry mechanism
      }
      return { appointmentId: appointment.id, alreadyProcessed: true };
    }
    if (status === 'pending_approval' || status === 'confirmed' || status === 'completed' || status === 'in_progress') {
      return { appointmentId: appointment.id, alreadyProcessed: true };
    }

    const paymentStatus = String(payment.status || '').trim().toLowerCase();
    const paymentMetadata = (payment.metadata || {}) as Record<string, unknown>;
    const webhookVerification = paymentMetadata.verification;
    const paymentVerifiedAt = payment.verified_at ? String(payment.verified_at) : '';

    // If payment is already marked successful in DB (by webhook or prior confirm), trust it
    const isAlreadySuccessfulInDb = [
      'success',
      'successful',
      'succeeded',
      'paid',
      'completed'
    ].includes(paymentStatus);

    if (isAlreadySuccessfulInDb) {
      // Payment already verified — just ensure appointment is promoted
      const isInternalAssignment = !appointment.doctor_id && !!appointment.service_type;
      if (isInternalAssignment) {
        // For internal assignment, move to pending_assignment
        await this.supabase
          .from('appointments')
          .update({ status: 'pending_assignment', slot_locked_until: null })
          .eq('id', appointment.id);
      } else {
        try {
          await this.moveAppointmentToApprovalReady(appointment.id);
        } catch (confirmError: any) {
          throw new Error(`Failed to confirm appointment after payment: ${confirmError?.message || confirmError}`);
        }
      }
      // Only add pending earning when doctor is assigned
      if (appointment.doctor_id) {
        await this.walletService.addPendingEarning({
          id: appointment.id,
          doctor_id: appointment.doctor_id,
          final_price: Number(appointment.final_price || 0),
          currency: appointment.currency,
          price_breakdown: (appointment.price_breakdown || {}) as Record<string, unknown>,
        });
      }
      return { appointmentId: appointment.id, alreadyProcessed: false };
    }

    let verified: { ok: boolean; status: string; amountInKobo: number; raw: Record<string, unknown> } = {
      ok: false,
      status: 'unverified',
      amountInKobo: 0,
      raw: {},
    };

    const incomingStatus = String(paystackVerification?.status || '').trim().toLowerCase();
    const incomingAmount = Number(paystackVerification?.amount || 0);
    const hasWebhookSuccessMarker = (
      (
        paymentStatus === 'success'
        || paymentStatus === 'successful'
        || paymentStatus === 'succeeded'
        || paymentStatus === 'paid'
        || paymentStatus === 'completed'
      )
      && (!!webhookVerification || paymentVerifiedAt.length > 0)
    );

    if (hasWebhookSuccessMarker || incomingStatus === 'success') {
      verified = {
        ok: true,
        status: 'success',
        amountInKobo: incomingAmount > 0
          ? Math.round(incomingAmount)
          : Math.round(Number(payment.amount || 0) * 100),
        raw: typeof paystackVerification === 'object' && paystackVerification !== null
          ? paystackVerification
          : typeof webhookVerification === 'object' && webhookVerification !== null
          ? (webhookVerification as Record<string, unknown>)
          : { source: 'payment.metadata.verification' },
      };

      const expectedKobo = Math.round(Number(payment.amount || 0) * 100);
      if (verified.amountInKobo !== 0 && verified.amountInKobo !== expectedKobo) {
        await this.failPayment(reference, 'Amount mismatch');
        throw new Error('Payment amount mismatch');
      }
    } else {
      verified = await this.paymentService.verifyPayment(reference);
      if (!verified.ok) {
        await this.failPayment(reference, `Verification failed with status ${verified.status}`);
        throw new Error(`Payment verification failed: ${verified.status}`);
      }

      const expectedKobo = Math.round(Number(payment.amount || 0) * 100);
      if (verified.amountInKobo !== expectedKobo) {
        await this.failPayment(reference, 'Amount mismatch');
        throw new Error('Payment amount mismatch');
      }
    }

    await this.paymentService.markPaymentSuccess(reference, {
      ...(paystackVerification || {}),
      verify_response: verified.raw,
    });

    const paymentType = String(paymentMetadata.type || '').trim().toLowerCase();
    const walletPaymentReference = String(paymentMetadata.wallet_payment_reference || '').trim();
    if (paymentType === 'booking_hybrid_paystack' && walletPaymentReference) {
      const nowIso = new Date().toISOString();
      const walletAppliedRaw = Number(paymentMetadata.wallet_applied_amount || 0);
      const walletApplied = Number.isFinite(walletAppliedRaw) ? roundMoney(walletAppliedRaw) : 0;
      const walletPayment = await this.paymentService.getPaymentByReference(walletPaymentReference);

      const { error: walletMarkSuccessError } = await this.supabase
        .from('payments')
        .update({
          status: 'SUCCESS',
          verified_at: nowIso,
          metadata: {
            ...(walletPayment?.metadata || {}),
            type: 'booking_hybrid_wallet',
            charged_amount: walletApplied,
            stage: 'wallet_applied',
            verified_at: nowIso,
          },
        })
        .or(`provider_reference.eq.${walletPaymentReference},payment_reference.eq.${walletPaymentReference}`);

      if (walletMarkSuccessError) {
        throw new Error(`Failed to finalize hybrid wallet payment after paystack success: ${walletMarkSuccessError.message}`);
      }
    }

    try {
      await this.moveAppointmentToApprovalReady(appointment.id);
    } catch (confirmError: any) {
      throw new Error(`Failed to confirm appointment after payment: ${confirmError?.message || confirmError}`);
    }

    await this.walletService.addPendingEarning({
      id: appointment.id,
      doctor_id: appointment.doctor_id,
      final_price: Number(appointment.final_price || 0),
      currency: appointment.currency,
      price_breakdown: (appointment.price_breakdown || {}) as Record<string, unknown>,
    });
    return {
      appointmentId: appointment.id,
      alreadyProcessed: false,
    };
  }

  async failPayment(reference: string, reason = 'Payment failed') {
    const payment = await this.paymentService.getPaymentByReference(reference);
    if (!payment) return { updated: false };

    const paymentMetadata = (payment.metadata || {}) as Record<string, unknown>;
    const paymentType = String(paymentMetadata.type || '').trim().toLowerCase();
    const walletPaymentReference = String(paymentMetadata.wallet_payment_reference || '').trim();
    const walletAppliedRaw = Number(paymentMetadata.wallet_applied_amount || 0);
    const walletApplied = Number.isFinite(walletAppliedRaw) && walletAppliedRaw > 0
      ? roundMoney(walletAppliedRaw)
      : 0;

    const appointmentId = payment.appointment_id ? String(payment.appointment_id) : '';
    let appointmentStatus = '';
    let rollbackPatientId = payment.patient_id ? String(payment.patient_id) : '';

    if (appointmentId) {
      const { data: appointment, error: appointmentLookupError } = await this.supabase
        .from('appointments')
        .select('id, status, patient_id')
        .eq('id', appointmentId)
        .maybeSingle();

      if (appointmentLookupError) {
        throw new Error(`Failed to load appointment status before expiring payment: ${appointmentLookupError.message}`);
      }

      appointmentStatus = normalizeAppointmentStatusRaw(appointment?.status);
      if (appointment?.patient_id) {
        rollbackPatientId = String(appointment.patient_id);
      }
    }

    if (
      appointmentStatus === 'pending_approval'
      || appointmentStatus === 'confirmed'
      || appointmentStatus === 'in_progress'
      || appointmentStatus === 'completed'
    ) {
      return { updated: true, ignored: true };
    }

    await this.paymentService.markPaymentFailed(reference, reason);

    const canRollbackHybridWallet = paymentType === 'booking_hybrid_paystack'
      && walletApplied > 0
      && !!appointmentId
      && !!rollbackPatientId
      && (appointmentStatus === '' || appointmentStatus === 'pending_payment' || appointmentStatus === 'cancelled');

    if (canRollbackHybridWallet) {
      const { data: rollbackRows, error: rollbackLookupError } = await this.supabase
        .from('patient_wallet_transactions')
        .select('amount')
        .eq('appointment_id', appointmentId)
        .eq('direction', 'credit')
        .eq('transaction_type', 'adjustment')
        .eq('status', 'completed')
        .ilike('narration', 'Hybrid payment rollback%');

      if (rollbackLookupError) {
        throw new Error(`Failed to inspect existing hybrid rollback rows: ${rollbackLookupError.message}`);
      }

      const alreadyRolledBack = roundMoney((rollbackRows || []).reduce((sum: number, row: any) => (
        sum + Number(row.amount || 0)
      ), 0));
      const rollbackOutstanding = roundMoney(Math.max(walletApplied - alreadyRolledBack, 0));

      if (rollbackOutstanding > 0) {
        const { error: rollbackError } = await this.supabase.rpc('credit_patient_wallet_adjustment', {
          p_patient_id: rollbackPatientId,
          p_appointment_id: appointmentId,
          p_amount: rollbackOutstanding,
          p_narration: `Hybrid payment rollback (${appointmentId})`,
        });

        if (rollbackError) {
          throw new Error(`Failed to rollback hybrid wallet debit: ${rollbackError.message}`);
        }
      }
    }

    if (paymentType === 'booking_hybrid_paystack' && walletPaymentReference) {
      const walletPayment = await this.paymentService.getPaymentByReference(walletPaymentReference);
      await this.supabase
        .from('payments')
        .update({
          status: 'FAILED',
          metadata: {
            ...(walletPayment?.metadata || {}),
            type: 'booking_hybrid_wallet',
            stage: 'rolled_back_after_paystack_failure',
            failure_reason: reason,
            failed_at: new Date().toISOString(),
          },
        })
        .or(`provider_reference.eq.${walletPaymentReference},payment_reference.eq.${walletPaymentReference}`);
    }

    if (!appointmentId || appointmentStatus !== 'pending_payment') {
      return { updated: true };
    }

    const { error } = await this.supabase
      .from('appointments')
      .update({ status: 'cancelled', slot_locked_until: null })
      .eq('id', appointmentId);

    if (error) {
      throw new Error(`Failed to cancel appointment after failed payment: ${error.message}`);
    }

    return { updated: true };
  }
}
