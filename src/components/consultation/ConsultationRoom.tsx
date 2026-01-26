import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, MessageSquare,
  X, User, AlertCircle, Camera, Users, Maximize2,
  Minimize2, MoreVertical, Hand, Monitor, Settings,
  PhoneOff, ChevronRight, ChevronLeft, Clock, FileText
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
import { ChatSidebar } from './ChatSidebar';
import { ControlBar } from './ControlBar';
import { DoctorNotesPanel } from './DoctorNotesPanel';

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
  const [sessionData, setSessionData] = useState<{ id: string; created_at: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [streamInitialized, setStreamInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [webrtcService, setWebrtcService] = useState<WebRTCService | null>(null);
  const [isAdmitted, setIsAdmitted] = useState(false);
  const [isPatientWaiting, setIsPatientWaiting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [waitingForPatient, setWaitingForPatient] = useState(false);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [shouldInitializeWebRTC, setShouldInitializeWebRTC] = useState(false);
  const [localVideoAttached, setLocalVideoAttached] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoPIPRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const webrtcInitializedRef = useRef(false);
  const sessionInitializedRef = useRef(false);
  const messageSubscriptionRef = useRef<(() => void) | null>(null);
  const isCleaningUpRef = useRef(false);

  const participantInitials = participantName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const myName = participantRole === 'doctor' ? 'Dr. You' : 'You';
  const myInitials = participantRole === 'doctor' ? 'DR' : 'PT';

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
    let isMounted = true;
    
    const initializeSession = async () => {
      if (!user || !appointmentId || sessionInitializedRef.current) {
        return;
      }

      try {
        console.log('[Init] Starting consultation room initialization');
        
        // Create or get session
        let session = await consultationService.getSessionByAppointmentId(appointmentId);
        
        if (!session) {
          console.log('[Session] No existing session, creating new one');
          
          const { data: appointmentData } = await supabase
            .from('appointments')
            .select('patient_id, doctor_id')
            .eq('id', appointmentId)
            .single();

          if (!appointmentData) {
            throw new Error('Appointment not found');
          }

          session = await consultationService.createSession(
            appointmentId,
            appointmentData.patient_id,
            appointmentData.doctor_id,
            consultationType
          );
          console.log('[Session] Created new consultation session:', session.id);
        } else {
          console.log('[Session] Using existing session:', session.id);
        }

        if (!isMounted) return;
        
        setSessionData({ id: session.id, created_at: session.created_at });
        setSessionId(session.id);
        setPatientId(session.patient_id);
        sessionInitializedRef.current = true;

        // Initialize media immediately for both roles
        console.log('[Media] Initializing media for', participantRole);
        await initializeMedia();

        if (participantRole === 'doctor') {
          setShouldInitializeWebRTC(true);
          setIsCallStarted(true);
          setWaitingForPatient(true);
        } else {
          // Patient initializes WebRTC to receive admit signals
          setShouldInitializeWebRTC(true);
        }

        // Load existing messages
        const existingMessages = await consultationService.getMessages(session.id);
        console.log('[Init] Loaded', existingMessages.length, 'messages');
        
        setMessages(existingMessages.map(msg => ({
          id: msg.id,
          sender: msg.sender_id === user?.id ? 'user' : 'remote',
          senderName: msg.sender_name,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          type: msg.message_type as 'text' | 'file'
        })));

        // Subscribe to new messages - keep subscription alive for entire session
        const unsubscribe = consultationService.subscribeToMessages(
          session.id,
          (dbMessage) => {
            if (isMounted && dbMessage.sender_id !== user?.id) {
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
        
        messageSubscriptionRef.current = unsubscribe;
        setIsLoading(false);

      } catch (err) {
        console.error('Error initializing session:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize consultation');
        setIsLoading(false);
      }
    };

    initializeSession();

    return () => {
      isMounted = false;
    };
  }, [user, appointmentId, participantRole, consultationType]);

  // Initialize media stream
  const initializeMedia = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: consultationType === 'video' ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        } : false,
        audio: consultationType !== 'chat' ? { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } : false
      };

      console.log('[Media] Requesting media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[Media] Media stream obtained:', {
        video: stream.getVideoTracks().length > 0,
        audio: stream.getAudioTracks().length > 0
      });

      localStreamRef.current = stream;
      setStreamInitialized(true);
      setIsMediaReady(true);

      // Attach to waiting room video if patient in waiting room
      if (participantRole === 'patient' && !isAdmitted && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(console.error);
      }

    } catch (err) {
      console.error('[Media] Error initializing media:', err);
      toast({
        title: 'Media Error',
        description: 'Unable to access camera/microphone. Please check permissions.',
        variant: 'destructive'
      });
    }
  };

  // Attach local stream to video elements
  useEffect(() => {
    if (!streamInitialized || !localStreamRef.current) return;
    
    // For doctor waiting screen: attach to localVideoRef
    if (participantRole === 'doctor' && waitingForPatient && !isPatientWaiting) {
      if (localVideoRef.current && !localVideoAttached) {
        console.log('[Media] Attaching doctor stream to waiting screen video');
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(console.error);
        setLocalVideoAttached(true);
      }
    }
    
    // For PIP video: attach when in call
    if ((participantRole === 'doctor' && isCallStarted) || 
        (participantRole === 'patient' && isAdmitted)) {
      if (localVideoPIPRef.current && !localVideoPIPRef.current.srcObject) {
        console.log('[Media] Setting stream to PIP video element');
        localVideoPIPRef.current.srcObject = localStreamRef.current;
        localVideoPIPRef.current.play().catch(console.error);
      }
    }
  }, [streamInitialized, participantRole, waitingForPatient, isPatientWaiting, isCallStarted, isAdmitted, localVideoAttached]);

  // Initialize WebRTC when conditions are met
  useEffect(() => {
    if (!sessionData || !user || !localStreamRef.current || !shouldInitializeWebRTC) return;
    if (webrtcInitializedRef.current) return;

    // Both initialize WebRTC but patient doesn't start peer connection until admitted
    const shouldInitialize = true;
    
    if (!shouldInitialize) return;

    const initializeWebRTC = async () => {
      try {
        console.log('[WebRTC] Initializing WebRTC for', participantRole);
        const isInitiator = participantRole === 'doctor';
        
        console.log('[WebRTC] Creating WebRTCService with initiator:', isInitiator);
        const sessionStartTime = new Date(sessionData.created_at);
        const webrtc = new WebRTCService(sessionData.id, user.id, isInitiator, sessionStartTime);

        webrtc.onStream((remoteStream) => {
          console.log('[WebRTC] Remote stream received, tracks:', remoteStream.getTracks().length);
          
          if (remoteStream && remoteStream.getTracks().length > 0) {
            setHasRemoteStream(true);
            
            // Check if remote has video - update whenever tracks change
            const hasVideo = remoteStream.getVideoTracks().length > 0;
            console.log('[WebRTC] Remote video tracks:', remoteStream.getVideoTracks().length, 'hasVideo:', hasVideo);
            setRemoteVideoEnabled(hasVideo);
            
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
              // Attach to audio element for audio playback
              if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStream;
                remoteAudioRef.current.play().then(() => {
                  console.log('[Audio Play] Remote audio started playing successfully');
                  // Check if audio is actually playing
                  setTimeout(() => {
                    if (remoteAudioRef.current) {
                      console.log('[Audio Debug] Audio state:', {
                        paused: remoteAudioRef.current.paused,
                        volume: remoteAudioRef.current.volume,
                        muted: remoteAudioRef.current.muted,
                        currentTime: remoteAudioRef.current.currentTime
                      });
                    }
                  }, 2000);
                }).catch(error => {
                  console.error('[Audio Play] Failed to play remote audio:', error);
                });
              }
            }, 100);
          }
        });

        webrtc.onConnected(() => {
          console.log('[WebRTC] 🎉 Connection established via callback');
          setConnectionStatus('connected');
        });

        webrtc.onError((error) => {
          console.error('[WebRTC] Error:', error);
          setConnectionStatus('disconnected');
          toast({
            title: 'Connection Error',
            description: 'Failed to establish WebRTC connection',
            variant: 'destructive'
          });
        });

        webrtc.onPatientJoinedLobby(() => {
          console.log('[Lobby] 🔔 Patient has joined the lobby');
          setIsPatientWaiting(true);
          setWaitingForPatient(false); // Exit waiting screen to show admit overlay
          toast({
            title: 'Patient Waiting',
            description: 'A patient has joined the waiting room.',
            duration: 5000,
          });
        });

        webrtc.onAdmitted(() => {
          console.log('[Lobby] 🎉 Doctor is admitting patient to call');
          setIsAdmitted(true);
          setIsCallStarted(true);
          // Now initialize peer connection for patient with fresh local stream
          if (participantRole === 'patient' && localStreamRef.current) {
            console.log('[Patient Admission] Initializing peer connection with local stream');
            webrtc.initializePeer(localStreamRef.current);
          }
          toast({
            title: 'Admitted to Call',
            description: 'The doctor has admitted you to the consultation.',
            duration: 3000,
          });
        });

        console.log('[WebRTC] Calling initializePeer with local stream');
        if (participantRole === 'doctor') {
          webrtc.initializePeer(localStreamRef.current!);
        } else {
          // Patient only subscribes to signals initially
          webrtc.subscribeToSignalsOnly();
        }
        setWebrtcService(webrtc);
        webrtcInitializedRef.current = true;
        
        if (participantRole === 'doctor') {
          await webrtc.checkExistingLobbySignals();
        } else {
          await webrtc.sendJoinLobby();
        }
        
        console.log('[WebRTC] Initialization complete, setting connecting status');
        setConnectionStatus('connecting');

      } catch (err) {
        console.error('[WebRTC] Initialization error:', err);
        toast({
          title: 'Connection Error',
          description: 'Failed to initialize WebRTC connection',
          variant: 'destructive'
        });
      }
    };

    initializeWebRTC();
  }, [sessionData, user, shouldInitializeWebRTC, isAdmitted, participantRole]);

  // Monitor remote stream for video track changes
  useEffect(() => {
    if (hasRemoteStream && webrtcService) {
      const remoteStream = webrtcService.getRemoteStream();
      if (remoteStream) {
        const hasVideo = remoteStream.getVideoTracks().length > 0;
        console.log('[Video Monitor] Remote stream video tracks:', remoteStream.getVideoTracks().length, 'updating remoteVideoEnabled to:', hasVideo);
        setRemoteVideoEnabled(hasVideo);
        
        // Debug video element visibility
        if (remoteVideoRef.current) {
          const isVisible = hasVideo && hasRemoteStream;
          console.log('[Video Debug] Remote video element should be visible:', isVisible, 'hasRemoteStream:', hasRemoteStream, 'hasVideo:', hasVideo);
        }
      }
    }
  }, [hasRemoteStream, webrtcService]);

  // Ensure remote stream is attached when ref becomes available
  useEffect(() => {
    if (hasRemoteStream && webrtcService && remoteVideoRef.current) {
      const remoteStream = webrtcService.getRemoteStream();
      if (remoteStream && remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
        console.log('[Video Attachment] Attaching remote stream to video element');
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().then(() => {
          console.log('[Video Play] Remote video started playing successfully');
          // Check video element properties
          const video = remoteVideoRef.current!;
          console.log('[Video Debug] Video properties:', {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState,
            paused: video.paused,
            muted: video.muted,
            volume: video.volume
          });
          // Check stream properties
          const stream = video.srcObject as MediaStream;
          if (stream) {
            console.log('[Video Debug] Stream properties:', {
              active: stream.active,
              videoTracks: stream.getVideoTracks().map(t => ({
                kind: t.kind,
                enabled: t.enabled,
                readyState: t.readyState,
                muted: t.muted
              }))
            });
          }
        }).catch(error => {
          console.error('[Video Play] Failed to play remote video:', error);
        });
      }
    }
  }, [hasRemoteStream, webrtcService]);

  // Additional effect to retry video attachment after connection is established
  useEffect(() => {
    if (connectionStatus === 'connected' && webrtcService) {
      console.log('[Video Debug] Connection established - hasRemoteStream:', hasRemoteStream, 'remoteVideoEnabled:', remoteVideoEnabled);
      const remoteStream = webrtcService.getRemoteStream();
      if (remoteStream) {
        // Try multiple times with delays to ensure video element is ready
        const tryAttach = (attempt = 1) => {
          if (remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
            console.log(`[Video Retry ${attempt}] Attaching remote stream after connection`);
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(console.error);
          } else if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
            console.log('[Video Debug] Remote video already has stream attached');
            // Check if video element is actually visible
            const isHidden = remoteVideoRef.current.classList.contains('hidden');
            const computedStyle = window.getComputedStyle(remoteVideoRef.current);
            console.log('[Video Debug] Video element hidden class:', isHidden, 'display:', computedStyle.display, 'visibility:', computedStyle.visibility);
          } else if (attempt < 10) {
            setTimeout(() => tryAttach(attempt + 1), 500);
          }
        };
        tryAttach();
      }
    }
  }, [connectionStatus, webrtcService, hasRemoteStream, remoteVideoEnabled]);

  // Timer effect
  useEffect(() => {
    if (connectionStatus === 'connected') {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [connectionStatus]);

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
    if (!newMessage.trim() || !sessionData) return;

    try {
      const sentMessage = await consultationService.sendMessage(
        sessionData.id,
        user!.id,
        participantRole,
        myName,
        newMessage,
        'text'
      );

      // Add message to UI immediately
      setMessages(prev => [...prev, {
        id: sentMessage.id,
        sender: 'user',
        senderName: myName,
        content: newMessage,
        timestamp: new Date(sentMessage.created_at),
        type: 'text'
      }]);

      setNewMessage('');
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
    console.log('[Cleanup] Ending call and cleaning up...');
    isCleaningUpRef.current = true;
    
    if (webrtcService) {
      webrtcService.destroy();
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.log('Wake lock release error:', err);
      }
    }

    // Unsubscribe from messages only during cleanup
    if (messageSubscriptionRef.current) {
      messageSubscriptionRef.current();
      messageSubscriptionRef.current = null;
    }

    onEndCall();
  }, [webrtcService, onEndCall]);

  const handleAdmitPatient = async () => {
    try {
      console.log('[Admission] Doctor admitting patient');
      
      if (!webrtcService) {
        throw new Error('WebRTC service not initialized');
      }

      await webrtcService.sendAdmitPatient();
      
      console.log('[Admission] Admit signal sent successfully');
      
      // Update local state
      setIsPatientWaiting(false);
      setWaitingForPatient(false);
      
      toast({
        title: 'Patient Admitted',
        description: 'Patient is being connected to the call.',
        duration: 3000,
      });
      
    } catch (err) {
      console.error('Error admitting patient:', err);
      toast({
        title: 'Error',
        description: 'Failed to admit patient',
        variant: 'destructive'
      });
    }
  };

  // Doctor waiting for patient overlay
  if (participantRole === 'doctor' && waitingForPatient && !isPatientWaiting) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f23]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-8 p-8 max-w-md"
        >
          {/* Doctor's local video preview */}
          {consultationType === 'video' && (
            <div className="relative w-64 h-48 mx-auto rounded-2xl overflow-hidden bg-[#252542] shadow-2xl">
              {isVideoEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                  onLoadedMetadata={() => console.log('[Doctor Waiting] Local video loaded')}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                  <Avatar className="w-20 h-20">
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {myInitials}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
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

          {(!isVideoEnabled || consultationType !== 'video') && (
            <Avatar className="w-24 h-24 mx-auto">
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                {myInitials}
              </AvatarFallback>
            </Avatar>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
              <h2 className="text-2xl font-semibold text-white">Waiting for Patient</h2>
            </div>
            
            <p className="text-slate-400">
              You've joined the consultation. Please wait for the patient to join the waiting room.
            </p>
            
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Clock className="w-4 h-4" />
              <span>Ready to admit {participantName}</span>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleEndCall}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-800 w-full"
            >
              <X className="w-4 h-4 mr-2" />
              Leave Consultation
            </Button>
            
            <div className="text-xs text-slate-500">
              You'll be notified when the patient joins
            </div>
          </div>
        </motion.div>
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
                {participantRole === 'doctor' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`w-8 h-8 text-white/70 hover:text-white hover:bg-white/10 ${
                          isNotesOpen ? 'bg-primary/20 text-primary' : ''
                        }`}
                        onClick={() => setIsNotesOpen(!isNotesOpen)}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Consultation Notes</TooltipContent>
                  </Tooltip>
                )}
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
                <div className="space-y-3">
                  <Button
                    onClick={handleAdmitPatient}
                    className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                  >
                    <User className="w-4 h-4" />
                    Admit to Call
                  </Button>
                  <Button
                    onClick={() => setIsPatientWaiting(false)}
                    variant="outline"
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    Not Now
                  </Button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Video grid */}
          <div className="flex-1 relative p-2 sm:p-4 flex items-center justify-center">
            {consultationType === 'video' ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Main video area - shows remote when connected, otherwise local */}
                <div className="relative w-full h-full max-w-5xl rounded-2xl overflow-hidden bg-[#252542]">
                  {/* Remote video element - always rendered, show when we have remote stream with video */}
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted={false}
                    controls={false}
                    className={`w-full h-full object-cover ${
                      hasRemoteStream && remoteVideoEnabled ? 'block' : 'hidden'
                    }`}
                    onLoadedMetadata={() => {
                      console.log('[Remote Video] Video metadata loaded');
                      if (remoteVideoRef.current) {
                        const video = remoteVideoRef.current;
                        console.log('[Remote Video] Metadata dimensions:', video.videoWidth, 'x', video.videoHeight);
                        if (video.videoWidth > 0 && video.videoHeight > 0) {
                          console.log('[Remote Video] ✅ Video has valid dimensions from metadata');
                        }
                      }
                    }}
                    onPlay={() => {
                      console.log('[Remote Video] Video started playing');
                      // Check dimensions after a delay to ensure video is fully loaded
                      setTimeout(() => {
                        if (remoteVideoRef.current) {
                          const video = remoteVideoRef.current;
                          console.log('[Video Check] Final dimensions:', video.videoWidth, 'x', video.videoHeight);
                          if (video.videoWidth === 0 || video.videoHeight === 0) {
                            console.warn('[Video Issue] Remote video has no dimensions - checking stream tracks');
                            const stream = video.srcObject as MediaStream;
                            if (stream) {
                              const videoTracks = stream.getVideoTracks();
                              videoTracks.forEach((track, index) => {
                                const settings = track.getSettings();
                                console.log(`[Video Track ${index}] Settings:`, {
                                  width: settings.width,
                                  height: settings.height,
                                  enabled: track.enabled,
                                  readyState: track.readyState,
                                  muted: track.muted
                                });
                              });
                            }
                          }
                        }
                      }, 1000);
                    }}
                    onError={(e) => console.error('[Remote Video] Video error:', e)}
                  />
                  
                  {/* Show fallback content when no remote video */}
                  {!(hasRemoteStream && remoteVideoEnabled) && (
                    /* Show local video when waiting or no remote video */
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                      {connectionStatus === 'connected' && !remoteVideoEnabled ? (
                        // Connected but remote video is off - show avatar
                        <div className="text-center">
                          <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4">
                            <AvatarFallback className="bg-slate-700 text-slate-300 text-3xl sm:text-4xl">
                              {participantInitials}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-white text-lg">{participantName}</p>
                          <p className="text-slate-400 text-sm">Camera is off</p>
                        </div>
                      ) : connectionStatus === 'connecting' ? (
                        // Connecting - show local video or avatar
                        <div className="w-full h-full">
                          {isVideoEnabled ? (
                            <video
                              ref={localVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover"
                              style={{ transform: 'scaleX(-1)' }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4">
                                <AvatarFallback className="bg-primary text-primary-foreground text-3xl sm:text-4xl">
                                  {myInitials}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                          )}
                        </div>
                      ) : (
                        // Not connected yet - show local video for doctor, avatar for waiting
                        <div className="w-full h-full">
                          {participantRole === 'doctor' || isAdmitted ? (
                            isVideoEnabled ? (
                              <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                                style={{ transform: 'scaleX(-1)' }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4">
                                  <AvatarFallback className="bg-primary text-primary-foreground text-3xl sm:text-4xl">
                                    {myInitials}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                            )
                          ) : (
                            <div className="text-center">
                              <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4">
                                <AvatarFallback className="bg-slate-700 text-slate-300 text-3xl sm:text-4xl">
                                  {participantInitials}
                                </AvatarFallback>
                              </Avatar>
                              <p className="text-white text-lg">{participantName}</p>
                              <p className="text-slate-400 text-sm">
                                {connectionStatus === 'connected' ? 'Connected' : 'Connecting...'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Local video (PIP) - always shown when video is enabled */}
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
                            {myInitials}
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
                  {hasRemoteStream && connectionStatus === 'connected' ? (
                    <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mb-6">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-4xl sm:text-5xl">
                        {participantInitials}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mb-6">
                      <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-800 text-slate-300 text-4xl sm:text-5xl">
                        {myInitials}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </motion.div>
                <h3 className="text-2xl font-semibold text-white mb-2">
                  {hasRemoteStream && connectionStatus === 'connected' ? participantName : 'Waiting to connect'}
                </h3>
                <p className="text-slate-400">
                  {connectionStatus === 'connecting' ? 'Connecting...' : 'Audio Call'}
                </p>
              </div>
            ) : (
              // Chat-only view
              <div className="flex flex-col items-center justify-center">
                <MessageSquare className="w-16 h-16 text-slate-600 mb-4" />
                <p className="text-slate-400">Chat with {participantName}</p>
              </div>
            )}
          </div>

          {/* Control bar */}
          <ControlBar
            consultationType={consultationType}
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
            isChatOpen={isChatOpen}
            handRaised={handRaised}
            messageCount={messages.length}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onToggleChat={() => setIsChatOpen(!isChatOpen)}
            onToggleHand={() => setHandRaised(!handRaised)}
            onEndCall={handleEndCall}
          />
        </div>

        {/* Chat sidebar */}
        <ChatSidebar
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={messages}
          newMessage={newMessage}
          onMessageChange={setNewMessage}
          onSendMessage={handleSendMessage}
        />

        {/* Doctor notes panel */}
        {participantRole === 'doctor' && sessionData && (
          <DoctorNotesPanel
            isOpen={isNotesOpen}
            onClose={() => setIsNotesOpen(false)}
            sessionId={sessionData.id}
            patientId={patientId!}
            doctorId={user!.id}
          />
        )}
      </div>
    </div>
  );
}