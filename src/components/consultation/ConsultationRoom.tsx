import { useState, useRef, useEffect, useCallback } from 'react';
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

          session = await consultationService.createSession(
            appointmentId,
            appointmentData.patient_id,
            appointmentData.doctor_id,
            consultationType
          );
        }

        // Initialize WebRTC based on role and admission status
        if (participantRole === 'doctor') {
          setIsAdmitted(true);
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
                setIsPatientWaiting(true);
                toast({
                  title: 'Patient Waiting',
                  description: `${participantName} is waiting in the lobby.`,
                });
              } else if (signal.signal_data.type === 'admit' && participantRole === 'patient') {
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
        setConnectionStatus('connected');
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
  }, [user, appointmentId, participantRole, consultationType]);

  // Initialize local media and WebRTC
  useEffect(() => {
    const initializeMedia = async () => {
      if (consultationType === 'chat' || !sessionId || !user || !isAdmitted) {
        return;
      }

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
        console.log('WebRTC already initialized, skipping');
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: consultationType === 'video',
          audio: true
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Initialize WebRTC service only after media is ready
        try {
          const isInitiator = participantRole === 'doctor';
          const webrtc = new WebRTCService(sessionId, user.id, isInitiator);

          webrtc.onStream((remoteStream) => {
            console.log('Setting remote stream, tracks:', remoteStream.getTracks().length);
            setHasRemoteStream(true);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
              console.log('Remote video element srcObject set');
            }
          });

          webrtc.onError((error) => {
            console.error('WebRTC error:', error);
            toast({
              title: 'Connection Error',
              description: 'Failed to establish video connection',
              variant: 'destructive'
            });
          });

          await webrtc.initializePeer(stream);
          setWebrtcService(webrtc);
        } catch (webrtcError) {
          console.error('WebRTC initialization error:', webrtcError);
          toast({
            title: 'WebRTC Error',
            description: 'Failed to initialize video connection',
            variant: 'destructive'
          });
        }

      } catch (error) {
        console.error('Failed to get media devices:', error);
        toast({
          title: 'Media Access Error',
          description: 'Please allow camera and microphone access',
          variant: 'destructive'
        });
      }
    };

    if (sessionId && connectionStatus === 'connected') {
      initializeMedia();
    }

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (webrtcService) {
        webrtcService.destroy();
        setWebrtcService(null);
      }
    };
  }, [consultationType, sessionId, user, participantRole, connectionStatus]);

  // Call duration timer
  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionStatus]);



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
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
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
        toast({
          title: 'Success',
          description: 'Consultation ended successfully'
        });
      } catch (err) {
        console.error('Error ending session:', err);
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback className="bg-primary/10 text-primary">{participantInitials}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-sm">{participantName}</h2>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  connectionStatus === 'connected'
                    ? 'bg-success/10 text-success border-success/20'
                    : connectionStatus === 'connecting'
                      ? 'bg-warning/10 text-warning border-warning/20'
                      : 'bg-destructive/10 text-destructive border-destructive/20'
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${connectionStatus === 'connected' ? 'bg-success' :
                  connectionStatus === 'connecting' ? 'bg-warning animate-pulse' : 'bg-destructive'
                  }`} />
                {connectionStatus === 'connected' ? 'Connected' :
                  connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </Badge>
              {connectionStatus === 'connected' && (
                <span className="text-xs text-muted-foreground">{formatDuration(callDuration)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                >
                  {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Doctor Admit Button Overlay */}
        {participantRole === 'doctor' && isPatientWaiting && !hasRemoteStream && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50">
            <Button
              onClick={async () => {
                if (!sessionId || !user) return;
                await supabase.from('webrtc_signals').insert({
                  session_id: sessionId,
                  sender_id: user.id,
                  signal_data: { type: 'admit' }
                });
                setIsPatientWaiting(false);
                toast({ title: "Patient Admitted", description: "Connecting..." });
              }}
              className="bg-green-600 hover:bg-green-700 text-white shadow-lg animate-pulse"
            >
              Admit Patient to Call
            </Button>
          </div>
        )}

        {/* Patient Lobby Screen */}
        {!isAdmitted && participantRole === 'patient' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
            <div className="text-center space-y-4">
              <Avatar className="w-24 h-24 mx-auto animate-pulse">
                <AvatarFallback>{participantInitials}</AvatarFallback>
              </Avatar>
              <h3 className="text-2xl font-semibold">Waiting Room</h3>
              <p className="text-muted-foreground">Waiting for the doctor to admit you...</p>
            </div>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Video/Audio area - Hidden if chat only and chat is open (or maybe just hidden completely for chat type) */}
          {consultationType !== 'chat' && (
            <div className={`flex-1 relative bg-muted/50 p-4 ${isChatOpen ? 'hidden md:block' : ''}`}>
              {/* Remote participant (main view) */}
              <div className="w-full h-full rounded-2xl overflow-hidden bg-card relative">
                {consultationType === 'video' ? (
                  <>
                    {/* Remote video stream */}
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      muted={false}
                      onLoadedMetadata={(e) => {
                        console.log('Remote video metadata loaded (event)');
                        e.currentTarget.play().catch(err => console.error('Remote video play error:', err));
                      }}
                      className={`w-full h-full object-cover ${hasRemoteStream ? 'block' : 'hidden'}`}
                    />
                    {/* Fallback when no remote stream */}
                    {!hasRemoteStream && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
                        <div className="text-center">
                          <Avatar className="w-32 h-32 mx-auto mb-4">
                            <AvatarFallback className="bg-primary text-primary-foreground text-4xl">
                              {participantInitials}
                            </AvatarFallback>
                          </Avatar>
                          {connectionStatus === 'connecting' ? (
                            <p className="text-muted-foreground animate-pulse">Connecting to {participantName}...</p>
                          ) : (
                            <p className="text-muted-foreground">Waiting for {participantName} to join...</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Audio-only view */
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
                    <motion.div
                      className="text-center"
                      animate={connectionStatus === 'connected' ? { scale: [1, 1.05, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <div className="relative">
                        <Avatar className="w-40 h-40 mx-auto mb-4">
                          <AvatarFallback className="bg-primary text-primary-foreground text-5xl">
                            {participantInitials}
                          </AvatarFallback>
                        </Avatar>
                        {connectionStatus === 'connected' && (
                          <motion.div
                            className="absolute inset-0 rounded-full border-4 border-primary/30"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                          />
                        )}
                      </div>
                      <h3 className="text-xl font-semibold mb-1">{participantName}</h3>
                      <p className="text-muted-foreground">
                        {connectionStatus === 'connecting' ? 'Connecting...' : 'Audio Call'}
                      </p>
                    </motion.div>
                  </div>
                )}

                {/* Local video (picture-in-picture) */}
                {consultationType === 'video' && (
                  <motion.div
                    drag
                    dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                    className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden bg-card shadow-lg border-2 border-background"
                  >
                    {isVideoEnabled ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover mirror"
                        style={{ transform: 'scaleX(-1)' }}
                        onLoadedMetadata={(e) => {
                          console.log('Local video metadata loaded');
                          e.currentTarget.play().catch(err => console.error('Local video play error:', err));
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <User className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                    {!isAudioEnabled && (
                      <div className="absolute bottom-2 left-2">
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
                          <MicOff className="w-3 h-3" />
                        </Badge>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {/* Chat sidebar - Always visible for chat type, togglable for others */}
          <AnimatePresence>
            {(isChatOpen || consultationType === 'chat') && (
              <motion.div
                initial={consultationType === 'chat' ? { width: '100%', opacity: 1 } : { width: 0, opacity: 0 }}
                animate={{ width: consultationType === 'chat' ? '100%' : 360, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className={`border-l border-border bg-card flex flex-col overflow-hidden ${consultationType === 'chat' ? 'w-full border-l-0' : ''}`}
              >
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="font-semibold">Chat</h3>
                  {consultationType !== 'chat' && (
                    <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <ScrollArea ref={chatScrollRef} className="flex-1 p-4">
                  <div className="space-y-4">
                    {messages.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">No messages yet</p>
                        <p className="text-xs">Send a message to start the conversation</p>
                      </div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-1' : ''}`}>
                            <div
                              className={`rounded-2xl px-4 py-2 ${message.sender === 'user'
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-muted rounded-bl-sm'
                                }`}
                            >
                              <p className="text-sm">{message.content}</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1 px-1">
                              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                <div className="p-4 border-t border-border">
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                    className="flex gap-2"
                  >
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls bar */}
        <div className="flex items-center justify-center gap-3 p-4 border-t border-border bg-card">
          <TooltipProvider>
            {consultationType !== 'chat' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isAudioEnabled ? 'secondary' : 'destructive'}
                      size="icon"
                      className="w-12 h-12 rounded-full"
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
                        className="w-12 h-12 rounded-full"
                        onClick={toggleVideo}
                      >
                        {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isSpeakerEnabled ? 'secondary' : 'destructive'}
                      size="icon"
                      className="w-12 h-12 rounded-full"
                      onClick={() => setIsSpeakerEnabled(!isSpeakerEnabled)}
                    >
                      {isSpeakerEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isSpeakerEnabled ? 'Mute speaker' : 'Unmute speaker'}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isChatOpen ? 'default' : 'secondary'}
                      size="icon"
                      className="w-12 h-12 rounded-full"
                      onClick={() => setIsChatOpen(!isChatOpen)}
                    >
                      <MessageSquare className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Chat</TooltipContent>
                </Tooltip>

                <div className="w-px h-8 bg-border mx-2" />
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  className="w-14 h-14 rounded-full"
                  onClick={handleEndCall}
                >
                  <Phone className="w-6 h-6 rotate-[135deg]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>End Call</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
