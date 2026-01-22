import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, X, User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';

interface PatientLobbyProps {
  participantName: string;
  consultationType: 'video' | 'audio' | 'chat';
  localStream: MediaStream | null;
  onLeave: () => void;
}

export function PatientLobby({
  participantName,
  consultationType,
  localStream,
  onLeave,
}: PatientLobbyProps) {
  const navigate = useNavigate();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(consultationType === 'video');
  const [isAudioEnabled, setIsAudioEnabled] = useState(consultationType !== 'chat');

  const participantInitials = participantName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsVideoEnabled(track.enabled);
      });
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsAudioEnabled(track.enabled);
      });
    }
  };

  const handleLeave = () => {
    toast({ title: 'Left', description: 'You have left the waiting room.' });
    onLeave();
    navigate(-1);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 p-4 sm:p-6">
      <div className="w-full h-full max-w-4xl mx-auto flex flex-col items-center justify-center">

        {/* Video Preview */}
        {consultationType === 'video' && (
          <div className="relative z-10 w-full max-w-2xl aspect-video rounded-lg overflow-hidden bg-black shadow-2xl border-2 border-slate-700 mb-6">
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
              <div className="w-full h-full flex items-center justify-center bg-slate-800">
                <User className="w-24 h-24 text-slate-600" />
              </div>
            )}
          </div>
        )}

        {/* Waiting Info */}
        <div className="text-center space-y-3 sm:space-y-4">
          <Avatar className="w-20 h-20 sm:w-24 sm:h-24 mx-auto border-4 border-slate-700">
            <AvatarFallback className="bg-primary text-primary-foreground text-3xl sm:text-4xl">{participantInitials}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-2xl sm:text-3xl font-semibold text-white">Waiting Room</h3>
            <p className="text-slate-300 text-base sm:text-lg">Waiting for {participantName} to admit you...</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 sm:gap-4 mt-8">
          <TooltipProvider>
            {consultationType !== 'chat' && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isAudioEnabled ? 'secondary' : 'destructive'}
                      size="icon"
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-full"
                      onClick={toggleAudio}
                    >
                      {isAudioEnabled ? <Mic className="w-5 sm:w-6 h-5 sm:h-6" /> : <MicOff className="w-5 sm:w-6 h-5 sm:h-6" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isAudioEnabled ? 'Mute Microphone' : 'Unmute Microphone'}</TooltipContent>
                </Tooltip>

                {consultationType === 'video' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isVideoEnabled ? 'secondary' : 'destructive'}
                        size="icon"
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full"
                        onClick={toggleVideo}
                      >
                        {isVideoEnabled ? <Video className="w-5 sm:w-6 h-5 sm:h-6" /> : <VideoOff className="w-5 sm:w-6 h-5 sm:h-6" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleLeave}
                  variant="destructive"
                  className="w-auto h-12 sm:h-14 rounded-full px-6 sm:px-8 gap-2 text-base"
                >
                  <X className="w-5 h-5" />
                  Leave
                </Button>
              </TooltipTrigger>
              <TooltipContent>Leave Waiting Room</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
