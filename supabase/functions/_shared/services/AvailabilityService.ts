import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DEFAULT_BOOKING_DURATION_MINUTES,
  isPendingPaymentAppointmentStatus,
  normalizeAppointmentStatusRaw,
} from '../marketplace-types.ts';

type AvailabilityCheckInput = {
  doctorId: string;
  date: string;
  time: string;
  durationMinutes: number;
};

type SlotResult = {
  date: string;
  time: string;
  durationMinutes: number;
};

const normalizeTime = (value: string) => value.trim().slice(0, 5);

const timeToMinutes = (value: string) => {
  const normalized = normalizeTime(value);
  const [hourStr, minuteStr] = normalized.split(':');
  const hours = Number(hourStr || 0);
  const minutes = Number(minuteStr || 0);
  return (hours * 60) + minutes;
};

const toDateKey = (date: Date) => date.toISOString().split('T')[0];

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && aEnd > bStart;

const BUSY_STATUSES = new Set([
  'confirmed',
  'pending_approval',
  'in_progress',
  'completed',
  'pending_payment',
]);

export class AvailabilityService {
  constructor(private readonly supabase: SupabaseClient) {}

  private async rollbackExpiredHybridWalletContribution(appointmentId: string, patientId: string) {
    const { data: hybridPaymentRows, error: hybridPaymentLookupError } = await this.supabase
      .from('payments')
      .select('metadata, provider_reference, payment_reference')
      .eq('appointment_id', appointmentId)
      .eq('provider', 'paystack')
      .in('status', ['PENDING', 'pending'])
      .order('created_at', { ascending: false })
      .limit(3);

    if (hybridPaymentLookupError) {
      throw new Error(`Failed to inspect pending hybrid payments for expired appointment: ${hybridPaymentLookupError.message}`);
    }

    const hybridPaystack = (hybridPaymentRows || []).find((row: any) => {
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      return String(metadata.type || '').trim().toLowerCase() === 'booking_hybrid_paystack';
    }) as { metadata?: Record<string, unknown> | null; provider_reference?: string | null; payment_reference?: string | null } | undefined;

    if (!hybridPaystack) return;

    const metadata = (hybridPaystack.metadata || {}) as Record<string, unknown>;
    const walletAppliedRaw = Number(metadata.wallet_applied_amount || 0);
    const walletApplied = Number.isFinite(walletAppliedRaw) && walletAppliedRaw > 0
      ? Number((Math.round(walletAppliedRaw * 100) / 100).toFixed(2))
      : 0;
    const walletPaymentReference = String(metadata.wallet_payment_reference || '').trim();

    if (walletApplied > 0) {
      const { data: rollbackRows, error: rollbackLookupError } = await this.supabase
        .from('patient_wallet_transactions')
        .select('amount')
        .eq('appointment_id', appointmentId)
        .eq('direction', 'credit')
        .eq('transaction_type', 'adjustment')
        .eq('status', 'completed')
        .ilike('narration', 'Hybrid payment rollback%');

      if (rollbackLookupError) {
        throw new Error(`Failed checking prior hybrid rollback transactions: ${rollbackLookupError.message}`);
      }

      const alreadyRolledBack = Number((Math.round(((rollbackRows || []).reduce((sum: number, row: any) => (
        sum + Number(row.amount || 0)
      ), 0)) * 100) / 100).toFixed(2));
      const rollbackOutstanding = Number((Math.round(Math.max(walletApplied - alreadyRolledBack, 0) * 100) / 100).toFixed(2));

      if (rollbackOutstanding > 0) {
        const { error: rollbackError } = await this.supabase.rpc('credit_patient_wallet_adjustment', {
          p_patient_id: patientId,
          p_appointment_id: appointmentId,
          p_amount: rollbackOutstanding,
          p_narration: `Hybrid payment rollback (${appointmentId})`,
        });

        if (rollbackError) {
          throw new Error(`Failed rolling back hybrid wallet amount for expired appointment: ${rollbackError.message}`);
        }
      }
    }

    if (walletPaymentReference) {
      const { data: walletPayment } = await this.supabase
        .from('payments')
        .select('metadata')
        .or(`provider_reference.eq.${walletPaymentReference},payment_reference.eq.${walletPaymentReference}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      await this.supabase
        .from('payments')
        .update({
          status: 'FAILED',
          metadata: {
            ...((walletPayment?.metadata || {}) as Record<string, unknown>),
            type: 'booking_hybrid_wallet',
            stage: 'rolled_back_after_expiry',
            failed_at: new Date().toISOString(),
          },
        })
        .or(`provider_reference.eq.${walletPaymentReference},payment_reference.eq.${walletPaymentReference}`);
    }

    const paystackReference = String(hybridPaystack.provider_reference || hybridPaystack.payment_reference || '').trim();
    if (paystackReference) {
      const { data: paystackPayment } = await this.supabase
        .from('payments')
        .select('metadata')
        .or(`provider_reference.eq.${paystackReference},payment_reference.eq.${paystackReference}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      await this.supabase
        .from('payments')
        .update({
          status: 'FAILED',
          metadata: {
            ...((paystackPayment?.metadata || {}) as Record<string, unknown>),
            expired_at: new Date().toISOString(),
            expiry_reason: 'Pending payment lock expired',
          },
        })
        .or(`provider_reference.eq.${paystackReference},payment_reference.eq.${paystackReference}`);
    }
  }

  async getDurationPricingEnabled() {
    const { data, error } = await this.supabase
      .from('pricing_feature_flags')
      .select('enabled')
      .eq('feature_name', 'duration_pricing')
      .maybeSingle();

    if (error) {
      console.warn('[AvailabilityService] duration_pricing flag query failed, defaulting to true');
      return true;
    }

    return data?.enabled ?? true;
  }

  async getAllowedDurations() {
    const { data: durationOptions, error } = await this.supabase
      .from('appointment_duration_options')
      .select('value_minutes')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('value_minutes', { ascending: true });

    if (error) {
      throw new Error(`Failed to load duration options: ${error.message}`);
    }

    const durations = Array.from(
      new Set(
        (durationOptions || [])
          .map((option: any) => Number(option?.value_minutes || 0))
          .filter((value: number) => Number.isFinite(value) && value > 0 && value <= 24 * 60)
          .map((value: number) => Math.round(value)),
      ),
    ).sort((a, b) => a - b);

    if (durations.length === 0) {
      throw new Error('No active appointment duration options configured');
    }

    return durations;
  }

  async cleanupExpiredPendingLocks(doctorId?: string) {
    let query = this.supabase
      .from('appointments')
      .select('id, status, patient_id')
      .lt('slot_locked_until', new Date().toISOString());

    if (doctorId) query = query.eq('doctor_id', doctorId);

    const { data, error } = await query;
    if (error || !data) {
      console.warn('[AvailabilityService] Failed to load expired pending locks:', error?.message);
      return;
    }

    const pendingPaymentRows = (data || [])
      .filter((row: any) => isPendingPaymentAppointmentStatus(row.status))
      .filter((row: any) => !!row.id) as Array<{ id: string; patient_id: string | null }>;

    if (pendingPaymentRows.length === 0) return;

    for (const row of pendingPaymentRows) {
      if (!row.patient_id) continue;
      try {
        await this.rollbackExpiredHybridWalletContribution(row.id, row.patient_id);
      } catch (rollbackError: any) {
        console.warn(`[AvailabilityService] Failed hybrid rollback for expired appointment ${row.id}:`, rollbackError?.message || rollbackError);
      }
    }

    const pendingPaymentIds = pendingPaymentRows.map((row) => row.id);

    const { error: updateError } = await this.supabase
      .from('appointments')
      .update({ status: 'cancelled', slot_locked_until: null })
      .in('id', pendingPaymentIds);

    if (updateError) {
      console.warn('[AvailabilityService] Failed to cleanup expired locks:', updateError.message);
    }
  }

  private generateTimeSlots(startTime: string, endTime: string, durationMinutes: number): string[] {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    const slots: string[] = [];

    for (let cursor = start; cursor + durationMinutes <= end; cursor += durationMinutes) {
      const hour = Math.floor(cursor / 60);
      const minute = cursor % 60;
      slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }

    return slots;
  }

  private async getSchedulesForDay(doctorId: string, dayIndex: number) {
    const { data, error } = await this.supabase
      .from('doctor_schedules')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayIndex)
      .eq('is_available', true)
      .order('start_time', { ascending: true });

    if (error) throw new Error(`Failed to load doctor schedules: ${error.message}`);
    return data || [];
  }

