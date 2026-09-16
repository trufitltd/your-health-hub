import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgBookingConfig {
  clinicianSelectionMode: 'patient_select' | 'internal_assign';
  showDoctorDirectory: boolean;
  showRatings: boolean;
  showReviews: boolean;
  enableServiceTypes: boolean;
}

const DEFAULT_CONFIG: OrgBookingConfig = {
  clinicianSelectionMode: 'patient_select',
  showDoctorDirectory: true,
  showRatings: true,
  showReviews: true,
  enableServiceTypes: false,
};

export function useOrgBookingConfig(organisationId?: string | null) {
  return useQuery({
    queryKey: ['org-booking-config', organisationId],
    queryFn: async (): Promise<OrgBookingConfig> => {
      if (!organisationId) return DEFAULT_CONFIG;

      const { data, error } = await supabase
        .from('organisation_config')
        .select('config_key, config_value')
        .eq('organisation_id', organisationId)
        .in('config_key', [
          'clinician_selection_mode',
          'show_doctor_directory',
          'show_ratings',
          'show_reviews',
          'enable_service_types',
        ]);

      if (error || !data) return DEFAULT_CONFIG;

      const configMap: Record<string, string> = {};
      data.forEach((row) => { configMap[row.config_key] = row.config_value; });

      return {
        clinicianSelectionMode: (configMap.clinician_selection_mode as 'patient_select' | 'internal_assign') || 'patient_select',
        showDoctorDirectory: configMap.show_doctor_directory !== 'false',
        showRatings: configMap.show_ratings !== 'false',
        showReviews: configMap.show_reviews !== 'false',
        enableServiceTypes: configMap.enable_service_types === 'true',
      };
    },
    enabled: !!organisationId,
    staleTime: 5 * 60 * 1000,
  });
}
