import { useNavigate } from 'react-router-dom';
import { Video, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface JoinConsultationButtonProps {
  appointmentId: string;
  consultationType: 'Video' | 'Audio' | 'video' | 'audio';
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
  
  const normalizedType = consultationType.toLowerCase() as 'video' | 'audio';
  const isJoinable = !status || status === 'confirmed' || status === 'in-progress' || status === 'upcoming';

  const handleJoin = () => {
    if (!isJoinable) {
      toast({
        title: 'Cannot join',
        description: 'This consultation is not available to join.',
        variant: 'destructive'
      });
      return;
    }

    navigate(`/consultation/${appointmentId}?type=${normalizedType}&participant=${encodeURIComponent(participantName)}`);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleJoin}
      disabled={!isJoinable}
      className={`gap-2 ${className}`}
    >
      {normalizedType === 'video' ? (
        <Video className="w-4 h-4" />
      ) : (
        <Phone className="w-4 h-4" />
      )}
      Join {normalizedType === 'video' ? 'Video' : 'Audio'} Call
    </Button>
  );
}
