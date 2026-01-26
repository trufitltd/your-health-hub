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
  private onAdmittedCallback?: () => void;
  private onPatientJoinedLobbyCallback?: () => void;
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
  private connectionTimeoutId: NodeJS.Timeout | null = null;
  private iceRestartCount = 0;
  private maxIceRestarts = 2;
  private sessionStartedAt: Date;
  private doctorJoinedAt: Date;
  private pendingRemoteStream: MediaStream | null = null;
  private fireStreamCallback?: () => void;

  constructor(sessionId: string, userId: string, isInitiator: boolean, sessionStartedAt?: Date) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
    this.sessionStartedAt = sessionStartedAt || new Date();
    this.doctorJoinedAt = new Date(); // When doctor actually joins the call
  }

  async initializePeer(localStream: MediaStream) {
    console.log('Initializing WebRTC peer, isInitiator:', this.isInitiator);
    this.localStream = localStream;
    
    // Simplified STUN/TURN configuration
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];

    try {
      this.peerConnection = new RTCPeerConnection({
        iceServers: iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      console.log('Adding all tracks from stream:', localStream.getTracks().length);
      
      // Wait for video tracks to have proper dimensions before adding them
      const addTracksWithValidation = async () => {
        for (const track of localStream.getTracks()) {
          console.log('Adding track:', track.kind, track.enabled ? 'enabled' : 'disabled', 'id:', track.id);
          
          if (track.kind === 'video') {
            const isValid = await this.validateVideoTrack(track);
            if (!isValid) {
              console.error('❌ Video track validation failed, skipping track');
              continue;
            }
          }
          
          this.peerConnection?.addTrack(track, localStream);
        }
      };
      
      await addTracksWithValidation();

      this.peerConnection.ontrack = (event) => {
        console.log('ontrack event received:', event.track.kind, 'id:', event.track.id, 'streams:', event.streams.length);
        
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
          console.log('Created new remote stream');
        }
        
        const existingTrack = this.remoteStream.getTracks().find(t => t.id === event.track.id);
        if (existingTrack) {
          console.log('Track already exists, skipping');
          return;
        }
        
        // Add track to our managed remote stream
        this.remoteStream.addTrack(event.track);
        console.log('Added track to remote stream. Total tracks:', this.remoteStream.getTracks().length);
        
        // For video tracks, wait for proper dimensions before considering ready
        if (event.track.kind === 'video') {
          const checkVideoDimensions = () => {
            const settings = event.track.getSettings();
            console.log('📹 Video track settings:', settings);
            
            if (settings.width && settings.height && settings.width > 0 && settings.height > 0) {
              console.log('✅ Video track has valid dimensions:', settings.width, 'x', settings.height);
              this.fireStreamCallback();
            } else {
              console.log('⏳ Waiting for video track dimensions...');
              setTimeout(checkVideoDimensions, 100);
            }
          };
          
          // Start checking dimensions after a short delay
          setTimeout(checkVideoDimensions, 50);
        } else {
          // Audio track - fire callback immediately
          this.fireStreamCallback();
        }
        
        // Check if we have both audio and video tracks and consider connection established
        const audioTracks = this.remoteStream.getAudioTracks();
        const videoTracks = this.remoteStream.getVideoTracks();
        console.log('📊 Track status - Audio:', audioTracks.length, audioTracks.map(t => `${t.kind}:${t.readyState}:${t.enabled}`));
        console.log('📊 Track status - Video:', videoTracks.length, videoTracks.map(t => `${t.kind}:${t.readyState}:${t.enabled}`));
        
        if (audioTracks.length > 0 && videoTracks.length > 0 && this.peerConnection?.iceConnectionState === 'checking') {
          console.log('✅ Both audio and video tracks received, considering connection established');
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }
        }
      };
      
      // Helper method to fire stream callback only once
      this.fireStreamCallback = () => {
        if (this.onStreamCallback && !this.streamCallbackFired && this.remoteStream && this.remoteStream.getTracks().length > 0) {
          this.streamCallbackFired = true;
          console.log('Firing stream callback with remote stream');
          this.onStreamCallback(this.remoteStream);
        }
      };

      this.peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const type = candidate.includes('typ host') ? 'host' : 
                      candidate.includes('typ srflx') ? 'srflx' : 
                      candidate.includes('typ relay') ? 'relay' : 'unknown';
          console.log(`📡 Sending ICE candidate [${type}]:`, candidate.substring(0, 80));
          await this.sendSignal({ type: 'ice-candidate', candidate: event.candidate });
        } else {
          console.log('✅ ICE candidate gathering complete');
          await this.sendSignal({ type: 'ice-candidate', candidate: null });
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection?.connectionState;
        console.log('Connection state:', state);
        
        if (state === 'connected') {
          console.log('✅ WebRTC connection established!');
          if (this.connectionTimeoutId) {
            clearTimeout(this.connectionTimeoutId);
            this.connectionTimeoutId = null;
          }
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
        } else if (state === 'disconnected') {
          console.warn('⚠️ WebRTC disconnected');
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection?.iceConnectionState;
        console.log('🧊 ICE connection state:', state);
        
        if (state === 'connected' || state === 'completed') {
          console.log('✅ ICE connection established!');
          if (this.connectionTimeoutId) {
            clearTimeout(this.connectionTimeoutId);
            this.connectionTimeoutId = null;
          }
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }
        } else if (state === 'failed') {
          console.error('❌ ICE connection failed');
          if (this.iceRestartCount < this.maxIceRestarts) {
            console.log('Attempting ICE restart...');
            this.iceRestartCount++;
            this.peerConnection?.restartIce();
          } else if (this.onErrorCallback) {
            this.onErrorCallback(new Error('ICE connection failed after retries'));
          }
        } else if (state === 'checking') {
          console.log('🔍 ICE checking candidates...');
          // Log current ICE candidates being tested
          this.logIceCandidatePairs();
          
          // Set a timeout to check if we have media flowing even if ICE is stuck
          setTimeout(() => {
            if (this.peerConnection?.iceConnectionState === 'checking' && this.remoteStream && this.remoteStream.getTracks().length > 0) {
              console.log('🔧 ICE stuck in checking but media is flowing, considering connected');
              if (this.onConnectedCallback) {
                this.onConnectedCallback();
              }
            }
          }, 15000);
        } else if (state === 'disconnected') {
          console.warn('⚠️ ICE disconnected');
        }
      };

      this.peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', this.peerConnection?.signalingState);
      };

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

      this.unsubscribe = this.subscribeToSignals();
      this.startPolling();

      await this.sendSignal({ type: 'ready' });
      
      // Connection timeout disabled - let ICE negotiation complete naturally
      // this.connectionTimeoutId = setTimeout(() => {
      //   if (!this.peerConnection) return;
      //   
      //   const connState = this.peerConnection.connectionState;
      //   const iceState = this.peerConnection.iceConnectionState;
      //   
      //   console.log('⏰ Connection timeout check - connection:', connState, 'ICE:', iceState);
      //   
      //   // Only restart if truly stuck (ICE is checking/failed but not connected)
      //   if ((connState === 'connecting' || connState === 'new') && 
      //       (iceState === 'checking' || iceState === 'failed' || iceState === 'disconnected') &&
      //       this.iceRestartCount < this.maxIceRestarts) {
      //     console.warn('⚠️ Connection timeout - restarting ICE (attempt', this.iceRestartCount + 1, ')');
      //     this.iceRestartCount++;
      //     this.peerConnection.restartIce?.();
      //     
      //     // Set another timeout for the restart attempt
      //     this.connectionTimeoutId = setTimeout(() => {
      //       if (this.peerConnection?.connectionState !== 'connected' && 
      //           this.iceRestartCount < this.maxIceRestarts) {
      //         console.warn('⚠️ ICE restart failed, trying again...');
      //         this.iceRestartCount++;
      //         this.peerConnection?.restartIce?.();
      //       }
      //     }, 10000);
      //   }
      // }, 30000);

      if (this.isInitiator) {
        console.log('Initiator: waiting for peer ready');
      }

    } catch (error) {
      console.error('Error initializing WebRTC peer:', error);
      throw error;
    }
  }

  private async validateVideoTrack(track: MediaStreamTrack): Promise<boolean> {
    if (track.kind !== 'video') return true;
    
    // Create a temporary video element to test the track
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.style.position = 'absolute';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    
    try {
      const stream = new MediaStream([track]);
      video.srcObject = stream;
      document.body.appendChild(video);
      
      // Wait for video to load and get dimensions
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Video validation timeout'));
        }, 5000);
        
        video.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        
        video.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Video load error'));
        };
        
        video.play().catch(reject);
      });
      
      const hasValidDimensions = video.videoWidth > 0 && video.videoHeight > 0;
      console.log('✅ Video track validation:', {
        width: video.videoWidth,
        height: video.videoHeight,
        readyState: track.readyState,
        enabled: track.enabled,
        valid: hasValidDimensions
      });
      
      return hasValidDimensions;
      
    } catch (error) {
      console.warn('⚠️ Video track validation failed:', error);
      return false;
    } finally {
      video.srcObject = null;
      if (video.parentNode) {
        document.body.removeChild(video);
      }
    }
  }

  async checkExistingLobbySignals() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const { data, error } = await supabase
      .from('webrtc_signals')
      .select('*')
      .eq('session_id', this.sessionId)
      .eq('signal_data->>type', 'join_lobby')
      .neq('sender_id', this.userId)
      .gte('created_at', fiveMinutesAgo.toISOString());

    if (error) {
      console.error('Error checking existing lobby signals:', error);
      return;
    }

    if (data && data.length > 0) {
      console.log('Found recent patient lobby signal');
      if (this.onPatientJoinedLobbyCallback) {
        this.onPatientJoinedLobbyCallback();
      }
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
      if (signal.sender_id !== this.userId) {
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

            // Skip old join_lobby signals in polling but allow real-time ones
            if (this.isInitiator && signal.signal_data.type === 'join_lobby') {
              const signalTime = new Date(signal.created_at);
              if (signalTime < this.doctorJoinedAt) {
                console.log('Skipping old join_lobby signal from before doctor joined');
                this.processedSignals.add(signal.id);
                continue;
              }
            }

            console.log('Processing polled signal:', signal.signal_data.type);
            this.processedSignals.add(signal.id);
            await this.handleSignal(signal.signal_data);

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
    console.log('Handling signal:', signalData.type);
    
    try {
      // Handle admit_patient and join_lobby without peer connection
      if (signalData.type === 'admit_patient') {
        if (this.onAdmittedCallback) {
          this.onAdmittedCallback();
        }
        return;
      }
      
      if (signalData.type === 'join_lobby') {
        if (this.onPatientJoinedLobbyCallback) {
          this.onPatientJoinedLobbyCallback();
        }
        return;
      }
      
      // All other signals require peer connection
      if (!this.peerConnection || this.isDestroyed) return;
      
      const pc = this.peerConnection;
      
      if (signalData.type === 'offer') {
        const offer = signalData.offer as RTCSessionDescriptionInit;
        console.log('Received offer, signalingState:', pc.signalingState);
        
        if (pc.signalingState === 'stable' || !pc.localDescription) {
          if (!pc.remoteDescription) {
            console.log('Setting remote description from offer');
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await pc.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            await pc.setLocalDescription(answer);
            console.log('Answer created and set as local description');
            
            await this.sendSignal({ type: 'answer', answer });
            await this.flushCandidateQueue();
          } else {
            console.log('Already have remote description, ignoring offer');
          }
        } else {
          console.log('Offer collision - signalingState:', pc.signalingState, 'ignoring');
        }
      } 
      else if (signalData.type === 'answer') {
        const answer = signalData.answer as RTCSessionDescriptionInit;
        console.log('Received answer, signalingState:', pc.signalingState, 'remoteDescription:', !!pc.remoteDescription);
        
        if (pc.signalingState === 'have-local-offer' && !pc.remoteDescription) {
          console.log('Setting remote description from answer');
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('Remote description set from answer');
          await this.flushCandidateQueue();
        } else {
          console.log('Ignoring answer - signalingState:', pc.signalingState, 'remoteDescription:', !!pc.remoteDescription);
        }
      }
      else if (signalData.type === 'ice-candidate') {
        const candidateData = signalData.candidate as RTCIceCandidateInit;
        if (candidateData) {
          const candidate = candidateData.candidate || '';
          const type = candidate.includes('typ host') ? 'host' : 
                      candidate.includes('typ srflx') ? 'srflx' : 
                      candidate.includes('typ relay') ? 'relay' : 'unknown';
          
          if (pc.remoteDescription) {
            console.log(`📥 Adding ICE candidate [${type}]:`, candidate.substring(0, 80));
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidateData));
              console.log('✅ ICE candidate added successfully');
            } catch (error) {
              console.warn('⚠️ Failed to add ICE candidate:', error);
            }
          } else {
            console.log(`📋 Queueing ICE candidate [${type}]:`, candidate.substring(0, 80));
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

  private async logIceCandidatePairs() {
    if (!this.peerConnection) return;
    
    try {
      const stats = await this.peerConnection.getStats();
      const candidatePairs: RTCStatsReport[] = [];
      const localCandidates: RTCStatsReport[] = [];
      const remoteCandidates: RTCStatsReport[] = [];
      
      stats.forEach((report) => {
        if (report.type === 'candidate-pair') {
          candidatePairs.push(report);
        } else if (report.type === 'local-candidate') {
          localCandidates.push(report);
        } else if (report.type === 'remote-candidate') {
          remoteCandidates.push(report);
        }
      });
      
      console.log(`📊 ICE Stats: ${candidatePairs.length} pairs, ${localCandidates.length} local, ${remoteCandidates.length} remote`);
      
      candidatePairs.forEach((pair: any) => {
        if (pair.state === 'succeeded' || pair.state === 'in-progress') {
          console.log(`🔗 Candidate pair [${pair.state}]: ${pair.localCandidateId} -> ${pair.remoteCandidateId}`);
        }
      });
    } catch (error) {
      console.warn('Failed to get ICE stats:', error);
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

  subscribeToSignalsOnly() {
    this.unsubscribe = this.subscribeToSignals();
  }

  async sendJoinLobby() {
    await this.sendSignal({ type: 'join_lobby' });
  }

  async sendAdmitPatient() {
    await this.sendSignal({ type: 'admit_patient' });
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

  onAdmitted(callback: () => void) {
    this.onAdmittedCallback = callback;
  }

  onPatientJoinedLobby(callback: () => void) {
    this.onPatientJoinedLobbyCallback = callback;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  get pendingRemoteStream(): MediaStream | null {
    return this.pendingRemoteStream;
  }

  set pendingRemoteStream(stream: MediaStream | null) {
    this.pendingRemoteStream = stream;
  }

  getConnectionState(): string {
    return this.peerConnection?.connectionState || 'new';
  }

  destroy() {
    console.log('Destroying WebRTC service');
    this.isDestroyed = true;
    this.stopPolling();
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
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
  }
}