  private async getAppointmentsForDate(doctorId: string, date: string) {
    const { data, error } = await this.supabase
      .from('appointments')
      .select('id, time, duration_minutes, status, slot_locked_until')
      .eq('doctor_id', doctorId)
      .eq('date', date);

    if (error) throw new Error(`Failed to load doctor appointments for availability check: ${error.message}`);

    const now = Date.now();

    return (data || []).filter((apt: any) => {
      const status = normalizeAppointmentStatusRaw(apt.status);
      if (!BUSY_STATUSES.has(status)) return false;
      if (isPendingPaymentAppointmentStatus(status)) {
        if (!apt.slot_locked_until) return false;
        const lockTime = new Date(apt.slot_locked_until).getTime();
        return lockTime > now;
      }
      return true;
    });
  }

  private isSlotBlocked(time: string, durationMinutes: number, appointments: any[]) {
    const targetStart = timeToMinutes(time);
    const targetEnd = targetStart + durationMinutes;

    return appointments.some((apt) => {
      const existingStart = timeToMinutes(apt.time);
      const existingDuration = Number(apt.duration_minutes || DEFAULT_BOOKING_DURATION_MINUTES);
      const existingEnd = existingStart + existingDuration;
      return overlap(targetStart, targetEnd, existingStart, existingEnd);
    });
  }

