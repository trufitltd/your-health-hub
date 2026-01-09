import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, MessageSquare,
  Maximize2, Minimize2, Settings, Volume2, VolumeX,
  Send, Paperclip, MoreVertical, X, User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  consultationType: 'video' | 'audio';
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
  const [isVideoEnabled, setIsVideoEnabled] = useState(consultationType === 'video');
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [callDuration, setCallDuration] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Simulate connection and initialize local media
  useEffect(() => {
    const initializeMedia = async () => {
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

        // Simulate connection delay
        setTimeout(() => {
          setConnectionStatus('connected');
        }, 2000);
      } catch (error) {
        console.error('Failed to get media devices:', error);
        setConnectionStatus('disconnected');
      }
    };

    initializeMedia();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [consultationType]);

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

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const message: Message = {
      id: Date.now().toString(),
      sender: 'user',
      senderName: participantRole === 'doctor' ? 'Dr. You' : 'You',
      content: newMessage,
      timestamp: new Date(),
      type: 'text'
    };

    setMessages(prev => [...prev, message]);
    setNewMessage('');

    // Simulate response after a delay
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'remote',
        senderName: participantName,
        content: getSimulatedResponse(newMessage),
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, response]);
    }, 1500);
  };

  const getSimulatedResponse = (message: string): string => {
    const responses = [
      "I understand. Can you tell me more about your symptoms?",
      "That's helpful information. Let me note that down.",
      "I see. How long have you been experiencing this?",
      "Thank you for sharing. Any other concerns?",
      "Good to know. I'll include this in my assessment."
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const participantInitials = participantName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  connectionStatus === 'connected' ? 'bg-success' :
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
      <div className="flex-1 flex overflow-hidden">
        {/* Video/Audio area */}
        <div className="flex-1 relative bg-muted/50 p-4">
          {/* Remote participant (main view) */}
          <div className="w-full h-full rounded-2xl overflow-hidden bg-card relative">
            {consultationType === 'video' ? (
              <>
                {/* Simulated remote video - in production this would be the actual remote stream */}
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
                      <p className="text-muted-foreground">Video stream placeholder</p>
                    )}
                  </div>
                </div>
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover hidden" />
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

        {/* Chat sidebar */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-border bg-card flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="font-semibold">Chat</h3>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
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
                            className={`rounded-2xl px-4 py-2 ${
                              message.sender === 'user'
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                className="w-14 h-14 rounded-full"
                onClick={onEndCall}
              >
                <Phone className="w-6 h-6 rotate-[135deg]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>End Call</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
