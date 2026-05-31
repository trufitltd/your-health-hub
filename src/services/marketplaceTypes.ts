export type DoctorType = 'GP' | 'Specialist';

export type PricingRuleType = 'base' | 'modifier';
export type PricingConditionType = 'doctor_type' | 'duration' | 'tier' | 'consultation_type';
export type PricingAction = 'set' | 'add' | 'multiply';

export type FeatureFlagName = 'duration_pricing' | 'tier_pricing' | 'consultation_type_pricing';

export interface PricingProfile {
  id: string;
  name: string;
  country_code: string;
  currency: string;
  is_default: boolean;
  active: boolean;
  created_at: string;
}

export interface PricingRule {
  id: string;
  pricing_profile_id: string;
  rule_type: PricingRuleType;
  condition_type: PricingConditionType;
  condition_value: string;
  price_action: PricingAction;
  amount: number;
  priority: number;
  active: boolean;
  created_at?: string;
}

export interface PricingFeatureFlag {
  id: string;
  feature_name: FeatureFlagName;
  enabled: boolean;
  updated_at: string;
}

export interface ConsultationType {
  id: string;
  name: 'chat' | 'voice' | 'video';
  active: boolean;
  flat_rate: number | null;
  created_at?: string;
}

export interface DoctorTier {
  id: string;
  name: string;
  experience_min: number;
  experience_max: number | null;
  active: boolean;
  created_at?: string;
}

export interface AppointmentDurationOption {
  id: string;
  name: string;
  value_minutes: number;
  active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface PlatformFeeRule {
  id: string;
  doctor_type: DoctorType;
  fee_type: 'percentage' | 'fixed';
  value: number;
  active: boolean;
  created_at?: string;
}

export interface DoctorWallet {
  doctor_id: string;
  pending_balance: number;
  available_balance: number;
  updated_at: string;
}

export interface PatientWallet {
  patient_id: string;
  available_balance: number;
  updated_at: string;
}

export interface PatientWalletTransaction {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  amount: number;
  direction: 'credit' | 'debit';
  transaction_type: 'refund' | 'booking_wallet_use' | 'adjustment';
  status: 'completed' | 'reversed';
  narration: string | null;
  created_at: string;
}

export interface PriceModifierResult {
  conditionType: PricingConditionType | 'consultation_type_flat_rate';
  conditionValue: string;
  action: PricingAction | 'set';
  amount: number;
  before: number;
  after: number;
  delta: number;
}

export interface PriceCalculationResult {
  base: number;
  modifiers: PriceModifierResult[];
  finalPrice: number;
  pricingProfileId: string;
  featureFlags: Record<FeatureFlagName, boolean>;
}

export interface BookingInitiateRequest {
  doctorId: string;
  preferredDate?: string;
  preferredTime?: string;
  duration?: number;
  consultationType?: 'chat' | 'voice' | 'video';
  consultationLanguage?: string;
  paymentMethod?: 'paystack' | 'wallet' | 'hybrid';
  notes?: string;
}

export interface BookingInitiateResponse {
  appointmentId: string;
  finalPrice: number;
  slot: {
    date: string;
    time: string;
    durationMinutes: number;
  };
  paymentInitialization: {
    reference: string;
    amountInKobo: number;
    email: string;
    metadata: Record<string, unknown>;
    accessCode?: string;
  } | null;
  paymentMethod: 'paystack' | 'wallet' | 'hybrid';
  paidWithWallet: boolean;
  walletChargedAmount?: number;
  paystackAmountDue?: number;
}

export interface PatientWalletWithdrawalRequest {
  request_id: string;
  patient_id: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'cancelled' | 'approved' | 'paid';
  amount: number;
  balance_after: number;
  sla_due_at?: string | null;
  idempotency_key?: string | null;
  idempotent_replay?: boolean;
}

export interface PatientWalletWithdrawalRequestRow {
  id: string;
  patient_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'cancelled' | 'approved' | 'paid';
  narration: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
  sla_due_at?: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
  completed_at?: string | null;
  admin_note?: string | null;
  payout_reference?: string | null;
}

export interface PricePreviewRequest {
  doctorId: string;
  duration?: number;
  consultationType?: 'chat' | 'voice' | 'video';
}

export interface PricePreviewResponse {
  finalPrice: number;
  base: number;
  modifiers: PriceModifierResult[];
  pricingProfileId: string;
  featureFlags: Record<FeatureFlagName, boolean>;
  durationMinutes: number;
  consultationType: 'chat' | 'voice' | 'video';
}

export type AppointmentStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type RescheduleRequestStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'cancelled'
  | 'expired';

const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending_payment: 'Pending Payment',
  pending_approval: 'Pending Approval',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

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

export const normalizeRescheduleRequestStatus = (status?: string | null): RescheduleRequestStatus => {
  const normalized = (status || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');

  if (!normalized) return 'none';
  if (
    normalized === 'none' ||
    normalized === 'pending' ||
    normalized === 'approved' ||
    normalized === 'declined' ||
    normalized === 'cancelled' ||
    normalized === 'expired'
  ) {
    return normalized as RescheduleRequestStatus;
  }
  return 'none';
};

export const formatAppointmentStatusLabel = (status?: string | null) => {
  const normalized = normalizeAppointmentStatusRaw(status);
  if (!normalized) return 'Unknown';
  if (normalized in APPOINTMENT_STATUS_LABELS) {
    return APPOINTMENT_STATUS_LABELS[normalized as AppointmentStatus];
  }
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const isPendingPaymentAppointmentStatus = (status?: string | null) =>
  normalizeAppointmentStatusRaw(status) === 'pending_payment';

export const isSlotBlockingAppointmentStatus = (status?: string | null) => {
  const normalized = normalizeAppointmentStatusRaw(status);
  return (
    normalized === 'pending_payment' ||
    normalized === 'pending_approval' ||
    normalized === 'confirmed' ||
    normalized === 'in_progress' ||
    normalized === 'completed'
  );
};

export const getDoctorTypeFromSpecialty = (specialty?: string | null): DoctorType => {
  const normalized = (specialty || '').toLowerCase().replace(/[_-]/g, ' ').trim();
  if (normalized === 'general practice' || normalized === 'general practitioner' || normalized === 'gp') {
    return 'GP';
  }
  return 'Specialist';
};

export const GP_RATE_NGN = 5000;
export const MIN_SPECIALIST_RATE_NGN = 10000;
export const GP_RATE_USD = 5;
export const MIN_SPECIALIST_RATE_USD = 10;
