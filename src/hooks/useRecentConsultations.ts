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

      console.log('[Recent Consultations] Fetching for user:', user.id);

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          date,
          specialist_name,
          rating,
          notes,
          status,
          doctor_id
        `)
        .eq('patient_id', user.id)
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(10);

      console.log('[Recent Consultations] Query result:', { data, error });

      if (error) {
        console.error('[Recent Consultations] Error:', error);
        throw error;
      }

      // Fetch doctor specialties
      const doctorIds = [...new Set(data.map((apt: any) => apt.doctor_id).filter(Boolean))];
      const doctorSpecialties: Record<string, string> = {};
      
      if (doctorIds.length > 0) {
        const { data: doctorData } = await supabase
          .from('doctor_registrations')
          .select('user_id, specialty')
          .in('user_id', doctorIds);
        
        if (doctorData) {
          doctorData.forEach((doc: any) => {
            doctorSpecialties[doc.user_id] = doc.specialty;
          });
        }
      }

      const result = data.map((appointment: any) => ({
        id: appointment.id,
        doctor_name: appointment.specialist_name,
        specialty: doctorSpecialties[appointment.doctor_id] || 'General Medicine',
        date: appointment.date,
        diagnosis: appointment.notes || 'Consultation completed',
        prescription: false,
        rating: appointment.rating || null,
      }));

      console.log('[Recent Consultations] Mapped result:', result);
      return result;
    },
    enabled: !!user?.id,
  });
}