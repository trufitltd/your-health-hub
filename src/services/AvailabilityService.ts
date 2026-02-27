import { supabase } from '@/integrations/supabase/client';
import type { FeatureFlagName, PricePreviewRequest, PricePreviewResponse } from './marketplaceTypes';

type FeatureFlagRow = {
  feature_name: FeatureFlagName;
  enabled: boolean;
};

export const AvailabilityService = {
  async getFeatureFlags(): Promise<Record<FeatureFlagName, boolean>> {
    const { data, error } = await supabase
      .from('pricing_feature_flags')
      .select('feature_name, enabled');

    if (error) throw error;

    const defaults: Record<FeatureFlagName, boolean> = {
      duration_pricing: true,
      tier_pricing: true,
      consultation_type_pricing: false,
    };

    (data || []).forEach((row) => {
      const typedRow = row as FeatureFlagRow;
      defaults[typedRow.feature_name] = !!typedRow.enabled;
    });

    return defaults;
  },

  async getActiveConsultationTypes() {
    const { data, error } = await supabase
      .from('consultation_types')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async calculatePricePreview(input: PricePreviewRequest): Promise<number> {
    const { data, error } = await supabase.functions.invoke('pricing-preview', {
      body: input,
    });

    if (error) throw error;

    const result = data as PricePreviewResponse | null;
    if (!result || typeof result.finalPrice !== 'number') {
      throw new Error('Invalid pricing preview response');
    }

    return result.finalPrice;
  },
};
