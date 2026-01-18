import Peer from 'simple-peer';
import { supabase } from '@/integrations/supabase/client';

export interface WebRTCSignal {
  id: string;
  session_id: string;
  sender_id: string;
  signal_data: any;
  created_at: string;
}

export class WebRTCService {
  private peer: Peer.Instance | null = null;
  private sessionId: string;
  private userId: string;
  private isInitiator: boolean;
  private onStreamCallback?: (stream: MediaStream) => void;
  private onErrorCallback?: (error: Error) => void;
  private unsubscribe?: () => void;

  constructor(sessionId: string, userId: string, isInitiator: boolean) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
  }

  async initializePeer(localStream: MediaStream) {
    this.peer = new Peer({
      initiator: this.isInitiator,
      trickle: false,
      stream: localStream
    });

    this.peer.on('signal', async (data) => {
      await this.sendSignal(data);
    });

    this.peer.on('stream', (stream) => {
      if (this.onStreamCallback) {
        this.onStreamCallback(stream);
      }
    });

    this.peer.on('error', (err) => {
      console.error('WebRTC error:', err);
      if (this.onErrorCallback) {
        this.onErrorCallback(err);
      }
    });

    // Listen for incoming signals
    this.unsubscribe = this.subscribeToSignals();
  }

  private async sendSignal(signalData: any) {
    const { error } = await supabase
      .from('webrtc_signals')
      .insert({
        session_id: this.sessionId,
        sender_id: this.userId,
        signal_data: signalData
      });

    if (error) {
      console.error('Error sending signal:', error);
    }
  }

  private subscribeToSignals() {
    const channel = supabase.channel(`webrtc_signals_${this.sessionId}`);
    
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'webrtc_signals',
      filter: `session_id=eq.${this.sessionId}`
    }, (payload) => {
      const signal = payload.new as WebRTCSignal;
      if (signal.sender_id !== this.userId && this.peer) {
        this.peer.signal(signal.signal_data);
      }
    });
    
    channel.subscribe();

    return () => {
      channel.unsubscribe();
    };
  }

  onStream(callback: (stream: MediaStream) => void) {
    this.onStreamCallback = callback;
  }

  onError(callback: (error: Error) => void) {
    this.onErrorCallback = callback;
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}