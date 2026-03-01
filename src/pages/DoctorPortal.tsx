import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg, EventClickArg, EventInput, DayCellMountArg, EventMountArg } from '@fullcalendar/core';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, Video, MessageSquare, FileText,
  User, Bell, Settings, LogOut, ChevronRight, Star,
  Heart, Activity, Users, Phone, Banknote,
  TrendingUp, CheckCircle, XCircle, BarChart3, Menu, X, List, Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { JoinConsultationButton } from '@/components/consultation';
import { ScheduleEditor } from '@/components/ScheduleEditor';
import { useDoctorStats } from '@/hooks/useDoctorStats';
import { useRecentReviews } from '@/hooks/useRecentReviews';
import { useDoctorRegistration } from '@/hooks/useDoctorRegistration';
import { useDoctorEarnings } from '@/hooks/useDoctorEarnings';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackUserPresence } from '@/hooks/useTrackUserPresence';
import { usePatientPresence } from '@/hooks/usePatientPresence';
import { useRealtimeMessageNotifications } from '@/hooks/useRealtimeMessageNotifications';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useLanguage, type AppLanguage } from '@/contexts/LanguageContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import {
  formatAppointmentStatusLabel,
  normalizeAppointmentStatus,
  normalizeRescheduleRequestStatus,
  type AppointmentStatus,
} from '@/services/marketplaceTypes';
import { WalletService } from '@/services/WalletService';
import { PatientWalletService } from '@/services/PatientWalletService';
import { AppointmentRescheduleService } from '@/services/AppointmentRescheduleService';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { DoctorMessagesTab } from '@/components/doctor-portal/DoctorMessagesTab';
import { CLERKING_PANEL_TEXT } from '@/components/consultation/DoctorNotesPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocaleFormatter } from '@/lib/locale';
import { fetchDoctorConsultationNotesForFolder } from '@/lib/doctorConsultationNotes';

const PROFILE_BIO_TRANSLATION_LANGUAGES = [
  { code: 'ha', label: 'Hausa' },
  { code: 'ig', label: 'Igbo' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'sw', label: 'Swahili' },
  { code: 'ar', label: 'Arabic' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'zh', label: 'Chinese (Mandarin)' },
  { code: 'de', label: 'German' },
] as const;

const PROFILE_BIO_LANGUAGE_LABELS: Record<string, string> = PROFILE_BIO_TRANSLATION_LANGUAGES.reduce(
  (acc, languageOption) => {
    acc[languageOption.code] = languageOption.label;
    return acc;
  },
  {} as Record<string, string>
);

const CONSULTATION_LANGUAGE_VALUES = [
  'english',
  'hausa',
  'igbo',
  'yoruba',
  'arabic',
  'swahili',
  'fulfulde',
  'tiv',
  'pidgin_english',
  'french',
  'spanish',
  'portuguese',
] as const;

const normalizeConsultationLanguage = (value: string | null | undefined) => {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
};

const normalizeBioLanguageCode = (value: string | null | undefined) => {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/[^a-z]/g, '');
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const APPOINTMENT_STATUS_CALENDAR_STYLES = {
  pending_payment: {
    dot: '#d97706',
    bg: '#d97706',
    text: '#ffffff'
  },
  pending_approval: {
    dot: '#b45309',
    bg: '#b45309',
    text: '#ffffff'
  },
  confirmed: {
    dot: '#0f8f76',
    bg: '#0f8f76',
    text: '#ffffff'
  },
  in_progress: {
    dot: '#2563eb',
    bg: '#2563eb',
    text: '#ffffff'
  },
  completed: {
    dot: '#16a34a',
    bg: '#16a34a',
    text: '#ffffff'
  },
  cancelled: {
    dot: '#6b7280',
    bg: '#6b7280',
    text: '#ffffff'
  },
  no_show: {
    dot: '#dc2626',
    bg: '#dc2626',
    text: '#ffffff'
  },
  default: {
    dot: '#334155',
    bg: '#334155',
    text: '#ffffff'
  }
} as const;

const PAST_CONFIRMED_CALENDAR_STYLE = {
  dot: '#d97706',
  bg: '#f59e0b',
  text: '#ffffff',
} as const;

type WalletTransactionRow = {
  status: string | null;
};

