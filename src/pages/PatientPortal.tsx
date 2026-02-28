import { useState, useEffect, useMemo, useRef } from 'react';
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
  Heart, Activity, Pill, Phone, Plus, Search, Upload, Trash2, Download, Menu, X, List
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
import { useRealtimeMessageNotifications } from '@/hooks/useRealtimeMessageNotifications';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import { PatientWalletService } from '@/services/PatientWalletService';
import { AvailabilityService } from '@/services/AvailabilityService';
import { AppointmentRescheduleService } from '@/services/AppointmentRescheduleService';
import {
  formatAppointmentStatusLabel,
  normalizeAppointmentStatus,
  normalizeRescheduleRequestStatus,
  type AppointmentStatus,
} from '@/services/marketplaceTypes';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { createPrescriptionPdfBlob } from '@/lib/pdf';
import { useLocaleFormatter } from '@/lib/locale';

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
  const sessionParticipantsCacheRef = useRef<Map<string, { patient_id: string | null; doctor_id: string | null }>>(new Map());
  const [selectedConsultation, setSelectedConsultation] = useState<any>(null);
  const [consultationDetailsOpen, setConsultationDetailsOpen] = useState(false);
  const [isUploadingRecord, setIsUploadingRecord] = useState(false);
  const [uploadNotes, setUploadNotes] = useState('');
  const [messagesFocusSessionId, setMessagesFocusSessionId] = useState<string | null>(null);
  const [selectedPrescription, setSelectedPrescription] = useState<PatientPrescription | null>(null);
  const [prescriptionDetailsOpen, setPrescriptionDetailsOpen] = useState(false);
  const [selectedInvestigationRequest, setSelectedInvestigationRequest] = useState<PatientInvestigationRequest | null>(null);
  const [investigationDetailsOpen, setInvestigationDetailsOpen] = useState(false);
  const [isRequestingRefillId, setIsRequestingRefillId] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  const { isInstalled: isPwaInstalled, promptInstall } = usePwaInstall();
  const { t, language } = useLanguage();
  const { formatDate, formatDateTime, formatTime, formatClockTime, formatNumber, formatCurrency } = useLocaleFormatter();
  
  // Track patient presence
  useTrackUserPresence(user?.id, 'patient');
  
  // Subscribe to doctor presence
  const { presenceMap: doctorPresenceMap } = useDoctorPresence();
  useRealtimeMessageNotifications(user?.id, 'patient');

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`patient-unread-messages-${user.id}`)
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
          if (message.sender_role !== 'doctor') return;
          if (activeTab === 'messages') return;

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

          if (session.patient_id !== user.id) return;
          setUnreadMessagesCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeTab]);

  useEffect(() => {
    if (activeTab === 'messages' && unreadMessagesCount > 0) {
      setUnreadMessagesCount(0);
    }
  }, [activeTab, unreadMessagesCount]);
  
  const { appointments, isLoading: appointmentsLoading, invalidateAppointments } = useAppointments();
  const { data: patientWallet } = useQuery({
    queryKey: ['patient-wallet', user?.id],
    queryFn: () => PatientWalletService.getPatientWallet(user!.id),
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
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNarration, setWithdrawNarration] = useState('');
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [profileFormData, setProfileFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    age: '',
    bloodType: '',
  });
  const [passwordFormData, setPasswordFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  // Initialize form data when patientRegistration loads
  useEffect(() => {
    if (patientRegistration) {
      setProfileFormData({
        fullName: patientRegistration.full_name || '',
        email: patientRegistration.email || '',
        phone: patientRegistration.phone_number || '',
        age: patientRegistration.age?.toString() || '',
        bloodType: patientRegistration.blood_type || '',
      });
    }
  }, [patientRegistration]);
  const navigate = useNavigate();

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
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to upload investigation.' });
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
  const [rescheduleDurationMinutes, setRescheduleDurationMinutes] = useState<number>(30);
  const [rescheduleConsultationType, setRescheduleConsultationType] = useState<'chat' | 'voice' | 'video'>('video');
  const [currentRescheduleConsultationType, setCurrentRescheduleConsultationType] = useState<'chat' | 'voice' | 'video'>('video');
  const [rescheduleRequestNote, setRescheduleRequestNote] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [reschedulePaidAmount, setReschedulePaidAmount] = useState<number | null>(null);
  const [reschedulePaymentMethod, setReschedulePaymentMethod] = useState<'paystack' | 'wallet'>('paystack');
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState<string | null>(null);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [appointmentViewMode, setAppointmentViewMode] = useState<'list' | 'calendar'>('calendar');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarDayDialogOpen, setCalendarDayDialogOpen] = useState(false);
  const [calendarEventDialogOpen, setCalendarEventDialogOpen] = useState(false);
  const [calendarDialogDate, setCalendarDialogDate] = useState<string | null>(null);
  const [calendarFocusedAppointmentId, setCalendarFocusedAppointmentId] = useState<string | null>(null);
  const lastHandledReviewAppointmentRef = useRef<string | null>(null);
  const withdrawalAmountValue = Number(withdrawAmount.replace(/,/g, '').trim());
  const canSubmitWithdrawal = Number.isFinite(withdrawalAmountValue) &&
    withdrawalAmountValue > 0 &&
    withdrawalAmountValue <= patientWalletBalance &&
    !isSubmittingWithdrawal;

  // Legacy deep-link support: previous booking links opened an in-portal dialog.
  useEffect(() => {
    if (searchParams.get('action') === 'book') {
      navigate('/doctor-discovery', { replace: true });
    }
  }, [searchParams, navigate]);

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
    setRescheduleDurationMinutes(30);
    setRescheduleRequestNote('');
    setSelectedDoctorId(null);
    setRescheduleAppointmentId(null);
    setRescheduleDoctorId(null);
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
    if (!rescheduleAppointment) return 30;
    const value = Number((rescheduleAppointment as { duration_minutes?: number | null }).duration_minutes || 30);
    return Number.isFinite(value) && value > 0 ? value : 30;
  }, [rescheduleAppointment]);
  const currentRescheduleFinalPrice = useMemo(() => {
    if (!rescheduleAppointment) return 0;
    const value = Number((rescheduleAppointment as { final_price?: number | null }).final_price || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [rescheduleAppointment]);
  const getConsultationTypeForPricing = (apt: { price_breakdown?: Record<string, unknown> | null }) => {
    const type = String((apt.price_breakdown as Record<string, unknown> | null)?.consultation_type || 'video').toLowerCase();
    if (type === 'chat' || type === 'voice' || type === 'video') return type;
    return 'video';
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
    const currentDuration = Number((apt as { duration_minutes?: number | null }).duration_minutes || 30) || 30;
    const currentConsultType = getConsultationTypeForPricing(apt as { price_breakdown?: Record<string, unknown> | null });
    
    setRescheduleDurationMinutes(currentDuration);
    setCurrentRescheduleConsultationType(currentConsultType);
    setRescheduleConsultationType(currentConsultType);
    setRescheduleRequestNote('');
    setBookingOpen(false);
    setSlotSelectionOpen(true);
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
      if (reschedulePaymentMethod === 'paystack') {
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
            },
          });
          if (error) throw error;
          const paymentInit = data as any;
          if (!paymentInit?.reference) throw new Error('Payment initialization failed');

          setIsBooking(true);
          // Close the confirmation dialog before opening Paystack.
          // Radix modal overlay can intercept pointer events above Paystack iframe.
          setBookingOpen(false);
          await new Promise((resolve) => setTimeout(resolve, 220));
          let paymentCompleted = false;
          initializePayment({
            email: paymentInit.email || user?.email || '',
            amount: paymentInit.amountInKobo,
            reference: paymentInit.reference,
            publicKey: paystackPublicKey,
            metadata: paymentInit.metadata,
            onSuccess: async (response: any) => {
              paymentCompleted = true;
              const paidReference = String(response?.reference || paymentInit.reference || '').trim();

              try {
                const { data: confirmData, error: confirmError } = await supabase.functions.invoke('reschedule-payment-confirm', {
                  body: { reference: paidReference },
                });

                if (confirmError) throw confirmError;

                const confirmResult = (confirmData || {}) as { error?: string; alreadyFinalized?: boolean };
                if (confirmResult.error) throw new Error(confirmResult.error);

                toast({
                  title: 'Payment successful',
                  description: confirmResult.alreadyFinalized
                    ? 'Your paid reschedule request is already pending doctor approval.'
                    : 'Your reschedule request has been submitted and is pending doctor approval.',
                });
              } catch (confirmErr: any) {
                console.warn('[reschedule] client confirmation fallback failed:', confirmErr);
                toast({
                  title: 'Payment successful',
                  description: 'Payment succeeded. Your request will appear under Pending Approval once webhook processing completes.',
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
      if (reschedulePaymentMethod === 'wallet' && patientWalletBalance < rescheduleUpgradeAmount) {
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
      invalidateAppointments();
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
      const response = await PatientWalletService.requestWalletWithdrawal(amount, withdrawNarration || undefined);
      toast({
        title: 'Withdrawal request submitted',
        description: `₦${Number(response.amount || amount).toLocaleString()} has been reserved from your wallet.`,
      });
      setWithdrawDialogOpen(false);
      setWithdrawAmount('');
      setWithdrawNarration('');
      await queryClient.invalidateQueries({ queryKey: ['patient-wallet', user.id] });
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
      const { error } = await supabase
        .from('patient_registrations')
        .update({
          full_name: profileFormData.fullName,
          email: profileFormData.email,
          phone_number: profileFormData.phone,
          age: parseInt(profileFormData.age) || null,
          blood_type: profileFormData.bloodType,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['patient-registration'] });
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

  const getAppointmentDateTime = (apt: { date: string; time: string }) => new Date(`${apt.date}T${apt.time}`);
  const hasAppointmentTimePassed = (apt: { date: string; time: string }) =>
    getAppointmentDateTime(apt).getTime() <= Date.now();
  const isPendingRescheduleRequest = (apt: {
    reschedule_request_status?: string | null;
  }) => normalizeRescheduleRequestStatus(apt.reschedule_request_status) === 'pending';
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
  const filteredAppointmentsByStatus = useMemo(() => {
    if (!appointments) return [];
    
    let filtered;
    switch (appointmentStatusFilter) {
      case 'pending_payment':
        filtered = appointments.filter((apt) => apt.status === 'pending_payment');
        break;
      case 'pending_approval':
        filtered = appointments.filter(
          (apt) =>
            apt.status === 'pending_approval' ||
            apt.status === 'pending_payment' ||
            isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
        );
        break;
      case 'confirmed':
        filtered = appointments.filter(
          (apt) =>
            (apt.status === 'confirmed' || apt.status === 'in_progress') &&
            !isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null }),
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
          status: apt.status,
          appointmentDate: eventDate,
          isPastConfirmed,
          isPendingReschedule: pendingReschedule,
        }
      };
    });
  }, [filteredAppointmentsByStatus]);

  const calendarRenderKey = `${appointmentStatusFilter}-${filteredAppointmentsByStatus[0]
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
            events={fullCalendarEvents}
            dayMaxEvents={2}
            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
            slotMinTime="06:00:00"
            slotMaxTime="23:00:00"
            slotDuration="00:30:00"
            allDaySlot={false}
            nowIndicator
            height="auto"
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
                        <span className="text-sm font-medium">{formatClockTime(apt.time)}</span>
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
                      <p className="text-xs text-muted-foreground mt-1 truncate">{apt.notes || t('patientPortal.notes.none', 'No notes')}</p>
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
                  <p className="text-sm text-muted-foreground">{calendarFocusedAppointment.notes || t('patientPortal.notes.noneProvided', 'No notes provided.')}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {(calendarFocusedAppointment.status === 'confirmed' || calendarFocusedAppointment.status === 'in_progress') && (
                    <JoinConsultationButton
                      appointmentId={calendarFocusedAppointment.id}
                      participantName={getDoctorNameById((calendarFocusedAppointment as { doctor_id?: string }).doctor_id, calendarFocusedAppointment.specialist_name)}
                      status={calendarFocusedAppointment.status}
                      variant="default"
                      size="sm"
                    />
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
    const status = apt.status;
    const isPending = status === 'pending_approval' || status === 'pending_payment' || isPendingRescheduleRequest(apt as { reschedule_request_status?: string | null });
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
  }).length;

  const confirmedCount = appointments.filter((apt) => {
    if (apt.status !== 'confirmed') return false;
    if ((apt as any).date && (apt as any).time) {
      return !hasAppointmentTimePassed(apt as { date: string; time: string });
    }
    return true;
  }).length;

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

      initializePayment({
        email: paymentInit?.email || user.email || '',
        amount: paymentInit?.amountInKobo,
        reference: paymentInit?.reference,
        publicKey: paystackPublicKey,
        metadata: paymentInit?.metadata,
        onSuccess: () => {
          toast({ title: 'Payment successful', description: 'Your appointment has been confirmed.' });
          invalidateAppointments();
          setTimeout(() => navigate('/patient-portal?tab=appointments'), 600);
        },
        onClose: () => {
          toast({ title: 'Payment cancelled', description: 'You cancelled the payment process.' });
        },
      });
    } catch (err: any) {
      console.error('Payment init error', err);
      toast({ title: 'Payment error', description: err?.message || 'Unable to start payment.', variant: 'destructive' });
    }
  };

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
              <div className="hidden lg:block">
                <LanguageSelector />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('patientPortal.searchPlaceholder', 'Search doctors, appointments...')}
                  className="pl-10 w-48 sm:w-64 bg-muted/50"
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
                  <div className="lg:hidden px-3 pb-2">
                    <LanguageSelector />
                  </div>
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
                    { id: 'records', label: t('patientPortal.recordsTab', 'Investigations'), icon: FileText },
                    { id: 'settings', label: t('common.settings', 'Settings'), icon: Settings },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
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

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm">
                  {t('patientPortal.installBannerTextPrefix', 'Install our mobile app for faster access. Click')} <span className="font-semibold">{t('patientPortal.downloadApp', 'Download App')}</span> {t('patientPortal.installBannerTextSuffix', 'to install on your phone.')}
                </p>
                <Link to="/install">
                  <Button size="sm" className="gap-2">
                    <Download className="w-4 h-4" />
                    {t('patientPortal.openInstallPage', 'Open Install Page')}
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{t('patientPortal.wallet.balance', 'Wallet Balance')}</p>
                  <p className="text-xs text-muted-foreground">{t('patientPortal.wallet.refundHint', 'Cancellation and no-show refunds are credited here.')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xl font-semibold">₦{patientWalletBalance.toLocaleString()}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setWithdrawDialogOpen(true)}
                    disabled={patientWalletBalance <= 0}
                  >
                    {t('patientPortal.wallet.requestWithdrawal', 'Request Withdrawal')}
                  </Button>
                </div>
              </CardContent>
            </Card>

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
            />

            {/* Reschedule Confirmation Modal */}
            <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('patientPortal.reschedule.confirmTitle', 'Confirm Reschedule Request')}</DialogTitle>
                  <DialogDescription>
                    {rescheduleUpgradeAmount > 0 
                      ? t('patientPortal.reschedule.reviewChangesAndPayment', 'Review the appointment changes and payment details')
                      : t('patientPortal.reschedule.reviewAndConfirmNewTime', 'Review and confirm your new appointment time')}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
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
                                  disabled={patientWalletBalance < rescheduleUpgradeAmount}
                                />
                                <span>{t('patientPortal.reschedule.useWallet', 'Use Wallet')} {patientWalletBalance < rescheduleUpgradeAmount ? t('patientPortal.reschedule.insufficientSuffix', '(insufficient)') : ''}</span>
                              </label>
                            </div>
                          </div>

                          {patientWalletBalance < rescheduleUpgradeAmount && reschedulePaymentMethod === 'wallet' && (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                              {t('patientPortal.reschedule.walletInsufficientHint', 'Wallet balance insufficient. Please use Paystack or add funds to your wallet.')}
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

                <DialogFooter>
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
                    disabled={isBooking || (rescheduleUpgradeAmount > 0 && reschedulePaymentMethod === 'wallet' && patientWalletBalance < rescheduleUpgradeAmount)}
                  >
                    {isBooking
                      ? t('common.submitting', 'Submitting...')
                      : rescheduleUpgradeAmount > 0
                      ? t('patientPortal.reschedule.proceedToPayment', 'Proceed to Payment')
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
                if (!open) {
                  setWithdrawAmount('');
                  setWithdrawNarration('');
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('patientPortal.wallet.requestWithdrawal', 'Request Withdrawal')}</DialogTitle>
                  <DialogDescription>
                    {t('patientPortal.wallet.withdrawalDescription', 'Submit a withdrawal request from your available wallet balance.')}
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
                    {t('patientPortal.wallet.withdrawalProcessingHint', 'Withdrawal requests are processed manually and may take some time.')}
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWithdrawDialogOpen(false);
                      setWithdrawAmount('');
                      setWithdrawNarration('');
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
                <TabsTrigger value="appointments">{t('common.appointments', 'Appointments')}</TabsTrigger>
                <TabsTrigger value="prescriptions">{t('common.prescriptions', 'Prescriptions')}</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
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
                                <span className="text-sm">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</span>
                                <Clock className="w-4 h-4 text-muted-foreground ml-2" />
                                <span className="text-sm">{formatClockTime(apt.time)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(apt.status)}
                              </div>
                              {(apt.status === 'confirmed' || apt.status === 'in_progress') && (
                                <JoinConsultationButton
                                  appointmentId={apt.id}
                                  participantName={getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                                  status={apt.status}
                                  variant="default"
                                  size="sm"
                                  className="w-full sm:w-auto"
                                />
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

              {/* Appointments Tab */}
              <TabsContent value="appointments" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <CardTitle>{t('common.appointments', 'Appointments')}</CardTitle>
                        <CardDescription>{t('patientPortal.headers.manageAppointments', 'Manage all your appointments in one place')}</CardDescription>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                          <Button
                            size="sm"
                            variant={appointmentViewMode === 'list' ? 'default' : 'ghost'}
                            className="h-8 gap-1"
                            onClick={() => setAppointmentViewMode('list')}
                          >
                            <List className="w-4 h-4" />
                            {t('common.list', 'List')}
                          </Button>
                          <Button
                            size="sm"
                            variant={appointmentViewMode === 'calendar' ? 'default' : 'ghost'}
                            className="h-8 gap-1"
                            onClick={() => setAppointmentViewMode('calendar')}
                          >
                            <Calendar className="w-4 h-4" />
                            {t('common.calendar', 'Calendar')}
                          </Button>
                        </div>
                        <Button onClick={openBooking} className="gap-2">
                          <Plus className="w-4 h-4" />
                          {t('patientPortal.headers.newAppointment', 'New Appointment')}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Status Sub-tabs */}
                    <Tabs value={appointmentStatusFilter} onValueChange={(v) => setAppointmentStatusFilter(v as any)} className="w-full">
                      <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 mb-6">
                        <TabsTrigger value="pending_approval" className="relative">
                          Pending Approval
                          {pendingApprovalCount > 0 && (
                            <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                              {pendingApprovalCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="confirmed" className="relative">
                          Confirmed
                          {confirmedCount > 0 && (
                            <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                              {confirmedCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="completed">Completed</TabsTrigger>
                        <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
                        <TabsTrigger value="no_show">No Show</TabsTrigger>
                        <TabsTrigger value="all">All</TabsTrigger>
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
                                        {formatDate(apt.date)} at {formatClockTime(apt.time)}
                                      </p>
                                      {pendingReschedule && (
                                        <p className="text-xs font-medium text-blue-700 mt-1">
                                          Proposed: {new Date(
                                            String((apt as { reschedule_proposed_date?: string | null }).reschedule_proposed_date || apt.date)
                                          ).toLocaleDateString()} at {(apt as { reschedule_proposed_time?: string | null }).reschedule_proposed_time || apt.time}
                                        </p>
                                      )}
                                      {getRescheduleRequestBadge(apt as { reschedule_request_status?: string | null; reschedule_requested_by?: string | null })}
                                      <p className="text-sm text-muted-foreground mt-1">{apt.notes || 'No notes'}</p>
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
                                      <p className="text-sm font-semibold">{formatClockTime(apt.time)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</p>
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
                                      {isPastConfirmed && (
                                        <p className="text-xs font-medium text-amber-700 mt-1">
                                          Appointment time passed. Waiting for doctor action (no-show or follow-up).
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <JoinConsultationButton
                                      appointmentId={apt.id}
                                      participantName={getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                                      status={apt.status}
                                      variant="default"
                                      size="sm"
                                      className="gradient-primary"
                                    />
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
                                      <p className="text-sm font-semibold">{formatClockTime(apt.time)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</p>
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
                              ))
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* No Show Tab Content */}
                      <TabsContent value="no_show" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar('No no-show appointments')
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No no-show appointments</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => (
                                <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="text-center w-20">
                                      <p className="text-sm font-semibold">{formatClockTime(apt.time)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</p>
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
                                      <p className="text-xs text-muted-foreground mt-1">{apt.notes || 'No notes'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="destructive">No Show</Badge>
                                    <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                      Reschedule
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={openBooking}>
                                      Book Another Doctor
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Cancelled Tab Content */}
                      <TabsContent value="cancelled" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar('No cancelled appointments')
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No cancelled appointments</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => (
                                <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-muted-foreground/30 bg-muted/40">
                                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                    <div className="text-center w-20">
                                      <p className="text-sm font-semibold">{apt.time}</p>
                                      <p className="text-xs text-muted-foreground">{new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
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
                                      <p className="text-sm text-muted-foreground">Appointment</p>
                                      <p className="text-xs text-muted-foreground mt-1">{apt.notes || 'No notes'}</p>
                                    </div>
                                  </div>
                                  <Badge variant="destructive">Cancelled</Badge>
                                </div>
                              ))
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
                                      <p className="text-sm font-semibold">{formatClockTime(apt.time)}</p>
                                      <p className="text-xs text-muted-foreground">{formatDate(apt.date, { month: 'short', day: 'numeric' })}</p>
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
                                      variant="default"
                                      size="sm"
                                    />
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
                            <div className="mt-3 pt-3 border-t border-border flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleViewPrescriptionDetails(prescription)}>
                                {t('patientPortal.actions.viewDetails', 'View Details')}
                              </Button>
                              {!prescription.isDownloaded ? (
                                <Button size="sm" variant="outline" onClick={() => handleDownloadPrescription(prescription)}>
                                  {t('common.download', 'Download')}
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" disabled>
                                  {t('patientPortal.actions.downloaded', 'Downloaded')}
                                </Button>
                              )}
                              {prescription.status === 'active' && (
                                <Button
                                  size="sm"
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
                <MessagesTab focusSessionId={messagesFocusSessionId} />
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
                      {/* Required Investigations From Doctor Clerking */}
                      <div className="rounded-lg border border-border p-4">
                        <h4 className="text-sm font-semibold mb-2">{t('patientPortal.records.requiredInvestigations', 'Required Investigations')}</h4>
                        {investigationRequestsLoading || investigationsLoading ? (
                          <p className="text-sm text-muted-foreground">{t('patientPortal.loading.records', 'Loading investigations...')}</p>
                        ) : fetchedInvestigationRequests.length > 0 ? (
                          <div className="space-y-3">
                            {fetchedInvestigationRequests.map((request) => (
                              <div key={request.id} className="p-3 rounded-lg border border-border bg-muted/20">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">{request.doctor}</p>
                                    <p className="text-xs text-muted-foreground">{formatDateTime(request.date)}</p>
                                    <p className="text-sm whitespace-pre-wrap mt-2">{request.details}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleViewInvestigationDetails(request)}
                                    >
                                      {t('patientPortal.actions.viewDetails', 'View Details')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
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
                              <div key={record.id} className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors">
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
                                <div className="flex items-center gap-2">
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
                            value={profileFormData.fullName || patientRegistration?.full_name || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, fullName: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.email', 'Email')}</label>
                          <Input 
                            value={profileFormData.email || patientRegistration?.email || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, email: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.phone', 'Phone')}</label>
                          <Input 
                            value={profileFormData.phone || patientRegistration?.phone_number || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, phone: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.age', 'Age')}</label>
                          <Input 
                            type="number"
                            value={profileFormData.age || patientRegistration?.age?.toString() || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, age: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">{t('common.bloodType', 'Blood Type')}</label>
                          <Input 
                            value={profileFormData.bloodType || patientRegistration?.blood_type || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, bloodType: e.target.value})}
                            placeholder={t('common.bloodTypeExample', 'e.g., A+, O-, B+')}
                            className="mt-1" 
                          />
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
                    <span className="font-medium">Specialty:</span> {selectedConsultation.specialty}
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
