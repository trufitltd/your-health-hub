import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, VideoOff, Mic, MicOff, Phone, MessageSquare,
  X, User, AlertCircle, Camera, Users, Maximize2,
  Minimize2, MoreVertical, Hand, Monitor, Settings,
  PhoneOff, ChevronRight, ChevronLeft, Clock, Bell, Stethoscope, FolderOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { consultationService } from '@/services/consultationService';
import { supabase } from '@/integrations/supabase/client';
import { WebRTCService, type WebRTCSignal } from '@/services/webrtcService';
import { useTrackUserPresence } from '@/hooks/useTrackUserPresence';
import { useDoctorPresence } from '@/hooks/useDoctorPresence';
import { usePatientPresence } from '@/hooks/usePatientPresence';
import { ChatSidebar } from './ChatSidebar';
import { ControlBar } from './ControlBar';
import { DoctorNotesPanel } from './DoctorNotesPanel';
import { useLanguage } from '@/contexts/LanguageContext';
import { translateToastText } from '@/lib/toastI18n';
import {
  extractConsultationLanguageFromNotes,
  formatConsultationLanguageLabel,
  normalizeConsultationLanguage
} from '@/lib/consultationLanguage';

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
  participantName: string;
  participantRole: 'doctor' | 'patient';
  initialConsultationLanguage?: string | null;
  onEndCall: () => void;
}

const extractConsultationLanguageFromAppointment = (
  appointmentData: { price_breakdown?: unknown; notes?: unknown } | null | undefined,
): string | null => {
  const fromNotes = extractConsultationLanguageFromNotes(appointmentData?.notes);
  if (fromNotes) return fromNotes;

  const breakdown = appointmentData?.price_breakdown;
  if (!breakdown || typeof breakdown !== 'object') return null;
  const map = breakdown as Record<string, unknown>;

  const directCandidates = [
    map.consultation_language,
    map.consultationLanguage,
    map.selected_consultation_language,
    map.selectedConsultationLanguage,
    map.selected_language,
    map.selectedLanguage,
    map.language,
  ];

  const metadata = (map.metadata && typeof map.metadata === 'object')
    ? (map.metadata as Record<string, unknown>)
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

  return null;
};

