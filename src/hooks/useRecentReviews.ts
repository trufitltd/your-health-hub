import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Review {
  id: string;
  patient: string;
  rating: number;
  comment: string;
  date: string;
}

export const useRecentReviews = (doctorId?: string, limit: number = 3) => {
  return useQuery({
    queryKey: ['recent-reviews', doctorId, limit],
    queryFn: async (): Promise<Review[]> => {
      if (!doctorId) return [];

      const { data, error } = await supabase
        .from('appointments')
        .select('id, patient_id, patient_name, rating, review_comment, date')
        .eq('doctor_id', doctorId)
        .eq('status', 'completed')
        .not('rating', 'is', null)
        .not('review_comment', 'is', null)
        .order('date', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const patientIds = Array.from(
        new Set((data || []).map((apt) => apt.patient_id).filter(Boolean)),
      ) as string[];

      const patientNameMap = new Map<string, string>();
      if (patientIds.length > 0) {
        const { data: patientRows } = await supabase
          .from('patient_registrations')
          .select('user_id, full_name')
          .in('user_id', patientIds);

        (patientRows || []).forEach((row) => {
          if (row.user_id && row.full_name) {
            patientNameMap.set(row.user_id as string, row.full_name as string);
          }
        });
      }

      return (data || []).map(apt => ({
        id: apt.id,
        patient: (
          patientNameMap.get(apt.patient_id as string) ||
          apt.patient_name ||
          'Patient'
        ).split(' ').map((n, i) => i === 0 ? n : n[0] + '.').join(' '),
        rating: apt.rating,
        comment: apt.review_comment,
        date: apt.date
      }));
    },
    enabled: !!doctorId,
    refetchInterval: 10000,
  });
};