const DoctorPortal = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAvailable, setIsAvailable] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewFolderOpen, setViewFolderOpen] = useState(false);
  const [selectedAppointmentForFolder, setSelectedAppointmentForFolder] = useState<any>(null);
  const [isLoadingPatientFolder, setIsLoadingPatientFolder] = useState(false);
  const [patientFolder, setPatientFolder] = useState<Record<string, any> | null>(null);
  const [patientFolderNotes, setPatientFolderNotes] = useState<Array<{
    id: string;
    created_at: string;
    doctor_id: string | null;
    diagnosis: string | null;
    diagnosis_translations?: Record<string, string> | null;
    treatment_plan: string | null;
    treatment_plan_translations?: Record<string, string> | null;
    prescriptions: string | null;
    prescriptions_translations?: Record<string, string> | null;
    follow_up_notes: string | null;
    follow_up_notes_translations?: Record<string, string> | null;
  }>>([]);
  const [patientHealthRecords, setPatientHealthRecords] = useState<Array<{
    id: string;
    file_name: string;
    file_url: string;
    file_type: string | null;
    file_size: number | null;
    uploaded_at: string;
    notes: string | null;
  }>>([]);
  const [doctorNamesById, setDoctorNamesById] = useState<Record<string, string>>({});
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<AppointmentStatus | 'all' | 'closed'>('confirmed');
  const [appointmentViewMode, setAppointmentViewMode] = useState<'list' | 'calendar'>('calendar');
  const [isMobileAppointmentsLayout, setIsMobileAppointmentsLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarDayDialogOpen, setCalendarDayDialogOpen] = useState(false);
  const [calendarEventDialogOpen, setCalendarEventDialogOpen] = useState(false);
  const [calendarDialogDate, setCalendarDialogDate] = useState<string | null>(null);
  const [calendarFocusedAppointmentId, setCalendarFocusedAppointmentId] = useState<string | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [messagesFocusSessionId, setMessagesFocusSessionId] = useState<string | null>(null);
  const [messagesJumpToUnreadSignal, setMessagesJumpToUnreadSignal] = useState(0);
  const [unreadReviewIds, setUnreadReviewIds] = useState<string[]>([]);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalNarration, setWithdrawalNarration] = useState('');
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);
  const sessionParticipantsCacheRef = useRef<Map<string, { patient_id: string | null; doctor_id: string | null }>>(new Map());
  const { user, role, signOut } = useAuth();
  const { isInstalled: isPwaInstalled, promptInstall } = usePwaInstall();
  const { t, language } = useLanguage();
  const { formatDate, formatDateTime, formatTime, formatClockTime, formatNumber, formatCurrency } = useLocaleFormatter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const consultationLanguageOptions = useMemo(() => {
    const fallbackLabels: Record<string, string> = {
      pidgin_english: 'Pidgin English',
    };

    return CONSULTATION_LANGUAGE_VALUES.map((value) => ({
      value,
      label: t(
        `auth.values.languages.${value}`,
        fallbackLabels[value]
          || value
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
      ),
    }));
  }, [t]);
  const getBioLanguageLabel = (code: string) =>
    PROFILE_BIO_LANGUAGE_LABELS[code]
    || code.toUpperCase();
  const unreadReviewsCount = unreadReviewIds.length;
  const reviewSeenStorageKey = user?.id ? `doctor-review-seen-${user.id}` : null;

  const getSeenReviewIds = () => {
    if (!reviewSeenStorageKey || typeof window === 'undefined') return new Set<string>();
    try {
      const raw = window.localStorage.getItem(reviewSeenStorageKey);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();
      return new Set<string>(parsed.filter((v) => typeof v === 'string'));
    } catch {
      return new Set<string>();
    }
  };

  const persistSeenReviewIds = (ids: Set<string>) => {
    if (!reviewSeenStorageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(reviewSeenStorageKey, JSON.stringify(Array.from(ids)));
  };

  // Track doctor presence
  useEffect(() => {
    if (user?.id) {
      console.log('[DoctorPortal] Tracking presence for doctor:', user.id, 'role:', role);
    }
  }, [user?.id, role]);
  
  useTrackUserPresence(user?.id, 'doctor');
  useRealtimeMessageNotifications(user?.id, 'doctor');

  const getMessageReadState = useCallback(() => {
    if (!user?.id || typeof window === 'undefined') return {} as Record<string, string>;
    const storageKey = `doctor-messages-read-${user.id}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
      );
    } catch {
      return {};
    }
  }, [user?.id]);

  const refreshUnreadMessagesCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadMessagesCount(0);
      return;
    }

    const { data: sessions, error: sessionError } = await supabase
      .from('consultation_sessions')
      .select('id')
      .eq('doctor_id', user.id);

    if (sessionError || !sessions || sessions.length === 0) {
      setUnreadMessagesCount(0);
      return;
    }

    const sessionIds = sessions
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (sessionIds.length === 0) {
      setUnreadMessagesCount(0);
      return;
    }

    const readState = getMessageReadState();
    const { data: messages, error: messageError } = await supabase
      .from('consultation_messages')
      .select('session_id, created_at, sender_role')
      .in('session_id', sessionIds)
      .eq('sender_role', 'patient')
      .order('created_at', { ascending: true });

    if (messageError || !messages) {
      setUnreadMessagesCount(0);
      return;
    }

    const total = messages.reduce((count, row: any) => {
      const sessionId = String(row.session_id || '');
      const createdAt = String(row.created_at || '');
      if (!sessionId || !createdAt) return count;
      const lastReadAt = readState[sessionId];
      if (lastReadAt && new Date(createdAt).getTime() <= new Date(lastReadAt).getTime()) return count;
      return count + 1;
    }, 0);

    setUnreadMessagesCount(total);
  }, [getMessageReadState, user?.id]);

  useEffect(() => {
    if (!user?.id || !reviewSeenStorageKey) return;

    const loadUnreadReviews = async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id')
        .eq('doctor_id', user.id)
        .eq('status', 'completed')
        .not('rating', 'is', null)
        .order('date', { ascending: false });

      if (error) {
        console.error('Failed to load doctor review notifications:', error);
        return;
      }

      const seenIds = getSeenReviewIds();
      const unseenIds = (data || [])
        .map((row) => row.id as string)
        .filter((id) => !seenIds.has(id));
      setUnreadReviewIds(unseenIds);
    };

    loadUnreadReviews();
  }, [user?.id, reviewSeenStorageKey]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`doctor-review-notify-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as {
            id?: string;
            rating?: number | null;
            review_comment?: string | null;
            patient_name?: string | null;
          } | null;

          if (!updated?.id || updated.rating === null || updated.rating === undefined) return;

          setUnreadReviewIds((prev) => {
            if (prev.includes(updated.id as string)) return prev;

            const seenIds = getSeenReviewIds();
            if (seenIds.has(updated.id as string)) return prev;

            toast({
              title: 'New patient review',
              description: `${updated.patient_name || 'A patient'} rated you ${updated.rating}/5`,
            });
            return [...prev, updated.id as string];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`doctor-unread-messages-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'consultation_messages' },
        async (payload) => {
          const message = payload.new as {
            session_id?: string;
            sender_id?: string;
            sender_role?: string;
          } | null;

          if (!message?.session_id || !message.sender_id) return;
          if (message.sender_id === user.id) return;
          if (message.sender_role !== 'patient') return;

          let session = sessionParticipantsCacheRef.current.get(message.session_id);
          if (!session) {
            const { data } = await supabase
              .from('consultation_sessions')
              .select('patient_id, doctor_id')
              .eq('id', message.session_id)
              .maybeSingle();
            if (!data) return;
            session = {
              patient_id: data.patient_id ?? null,
              doctor_id: data.doctor_id ?? null,
            };
            sessionParticipantsCacheRef.current.set(message.session_id, session);
          }

          if (session.doctor_id !== user.id) return;
          refreshUnreadMessagesCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshUnreadMessagesCount]);

  useEffect(() => {
    refreshUnreadMessagesCount();
  }, [activeTab, messagesJumpToUnreadSignal, refreshUnreadMessagesCount]);

  useEffect(() => {
    if (activeTab !== 'messages') return;
    const timer = window.setInterval(() => {
      refreshUnreadMessagesCount();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeTab, refreshUnreadMessagesCount]);

  useEffect(() => {
    if (activeTab !== 'reviews' || unreadReviewIds.length === 0) return;
    const seenIds = getSeenReviewIds();
    unreadReviewIds.forEach((id) => seenIds.add(id));
    persistSeenReviewIds(seenIds);
    setUnreadReviewIds([]);
  }, [activeTab, unreadReviewIds]);
  
  // Subscribe to patient presence
  const { presenceMap: patientPresenceMap } = usePatientPresence();

  // Fetch doctor statistics
  const { data: doctorStats, isLoading: statsLoading } = useDoctorStats(user?.id);

  // Fetch recent reviews
  const { data: recentReviews = [], isLoading: reviewsLoading } = useRecentReviews(user?.id);

  // Fetch doctor registration data
  const { data: doctorRegistration } = useDoctorRegistration();
  
  // Fetch doctor availability status
  const { data: doctorAvailability } = useQuery({
    queryKey: ['doctor-availability', user?.id],
    queryFn: async () => {
      if (!user?.id) return { is_active: false, has_schedules: false };
      
      // Check is_active from doctors table
      const { data: doctorData } = await supabase
        .from('doctors')
        .select('is_active')
        .eq('id', user.id)
        .single();
      
      // Check if doctor has any available schedules
      const { data: schedules } = await supabase
        .from('doctor_schedules')
        .select('id')
        .eq('doctor_id', user.id)
        .eq('is_available', true)
        .limit(1);
      
      return {
        is_active: doctorData?.is_active !== false,
        has_schedules: (schedules || []).length > 0
      };
    },
    enabled: !!user?.id,
  });

  // Sync availability state with database
  useEffect(() => {
    if (doctorAvailability) {
      const actualAvailability = doctorAvailability.is_active && doctorAvailability.has_schedules;
      setIsAvailable(actualAvailability);
    }
  }, [doctorAvailability]);

  // Real-time subscription for schedule changes to update availability
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`doctor-availability-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doctor_schedules',
          filter: `doctor_id=eq.${user.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['doctor-availability', user.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doctors',
          filter: `id=eq.${user.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['doctor-availability', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
  
  // Fetch doctor earnings
  const { data: earningsData, isLoading: earningsLoading } = useDoctorEarnings(user?.id);
  const { data: doctorWallet, isLoading: walletLoading } = useQuery({
    queryKey: ['doctor-wallet', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return WalletService.getDoctorWallet(user.id);
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
  const { data: walletTransactions = [], isLoading: walletTransactionsLoading } = useQuery({
    queryKey: ['doctor-wallet-transactions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return WalletService.getWalletTransactions(user.id);
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [profileFormData, setProfileFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    specialty: '',
    experience: '',
    bio: '',
  });
  const [passwordFormData, setPasswordFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [bioTranslations, setBioTranslations] = useState<Record<string, string>>({});
  const [newBioLanguageCode, setNewBioLanguageCode] = useState('');
  const [selectedConsultationLanguages, setSelectedConsultationLanguages] = useState<string[]>([]);
  const availableBioTranslationLanguageOptions = useMemo(
    () =>
      PROFILE_BIO_TRANSLATION_LANGUAGES.filter(
        (languageOption) => !bioTranslations[languageOption.code]
      ),
    [bioTranslations]
  );

  const patientFolderFieldOrder = [
    'patient_type',
    'presenting_complaint',
    'history_of_presenting_complaint',
    'past_medical_history',
    'past_drug_history',
    'allergies',
    'family_social_history',
    'clinical_examination',
    'assessment',
    'treatment_plan',
    'investigations',
    'e_prescription',
    'medical_history',
    'current_medications',
    'previous_diagnoses',
  ];

  const folderLanguageText = CLERKING_PANEL_TEXT[language] ?? CLERKING_PANEL_TEXT.en;
  const folderMetaTextByLanguage: Record<AppLanguage, { date: string; time: string; lastUpdated: string; accessNotice: string }> = {
    en: { date: 'Date', time: 'Time', lastUpdated: 'Last Updated', accessNotice: 'Folder access is limited to patients you have consulted with.' },
    ha: { date: 'Kwana', time: 'Lokaci', lastUpdated: 'Sabuntawa ta ƙarshe', accessNotice: 'Samun damar jaka yana iyakance ga majiyyatan da ka yi shawara da su.' },
    ig: { date: 'Ụbọchị', time: 'Oge', lastUpdated: 'Emelitere ikpeazụ', accessNotice: 'Nweta folda a bụ naanị maka ndị ọrịa ị lere.' },
    yo: { date: 'Ọjọ́', time: 'Àkókò', lastUpdated: 'Ìmúdójúìwọ̀n tó kẹ́yìn', accessNotice: 'Ìwọlé sí fọ́ldà yìí jẹ́ fún àwọn aláìsàn tí o ti bá ṣe ìmọ̀ràn nìkan.' },
    sw: { date: 'Tarehe', time: 'Muda', lastUpdated: 'Ilisasishwa mwisho', accessNotice: 'Ufikiaji wa folda ni kwa wagonjwa uliowahi kuwashauri pekee.' },
    ar: { date: 'التاريخ', time: 'الوقت', lastUpdated: 'آخر تحديث', accessNotice: 'الوصول إلى الملف يقتصر على المرضى الذين قمت باستشارتهم.' },
    fr: { date: 'Date', time: 'Heure', lastUpdated: 'Dernière mise à jour', accessNotice: 'L’accès au dossier est limité aux patients que vous avez consultés.' },
    es: { date: 'Fecha', time: 'Hora', lastUpdated: 'Última actualización', accessNotice: 'El acceso al expediente está limitado a pacientes que has consultado.' },
    pt: { date: 'Data', time: 'Hora', lastUpdated: 'Última atualização', accessNotice: 'O acesso ao prontuário é limitado aos pacientes que você consultou.' },
    nl: { date: 'Datum', time: 'Tijd', lastUpdated: 'Laatst bijgewerkt', accessNotice: 'Toegang tot het dossier is beperkt tot patiënten die u heeft geconsulteerd.' },
    zh: { date: '日期', time: '时间', lastUpdated: '最后更新', accessNotice: '仅限您已接诊过的患者可查看该档案。' },
    de: { date: 'Datum', time: 'Uhrzeit', lastUpdated: 'Zuletzt aktualisiert', accessNotice: 'Der Zugriff auf die Akte ist auf Patienten beschränkt, die Sie konsultiert haben.' },
  };
  const folderMetaText = folderMetaTextByLanguage[language] ?? folderMetaTextByLanguage.en;

  const formatFolderFieldLabel = (field: string) =>
    (
      folderLanguageText.fields as Record<string, { label?: string }>
    )[field]?.label ||
    field
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const entryHeaderRegex = /---\s*Entry:\s*(.+?)\s+by doctor:([0-9a-fA-F-]{36})/g;

  const extractDoctorIdsFromEntries = (value: unknown): string[] => {
    if (typeof value !== 'string' || !value.includes('by doctor:')) return [];

    const ids: string[] = [];
    let match: RegExpExecArray | null = entryHeaderRegex.exec(value);
    while (match) {
      ids.push(match[2]);
      match = entryHeaderRegex.exec(value);
    }
    entryHeaderRegex.lastIndex = 0;
    return ids;
  };

  const formatEntryTimestamp = (rawTimestamp: string): string => {
    const date = new Date(rawTimestamp.trim());
    if (Number.isNaN(date.getTime())) return rawTimestamp.trim();
    return formatDateTime(date);
  };

  const formatFolderEntryText = (value: unknown, fallback: string): string => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return String(value);

    const formatted = value.replace(entryHeaderRegex, (_match, timestamp, doctorId) => {
      const doctorName = doctorNamesById[doctorId];
      const doctorLabel = doctorName ? `Dr. ${doctorName}` : `Doctor ${doctorId.slice(0, 8)}`;
      return `\nEntry: ${formatEntryTimestamp(String(timestamp))} by ${doctorLabel}`;
    });
    entryHeaderRegex.lastIndex = 0;

    // Some legacy clerking writes can repeat the same "Entry:" header across
    // multiple lines of one note. Collapse duplicate consecutive headers so
    // multiline content remains a single entry block in the UI.
    const lines = formatted
      .split('\n')
      .map((line) => line.trimEnd());
    const dedupedLines: string[] = [];
    let lastHeader: string | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('Entry:')) {
        if (line === lastHeader) continue;
        lastHeader = line;
      }
      dedupedLines.push(line);
    }

    return dedupedLines.join('\n').trim();
  };

  const getLocalizedFieldText = (
    rawValue: unknown,
    rawTranslations: unknown,
    currentLanguage: AppLanguage
  ): string => {
    const base = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!rawTranslations || typeof rawTranslations !== 'object') return base;

    const translations = rawTranslations as Record<string, unknown>;
    const localized = translations[currentLanguage];
    if (typeof localized === 'string' && localized.trim()) return localized.trim();

    const english = translations.en;
    if (typeof english === 'string' && english.trim()) return english.trim();

    return base;
  };

  const handleViewPatientFolder = async (apt: any) => {
    setSelectedAppointmentForFolder(apt);
    setViewFolderOpen(true);
    setIsLoadingPatientFolder(true);
    setPatientFolder(null);
    setPatientFolderNotes([]);
    setPatientHealthRecords([]);

    try {
      if (!user?.id) throw new Error('Doctor must be authenticated to load patient folder');

      const [
        { data: folder, error: folderError },
        notesResult,
        { data: healthRecords, error: healthRecordsError }
      ] = await Promise.all([
        supabase
          .from('patient_folders')
          .select('*')
          .eq('patient_id', apt.patient_id)
          .maybeSingle(),
        fetchDoctorConsultationNotesForFolder(apt.patient_id, user.id, 10),
        supabase
          .from('health_records')
          .select('id, file_name, file_url, file_type, file_size, uploaded_at, notes')
          .eq('patient_id', apt.patient_id)
          .order('uploaded_at', { ascending: false })
      ]);

      if (folderError) throw folderError;
      if (notesResult.error) throw notesResult.error;
      if (healthRecordsError) throw healthRecordsError;
      if (notesResult.missingTranslationColumns) {
        console.warn(
          'doctor_consultation_notes translation columns are missing. Falling back to legacy note fields.'
        );
      }

      setPatientFolder((folder as Record<string, any> | null) ?? null);
      const typedNotes = (notesResult.data ?? []) as Array<{
        id: string;
        created_at: string;
        doctor_id: string | null;
        diagnosis: string | null;
        diagnosis_translations?: Record<string, string> | null;
        treatment_plan: string | null;
        treatment_plan_translations?: Record<string, string> | null;
        prescriptions: string | null;
        prescriptions_translations?: Record<string, string> | null;
        follow_up_notes: string | null;
        follow_up_notes_translations?: Record<string, string> | null;
      }>;
      setPatientFolderNotes(typedNotes);
      setPatientHealthRecords((healthRecords as any) ?? []);

      const idsFromFolder = patientFolderFieldOrder.flatMap((field) =>
        extractDoctorIdsFromEntries((folder as Record<string, any> | null)?.[field])
      );
      const idsFromNotes = typedNotes.flatMap((note) => [
        ...(note.doctor_id ? [note.doctor_id] : []),
        ...extractDoctorIdsFromEntries(note.follow_up_notes),
      ]);
      const uniqueDoctorIds = Array.from(new Set([...idsFromFolder, ...idsFromNotes]));

      if (uniqueDoctorIds.length > 0) {
        const map: Record<string, string> = {};
        if (user?.id && doctorRegistration?.full_name) {
          map[user.id] = doctorRegistration.full_name;
        }

        const { data: doctorRows, error: doctorError } = await supabase
          .from('doctor_registrations')
          .select('user_id, full_name')
          .in('user_id', uniqueDoctorIds);

        if (doctorError) {
          console.warn('Could not load doctor names for folder entries:', doctorError);
        } else {
          (doctorRows || []).forEach((doctor: any) => {
            if (doctor.user_id && doctor.full_name) {
              map[doctor.user_id] = doctor.full_name;
            }
          });
        }

        const unresolvedDoctorIds = uniqueDoctorIds.filter((id) => !map[id]);
        if (unresolvedDoctorIds.length > 0) {
          const { data: publicDoctorRows, error: publicDoctorError } = await supabase
            .from('doctors')
            .select('id, name')
            .in('id', unresolvedDoctorIds);

          if (publicDoctorError) {
            console.warn('Could not load fallback doctor names from doctors table:', publicDoctorError);
          } else {
            (publicDoctorRows || []).forEach((doctor: any) => {
              if (doctor.id && doctor.name) {
                map[doctor.id] = doctor.name;
              }
            });
          }
        }

        setDoctorNamesById(map);
      } else {
        setDoctorNamesById({});
      }
    } catch (error) {
      console.error('Failed to load patient folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to load patient folder.',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingPatientFolder(false);
    }
  };

  // Initialize form data when doctorRegistration loads
  useEffect(() => {
    if (doctorRegistration) {
      const nextBioTranslations: Record<string, string> = {};
      const rawBioTranslations = doctorRegistration.bio_translations;

      if (rawBioTranslations && typeof rawBioTranslations === 'object') {
        Object.entries(rawBioTranslations as Record<string, unknown>).forEach(([code, value]) => {
          const normalizedCode = normalizeBioLanguageCode(code);
          if (!normalizedCode || normalizedCode === 'en') return;
          if (typeof value !== 'string') return;
          const trimmedValue = value.trim();
          if (!trimmedValue) return;
          nextBioTranslations[normalizedCode] = trimmedValue;
        });
      }

      PROFILE_BIO_TRANSLATION_LANGUAGES.forEach((languageOption) => {
        const normalizedCode = normalizeBioLanguageCode(languageOption.code);
        if (!normalizedCode || normalizedCode === 'en') return;
        if (nextBioTranslations[normalizedCode]) return;
        const legacyBioColumnKey = `bio_${normalizedCode}` as keyof typeof doctorRegistration;
        const legacyValue = doctorRegistration[legacyBioColumnKey];
        if (typeof legacyValue !== 'string') return;
        const trimmedValue = legacyValue.trim();
        if (!trimmedValue) return;
        nextBioTranslations[normalizedCode] = trimmedValue;
      });

      setProfileFormData({
        fullName: doctorRegistration.full_name || '',
        email: doctorRegistration.email || '',
        phone: doctorRegistration.phone_number || '',
        specialty: doctorRegistration.specialty || '',
        experience: doctorRegistration.experience || '',
        bio: doctorRegistration.bio || '',
      });
      setBioTranslations(nextBioTranslations);
      const initialAddLanguage =
        PROFILE_BIO_TRANSLATION_LANGUAGES.find((languageOption) => !nextBioTranslations[languageOption.code])?.code || '';
      setNewBioLanguageCode(initialAddLanguage);
      const existingConsultationLanguages = Array.isArray(doctorRegistration.preferred_consultation_languages)
        ? doctorRegistration.preferred_consultation_languages
          .map((item: string) => normalizeConsultationLanguage(item))
          .filter(Boolean)
        : [];
      setSelectedConsultationLanguages(existingConsultationLanguages);
    }
  }, [doctorRegistration]);

  // Real-time subscription for doctor appointments
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('doctor-appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `doctor_id=eq.${user.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['doctor-appointments', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Fetch appointments for this doctor
  const { data: fetchedAppointments = [], isLoading: appointmentsLoading, refetch } = useQuery({
    queryKey: ['doctor-appointments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // First fetch appointments
      const { data: appointments, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .eq('doctor_id', user.id)
        .order('date', { ascending: true });
      
      if (aptError) throw aptError;
      if (!appointments || appointments.length === 0) return [];
      
      console.log('Fetched appointments:', appointments);
      
      // Then fetch patient ages for these appointments
      const patientIds = appointments.map(apt => apt.patient_id).filter(Boolean);
      console.log('Patient IDs:', patientIds);
      
      if (patientIds.length === 0) {
        return appointments.map((apt: any) => ({
          ...apt,
          status: normalizeAppointmentStatus(apt.status),
          reschedule_request_status: normalizeRescheduleRequestStatus(apt.reschedule_request_status),
          patient_age: null,
        }));
      }
      
      const { data: patientData, error: patientError } = await supabase
        .from('patient_registrations')
        .select('user_id, age, full_name, profile_picture_url')
        .in('user_id', patientIds);
      
      console.log('Patient data:', patientData, 'Error:', patientError);
      
      // Merge the data
      const patientDataMap = new Map(patientData?.map(p => [p.user_id, { age: p.age, full_name: p.full_name, profile_picture_url: p.profile_picture_url }]) || []);
      return appointments.map((apt: any) => ({
        ...apt,
        status: normalizeAppointmentStatus(apt.status),
        reschedule_request_status: normalizeRescheduleRequestStatus(apt.reschedule_request_status),
        patient_age: patientDataMap.get(apt.patient_id)?.age || null,
        patient_name: patientDataMap.get(apt.patient_id)?.full_name || null,
        patient_profile_picture: patientDataMap.get(apt.patient_id)?.profile_picture_url || null
      }));
    },
    enabled: !!user?.id,
  });

  const handleDeclineRequest = async (appointmentOrId: string | any) => {
    const appointmentId = typeof appointmentOrId === 'string' ? appointmentOrId : appointmentOrId?.id;
    const appointment =
      (typeof appointmentOrId === 'string'
        ? doctorVisibleAppointments.find((apt) => apt.id === appointmentOrId)
        : appointmentOrId) || null;
    const pendingReschedule = appointment ? isPendingRescheduleRequest(appointment as { reschedule_request_status?: string | null }) : false;

    if (!appointmentId) return;

    try {
      if (pendingReschedule) {
        const response = await AppointmentRescheduleService.respondToReschedule({
          appointmentId,
          action: 'decline',
        });
        const refunded = Number(response.refunded_upgrade_amount || 0);
        toast({
          title: 'Reschedule declined',
          description: refunded > 0
            ? `The current appointment remains unchanged. Refunded ₦${refunded.toLocaleString()} to patient wallet.`
            : 'The current appointment remains unchanged.',
        });
        refetch();
        return;
      }

      console.log('Cancelling appointment:', appointmentId, 'User ID:', user?.id);
      const result = await PatientWalletService.cancelAppointmentWithRefund(appointmentId, 'Doctor cancelled appointment');
      const refunded = Number(result?.refund_amount || 0);
      toast({
        title: 'Appointment cancelled',
        description: refunded > 0
          ? `Refunded ₦${refunded.toLocaleString()} to the patient wallet.`
          : 'Appointment has been cancelled.',
      });
      refetch();
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
      toast({ title: 'Error', description: 'Failed to cancel appointment.' });
    }
  };

  const handleApproveRequest = async (appointmentOrId: string | any) => {
    if (!user?.id) return;
    const appointmentId = typeof appointmentOrId === 'string' ? appointmentOrId : appointmentOrId?.id;
    const appointment =
      (typeof appointmentOrId === 'string'
        ? doctorVisibleAppointments.find((apt) => apt.id === appointmentOrId)
        : appointmentOrId) || null;
    const pendingReschedule = appointment ? isPendingRescheduleRequest(appointment as { reschedule_request_status?: string | null }) : false;

    if (!appointmentId) return;

    try {
      if (pendingReschedule) {
        const result = await AppointmentRescheduleService.respondToReschedule({
          appointmentId,
          action: 'approve',
        });
        const charged = Number(result.charged_upgrade_amount || 0);
        toast({
          title: 'Reschedule approved',
          description: charged > 0
            ? `Appointment updated. ₦${charged.toLocaleString()} charged from patient wallet.`
            : 'Appointment updated to the proposed slot.',
        });
        refetch();
        return;
      }

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appointmentId)
        .eq('doctor_id', user.id)
        .eq('status', 'pending_approval');

      if (error) throw error;

      toast({
        title: 'Appointment confirmed',
        description: 'The appointment has been approved and moved to confirmed.',
      });
      refetch();
    } catch (error) {
      console.error('Failed to approve appointment:', error);
      toast({ title: 'Error', description: 'Failed to approve appointment.' });
    }
  };

  const handleMarkNoShow = async (appointmentId: string) => {
    try {
      const result = await PatientWalletService.markAppointmentNoShow(appointmentId, 'Doctor marked patient as no-show');
      const refunded = Number(result?.refund_amount || 0);
      toast({
        title: 'Marked as no-show',
        description: refunded > 0
          ? `Refunded ₦${refunded.toLocaleString()} to the patient wallet.`
          : 'Appointment has been marked as no-show.',
      });
      refetch();
    } catch (error) {
      console.error('Failed to mark no-show:', error);
      toast({ title: 'Error', description: 'Failed to mark appointment as no-show.' });
    }
  };

  const getAppointmentDateTime = (apt: { date: string; time: string }) => new Date(`${apt.date}T${apt.time}`);
  const hasAppointmentTimePassed = (apt: { date: string; time: string }) =>
    getAppointmentDateTime(apt).getTime() <= Date.now();
  const isPendingRescheduleRequest = (apt: { reschedule_request_status?: string | null }) =>
    normalizeRescheduleRequestStatus(apt.reschedule_request_status) === 'pending';
  const isPatientRequestedReschedule = (apt: { reschedule_requested_by?: string | null }) =>
    (apt.reschedule_requested_by || '').trim().toLowerCase() === 'patient';
  const isDoctorRequestedReschedule = (apt: { reschedule_requested_by?: string | null }) =>
    (apt.reschedule_requested_by || '').trim().toLowerCase() === 'doctor';
  const getCalendarAppointmentDate = (apt: {
    date: string;
    reschedule_request_status?: string | null;
    reschedule_proposed_date?: string | null;
  }) => (
    isPendingRescheduleRequest(apt)
      ? String(apt.reschedule_proposed_date || apt.date)
      : apt.date
  );
  const getCalendarAppointmentTime = (apt: {
    time: string;
    reschedule_request_status?: string | null;
    reschedule_proposed_time?: string | null;
  }) => (
    isPendingRescheduleRequest(apt)
      ? String(apt.reschedule_proposed_time || apt.time)
      : apt.time
  );
  const hasEffectiveAppointmentTimePassed = (apt: {
    date: string;
    time: string;
    reschedule_request_status?: string | null;
    reschedule_proposed_date?: string | null;
    reschedule_proposed_time?: string | null;
  }) => {
    const dateValue = getCalendarAppointmentDate(apt);
    const timeValue = getCalendarAppointmentTime(apt);
    const effectiveDateTime = new Date(`${dateValue}T${timeValue}`);
    if (!Number.isNaN(effectiveDateTime.getTime())) {
      return effectiveDateTime.getTime() <= Date.now();
    }
    return hasAppointmentTimePassed(apt);
  };
  const toTimeInputValue = (value: string) => {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed.slice(0, 5);

    const twelveHour = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (twelveHour) {
      const hourValue = parseInt(twelveHour[1], 10);
      const minuteValue = twelveHour[2];
      const period = twelveHour[3].toUpperCase();
      const normalizedHour = period === 'PM' ? (hourValue % 12) + 12 : hourValue % 12;
      return `${String(normalizedHour).padStart(2, '0')}:${minuteValue}`;
    }

    return '';
  };

  const doctorVisibleAppointments = useMemo(
    () => (fetchedAppointments || []).filter((apt) => apt.status !== 'pending_payment'),
    [fetchedAppointments],
  );
  const rescheduleAppointment = useMemo(
    () => doctorVisibleAppointments.find((apt) => apt.id === rescheduleAppointmentId) || null,
    [doctorVisibleAppointments, rescheduleAppointmentId],
  );

  const openRescheduleDialog = (appointment: any) => {
    if (isPendingRescheduleRequest(appointment as { reschedule_request_status?: string | null })) {
      toast({
        title: 'Request already pending',
        description: 'A reschedule request is already awaiting a response.',
        variant: 'destructive',
      });
      return;
    }
    setRescheduleAppointmentId(appointment.id || null);
    setRescheduleDate(appointment.date || '');
    setRescheduleTime(toTimeInputValue(String(appointment.time || '')));
    setRescheduleDialogOpen(true);
  };

  const openMessagesForAppointment = async (apt: any) => {
    if (!user?.id) return;
    const appointmentId = (apt as { id?: string | null }).id;
    const patientId = (apt as { patient_id?: string | null }).patient_id;
    if (!appointmentId || !patientId) {
      toast({
        title: t('doctorPortal.messaging.unavailableTitle', 'Messaging unavailable'),
        description: t('doctorPortal.messaging.missingPatientContext', 'Patient details are missing for this appointment.'),
        variant: 'destructive',
      });
      return;
    }

    const consultationTypeCandidate = String(
      (apt as { consultation_type?: string | null }).consultation_type ||
      ((apt as { price_breakdown?: Record<string, unknown> | null }).price_breakdown as Record<string, unknown> | null)?.consultation_type ||
      (apt as { consultationType?: string | null }).consultationType ||
      (apt as { consultation_mode?: string | null }).consultation_mode ||
      'video'
    ).toLowerCase();
    const consultationType = consultationTypeCandidate === 'chat' || consultationTypeCandidate === 'voice'
      ? consultationTypeCandidate
      : 'video';

    try {
      const { data: existingSession, error: existingSessionError } = await supabase
        .from('consultation_sessions')
        .select('id')
        .eq('appointment_id', appointmentId)
        .maybeSingle();

      if (existingSessionError) throw existingSessionError;

      let sessionId = existingSession?.id ?? null;
      if (!sessionId) {
        const { data: createdSession, error: createSessionError } = await supabase
          .from('consultation_sessions')
          .insert({
            appointment_id: appointmentId,
            patient_id: patientId,
            doctor_id: user.id,
            consultation_type: consultationType,
          })
          .select('id')
          .single();

        if (createSessionError) throw createSessionError;
        sessionId = createdSession.id;
      }

      setMessagesFocusSessionId(null);
      setTimeout(() => setMessagesFocusSessionId(sessionId), 0);
      setActiveTab('messages');
      setSidebarOpen(false);
    } catch (err) {
      console.error('Failed to open appointment messages:', err);
      toast({
        title: t('doctorPortal.messaging.failedTitle', 'Unable to open messages'),
        description: t('doctorPortal.messaging.failedDescription', 'Please try again in a moment.'),
        variant: 'destructive',
      });
    }
  };

  const submitReschedule = async () => {
    if (!rescheduleAppointmentId || !rescheduleAppointment) return;
    if (!rescheduleDate || !rescheduleTime) {
      toast({
        title: 'Missing fields',
        description: 'Select both date and time for rescheduling.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedTime = /^\d{2}:\d{2}$/.test(rescheduleTime) ? `${rescheduleTime}:00` : rescheduleTime;
    const targetDateTime = new Date(`${rescheduleDate}T${normalizedTime}`);
    if (Number.isNaN(targetDateTime.getTime()) || targetDateTime.getTime() <= Date.now()) {
      toast({
        title: 'Invalid date/time',
        description: 'Choose a future appointment time.',
        variant: 'destructive',
      });
      return;
    }

    setIsRescheduling(true);
    try {
      await AppointmentRescheduleService.requestReschedule({
        appointmentId: rescheduleAppointmentId,
        proposedDate: rescheduleDate,
        proposedTime: normalizedTime,
        proposedDurationMinutes: Number((rescheduleAppointment as { duration_minutes?: number | null }).duration_minutes || 30),
        proposedFinalPrice: Number((rescheduleAppointment as { final_price?: number | null }).final_price || 0),
      });

      toast({
        title: 'Reschedule requested',
        description: 'Patient approval is required before this new slot is applied.',
      });
      setRescheduleDialogOpen(false);
      setRescheduleAppointmentId(null);
      refetch();
    } catch (error) {
      console.error('Failed to reschedule appointment:', error);
      toast({
        title: 'Reschedule failed',
        description: 'Could not reschedule this appointment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRescheduling(false);
    }
  };

  // Calculate upcoming appointments (next 24 hours) and next appointment
  const now = new Date();
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  const upcomingSchedule = doctorVisibleAppointments.filter(apt => {
    const aptDateTime = new Date(`${apt.date}T${apt.time}`);
    return aptDateTime >= now && aptDateTime <= next24Hours && (apt.status === 'confirmed' || apt.status === 'in_progress');
  }).sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Find next appointment
  const upcomingAppointments = doctorVisibleAppointments
    .filter(apt => {
      const aptDate = new Date(`${apt.date}T${apt.time}`);
      return aptDate > now && (apt.status === 'confirmed' || apt.status === 'in_progress');
    })
    .sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`);
      const dateB = new Date(`${b.date}T${b.time}`);
      return dateA.getTime() - dateB.getTime();
    });
  
  const nextAppointment = upcomingAppointments[0];
  const getTimeUntilNext = () => {
    if (!nextAppointment) return null;
    const aptTime = new Date(`${nextAppointment.date}T${nextAppointment.time}`);
    const diffMs = aptTime.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    const minsLabel = t('common.timeUnit.minuteShort', 'min');
    const hoursLabel = t('common.timeUnit.hourShort', 'h');
    const minutesShortLabel = t('common.timeUnit.minutesShort', 'm');

    if (diffMins < 60) return `${formatNumber(diffMins)} ${minsLabel}`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0
      ? `${formatNumber(hours)}${hoursLabel} ${formatNumber(mins)}${minutesShortLabel}`
      : `${formatNumber(hours)}${hoursLabel}`;
  };

  // Pending doctor-approval queue (only paid appointments).
  const pendingRequests = doctorVisibleAppointments.filter(apt => {
    const isPending = apt.status === 'pending_approval' || isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null });
    if (!isPending) return false;
    if ((apt as any).date && (apt as any).time) {
      return !hasEffectiveAppointmentTimePassed(apt as {
        date: string;
        time: string;
        reschedule_request_status?: string | null;
        reschedule_proposed_date?: string | null;
        reschedule_proposed_time?: string | null;
      });
    }
    return true;
    }).map(apt => ({
    id: apt.id,
    appointment: apt,
    patient: apt.patient_name || 'Unknown Patient',
    age: apt.patient_age || 'N/A',
    requestedDate: getCalendarAppointmentDate(apt as {
      date: string;
      reschedule_request_status?: string | null;
      reschedule_proposed_date?: string | null;
    }),
    requestedTime: getCalendarAppointmentTime(apt as {
      time: string;
      reschedule_request_status?: string | null;
      reschedule_proposed_time?: string | null;
    }),
    reason: (apt as { reschedule_request_note?: string | null }).reschedule_request_note || apt.notes || 'No reason provided',
    isReschedulePending: isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
    requestedBy: (apt as { reschedule_requested_by?: string | null }).reschedule_requested_by || null,
    proposedDate: (apt as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || null,
    proposedTime: (apt as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || null,
    priority: 'normal',
  }));
  
  // Move stats calculation after pendingRequests
  const stats = {
    totalPatients: doctorStats?.totalPatients || 0,
    consultationsThisMonth: doctorStats?.consultationsThisMonth || 0,
    pendingRequests: pendingRequests.length,
    earnings: earningsData?.thisMonthEarnings || 0,
    rating: doctorStats?.rating || 0,
  };
  const confirmedCount = doctorVisibleAppointments.filter((apt) => {
    if (apt.status !== 'confirmed') return false;
    if ((apt as any).date && (apt as any).time) return !hasAppointmentTimePassed(apt as { date: string; time: string });
    return true;
  }).length;
  const closedCount = doctorVisibleAppointments.filter((apt) =>
    (apt.status === 'cancelled' || apt.status === 'no_show') &&
    !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
  ).length;
  const walletAvailableBalance = Number(doctorWallet?.available_balance || 0);
  const walletPendingBalance = Number(doctorWallet?.pending_balance || 0);
  const pendingWalletEntries = (walletTransactions as WalletTransactionRow[]).filter((tx) => tx.status === 'pending').length;
  const availableWalletEntries = (walletTransactions as WalletTransactionRow[]).filter((tx) => tx.status === 'available').length;
  const withdrawalAmountNumber = Number(withdrawalAmount || 0);
  const canRequestWithdrawal =
    withdrawalAmountNumber > 0 &&
    withdrawalAmountNumber <= walletAvailableBalance;

  const filteredAppointmentsByStatus = useMemo(() => {
    if (!doctorVisibleAppointments) return [];
    
    let filtered;
    switch (appointmentStatusFilter) {
      case 'pending_approval':
        filtered = doctorVisibleAppointments.filter(
          (apt) => apt.status === 'pending_approval' || isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
        );
        break;
      case 'confirmed':
        filtered = doctorVisibleAppointments.filter(
          (apt) =>
            (apt.status === 'confirmed' || apt.status === 'in_progress') &&
            !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
        );
        break;
      case 'in_progress':
        filtered = doctorVisibleAppointments.filter((apt) => apt.status === 'in_progress');
        break;
      case 'completed':
        filtered = doctorVisibleAppointments.filter(apt => apt.status === 'completed');
        break;
      case 'cancelled':
        filtered = doctorVisibleAppointments.filter(apt => apt.status === 'cancelled');
        break;
      case 'no_show':
        filtered = doctorVisibleAppointments.filter(
          (apt) => apt.status === 'no_show' && !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
        );
        break;
      case 'closed':
        filtered = doctorVisibleAppointments.filter(
          (apt) =>
            (apt.status === 'cancelled' || apt.status === 'no_show') &&
            !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
        );
        break;
      case 'all':
      default:
        filtered = doctorVisibleAppointments;
    }
    
    // Sort: approval queue by created_at desc, active by date asc, others by latest first.
    return filtered.sort((a, b) => {
      if (appointmentStatusFilter === 'pending_approval') {
        const aRescheduleAt = (a as { reschedule_requested_at?: string | null }).reschedule_requested_at;
        const bRescheduleAt = (b as { reschedule_requested_at?: string | null }).reschedule_requested_at;
        const aTs = new Date(aRescheduleAt || a.created_at).getTime();
        const bTs = new Date(bRescheduleAt || b.created_at).getTime();
        return bTs - aTs;
      }

      if (appointmentStatusFilter === 'confirmed') {
        const nowTs = Date.now();
        const dateTimeA = new Date(`${a.date}T${a.time}`).getTime();
        const dateTimeB = new Date(`${b.date}T${b.time}`).getTime();
        const aIsPast = dateTimeA < nowTs;
        const bIsPast = dateTimeB < nowTs;

        if (aIsPast !== bIsPast) {
          return aIsPast ? 1 : -1;
        }

        return aIsPast ? (dateTimeB - dateTimeA) : (dateTimeA - dateTimeB);
      }

      if (appointmentStatusFilter === 'in_progress') {
        const dateTimeA = new Date(`${a.date}T${a.time}`).getTime();
        const dateTimeB = new Date(`${b.date}T${b.time}`).getTime();
        return dateTimeA - dateTimeB;
      }

      const dateTimeA = new Date(`${a.date}T${a.time}`).getTime();
      const dateTimeB = new Date(`${b.date}T${b.time}`).getTime();
      return dateTimeB - dateTimeA;
    });
  }, [doctorVisibleAppointments, appointmentStatusFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileAppointmentsLayout(event.matches);
    };

    setIsMobileAppointmentsLayout(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (appointmentStatusFilter === 'in_progress') {
      setAppointmentStatusFilter('confirmed');
    }
  }, [appointmentStatusFilter]);

  useEffect(() => {
    if (appointmentViewMode !== 'calendar') return;

    if (filteredAppointmentsByStatus.length === 0) {
      setSelectedCalendarDate(null);
      return;
    }

    setSelectedCalendarDate(getCalendarAppointmentDate(filteredAppointmentsByStatus[0] as {
      date: string;
      reschedule_request_status?: string | null;
      reschedule_proposed_date?: string | null;
    }));
  }, [appointmentStatusFilter, appointmentViewMode, filteredAppointmentsByStatus]);

  const appointmentsByDate = useMemo(() => {
    return filteredAppointmentsByStatus.reduce<Record<string, any[]>>((acc, apt) => {
      const dateKey = getCalendarAppointmentDate(apt as {
        date: string;
        reschedule_request_status?: string | null;
        reschedule_proposed_date?: string | null;
      });
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(apt);
      return acc;
    }, {});
  }, [filteredAppointmentsByStatus]);

  const calendarStatusLegend = useMemo(() => {
    const seen = new Set<string>();
    return filteredAppointmentsByStatus
      .filter((apt) => {
        if (seen.has(apt.status)) return false;
        seen.add(apt.status);
        return true;
      })
      .map((apt) => apt.status);
  }, [filteredAppointmentsByStatus]);
  const hasPastConfirmedInCalendar = useMemo(
    () => filteredAppointmentsByStatus.some((apt) => apt.status === 'confirmed' && hasAppointmentTimePassed(apt)),
    [filteredAppointmentsByStatus],
  );
  const hasPendingRescheduleInCalendar = useMemo(
    () => filteredAppointmentsByStatus.some((apt) => isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null })),
    [filteredAppointmentsByStatus],
  );

  const calendarDialogDayAppointments = useMemo(() => {
    if (!calendarDialogDate) return [];
    return [...(appointmentsByDate[calendarDialogDate] || [])].sort((a, b) => {
      const timeA = getCalendarAppointmentTime(a as {
        time: string;
        reschedule_request_status?: string | null;
        reschedule_proposed_time?: string | null;
      });
      const timeB = getCalendarAppointmentTime(b as {
        time: string;
        reschedule_request_status?: string | null;
        reschedule_proposed_time?: string | null;
      });
      return timeA.localeCompare(timeB);
    });
  }, [appointmentsByDate, calendarDialogDate]);

  const calendarFocusedAppointment = useMemo(() => {
    if (!calendarFocusedAppointmentId) return null;
    return filteredAppointmentsByStatus.find((apt) => apt.id === calendarFocusedAppointmentId) || null;
  }, [calendarFocusedAppointmentId, filteredAppointmentsByStatus]);

  const normalizeTime = (time: string) => {
    const trimmed = time.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;

    const twelveHour = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (twelveHour) {
      const hourValue = parseInt(twelveHour[1], 10);
      const minuteValue = twelveHour[2];
      const period = twelveHour[3].toUpperCase();
      const normalizedHour = period === 'PM' ? (hourValue % 12) + 12 : hourValue % 12;
      return `${String(normalizedHour).padStart(2, '0')}:${minuteValue}:00`;
    }

    return '00:00:00';
  };

  const fullCalendarEvents = useMemo<EventInput[]>(() => {
    return filteredAppointmentsByStatus.map((apt) => {
      const pendingReschedule = isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null });
      const isPastConfirmed = apt.status === 'confirmed' && hasAppointmentTimePassed(apt);
      const eventDate = getCalendarAppointmentDate(apt as {
        date: string;
        reschedule_request_status?: string | null;
        reschedule_proposed_date?: string | null;
      });
      const eventTime = getCalendarAppointmentTime(apt as {
        time: string;
        reschedule_request_status?: string | null;
        reschedule_proposed_time?: string | null;
      });
      const styles = pendingReschedule
        ? { dot: '#2563eb', bg: '#2563eb', text: '#ffffff' }
        : isPastConfirmed
        ? PAST_CONFIRMED_CALENDAR_STYLE
        : (APPOINTMENT_STATUS_CALENDAR_STYLES[apt.status as keyof typeof APPOINTMENT_STATUS_CALENDAR_STYLES] || APPOINTMENT_STATUS_CALENDAR_STYLES.default);
      return {
        id: apt.id,
        title: apt.patient_name || 'Unknown Patient',
        start: `${eventDate}T${normalizeTime(eventTime)}`,
        allDay: false,
        backgroundColor: styles.bg,
        borderColor: styles.dot,
        textColor: styles.text,
        extendedProps: {
          status: apt.status,
          appointmentDate: eventDate,
          isPastConfirmed,
          isPendingReschedule: pendingReschedule,
        }
      };
    });
  }, [filteredAppointmentsByStatus]);

  const calendarRenderKey = `${appointmentStatusFilter}-${isMobileAppointmentsLayout ? 'mobile' : 'desktop'}-${filteredAppointmentsByStatus[0]
    ? getCalendarAppointmentDate(filteredAppointmentsByStatus[0] as {
      date: string;
      reschedule_request_status?: string | null;
      reschedule_proposed_date?: string | null;
    })
    : 'empty'}`;

  const handleCalendarDayClick = (dateStr: string) => {
    const dayKey = dateStr.slice(0, 10);
    setSelectedCalendarDate(dayKey);
    setCalendarDialogDate(dayKey);
    setCalendarEventDialogOpen(false);
    setCalendarDayDialogOpen(true);
  };

  const handleCalendarEventClick = (arg: EventClickArg) => {
    const eventDate = arg.event.start ? formatDateKey(arg.event.start) : arg.event.startStr.slice(0, 10);
    setSelectedCalendarDate(eventDate);
    setCalendarDialogDate(eventDate);
    setCalendarDayDialogOpen(false);
    setCalendarFocusedAppointmentId(arg.event.id || null);
    setCalendarEventDialogOpen(true);
  };

  const handleCalendarDayCellMount = (arg: DayCellMountArg) => {
    const dateLabel = formatDate(arg.date, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    arg.el.setAttribute('title', `View appointments for ${dateLabel}`);
    arg.el.style.cursor = 'pointer';
  };

  const handleCalendarEventMount = (arg: EventMountArg) => {
    const eventTime = arg.event.start
      ? formatTime(arg.event.start, { hour: 'numeric', minute: '2-digit' })
      : '';
    const eventStatus = String(arg.event.extendedProps.status || '').trim();
    const isPastConfirmed = Boolean(arg.event.extendedProps.isPastConfirmed);
    const isPendingReschedule = Boolean(arg.event.extendedProps.isPendingReschedule);
    const eventStatusLabel = eventStatus ? formatAppointmentStatusLabel(eventStatus) : 'Appointment';
    const pendingRescheduleSuffix = t('doctorPortal.calendar.reschedulePendingSuffix', ' (Reschedule Pending)');
    const timePassedSuffix = t('doctorPortal.calendar.timePassedSuffix', ' (Time Passed)');
    arg.el.setAttribute(
      'title',
      `${arg.event.title} • ${eventTime} • ${eventStatusLabel}${isPendingReschedule ? pendingRescheduleSuffix : ''}${isPastConfirmed ? timePassedSuffix : ''}`,
    );
    if (isPastConfirmed) {
      arg.el.style.boxShadow = 'inset 0 0 0 1px rgba(120, 53, 15, 0.35)';
      arg.el.style.opacity = '0.9';
    }
    arg.el.style.cursor = 'pointer';
  };

  const renderDoctorAppointmentsCalendar = (emptyTitle: string, emptyDescription?: string) => {
    if (filteredAppointmentsByStatus.length === 0) {
      return (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{emptyTitle}</p>
          {emptyDescription && (
            <p className="text-sm text-muted-foreground mt-2">{emptyDescription}</p>
          )}
        </div>
      );
    }

    const calendarDialogDateLabel = calendarDialogDate
      ? formatDate(new Date(`${calendarDialogDate}T00:00:00`), {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
      : null;

    return (
      <div className="space-y-6">
        {calendarStatusLegend.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {calendarStatusLegend.map((status) => {
              const styles = APPOINTMENT_STATUS_CALENDAR_STYLES[status as keyof typeof APPOINTMENT_STATUS_CALENDAR_STYLES] || APPOINTMENT_STATUS_CALENDAR_STYLES.default;
              return (
                <div key={status} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: styles.dot }} />
                  <span>{formatAppointmentStatusLabel(status)}</span>
                </div>
              );
            })}
            {hasPastConfirmedInCalendar && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PAST_CONFIRMED_CALENDAR_STYLE.dot }} />
                <span>{t('doctorPortal.calendar.confirmedTimePassed', 'Confirmed (Time Passed)')}</span>
              </div>
            )}
            {hasPendingRescheduleInCalendar && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#2563eb' }} />
                <span>{t('doctorPortal.calendar.reschedulePending', 'Reschedule Pending')}</span>
              </div>
            )}
          </div>
        )}

        <div className="patient-portal-calendar rounded-xl border border-border bg-card p-2 md:p-4">
          <FullCalendar
            key={calendarRenderKey}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={selectedCalendarDate || (
              filteredAppointmentsByStatus[0]
                ? getCalendarAppointmentDate(filteredAppointmentsByStatus[0] as {
                  date: string;
                  reschedule_request_status?: string | null;
                  reschedule_proposed_date?: string | null;
                })
                : undefined
            )}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            buttonText={{
              today: t('common.today', 'Today'),
              month: t('patientPortal.calendar.monthShort', 'Month'),
              week: t('patientPortal.calendar.weekShort', 'Week'),
              day: t('patientPortal.calendar.dayShort', 'Day'),
            }}
            events={fullCalendarEvents}
            dayMaxEvents={isMobileAppointmentsLayout ? 2 : 3}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
            slotMinTime="06:00:00"
            slotMaxTime="23:00:00"
            slotDuration="00:30:00"
            allDaySlot={false}
            nowIndicator
            stickyHeaderDates
            height="auto"
            expandRows
            dayCellDidMount={handleCalendarDayCellMount}
            eventDidMount={handleCalendarEventMount}
            dateClick={(arg: DateClickArg) => {
              handleCalendarDayClick(arg.dateStr);
            }}
            eventClick={(arg: EventClickArg) => {
              handleCalendarEventClick(arg);
            }}
          />
        </div>

        <Dialog open={calendarDayDialogOpen} onOpenChange={setCalendarDayDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {calendarDialogDateLabel
                  ? `${t('common.appointments', 'Appointments')} ${calendarDialogDateLabel}`
                  : t('common.appointments', 'Appointments')}
              </DialogTitle>
              <DialogDescription>
                {t('doctorPortal.calendar.reviewAppointmentsForDay', 'Review appointments for the selected day.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {calendarDialogDayAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('doctorPortal.empty.noAppointmentsFound', 'No appointments found')}
                </p>
              ) : (
                calendarDialogDayAppointments.map((apt) => (
                  <div key={apt.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{formatClockTime(apt.time)}</span>
                        {getStatusBadge(apt.status)}
                        {getRescheduleRequestBadge(apt as {
                          reschedule_request_status?: string | null;
                          reschedule_requested_by?: string | null;
                        })}
                      </div>
                      <p className="text-sm font-semibold mt-1 truncate">
                        {apt.patient_name || t('doctorPortal.defaults.unknownPatient', 'Unknown Patient')}
                      </p>
                      {isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }) && (
                        <p className="text-xs text-blue-700 mt-1 truncate">
                          {t('doctorPortal.calendar.proposedSlotPrefix', 'Proposed')}:{' '}
                          {new Date(
                            String((apt as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || apt.date)
                          ).toLocaleDateString()} {t('common.at', 'at')} {(apt as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || apt.time}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 truncate">{apt.notes || t('doctorPortal.notes.none', 'No notes')}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCalendarFocusedAppointmentId(apt.id);
                        setCalendarDayDialogOpen(false);
                        setCalendarEventDialogOpen(true);
                      }}
                    >
                      {t('common.view', 'View')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={calendarEventDialogOpen && !!calendarFocusedAppointment}
          onOpenChange={(open) => {
            setCalendarEventDialogOpen(open);
            if (!open) setCalendarFocusedAppointmentId(null);
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{t('common.appointments', 'Appointments')}</DialogTitle>
              <DialogDescription>{t('doctorPortal.calendar.manageSelectedAppointment', 'Manage the selected appointment.')}</DialogDescription>
            </DialogHeader>
            {calendarFocusedAppointment && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
                  <p className="text-sm font-semibold">
                    {calendarFocusedAppointment.patient_name || t('doctorPortal.defaults.unknownPatient', 'Unknown Patient')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{formatDate(calendarFocusedAppointment.date)}</span>
                    <span>•</span>
                    <span>{formatClockTime(calendarFocusedAppointment.time)}</span>
                  </div>
                  <div>{getStatusBadge(calendarFocusedAppointment.status)}</div>
                  {getRescheduleRequestBadge(calendarFocusedAppointment as {
                    reschedule_request_status?: string | null;
                    reschedule_requested_by?: string | null;
                  })}
                  {isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) && (
                    <div className="rounded-md border border-blue-200 bg-blue-50/60 p-2 text-xs text-blue-900">
                      <p className="font-medium">{t('doctorPortal.calendar.proposedSlot', 'Proposed Slot')}</p>
                      <p>
                        {new Date(
                          String((calendarFocusedAppointment as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || calendarFocusedAppointment.date)
                        ).toLocaleDateString()}{' '}
                        {t('common.at', 'at')} {(calendarFocusedAppointment as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || calendarFocusedAppointment.time}
                      </p>
                    </div>
                  )}
                  {calendarFocusedAppointment.status === 'confirmed' && hasAppointmentTimePassed(calendarFocusedAppointment) && (
                    <p className="text-xs font-medium text-amber-700">
                      {t('doctorPortal.calendar.appointmentTimePassedHint', 'Appointment time passed. Keep this in confirmed until you mark no-show or complete follow-up.')}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{calendarFocusedAppointment.notes || t('doctorPortal.notes.noneProvided', 'No notes provided.')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {calendarFocusedAppointment.patient_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        handleViewPatientFolder(calendarFocusedAppointment);
                        setCalendarEventDialogOpen(false);
                      }}
                    >
                      {t('doctorPortal.actions.viewFolder', 'View Folder')}
                    </Button>
                  )}
                  {!isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    (calendarFocusedAppointment.status === 'confirmed' || calendarFocusedAppointment.status === 'in_progress') && (
                    <JoinConsultationButton
                      appointmentId={calendarFocusedAppointment.id}
                      participantName={calendarFocusedAppointment.patient_name || ''}
                      status={calendarFocusedAppointment.status}
                      variant="default"
                      size="sm"
                    />
                  )}
                  {!isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    (calendarFocusedAppointment.status === 'confirmed' || calendarFocusedAppointment.status === 'completed') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        openMessagesForAppointment(calendarFocusedAppointment);
                        setCalendarEventDialogOpen(false);
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {t('doctorPortal.actions.message', 'Message')}
                    </Button>
                  )}
                  {!isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    (calendarFocusedAppointment.status === 'confirmed' || calendarFocusedAppointment.status === 'in_progress') &&
                    hasAppointmentTimePassed(calendarFocusedAppointment) && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          openRescheduleDialog(calendarFocusedAppointment);
                          setCalendarEventDialogOpen(false);
                        }}
                      >
                        {t('doctorPortal.actions.reschedule', 'Reschedule')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30"
                        onClick={() => {
                          handleMarkNoShow(calendarFocusedAppointment.id);
                          setCalendarEventDialogOpen(false);
                        }}
                      >
                        {t('doctorPortal.actions.markNoShow', 'Mark No Show')}
                      </Button>
                    </>
                  )}
                  {!isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    calendarFocusedAppointment.status === 'pending_approval' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleApproveRequest(calendarFocusedAppointment);
                          setCalendarEventDialogOpen(false);
                        }}
                      >
                        {t('doctorPortal.actions.approve', 'Approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          handleDeclineRequest(calendarFocusedAppointment);
                          setCalendarEventDialogOpen(false);
                        }}
                      >
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </>
                  )}
                  {isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    isPatientRequestedReschedule(calendarFocusedAppointment as { reschedule_requested_by?: string | null }) && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleApproveRequest(calendarFocusedAppointment);
                          setCalendarEventDialogOpen(false);
                        }}
                      >
                        {t('doctorPortal.actions.approveReschedule', 'Approve Reschedule')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          handleDeclineRequest(calendarFocusedAppointment);
                          setCalendarEventDialogOpen(false);
                        }}
                      >
                        {t('doctorPortal.actions.declineRequest', 'Decline Request')}
                      </Button>
                    </>
                  )}
                  {isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    isDoctorRequestedReschedule(calendarFocusedAppointment as { reschedule_requested_by?: string | null }) && (
                    <Badge variant="secondary">{t('doctorPortal.badges.waitingPatientApproval', 'Waiting for patient approval')}</Badge>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // Derive patients list from appointments
  const patientsList = useMemo(() => {
    const patientsMap = new Map<string, any>();
    
    doctorVisibleAppointments.forEach(apt => {
      if (apt.patient_id && apt.patient_name) {
        if (!patientsMap.has(apt.patient_id)) {
          patientsMap.set(apt.patient_id, {
            id: apt.patient_id,
            name: apt.patient_name,
            age: apt.patient_age || t('specialists.defaults.notAvailable', 'N/A'),
            lastVisit: apt.date,
            appointments: [],
            latestAppointment: null as any
          });
        }
        const patient = patientsMap.get(apt.patient_id);
        patient.appointments.push({
          date: apt.date,
          time: apt.time,
          status: apt.status
        });

        const appointmentDateTime = new Date(`${apt.date}T${apt.time}`).getTime();
        const latestDateTime = patient.latestAppointment
          ? new Date(`${patient.latestAppointment.date}T${patient.latestAppointment.time}`).getTime()
          : 0;
        if (!patient.latestAppointment || appointmentDateTime > latestDateTime) {
          patient.latestAppointment = apt;
          patient.lastVisit = apt.date;
        }
      }
    });

    // Sort appointments for each patient to get the latest one
    patientsMap.forEach(patient => {
      patient.appointments.sort((a: any, b: any) => {
        const dateA = new Date(`${a.date}T${a.time}`).getTime();
        const dateB = new Date(`${b.date}T${b.time}`).getTime();
        return dateB - dateA;
      });
	      if (patient.appointments.length > 0 && !patient.lastVisit) {
	        patient.lastVisit = patient.appointments[0].date;
	      }
	    });

    return Array.from(patientsMap.values());
  }, [doctorVisibleAppointments]);

  const displayName = doctorRegistration?.full_name ?? user?.user_metadata?.full_name ?? user?.email ?? 'Doctor';
  const profilePicture = doctorRegistration?.profile_picture_url ?? user?.user_metadata?.avatar ?? '';
  const displayInitials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handlePhotoUpload = async (file: File) => {
    if (!user) return;
    setIsUploadingPhoto(true);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}.${fileExt}`;
      const filePath = `${user.id}/profile-pictures/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('doctor-files')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('doctor-files')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('doctor_registrations')
        .update({ profile_picture_url: urlData.publicUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      const { error: doctorAvatarError } = await supabase
        .from('doctors')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', user.id);

      if (doctorAvatarError) {
        console.warn('Failed to sync doctor avatar to public profile:', doctorAvatarError);
      }

      queryClient.invalidateQueries({ queryKey: ['doctor-registration'] });
      toast({ title: 'Success', description: 'Profile picture updated successfully!' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update profile picture.' });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleAddBioTranslation = () => {
    const normalizedCode = normalizeBioLanguageCode(newBioLanguageCode);
    if (!normalizedCode || bioTranslations[normalizedCode]) return;

    setBioTranslations((prev) => {
      const next = {
        ...prev,
        [normalizedCode]: '',
      };
      const nextAvailableCode =
        PROFILE_BIO_TRANSLATION_LANGUAGES.find(
          (languageOption) => !next[languageOption.code]
        )?.code || '';
      setNewBioLanguageCode(nextAvailableCode);
      return next;
    });
  };

  const handleRemoveBioTranslation = (languageCode: string) => {
    setBioTranslations((prev) => {
      const next = { ...prev };
      delete next[languageCode];
      const nextAvailableCode =
        PROFILE_BIO_TRANSLATION_LANGUAGES.find(
          (languageOption) => !next[languageOption.code]
        )?.code || '';
      setNewBioLanguageCode((current) => current || nextAvailableCode);
      return next;
    });
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setIsSavingProfile(true);
    
    try {
      const bioTranslationsPayload = Object.entries(bioTranslations).reduce<Record<string, string>>(
        (acc, [code, value]) => {
          const normalizedCode = normalizeBioLanguageCode(code);
          if (!normalizedCode || normalizedCode === 'en') return acc;
          const trimmedValue = String(value || '').trim();
          if (!trimmedValue) return acc;
          acc[normalizedCode] = trimmedValue;
          return acc;
        },
        {}
      );
      const legacyBioColumnPayload = PROFILE_BIO_TRANSLATION_LANGUAGES.reduce<Record<string, string | null>>(
        (acc, languageOption) => {
          const normalizedCode = normalizeBioLanguageCode(languageOption.code);
          const legacyColumnKey = `bio_${normalizedCode}`;
          acc[legacyColumnKey] = bioTranslationsPayload[normalizedCode] || null;
          return acc;
        },
        {}
      );

      const normalizedConsultationLanguages = Array.from(
        new Set(
          selectedConsultationLanguages
            .map((item) => normalizeConsultationLanguage(item))
            .filter(Boolean)
        )
      );

      if (normalizedConsultationLanguages.length === 0) {
        toast({
          title: t('auth.toast.consultationLanguagesRequiredTitle', 'Consultation languages required'),
          description: t(
            'auth.toast.consultationLanguagesRequiredDescription',
            'Please select at least one consultation language.'
          ),
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('doctor_registrations')
        .update({
          full_name: profileFormData.fullName.trim(),
          email: profileFormData.email.trim(),
          phone_number: profileFormData.phone.trim(),
          specialty: profileFormData.specialty.trim(),
          experience: profileFormData.experience.trim(),
          bio: profileFormData.bio.trim(),
          ...legacyBioColumnPayload,
          bio_translations: bioTranslationsPayload,
          preferred_consultation_languages: normalizedConsultationLanguages,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['doctor-registration'] });
      queryClient.invalidateQueries({ queryKey: ['doctors-discovery'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('common.profileUpdated', 'Profile updated successfully!'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('common.profileUpdateFailed', 'Failed to update profile.'),
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const toggleConsultationLanguage = (language: string) => {
    setSelectedConsultationLanguages((prev) =>
      prev.includes(language)
        ? prev.filter((item) => item !== language)
        : [...prev, language]
    );
  };

  const handleChangePassword = async () => {
    const newPassword = passwordFormData.newPassword.trim();
    const confirmPassword = passwordFormData.confirmPassword.trim();

    if (!newPassword || !confirmPassword) {
      toast({
        title: t('common.missingFields', 'Missing fields'),
        description: t('common.enterAndConfirmNewPassword', 'Enter and confirm your new password.'),
        variant: 'destructive',
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: t('common.weakPassword', 'Weak password'),
        description: t('common.passwordMinimumLength', 'Password must be at least 8 characters.'),
        variant: 'destructive',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t('common.passwordsDoNotMatch', 'Passwords do not match'), variant: 'destructive' });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordFormData({ newPassword: '', confirmPassword: '' });
      toast({
        title: t('common.success', 'Success'),
        description: t('common.passwordChanged', 'Password changed successfully.'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error', 'Error'),
        description: error?.message || t('common.passwordChangeFailed', 'Failed to change password.'),
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleAvailabilityToggle = async (newAvailability: boolean) => {
    if (!user?.id) return;
    
    try {
      // Update the doctors table is_active field
      const { error: doctorError } = await supabase
        .from('doctors')
        .update({ is_active: newAvailability })
        .eq('id', user.id);

      if (doctorError) {
        console.error('Error updating availability:', doctorError);
        throw doctorError;
      }

      // Also update all doctor schedules to match availability
      const { error: scheduleError } = await supabase
        .from('doctor_schedules')
        .update({ is_available: newAvailability })
        .eq('doctor_id', user.id);

      if (scheduleError) {
        console.error('Error updating schedules:', scheduleError);
        throw scheduleError;
      }

      // Update local state
      setIsAvailable(newAvailability);
      
      // Invalidate query cache to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-availability', user.id] });
      queryClient.invalidateQueries({ queryKey: ['doctors-discovery'] });
      
      toast({
        title: t('common.success', 'Success'),
        description: newAvailability
          ? t('scheduleEditor.toast.nowAvailable', 'You are now available for consultations')
          : t('scheduleEditor.toast.nowUnavailable', 'You are now unavailable for new consultations'),
      });
    } catch (error) {
      console.error('Failed to update availability:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('scheduleEditor.toast.failedAvailabilityStatus', 'Failed to update availability status. Please try again.'),
        variant: 'destructive',
      });
      // Revert the toggle if update failed
      setIsAvailable(!newAvailability);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_payment':
        return <Badge className="bg-warning/10 text-warning border-warning/20">{t('appointmentStatus.pendingPayment', 'Pending Payment')}</Badge>;
      case 'pending_approval':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-300">{t('appointmentStatus.pendingApproval', 'Pending Approval')}</Badge>;
      case 'confirmed':
        return <Badge className="bg-success/10 text-success border-success/20">{t('appointmentStatus.confirmed', 'Confirmed')}</Badge>;
      case 'in_progress':
        return <Badge className="bg-primary/10 text-primary border-primary/20">{t('appointmentStatus.inProgress', 'In Progress')}</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">{t('appointmentStatus.completed', 'Completed')}</Badge>;
      case 'cancelled':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-300">{t('appointmentStatus.cancelled', 'Cancelled')}</Badge>;
      case 'no_show':
        return <Badge variant="destructive">{t('appointmentStatus.noShow', 'No Show')}</Badge>;
      default:
        return <Badge variant="outline">{formatAppointmentStatusLabel(status)}</Badge>;
    }
  };

  const getRescheduleRequestBadge = (apt: {
    reschedule_request_status?: string | null;
    reschedule_requested_by?: string | null;
  }) => {
    if (!isPendingRescheduleRequest(apt)) return null;
    if (isPatientRequestedReschedule(apt)) {
      return <Badge className="bg-blue-100 text-blue-700 border-blue-300">{t('doctorPortal.badges.patientRescheduleRequest', 'Patient Reschedule Request')}</Badge>;
    }
    return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300">{t('doctorPortal.badges.doctorRescheduleRequest', 'Doctor Reschedule Request')}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">{t('doctorPortal.priority.urgent', 'Urgent')}</Badge>;
      case 'normal':
        return <Badge variant="outline">{t('doctorPortal.priority.normal', 'Normal')}</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const getPresenceIndicator = (patientId: string) => {
    const status = patientPresenceMap[patientId] || 'offline';
    const colors = {
      online: 'bg-green-500',
      away: 'bg-amber-500',
      offline: 'bg-gray-400'
    };
    return <span className={`inline-block w-3 h-3 rounded-full ${colors[status]} ring-2 ring-white`} title={status} />;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleInstallApp = async () => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/i.test(ua);
    const isInAppBrowser = /(FBAN|FBAV|Instagram|Line|Twitter|wv)/i.test(ua);
    if (isIOS || isInAppBrowser) {
      navigate('/install');
      return;
    }

    const result = await promptInstall();
    if (result === 'accepted') {
      toast({ title: 'Installed', description: 'MyEdoctor has been installed successfully.' });
      return;
    }
    if (result === 'dismissed') {
      toast({ title: 'Install cancelled', description: 'You can install the app any time from this button.' });
      return;
    }
    if (result === 'already_installed') return;
    navigate('/install');
  };

  const formatNaira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

  const submitWithdrawalRequest = () => {
    if (!canRequestWithdrawal) {
      toast({
        title: 'Invalid amount',
        description: 'Enter an amount within your available balance.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Withdrawal queue coming soon',
      description: 'Your request flow is staged in UI. Backend payout processing will be enabled next.',
    });
    setWithdrawalDialogOpen(false);
    setWithdrawalAmount('');
    setWithdrawalNarration('');
  };

  const appointmentViewToggleButtonBaseClass = 'h-8 flex-1 sm:flex-none gap-1';
  const appointmentStatusTriggerClass = 'relative h-10 w-full border border-transparent px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-background/70 sm:text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border';

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-2 sm:px-4">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <Link to="/" className="flex items-center gap-2">
              <img src={logoImage} alt="MyE-Doctor Logo" className="h-10 w-auto" />
              <div className="flex flex-col">
                <span className="text-xl font-bold leading-tight">
                  MyE-<span className="text-primary">Doctor</span>
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight">Powered by HealthLink</span>
              </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-4">
              <Link to="/install" className="hidden md:block">
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                  {t('doctorPortal.downloadApp', 'Download App')}
                </Button>
              </Link>

              {/* Availability Toggle */}
              <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-muted">
                <span className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className="hidden sm:inline text-sm font-medium">
                  {isAvailable
                    ? t('doctorPortal.available', 'Available')
                    : t('doctorPortal.unavailable', 'Unavailable')}
                </span>
                <Switch
                  checked={isAvailable}
                  onCheckedChange={handleAvailabilityToggle}
                  className="ml-1"
                />
              </div>

              {!isPwaInstalled && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden md:inline-flex"
                    onClick={handleInstallApp}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t('common.installApp', 'Install App')}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={handleInstallApp}
                    aria-label="Install app"
                  >
                    <Download className="w-5 h-5" />
                  </Button>
                </>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => setActiveTab(unreadReviewsCount > 0 ? 'reviews' : 'appointments')}
              >
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[10px] text-accent-foreground rounded-full flex items-center justify-center">
                  {formatNumber(stats.pendingRequests + unreadReviewsCount)}
                </span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hidden lg:flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                    <Avatar className="w-9 h-9 flex-shrink-0">
                      <AvatarImage src={profilePicture} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">{displayInitials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 hidden sm:block text-left">
                      <p className="text-sm font-medium truncate">{role === 'doctor' ? `Dr. ${displayName}` : displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {doctorRegistration?.specialty || t('specialists.defaults.generalPractice', 'General Practice')}
                      </p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => {
                      setActiveTab('settings');
                      setSidebarOpen(false);
                    }}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    {t('common.profileSettings', 'Profile Settings')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('common.signOut', 'Sign Out')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="hidden lg:block">
                <LanguageSelector />
              </div>

              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-8">
          {/* Sidebar */}
          <aside className={`lg:col-span-1 ${sidebarOpen ? 'block' : 'hidden lg:block'} fixed lg:static inset-0 lg:inset-auto top-16 z-40 bg-background lg:bg-transparent p-2 lg:p-0`}>
            <Card className="lg:sticky lg:top-24 rounded-lg">
              <CardContent className="p-3 sm:p-4">
                {/* User Profile Section - Visible on mobile when sidebar is open */}
                <div className="lg:hidden mb-4 pb-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={profilePicture} />
                      <AvatarFallback className="bg-primary text-primary-foreground">{displayInitials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{role === 'doctor' ? `Dr. ${displayName}` : displayName}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {doctorRegistration?.specialty || t('specialists.defaults.generalPractice', 'General Practice')}
                      </p>
                    </div>
                  </div>
                </div>

                <nav className="space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto lg:max-h-none">
                  <div className="lg:hidden px-3 pb-2">
                    <LanguageSelector />
                  </div>
                  {[
                    { id: 'overview', label: t('common.dashboard', 'Dashboard'), icon: BarChart3 },
                    { id: 'appointments', label: t('common.appointments', 'Appointments'), icon: Calendar, badge: stats.pendingRequests },
                    { id: 'patients', label: t('doctorPortal.menu.myPatients', 'My Patients'), icon: Users },
                    { id: 'availability', label: t('doctorPortal.menu.availability', 'Availability'), icon: Clock },
                    { id: 'earnings', label: t('doctorPortal.menu.earnings', 'Earnings'), icon: Banknote },
                    {
                      id: 'reviews',
                      label: t('doctorPortal.menu.reviews', 'Reviews'),
                      icon: Star,
                      badge: unreadReviewsCount > 0 ? (unreadReviewsCount > 99 ? `${formatNumber(99)}+` : formatNumber(unreadReviewsCount)) : undefined,
                      badgeTone: 'danger' as const
                    },
                    {
                      id: 'messages',
                      label: t('common.messages', 'Messages'),
                      icon: MessageSquare,
                      badge: unreadMessagesCount > 0 ? (unreadMessagesCount > 99 ? `${formatNumber(99)}+` : formatNumber(unreadMessagesCount)) : undefined,
                      badgeTone: 'danger' as const
                    },
                    { id: 'settings', label: t('common.settings', 'Settings'), icon: Settings },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.id === 'messages' && unreadMessagesCount > 0) {
                          setMessagesJumpToUnreadSignal(Date.now());
                        }
                        setActiveTab(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeTab === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="w-5 h-5" />
                        {item.label}
                      </div>
                      {item.badge && (
                        <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${activeTab === item.id
                          ? (item.badgeTone === 'danger' ? 'bg-destructive text-destructive-foreground' : 'bg-primary-foreground text-primary')
                          : (item.badgeTone === 'danger' ? 'bg-destructive text-destructive-foreground' : 'bg-accent text-accent-foreground')
                          }`}>
                          {typeof item.badge === 'number' ? formatNumber(item.badge) : item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>

                <div className="mt-6 pt-6 border-t border-border">
                  <Button 
                    onClick={handleSignOut}
                    variant="ghost" 
                    className="w-full justify-start gap-3 text-muted-foreground"
                  >
                    <LogOut className="w-5 h-5" />
                    {t('common.signOut', 'Sign Out')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3 space-y-4 md:space-y-6">
            {/* Welcome Banner - Only show for approved doctors */}
            {doctorRegistration?.verification_status === 'approved' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg md:rounded-2xl gradient-primary p-4 md:p-8 text-primary-foreground"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
                  <div>
                    <h1 className="text-lg sm:text-2xl md:text-3xl font-bold mb-1 md:mb-2">
                      {t('doctorPortal.welcomeBack', 'Welcome back')}, Dr {displayName.split(' ')[0]}! 👋
                    </h1>
                    <p className="text-xs sm:text-sm text-primary-foreground/80">
                      {t('doctorPortal.overview.consultationsNext24h', 'You have {count} consultations scheduled in the next 24 hours.')
                        .replace('{count}', formatNumber(upcomingSchedule.length))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {nextAppointment ? (
                        <>
                          <p className="text-sm text-primary-foreground/80">{t('doctorPortal.labels.nextAppointmentIn', 'Next appointment in')}</p>
                          <p className="text-2xl font-bold">{getTimeUntilNext()}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-primary-foreground/80">{t('doctorPortal.empty.noUpcomingShort', 'No upcoming')}</p>
                          <p className="text-2xl font-bold">{t('common.appointments', 'Appointments')}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm">
                  {t('doctorPortal.installBannerTextPrefix', 'Install our mobile app for faster access. Click')}{" "}
                  <span className="font-semibold">{t('doctorPortal.downloadApp', 'Download App')}</span>{" "}
                  {t('doctorPortal.installBannerTextSuffix', 'to install on your phone.')}
                </p>
                <Link to="/install">
                  <Button size="sm" className="gap-2">
                    <Download className="w-4 h-4" />
                    {t('doctorPortal.openInstallPage', 'Open Install Page')}
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Verification Status Banner */}
            {doctorRegistration?.verification_status === 'pending' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border-2 border-warning/50 bg-warning/10 p-4 md:p-6"
              >
                <div className="flex items-start gap-3">
                  <Clock className="w-6 h-6 text-warning flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-warning mb-1">{t('doctorPortal.verification.pendingTitle', 'Welcome to MyE-Doctor! 🎉')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('doctorPortal.verification.pendingBody', "Thank you for joining our platform! Your doctor account is currently under review by our medical director. We're excited to have you on board and will notify you once your credentials have been verified and your account is activated. This process typically takes 24-48 hours.")}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {doctorRegistration?.verification_status === 'approved' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border-2 border-success/50 bg-success/10 p-4 md:p-6"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-success flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-success mb-1">{t('doctorPortal.verification.approvedTitle', 'Account Approved ✓')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('doctorPortal.verification.approvedBody', 'Congratulations! Your doctor account has been verified and approved. You can now accept appointments and provide consultations to patients. Please go to the availability tab, and set your availability so that patients can discover you online.')}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {doctorRegistration?.verification_status === 'rejected' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border-2 border-destructive/50 bg-destructive/10 p-4 md:p-6"
              >
                <div className="flex items-start gap-3">
                  <XCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-destructive mb-1">{t('doctorPortal.verification.rejectedTitle', 'Account Not Approved')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('doctorPortal.verification.rejectedBody', 'Unfortunately, your doctor account application was not approved. Please contact our support team for more information or to resubmit your credentials.')}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              {[
                { label: 'Total Patients', value: statsLoading ? '...' : stats.totalPatients, icon: Users, color: 'bg-primary/10 text-primary' },
                { label: 'This Month', value: statsLoading ? '...' : stats.consultationsThisMonth, icon: Calendar, color: 'bg-success/10 text-success' },
                { label: 'Pending Approval', value: stats.pendingRequests, icon: Bell, color: 'bg-warning/10 text-warning' },
                { label: 'Rating', value: statsLoading ? '...' : (stats.rating > 0 ? stats.rating : 'N/A'), icon: Star, color: 'bg-accent/10 text-accent' },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{stat.label}</p>
                          <p className="text-2xl font-bold mt-1">{stat.value}</p>
                        </div>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                          <stat.icon className="w-6 h-6" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Tabs Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="hidden">
                <TabsTrigger value="overview">{t('common.overview', 'Overview')}</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Upcoming Schedule Preview */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-lg">{t('doctorPortal.headers.upcomingSchedule', 'Upcoming Schedule')}</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('appointments')}>
                        {t('common.viewAll', 'View All')} <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {upcomingSchedule.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">{t('doctorPortal.empty.noAppointmentsNext24h', 'No appointments scheduled for the next 24 hours')}</p>
                          </div>
                        ) : (
                          upcomingSchedule.slice(0, 4).map((apt) => (
                            <div key={apt.id} className={`flex items-center justify-between p-3 rounded-lg ${
                              (apt.status === 'confirmed' || apt.status === 'in_progress') ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'
                            }`}>
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <Avatar className="w-10 h-10">
                                    <AvatarImage src={(apt as any).patient_profile_picture || ''} />
                                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                      {apt.patient_name ? apt.patient_name.split(' ').map(n => n[0]).join('') : 'P'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="absolute bottom-0 right-0">
                                    {getPresenceIndicator(apt.patient_id)}
                                  </div>
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{apt.patient_name || 'Unknown Patient'}</p>
                                  <p className="text-xs text-muted-foreground">{formatClockTime(apt.time)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(apt.status)}
                                {(apt.status === 'confirmed' || apt.status === 'in_progress') && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openMessagesForAppointment(apt)}
                                  >
                                    <MessageSquare className="w-4 h-4 mr-2" />
                                    {t('doctorPortal.actions.message', 'Message')}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pending Approval Preview */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-lg">Pending Approval</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('appointments')}>
                        {t('common.viewAll', 'View All')} <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {pendingRequests.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">No pending-approval appointments</p>
                          </div>
                        ) : (
                          pendingRequests.map((request) => (
                            <div key={request.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{request.patient}</p>
                                  {getPriorityBadge(request.priority)}
                                  {request.isReschedulePending && (
                                    <Badge className="bg-blue-100 text-blue-700 border-blue-300">Reschedule</Badge>
                                  )}
                                </div>
                                {request.isReschedulePending && request.proposedDate && request.proposedTime && (
                                  <p className="text-xs text-blue-700 mt-1">
                                    Proposed: {new Date(request.proposedDate).toLocaleDateString()} at {request.proposedTime}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">{request.reason}</p>
                              </div>
                              <div className="flex gap-2">
                                {request.isReschedulePending && request.requestedBy === 'doctor' ? (
                                  <Badge variant="secondary">Waiting patient</Badge>
                                ) : (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-success" onClick={() => handleApproveRequest(request.appointment)}>
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeclineRequest(request.appointment)}>
                                      <XCircle className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Reviews */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-lg">{t('doctorPortal.headers.recentReviews', 'Recent Reviews')}</CardTitle>
                      <CardDescription>{t('doctorPortal.headers.recentReviewsDescription', 'What your patients are saying')}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-warning fill-warning" />
                      <span className="font-bold">{statsLoading ? '...' : (doctorStats?.rating || t('specialists.defaults.notAvailable', 'N/A'))}</span>
                      <span className="text-muted-foreground text-sm">({recentReviews.length} reviews)</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {reviewsLoading ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">{t('doctorPortal.loading.reviews', 'Loading reviews...')}</p>
                      </div>
                    ) : recentReviews.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">{t('doctorPortal.empty.noReviewsYet', 'No reviews yet')}</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-3 gap-4">
                        {recentReviews.map((review) => (
                          <div key={review.id} className="p-4 rounded-xl bg-muted/50">
                            <div className="flex items-center gap-1 mb-2">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-4 h-4 ${i < review.rating
                                    ? 'text-warning fill-warning'
                                    : 'text-muted'
                                    }`}
                                />
                              ))}
                            </div>
                            <p className="text-sm mb-2">"{review.comment}"</p>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{review.patient}</span>
                              <span>{formatDate(review.date)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Schedule Tab */}

              {/* Patients Tab */}

              {/* Unified Appointments Tab */}
              <TabsContent value="appointments" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <CardTitle>{t('common.appointments', 'Appointments')}</CardTitle>
                        <CardDescription>{t('doctorPortal.headers.manageAppointments', 'Manage all your appointments in one place')}</CardDescription>
                      </div>
                      <div className="inline-flex w-full sm:w-auto items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`${appointmentViewToggleButtonBaseClass} ${appointmentViewMode === 'list'
                            ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/70'
                            }`}
                          onClick={() => setAppointmentViewMode('list')}
                        >
                          <List className="w-4 h-4" />
                          {t('common.list', 'List')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`${appointmentViewToggleButtonBaseClass} ${appointmentViewMode === 'calendar'
                            ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/70'
                            }`}
                          onClick={() => setAppointmentViewMode('calendar')}
                        >
                          <Calendar className="w-4 h-4" />
                          {t('common.calendar', 'Calendar')}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Status Sub-tabs */}
                    <Tabs value={appointmentStatusFilter} onValueChange={(v) => setAppointmentStatusFilter(v as any)} className="w-full">
                      <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1 sm:grid-cols-3 lg:grid-cols-5">
                        <TabsTrigger value="pending_approval" className={appointmentStatusTriggerClass}>
                          {t('appointmentStatus.pending', 'Pending')}
                          {stats.pendingRequests > 0 && (
                            <Badge className="ml-1 h-5 min-w-5 rounded-full px-1 flex items-center justify-center text-[10px]">
                              {formatNumber(stats.pendingRequests)}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="confirmed" className={appointmentStatusTriggerClass}>
                          {t('appointmentStatus.confirmed', 'Confirmed')}
                          {confirmedCount > 0 && (
                            <Badge className="ml-1 h-5 min-w-5 rounded-full px-1 flex items-center justify-center text-[10px]">
                              {confirmedCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="completed" className={appointmentStatusTriggerClass}>{t('appointmentStatus.completed', 'Completed')}</TabsTrigger>
                        <TabsTrigger value="closed" className={appointmentStatusTriggerClass}>
                          {t('doctorPortal.appointments.closed', 'Closed')}
                          {closedCount > 0 && (
                            <Badge className="ml-1 h-5 min-w-5 rounded-full px-1 flex items-center justify-center text-[10px]">
                              {closedCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="all" className={appointmentStatusTriggerClass}>{t('common.all', 'All')}</TabsTrigger>
                      </TabsList>

                      {/* Pending Approval Tab Content */}
                      <TabsContent value="pending_approval" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderDoctorAppointmentsCalendar(
                            'No pending approvals',
                            'Includes new paid bookings and reschedule requests awaiting action.'
                          )
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No pending approvals</p>
                                <p className="text-sm text-muted-foreground mt-2">Includes new bookings and reschedule requests awaiting action.</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => {
                                const pendingReschedule = isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null });
                                const patientRequested = isPatientRequestedReschedule(apt as { reschedule_requested_by?: string | null });
                                return (
                                <div
                                  key={apt.id}
                                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${
                                    pendingReschedule ? 'border-blue-300/40 bg-blue-50/40' : 'border-warning/30 bg-warning/5'
                                  }`}
                                >
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="relative">
                                      <Avatar className="w-12 h-12">
                                        <AvatarImage src={(apt as any).patient_profile_picture} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                          {apt.patient_name?.split(' ').map(n => n[0]).join('') || 'P'}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="absolute bottom-0 right-0">
                                        {getPresenceIndicator(apt.patient_id)}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="font-semibold">{apt.patient_name || 'Unknown Patient'}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {formatDate(apt.date)} at {formatClockTime(apt.time)}
                                      </p>
                                      {pendingReschedule && (
                                        <p className="text-xs font-medium text-blue-700 mt-1">
                                          Proposed: {new Date(
                                            String((apt as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || apt.date)
                                          ).toLocaleDateString()} at {(apt as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || apt.time}
                                        </p>
                                      )}
                                      {getRescheduleRequestBadge(apt as {
                                        reschedule_request_status?: string | null;
                                        reschedule_requested_by?: string | null;
                                      })}
                                      <p className="text-sm text-muted-foreground mt-1">{apt.notes || 'No notes'}</p>
                                    </div>
                                  </div>
                                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                                    {apt.patient_id && (
                                      <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => handleViewPatientFolder(apt)}>
                                        {t('doctorPortal.actions.viewFolder', 'View Folder')}
                                      </Button>
                                    )}
                                    {pendingReschedule && patientRequested ? (
                                      <>
                                        <Button size="sm" className="w-full sm:w-auto" onClick={() => handleApproveRequest(apt)}>
                                          Approve Reschedule
                                        </Button>
                                        <Button size="sm" variant="destructive" className="w-full sm:w-auto" onClick={() => handleDeclineRequest(apt)}>
                                          Decline Request
                                        </Button>
                                      </>
                                    ) : pendingReschedule ? (
                                      <Badge variant="secondary">Waiting for patient approval</Badge>
                                    ) : (
                                      <>
                                        <Button size="sm" className="w-full sm:w-auto" onClick={() => handleApproveRequest(apt)}>
                                          Approve
                                        </Button>
                                        <Button size="sm" variant="destructive" className="w-full sm:w-auto" onClick={() => handleDeclineRequest(apt)}>
                                          Cancel
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )})
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Confirmed Tab Content */}
                      <TabsContent value="confirmed" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderDoctorAppointmentsCalendar('No confirmed or in-progress appointments')
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No confirmed or in-progress appointments</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => {
                                const isPastConfirmed = hasAppointmentTimePassed(apt);
                                return (
                                <div key={apt.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${
                                  isPastConfirmed ? 'border-amber-300/40 bg-amber-50/40' : 'border-primary/30 bg-primary/5'
                                }`}>
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="text-center w-20">
                                      <p className="text-sm font-semibold">{formatClockTime(apt.time)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</p>
                                    </div>
                                    <div className="w-px h-12 bg-border" />
                                    <div className="relative">
                                      <Avatar className="w-12 h-12">
                                        <AvatarImage src={(apt as any).patient_profile_picture} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                          {apt.patient_name?.split(' ').map(n => n[0]).join('') || 'P'}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="absolute bottom-0 right-0">
                                        {getPresenceIndicator(apt.patient_id)}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="font-semibold">{apt.patient_name || 'Unknown Patient'}</p>
                                      <p className="text-sm text-muted-foreground">{apt.patient_age ? `${apt.patient_age} years old` : 'Age N/A'}</p>
                                      {isPastConfirmed && (
                                        <p className="text-xs font-medium text-amber-700 mt-1">
                                          Appointment time passed. Mark no-show or reschedule via patient follow-up.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                                    <JoinConsultationButton
                                      appointmentId={apt.id}
                                      participantName={apt.patient_name || ''}
                                      status={apt.status}
                                      variant="default"
                                      size="sm"
                                      className="gradient-primary w-full sm:w-auto"
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full sm:w-auto"
                                      onClick={() => openMessagesForAppointment(apt)}
                                    >
                                      <MessageSquare className="w-4 h-4 mr-2" />
                                      {t('doctorPortal.actions.message', 'Message')}
                                    </Button>
                                    {apt.patient_id && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full sm:w-auto"
                                        onClick={() => handleViewPatientFolder(apt)}
                                      >
                                        {t('doctorPortal.actions.viewFolder', 'View Folder')}
                                      </Button>
                                    )}
                                    {isPastConfirmed && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full sm:w-auto"
                                        onClick={() => openRescheduleDialog(apt)}
                                      >
                                        Reschedule
                                      </Button>
                                    )}
                                    {isPastConfirmed && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full text-destructive border-destructive/30 sm:w-auto"
                                        onClick={() => handleMarkNoShow(apt.id)}
                                      >
                                        Mark No Show
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )})
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Closed Tab Content (Cancelled + No Show) */}
                      <TabsContent value="closed" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderDoctorAppointmentsCalendar(t('doctorPortal.empty.noClosedAppointments', 'No closed appointments'))
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">{t('doctorPortal.empty.noClosedAppointments', 'No closed appointments')}</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => {
                                const isNoShow = apt.status === 'no_show';
                                return (
                                  <div
                                    key={apt.id}
                                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${
                                      isNoShow ? 'border-destructive/30 bg-destructive/5' : 'border-muted-foreground/30 bg-muted/40'
                                    }`}
                                  >
                                    <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                      <div className="text-center w-20">
                                        <p className="text-sm font-semibold">{formatClockTime(apt.time)}</p>
                                        <p className="text-xs text-muted-foreground">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</p>
                                      </div>
                                      <div className="w-px h-12 bg-border" />
                                      <Avatar className="w-12 h-12">
                                        <AvatarImage src={(apt as any).patient_profile_picture} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                          {apt.patient_name?.split(' ').map(n => n[0]).join('') || 'P'}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="font-semibold">{apt.patient_name || 'Unknown Patient'}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {apt.patient_age
                                            ? `${apt.patient_age} ${t('doctorPortal.labels.yearsOld', 'years old')}`
                                            : t('doctorPortal.labels.ageNA', 'Age N/A')}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">{apt.notes || 'No notes'}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      {apt.patient_id && (
                                        <Button size="sm" variant="outline" onClick={() => handleViewPatientFolder(apt)}>
                                          {t('doctorPortal.actions.viewFolder', 'View Folder')}
                                        </Button>
                                      )}
                                      <Badge variant={isNoShow ? 'destructive' : 'secondary'}>
                                        {isNoShow ? t('appointmentStatus.noShow', 'No Show') : t('appointmentStatus.cancelled', 'Cancelled')}
                                      </Badge>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Completed Tab Content */}
                      <TabsContent value="completed" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderDoctorAppointmentsCalendar(t('doctorPortal.empty.noCompletedConsultations', 'No completed consultations'))
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">{t('doctorPortal.empty.noCompletedConsultations', 'No completed consultations')}</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => (
                                <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-success/30 bg-success/5">
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="text-center w-20">
                                      <p className="text-sm font-semibold">{formatClockTime(apt.time)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</p>
                                    </div>
                                    <div className="w-px h-12 bg-border" />
                                    <Avatar className="w-12 h-12">
                                      <AvatarImage src={(apt as any).patient_profile_picture} />
                                      <AvatarFallback className="bg-primary/10 text-primary">
                                        {apt.patient_name?.split(' ').map(n => n[0]).join('') || 'P'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-semibold">{apt.patient_name || 'Unknown Patient'}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {apt.patient_age
                                          ? `${apt.patient_age} ${t('doctorPortal.labels.yearsOld', 'years old')}`
                                          : t('doctorPortal.labels.ageNA', 'Age N/A')}
                                      </p>
                                      {(apt as any).rating && (
                                        <div className="flex items-center gap-1 mt-1">
                                          {[...Array(5)].map((_, i) => (
                                            <Star
                                              key={i}
                                              className={`w-3 h-3 ${i < (apt as any).rating ? 'text-warning fill-warning' : 'text-muted'}`}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openMessagesForAppointment(apt)}
                                    >
                                      <MessageSquare className="w-4 h-4 mr-2" />
                                      {t('doctorPortal.actions.message', 'Message')}
                                    </Button>
                                    {apt.patient_id && (
                                      <Button size="sm" variant="outline" onClick={() => handleViewPatientFolder(apt)}>
                                        {t('doctorPortal.actions.viewFolder', 'View Folder')}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* All Tab Content */}
                      <TabsContent value="all" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderDoctorAppointmentsCalendar(t('doctorPortal.empty.noAppointmentsFound', 'No appointments found'))
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">{t('doctorPortal.empty.noAppointmentsFound', 'No appointments found')}</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => {
                                const pendingReschedule = isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null });
                                const patientRequested = isPatientRequestedReschedule(apt as { reschedule_requested_by?: string | null });
                                return (
                                <div
                                  key={apt.id}
                                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${
                                    pendingReschedule ? 'border-blue-300/40 bg-blue-50/30' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="text-center w-20">
                                      <p className="text-sm font-semibold">{formatClockTime(apt.time)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</p>
                                    </div>
                                    <div className="w-px h-12 bg-border" />
                                    <Avatar className="w-12 h-12">
                                      <AvatarImage src={(apt as any).patient_profile_picture} />
                                      <AvatarFallback className="bg-primary/10 text-primary">
                                        {apt.patient_name?.split(' ').map(n => n[0]).join('') || 'P'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-semibold">{apt.patient_name || 'Unknown Patient'}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {apt.patient_age
                                          ? `${apt.patient_age} ${t('doctorPortal.labels.yearsOld', 'years old')}`
                                          : t('doctorPortal.labels.ageNA', 'Age N/A')}
                                      </p>
                                      <Badge className="mt-1" variant={
                                        apt.status === 'pending_approval' ? 'default' :
                                        apt.status === 'confirmed' ? 'outline' :
                                        apt.status === 'in_progress' ? 'secondary' :
                                        apt.status === 'completed' ? 'secondary' : 'destructive'
                                      }>
                                        {formatAppointmentStatusLabel(apt.status)}
                                      </Badge>
                                      <div className="mt-1">
                                        {getRescheduleRequestBadge(apt as {
                                          reschedule_request_status?: string | null;
                                          reschedule_requested_by?: string | null;
                                        })}
                                      </div>
                                      {pendingReschedule && (
                                        <p className="text-xs text-blue-700 mt-1">
                                          Proposed: {new Date(
                                            String((apt as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || apt.date)
                                          ).toLocaleDateString()} at {(apt as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || apt.time}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {!pendingReschedule && (apt.status === 'confirmed' || apt.status === 'in_progress') && (
                                    <JoinConsultationButton
                                      appointmentId={apt.id}
                                      participantName={apt.patient_name || ''}
                                      status={apt.status}
                                      variant="default"
                                      size="sm"
                                    />
                                  )}
                                  {!pendingReschedule && (apt.status === 'confirmed' || apt.status === 'completed') && (
                                    <Button size="sm" variant="outline" onClick={() => openMessagesForAppointment(apt)}>
                                      <MessageSquare className="w-4 h-4 mr-2" />
                                      {t('doctorPortal.actions.message', 'Message')}
                                    </Button>
                                  )}
                                  {apt.patient_id && (
                                    <Button size="sm" variant="outline" onClick={() => handleViewPatientFolder(apt)}>
                                      {t('doctorPortal.actions.viewFolder', 'View Folder')}
                                    </Button>
                                  )}
                                  {!pendingReschedule && apt.status === 'pending_approval' && (
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => handleApproveRequest(apt)}>
                                        Approve
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => handleDeclineRequest(apt)}>
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                  {!pendingReschedule && (apt.status === 'confirmed' || apt.status === 'in_progress') &&
                                    hasAppointmentTimePassed(apt) && (
                                      <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => openRescheduleDialog(apt)}>
                                          Reschedule
                                        </Button>
                                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleMarkNoShow(apt.id)}>
                                          Mark No Show
                                        </Button>
                                      </div>
                                    )}
                                  {pendingReschedule && patientRequested && (
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => handleApproveRequest(apt)}>
                                        Approve Reschedule
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => handleDeclineRequest(apt)}>
                                        Decline Request
                                      </Button>
                                    </div>
                                  )}
                                  {pendingReschedule && !patientRequested && (
                                    <Badge variant="secondary">Waiting for patient approval</Badge>
                                  )}
                                </div>
                              )})
                            )}
                          </>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="patients" className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>{t('doctorPortal.menu.myPatients', 'My Patients')}</CardTitle>
                      <CardDescription>{t('doctorPortal.headers.patientsDescription', 'All patients under your care')}</CardDescription>
                    </div>
                    <Input placeholder={t('doctorPortal.labels.searchPatients', 'Search patients...')} className="w-full sm:w-64" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {patientsList.length === 0 ? (
                        <div className="text-center py-12">
                          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">{t('doctorPortal.empty.noPatientsYet', 'No patients yet')}</p>
                          <p className="text-sm text-muted-foreground mt-2">{t('doctorPortal.empty.patientsWillAppear', 'Patients will appear here once they book appointments with you')}</p>
                        </div>
                      ) : (
                        patientsList.map((patient) => (
                          <div key={patient.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border hover:shadow-md transition-all">
                            <div className="flex items-center gap-4 mb-3 sm:mb-0">
                              <div className="relative">
                                <Avatar className="w-12 h-12">
                                  <AvatarImage src={(patient as any).profile_picture || ''} />
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {patient.name.split(' ').map(n => n[0]).join('')}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="absolute bottom-0 right-0">
                                  {getPresenceIndicator(patient.id)}
                                </div>
                              </div>
                              <div>
                                <p className="font-semibold">{patient.name}</p>
                                <p className="text-sm text-muted-foreground">{patient.age} {typeof patient.age === 'number' ? t('doctorPortal.labels.yearsOld', 'years old') : ''}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {t('doctorPortal.labels.lastVisit', 'Last visit')}: {formatDate(patient.lastVisit)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                              <div className="text-left sm:text-right mb-2 sm:mb-0">
                                <p className="text-xs text-muted-foreground">{t('doctorPortal.labels.totalAppointments', 'Total appointments')}</p>
                                <p className="text-sm font-medium">{formatNumber(patient.appointments.length)}</p>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full sm:w-auto"
                                  onClick={() => patient.latestAppointment && handleViewPatientFolder(patient.latestAppointment)}
                                  disabled={!patient.latestAppointment}
                                >
                                  {t('doctorPortal.actions.viewFolder', 'View Folder')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="w-full sm:w-auto"
                                  onClick={() => {
                                    if (patient.latestAppointment) {
                                      openMessagesForAppointment(patient.latestAppointment);
                                    }
                                  }}
                                  disabled={!patient.latestAppointment || !['confirmed', 'completed'].includes(String((patient.latestAppointment as { status?: string }).status || ''))}
                                >
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  {t('doctorPortal.actions.message', 'Message')}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>


              <TabsContent value="availability" className="space-y-6">
                {user && user.id ? (
                  <ScheduleEditor doctorId={user.id} />
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-muted-foreground">{t('doctorPortal.empty.signInToManageSchedule', 'Please sign in to manage your schedule.')}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>


                  <TabsContent value="earnings" className="space-y-6">
                    <div className="grid md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                              <Banknote className="w-6 h-6 text-success" />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">{t('doctorPortal.labels.thisMonth', 'This Month')}</p>
                              <p className="text-2xl font-bold">
                                {earningsLoading ? '...' : formatNaira(stats.earnings)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                              <TrendingUp className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">{t('doctorPortal.labels.growth', 'Growth')}</p>
                              <p className="text-2xl font-bold">
                                {earningsLoading ? '...' : `${earningsData?.growth || 0 > 0 ? '+' : ''}${earningsData?.growth || 0}%`}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
                              <Calendar className="w-6 h-6 text-warning" />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">{t('doctorPortal.labels.consultations', 'Consultations')}</p>
                              <p className="text-2xl font-bold">
                                {earningsLoading ? '...' : earningsData?.thisMonthConsultations || 0}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                              <Banknote className="w-6 h-6 text-accent" />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">{t('doctorPortal.wallet.walletAvailable', 'Wallet Available')}</p>
                              <p className="text-2xl font-bold">
                                {walletLoading ? '...' : formatNaira(walletAvailableBalance)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Wallet Balance & Withdrawals</CardTitle>
                        <CardDescription>{t('doctorPortal.wallet.trackPendingReleases', 'Track pending releases and prepare withdrawal requests')}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-lg border p-4">
                            <p className="text-xs text-muted-foreground">{t('doctorPortal.wallet.availableBalance', 'Available Balance')}</p>
                            <p className="mt-1 text-xl font-semibold">
                              {walletLoading ? '...' : formatNaira(walletAvailableBalance)}
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <p className="text-xs text-muted-foreground">{t('doctorPortal.wallet.pendingBalance', 'Pending Balance')}</p>
                            <p className="mt-1 text-xl font-semibold">
                              {walletLoading ? '...' : formatNaira(walletPendingBalance)}
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <p className="text-xs text-muted-foreground">{t('doctorPortal.wallet.readyEntries', 'Ready Entries')}</p>
                            <p className="mt-1 text-xl font-semibold">
                              {walletTransactionsLoading ? '...' : availableWalletEntries}
                            </p>
                          </div>
                          <div className="rounded-lg border p-4">
                            <p className="text-xs text-muted-foreground">{t('doctorPortal.wallet.pendingEntries', 'Pending Entries')}</p>
                            <p className="mt-1 text-xl font-semibold">
                              {walletTransactionsLoading ? '...' : pendingWalletEntries}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                          <p className="text-sm font-medium">{t('doctorPortal.wallet.withdrawalProcessStaged', 'Withdrawal process (staged)')}</p>
                          <ol className="space-y-1 text-sm text-muted-foreground list-decimal pl-5">
                            <li>{t('doctorPortal.wallet.stepEnterAmount', 'Enter amount from your available balance.')}</li>
                            <li>{t('doctorPortal.wallet.stepConfirmDetails', 'Confirm account and narration details.')}</li>
                            <li>{t('doctorPortal.wallet.stepSubmitRequest', 'Submit request for admin/manual payout review.')}</li>
                            <li>{t('doctorPortal.wallet.stepMarkPaid', 'Mark request as paid and debit wallet in next release.')}</li>
                          </ol>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-muted-foreground">
                              {t('doctorPortal.wallet.backendDeferredHint', 'Backend payout orchestration is intentionally deferred until approval workflow is finalized.')}
                            </p>
                            <Button
                              size="sm"
                              onClick={() => setWithdrawalDialogOpen(true)}
                              disabled={walletLoading}
                            >
                              {t('doctorPortal.wallet.requestWithdrawal', 'Request Withdrawal')}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>{t('doctorPortal.earnings.historyTitle', 'Earnings History')}</CardTitle>
                        <CardDescription>{t('doctorPortal.earnings.lastSixMonths', 'Your consultation earnings over the last 6 months')}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {earningsLoading ? (
                          <div className="h-64 flex items-center justify-center text-muted-foreground">
                            <p>{t('doctorPortal.loading.earnings', 'Loading earnings data...')}</p>
                          </div>
                        ) : !earningsData?.monthlyData || earningsData.monthlyData.length === 0 ? (
                          <div className="h-64 flex items-center justify-center text-muted-foreground">
                            <BarChart3 className="w-12 h-12 mr-3" />
                            <span>{t('doctorPortal.empty.noEarningsData', 'No earnings data available yet')}</span>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {earningsData.monthlyData.map((month) => {
                              const maxEarnings = Math.max(...earningsData.monthlyData.map(m => m.earnings));
                              const barWidth = maxEarnings > 0 ? (month.earnings / maxEarnings) * 100 : 0;
                              
                              return (
                                <div key={month.month} className="space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium">{month.month}</span>
                                    <div className="text-right">
                                      <span className="font-bold">{formatNaira(month.earnings)}</span>
                                      <span className="text-muted-foreground ml-2">({month.consultations} consultations)</span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                                    <div 
                                      className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-500"
                                      style={{ width: `${barWidth}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>


                  <TabsContent value="reviews" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>{t('doctorPortal.headers.patientReviews', 'Patient Reviews')}</CardTitle>
                            <CardDescription>{t('doctorPortal.headers.patientReviewsDescription', 'Feedback from your consultations')}</CardDescription>
                          </div>
                          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted">
                            <div className="text-center">
                              <div className="flex items-center gap-1">
                                <Star className="w-6 h-6 text-warning fill-warning" />
                                <span className="text-3xl font-bold">{statsLoading ? '...' : (doctorStats?.rating || t('specialists.defaults.notAvailable', 'N/A'))}</span>
                              </div>
                              <p className="text-sm text-muted-foreground">{recentReviews.length} reviews</p>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {reviewsLoading ? (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">{t('doctorPortal.loading.reviews', 'Loading reviews...')}</p>
                          </div>
                        ) : recentReviews.length === 0 ? (
                          <div className="text-center py-8">
                            <Star className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">{t('doctorPortal.empty.noReviewsYet', 'No reviews yet')}</p>
                            <p className="text-sm text-muted-foreground mt-2">{t('doctorPortal.empty.reviewsWillAppear', 'Reviews from patients will appear here after consultations')}</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {recentReviews.map((review) => (
                              <div key={review.id} className="p-4 rounded-xl border border-border">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="w-8 h-8">
                                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                        {review.patient[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{review.patient}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {[...Array(5)].map((_, i) => (
                                      <Star
                                        key={i}
                                        className={`w-4 h-4 ${i < review.rating
                                          ? 'text-warning fill-warning'
                                          : 'text-muted'
                                          }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <p className="text-sm mb-2">{review.comment}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(review.date, { month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="messages" className="space-y-6">
                    <DoctorMessagesTab
                      focusSessionId={messagesFocusSessionId}
                      jumpToUnreadSignal={messagesJumpToUnreadSignal}
                    />
                  </TabsContent>

                  <TabsContent value="settings" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>{t('common.profileSettings', 'Profile Settings')}</CardTitle>
                        <CardDescription>{t('doctorPortal.headers.manageDoctorProfile', 'Manage your doctor profile')}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6">
                          <div className="flex items-center gap-4">
                            <Avatar className="w-20 h-20">
                              <AvatarImage src={profilePicture} />
                              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{displayInitials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-lg">{role === 'doctor' ? `Dr. ${displayName}` : displayName}</p>
                              <p className="text-muted-foreground">{doctorRegistration?.specialty ?? t('specialists.defaults.generalPractice', 'General Practice')}</p>
                              <div className="mt-2">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handlePhotoUpload(file);
                                  }}
                                  className="hidden"
                                  id="doctor-photo-upload"
                                />
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  disabled={isUploadingPhoto}
                                  onClick={() => document.getElementById('doctor-photo-upload')?.click()}
                                >
                                  {isUploadingPhoto
                                    ? t('doctorPortal.actions.uploading', 'Uploading...')
                                    : t('doctorPortal.actions.changePhoto', 'Change Photo')}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium">{t('common.fullName', 'Full Name')}</label>
                              <Input 
                                value={profileFormData.fullName || doctorRegistration?.full_name || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, fullName: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">{t('common.email', 'Email')}</label>
                              <Input 
                                value={profileFormData.email || doctorRegistration?.email || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, email: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">{t('common.phone', 'Phone')}</label>
                              <Input 
                                value={profileFormData.phone || doctorRegistration?.phone_number || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, phone: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">{t('common.specialty', 'Specialty')}</label>
                              <Input 
                                value={profileFormData.specialty || doctorRegistration?.specialty || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, specialty: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">{t('common.experience', 'Experience')}</label>
                              <Input 
                                value={profileFormData.experience || doctorRegistration?.experience || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, experience: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-sm font-medium">{t('auth.fields.consultationLanguages', 'Preferred Consultation Languages')}</label>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('auth.fields.consultationLanguagesHint', 'Select all languages you can use to consult patients.')}
                              </p>
                              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                                {consultationLanguageOptions.map((languageOption) => {
                                  const optionValue = normalizeConsultationLanguage(languageOption.value);
                                  return (
                                    <label
                                      key={optionValue}
                                      className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedConsultationLanguages.includes(optionValue)}
                                        onChange={() => toggleConsultationLanguage(optionValue)}
                                        className="h-4 w-4"
                                      />
                                      <span>{languageOption.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-medium">{t('common.bio', 'Bio')}</label>
                            <Textarea 
                              value={profileFormData.bio || doctorRegistration?.bio || ''} 
                              onChange={(e) => setProfileFormData({...profileFormData, bio: e.target.value})}
                              placeholder={t('doctorPortal.settings.bioPlaceholder', 'Tell patients about yourself, your experience, and approach to healthcare...')}
                              className="mt-1 min-h-[100px]" 
                            />
                          </div>

                          <div className="space-y-4">
                            <div>
                              <p className="text-sm font-medium">{t('doctorPortal.settings.multilingualTitle', 'Multilingual Profile Content')}</p>
                              <p className="text-xs text-muted-foreground">
                                {t('doctorPortal.settings.multilingualDescription', 'Add translated bio for patients using other languages.')}
                              </p>
                            </div>

                            <div className="space-y-4">
                              <div className="rounded-lg border border-border p-4 space-y-3">
                                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground">Language</label>
                                    <select
                                      value={newBioLanguageCode}
                                      onChange={(e) => setNewBioLanguageCode(normalizeBioLanguageCode(e.target.value))}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                                    >
                                      <option value="">Select language</option>
                                      {availableBioTranslationLanguageOptions.map((languageOption) => (
                                        <option key={languageOption.code} value={languageOption.code}>
                                          {languageOption.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleAddBioTranslation}
                                    disabled={!newBioLanguageCode}
                                  >
                                    Add Language Bio
                                  </Button>
                                </div>

                                {Object.keys(bioTranslations).length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    No additional bio languages added yet.
                                  </p>
                                ) : (
                                  <div className="space-y-3">
                                    {Object.entries(bioTranslations)
                                      .sort(([codeA], [codeB]) => codeA.localeCompare(codeB))
                                      .map(([languageCode, value]) => (
                                        <div key={languageCode} className="rounded-lg border border-border p-3 space-y-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-semibold">{getBioLanguageLabel(languageCode)}</p>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 px-2 text-destructive hover:text-destructive"
                                              onClick={() => handleRemoveBioTranslation(languageCode)}
                                            >
                                              Remove
                                            </Button>
                                          </div>
                                          <Textarea
                                            value={value}
                                            onChange={(e) =>
                                              setBioTranslations((prev) => ({
                                                ...prev,
                                                [languageCode]: e.target.value,
                                              }))
                                            }
                                            className="min-h-[88px]"
                                            placeholder={t('doctorPortal.settings.bioInLanguage', 'Bio in {lang}').replace('{lang}', getBioLanguageLabel(languageCode))}
                                          />
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                            {isSavingProfile
                              ? t('doctorPortal.actions.saving', 'Saving...')
                              : t('doctorPortal.actions.saveChanges', 'Save Changes')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>{t('common.changePassword', 'Change Password')}</CardTitle>
                        <CardDescription>{t('common.updateAccountPassword', 'Update your account password')}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4 max-w-md">
                          <div>
                            <label className="text-sm font-medium">{t('common.newPassword', 'New Password')}</label>
                            <Input
                              type="password"
                              value={passwordFormData.newPassword}
                              onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                              className="mt-1"
                              placeholder={t('common.passwordMinHint', 'At least 8 characters')}
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">{t('common.confirmNewPassword', 'Confirm New Password')}</label>
                            <Input
                              type="password"
                              value={passwordFormData.confirmPassword}
                              onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                              className="mt-1"
                              placeholder={t('common.passwordReenterHint', 'Re-enter new password')}
                            />
                          </div>
                          <Button onClick={handleChangePassword} disabled={isChangingPassword}>
                            {isChangingPassword
                              ? t('doctorPortal.actions.updating', 'Updating...')
                              : t('doctorPortal.actions.updatePassword', 'Update Password')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </main>
            </div>
        </div>
        
        <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Request Withdrawal</DialogTitle>
              <DialogDescription>
                {t('doctorPortal.withdrawal.stagedFlowDescription', 'This flow is staged in UI for now. Submission will connect to payout processing in the next phase.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t('doctorPortal.wallet.availableBalance', 'Available Balance')}</label>
                <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {walletLoading ? t('doctorPortal.wallet.loadingWallet', 'Loading wallet...') : formatNaira(walletAvailableBalance)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">{t('doctorPortal.withdrawal.amountLabel', 'Withdrawal Amount (₦)')}</label>
                <Input
                  type="number"
                  min={0}
                  step="100"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  placeholder={t('doctorPortal.withdrawal.amountPlaceholder', 'Enter amount')}
                  className="mt-1"
                />
                {withdrawalAmount && !canRequestWithdrawal && (
                  <p className="mt-1 text-xs text-destructive">
                    {t('doctorPortal.withdrawal.invalidAmountHint', 'Amount must be greater than zero and not exceed your available balance.')}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">{t('doctorPortal.withdrawal.narrationOptional', 'Narration (optional)')}</label>
                <Textarea
                  value={withdrawalNarration}
                  onChange={(e) => setWithdrawalNarration(e.target.value)}
                  placeholder={t('doctorPortal.withdrawal.narrationPlaceholder', 'e.g., Weekly payout request')}
                  className="mt-1 min-h-[88px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWithdrawalDialogOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={submitWithdrawalRequest}>
                {t('common.submitRequest', 'Submit Request')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={rescheduleDialogOpen}
          onOpenChange={(open) => {
            setRescheduleDialogOpen(open);
            if (!open) {
              setRescheduleAppointmentId(null);
              setRescheduleDate('');
              setRescheduleTime('');
            }
          }}
        >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('doctorPortal.reschedule.requestTitle', 'Request Reschedule')}</DialogTitle>
                <DialogDescription>
                  {rescheduleAppointment
                    ? t('doctorPortal.reschedule.proposeForPatient', 'Propose a new date/time for {patient}.').replace('{patient}', rescheduleAppointment.patient_name || t('doctorPortal.defaults.thisPatient', 'this patient'))
                    : t('doctorPortal.reschedule.proposeForAppointment', 'Propose a new date/time for this appointment.')}
                </DialogDescription>
              </DialogHeader>
            <div className="space-y-4">
              {rescheduleAppointment && (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <p>
                    <span className="font-medium">{t('doctorPortal.reschedule.currentLabel', 'Current')}:</span>{' '}
                    {new Date(rescheduleAppointment.date).toLocaleDateString()} {t('common.at', 'at')} {rescheduleAppointment.time}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('doctorPortal.reschedule.patientApprovalRequiredHint', 'Patient must approve this request before the appointment is moved.')}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">{t('doctorPortal.reschedule.newDate', 'New Date')}</label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('doctorPortal.reschedule.newTime', 'New Time')}</label>
                  <Input
                    type="time"
                    className="mt-1"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRescheduleDialogOpen(false);
                  setRescheduleAppointmentId(null);
                }}
                disabled={isRescheduling}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={submitReschedule} disabled={isRescheduling}>
                {isRescheduling ? t('common.submitting', 'Submitting...') : t('common.submitRequest', 'Submit Request')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Folder Modal */}
        <Dialog open={viewFolderOpen} onOpenChange={setViewFolderOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
              <DialogHeader className="pr-10">
              <DialogTitle>{folderLanguageText.viewPatientFolder}</DialogTitle>
              <DialogDescription>
                {selectedAppointmentForFolder?.patient_name}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-medium">{t('portal.patient', 'Patient')}:</span> {selectedAppointmentForFolder?.patient_name}</div>
                  <div><span className="font-medium">{folderMetaText.date}:</span> {selectedAppointmentForFolder?.date}</div>
                  <div><span className="font-medium">{folderMetaText.time}:</span> {formatClockTime(selectedAppointmentForFolder?.time)}</div>
                  <div><span className="font-medium">{folderMetaText.lastUpdated}:</span> {patientFolder?.updated_at ? formatDateTime(patientFolder.updated_at) : t('specialists.defaults.notAvailable', 'N/A')}</div>
                </div>
              </div>

              {isLoadingPatientFolder ? (
                <div className="text-sm text-muted-foreground">{t('doctorPortal.loading.patientFolder', 'Loading patient folder...')}</div>
              ) : (
                <>
                  {patientFolder ? (
                    <div className="space-y-3">
                      {patientFolderFieldOrder.map((field) => (
                        <div key={field}>
                          <label className="text-sm font-medium">{formatFolderFieldLabel(field)}</label>
                          <div className="mt-2 p-3 rounded-lg bg-muted/30 min-h-[60px]">
                            <p className="text-sm whitespace-pre-wrap">
                              {formatFolderEntryText(
                                getLocalizedFieldText(
                                  patientFolder[field],
                                  patientFolder[`${field}_translations`],
                                  language
                                ),
                                folderLanguageText.notRecorded
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{folderLanguageText.noPatientFolder}</p>
                  )}
                  <div>
                    <label className="text-sm font-medium">{folderLanguageText.recentEntries}</label>
                    <div className="mt-2 space-y-2">
                      {patientFolderNotes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{folderLanguageText.noEntries}</p>
                      ) : (
                        patientFolderNotes.map((note) => (
                          <div key={note.id} className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-1">{formatDateTime(note.created_at)}</p>
                            <p className="text-sm"><span className="font-medium">{folderLanguageText.fields.assessment.label}:</span> {getLocalizedFieldText(note.diagnosis, note.diagnosis_translations, language) || folderLanguageText.notRecorded}</p>
                            <p className="text-sm"><span className="font-medium">{folderLanguageText.fields.treatment_plan.label}:</span> {getLocalizedFieldText(note.treatment_plan, note.treatment_plan_translations, language) || folderLanguageText.notRecorded}</p>
                            <p className="text-sm"><span className="font-medium">{folderLanguageText.fields.e_prescription.label}:</span> {getLocalizedFieldText(note.prescriptions, note.prescriptions_translations, language) || folderLanguageText.notRecorded}</p>
                            <p className="text-sm whitespace-pre-wrap">
                              <span className="font-medium">{folderLanguageText.fullClerkingNote}:</span>{' '}
                              {formatFolderEntryText(
                                getLocalizedFieldText(note.follow_up_notes, note.follow_up_notes_translations, language),
                                folderLanguageText.notRecorded
                              )}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">{t('patientPortal.records.uploadedInvestigations', 'Uploaded Investigations')}</label>
                    <div className="mt-2 space-y-2">
                      {patientHealthRecords.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('patientPortal.empty.noRecordsUploadedYet', 'No investigations uploaded yet')}</p>
                      ) : (
                        patientHealthRecords.map((record) => (
                          <div key={record.id} className="p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{record.file_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDateTime(record.uploaded_at)}
                                  {record.file_size ? ` • ${(record.file_size / 1024).toFixed(1)} KB` : ''}
                                </p>
                                {record.notes && (
                                  <p className="text-xs text-muted-foreground mt-1">{record.notes}</p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(record.file_url, '_blank')}
                              >
                                {t('doctorPortal.actions.viewFolder', 'View')}
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
              <div>
                <div className="mt-2 p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    {folderMetaText.accessNotice}
                  </p>
                </div>
              </div>
            </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewFolderOpen(false)}>
                {t('common.close', 'Close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
    </div>
  );
};

export default DoctorPortal;
