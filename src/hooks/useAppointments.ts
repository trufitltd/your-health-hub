import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useEffect } from 'react';

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
      
      // Fetch doctor profile pictures
      const doctorIds = (data || []).map(apt => apt.doctor_id).filter(Boolean);
      if (doctorIds.length === 0) return data as Appointment[];
      
      const { data: doctorData } = await supabase
        .from('doctor_registrations')
        .select('user_id, profile_picture_url')
        .in('user_id', doctorIds);
      
      const doctorPictureMap = new Map(doctorData?.map(d => [d.user_id, d.profile_picture_url]) || []);
      
      return (data || []).map(apt => ({
        ...apt,
        doctor_profile_picture: doctorPictureMap.get(apt.doctor_id) || null
      })) as Appointment[];
    },
    enabled: !!user?.id,
  });

  const invalidateAppointments = () => {
    queryClient.invalidateQueries({ queryKey: ['appointments', user?.id] });
  };

  // Real-time subscription for appointments
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `patient_id=eq.${user.id}`
        },
        () => {
          invalidateAppointments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    appointments,
    isLoading,
    error,
    invalidateAppointments,
  };
};
