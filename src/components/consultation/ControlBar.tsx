import { Mic, MicOff, Video, VideoOff, MessageSquare, Hand, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ControlBarProps {
  consultationType: 'video' | 'audio' | 'chat';
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isChatOpen: boolean;
  handRaised: boolean;
  messageCount: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleChat: () => void;
  onToggleHand: () => void;
  onEndCall: () => void;
}

export function ControlBar({
  consultationType,
  isAudioEnabled,
  isVideoEnabled,
  isChatOpen,
  handRaised,
  messageCount,
  onToggleAudio,
  onToggleVideo,
  onToggleChat,
  onToggleHand,
  onEndCall
}: ControlBarProps) {
  return (
    <div className="relative z-30 p-3 sm:p-4 bg-gradient-to-t from-black/60 to-transparent">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2 sm:gap-3 bg-[#252542]/80 backdrop-blur-md rounded-full px-3 sm:px-6 py-2 sm:py-3">
          <TooltipProvider>
            {/* Audio/Video controls - only for non-chat consultations */}
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
                      onClick={onToggleAudio}
                    >
                      {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isAudioEnabled ? 'Mute' : 'Unmute'}</TooltipContent>
                </Tooltip>

                {/* Video control - only for video consultations */}
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
                        onClick={onToggleVideo}
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

            {/* Chat button - always available */}
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
                  onClick={onToggleChat}
                >
                  <MessageSquare className="w-5 h-5" />
                  {messageCount > 0 && !isChatOpen && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-[10px] rounded-full flex items-center justify-center">
                      {messageCount > 9 ? '9+' : messageCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Chat</TooltipContent>
            </Tooltip>

            {/* Hand raise button */}
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
                  onClick={onToggleHand}
                >
                  <Hand className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{handRaised ? 'Lower hand' : 'Raise hand'}</TooltipContent>
            </Tooltip>

            <div className="w-px h-8 bg-white/20 mx-1 hidden sm:block" />

            {/* End call button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  className="w-10 h-10 sm:w-14 sm:h-12 rounded-full bg-red-500 hover:bg-red-600"
                  onClick={onEndCall}
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
  );
}
