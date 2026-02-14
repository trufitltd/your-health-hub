import { Mic, MicOff, Video, VideoOff, MessageSquare, Hand, PhoneOff, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface ControlBarProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isChatOpen: boolean;
  handRaised: boolean;
  messageCount: number;
  unreadMessageCount: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleChat: () => void;
  onToggleHand: () => void;
  onLeaveCall: () => void;
  onEndCallForEveryone?: () => void;
  canEndCallForEveryone?: boolean;
}

export function ControlBar({
  isAudioEnabled,
  isVideoEnabled,
  isChatOpen,
  handRaised,
  messageCount,
  unreadMessageCount,
  onToggleAudio,
  onToggleVideo,
  onToggleChat,
  onToggleHand,
  onLeaveCall,
  onEndCallForEveryone,
  canEndCallForEveryone = false
}: ControlBarProps) {
  return (
    <div className="relative z-30 p-3 sm:p-4 bg-gradient-to-t from-black/60 to-transparent">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2 sm:gap-3 bg-[#252542]/80 backdrop-blur-md rounded-full px-3 sm:px-6 py-2 sm:py-3">
          <TooltipProvider>
            {/* Audio/Video controls */}
            {(
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

                {/* Video control */}
                {(
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
                <button
                  className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full transition-all flex items-center justify-center ${
                    isChatOpen 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                  onClick={onToggleChat}
                >
                  <MessageSquare className="w-5 h-5" />
                  {/* Show bell icon with unread count when there are unread messages */}
                  {unreadMessageCount > 0 && !isChatOpen && (
                    <>
                      <Bell className="absolute w-3 h-3 text-yellow-400 fill-yellow-400 animate-pulse top-0 right-0" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-red-500 text-[10px] rounded-full flex items-center justify-center text-white font-bold">
                        {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                      </span>
                    </>
                  )}
                  {/* Show total message count when chat is open or no unread messages */}
                  {messageCount > 0 && !isChatOpen && unreadMessageCount === 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-[10px] rounded-full flex items-center justify-center">
                      {messageCount > 9 ? '9+' : messageCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {unreadMessageCount > 0 ? `${unreadMessageCount} unread message${unreadMessageCount > 1 ? 's' : ''}` : 'Chat'}
              </TooltipContent>
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

            {/* Leave / end call button */}
            {canEndCallForEveryone && onEndCallForEveryone ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="w-10 h-10 sm:w-14 sm:h-12 rounded-full bg-red-500 hover:bg-red-600"
                  >
                    <PhoneOff className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="center" className="w-52">
                  <DropdownMenuItem onClick={onLeaveCall}>
                    Leave call
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={onEndCallForEveryone}
                  >
                    End call for everyone
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="w-10 h-10 sm:w-14 sm:h-12 rounded-full bg-red-500 hover:bg-red-600"
                    onClick={onLeaveCall}
                  >
                    <PhoneOff className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Leave Call</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
