import { supabase } from '@/integrations/supabase/client';

export interface WebRTCSignal {
  id: string;
  session_id: string;
  sender_id: string;
  signal_data: Record<string, unknown>;
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
  private pendingRemoteDescription: RTCSessionDescriptionInit | null = null;
  private candidateRetryCount: Map<string, number> = new Map();
  private maxCandidateRetries = 3;
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
  private fireStreamCallback?: () => void;
  private isConnected = false;
  private iceRestartInProgress = false;
  private localDescriptionSet = false;

  constructor(sessionId: string, userId: string, isInitiator: boolean, sessionStartedAt?: Date) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
    this.sessionStartedAt = sessionStartedAt || new Date();
    this.doctorJoinedAt = new Date(); // When doctor actually joins the call
  }

  async initializePeer(localStream: MediaStream) {
    console.log('Initializing WebRTC peer, isInitiator:', this.isInitiator);
    
    // If peer connection already exists and has a remote description,
    // just add tracks instead of recreating connection
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      console.log('[WebRTC] Peer connection already exists with remote description, adding tracks only');
      this.localStream = localStream;
      
      console.log('Adding all tracks from stream:', localStream.getTracks().length);
      const addTracksWithValidation = async () => {
        for (const track of localStream.getTracks()) {
          console.log('Adding track:', track.kind, track.enabled ? 'enabled' : 'disabled', 'id:', track.id);
          this.peerConnection?.addTrack(track, localStream);
        }
      };
      
      await addTracksWithValidation();
      return;
    }
    
    this.localStream = localStream;
    
    // Enhanced STUN/TURN configuration for better connectivity
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: 'turn:turn.example.com:3478',
        username: 'user',
        credential: 'password'
      }
    ];

    try {
      this.peerConnection = new RTCPeerConnection({
        iceServers: iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      console.log('Adding all tracks from stream:', localStream.getTracks().length);
      
      // Add tracks directly without validation to avoid corruption
      const addTracksWithValidation = async () => {
        for (const track of localStream.getTracks()) {
          console.log('Adding track:', track.kind, track.enabled ? 'enabled' : 'disabled', 'id:', track.id);
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
        
        // For video tracks, fire callback immediately - don't wait for dimensions
        if (event.track.kind === 'video') {
          console.log('📹 Video track received');
          // Don't create video element here - let the component handle it
          this.fireStreamCallback();
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
          this.isConnected = true;
          if (this.connectionTimeoutId) {
            clearTimeout(this.connectionTimeoutId);
            this.connectionTimeoutId = null;
          }
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }
        } else if (state === 'failed') {
          console.error('❌ WebRTC connection failed');
          if (!this.isConnected && this.onErrorCallback) {
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
          this.isConnected = true;
          if (this.connectionTimeoutId) {
            clearTimeout(this.connectionTimeoutId);
            this.connectionTimeoutId = null;
          }
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }
        } else if (state === 'failed') {
          console.error('❌ ICE connection failed');
          if (!this.isConnected && this.iceRestartCount < this.maxIceRestarts) {
            console.log('Attempting ICE restart...');
            this.iceRestartCount++;
            this.peerConnection?.restartIce();
          } else if (!this.isConnected && this.onErrorCallback) {
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
              this.isConnected = true;
              if (this.onConnectedCallback) {
                this.onConnectedCallback();
              }
            }
          }, 10000); // Reduced from 15s to 10s
        } else if (state === 'disconnected') {
          console.warn('⚠️ ICE disconnected');
        }
      };

      this.peerConnection.onsignalingstatechange = () => {
        const state = this.peerConnection?.signalingState;
        console.log('Signaling state:', state);

        // If we have a pending remote description (likely an answer) try to apply it
        // when we reach the expected signaling state.
        if (this.peerConnection && state === 'have-local-offer' && this.pendingRemoteDescription) {
          (async () => {
            try {
              console.log('Attempting to apply pending remote description after signaling state change');
              const normalized = {
                ...this.pendingRemoteDescription!,
                sdp: this.removeProblematicExtensions(this.pendingRemoteDescription!.sdp || '')
              };
              await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(normalized));
              console.log('Pending remote description applied successfully');
              this.pendingRemoteDescription = null;
              await this.flushCandidateQueue();
            } catch (err) {
              console.warn('Failed to apply pending remote description on signaling change:', err);
            }
          })();
        }
      };

      this.peerConnection.onnegotiationneeded = async () => {
        console.log('Negotiation needed, makingOffer:', this.makingOffer);
        if (this.makingOffer || !this.isInitiator || this.iceRestartInProgress) return;
        
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
        
        if (pc.signalingState === 'stable' && !pc.remoteDescription) {
          console.log('Setting remote description from offer');
          try {
            // Normalize the offer SDP before setting it
            const normalizedOffer = {
              ...offer,
              sdp: this.removeProblematicExtensions(offer.sdp || '')
            };
            await pc.setRemoteDescription(new RTCSessionDescription(normalizedOffer));
            
            const answer = await pc.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            // Normalize the answer SDP as well
            const normalizedAnswer = {
              ...answer,
              sdp: this.removeProblematicExtensions(answer.sdp || '')
            };
            await pc.setLocalDescription(normalizedAnswer);
            console.log('Answer created and set as local description');
            this.localDescriptionSet = true;
            
            await this.sendSignal({ type: 'answer', answer: normalizedAnswer });
            await this.flushCandidateQueue();
          } catch (err) {
            console.error('Error handling offer:', err);
          }
        } else {
          console.log('Ignoring offer - signalingState:', pc.signalingState, 'remoteDescription:', !!pc.remoteDescription);
        }
      } 
      else if (signalData.type === 'answer') {
        const answer = signalData.answer as RTCSessionDescriptionInit;
        console.log('Received answer, signalingState:', pc.signalingState, 'remoteDescription:', !!pc.remoteDescription);

        if (pc.signalingState === 'have-local-offer' && !pc.remoteDescription) {
          console.log('Setting remote description from answer');
          try {
            // Clean the answer SDP BEFORE trying to set it (same as offer)
            const normalizedAnswer = {
              ...answer,
              sdp: this.removeProblematicExtensions(answer.sdp || '')
            };
            await pc.setRemoteDescription(new RTCSessionDescription(normalizedAnswer));
            console.log('Remote description set from answer');
            await this.flushCandidateQueue();
          } catch (error) {
            console.error('Failed to set remote description:', error);
            // If we can't set it now, queue it for later when signaling state changes
            this.pendingRemoteDescription = answer;
            console.log('Queued answer to apply later when signaling state changes');
          }
        } else {
          // Not ready to apply the answer now - queue and wait for signaling state change
          this.pendingRemoteDescription = answer;
          console.log('Queuing remote answer for later application - current signalingState:', pc.signalingState);
        }
      }
      else if (signalData.type === 'ice-candidate') {
        const candidateData = signalData.candidate as RTCIceCandidateInit;
        if (candidateData) {
          const candidate = candidateData.candidate || '';
          const type = candidate.includes('typ host') ? 'host' : 
                      candidate.includes('typ srflx') ? 'srflx' : 
                      candidate.includes('typ relay') ? 'relay' : 'unknown';
          
          if (pc.remoteDescription && !this.iceRestartInProgress) {
            console.log(`📥 Adding ICE candidate [${type}]:`, candidate.substring(0, 80));
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidateData));
              console.log('✅ ICE candidate added successfully');
            } catch (error) {
              // Improve ICE candidate handling for Unknown ufrag errors
              this.handleIceCandidateError(new RTCIceCandidate(candidateData), error);
            }
          } else if (this.iceRestartInProgress) {
            console.log(`📋 Queueing ICE candidate during restart [${type}]:`, candidate.substring(0, 80));
            this.candidateQueue.push(new RTCIceCandidate(candidateData));
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
      const candidatePairs: RTCIceCandidatePairStats[] = [];
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
      
      candidatePairs.forEach((pair) => {
        console.log('Candidate pair:', pair);
      });
    } catch (error) {
      console.warn('Failed to get ICE stats:', error);
    }
  }

  private async flushCandidateQueue(): Promise<void> {
    console.log(`Flushing ${this.candidateQueue.length} queued ICE candidates`);
    const failedCandidates: RTCIceCandidate[] = [];
    
    while (this.candidateQueue.length > 0) {
      const candidate = this.candidateQueue.shift();
      if (!candidate) continue;
      
      try {
        await this.peerConnection?.addIceCandidate(candidate);
        console.log('✅ Queued ICE candidate added successfully');
      } catch (err) {
        if (err instanceof DOMException && err.message.includes('Unknown ufrag')) {
          // Track retry count for this candidate
          const candidateKey = `${candidate.candidate}`;
          const retryCount = this.candidateRetryCount.get(candidateKey) || 0;
          
          if (retryCount < this.maxCandidateRetries) {
            console.warn(`Queueing candidate for retry (attempt ${retryCount + 1}/${this.maxCandidateRetries})`);
            this.candidateRetryCount.set(candidateKey, retryCount + 1);
            failedCandidates.push(candidate);
          } else {
            console.warn(`Dropping candidate after ${this.maxCandidateRetries} retries - Unknown ufrag error`);
            this.candidateRetryCount.delete(candidateKey);
          }
        } else {
          console.error('Failed to add ICE candidate (non-ufrag error):', err);
          // Don't retry non-ufrag errors
        }
      }
    }
    
    // Re-queue failed candidates for next attempt
    if (failedCandidates.length > 0) {
      this.candidateQueue.push(...failedCandidates);
    }
  }

  // Fix handleIceCandidateError method - prevent duplicate ICE restarts
  private async handleIceCandidateError(candidate: RTCIceCandidate, error: Error) {
    console.warn('Failed to add ICE candidate:', error);
    if (error.message.includes('Unknown ufrag')) {
      // Only restart ICE once and queue the candidate
      if (!this.iceRestartInProgress && this.iceRestartCount < this.maxIceRestarts) {
        console.log('Restarting ICE due to Unknown ufrag error (attempt', this.iceRestartCount + 1, ')');
        this.iceRestartInProgress = true;
        this.iceRestartCount++;
        this.peerConnection?.restartIce();
        // Queue the candidate for retry
        this.candidateQueue.push(candidate);
        // Wait for ICE restart to complete before flushing
        setTimeout(() => {
          this.iceRestartInProgress = false;
          console.log('ICE restart timeout - clearing restart flag');
          this.flushCandidateQueue();
        }, 3000); // Wait 3 seconds for ICE restart
      } else if (this.iceRestartInProgress) {
        // ICE restart in progress - queue the candidate
        console.log('ICE restart in progress - queueing candidate');
        this.candidateQueue.push(candidate);
      } else {
        // Max restarts reached - don't keep restarting
        console.warn('Max ICE restarts reached, dropping candidate with Unknown ufrag');
      }
    } else {
      console.warn('Dropping ICE candidate due to non-ufrag error:', error.message);
    }
  }

  // Enhance SDP normalization to handle additional cases
  private normalizeSDP(sdp: string): string {
    console.log('Normalizing SDP...');
    return sdp
      .replace(/a=extmap:\d+ http:\/\/www\.webrtc\.org\/experiments\/rtp-hdrext\/abs-send-time\r\n/g, '')
      .replace(/a=extmap:\d+ http:\/\/example\.com\/unsupported-extension\r\n/g, '');
  }

  private removeProblematicExtensions(sdp: string): string {
    // Remove RTP header extensions that cause compatibility issues
    const lines = sdp.split('\n');
    const filteredLines = lines.filter(line => {
      // Remove problematic extensions that can cause SDP mismatch errors
      if (line.includes('a=extmap:')) {
        // Log which extensions we're removing
        const match = line.match(/a=extmap:\d+\s+(.+?)\s/);
        if (match) {
          console.log('Removing extmap:', match[1]);
        }
        return false; // Remove this line
      }
      return true;
    });
    
    return filteredLines.join('\n');
  }

  private removeUnsupportedExtensions(sdp: string): string {
    // Remove unsupported extensions like abs-send-time
    return sdp.replace(/a=extmap:\d+ http:\/\/www\.webrtc\.org\/experiments\/rtp-hdrext\/abs-send-time\r\n/g, '');
  }

  private async createOffer(): Promise<void> {
    try {
      const offer = await this.peerConnection!.createOffer();
      // Normalize the offer SDP to remove problematic extensions
      const normalizedOffer = {
        ...offer,
        sdp: this.removeProblematicExtensions(offer.sdp!)
      };
      await this.peerConnection!.setLocalDescription(normalizedOffer);
      console.log('Offer created and set as local description');
      this.localDescriptionSet = true;
      await this.sendSignal({ type: 'offer', offer: normalizedOffer });
    } catch (err) {
      console.error('Error creating offer:', err);
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