export function ConsultationRoom({
  appointmentId,
  participantName,
  participantRole,
  initialConsultationLanguage = null,
  onEndCall
}: ConsultationRoomProps) {
  // Consultations are uniform; default to video+audio enabled internally
  const consultationType: 'video' | 'audio' | 'chat' = 'video';
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const ui = (text: string) => translateToastText(text, language);
  
  // Track user presence during consultation
  useTrackUserPresence(user?.id, participantRole);
  
  // Subscribe to presence based on role
  const { presenceMap: doctorPresenceMap } = useDoctorPresence();
  const { presenceMap: patientPresenceMap } = usePatientPresence();
  
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [callDuration, setCallDuration] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sessionData, setSessionData] = useState<{ id: string; created_at: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [streamInitialized, setStreamInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [remoteVideoPublished, setRemoteVideoPublished] = useState(true);
  const [remoteAudioPublished, setRemoteAudioPublished] = useState(true);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [participantAvatarUrl, setParticipantAvatarUrl] = useState<string | null>(null);
  const [myAvatarLoaded, setMyAvatarLoaded] = useState<boolean | null>(null);
  const [participantAvatarLoaded, setParticipantAvatarLoaded] = useState<boolean | null>(null);
  const [webrtcService, setWebrtcService] = useState<WebRTCService | null>(null);
  const [isAdmitted, setIsAdmitted] = useState(false);
  const [isPatientWaiting, setIsPatientWaiting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notesPanelView, setNotesPanelView] = useState<'clerking' | 'folder'>('clerking');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [appointmentConsultationLanguage, setAppointmentConsultationLanguage] = useState<string | null>(
    normalizeConsultationLanguage(initialConsultationLanguage) || null
  );
  const [waitingForPatient, setWaitingForPatient] = useState(false);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [shouldInitializeWebRTC, setShouldInitializeWebRTC] = useState(false);
  const [localVideoAttached, setLocalVideoAttached] = useState(false);
  const [isEndForEveryoneDialogOpen, setIsEndForEveryoneDialogOpen] = useState(false);
  const [hasSavedClerking, setHasSavedClerking] = useState(false);
  const [hasConsultationOccurred, setHasConsultationOccurred] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoPIPRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const webrtcInitializedRef = useRef(false);
  const sessionInitializedRef = useRef(false);
  const messageSubscriptionRef = useRef<(() => void) | null>(null);
  const isCleaningUpRef = useRef(false);
  const isMountedRef = useRef(true);
  const isChatOpenRef = useRef(false);
  const webrtcServiceRef = useRef<WebRTCService | null>(null);
  const hasHandledRemoteEndRef = useRef(false);

  const participantInitials = participantName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const myName = participantRole === 'doctor' ? 'Dr. You' : 'You';
  const myInitials = participantRole === 'doctor' ? 'DR' : 'PT';
  const bookedConsultationLanguageLabel = formatConsultationLanguageLabel(appointmentConsultationLanguage);

  const renderAvatar = (
    imageUrl: string | null,
    initials: string,
    className: string,
    fallbackClassName: string
  ) => (
    <Avatar className={className}>
      {imageUrl && console.debug('[Avatar Render] imageUrl:', imageUrl, 'initials:', initials)}
      {imageUrl ? (
        <AvatarImage key={imageUrl} src={imageUrl} onError={() => console.warn('[Avatar Image] failed to load:', imageUrl)} />
      ) : null}
      <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
    </Avatar>
  );

  // Prefetch avatars and log load success/failure (helps diagnose patient-side broken images)
  useEffect(() => {
    if (!myAvatarUrl) {
      setMyAvatarLoaded(null);
      return;
    }
    console.debug('[Prefetch Avatar] loading myAvatarUrl:', myAvatarUrl);
    const img = new Image();
    img.onload = () => {
      console.debug('[Prefetch Avatar] myAvatarUrl loaded successfully');
      setMyAvatarLoaded(true);
    };
    img.onerror = (e) => {
      console.warn('[Prefetch Avatar] myAvatarUrl failed to load:', myAvatarUrl, e);
      setMyAvatarLoaded(false);
    };
    // cache-bust to avoid stale 304 issues during debugging
    img.src = myAvatarUrl + (myAvatarUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [myAvatarUrl]);

  useEffect(() => {
    if (!participantAvatarUrl) {
      setParticipantAvatarLoaded(null);
      return;
    }
    console.debug('[Prefetch Avatar] loading participantAvatarUrl:', participantAvatarUrl);
    const img = new Image();
    img.onload = () => {
      console.debug('[Prefetch Avatar] participantAvatarUrl loaded successfully');
      setParticipantAvatarLoaded(true);
    };
    img.onerror = (e) => {
      console.warn('[Prefetch Avatar] participantAvatarUrl failed to load:', participantAvatarUrl, e);
      setParticipantAvatarLoaded(false);
    };
    img.src = participantAvatarUrl + (participantAvatarUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [participantAvatarUrl]);

  // Remote video active computed flag and avatar fallback diagnostics
  const remoteVideoActive = hasRemoteStream && remoteVideoEnabled && remoteVideoPublished;

  // Helpful flag for debugging/display: when true, we should show the avatar fallback
  const showAvatarFallback = connectionStatus === 'connected' && (!remoteVideoActive || !remoteVideoPublished || !remoteVideoEnabled);

  useEffect(() => {
    console.log('[Avatar Fallback] Evaluated showAvatarFallback:', showAvatarFallback, {
      connectionStatus,
      hasRemoteStream,
      remoteVideoEnabled,
      remoteVideoPublished,
      remoteVideoActive,
      participantAvatarLoaded,
      participantAvatarUrl
    });
  }, [showAvatarFallback, connectionStatus, hasRemoteStream, remoteVideoEnabled, remoteVideoPublished, remoteVideoActive, participantAvatarLoaded, participantAvatarUrl]);
  

  // Format duration
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Set up mount flag on component mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [toast]);

  // Initialize media stream (must be defined before it's used in other effects)
  const initializeMedia = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      };

      console.log('[Media] Requesting media with constraints:', constraints);
      
      // Add timeout wrapper to prevent hanging
      const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Media request timeout')), 10000);
      });
      
      const stream = await Promise.race([mediaPromise, timeoutPromise]);
      
      console.log('[Media] Media stream obtained:', {
        video: stream.getVideoTracks().length > 0,
        audio: stream.getAudioTracks().length > 0
      });

      localStreamRef.current = stream;
      setStreamInitialized(true);
      setIsMediaReady(true);

      // Attach to waiting room video if patient in waiting room
      if (participantRole === 'patient' && !isAdmitted && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(console.error);
      }

      return stream;
    } catch (err) {
      console.error('[Media] Error initializing media:', err);
      
      // For patients, still proceed without media to allow WebRTC initialization
      if (participantRole === 'patient') {
        console.log('[Media] Patient proceeding without media for WebRTC initialization');
        setIsMediaReady(true);
      }
      
      toast({
        title: ui('Media Error'),
        description: ui('Unable to access camera/microphone. Please check permissions.'),
        variant: 'destructive'
      });
      return null;
    }
  }, [consultationType, participantRole, isAdmitted]);

  // Initialize consultation session
  useEffect(() => {
    const initializeSession = async () => {
      if (!user || !appointmentId || sessionInitializedRef.current) {
        return;
      }

      try {
        console.log('[Init] Starting consultation room initialization');

        const loadAvatars = async (patientIdValue: string | null, doctorIdValue: string | null) => {
          try {
            console.log('[loadAvatars] ENTERED with patientIdValue:', patientIdValue, 'doctorIdValue:', doctorIdValue);

            let patientReg = null;
            if (patientIdValue) {
              try {
                console.log('[Avatar Fetch] Fetching patient_registrations for user_id:', patientIdValue);
                const resp = await supabase
                  .from('patient_registrations')
                  .select('profile_picture_url')
                  .eq('user_id', patientIdValue)
                  .maybeSingle();
                console.log('[Avatar Fetch] patient_registrations response:', resp);
                if (resp.error) console.warn('[Supabase] patient_registrations error:', resp.error, resp.status);
                patientReg = resp.data ?? null;
              } catch (err) {
                console.error('[Supabase] patient_registrations exception:', err);
              }
            }

            console.log('[loadAvatars] After patient fetch, about to check doctorIdValue:', doctorIdValue);

            let doctorReg = null;
            if (doctorIdValue) {
              try {
                console.log('[Avatar Fetch] Fetching doctors table for id:', doctorIdValue);
                const resp = await supabase
                  .from('doctors')
                  .select('avatar_url')
                  .eq('id', doctorIdValue)
                  .maybeSingle();
                console.log('[Avatar Fetch] doctors response:', resp);
                if (resp.error) console.warn('[Supabase] doctors error:', resp.error, resp.status);
                doctorReg = resp.data ?? null;
                console.log('[Avatar Fetch] doctorReg from doctors table:', doctorReg);
                
                // If avatar_url is null in doctors table, try doctor_registrations as fallback
                if (!doctorReg?.avatar_url) {
                  console.log('[Avatar Fetch] No avatar_url in doctors table, trying doctor_registrations fallback');
                  try {
                    const registrationResp = await supabase
                      .from('doctor_registrations')
                      .select('profile_picture_url')
                      .eq('user_id', doctorIdValue)
                      .maybeSingle();
                    console.log('[Avatar Fetch] doctor_registrations fallback response:', registrationResp);
                    if (registrationResp.data?.profile_picture_url) {
                      doctorReg = { avatar_url: registrationResp.data.profile_picture_url };
                      console.log('[Avatar Fetch] Using avatar from doctor_registrations:', doctorReg);
                    }
                  } catch (fallbackErr) {
                    console.log('[Avatar Fetch] doctor_registrations fallback blocked by RLS (expected for patients)');
                  }
                }
              } catch (err) {
                console.error('[Supabase] doctors fetch exception:', err);
              }
            } else {
              console.log('[Avatar Fetch] doctorIdValue is null/undefined, skipping doctor fetch');
            }

            console.log('[loadAvatars] About to normalize, patientReg:', patientReg, 'doctorReg:', doctorReg);
            const normalize = (v: any) => (typeof v === 'string' && v.trim().length > 0) ? v : null;
            const patientAvatar = normalize(patientReg?.profile_picture_url ?? null);
            const doctorAvatar = normalize(doctorReg?.avatar_url ?? null);

            console.log('[Avatars] Raw - patientAvatarRaw:', patientReg?.profile_picture_url, 'doctorAvatarRaw:', doctorReg?.avatar_url);
            console.log('[Avatars] Normalized - patientAvatar:', patientAvatar, 'doctorAvatar:', doctorAvatar);

            console.log('[loadAvatars] participantRole:', participantRole);
            if (participantRole === 'doctor') {
              console.log('[Avatars] Doctor role: setting myAvatarUrl to doctorAvatar');
              setMyAvatarUrl(doctorAvatar);
              setParticipantAvatarUrl(patientAvatar);
            } else {
              console.log('[Avatars] Patient role: setting myAvatarUrl to patientAvatar, participantAvatarUrl to doctorAvatar');
              setMyAvatarUrl(patientAvatar);
              setParticipantAvatarUrl(doctorAvatar);
            }
            console.log('[loadAvatars] Avatar state updates complete');
          } catch (err) {
            console.error('[loadAvatars] Unexpected error in loadAvatars:', err, err instanceof Error ? err.stack : '');
          }
        };
        
        // Create or get session
        let session = await consultationService.getSessionByAppointmentId(appointmentId);
        
        if (!session) {
          console.log('[Session] No existing session, creating new one');
          
          const { data: appointmentData } = await supabase
            .from('appointments')
            .select('patient_id, doctor_id, price_breakdown, notes')
            .eq('id', appointmentId)
            .single();

          if (!appointmentData) {
            throw new Error('Appointment not found');
          }

          setAppointmentConsultationLanguage((prev) => (
            extractConsultationLanguageFromAppointment(appointmentData as { price_breakdown?: unknown; notes?: unknown }) || prev || null
          ));

          session = await consultationService.createSession(
            appointmentId,
            appointmentData.patient_id,
            appointmentData.doctor_id,
            consultationType
          );
          console.log('[Session] Created new consultation session:', session.id);
          await loadAvatars(appointmentData.patient_id, appointmentData.doctor_id);
        } else {
          console.log('[Session] Using existing session:', session.id);
          console.log('[Session] About to fetch appointment data for id:', appointmentId);
          const { data: appointmentData, error: aptError } = await supabase
            .from('appointments')
            .select('patient_id, doctor_id, price_breakdown, notes')
            .eq('id', appointmentId)
            .single();
          console.log('[Session] Appointment fetch result - data:', appointmentData, 'error:', aptError);
          if (appointmentData) {
            setAppointmentConsultationLanguage((prev) => (
              extractConsultationLanguageFromAppointment(appointmentData as { price_breakdown?: unknown; notes?: unknown }) || prev || null
            ));
            console.log('[Session] Calling loadAvatars with patient_id:', appointmentData.patient_id, 'doctor_id:', appointmentData.doctor_id);
            await loadAvatars(appointmentData.patient_id, appointmentData.doctor_id);
            console.log('[Session] loadAvatars completed');
          } else {
            console.warn('[Session] No appointmentData returned for existing session');
          }
        }

        if (!isMountedRef.current) return;
        
        setSessionData({ id: session.id, created_at: session.created_at });
        setSessionId(session.id);
        setPatientId(session.patient_id);
        sessionInitializedRef.current = true;

        // Initialize media only for video/audio consultations (skip for chat)
        if (consultationType !== 'chat') {
          console.log('[Media] Initializing media for', participantRole);
          await initializeMedia();
        } else {
          console.log('[Media] Chat consultation - skipping media initialization');
          setIsMediaReady(true);
          // For chat, set connection status to connected immediately (no WebRTC peer needed)
          setConnectionStatus('connected');
        }

        if (participantRole === 'doctor') {
          setShouldInitializeWebRTC(true);
          setIsCallStarted(true);
          setWaitingForPatient(true);
        } else {
          // Patient initializes WebRTC to receive admit signals
          setShouldInitializeWebRTC(true);
        }

        // Load existing messages
        const existingMessages = await consultationService.getMessages(session.id);
        console.log('[Init] Loaded', existingMessages.length, 'messages');
        
        if (isMountedRef.current) {
          setMessages(existingMessages.map(msg => ({
            id: msg.id,
            sender: msg.sender_id === user?.id ? 'user' : 'remote',
            senderName: msg.sender_name,
            content: msg.content,
            timestamp: new Date(msg.created_at),
            type: msg.message_type as 'text' | 'file'
          })));
        }

        // Subscribe to new messages - keep subscription alive for entire session
        const unsubscribe = consultationService.subscribeToMessages(
          session.id,
          (dbMessage) => {
            console.log('[Message Handler] Received message:', {
              messageId: dbMessage.id,
              senderId: dbMessage.sender_id,
              currentUserId: user?.id,
              isSelf: dbMessage.sender_id === user?.id,
              sender: dbMessage.sender_name
            });
            if (isMountedRef.current && dbMessage.sender_id !== user?.id) {
              console.log('[Message Handler] Adding message to UI from:', dbMessage.sender_name);
              setMessages(prev => [...prev, {
                id: dbMessage.id,
                sender: 'remote',
                senderName: dbMessage.sender_name,
                content: dbMessage.content,
                timestamp: new Date(dbMessage.created_at),
                type: dbMessage.message_type as 'text' | 'file'
              }]);
              // Increment unread count if chat panel is closed (use ref to avoid stale closure)
              setUnreadMessageCount(prev => (!isChatOpenRef.current ? prev + 1 : prev));
            } else if (dbMessage.sender_id === user?.id) {
              console.log('[Message Handler] Skipping own message (expected)');
            } else {
              console.log('[Message Handler] Skipped - not mounted');
            }
          }
        );
        
        messageSubscriptionRef.current = unsubscribe;
        setIsLoading(false);

      } catch (err) {
        console.error('Error initializing session:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to initialize consultation');
          setIsLoading(false);
        }
      }
    };

    initializeSession();
  }, [user, appointmentId, participantRole, consultationType, initializeMedia]);

  // Reset unread count when chat panel opens
  useEffect(() => {
    if (isChatOpen) {
      setUnreadMessageCount(0);
    }
  }, [isChatOpen]);

  // Keep isChatOpenRef in sync with state
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  // Manage message subscription cleanup on component unmount
  useEffect(() => {
    return () => {
      // Only cleanup on actual component unmount, not on state changes
      if (messageSubscriptionRef.current) {
        console.log('[Cleanup] Unsubscribing from messages on component unmount');
        messageSubscriptionRef.current();
        messageSubscriptionRef.current = null;
      }
    };
  }, []);

  // Attach local stream to video elements
  useEffect(() => {
    if (!streamInitialized || !localStreamRef.current) return;
    
    // For doctor waiting screen: attach to localVideoRef
    if (participantRole === 'doctor' && waitingForPatient && !isPatientWaiting && isVideoEnabled) {
      if (localVideoRef.current) {
        console.log('[Media] Attaching doctor stream to waiting screen video');
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(console.error);
      }
    }

    // For patient waiting screen: attach to localVideoRef
    if (participantRole === 'patient' && !isAdmitted && isVideoEnabled) {
      if (localVideoRef.current) {
        console.log('[Media] Attaching patient stream to waiting screen video');
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(console.error);
      }
    }
    
    // For PIP video: attach when in call
    if ((participantRole === 'doctor' && isCallStarted) || 
        (participantRole === 'patient' && isAdmitted)) {
      if (localVideoPIPRef.current && !localVideoPIPRef.current.srcObject) {
        console.log('[Media] Setting stream to PIP video element');
        localVideoPIPRef.current.srcObject = localStreamRef.current;
        localVideoPIPRef.current.play().catch(console.error);
      }
    }
  }, [streamInitialized, participantRole, waitingForPatient, isPatientWaiting, isCallStarted, isAdmitted, isVideoEnabled, localVideoAttached]);

  // Initialize WebRTC when conditions are met
  const cleanupAndExit = useCallback(async () => {
    console.log('[Cleanup] Leaving call and cleaning up local resources...');
    isCleaningUpRef.current = true;

    const activeWebrtcService = webrtcServiceRef.current ?? webrtcService;
    if (activeWebrtcService) {
      activeWebrtcService.destroy();
      webrtcServiceRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.log('Wake lock release error:', err);
      }
    }

    if (messageSubscriptionRef.current) {
      messageSubscriptionRef.current();
      messageSubscriptionRef.current = null;
    }

    onEndCall();
  }, [webrtcService, onEndCall]);

  const shouldRequireClerkingBeforeExit =
    participantRole === 'doctor' && hasConsultationOccurred;

  const ensureDoctorHasClerkingBeforeExit = useCallback(async () => {
    if (!shouldRequireClerkingBeforeExit || !sessionData || !user?.id) {
      return true;
    }

    if (hasSavedClerking) {
      return true;
    }

    const { data, error } = await supabase
      .from('doctor_consultation_notes')
      .select('id')
      .eq('session_id', sessionData.id)
      .eq('doctor_id', user.id)
      .limit(1);

    if (!error && data && data.length > 0) {
      setHasSavedClerking(true);
      return true;
    }

    toast({
      title: ui('Clerking Required'),
      description: ui('Please add clerking before leaving or ending this call.')
    });
    setNotesPanelView('clerking');
    setIsChatOpen(false);
    setIsNotesOpen(true);
    return false;
  }, [shouldRequireClerkingBeforeExit, sessionData, user?.id, hasSavedClerking]);

  const handleLeaveCall = useCallback(async () => {
    const canExit = await ensureDoctorHasClerkingBeforeExit();
    if (!canExit) return;

    try {
      const activeWebrtcService = webrtcServiceRef.current ?? webrtcService;
      if (activeWebrtcService) {
        await activeWebrtcService.sendParticipantLeft();
      }
    } catch (err) {
      console.warn('Failed to send participant_left signal:', err);
    }

    await cleanupAndExit();
  }, [webrtcService, cleanupAndExit, ensureDoctorHasClerkingBeforeExit]);

  const confirmEndCallForEveryone = useCallback(async () => {
    try {
      if (sessionData) {
        await consultationService.endSession(sessionData.id, callDuration);
      }
    } catch (err) {
      console.error('[Session] Error ending consultation session for everyone:', err);
    }

    try {
      const activeWebrtcService = webrtcServiceRef.current ?? webrtcService;
      if (activeWebrtcService) {
        await activeWebrtcService.sendSessionEnded();
      }
    } catch (err) {
      console.warn('Failed to send session_ended signal:', err);
    }

    await cleanupAndExit();
  }, [sessionData, callDuration, webrtcService, cleanupAndExit]);

  const requestEndCallForEveryone = useCallback(async () => {
    const canExit = await ensureDoctorHasClerkingBeforeExit();
    if (!canExit) return;
    setIsEndForEveryoneDialogOpen(true);
  }, [ensureDoctorHasClerkingBeforeExit]);

  useEffect(() => {
    // For chat consultations, initialize even without local stream
    // For video/audio, require local stream
    const hasMediaStreamOrIsChat = localStreamRef.current || consultationType === 'chat';
    if (!sessionData || !user || !hasMediaStreamOrIsChat || !shouldInitializeWebRTC) return;
    if (webrtcInitializedRef.current) return;

    // Both initialize WebRTC but patient doesn't start peer connection until admitted
    const shouldInitialize = true;
    
    if (!shouldInitialize) return;

    const initializeWebRTC = async () => {
      try {
        console.log('[WebRTC] Initializing WebRTC for', participantRole);
        const isInitiator = participantRole === 'doctor';
        
        console.log('[WebRTC] Creating WebRTCService with initiator:', isInitiator);
        const sessionStartTime = new Date(sessionData.created_at);
        const webrtc = new WebRTCService(sessionData.id, user.id, isInitiator, sessionStartTime);

        webrtc.onStream((remoteStream) => {
          console.log('[WebRTC] Remote stream received, tracks:', remoteStream.getTracks().length);
          
          if (remoteStream && remoteStream.getTracks().length > 0) {
            setHasRemoteStream(true);
            
            // Check if remote has video - update whenever tracks change
            const hasVideo = remoteStream.getVideoTracks().length > 0;
            console.log('[WebRTC] Remote video tracks:', remoteStream.getVideoTracks().length, 'hasVideo:', hasVideo);
            setRemoteVideoEnabled(hasVideo);
            
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
              // Attach to audio element for audio playback
              if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStream;
                remoteAudioRef.current.play().then(() => {
                  console.log('[Audio Play] Remote audio started playing successfully');
                  // Check if audio is actually playing
                  setTimeout(() => {
                    if (remoteAudioRef.current) {
                      console.log('[Audio Debug] Audio state:', {
                        paused: remoteAudioRef.current.paused,
                        volume: remoteAudioRef.current.volume,
                        muted: remoteAudioRef.current.muted,
                        currentTime: remoteAudioRef.current.currentTime
                      });
                    }
                  }, 2000);
                }).catch(error => {
                  console.error('[Audio Play] Failed to play remote audio:', error);
                });
              }
            }, 100);
          }
        });

        webrtc.onConnected(() => {
          console.log('[WebRTC] 🎉 Connection established via callback');
          setConnectionStatus('connected');
          // Start call timer when media actually flows
          setCallDuration(0);
          if (participantRole === 'doctor') {
            setHasConsultationOccurred(true);
          }
        });

        webrtc.onError((error) => {
          console.error('[WebRTC] Error:', error);
          // Only show error if not already connected
          if (connectionStatus !== 'connected') {
            setConnectionStatus('disconnected');
            toast({
              title: ui('Connection Error'),
              description: ui('Failed to establish WebRTC connection'),
              variant: 'destructive'
            });
          }
        });

        webrtc.onPatientJoinedLobby(() => {
          console.log('[Lobby] 🔔 Patient has joined the lobby');
          setIsPatientWaiting(true);
          setWaitingForPatient(false); // Exit waiting screen to show admit overlay
          toast({
            title: ui('Patient Waiting'),
            description: ui('A patient has joined the waiting room.'),
            duration: 5000,
          });
        });

        webrtc.onRemoteMediaState((state) => {
          setRemoteAudioPublished(state.audioEnabled);
          setRemoteVideoPublished(state.videoEnabled);
        });

        webrtc.onParticipantLeft(() => {
          setHasRemoteStream(false);
          setConnectionStatus('disconnected');
          setRemoteAudioPublished(false);
          setRemoteVideoPublished(false);
          toast({
            title: ui('Participant left'),
            description: `${participantName} ${ui('left the call.')}`
          });
        });

        webrtc.onSessionEnded(() => {
          if (hasHandledRemoteEndRef.current) return;
          hasHandledRemoteEndRef.current = true;
          toast({
            title: ui('Call ended'),
            description: `${participantName} ${ui('ended the call for everyone.')}`
          });
          cleanupAndExit().catch((err) => {
            console.error('Failed to cleanup after session_ended signal:', err);
          });
        });

        webrtc.onAdmitted(async () => {
          console.log('[Lobby] 🎉 Doctor is admitting patient to call');
          setIsAdmitted(true);
          setIsCallStarted(true);
          try {
            await consultationService.markAppointmentInProgress(appointmentId);
          } catch (statusError) {
            console.warn('[ConsultationRoom] Failed to mark appointment in progress on admit:', statusError);
          }
          // For patient, add local stream tracks if peer connection exists
          if (participantRole === 'patient') {
            console.log('[Patient Admission] Adding patient stream to peer connection');
            let streamToUse = localStreamRef.current;
            if (!streamToUse || streamToUse.getTracks().length === 0) {
              console.log('[Patient Admission] No local media stream yet, initializing media before WebRTC');
              const initialized = await initializeMedia();
              streamToUse = initialized ?? localStreamRef.current ?? null;
            }
            const finalStream = streamToUse ?? new MediaStream();
            webrtc.initializePeer(finalStream);
          }
          toast({
            title: ui('Admitted to Call'),
            description: consultationType === 'chat' 
              ? ui('The doctor has admitted you to the consultation.') 
              : ui('The doctor has admitted you to the consultation.'),
            duration: 3000,
          });
        });

        console.log('[WebRTC] Calling initializePeer with local stream');
        if (participantRole === 'doctor') {
          if (localStreamRef.current) {
            webrtc.initializePeer(localStreamRef.current!);
          } else {
            console.warn('[WebRTC] Doctor has no local stream, creating empty stream');
            const emptyStream = new MediaStream();
            webrtc.initializePeer(emptyStream);
          }
        } else {
          // Patient only subscribes to signals initially
          webrtc.subscribeToSignalsOnly();
        }
        setWebrtcService(webrtc);
        webrtcServiceRef.current = webrtc;
        webrtcInitializedRef.current = true;
        
        if (participantRole === 'doctor') {
          await webrtc.checkExistingLobbySignals();
        } else {
          await webrtc.sendJoinLobby();
        }
        
        console.log('[WebRTC] Initialization complete');
        webrtc.sendMediaState({ audioEnabled: isAudioEnabled, videoEnabled: isVideoEnabled }).catch(console.warn);
        // For chat consultations, set status to connected immediately (no peer connection needed)
        // For video/audio, set to connecting and wait for peer connection
        if (consultationType === 'chat') {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('connecting');
        }

      } catch (err) {
        console.error('[WebRTC] Initialization error:', err);
        toast({
          title: ui('Connection Error'),
          description: ui('Failed to initialize WebRTC connection'),
          variant: 'destructive'
        });
      }
    };

    initializeWebRTC();
  }, [sessionData, user, shouldInitializeWebRTC, isAdmitted, participantRole, connectionStatus, isAudioEnabled, isVideoEnabled, participantName, cleanupAndExit]);

  // Monitor remote stream for video track changes
  useEffect(() => {
    if (hasRemoteStream && webrtcService) {
      const remoteStream = webrtcService.getRemoteStream();
      if (remoteStream) {
        const hasVideo = remoteStream.getVideoTracks().length > 0;
        console.log('[Video Monitor] Remote stream video tracks:', remoteStream.getVideoTracks().length, 'updating remoteVideoEnabled to:', hasVideo);
        setRemoteVideoEnabled(hasVideo);
        
        // Debug video element visibility
        if (remoteVideoRef.current) {
          const isVisible = hasVideo && hasRemoteStream;
          console.log('[Video Debug] Remote video element should be visible:', isVisible, 'hasRemoteStream:', hasRemoteStream, 'hasVideo:', hasVideo);
        }
      }
    }
  }, [hasRemoteStream, webrtcService]);

  // Ensure remote stream is attached when ref becomes available
  useEffect(() => {
    if (hasRemoteStream && webrtcService && remoteVideoRef.current) {
      const remoteStream = webrtcService.getRemoteStream();
      if (remoteStream && remoteStream.getTracks().length > 0 && remoteVideoRef.current) {
        // Always ensure stream is attached
        if (!remoteVideoRef.current.srcObject) {
          console.log('[Video Attachment] Attaching remote stream to video element');
          remoteVideoRef.current.srcObject = remoteStream;
        }
        
        // Unmute remote video element to allow rendering
        remoteVideoRef.current.muted = false;
        
        // Force play with proper error handling
        const playPromise = remoteVideoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log('[Video Play] Remote video started playing successfully');
            // Verify video and audio tracks are enabled and unmuted
            const videoTracks = remoteStream.getVideoTracks();
            const audioTracks = remoteStream.getAudioTracks();
            
            videoTracks.forEach(track => {
              if (!track.enabled) {
                console.warn('[Video Track] Video track disabled, enabling...');
                track.enabled = true;
              }
            });
            
            audioTracks.forEach(track => {
              if (!track.enabled) {
                console.warn('[Audio Track] Audio track disabled, enabling...');
                track.enabled = true;
              }
            });
            
            // Check video element properties
            const video = remoteVideoRef.current!;
            console.log('[Video Debug] Video properties:', {
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              readyState: video.readyState,
              paused: video.paused,
              muted: video.muted,
              volume: video.volume
            });
            // Check stream properties
            const stream = video.srcObject as MediaStream;
            if (stream) {
              console.log('[Video Debug] Stream properties:', {
                active: stream.active,
                videoTracks: stream.getVideoTracks().map(t => ({
                  kind: t.kind,
                  enabled: t.enabled,
                  readyState: t.readyState,
                  muted: t.muted
                }))
              });
            }
          }).catch(error => {
            console.error('[Video Play] Failed to play remote video:', error);
          });
        }
      }
    }
  }, [hasRemoteStream, webrtcService]);

  // Additional effect to retry video attachment after connection is established
  useEffect(() => {
    if (connectionStatus === 'connected' && webrtcService) {
      console.log('[Video Debug] Connection established - hasRemoteStream:', hasRemoteStream, 'remoteVideoEnabled:', remoteVideoEnabled);
      const remoteStream = webrtcService.getRemoteStream();
      if (remoteStream) {
        // Try multiple times with delays to ensure video element is ready
        const tryAttach = (attempt = 1) => {
          if (remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
            console.log(`[Video Retry ${attempt}] Attaching remote stream after connection`);
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(console.error);
          } else if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
            console.log('[Video Debug] Remote video already has stream attached');
            // Check if video element is actually visible
            const isHidden = remoteVideoRef.current.classList.contains('hidden');
            const computedStyle = window.getComputedStyle(remoteVideoRef.current);
            console.log('[Video Debug] Video element hidden class:', isHidden, 'display:', computedStyle.display, 'visibility:', computedStyle.visibility);
          } else if (attempt < 10) {
            setTimeout(() => tryAttach(attempt + 1), 500);
          }
        };
        tryAttach();
      }
    }
  }, [connectionStatus, webrtcService, hasRemoteStream, remoteVideoEnabled]);

  // Timer effect
  useEffect(() => {
    if (connectionStatus === 'connected') {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [connectionStatus]);

  useEffect(() => {
    if (participantRole === 'doctor' && hasRemoteStream) {
      setHasConsultationOccurred(true);
    }
  }, [participantRole, hasRemoteStream]);

  // Fallback watcher: if session is marked ended (doctor ended for everyone),
  // force patient out through the standard end-flow so review redirect is triggered.
  useEffect(() => {
    if (!sessionData || participantRole !== 'patient') return;

    const channel = supabase
      .channel(`consultation-room-ended-${sessionData.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'consultation_sessions',
        filter: `id=eq.${sessionData.id}`
      }, (payload) => {
        const status = (payload.new as { status?: string } | null)?.status;
        if (status === 'ended' && !hasHandledRemoteEndRef.current) {
          hasHandledRemoteEndRef.current = true;
          toast({
            title: ui('Call ended'),
            description: ui('The doctor ended the call for everyone. Please leave a review.')
          });
          cleanupAndExit().catch((err) => {
            console.error('Failed to cleanup after consultation_sessions ended update:', err);
          });
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionData, participantRole, cleanupAndExit]);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      const nextEnabled = !isAudioEnabled;
      setIsAudioEnabled(nextEnabled);
      webrtcService?.sendMediaState({ audioEnabled: nextEnabled, videoEnabled: isVideoEnabled }).catch(console.warn);
    }
  };

  const ensureLocalVideoTrack = useCallback(async () => {
    if (!localStreamRef.current) return false;
    const hasLive = localStreamRef.current.getVideoTracks().some(t => t.readyState === 'live');
    if (hasLive) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });
      const newTrack = stream.getVideoTracks()[0];
      if (!newTrack) return false;

      localStreamRef.current.getVideoTracks().forEach(track => {
        track.stop();
        localStreamRef.current?.removeTrack(track);
      });
      localStreamRef.current.addTrack(newTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(console.error);
      }
      if (localVideoPIPRef.current) {
        localVideoPIPRef.current.srcObject = localStreamRef.current;
        localVideoPIPRef.current.play().catch(console.error);
      }

      return true;
    } catch (err) {
      console.error('[Media] Failed to re-acquire video track:', err);
      toast({
        title: ui('Camera Error'),
        description: ui('Unable to turn camera back on. Please check permissions.'),
        variant: 'destructive'
      });
      return false;
    }
  }, []);

  const toggleVideo = async () => {
    if (localStreamRef.current) {
      const nextEnabled = !isVideoEnabled;
      if (nextEnabled) {
        const ok = await ensureLocalVideoTrack();
        if (!ok) return;
      }
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = nextEnabled;
      });
      setIsVideoEnabled(nextEnabled);
      webrtcService?.sendMediaState({ audioEnabled: isAudioEnabled, videoEnabled: nextEnabled }).catch(console.warn);

      if (participantRole === 'doctor' && waitingForPatient && !isPatientWaiting) {
        if (!nextEnabled) {
          setLocalVideoAttached(false);
        } else if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(console.error);
          setLocalVideoAttached(true);
        }
      }
      if (participantRole === 'patient' && !isAdmitted) {
        if (!nextEnabled) {
          setLocalVideoAttached(false);
        } else if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(console.error);
          setLocalVideoAttached(true);
        }
      }
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const openDoctorNotesView = (view: 'clerking' | 'folder') => {
    setNotesPanelView(view);
    setIsChatOpen(false);
    setIsNotesOpen(true);
  };

  const toggleDoctorNotesView = (view: 'clerking' | 'folder') => {
    if (isNotesOpen && notesPanelView === view) {
      setIsNotesOpen(false);
      return;
    }
    openDoctorNotesView(view);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    if (!sessionData) {
      toast({
        title: ui('Chat not ready'),
        description: ui('Please wait a moment and try again.'),
        variant: 'destructive'
      });
      return;
    }

    try {
      const sentMessage = await consultationService.sendMessage(
        sessionData.id,
        user!.id,
        participantRole,
        myName,
        newMessage,
        'text'
      );

      // Add message to UI immediately
      setMessages(prev => [...prev, {
        id: sentMessage.id,
        sender: 'user',
        senderName: myName,
        content: newMessage,
        timestamp: new Date(sentMessage.created_at),
        type: 'text'
      }]);

      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
      toast({
        title: ui('Error'),
        description: ui('Failed to send message'),
        variant: 'destructive'
      });
    }
  };

  const handleAdmitPatient = async () => {
    try {
      console.log('[Admission] Doctor admitting patient');
      
      if (!webrtcService) {
        throw new Error('WebRTC service not initialized');
      }

      await webrtcService.sendAdmitPatient();
      await consultationService.markAppointmentInProgress(appointmentId);
      
      console.log('[Admission] Admit signal sent successfully');
      
      // Update local state
      setIsPatientWaiting(false);
      setWaitingForPatient(false);
      setHasConsultationOccurred(true);
      
      toast({
        title: ui('Patient Admitted'),
        description: consultationType === 'chat' 
          ? ui('Patient is being connected to the chat.') 
          : ui('Patient is being connected to the call.'),
        duration: 3000,
      });
      
    } catch (err) {
      console.error('Error admitting patient:', err);
      toast({
        title: ui('Error'),
        description: ui('Failed to admit patient'),
        variant: 'destructive'
      });
    }
  };

  // Doctor waiting for patient overlay
  if (participantRole === 'doctor' && waitingForPatient && !isPatientWaiting) {
    return (
      <div className="relative flex items-center justify-center h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f23] overflow-hidden">
        <div className="absolute top-4 right-4 z-50">
          <Button
            variant="secondary"
            size="icon"
            className={`relative w-11 h-11 rounded-full ${isChatOpen ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-white hover:bg-white/20'}`}
            onClick={() => {
              const nextOpen = !isChatOpen;
              setIsChatOpen(nextOpen);
              if (nextOpen) setUnreadMessageCount(0);
            }}
          >
            <MessageSquare className="w-5 h-5" />
            {unreadMessageCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-[10px] rounded-full flex items-center justify-center text-white font-bold">
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </span>
            )}
          </Button>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-8 p-8 max-w-md"
        >
          {/* Doctor's local video preview */}
          {consultationType === 'video' && (
            <div className="relative w-64 h-48 mx-auto rounded-2xl overflow-hidden bg-[#252542] shadow-2xl">
              {isVideoEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                  onLoadedMetadata={() => console.log('[Doctor Waiting] Local video loaded')}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                  {renderAvatar(
                    myAvatarLoaded ? myAvatarUrl : null,
                    myInitials,
                    'w-20 h-20',
                    'bg-primary text-primary-foreground text-2xl'
                  )}
                </div>
              )}
              <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-2">
                <Button
                  variant={isVideoEnabled ? 'secondary' : 'destructive'}
                  size="sm"
                  className="rounded-full w-10 h-10"
                  onClick={toggleVideo}
                >
                  {isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </Button>
                <Button
                  variant={isAudioEnabled ? 'secondary' : 'destructive'}
                  size="sm"
                  className="rounded-full w-10 h-10"
                  onClick={toggleAudio}
                >
                  {isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          {(!isVideoEnabled || consultationType !== 'video') && (
            renderAvatar(
              myAvatarLoaded ? myAvatarUrl : null,
              myInitials,
              'w-24 h-24 mx-auto',
              'bg-primary text-primary-foreground text-3xl'
            )
          )}

          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300/60 bg-amber-500/20 px-4 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">
                {t('consultation.room.languageNoticeTitle', 'Selected Consultation Language')}
              </p>
              <p className="text-lg font-extrabold text-amber-50">
                {bookedConsultationLanguageLabel}
              </p>
            </div>
              <div className="flex items-center justify-center gap-3">
                <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
              <h2 className="text-2xl font-semibold text-white">{ui('Waiting for Patient')}</h2>
              </div>
            
            <p className="text-slate-400">
              {ui("You've joined the consultation. Please wait for the patient to join the waiting room.")}
            </p>
            
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Clock className="w-4 h-4" />
              <span>{ui('Ready to admit')} {participantName}</span>
            </div>
            <div className="flex justify-center">
              {renderAvatar(
                participantAvatarLoaded ? participantAvatarUrl : null,
                participantInitials,
                'w-16 h-16',
                'bg-slate-700 text-slate-300 text-xl'
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleLeaveCall}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-800 w-full"
            >
              <X className="w-4 h-4 mr-2" />
              {ui('Leave Consultation')}
            </Button>
            
            <div className="text-xs text-slate-500">
              {ui("You'll be notified when the patient joins")}
            </div>
          </div>

        </motion.div>

        <div className={`${isChatOpen ? 'absolute sm:relative' : 'hidden'} top-0 right-0 bottom-0 z-40 sm:z-auto h-full max-h-screen`}>
          <ChatSidebar
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            messages={messages}
            newMessage={newMessage}
            onMessageChange={setNewMessage}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>
    );
  }

  // Patient waiting room
  if (!isAdmitted && participantRole === 'patient') {
    return (
      <div className="relative flex items-center justify-center h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f23] overflow-hidden">
        <div className="absolute top-4 right-4 z-50">
          <Button
            variant="secondary"
            size="icon"
            className={`relative w-11 h-11 rounded-full ${isChatOpen ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-white hover:bg-white/20'}`}
            onClick={() => {
              const nextOpen = !isChatOpen;
              setIsChatOpen(nextOpen);
              if (nextOpen) setUnreadMessageCount(0);
            }}
          >
            <MessageSquare className="w-5 h-5" />
            {unreadMessageCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-[10px] rounded-full flex items-center justify-center text-white font-bold">
                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
              </span>
            )}
          </Button>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-8 p-8"
        >
          {/* Local video preview */}
          {consultationType === 'video' && (
            <div className="relative w-64 h-48 mx-auto rounded-2xl overflow-hidden bg-[#252542] shadow-2xl">
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
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                  {renderAvatar(
                    myAvatarLoaded ? myAvatarUrl : null,
                    myInitials,
                    'w-20 h-20',
                    'bg-primary text-primary-foreground text-2xl'
                  )}
                </div>
              )}
              <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-2">
                <Button
                  variant={isVideoEnabled ? 'secondary' : 'destructive'}
                  size="sm"
                  className="rounded-full w-10 h-10"
                  onClick={toggleVideo}
                >
                  {isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </Button>
                <Button
                  variant={isAudioEnabled ? 'secondary' : 'destructive'}
                  size="sm"
                  className="rounded-full w-10 h-10"
                  onClick={toggleAudio}
                >
                  {isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="rounded-lg border border-amber-300/60 bg-amber-500/20 px-4 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">
                {t('consultation.room.languageNoticeTitle', 'Selected Consultation Language')}
              </p>
              <p className="text-lg font-extrabold text-amber-50">
                {bookedConsultationLanguageLabel}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
              <h2 className="text-2xl font-semibold text-white">{ui('Waiting Room')}</h2>
            </div>
            <p className="text-slate-400 max-w-sm">
              {ui("You're in the waiting room. The doctor will admit you shortly.")}
            </p>
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Clock className="w-4 h-4" />
              <span>{ui('Waiting for')} {participantName}</span>
            </div>
            <div className="flex justify-center">
              {renderAvatar(
                participantAvatarLoaded ? participantAvatarUrl : null,
                participantInitials,
                'w-16 h-16',
                'bg-slate-700 text-slate-300 text-xl'
              )}
            </div>
          </div>

          <Button
            onClick={handleLeaveCall}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <X className="w-4 h-4 mr-2" />
            {ui('Leave Waiting Room')}
          </Button>

        </motion.div>

        <div className={`${isChatOpen ? 'absolute sm:relative' : 'hidden'} top-0 right-0 bottom-0 z-40 sm:z-auto h-full max-h-screen`}>
          <ChatSidebar
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            messages={messages}
            newMessage={newMessage}
            onMessageChange={setNewMessage}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <Card className="w-full max-w-md bg-[#252542] border-[#3d3d5c]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-semibold">{ui('Error')}</h3>
            </div>
            <p className="text-sm text-slate-300 mb-4">{error}</p>
            <Button onClick={onEndCall} className="w-full">{ui('Go Back')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading || !isMediaReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">{ui('Setting up your consultation...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-screen w-full bg-[#1a1a2e] flex flex-col overflow-hidden"
    >
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video area */}
        <div className="flex-1 relative flex flex-col">
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-3 sm:p-4 bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center gap-3">
              <Badge 
                variant="secondary" 
                className={`gap-2 ${connectionStatus === 'connected' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}
              >
                <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
                {connectionStatus === 'connecting' ? ui('Connecting...') : ui('Connected')}
              </Badge>
              {connectionStatus === 'connected' && (
                <Badge variant="secondary" className="font-mono bg-white/10 text-white">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatDuration(callDuration)}
                </Badge>
              )}
              {participantRole === 'doctor' && !isNotesOpen && (
                <div className="hidden sm:flex items-center gap-2 ml-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className={`text-white border border-white/20 ${
                      isNotesOpen && notesPanelView === 'clerking'
                        ? 'bg-primary/70 hover:bg-primary/80'
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                    onClick={() => toggleDoctorNotesView('clerking')}
                  >
                    <Stethoscope className="w-4 h-4 mr-2" />
                    {isNotesOpen && notesPanelView === 'clerking' ? ui('Close Clerking') : ui('Add Clerking')}
                    {isNotesOpen && notesPanelView === 'clerking' && <X className="w-4 h-4 ml-2" />}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={`text-white border border-white/20 ${
                      isNotesOpen && notesPanelView === 'folder'
                        ? 'bg-primary/70 hover:bg-primary/80'
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                    onClick={() => toggleDoctorNotesView('folder')}
                  >
                    <FolderOpen className="w-4 h-4 mr-2" />
                    {isNotesOpen && notesPanelView === 'folder' ? ui('Close Patient Folder') : ui('View Patient Folder')}
                    {isNotesOpen && notesPanelView === 'folder' && <X className="w-4 h-4 ml-2" />}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-8 h-8 text-white/70 hover:text-white hover:bg-white/10"
                      onClick={toggleFullscreen}
                    >
                      {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{ui('Fullscreen')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {appointmentConsultationLanguage && (
            <div className="absolute top-12 sm:top-14 left-3 right-3 z-30">
              <div className="rounded-md border border-amber-300/60 bg-amber-500/25 px-3 py-2 text-center text-amber-50 shadow-sm">
                <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                  {t('consultation.room.languageNoticeTitle', 'Selected Consultation Language')}
                </p>
                <p className="text-sm sm:text-base font-bold">
                  {formatConsultationLanguageLabel(appointmentConsultationLanguage)}
                </p>
              </div>
            </div>
          )}

          {participantRole === 'doctor' && !isNotesOpen && (
            <div className={`${appointmentConsultationLanguage ? 'top-28' : 'top-14'} absolute left-3 right-3 z-30 flex sm:hidden items-center gap-2`}>
              <Button
                variant="secondary"
                size="sm"
                className={`flex-1 text-white border border-white/20 ${
                  isNotesOpen && notesPanelView === 'clerking'
                    ? 'bg-primary/70 hover:bg-primary/80'
                    : 'bg-black/45 hover:bg-black/60'
                }`}
                onClick={() => toggleDoctorNotesView('clerking')}
              >
                <Stethoscope className="w-4 h-4 mr-2" />
                {isNotesOpen && notesPanelView === 'clerking' ? ui('Close') : ui('Add Clerking')}
                {isNotesOpen && notesPanelView === 'clerking' && <X className="w-4 h-4 ml-2" />}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className={`flex-1 text-white border border-white/20 ${
                  isNotesOpen && notesPanelView === 'folder'
                    ? 'bg-primary/70 hover:bg-primary/80'
                    : 'bg-black/45 hover:bg-black/60'
                }`}
                onClick={() => toggleDoctorNotesView('folder')}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                {isNotesOpen && notesPanelView === 'folder' ? ui('Close') : ui('View Folder')}
                {isNotesOpen && notesPanelView === 'folder' && <X className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          )}

          {/* Admit patient overlay for doctor */}
          {participantRole === 'doctor' && isPatientWaiting && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-6 p-8 bg-[#252542] rounded-2xl shadow-2xl max-w-sm mx-4"
              >
                {renderAvatar(
                  participantAvatarLoaded ? participantAvatarUrl : null,
                  participantInitials,
                  'w-20 h-20 mx-auto',
                  'bg-primary text-primary-foreground text-2xl'
                )}
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">{ui('Patient Waiting')}</h3>
                  <p className="text-slate-400 text-sm">{participantName} {ui('is in the waiting room')}</p>
                </div>
                <div className="space-y-3">
                  <Button
                    onClick={handleAdmitPatient}
                    className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                  >
                    <User className="w-4 h-4" />
                    {consultationType === 'chat' ? ui('Admit to Chat') : ui('Admit to Call')}
                  </Button>
                  <Button
                    onClick={() => setIsPatientWaiting(false)}
                    variant="outline"
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    {ui('Not Now')}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Video grid */}
          <div className="flex-1 relative p-2 sm:p-4 flex items-center justify-center">
            {consultationType === 'video' ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Main video area - shows remote when connected, otherwise local */}
                <div className="relative w-full h-full max-w-5xl rounded-2xl overflow-hidden bg-[#252542]">
                  {/* Remote video element - always rendered, show when we have remote stream with video */}
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    controls={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      backgroundColor: '#252542'
                    }}
                    className={remoteVideoActive ? 'block' : 'hidden'}
                    onLoadedMetadata={() => {
                      console.log('[Remote Video] Video metadata loaded');
                      if (remoteVideoRef.current) {
                        const video = remoteVideoRef.current;
                        console.log('[Remote Video] Metadata dimensions:', video.videoWidth, 'x', video.videoHeight);
                        // Force play if not playing
                        if (video.paused) {
                          console.log('[Remote Video] Video is paused, attempting to play');
                          video.play().catch(e => console.warn('[Remote Video] Play failed:', e));
                        }
                        if (video.videoWidth > 0 && video.videoHeight > 0) {
                          console.log('[Remote Video] ✅ Video has valid dimensions from metadata');
                        }
                      }
                    }}
                    onPlay={() => {
                      console.log('[Remote Video] Video started playing');
                      // Check dimensions after a delay to ensure video is fully loaded
                      setTimeout(() => {
                        if (remoteVideoRef.current) {
                          const video = remoteVideoRef.current;
                          console.log('[Video Check] Final dimensions:', video.videoWidth, 'x', video.videoHeight);
                          console.log('[Video Debug] Video element state:', {
                            paused: video.paused,
                            ended: video.ended,
                            readyState: video.readyState,
                            readyStateText: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][video.readyState],
                            networkState: video.networkState,
                            networkStateText: ['NETWORK_EMPTY', 'NETWORK_IDLE', 'NETWORK_LOADING', 'NETWORK_NO_SOURCE'][video.networkState]
                          });
                          
                          const stream = video.srcObject as MediaStream;
                          if (stream) {
                            const videoTracks = stream.getVideoTracks();
                            console.log('[Video Issue] Video track count:', videoTracks.length);
                            
                            // Ensure all video tracks are enabled
                            videoTracks.forEach((track, index) => {
                              const settings = track.getSettings();
                              console.log(`[Video Track ${index}] Settings:`, {
                                width: settings.width,
                                height: settings.height,
                                enabled: track.enabled,
                                readyState: track.readyState,
                                muted: track.muted,
                                kind: track.kind
                              });
                              
                              // Force enable track if disabled
                              if (!track.enabled) {
                                console.warn(`[Video Track ${index}] Track disabled, enabling...`);
                                track.enabled = true;
                              }
                            });
                            
                            // If dimensions still 0x0 after delay, check if media is actually flowing
                            if (video.videoWidth === 0 && video.videoHeight === 0 && videoTracks.length > 0) {
                              console.warn('[Video Issue] Video tracks present but no dimensions');
                              
                              // Check if it's a readyState issue (no data received)
                              if (video.readyState === 0) {
                                console.error('[Video Issue] readyState is HAVE_NOTHING - no video data received from WebRTC');
                                console.log('[Video Debug] Possible causes: ICE connection failed, codec mismatch, or video not being sent from remote');
                              }
                              
                              // Force ensure element is visible and properly displayed
                              video.style.opacity = '1';
                              video.style.visibility = 'visible';
                            }
                          } else {
                            console.warn('[Video Issue] No stream attached to video element');
                          }
                        }
                      }, 1000);
                    }}
                    onError={(e) => console.error('[Remote Video] Video error:', e)}
                  />
                  
                  {/* Show fallback content when no remote video */}
                  {(!remoteVideoActive) && (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                      {connectionStatus === 'connected' && (!remoteVideoEnabled || !remoteVideoPublished) ? (
                        // Connected but remote video is off - show avatar
                        <div className="text-center">
                          {renderAvatar(
                            participantAvatarLoaded ? participantAvatarUrl : null,
                            participantInitials,
                            'w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4',
                            'bg-slate-700 text-slate-300 text-3xl sm:text-4xl'
                          )}
                          <p className="text-white text-lg">{participantName}</p>
                          <p className="text-slate-400 text-sm">{ui('Camera is off')}</p>
                        </div>
                      ) : connectionStatus === 'connecting' ? (
                        // Connecting - show local video or avatar
                        <div className="w-full h-full">
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
                            <div className="w-full h-full flex items-center justify-center">
                              {renderAvatar(
                                myAvatarLoaded ? myAvatarUrl : null,
                                myInitials,
                                'w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4',
                                'bg-primary text-primary-foreground text-3xl sm:text-4xl'
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        // Not connected yet - show local video for doctor, avatar for waiting
                        <div className="w-full h-full">
                          {participantRole === 'doctor' || isAdmitted ? (
                            isVideoEnabled ? (
                              <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                                style={{ transform: 'scaleX(-1)' }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                {renderAvatar(
                                  myAvatarLoaded ? myAvatarUrl : null,
                                  myInitials,
                                  'w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4',
                                  'bg-primary text-primary-foreground text-3xl sm:text-4xl'
                                )}
                              </div>
                            )
                          ) : (
                            <div className="text-center">
                              {renderAvatar(
                                participantAvatarLoaded ? participantAvatarUrl : null,
                                participantInitials,
                                'w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4',
                                'bg-slate-700 text-slate-300 text-3xl sm:text-4xl'
                              )}
                              <p className="text-white text-lg">{participantName}</p>
                              <p className="text-slate-400 text-sm">
                                {connectionStatus === 'connected' ? ui('Connected') : ui('Connecting...')}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {connectionStatus === 'connected' && !remoteAudioPublished && (
                    <div className={`absolute right-4 z-40 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-white text-xs ${
                      participantRole === 'doctor' ? 'top-24 sm:top-4' : 'top-4'
                    }`}>
                      <MicOff className="w-3 h-3" />
                      <span>{ui('Mic off')}</span>
                    </div>
                  )}
                  {connectionStatus === 'connected' && !remoteVideoPublished && (
                    <div className={`absolute right-4 z-40 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-white text-xs ${
                      participantRole === 'doctor' ? 'top-32 sm:top-12' : 'top-12'
                    }`}>
                      <VideoOff className="w-3 h-3" />
                      <span>{ui('Camera off')}</span>
                    </div>
                  )}
                </div>

                {/* Local video (PIP) - always shown when video is enabled */}
                <motion.div
                  drag
                  dragConstraints={containerRef}
                  className="absolute bottom-20 sm:bottom-24 right-3 sm:right-6 w-32 h-24 sm:w-48 sm:h-36 rounded-xl overflow-hidden bg-[#252542] shadow-2xl border border-white/10 cursor-grab active:cursor-grabbing z-20"
                >
                  {isVideoEnabled ? (
                    <video
                      ref={localVideoPIPRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                      <div className="text-center">
                        {renderAvatar(
                          myAvatarLoaded ? myAvatarUrl : null,
                          myInitials,
                          'w-16 h-16 mx-auto mb-1',
                          'bg-primary text-primary-foreground text-xl'
                        )}
                        <p className="text-white text-xs font-medium">You</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-black/50 rounded text-xs text-white">
                    You
                  </div>
                  {!isAudioEnabled && (
                    <div className="absolute top-1 right-1 p-1 bg-red-500 rounded">
                      <MicOff className="w-3 h-3 text-white" />
                    </div>
                  )}
                </motion.div>
              </div>
            ) : consultationType === 'audio' ? (
              // Audio call view
              <div className="flex flex-col items-center justify-center">
                <motion.div
                  animate={{ scale: connectionStatus === 'connected' ? [1, 1.05, 1] : 1 }}
                  transition={{ repeat: connectionStatus === 'connected' ? Infinity : 0, duration: 2 }}
                >
                  {hasRemoteStream && connectionStatus === 'connected' ? (
                    <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mb-6">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-4xl sm:text-5xl">
                        {participantInitials}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <Avatar className="w-32 h-32 sm:w-40 sm:h-40 mb-6">
                      <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-800 text-slate-300 text-4xl sm:text-5xl">
                        {myInitials}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </motion.div>
                <h3 className="text-2xl font-semibold text-white mb-2">
                  {hasRemoteStream && connectionStatus === 'connected' ? participantName : ui('Waiting to connect')}
                </h3>
                <p className="text-slate-400">
                  {connectionStatus === 'connecting' ? ui('Connecting...') : ui('Audio Call')}
                </p>
              </div>
            ) : (
              // Chat-only view
              <div className="flex flex-col items-center justify-center">
                <MessageSquare className="w-16 h-16 text-slate-600 mb-4" />
                <p className="text-slate-400">{ui('Chat with')} {participantName}</p>
              </div>
            )}
          </div>

          {/* Control bar */}
          <ControlBar
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
            isChatOpen={isChatOpen}
            handRaised={handRaised}
            messageCount={messages.length}
            unreadMessageCount={unreadMessageCount}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onToggleChat={() => {
              const nextOpen = !isChatOpen;
              setIsChatOpen(nextOpen);
              if (nextOpen) {
                setIsNotesOpen(false);
              }
            }}
            onToggleHand={() => setHandRaised(!handRaised)}
            onLeaveCall={handleLeaveCall}
            onEndCallForEveryone={participantRole === 'doctor' ? requestEndCallForEveryone : undefined}
            canEndCallForEveryone={participantRole === 'doctor'}
          />
        </div>

        {/* Mobile backdrop for panels */}
        {(isChatOpen || isNotesOpen) && (
          <div 
            className="absolute inset-0 bg-black/50 z-35 sm:hidden" 
            onClick={() => {
              setIsChatOpen(false);
              setIsNotesOpen(false);
            }}
          />
        )}

        {/* Chat sidebar */}
        <div className={`${isChatOpen ? 'absolute sm:relative' : 'hidden'} top-0 right-0 bottom-0 z-40 sm:z-auto h-full max-h-screen`}>
          <ChatSidebar
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            messages={messages}
            newMessage={newMessage}
            onMessageChange={setNewMessage}
            onSendMessage={handleSendMessage}
          />
        </div>

        {/* Doctor notes panel */}
        {participantRole === 'doctor' && sessionData && (
          <div className={`${isNotesOpen ? 'absolute sm:relative' : 'hidden'} top-0 left-0 bottom-0 z-40 sm:z-auto h-full max-h-screen`}>
            <DoctorNotesPanel
              isOpen={isNotesOpen}
              onClose={() => setIsNotesOpen(false)}
              sessionId={sessionData.id}
              patientId={patientId!}
              doctorId={user!.id}
              initialView={notesPanelView}
              onClerkingSaved={() => setHasSavedClerking(true)}
            />
          </div>
        )}
      </div>

      <AlertDialog open={isEndForEveryoneDialogOpen} onOpenChange={setIsEndForEveryoneDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ui('End Call For Everyone?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {ui('Ending call for everyone means that the patient does not need follow up and will not be able to join this appointment again.')}
              {' '}
              {ui('If the patient needs follow up, click on Needs Follow Up.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(e) => {
                e.preventDefault();
                setIsEndForEveryoneDialogOpen(false);
                handleLeaveCall().catch((err) => {
                  console.error('Failed to leave call from follow-up action:', err);
                });
              }}
            >
              {ui('Needs Follow Up')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setIsEndForEveryoneDialogOpen(false);
                confirmEndCallForEveryone().catch((err) => {
                  console.error('Failed to end call for everyone:', err);
                });
              }}
            >
              {ui('End For Everyone')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
