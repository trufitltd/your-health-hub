import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { triggerNotificationAlert } from '@/lib/notificationAlert';

export type PortalRole = 'patient' | 'doctor' | 'admin' | 'coo';

interface SessionParticipants {
  patient_id: string | null;
  doctor_id: string | null;
}

interface IncomingMessage {
  session_id?: string;
  sender_id?: string;
  sender_role?: string;
  sender_name?: string | null;
  content?: string | null;
  message?: string | null; // for contact_messages
  email?: string | null;   // for contact_messages
  thread_id?: string;      // for coo_messages
  thread_type?: string;    // for coo_messages
}

interface IncomingAppointment {
  id: string;
  patient_id: string | null;
  doctor_id: string | null;
  patient_name: string | null;
  specialist_name: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
}

const truncate = (value: string, max = 90) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
};

export function useRealtimeNotifications(userId?: string, role?: PortalRole, email?: string) {
  const sessionCacheRef = useRef<Map<string, SessionParticipants>>(new Map());

  useEffect(() => {
    if (!userId || !role) return;

    const channels: any[] = [];

    // 1. Consultation Messages (for Doctors and Patients)
    if (role === 'doctor' || role === 'patient') {
      const consultationChannel = supabase
        .channel(`realtime-consultation-messages-${role}-${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'consultation_messages' },
          async (payload) => {
            const message = payload.new as IncomingMessage | null;
            if (!message?.session_id || !message.sender_id) return;
            if (message.sender_id === userId) return;

            let sessionInfo = sessionCacheRef.current.get(message.session_id);

            if (!sessionInfo) {
              const { data } = await supabase
                .from('consultation_sessions')
                .select('patient_id, doctor_id')
                .eq('id', message.session_id)
                .maybeSingle();

              if (!data) return;
              sessionInfo = {
                patient_id: data.patient_id ?? null,
                doctor_id: data.doctor_id ?? null,
              };
              sessionCacheRef.current.set(message.session_id, sessionInfo);
            }

            const isParticipant =
              (role === 'patient' && sessionInfo.patient_id === userId && message.sender_role === 'doctor') ||
              (role === 'doctor' && sessionInfo.doctor_id === userId && message.sender_role === 'patient');

            if (!isParticipant) return;

            const sender = message.sender_name?.trim() || (role === 'patient' ? 'Doctor' : 'Patient');
            const body = message.content?.trim() || 'Sent you a new message.';

            void triggerNotificationAlert({
              title: `New message from ${sender}`,
              body: truncate(body),
              tag: `consultation-message-${message.session_id}`,
              urgent: true,
            });
            toast({
              title: `New message from ${sender}`,
              description: truncate(body),
            });
          },
        )
        .subscribe();
      channels.push(consultationChannel);
    }

    // 2. Contact/Support Messages (for Admin and Support replies to Users)
    const contactChannel = supabase
      .channel(`realtime-contact-messages-${role}-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contact_messages' },
        (payload) => {
          const message = payload.new as IncomingMessage | null;
          if (!message) return;

          // Admin sees all incoming contact messages
          if (role === 'admin' && !/\[portal:admin\]/i.test(message.message || '')) {
            const sender = `${message.sender_name || 'User'}`;
            const body = message.message || 'New contact message received.';
            void triggerNotificationAlert({
              title: `New Support Message from ${sender}`,
              body: truncate(body),
              tag: `contact-message-admin-${payload.new.id}`,
              urgent: true,
            });
            toast({
              title: `New Support Message`,
              description: truncate(body),
            });
          }
          // Users (Doctors/Patients) see replies from Admin
          else if ((role === 'doctor' || role === 'patient') && email && message.email?.toLowerCase() === email.toLowerCase()) {
            if (/\[portal:admin\]/i.test(message.message || '')) {
              void triggerNotificationAlert({
                title: 'New message from MyE-Doctor',
                body: 'You received a new support message.',
                tag: `contact-message-reply-${payload.new.id}`,
                urgent: true,
              });
              toast({
                title: 'New message from MyE-Doctor',
                description: 'You received a new support message.',
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contact_messages' },
        (payload) => {
          const newRow = payload.new as IncomingMessage | null;
          const oldRow = payload.old as IncomingMessage | null;
          if (!newRow || !oldRow) return;

          // Detect new replies in thread
          const countMarkers = (body: string) => (body.match(/--- (Admin|User) Reply/g) || []).length;
          const oldCount = countMarkers(oldRow.message || '');
          const newCount = countMarkers(newRow.message || '');

          if (newCount > oldCount) {
            const isLatestAdmin = /--- Admin Reply \(.*\)$/.test((newRow.message || '').trim().split('\n').pop() || '');
            
            if (role === 'admin' && !isLatestAdmin) {
              void triggerNotificationAlert({
                title: 'New reply received',
                body: `A user replied to a support thread.`,
                tag: `contact-reply-admin-${newRow.id}`,
                urgent: true,
              });
              toast({ title: 'New reply received', description: 'A user replied to a support thread.' });
            } else if ((role === 'doctor' || role === 'patient') && email && newRow.email?.toLowerCase() === email.toLowerCase() && isLatestAdmin) {
              void triggerNotificationAlert({
                title: 'New message from MyE-Doctor',
                body: 'You received a new support reply.',
                tag: `contact-reply-user-${newRow.id}`,
                urgent: true,
              });
              toast({ title: 'New message from MyE-Doctor', description: 'You received a new support reply.' });
            }
          }
        }
      )
      .subscribe();
    channels.push(contactChannel);

    // 3. COO Messages
    const cooChannel = supabase
      .channel(`realtime-coo-messages-${role}-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'coo_messages' },
        (payload) => {
          const message = payload.new as IncomingMessage | null;
          if (!message || message.sender_id === userId) return;

          const isParticipant = 
            (role === 'coo') || // COO sees all
            (role === 'doctor' && message.thread_type === 'doctor' && message.thread_id === userId) ||
            (role === 'patient' && message.thread_type === 'patient' && message.thread_id === userId);

          if (!isParticipant) return;

          const sender = message.sender_name || (message.sender_role === 'coo' ? 'COO' : 'User');
          const body = message.content || 'Sent you a message.';

          void triggerNotificationAlert({
            title: `New message from ${sender}`,
            body: truncate(body),
            tag: `coo-message-${message.thread_id}`,
            urgent: true,
          });
          toast({ title: `New message from ${sender}`, description: truncate(body) });
        }
      )
      .subscribe();
    channels.push(cooChannel);

    // 4. Appointment Bookings (for Doctors, Admin, and COO)
    if (role === 'doctor' || role === 'admin' || role === 'coo') {
      const appointmentChannel = supabase
        .channel(`realtime-appointments-${role}-${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'appointments' },
          (payload) => {
            const appointment = payload.new as IncomingAppointment | null;
            if (!appointment) return;

            const isRelevant = 
              (role === 'admin' || role === 'coo') || // Admin/COO see all
              (role === 'doctor' && appointment.doctor_id === userId);

            if (!isRelevant) return;

            const patientName = appointment.patient_name || 'A patient';
            const doctorName = appointment.specialist_name || 'a doctor';
            
            let title = 'New appointment booked';
            let body = `${patientName} booked an appointment at ${appointment.time || 'N/A'} on ${appointment.date || 'N/A'}`;
            
            if (role === 'admin' || role === 'coo') {
              body = `${patientName} booked ${doctorName} at ${appointment.time || 'N/A'}`;
            }

            void triggerNotificationAlert({
              title,
              body,
              tag: `appointment-new-${appointment.id}`,
              urgent: true,
            });
            toast({ title, description: body });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'appointments' },
          (payload) => {
            const newAppt = payload.new as IncomingAppointment | null;
            const oldAppt = payload.old as IncomingAppointment | null;
            if (!newAppt || !oldAppt) return;

            // Only notify on status changes
            if (newAppt.status === oldAppt.status) return;

            const isRelevant = 
              (role === 'admin' || role === 'coo') || 
              (role === 'doctor' && newAppt.doctor_id === userId) ||
              (role === 'patient' && newAppt.patient_id === userId);

            if (!isRelevant) return;

            const status = (newAppt.status || 'updated').replace(/_/g, ' ');
            const title = 'Appointment Update';
            const body = `Appointment status changed to: ${status}`;

            void triggerNotificationAlert({
              title,
              body,
              tag: `appointment-update-${newAppt.id}`,
              urgent: true,
            });
            toast({ title, description: body });
          }
        )
        .subscribe();
      channels.push(appointmentChannel);
    }

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [role, userId, email]);
}
