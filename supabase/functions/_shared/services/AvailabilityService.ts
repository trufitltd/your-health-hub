import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isPendingPaymentAppointmentStatus, normalizeAppointmentStatusRaw } from '../marketplace-types.ts';

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
  'in_progress',
  'completed',
  'pending',
  'pending_payment',
]);

export class AvailabilityService {
  constructor(private readonly supabase: SupabaseClient) {}

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

  async cleanupExpiredPendingLocks(doctorId?: string) {
    let query = this.supabase
      .from('appointments')
      .select('id, status')
      .lt('slot_locked_until', new Date().toISOString());

    if (doctorId) query = query.eq('doctor_id', doctorId);

    const { data, error } = await query;
    if (error || !data) {
      console.warn('[AvailabilityService] Failed to load expired pending locks:', error?.message);
      return;
    }

    const pendingPaymentIds = (data || [])
      .filter((row: any) => isPendingPaymentAppointmentStatus(row.status))
      .map((row: any) => row.id)
      .filter(Boolean);

    if (pendingPaymentIds.length === 0) return;

    const { error: updateError } = await this.supabase
      .from('appointments')
      .update({ status: 'expired', slot_locked_until: null })
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
      const existingDuration = Number(apt.duration_minutes || 30);
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
        const stepDuration = Math.max(5, Number(params.durationMinutes || schedule.slot_duration_minutes || 30));
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
