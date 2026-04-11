import { useEffect, useCallback, useRef } from 'react';
import { triggerNotificationAlert } from '@/lib/notificationAlert';
import { toast } from '@/components/ui/use-toast';

interface Appointment {
  id: string;
  date: string | null;
  time: string | null;
  status: string | null;
}

export function useAppointmentReminders(appointments: Appointment[], userId?: string) {
  const remindedAppointmentsRef = useRef<Set<string>>(new Set());

  const checkReminders = useCallback(() => {
    if (!userId || !appointments.length) return;

    const now = new Date();
    
    appointments.forEach((apt) => {
      if (!apt.date || !apt.time || remindedAppointmentsRef.current.has(`${apt.id}-reminder`)) return;
      
      // Skip completed or cancelled
      if (apt.status === 'completed' || apt.status === 'cancelled') return;

      try {
        const [hours, minutes] = apt.time.split(':').map(Number);
        const aptDate = new Date(apt.date);
        aptDate.setHours(hours, minutes, 0, 0);

        const diffMs = aptDate.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        // Notify if appointment is in exactly 5 minutes (or between 4 and 6)
        if (diffMins >= 4 && diffMins <= 5) {
          remindedAppointmentsRef.current.add(`${apt.id}-reminder`);
          
          const body = `Your appointment is starting in ${diffMins} minutes. Please get ready.`;
          
          void triggerNotificationAlert({
            title: 'Appointment Starting Soon',
            body,
            tag: `appointment-reminder-5m-${apt.id}`,
            urgent: true,
          });
          
          toast({
            title: 'Appointment Starting Soon',
            description: body,
          });
        }
      } catch (err) {
        console.error('Error calculating appointment reminder:', err);
      }
    });
  }, [appointments, userId]);

  useEffect(() => {
    // Check every minute
    const interval = setInterval(checkReminders, 60000);
    checkReminders(); // Initial check

    return () => clearInterval(interval);
  }, [checkReminders]);
}
