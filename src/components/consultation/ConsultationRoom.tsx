import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, MessageSquare,
  Send, X, User, AlertCircle, Camera, Users, Maximize2,
  Minimize2, MoreVertical, Hand, Monitor, Settings,
  PhoneOff, ChevronRight, ChevronLeft, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { consultationService } from '@/services/consultationService';
import { supabase } from '@/integrations/supabase/client';
import { WebRTCService, type WebRTCSignal } from '@/services/webrtcService';

interface Message {
  id: string;
  sender: 'user' | 'remote';
  senderName: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'file';
}

interface ConsultationRoomProps {
  appointmentId: string;
  consultationType: 'video' | 'audio' | 'chat';
  participantName: string;
  participantRole: 'doctor' | 'patient';
  onEndCall: () => void;
}

export function ConsultationRoom({
  appointmentId,
  consultationType,
  participantName,
  participantRole,
  onEndCall
}: ConsultationRoomProps) {
  const { user } = useAuth();
  const [isVideoEnabled, setIsVideoEnabled] = useState(consultationType === 'video');
  const [isAudioEnabled, setIsAudioEnabled] = useState(consultationType !== 'chat');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [callDuration, setCallDuration] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [streamInitialized, setStreamInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [isParticipantConnected, setIsParticipantConnected] = useState(false);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(true);
  const [webrtcService, setWebrtcService] = useState<WebRTCService | null>(null);
  const [isAdmitted, setIsAdmitted] = useState(false);
  const [isPatientWaiting, setIsPatientWaiting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsPanelOpen, setIsParticipantsPanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoPIPRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const participantInitials = participantName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const myName = participantRole === 'doctor' ? 'Dr. You' : 'You';

  // Format duration
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Initialize consultation session
  useEffect(() => {
    const initializeSession = async () => {
      if (!user || !appointmentId) {
        setError('Missing user or appointment information');
        setIsLoading(false);
        return;
      }

      try {
        console.log('[Init] Starting consultation room initialization');
        let session = await consultationService.getSessionByAppointmentId(appointmentId);
        console.log('[Init] getSessionByAppointmentId returned:', session ? session.id : 'null');
        let patientId: string | null = null;
        let doctorId: string | null = null;

        // Check if the existing session is stale (ended or too old)
        // If we're rejoining after an ended session, create a NEW one to avoid old signals
        let isStaleSession = false;
        if (session) {
          // Check if session is explicitly ended
          if (session.status === 'ended') {
            isStaleSession = true;
            console.log('[Session] Previous session was ended at:', session.ended_at, 'Creating new session for rejoin');
          }
          // Also check if session has ended_at timestamp (session was completed)
          else if (session.ended_at) {
            isStaleSession = true;
            console.log('[Session] Previous session was ended, creating new session for rejoin');
          }
        }

        if (!session || isStaleSession) {
          console.log('[Session] Fetching appointment data for:', appointmentId);
          const { data: appointmentData, error: appointmentError } = await supabase
            .from('appointments')
            .select('patient_id, doctor_id')
            .eq('id', appointmentId)
            .single();

          if (appointmentError) {
            console.error('[Session] Error fetching appointment:', appointmentError);
            throw new Error(`Failed to get appointment data: ${appointmentError.message}`);
          }

          if (!appointmentData) {
            throw new Error('Appointment not found');
          }

          patientId = appointmentData.patient_id;
          doctorId = appointmentData.doctor_id;

          console.log('[Session] Creating new consultation session for appointment:', appointmentId, 'patient:', patientId, 'doctor:', doctorId);
          session = await consultationService.createSession(
            appointmentId,
            patientId,
            doctorId,
            consultationType
          );
          console.log('[Session] Created new consultation session:', session.id);
        } else {
          patientId = session.patient_id;
          doctorId = session.doctor_id;
          console.log('[Session] Using existing active session:', session.id);
        }

        if (participantRole === 'doctor') {
          setIsAdmitted(true);
          setConnectionStatus('connecting'); // Reset to connecting for doctor
        }

        // Set up lobby signal listener
        const lobbyChannel = supabase.channel(`lobby:${session.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'webrtc_signals',
              filter: `session_id=eq.${session.id}`
            },
            (payload: { new: WebRTCSignal }) => {
              const signal = payload.new;
              console.log('[Lobby] Received signal:', signal.signal_data?.type, 'from:', signal.sender_id, 'myId:', user?.id);
              if (signal.sender_id !== user?.id) {
                if (participantRole === 'doctor' && signal.signal_data?.type === 'join_lobby') {
                  console.log('[Lobby] 🔔 Doctor - Patient is waiting! Setting isPatientWaiting');
                  setIsPatientWaiting(true);
                  toast({
                    title: 'Patient Waiting',
                    description: 'A patient has joined the waiting room.',
                  });
                } else if (participantRole === 'patient' && signal.signal_data?.type === 'admit_patient') {
                  setIsAdmitted(true);
                  toast({
                    title: 'Admitted',
                    description: 'The doctor has admitted you to the call.',
                  });
                } else if (participantRole === 'doctor' && signal.signal_data?.type === 'patient_admitted_acknowledge') {
                  setIsPatientWaiting(false);
                }
              }
            }
          )
          .subscribe();

        lobbyChannelRef.current = lobbyChannel;

        // For doctors: check if patient already sent join_lobby before subscription was ready
        // IMPORTANT: Only check signals created AFTER the current session started AND within the last 2 minutes
        // This prevents false notifications from old signals in previous sessions
        if (participantRole === 'doctor') {
          console.log('[Lobby] Doctor checking for existing join_lobby signals...');
          console.log('[Lobby] Session started_at:', session.started_at, 'current session id:', session.id);
          
          // Only consider signals from the last 2 minutes as "patient waiting"
          const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          
          const { data: existingSignals, error: queryError } = await supabase
            .from('webrtc_signals')
            .select('*')
            .eq('session_id', session.id)
            .eq('signal_data->>type', 'join_lobby')
            .neq('sender_id', user.id)
            .gte('created_at', twoMinutesAgo);  // Only signals from the last 2 minutes
          
          if (queryError) {
            console.error('[Lobby] Error checking for existing signals:', queryError);
          } else if (existingSignals && existingSignals.length > 0) {
            console.log('[Lobby] 🔔 Doctor - Found recent join_lobby signals! Patient is waiting');
            console.log('[Lobby] Existing signals count:', existingSignals.length, 'From:', twoMinutesAgo);
            setIsPatientWaiting(true);
            toast({
              title: 'Patient Waiting',
              description: 'A patient is waiting in the lobby.',
            });
          } else {
            console.log('[Lobby] Doctor - No recent join_lobby signals found (last 2 mins)');
          }
        }

        if (participantRole === 'patient') {
          console.log('[Lobby] Patient sending join_lobby signal for session:', session.id);
          const { error: insertError } = await supabase.from('webrtc_signals').insert({
            session_id: session.id,
            sender_id: user.id,
            signal_data: { type: 'join_lobby' }
          });
          if (insertError) {
            console.error('Error sending join_lobby signal:', insertError);
          } else {
            console.log('[Lobby] ✅ join_lobby signal sent successfully');
          }
        }

        setSessionId(session.id);

        console.log('[Init] Fetching existing messages for session:', session.id);
        const existingMessages = await consultationService.getMessages(session.id);
        console.log('[Init] Fetched', existingMessages.length, 'existing messages');
        setMessages(existingMessages.map(msg => ({
          id: msg.id,
          sender: msg.sender_id === user?.id ? 'user' : 'remote',
          senderName: msg.sender_name,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          type: msg.message_type as 'text' | 'file'
        })));

        console.log('[Init] Subscribing to messages for session:', session.id);
        const unsubscribe = consultationService.subscribeToMessages(
          session.id,
          (dbMessage) => {
            if (dbMessage.sender_id !== user?.id) {
              setMessages(prev => [...prev, {
                id: dbMessage.id,
                sender: 'remote',
                senderName: dbMessage.sender_name,
                content: dbMessage.content,
                timestamp: new Date(dbMessage.created_at),
                type: dbMessage.message_type as 'text' | 'file'
              }]);
            }
          }
        );
        console.log('[Init] Message subscription created');

        unsubscribeRef.current = unsubscribe;
        setIsLoading(false);
        console.log('[Init] Session initialization complete!');
      } catch (err) {
        console.error('Error initializing session:', err);
        if (err instanceof Error) {
          console.error('Error message:', err.message);
          console.error('Error stack:', err.stack);
        }
        setError(err instanceof Error ? err.message : 'Failed to initialize consultation');
        setIsLoading(false);
      }
    };

    initializeSession();

    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      if (lobbyChannelRef.current) lobbyChannelRef.current.unsubscribe();
    };
  }, [user, appointmentId, participantRole, consultationType]);

  // Timer effect
  useEffect(() => {
    if (connectionStatus === 'connected') {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [connectionStatus]);

  // Monitor remote video track changes
  useEffect(() => {
    if (!hasRemoteStream || !remoteVideoRef.current?.srcObject) return;

    const stream = remoteVideoRef.current.srcObject as MediaStream;
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (videoTrack) {
      setRemoteVideoEnabled(videoTrack.enabled);
      const handleVideoChange = () => setRemoteVideoEnabled(videoTrack.enabled);
      videoTrack.addEventListener('ended', () => setRemoteVideoEnabled(false));
      videoTrack.addEventListener('mute', () => setRemoteVideoEnabled(false));
      videoTrack.addEventListener('unmute', () => setRemoteVideoEnabled(true));
      
      return () => {
        videoTrack.removeEventListener('ended', handleVideoChange);
        videoTrack.removeEventListener('mute', handleVideoChange);
        videoTrack.removeEventListener('unmute', handleVideoChange);
      };
    }
  }, [hasRemoteStream]);

  useEffect(() => {
    if (!hasRemoteStream || !remoteVideoRef.current?.srcObject) return;

    const stream = remoteVideoRef.current.srcObject as MediaStream;
    const audioTrack = stream.getAudioTracks()[0];

    if (audioTrack) {
      setRemoteAudioEnabled(audioTrack.enabled);
      const handleAudioChange = () => setRemoteAudioEnabled(audioTrack.enabled);
      audioTrack.addEventListener('ended', () => setRemoteAudioEnabled(false));
      audioTrack.addEventListener('mute', () => setRemoteAudioEnabled(false));
      audioTrack.addEventListener('unmute', () => setRemoteAudioEnabled(true));
      
      return () => {
        audioTrack.removeEventListener('ended', handleAudioChange);
        audioTrack.removeEventListener('mute', handleAudioChange);
        audioTrack.removeEventListener('unmute', handleAudioChange);
      };
    }
  }, [hasRemoteStream]);
  useEffect(() => {
    // For patients: initialize media once per session (show local video in waiting room)
    // For doctors: initialize media only after admitted
    // For admitted patients: initialize WebRTC after getting admitted
    const shouldInitialize = participantRole === 'patient' 
      ? (sessionId && user && !localStreamRef.current)  // Patients: initialize media once
      : (sessionId && isAdmitted && !webrtcService && user);  // Doctors: need admission + WebRTC

    console.log('[useEffect] Media init check:', {
      participantRole,
      sessionId: !!sessionId,
      user: !!user,
      isAdmitted,
      localStreamRef: !!localStreamRef.current,
      webrtcService: !!webrtcService,
      shouldInitialize,
      isVideo: consultationType === 'video'
    });

    if (!shouldInitialize) return;

    const initializeMedia = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: consultationType === 'video' ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          } : false,
          audio: consultationType !== 'chat' ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false
        };

        console.log('[Media] Requesting getUserMedia with constraints:', constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('[Media] getUserMedia successful');
        
        localStreamRef.current = stream;

        console.log('[Media] Stream obtained:', {
          hasVideo: stream.getVideoTracks().length > 0,
          hasAudio: stream.getAudioTracks().length > 0,
          videoTracksEnabled: stream.getVideoTracks().every(t => t.enabled),
          audioTracksEnabled: stream.getAudioTracks().every(t => t.enabled)
        });
        console.log('[Media] Stream stored in localStreamRef, will set to video element when ready');
        setStreamInitialized(true); // Trigger the video element setup effect

        // For patients in waiting room, stop here - WebRTC will initialize after admission
        if (participantRole === 'patient' && !isAdmitted) {
          console.log('[Media] Patient in waiting room - media initialized, WebRTC will start after admission');
          setIsMediaReady(true); // Mark media as ready for waiting room
          return;
        }

        console.log('[Media] Initializing WebRTC service, isInitiator:', participantRole === 'doctor');
        const isInitiator = participantRole === 'doctor';
        const webrtc = new WebRTCService(sessionId, user.id, isInitiator);

        webrtc.onStream((remoteStream) => {
          console.log('[WebRTC] Remote stream received - checking for valid remote content');
          
          if (!remoteStream) {
            console.log('[WebRTC] Remote stream is null, ignoring');
            return;
          }
          
          const videoTracks = remoteStream.getVideoTracks();
          const audioTracks = remoteStream.getAudioTracks();
          const allTracks = [...videoTracks, ...audioTracks];
          
          console.log('[WebRTC] Remote tracks - video:', videoTracks.length, 'audio:', audioTracks.length, 'enabled count:', allTracks.filter(t => t.enabled).length);
          
          // Must have at least one ENABLED track with 'live' readyState
          const hasValidRemoteTracks = allTracks.length > 0 && allTracks.some(track => {
            const isValid = track.enabled && track.readyState === 'live';
            console.log('[WebRTC] Track check - kind:', track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState, 'valid:', isValid);
            return isValid;
          });
          
          if (hasValidRemoteTracks) {
            console.log('[WebRTC] ✓ Valid remote stream confirmed - setting hasRemoteStream (NOT connected yet)');
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            if (remoteAudioRef.current && audioTracks.length > 0) {
              remoteAudioRef.current.srcObject = remoteStream;
            }
            setHasRemoteStream(true);
            // DO NOT set connected here - wait for actual connection establishment
          } else {
            console.log('[WebRTC] ✗ No valid remote tracks yet - stream not ready');
          }
        });

        webrtc.onConnected(() => {
          console.log('[WebRTC] 🎉 Connection established - setting connected status');
          setConnectionStatus('connected');
        });

        webrtc.onError((error) => {
          console.error('WebRTC Error:', error);
          toast({
            title: 'Connection Error',
            description: 'Failed to establish connection',
            variant: 'destructive'
          });
        });

        webrtc.initializePeer(stream);
        setWebrtcService(webrtc);
        setStreamInitialized(true); // Mark stream as ready

        if ('wakeLock' in navigator) {
          try {
            const wakeLock = (navigator as unknown as { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock;
            wakeLockRef.current = await wakeLock.request('screen');
          } catch (err) {
            console.log('Wake lock not available');
          }
        }
        
        // Mark media as ready
        setIsMediaReady(true);
      } catch (err) {
        console.error('Media initialization error:', err);
        toast({
          title: 'Media Error',
          description: 'Unable to access camera/microphone',
          variant: 'destructive'
        });
      }
    };

    initializeMedia();
  }, [sessionId, user, isAdmitted, webrtcService, consultationType, participantRole]);

  // Set stream to waiting room video element once it's available
  useEffect(() => {
    if (!streamInitialized || !localStreamRef.current) return;
    if (participantRole !== 'patient' || isAdmitted) return; // Only in waiting room
    if (!localVideoRef.current) {
      console.log('[Media] Waiting for video element to be ready in waiting room...');
      return; // Will retry when ref becomes available
    }

    console.log('[Media] ✅ Video element ready! Setting stream to waiting room video');
    localVideoRef.current.srcObject = localStreamRef.current;
    localVideoRef.current.play().catch(err => {
      console.error('[Media] Waiting room video play() error:', err.message);
    });
    
    // Add loadedmetadata listener for debugging
    const onLoadedMetadata = () => {
      console.log('[Media] ✅ Waiting room video loaded and playing');
      localVideoRef.current?.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
    localVideoRef.current.addEventListener('loadedmetadata', onLoadedMetadata);
  }, [streamInitialized, participantRole, isAdmitted]);

  // Set stream to PiP video element once it's available (after admission)
  useEffect(() => {
    if (!streamInitialized || !localStreamRef.current) {
      return;
    }
    
    // Try to set on PiP if available
    if (localVideoPIPRef.current && !localVideoPIPRef.current.srcObject) {
      console.log('[Media] ✅ Setting stream to PiP video element');
      localVideoPIPRef.current.srcObject = localStreamRef.current;
      localVideoPIPRef.current.play().catch(err => {
        console.log('[Media] PiP play() error:', err.message);
      });
    }
    
    // For patients not in waiting room and doctors, keep retrying until PiP is available
    if (participantRole === 'patient' && !isAdmitted) return; // Skip for waiting room
    
    if (!localVideoPIPRef.current) {
      console.log('[Media] Waiting for PiP video element to be rendered...');
      // Will retry on next effect run
    }
  }, [streamInitialized, isAdmitted, participantRole]);

  // Polling effect to handle cases where ref becomes available after stream is ready
  useEffect(() => {
    if (!streamInitialized || !localStreamRef.current) return;
    if (participantRole === 'patient' && !isAdmitted) return; // Skip for waiting room
    
    // Start polling to check if PiP ref becomes available
    const checkInterval = setInterval(() => {
      if (localVideoPIPRef.current && !localVideoPIPRef.current.srcObject) {
        console.log('[Media] ✅ PiP element now available! Setting stream via polling');
        localVideoPIPRef.current.srcObject = localStreamRef.current;
        localVideoPIPRef.current.play().catch(err => {
          console.log('[Media] PiP play() error:', err.message);
        });
        clearInterval(checkInterval); // Stop polling once set
      }
    }, 100); // Check every 100ms
    
    // Clean up interval after 10 seconds (if ref never becomes available)
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (!localVideoPIPRef.current) {
        console.warn('[Media] PiP element never became available after 10 seconds');
      }
    }, 10000);
    
    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [streamInitialized, isAdmitted, participantRole]);

  // Initialize WebRTC when patient gets admitted
  useEffect(() => {
    if (participantRole !== 'patient' || !isAdmitted || !sessionId || webrtcService || !localStreamRef.current || !user) return;

    const initializeWebRTC = async () => {
      try {
        const isInitiator = false;
        const webrtc = new WebRTCService(sessionId, user.id, isInitiator);

        webrtc.onStream((remoteStream) => {
          console.log('[WebRTC] Patient - Remote stream received - checking for valid remote content');
          
          if (!remoteStream) {
            console.log('[WebRTC] Patient - Remote stream is null, ignoring');
            return;
          }
          
          const videoTracks = remoteStream.getVideoTracks();
          const audioTracks = remoteStream.getAudioTracks();
          const allTracks = [...videoTracks, ...audioTracks];
          
          console.log('[WebRTC] Patient - Remote tracks - video:', videoTracks.length, 'audio:', audioTracks.length, 'enabled count:', allTracks.filter(t => t.enabled).length);
          
          // Must have at least one ENABLED track with 'live' readyState
          const hasValidRemoteTracks = allTracks.length > 0 && allTracks.some(track => {
            const isValid = track.enabled && track.readyState === 'live';
            console.log('[WebRTC] Patient - Track check - kind:', track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState, 'valid:', isValid);
            return isValid;
          });
          
          if (hasValidRemoteTracks) {
            console.log('[WebRTC] Patient - ✓ Valid remote stream confirmed - setting hasRemoteStream');
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            if (remoteAudioRef.current && audioTracks.length > 0) {
              remoteAudioRef.current.srcObject = remoteStream;
            }
            setHasRemoteStream(true);
            // DO NOT set connected here - wait for actual connection establishment
          } else {
            console.log('[WebRTC] Patient - ✗ No valid remote tracks yet - stream not ready');
          }
        });

        webrtc.onConnected(() => {
          console.log('[WebRTC] 🎉 Patient - ACTUAL CONNECTION ESTABLISHED - setting connected status');
          setConnectionStatus('connected');
        });

        webrtc.onError((error) => {
          console.error('WebRTC Error:', error);
        });

        webrtc.initializePeer(localStreamRef.current);
        setWebrtcService(webrtc);
      } catch (err) {
        console.error('WebRTC initialization error:', err);
      }
    };

    initializeWebRTC();
  }, [isAdmitted, participantRole, sessionId, webrtcService, user]);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !sessionId) return;

    try {
      await consultationService.sendMessage(
        sessionId,
        user!.id,
        participantRole,
        myName,
        newMessage,
        'text'
      );

      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'user',
        senderName: myName,
        content: newMessage,
        timestamp: new Date(),
        type: 'text'
      }]);

      setNewMessage('');

      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 0);
    } catch (err) {
      console.error('Error sending message:', err);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      });
    }
  };

  const handleEndCall = useCallback(async () => {
    if (webrtcService) {
      webrtcService.destroy();
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.log('Wake lock release error:', err);
      }
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    if (lobbyChannelRef.current) {
      lobbyChannelRef.current.unsubscribe();
    }

    onEndCall();
  }, [webrtcService, onEndCall]);

  const handleAdmitPatient = async () => {
    try {
      await supabase.from('webrtc_signals').insert({
        session_id: sessionId!,
        sender_id: user?.id,
        signal_data: { type: 'admit_patient' }
      });
      setIsPatientWaiting(false);
      setIsAdmitted(true);
      toast({ title: "Patient Admitted", description: "Connecting..." });
    } catch (err) {
      console.error('Error admitting patient:', err);
      toast({ title: "Error", description: "Failed to admit patient", variant: "destructive" });
    }
  };

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <Card className="w-full max-w-md bg-[#252542] border-[#3d3d5c]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-semibold">Error</h3>
            </div>
            <p className="text-sm text-slate-300 mb-4">{error}</p>
            <Button onClick={onEndCall} className="w-full">Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading || !isMediaReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Setting up your consultation...</p>
        </div>
      </div>
    );
  }

  // Patient waiting room
  if (!isAdmitted && participantRole === 'patient') {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f23]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-8 p-8"
        >
          {/* Local video preview */}
          {consultationType === 'video' && (
            <div className="relative w-64 h-48 mx-auto rounded-2xl overflow-hidden bg-[#252542] shadow-2xl">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                onLoadedMetadata={() => console.log('[Video] loadedmetadata event fired')}
                onPlay={() => console.log('[Video] play event fired')}
                onLoadStart={() => console.log('[Video] loadstart event fired')}
                onCanPlay={() => console.log('[Video] canplay event fired')}
              />
              <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-2">
                <Button
                  variant={isVideoEnabled ? 'secondary' : 'destructive'}
                  size="sm"
                  className="rounded-full w-10 h-10"
                  onClick={toggleVideo}
                >
                  {isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </Button>
                <Button
                  variant={isAudioEnabled ? 'secondary' : 'destructive'}
                  size="sm"
                  className="rounded-full w-10 h-10"
                  onClick={toggleAudio}
                >
                  {isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
              <h2 className="text-2xl font-semibold text-white">Waiting Room</h2>
            </div>
            <p className="text-slate-400 max-w-sm">
              You're in the waiting room. The doctor will admit you shortly.
            </p>
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Clock className="w-4 h-4" />
              <span>Waiting for {participantName}</span>
            </div>
          </div>

          <Button
            onClick={handleEndCall}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <X className="w-4 h-4 mr-2" />
            Leave Waiting Room
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-screen w-full bg-[#1a1a2e] flex flex-col overflow-hidden"
    >
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className="flex-1 relative flex flex-col">
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-3 sm:p-4 bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center gap-3">
              <Badge 
                variant="secondary" 
                className={`gap-2 ${connectionStatus === 'connected' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}
              >
                <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
                {connectionStatus === 'connecting' ? 'Connecting...' : 'Connected'}
              </Badge>
              {connectionStatus === 'connected' && (
                <Badge variant="secondary" className="font-mono bg-white/10 text-white">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatDuration(callDuration)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-8 h-8 text-white/70 hover:text-white hover:bg-white/10"
                      onClick={toggleFullscreen}
                    >
                      {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fullscreen</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Admit patient overlay for doctor */}
          {participantRole === 'doctor' && isPatientWaiting && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-6 p-8 bg-[#252542] rounded-2xl shadow-2xl max-w-sm mx-4"
              >
                <Avatar className="w-20 h-20 mx-auto">
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {participantInitials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Patient Waiting</h3>
                  <p className="text-slate-400 text-sm">{participantName} is in the waiting room</p>
                </div>
                <Button
                  onClick={handleAdmitPatient}
                  className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                  <User className="w-4 h-4" />
                  Admit to Call
                </Button>
              </motion.div>
            </div>
          )}

          {/* Video grid */}
          <div className="flex-1 relative p-2 sm:p-4 flex items-center justify-center">
            {consultationType === 'video' ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Remote video (main view) */}
                <div className="relative w-full h-full max-w-5xl rounded-2xl overflow-hidden bg-[#252542]">
                  {hasRemoteStream && connectionStatus === 'connected' && remoteVideoEnabled ? (
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      muted={false}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <Avatar className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4">
                          <AvatarFallback className="bg-slate-700 text-slate-300 text-3xl sm:text-4xl">
                            {participantInitials}
                          </AvatarFallback>
                        </Avatar>
                        <p className="text-white text-lg">{participantName}</p>
                        {connectionStatus === 'connected' && !remoteVideoEnabled ? (
                          <p className="text-slate-400 text-sm">Camera is off</p>
                        ) : (
                          <p className="text-slate-400 text-sm">{connectionStatus === 'connecting' ? 'Connecting...' : 'Waiting for video'}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Local video (PIP) */}
                <motion.div
                  drag
                  dragConstraints={containerRef}
                  className="absolute bottom-20 sm:bottom-24 right-3 sm:right-6 w-32 h-24 sm:w-48 sm:h-36 rounded-xl overflow-hidden bg-[#252542] shadow-2xl border border-white/10 cursor-grab active:cursor-grabbing z-20"
                >
                  {isVideoEnabled ? (
                    <video
                      ref={localVideoPIPRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                      <div className="text-center">
                        <Avatar className="w-16 h-16 mx-auto mb-1">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                            {participantRole === 'doctor' ? 'DR' : 'PT'}
                          </AvatarFallback>
                        </Avatar>
                        <p className="text-white text-xs font-medium">You</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-black/50 rounded text-xs text-white">
                    You
                  </div>
                  {!isAudioEnabled && (
                    <div className="absolute top-1 right-1 p-1 bg-red-500 rounded">
                      <MicOff className="w-3 h-3 text-white" />
                    </div>
                  )}
                </motion.div>
              </div>
            ) : consultationType === 'audio' ? (
              // Audio call view
              <div className="flex flex-col items-center justify-center">
                <motion.div
                  animate={{ scale: connectionStatus === 'connected' ? [1, 1.05, 1] : 1 }}
                  transition={{ repeat: connectionStatus === 'connected' ? Infinity : 0, duration: 2 }}
                >
                  <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mb-6">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-4xl sm:text-5xl">
                      {participantInitials}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
                <h3 className="text-2xl font-semibold text-white mb-2">{participantName}</h3>
                <p className="text-slate-400">
                  {connectionStatus === 'connecting' ? 'Connecting...' : 'Audio Call'}
                </p>
              </div>
            ) : (
              // Chat-only view - handled by chat sidebar
              <div className="flex flex-col items-center justify-center">
                <MessageSquare className="w-16 h-16 text-slate-600 mb-4" />
                <p className="text-slate-400">Chat with {participantName}</p>
              </div>
            )}
          </div>

          {/* Control bar */}
          <div className="relative z-30 p-3 sm:p-4 bg-gradient-to-t from-black/60 to-transparent">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 sm:gap-3 bg-[#252542]/80 backdrop-blur-md rounded-full px-3 sm:px-6 py-2 sm:py-3">
                <TooltipProvider>
                  {consultationType !== 'chat' && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isAudioEnabled ? 'secondary' : 'destructive'}
                            size="icon"
                            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all ${
                              isAudioEnabled 
                                ? 'bg-white/10 hover:bg-white/20 text-white' 
                                : 'bg-red-500 hover:bg-red-600'
                            }`}
                            onClick={toggleAudio}
                          >
                            {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{isAudioEnabled ? 'Mute' : 'Unmute'}</TooltipContent>
                      </Tooltip>

                      {consultationType === 'video' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={isVideoEnabled ? 'secondary' : 'destructive'}
                              size="icon"
                              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all ${
                                isVideoEnabled 
                                  ? 'bg-white/10 hover:bg-white/20 text-white' 
                                  : 'bg-red-500 hover:bg-red-600'
                              }`}
                              onClick={toggleVideo}
                            >
                              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Camera</TooltipContent>
                        </Tooltip>
                      )}

                      <div className="w-px h-8 bg-white/20 mx-1 hidden sm:block" />
                    </>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${
                          isChatOpen 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                        onClick={() => setIsChatOpen(!isChatOpen)}
                      >
                        <MessageSquare className="w-5 h-5" />
                        {messages.length > 0 && !isChatOpen && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-[10px] rounded-full flex items-center justify-center">
                            {messages.length > 9 ? '9+' : messages.length}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Chat</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${
                          handRaised 
                            ? 'bg-amber-500 text-white' 
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                        onClick={() => setHandRaised(!handRaised)}
                      >
                        <Hand className="w-5 h-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{handRaised ? 'Lower hand' : 'Raise hand'}</TooltipContent>
                  </Tooltip>

                  <div className="w-px h-8 bg-white/20 mx-1 hidden sm:block" />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="w-10 h-10 sm:w-14 sm:h-12 rounded-full bg-red-500 hover:bg-red-600"
                        onClick={handleEndCall}
                      >
                        <PhoneOff className="w-5 h-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>End Call</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>

        {/* Chat sidebar */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-80 sm:w-96 flex flex-col bg-[#252542] border-l border-white/10 overflow-hidden"
            >
              {/* Chat header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Meeting Chat
                </h3>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-8 h-8 text-white/70 hover:text-white"
                  onClick={() => setIsChatOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Messages */}
              <ScrollArea ref={chatScrollRef} className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-slate-400 text-sm">No messages yet</p>
                      <p className="text-slate-500 text-xs mt-1">Start the conversation</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[85%]">
                          {message.sender === 'remote' && (
                            <p className="text-xs text-slate-500 mb-1 px-1">{message.senderName}</p>
                          )}
                          <div className={`rounded-2xl px-4 py-2 ${
                            message.sender === 'user'
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-[#3d3d5c] text-white rounded-bl-sm'
                          }`}>
                            <p className="text-sm break-words">{message.content}</p>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 px-1">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Chat input */}
              <div className="p-4 border-t border-white/10">
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 bg-[#1a1a2e] border-white/10 text-white placeholder-slate-500 focus:ring-primary"
                  />
                  <Button 
                    type="submit" 
                    disabled={!newMessage.trim()} 
                    size="icon"
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
