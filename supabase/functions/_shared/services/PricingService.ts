import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  FeatureFlagName,
  PriceCalculationInput,
  PriceCalculationResult,
  PriceModifierResult,
} from '../marketplace-types.ts';
import { DEFAULT_PRICING_FEATURE_FLAGS, roundMoney } from '../marketplace-types.ts';

type PricingRuleRow = {
  id: string;
  pricing_profile_id: string;
  rule_type: 'base' | 'modifier';
  condition_type: 'doctor_type' | 'duration' | 'tier' | 'consultation_type';
  condition_value: string;
  price_action: 'set' | 'add' | 'multiply';
  amount: number;
  priority: number;
  active: boolean;
};

type FeatureFlagRow = {
  feature_name: FeatureFlagName;
  enabled: boolean;
};

type DiscoveryTierCandidate = {
  id: string;
  name: string;
};

export type DiscoveryStartingPricesResult = {
  gp: number | null;
  specialist: number | null;
  currency: string;
  pricingProfileId: string;
  variation: {
    gp: {
      duration: boolean;
      consultationType: boolean;
      tier: boolean;
    };
    specialist: {
      duration: boolean;
      consultationType: boolean;
      tier: boolean;
    };
  };
};

const normalizeValue = (value?: string | null) => (value || '').trim().toLowerCase();

const applyAction = (
  current: number,
  action: 'set' | 'add' | 'multiply',
  amount: number,
) => {
  if (action === 'set') return amount;
  if (action === 'add') return current + amount;
  return current * amount;
};

export class PricingService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getFeatureFlags(): Promise<Record<FeatureFlagName, boolean>> {
    const { data, error } = await this.supabase
      .from('pricing_feature_flags')
      .select('feature_name, enabled');

    if (error) {
      console.warn('[PricingService] Failed loading feature flags, using defaults:', error.message);
      return { ...DEFAULT_PRICING_FEATURE_FLAGS };
    }

    const result = { ...DEFAULT_PRICING_FEATURE_FLAGS };
    (data || []).forEach((row) => {
      const typedRow = row as FeatureFlagRow;
      const key = typedRow.feature_name;
      if (key in result) result[key] = !!typedRow.enabled;
    });

