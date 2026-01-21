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
  private onConnectedCallback?: () => void;
  private unsubscribe?: () => void;
  private processedSignals = new Set<string>();
  private candidateQueue: RTCIceCandidate[] = [];
  private answerQueue: RTCSessionDescriptionInit[] = [];
  private peerReady = false;
  private remoteStream: MediaStream | null = null;

  constructor(sessionId: string, userId: string, isInitiator: boolean) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
  }

  async initializePeer(localStream: MediaStream) {
    console.log('Initializing WebRTC peer, isInitiator:', this.isInitiator);

    // Configure multiple TURN servers for better network traversal
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Multiple TURN servers for redundancy
      { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:coturn.example.com:3478', username: 'user', credential: 'pass' },
      // Backup TURN servers
      { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ];

    this.peerConnection = new RTCPeerConnection({
      iceServers: iceServers,
      iceTransportPolicy: 'all', // Allow both host and srflx candidates, prefer relay
      iceCandidatePoolSize: 10, // Gather more candidates
      bundlePolicy: 'max-bundle'
    });

    // Track if we've seen remote tracks (indicating connection is working)
    let remoteTracksReceived = false;

    // Add local stream
    localStream.getTracks().forEach((track, index) => {
      console.log(`Adding track ${index}:`, track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState);
      const sender = this.peerConnection?.addTrack(track, localStream);
      console.log(`Track ${index} added, sender:`, sender?.track.kind);
    });

    console.log('Total local tracks added:', localStream.getTracks().length);

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('🎥 Received remote track:', event.track.kind, 'enabled:', event.track.enabled, 'readyState:', event.track.readyState);
      
      // Create or use existing remote stream
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        console.log('🎥 Creating new remote MediaStream');
      }
      
      // Add track to remote stream
      this.remoteStream.addTrack(event.track);
      console.log('🎥 Added track to remote stream, total tracks:', this.remoteStream.getTracks().length);
      console.log('🎥 Remote stream ID:', this.remoteStream.id);
      console.log('🎥 Tracks:', this.remoteStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
      
      // Check if we now have both audio and video
      const tracks = this.remoteStream.getTracks();
      const hasAudio = tracks.some(t => t.kind === 'audio');
      const hasVideo = tracks.some(t => t.kind === 'video');
      if (hasAudio && hasVideo) {
        console.log('✅ Got both audio and video tracks - connection is working!');
        // Check connection state
        if (this.peerConnection?.connectionState !== 'connected') {
          console.log('⚠️ Note: Connection state is still', this.peerConnection?.connectionState, 'but media is flowing');
        }
      }
      
      // Callback with the complete remote stream
      if (this.onStreamCallback) {
        console.log('🎥 Calling onStream callback with remote stream');
        this.onStreamCallback(this.remoteStream);
      } else {
        console.warn('🎥 WARNING: onStreamCallback not set!');
      }
      // Don't call onConnectedCallback here - wait for ICE to actually complete
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log('❄️ Generated ICE candidate:', event.candidate.candidate.substring(0, 50));
        await this.sendSignal({ type: 'ice-candidate', candidate: event.candidate });
      } else {
        console.log('❄️ ICE candidate gathering complete (null candidate)');
      }
    };

    // Handle signaling state changes
    this.peerConnection.onsignalingstatechange = () => {
      console.log('📡 Signaling state changed:', this.peerConnection?.signalingState);
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log(`[WebRTC] 🌐 Connection state changed: ${state}`);
      
      if (state === 'connected') {
        console.log('[WebRTC] ✅ WebRTC connection established via connection state!');
        if (this.onConnectedCallback) {
          this.onConnectedCallback();
        }
      } else if (state === 'connecting' || (state as string) === 'checking') {
        // Try fallback check if stuck in connecting/checking for more than 3 seconds
        setTimeout(() => {
          if (this.peerConnection?.connectionState === 'connecting' || (this.peerConnection?.connectionState as string) === 'checking') {
            console.log('[WebRTC] 🔄 Checking for media flow despite connection state...');
            this.checkFallbackConnection();
          }
        }, 3000);
      } else if (state === 'failed') {
        console.error('[WebRTC] ❌ Connection FAILED - network/firewall blocking P2P');
      } else if (state === 'disconnected') {
        console.warn('[WebRTC] ⚠️ Connection disconnected');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTC] ❄️ ICE connection state: ${state}`);
      
      if (state === 'failed') {
        console.error('[WebRTC] ❌ ICE connection FAILED! Network/firewall issue.');
      }
    };

    // Start signaling
    this.unsubscribe = this.subscribeToSignals();

    // Monitor connection progress and diagnose issues
    this.monitorConnectionHealth();

    // Fix 3: Only create offer after peer is ready
    if (this.isInitiator) {
      console.log('Waiting for peer to be ready before creating offer');
      // Don't create offer immediately - wait for peer ready signal
    } else {
      // Non-initiator (patient) should also try to create offer if initiator doesn't
      console.log('Non-initiator ready, waiting for offer from doctor');
    }

    // Always announce readiness so the other peer knows we are online
    await this.sendSignal({ type: 'ready' });
    
    // If initiator (doctor), create offer immediately after sending ready signal
    if (this.isInitiator) {
      // Give a tiny delay to ensure ready signal is processed
      setTimeout(async () => {
        if (this.peerConnection && !this.peerConnection.localDescription) {
          console.log('Creating offer as initiator after ready signal');
          await this.createOffer();
        }
      }, 100);
    }
  }

  private checkFallbackConnection() {
    // For networks where TURN doesn't work, we can still have a valid connection
    // if both sides have exchanged SDP and can transmit media via signaling channel
    if (!this.peerConnection) return;

    const hasLocalDescription = this.peerConnection.localDescription !== null;
    const hasRemoteDescription = this.peerConnection.remoteDescription !== null;
    const signalingState = this.peerConnection.signalingState;
    const hasRemoteTracks = this.remoteStream && this.remoteStream.getTracks().length > 0;

    console.log('🔄 Fallback connection check:');
    console.log('  - Local description:', hasLocalDescription);
    console.log('  - Remote description:', hasRemoteDescription);
    console.log('  - Remote tracks:', this.remoteStream?.getTracks().length || 0);
    console.log('  - Signaling state:', signalingState);
    console.log('  - Connection state:', this.peerConnection.connectionState);
    console.log('  - ICE state:', this.peerConnection.iceConnectionState);

    // STRICT: Only accept as valid if we have BOTH descriptions, stable signaling, AND remote tracks
    // This ensures both sides are truly ready before accepting connection
    if (hasLocalDescription && hasRemoteDescription && signalingState === 'stable' && hasRemoteTracks) {
      console.log('✅ FALLBACK: Valid connection detected (SDP + remote tracks present)');
      if (this.onConnectedCallback) {
        console.log('   Triggering connection callback');
        this.onConnectedCallback();
      }
      return true;
    }

    console.log('❌ Fallback check failed - missing required conditions');
    console.log('   Required: local SDP ✓, remote SDP ✓, stable signaling ✓, remote tracks ✓');
    return false;
  }

  private monitorConnectionHealth() {
    if (!this.peerConnection) return;

    let checksWithoutConnection = 0;
    let mediaFlowDetected = false;
    let fallbackCheckAttempted = false;

    // Monitor connection state every 5 seconds
    const healthCheckInterval = setInterval(() => {
      if (!this.peerConnection) {
        clearInterval(healthCheckInterval);
        return;
      }

      const connectionState = this.peerConnection.connectionState;
      const iceConnectionState = this.peerConnection.iceConnectionState;
      const signalingState = this.peerConnection.signalingState;

      // Log diagnostics every 5 seconds if not connected
      if (connectionState !== 'connected') {
        checksWithoutConnection++;
        console.log(`📊 Connection Health Check (${checksWithoutConnection}): connection=${connectionState} ice=${iceConnectionState} signaling=${signalingState}`);
        
        // Try fallback check after 2 checks (10 seconds) without triggering callback yet
        if (checksWithoutConnection === 2 && !fallbackCheckAttempted && !mediaFlowDetected) {
          fallbackCheckAttempted = true;
          console.log('[WebRTC] 📊 Attempting fallback connection check after 10 seconds stuck...');
          this.checkFallbackConnection();
        }

        // Try to get stats for better diagnostics
        this.peerConnection.getStats().then(stats => {
          let relayCandidate = false;
          let mediaPackets = 0;
          let bytesReceived = 0;
          let bytesSent = 0;
          let activePair = null;

          stats.forEach(report => {
            // Check for relay (TURN) candidates
            if (report.type === 'candidate' && report.candidateType === 'relay') {
              relayCandidate = true;
            }
            
            // Check for active candidate pairs
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              activePair = report;
            }

            // Check for media packets flowing
            if (report.type === 'inbound-rtp') {
              mediaPackets += report.packetsReceived || 0;
              bytesReceived += report.bytesReceived || 0;
            }
            if (report.type === 'outbound-rtp') {
              mediaPackets += report.packetsSent || 0;
              bytesSent += report.bytesSent || 0;
            }
          });

          // If stuck at checking but have relay candidates or media flowing, that's good
          if (iceConnectionState === 'checking') {
            if (relayCandidate) {
              console.log('✅ TURN relay candidate available - connection may establish via relay');
            }
            if (mediaPackets > 0) {
              console.log(`✅ Media packets detected! (recv: ${bytesReceived} bytes, sent: ${bytesSent} bytes) - Connection working!`);
              mediaFlowDetected = true;
              // Consider connection successful if media is flowing
              if (!mediaFlowDetected && this.onConnectedCallback) {
                this.onConnectedCallback();
              }
            }
            if (activePair) {
              console.log(`✅ Active candidate pair: ${activePair.currentRoundTripTime?.toFixed(3)}ms RTT`);
            }
          }

          // Standard diagnostics if no improvements
          if (!relayCandidate && !activePair && mediaPackets === 0 && iceConnectionState === 'checking' && connectionState === 'connecting') {
            console.warn('⚠️ ICE stuck at checking - this may indicate network/firewall issues');
            console.warn('🔍 Potential causes: Different networks, firewall blocking P2P, STUN/TURN not working');
            console.log('❌ No active candidate pairs, relay candidates, or media packets found');
          }
        });
      } else if (connectionState === 'connected') {
        console.log('✅ Connection established, stopping health checks');
        clearInterval(healthCheckInterval);
      }

      // Force cleanup after 120 seconds of monitoring without connection
      if (checksWithoutConnection > 24) {
        console.warn('⚠️ Connection check timeout - still not connected after 120 seconds');
        console.warn('   This indicates a network connectivity issue (firewall/NAT blocking)');
        console.warn('   Diagnosis: TURN servers not working or P2P connection impossible');
        clearInterval(healthCheckInterval);
      }
    }, 5000);

    // Clear on disconnect
    this.peerConnection.onconnectionstatechange = ((prev) => {
      return () => {
        if (this.peerConnection?.connectionState === 'disconnected' || this.peerConnection?.connectionState === 'failed') {
          clearInterval(healthCheckInterval);
        }
        // Call original handler
        prev?.call(this.peerConnection);
      };
    })(this.peerConnection.onconnectionstatechange);
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
      }
    });

    channel.subscribe((status) => {
      console.log('Channel subscription status:', status);
    });

    // Start polling as backup since real-time often fails
    this.startPolling();

    return () => {
      console.log('Unsubscribing from WebRTC signals');
      channel.unsubscribe();
      this.stopPolling();
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
          .limit(10); // Limit to prevent processing too many at once

        if (!error && data && data.length > 0) {
          console.log('Found signals via polling:', data.length);
          for (const signal of data) {
            // Skip if already processed
            if (this.processedSignals.has(signal.id)) {
              continue;
            }

            console.log('Processing polled signal:', signal.signal_data.type);
            this.processedSignals.add(signal.id);
            await this.handleSignal(signal.signal_data);

            // Delete processed signal immediately
            await supabase.from('webrtc_signals').delete().eq('id', signal.id);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Poll immediately and then every 3 seconds (slower to reduce load)
    poll();
    (this as any).pollInterval = setInterval(poll, 3000);
  }

  private stopPolling() {
    if ((this as any).pollInterval) {
      clearInterval((this as any).pollInterval);
      (this as any).pollInterval = null;
    }
  }



  private async handleSignal(signalData: any) {
    if (!this.peerConnection) return;

    console.log('🔄 Handling signal:', signalData.type, 'Signaling state:', this.peerConnection.signalingState, 'Connection state:', this.peerConnection.connectionState);

    try {
      if (signalData.type === 'offer') {
        console.log('🔄 Received offer, creating answer');
        if (signalData.offer.sdp) {
          console.log('🔄 Offer SDP length:', signalData.offer.sdp.length, 'type:', signalData.offer.type);
        }
        // Only process offer if we don't already have a remote description
        if (!this.peerConnection.remoteDescription) {
          try {
            await this.peerConnection.setRemoteDescription(signalData.offer);
            console.log('🔄 Remote description set successfully, signaling state:', this.peerConnection.signalingState);
            await this.flushCandidateQueue(); // Flush any queued candidates
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            console.log('🔄 Answer created and set as local description');
            await this.sendSignal({ type: 'answer', answer });
          } catch (err) {
            console.error('🔄 Error processing offer:', err);
            throw err;
          }
        } else {
          console.log('🔄 Offer already processed, ignoring duplicate');
        }
      } else if (signalData.type === 'answer') {
        console.log('🔄 Received answer');
        if (signalData.answer.sdp) {
          console.log('🔄 Answer SDP length:', signalData.answer.sdp.length, 'type:', signalData.answer.type);
        }
        // Only process answer if we have a local description (sent an offer)
        if (this.peerConnection.localDescription) {
          if (!this.peerConnection.remoteDescription) {
            try {
              await this.peerConnection.setRemoteDescription(signalData.answer);
              console.log('🔄 Remote description set successfully, signaling state:', this.peerConnection.signalingState);
              await this.flushCandidateQueue(); // Flush any queued candidates
            } catch (err) {
              console.error('🔄 Error processing answer:', err);
              throw err;
            }
          } else {
            console.log('🔄 Answer already processed, ignoring duplicate');
          }
        } else {
          // Queue answer until local description is set
          console.log('🔄 No local description yet, queueing answer. Local state:', this.peerConnection.signalingState);
          this.answerQueue.push(signalData.answer);
        }
      } else if (signalData.type === 'ice-candidate') {
        console.log('🔄 Received ICE candidate');
        // Fix 1: Buffer ICE until remote description is set
        if (this.peerConnection.remoteDescription) {
          try {
            if (signalData.candidate && signalData.candidate.candidate) {
              await this.peerConnection.addIceCandidate(signalData.candidate);
              console.log('🔄 ICE candidate added successfully:', signalData.candidate.candidate.substring(0, 50));
            } else {
              console.log('🔄 ICE candidate is null/empty (end of candidates)');
            }
          } catch (error) {
            console.warn('🔄 Failed to add ICE candidate:', error);
          }
        } else {
          console.log('🔄 Remote description not set yet, queuing candidate');
          if (signalData.candidate && signalData.candidate.candidate) {
            this.candidateQueue.push(signalData.candidate);
            console.log('🔄 Queued. Total queued candidates:', this.candidateQueue.length);
          }
        }
      } else if (signalData.type === 'ready') {
        console.log('🔄 Received ready signal from peer');
        this.peerReady = true;
        // Fix 3: Create offer only after peer is ready
        if (this.isInitiator && !this.peerConnection.localDescription) {
          console.log('🔄 Peer is ready, creating offer immediately');
          try {
            await this.createOffer();
            console.log('🔄 Offer created successfully after peer ready signal');
          } catch (err) {
            console.error('🔄 Failed to create offer after peer ready signal:', err);
          }
        } else if (this.isInitiator) {
          console.log('🔄 Already have local description, offer already sent');
        }
      } else {
        console.log('🔄 Ignoring signal due to wrong state:', signalData.type, 'State:', this.peerConnection.signalingState);
      }
    } catch (error) {
      console.error('🔄 Error handling signal:', error);
    }
  }

  private async flushCandidateQueue() {
    if (!this.peerConnection || this.candidateQueue.length === 0) return;

    console.log(`🔄 Flushing ${this.candidateQueue.length} queued ICE candidates`);
    while (this.candidateQueue.length > 0) {
      const candidate = this.candidateQueue.shift();
      if (candidate && candidate.candidate) {
        try {
          await this.peerConnection.addIceCandidate(candidate);
          console.log('🔄 Queued ICE candidate added successfully');
        } catch (error) {
          console.warn('🔄 Failed to add queued ICE candidate:', error);
        }
      }
    }
  }

  private async flushAnswerQueue() {
    if (!this.peerConnection || this.answerQueue.length === 0) return;

    console.log(`🔄 Flushing ${this.answerQueue.length} queued answers`);
    while (this.answerQueue.length > 0) {
      const answer = this.answerQueue.shift();
      if (answer && !this.peerConnection.remoteDescription) {
        try {
          await this.peerConnection.setRemoteDescription(answer);
          console.log('🔄 Queued answer set as remote description successfully');
          await this.flushCandidateQueue(); // Also flush any ICE candidates that were waiting
        } catch (error) {
          console.error('🔄 Failed to set queued answer:', error);
        }
      }
    }
  }



  private async createOffer() {
    if (!this.peerConnection) return;

    try {
      console.log('🔄 Creating offer, signaling state:', this.peerConnection.signalingState);
      const offer = await this.peerConnection.createOffer();
      console.log('🔄 Offer created, setting as local description');
      await this.peerConnection.setLocalDescription(offer);
      console.log('🔄 Local description set, sending offer signal');
      console.log('🔄 Offer SDP:', offer.sdp.substring(0, 200));
      await this.sendSignal({ type: 'offer', offer });
      // Flush any queued answers now that we have a local description
      await this.flushAnswerQueue();
    } catch (error) {
      console.error('🔄 Error creating offer:', error);
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

  destroy() {
    this.stopPolling();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}