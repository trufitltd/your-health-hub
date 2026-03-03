import type { FeatureFlagName } from '@/services/marketplaceTypes';

export const DEFAULT_BOOKING_DURATION_MINUTES = 30;
export const DEFAULT_CONSULTATION_TYPE = 'video' as const;

export const DEFAULT_PRICING_FEATURE_FLAGS: Record<FeatureFlagName, boolean> = {
  duration_pricing: true,
  tier_pricing: true,
  consultation_type_pricing: false,
};
