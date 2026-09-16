import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrganisationService {
  id: string;
  name: string;
  description: string;
  default_duration_minutes: number;
  consultation_mode: string;
  base_price: number;
  currency: string;
  required_specialties: string[];
  sort_order: number;
}

export function useOrganisationServices(organisationId?: string | null) {
  return useQuery({
    queryKey: ['organisation-services', organisationId],
    queryFn: async (): Promise<OrganisationService[]> => {
      if (!organisationId) return [];

      const { data, error } = await supabase
        .from('organisation_services')
        .select('id, name, description, default_duration_minutes, consultation_mode, base_price, currency, required_specialties, sort_order')
        .eq('organisation_id', organisationId)
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error || !data) return [];

      return data.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        default_duration_minutes: row.default_duration_minutes || 30,
        consultation_mode: row.consultation_mode || 'video',
        base_price: Number(row.base_price || 0),
        currency: row.currency || 'NGN',
        required_specialties: Array.isArray(row.required_specialties) ? row.required_specialties : [],
        sort_order: row.sort_order || 0,
      }));
    },
    enabled: !!organisationId,
    staleTime: 5 * 60 * 1000,
  });
}
