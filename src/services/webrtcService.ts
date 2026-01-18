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
    console.log('Initializing WebRTC peer, isInitiator:', this.isInitiator);
    
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Add local stream
    localStream.getTracks().forEach(track => {
      console.log('Adding track:', track.kind);
      this.peerConnection?.addTrack(track, localStream);
    });

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      if (this.onStreamCallback && event.streams[0]) {
        this.onStreamCallback(event.streams[0]);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        await this.sendSignal({ type: 'ice-candidate', candidate: event.candidate });
      }
    };

    this.peerConnection.onerror = (event) => {
      console.error('WebRTC connection error:', event);
      if (this.onErrorCallback) {
        this.onErrorCallback(new Error('WebRTC connection error'));
      }
    };

    // Start signaling
    this.unsubscribe = this.subscribeToSignals();

    if (this.isInitiator) {
      console.log('Creating offer as initiator');
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await this.sendSignal({ type: 'offer', offer });
    }
  }

  private async sendSignal(signalData: any) {
    console.log('Sending signal:', signalData.type);
    const { error } = await supabase
      .from('webrtc_signals')
      .insert({
        session_id: this.sessionId,
        sender_id: this.userId,
        signal_data: signalData
      });

    if (error) {
      console.error('Error sending signal:', error);
      // If table doesn't exist, show helpful error
      if (error.code === '42P01') {
        console.error('webrtc_signals table does not exist. Please run the migration.');
      }
    } else {
      console.log('Signal sent successfully');
    }
  }

  private subscribeToSignals() {
    console.log('Subscribing to WebRTC signals for session:', this.sessionId);
    const channel = supabase.channel(`webrtc_signals_${this.sessionId}`);
    
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'webrtc_signals',
      filter: `session_id=eq.${this.sessionId}`
    }, async (payload) => {
      console.log('Received signal from database:', payload);
      const signal = payload.new as WebRTCSignal;
      console.log('Signal sender:', signal.sender_id, 'My ID:', this.userId);
      if (signal.sender_id !== this.userId && this.peerConnection) {
        console.log('Processing signal from other participant');
        await this.handleSignal(signal.signal_data);
      } else {
        console.log('Ignoring own signal or no peer connection');
      }
    });
    
    channel.subscribe((status) => {
      console.log('Channel subscription status:', status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.log('Real-time subscription failed, trying polling fallback');
        this.startPollingFallback();
      }
    });

    return () => {
      console.log('Unsubscribing from WebRTC signals');
      channel.unsubscribe();
    };
  }

  private startPollingFallback() {
    console.log('Starting polling fallback for signals');
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('webrtc_signals')
          .select('*')
          .eq('session_id', this.sessionId)
          .neq('sender_id', this.userId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Polling error:', error);
          return;
        }

        if (data && data.length > 0) {
          console.log('Found signals via polling:', data.length);
          for (const signal of data) {
            await this.handleSignal(signal.signal_data);
            // Delete processed signal to avoid reprocessing
            await supabase.from('webrtc_signals').delete().eq('id', signal.id);
          }
        }
      } catch (err) {
        console.error('Polling fallback error:', err);
      }
    }, 2000);

    // Store interval to clear it later
    (this as any).pollInterval = pollInterval;
  }

  private async handleSignal(signalData: any) {
    if (!this.peerConnection) return;

    console.log('Handling signal:', signalData.type);

    try {
      if (signalData.type === 'offer') {
        console.log('Received offer, creating answer');
        await this.peerConnection.setRemoteDescription(signalData.offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        await this.sendSignal({ type: 'answer', answer });
      } else if (signalData.type === 'answer') {
        console.log('Received answer');
        await this.peerConnection.setRemoteDescription(signalData.answer);
      } else if (signalData.type === 'ice-candidate') {
        console.log('Received ICE candidate');
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
    if ((this as any).pollInterval) {
      clearInterval((this as any).pollInterval);
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}