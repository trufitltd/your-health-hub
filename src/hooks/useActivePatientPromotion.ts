import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_PROMOTION_LIMIT = 126;
const PROMOTION_TYPE = 'FIRST_126_FREE';

export type ActivePatientPromotion = {
  used: number;
  limit: number;
  remaining: number;
  isActive: boolean;
};

export const useActivePatientPromotion = () => {
  return useQuery({
    queryKey: ['active-patient-promotion'],
    queryFn: async (): Promise<ActivePatientPromotion> => {
      const [{ data: settings }, { count }] = await Promise.all([
        supabase
          .from('platform_settings')
          .select('promotion_first_n_free_limit')
          .maybeSingle(),
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('is_promotion', true)
          .eq('promotion_type', PROMOTION_TYPE)
          .neq('status', 'cancelled'),
      ]);

      const limit = Number(settings?.promotion_first_n_free_limit || DEFAULT_PROMOTION_LIMIT);
      const used = Number(count || 0);
      const remaining = Math.max(limit - used, 0);

      return {
        used,
        limit,
        remaining,
        isActive: remaining > 0,
      };
    },
    refetchInterval: 30000,
  });
};
