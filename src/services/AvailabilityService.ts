import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_PRICING_FEATURE_FLAGS } from '@/config/marketplaceDefaults';
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

    const defaults: Record<FeatureFlagName, boolean> = { ...DEFAULT_PRICING_FEATURE_FLAGS };

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

  async getAllowedDurations(): Promise<number[]> {
    const { data, error } = await supabase
      .from('appointment_duration_options')
      .select('value_minutes')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('value_minutes', { ascending: true });

    if (error) throw error;

    const durations = Array.from(
      new Set(
        (data || [])
          .map((row) => Number((row as { value_minutes?: number }).value_minutes || 0))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    ).sort((a, b) => a - b);

    if (durations.length === 0) {
      throw new Error('No active duration options configured');
    }

    return durations;
  },

  async calculatePricePreview(input: PricePreviewRequest): Promise<PricePreviewResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[AvailabilityService] Calling pricing-preview using native fetch');
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pricing-preview`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ ...input, patientId: session?.user?.id }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[AvailabilityService] Pricing preview error:', errorData);
      throw new Error(errorData.message || 'Failed to fetch pricing preview');
    }

    const result = await response.json() as PricePreviewResponse | null;
    if (!result || typeof result.finalPrice !== 'number') {
      throw new Error('Invalid pricing preview response');
    }

    return result;
  },};
