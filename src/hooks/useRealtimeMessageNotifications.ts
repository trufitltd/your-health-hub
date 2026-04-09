import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { triggerNotificationAlert } from '@/lib/notificationAlert';

type PortalRole = 'patient' | 'doctor';

interface SessionParticipants {
  patient_id: string | null;
  doctor_id: string | null;
}

interface IncomingMessage {
  session_id: string;
  sender_id: string;
  sender_role: 'patient' | 'doctor' | 'system' | string;
  sender_name: string | null;
  content: string | null;
}

const truncate = (value: string, max = 90) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
};

export function useRealtimeMessageNotifications(userId?: string, role?: PortalRole) {
  const sessionCacheRef = useRef<Map<string, SessionParticipants>>(new Map());

  useEffect(() => {
    if (!userId || !role) return;

    const channel = supabase
      .channel(`portal-message-notify-${role}-${userId}`)
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
            tag: `consultation-message-${role}-${message.session_id}`,
            urgent: true,
          });
          toast({
            title: `New message from ${sender}`,
            description: truncate(body),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, userId]);
}
