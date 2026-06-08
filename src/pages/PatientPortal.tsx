import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg, EventClickArg, EventInput, DayCellMountArg, EventMountArg } from '@fullcalendar/core';

import { Link } from 'react-router-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePaystackPayment } from '@/hooks/usePaystackPayment';
import { useAppointments } from '@/hooks/useAppointments';
import { useDoctors, useAvailableSlots } from '@/hooks/useAvailableSlots';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SlotSelectionModal } from '@/components/SlotSelectionModal';
import { JoinConsultationButton } from '@/components/consultation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Calendar, Clock, Video, MessageSquare, FileText,
  User, Bell, Settings, LogOut, ChevronRight, Star,
  Heart, Activity, Pill, Phone, Plus, Search, Upload, Trash2, Download, Menu, X, List,
  Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ReviewModal } from '@/components/ReviewModal';
import { PatientRegistration } from '@/components/PatientRegistration';
import { MessagesTab } from '@/components/patient-portal/MessagesTab';
import { useRecentConsultations } from '@/hooks/useRecentConsultations';
import { useNotifications } from '@/hooks/useNotifications';
import { usePatientRegistration } from '@/hooks/usePatientRegistration';
import { useHealthRecords } from '@/hooks/useHealthRecords';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useTrackUserPresence } from '@/hooks/useTrackUserPresence';
import { useDoctorPresence } from '@/hooks/useDoctorPresence';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useAppointmentReminders } from '@/hooks/useAppointmentReminders';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import {
  triggerNotificationAlert,
  getNotificationAlertIntensity,
  setNotificationAlertIntensity as persistNotificationAlertIntensity,
  type NotificationAlertIntensity,
} from '@/lib/notificationAlert';
import { SUPPORTED_LANGUAGES, type AppLanguage, useLanguage } from '@/contexts/LanguageContext';
import { PatientWalletService } from '@/services/PatientWalletService';
import { AvailabilityService } from '@/services/AvailabilityService';
import { BookingService } from '@/services/BookingService';
import { AppointmentRescheduleService } from '@/services/AppointmentRescheduleService';
import {
  formatAppointmentStatusLabel,
  normalizeAppointmentStatus,
  normalizeRescheduleRequestStatus,
  type AppointmentStatus,
  type PatientWalletTransaction,
} from '@/services/marketplaceTypes';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { createPrescriptionPdfBlob } from '@/lib/pdf';
import { ContactMyEDoctorForm } from '@/components/ContactMyEDoctorForm';
import { CooThreadChat } from '@/components/coo/CooThreadChat';
import { formatSpecialtyLabel } from '@/lib/utils';
import { useLocaleFormatter } from '@/lib/locale';
import { extractConsultationLanguageFromNotes, normalizeConsultationLanguage, cleanNotesForDisplay, formatConsultationLanguageFromNotes } from '@/lib/consultationLanguage';
import { normalizeTimeHHMM } from '@/lib/appointmentIntervals';
import { APPOINTMENT_BASE_TIME_ZONE, appointmentLocalToDate } from '@/lib/appointmentDateTime';
import {
  DEFAULT_BOOKING_DURATION_MINUTES,
  DEFAULT_CONSULTATION_TYPE,
} from '@/config/marketplaceDefaults';

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createWithdrawalIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `wallet-withdrawal:${crypto.randomUUID()}`;
  }

  return `wallet-withdrawal:${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const clearPlaceholder = (value: string | null | undefined) => {
  const v = String(value || '').trim();
  const lowerV = v.toLowerCase();
  const placeholders = [
    'unknown', 'not provided', 'not-provided', 'n/a', 'na', 
    'pending update', '(pending update)', 'user', 'other', 
    'single', 'hospital_id', 'nin'
  ];
  return placeholders.includes(lowerV) ? '' : v;
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

const APP_LANGUAGE_OPTION_MAP: Record<AppLanguage, { key: string; fallback: string }> = {
  en: { key: 'auth.values.languages.english', fallback: 'English' },
  ha: { key: 'auth.values.languages.hausa', fallback: 'Hausa' },
  ig: { key: 'auth.values.languages.igbo', fallback: 'Igbo' },
  yo: { key: 'auth.values.languages.yoruba', fallback: 'Yoruba' },
  sw: { key: 'auth.values.languages.swahili', fallback: 'Swahili' },
  ar: { key: 'auth.values.languages.arabic', fallback: 'Arabic' },
  fr: { key: 'auth.values.languages.french', fallback: 'French' },
  es: { key: 'auth.values.languages.spanish', fallback: 'Spanish' },
  pt: { key: 'auth.values.languages.portuguese', fallback: 'Portuguese' },
  nl: { key: 'common.language.dutch', fallback: 'Dutch' },
  zh: { key: 'common.language.chinese', fallback: 'Chinese' },
  de: { key: 'common.language.german', fallback: 'German' },
};

const isSupportedAppLanguage = (value: unknown): value is AppLanguage => (
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
);

const countUnreadAdminReplies = (
  rows: Array<{ message?: string | null; created_at?: string | null }>,
  getThreadReadAtMs: (row: { message?: string | null; created_at?: string | null }) => number,
) => {
  return rows.reduce((total, row) => {
    const body = String(row.message || '');
    if (!body) return total;
    let count = 0;
    const lastReadAtMs = getThreadReadAtMs(row);
    const createdAtMs = new Date(String(row.created_at || '')).getTime();
    const isAdminInitiatedMessage = /\[portal:admin\]/i.test(body);
    if (isAdminInitiatedMessage && !Number.isNaN(createdAtMs) && createdAtMs > lastReadAtMs) {
      count += 1;
    }
    for (const match of body.matchAll(/--- Admin Reply \((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\) ---/g)) {
      const timestamp = `${match[1].replace(' ', 'T')}:00Z`;
      const replyTimeMs = new Date(timestamp).getTime();
      if (!Number.isNaN(replyTimeMs) && replyTimeMs > lastReadAtMs) {
        count += 1;
      }
    }
    return total + count;
  }, 0);
};

const countAdminReplyMarkers = (body: string) => {
  return Array.from(body.matchAll(/--- Admin Reply \((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\) ---/g)).length;
};

interface PatientPrescription {
  id: string;
  noteId: string;
  noteIds: string[];
  items: Array<{
    medication: string;
    dosage: string;
    rawText: string;
  }>;
  rawText: string;
  doctor: string;
  doctorId: string | null;
  sessionId: string | null;
  date: string;
  refillsRemaining: number;
  status: 'active' | 'past';
  isDownloaded: boolean;
}

interface PatientInvestigationRequest {
  id: string;
  noteId: string;
  noteIds: string[];
  doctor: string;
  doctorId: string | null;
  sessionId: string | null;
  date: string;
  details: string;
}

interface PatientPaymentTransactionRow {
  id: string;
  appointment_id: string | null;
  amount: number;
  status: string | null;
  provider: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  provider_reference: string | null;
  created_at: string;
  verified_at: string | null;
  metadata?: Record<string, unknown> | null;
}

const INVESTIGATION_SECTION_HEADERS = [
  'Investigations',
  'Gwaje-gwaje',
  'Nnyocha Lab',
  'Àwọn Ìdánwò',
  'Vipimo',
  'الفحوصات',
  'Investigaciones',
  'Exames',
  'Onderzoeken',
  '检查项目',
  'Untersuchungen',
];

const NEXT_SECTION_HEADERS = [
  'E-Prescription',
  'Prescription',
  'Prescriptions',
  'E-Magani',
  'Ntuziaka Ọgwụ',
  'E-Òògùn',
  'Dawa (E-Rx)',
  'الوصفة الإلكترونية',
  'E-Ordonnance',
  'E-Receta',
  'E-Prescrição',
  'E-Recept',
  '电子处方',
  'E-Rezept',
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractInvestigationsFromClerkingNote = (note: string | null | undefined): string => {
  if (!note) return '';
  const source = note.trim();
  if (!source) return '';

  for (const header of INVESTIGATION_SECTION_HEADERS) {
    const escapedNextHeaders = NEXT_SECTION_HEADERS.map(escapeRegExp).join('|');
    const pattern = new RegExp(
      `(?:^|\\n)${escapeRegExp(header)}:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${escapedNextHeaders})\\s*:|$)`,
      'i'
    );
    const match = source.match(pattern);
    if (match?.[1]) {
      // Defensive cleanup in case older notes use inconsistent spacing before next section.
      // Handles both:
      // 1) "\nE-Prescription: ..."
      // 2) "E-Prescription: ..." immediately at start of captured block.
      const cleanupPattern = new RegExp(`(?:^|\\n)\\s*(?:${escapedNextHeaders})\\s*:[\\s\\S]*$`, 'i');
      const extracted = match[1].replace(cleanupPattern, '').trim();
      if (!extracted) continue;

      // Extra guard: ignore blocks that still begin with prescription headers.
      const startsWithPrescriptionHeader = new RegExp(`^\\s*(?:${escapedNextHeaders})\\s*:`, 'i').test(extracted);
      if (startsWithPrescriptionHeader) continue;

      return extracted;
    }
  }

  return '';
};

const isMissingColumnError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204';
};

const PatientPortal = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadContactCount, setUnreadContactCount] = useState(0);
  const [unreadCooCount, setUnreadCooCount] = useState(0);
  const [contactReadVersion, setContactReadVersion] = useState(0);
  const sessionParticipantsCacheRef = useRef<Map<string, { patient_id: string | null; doctor_id: string | null }>>(new Map());
  const [selectedConsultation, setSelectedConsultation] = useState<any>(null);
  const [consultationDetailsOpen, setConsultationDetailsOpen] = useState(false);
  const [isUploadingRecord, setIsUploadingRecord] = useState(false);
  const [uploadNotes, setUploadNotes] = useState('');
  const [messagesFocusSessionId, setMessagesFocusSessionId] = useState<string | null>(null);
  const [messagesJumpToUnreadSignal, setMessagesJumpToUnreadSignal] = useState(0);
  const followUpNoticeShownRef = useRef<string | null>(null);
  const patientAppointmentSnapshotRef = useRef<Map<string, string>>(new Map());
  const patientReminderSentRef = useRef<Set<string>>(new Set());
  const patientNotificationAlertedIdsRef = useRef<Set<string>>(new Set());
  const [selectedPrescription, setSelectedPrescription] = useState<PatientPrescription | null>(null);
  const [prescriptionDetailsOpen, setPrescriptionDetailsOpen] = useState(false);
  const [selectedInvestigationRequest, setSelectedInvestigationRequest] = useState<PatientInvestigationRequest | null>(null);
  const [investigationDetailsOpen, setInvestigationDetailsOpen] = useState(false);
  const [isRequestingRefillId, setIsRequestingRefillId] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  const { isInstalled: isPwaInstalled, promptInstall } = usePwaInstall();
  const { t, language, setLanguage } = useLanguage();
  const { formatDate, formatDateTime, formatTime, formatClockTime, formatNumber, formatCurrency } = useLocaleFormatter();
  
  // Track patient presence
  useTrackUserPresence(user?.id, 'patient');

  // Subscribe to doctor presence
  const { presenceMap: doctorPresenceMap } = useDoctorPresence();

  const { appointments, isLoading: appointmentsLoading, invalidateAppointments } = useAppointments();

  // Realtime notifications for messages and appointments
  useRealtimeNotifications(user?.id, 'patient', user?.email);
  useAppointmentReminders(appointments || [], user?.id);

  // Force refetch when PWA comes back to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        invalidateAppointments();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [invalidateAppointments]);

  const { data: patientWallet } = useQuery({
    queryKey: ['patient-wallet', user?.id],
    queryFn: () => PatientWalletService.getPatientWallet(user!.id),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
  const { data: walletWithdrawalRequests = [] } = useQuery({
    queryKey: ['patient-wallet-withdrawals', user?.id],
    queryFn: () => PatientWalletService.getWalletWithdrawalRequests(user!.id),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
  const { data: walletTransactions = [], isLoading: walletTransactionsLoading } = useQuery({
    queryKey: ['patient-wallet-transactions', user?.id],
    queryFn: () => PatientWalletService.getWalletTransactions(user!.id),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
  const { data: paymentTransactions = [], isLoading: paymentTransactionsLoading } = useQuery({
    queryKey: ['patient-payments', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, appointment_id, amount, status, provider, payment_method, payment_reference, provider_reference, created_at, verified_at, metadata')
        .eq('patient_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as PatientPaymentTransactionRow[];
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
  const { data: recentConsultations = [], isLoading: consultationsLoading } = useRecentConsultations();
  const { data: notifications = [], isLoading: notificationsLoading } = useNotifications();
  const { data: patientRegistration } = usePatientRegistration();
  const { records: healthRecords, isLoading: recordsLoading, uploadRecord, deleteRecord } = useHealthRecords(user?.id);
  const queryClient = useQueryClient();
  const { initializePayment } = usePaystackPayment();
  const paystackPublicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

  const patientWalletBalance = Number(patientWallet?.available_balance || 0);
  const pendingWalletWithdrawalsCount = useMemo(
    () => walletWithdrawalRequests.filter((row) => {
      const status = String(row.status || '').trim().toLowerCase();
      return status === 'pending' || status === 'processing';
    }).length,
    [walletWithdrawalRequests],
  );
  const paymentSummary = useMemo(() => {
    const successfulStatuses = new Set(['completed', 'success', 'paid', 'succeeded']);
    const failedStatuses = new Set(['failed', 'error', 'abandoned']);

    let successfulCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let successfulAmount = 0;

    paymentTransactions.forEach((row) => {
      const amount = Number(row.amount || 0);
      const status = String(row.status || '').trim().toLowerCase();
      if (successfulStatuses.has(status)) {
        successfulCount += 1;
        successfulAmount += Number.isFinite(amount) ? amount : 0;
        return;
      }
      if (failedStatuses.has(status)) {
        failedCount += 1;
        return;
      }
      pendingCount += 1;
    });

    return {
      successfulCount,
      failedCount,
      pendingCount,
      successfulAmount,
      totalCount: paymentTransactions.length,
    };
  }, [paymentTransactions]);
  const walletSummary = useMemo(() => {
    let creditTotal = 0;
    let debitTotal = 0;

    walletTransactions.forEach((tx) => {
      const amount = Number(tx.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const direction = String(tx.direction || '').toLowerCase();
      if (direction === 'credit') {
        creditTotal += amount;
      } else if (direction === 'debit') {
        debitTotal += amount;
      }
    });

    return {
      creditTotal,
      debitTotal,
      net: creditTotal - debitTotal,
      totalCount: walletTransactions.length,
    };
  }, [walletTransactions]);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNarration, setWithdrawNarration] = useState('');
  const [withdrawIdempotencyKey, setWithdrawIdempotencyKey] = useState<string | null>(null);
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [notificationAlertIntensity, setNotificationAlertIntensityState] = useState<NotificationAlertIntensity>(() => getNotificationAlertIntensity());
  const [profileFormData, setProfileFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    age: '',
    city: '',
    state: '',
    country: '',
    bloodType: '',
    preferredLanguage: language as AppLanguage,
  });
  const [passwordFormData, setPasswordFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const handleNotificationIntensityChange = (rawValue: string) => {
    const nextValue: NotificationAlertIntensity =
      rawValue === 'low' || rawValue === 'medium' || rawValue === 'high' ? rawValue : 'high';
    setNotificationAlertIntensityState(nextValue);
    persistNotificationAlertIntensity(nextValue);
  };

  const handleTestAlert = () => {
    void triggerNotificationAlert({
      title: t('common.notificationTest', 'Test Alert'),
      body: t('common.notificationTestDescription', 'This is a test alert for ring and vibration.'),
      tag: `settings-test-alert-${user?.id || 'patient'}-${Date.now()}`,
      urgent: true,
      intensity: notificationAlertIntensity,
    });
  };
  // Initialize form data when patientRegistration loads
  useEffect(() => {
    if (patientRegistration) {
      setProfileFormData({
        fullName: clearPlaceholder(patientRegistration.full_name),
        email: patientRegistration.email || '',
        phone: clearPlaceholder(patientRegistration.phone_number),
        age: patientRegistration.age === 18 ? '' : (patientRegistration.age?.toString() || ''),
        city: clearPlaceholder(patientRegistration.city),
        state: clearPlaceholder(patientRegistration.state),
        country: clearPlaceholder(patientRegistration.country),
        bloodType: clearPlaceholder(patientRegistration.blood_type),
        preferredLanguage: isSupportedAppLanguage((patientRegistration as { preferred_language?: unknown })?.preferred_language)
          ? ((patientRegistration as { preferred_language?: unknown }).preferred_language as AppLanguage)
          : language,
      });
    }
  }, [patientRegistration, language]);
  const navigate = useNavigate();
  const contactThreadReadStorageKey = user?.id ? `patient-contact-thread-read-${user.id}` : null;

  const { data: contactMessagesForUnread = [] } = useQuery({
    queryKey: ['patient-contact-unread', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.rpc('get_my_contact_messages', { limit_count: 200 });
      if (error) {
        console.error('Error fetching patient contact messages:', error);
        return [];
      }
      return (data || []) as Array<{ id?: string | null; message?: string | null; created_at?: string | null }>;
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!contactThreadReadStorageKey || typeof window === 'undefined') return;
    let threadReadMap: Record<string, number> = {};
    try {
      const raw = window.localStorage.getItem(contactThreadReadStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          threadReadMap = Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[0] === 'string' && typeof entry[1] === 'number')
          );
        }
      }
    } catch {
      threadReadMap = {};
    }
    const unread = countUnreadAdminReplies(contactMessagesForUnread, (row) => {
      const rowId = (row as { id?: string | null }).id || '';
      return threadReadMap[rowId] || 0;
    });
    setUnreadContactCount(unread);
  }, [contactMessagesForUnread, contactThreadReadStorageKey, contactReadVersion]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onReadUpdated = () => setContactReadVersion((prev) => prev + 1);
    window.addEventListener('contact-thread-read-updated', onReadUpdated);
    return () => window.removeEventListener('contact-thread-read-updated', onReadUpdated);
  }, []);

  useEffect(() => {
    if (!user?.id || !user.email) return;
    const lowerEmail = user.email.toLowerCase();

    const channel = supabase
      .channel(`patient-contact-replies-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contact_messages' },
        (payload) => {
          const newRow = payload.new as { email?: string | null; message?: string | null } | null;
          if (!newRow?.email) return;
          if (String(newRow.email).toLowerCase() !== lowerEmail) return;
          if (!/\[portal:admin\]/i.test(String(newRow.message || ''))) return;

          void triggerNotificationAlert({
            title: 'New message from MyE-Doctor',
            body: 'You received a new support message.',
            tag: `patient-support-insert-${user.id}`,
            urgent: true,
          });
          toast({
            title: 'New message from MyE-Doctor',
            description: 'You received a new support message.',
          });
          queryClient.invalidateQueries({ queryKey: ['patient-contact-unread', user.id] });
          queryClient.invalidateQueries({ queryKey: ['my-contact-messages', lowerEmail] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contact_messages' },
        (payload) => {
          const newRow = payload.new as { email?: string | null; message?: string | null } | null;
          const oldRow = payload.old as { message?: string | null } | null;
          if (!newRow?.email) return;
          if (String(newRow.email).toLowerCase() !== lowerEmail) return;

          const oldCount = countAdminReplyMarkers(String(oldRow?.message || ''));
          const newCount = countAdminReplyMarkers(String(newRow.message || ''));
          if (newCount <= oldCount) return;

          void triggerNotificationAlert({
            title: 'New message from MyE-Doctor',
            body: 'You received a new support reply.',
            tag: `patient-support-update-${user.id}`,
            urgent: true,
          });
          toast({
            title: 'New message from MyE-Doctor',
            description: 'You received a new support reply.',
          });
          queryClient.invalidateQueries({ queryKey: ['patient-contact-unread', user.id] });
          queryClient.invalidateQueries({ queryKey: ['my-contact-messages', lowerEmail] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user?.email, user?.id]);

  // Fetch prescriptions from doctor_consultation_notes
  const { data: fetchedPrescriptions = [], isLoading: prescriptionsLoading } = useQuery({
    queryKey: ['prescriptions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: notes, error } = await supabase
        .from('doctor_consultation_notes')
        .select(`
          id,
          prescriptions,
          created_at,
          consultation_sessions!inner(
            id,
            doctor_id,
            appointments!inner(specialist_name)
          )
        `)
        .eq('patient_id', user.id)
        .not('prescriptions', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching prescriptions:', error);
        return [];
      }

      const doctorIds = Array.from(
        new Set(
          (notes || [])
            .map((note: any) => note.consultation_sessions?.doctor_id)
            .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        )
      );

      const doctorNameMap = new Map<string, string>();
      if (doctorIds.length > 0) {
        const { data: doctorRows } = await supabase
          .from('doctors')
          .select('id, name')
          .in('id', doctorIds);

        (doctorRows || []).forEach((doctor: any) => {
          if (doctor.id && doctor.name) {
            doctorNameMap.set(doctor.id, doctor.name);
          }
        });
      }

      // Parse prescriptions and group by consultation (session-first).
      const grouped = new Map<string, PatientPrescription>();
      (notes || []).forEach((note: any) => {
        if (note.prescriptions) {
          try {
            const parsedLines = typeof note.prescriptions === 'string'
              ? note.prescriptions.split(/\r?\n/).filter((line: string) => line.trim())
              : [note.prescriptions];

            const items = parsedLines
              .map((line: unknown) => {
                const normalizedLine = String(line ?? '').trim();
                const parts = normalizedLine.split('-').map((p: string) => p.trim());
                return {
                  medication: parts[0] || normalizedLine,
                  dosage: parts[1] || 'As prescribed',
                  rawText: normalizedLine,
                };
              })
              .filter((item) => item.rawText.length > 0);

            if (items.length === 0) return;

            const daysSincePrescription = Math.floor((Date.now() - new Date(note.created_at).getTime()) / (1000 * 60 * 60 * 24));
            const doctorId = note.consultation_sessions?.doctor_id ?? null;
            const sessionId = note.consultation_sessions?.id ?? null;
            const resolvedDoctorName =
              (doctorId ? doctorNameMap.get(doctorId) : null) ||
              note.consultation_sessions?.appointments?.specialist_name ||
              'Doctor';
            const dayKey = new Date(note.created_at).toISOString().slice(0, 10);
            const groupKey = sessionId
              ? `session:${sessionId}`
              : `fallback:${doctorId || 'unknown'}:${dayKey}`;

            const existing = grouped.get(groupKey);
            if (!existing) {
              grouped.set(groupKey, {
                id: groupKey,
                noteId: note.id,
                noteIds: [note.id],
                items,
                rawText: items.map((item) => item.rawText).join('\n'),
                doctor: resolvedDoctorName,
                doctorId,
                sessionId,
                date: note.created_at,
                refillsRemaining: daysSincePrescription > 90 ? 0 : 3,
                status: daysSincePrescription > 90 ? 'past' : 'active',
                isDownloaded: false,
              });
            } else {
              const seen = new Set(existing.items.map((item) => item.rawText.toLowerCase().trim()));
              for (const item of items) {
                const key = item.rawText.toLowerCase().trim();
                if (!seen.has(key)) {
                  existing.items.push(item);
                  seen.add(key);
                }
              }
              existing.rawText = existing.items.map((item) => item.rawText).join('\n');
              if (!existing.noteIds.includes(note.id)) {
                existing.noteIds.push(note.id);
              }
              if (new Date(note.created_at).getTime() > new Date(existing.date).getTime()) {
                existing.date = note.created_at;
              }
              if (existing.status === 'past' && daysSincePrescription <= 90) {
                existing.status = 'active';
                existing.refillsRemaining = 3;
              }
              grouped.set(groupKey, existing);
            }
          } catch (err) {
            console.error('Error parsing prescription:', err);
          }
        }
      });
      const groupedItems = Array.from(grouped.values());
      const allNoteIds = groupedItems.flatMap((item) => item.noteIds);
      if (allNoteIds.length > 0) {
        try {
          const { data: verificationRows, error: verificationError } = await supabase
            .from('prescription_verifications')
            .select('note_id, is_downloaded, status, expires_at, date_issued, drug_list')
            .in('note_id', allNoteIds)
            .eq('patient_id', user.id);

          if (verificationError) {
            console.warn('Could not fetch prescription download status:', verificationError);
          } else {
            const rowsByNoteId = new Map<string, any>();
            (verificationRows || []).forEach((row: any) => {
              if (row?.note_id) rowsByNoteId.set(String(row.note_id), row);
            });

            groupedItems.forEach((item) => {
              const matchingRows = item.noteIds
                .map((id) => rowsByNoteId.get(String(id)))
                .filter(Boolean) as Array<{
                note_id: string;
                is_downloaded: boolean;
                status: string | null;
                expires_at: string | null;
                date_issued: string | null;
                drug_list: string | null;
              }>;

              if (matchingRows.length === 0) return;

              const latestVerification = [...matchingRows].sort((a, b) => {
                const aTime = a.date_issued ? new Date(a.date_issued).getTime() : 0;
                const bTime = b.date_issued ? new Date(b.date_issued).getTime() : 0;
                return bTime - aTime;
              })[0];

              // Count distinct dispenses so duplicate note rows don't consume multiple refills.
              const downloadedCycleKeys = new Set<string>();
              matchingRows
                .filter((row) => !!row.is_downloaded)
                .forEach((row) => {
                  const normalizedDrugList = String(row.drug_list || '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();
                  const issuedDay = row.date_issued
                    ? new Date(row.date_issued).toISOString().slice(0, 10)
                    : 'unknown-day';
                  downloadedCycleKeys.add(`${normalizedDrugList}|${issuedDay}`);
                });

              const dispensedCount = downloadedCycleKeys.size;
              item.refillsRemaining = Math.max(0, 3 - dispensedCount);

              const isExpiredByDate =
                !!latestVerification.expires_at &&
                new Date(latestVerification.expires_at).getTime() < Date.now();
              const isExpiredByStatus = latestVerification.status === 'expired';

              item.status =
                !isExpiredByDate && !isExpiredByStatus && item.refillsRemaining > 0
                  ? 'active'
                  : 'past';

              item.isDownloaded = !!latestVerification.is_downloaded;
            });
          }
        } catch (statusErr) {
          console.warn('Download status lookup unavailable:', statusErr);
        }
      }

      return groupedItems.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    },
    enabled: !!user?.id,
  });

  const { data: fetchedInvestigationRequests = [], isLoading: investigationRequestsLoading } = useQuery({
    queryKey: ['investigation-requests', user?.id, language],
    queryFn: async () => {
      if (!user?.id) return [];

      const notesWithTranslationsQuery = await supabase
        .from('doctor_consultation_notes')
        .select(`
          id,
          follow_up_notes,
          follow_up_notes_translations,
          created_at,
          consultation_sessions!inner(
            id,
            doctor_id,
            appointments!inner(specialist_name)
          )
        `)
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      let notes = notesWithTranslationsQuery.data;
      if (notesWithTranslationsQuery.error) {
        if (!isMissingColumnError(notesWithTranslationsQuery.error)) {
          console.error('Error fetching investigation requests:', notesWithTranslationsQuery.error);
          return [];
        }

        const legacyNotesQuery = await supabase
          .from('doctor_consultation_notes')
          .select(`
            id,
            follow_up_notes,
            created_at,
            consultation_sessions!inner(
              id,
              doctor_id,
              appointments!inner(specialist_name)
            )
          `)
          .eq('patient_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (legacyNotesQuery.error) {
          console.error('Error fetching legacy investigation requests:', legacyNotesQuery.error);
          return [];
        }

        notes = (legacyNotesQuery.data || []).map((note: any) => ({
          ...note,
          follow_up_notes_translations: null,
        }));
      }

      const doctorIds = Array.from(
        new Set(
          (notes || [])
            .map((note: any) => note.consultation_sessions?.doctor_id)
            .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        )
      );

      const doctorNameMap = new Map<string, string>();
      if (doctorIds.length > 0) {
        const { data: doctorRows } = await supabase
          .from('doctors')
          .select('id, name')
          .in('id', doctorIds);

        (doctorRows || []).forEach((doctor: any) => {
          if (doctor.id && doctor.name) doctorNameMap.set(doctor.id, doctor.name);
        });
      }

      const grouped = new Map<string, PatientInvestigationRequest>();
      (notes || []).forEach((note: any) => {
        const noteTranslations = (note.follow_up_notes_translations as Record<string, string> | null) ?? null;
        const localizedNote =
          (language === 'en' ? null : noteTranslations?.[language]) ||
          noteTranslations?.en ||
          note.follow_up_notes ||
          '';
        const extracted = extractInvestigationsFromClerkingNote(localizedNote);
        if (!extracted) return;

        const doctorId = note.consultation_sessions?.doctor_id ?? null;
        const sessionId = note.consultation_sessions?.id ?? null;
        const resolvedDoctorName =
          (doctorId ? doctorNameMap.get(doctorId) : null) ||
          note.consultation_sessions?.appointments?.specialist_name ||
          'Doctor';
        const dayKey = new Date(note.created_at).toISOString().slice(0, 10);
        const groupKey = sessionId
          ? `session:${sessionId}`
          : `fallback:${doctorId || 'unknown'}:${dayKey}`;

        const existing = grouped.get(groupKey);
        if (!existing) {
          grouped.set(groupKey, {
            id: groupKey,
            noteId: note.id,
            noteIds: [note.id],
            doctor: resolvedDoctorName,
            doctorId,
            sessionId,
            date: note.created_at,
            details: extracted,
          });
          return;
        }

        const existingLines = new Set(
          existing.details
            .split(/\r?\n/)
            .map((line) => line.trim().toLowerCase())
            .filter(Boolean)
        );
        const mergedLines = [...existing.details.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)];
        extracted
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => {
            const key = line.toLowerCase();
            if (!existingLines.has(key)) {
              mergedLines.push(line);
              existingLines.add(key);
            }
          });

        existing.details = mergedLines.join('\n');
        if (!existing.noteIds.includes(note.id)) existing.noteIds.push(note.id);
        if (new Date(note.created_at).getTime() > new Date(existing.date).getTime()) {
          existing.date = note.created_at;
        }
        grouped.set(groupKey, existing);
      });

      return Array.from(grouped.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    },
    enabled: !!user?.id,
  });

  const { data: requiredInvestigations = '', isLoading: investigationsLoading } = useQuery({
    queryKey: ['patient-folder-investigations', user?.id, language],
    queryFn: async () => {
      if (!user?.id) return '';

      const { data: folderRows, error: folderError } = await supabase
        .from('patient_folders')
        .select('investigations, investigations_translations, updated_at')
        .eq('patient_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (folderError && !isMissingColumnError(folderError)) {
        console.error('Error fetching required investigations from patient_folders:', folderError);
      }

      const latestFolder = (folderRows ?? [])[0] as
        | { investigations?: string | null; investigations_translations?: Record<string, string> | null }
        | undefined;
      const translations = (latestFolder?.investigations_translations as Record<string, string> | null) ?? null;
      const translatedValue = language === 'en' ? null : translations?.[language]?.trim();
      const folderInvestigations =
        translatedValue?.trim() ||
        translations?.en?.trim() ||
        latestFolder?.investigations?.trim() ||
        '';

      if (folderInvestigations) return folderInvestigations;

      // Fallback for older DB states where investigations are not persisted in patient_folders:
      // parse the investigations section from latest clerking note text.
      const { data: notesWithTranslations, error: notesWithTranslationsError } = await supabase
        .from('doctor_consultation_notes')
        .select('follow_up_notes, follow_up_notes_translations, created_at')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (notesWithTranslationsError && !isMissingColumnError(notesWithTranslationsError)) {
        console.error('Error fetching clerking notes with translations:', notesWithTranslationsError);
      }

      const candidateNotes = (notesWithTranslations ?? []) as Array<{
        follow_up_notes?: string | null;
        follow_up_notes_translations?: Record<string, string> | null;
      }>;

      for (const note of candidateNotes) {
        const noteTranslations = (note.follow_up_notes_translations as Record<string, string> | null) ?? null;
        const localizedNote =
          (language === 'en' ? null : noteTranslations?.[language]) ||
          noteTranslations?.en ||
          note.follow_up_notes ||
          '';
        const extracted = extractInvestigationsFromClerkingNote(localizedNote);
        if (extracted) return extracted;
      }

      if (candidateNotes.length > 0) return '';

      // Final fallback: if translation columns do not exist at all, read legacy follow_up_notes only.
      const { data: legacyNotes, error: legacyNotesError } = await supabase
        .from('doctor_consultation_notes')
        .select('follow_up_notes, created_at')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (legacyNotesError) {
        console.error('Error fetching legacy clerking notes:', legacyNotesError);
        return '';
      }

      for (const note of (legacyNotes ?? []) as Array<{ follow_up_notes?: string | null }>) {
        const extracted = extractInvestigationsFromClerkingNote(note.follow_up_notes ?? '');
        if (extracted) return extracted;
      }

      return '';
    },
    enabled: !!user?.id,
  });

  const followUpAppointments = useMemo(() => {
    const nowMs = Date.now();
    return appointments
      .filter((apt) => Boolean((apt as any).needs_follow_up))
      .map((apt) => {
        const deadlineRaw = (apt as any).follow_up_deadline_at as string | null | undefined;
        const deadlineMs = deadlineRaw ? new Date(deadlineRaw).getTime() : NaN;
        const hasDeadline = Number.isFinite(deadlineMs);
        const remainingMs = hasDeadline ? Math.max(0, deadlineMs - nowMs) : 0;
        const daysLeft = hasDeadline ? Math.ceil(remainingMs / (1000 * 60 * 60 * 24)) : null;
        return {
          appointment: apt,
          deadlineRaw,
          isOverdue: hasDeadline ? deadlineMs <= nowMs : false,
          daysLeft,
        };
      })
      .filter((row) => !row.isOverdue);
  }, [appointments]);

  const followUpAppointmentWithNearestDeadline = useMemo(() => {
    if (followUpAppointments.length === 0) return null;
    return [...followUpAppointments].sort((a, b) => {
      const aMs = a.deadlineRaw ? new Date(a.deadlineRaw).getTime() : Number.MAX_SAFE_INTEGER;
      const bMs = b.deadlineRaw ? new Date(b.deadlineRaw).getTime() : Number.MAX_SAFE_INTEGER;
      return aMs - bMs;
    })[0];
  }, [followUpAppointments]);

  const followUpInvestigationMessage = useMemo(() => {
    const nearest = followUpAppointmentWithNearestDeadline;
    if (!nearest) return null;
    const hasInvestigationRequest = Boolean(requiredInvestigations && requiredInvestigations.trim().length > 0);
    if (!hasInvestigationRequest) return null;
    const dayText = nearest.daysLeft === 1 ? '1 day' : `${nearest.daysLeft ?? 0} days`;
    return {
      title: `Follow-up deadline: ${dayText}`,
      body: `Your doctor marked this consultation as needing follow-up. Please upload your investigation results within ${dayText}. After ${dayText}, this appointment will be marked completed automatically.`,
    };
  }, [followUpAppointmentWithNearestDeadline, requiredInvestigations]);

  useEffect(() => {
    const appointmentId = followUpAppointmentWithNearestDeadline?.appointment?.id || null;
    if (!appointmentId || !followUpInvestigationMessage) return;
    if (followUpNoticeShownRef.current === appointmentId) return;
    followUpNoticeShownRef.current = appointmentId;
    toast({
      title: followUpInvestigationMessage.title,
      description: followUpInvestigationMessage.body,
    });
  }, [followUpAppointmentWithNearestDeadline, followUpInvestigationMessage, t]);

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

  const handleRecordUpload = async (file: File) => {
    setIsUploadingRecord(true);
    try {
      await uploadRecord.mutateAsync({ file, notes: uploadNotes });
      setUploadNotes('');
      toast({ title: 'Success', description: 'Investigation uploaded successfully!' });
    } catch (error: any) {
      const message = error?.message || 'Failed to upload investigation.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsUploadingRecord(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      await deleteRecord.mutateAsync(recordId);
      toast({ title: 'Success', description: 'Investigation deleted successfully!' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete investigation.' });
    }
  };

  const handleViewPrescriptionDetails = (prescription: PatientPrescription) => {
    setSelectedPrescription(prescription);
    setPrescriptionDetailsOpen(true);
  };

  const handleDownloadPrescription = (prescription: PatientPrescription) => {
    if (prescription.isDownloaded) {
      toast({
        title: 'Download locked',
        description: 'You already downloaded this prescription. Request refill and download renewed copy from doctor message after approval.',
        variant: 'destructive',
      });
      return;
    }

    (async () => {
      try {
      if (!user?.id) {
        toast({
          title: 'Download unavailable',
          description: 'You must be signed in to download prescriptions.',
          variant: 'destructive',
        });
        return;
      }
      const verificationBaseUrl =
        (import.meta.env.VITE_VERIFICATION_BASE_URL as string | undefined) ||
        'https://myedoctorhealth.com';
      let verificationCode: string | undefined;
      let verificationUrl: string | undefined;

      if (prescription.noteId && prescription.doctorId) {
        try {
          const { data: codeData, error: codeError } = await (supabase as any).rpc('ensure_prescription_verification', {
            p_note_id: prescription.noteId,
            p_session_id: prescription.sessionId,
            p_patient_id: user.id,
            p_doctor_id: prescription.doctorId,
            p_drug_list: prescription.rawText,
            p_date_issued: prescription.date,
          });
          if (!codeError && codeData) {
            verificationCode = String(codeData);
            verificationUrl = `${verificationBaseUrl.replace(/\/$/, '')}/verify/${verificationCode}`;
          } else {
            console.warn('Prescription verification code generation failed:', codeError);
          }
        } catch (verificationErr) {
          console.warn('Prescription verification unavailable, continuing with download:', verificationErr);
        }
      }

      const lines = prescription.items.map(
        (item, index) => `${index + 1}. ${item.medication} - ${item.dosage}`
      );
      const content = [
        `Patient: ${displayName}`,
        `Prescribed by: ${prescription.doctor}`,
        `Date: ${formatDateTime(prescription.date)}`,
        `Verification Code: ${verificationCode || 'Pending/Unavailable'}`,
        '',
        'Items:',
        ...lines,
        '',
        'Instructions:',
        prescription.rawText,
        '',
        `Status: ${prescription.status}`,
      ];

      const blob = await createPrescriptionPdfBlob({
        title: 'MYE-DOCTOR PRESCRIPTION',
        lines: content,
        verificationUrl,
        verificationCode: verificationCode || 'Pending/Unavailable',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeMedication = (prescription.items[0]?.medication || 'medication')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
      link.href = url;
      link.download = `prescription-${safeMedication || 'medication'}-${new Date(prescription.date).toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      try {
        await (supabase as any).rpc('mark_prescription_downloaded', {
          p_note_ids: prescription.noteIds,
        });
        queryClient.invalidateQueries({ queryKey: ['prescriptions', user.id] });
        setSelectedPrescription((prev) => (prev && prev.id === prescription.id ? { ...prev, isDownloaded: true } : prev));
      } catch (markErr) {
        console.warn('Could not persist prescription download status:', markErr);
      }
      toast({
        title: 'Downloaded',
        description: verificationCode
          ? 'Prescription downloaded successfully.'
          : 'Prescription downloaded. QR verification will be available once server verification is configured.',
      });
      } catch (error) {
      console.error('Failed to download prescription:', error);
      toast({ title: 'Error', description: 'Failed to download prescription.', variant: 'destructive' });
      }
    })();
  };

  const handleRequestPrescriptionRefill = async (prescription: PatientPrescription) => {
    if (!user?.id) return;
    if (!prescription.sessionId || !prescription.doctorId) {
      toast({
        title: 'Refill unavailable',
        description: 'This prescription is missing doctor/session details.',
        variant: 'destructive',
      });
      return;
    }

    setIsRequestingRefillId(prescription.id);
    try {
      const itemsSummary = prescription.items
        .map((item) => `${item.medication} (${item.dosage})`)
        .join('; ');
      const content = `Prescription refill request: ${itemsSummary}. Original prescription date: ${formatDate(prescription.date)}.`;
      const { error } = await supabase.from('consultation_messages').insert({
        session_id: prescription.sessionId,
        sender_id: user.id,
        sender_role: 'patient',
        sender_name: displayName,
        message_type: 'text',
        content,
      });

      if (error) throw error;

      toast({
        title: 'Refill requested',
        description: 'Your refill request has been sent to your doctor.',
      });
      setMessagesFocusSessionId(null);
      setTimeout(() => setMessagesFocusSessionId(prescription.sessionId), 0);
      setActiveTab('messages');
      setSidebarOpen(false);
      queryClient.invalidateQueries({ queryKey: ['messages', prescription.sessionId] });
    } catch (error) {
      console.error('Failed to request refill:', error);
      toast({
        title: 'Request failed',
        description: 'Could not send refill request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRequestingRefillId(null);
    }
  };

  const handleViewInvestigationDetails = (request: PatientInvestigationRequest) => {
    setSelectedInvestigationRequest(request);
    setInvestigationDetailsOpen(true);
  };

  const handleDownloadInvestigationRequest = async (request: PatientInvestigationRequest) => {
    try {
      const detailLines = request.details
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const lines = [
        `Patient: ${displayName}`,
        `Requested by: ${request.doctor}`,
        `Date: ${formatDateTime(request.date)}`,
        '',
        'Requested Investigations:',
        ...(detailLines.length > 0 ? detailLines.map((line, index) => `${index + 1}. ${line}`) : ['None recorded']),
      ];

      const blob = await createPrescriptionPdfBlob({
        title: 'MYE-DOCTOR INVESTIGATION REQUEST',
        lines,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeDoctor = request.doctor
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
      link.href = url;
      link.download = `investigation-request-${safeDoctor || 'doctor'}-${new Date(request.date).toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Downloaded',
        description: 'Investigation request downloaded successfully.',
      });
    } catch (error) {
      console.error('Failed to download investigation request:', error);
      toast({
        title: 'Error',
        description: 'Failed to download investigation request.',
        variant: 'destructive',
      });
    }
  };

  const displayName = patientRegistration?.full_name ?? user?.user_metadata?.full_name ?? user?.email ?? 'Patient';
  const profilePicture = patientRegistration?.profile_picture_url ?? user?.user_metadata?.avatar ?? '';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Force re-render when profile picture changes
  const profilePictureKey = `${profilePicture}-${Date.now()}`;

  // Helper to resolve doctor name from doctor_id (falls back to specialist_name)
  const getDoctorNameById = (doctorId?: string | null, fallback?: string) => {
    if (!doctorId) return fallback ?? '';
    const typedDoctors = (doctors || []) as Array<{ id?: string; name?: string }>;
    const found = typedDoctors.find((d) => d.id === doctorId);
    return found?.name ?? fallback ?? '';
  };

  const requireAuthForBooking = () => {
    if (!user) {
      toast({ title: 'Please sign in', description: 'You must be signed in to book appointments.' });
      navigate('/auth');
      return false;
    }
    return true;
  };

  // Booking modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [slotSelectionOpen, setSlotSelectionOpen] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [specialistName, setSpecialistName] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [rescheduleDurationMinutes, setRescheduleDurationMinutes] = useState<number>(DEFAULT_BOOKING_DURATION_MINUTES);
  const [rescheduleConsultationType, setRescheduleConsultationType] = useState<'chat' | 'voice' | 'video'>(DEFAULT_CONSULTATION_TYPE);
  const [currentRescheduleConsultationType, setCurrentRescheduleConsultationType] = useState<'chat' | 'voice' | 'video'>(DEFAULT_CONSULTATION_TYPE);
  const [rescheduleRequestNote, setRescheduleRequestNote] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [reschedulePaidAmount, setReschedulePaidAmount] = useState<number | null>(null);
  const [reschedulePaymentMethod, setReschedulePaymentMethod] = useState<'paystack' | 'wallet'>(() => {
    // For testing on remote deployments, default to wallet to avoid Paystack cross-origin issues
    const isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    return isLocalhost ? 'paystack' : 'wallet';
  });
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState<string | null>(null);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<AppointmentStatus | 'all' | 'closed'>('all');
  const [appointmentViewMode, setAppointmentViewMode] = useState<'list' | 'calendar'>('list');
  const [isMobileAppointmentsLayout, setIsMobileAppointmentsLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarDayDialogOpen, setCalendarDayDialogOpen] = useState(false);
  const [calendarEventDialogOpen, setCalendarEventDialogOpen] = useState(false);
  const [calendarDialogDate, setCalendarDialogDate] = useState<string | null>(null);
  const [calendarFocusedAppointmentId, setCalendarFocusedAppointmentId] = useState<string | null>(null);
  const lastHandledReviewAppointmentRef = useRef<string | null>(null);
  const confirmedPaymentReferencesRef = useRef<Set<string>>(new Set());
  const appliedPreferredLanguageRef = useRef(false);
  const withdrawalAmountValue = Number(withdrawAmount.replace(/,/g, '').trim());
  const canSubmitWithdrawal = Number.isFinite(withdrawalAmountValue) &&
    withdrawalAmountValue > 0 &&
    withdrawalAmountValue <= patientWalletBalance &&
    !isSubmittingWithdrawal;

  const getWithdrawalStatusLabel = (status: string | null | undefined) => {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'completed' || normalized === 'paid' || normalized === 'approved') return 'Completed';
    if (normalized === 'processing') return 'Processing';
    if (normalized === 'rejected') return 'Rejected';
    if (normalized === 'cancelled') return 'Cancelled';
    return 'Pending';
  };

  const getWithdrawalStatusBadgeClass = (status: string | null | undefined) => {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'completed' || normalized === 'paid' || normalized === 'approved') {
      return 'bg-success/10 text-success border-success/20';
    }
    if (normalized === 'processing') {
      return 'bg-primary/10 text-primary border-primary/20';
    }
    if (normalized === 'rejected' || normalized === 'cancelled') {
      return 'bg-destructive/10 text-destructive border-destructive/20';
    }
    return 'bg-warning/10 text-warning border-warning/20';
  };

  const getPaymentStatusLabel = (status: string | null | undefined) => {
    const normalized = String(status || '').trim().toLowerCase();
    if (['completed', 'success', 'paid', 'succeeded'].includes(normalized)) return 'Successful';
    if (['failed', 'error', 'abandoned'].includes(normalized)) return 'Failed';
    if (!normalized) return 'Pending';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const getPaymentStatusBadgeClass = (status: string | null | undefined) => {
    const normalized = String(status || '').trim().toLowerCase();
    if (['completed', 'success', 'paid', 'succeeded'].includes(normalized)) {
      return 'bg-success/10 text-success border-success/20';
    }
    if (['failed', 'error', 'abandoned'].includes(normalized)) {
      return 'bg-destructive/10 text-destructive border-destructive/20';
    }
    return 'bg-warning/10 text-warning border-warning/20';
  };

  const getWalletTransactionLabel = (tx: PatientWalletTransaction) => {
    const type = String(tx.transaction_type || '').trim().toLowerCase();
    if (type === 'refund') return 'Refund';
    if (type === 'booking_wallet_use') return 'Appointment Payment';
    if (type === 'adjustment') return 'Adjustment';
    return type ? type.replace(/_/g, ' ') : 'Wallet Transaction';
  };

  // Legacy deep-link support: previous booking links opened an in-portal dialog.
  useEffect(() => {
    if (searchParams.get('action') === 'book') {
      navigate('/doctor-discovery', { replace: true });
    }
  }, [searchParams, navigate]);

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
    if (appliedPreferredLanguageRef.current) return;
    if (!patientRegistration) return;
    appliedPreferredLanguageRef.current = true;

    const preferredLanguage = (patientRegistration as { preferred_language?: unknown })?.preferred_language;
    if (isSupportedAppLanguage(preferredLanguage) && preferredLanguage !== language) {
      setLanguage(preferredLanguage);
    }
  }, [patientRegistration, language, setLanguage]);

  // Handle post-consultation review deep-link
  useEffect(() => {
    if (appointmentsLoading) return;

    const action = searchParams.get('action');
    const appointmentId = searchParams.get('appointmentId');
    if (action !== 'review' || !appointmentId) return;
    if (lastHandledReviewAppointmentRef.current === appointmentId) return;

    lastHandledReviewAppointmentRef.current = appointmentId;
    const openReviewFlow = async () => {
      let appointment = appointments.find((apt) => apt.id === appointmentId) as any;

      // Fallback direct fetch in case local appointments query is stale right after call end.
      if (!appointment && user?.id) {
        const { data } = await supabase
          .from('appointments')
          .select('*')
          .eq('id', appointmentId)
          .eq('patient_id', user.id)
          .maybeSingle();
        if (data) {
          appointment = data;
        }
      }

      if (appointment && !appointment.rating) {
        setSelectedAppointment(appointment);
        setReviewModalOpen(true);
        setActiveTab('appointments');
      } else if (appointment?.rating) {
        toast({
          title: 'Review already submitted',
          description: 'You have already reviewed this consultation.'
        });
      } else {
        toast({
          title: 'Review unavailable',
          description: 'Could not find this consultation to review.'
        });
      }

      setSearchParams(params => {
        const next = new URLSearchParams(params);
        next.delete('action');
        next.delete('appointmentId');
        return next;
      }, { replace: true });
    };

    openReviewFlow().catch((error) => {
      console.error('Failed to open review flow:', error);
      setSearchParams(params => {
        const next = new URLSearchParams(params);
        next.delete('action');
        next.delete('appointmentId');
        return next;
      }, { replace: true });
    });
  }, [appointments, appointmentsLoading, searchParams, setSearchParams, user?.id]);

  // Auto-confirm successful Paystack return by URL reference (redirect flow).
  useEffect(() => {
    const reference = String(searchParams.get('reference') || searchParams.get('trxref') || '').trim();
    if (!reference) return;
    if (confirmedPaymentReferencesRef.current.has(reference)) return;

    confirmedPaymentReferencesRef.current.add(reference);

    (async () => {
      try {
        // First try to check if it's a reschedule payment
        const { data: paymentData } = await supabase
          .from('payments')
          .select('metadata')
          .or(`provider_reference.eq.${reference},payment_reference.eq.${reference}`)
          .maybeSingle();
        
        const paymentType = String((paymentData?.metadata as any)?.type || '').toLowerCase();
        
        if (paymentType === 'reschedule_upgrade' || paymentType === 'reschedule_hybrid_wallet') {
          const { data: result, error } = await supabase.functions.invoke('reschedule-payment-confirm', {
            body: { reference },
          });
          if (error) throw error;
          
          toast({
            title: 'Reschedule paid',
            description: result?.alreadyFinalized
              ? 'Payment processed. Your reschedule request is now pending doctor approval.'
              : 'Payment verified. Reschedule request submitted for doctor approval.',
          });
        } else {
          const result = await BookingService.confirmPayment(reference);
          toast({
            title: 'Payment successful',
            description: result?.alreadyProcessed
              ? 'Payment was already processed and appointment remains pending doctor approval.'
              : 'Payment verified. Appointment is now pending doctor approval.',
          });
        }
      } catch (error) {
        console.warn('[PatientPortal] Redirect payment confirmation failed:', error);
        toast({
          title: 'Payment processing',
          description: 'Your payment was received. We are verifying the appointment status and it may update shortly.',
        });
      } finally {
        // ALWAYS invalidate queries to ensure the status updates in the UI
        await queryClient.invalidateQueries({ queryKey: ['appointments', user?.id], refetchType: 'all' });
        
        setSearchParams((params) => {
          const next = new URLSearchParams(params);
          next.delete('reference');
          next.delete('trxref');
          return next;
        }, { replace: true });
      }
    })();
  }, [queryClient, searchParams, setSearchParams, toast, user?.id]);

  // Load actual paid amount for the appointment from payments table when reschedule target selected
  useEffect(() => {
    let mounted = true;
    const loadPaid = async () => {
      if (!rescheduleAppointmentId) {
        setReschedulePaidAmount(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('amount,status')
          .eq('appointment_id', rescheduleAppointmentId);
        if (error) throw error;
        const rows = (data || []);
        const successStates = new Set(['completed', 'success', 'paid', 'succeeded']);
        const successful = rows.filter((p: any) => {
          const st = String(p.status || '').toLowerCase();
          return successStates.has(st);
        });
        let sum = successful.reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
        // Normalize kobo -> naira if amounts look like kobo (heuristic)
        const storedFinal = Number((rescheduleAppointment as any)?.final_price || 0);
        if (storedFinal > 0 && sum > storedFinal * 1.5 && sum > 1000) {
          sum = Math.round(sum / 100);
        }
        if (mounted) setReschedulePaidAmount(Number.isFinite(sum) ? sum : 0);
      } catch (err) {
        if (mounted) setReschedulePaidAmount(null);
      }
    };

    loadPaid();
    return () => { mounted = false; };
  }, [rescheduleAppointmentId]);

  const resetBookingState = () => {
    setSpecialistName('');
    setBookingDate('');
    setBookingTime('');
    setRescheduleDurationMinutes(DEFAULT_BOOKING_DURATION_MINUTES);
    setRescheduleRequestNote('');
    setSelectedDoctorId(null);
    setRescheduleAppointmentId(null);
    setRescheduleDoctorId(null);
    setReschedulePaymentMethod('paystack');
    setBookingOpen(false);
    setSlotSelectionOpen(false);
  };

  // Fetch available slots and doctors
  const { data: allSlots = [], isLoading: slotsLoading } = useAvailableSlots();
  const { data: doctors = [], isLoading: doctorsLoading } = useDoctors();
  const rescheduleAppointment = useMemo(
    () => appointments.find((apt) => apt.id === rescheduleAppointmentId) || null,
    [appointments, rescheduleAppointmentId],
  );
  const currentRescheduleDurationMinutes = useMemo(() => {
    if (!rescheduleAppointment) return DEFAULT_BOOKING_DURATION_MINUTES;
    const value = Number((rescheduleAppointment as { duration_minutes?: number | null }).duration_minutes || DEFAULT_BOOKING_DURATION_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_BOOKING_DURATION_MINUTES;
  }, [rescheduleAppointment]);
  const currentRescheduleFinalPrice = useMemo(() => {
    if (!rescheduleAppointment) return 0;
    const value = Number((rescheduleAppointment as { final_price?: number | null }).final_price || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [rescheduleAppointment]);
  const getConsultationTypeForPricing = (apt: { price_breakdown?: Record<string, unknown> | null }) => {
    const type = String((apt.price_breakdown as Record<string, unknown> | null)?.consultation_type || DEFAULT_CONSULTATION_TYPE).toLowerCase();
    if (type === 'chat' || type === 'voice' || type === 'video') return type;
    return DEFAULT_CONSULTATION_TYPE;
  };
  const getConsultationLanguageForAppointment = (apt: {
    notes?: string | null;
    price_breakdown?: Record<string, unknown> | null;
    consultation_language?: string | null;
    consultationLanguage?: string | null;
  }) => {
    const fromNotes = extractConsultationLanguageFromNotes(apt.notes);
    if (fromNotes) return fromNotes;

    const breakdown = (apt.price_breakdown || {}) as Record<string, unknown>;
    const directCandidates = [
      apt.consultation_language,
      apt.consultationLanguage,
      breakdown.consultation_language,
      breakdown.consultationLanguage,
      breakdown.selected_consultation_language,
      breakdown.selectedConsultationLanguage,
      breakdown.selected_language,
      breakdown.selectedLanguage,
      breakdown.language,
    ];
    const metadata = (breakdown.metadata && typeof breakdown.metadata === 'object')
      ? (breakdown.metadata as Record<string, unknown>)
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
  const {
    data: reschedulePreviewFinalPrice,
    isLoading: reschedulePreviewLoading,
    isFetching: reschedulePreviewFetching,
    refetch: refetchReschedulePrice,
  } = useQuery({
    queryKey: [
      'patient-reschedule-preview',
      rescheduleAppointmentId,
      selectedDoctorId,
      rescheduleDurationMinutes,
      rescheduleConsultationType,
    ],
    queryFn: () =>
      AvailabilityService.calculatePricePreview({
        doctorId: selectedDoctorId!,
        duration: rescheduleDurationMinutes,
        consultationType: rescheduleConsultationType,
      }),
    enabled:
      !!rescheduleAppointment &&
      !!selectedDoctorId &&
      (bookingOpen || slotSelectionOpen),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  // Refetch price whenever duration or consultation type changes during reschedule
  useEffect(() => {
    if (bookingOpen && selectedDoctorId && rescheduleAppointment) {
      refetchReschedulePrice();
    }
  }, [rescheduleDurationMinutes, rescheduleConsultationType, bookingOpen, selectedDoctorId, rescheduleAppointment, refetchReschedulePrice]);
  const proposedRescheduleFinalPrice = useMemo(() => {
    if (!rescheduleAppointment) return 0;
    if (typeof reschedulePreviewFinalPrice === 'number' && Number.isFinite(reschedulePreviewFinalPrice)) {
      return reschedulePreviewFinalPrice;
    }
    return currentRescheduleFinalPrice;
  }, [rescheduleAppointment, reschedulePreviewFinalPrice, currentRescheduleFinalPrice]);
  const rescheduleUpgradeAmount = useMemo(
    () => {
      // Amount to pay = max(0, ProposedPrice - AlreadyPaid)
      const alreadyPaid = reschedulePaidAmount !== null ? reschedulePaidAmount : 0;
      return Math.max(0, proposedRescheduleFinalPrice - alreadyPaid);
    },
    [proposedRescheduleFinalPrice, reschedulePaidAmount],
  );
  const rescheduleHybridWalletApplied = useMemo(
    () => (rescheduleUpgradeAmount > 0 ? Math.min(patientWalletBalance, rescheduleUpgradeAmount) : 0),
    [patientWalletBalance, rescheduleUpgradeAmount],
  );
  const rescheduleHybridPaystackDue = useMemo(
    () => Math.max(rescheduleUpgradeAmount - rescheduleHybridWalletApplied, 0),
    [rescheduleUpgradeAmount, rescheduleHybridWalletApplied],
  );
  const effectiveReschedulePaymentMethod = useMemo<'paystack' | 'wallet' | 'hybrid'>(
    () => {
      if (reschedulePaymentMethod === 'wallet') {
        return rescheduleHybridPaystackDue > 0 ? 'hybrid' : 'wallet';
      }
      return 'paystack';
    },
    [reschedulePaymentMethod, rescheduleHybridPaystackDue],
  );

  const openBooking = () => {
    if (!requireAuthForBooking()) return;
    resetBookingState();
    navigate('/doctor-discovery');
  };

  const handleSlotSelect = (
    doctor: { id: string; name: string },
    date: string,
    time: string,
    options?: { durationMinutes?: number },
  ) => {
    if (!rescheduleAppointmentId) {
      toast({
        title: 'Reschedule context missing',
        description: 'Use Doctor Discovery for new appointments.',
        variant: 'destructive',
      });
      setSlotSelectionOpen(false);
      return;
    }

    setSelectedDoctorId(doctor.id);
    setSpecialistName(doctor.name);
    setBookingDate(date);
    setBookingTime(time);
    if (typeof options?.durationMinutes === 'number' && Number.isFinite(options.durationMinutes)) {
      setRescheduleDurationMinutes(options.durationMinutes);
    }
    setSlotSelectionOpen(false);
    setBookingOpen(true);
  };

  const initReschedule = (apt: unknown) => {
    if (!requireAuthForBooking()) return;
    const aptData = apt as {
      id?: string;
      doctor_id?: string;
      specialist_name?: string;
      status?: string;
      reschedule_request_status?: string | null;
    };
    if (!aptData.id || !aptData.doctor_id) {
      toast({
        title: 'Cannot reschedule',
        description: 'Appointment details are incomplete.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedStatus = normalizeAppointmentStatus(aptData.status);
    if (normalizeRescheduleRequestStatus(aptData.reschedule_request_status) === 'pending') {
      toast({
        title: 'Request already pending',
        description: 'There is already a reschedule request awaiting action.',
        variant: 'destructive',
      });
      return;
    }

    const canReschedule =
      normalizedStatus === 'pending_approval' ||
      normalizedStatus === 'confirmed' ||
      normalizedStatus === 'no_show';

    if (!canReschedule) {
      toast({
        title: 'Cannot reschedule',
        description: 'Only pending approval, confirmed, or no-show appointments can be rescheduled.',
        variant: 'destructive',
      });
      return;
    }

    setRescheduleAppointmentId(aptData.id);
    setRescheduleDoctorId(aptData.doctor_id);
    setSelectedDoctorId(aptData.doctor_id);
    setSpecialistName(getDoctorNameById(aptData.doctor_id, aptData.specialist_name || 'Doctor'));
    setBookingDate('');
    setBookingTime('');
    
    // Extract current duration and consultation type from appointment
    const currentDuration = Number((apt as { duration_minutes?: number | null }).duration_minutes || DEFAULT_BOOKING_DURATION_MINUTES) || DEFAULT_BOOKING_DURATION_MINUTES;
    const currentConsultType = getConsultationTypeForPricing(apt as { price_breakdown?: Record<string, unknown> | null });
    
    setRescheduleDurationMinutes(currentDuration);
    setCurrentRescheduleConsultationType(currentConsultType);
    setRescheduleConsultationType(currentConsultType);
    setRescheduleRequestNote('');
    setReschedulePaymentMethod('paystack');
    setBookingOpen(false);
    setSlotSelectionOpen(true);
  };

  const openMessagesForAppointment = async (apt: any) => {
    if (!user?.id) return;
    const appointmentId = (apt as { id?: string | null }).id;
    const doctorId = (apt as { doctor_id?: string | null }).doctor_id;
    if (!appointmentId || !doctorId) {
      toast({
        title: t('patientPortal.messaging.unavailableTitle', 'Messaging unavailable'),
        description: t('patientPortal.messaging.missingDoctorContext', 'Doctor details are missing for this appointment.'),
        variant: 'destructive',
      });
      return;
    }

    const consultationTypeCandidate = String(
      (apt as { consultation_type?: string | null }).consultation_type ||
      ((apt as { price_breakdown?: Record<string, unknown> | null }).price_breakdown as Record<string, unknown> | null)?.consultation_type ||
      (apt as { consultationType?: string | null }).consultationType ||
      (apt as { consultation_mode?: string | null }).consultation_mode ||
      DEFAULT_CONSULTATION_TYPE
    ).toLowerCase();
    const consultationType = consultationTypeCandidate === 'chat' || consultationTypeCandidate === 'voice'
      ? consultationTypeCandidate
      : DEFAULT_CONSULTATION_TYPE;

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
            patient_id: user.id,
            doctor_id: doctorId,
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
        title: t('patientPortal.messaging.failedTitle', 'Unable to open messages'),
        description: t('patientPortal.messaging.failedDescription', 'Please try again in a moment.'),
        variant: 'destructive',
      });
    }
  };

  const rescheduleBooking = async () => {
    if (!requireAuthForBooking()) return;
    if (!specialistName || !bookingDate || !bookingTime || !selectedDoctorId || !rescheduleAppointmentId || !rescheduleAppointment) {
      toast({
        title: 'Missing fields',
        description: 'Please select a new date and time.',
        variant: 'destructive',
      });
      return;
    }

    const currentDoctorId = (rescheduleAppointment as { doctor_id?: string }).doctor_id || null;
    if (!currentDoctorId || selectedDoctorId !== currentDoctorId) {
      toast({
        title: 'Invalid reschedule request',
        description: 'Reschedule keeps the original doctor. Please pick another date/time.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedTime = /^\d{2}:\d{2}$/.test(bookingTime) ? `${bookingTime}:00` : bookingTime;
    const targetDateTime = new Date(`${bookingDate}T${normalizedTime}`);
    if (Number.isNaN(targetDateTime.getTime()) || targetDateTime.getTime() <= Date.now()) {
      toast({
        title: 'Invalid date/time',
        description: 'Please choose a future time slot.',
        variant: 'destructive',
      });
      return;
    }

    if (
      (reschedulePreviewLoading || reschedulePreviewFetching || !Number.isFinite(reschedulePreviewFinalPrice))
    ) {
      toast({
        title: 'Pricing unavailable',
        description: 'Still calculating the new price. Please wait a moment and try again.',
        variant: 'destructive',
      });
      return;
    }

    if (rescheduleUpgradeAmount > 0) {
      if (effectiveReschedulePaymentMethod === 'paystack' || effectiveReschedulePaymentMethod === 'hybrid') {
        if (!paystackPublicKey) {
          toast({
            title: 'Payment not configured',
            description: 'Payment gateway not configured. Contact support.',
            variant: 'destructive',
          });
          return;
        }

        // Initialize payment via Paystack for the server-calculated upgrade amount.
        try {
          const proposedTimeForPayment = normalizedTime.slice(0, 5);
          const { data, error } = await supabase.functions.invoke('reschedule-payment-initiate', {
            body: {
              appointmentId: rescheduleAppointmentId,
              proposedDate: bookingDate,
              proposedTime: proposedTimeForPayment,
              proposedDuration: rescheduleDurationMinutes,
              proposedConsultationType: rescheduleConsultationType,
              paymentMethod: effectiveReschedulePaymentMethod,
            },
          });
          if (error) throw error;
          const paymentInit = data as any;
          const walletChargedAmount = Number(paymentInit?.walletChargedAmount || 0);
          const paystackAmountDue = Number(
            paymentInit?.paystackAmountDue
            ?? (paymentInit?.amountInKobo ? Number(paymentInit.amountInKobo) / 100 : 0),
          );

          if (!paymentInit?.reference) throw new Error('Payment initialization failed');
          if (!Number.isFinite(paystackAmountDue) || paystackAmountDue <= 0) {
            throw new Error('Invalid Paystack amount for reschedule payment');
          }

          setIsBooking(true);
          // Close the confirmation dialog before opening Paystack.
          // Radix modal overlay can intercept pointer events above Paystack iframe.
          setBookingOpen(false);
          await new Promise((resolve) => setTimeout(resolve, 220));
          let paymentCompleted = false;
          await initializePayment({
            email: paymentInit.email || user?.email || '',
            amount: paymentInit.amountInKobo,
            reference: paymentInit.reference,
            accessCode: paymentInit.accessCode,
            authorizationUrl: paymentInit.authorizationUrl,
            preferRedirect: true,
            publicKey: paystackPublicKey,
            metadata: paymentInit.metadata,
            onSuccess: async (response: any) => {
              paymentCompleted = true;
              const paidReference = String(response?.reference || paymentInit.reference || '').trim();

              try {
                let confirmResult: { error?: string; alreadyFinalized?: boolean } | null = null;
                let lastConfirmError: any = null;

                for (let attempt = 0; attempt < 3; attempt += 1) {
                  try {
                    const { data: confirmData, error: confirmError } = await supabase.functions.invoke('reschedule-payment-confirm', {
                      body: { reference: paidReference },
                    });
                    if (confirmError) throw confirmError;

                    const parsed = (confirmData || {}) as { error?: string; alreadyFinalized?: boolean };
                    if (parsed.error) throw new Error(parsed.error);
                    confirmResult = parsed;
                    lastConfirmError = null;
                    break;
                  } catch (attemptError: any) {
                    lastConfirmError = attemptError;
                    if (attempt < 2) {
                      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
                    }
                  }
                }

                if (!confirmResult) {
                  throw lastConfirmError || new Error('Reschedule payment confirmation failed');
                }

                toast({
                  title: 'Payment successful',
                  description: confirmResult.alreadyFinalized
                    ? 'Your paid reschedule request is already pending doctor approval.'
                    : walletChargedAmount > 0
                    ? `Wallet applied ₦${walletChargedAmount.toLocaleString()} and Paystack paid ₦${paystackAmountDue.toLocaleString()}. Your reschedule request is pending doctor approval.`
                    : 'Your reschedule request has been submitted and is pending doctor approval.',
                });
              } catch (confirmErr: any) {
                console.warn('[reschedule] client confirmation fallback failed:', confirmErr);
                toast({
                  title: 'Payment successful',
                  description: walletChargedAmount > 0
                    ? `Wallet applied ₦${walletChargedAmount.toLocaleString()} and Paystack paid ₦${paystackAmountDue.toLocaleString()}. Your request will appear under Pending Approval once webhook processing completes.`
                    : 'Payment succeeded. Your request will appear under Pending Approval once webhook processing completes.',
                });
              } finally {
                setIsBooking(false);
                resetBookingState();
                invalidateAppointments();
                await queryClient.invalidateQueries({ queryKey: ['patient-wallet', user?.id] });
                setTimeout(() => {
                  invalidateAppointments();
                  queryClient.invalidateQueries({ queryKey: ['patient-wallet', user?.id] });
                }, 2000);
              }
            },
            onClose: () => {
              if (paymentCompleted) return;
              setIsBooking(false);
              setBookingOpen(true);
              toast({ title: 'Payment cancelled', description: 'You cancelled the payment process.' });
            },
          });
        } catch (err: any) {
          toast({ title: 'Payment initialization failed', description: err?.message || 'Could not start payment.', variant: 'destructive' });
          setIsBooking(false);
          setBookingOpen(true);
        }
        return;
      }
      // if user chose wallet but has insufficient funds, block
      if (effectiveReschedulePaymentMethod === 'wallet' && patientWalletBalance < rescheduleUpgradeAmount) {
        toast({
          title: 'Insufficient wallet balance',
          description: `You need ₦${rescheduleUpgradeAmount.toLocaleString()} in wallet for this upgrade.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setIsBooking(true);
    try {
      await AppointmentRescheduleService.requestReschedule({
        appointmentId: rescheduleAppointmentId,
        proposedDate: bookingDate,
        proposedTime: normalizedTime,
        proposedDurationMinutes: rescheduleDurationMinutes,
        proposedFinalPrice: proposedRescheduleFinalPrice,
        proposedConsultationType: rescheduleConsultationType,
        requestNote: rescheduleRequestNote || null,
      });

      toast({
        title: 'Reschedule requested',
        description: 'Your request has been sent for approval.',
      });
      resetBookingState();
      invalidateAppointments();
      await queryClient.invalidateQueries({ queryKey: ['patient-wallet', user?.id] });
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({ title: 'Reschedule failed', description: message, variant: 'destructive' });
    } finally {
      setIsBooking(false);
    }
  };

  const respondToRescheduleRequest = async (appointmentId: string, action: 'approve' | 'decline') => {
    if (!requireAuthForBooking()) return;

    setIsBooking(true);
    try {
      const response = await AppointmentRescheduleService.respondToReschedule({
        appointmentId,
        action,
      });

      toast({
        title: action === 'approve' ? 'Reschedule approved' : 'Reschedule declined',
        description:
          action === 'approve'
            ? response.charged_upgrade_amount > 0
              ? `New slot confirmed. ₦${Number(response.charged_upgrade_amount || 0).toLocaleString()} charged from wallet.`
              : 'New slot confirmed.'
            : 'The reschedule request was declined.',
      });

      if (action === 'approve') {
        // Patch cache immediately using new_date/new_time returned by RPC
        const newDate = (response as any).new_date;
        const newTime = normalizeTimeHHMM((response as any).new_time) || (response as any).new_time;
        if (newDate && newTime) {
          queryClient.setQueryData(['appointments', user?.id], (old: any[]) =>
            (old || []).map((apt) =>
              apt.id === appointmentId
                ? { ...apt, date: newDate, time: newTime, reschedule_request_status: 'approved' }
                : apt
            )
          );
        } else {
          const { data: updated } = await supabase
            .from('appointments').select('*').eq('id', appointmentId).single();
          if (updated) {
            queryClient.setQueryData(['appointments', user?.id], (old: any[]) =>
              (old || []).map((apt) => apt.id === appointmentId ? { ...apt, ...updated } : apt)
            );
          }
        }
      }

      invalidateAppointments();
      await queryClient.refetchQueries({ queryKey: ['appointments', user?.id], type: 'active' });
      await queryClient.invalidateQueries({ queryKey: ['patient-wallet', user?.id] });
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({
        title: 'Request update failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsBooking(false);
    }
  };

  const cancelAppointment = async () => {
    if (!cancelAppointmentId) return;
    setIsBooking(true);
    try {
      const result = await PatientWalletService.cancelAppointmentWithRefund(cancelAppointmentId);
      const refunded = Number(result?.refund_amount || 0);
      toast({
        title: 'Appointment cancelled',
        description: refunded > 0
          ? `Refunded ₦${refunded.toLocaleString()} to your wallet balance.`
          : 'Appointment was cancelled successfully.',
      });
      setCancelAppointmentId(null);
      invalidateAppointments();
      await queryClient.invalidateQueries({ queryKey: ['patient-wallet', user?.id] });
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({ title: 'Cancellation failed', description: message });
    } finally {
      setIsBooking(false);
    }
  };

  const submitWalletWithdrawalRequest = async () => {
    if (!user?.id) return;
    const amount = Number(withdrawAmount.replace(/,/g, '').trim());

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Enter a withdrawal amount greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    if (amount > patientWalletBalance) {
      toast({
        title: 'Insufficient wallet balance',
        description: `Available wallet balance is ₦${patientWalletBalance.toLocaleString()}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmittingWithdrawal(true);
    try {
      const requestIdempotencyKey = withdrawIdempotencyKey || createWithdrawalIdempotencyKey();
      if (!withdrawIdempotencyKey) {
        setWithdrawIdempotencyKey(requestIdempotencyKey);
      }
      const response = await PatientWalletService.requestWalletWithdrawal(
        amount,
        withdrawNarration || undefined,
        requestIdempotencyKey,
      );
      toast({
        title: 'Withdrawal request submitted',
        description: `₦${Number(response.amount || amount).toLocaleString()} has been reserved from your wallet. Admin processing target is within 48 hours.`,
      });
      setWithdrawDialogOpen(false);
      setWithdrawAmount('');
      setWithdrawNarration('');
      setWithdrawIdempotencyKey(null);
      await queryClient.invalidateQueries({ queryKey: ['patient-wallet', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['patient-wallet-withdrawals', user.id] });
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({
        title: 'Withdrawal request failed',
        description: message || 'Unable to submit wallet withdrawal request.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!user) return;
    setIsUploadingPhoto(true);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}.${fileExt}`;
      const filePath = `${user.id}/profile-pictures/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('patient-files')
        .getPublicUrl(filePath);

      // Add cache-busting parameter to force image refresh
      const cacheBustUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('patient_registrations')
        .update({ profile_picture_url: cacheBustUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Invalidate queries and force refetch
      await queryClient.invalidateQueries({ queryKey: ['patient-registration'] });
      await queryClient.refetchQueries({ queryKey: ['patient-registration'] });
      
      toast({ title: 'Success', description: 'Profile picture updated successfully!' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update profile picture.' });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setIsSavingProfile(true);
    
    try {
      const preferredLanguageToSave = isSupportedAppLanguage(profileFormData.preferredLanguage)
        ? profileFormData.preferredLanguage
        : language;
      const baseProfilePayload = {
        full_name: profileFormData.fullName,
        email: profileFormData.email,
        phone_number: profileFormData.phone,
        age: parseInt(profileFormData.age) || null,
        city: profileFormData.city.trim(),
        state: profileFormData.state.trim(),
        country: profileFormData.country.trim(),
        blood_type: profileFormData.bloodType,
      };
      const { error } = await supabase
        .from('patient_registrations')
        .update({
          ...baseProfilePayload,
          preferred_language: preferredLanguageToSave,
        })
        .eq('user_id', user.id);

      if (error && (error.code === '42703' || error.code === 'PGRST204')) {
        const { error: fallbackError } = await supabase
          .from('patient_registrations')
          .update(baseProfilePayload)
          .eq('user_id', user.id);
        if (fallbackError) throw fallbackError;
      } else if (error) {
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['patient-registration'] });
      setLanguage(preferredLanguageToSave);
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
    if (isDoctorRequestedReschedule(apt)) {
      return <Badge className="bg-blue-100 text-blue-700 border-blue-300">{t('patientPortal.badges.doctorRescheduleRequest', 'Doctor Reschedule Request')}</Badge>;
    }
    return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300">{t('patientPortal.badges.rescheduleRequestSent', 'Reschedule Request Sent')}</Badge>;
  };

  const getDoctorPresenceIndicator = (doctorId: string) => {
    const status = doctorPresenceMap[doctorId] || 'offline';
    const colors = {
      online: 'bg-green-500',
      away: 'bg-amber-500',
      offline: 'bg-gray-400'
    };
    return <span className={`inline-block w-3 h-3 rounded-full ${colors[status]} ring-2 ring-white`} title={status} />;
  };

  const getAppointmentDateTime = (apt: {
    date: string;
    time: string;
    reschedule_request_status?: string | null;
    reschedule_proposed_date?: string | null;
    reschedule_proposed_time?: string | null;
  }) => {
    const dateValue = isPendingRescheduleRequest(apt) ? String(apt.reschedule_proposed_date || apt.date) : apt.date;
    const timeValue = isPendingRescheduleRequest(apt) ? String(apt.reschedule_proposed_time || apt.time) : apt.time;
    return (
      appointmentLocalToDate(dateValue, timeValue, APPOINTMENT_BASE_TIME_ZONE) ||
      new Date(`${dateValue}T${timeValue}`)
    );
  };
  const hasAppointmentTimePassed = (apt: { date: string; time: string }) =>
    getAppointmentDateTime(apt).getTime() <= Date.now();
  const formatAppointmentDate = (apt: { date: string; time: string }) => formatDate(getAppointmentDateTime(apt));
  const formatAppointmentClockTime = (apt: { date: string; time: string }) =>
    formatTime(getAppointmentDateTime(apt), { hour: '2-digit', minute: '2-digit' }, formatClockTime(apt.time));
  const isPendingRescheduleRequest = useCallback((apt: {
    reschedule_request_status?: string | null;
  }) => normalizeRescheduleRequestStatus(apt.reschedule_request_status) === 'pending', []);
  const isPendingTabAppointment = (apt: {
    status?: string | null;
    reschedule_request_status?: string | null;
  }) => {
    const normalizedStatus = normalizeAppointmentStatus(apt.status);
    return (
      normalizedStatus === 'pending_approval'
      || normalizedStatus === 'pending_payment'
      || isPendingRescheduleRequest(apt)
    );
  };
  const isDoctorRequestedReschedule = (apt: {
    reschedule_requested_by?: string | null;
  }) => (apt.reschedule_requested_by || '').trim().toLowerCase() === 'doctor';
  const isPatientRequestedReschedule = (apt: {
    reschedule_requested_by?: string | null;
  }) => (apt.reschedule_requested_by || '').trim().toLowerCase() === 'patient';
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
  const getCalendarDisplayStatus = useCallback((apt: {
    status: string;
    reschedule_request_status?: string | null;
  }) => (
    normalizeRescheduleRequestStatus(apt.reschedule_request_status) === 'pending' ? 'pending_approval' : apt.status
  ), []);
  const hasEffectiveAppointmentTimePassed = (apt: {
    date: string;
    time: string;
    reschedule_request_status?: string | null;
    reschedule_proposed_date?: string | null;
    reschedule_proposed_time?: string | null;
  }) => {
    const dateValue = getCalendarAppointmentDate(apt);
    const timeValue = getCalendarAppointmentTime(apt);
    const effectiveDateTime =
      appointmentLocalToDate(dateValue, timeValue, APPOINTMENT_BASE_TIME_ZONE)
      || new Date(`${dateValue}T${timeValue}`);
    if (!Number.isNaN(effectiveDateTime.getTime())) {
      return effectiveDateTime.getTime() <= Date.now();
    }
    return hasAppointmentTimePassed(apt);
  };
  const filteredAppointmentsByStatus = useMemo(() => {
    if (!appointments) return [];
    
    let filtered;
    switch (appointmentStatusFilter) {
      case 'pending_payment':
        filtered = appointments.filter((apt) => apt.status === 'pending_payment');
        break;
      case 'pending_approval':
        filtered = appointments.filter((apt) => isPendingTabAppointment(apt as {
          status?: string | null;
          reschedule_request_status?: string | null;
        }));
        break;
      case 'confirmed':
        filtered = appointments.filter(
          (apt) =>
            (apt.status === 'confirmed' || apt.status === 'in_progress'),
        );
        break;
      case 'in_progress':
        filtered = appointments.filter((apt) => apt.status === 'in_progress');
        break;
      case 'completed':
        filtered = appointments.filter(apt => apt.status === 'completed');
        break;
      case 'cancelled':
        filtered = appointments.filter(apt => apt.status === 'cancelled');
        break;
      case 'no_show':
        filtered = appointments.filter(
          (apt) => apt.status === 'no_show' && !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
        );
        break;
      case 'closed':
        filtered = appointments.filter(
          (apt) =>
            (apt.status === 'cancelled' || apt.status === 'no_show') &&
            !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
        );
        break;
      case 'all':
      default:
        filtered = appointments;
    }
    
    return filtered.sort((a, b) => {
      if (appointmentStatusFilter === 'pending_payment' || appointmentStatusFilter === 'pending_approval') {
        const aRescheduleAt = (a as { reschedule_requested_at?: string | null }).reschedule_requested_at;
        const bRescheduleAt = (b as { reschedule_requested_at?: string | null }).reschedule_requested_at;
        const aTs = new Date(aRescheduleAt || a.created_at).getTime();
        const bTs = new Date(bRescheduleAt || b.created_at).getTime();
        return bTs - aTs;
      }

      if (appointmentStatusFilter === 'confirmed') {
        const nowTs = Date.now();
        const dateTimeA = getAppointmentDateTime(a).getTime();
        const dateTimeB = getAppointmentDateTime(b).getTime();
        const aIsPast = dateTimeA < nowTs;
        const bIsPast = dateTimeB < nowTs;

        if (aIsPast !== bIsPast) {
          return aIsPast ? 1 : -1;
        }

        return aIsPast ? (dateTimeB - dateTimeA) : (dateTimeA - dateTimeB);
      }

      if (appointmentStatusFilter === 'in_progress') {
        const dateTimeA = getAppointmentDateTime(a).getTime();
        const dateTimeB = getAppointmentDateTime(b).getTime();
        return dateTimeA - dateTimeB;
      }

      const dateTimeA = getAppointmentDateTime(a).getTime();
      const dateTimeB = getAppointmentDateTime(b).getTime();
      return dateTimeB - dateTimeA;
    });
  }, [appointments, appointmentStatusFilter]);

  useEffect(() => {
    if (appointmentStatusFilter === 'pending_payment' || appointmentStatusFilter === 'in_progress') {
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
  }, [filteredAppointmentsByStatus, getCalendarDisplayStatus]);

  const calendarStatusLegend = useMemo(() => {
    const seen = new Set<string>();
    return filteredAppointmentsByStatus
      .map((apt) => getCalendarDisplayStatus(apt as {
        status: string;
        reschedule_request_status?: string | null;
      }))
      .filter((status) => {
        if (seen.has(status)) return false;
        seen.add(status);
        return true;
      });
  }, [filteredAppointmentsByStatus]);
  const hasPastConfirmedInCalendar = useMemo(
    () => appointmentStatusFilter === 'confirmed' && filteredAppointmentsByStatus.some(
      (apt) => apt.status === 'confirmed'
        && !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null })
        && hasAppointmentTimePassed(apt),
    ),
    [filteredAppointmentsByStatus, appointmentStatusFilter],
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
      const displayStatus = getCalendarDisplayStatus(apt as {
        status: string;
        reschedule_request_status?: string | null;
      });
      const isPastConfirmed = appointmentStatusFilter === 'confirmed'
        && apt.status === 'confirmed'
        && !pendingReschedule
        && hasAppointmentTimePassed(apt);
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
        : (APPOINTMENT_STATUS_CALENDAR_STYLES[displayStatus as keyof typeof APPOINTMENT_STATUS_CALENDAR_STYLES] || APPOINTMENT_STATUS_CALENDAR_STYLES.default);
      const doctorName = getDoctorNameById((apt as { doctor_id?: string }).doctor_id, apt.specialist_name);
      return {
        id: apt.id,
        title: doctorName,
        start: `${eventDate}T${normalizeTime(eventTime)}`,
        allDay: false,
        backgroundColor: styles.bg,
        borderColor: styles.dot,
        textColor: styles.text,
        extendedProps: {
          status: displayStatus,
          sourceStatus: apt.status,
          appointmentDate: eventDate,
          isPastConfirmed,
          isPendingReschedule: pendingReschedule,
        }
      };
    });
  }, [filteredAppointmentsByStatus, appointmentStatusFilter, getCalendarDisplayStatus]);

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
    const pendingRescheduleSuffix = t('patientPortal.calendar.reschedulePendingSuffix', ' (Reschedule Pending)');
    const timePassedSuffix = t('patientPortal.calendar.timePassedSuffix', ' (Time Passed)');
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

  const renderAppointmentsCalendar = (emptyTitle: string, emptyDescription?: string) => {
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
                <span>{t('patientPortal.calendar.confirmedTimePassed', 'Confirmed (Time Passed)')}</span>
              </div>
            )}
            {hasPendingRescheduleInCalendar && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#2563eb' }} />
                <span>{t('patientPortal.calendar.reschedulePending', 'Reschedule Pending')}</span>
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
                {t('patientPortal.calendar.reviewAppointmentsForDay', 'Review appointments for the selected day.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {calendarDialogDayAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('patientPortal.empty.noAppointmentsFound', 'No appointments found')}
                </p>
              ) : (
                calendarDialogDayAppointments.map((apt) => (
                  <div key={apt.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{formatAppointmentClockTime(apt)}</span>
                        {getStatusBadge(apt.status)}
                        {getRescheduleRequestBadge(apt as { reschedule_request_status?: string | null; reschedule_requested_by?: string | null })}
                      </div>
                      <p className="text-sm font-semibold mt-1 truncate">
                        {getDoctorNameById((apt as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                      </p>
                      {isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }) && (
                        <p className="text-xs text-blue-700 mt-1 truncate">
                          {t('patientPortal.calendar.proposedSlotPrefix', 'Proposed')}:{' '}
                          {new Date(
                            String((apt as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || apt.date)
                          ).toLocaleDateString()} {t('common.at', 'at')} {(apt as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || apt.time}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 truncate">{cleanNotesForDisplay(apt.notes) || t('patientPortal.notes.none', 'No notes')}</p>
                      {formatConsultationLanguageFromNotes(apt.notes) && <p className="text-xs text-muted-foreground">{formatConsultationLanguageFromNotes(apt.notes)}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {apt.status === 'pending_payment' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            handlePayNow(apt);
                            setCalendarDayDialogOpen(false);
                          }}
                        >
                          Pay Now
                        </Button>
                      )}
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
              <DialogDescription>{t('patientPortal.calendar.manageSelectedAppointment', 'Manage the selected appointment.')}</DialogDescription>
            </DialogHeader>
            {calendarFocusedAppointment && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
                  <p className="text-sm font-semibold">
                    {getDoctorNameById((calendarFocusedAppointment as { doctor_id?: string }).doctor_id, calendarFocusedAppointment.specialist_name)}
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
                      <p className="font-medium">{t('patientPortal.calendar.proposedSlot', 'Proposed Slot')}</p>
                      <p>
                        {new Date(
                          String((calendarFocusedAppointment as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || calendarFocusedAppointment.date)
                        ).toLocaleDateString()}{' '}
                        {t('common.at', 'at')} {(calendarFocusedAppointment as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || '--:--'}
                      </p>
                    </div>
                  )}
                  {calendarFocusedAppointment.status === 'confirmed' && hasAppointmentTimePassed(calendarFocusedAppointment) && (
                    <p className="text-xs font-medium text-amber-700">
                      {t('patientPortal.calendar.appointmentTimePassedHint', 'Appointment time has passed. It remains confirmed until your doctor marks no-show or follow-up.')}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{cleanNotesForDisplay(calendarFocusedAppointment.notes) || t('patientPortal.notes.noneProvided', 'No notes provided.')}</p>
                  {formatConsultationLanguageFromNotes(calendarFocusedAppointment.notes) && <p className="text-sm text-muted-foreground">{formatConsultationLanguageFromNotes(calendarFocusedAppointment.notes)}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {(calendarFocusedAppointment.status === 'confirmed' || calendarFocusedAppointment.status === 'in_progress') && (
                    <JoinConsultationButton
                      appointmentId={calendarFocusedAppointment.id}
                      participantName={getDoctorNameById((calendarFocusedAppointment as { doctor_id?: string }).doctor_id, calendarFocusedAppointment.specialist_name)}
                      status={calendarFocusedAppointment.status}
                      consultationLanguage={getConsultationLanguageForAppointment(calendarFocusedAppointment as any)}
                      variant="default"
                      size="sm"
                    />
                  )}
                  {(calendarFocusedAppointment.status === 'confirmed' || calendarFocusedAppointment.status === 'completed') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        openMessagesForAppointment(calendarFocusedAppointment);
                        setCalendarEventDialogOpen(false);
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {t('patientPortal.actions.message', 'Message')}
                    </Button>
                  )}
                  {calendarFocusedAppointment.status === 'completed' && !(calendarFocusedAppointment as any).rating && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedAppointment(calendarFocusedAppointment);
                        setReviewModalOpen(true);
                        setCalendarEventDialogOpen(false);
                      }}
                    >
                      {t('patientPortal.actions.leaveReview', 'Leave Review')}
                    </Button>
                  )}
                  {calendarFocusedAppointment.status === 'pending_payment' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          handlePayNow(calendarFocusedAppointment);
                          setCalendarEventDialogOpen(false);
                        }}
                      >
                        Pay Now
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setCancelAppointmentId((calendarFocusedAppointment as { id?: string }).id ?? null);
                          setCalendarEventDialogOpen(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                  {!isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    (calendarFocusedAppointment.status === 'pending_approval' ||
                      calendarFocusedAppointment.status === 'confirmed' ||
                      calendarFocusedAppointment.status === 'no_show') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        initReschedule(calendarFocusedAppointment);
                        setCalendarEventDialogOpen(false);
                      }}
                    >
                      Reschedule
                    </Button>
                  )}
                  {!isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    (calendarFocusedAppointment.status === 'pending_approval' ||
                      calendarFocusedAppointment.status === 'confirmed') && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setCancelAppointmentId((calendarFocusedAppointment as { id?: string }).id ?? null);
                        setCalendarEventDialogOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  {isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) &&
                    isDoctorRequestedReschedule(calendarFocusedAppointment as { reschedule_requested_by?: string | null }) && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          respondToRescheduleRequest(calendarFocusedAppointment.id, 'approve');
                          setCalendarEventDialogOpen(false);
                        }}
                        disabled={isBooking}
                      >
                        Accept New Slot
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30"
                        onClick={() => {
                          respondToRescheduleRequest(calendarFocusedAppointment.id, 'decline');
                          setCalendarEventDialogOpen(false);
                        }}
                        disabled={isBooking}
                      >
                        Decline Request
                      </Button>
                    </>
                  )}
                  {calendarFocusedAppointment.status === 'no_show' &&
                    !isPendingRescheduleRequest(calendarFocusedAppointment as { reschedule_request_status?: string | null }) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCalendarEventDialogOpen(false);
                        openBooking();
                      }}
                    >
                      Book Another Doctor
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const pendingApprovalCount = appointments.filter((apt) => {
    if (!isPendingTabAppointment(apt as { status?: string | null; reschedule_request_status?: string | null })) {
      return false;
    }
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
  }).length;

  const confirmedCount = appointments.filter((apt) => {
    if (apt.status !== 'confirmed') return false;
    if ((apt as any).date && (apt as any).time) {
      return !hasAppointmentTimePassed(apt as { date: string; time: string });
    }
    return true;
  }).length;
  const closedCount = appointments.filter((apt) =>
    (apt.status === 'cancelled' || apt.status === 'no_show')
    && !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
  ).length;
  const overviewKpis = useMemo(() => {
    const upcomingAppointments = appointments.filter((apt) => {
      const status = String(apt.status || '').trim().toLowerCase();
      const isUpcomingStatus = ['pending_payment', 'pending_approval', 'confirmed', 'in_progress'].includes(status);
      if (!isUpcomingStatus) return false;
      return !hasEffectiveAppointmentTimePassed(apt as {
        date: string;
        time: string;
        reschedule_request_status?: string | null;
        reschedule_proposed_date?: string | null;
        reschedule_proposed_time?: string | null;
      });
    }).length;
    const completedAppointments = appointments.filter((apt) => apt.status === 'completed').length;
    const pendingApprovalAppointments = appointments.filter((apt) => apt.status === 'pending_approval').length;
    const pendingPaymentAppointments = appointments.filter((apt) => apt.status === 'pending_payment').length;
    const rescheduleResponseNeeded = appointments.filter((apt) =>
      isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }) &&
      isDoctorRequestedReschedule(apt as { reschedule_requested_by?: string | null }),
    ).length;
    const missedAppointments = appointments.filter((apt) =>
      apt.status === 'no_show' &&
      !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
    ).length;
    const actionNeeded = pendingPaymentAppointments + rescheduleResponseNeeded;
    const activePrescriptions = fetchedPrescriptions.filter((prescription) => prescription.status === 'active').length;

    return {
      upcomingAppointments,
      completedAppointments,
      pendingApprovalAppointments,
      pendingPaymentAppointments,
      rescheduleResponseNeeded,
      missedAppointments,
      actionNeeded,
      activePrescriptions,
    };
  }, [
    appointments,
    fetchedPrescriptions,
    hasEffectiveAppointmentTimePassed,
    isPendingRescheduleRequest,
    isDoctorRequestedReschedule,
  ]);

  const handlePayNow = async (apt: any) => {
    if (!user) {
      toast({ title: 'Please sign in', description: 'You must be signed in to pay for this appointment.' });
      navigate('/auth');
      return;
    }
    if (!paystackPublicKey) {
      toast({ title: 'Payment not configured', description: 'Payment gateway not configured. Contact support.', variant: 'destructive' });
      return;
    }

    try {
      // For existing pending_payment appointments, use PaymentService to initialize payment
      const { data: paymentInitData, error: paymentInitError } = await supabase.functions.invoke('payment-initialize', {
        body: {
          appointmentId: apt.id,
          patientId: user.id,
          type: 'appointment_confirmation',
        }
      });

      if (paymentInitError) throw paymentInitError;
      const paymentInit = paymentInitData as any;

      let paymentCompleted = false;
      let paymentWatchdogTriggered = false;
      const paymentWatchdog = window.setTimeout(() => {
        if (paymentCompleted) return;
        paymentWatchdogTriggered = true;
        toast({
          title: 'Payment window timed out',
          description: 'Paystack took too long to respond. Please close it and try again.',
          variant: 'destructive',
        });
      }, 90000);
      await initializePayment({
        email: paymentInit?.email || user.email || '',
        amount: paymentInit?.amountInKobo,
        reference: paymentInit?.reference,
        accessCode: paymentInit?.accessCode,
        authorizationUrl: paymentInit?.authorizationUrl,
        preferRedirect: true,
        publicKey: paystackPublicKey,
        metadata: paymentInit?.metadata,
        onSuccess: async (response: any) => {
          if (paymentWatchdogTriggered) return;
          window.clearTimeout(paymentWatchdog);
          paymentCompleted = true;
          const paidReference = String(response?.reference || paymentInit?.reference || '').trim();

          try {
            let confirmResult: { error?: string; alreadyProcessed?: boolean } | null = null;
            let lastConfirmError: any = null;

            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                const confirmData = await BookingService.confirmPayment(paidReference);
                
                const parsed = (confirmData || {}) as { error?: string; alreadyProcessed?: boolean };
                if (parsed.error) throw new Error(parsed.error);
                confirmResult = parsed;
                lastConfirmError = null;
                break;
              } catch (attemptError: any) {
                lastConfirmError = attemptError;
                if (attempt < 2) {
                  await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
                }
              }
            }

            if (!confirmResult) {
              throw lastConfirmError || new Error('Payment confirmation failed');
            }

            toast({
              title: 'Payment successful',
              description: confirmResult.alreadyProcessed
                ? 'This payment was already processed and your appointment remains pending approval.'
                : 'Your appointment has been confirmed.',
            });
          } catch (confirmErr: any) {
            console.warn('[patient-portal] booking payment client confirmation failed:', confirmErr);
            toast({
              title: 'Payment successful',
              description: 'Payment succeeded. Your appointment will appear once confirmation processing completes.',
            });
          } finally {
            invalidateAppointments();
            setTimeout(() => navigate('/patient-portal?tab=appointments'), 600);
          }
        },
        onClose: () => {
          window.clearTimeout(paymentWatchdog);
          if (paymentCompleted) return;
          toast({ title: 'Payment cancelled', description: 'You cancelled the payment process.' });
        },
      });
    } catch (err: any) {
      console.error('Payment init error', err);
      toast({ title: 'Payment error', description: err?.message || 'Unable to start payment.', variant: 'destructive' });
    }
  };

  const appointmentViewToggleButtonBaseClass = 'h-8 flex-1 sm:flex-none gap-1';
  const appointmentStatusTriggerClass = 'relative h-10 w-full border border-transparent px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-background/70 sm:text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-border data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border';

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-2 sm:px-4">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2">
                <img src={logoImage} alt="MyE-Doctor Logo" className="h-10 w-auto" />
                <div className="flex flex-col">
                  <span className="text-xl font-bold leading-tight">
                    MyE-<span className="text-primary">Doctor</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Powered by HealthLink</span>
                </div>
              </Link>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('patientPortal.searchPlaceholder', 'Search doctors, appointments...')}
                  className="pl-10 w-48 sm:w-64 bg-muted/50"
                />
              </div>

              <Button variant="ghost" size="icon" className="relative" onClick={() => setActiveTab('overview')}>
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[10px] text-accent-foreground rounded-full flex items-center justify-center">
                    {formatNumber(notifications.filter(n => !n.read).length)}
                  </span>
                )}
              </Button>

              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hidden lg:flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                    <Avatar className="w-9 h-9">
                      <AvatarImage key={profilePictureKey} src={profilePicture} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:block text-left">
                      <p className="text-sm font-medium">{displayName}</p>
                      <p className="text-xs text-muted-foreground">{t('patientPortal.rolePatient', 'Patient')}</p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
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
                      <AvatarImage key={profilePictureKey} src={profilePicture} />
                      <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{displayName}</p>
                      <p className="text-sm text-muted-foreground">{t('patientPortal.rolePatient', 'Patient')}</p>
                    </div>
                  </div>
                </div>

                <nav className="space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto lg:max-h-none">
                  {[
                    { id: 'overview', label: t('common.overview', 'Overview'), icon: Activity },
                    { id: 'appointments', label: t('common.appointments', 'Appointments'), icon: Calendar },
                    { id: 'prescriptions', label: t('common.prescriptions', 'Prescriptions'), icon: Pill },
                    {
                      id: 'messages',
                      label: t('common.messages', 'Messages'),
                      icon: MessageSquare,
                      badge: unreadMessagesCount > 0 ? (unreadMessagesCount > 99 ? `${formatNumber(99)}+` : formatNumber(unreadMessagesCount)) : undefined,
                      badgeTone: 'danger' as const
                    },
                    {
                      id: 'coo-messages',
                      label: 'COO Messages',
                      icon: MessageSquare,
                      badge: unreadCooCount > 0 ? (unreadCooCount > 99 ? '99+' : unreadCooCount) : undefined,
                      badgeTone: 'danger' as const
                    },
                    { id: 'records', label: t('patientPortal.recordsTab', 'Investigations'), icon: FileText },
                    { id: 'payments', label: t('common.payments', 'Payments'), icon: Wallet },
                    { id: 'contact', label: 'Contact MyE-Doctor', icon: Phone, badge: unreadContactCount > 0 ? (unreadContactCount > 99 ? '99+' : unreadContactCount) : undefined, badgeTone: 'danger' as const },
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
                          {item.badge}
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
            {/* Welcome Banner */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg md:rounded-2xl gradient-primary p-4 md:p-8 text-primary-foreground"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
                <div>
                  <h1 className="text-lg sm:text-2xl md:text-3xl font-bold mb-1 md:mb-2">
                    {t('patientPortal.welcomeBackUser', 'Welcome back, {name}! 👋')
                      .replace('{name}', displayName.split(' ')[0])}
                  </h1>
                  <p className="text-xs sm:text-sm text-primary-foreground/80">
                    You have {appointments.filter(apt => {
                      const appointmentDate = new Date(apt.date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return appointmentDate >= today && ['pending_payment', 'pending_approval', 'confirmed', 'in_progress'].includes(apt.status);
                    }).length} upcoming appointments.
                  </p>
                </div>
                <Button onClick={openBooking} variant="secondary" size="sm" className="gap-1 text-xs sm:text-sm">
                  <Plus className="w-4 sm:w-5 h-4 sm:h-5" />
                  <span className="hidden sm:inline">{t('patientPortal.bookAppointment', 'Book Appointment')}</span>
                  <span className="sm:hidden">{t('patientPortal.bookShort', 'Book')}</span>
                </Button>
              </div>
            </motion.div>

            {/* Slot Selection Modal */}
            <SlotSelectionModal
              open={slotSelectionOpen}
              onOpenChange={setSlotSelectionOpen}
              slots={allSlots}
              isLoading={slotsLoading || doctorsLoading}
              onSlotSelect={handleSlotSelect}
              doctorId={rescheduleDoctorId}
              mode="reschedule"
              currentDurationMinutes={currentRescheduleDurationMinutes}
              selectedDurationMinutes={rescheduleDurationMinutes}
              onDurationChange={setRescheduleDurationMinutes}
              currentConsultationType={currentRescheduleConsultationType}
              selectedConsultationType={rescheduleConsultationType}
              onConsultationTypeChange={setRescheduleConsultationType}
              reschedulePricingPreview={{
                proposedFinalPrice: proposedRescheduleFinalPrice,
                previewLoading: reschedulePreviewLoading || reschedulePreviewFetching,
                alreadyPaidAmount: reschedulePaidAmount !== null ? reschedulePaidAmount : currentRescheduleFinalPrice,
                upgradeAmount: rescheduleUpgradeAmount,
                walletAppliedIfSelected: rescheduleHybridWalletApplied,
                paystackDueIfSelected: rescheduleHybridPaystackDue,
              }}
            />

            {/* Reschedule Confirmation Modal */}
            <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
              <DialogContent className="w-[95vw] max-w-3xl max-h-[92vh] overflow-hidden p-0">
                <DialogHeader className="px-5 pt-5 pb-1 sm:px-6 sm:pt-6">
                  <DialogTitle>{t('patientPortal.reschedule.confirmTitle', 'Confirm Reschedule Request')}</DialogTitle>
                  <DialogDescription>
                    {rescheduleUpgradeAmount > 0 
                      ? t('patientPortal.reschedule.reviewChangesAndPayment', 'Review the appointment changes and payment details')
                      : t('patientPortal.reschedule.reviewAndConfirmNewTime', 'Review and confirm your new appointment time')}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid max-h-[calc(92vh-160px)] gap-4 overflow-y-auto px-5 py-4 sm:px-6">
                  {rescheduleAppointment && (
                    <>
                      <div className="p-3 rounded-lg border border-border bg-background/60">
                        <p className="text-sm font-medium mb-2">{t('patientPortal.reschedule.currentAppointment', 'Current Appointment')}</p>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.doctorLabel', 'Doctor')}:</span>{' '}
                            {getDoctorNameById((rescheduleAppointment as { doctor_id?: string }).doctor_id, rescheduleAppointment.specialist_name)}
                          </div>
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.dateTimeLabel', 'Date & Time')}:</span>{' '}
                            {new Date(rescheduleAppointment.date).toLocaleDateString()} {t('common.at', 'at')} {rescheduleAppointment.time}
                          </div>
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.durationLabel', 'Duration')}:</span>{' '}
                            {currentRescheduleDurationMinutes} min
                          </div>
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.modeLabel', 'Mode')}:</span>{' '}
                            {currentRescheduleConsultationType.charAt(0).toUpperCase() + currentRescheduleConsultationType.slice(1)}
                          </div>
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.pricePaidLabel', 'Price Paid')}:</span>{' '}
                            ₦{(reschedulePaidAmount !== null ? reschedulePaidAmount : currentRescheduleFinalPrice).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-sm font-medium mb-2">{t('patientPortal.reschedule.newAppointment', 'New Appointment')}</p>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.doctorLabel', 'Doctor')}:</span>{' '}
                            {specialistName}
                          </div>
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.dateTimeLabel', 'Date & Time')}:</span>{' '}
                            {new Date(bookingDate).toLocaleDateString()} {t('common.at', 'at')} {bookingTime}
                          </div>
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.durationLabel', 'Duration')}:</span>{' '}
                            {rescheduleDurationMinutes} min
                          </div>
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.modeLabel', 'Mode')}:</span>{' '}
                            {rescheduleConsultationType.charAt(0).toUpperCase() + rescheduleConsultationType.slice(1)}
                          </div>
                          <div>
                            <span className="text-foreground font-medium">{t('patientPortal.reschedule.newPriceLabel', 'New Price')}:</span>{' '}
                            {reschedulePreviewLoading || reschedulePreviewFetching
                              ? t('patientPortal.reschedule.calculating', 'Calculating...')
                              : `₦${proposedRescheduleFinalPrice.toLocaleString()}`}
                          </div>
                        </div>
                      </div>

                      {rescheduleUpgradeAmount > 0 && (
                        <>
                          <div className="rounded-lg border border-border bg-background/60 p-3">
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('patientPortal.reschedule.newPriceLabel', 'New Price')}</span>
                                <span className="font-medium">₦{proposedRescheduleFinalPrice.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('patientPortal.reschedule.alreadyPaidLabel', 'Already Paid')}</span>
                                <span className="font-medium">₦{(reschedulePaidAmount !== null ? reschedulePaidAmount : 0).toLocaleString()}</span>
                              </div>
                              <div className="border-t pt-2 flex items-center justify-between">
                                <span className="font-medium">{t('patientPortal.reschedule.balanceToPayLabel', 'Balance to Pay')}</span>
                                <span className="font-semibold text-amber-700">₦{rescheduleUpgradeAmount.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-2">
                            <p className="text-sm font-medium mb-2">{t('patientPortal.reschedule.paymentMethod', 'Payment Method')}</p>
                            <div className="flex items-center gap-3 text-sm">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="reschedule-payment-method"
                                  value="paystack"
                                  checked={reschedulePaymentMethod === 'paystack'}
                                  onChange={() => setReschedulePaymentMethod('paystack')}
                                />
                                <span>{t('patientPortal.reschedule.paystackRecommended', 'Paystack (recommended)')}</span>
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="reschedule-payment-method"
                                  value="wallet"
                                  checked={reschedulePaymentMethod === 'wallet'}
                                  onChange={() => setReschedulePaymentMethod('wallet')}
                                />
                                <span>{t('patientPortal.reschedule.useWallet', 'Use Wallet')}</span>
                              </label>
                            </div>
                          </div>

                          {reschedulePaymentMethod === 'wallet' && (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                              {rescheduleHybridPaystackDue > 0
                                ? `Wallet applies ₦${rescheduleHybridWalletApplied.toLocaleString()} and remaining ₦${rescheduleHybridPaystackDue.toLocaleString()} continues via Paystack automatically.`
                                : `Wallet covers the full upgrade amount of ₦${rescheduleUpgradeAmount.toLocaleString()}.`}
                            </div>
                          )}
                        </>
                      )}

                      <div>
                        <label className="text-sm font-medium">{t('patientPortal.reschedule.noteOptional', 'Note (optional)')}</label>
                        <textarea
                          className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
                          rows={2}
                          value={rescheduleRequestNote}
                          onChange={(e) => setRescheduleRequestNote(e.target.value)}
                          placeholder={t('patientPortal.reschedule.notePlaceholder', 'Add any context about this reschedule request...')}
                        />
                      </div>

                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs text-emerald-900">
                        {t('patientPortal.reschedule.submitHint', 'This submits a reschedule request for doctor approval. Your current appointment remains scheduled until the request is approved.')}
                      </div>
                    </>
                  )}
                </div>

                <DialogFooter className="border-t bg-background px-5 py-4 sm:px-6">
                  <Button variant="outline" onClick={() => {
                    setBookingOpen(false);
                    setSlotSelectionOpen(true);
                  }}>
                    {t('patientPortal.back', 'Back')}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setBookingOpen(false)}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button
                    onClick={rescheduleBooking}
                    disabled={isBooking}
                  >
                    {isBooking
                      ? t('common.submitting', 'Submitting...')
                      : rescheduleUpgradeAmount > 0
                      ? (effectiveReschedulePaymentMethod === 'wallet'
                        ? t('patientPortal.reschedule.confirmReschedule', 'Confirm Reschedule')
                        : t('patientPortal.reschedule.proceedToPayment', 'Proceed to Payment'))
                      : t('patientPortal.reschedule.confirmReschedule', 'Confirm Reschedule')}
                  </Button>
                </DialogFooter>
                <DialogClose />
              </DialogContent>
            </Dialog>

            {/* Cancellation Confirmation Modal */}
            <Dialog open={!!cancelAppointmentId} onOpenChange={(open) => !open && setCancelAppointmentId(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel Appointment</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to cancel this appointment? Paid appointments are refunded to your wallet balance.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCancelAppointmentId(null)}>{t('patientPortal.noKeepIt', 'No, Keep It')}</Button>
                  <Button variant="destructive" onClick={cancelAppointment} disabled={isBooking}>
                    {isBooking
                      ? t('patientPortal.cancelling', 'Cancelling...')
                      : t('patientPortal.yesCancelAppointment', 'Yes, Cancel Appointment')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={withdrawDialogOpen}
              onOpenChange={(open) => {
                setWithdrawDialogOpen(open);
                if (open) {
                  setWithdrawIdempotencyKey((prev) => prev || createWithdrawalIdempotencyKey());
                  return;
                }
                if (!open) {
                  setWithdrawAmount('');
                  setWithdrawNarration('');
                  setWithdrawIdempotencyKey(null);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('patientPortal.wallet.requestWithdrawal', 'Request Withdrawal')}</DialogTitle>
                  <DialogDescription>
                    {t('patientPortal.wallet.withdrawalDescription', 'Submit a withdrawal request from your available wallet balance. Include your bank details in the note if needed.')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    {t('patientPortal.wallet.availableBalance', 'Available Balance')}: <span className="font-semibold">₦{patientWalletBalance.toLocaleString()}</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{t('patientPortal.wallet.amountLabel', 'Amount (₦)')}</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{t('patientPortal.wallet.noteOptional', 'Note (optional)')}</label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background p-2 text-sm"
                      rows={3}
                      value={withdrawNarration}
                      onChange={(e) => setWithdrawNarration(e.target.value)}
                      placeholder={t('patientPortal.wallet.notePlaceholder', 'Add payout account details or note for this request')}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('patientPortal.wallet.withdrawalProcessingHint', 'Withdrawal requests are processed manually within 48 hours and marked completed after transfer.')}
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWithdrawDialogOpen(false);
                      setWithdrawAmount('');
                      setWithdrawNarration('');
                      setWithdrawIdempotencyKey(null);
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button onClick={submitWalletWithdrawalRequest} disabled={!canSubmitWithdrawal}>
                    {isSubmittingWithdrawal
                      ? t('common.submitting', 'Submitting...')
                      : t('patientPortal.wallet.submitWithdrawalRequest', 'Submit Request')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Tabs Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="hidden">
                <TabsTrigger value="overview">{t('common.overview', 'Overview')}</TabsTrigger>
                <TabsTrigger value="payments">{t('common.payments', 'Payments')}</TabsTrigger>
                <TabsTrigger value="appointments">{t('common.appointments', 'Appointments')}</TabsTrigger>
                <TabsTrigger value="prescriptions">{t('common.prescriptions', 'Prescriptions')}</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <Card className="border-primary/15">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{t('patientPortal.kpi.careSnapshot', 'Care Snapshot')}</CardTitle>
                        <CardDescription>{t('patientPortal.kpi.careSnapshotHint', 'A quick view of your appointment and treatment journey.')}</CardDescription>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => setActiveTab('appointments')}
                      >
                        {t('common.appointments', 'Appointments')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.kpi.upcomingAppointments', 'Upcoming')}</p>
                        <p className="text-lg font-semibold">{overviewKpis.upcomingAppointments}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.kpi.actionNeeded', 'Action Needed')}</p>
                        <p className="text-lg font-semibold text-amber-700">{overviewKpis.actionNeeded}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.kpi.pendingApproval', 'Pending Approval')}</p>
                        <p className="text-lg font-semibold text-blue-700">{overviewKpis.pendingApprovalAppointments}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.kpi.completedAppointments', 'Completed')}</p>
                        <p className="text-lg font-semibold">{overviewKpis.completedAppointments}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.kpi.missedAppointments', 'Missed (No-show)')}</p>
                        <p className="text-lg font-semibold text-destructive">{overviewKpis.missedAppointments}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.kpi.activePrescriptions', 'Active Prescriptions')}</p>
                        <p className="text-lg font-semibold text-emerald-700">{overviewKpis.activePrescriptions}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t(
                        'patientPortal.kpi.actionNeededHint',
                        'Action Needed includes pending payments and doctor-proposed reschedule requests awaiting your response.',
                      )}
                    </p>
                  </CardContent>
                </Card>

                {!isPwaInstalled ? (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-sm">
                        {t('patientPortal.installBannerTextPrefix', 'Install our mobile app for faster access. Click')} <span className="font-semibold">{t('patientPortal.downloadApp', 'Download App')}</span> {t('patientPortal.installBannerTextSuffix', 'to install on your phone.')}
                      </p>
                      <Button size="sm" className="gap-2" onClick={handleInstallApp}>
                        <Download className="w-4 h-4" />
                        {t('common.installApp', 'Install App')}
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Upcoming Appointments */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>{t('patientPortal.headers.upcomingAppointments', 'Upcoming Appointments')}</CardTitle>
                      <CardDescription>{t('patientPortal.headers.scheduledConsultations', 'Your scheduled consultations')}</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('appointments')}>
                      {t('common.viewAll', 'View All')} <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {appointmentsLoading ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">{t('patientPortal.loading.appointments', 'Loading appointments...')}</p>
                      </div>
                    ) : appointments.filter(apt => {
                      const appointmentDate = new Date(apt.date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return appointmentDate >= today && ['pending_payment', 'pending_approval', 'confirmed', 'in_progress'].includes(apt.status);
                    }).length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">{t('patientPortal.empty.noUpcomingAppointments', 'No upcoming appointments')}</p>
                        <Button onClick={openBooking} variant="outline" size="sm" className="mt-4 gap-2">
                          <Plus className="w-4 h-4" />
                          {t('common.bookNow', 'Book Now')}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {appointments.filter(apt => {
                          const appointmentDate = new Date(apt.date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return appointmentDate >= today && ['pending_payment', 'pending_approval', 'confirmed', 'in_progress'].includes(apt.status);
                        }).slice(0, 3).map((apt) => (
                          <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                            <div className="flex items-center gap-4 mb-3 sm:mb-0">
                              <div className="relative">
                                <Avatar>
                                  <AvatarImage src={(apt as any).doctor_profile_picture || ''} />
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)
                                      .split(' ')
                                      .map((n) => n[0])
                                      .join('')
                                      .slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="absolute bottom-0 right-0">
                                  {getDoctorPresenceIndicator((apt as unknown as { doctor_id?: string }).doctor_id || '')}
                                </div>
                              </div>
                              <div>
                                <p className="font-medium">{getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}</p>
                                <p className="text-sm text-muted-foreground">{t('common.appointments', 'Appointments')}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm">{formatDate(getAppointmentDateTime(apt), { month: 'short', day: 'numeric' })}</span>
                                <Clock className="w-4 h-4 text-muted-foreground ml-2" />
                                <span className="text-sm">{formatAppointmentClockTime(apt)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(apt.status)}
                                {getRescheduleRequestBadge(apt as any)}
                              </div>
                              {isPendingRescheduleRequest(apt as any) && isDoctorRequestedReschedule(apt as any) ? (
                                <div className="flex flex-col gap-2 mt-1">
                                  <Button size="sm" onClick={() => respondToRescheduleRequest(apt.id, 'approve')} disabled={isBooking} className="w-full sm:w-auto gradient-primary">
                                    Accept New Slot
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive border-destructive/30 w-full sm:w-auto"
                                    onClick={() => respondToRescheduleRequest(apt.id, 'decline')}
                                    disabled={isBooking}
                                  >
                                    Decline
                                  </Button>
                                </div>
                              ) : (
                                (apt.status === 'confirmed' || apt.status === 'in_progress') && (
                                  <JoinConsultationButton
                                    appointmentId={apt.id}
                                    participantName={getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                                    status={apt.status}
                                    consultationLanguage={getConsultationLanguageForAppointment(apt as any)}
                                    variant="default"
                                    size="sm"
                                    className="w-full sm:w-auto"
                                  />
                                )
                              )}
                              {(apt.status === 'confirmed' || apt.status === 'in_progress') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full sm:w-auto"
                                  onClick={() => openMessagesForAppointment(apt)}
                                >
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  {t('patientPortal.actions.message', 'Message')}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Past Consultations */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('patientPortal.headers.recentConsultations', 'Recent Consultations')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {consultationsLoading ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">{t('patientPortal.loading.consultations', 'Loading consultations...')}</p>
                        </div>
                      ) : recentConsultations.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">{t('patientPortal.empty.noRecentConsultations', 'No recent consultations')}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {recentConsultations.slice(0, 2).map((consultation) => (
                            <div key={consultation.id} className="flex items-start justify-between">
                              <div>
                                <p className="font-medium text-sm">{consultation.doctor_name}</p>
                                <p className="text-xs text-muted-foreground">{consultation.diagnosis}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatDate(consultation.date)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                {consultation.rating ? (
                                  [...Array(5)].map((_, i) => (
                                    <Star
                                      key={i}
                                      className={`w-3 h-3 ${i < consultation.rating!
                                        ? 'text-warning fill-warning'
                                        : 'text-muted'
                                        }`}
                                    />
                                  ))
                                ) : (
                                  <span className="text-xs text-muted-foreground">{t('patientPortal.empty.noRating', 'No rating')}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Notifications */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('patientPortal.headers.notifications', 'Notifications')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {notificationsLoading ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">{t('patientPortal.loading.notifications', 'Loading notifications...')}</p>
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">{t('patientPortal.empty.noNewNotifications', 'No new notifications')}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {notifications.slice(0, 3).map((notification) => (
                            <div key={notification.id} className="flex items-start gap-3">
                              <div className={`w-2 h-2 rounded-full mt-2 ${notification.read ? 'bg-muted' : 'bg-primary'}`} />
                              <div>
                                <p className="text-sm">{notification.message}</p>
                                <p className="text-xs text-muted-foreground mt-1">{notification.time}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Payments Tab */}
              <TabsContent value="payments" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle>{t('common.payments', 'Payments')}</CardTitle>
                        <CardDescription>{t('patientPortal.payments.manageWalletAndTransactions', 'View wallet balance, transactions, and withdrawal requests in one place.')}</CardDescription>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setWithdrawIdempotencyKey(createWithdrawalIdempotencyKey());
                          setWithdrawDialogOpen(true);
                        }}
                        disabled={patientWalletBalance <= 0}
                      >
                        {t('patientPortal.wallet.requestWithdrawal', 'Request Withdrawal')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="rounded-lg border border-border p-3 bg-primary/5">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.wallet.balance', 'Wallet Balance')}</p>
                        <p className="text-xl font-semibold">₦{patientWalletBalance.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.wallet.pendingWithdrawals', 'Pending Withdrawals')}</p>
                        <p className="text-xl font-semibold">{pendingWalletWithdrawalsCount}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.payments.totalCredits', 'Wallet Credits')}</p>
                        <p className="text-xl font-semibold text-emerald-700">₦{walletSummary.creditTotal.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/20">
                        <p className="text-xs text-muted-foreground">{t('patientPortal.payments.totalDebits', 'Wallet Debits')}</p>
                        <p className="text-xl font-semibold text-amber-700">₦{walletSummary.debitTotal.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-border p-4 bg-muted/10">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('patientPortal.payments.totalTransactions', 'Payment Transactions')}</p>
                          <p className="font-semibold">{paymentSummary.totalCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('patientPortal.payments.successful', 'Successful')}</p>
                          <p className="font-semibold text-emerald-700">{paymentSummary.successfulCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('patientPortal.payments.pending', 'Pending')}</p>
                          <p className="font-semibold text-amber-700">{paymentSummary.pendingCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('patientPortal.payments.failed', 'Failed')}</p>
                          <p className="font-semibold text-destructive">{paymentSummary.failedCount}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{t('patientPortal.payments.paymentTransactions', 'Payment Transactions')}</CardTitle>
                      <CardDescription>{t('patientPortal.payments.paymentTransactionsHint', 'Paystack and wallet-linked payment intents for your appointments.')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {paymentTransactionsLoading ? (
                        <p className="text-sm text-muted-foreground">{t('patientPortal.loading.transactions', 'Loading transactions...')}</p>
                      ) : paymentTransactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('patientPortal.empty.noPaymentTransactions', 'No payment transactions yet.')}</p>
                      ) : (
                        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                          {paymentTransactions.map((payment) => (
                            <div key={payment.id} className="rounded-lg border border-border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge className={getPaymentStatusBadgeClass(payment.status)}>
                                    {getPaymentStatusLabel(payment.status)}
                                  </Badge>
                                  <Badge variant="outline">
                                    {String(payment.provider || payment.payment_method || 'Unknown').toUpperCase()}
                                  </Badge>
                                </div>
                                <p className="font-semibold">₦{Number(payment.amount || 0).toLocaleString()}</p>
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground space-y-1">
                                <p>{t('common.createdAt', 'Created')}: {formatDateTime(payment.created_at)}</p>
                                {payment.verified_at ? <p>{t('common.verified', 'Verified')}: {formatDateTime(payment.verified_at)}</p> : null}
                                {payment.payment_reference ? <p>{t('patientPortal.payments.reference', 'Reference')}: {payment.payment_reference}</p> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{t('patientPortal.wallet.ledger', 'Wallet Ledger')}</CardTitle>
                      <CardDescription>{t('patientPortal.wallet.ledgerHint', 'All wallet credits and debits linked to your account.')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {walletTransactionsLoading ? (
                        <p className="text-sm text-muted-foreground">{t('patientPortal.loading.walletTransactions', 'Loading wallet ledger...')}</p>
                      ) : walletTransactions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('patientPortal.empty.noWalletTransactions', 'No wallet ledger entries yet.')}</p>
                      ) : (
                        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                          {walletTransactions.map((tx) => {
                            const isCredit = String(tx.direction || '').toLowerCase() === 'credit';
                            return (
                              <div key={tx.id} className="rounded-lg border border-border p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge className={isCredit ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>
                                      {isCredit ? t('patientPortal.wallet.credit', 'Credit') : t('patientPortal.wallet.debit', 'Debit')}
                                    </Badge>
                                    <span className="text-sm font-medium">{getWalletTransactionLabel(tx)}</span>
                                  </div>
                                  <p className={`font-semibold ${isCredit ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {isCredit ? '+' : '-'}₦{Number(tx.amount || 0).toLocaleString()}
                                  </p>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                                  <p>{t('common.createdAt', 'Created')}: {formatDateTime(tx.created_at)}</p>
                                  {tx.narration ? <p>{tx.narration}</p> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t('patientPortal.wallet.requestWithdrawal', 'Withdrawal Requests')}</CardTitle>
                    <CardDescription>{t('patientPortal.wallet.withdrawalRequestsHint', 'Track payout processing status and transfer references.')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {walletWithdrawalRequests.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('patientPortal.empty.noWithdrawalRequests', 'No withdrawal requests yet.')}</p>
                    ) : (
                      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        {walletWithdrawalRequests.map((request) => (
                          <div key={request.id} className="rounded-lg border border-border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge className={getWithdrawalStatusBadgeClass(request.status)}>
                                {getWithdrawalStatusLabel(request.status)}
                              </Badge>
                              <span className="text-sm font-semibold">₦{Number(request.amount || 0).toLocaleString()}</span>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground space-y-1">
                              <p>{t('common.createdAt', 'Requested')}: {formatDateTime(request.created_at)}</p>
                              {request.sla_due_at ? <p>{t('patientPortal.wallet.expectedBy', 'Expected by')}: {formatDateTime(request.sla_due_at)}</p> : null}
                              {request.completed_at ? <p>{t('common.completed', 'Completed')}: {formatDateTime(request.completed_at)}</p> : null}
                              {request.payout_reference ? <p>{t('patientPortal.wallet.transferReference', 'Transfer ref')}: {request.payout_reference}</p> : null}
                              {request.admin_note ? <p>{request.admin_note}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Appointments Tab */}
              <TabsContent value="appointments" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <CardTitle>{t('common.appointments', 'Appointments')}</CardTitle>
                        <CardDescription>{t('patientPortal.headers.manageAppointments', 'Manage all your appointments in one place')}</CardDescription>
                      </div>
                      <div className="flex w-full flex-col sm:w-auto sm:flex-row sm:items-center gap-2">
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
                        <Button onClick={openBooking} className="w-full sm:w-auto gap-2">
                          <Plus className="w-4 h-4" />
                          {t('patientPortal.headers.newAppointment', 'New Appointment')}
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
                          {pendingApprovalCount > 0 && (
                            <Badge className="ml-1 h-5 min-w-5 rounded-full px-1 flex items-center justify-center text-[10px]">
                              {pendingApprovalCount}
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
                          {t('patientPortal.appointments.closed', 'Closed')}
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
                          renderAppointmentsCalendar(
                            'No pending approvals',
                            'Includes new bookings awaiting doctor approval and reschedule requests awaiting action.'
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
                                const doctorRequested = isDoctorRequestedReschedule(apt as { reschedule_requested_by?: string | null });
                                const isPendingPayment = normalizeAppointmentStatus(apt.status) === 'pending_payment';
                                return (
                                <div
                                  key={apt.id}
                                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${
                                    pendingReschedule ? 'border-blue-300/40 bg-blue-50/40' : 'border-amber-300/30 bg-amber-50/30'
                                  }`}
                                >
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="relative">
                                      <Avatar className="w-12 h-12">
                                        <AvatarImage src={(apt as any).doctor_profile_picture || ''} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                          {getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)
                                            .split(' ')
                                            .map((n) => n[0])
                                            .join('')
                                            .slice(0, 2)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="absolute bottom-0 right-0">
                                        {getDoctorPresenceIndicator((apt as unknown as { doctor_id?: string }).doctor_id || '')}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="font-semibold">{getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {formatAppointmentDate(apt)} at {formatAppointmentClockTime(apt)}
                                      </p>
                                      {pendingReschedule && (
                                        <p className="text-xs font-medium text-blue-700 mt-1">
                                          Proposed: {new Date(
                                            String((apt as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || apt.date)
                                          ).toLocaleDateString()} at {(apt as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || apt.time}
                                        </p>
                                      )}
                                      {getRescheduleRequestBadge(apt as { reschedule_request_status?: string | null; reschedule_requested_by?: string | null })}
                                      <p className="text-sm text-muted-foreground mt-1">{cleanNotesForDisplay(apt.notes) || 'No notes'}</p>
                                      {formatConsultationLanguageFromNotes(apt.notes) && <p className="text-sm text-muted-foreground">{formatConsultationLanguageFromNotes(apt.notes)}</p>}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    {pendingReschedule && doctorRequested ? (
                                      <>
                                        <Button size="sm" onClick={() => respondToRescheduleRequest(apt.id, 'approve')} disabled={isBooking}>
                                          Accept New Slot
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-destructive border-destructive/30"
                                          onClick={() => respondToRescheduleRequest(apt.id, 'decline')}
                                          disabled={isBooking}
                                        >
                                          Decline
                                        </Button>
                                      </>
                                    ) : pendingReschedule ? (
                                      <Badge variant="secondary">Waiting for doctor approval</Badge>
                                    ) : isPendingPayment ? (
                                      <>
                                        <Button size="sm" onClick={() => handlePayNow(apt)}>
                                          Pay Now
                                        </Button>
                                        <Button size="sm" variant="destructive" onClick={() => setCancelAppointmentId((apt as unknown as { id?: string }).id ?? null)}>
                                          Cancel
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                          Reschedule
                                        </Button>
                                        <Button size="sm" variant="destructive" onClick={() => setCancelAppointmentId((apt as unknown as { id?: string }).id ?? null)}>
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
                          renderAppointmentsCalendar('No confirmed or in-progress appointments')
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
                                      <p className="text-sm font-semibold">{formatAppointmentClockTime(apt)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(getAppointmentDateTime(apt), { month: 'short', day: 'numeric' })}</p>
                                    </div>
                                    <div className="w-px h-12 bg-border" />
                                    <div className="relative">
                                      <Avatar className="w-12 h-12">
                                        <AvatarImage src={(apt as any).doctor_profile_picture || ''} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                          {getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)
                                            .split(' ')
                                            .map((n) => n[0])
                                            .join('')
                                            .slice(0, 2)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="absolute bottom-0 right-0">
                                        {getDoctorPresenceIndicator((apt as unknown as { doctor_id?: string }).doctor_id || '')}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="font-semibold">{getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}</p>
                                      <p className="text-sm text-muted-foreground">Appointment</p>
                                      {isPendingRescheduleRequest(apt as any) && (
                                        <div className="mt-2 space-y-1">
                                          <p className="text-xs font-medium text-blue-700">
                                            Reschedule Proposed: {new Date(
                                              String((apt as any).reschedule_proposed_date || apt.date)
                                            ).toLocaleDateString()} at {(apt as any).reschedule_proposed_time || apt.time}
                                          </p>
                                          {getRescheduleRequestBadge(apt as any)}
                                        </div>
                                      )}
                                      {isPastConfirmed && !isPendingRescheduleRequest(apt as any) && (
                                        <p className="text-xs font-medium text-amber-700 mt-1">
                                          Appointment time passed. Waiting for doctor action (no-show or follow-up).
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    {isPendingRescheduleRequest(apt as any) && isDoctorRequestedReschedule(apt as any) ? (
                                      <>
                                        <Button size="sm" onClick={() => respondToRescheduleRequest(apt.id, 'approve')} disabled={isBooking} className="gradient-primary">
                                          Accept New Slot
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-destructive border-destructive/30"
                                          onClick={() => respondToRescheduleRequest(apt.id, 'decline')}
                                          disabled={isBooking}
                                        >
                                          Decline
                                        </Button>
                                      </>
                                    ) : (
                                      <JoinConsultationButton
                                        appointmentId={apt.id}
                                        participantName={getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                                        status={apt.status}
                                        consultationLanguage={getConsultationLanguageForAppointment(apt as any)}
                                        variant="default"
                                        size="sm"
                                        className="gradient-primary"
                                      />
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openMessagesForAppointment(apt)}
                                    >
                                      <MessageSquare className="w-4 h-4 mr-2" />
                                      {t('patientPortal.actions.message', 'Message')}
                                    </Button>
                                    {apt.status === 'confirmed' && (
                                      <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                        Reschedule
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )})
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Completed Tab Content */}
                      <TabsContent value="completed" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar(t('patientPortal.empty.noCompletedConsultations', 'No completed consultations'))
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">{t('patientPortal.empty.noCompletedConsultations', 'No completed consultations')}</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => (
                                <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-success/30 bg-success/5">
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="text-center w-20">
                                      <p className="text-sm font-semibold">{formatAppointmentClockTime(apt)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(getAppointmentDateTime(apt), { month: 'short', day: 'numeric' })}</p>
                                    </div>
                                    <div className="w-px h-12 bg-border" />
                                    <Avatar className="w-12 h-12">
                                      <AvatarImage src={(apt as any).doctor_profile_picture || ''} />
                                      <AvatarFallback className="bg-primary/10 text-primary">
                                        {getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)
                                          .split(' ')
                                          .map((n) => n[0])
                                          .join('')
                                          .slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-semibold">{getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}</p>
                                      <p className="text-sm text-muted-foreground">{t('common.appointments', 'Appointments')}</p>
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
                                      {t('patientPortal.actions.message', 'Message')}
                                    </Button>
                                    {!(apt as any).rating && (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setSelectedAppointment(apt);
                                          setReviewModalOpen(true);
                                        }}
                                      >
                                        {t('patientPortal.actions.leaveReview', 'Leave Review')}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Closed Tab Content (Cancelled + No Show) */}
                      <TabsContent value="closed" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar(t('patientPortal.empty.noClosedAppointments', 'No closed appointments'))
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">{t('patientPortal.empty.noClosedAppointments', 'No closed appointments')}</p>
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
                                        <p className="text-sm font-semibold">{formatAppointmentClockTime(apt)}</p>
                                        <p className="text-xs text-muted-foreground">{formatDate(getAppointmentDateTime(apt), { month: 'short', day: 'numeric' })}</p>
                                      </div>
                                      <div className="w-px h-12 bg-border" />
                                      <Avatar className="w-12 h-12">
                                        <AvatarImage src={(apt as any).doctor_profile_picture || ''} />
                                        <AvatarFallback className="bg-primary/10 text-primary">
                                          {getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)
                                            .split(' ')
                                            .map((n) => n[0])
                                            .join('')
                                            .slice(0, 2)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="font-semibold">{getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}</p>
                                        <p className="text-sm text-muted-foreground">{t('common.appointments', 'Appointments')}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{cleanNotesForDisplay(apt.notes) || 'No notes'}</p>
                                        {formatConsultationLanguageFromNotes(apt.notes) && <p className="text-xs text-muted-foreground">{formatConsultationLanguageFromNotes(apt.notes)}</p>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant={isNoShow ? 'destructive' : 'secondary'}>
                                        {isNoShow ? t('appointmentStatus.noShow', 'No Show') : t('appointmentStatus.cancelled', 'Cancelled')}
                                      </Badge>
                                      {isNoShow && (
                                        <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                          {t('patientPortal.actions.reschedule', 'Reschedule')}
                                        </Button>
                                      )}
                                      <Button size="sm" variant="outline" onClick={openBooking}>
                                        {t('patientPortal.actions.bookAnotherDoctor', 'Book Another Doctor')}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* All Tab Content */}
                      <TabsContent value="all" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar(t('patientPortal.empty.noAppointmentsFound', 'No appointments found'))
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">{t('patientPortal.empty.noAppointmentsFound', 'No appointments found')}</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => {
                                const pendingReschedule = isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null });
                                const doctorRequested = isDoctorRequestedReschedule(apt as { reschedule_requested_by?: string | null });
                                return (
                                <div
                                  key={apt.id}
                                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${
                                    pendingReschedule ? 'border-blue-300/40 bg-blue-50/30' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="text-center w-20">
                                      <p className="text-sm font-semibold">{formatAppointmentClockTime(apt)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(getAppointmentDateTime(apt), { month: 'short', day: 'numeric' })}</p>
                                    </div>
                                    <div className="w-px h-12 bg-border" />
                                    <Avatar className="w-12 h-12">
                                      <AvatarImage src={(apt as any).doctor_profile_picture || ''} />
                                      <AvatarFallback className="bg-primary/10 text-primary">
                                        {getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)
                                          .split(' ')
                                          .map((n) => n[0])
                                          .join('')
                                          .slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-semibold">{getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}</p>
                                      <p className="text-sm text-muted-foreground">{t('common.appointments', 'Appointments')}</p>
                                      <Badge className="mt-1" variant={
                                        apt.status === 'pending_payment' ? 'default' :
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
                                      participantName={getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                                      status={apt.status}
                                      consultationLanguage={getConsultationLanguageForAppointment(apt as any)}
                                      variant="default"
                                      size="sm"
                                    />
                                  )}
                                  {!pendingReschedule && (apt.status === 'confirmed' || apt.status === 'completed') && (
                                    <Button size="sm" variant="outline" onClick={() => openMessagesForAppointment(apt)}>
                                      <MessageSquare className="w-4 h-4 mr-2" />
                                      {t('patientPortal.actions.message', 'Message')}
                                    </Button>
                                  )}
                                  {apt.status === 'completed' && !(apt as any).rating && (
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setSelectedAppointment(apt);
                                        setReviewModalOpen(true);
                                      }}
                                    >
                                      {t('patientPortal.actions.leaveReview', 'Leave Review')}
                                    </Button>
                                  )}
                                  {apt.status === 'pending_payment' && (
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => handlePayNow(apt)}>
                                        Pay Now
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => setCancelAppointmentId((apt as unknown as { id?: string }).id ?? null)}>
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                  {!pendingReschedule && apt.status === 'pending_approval' && (
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                        {t('patientPortal.actions.reschedule', 'Reschedule')}
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => setCancelAppointmentId((apt as unknown as { id?: string }).id ?? null)}>
                                        {t('patientPortal.actions.cancel', 'Cancel')}
                                      </Button>
                                    </div>
                                  )}
                                  {!pendingReschedule && apt.status === 'confirmed' && (
                                    <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                      Reschedule
                                    </Button>
                                  )}
                                  {!pendingReschedule && apt.status === 'no_show' && (
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                        Reschedule
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={openBooking}>
                                        Book Another Doctor
                                      </Button>
                                    </div>
                                  )}
                                  {pendingReschedule && doctorRequested && (
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => respondToRescheduleRequest(apt.id, 'approve')} disabled={isBooking}>
                                        Accept New Slot
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-destructive border-destructive/30"
                                        onClick={() => respondToRescheduleRequest(apt.id, 'decline')}
                                        disabled={isBooking}
                                      >
                                        Decline
                                      </Button>
                                    </div>
                                  )}
                                  {pendingReschedule && !doctorRequested && (
                                    <Badge variant="secondary">Waiting for doctor approval</Badge>
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
{/* Prescriptions Tab */}
              <TabsContent value="prescriptions" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('patientPortal.headers.myPrescriptions', 'My Prescriptions')}</CardTitle>
                    <CardDescription>{t('patientPortal.headers.prescriptionsDescription', 'Active and past prescriptions from your consultations')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {prescriptionsLoading ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">{t('patientPortal.loading.prescriptions', 'Loading prescriptions...')}</p>
                      </div>
                    ) : fetchedPrescriptions.length === 0 ? (
                      <div className="text-center py-12">
                        <Pill className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">{t('patientPortal.empty.noPrescriptionsYet', 'No prescriptions yet')}</p>
                        <p className="text-sm text-muted-foreground mt-2">{t('patientPortal.empty.prescriptionsWillAppear', 'Prescriptions from your doctor consultations will appear here')}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {fetchedPrescriptions.map((prescription: PatientPrescription) => (
                          <div key={prescription.id} className={`p-4 rounded-xl border ${prescription.status === 'active' ? 'border-success/30 bg-success/5' : 'border-border'}`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${prescription.status === 'active' ? 'bg-success/10' : 'bg-muted'}`}>
                                  <Pill className={`w-5 h-5 ${prescription.status === 'active' ? 'text-success' : 'text-muted-foreground'}`} />
                                </div>
                                <div>
                                  <p className="font-semibold">
                                    {prescription.items.length}{' '}
                                    {prescription.items.length > 1
                                      ? t('patientPortal.labels.prescriptionItems', 'prescription items')
                                      : t('patientPortal.labels.prescriptionItem', 'prescription item')}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {t('patientPortal.labels.prescribedBy', 'Prescribed by')} {prescription.doctor} • {formatDate(prescription.date)}
                                  </p>
                                  <div className="mt-2 space-y-1">
                                    {prescription.items.map((item, index) => (
                                      <p key={`${prescription.id}-${index}`} className="text-sm text-foreground/90">
                                        {index + 1}. {item.medication} - {item.dosage}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                {getStatusBadge(prescription.status)}
                                {prescription.status === 'active' && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {prescription.refillsRemaining}{' '}
                                    {prescription.refillsRemaining === 1
                                      ? t('patientPortal.labels.refillRemaining', 'refill remaining')
                                      : t('patientPortal.labels.refillsRemaining', 'refills remaining')}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-end">
                              <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => handleViewPrescriptionDetails(prescription)}>
                                {t('patientPortal.actions.viewDetails', 'View Details')}
                              </Button>
                              {!prescription.isDownloaded ? (
                                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => handleDownloadPrescription(prescription)}>
                                  {t('common.download', 'Download')}
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="w-full sm:w-auto" disabled>
                                  {t('patientPortal.actions.downloaded', 'Downloaded')}
                                </Button>
                              )}
                              {prescription.status === 'active' && (
                                <Button
                                  size="sm"
                                  className="w-full sm:w-auto"
                                  onClick={() => handleRequestPrescriptionRefill(prescription)}
                                  disabled={isRequestingRefillId === prescription.id}
                                >
                                  {isRequestingRefillId === prescription.id
                                    ? t('patientPortal.actions.sending', 'Sending...')
                                    : t('patientPortal.actions.requestRefill', 'Request Refill')}
                                </Button>
                              )}
                            </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Messages Tab */}
              <TabsContent value="messages" className="space-y-6">
                <MessagesTab
                  focusSessionId={messagesFocusSessionId}
                  jumpToUnreadSignal={messagesJumpToUnreadSignal}
                />
              </TabsContent>

              {/* Records Tab */}
              <TabsContent value="records" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('patientPortal.recordsTab', 'Investigations')}</CardTitle>
                    <CardDescription>{t('patientPortal.headers.healthRecordsDescription', 'View required investigations and upload investigation files')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {followUpInvestigationMessage && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
                          <p className="text-sm font-semibold">
                            {t('patientPortal.followUp.deadlineTitle', 'Follow-up deadline: 3 days')}
                          </p>
                          <p className="mt-1 text-sm">
                            {followUpInvestigationMessage}
                          </p>
                        </div>
                      )}

                      {/* Required Investigations From Doctor Clerking */}
                      <div className="rounded-lg border border-border p-4">
                        <h4 className="text-sm font-semibold mb-2">{t('patientPortal.records.requiredInvestigations', 'Required Investigations')}</h4>
                        {investigationRequestsLoading || investigationsLoading ? (
                          <p className="text-sm text-muted-foreground">{t('patientPortal.loading.records', 'Loading investigations...')}</p>
                        ) : fetchedInvestigationRequests.length > 0 ? (
                          <div className="space-y-3">
                            {fetchedInvestigationRequests.map((request) => (
                              <div key={request.id} className="p-3 rounded-lg border border-border bg-muted/20">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">{request.doctor}</p>
                                    <p className="text-xs text-muted-foreground">{formatDateTime(request.date)}</p>
                                    <p className="text-sm whitespace-pre-wrap mt-2">{request.details}</p>
                                  </div>
                                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 sm:flex-none"
                                      onClick={() => handleViewInvestigationDetails(request)}
                                    >
                                      {t('patientPortal.actions.viewDetails', 'View Details')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 sm:flex-none"
                                      onClick={() => handleDownloadInvestigationRequest(request)}
                                    >
                                      {t('common.download', 'Download')}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : requiredInvestigations ? (
                          <p className="text-sm whitespace-pre-wrap">{requiredInvestigations}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">{t('patientPortal.empty.noRequiredInvestigations', 'No investigations requested yet.')}</p>
                        )}
                      </div>

                      {/* Upload Section */}
                      <div className="border-2 border-dashed border-border rounded-lg p-6">
                        <div className="text-center">
                          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-sm text-muted-foreground mb-4">{t('patientPortal.records.uploadHelp', 'Upload investigation reports and related documents.')}</p>
                          <div className="space-y-3">
                            <Input
                              placeholder={t('patientPortal.records.addNotesOptional', 'Add notes (optional)')}
                              value={uploadNotes}
                              onChange={(e) => setUploadNotes(e.target.value)}
                              className="max-w-md mx-auto"
                            />
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleRecordUpload(file);
                              }}
                              className="hidden"
                              id="record-upload"
                            />
                            <Button
                              onClick={() => document.getElementById('record-upload')?.click()}
                              disabled={isUploadingRecord}
                            >
                              {isUploadingRecord
                                ? t('patientPortal.actions.uploading', 'Uploading...')
                                : t('patientPortal.actions.uploadRecords', 'Upload Investigations')}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Uploaded Investigations */}
                      <div>
                        <h4 className="text-sm font-semibold mb-3">{t('patientPortal.records.uploadedInvestigations', 'Uploaded Investigations')}</h4>
                      {recordsLoading ? (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">{t('patientPortal.loading.records', 'Loading investigations...')}</p>
                          </div>
                        ) : healthRecords.length === 0 ? (
                          <div className="text-center py-8">
                            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">{t('patientPortal.empty.noRecordsUploadedYet', 'No investigations uploaded yet')}</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {healthRecords.map((record) => (
                              <div key={record.id} className="flex flex-col gap-3 p-4 rounded-lg border border-border transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <FileText className="w-8 h-8 text-primary flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{record.file_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDate(record.uploaded_at)}
                                      {record.file_size && ` • ${(record.file_size / 1024).toFixed(1)} KB`}
                                    </p>
                                    {record.notes && (
                                      <p className="text-xs text-muted-foreground mt-1">{record.notes}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => window.open(record.file_url, '_blank')}
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteRecord(record.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="coo-messages" forceMount className={activeTab !== 'coo-messages' ? 'hidden' : 'space-y-6'}>
                <Card>
                  <CardHeader>
                    <CardTitle>COO Messages</CardTitle>
                    <CardDescription>Send and receive messages with the COO</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {user?.id && (
                      <CooThreadChat
                        threadId={user.id}
                        threadType="patient"
                        userId={user.id}
                        senderRole="patient"
                        senderName={displayName}
                        label="COO — Chief Operations Officer"
                        onUnreadChange={(count) => {
                          if (activeTab !== 'coo-messages') setUnreadCooCount(count);
                          else setUnreadCooCount(0);
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="contact" className="space-y-6">
                <ContactMyEDoctorForm
                  role="patient"
                  userId={user?.id}
                  fullName={patientRegistration?.full_name || user?.user_metadata?.full_name || ''}
                  email={patientRegistration?.email || user?.email || ''}
                  phone={patientRegistration?.phone_number || ''}
                />
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('common.profileSettings', 'Profile Settings')}</CardTitle>
                    <CardDescription>{t('patientPortal.headers.manageAccountSettings', 'Manage your account settings')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <Avatar className="w-20 h-20">
                          <AvatarImage key={profilePictureKey} src={profilePicture} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-lg">{displayName}</p>
                          <p className="text-muted-foreground">{user?.email}</p>
                          <div className="mt-2">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(file);
                              }}
                              className="hidden"
                              id="photo-upload"
                            />
                            <Button 
                              size="sm" 
                              variant="outline" 
                              disabled={isUploadingPhoto}
                              onClick={() => document.getElementById('photo-upload')?.click()}
                            >
                              {isUploadingPhoto
                                ? t('patientPortal.actions.uploading', 'Uploading...')
                                : t('patientPortal.actions.changePhoto', 'Change Photo')}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">{t('common.fullName', 'Full Name')}</label>
                          <Input 
                            value={profileFormData.fullName}
                            onChange={(e) => setProfileFormData({...profileFormData, fullName: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.email', 'Email')}</label>
                          <Input 
                            value={profileFormData.email}
                            onChange={(e) => setProfileFormData({...profileFormData, email: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.phone', 'Phone')}</label>
                          <Input 
                            value={profileFormData.phone}
                            onChange={(e) => setProfileFormData({...profileFormData, phone: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.age', 'Age')}</label>
                          <Input 
                            type="number"
                            value={profileFormData.age}
                            onChange={(e) => setProfileFormData({...profileFormData, age: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('auth.fields.city', 'City')}</label>
                          <Input
                            value={profileFormData.city}
                            onChange={(e) => setProfileFormData({...profileFormData, city: e.target.value})}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('auth.fields.state', 'State')}</label>
                          <Input
                            value={profileFormData.state}
                            onChange={(e) => setProfileFormData({...profileFormData, state: e.target.value})}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('auth.fields.country', 'Country')}</label>
                          <Input
                            value={profileFormData.country}
                            onChange={(e) => setProfileFormData({...profileFormData, country: e.target.value})}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.bloodType', 'Blood Type')}</label>
                          <Input 
                            value={profileFormData.bloodType}
                            onChange={(e) => setProfileFormData({...profileFormData, bloodType: e.target.value})}
                            placeholder={t('common.bloodTypeExample', 'e.g., A+, O-, B+')}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.language', 'Language')}</label>
                          <select
                            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={profileFormData.preferredLanguage || language}
                            onChange={(e) => setProfileFormData({
                              ...profileFormData,
                              preferredLanguage: (e.target.value as AppLanguage),
                            })}
                          >
                            {SUPPORTED_LANGUAGES.map((languageCode) => (
                              <option key={languageCode} value={languageCode}>
                                {t(APP_LANGUAGE_OPTION_MAP[languageCode].key, APP_LANGUAGE_OPTION_MAP[languageCode].fallback)}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('patientPortal.settings.preferredLanguageHint', 'This will be your default app language until you change it again.')}
                          </p>
                        </div>
                      </div>

                      <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                        {isSavingProfile
                          ? t('patientPortal.actions.saving', 'Saving...')
                          : t('patientPortal.actions.saveChanges', 'Save Changes')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('common.notificationAlerts', 'Notification Alerts')}</CardTitle>
                    <CardDescription>{t('common.notificationAlertsDescription', 'Tune ring and vibration intensity for this device and test it immediately.')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-w-md">
                      <div>
                        <label className="text-sm font-medium">{t('common.intensity', 'Intensity')}</label>
                        <select
                          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={notificationAlertIntensity}
                          onChange={(e) => handleNotificationIntensityChange(e.target.value)}
                        >
                          <option value="low">{t('common.low', 'Low')}</option>
                          <option value="medium">{t('common.medium', 'Medium')}</option>
                          <option value="high">{t('common.high', 'High')}</option>
                        </select>
                      </div>
                      <Button type="button" variant="outline" onClick={handleTestAlert}>
                        {t('common.testAlert', 'Test Alert')}
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
                          ? t('patientPortal.actions.updating', 'Updating...')
                          : t('patientPortal.actions.updatePassword', 'Update Password')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
      
      {/* Review Modal */}
      <ReviewModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        appointmentId={selectedAppointment?.id || ''}
        doctorName={selectedAppointment ? getDoctorNameById(selectedAppointment.doctor_id, selectedAppointment.specialist_name) : ''}
      />

      {/* Prescription Details Dialog */}
      <Dialog open={prescriptionDetailsOpen} onOpenChange={setPrescriptionDetailsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Prescription Details</DialogTitle>
            <DialogDescription>
              Review your prescription details and actions.
            </DialogDescription>
          </DialogHeader>
          {selectedPrescription && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium">Doctor:</span> {selectedPrescription.doctor}
                  </div>
                  <div>
                    <span className="font-medium">Date:</span> {formatDate(selectedPrescription.date)}
                  </div>
                  <div>
                    <span className="font-medium">Status:</span> {selectedPrescription.status}
                  </div>
                  <div>
                    <span className="font-medium">Refills remaining:</span> {selectedPrescription.refillsRemaining}
                  </div>
                  <div>
                    <span className="font-medium">Total items:</span> {selectedPrescription.items.length}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Prescription Items</label>
                <div className="mt-2 p-3 rounded-lg bg-muted/30 min-h-[72px]">
                  <div className="space-y-1">
                    {selectedPrescription.items.map((item, index) => (
                      <p key={`${selectedPrescription.id}-item-${index}`} className="text-sm whitespace-pre-wrap">
                        {index + 1}. {item.medication} - {item.dosage}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Instructions</label>
                <div className="mt-2 p-3 rounded-lg bg-muted/30 min-h-[72px]">
                  <p className="text-sm whitespace-pre-wrap">{selectedPrescription.rawText}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedPrescription && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleDownloadPrescription(selectedPrescription)}
                  disabled={selectedPrescription.isDownloaded}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {selectedPrescription.isDownloaded
                    ? t('patientPortal.actions.downloaded', 'Downloaded')
                    : t('common.download', 'Download')}
                </Button>
                <Button
                  onClick={() => handleRequestPrescriptionRefill(selectedPrescription)}
                  disabled={isRequestingRefillId === selectedPrescription.id}
                >
                  {isRequestingRefillId === selectedPrescription.id
                    ? t('patientPortal.actions.sending', 'Sending...')
                    : t('patientPortal.actions.requestRefill', 'Request Refill')}
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setPrescriptionDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Investigation Details Dialog */}
      <Dialog open={investigationDetailsOpen} onOpenChange={setInvestigationDetailsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('patientPortal.records.requiredInvestigations', 'Required Investigations')}</DialogTitle>
            <DialogDescription>
              {t('patientPortal.actions.viewDetails', 'View Details')}
            </DialogDescription>
          </DialogHeader>
          {selectedInvestigationRequest && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium">Doctor:</span> {selectedInvestigationRequest.doctor}
                  </div>
                  <div>
                    <span className="font-medium">Date:</span> {formatDate(selectedInvestigationRequest.date)}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">{t('patientPortal.records.requiredInvestigations', 'Required Investigations')}</label>
                <div className="mt-2 p-3 rounded-lg bg-muted/30 min-h-[96px]">
                  <p className="text-sm whitespace-pre-wrap">{selectedInvestigationRequest.details}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedInvestigationRequest && (
              <Button
                variant="outline"
                onClick={() => handleDownloadInvestigationRequest(selectedInvestigationRequest)}
              >
                <Download className="w-4 h-4 mr-2" />
                {t('common.download', 'Download')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setInvestigationDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Consultation Details Dialog */}
      <Dialog open={consultationDetailsOpen} onOpenChange={setConsultationDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Consultation Details</DialogTitle>
            <DialogDescription>
              Complete information about your consultation
            </DialogDescription>
          </DialogHeader>
          {selectedConsultation && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Doctor:</span> {selectedConsultation.doctor_name}
                  </div>
                  <div>
                    <span className="font-medium">Specialty:</span> {formatSpecialtyLabel(selectedConsultation.specialty)}
                  </div>
                  <div>
                    <span className="font-medium">Date:</span> {formatDate(selectedConsultation.date)}
                  </div>
                  <div>
                    <span className="font-medium">{t('common.status', 'Status')}:</span> {t('appointmentStatus.completed', 'Completed')}
                  </div>
                </div>
              </div>
              
              {selectedConsultation.rating && (
                <div>
                  <label className="text-sm font-medium">Your Rating</label>
                  <div className="flex items-center gap-1 mt-2">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-5 h-5 ${i < selectedConsultation.rating
                          ? 'text-warning fill-warning'
                          : 'text-muted'
                          }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Consultation Notes</label>
                <div className="mt-2 p-3 rounded-lg bg-muted/30 min-h-[100px]">
                  <p className="text-sm whitespace-pre-wrap">{selectedConsultation.diagnosis}</p>
                </div>
              </div>

              {selectedConsultation.prescription && (
                <div>
                  <label className="text-sm font-medium">Prescription</label>
                  <div className="mt-2 p-3 rounded-lg bg-muted/30 min-h-[60px]">
                    <p className="text-sm whitespace-pre-wrap">Prescription available - view in Prescriptions tab</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsultationDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientPortal;
