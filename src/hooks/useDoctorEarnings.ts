import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeAppointmentStatus } from '@/services/marketplaceTypes';

const CONSULTATION_FEE = 5000; // ₦5,000 per consultation

export const useDoctorEarnings = (doctorId: string | undefined) => {
  return useQuery({
    queryKey: ['doctor-earnings', doctorId],
    queryFn: async () => {
      if (!doctorId) return null;

      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('date, created_at, status, doctor_earning')
        .eq('doctor_id', doctorId)
        .order('date', { ascending: true });

      if (error) throw error;
      const completedAppointments = (appointments || []).filter(
        (apt) => normalizeAppointmentStatus(apt.status) === 'completed',
      );
      const resolveEarning = (apt: { doctor_earning?: number | null }) =>
        Number.isFinite(Number(apt.doctor_earning)) && Number(apt.doctor_earning) > 0
          ? Number(apt.doctor_earning)
          : CONSULTATION_FEE;

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Calculate this month's earnings
      const thisMonthAppointments = completedAppointments.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate.getMonth() === currentMonth && aptDate.getFullYear() === currentYear;
      });

      // Calculate last month's earnings for growth
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const lastMonthAppointments = completedAppointments.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate.getMonth() === lastMonth && aptDate.getFullYear() === lastMonthYear;
      });

      const thisMonthEarnings = thisMonthAppointments.reduce((sum, apt) => sum + resolveEarning(apt), 0);
      const lastMonthEarnings = lastMonthAppointments.reduce((sum, apt) => sum + resolveEarning(apt), 0);
      const growth = lastMonthEarnings > 0 
        ? ((thisMonthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100 
        : 0;

      // Calculate monthly earnings for the last 6 months
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const targetMonth = currentMonth - i;
        const targetYear = targetMonth < 0 ? currentYear - 1 : currentYear;
        const adjustedMonth = targetMonth < 0 ? 12 + targetMonth : targetMonth;

        const monthAppointments = completedAppointments.filter(apt => {
          const aptDate = new Date(apt.date);
          return aptDate.getMonth() === adjustedMonth && aptDate.getFullYear() === targetYear;
        });

        const monthName = new Date(targetYear, adjustedMonth, 1).toLocaleDateString('en-US', { month: 'short' });
        monthlyData.push({
          month: monthName,
          earnings: monthAppointments.reduce((sum, apt) => sum + resolveEarning(apt), 0),
          consultations: monthAppointments.length,
        });
      }

      return {
        thisMonthEarnings,
        thisMonthConsultations: thisMonthAppointments.length,
        growth: Math.round(growth),
        monthlyData,
        totalEarnings: completedAppointments.reduce((sum, apt) => sum + resolveEarning(apt), 0),
      };
    },
    enabled: !!doctorId,
  });
};
