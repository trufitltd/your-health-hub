import { useState, useEffect, useCallback } from 'react';
import { consultationService, type ConsultationSession, type ConsultationMessage } from '@/services/consultationService';

interface UseConsultationReturn {
  session: ConsultationSession | null;
  messages: ConsultationMessage[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (content: string) => Promise<void>;
  endSession: (notes?: string) => Promise<void>;
  loadMessages: () => Promise<void>;
}

export function useConsultation(appointmentId: string, patientId: string, doctorId: string, consultationType: 'video' | 'audio' | 'chat'): UseConsultationReturn {
  const [session, setSession] = useState<ConsultationSession | null>(null);
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Initialize session
  useEffect(() => {
    const initialize = async () => {
      try {
        let currentSession = await consultationService.getSessionByAppointmentId(appointmentId);
        
        if (!currentSession) {
          currentSession = await consultationService.createSession(
            appointmentId,
            patientId,
            doctorId,
            consultationType
          );
        }

        setSession(currentSession);

        // Load existing messages
        const existingMessages = await consultationService.getMessages(currentSession.id);
        setMessages(existingMessages);

        // Subscribe to real-time updates
        const unsubscribe = consultationService.subscribeToMessages(
          currentSession.id,
          (newMessage) => {
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === newMessage.id)) {
                return prev;
              }
              return [...prev, newMessage];
            });
          },
          (err) => {
            setError(err);
          }
        );

        return () => {
          unsubscribe();
        };
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [appointmentId, patientId, doctorId, consultationType]);

  const sendMessage = useCallback(async (content: string) => {
    if (!session) {
      throw new Error('Session not initialized');
    }

    // This will be caught by the real-time subscription
    await consultationService.sendMessage(
      session.id,
      patientId,
      patientId === session.patient_id ? 'patient' : 'doctor',
      'User',
      content
    );
  }, [session, patientId]);

  const endSession = useCallback(async (notes?: string) => {
    if (!session) {
      throw new Error('Session not initialized');
    }

    const now = new Date();
    const duration = Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000);
    
    const updatedSession = await consultationService.endSession(session.id, duration, notes);
    setSession(updatedSession);
  }, [session]);

  const loadMessages = useCallback(async () => {
    if (!session) {
      throw new Error('Session not initialized');
    }

    const loadedMessages = await consultationService.getMessages(session.id);
    setMessages(loadedMessages);
  }, [session]);

  return {
    session,
    messages,
    isLoading,
    error,
    sendMessage,
    endSession,
    loadMessages
  };
}
