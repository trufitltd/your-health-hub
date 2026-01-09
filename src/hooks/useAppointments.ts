import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  specialist_name: string;
  date: string;
  time: string;
  type: 'Video' | 'Audio';
  notes: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
}

/**
 * Fetches appointments for the current authenticated patient
 */
export const useAppointments = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading, error } = useQuery<Appointment[]>({
    queryKey: ['appointments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', user.id)
        .order('date', { ascending: true });

      if (error) throw error;
      return data as Appointment[];
    },
    enabled: !!user?.id,
  });

  const invalidateAppointments = () => {
    queryClient.invalidateQueries({ queryKey: ['appointments', user?.id] });
  };

  return {
    appointments,
    isLoading,
    error,
    invalidateAppointments,
  };
};
