import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface RecentConsultation {
  id: string;
  doctor_name: string;
  specialty: string;
  date: string;
  diagnosis: string;
  prescription: boolean;
  rating: number | null;
}

export function useRecentConsultations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['recent-consultations', user?.id],
    queryFn: async (): Promise<RecentConsultation[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('consultation_sessions')
        .select(`
          id,
          started_at,
          notes,
          appointments!inner(
            id,
            specialist_name,
            rating,
            doctors(name)
          )
        `)
        .eq('patient_id', user.id)
        .eq('status', 'ended')
        .order('started_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      return data.map((session: any) => ({
        id: session.id,
        doctor_name: session.appointments.doctors?.name || session.appointments.specialist_name,
        specialty: 'General Medicine', // Default specialty
        date: session.started_at,
        diagnosis: session.notes || 'Consultation completed',
        prescription: false, // Could be enhanced to check for prescriptions
        rating: session.appointments.rating || null,
      }));
    },
    enabled: !!user?.id,
  });
}