import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RevenueShareRates {
  gpDoctorPct: number;
  gpPlatformPct: number;
  specialistDoctorPct: number;
  specialistPlatformPct: number;
}

const FALLBACK: RevenueShareRates = {
  gpDoctorPct: 60,
  gpPlatformPct: 40,
  specialistDoctorPct: 70,
  specialistPlatformPct: 30,
};

export function usePlatformFeeRules() {
  return useQuery<RevenueShareRates>({
    queryKey: ['platform-fee-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_fee_rules')
        .select('doctor_type, fee_type, value')
        .eq('active', true)
        .eq('fee_type', 'percentage');

      if (error || !data?.length) return FALLBACK;

      const gp = data.find((r) => r.doctor_type === 'GP');
      const specialist = data.find((r) => r.doctor_type === 'Specialist');

      const gpPlatformPct = gp ? Number(gp.value) : FALLBACK.gpPlatformPct;
      const specialistPlatformPct = specialist ? Number(specialist.value) : FALLBACK.specialistPlatformPct;

      return {
        gpPlatformPct,
        gpDoctorPct: 100 - gpPlatformPct,
        specialistPlatformPct,
        specialistDoctorPct: 100 - specialistPlatformPct,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
