import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLocaleFormatter } from '@/lib/locale';

const CONSULTATION_FEE = 5000; // ₦5,000 per consultation

export const useDoctorEarnings = (doctorId: string | undefined) => {
  const { locale } = useLocaleFormatter();

  return useQuery({
    queryKey: ['doctor-earnings', doctorId, locale],
    queryFn: async () => {
      if (!doctorId) return null;

      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('date, created_at')
        .eq('doctor_id', doctorId)
        .eq('status', 'completed');

      if (error) throw error;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Calculate this month's earnings
      const thisMonthAppointments = appointments?.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate.getMonth() === currentMonth && aptDate.getFullYear() === currentYear;
      }) || [];

      // Calculate last month's earnings for growth
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const lastMonthAppointments = appointments?.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate.getMonth() === lastMonth && aptDate.getFullYear() === lastMonthYear;
      }) || [];

      const thisMonthEarnings = thisMonthAppointments.length * CONSULTATION_FEE;
      const lastMonthEarnings = lastMonthAppointments.length * CONSULTATION_FEE;
      const growth = lastMonthEarnings > 0 
        ? ((thisMonthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100 
        : 0;

      // Calculate monthly earnings for the last 6 months
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const targetMonth = currentMonth - i;
        const targetYear = targetMonth < 0 ? currentYear - 1 : currentYear;
        const adjustedMonth = targetMonth < 0 ? 12 + targetMonth : targetMonth;

        const monthAppointments = appointments?.filter(apt => {
          const aptDate = new Date(apt.date);
          return aptDate.getMonth() === adjustedMonth && aptDate.getFullYear() === targetYear;
        }) || [];

        const monthName = new Intl.DateTimeFormat(locale, { month: 'short' }).format(
          new Date(targetYear, adjustedMonth, 1)
        );
        monthlyData.push({
          month: monthName,
          earnings: monthAppointments.length * CONSULTATION_FEE,
          consultations: monthAppointments.length,
        });
      }

      return {
        thisMonthEarnings,
        thisMonthConsultations: thisMonthAppointments.length,
        growth: Math.round(growth),
        monthlyData,
        totalEarnings: (appointments?.length || 0) * CONSULTATION_FEE,
      };
    },
    enabled: !!doctorId,
  });
};
