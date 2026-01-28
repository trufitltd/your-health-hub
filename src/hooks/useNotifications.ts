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

export function useNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async (): Promise<Notification[]> => {
      if (!user?.id) return [];

      const notifications: Notification[] = [];

      // Get upcoming appointments for reminders
      const { data: upcomingAppointments } = await supabase
        .from('appointments')
        .select('id, specialist_name, date, time, status')
        .eq('patient_id', user.id)
        .in('status', ['confirmed', 'pending'])
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(3);

      if (upcomingAppointments) {
        upcomingAppointments.forEach((apt: any) => {
          const appointmentDate = new Date(`${apt.date}T${apt.time}`);
          const now = new Date();
          const timeDiff = appointmentDate.getTime() - now.getTime();
          const hoursDiff = timeDiff / (1000 * 60 * 60);

          if (hoursDiff <= 24 && hoursDiff > 0) {
            const doctorName = apt.specialist_name;
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
      const { data: recentMessages } = await supabase
        .from('consultation_messages')
        .select(`
          id,
          content,
          created_at,
          sender_name,
          consultation_sessions!inner(
            patient_id,
            appointments(specialist_name, doctors(name))
          )
        `)
        .eq('consultation_sessions.patient_id', user.id)
        .eq('sender_role', 'doctor')
        .order('created_at', { ascending: false })
        .limit(3);

      if (recentMessages) {
        recentMessages.forEach((msg: any) => {
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