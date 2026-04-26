export type DoctorType = 'GP' | 'Specialist';

export type FeatureFlagName =
  | 'duration_pricing'
  | 'tier_pricing'
  | 'consultation_type_pricing';

export const DEFAULT_BOOKING_DURATION_MINUTES = 30;
export const DEFAULT_CONSULTATION_TYPE = 'video' as const;
export const DEFAULT_PRICING_FEATURE_FLAGS: Record<FeatureFlagName, boolean> = {
  duration_pricing: true,
  tier_pricing: true,
  consultation_type_pricing: false,
};

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
  consultationLanguage?: string;
  paymentMethod?: 'paystack' | 'wallet' | 'hybrid';
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
  accessCode?: string;
  authorizationUrl?: string;
}

export interface BookingInitiateResult {
  appointmentId: string;
  finalPrice: number;
  slot: SlotResult;
  paymentInitialization: PaymentIntentResult | null;
  paymentMethod: 'paystack' | 'wallet' | 'hybrid';
  paidWithWallet: boolean;
  walletChargedAmount?: number;
  paystackAmountDue?: number;
}

export interface PricePreviewInput {
  doctorId: string;
  patientId?: string;
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
  isPromotion?: boolean;
  promotionType?: string;
}

export interface PaystackVerifyResult {
  ok: boolean;
  status: string;
  amountInKobo: number;
  reference: string;
  raw: Record<string, unknown>;
}

export type AppointmentStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

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
  if (
    normalized === 'requested' ||
    normalized === 'awaiting_approval' ||
    normalized === 'pending' ||
    normalized === 'pending_doctor_acceptance' ||
    normalized === 'pending_approval'
  ) return 'pending_approval';
  if (normalized === 'canceled') return 'cancelled';
  if (normalized === 'rejected' || normalized === 'declined' || normalized === 'expired') return 'cancelled';
  if (normalized === 'inprogress') return 'in_progress';
  if (normalized === 'noshow') return 'no_show';
  return normalized;
};

export const normalizeAppointmentStatus = (status?: string | null) => normalizeAppointmentStatusRaw(status);

export const isPendingPaymentAppointmentStatus = (status?: string | null) =>
  normalizeAppointmentStatusRaw(status) === 'pending_payment';
