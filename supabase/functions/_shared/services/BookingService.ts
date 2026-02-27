import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  BookingInitiateInput,
  BookingInitiateResult,
  DoctorType,
  PricePreviewInput,
  PricePreviewResult,
} from '../marketplace-types.ts';
import { normalizeAppointmentStatusRaw, normalizeDoctorType } from '../marketplace-types.ts';
import { PricingService } from './PricingService.ts';
import { AvailabilityService } from './AvailabilityService.ts';
import { PaymentService } from './PaymentService.ts';
import { WalletService } from './WalletService.ts';

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

export class BookingService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly pricingService: PricingService,
    private readonly availabilityService: AvailabilityService,
    private readonly paymentService: PaymentService,
    private readonly walletService: WalletService,
  ) {}

  private async getDoctorContext(doctorId: string) {
    const { data: doctorRegistration, error: regError } = await this.supabase
      .from('doctor_registrations')
      .select('full_name, specialty, experience, doctor_tier_id, rate_per_consultation')
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

    const defaultBaseRate = Number(
      doctorRegistration?.rate_per_consultation || (doctorType === 'GP' ? 5000 : 10000),
    );

    return {
      doctorName: doctorRegistration?.full_name || 'Doctor',
      doctorType,
      tierId,
      tierName,
      defaultBaseRate,
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

  private async calculatePriceForDoctor(input: {
    doctorId: string;
    duration: number;
    consultationType?: 'chat' | 'voice' | 'video';
    doctorContext?: {
      doctorName: string;
      doctorType: DoctorType;
      tierId: string | null;
      tierName: string | null;
      defaultBaseRate: number;
    };
  }) {
    const doctor = input.doctorContext || await this.getDoctorContext(input.doctorId);
    const consultationType = input.consultationType || 'video';
    const price = await this.pricingService.calculatePrice({
      doctorType: doctor.doctorType,
      duration: input.duration,
      consultationType,
      tierId: doctor.tierId,
      tierName: doctor.tierName,
      baseFallback: doctor.defaultBaseRate,
    });

    return { doctor, consultationType, price };
  }

  async previewPrice(input: PricePreviewInput): Promise<PricePreviewResult> {
    if (!input.doctorId) throw new Error('Missing doctorId');

    const durationMinutes = Math.max(5, Number(input.duration || 30));
    const { consultationType, price } = await this.calculatePriceForDoctor({
      doctorId: input.doctorId,
      duration: durationMinutes,
      consultationType: input.consultationType,
    });

    return {
      finalPrice: price.finalPrice,
      base: price.base,
      modifiers: price.modifiers,
      pricingProfileId: price.pricingProfileId,
      featureFlags: price.featureFlags,
      durationMinutes,
      consultationType,
    };
  }

  async initiateBooking(input: BookingInitiateInput): Promise<BookingInitiateResult> {
    if (!input.patientId) throw new Error('Missing patientId');
    if (!input.doctorId) throw new Error('Missing doctorId');

    await this.availabilityService.cleanupExpiredPendingLocks(input.doctorId);

    const doctor = await this.getDoctorContext(input.doctorId);
    const patient = await this.getPatientContext(input.patientId);
    const durationPricingEnabled = await this.availabilityService.getDurationPricingEnabled();

    const requestedDuration = Math.max(5, Number(input.duration || 30));
    let slot;

    if (durationPricingEnabled) {
      if (!input.preferredDate || !input.preferredTime) {
        throw new Error('Date and time are required when duration pricing is enabled');
      }

      const check = await this.availabilityService.validateAvailability({
        doctorId: input.doctorId,
        date: input.preferredDate,
        time: input.preferredTime,
        durationMinutes: requestedDuration,
      });

      if (!check.available) {
        throw new Error(check.reason || 'Selected slot is unavailable');
      }

      slot = {
        date: input.preferredDate,
        time: input.preferredTime,
        durationMinutes: requestedDuration,
      };
    } else {
      slot = await this.availabilityService.findNextAvailableSlot({
        doctorId: input.doctorId,
        durationMinutes: requestedDuration,
        preferredDate: input.preferredDate,
      });
    }

    const { consultationType, price } = await this.calculatePriceForDoctor({
      doctorId: input.doctorId,
      duration: slot.durationMinutes,
      consultationType: input.consultationType,
      doctorContext: doctor,
    });

    const { data: consultationTypeRow } = await this.supabase
      .from('consultation_types')
      .select('id')
      .eq('name', consultationType)
      .maybeSingle();

    const lockUntil = new Date(Date.now() + (5 * 60 * 1000)).toISOString();

    const breakdown = {
      base: price.base,
      modifiers: price.modifiers,
      final_price: price.finalPrice,
      doctor_type: doctor.doctorType,
      consultation_type: consultationType,
      duration_minutes: slot.durationMinutes,
      tier_id: doctor.tierId,
      tier_name: doctor.tierName,
      feature_flags: price.featureFlags,
    };

    const { data: appointment, error: appointmentError } = await this.supabase
      .from('appointments')
      .insert({
        patient_id: input.patientId,
        patient_name: patient.patientName,
        doctor_id: input.doctorId,
        specialist_name: doctor.doctorName,
        date: slot.date,
        time: slot.time,
        notes: input.notes || null,
        status: 'pending_payment',
        final_price: price.finalPrice,
        price_breakdown: breakdown,
        pricing_profile_id: price.pricingProfileId,
        slot_locked_until: lockUntil,
        consultation_type_id: consultationTypeRow?.id || null,
        duration_minutes: slot.durationMinutes,
      })
      .select('*')
      .single();

    if (appointmentError) {
      throw new Error(`Failed creating pending appointment: ${appointmentError.message}`);
    }

    const paymentInitialization = await this.paymentService.createPaymentIntent({
      appointmentId: appointment.id,
      patientId: input.patientId,
      doctorId: input.doctorId,
      email: input.patientEmail,
      amount: Number(appointment.final_price || price.finalPrice),
      metadata: {
        appointment_date: slot.date,
        appointment_time: slot.time,
        duration_minutes: slot.durationMinutes,
        consultation_type: consultationType,
      },
    });

    return {
      appointmentId: appointment.id,
      finalPrice: Number(appointment.final_price || price.finalPrice),
      slot,
      paymentInitialization,
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
    if (status === 'pending_approval' || status === 'confirmed' || status === 'completed' || status === 'in_progress') {
      return { appointmentId: appointment.id, alreadyProcessed: true };
    }

    const verified = await this.paymentService.verifyPayment(reference);
    if (!verified.ok) {
      await this.failPayment(reference, `Verification failed with status ${verified.status}`);
      throw new Error(`Payment verification failed: ${verified.status}`);
    }

    const expectedKobo = Math.round(Number(appointment.final_price || 0) * 100);
    if (verified.amountInKobo !== expectedKobo) {
      await this.failPayment(reference, 'Amount mismatch');
      throw new Error('Payment amount mismatch');
    }

    await this.paymentService.markPaymentSuccess(reference, {
      ...(paystackVerification || {}),
      verify_response: verified.raw,
    });

    const { error: confirmError } = await this.supabase
      .from('appointments')
      .update({
        status: 'pending_approval',
        slot_locked_until: null,
      })
      .eq('id', appointment.id);

    if (confirmError) throw new Error(`Failed to confirm appointment after payment: ${confirmError.message}`);

    await this.walletService.addPendingEarning({
      id: appointment.id,
      doctor_id: appointment.doctor_id,
      final_price: Number(appointment.final_price || 0),
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

    await this.paymentService.markPaymentFailed(reference, reason);

    if (payment.appointment_id) {
      const { data: appointment, error: appointmentLookupError } = await this.supabase
        .from('appointments')
        .select('id, status')
        .eq('id', payment.appointment_id)
        .maybeSingle();

      if (appointmentLookupError) {
        throw new Error(`Failed to load appointment status before expiring payment: ${appointmentLookupError.message}`);
      }

      const status = normalizeAppointmentStatusRaw(appointment?.status);
      if (status !== 'pending_payment') {
        return { updated: true };
      }

      const { error } = await this.supabase
        .from('appointments')
        .update({ status: 'cancelled', slot_locked_until: null })
        .eq('id', payment.appointment_id);

      if (error) {
        throw new Error(`Failed to cancel appointment after failed payment: ${error.message}`);
      }
    }

    return { updated: true };
  }
}
