import { supabase } from '@/integrations/supabase/client';

export interface WebRTCSignal {
  id: string;
  session_id: string;
  sender_id: string;
  signal_data: any;
  created_at: string;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
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
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Add local stream
    localStream.getTracks().forEach(track => {
      this.peerConnection?.addTrack(track, localStream);
    });

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      if (this.onStreamCallback && event.streams[0]) {
        this.onStreamCallback(event.streams[0]);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        await this.sendSignal({ type: 'ice-candidate', candidate: event.candidate });
      }
    };

    this.peerConnection.onerror = (event) => {
      if (this.onErrorCallback) {
        this.onErrorCallback(new Error('WebRTC connection error'));
      }
    };

    // Start signaling
    this.unsubscribe = this.subscribeToSignals();

    if (this.isInitiator) {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await this.sendSignal({ type: 'offer', offer });
    }
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
    }, async (payload) => {
      const signal = payload.new as WebRTCSignal;
      if (signal.sender_id !== this.userId && this.peerConnection) {
        await this.handleSignal(signal.signal_data);
      }
    });
    
    channel.subscribe();

    return () => {
      channel.unsubscribe();
    };
  }

  private async handleSignal(signalData: any) {
    if (!this.peerConnection) return;

    try {
      if (signalData.type === 'offer') {
        await this.peerConnection.setRemoteDescription(signalData.offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        await this.sendSignal({ type: 'answer', answer });
      } else if (signalData.type === 'answer') {
        await this.peerConnection.setRemoteDescription(signalData.answer);
      } else if (signalData.type === 'ice-candidate') {
        await this.peerConnection.addIceCandidate(signalData.candidate);
      }
    } catch (error) {
      console.error('Error handling signal:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error);
      }
    }
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
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}