    return result;
  }

  async getActivePricingProfile() {
    const { data, error } = await this.supabase
      .from('pricing_profiles')
      .select('*')
      .eq('active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to load active pricing profile: ${error.message}`);
    if (!data) throw new Error('No active pricing profile configured');

    return data;
  }

  async getActiveRules(pricingProfileId: string): Promise<PricingRuleRow[]> {
    const { data, error } = await this.supabase
      .from('pricing_rules')
      .select('*')
      .eq('pricing_profile_id', pricingProfileId)
      .eq('active', true)
      .order('priority', { ascending: true });

    if (error) throw new Error(`Failed to load pricing rules: ${error.message}`);
    return (data || []) as PricingRuleRow[];
  }

  private applyRule(
    current: number,
    rule: PricingRuleRow,
    modifiers: PriceModifierResult[],
  ) {
    const before = current;
    const after = roundMoney(applyAction(before, rule.price_action, Number(rule.amount || 0)));
    modifiers.push({
      conditionType: rule.condition_type,
      conditionValue: rule.condition_value,
      action: rule.price_action,
      amount: Number(rule.amount || 0),
      before,
      after,
      delta: roundMoney(after - before),
    });
    return after;
  }

  async getDiscoveryStartingPrices(): Promise<DiscoveryStartingPricesResult> {
    const profile = await this.getActivePricingProfile();
    const featureFlags = await this.getFeatureFlags();
    const rules = await this.getActiveRules(profile.id);

    const [durationsResponse, consultationTypesResponse, tiersResponse] = await Promise.all([
      this.supabase
        .from('appointment_duration_options')
        .select('value_minutes')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('value_minutes', { ascending: true }),
      this.supabase
        .from('consultation_types')
        .select('name')
        .eq('active', true)
        .order('name', { ascending: true }),
      this.supabase
        .from('doctor_tiers')
        .select('id,name')
        .eq('active', true)
        .order('experience_min', { ascending: true }),
    ]);

    if (durationsResponse.error) {
      throw new Error(`Failed to load duration options: ${durationsResponse.error.message}`);
    }
    if (consultationTypesResponse.error) {
      throw new Error(`Failed to load consultation types: ${consultationTypesResponse.error.message}`);
    }
    if (tiersResponse.error) {
      throw new Error(`Failed to load doctor tiers: ${tiersResponse.error.message}`);
    }

    const durationCandidates = Array.from(
      new Set(
        (durationsResponse.data || [])
          .map((row: any) => Number(row?.value_minutes || 0))
          .filter((value: number) => Number.isInteger(value) && value > 0 && value <= 24 * 60),
      ),
    ).sort((a, b) => a - b);

    const consultationTypeCandidates = Array.from(
      new Set(
        (consultationTypesResponse.data || [])
          .map((row: any) => normalizeValue(row?.name))
          .filter((value: string) => !!value),
      ),
    );

    const tierCandidates: DiscoveryTierCandidate[] = (tiersResponse.data || [])
      .map((row: any) => ({
        id: normalizeValue(row?.id),
        name: normalizeValue(row?.name),
      }))
      .filter((tier) => !!tier.id || !!tier.name);

    const getStartingPriceForType = (doctorType: 'gp' | 'specialist') => {
      const doctorTypeAliases = doctorType === 'gp'
        ? new Set(['gp', 'general', 'general practice', 'general practitioner'])
        : new Set(['specialist']);

      const baseRule = rules.find((rule) => (
        rule.rule_type === 'base'
        && rule.condition_type === 'doctor_type'
        && doctorTypeAliases.has(normalizeValue(rule.condition_value))
      ));
      if (!baseRule) return null;

      const durationOptions: Array<number | null> = featureFlags.duration_pricing && durationCandidates.length > 0
        ? durationCandidates
        : [null];
      const tierOptions: Array<DiscoveryTierCandidate | null> = featureFlags.tier_pricing && tierCandidates.length > 0
        ? [null, ...tierCandidates]
        : [null];
      const consultationOptions = featureFlags.consultation_type_pricing && consultationTypeCandidates.length > 0
        ? consultationTypeCandidates
        : ['video'];

      const calculateCombinationPrice = (
        duration: number | null,
        tier: DiscoveryTierCandidate | null,
        consultationType: string,
      ) => {
        let current = roundMoney(Number(baseRule.amount || 0));

        if (featureFlags.duration_pricing && typeof duration === 'number') {
          const durationRule = rules.find((rule) => (
            rule.rule_type === 'modifier'
            && rule.condition_type === 'duration'
            && normalizeValue(rule.condition_value) === String(duration)
          ));
          if (durationRule) {
            current = roundMoney(applyAction(current, durationRule.price_action, Number(durationRule.amount || 0)));
          }
        }

        if (featureFlags.tier_pricing && tier) {
          const tierRule = rules.find((rule) => (
            rule.rule_type === 'modifier'
            && rule.condition_type === 'tier'
            && (
              (!!tier.id && normalizeValue(rule.condition_value) === tier.id)
              || (!!tier.name && normalizeValue(rule.condition_value) === tier.name)
            )
          ));
          if (tierRule) {
            current = roundMoney(applyAction(current, tierRule.price_action, Number(tierRule.amount || 0)));
          }
        }

        if (featureFlags.consultation_type_pricing && consultationType) {
          const consultationRule = rules.find((rule) => (
            rule.rule_type === 'modifier'
            && rule.condition_type === 'consultation_type'
            && normalizeValue(rule.condition_value) === consultationType
          ));
          if (consultationRule) {
            current = roundMoney(applyAction(current, consultationRule.price_action, Number(consultationRule.amount || 0)));
          }
        }

        return roundMoney(Math.max(current, 0));
      };

      let minPrice: number | null = null;

      for (const duration of durationOptions) {
        for (const tier of tierOptions) {
          for (const consultationType of consultationOptions) {
            const finalPrice = calculateCombinationPrice(duration, tier, consultationType);
            if (minPrice === null || finalPrice < minPrice) {
              minPrice = finalPrice;
            }
          }
        }
      }

      const variesByDuration = featureFlags.duration_pricing && durationOptions.length > 1
        ? tierOptions.some((tier) => consultationOptions.some((consultationType) => {
          let baseline: number | null = null;
          for (const duration of durationOptions) {
            const value = calculateCombinationPrice(duration, tier, consultationType);
            if (baseline === null) {
              baseline = value;
              continue;
            }
            if (value !== baseline) {
              return true;
            }
          }
          return false;
        }))
        : false;

      const variesByConsultationType = featureFlags.consultation_type_pricing && consultationOptions.length > 1
        ? durationOptions.some((duration) => tierOptions.some((tier) => {
          let baseline: number | null = null;
          for (const consultationType of consultationOptions) {
            const value = calculateCombinationPrice(duration, tier, consultationType);
            if (baseline === null) {
              baseline = value;
              continue;
            }
            if (value !== baseline) {
              return true;
            }
          }
          return false;
        }))
        : false;

      const variesByTier = featureFlags.tier_pricing && tierOptions.length > 1
        ? durationOptions.some((duration) => consultationOptions.some((consultationType) => {
          let baseline: number | null = null;
          for (const tier of tierOptions) {
            const value = calculateCombinationPrice(duration, tier, consultationType);
            if (baseline === null) {
              baseline = value;
              continue;
            }
            if (value !== baseline) {
              return true;
            }
          }
          return false;
        }))
        : false;

      return {
        minPrice,
        variation: {
          duration: variesByDuration,
          consultationType: variesByConsultationType,
          tier: variesByTier,
        },
      };
    };

    const gpResult = getStartingPriceForType('gp');
    const specialistResult = getStartingPriceForType('specialist');

    return {
      gp: gpResult?.minPrice ?? null,
      specialist: specialistResult?.minPrice ?? null,
      currency: String(profile.currency || 'NGN').trim() || 'NGN',
      pricingProfileId: profile.id,
      variation: {
        gp: gpResult?.variation ?? { duration: false, consultationType: false, tier: false },
        specialist: specialistResult?.variation ?? { duration: false, consultationType: false, tier: false },
      },
    };
  }

  async calculatePrice(input: PriceCalculationInput): Promise<PriceCalculationResult> {
    const profile = await this.getActivePricingProfile();
    const featureFlags = await this.getFeatureFlags();
    const rules = await this.getActiveRules(profile.id);

    const doctorType = normalizeValue(input.doctorType);
    const baseRule = rules.find(
      (rule) =>
        rule.rule_type === 'base' &&
        rule.condition_type === 'doctor_type' &&
        normalizeValue(rule.condition_value) === doctorType,
    );

    if (!baseRule) {
      throw new Error(
        `No active base pricing rule configured for doctor type "${input.doctorType}". Configure this in Pricing Management.`,
      );
    }

    const base = roundMoney(Number(baseRule.amount));
    let current = base;
    const modifiers: PriceModifierResult[] = [];

    if (featureFlags.duration_pricing && input.duration) {
      const durationRule = rules.find(
        (rule) =>
          rule.rule_type === 'modifier' &&
          rule.condition_type === 'duration' &&
          normalizeValue(rule.condition_value) === String(input.duration),
      );

      if (durationRule) current = this.applyRule(current, durationRule, modifiers);
    }

    if (featureFlags.tier_pricing && (input.tierId || input.tierName)) {
      const normalizedTierId = normalizeValue(input.tierId);
      const normalizedTierName = normalizeValue(input.tierName);
      const tierRule = rules.find(
        (rule) =>
          rule.rule_type === 'modifier' &&
          rule.condition_type === 'tier' &&
          (
            (!!normalizedTierId && normalizeValue(rule.condition_value) === normalizedTierId) ||
            (!!normalizedTierName && normalizeValue(rule.condition_value) === normalizedTierName)
          ),
      );

      if (tierRule) current = this.applyRule(current, tierRule, modifiers);
    }

    if (featureFlags.consultation_type_pricing && input.consultationType) {
      const typeName = normalizeValue(input.consultationType);
      const { error } = await this.supabase
        .from('consultation_types')
        .select('id')
        .eq('name', typeName)
        .eq('active', true)
        .maybeSingle();

      if (error) throw new Error(`Failed to load consultation type pricing: ${error.message}`);

      const consultationRule = rules.find(
        (rule) =>
          rule.rule_type === 'modifier' &&
          rule.condition_type === 'consultation_type' &&
          normalizeValue(rule.condition_value) === typeName,
      );

      if (consultationRule) current = this.applyRule(current, consultationRule, modifiers);
    }

    return {
      base,
      modifiers,
      finalPrice: roundMoney(Math.max(current, 0)),
      pricingProfileId: profile.id,
      featureFlags,
    };
  }
}
