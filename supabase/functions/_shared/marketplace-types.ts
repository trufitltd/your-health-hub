export type DoctorType = 'GP' | 'Specialist';

export type FeatureFlagName =
  | 'duration_pricing'
  | 'tier_pricing'
  | 'consultation_type_pricing';

export type PriceAction = 'set' | 'add' | 'multiply';

export interface PriceModifierResult {
  conditionType: string;
  conditionValue: string;
  action: PriceAction | 'set';
  amount: number;
  before: number;
  after: number;
  delta: number;
}

export interface PriceCalculationInput {
  doctorType: DoctorType;
  duration?: number;
  consultationType?: string;
  tierId?: string | null;
  tierName?: string | null;
  baseFallback?: number;
}

export interface PriceCalculationResult {
  base: number;
  modifiers: PriceModifierResult[];
  finalPrice: number;
  pricingProfileId: string;
  featureFlags: Record<FeatureFlagName, boolean>;
}

export interface BookingInitiateInput {
  patientId: string;
  patientEmail: string;
  doctorId: string;
  preferredDate?: string;
  preferredTime?: string;
  duration?: number;
  consultationType?: 'chat' | 'voice' | 'video';
  notes?: string;
}

export interface SlotResult {
  date: string;
  time: string;
  durationMinutes: number;
}

export interface PaymentIntentResult {
  reference: string;
  amountInKobo: number;
  email: string;
  metadata: Record<string, unknown>;
}

export interface BookingInitiateResult {
  appointmentId: string;
  finalPrice: number;
  slot: SlotResult;
  paymentInitialization: PaymentIntentResult;
}

export interface PricePreviewInput {
  doctorId: string;
  duration?: number;
  consultationType?: 'chat' | 'voice' | 'video';
}

export interface PricePreviewResult {
  finalPrice: number;
  base: number;
  modifiers: PriceModifierResult[];
  pricingProfileId: string;
  featureFlags: Record<FeatureFlagName, boolean>;
  durationMinutes: number;
  consultationType: 'chat' | 'voice' | 'video';
}

export interface PaystackVerifyResult {
  ok: boolean;
  status: string;
  amountInKobo: number;
  reference: string;
  raw: Record<string, unknown>;
}

export const normalizeDoctorType = (specialty?: string | null): DoctorType => {
  const value = (specialty || '').toLowerCase().replace(/[_-]/g, ' ').trim();
  if (value === 'general practice' || value === 'general practitioner' || value === 'gp') {
    return 'GP';
  }
  return 'Specialist';
};

export const roundMoney = (value: number) => Number((Math.round(value * 100) / 100).toFixed(2));

export const normalizeAppointmentStatusRaw = (status?: string | null) => {
  const normalized = (status || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');

  if (!normalized) return '';
  if (normalized === 'requested' || normalized === 'awaiting_approval') return 'pending';
  if (normalized === 'canceled') return 'cancelled';
  if (normalized === 'inprogress') return 'in_progress';
  return normalized;
};

export const normalizeAppointmentStatus = (status?: string | null) => {
  const normalized = normalizeAppointmentStatusRaw(status);
  if (normalized === 'pending_payment') return 'pending';
  if (normalized === 'expired') return 'cancelled';
  return normalized;
};

export const isPendingPaymentAppointmentStatus = (status?: string | null) =>
  normalizeAppointmentStatusRaw(status) === 'pending_payment';
