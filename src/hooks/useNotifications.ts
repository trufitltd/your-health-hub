import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Notification {
  id: string;
  message: string;
  time: string;
  read: boolean;
  type: 'appointment' | 'message' | 'prescription';
}

type UpcomingAppointmentRow = {
  id: string;
  date: string;
  time: string;
  status: string;
  doctor_id: string | null;
};

type DoctorNameRow = {
  user_id: string;
  full_name: string | null;
};

type RecentMessageRow = {
  id: string;
  content: string | null;
  created_at: string;
  sender_name: string | null;
};

type ConsultationSessionRow = {
  id: string;
};

export function useNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async (): Promise<Notification[]> => {
      if (!user?.id) return [];

      const notifications: Notification[] = [];

      // Get upcoming appointments for reminders
      const { data: upcomingAppointments, error: upcomingError } = await supabase
        .from('appointments')
        .select(`
          id,
          date,
          time,
          status,
          doctor_id
        `)
        .eq('patient_id', user.id)
        .in('status', ['confirmed', 'pending_approval'])
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(3);

      if (upcomingError) {
        console.warn('[useNotifications] Failed to load upcoming appointments:', upcomingError.message);
      }

      let doctorNameMap = new Map<string, string>();
      const typedUpcomingAppointments = (upcomingAppointments || []) as UpcomingAppointmentRow[];
      if (typedUpcomingAppointments.length > 0) {
        const doctorIds = Array.from(
          new Set(
            typedUpcomingAppointments
              .map((apt) => String(apt.doctor_id || '').trim())
              .filter((id) => id.length > 0),
          ),
        );

        if (doctorIds.length > 0) {
          const { data: doctorRows, error: doctorError } = await supabase
            .from('doctor_registrations')
            .select('user_id, full_name')
            .in('user_id', doctorIds);

          if (doctorError) {
            console.warn('[useNotifications] Failed to load doctor names:', doctorError.message);
          } else {
            doctorNameMap = new Map(
              ((doctorRows || []) as DoctorNameRow[]).map((row) => [
                String(row.user_id || '').trim(),
                String(row.full_name || '').trim(),
              ]),
            );
          }
        }
      }

      if (typedUpcomingAppointments.length > 0) {
        typedUpcomingAppointments.forEach((apt) => {
          const appointmentDate = new Date(`${apt.date}T${apt.time}`);
          const now = new Date();
          const timeDiff = appointmentDate.getTime() - now.getTime();
          const hoursDiff = timeDiff / (1000 * 60 * 60);

          if (hoursDiff <= 24 && hoursDiff > 0) {
            const doctorId = String(apt.doctor_id || '').trim();
            const doctorName = doctorNameMap.get(doctorId) || 'Your Doctor';
            let timeText = '';
            if (hoursDiff < 1) {
              timeText = 'Less than 1 hour';
            } else if (hoursDiff < 24) {
              timeText = `${Math.floor(hoursDiff)} hours`;
            } else {
              timeText = 'Tomorrow';
            }
            
            notifications.push({
              id: `apt-${apt.id}`,
              message: `Reminder: Appointment with ${doctorName} ${hoursDiff < 1 ? 'in less than an hour' : hoursDiff < 24 ? 'today' : 'tomorrow'}`,
              time: timeText,
              read: false,
              type: 'appointment'
            });
          }
        });
      }

      // Get recent messages from doctors
      const { data: consultationSessions, error: sessionError } = await supabase
        .from('consultation_sessions')
        .select('id')
        .eq('patient_id', user.id);

      if (sessionError) {
        console.warn('[useNotifications] Failed to load consultation sessions:', sessionError.message);
      }

      const sessionIds = ((consultationSessions || []) as ConsultationSessionRow[])
        .map((session) => String(session.id || '').trim())
        .filter((id) => id.length > 0);

      let recentMessages: RecentMessageRow[] = [];
      if (sessionIds.length > 0) {
        const { data: recentMessageRows, error: recentMessageError } = await supabase
          .from('consultation_messages')
          .select('id, content, created_at, sender_name')
          .in('session_id', sessionIds)
          .eq('sender_role', 'doctor')
          .order('created_at', { ascending: false })
          .limit(3);

        if (recentMessageError) {
          console.warn('[useNotifications] Failed to load recent messages:', recentMessageError.message);
        } else {
          recentMessages = (recentMessageRows || []) as RecentMessageRow[];
        }
      }

      if (recentMessages) {
        recentMessages.forEach((msg) => {
          const createdAt = new Date(msg.created_at);
          const now = new Date();
          const timeDiff = now.getTime() - createdAt.getTime();
          const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
          const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
          
          let timeText = '';
          if (hoursDiff < 1) {
            timeText = 'Just now';
          } else if (hoursDiff < 24) {
            timeText = `${hoursDiff} hour${hoursDiff > 1 ? 's' : ''} ago`;
          } else {
            timeText = `${daysDiff} day${daysDiff > 1 ? 's' : ''} ago`;
          }
          
          notifications.push({
            id: `msg-${msg.id}`,
            message: `${msg.sender_name} sent you a message`,
            time: timeText,
            read: daysDiff > 0, // Mark as read if older than today
            type: 'message'
          });
        });
      }

      // Sort by most recent first
      return notifications.sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1; // Unread first
        return 0;
      }).slice(0, 5);
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });
}
