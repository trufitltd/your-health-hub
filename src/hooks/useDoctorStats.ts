import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DoctorStats {
  totalPatients: number;
  consultationsThisMonth: number;
  rating: number;
}

export const useDoctorStats = (doctorId?: string) => {
  return useQuery({
    queryKey: ['doctor-stats', doctorId],
    queryFn: async (): Promise<DoctorStats> => {
      if (!doctorId) {
        return { totalPatients: 0, consultationsThisMonth: 0, rating: 0 };
      }

      // Get total unique patients
      const { data: patientsData, error: patientsError } = await supabase
        .from('appointments')
        .select('patient_id')
        .eq('doctor_id', doctorId)
        .eq('status', 'completed');

      if (patientsError) throw patientsError;

      const uniquePatients = new Set(patientsData?.map(apt => apt.patient_id) || []);
      const totalPatients = uniquePatients.size;

      // Get consultations this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: monthlyData, error: monthlyError } = await supabase
        .from('appointments')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('status', 'completed')
        .gte('date', startOfMonth.toISOString().split('T')[0]);

      if (monthlyError) throw monthlyError;

      const consultationsThisMonth = monthlyData?.length || 0;

      // Calculate average rating from completed appointments with ratings
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('appointments')
        .select('rating')
        .eq('doctor_id', doctorId)
        .eq('status', 'completed')
        .not('rating', 'is', null);

      if (ratingsError) throw ratingsError;

      const ratings = ratingsData?.map(apt => apt.rating).filter(r => r !== null) || [];
      const rating = ratings.length > 0 
        ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
        : 0;

      return {
        totalPatients,
        consultationsThisMonth,
        rating
      };
    },
    enabled: !!doctorId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};