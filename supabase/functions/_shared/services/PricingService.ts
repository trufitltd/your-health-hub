import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  FeatureFlagName,
  PriceCalculationInput,
  PriceCalculationResult,
  PriceModifierResult,
} from '../marketplace-types.ts';
import { roundMoney } from '../marketplace-types.ts';

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

const DEFAULT_FLAGS: Record<FeatureFlagName, boolean> = {
  duration_pricing: true,
  tier_pricing: true,
  consultation_type_pricing: false,
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
      return { ...DEFAULT_FLAGS };
    }

    const result = { ...DEFAULT_FLAGS };
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

    const base = roundMoney(Number(baseRule?.amount ?? input.baseFallback ?? 0));
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
      const { data: consultationType, error } = await this.supabase
        .from('consultation_types')
        .select('*')
        .eq('name', typeName)
        .eq('active', true)
        .maybeSingle();

      if (error) throw new Error(`Failed to load consultation type pricing: ${error.message}`);

      if (consultationType && consultationType.flat_rate !== null && consultationType.flat_rate !== undefined) {
        const before = current;
        const after = roundMoney(Number(consultationType.flat_rate));
        modifiers.push({
          conditionType: 'consultation_type_flat_rate',
          conditionValue: consultationType.name,
          action: 'set',
          amount: Number(consultationType.flat_rate),
          before,
          after,
          delta: roundMoney(after - before),
        });
        current = after;
      } else {
        const consultationRule = rules.find(
          (rule) =>
            rule.rule_type === 'modifier' &&
            rule.condition_type === 'consultation_type' &&
            normalizeValue(rule.condition_value) === typeName,
        );

        if (consultationRule) current = this.applyRule(current, consultationRule, modifiers);
      }
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
