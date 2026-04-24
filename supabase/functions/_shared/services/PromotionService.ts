import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface PromotionEligibility {
  eligible: boolean;
  reason?: string;
  promotionType?: string;
}

export class PromotionService {
  private readonly PROMOTION_TYPE = 'FIRST_126_FREE';

  constructor(private readonly supabase: SupabaseClient) {}

  private async getPromotionEndAt(): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('platform_settings')
      .select('promotion_ends_at')
      .maybeSingle();

    if (error || !data) {
      console.warn('[PromotionService] Failed to load promotion end date:', error?.message);
      return null;
    }

    return data.promotion_ends_at;
  }

  async checkEligibility(patientId: string, doctorId: string): Promise<PromotionEligibility> {
    try {
      console.log('[PromotionService] Checking eligibility...', { patientId, doctorId });
      const promotionEndsAt = await this.getPromotionEndAt();
      if (!promotionEndsAt) {
        return { eligible: false, reason: 'Promotion is not active' };
      }
      const promotionEndsAtMs = new Date(promotionEndsAt).getTime();
      if (!Number.isFinite(promotionEndsAtMs) || Date.now() >= promotionEndsAtMs) {
        return { eligible: false, reason: 'Promotion has ended' };
      }

      // Check if patient already had a free consultation
      const { count: patientCount, error: patientError } = await this.supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', patientId)
        .eq('is_promotion', true)
        .eq('promotion_type', this.PROMOTION_TYPE)
        .neq('status', 'cancelled');

      if (patientError) {
        console.error('[PromotionService] Patient check query failed:', patientError);
        return { eligible: false, reason: `Database error (patient): ${patientError.message}` };
      }
      console.log('[PromotionService] Patient used before:', patientCount);
      if ((patientCount || 0) > 0) {
        return { eligible: false, reason: 'Patient already used free consultation' };
      }

      // Check if doctor was already booked for a free consultation
      const { count: doctorCount, error: doctorError } = await this.supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .eq('is_promotion', true)
        .eq('promotion_type', this.PROMOTION_TYPE)
        .neq('status', 'cancelled');

      if (doctorError) {
        console.error('[PromotionService] Doctor check query failed:', doctorError);
        return { eligible: false, reason: `Database error (doctor): ${doctorError.message}` };
      }
      console.log('[PromotionService] Doctor used before:', doctorCount);
      if ((doctorCount || 0) > 0) {
        return { eligible: false, reason: 'Doctor already booked for free consultation' };
      }

      console.log('[PromotionService] Eligible for promotion');
      return { eligible: true, promotionType: this.PROMOTION_TYPE };
    } catch (err) {
      console.error('[PromotionService] Unexpected eligibility check error:', err);
      return { eligible: false, reason: 'Internal error checking eligibility' };
    }
  }

  getPromotionType(): string {
    return this.PROMOTION_TYPE;
  }
}
