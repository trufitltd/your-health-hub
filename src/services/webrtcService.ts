import { supabase } from '@/integrations/supabase/client';

export interface WebRTCSignal {
  id: string;
  session_id: string;
  sender_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signal_data: any;
  created_at: string;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private sessionId: string;
  private userId: string;
  private isInitiator: boolean;
  private onStreamCallback?: (stream: MediaStream) => void;
  private onErrorCallback?: (error: Error) => void;
  private onConnectedCallback?: () => void;
  private unsubscribe?: () => void;
  private processedSignals = new Set<string>();
  private candidateQueue: RTCIceCandidate[] = [];
  private peerReady = false;
  private remoteStream: MediaStream | null = null;
  private streamCallbackFired = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private isNegotiating = false;
  private makingOffer = false;
  private iceConnectionChecked = false;

  constructor(sessionId: string, userId: string, isInitiator: boolean) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
  }

  async initializePeer(localStream: MediaStream) {
    console.log('Initializing WebRTC peer, isInitiator:', this.isInitiator);
    this.localStream = localStream;
    
    // Use public STUN servers
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Add TURN server for better connectivity
      { 
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      { 
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ];

    try {
      this.peerConnection = new RTCPeerConnection({
        iceServers: iceServers,
        iceTransportPolicy: 'all', // Allow relay candidates
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      // Add ALL tracks from the stream
      console.log('Adding all tracks from stream:', localStream.getTracks().length);
      localStream.getTracks().forEach(track => {
        console.log('Adding track:', track.kind, track.enabled ? 'enabled' : 'disabled', 'id:', track.id);
        this.peerConnection?.addTrack(track, localStream);
      });

      // Setup remote stream handler
      this.peerConnection.ontrack = (event) => {
        console.log('ontrack event received:', event.track.kind, 'id:', event.track.id, 'streams:', event.streams.length);
        
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
          console.log('Created new remote stream');
        }
        
        // Check for duplicate tracks
        const existingTrack = this.remoteStream.getTracks().find(t => t.id === event.track.id);
        if (existingTrack) {
          console.log('Track already exists, skipping');
          return;
        }
        
        this.remoteStream.addTrack(event.track);
        console.log('Added track to remote stream. Total tracks:', this.remoteStream.getTracks().length);
        
        // Fire callback when we get tracks
        if (this.onStreamCallback && !this.streamCallbackFired && this.remoteStream.getTracks().length > 0) {
          this.streamCallbackFired = true;
          console.log('Firing stream callback with remote stream');
          this.onStreamCallback(this.remoteStream);
        }
      };

      // Setup ICE candidate handler
      this.peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate:', event.candidate.candidate.substring(0, 50));
          await this.sendSignal({ type: 'ice-candidate', candidate: event.candidate });
        } else {
          console.log('ICE candidate gathering complete');
          // Send null candidate to signal end of candidates
          await this.sendSignal({ type: 'ice-candidate', candidate: null });
        }
      };

      // Setup connection state handlers
      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection?.connectionState;
        console.log('Connection state:', state);
        
        if (state === 'connected') {
          console.log('✅ WebRTC connection established!');
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }
        } else if (state === 'failed') {
          console.error('❌ WebRTC connection failed');
          if (this.onErrorCallback) {
            this.onErrorCallback(new Error('WebRTC connection failed'));
          }
        } else if (state === 'connecting') {
          console.log('🌐 WebRTC connecting...');
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection?.iceConnectionState;
        console.log('ICE connection state:', state);
        
        if (state === 'connected' || state === 'completed') {
          console.log('✅ ICE connection established!');
          this.iceConnectionChecked = true;
        } else if (state === 'failed') {
          console.error('❌ ICE connection failed');
        }
      };

      this.peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', this.peerConnection?.signalingState);
      };

      // Handle negotiation
      this.peerConnection.onnegotiationneeded = async () => {
        console.log('Negotiation needed, makingOffer:', this.makingOffer);
        if (this.makingOffer || !this.isInitiator) return;
        
        try {
          this.makingOffer = true;
          console.log('Creating offer as initiator');
          await this.createOffer();
        } catch (err) {
          console.error('Error in negotiation:', err);
        } finally {
          this.makingOffer = false;
        }
      };

      // Start signaling
      this.unsubscribe = this.subscribeToSignals();
      this.startPolling();

      // Send ready signal
      await this.sendSignal({ type: 'ready' });

      // If initiator, wait for peer ready
      if (this.isInitiator) {
        console.log('Initiator: waiting for peer ready');
      }

    } catch (error) {
      console.error('Error initializing WebRTC peer:', error);
      throw error;
    }
  }

  private async sendSignal(signalData: Record<string, unknown>) {
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
      const signal = payload.new as WebRTCSignal;
      console.log('Received signal:', signal.signal_data?.type, 'from:', signal.sender_id);
      if (signal.sender_id !== this.userId && this.peerConnection) {
        console.log('Processing signal from other participant');
        await this.handleSignal(signal.signal_data);
      }
    });

    channel.subscribe((status) => {
      console.log('Channel subscription status:', status);
    });

    return () => {
      console.log('Unsubscribing from WebRTC signals');
      channel.unsubscribe();
    };
  }

  private startPolling() {
    console.log('Starting signal polling');
    const poll = async () => {
      try {
        const { data, error } = await supabase
          .from('webrtc_signals')
          .select('*')
          .eq('session_id', this.sessionId)
          .neq('sender_id', this.userId)
          .order('created_at', { ascending: true })
          .limit(10);

        if (!error && data && data.length > 0) {
          console.log('Found signals via polling:', data.length);
          for (const signal of data) {
            if (this.processedSignals.has(signal.id)) {
              continue;
            }

            console.log('Processing polled signal:', signal.signal_data.type);
            this.processedSignals.add(signal.id);
            await this.handleSignal(signal.signal_data);

            // Delete processed signal after a delay to ensure delivery
            setTimeout(async () => {
              await supabase.from('webrtc_signals').delete().eq('id', signal.id);
            }, 2000);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    poll();
    this.pollInterval = setInterval(poll, 2000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async handleSignal(signalData: Record<string, unknown>) {
    if (!this.peerConnection || this.isDestroyed) return;
    
    console.log('Handling signal:', signalData.type);
    
    try {
      const pc = this.peerConnection;
      
      if (signalData.type === 'offer') {
        if (!pc.remoteDescription) {
          const offer = signalData.offer as RTCSessionDescriptionInit;
          console.log('Received offer, setting as remote description');
          
          // Prevent simultaneous offer/answer
          const offerCollision = pc.signalingState !== 'stable' || this.makingOffer;
          
          if (offerCollision) {
            console.log('Offer collision detected, ignoring');
            return;
          }
          
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          console.log('Remote description set, creating answer');
          
          const answer = await pc.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await pc.setLocalDescription(answer);
          console.log('Answer created and set as local description');
          
          await this.sendSignal({ type: 'answer', answer });
          await this.flushCandidateQueue();
        } else {
          console.log('Already have remote description, ignoring duplicate offer');
        }
      } 
      else if (signalData.type === 'answer') {
        if (pc.localDescription && !pc.remoteDescription) {
          const answer = signalData.answer as RTCSessionDescriptionInit;
          console.log('Received answer, setting as remote description');
          
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('Remote description set from answer');
          await this.flushCandidateQueue();
        } else {
          console.log('Cannot set answer - no local description or already has remote description');
        }
      }
      else if (signalData.type === 'ice-candidate') {
        const candidateData = signalData.candidate as RTCIceCandidateInit;
        if (candidateData) {
          if (pc.remoteDescription) {
            console.log('Adding ICE candidate');
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (error) {
              console.warn('Failed to add ICE candidate:', error);
            }
          } else {
            console.log('Queueing ICE candidate');
            this.candidateQueue.push(new RTCIceCandidate(candidateData));
          }
        }
      }
      else if (signalData.type === 'ready') {
        this.peerReady = true;
        if (this.isInitiator && !this.peerConnection.localDescription && !this.makingOffer) {
          console.log('Peer ready, creating offer');
          await this.createOffer();
        }
      }
    } catch (error) {
      console.error('Error handling signal:', error);
    }
  }

  private async flushCandidateQueue() {
    if (!this.peerConnection || this.candidateQueue.length === 0) return;

    console.log(`Flushing ${this.candidateQueue.length} queued ICE candidates`);
    while (this.candidateQueue.length > 0) {
      const candidate = this.candidateQueue.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(candidate);
          console.log('Queued ICE candidate added successfully');
        } catch (error) {
          console.warn('Failed to add queued ICE candidate:', error);
        }
      }
    }
  }

  private async createOffer() {
    if (!this.peerConnection || this.makingOffer) return;

    try {
      console.log('Creating offer');
      this.makingOffer = true;
      
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true
      });
      
      console.log('Offer created, setting as local description');
      await this.peerConnection.setLocalDescription(offer);
      
      console.log('Local description set, sending offer signal');
      await this.sendSignal({ type: 'offer', offer });
      
    } catch (error) {
      console.error('Error creating offer:', error);
    } finally {
      this.makingOffer = false;
    }
  }

  onStream(callback: (stream: MediaStream) => void) {
    this.onStreamCallback = callback;
  }

  onError(callback: (error: Error) => void) {
    this.onErrorCallback = callback;
  }

  onConnected(callback: () => void) {
    this.onConnectedCallback = callback;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getConnectionState(): string {
    return this.peerConnection?.connectionState || 'new';
  }

  destroy() {
    console.log('Destroying WebRTC service');
    this.isDestroyed = true;
    this.stopPolling();
    
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    this.remoteStream = null;
    this.streamCallbackFired = false;
    this.iceConnectionChecked = false;
  }
}