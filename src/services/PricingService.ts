import { supabase } from '@/integrations/supabase/client';
import type {
  PricingProfile,
  PricingRule,
  PricingFeatureFlag,
  ConsultationType,
  DoctorTier,
  PlatformFeeRule,
  FeatureFlagName,
  PricingRuleType,
  PricingConditionType,
  PricingAction,
} from './marketplaceTypes';

export const PricingService = {
  async listProfiles(): Promise<PricingProfile[]> {
    const { data, error } = await supabase
      .from('pricing_profiles')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as PricingProfile[];
  },

  async createProfile(input: Pick<PricingProfile, 'name' | 'country_code' | 'currency'>) {
    const { data, error } = await supabase
      .from('pricing_profiles')
      .insert({ ...input, active: true, is_default: false })
      .select('*')
      .single();
    if (error) throw error;
    return data as PricingProfile;
  },

  async updateProfile(
    profileId: string,
    input: Partial<Pick<PricingProfile, 'name' | 'country_code' | 'currency'>>,
  ) {
    const { data, error } = await supabase
      .from('pricing_profiles')
      .update(input)
      .eq('id', profileId)
      .select('*')
      .single();
    if (error) throw error;
    return data as PricingProfile;
  },

  async deleteProfile(profileId: string) {
    const { error: deleteRulesError } = await supabase
      .from('pricing_rules')
      .delete()
      .eq('pricing_profile_id', profileId);
    if (deleteRulesError) throw deleteRulesError;

    const { error } = await supabase
      .from('pricing_profiles')
      .delete()
      .eq('id', profileId);
    if (error) throw error;
  },

  async setActiveProfile(profileId: string) {
    const { error: disableError } = await supabase
      .from('pricing_profiles')
      .update({ active: false })
      .eq('active', true);
    if (disableError) throw disableError;

    const { data, error } = await supabase
      .from('pricing_profiles')
      .update({ active: true, is_default: true })
      .eq('id', profileId)
      .select('*')
      .single();

    if (error) throw error;
    return data as PricingProfile;
  },

  async listRules(pricingProfileId: string): Promise<PricingRule[]> {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('pricing_profile_id', pricingProfileId)
      .order('priority', { ascending: true });
    if (error) throw error;
    return (data || []) as PricingRule[];
  },

  async upsertRule(input: {
    id?: string;
    pricing_profile_id: string;
    rule_type: PricingRuleType;
    condition_type: PricingConditionType;
    condition_value: string;
    price_action: PricingAction;
    amount: number;
    priority: number;
    active: boolean;
  }) {
    if (input.id) {
      const { id, ...updatePayload } = input;
      const { data, error } = await supabase
        .from('pricing_rules')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as PricingRule;
    }

    const { data, error } = await supabase
      .from('pricing_rules')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data as PricingRule;
  },

  async deleteRule(ruleId: string) {
    const { error } = await supabase.from('pricing_rules').delete().eq('id', ruleId);
    if (error) throw error;
  },

  async listFeatureFlags(): Promise<PricingFeatureFlag[]> {
    const { data, error } = await supabase
      .from('pricing_feature_flags')
      .select('*')
      .order('feature_name', { ascending: true });
    if (error) throw error;
    return (data || []) as PricingFeatureFlag[];
  },

  async setFeatureFlag(featureName: FeatureFlagName, enabled: boolean) {
    const { data, error } = await supabase
      .from('pricing_feature_flags')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('feature_name', featureName)
      .select('*')
      .single();

    if (error) throw error;
    return data as PricingFeatureFlag;
  },

  async listConsultationTypes(): Promise<ConsultationType[]> {
    const { data, error } = await supabase
      .from('consultation_types')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as ConsultationType[];
  },

  async upsertConsultationType(input: Partial<ConsultationType> & { name: ConsultationType['name'] }) {
    if (input.id) {
      const { id, ...payload } = input;
      const { data, error } = await supabase
        .from('consultation_types')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as ConsultationType;
    }

    const { data, error } = await supabase
      .from('consultation_types')
      .insert({
        name: input.name,
        active: input.active ?? true,
        flat_rate: input.flat_rate ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as ConsultationType;
  },

  async listDoctorTiers(): Promise<DoctorTier[]> {
    const { data, error } = await supabase
      .from('doctor_tiers')
      .select('*')
      .order('experience_min', { ascending: true });
    if (error) throw error;
    return (data || []) as DoctorTier[];
  },

  async upsertDoctorTier(input: Partial<DoctorTier> & Pick<DoctorTier, 'name' | 'experience_min'>) {
    if (input.id) {
      const { id, ...payload } = input;
      const { data, error } = await supabase
        .from('doctor_tiers')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as DoctorTier;
    }

    const { data, error } = await supabase
      .from('doctor_tiers')
      .insert({
        name: input.name,
        experience_min: input.experience_min,
        experience_max: input.experience_max ?? null,
        active: input.active ?? true,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as DoctorTier;
  },

  async listPlatformFeeRules(): Promise<PlatformFeeRule[]> {
    const { data, error } = await supabase
      .from('platform_fee_rules')
      .select('*')
      .order('doctor_type', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as PlatformFeeRule[];
  },

  async upsertPlatformFeeRule(input: Partial<PlatformFeeRule> & Pick<PlatformFeeRule, 'doctor_type' | 'fee_type' | 'value'>) {
    if (input.id) {
      const { id, ...payload } = input;
      const { data, error } = await supabase
        .from('platform_fee_rules')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as PlatformFeeRule;
    }

    const { data, error } = await supabase
      .from('platform_fee_rules')
      .insert({
        doctor_type: input.doctor_type,
        fee_type: input.fee_type,
        value: input.value,
        active: input.active ?? true,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as PlatformFeeRule;
  },
};
