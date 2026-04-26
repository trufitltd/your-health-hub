import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useEffect } from 'react';
import { normalizeAppointmentStatus, normalizeRescheduleRequestStatus } from '@/services/marketplaceTypes';
import { normalizeTimeHHMM } from '@/lib/appointmentIntervals';

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  specialist_name: string;
  date: string;
  time: string;
  type: 'Video' | 'Audio';
  notes: string;
  status: 'pending_payment' | 'pending_approval' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  created_at: string;
  duration_minutes?: number | null;
  final_price?: number | null;
  price_breakdown?: Record<string, unknown> | null;
  reschedule_request_status?: 'none' | 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired' | null;
  reschedule_requested_by?: 'patient' | 'doctor' | null;
  reschedule_requested_at?: string | null;
  reschedule_decision_at?: string | null;
  reschedule_proposed_date?: string | null;
  reschedule_proposed_time?: string | null;
  reschedule_proposed_duration_minutes?: number | null;
  reschedule_proposed_consultation_type?: 'chat' | 'voice' | 'video' | null;
  reschedule_proposed_final_price?: number | null;
  reschedule_upgrade_amount?: number | null;
  reschedule_request_note?: string | null;
  reschedule_response_note?: string | null;
  needs_follow_up?: boolean;
  follow_up_marked_at?: string | null;
  follow_up_deadline_at?: string | null;
  follow_up_completed_at?: string | null;
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

      // Keep follow-up lifecycle consistent before loading appointments.
      await supabase.rpc('complete_overdue_follow_up_appointments');

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', user.id)
        .order('date', { ascending: true });

      if (error) throw error;
      
      // Fetch doctor profile pictures
      const doctorIds = (data || []).map(apt => apt.doctor_id).filter(Boolean);
      const toEffectiveAppointment = (apt: any) => {
        const normalizedRescheduleStatus = normalizeRescheduleRequestStatus(apt.reschedule_request_status);
        const approvedDate = normalizedRescheduleStatus === 'approved'
          ? String(apt.reschedule_proposed_date || '').trim()
          : '';
        const approvedTimeRaw = normalizedRescheduleStatus === 'approved'
          ? String(apt.reschedule_proposed_time || '').trim()
          : '';
        const approvedTime = normalizeTimeHHMM(approvedTimeRaw);
        const baseTime = normalizeTimeHHMM(String(apt.time || '').trim());

        return {
          ...apt,
          date: approvedDate || apt.date,
          time: approvedTime || baseTime || apt.time,
          status: normalizeAppointmentStatus(apt.status),
          reschedule_request_status: normalizedRescheduleStatus,
        };
      };

      if (doctorIds.length === 0) {
        return (data || []).map((apt: any) => toEffectiveAppointment(apt)) as Appointment[];
      }
      
      const { data: doctorData } = await supabase
        .from('doctor_registrations')
        .select('user_id, profile_picture_url')
        .in('user_id', doctorIds);
      
      const doctorPictureMap = new Map(doctorData?.map(d => [d.user_id, d.profile_picture_url]) || []);
      
      return (data || []).map((apt: any) => ({
        ...toEffectiveAppointment(apt),
        doctor_profile_picture: doctorPictureMap.get(apt.doctor_id) || null
      })) as Appointment[];
    },
    enabled: !!user?.id,
  });

  const invalidateAppointments = () => {
    queryClient.invalidateQueries({ queryKey: ['appointments', user?.id], refetchType: 'all' });
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
