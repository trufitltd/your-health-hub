import { useNavigate } from 'react-router-dom';
import { Video, Phone, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { normalizeAppointmentStatus } from '@/services/marketplaceTypes';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { extractConsultationLanguageFromNotes, normalizeConsultationLanguage } from '@/lib/consultationLanguage';

interface JoinConsultationButtonProps {
  appointmentId: string;
  participantName: string;
  status?: string;
  consultationLanguage?: string | null;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function JoinConsultationButton({
  appointmentId,
  participantName,
  status,
  consultationLanguage,
  variant = 'default',
  size = 'sm',
  className = ''
}: JoinConsultationButtonProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  // We no longer track appointment "type". Default to video-enabled consultations.
  const isVideo = true;
  const isChat = false;
  const isAudio = true;
  const normalizedStatus = normalizeAppointmentStatus(status);
  const isJoinable =
    !status ||
    normalizedStatus === 'confirmed' ||
    normalizedStatus === 'in_progress';

  const resolveLanguageFromAppointmentPayload = (payload: { price_breakdown?: unknown; notes?: unknown } | null | undefined): string => {
    if (!payload) return '';
    const fromNotes = extractConsultationLanguageFromNotes(payload.notes);
    if (fromNotes) return fromNotes;

    const breakdownPayload = payload.price_breakdown;
    if (!breakdownPayload || typeof breakdownPayload !== 'object') return '';

    const row = breakdownPayload as Record<string, unknown>;
    const directCandidates = [
      row.consultation_language,
      row.consultationLanguage,
      row.selected_consultation_language,
      row.selectedConsultationLanguage,
      row.selected_language,
      row.selectedLanguage,
      row.language,
    ];
    const metadata = (row.metadata && typeof row.metadata === 'object')
      ? (row.metadata as Record<string, unknown>)
      : null;
    const nestedCandidates = metadata
      ? [
        metadata.consultation_language,
        metadata.consultationLanguage,
        metadata.selected_consultation_language,
        metadata.selectedConsultationLanguage,
        metadata.selected_language,
        metadata.selectedLanguage,
        metadata.language,
      ]
      : [];

    for (const candidate of [...directCandidates, ...nestedCandidates]) {
      const normalized = normalizeConsultationLanguage(
        typeof candidate === 'string' ? candidate : null
      );
      if (normalized) return normalized;
    }
    return '';
  };

  const handleJoin = async () => {
    if (!isJoinable) {
      toast({
        title: t('consultation.cannotJoinTitle', 'Cannot join'),
        description: t('consultation.cannotJoinDescription', 'This consultation is not available to join.'),
        variant: 'destructive'
      });
      return;
    }

    let languageForRoute = normalizeConsultationLanguage(consultationLanguage);
    if (!languageForRoute) {
      try {
        const { data } = await supabase
          .from('appointments')
          .select('price_breakdown, notes')
          .eq('id', appointmentId)
          .maybeSingle();
        languageForRoute = resolveLanguageFromAppointmentPayload(
          data as { price_breakdown?: unknown; notes?: unknown } | null
        );
      } catch (error) {
        console.warn('[JoinConsultationButton] Failed to resolve consultation language from appointment:', error);
      }
    }

    const query = new URLSearchParams();
    query.set('participant', participantName);
    if (languageForRoute) {
      query.set('consultationLanguage', languageForRoute);
    }
    // Navigate without a type parameter; consultations are uniform now
    navigate(`/consultation/${appointmentId}?${query.toString()}`);
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
      {isVideo
        ? t('common.joinVideoCall', 'Join Video Call')
        : isChat
        ? t('common.joinChat', 'Join Chat')
        : t('common.joinAudioCall', 'Join Audio Call')}
    </Button>
  );
}
