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
  private answerQueue: RTCSessionDescriptionInit[] = [];
  private peerReady = false;
  private remoteStream: MediaStream | null = null;
  private streamCallbackFired = false;
  private hasReceivedVideoTrack = false;
  private hasReceivedAudioTrack = false;
  private remoteTracksReceivedTime: number | null = null;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(sessionId: string, userId: string, isInitiator: boolean) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.isInitiator = isInitiator;
  }

  async initializePeer(localStream: MediaStream) {
    console.log('Initializing WebRTC peer, isInitiator:', this.isInitiator);
    this.localStream = localStream;

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
    // const remoteTracksReceived = false;

    // Add local stream
    localStream.getTracks().forEach((track, index) => {
      console.log(`Adding track ${index}:`, track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState);
      const sender = this.peerConnection?.addTrack(track, localStream);
      console.log(`Track ${index} added, sender:`, sender?.track.kind);
    });

    console.log('Total local tracks added:', localStream.getTracks().length);

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('🎥 ontrack event - kind:', event.track.kind, 'id:', event.track.id, 'enabled:', event.track.enabled);
      
      // CRITICAL: Check if this is self-loopback (doctor's own tracks echoed back)
      const localTrackIds = this.localStream?.getTracks().map(t => t.id) || [];
      const isSelfLoopback = localTrackIds.includes(event.track.id);
      console.log('🎥 Local track IDs:', localTrackIds, 'Received track ID:', event.track.id, 'Is self-loopback:', isSelfLoopback);
      
      if (isSelfLoopback) {
        console.log('❌ 🎥 IGNORING SELF-LOOPBACK TRACK - this is our own track being echoed');
        return;
      }
      
      // Record when we first receive remote tracks
      if (!this.remoteTracksReceivedTime) {
        this.remoteTracksReceivedTime = Date.now();
        console.log('🎥 First remote track received at:', new Date(this.remoteTracksReceivedTime).toISOString());
      }
      
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        console.log('🎥 Creating new remote MediaStream');
      }
      
      this.remoteStream.addTrack(event.track);
      console.log('🎥 Added remote track to stream, total tracks:', this.remoteStream.getTracks().length);
      
      // Track which types of tracks we've received from ACTUAL remote peer
      if (event.track.kind === 'video') {
        this.hasReceivedVideoTrack = true;
      } else if (event.track.kind === 'audio') {
        this.hasReceivedAudioTrack = true;
      }
      
      // Check if we should fire callback
      const allTracks = this.remoteStream.getTracks();
      const enabledTracks = allTracks.filter(t => t.enabled && t.readyState === 'live');
      const hasAtLeastTwoTrackTypes = this.hasReceivedVideoTrack && this.hasReceivedAudioTrack;
      
      console.log('🎥 Remote stream has', allTracks.length, 'total tracks, enabled count:', enabledTracks.length);
      console.log('🎥 Has video:', this.hasReceivedVideoTrack, 'Has audio:', this.hasReceivedAudioTrack, 'Both:', hasAtLeastTwoTrackTypes);
      
      // Only fire once - require BOTH video and audio tracks from actual remote peer
      if (hasAtLeastTwoTrackTypes && enabledTracks.length >= 2 && this.onStreamCallback && !this.streamCallbackFired) {
        console.log('✅ 🎥 FIRING CALLBACK - valid remote peer with video and audio');
        this.streamCallbackFired = true;
        this.onStreamCallback(this.remoteStream);
      } else {
        const reason = !hasAtLeastTwoTrackTypes ? 'missing video/audio' : 
                      enabledTracks.length < 2 ? `only ${enabledTracks.length} enabled` :
                      this.streamCallbackFired ? 'already fired' : 'unknown';
        console.log(`❌ 🎥 NOT FIRING - reason: ${reason}`);
      }
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
        // Verify we actually have remote tracks before reporting connected
        const hasRemoteTracks = this.remoteStream && this.remoteStream.getTracks().length > 0;
        const hasRemoteVideo = this.remoteStream?.getVideoTracks().some(t => t.readyState === 'live');
        
        console.log('[WebRTC] Connection state is "connected", checking for remote media...');
        console.log('  - Has remote tracks:', hasRemoteTracks);
        console.log('  - Has remote video:', hasRemoteVideo);
        
        if (hasRemoteVideo) {
          console.log('[WebRTC] ✅ WebRTC connection established via connection state with remote video!');
          if (this.onConnectedCallback) {
            this.onConnectedCallback();
          }
        } else {
          console.warn('[WebRTC] ⚠️ Connection state is "connected" but no remote video - waiting for media');
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
    
    // CRITICAL: Only accept if tracks have been present for at least 5 seconds
    // This prevents accepting premature connections before the actual peer joins
    const tracksPresentDuration = this.remoteTracksReceivedTime ? Date.now() - this.remoteTracksReceivedTime : 0;
    const tracksStableEnough = tracksPresentDuration >= 5000; // 5 seconds

    console.log('🔄 Fallback connection check:');
    console.log('  - Local description:', hasLocalDescription);
    console.log('  - Remote description:', hasRemoteDescription);
    console.log('  - Remote tracks:', this.remoteStream?.getTracks().length || 0);
    console.log('  - Signaling state:', signalingState);
    console.log('  - Connection state:', this.peerConnection.connectionState);
    console.log('  - ICE state:', this.peerConnection.iceConnectionState);
    console.log('  - Tracks present for:', tracksPresentDuration, 'ms (need 5000ms)');

    // STRICT: Only accept as valid if:
    // 1. We have BOTH descriptions
    // 2. Signaling is stable
    // 3. We have remote tracks that have been present for 5+ seconds
    // 4. We have video tracks that are actually live
    if (hasLocalDescription && hasRemoteDescription && signalingState === 'stable' && hasRemoteTracks && tracksStableEnough) {
      console.log('✅ FALLBACK: Valid connection detected (stable SDP + remote tracks for 5+ seconds)');
      // Extra validation: make sure we have VIDEO tracks if this was a video call
      const hasVideoTrack = this.remoteStream?.getVideoTracks().some(t => t.readyState === 'live');
      if (hasVideoTrack) {
        console.log('   Media flow detected with active video - connection appears valid for relay networks');
        // NOTE: NOT firing onConnectedCallback here - only real ICE connection state should trigger that
        return true;
      } else {
        console.log('⚠️ FALLBACK: Has SDP but no active video tracks yet');
        return false;
      }
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
    this.pollInterval = setInterval(poll, 3000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }



  private async handleSignal(signalData: Record<string, unknown>) {
    if (!this.peerConnection) return;

    console.log('🔄 Handling signal:', signalData.type, 'Signaling state:', this.peerConnection.signalingState, 'Connection state:', this.peerConnection.connectionState);

    try {
      if (signalData.type === 'offer') {
        console.log('🔄 Received offer, creating answer');
        const offer = signalData.offer as RTCSessionDescriptionInit;
        if (offer.sdp) {
          console.log('🔄 Offer SDP length:', offer.sdp.length, 'type:', offer.type);
        }
        // Only process offer if we don't already have a remote description
        if (!this.peerConnection.remoteDescription) {
          try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
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
        const answer = signalData.answer as RTCSessionDescriptionInit;
        if (answer.sdp) {
          console.log('🔄 Answer SDP length:', answer.sdp.length, 'type:', answer.type);
        }
        // Only process answer if we have a local description (sent an offer)
        if (this.peerConnection.localDescription) {
          if (!this.peerConnection.remoteDescription) {
            try {
              await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
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
          this.answerQueue.push(answer);
        }
      } else if (signalData.type === 'ice-candidate') {
        console.log('🔄 Received ICE candidate');
        const candidateData = signalData.candidate as RTCIceCandidateInit | null;
        // Fix 1: Buffer ICE until remote description is set
        if (this.peerConnection.remoteDescription) {
          try {
            if (candidateData && candidateData.candidate) {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
              console.log('🔄 ICE candidate added successfully:', candidateData.candidate.substring(0, 50));
            } else {
              console.log('🔄 ICE candidate is null/empty (end of candidates)');
            }
          } catch (error) {
            console.warn('🔄 Failed to add ICE candidate:', error);
          }
        } else {
          console.log('🔄 Remote description not set yet, queuing candidate');
          if (candidateData && candidateData.candidate) {
            this.candidateQueue.push(candidateData as RTCIceCandidate);
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
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    // Reset state for next connection
    this.streamCallbackFired = false;
    this.hasReceivedVideoTrack = false;
    this.hasReceivedAudioTrack = false;
    this.remoteTracksReceivedTime = null;
    this.remoteStream = null;
  }
}