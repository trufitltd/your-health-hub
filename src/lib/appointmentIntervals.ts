import {
  isPendingPaymentAppointmentStatus,
  isSlotBlockingAppointmentStatus,
} from '@/services/marketplaceTypes';

export type AppointmentIntervalRow = {
  id?: string | null;
  time?: string | null;
  duration_minutes?: number | null;
  status?: string | null;
  slot_locked_until?: string | null;
};

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

export const normalizeTimeHHMM = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = raw.slice(0, 5);
  const match = candidate.match(TIME_PATTERN);
  if (!match) return '';

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const timeToMinutes = (value: string | null | undefined) => {
  const normalized = normalizeTimeHHMM(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return (hour * 60) + minute;
};

export const normalizeDurationMinutes = (value: unknown, fallback = 30) => {
  const safeFallback = Number.isFinite(Number(fallback)) && Number(fallback) > 0
    ? Math.min(Math.round(Number(fallback)), 24 * 60)
    : 30;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return safeFallback;
  }

  return Math.min(Math.round(parsed), 24 * 60);
};

export const rangesOverlap = (
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) => startA < endB && startB < endA;

export const isBlockingAppointmentRow = (
  appointment: AppointmentIntervalRow,
  nowMs = Date.now(),
) => {
  if (!isSlotBlockingAppointmentStatus(appointment.status)) return false;
  if (!isPendingPaymentAppointmentStatus(appointment.status)) return true;
  if (!appointment.slot_locked_until) return false;
  return new Date(appointment.slot_locked_until).getTime() > nowMs;
};

export const getAppointmentInterval = (
  appointment: AppointmentIntervalRow,
  fallbackDurationMinutes = 30,
) => {
  const startMinutes = timeToMinutes(appointment.time || null);
  if (startMinutes === null) return null;

  const durationMinutes = normalizeDurationMinutes(
    appointment.duration_minutes,
    fallbackDurationMinutes,
  );

  return {
    start: startMinutes,
    end: startMinutes + durationMinutes,
  };
};

export const doesAppointmentBlockSlot = (
  appointment: AppointmentIntervalRow,
  slotStartTime: string,
  slotDurationMinutes: number,
) => {
  const slotStart = timeToMinutes(slotStartTime);
  if (slotStart === null) return false;

  const slotDuration = normalizeDurationMinutes(slotDurationMinutes, 30);
  const slotEnd = slotStart + slotDuration;
  const appointmentInterval = getAppointmentInterval(appointment);
  if (!appointmentInterval) return false;

  return rangesOverlap(
    slotStart,
    slotEnd,
    appointmentInterval.start,
    appointmentInterval.end,
  );
};

export const doesAppointmentContainTime = (
  appointment: AppointmentIntervalRow,
  targetTime: string,
) => {
  const point = timeToMinutes(targetTime);
  if (point === null) return false;
  const appointmentInterval = getAppointmentInterval(appointment);
  if (!appointmentInterval) return false;

  return point >= appointmentInterval.start && point < appointmentInterval.end;
};

export const isSlotBlockedByAppointments = (
  slotStartTime: string,
  slotDurationMinutes: number,
  appointments: AppointmentIntervalRow[],
  nowMs = Date.now(),
) => appointments.some((appointment) => (
  isBlockingAppointmentRow(appointment, nowMs)
  && doesAppointmentBlockSlot(appointment, slotStartTime, slotDurationMinutes)
));

export const isTimePointBusyByAppointments = (
  targetTime: string,
  appointments: AppointmentIntervalRow[],
  nowMs = Date.now(),
) => appointments.some((appointment) => (
  isBlockingAppointmentRow(appointment, nowMs)
  && doesAppointmentContainTime(appointment, targetTime)
));
