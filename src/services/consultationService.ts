import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ConsultationSession {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  consultation_type: 'video' | 'audio' | 'chat';
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: 'active' | 'ended' | 'paused';
  notes: string | null;
  created_at: string;
}

export interface ConsultationMessage {
  id: string;
  session_id: string;
  sender_id: string;
  sender_role: 'patient' | 'doctor';
  sender_name: string;
  message_type: 'text' | 'file' | 'system';
  content: string;
  file_url: string | null;
  created_at: string;
}

class ConsultationService {
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  /**
   * Create a new consultation session
   */
  async createSession(
    appointmentId: string,
    patientId: string,
    doctorId: string,
    consultationType: 'video' | 'audio' | 'chat'
  ): Promise<ConsultationSession> {
    const { data, error } = await supabase
      .from('consultation_sessions')
      .insert({
        appointment_id: appointmentId,
        patient_id: patientId,
        doctor_id: doctorId,
        consultation_type: consultationType,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create consultation session: ${error.message}`);
    }

    return data as ConsultationSession;
  }

  /**
   * Get a consultation session by ID
   */
  async getSession(sessionId: string): Promise<ConsultationSession | null> {
    const { data, error } = await supabase
      .from('consultation_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to fetch consultation session: ${error.message}`);
    }

    return data as ConsultationSession;
  }

  /**
   * Get session by appointment ID
   */
  async getSessionByAppointmentId(appointmentId: string): Promise<ConsultationSession | null> {
    const { data, error } = await supabase
      .from('consultation_sessions')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch session by appointment: ${error.message}`);
    }

    return data as ConsultationSession;
  }

  /**
   * End a consultation session
   */
  async endSession(sessionId: string, durationSeconds: number, notes?: string): Promise<ConsultationSession> {
    const { data, error } = await supabase
      .from('consultation_sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        notes,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to end consultation session: ${error.message}`);
    }

    return data as ConsultationSession;
  }

  /**
   * Send a message in a consultation
   */
  async sendMessage(
    sessionId: string,
    senderId: string,
    senderRole: 'patient' | 'doctor',
    senderName: string,
    content: string,
    messageType: 'text' | 'file' = 'text',
    fileUrl?: string
  ): Promise<ConsultationMessage> {
    const { data, error } = await supabase
      .from('consultation_messages')
      .insert({
        session_id: sessionId,
        sender_id: senderId,
        sender_role: senderRole,
        sender_name: senderName,
        message_type: messageType,
        content,
        file_url: fileUrl || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }

    return data as ConsultationMessage;
  }

  /**
   * Get all messages for a session
   */
  async getMessages(sessionId: string): Promise<ConsultationMessage[]> {
    const { data, error } = await supabase
      .from('consultation_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return data as ConsultationMessage[];
  }

  /**
   * Subscribe to real-time messages for a session
   */
  subscribeToMessages(
    sessionId: string,
    onMessageReceived: (message: ConsultationMessage) => void,
    onError?: (error: Error) => void
  ): () => void {
    const channel = supabase
      .channel(`consultation:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'consultation_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          try {
            const message = payload.new as ConsultationMessage;
            onMessageReceived(message);
          } catch (error) {
            if (onError) {
              onError(error instanceof Error ? error : new Error('Unknown error'));
            }
          }
        }
      )
      .subscribe();

    this.subscriptions.set(`messages:${sessionId}`, channel);

    return () => {
      this.unsubscribeFromMessages(sessionId);
    };
  }

  /**
   * Subscribe to session status changes
   */
  subscribeToSession(
    sessionId: string,
    onSessionUpdated: (session: ConsultationSession) => void,
    onError?: (error: Error) => void
  ): () => void {
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'consultation_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          try {
            const session = payload.new as ConsultationSession;
            onSessionUpdated(session);
          } catch (error) {
            if (onError) {
              onError(error instanceof Error ? error : new Error('Unknown error'));
            }
          }
        }
      )
      .subscribe();

    this.subscriptions.set(`session:${sessionId}`, channel);

    return () => {
      this.unsubscribeFromSession(sessionId);
    };
  }

  /**
   * Unsubscribe from message updates
   */
  async unsubscribeFromMessages(sessionId: string): Promise<void> {
    const channel = this.subscriptions.get(`messages:${sessionId}`);
    if (channel) {
      await supabase.removeChannel(channel);
      this.subscriptions.delete(`messages:${sessionId}`);
    }
  }

  /**
   * Unsubscribe from session updates
   */
  async unsubscribeFromSession(sessionId: string): Promise<void> {
    const channel = this.subscriptions.get(`session:${sessionId}`);
    if (channel) {
      await supabase.removeChannel(channel);
      this.subscriptions.delete(`session:${sessionId}`);
    }
  }

  /**
   * Cleanup all subscriptions
   */
  async cleanup(): Promise<void> {
    for (const channel of this.subscriptions.values()) {
      await supabase.removeChannel(channel);
    }
    this.subscriptions.clear();
  }

  /**
   * Save consultation recording
   */
  async saveRecording(
    sessionId: string,
    recordingUrl: string,
    durationSeconds: number,
    fileSizeMb: number
  ): Promise<void> {
    const { error } = await supabase
      .from('consultation_recordings')
      .insert({
        session_id: sessionId,
        recording_url: recordingUrl,
        duration_seconds: durationSeconds,
        file_size_mb: fileSizeMb,
      });

    if (error) {
      throw new Error(`Failed to save recording: ${error.message}`);
    }
  }

  /**
   * Get session history for a user
   */
  async getSessionHistory(userId: string, role: 'patient' | 'doctor', limit: number = 20): Promise<ConsultationSession[]> {
    let query = supabase
      .from('consultation_sessions')
      .select('*')
      .eq(role === 'patient' ? 'patient_id' : 'doctor_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch session history: ${error.message}`);
    }

    return data as ConsultationSession[];
  }
}

export const consultationService = new ConsultationService();
