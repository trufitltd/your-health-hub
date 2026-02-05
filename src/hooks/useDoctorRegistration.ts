import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export const useDoctorRegistration = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['doctor-registration', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('doctor_registrations')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error('Error fetching doctor registration:', error);
        return null;
      }
      
      return data;
    },
    enabled: !!user?.id,
  });
};