import { useNavigate } from 'react-router-dom';
import { Video, Phone, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { normalizeAppointmentStatus } from '@/services/marketplaceTypes';

interface JoinConsultationButtonProps {
  appointmentId: string;
  participantName: string;
  status?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function JoinConsultationButton({
  appointmentId,
  participantName,
  status,
  variant = 'default',
  size = 'sm',
  className = ''
}: JoinConsultationButtonProps) {
  const navigate = useNavigate();
  // We no longer track appointment "type". Default to video-enabled consultations.
  const isVideo = true;
  const isChat = false;
  const isAudio = true;
  const normalizedStatus = normalizeAppointmentStatus(status);
  const isJoinable =
    !status ||
    normalizedStatus === 'confirmed' ||
    normalizedStatus === 'pending' ||
    normalizedStatus === 'in_progress';

  const handleJoin = () => {
    if (!isJoinable) {
      toast({
        title: 'Cannot join',
        description: 'This consultation is not available to join.',
        variant: 'destructive'
      });
      return;
    }
    // Navigate without a type parameter; consultations are uniform now
    navigate(`/consultation/${appointmentId}?participant=${encodeURIComponent(participantName)}`);
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
