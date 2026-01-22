import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, MessageSquare,
  Settings, Send, X, User, AlertCircle, Camera
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
import { WebRTCService, type WebRTCSignal } from '@/services/webrtcService';
import { PatientLobby } from './PatientLobby';

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
  const [isChatOpen, setIsChatOpen] = useState(consultationType === 'chat');

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const participantInitials = participantName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

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
    // For patients: initialize media immediately (show local video in waiting room)
    // For doctors: initialize media only after session is ready
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
          console.log('[Media Init] Local video ref set with stream');
        }

        // Only initialize WebRTC if admitted
        if (!isAdmitted) {
          console.log('[Media Init] Media initialized but not admitted yet, WebRTC will initialize after admission');
          return;
        }

        const isInitiator = participantRole === 'doctor';
        const webrtc = new WebRTCService(sessionId, user.id, isInitiator);

        webrtc.onStream((remoteStream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          if (remoteAudioRef.current && remoteStream.getAudioTracks().length > 0) {
            remoteAudioRef.current.srcObject = remoteStream;
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

        // Request wake lock
        if ('wakeLock' in navigator) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wakeLock = (navigator as any).wakeLock as { request: (type: string) => Promise<WakeLockSentinel> };
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

  // Initialize WebRTC when patient gets admitted (media already ready)
  useEffect(() => {
    if (participantRole !== 'patient' || !isAdmitted || !sessionId || webrtcService || !localStreamRef.current || !user) return;

    const initializeWebRTC = async () => {
      try {
        const isInitiator = false; // Patients are not initiators
        const webrtc = new WebRTCService(sessionId, user.id, isInitiator);

        webrtc.onStream((remoteStream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          if (remoteAudioRef.current && remoteStream.getAudioTracks().length > 0) {
            remoteAudioRef.current.srcObject = remoteStream;
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

        webrtc.initializePeer(localStreamRef.current);
        setWebrtcService(webrtc);

        console.log('[WebRTC] Patient admitted - WebRTC initialized');
      } catch (err) {
        console.error('WebRTC initialization error:', err);
        toast({
          title: 'Connection Error',
          description: 'Failed to establish WebRTC connection',
          variant: 'destructive'
        });
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !sessionId) return;

    try {
      await consultationService.sendMessage(
        sessionId,
        user!.id,
        participantRole,
        participantName,
        newMessage,
        'text'
      );

      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        sender: 'user',
        senderName: participantName,
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
    // Close WebRTC connection
    if (webrtcService) {
      webrtcService.destroy();
    }

    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    // Clear video refs
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    // Release wake lock
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.log('Wake lock release error:', err);
      }
    }

    // Unsubscribe from channels
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    if (lobbyChannelRef.current) {
      lobbyChannelRef.current.unsubscribe();
    }

    console.log('[End Call] All resources cleaned up');
    onEndCall();
  }, [webrtcService, onEndCall]);

  // Only cleanup on component unmount (when ConsultationRoom is removed from DOM)
  useEffect(() => {
    return () => {
      console.log('[ConsultationRoom] Component unmounting, cleaning up');
      // Just stop media tracks on unmount - don't call handleEndCall to avoid premature end
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <Card className="w-full max-w-md bg-slate-900 border-slate-700">
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

  return (
    <div className="w-full h-full bg-black flex flex-col overflow-hidden">
      <audio ref={remoteAudioRef} autoPlay playsInline muted={false} controls={false} className="hidden" />

      {/* Main video area */}
      <div className="flex-1 relative overflow-hidden group">
        {consultationType !== 'chat' && (
          <div className="w-full h-full relative">
            {consultationType === 'video' ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  controls={false}
                  crossOrigin="anonymous"
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    display: hasRemoteStream ? 'block' : 'none',
                    backgroundColor: '#000'
                  }}
                />
                {!hasRemoteStream && (
                  <div className="w-full h-full flex items-center justify-center bg-slate-900 z-25 relative">
                    <div className="flex flex-col items-center gap-4 z-25 relative">
                      <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center">
                        <Camera className="w-16 h-16 text-slate-600" />
                      </div>
                      <p className="text-white text-lg">Waiting for participant...</p>
                      <p className="text-slate-400 text-sm">{participantName}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                <motion.div
                  className="text-center"
                  animate={connectionStatus === 'connected' ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Avatar className="w-40 h-40 mx-auto mb-4">
                    <AvatarFallback className="bg-primary text-primary-foreground text-5xl">{participantInitials}</AvatarFallback>
                  </Avatar>
                  <h3 className="text-2xl font-semibold mb-2 text-white">{participantName}</h3>
                  <p className="text-slate-400">
                    {connectionStatus === 'connecting' ? 'Connecting...' : 'Audio Call'}
                  </p>
                </motion.div>
              </div>
            )}

            {/* Local video PiP - Bottom right */}
            {consultationType === 'video' && (
              <motion.div
                drag
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                className="absolute bottom-20 sm:bottom-24 md:bottom-28 right-2 sm:right-4 w-28 h-24 sm:w-40 sm:h-32 md:w-48 md:h-36 rounded-lg overflow-hidden bg-black shadow-2xl border-2 border-slate-700 z-50 cursor-grab active:cursor-grabbing"
              >
                {isVideoEnabled ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ 
                      transform: 'scaleX(-1)',
                      filter: 'brightness(1.2) contrast(1.1) saturate(1.1)'
                    }}
                    onLoadedMetadata={() => {
                      console.log('[LocalVideo] Stream loaded, dimensions:', localVideoRef.current?.videoWidth, 'x', localVideoRef.current?.videoHeight);
                    }}
                    onPlay={() => {
                      console.log('[LocalVideo] Video playing');
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-800">
                    <User className="w-12 h-12 text-slate-600" />
                  </div>
                )}
              </motion.div>
            )}

            {/* Header - Connection status & timer */}
            <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
              <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'} className="gap-2">
                <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                {connectionStatus === 'connecting' ? 'Connecting...' : 'Connected'}
              </Badge>
              {connectionStatus === 'connected' && (
                <Badge variant="secondary" className="font-mono">
                  {String(Math.floor(callDuration / 60)).padStart(2, '0')}:{String(callDuration % 60).padStart(2, '0')}
                </Badge>
              )}
            </div>

            {/* Admit Patient Dialog */}
            {participantRole === 'doctor' && isPatientWaiting && (
              <div className="absolute inset-0 z-35 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-white mb-4">Patient Waiting</h2>
                  <p className="text-slate-300 mb-6">A patient is in the waiting room</p>
                  <Button
                    onClick={async () => {
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
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white gap-2 text-lg px-8 py-2 rounded-lg"
                  >
                    <User className="w-5 h-5" />
                    Admit Patient
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat-only view */}
        {consultationType === 'chat' && (
          <div className="w-full h-full flex flex-col bg-slate-900">
            <div className="p-4 border-b border-slate-700 bg-slate-800/50 z-30 relative">
              <h2 className="text-xl font-semibold text-white">{participantName}</h2>
              <p className="text-xs text-slate-400">Chat consultation</p>
            </div>
          </div>
        )}
      </div>

      {/* Patient Lobby */}
      {!isAdmitted && participantRole === 'patient' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 pointer-events-auto">
          <div className="text-center space-y-6 sm:space-y-8 max-w-sm w-full relative">
            <Avatar className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 mx-auto">
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl sm:text-4xl">{participantInitials}</AvatarFallback>
            </Avatar>
            <div className="space-y-2 sm:space-y-3">
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white">Waiting Room</h3>
              <p className="text-slate-300 text-base sm:text-lg">Waiting for the doctor to admit you...</p>
            </div>
            <Button
              onClick={handleEndCall}
              variant="destructive"
              className="w-full gap-2 text-sm sm:text-base py-2 sm:py-3"
            >
              <X className="w-4 h-4" />
              Leave Waiting Room
            </Button>
          </div>
        </div>
      )}

      {/* Chat sidebar */}
      <AnimatePresence>
        {(isChatOpen || consultationType === 'chat') && consultationType !== 'chat' && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden w-full sm:w-72 md:w-96"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
              <h3 className="font-semibold text-white">Chat</h3>
              <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea ref={chatScrollRef} className="flex-1 p-4">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-xs">
                        <div className={`rounded-2xl px-4 py-2 ${
                          message.sender === 'user'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-slate-700 text-slate-100 rounded-bl-none'
                        }`}>
                          <p className="text-sm break-words">{message.content}</p>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 px-2">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-slate-700 bg-slate-800/50">
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 bg-slate-700 border-slate-600 text-white placeholder-slate-400 h-10 rounded-full px-4"
                />
                <Button type="submit" disabled={!newMessage.trim()} className="bg-blue-600 hover:bg-blue-700 rounded-full h-10 w-10 p-0">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-width chat for chat-only consultations */}
      {consultationType === 'chat' && (
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-slate-400 py-12">
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-base">No messages yet</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-2xl">
                      <div className={`rounded-2xl px-4 py-2 ${
                        message.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-slate-700 text-slate-100 rounded-bl-none'
                      }`}>
                        <p className="text-base break-words">{message.content}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 px-2">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-slate-700 bg-slate-800/50">
            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 bg-slate-700 border-slate-600 text-white placeholder-slate-400 h-12 rounded-full px-4"
              />
              <Button type="submit" disabled={!newMessage.trim()} className="bg-blue-600 hover:bg-blue-700 rounded-full h-12 w-12 p-0">
                <Send className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Control bar - Bottom */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center gap-2 sm:gap-4 p-3 sm:p-4 md:p-6 bg-gradient-to-t from-black/80 to-transparent z-40"
      >
        <TooltipProvider>
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 bg-slate-800/60 backdrop-blur-sm rounded-full px-3 sm:px-4 md:px-6 py-2 sm:py-3">
            {consultationType !== 'chat' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isAudioEnabled ? 'secondary' : 'destructive'}
                      size="icon"
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0"
                      onClick={toggleAudio}
                    >
                      {isAudioEnabled ? <Mic className="w-4 sm:w-5 h-4 sm:h-5" /> : <MicOff className="w-4 sm:w-5 h-4 sm:h-5" />}
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
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0"
                        onClick={toggleVideo}
                      >
                        {isVideoEnabled ? <Video className="w-4 sm:w-5 h-4 sm:h-5" /> : <VideoOff className="w-4 sm:w-5 h-4 sm:h-5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Camera</TooltipContent>
                  </Tooltip>
                )}

                <div className="w-px h-6 sm:h-8 bg-slate-600 mx-1 sm:mx-2 flex-shrink-0" />
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isChatOpen ? 'default' : 'secondary'}
                  size="icon"
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0"
                  onClick={() => setIsChatOpen(!isChatOpen)}
                >
                  <MessageSquare className="w-4 sm:w-5 h-4 sm:h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Chat</TooltipContent>
            </Tooltip>

            <div className="w-px h-6 sm:h-8 bg-slate-600 mx-1 sm:mx-2 flex-shrink-0" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0"
                  onClick={handleEndCall}
                >
                  <Phone className="w-4 sm:w-5 h-4 sm:h-5 rotate-[135deg]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>End Call</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </motion.div>
    </div>
  );
}
