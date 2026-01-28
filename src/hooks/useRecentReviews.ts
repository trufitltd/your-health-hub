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
        .select('id, patient_name, rating, review_comment, date')
        .eq('doctor_id', doctorId)
        .eq('status', 'completed')
        .not('rating', 'is', null)
        .not('review_comment', 'is', null)
        .order('date', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map(apt => ({
        id: apt.id,
        patient: apt.patient_name?.split(' ').map((n, i) => i === 0 ? n : n[0] + '.').join(' ') || 'Anonymous',
        rating: apt.rating,
        comment: apt.review_comment,
        date: apt.date
      }));
    },
    enabled: !!doctorId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};