import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface PromotionEligibility {
  eligible: boolean;
  reason?: string;
  promotionType?: string;
}

export class PromotionService {
  private readonly DEFAULT_PROMOTION_LIMIT = 126;
  private readonly PROMOTION_TYPE = 'FIRST_126_FREE';

  constructor(private readonly supabase: SupabaseClient) {}

  private async getPromotionLimit(): Promise<number> {
    const { data, error } = await this.supabase
      .from('platform_settings')
      .select('promotion_first_n_free_limit')
      .maybeSingle();

    if (error || !data) {
      console.warn('[PromotionService] Failed to load promotion limit, using default:', error?.message);
      return this.DEFAULT_PROMOTION_LIMIT;
    }

    return data.promotion_first_n_free_limit;
  }

  async checkEligibility(patientId: string, doctorId: string): Promise<PromotionEligibility> {
    const promotionLimit = await this.getPromotionLimit();

    // 1. Check total promotion limit
    const { count: totalCount, error: totalError } = await this.supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('is_promotion', true)
      .eq('promotion_type', this.PROMOTION_TYPE)
      .neq('status', 'cancelled');

    if (totalError) throw totalError;
    if ((totalCount || 0) >= promotionLimit) {
      return { eligible: false, reason: 'Promotion limit reached' };
    }

    // 2. Check if patient already had a free consultation
    const { count: patientCount, error: patientError } = await this.supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('is_promotion', true)
      .eq('promotion_type', this.PROMOTION_TYPE)
      .neq('status', 'cancelled');

    if (patientError) throw patientError;
    if ((patientCount || 0) > 0) {
      return { eligible: false, reason: 'Patient already used free consultation' };
    }

    // 3. Check if doctor was already booked for a free consultation
    const { count: doctorCount, error: doctorError } = await this.supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('is_promotion', true)
      .eq('promotion_type', this.PROMOTION_TYPE)
      .neq('status', 'cancelled');

    if (doctorError) throw doctorError;
    if ((doctorCount || 0) > 0) {
      return { eligible: false, reason: 'Doctor already booked for free consultation' };
    }

    return { eligible: true, promotionType: this.PROMOTION_TYPE };
  }

  getPromotionType(): string {
    return this.PROMOTION_TYPE;
  }
}
