import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, MessageSquare,
  Maximize2, Minimize2, Settings, Volume2, VolumeX,
  Send, Paperclip, MoreVertical, X, User, AlertCircle
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
import { consultationService, type ConsultationMessage as ConsultationMessageType } from '@/services/consultationService';
import { supabase } from '@/integrations/supabase/client';
import { WebRTCService } from '@/services/webrtcService';

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
  const navigate = useNavigate();
  const [isVideoEnabled, setIsVideoEnabled] = useState(consultationType === 'video');
  const [isAudioEnabled, setIsAudioEnabled] = useState(consultationType !== 'chat');
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(consultationType !== 'chat');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(consultationType === 'chat');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [callDuration, setCallDuration] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [webrtcService, setWebrtcService] = useState<WebRTCService | null>(null);
  const [isAdmitted, setIsAdmitted] = useState(false);
  const [isPatientWaiting, setIsPatientWaiting] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Initialize consultation session and load existing messages
  useEffect(() => {
    const initializeSession = async () => {
      if (!user || !appointmentId) {
        setError('Missing user or appointment information');
        setIsLoading(false);
        return;
      }

      try {
        // Get or create consultation session
        let session = await consultationService.getSessionByAppointmentId(appointmentId);
        let patientId: string | null = null;
        let doctorId: string | null = null;

        if (!session) {
          // Get appointment data to find the real patient and doctor IDs
          const { data: appointmentData, error: appointmentError } = await supabase
            .from('appointments')
            .select('patient_id, doctor_id')
            .eq('id', appointmentId)
            .single();

          if (appointmentError) {
            throw new Error(`Failed to get appointment data: ${appointmentError.message}`);
          }

          patientId = appointmentData.patient_id;
          doctorId = appointmentData.doctor_id;

          session = await consultationService.createSession(
            appointmentId,
            patientId,
            doctorId,
            consultationType
          );
        } else {
          // If session already exists, get patient/doctor IDs from the session
          patientId = session.patient_id;
          doctorId = session.doctor_id;
        }

        // Initialize WebRTC based on role and admission status
        if (participantRole === 'doctor') {
          setIsAdmitted(true);
          // Doctor should check if patient is already waiting
          if (patientId) {
            const { data: existingSignals } = await supabase
              .from('webrtc_signals')
              .select('*')
              .eq('session_id', session.id)
              .eq('sender_id', patientId)
              .limit(1);
            
            if (existingSignals && existingSignals.length > 0) {
              const joinLobbySignal = existingSignals.find((sig: any) => sig.signal_data?.type === 'join_lobby');
              if (joinLobbySignal) {
                console.log('[Lobby] Found existing patient waiting signal');
                setIsPatientWaiting(true);
                toast({
                  title: 'Patient Waiting',
                  description: `${participantName} is waiting in the lobby.`,
                });
              }
            }
          }
        }

        // Subscribe to lobby signals
        const lobbyChannel = supabase.channel(`lobby_${session.id}`);
        lobbyChannel
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'webrtc_signals',
            filter: `session_id=eq.${session.id}`
          }, (payload) => {
            const signal = payload.new;
            if (signal.sender_id !== user.id) {
              if (signal.signal_data.type === 'join_lobby' && participantRole === 'doctor') {
                console.log('[Lobby] Patient joined, showing admit button');
                setIsPatientWaiting(true);
                toast({
                  title: 'Patient Waiting',
                  description: `${participantName} is waiting in the lobby.`,
                });
              } else if (signal.signal_data.type === 'admit' && participantRole === 'patient') {
                console.log('[Lobby] Patient received admit signal, initializing media...');
                setIsAdmitted(true);
                toast({
                  title: 'Admitted',
                  description: 'The doctor has admitted you to the call.',
                });
              }
            }
          })
          .subscribe();

        // If patient, announce presence in lobby
        if (participantRole === 'patient') {
          await supabase.from('webrtc_signals').insert({
            session_id: session.id,
            sender_id: user.id,
            signal_data: { type: 'join_lobby' }
          });
        }

        setSessionId(session.id);

        return () => {
          supabase.removeChannel(lobbyChannel);
        };

        // ... (rest of the code will follow in next logic block)

        // Load existing messages
        const existingMessages = await consultationService.getMessages(session.id);
        setMessages(existingMessages.map(msg => ({
          id: msg.id,
          sender: msg.sender_id === user?.id ? 'user' : 'remote',
          senderName: msg.sender_name,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          type: msg.message_type as 'text' | 'file'
        })));

        // Subscribe to real-time messages
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
          },
          (err) => {
            console.error('Error receiving message:', err);
            toast({
              title: 'Error',
              description: 'Failed to receive messages',
              variant: 'destructive'
            });
          }
        );

        unsubscribeRef.current = unsubscribe;
        
        // Don't mark as connected yet - wait for media/WebRTC to be ready
        // This will be updated when isAdmitted changes and media is initialized
        setConnectionStatus('connecting');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to initialize session';
        setError(errorMsg);
        toast({
          title: 'Error',
          description: errorMsg,
          variant: 'destructive'
        });
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [user, appointmentId, participantRole, consultationType, participantName]);

  // Initialize local media and WebRTC
  useEffect(() => {
    const initializeMedia = async () => {
      if (consultationType === 'chat' || !sessionId || !user || !isAdmitted) {
        console.log('[Media Init] Skipping - chat:', consultationType === 'chat', 'sessionId:', !!sessionId, 'user:', !!user, 'admitted:', isAdmitted);
        return;
      }

      console.log('[Media Init] Starting media initialization...');

      // Check for WebRTC support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast({
          title: 'Browser Not Supported',
          description: 'Your browser does not support video calls',
          variant: 'destructive'
        });
        return;
      }

      // Prevent duplicate initialization
      if (webrtcService) {
        console.log('[Media Init] WebRTC already initialized, skipping');
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: consultationType === 'video' ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          } : false,
          audio: true
        };

        console.log('[Media Init] Requesting user media with constraints:', constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        console.log('[Media Init] Got local stream with', stream.getTracks().length, 'tracks');
        stream.getTracks().forEach((track, idx) => {
          console.log(`[Media Init] Track ${idx}:`, track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState, 'label:', track.label);
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log('[Media Init] Set local video element srcObject');
        }

        // Initialize WebRTC service only after media is ready
        try {
          const isInitiator = participantRole === 'doctor';
          console.log('[Media Init] Initializing WebRTC with isInitiator:', isInitiator);
          const webrtc = new WebRTCService(sessionId, user.id, isInitiator);

          webrtc.onStream((remoteStream) => {
            console.log('[WebRTC] 🎥 Remote stream received with', remoteStream.getTracks().length, 'tracks');
            console.log('[WebRTC] 🎥 Stream ID:', remoteStream.id);
            console.log('[WebRTC] 🎥 Tracks:', remoteStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
            setHasRemoteStream(true);
            setConnectionStatus('connected'); // Defensive fallback if onConnected never fires
            if (remoteVideoRef.current) {
              console.log('[WebRTC] 🎥 Setting remote video ref srcObject');
              remoteVideoRef.current.srcObject = remoteStream;
              console.log('[WebRTC] 🎥 Remote video element srcObject set');
              // Force play to ensure video starts
              remoteVideoRef.current.play().catch((err) => {
                console.warn('[WebRTC] 🎥 Failed to play video:', err);
              });
            } else {
              console.warn('[WebRTC] 🎥 WARNING: remoteVideoRef.current is null!');
            }
          });

          webrtc.onConnected(() => {
            console.log('[WebRTC] ✅ ICE connection established! Setting connectionStatus to connected');
            setConnectionStatus('connected');
            console.log('[WebRTC] connectionStatus state updated');
          });

          // Monitor connection and provide diagnostics after 15 seconds
          const connectionDiagnosticsTimeout = setTimeout(() => {
            if (connectionStatus !== 'connected') {
              console.warn('[WebRTC] ⚠️ Connection still in progress. This may indicate:');
              console.warn('  - Peers are on different networks with restrictive firewalls');
              console.warn('  - NAT/firewall blocking peer-to-peer connections');
              console.warn('  - STUN servers not reachable (check network settings)');
              console.warn('  - In some environments, audio/video may still work despite ICE showing as "checking"');
              
              // Don't show error toast, allow connection to keep trying
              // The system may establish media despite ICE diagnostics showing issues
            }
          }, 15000);

          webrtc.onError((error) => {
            console.error('[WebRTC] Error:', error);
            toast({
              title: 'Connection Error',
              description: 'Failed to establish video connection',
              variant: 'destructive'
            });
          });

          console.log('[Media Init] Calling initializePeer...');
          await webrtc.initializePeer(stream);
          setWebrtcService(webrtc);
          console.log('[Media Init] WebRTC service initialized successfully');
          
          // For doctor role, immediately attempt to create offer after peer is initialized
          if (participantRole === 'doctor') {
            console.log('[Media Init] Doctor role - WebRTC ready, offer will be created when patient signals ready');
          }
        } catch (webrtcError) {
          console.error('[Media Init] WebRTC initialization error:', webrtcError);
          toast({
            title: 'WebRTC Error',
            description: 'Failed to initialize video connection',
            variant: 'destructive'
          });
        }

      } catch (error) {
        console.error('[Media Init] Failed to get media devices:', error);
        toast({
          title: 'Media Access Error',
          description: 'Please allow camera and microphone access',
          variant: 'destructive'
        });
      }
    };

    // Trigger initialization immediately when admitted and sessionId is ready
    initializeMedia();

    return () => {
      // Don't stop tracks here - let the component unmount handle cleanup
      // This prevents killing streams when webrtcService is set
    };
  }, [consultationType, sessionId, user, participantRole, isAdmitted]);

  // Call duration timer
  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionStatus]);

  // Screen wake lock - prevent screen from turning off during active consultation
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && connectionStatus === 'connected') {
          // Request wake lock to keep screen on during consultation
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          console.log('[WakeLock] Screen wake lock acquired');
          
          // Handle release events (e.g., when browser tab loses focus)
          wakeLockRef.current.addEventListener('release', () => {
            console.log('[WakeLock] Screen wake lock released');
          });
        }
      } catch (err) {
        console.warn('[WakeLock] Failed to acquire wake lock:', err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('[WakeLock] Screen wake lock released');
        } catch (err) {
          console.warn('[WakeLock] Failed to release wake lock:', err);
        }
      }
    };

    if (connectionStatus === 'connected') {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [connectionStatus]);

  // Cleanup on component unmount only
  useEffect(() => {
    return () => {
      console.log('[Cleanup] Component unmounting, stopping tracks');
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          console.log('[Cleanup] Stopping', track.kind, 'track');
          track.stop();
        });
      }
      if (webrtcService) {
        console.log('[Cleanup] Destroying WebRTC service');
        webrtcService.destroy();
      }
      // Release wake lock on unmount
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch((err: any) => {
          console.warn('[Cleanup] Failed to release wake lock:', err);
        });
        wakeLockRef.current = null;
      }
    };
  }, []); // Empty dependency array = only run on unmount

  // Ensure remote video stream persists - guard against srcObject being cleared
  useEffect(() => {
    if (!hasRemoteStream) return;
    
    const interval = setInterval(() => {
      if (remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
        console.warn('[RemoteVideo] ⚠️ Remote video srcObject was cleared! This should not happen.');
        // Don't try to restore - this indicates a deeper issue
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [hasRemoteStream]);

  // Ensure local video stream persists - guard against srcObject being cleared
  useEffect(() => {
    const interval = setInterval(() => {
      if (localStreamRef.current && localVideoRef.current) {
        // Check if local video element lost its srcObject
        if (!localVideoRef.current.srcObject && consultationType === 'video' && isVideoEnabled) {
          console.warn('[LocalVideo] ⚠️ Local video srcObject was cleared! Restoring...');
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      }
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, [consultationType, isVideoEnabled]);

  // Ensure video element has paused=false when it should be playing
  useEffect(() => {
    const ensurePlaying = setInterval(() => {
      if (localVideoRef.current && isVideoEnabled && consultationType === 'video') {
        if (localVideoRef.current.paused && localVideoRef.current.srcObject) {
          console.log('[LocalVideo] Video is paused but should be playing, attempting play...');
          localVideoRef.current.play().catch(err => {
            // Expected if already playing, ignore
          });
        }
      }
    }, 1000);

    return () => clearInterval(ensurePlaying);
  }, [isVideoEnabled, consultationType]);

  // Auto scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  }, []);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  }, []);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !sessionId || !user) return;

    const messageContent = newMessage;
    setNewMessage('');

    try {
      // Send message to database
      await consultationService.sendMessage(
        sessionId,
        user.id,
        participantRole === 'doctor' ? 'doctor' : 'patient',
        user.user_metadata?.full_name || user.email || 'User',
        messageContent
      );

      // Optimistically add message to UI
      const message: Message = {
        id: Date.now().toString(),
        sender: 'user',
        senderName: 'You',
        content: messageContent,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, message]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('[SendMessage Error]', errorMsg, err);
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive'
      });
      // Restore message in input if failed
      setNewMessage(messageContent);
    }
  };

  const handleEndCall = async () => {
    if (sessionId) {
      try {
        await consultationService.endSession(sessionId, callDuration);
        console.log('[ConsultationRoom] Session ended, status updated to ended');
        toast({
          title: 'Success',
          description: 'Consultation ended successfully'
        });
      } catch (err) {
        console.error('Error ending session:', err);
        toast({
          title: 'Error',
          description: 'Failed to end consultation',
          variant: 'destructive'
        });
      }
    }

    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }

    // Clean up subscriptions and WebRTC
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    if (webrtcService) {
      webrtcService.destroy();
    }

    onEndCall();
  };

  const participantInitials = participantName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-semibold">Error</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={onEndCall} className="w-full">Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-background ${isFullscreen ? 'fixed inset-0 z-50' : 'h-[calc(100vh-4rem)]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-3 md:px-4 py-2 sm:py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Avatar className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">{participantInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-semibold text-xs sm:text-sm truncate">{participantName}</h2>
            <div className="flex items-center gap-1 sm:gap-2">
              <Badge
                variant="outline"
                className={`text-xs ${
                  connectionStatus === 'connected'
                    ? 'bg-success/10 text-success border-success/20'
                    : connectionStatus === 'connecting'
                      ? 'bg-warning/10 text-warning border-warning/20'
                      : 'bg-destructive/10 text-destructive border-destructive/20'
                }`}
              >
                <span className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full mr-1 ${connectionStatus === 'connected' ? 'bg-success' :
                  connectionStatus === 'connecting' ? 'bg-warning animate-pulse' : 'bg-destructive'
                  }`} />
                <span className="hidden sm:inline">{connectionStatus === 'connected' ? 'Connected' :
                  connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
                <span className="sm:hidden">{connectionStatus === 'connected' ? 'OK' :
                  connectionStatus === 'connecting' ? '...' : 'X'}</span>
              </Badge>
              {connectionStatus === 'connected' && (
                <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">{formatDuration(callDuration)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 sm:h-10 sm:w-10"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs sm:text-sm">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Doctor Admit Button Overlay - Single consolidated button */}
        {participantRole === 'doctor' && isPatientWaiting && (
          <div className="absolute top-2 sm:top-4 left-1/2 transform -translate-x-1/2 z-50 px-2">
            <Button
              onClick={async () => {
                if (!sessionId || !user) return;
                try {
                  // Update consultation session to active
                  const { error } = await supabase
                    .from('consultation_sessions')
                    .update({ status: 'active' })
                    .eq('id', sessionId);
                  
                  if (error) throw error;
                  
                  // Send admit signal
                  await supabase.from('webrtc_signals').insert({
                    session_id: sessionId,
                    sender_id: user.id,
                    signal_data: { type: 'admit' }
                  });
                  setIsPatientWaiting(false);
                  toast({ title: "Patient Admitted", description: "Connecting..." });
                } catch (err) {
                  console.error('Error admitting patient:', err);
                  toast({ title: "Error", description: "Failed to admit patient", variant: "destructive" });
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white shadow-lg animate-pulse gap-2 text-sm sm:text-base"
            >
              <User className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Admit Patient</span>
              <span className="sm:hidden">Admit</span>
            </Button>
          </div>
        )}

        {/* Patient Lobby Screen */}
        {!isAdmitted && participantRole === 'patient' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
            <div className="text-center space-y-3 sm:space-y-4 max-w-sm">
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 mx-auto animate-pulse">
                <AvatarFallback className="text-xl sm:text-2xl">{participantInitials}</AvatarFallback>
              </Avatar>
              <h3 className="text-xl sm:text-2xl font-semibold">Waiting Room</h3>
              <p className="text-sm sm:text-base text-muted-foreground">Waiting for the doctor to admit you...</p>
              <Button
                onClick={() => {
                  toast({
                    title: 'Left',
                    description: 'You have left the waiting room.'
                  });
                  navigate(-1);
                }}
                variant="outline"
                className="mt-4 w-full"
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Leave
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Video/Audio area - Hidden if chat only and chat is open (or maybe just hidden completely for chat type) */}
          {consultationType !== 'chat' && (
            <div className={`flex-1 relative bg-muted/50 p-2 sm:p-3 md:p-4 ${isChatOpen ? 'hidden md:block' : ''}`}>
              {/* Remote participant (main view) */}
              <div className="w-full h-full rounded-lg sm:rounded-xl md:rounded-2xl overflow-hidden bg-card relative">
                {consultationType === 'video' ? (
                  <>
                    {/* Remote video stream */}
                    <video
                      key="remote-video"
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      muted={false}
                      controls={false}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: hasRemoteStream ? 'block' : 'none' }}
                      onLoadedMetadata={(e) => {
                        console.log('[RemoteVideo] Metadata loaded, readyState:', (e.currentTarget as HTMLVideoElement).readyState);
                      }}
                      onPlay={() => {
                        console.log('[RemoteVideo] Video playing');
                      }}
                      onCanPlay={() => {
                        console.log('[RemoteVideo] Can play');
                      }}
                      onStalled={() => {
                        console.warn('[RemoteVideo] ⚠️ Video stalled');
                      }}
                    />
                    {/* Fallback when no remote stream */}
                    {!hasRemoteStream && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 p-4">
                        <div className="text-center">
                          <Avatar className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 mx-auto mb-3 sm:mb-4">
                            <AvatarFallback className="bg-primary text-primary-foreground text-2xl sm:text-3xl md:text-4xl">
                              {participantInitials}
                            </AvatarFallback>
                          </Avatar>
                          {connectionStatus === 'connecting' ? (
                            <p className="text-xs sm:text-sm md:text-base text-muted-foreground animate-pulse">Connecting to {participantName}...</p>
                          ) : (
                            <p className="text-xs sm:text-sm md:text-base text-muted-foreground">Waiting for {participantName} to join...</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Audio-only view */
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 p-4">
                    <motion.div
                      className="text-center"
                      animate={connectionStatus === 'connected' ? { scale: [1, 1.05, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <div className="relative">
                        <Avatar className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 mx-auto mb-3 sm:mb-4">
                          <AvatarFallback className="bg-primary text-primary-foreground text-3xl sm:text-4xl md:text-5xl">
                            {participantInitials}
                          </AvatarFallback>
                        </Avatar>
                        {connectionStatus === 'connected' && (
                          <motion.div
                            className="absolute inset-0 rounded-full border-2 sm:border-3 md:border-4 border-primary/30"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                          />
                        )}
                      </div>
                      <h3 className="text-lg sm:text-xl font-semibold mb-1">{participantName}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {connectionStatus === 'connecting' ? 'Connecting...' : 'Audio Call'}
                      </p>
                    </motion.div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Local video (picture-in-picture) - Always visible when in video call, positioned absolutely */}
          {consultationType === 'video' && isAdmitted && (
            <motion.div
              drag
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              className="fixed bottom-16 sm:bottom-20 md:bottom-4 right-2 sm:right-4 w-32 h-24 sm:w-40 sm:h-32 md:w-48 md:h-36 rounded-lg sm:rounded-xl overflow-hidden bg-card shadow-lg border sm:border-2 border-background z-40"
            >
              {isVideoEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                  onLoadedMetadata={(e) => {
                    console.log('[LocalVideo] Metadata loaded, stream active');
                  }}
                  onPlay={() => {
                    console.log('[LocalVideo] Video playing');
                  }}
                  onStalled={() => {
                    console.warn('[LocalVideo] ⚠️ Video stalled');
                  }}
                  onSuspend={() => {
                    console.warn('[LocalVideo] ⚠️ Video suspended');
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <User className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-muted-foreground" />
                </div>
              )}
              {!isAudioEnabled && (
                <div className="absolute bottom-1 left-1">
                  <Badge variant="destructive" className="text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0.5">
                    <MicOff className="w-2 h-2 sm:w-3 sm:h-3" />
                  </Badge>
                </div>
              )}
            </motion.div>
          )}

          {/* Chat sidebar - Always visible for chat type, togglable for others */}
          <AnimatePresence>
            {(isChatOpen || consultationType === 'chat') && (
              <motion.div
                initial={consultationType === 'chat' ? { width: '100%', opacity: 1 } : { width: 0, opacity: 0 }}
                animate={{ width: consultationType === 'chat' ? '100%' : 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className={`border-l border-border bg-card flex flex-col overflow-hidden text-sm sm:text-base ${consultationType === 'chat' ? 'w-full border-l-0' : ''}`}
              >
                <div className="flex items-center justify-between p-2 sm:p-3 md:p-4 border-b border-border gap-2">
                  <h3 className="font-semibold text-sm sm:text-base">Chat</h3>
                  {consultationType !== 'chat' && (
                    <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="h-8 w-8">
                      <X className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  )}
                </div>

                <ScrollArea ref={chatScrollRef} className="flex-1 p-2 sm:p-3 md:p-4">
                  <div className="space-y-4">
                    {messages.length === 0 ? (
                      <div className="text-center text-muted-foreground py-6 sm:py-8">
                        <MessageSquare className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 mx-auto mb-2 sm:mb-3 opacity-50" />
                        <p className="text-xs sm:text-sm">No messages yet</p>
                        <p className="text-[10px] sm:text-xs">Send a message to start the conversation</p>
                      </div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-1' : ''}`}>
                            <div
                              className={`rounded-xl sm:rounded-2xl px-2 sm:px-4 py-1 sm:py-2 ${message.sender === 'user'
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-muted rounded-bl-sm'
                                }`}
                            >
                              <p className="text-xs sm:text-sm break-words">{message.content}</p>
                            </div>
                            <p className="text-[8px] sm:text-[10px] text-muted-foreground mt-0.5 sm:mt-1 px-1">
                              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                <div className="p-2 sm:p-3 md:p-4 border-t border-border">
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                    className="flex gap-1 sm:gap-2"
                  >
                    <Input
                      placeholder="Message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1 text-xs sm:text-sm h-8 sm:h-10"
                    />
                    <Button type="submit" size="icon" disabled={!newMessage.trim()} className="h-8 w-8 sm:h-10 sm:w-10">
                      <Send className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls bar */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 md:gap-3 p-2 sm:p-3 md:p-4 border-t border-border bg-card overflow-x-auto">
          <TooltipProvider>
            {consultationType !== 'chat' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isAudioEnabled ? 'secondary' : 'destructive'}
                      size="icon"
                      className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex-shrink-0"
                      onClick={toggleAudio}
                    >
                      {isAudioEnabled ? <Mic className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" /> : <MicOff className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs sm:text-sm">{isAudioEnabled ? 'Mute' : 'Unmute'}</TooltipContent>
                </Tooltip>

                {consultationType === 'video' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isVideoEnabled ? 'secondary' : 'destructive'}
                        size="icon"
                        className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex-shrink-0"
                        onClick={toggleVideo}
                      >
                        {isVideoEnabled ? <Video className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" /> : <VideoOff className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs sm:text-sm"><span className="hidden sm:inline">Turn off camera</span><span className="sm:hidden">Camera</span></TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isSpeakerEnabled ? 'secondary' : 'destructive'}
                      size="icon"
                      className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex-shrink-0"
                      onClick={() => setIsSpeakerEnabled(!isSpeakerEnabled)}
                    >
                      {isSpeakerEnabled ? <Volume2 className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs sm:text-sm"><span className="hidden sm:inline">{isSpeakerEnabled ? 'Mute speaker' : 'Unmute speaker'}</span><span className="sm:hidden">Speaker</span></TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isChatOpen ? 'default' : 'secondary'}
                      size="icon"
                      className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex-shrink-0 hidden sm:flex"
                      onClick={() => setIsChatOpen(!isChatOpen)}
                    >
                      <MessageSquare className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs sm:text-sm">Chat</TooltipContent>
                </Tooltip>

                <div className="w-px h-6 sm:h-8 bg-border mx-1 sm:mx-2 flex-shrink-0" />
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full flex-shrink-0"
                  onClick={handleEndCall}
                >
                  <Phone className="w-4.5 h-4.5 sm:w-5 sm:h-5 md:w-6 md:h-6 rotate-[135deg]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs sm:text-sm">End Call</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
