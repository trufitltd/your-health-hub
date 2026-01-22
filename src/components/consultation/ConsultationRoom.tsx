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
  const [error, setError] = useState<string | null>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [webrtcService, setWebrtcService] = useState<WebRTCService | null>(null);
  const [isAdmitted, setIsAdmitted] = useState(false);
  const [isPatientWaiting, setIsPatientWaiting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsPanelOpen, setIsParticipantsPanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
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
        let session = await consultationService.getSessionByAppointmentId(appointmentId);
        let patientId: string | null = null;
        let doctorId: string | null = null;

        if (!session) {
          const { data: appointmentData, error: appointmentError } = await supabase
            .from('appointments')
            .select('patient_id, doctor_id')
            .eq('id', appointmentId)
            .single();

          if (appointmentError) throw new Error(`Failed to get appointment data: ${appointmentError.message}`);

          patientId = appointmentData.patient_id;
          doctorId = appointmentData.doctor_id;

          session = await consultationService.createSession(
            appointmentId,
            patientId,
            doctorId,
            consultationType
          );
        } else {
          patientId = session.patient_id;
          doctorId = session.doctor_id;
        }

        if (participantRole === 'doctor') {
          setIsAdmitted(true);
          if (patientId) {
            const { data: existingSignals } = await supabase
              .from('webrtc_signals')
              .select('*')
              .eq('session_id', session.id)
              .eq('sender_id', patientId);
            
            if (existingSignals && existingSignals.length > 0) {
              const joinLobbySignal = existingSignals.find((sig: WebRTCSignal) => sig.signal_data?.type === 'join_lobby');
              if (joinLobbySignal) {
                setIsPatientWaiting(true);
                toast({
                  title: 'Patient Waiting',
                  description: 'A patient is in the waiting room and ready to be admitted.',
                });
              }
            }
          }
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
              if (signal.sender_id !== user?.id) {
                if (participantRole === 'doctor' && signal.signal_data?.type === 'join_lobby') {
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

        if (participantRole === 'patient') {
          const { error: insertError } = await supabase.from('webrtc_signals').insert({
            session_id: session.id,
            sender_id: user.id,
            signal_data: { type: 'join_lobby' }
          });
          if (insertError) console.error('Error sending join_lobby signal:', insertError);
        }

        setSessionId(session.id);

        const existingMessages = await consultationService.getMessages(session.id);
        setMessages(existingMessages.map(msg => ({
          id: msg.id,
          sender: msg.sender_id === user?.id ? 'user' : 'remote',
          senderName: msg.sender_name,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          type: msg.message_type as 'text' | 'file'
        })));

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

        unsubscribeRef.current = unsubscribe;
        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing session:', err);
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

  // Initialize media and WebRTC
  useEffect(() => {
    const shouldInitialize = participantRole === 'patient' 
      ? (sessionId && !webrtcService && user)
      : (sessionId && isAdmitted && !webrtcService && user);

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

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        if (!isAdmitted) {
          return;
        }

        const isInitiator = participantRole === 'doctor';
        const webrtc = new WebRTCService(sessionId, user.id, isInitiator);

        webrtc.onStream((remoteStream) => {
          console.log('[ConsultationRoom] 🎥 Remote stream received:', {
            tracks: remoteStream.getTracks().length,
            videoTracks: remoteStream.getVideoTracks().length,
            audioTracks: remoteStream.getAudioTracks().length
          });
          
          // Set video stream
          if (remoteVideoRef.current) {
            console.log('[ConsultationRoom] 🎥 Setting remote video srcObject');
            remoteVideoRef.current.srcObject = remoteStream;
            // Explicitly play with retry
            remoteVideoRef.current.play().catch((e) => {
              console.warn('[ConsultationRoom] 🎥 Video autoplay failed:', e);
              setTimeout(() => {
                remoteVideoRef.current?.play().catch((err) => 
                  console.error('[ConsultationRoom] 🎥 Retry play failed:', err)
                );
              }, 500);
            });
          } else {
            console.warn('[ConsultationRoom] ⚠️ remoteVideoRef.current is null!');
          }
          
          // Set audio stream
          if (remoteAudioRef.current && remoteStream.getAudioTracks().length > 0) {
            console.log('[ConsultationRoom] 🔊 Setting remote audio srcObject');
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch((e) => 
              console.warn('[ConsultationRoom] 🔊 Audio autoplay failed:', e)
            );
          }
          
          setHasRemoteStream(true);
        });

        webrtc.onConnected(() => {
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

        if ('wakeLock' in navigator) {
          try {
            const wakeLock = (navigator as unknown as { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock;
            wakeLockRef.current = await wakeLock.request('screen');
          } catch (err) {
            console.log('Wake lock not available');
          }
        }
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
  }, [sessionId, isAdmitted, user, webrtcService, consultationType, participantRole]);

  // Initialize WebRTC when patient gets admitted
  useEffect(() => {
    if (participantRole !== 'patient' || !isAdmitted || !sessionId || webrtcService || !localStreamRef.current || !user) return;

    const initializeWebRTC = async () => {
      try {
        const isInitiator = false;
        const webrtc = new WebRTCService(sessionId, user.id, isInitiator);

        webrtc.onStream((remoteStream) => {
          console.log('[ConsultationRoom] 🎥 Remote stream received (patient):', {
            tracks: remoteStream.getTracks().length,
            videoTracks: remoteStream.getVideoTracks().length,
            audioTracks: remoteStream.getAudioTracks().length
          });
          
          if (remoteVideoRef.current) {
            console.log('[ConsultationRoom] 🎥 Setting remote video srcObject (patient)');
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch((e) => {
              console.warn('[ConsultationRoom] 🎥 Video autoplay failed (patient):', e);
              setTimeout(() => {
                remoteVideoRef.current?.play().catch((err) => 
                  console.error('[ConsultationRoom] 🎥 Retry play failed (patient):', err)
                );
              }, 500);
            });
          } else {
            console.warn('[ConsultationRoom] ⚠️ remoteVideoRef.current is null (patient)!');
          }
          
          if (remoteAudioRef.current && remoteStream.getAudioTracks().length > 0) {
            console.log('[ConsultationRoom] 🔊 Setting remote audio srcObject (patient)');
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch((e) => 
              console.warn('[ConsultationRoom] 🔊 Audio autoplay failed (patient):', e)
            );
          }
          
          setHasRemoteStream(true);
        });

        webrtc.onConnected(() => {
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
  if (isLoading) {
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
                  {/* Always render video element so ref is available */}
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ 
                      display: hasRemoteStream ? 'block' : 'none',
                      backgroundColor: '#000'
                    }}
                    onLoadedMetadata={() => console.log('[ConsultationRoom] 🎥 Remote video metadata loaded')}
                    onPlay={() => console.log('[ConsultationRoom] 🎥 Remote video playing')}
                    onCanPlay={() => console.log('[ConsultationRoom] 🎥 Remote video can play')}
                    onStalled={() => console.warn('[ConsultationRoom] ⚠️ Remote video stalled')}
                    onError={(e) => console.error('[ConsultationRoom] ❌ Remote video error:', e)}
                  />
                  {/* Fallback avatar when no remote stream */}
                  {!hasRemoteStream && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <Avatar className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4">
                          <AvatarFallback className="bg-slate-700 text-slate-300 text-3xl sm:text-4xl">
                            {participantInitials}
                          </AvatarFallback>
                        </Avatar>
                        <p className="text-white text-lg font-medium">{participantName}</p>
                        <p className="text-slate-400 text-sm mt-1">
                          {connectionStatus === 'connecting' ? 'Connecting...' : 'Camera off'}
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Participant name tag */}
                  <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-black/50 rounded-lg backdrop-blur-sm">
                    <span className="text-white text-sm font-medium">{participantName}</span>
                  </div>
                </div>

                {/* Local video (PIP) */}
                <motion.div
                  drag
                  dragConstraints={containerRef}
                  className="absolute bottom-20 sm:bottom-24 right-3 sm:right-6 w-32 h-24 sm:w-48 sm:h-36 rounded-xl overflow-hidden bg-[#252542] shadow-2xl border border-white/10 cursor-grab active:cursor-grabbing z-20"
                >
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
                    <div className="w-full h-full flex items-center justify-center bg-[#252542]">
                      <User className="w-10 h-10 text-slate-500" />
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
