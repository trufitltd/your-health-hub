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
  };
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

export const normalizeAppointmentStatus = (status?: string | null) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'pending_payment') return 'pending';
  if (normalized === 'expired') return 'cancelled';
  return normalized;
};

export const getDoctorTypeFromSpecialty = (specialty?: string | null): DoctorType => {
  const normalized = (specialty || '').toLowerCase().replace(/[_-]/g, ' ').trim();
  if (normalized === 'general practice' || normalized === 'general practitioner' || normalized === 'gp') {
    return 'GP';
  }
  return 'Specialist';
};
