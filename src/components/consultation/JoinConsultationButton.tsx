import { useNavigate } from 'react-router-dom';
import { Video, Phone, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface JoinConsultationButtonProps {
  appointmentId: string;
  consultationType: 'Video' | 'Audio' | 'Chat' | 'video' | 'audio' | 'chat';
  participantName: string;
  status?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function JoinConsultationButton({
  appointmentId,
  consultationType,
  participantName,
  status,
  variant = 'default',
  size = 'sm',
  className = ''
}: JoinConsultationButtonProps) {
  const navigate = useNavigate();

  const normalizedRaw = consultationType.toLowerCase();
  const isVideo = normalizedRaw.includes('video');
  const isChat = normalizedRaw.includes('chat');
  const isAudio = normalizedRaw.includes('audio');
  const isJoinable = !status || status === 'confirmed' || status === 'pending' || status === 'in-progress' || status === 'upcoming';

  const handleJoin = () => {
    if (!isJoinable) {
      toast({
        title: 'Cannot join',
        description: 'This consultation is not available to join.',
        variant: 'destructive'
      });
      return;
    }

    navigate(`/consultation/${appointmentId}?type=${normalizedRaw}&participant=${encodeURIComponent(participantName)}`);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleJoin}
      disabled={!isJoinable}
      className={`gap-2 ${className}`}
    >
      {isVideo ? (
        <Video className="w-4 h-4" />
      ) : isChat ? (
        <MessageSquare className="w-4 h-4" />
      ) : (
        <Phone className="w-4 h-4" />
      )}
      {isVideo ? 'Join Video Call' : isChat ? 'Join Chat' : 'Join Audio Call'}
    </Button>
  );
}