  async validateAvailability(input: AvailabilityCheckInput) {
    const date = new Date(`${input.date}T00:00:00`);
    const dayIndex = date.getDay();

    const [schedules, appointments] = await Promise.all([
      this.getSchedulesForDay(input.doctorId, dayIndex),
      this.getAppointmentsForDate(input.doctorId, input.date),
    ]);

    if (schedules.length === 0) {
      return { available: false, reason: 'Doctor has no schedule for selected date' };
    }

    const requestedStart = timeToMinutes(input.time);
    const requestedEnd = requestedStart + input.durationMinutes;

    const coveredBySchedule = schedules.some((schedule: any) => {
      const scheduleStart = timeToMinutes(schedule.start_time);
      const scheduleEnd = timeToMinutes(schedule.end_time);
      return requestedStart >= scheduleStart && requestedEnd <= scheduleEnd;
    });

    if (!coveredBySchedule) {
      return { available: false, reason: 'Requested time is outside doctor schedule' };
    }

    if (this.isSlotBlocked(input.time, input.durationMinutes, appointments)) {
      return { available: false, reason: 'Requested slot is already occupied' };
    }

    const now = new Date();
    const slotDate = new Date(`${input.date}T${normalizeTime(input.time)}:00`);
    if (slotDate.getTime() <= now.getTime()) {
      return { available: false, reason: 'Requested time is in the past' };
    }

    return { available: true };
  }

  async findNextAvailableSlot(params: {
    doctorId: string;
    durationMinutes: number;
    preferredDate?: string;
  }): Promise<SlotResult> {
    const start = params.preferredDate
      ? new Date(`${params.preferredDate}T00:00:00`)
      : new Date();

    const now = new Date();

    for (let dayOffset = 0; dayOffset < 45; dayOffset++) {
      const date = new Date(start);
      date.setDate(start.getDate() + dayOffset);
      const dateKey = toDateKey(date);
      const dayIndex = date.getDay();

      const [schedules, appointments] = await Promise.all([
        this.getSchedulesForDay(params.doctorId, dayIndex),
        this.getAppointmentsForDate(params.doctorId, dateKey),
      ]);

      if (schedules.length === 0) continue;

      for (const schedule of schedules) {
        const stepDuration = Math.max(5, Number(
          params.durationMinutes || schedule.slot_duration_minutes || DEFAULT_BOOKING_DURATION_MINUTES,
        ));
        const slots = this.generateTimeSlots(schedule.start_time, schedule.end_time, stepDuration);

        for (const time of slots) {
          const slotDate = new Date(`${dateKey}T${time}:00`);
          if (slotDate.getTime() <= now.getTime()) continue;

          if (!this.isSlotBlocked(time, stepDuration, appointments)) {
            return {
              date: dateKey,
              time,
              durationMinutes: stepDuration,
            };
          }
        }
      }
    }

    throw new Error('No available slots found for this doctor');
  }

  async releaseSlot(appointmentId: string) {
    const { error } = await this.supabase
      .from('appointments')
      .update({ slot_locked_until: null })
      .eq('id', appointmentId);

    if (error) {
      throw new Error(`Failed to release slot lock: ${error.message}`);
    }
  }
}
