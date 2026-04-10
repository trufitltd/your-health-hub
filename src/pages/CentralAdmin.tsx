import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  BarChart3, Users, FileText, CheckCircle, XCircle, Clock,
  AlertCircle, LogOut, ChevronRight, Search, Filter, Download,
  Star, TrendingUp, Shield, Award, Eye, Trash2, Mail, Loader2, Send,
  Badge as BadgeIcon, Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { PatientsTable } from '@/components/admin/PatientsTable';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useRequestNotificationPermission } from '@/hooks/useRequestNotificationPermission';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { cn, formatSpecialtyLabel } from '@/lib/utils';
import { PricingManagementPanel } from '@/components/admin/PricingManagementPanel';
import { PaymentsManagementPanel } from '@/components/admin/PaymentsManagementPanel';
import { normalizeAppointmentStatus } from '@/services/marketplaceTypes';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLocaleFormatter } from '@/lib/locale';
import { CooThreadChat } from '@/components/coo/CooThreadChat';
import {
  triggerNotificationAlert,
  getNotificationAlertIntensity,
  setNotificationAlertIntensity as persistNotificationAlertIntensity,
  type NotificationAlertIntensity,
} from '@/lib/notificationAlert';

interface Doctor {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone_number?: string | null;
  city?: string | null;
  specialty: string;
  experience: string;
  verification_status: 'pending' | 'approved' | 'rejected';
  credentials_verified: boolean;
  profile_picture_url: string;
  license_number: string;
  license_file_url: string;
  medical_license_url?: string | null;
  medical_license_reupload_required?: boolean | null;
  medical_license_reupload_reason?: string | null;
  medical_license_reupload_requested_at?: string | null;
  medical_license_reuploaded_at?: string | null;
  medical_license_reupload_seen_by_admin?: boolean | null;
  verification_date: string;
  created_at: string;
  total_consultations: number;
  rating: number;
  total_reviews: number;
  rate_per_consultation?: number | null;
  proposed_rate_per_consultation?: number | null;
  rate_change_reason?: string | null;
  rate_change_requested_at?: string | null;
  rate_change_seen_by_admin?: boolean | null;
  rate_change_reviewed_at?: string | null;
  rate_change_admin_note?: string | null;
  updated_at?: string | null;
}

interface VerificationNotes {
  [key: string]: string;
}

interface PlatformUserSearchRow {
  user_id: string;
  email: string;
  full_name: string | null;
  role_label: string | null;
}

interface AdminAppointmentRow {
  id: string;
  patient_id: string | null;
  doctor_id: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  doctor_name: string;
  doctor_email: string;
  doctor_phone: string;
}

interface AdminClerkingRow {
  id: string;
  session_id: string | null;
  doctor_id: string | null;
  patient_id: string | null;
  diagnosis: string | null;
  treatment_plan: string | null;
  prescriptions: string | null;
  follow_up_notes: string | null;
  created_at: string | null;
  doctor_name: string;
  patient_name: string;
}

const hasDoctorRegistrationLicense = (doctor: Pick<Doctor, 'medical_license_url' | 'license_file_url'>) => {
  const directUrl = String(doctor.medical_license_url || '').trim();
  const fallbackUrl = String(doctor.license_file_url || '').trim();
  return directUrl.length > 0 || fallbackUrl.length > 0;
};

type ParsedInboxThreadMessage = {
  sender: 'admin' | 'user';
  senderName: string;
  content: string;
  timestamp?: string;
};

const cleanInboxThreadContent = (value: string) => {
  let text = String(value || '').replace(/\r\n/g, '\n');
  text = text.replace(/^\s*\[portal:[^\]]+\]\s*$/gim, '');
  text = text.replace(/^\s*Subject:\s.*$/gim, '');
  text = text.replace(/^\s*From:\s.*$/gim, '');
  text = text.replace(/^\s*Sender (Role|User ID|Name|Email|Phone):\s.*$/gim, '');
  text = text.replace(/\n?---\n[\s\S]*$/g, '');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
};

const inferInboxSenderRole = (subject: string | null | undefined, body: string | null | undefined) => {
  const source = `${subject || ''}\n${body || ''}`.toLowerCase();
  if (source.includes('sender role: doctor') || source.includes('[portal:doctor]')) return 'doctor';
  if (source.includes('sender role: patient') || source.includes('[portal:patient]')) return 'patient';
  if (source.includes('[portal:admin]')) return 'admin';
  return 'user';
};

const formatInboxSenderName = (row: {
  first_name?: string | null;
  last_name?: string | null;
  subject?: string | null;
  message?: string | null;
}) => {
  const rawName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'User';
  const senderRole = inferInboxSenderRole(row.subject, row.message);
  if (senderRole === 'doctor' && !/^dr\.?\s/i.test(rawName)) {
    return `Dr. ${rawName}`;
  }
  return rawName;
};

const parseInboxThreadMessages = (row: {
  created_at?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  subject?: string | null;
  message?: string | null;
}): ParsedInboxThreadMessage[] => {
  const body = String(row.message || '').replace(/\r\n/g, '\n');
  const senderName = formatInboxSenderName(row);
  const segments: ParsedInboxThreadMessage[] = [];
  const markerRegex = /--- (Admin|User) Reply \((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\) ---/g;
  const markers = Array.from(body.matchAll(markerRegex));
  const firstMarkerIndex = markers[0]?.index ?? body.length;
  const initialContent = cleanInboxThreadContent(body.slice(0, firstMarkerIndex));
  const adminInitiated = /\[portal:admin\]/i.test(body);

  if (initialContent) {
    segments.push({
      sender: adminInitiated ? 'admin' : 'user',
      senderName: adminInitiated ? 'Admin' : senderName,
      content: initialContent,
      timestamp: row.created_at || undefined,
    });
  }

  markers.forEach((marker, index) => {
    const start = (marker.index || 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? body.length;
    const content = cleanInboxThreadContent(body.slice(start, end));
    if (!content) return;
    const sender = marker[1].toLowerCase() === 'admin' ? 'admin' : 'user';
    segments.push({
      sender,
      senderName: sender === 'admin' ? 'Admin' : senderName,
      content,
      timestamp: `${marker[2].replace(' ', 'T')}:00Z`,
    });
  });

  return segments;
};

const CentralAdmin = () => {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { formatDate, formatDateTime, formatCurrency } = useLocaleFormatter();
  const { isInstalled: isPwaInstalled, promptInstall } = usePwaInstall();
  const notAvailableLabel = t('specialists.defaults.notAvailable', 'N/A');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { playNotificationSound } = useNotificationSound();
  useRequestNotificationPermission();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'incomplete'>('all');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState<VerificationNotes>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxRange, setInboxRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxPageSize, setInboxPageSize] = useState(10);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [unreadAppointmentCount, setUnreadAppointmentCount] = useState(0);
  const [unreadCooMessages, setUnreadCooMessages] = useState(0);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [messageReadVersion, setMessageReadVersion] = useState(0);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState('');
  const [selectedRecipientLabel, setSelectedRecipientLabel] = useState('');
  const [newMessageSubject, setNewMessageSubject] = useState('');
  const [newMessageBody, setNewMessageBody] = useState('');
  const [isSendingNewMessage, setIsSendingNewMessage] = useState(false);
  const [deleteDoctorId, setDeleteDoctorId] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [notificationAlertIntensity, setNotificationAlertIntensityState] = useState<NotificationAlertIntensity>(() => getNotificationAlertIntensity());
  const [isUpdatingDoctorSignupStatus, setIsUpdatingDoctorSignupStatus] = useState(false);
  const [clerkingSearch, setClerkingSearch] = useState('');
  const [isExporting, setIsExporting] = useState<null | 'all' | 'appointments' | 'doctors' | 'patients' | 'clerking'>(null);
  const [doctorSignupOpen, setDoctorSignupOpen] = useState(true);
  const [doctorSignupClosedMessage, setDoctorSignupClosedMessage] = useState(
    'Doctor sign up has been closed for this round and will resume soon. Please keep checking the site.',
  );
  const [profileFormData, setProfileFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
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
      title: 'Test Alert',
      body: 'This is a test alert for ring and vibration.',
      tag: `settings-test-alert-${user?.id || 'admin'}-${Date.now()}`,
      urgent: true,
      intensity: notificationAlertIntensity,
    });
  };

  const adminEmails = useMemo(() => {
    const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;
    return raw ? raw.split(',').map((value) => value.trim().toLowerCase()) : [];
  }, []);

  const adminEmail = (user?.email || user?.user_metadata?.email || '').toLowerCase();
  const metadataRole = String(user?.user_metadata?.role || '').toLowerCase();
  const isAdmin = metadataRole === 'admin' || (!!adminEmail && adminEmails.includes(adminEmail));
  const inboxReadStorageKey = user?.id ? `admin-message-thread-read-${user.id}` : null;
  const countUserReplyMarkersAfter = (body: string, lastReadAtMs: number) => {
    let count = 0;
    for (const match of body.matchAll(/--- User Reply \((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\) ---/g)) {
      const timestamp = `${match[1].replace(' ', 'T')}:00Z`;
      const replyTimeMs = new Date(timestamp).getTime();
      if (!Number.isNaN(replyTimeMs) && replyTimeMs > lastReadAtMs) {
        count += 1;
      }
    }
    return count;
  };

  const getLatestUserThreadActivityMs = (row: { created_at?: string | null; message?: string | null }) => {
    const body = String(row.message || '');
    const createdAtMs = new Date(String(row.created_at || '')).getTime();
    const adminInitiated = /\[portal:admin\]/i.test(body);
    let latest = 0;
    if (!adminInitiated && !Number.isNaN(createdAtMs)) {
      latest = Math.max(latest, createdAtMs);
    }
    for (const match of body.matchAll(/--- User Reply \((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\) ---/g)) {
      const timestamp = `${match[1].replace(' ', 'T')}:00Z`;
      const replyTimeMs = new Date(timestamp).getTime();
      if (!Number.isNaN(replyTimeMs)) {
        latest = Math.max(latest, replyTimeMs);
      }
    }
    return latest;
  };

  const getThreadReadState = () => {
    if (!inboxReadStorageKey || typeof window === 'undefined') return {} as Record<string, number>;
    try {
      const raw = window.localStorage.getItem(inboxReadStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[0] === 'string' && typeof entry[1] === 'number')
      );
    } catch {
      return {};
    }
  };

  const markAdminThreadRead = (row: { id?: string | null; created_at?: string | null; message?: string | null }) => {
    if (!inboxReadStorageKey || typeof window === 'undefined') return;
    const threadId = String(row.id || '');
    if (!threadId) return;
    const current = getThreadReadState();
    const latestActivityMs = getLatestUserThreadActivityMs(row);
    current[threadId] = latestActivityMs > 0 ? latestActivityMs : Date.now();
    window.localStorage.setItem(inboxReadStorageKey, JSON.stringify(current));
    setMessageReadVersion((prev) => prev + 1);
  };

  useEffect(() => {
    setProfileFormData({
      fullName: (user?.user_metadata?.full_name as string) || '',
      email: user?.email || '',
      phone: (user?.user_metadata?.phone as string) || '',
    });
  }, [user?.email, user?.user_metadata]);

  // Fetch all doctors with their verification status - MUST be before early returns
  const { data: doctors = [], isLoading: doctorsLoading, refetch } = useQuery({
    queryKey: ['admin-doctors'],
    queryFn: async () => {
      console.log('Fetching doctors for admin...');
      const { data: doctorsData, error: doctorsError } = await supabase
        .from('doctor_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (doctorsError) {
        console.error('Error fetching doctors:', doctorsError);
        throw doctorsError;
      }
      
      console.log('Fetched doctors:', doctorsData?.length || 0, 'doctors');
      
      // Fetch consultation stats for each doctor
      if (!doctorsData) return [];

      const doctorsWithStats = await Promise.all(
        doctorsData.map(async (doc) => {
          const { data: consultationRows, error: consultationError } = await supabase
            .from('appointments')
            .select('status')
            .eq('doctor_id', doc.user_id);

          if (consultationError) {
            console.error('Error fetching consultation count for doctor:', doc.user_id, consultationError);
          }

          const consultationCount = (consultationRows || []).filter(
            (row: { status?: string | null }) => normalizeAppointmentStatus(row.status) === 'completed',
          ).length;

          const { data: ratingRows, error: ratingError } = await supabase
            .from('appointments')
            .select('rating')
            .eq('doctor_id', doc.user_id)
            .not('rating', 'is', null);

          if (ratingError) {
            console.error('Error fetching ratings for doctor:', doc.user_id, ratingError);
          }

          const ratings = (ratingRows || [])
            .map((row: { rating: number | null }) => row.rating)
            .filter((rating: number | null): rating is number => typeof rating === 'number');

          const totalReviews = ratings.length;
          const averageRating = totalReviews > 0
            ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / totalReviews).toFixed(2))
            : 0;

          return {
            ...doc,
            total_consultations: consultationCount || 0,
            rating: averageRating,
            total_reviews: totalReviews,
          };
        })
      );

      return doctorsWithStats;
    },
    enabled: !!user && isAdmin,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const hasUnreadLicenseReupload = (doctor: Doctor) =>
    !!doctor.medical_license_reuploaded_at && !doctor.medical_license_reupload_seen_by_admin;

  const hasUnreadRateChangeRequest = (doctor: Doctor) =>
    Number(doctor.proposed_rate_per_consultation || 0) > 0 && !doctor.rate_change_seen_by_admin;

  useEffect(() => {
    if (!showVerificationDialog || !selectedDoctor) return;
    const latest = doctors.find((doctor) => doctor.user_id === selectedDoctor.user_id);
    if (!latest) return;
    if (latest !== selectedDoctor) {
      setSelectedDoctor(latest);
    }
  }, [showVerificationDialog, selectedDoctor, doctors]);

  // Fetch all patients
  const { data: patients = [] } = useQuery({
    queryKey: ['admin-patients-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_registrations')
        .select('user_id, full_name, email, phone_number');
      
      if (error) {
        console.error('Error fetching patients:', error);
        return [];
      }
      
      return data || [];
    },
    enabled: !!user && isAdmin,
  });

  const { data: qaAppointments = [], isLoading: qaLoading } = useQuery({
    queryKey: ['admin-qa-appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id,doctor_id,status,rating,review_comment,notes,created_at,updated_at,date')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching QA appointments:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!user && isAdmin,
    refetchInterval: 30000,
  });

  const { data: qaSessions = [] } = useQuery({
    queryKey: ['admin-qa-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultation_sessions')
        .select('id,doctor_id,status,duration_seconds,started_at,ended_at')
        .eq('status', 'ended')
        .order('ended_at', { ascending: false });

      if (error) {
        console.error('Error fetching QA sessions:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!user && isAdmin,
    refetchInterval: 30000,
  });

  const { data: doctorSignupStatus } = useQuery({
    queryKey: ['admin-doctor-signup-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_doctor_signup_status');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      return {
        doctor_signup_open: row?.doctor_signup_open !== false,
        doctor_signup_closed_message:
          String(row?.doctor_signup_closed_message || '').trim()
          || 'Doctor sign up has been closed for this round and will resume soon. Please keep checking the site.',
      };
    },
    enabled: !!user && isAdmin,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!doctorSignupStatus) return;
    setDoctorSignupOpen(doctorSignupStatus.doctor_signup_open !== false);
    setDoctorSignupClosedMessage(
      String(doctorSignupStatus.doctor_signup_closed_message || '').trim()
      || 'Doctor sign up has been closed for this round and will resume soon. Please keep checking the site.',
    );
  }, [doctorSignupStatus]);

  const { data: contactMessages = [], isLoading: contactMessagesLoading } = useQuery({
    queryKey: ['admin-contact-messages'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_contact_messages', { limit_count: 1000 });
      if (error) {
        console.error('Error fetching contact messages:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!user && isAdmin,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!inboxReadStorageKey || typeof window === 'undefined') return;
    const readState = getThreadReadState();
    const unread = (contactMessages as Array<{ id?: string | null; created_at?: string | null; message?: string | null }>).reduce((count, message) => {
      const rowId = String(message.id || '');
      const threadReadAtMs = readState[rowId] || 0;
      const body = String(message.message || '');
      const createdAtMs = new Date(String(message.created_at || '')).getTime();
      const adminInitiated = /\[portal:admin\]/i.test(body);
      const rowUnread = !adminInitiated && !Number.isNaN(createdAtMs) && createdAtMs > threadReadAtMs ? 1 : 0;
      const threadedUnread = body ? countUserReplyMarkersAfter(body, threadReadAtMs) : 0;
      return count + rowUnread + threadedUnread;
    }, 0);
    setUnreadInboxCount(unread);
  }, [contactMessages, inboxReadStorageKey, messageReadVersion]);

  useEffect(() => {
    if (!user?.id || !isAdmin) return;

    const channel = supabase
      .channel(`admin-contact-incoming-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contact_messages' },
        (payload) => {
          const incoming = payload.new as { first_name?: string | null; last_name?: string | null; subject?: string | null } | null;
          const description = `${incoming?.first_name || 'User'} ${incoming?.last_name || ''} • ${incoming?.subject || 'No subject'}`.trim();
          playNotificationSound();
          void triggerNotificationAlert({ title: 'New contact message', body: description, tag: `admin-contact-insert-${user?.id}`, urgent: true });
          queryClient.invalidateQueries({ queryKey: ['admin-contact-messages'] });
          queryClient.invalidateQueries({ queryKey: ['admin-contact-inbox'] });
          toast({ title: 'New contact message', description });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'contact_messages' },
        (payload) => {
          const newRow = payload.new as { message?: string | null; email?: string | null } | null;
          const oldRow = payload.old as { message?: string | null } | null;
          const oldCount = countUserReplyMarkersAfter(String(oldRow?.message || ''), 0);
          const newCount = countUserReplyMarkersAfter(String(newRow?.message || ''), 0);
          if (newCount <= oldCount) return;

          const description = `A user replied in thread ${newRow?.email ? `(${newRow.email})` : ''}`.trim();
          playNotificationSound();
          void triggerNotificationAlert({ title: 'New reply received', body: description, tag: `admin-contact-update-${user?.id}`, urgent: true });
          queryClient.invalidateQueries({ queryKey: ['admin-contact-messages'] });
          queryClient.invalidateQueries({ queryKey: ['admin-contact-inbox'] });
          toast({ title: 'New reply received', description });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, playNotificationSound, queryClient, user?.id]);

  useEffect(() => {
    if (!user?.id || !isAdmin) return;

    const channel = supabase
      .channel(`admin-clerking-feed-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'doctor_consultation_notes' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-clerking-notes'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient, user?.id]);

  useEffect(() => {
    if (!user?.id || !isAdmin) return;

    const channel = supabase
      .channel(`admin-appointments-feed-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'appointments' },
        (payload) => {
          const incoming = payload.new as { patient_name?: string | null; specialist_name?: string | null; date?: string | null; time?: string | null } | null;
          playNotificationSound();
          queryClient.invalidateQueries({ queryKey: ['admin-appointments-feed'] });
          toast({
            title: 'New appointment booked',
            description: `${incoming?.patient_name || 'Patient'} booked ${incoming?.specialist_name || 'Doctor'} at ${incoming?.time || 'N/A'} on ${incoming?.date || 'N/A'}`,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, playNotificationSound, queryClient, user?.id]);

  const inboxStartDate = useMemo(() => {
    if (inboxRange === 'all') return null;
    const now = new Date();
    const days = inboxRange === '7d' ? 7 : inboxRange === '30d' ? 30 : 90;
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - days);
    return cutoff.toISOString();
  }, [inboxRange]);

  const { data: inboxRows = [], isLoading: inboxLoading } = useQuery({
    queryKey: ['admin-contact-inbox', inboxSearch, inboxRange, inboxPage, inboxPageSize],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_contact_messages_inbox', {
        search_term: inboxSearch.trim() || null,
        start_date: inboxStartDate,
        limit_count: inboxPageSize,
        offset_count: (inboxPage - 1) * inboxPageSize,
      });
      if (error) {
        console.error('Error fetching contact inbox:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!user && isAdmin,
    refetchInterval: 30000,
  });

  const { data: platformUserMatches = [], isLoading: platformUserSearchLoading } = useQuery({
    queryKey: ['admin-platform-user-search', recipientSearch],
    queryFn: async () => {
      const term = recipientSearch.trim();
      if (!term) return [];
      const { data, error } = await supabase.rpc('admin_search_platform_users', {
        search_term: term,
        limit_count: 25,
      });

      if (!error) {
        return (data || []) as PlatformUserSearchRow[];
      }

      const errorCode = String((error as { code?: string } | null)?.code || '');
      const message = String((error as { message?: string } | null)?.message || '');
      const rpcMissing = errorCode === 'PGRST202' || message.includes('admin_search_platform_users');
      if (!rpcMissing) {
        console.error('Error searching platform users:', error);
        throw error;
      }

      const likeTerm = `%${term}%`;
      const [doctorResult, patientResult] = await Promise.all([
        supabase
          .from('doctor_registrations')
          .select('user_id, full_name, email')
          .or(`email.ilike.${likeTerm},full_name.ilike.${likeTerm}`)
          .limit(25),
        supabase
          .from('patient_registrations')
          .select('user_id, full_name, email')
          .or(`email.ilike.${likeTerm},full_name.ilike.${likeTerm}`)
          .limit(25),
      ]);

      const merged = new Map<string, PlatformUserSearchRow>();
      (doctorResult.data || []).forEach((row: any) => {
        const email = String(row.email || '').trim().toLowerCase();
        if (!email) return;
        merged.set(email, {
          user_id: String(row.user_id || ''),
          email,
          full_name: row.full_name || null,
          role_label: 'doctor',
        });
      });
      (patientResult.data || []).forEach((row: any) => {
        const email = String(row.email || '').trim().toLowerCase();
        if (!email) return;
        if (merged.has(email)) return;
        merged.set(email, {
          user_id: String(row.user_id || ''),
          email,
          full_name: row.full_name || null,
          role_label: 'patient',
        });
      });

      return Array.from(merged.values()).slice(0, 25);
    },
    enabled: !!user && isAdmin && activeTab === 'messages' && recipientSearch.trim().length > 0,
    refetchInterval: false,
  });

  const { data: adminAppointments = [], isLoading: adminAppointmentsLoading } = useQuery({
    queryKey: ['admin-appointments-feed'],
    queryFn: async () => {
      const { data: appointmentRows, error: appointmentsError } = await supabase
        .from('appointments')
        .select('id, patient_id, doctor_id, date, time, status, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(500);

      if (appointmentsError) {
        console.error('Error fetching admin appointments feed:', appointmentsError);
        throw appointmentsError;
      }

      const rows = appointmentRows || [];
      if (rows.length === 0) return [] as AdminAppointmentRow[];

      const patientIds = Array.from(new Set(rows.map((row: any) => String(row.patient_id || '')).filter(Boolean)));
      const doctorIds = Array.from(new Set(rows.map((row: any) => String(row.doctor_id || '')).filter(Boolean)));

      const [patientResult, doctorResult] = await Promise.all([
        patientIds.length > 0
          ? supabase
              .from('patient_registrations')
              .select('user_id, full_name, email, phone_number')
              .in('user_id', patientIds)
          : Promise.resolve({ data: [], error: null } as any),
        doctorIds.length > 0
          ? supabase
              .from('doctor_registrations')
              .select('user_id, full_name, email, phone_number')
              .in('user_id', doctorIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (patientResult.error) {
        console.warn('Error loading patient details for admin appointments:', patientResult.error);
      }
      if (doctorResult.error) {
        console.warn('Error loading doctor details for admin appointments:', doctorResult.error);
      }

      const patientMap = new Map(
        ((patientResult.data || []) as Array<any>).map((row) => [String(row.user_id), row]),
      );
      const doctorMap = new Map(
        ((doctorResult.data || []) as Array<any>).map((row) => [String(row.user_id), row]),
      );

      return rows.map((row: any) => {
        const patient = patientMap.get(String(row.patient_id || ''));
        const doctor = doctorMap.get(String(row.doctor_id || ''));
        return {
          id: String(row.id),
          patient_id: row.patient_id || null,
          doctor_id: row.doctor_id || null,
          date: row.date || null,
          time: row.time || null,
          status: normalizeAppointmentStatus(row.status),
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
          patient_name: String(patient?.full_name || row.patient_name || 'Patient'),
          patient_email: String(patient?.email || ''),
          patient_phone: String(patient?.phone_number || ''),
          doctor_name: String(doctor?.full_name || row.specialist_name || 'Doctor'),
          doctor_email: String(doctor?.email || ''),
          doctor_phone: String(doctor?.phone_number || ''),
        } satisfies AdminAppointmentRow;
      });
    },
    enabled: !!user && isAdmin,
    refetchInterval: 15000,
  });

  const newAppointments = useMemo(() => {
    return adminAppointments.filter((row) => {
      const s = normalizeAppointmentStatus(row.status);
      return s === 'confirmed' || s === 'pending' || s === 'pending_approval' || s === 'pending_payment' || s === 'payment_processing';
    });
  }, [adminAppointments]);

  useEffect(() => {
    setUnreadAppointmentCount(activeTab === 'appointments' ? 0 : newAppointments.length);
  }, [activeTab, newAppointments]);

  const { data: adminClerkingNotes = [], isLoading: adminClerkingLoading, isError: adminClerkingError } = useQuery({
    queryKey: ['admin-clerking-notes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_clerking_notes', { limit_count: 500 });

      if (error) {
        console.error('Error fetching admin clerking notes via RPC:', error);
        const rpcMissing =
          String((error as any)?.code || '') === 'PGRST202' ||
          String((error as any)?.message || '').includes('get_admin_clerking_notes');
        if (!rpcMissing) throw error;

        const { data: fallbackData, error: fallbackError } = await supabase
          .from('doctor_consultation_notes')
          .select('id, session_id, doctor_id, patient_id, diagnosis, treatment_plan, prescriptions, follow_up_notes, created_at')
          .order('created_at', { ascending: false })
          .limit(500);

        if (fallbackError) throw fallbackError;

        return ((fallbackData || []) as Array<any>).map((row) => ({
          id: String(row.id),
          session_id: row.session_id || null,
          doctor_id: row.doctor_id || null,
          patient_id: row.patient_id || null,
          diagnosis: row.diagnosis || null,
          treatment_plan: row.treatment_plan || null,
          prescriptions: row.prescriptions || null,
          follow_up_notes: row.follow_up_notes || null,
          created_at: row.created_at || null,
          doctor_name: 'Doctor',
          patient_name: 'Patient',
        } satisfies AdminClerkingRow));
      }

      return ((data || []) as Array<any>).map((row) => ({
        id: String(row.id),
        session_id: row.session_id || null,
        doctor_id: row.doctor_id || null,
        patient_id: row.patient_id || null,
        diagnosis: row.diagnosis || null,
        treatment_plan: row.treatment_plan || null,
        prescriptions: row.prescriptions || null,
        follow_up_notes: row.follow_up_notes || null,
        created_at: row.created_at || null,
        doctor_name: String(row.doctor_name || 'Doctor'),
        patient_name: String(row.patient_name || 'Patient'),
      } satisfies AdminClerkingRow));
    },
    enabled: !!user && isAdmin,
    refetchInterval: 30000,
  });

  // Check admin access - now after hooks
  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  // Calculate statistics
  const doctorStatusCounts = doctors.reduce(
    (acc, doctor) => {
      const reviewStatus = !hasDoctorRegistrationLicense(doctor)
        ? 'incomplete'
        : ((doctor.verification_status || 'pending') as 'pending' | 'approved' | 'rejected');
      acc[reviewStatus] += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0, incomplete: 0 } as Record<'pending' | 'approved' | 'rejected' | 'incomplete', number>,
  );

  const stats = {
    totalDoctors: doctors.length,
    totalPatients: patients.length,
    approvedDoctors: doctorStatusCounts.approved,
    pendingVerification: doctorStatusCounts.pending,
    incompleteDoctors: doctorStatusCounts.incomplete,
    rejectedDoctors: doctorStatusCounts.rejected,
    totalConsultations: doctors.reduce((sum, d) => sum + (d.total_consultations || 0), 0),
    averageRating: doctors.length > 0
      ? (doctors.reduce((sum, d) => sum + (d.rating || 0), 0) / doctors.length).toFixed(2)
      : 0,
  };

  const clerkingRowsFiltered = useMemo(() => {
    const q = clerkingSearch.trim().toLowerCase();
    if (!q) return adminClerkingNotes;
    return adminClerkingNotes.filter((row) => {
      const haystack = [
        row.doctor_name,
        row.patient_name,
        row.diagnosis,
        row.treatment_plan,
        row.prescriptions,
        row.follow_up_notes,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(q);
    });
  }, [adminClerkingNotes, clerkingSearch]);

  const qaMetrics = useMemo(() => {
    const total = qaAppointments.length;
    const completed = qaAppointments.filter((apt: any) => apt.status === 'completed').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const ratings = qaAppointments
      .map((apt: any) => apt.rating)
      .filter((rating: number | null) => typeof rating === 'number');
    const averageRating = ratings.length > 0
      ? Number((ratings.reduce((sum: number, rating: number) => sum + rating, 0) / ratings.length).toFixed(2))
      : 0;

    const documentedCompleted = qaAppointments.filter((apt: any) =>
      apt.status === 'completed' && typeof apt.notes === 'string' && apt.notes.trim().length > 0
    ).length;
    const documentationCompliance = completed > 0 ? Math.round((documentedCompleted / completed) * 100) : 0;

    const responseCompliant = qaAppointments.filter((apt: any) => {
      if (!apt.created_at || !apt.updated_at) return false;
      if (apt.status !== 'confirmed' && apt.status !== 'completed') return false;
      const createdAt = new Date(apt.created_at).getTime();
      const approvedAt = new Date(apt.updated_at).getTime();
      const within24Hours = approvedAt - createdAt <= 24 * 60 * 60 * 1000;
      return within24Hours;
    }).length;
    const responseTimeCompliance = total > 0 ? Math.round((responseCompliant / total) * 100) : 0;

    return {
      total,
      completed,
      completionRate,
      averageRating,
      documentationCompliance,
      responseTimeCompliance,
    };
  }, [qaAppointments]);

  const qaAlerts = useMemo(() => {
    const alerts: string[] = [];

    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    const doctorsNeedingRenewal = doctors.filter((doctor) => {
      if (!doctor.verification_date) return false;
      const verificationDate = new Date(doctor.verification_date);
      return verificationDate < oneYearAgo;
    });

    if (doctorsNeedingRenewal.length > 0) {
      alerts.push(`${doctorsNeedingRenewal.length} doctor${doctorsNeedingRenewal.length > 1 ? 's' : ''} require credential renewal`);
    }

    const getAppointmentDateValue = (appointment: any) =>
      appointment?.appointment_date || appointment?.date || appointment?.created_at;

    const last30 = new Date(today);
    last30.setDate(today.getDate() - 30);
    const prev30 = new Date(today);
    prev30.setDate(today.getDate() - 60);

    const doctorRatings = new Map<string, { recent: number[]; previous: number[] }>();

    qaAppointments.forEach((appointment: any) => {
      if (!appointment.doctor_id || typeof appointment.rating !== 'number') return;
      const appointmentDate = getAppointmentDateValue(appointment);
      if (!appointmentDate) return;
      const date = new Date(appointmentDate);
      if (date < prev30) return;

      if (!doctorRatings.has(appointment.doctor_id)) {
        doctorRatings.set(appointment.doctor_id, { recent: [], previous: [] });
      }

      const entry = doctorRatings.get(appointment.doctor_id)!;
      if (date >= last30) {
        entry.recent.push(appointment.rating);
      } else {
        entry.previous.push(appointment.rating);
      }
    });

    const decliningDoctors = Array.from(doctorRatings.entries()).filter(([_, data]) => {
      if (data.recent.length < 3 || data.previous.length < 3) return false;
      const recentAvg = data.recent.reduce((sum, rating) => sum + rating, 0) / data.recent.length;
      const prevAvg = data.previous.reduce((sum, rating) => sum + rating, 0) / data.previous.length;
      return recentAvg < prevAvg - 0.5;
    });

    if (decliningDoctors.length > 0) {
      alerts.push(`${decliningDoctors.length} doctor${decliningDoctors.length > 1 ? 's' : ''} with declining patient satisfaction`);
    }

    const sessionWindow = new Date(today);
    sessionWindow.setDate(today.getDate() - 30);

    const recentSessions = qaSessions.filter((session: any) => {
      if (!session.ended_at || !session.duration_seconds) return false;
      return new Date(session.ended_at) >= sessionWindow;
    });

    const overallAvgDuration =
      recentSessions.length > 0
        ? recentSessions.reduce((sum: number, session: any) => sum + session.duration_seconds, 0) / recentSessions.length
        : 0;

    const doctorSessionDurations = new Map<string, number[]>();
    recentSessions.forEach((session: any) => {
      if (!session.doctor_id || typeof session.duration_seconds !== 'number') return;
      if (!doctorSessionDurations.has(session.doctor_id)) {
        doctorSessionDurations.set(session.doctor_id, []);
      }
      doctorSessionDurations.get(session.doctor_id)!.push(session.duration_seconds);
    });

    const exceedingDoctors = Array.from(doctorSessionDurations.entries()).filter(([_, durations]) => {
      if (durations.length < 3 || overallAvgDuration === 0) return false;
      const avgDuration = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
      return avgDuration > overallAvgDuration * 1.25;
    });

    if (exceedingDoctors.length > 0) {
      alerts.push(`${exceedingDoctors.length} doctor${exceedingDoctors.length > 1 ? 's' : ''} exceeding average completion time`);
    }

    return alerts;
  }, [doctors, qaAppointments, qaSessions]);

  const inboxTotalCount = inboxRows.length > 0 ? Number(inboxRows[0].total_count || 0) : 0;
  const inboxTotalPages = inboxTotalCount > 0 ? Math.ceil(inboxTotalCount / inboxPageSize) : 1;
  const selectedMessage = inboxRows.find((row: any) => row.id === selectedMessageId) || null;
  const selectedThreadMessages = useMemo(
    () => (selectedMessage ? parseInboxThreadMessages(selectedMessage) : []),
    [selectedMessage],
  );

  useEffect(() => {
    if (!selectedMessage) {
      setReplySubject('');
      setReplyBody('');
      return;
    }
    const cleanSubject = String(selectedMessage.subject || '').trim();
    const normalizedSubject = cleanSubject.toLowerCase().startsWith('re:')
      ? cleanSubject
      : `Re: ${cleanSubject || 'Your message to MyE-Doctor'}`;
    setReplySubject(normalizedSubject);
    setReplyBody('');
  }, [selectedMessageId, selectedMessage?.subject]);

  const handleSendInboxReply = async () => {
    if (!selectedMessage) return;

    const finalSubject = replySubject.trim();
    const finalBody = replyBody.trim();
    if (!finalSubject || !finalBody) {
      toast({ title: 'Missing fields', description: 'Reply subject and message are required.', variant: 'destructive' });
      return;
    }

    setIsSendingReply(true);
    try {
      const replyPayload = `Subject: ${finalSubject}\n\n${finalBody}`;
      const { error } = await supabase.rpc('admin_append_contact_reply', {
        p_message_id: selectedMessage.id,
        p_reply: replyPayload,
      });
      if (error) {
        throw error;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-contact-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-contact-inbox'] }),
      ]);

      toast({ title: 'Reply sent', description: 'Reply added to the sender conversation thread.' });
      setReplyBody('');
    } catch (error) {
      const errorCode = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code || '')
        : '';
      const errorHint = typeof error === 'object' && error && 'hint' in error
        ? String((error as { hint?: string }).hint || '')
        : '';
      const errorDetails = typeof error === 'object' && error && 'details' in error
        ? String((error as { details?: string }).details || '')
        : '';
      const rawMessage = error instanceof Error
        ? error.message
        : (typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message || '')
          : 'Failed to send reply');
      const message = errorCode === 'PGRST202' || rawMessage.includes('admin_append_contact_reply')
        ? 'Reply function is missing in database. Run db/37_add_contact_message_thread_rpcs.sql in Supabase SQL editor, then retry.'
        : [rawMessage, errorHint, errorDetails].filter(Boolean).join(' | ');
      toast({ title: 'Reply failed', description: message, variant: 'destructive' });
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleSendPlatformMessage = async () => {
    const targetEmail = selectedRecipientEmail.trim().toLowerCase();
    const subject = newMessageSubject.trim();
    const messageBody = newMessageBody.trim();

    if (!targetEmail) {
      toast({ title: 'Recipient required', description: 'Select a recipient email.', variant: 'destructive' });
      return;
    }
    if (!subject || !messageBody) {
      toast({ title: 'Missing fields', description: 'Subject and message are required.', variant: 'destructive' });
      return;
    }

    setIsSendingNewMessage(true);
    try {
      const senderName = (profileFormData.fullName || user?.user_metadata?.full_name || 'Central Admin').toString().trim() || 'Central Admin';
      const [firstName, ...rest] = senderName.split(/\s+/);
      const lastName = rest.join(' ').trim() || 'Admin';

      const { error } = await supabase
        .from('contact_messages')
        .insert({
          first_name: firstName || 'Central',
          last_name: lastName,
          email: targetEmail,
          phone: profileFormData.phone?.trim() || null,
          subject: subject,
          message: `[portal:admin]\nFrom: ${senderName}\n\n${messageBody}`,
        });

      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-contact-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-contact-inbox'] }),
      ]);

      toast({ title: 'Message sent', description: `Message sent to ${targetEmail}.` });
      setNewMessageSubject('');
      setNewMessageBody('');
      setRecipientSearch('');
      setSelectedRecipientLabel('');
      setSelectedRecipientEmail('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      toast({ title: 'Send failed', description: message, variant: 'destructive' });
    } finally {
      setIsSendingNewMessage(false);
    }
  };

  const hasMedicalLicense = (doctor: Doctor) => hasDoctorRegistrationLicense(doctor);

  const getMedicalLicenseUrl = (doctor: Doctor | null | undefined) => {
    if (!doctor) return '';
    const directUrl = String(doctor.medical_license_url || '').trim();
    const fallbackUrl = String(doctor.license_file_url || '').trim();
    return directUrl || fallbackUrl;
  };

  const withCacheBust = (url: string, seed?: string | null) => {
    if (!url) return '';
    const separator = url.includes('?') ? '&' : '?';
    const token = seed ? encodeURIComponent(seed) : Date.now().toString();
    return `${url}${separator}cb=${token}`;
  };

  const getDoctorReviewStatus = (doctor: Doctor): 'pending' | 'approved' | 'rejected' | 'incomplete' => {
    if (!hasMedicalLicense(doctor)) return 'incomplete';
    return (doctor.verification_status || 'pending') as 'pending' | 'approved' | 'rejected' | 'incomplete';
  };

  const handleOverviewStatClick = (
    statKey: 'total_doctors' | 'total_patients' | 'approved' | 'pending' | 'incomplete'
  ) => {
    if (statKey === 'total_doctors') {
      setSearchQuery('');
      setStatusFilter('all');
      setActiveTab('doctors');
      return;
    }

    if (statKey === 'total_patients') {
      setActiveTab('patients');
      return;
    }

    if (statKey === 'approved') {
      setSearchQuery('');
      setStatusFilter('approved');
      setActiveTab('doctors');
      return;
    }

    if (statKey === 'pending') {
      setSearchQuery('');
      setStatusFilter('pending');
      setActiveTab('verification');
      return;
    }

    setSearchQuery('');
    setStatusFilter('incomplete');
    setActiveTab('incomplete-doctors');
  };

  // Filter doctors
  const filteredDoctors = doctors.filter(doctor => {
    const matchesSearch = doctor.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          doctor.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          doctor.specialty?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || getDoctorReviewStatus(doctor) === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleApproveDoctor = async (doctor: Doctor) => {
    if (!selectedDoctor) return;
    if (!hasMedicalLicense(doctor)) {
      toast({
        title: 'Incomplete registration',
        description: 'Medical license is missing. Ask the doctor to upload it before approval.',
        variant: 'destructive',
      });
      return;
    }
    setIsProcessing(true);
    try {
      console.log('Starting doctor approval for:', doctor.user_id);
      const notes = verificationNotes[selectedDoctor.id] || '';
      
      // Update verification status via admin RPC to bypass RLS
      const { error } = await supabase.rpc('admin_update_doctor_registration', {
        p_user_id: doctor.user_id,
        p_verification_status: 'approved',
        p_verification_notes: notes,
        p_verified_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Error updating doctor_registrations via RPC:', error);
        throw error;
      }

      // Insert or update in doctors table for public discovery
      // Using stored function that bypasses RLS for admin operations
      const { error: doctorInsertError } = await supabase
        .rpc('upsert_doctor_profile', {
          p_doctor_id: doctor.user_id,
          p_name: doctor.full_name,
          p_specialty: doctor.specialty,
          p_email: doctor.email,
          p_phone: doctor.phone_number,
          p_avatar_url: doctor.profile_picture_url,
          p_is_active: true,
          p_rate_per_consultation: doctor.rate_per_consultation ?? null,
        });

      if (doctorInsertError) {
        console.error('Failed to insert into doctors table:', doctorInsertError);
      }

      toast({
        title: 'Success',
        description: `Dr. ${doctor.full_name} has been approved and activated.`,
      });

      setShowVerificationDialog(false);
      setSelectedDoctor(null);
      setVerificationNotes({});
      
      // Invalidate and refetch the query
      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-registration', doctor.user_id] });
      
      // Wait a moment for the query to refetch
      setTimeout(() => {
        refetch();
      }, 500);
    } catch (error) {
      console.error('Error in handleApproveDoctor:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve doctor. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteDoctor = async (doctorId: string) => {
    setIsProcessing(true);
    try {
      console.log('Attempting to delete doctor:', doctorId);
      const { data, error } = await supabase.rpc('admin_delete_user', {
        user_id_to_delete: doctorId
      });
      
      console.log('Delete response:', { data, error });
      
      if (error) {
        console.error('RPC error:', error);
        throw error;
      }
      if (data && !data.success) {
        console.error('Function returned error:', data.message);
        throw new Error(data.message);
      }

      toast({ title: 'Success', description: 'Doctor removed from platform' });
      setDeleteDoctorId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      refetch();
    } catch (error: any) {
      console.error('Delete doctor failed:', error);
      toast({ title: 'Error', description: error.message || 'Failed to remove doctor', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectDoctor = async (doctor: Doctor) => {
    if (!selectedDoctor) return;
    setIsProcessing(true);
    try {
      const notes = verificationNotes[selectedDoctor.id] || '';
      // Use admin RPC to update registration (bypass RLS)
      const { error } = await supabase.rpc('admin_update_doctor_registration', {
        p_user_id: doctor.user_id,
        p_verification_status: 'rejected',
        p_verification_notes: notes,
        p_verified_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Error updating doctor_registrations via RPC:', error);
        throw error;
      }

      toast({
        title: 'Rejected',
        description: `Dr. ${doctor.full_name} has been rejected.`,
      });

      setShowVerificationDialog(false);
      setSelectedDoctor(null);
      setVerificationNotes({});
      
      // Invalidate and refetch the query
      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-registration', doctor.user_id] });
      
      // Wait a moment for the query to refetch
      setTimeout(() => {
        refetch();
      }, 500);
    } catch (error) {
      console.error('Error in handleRejectDoctor:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject doctor. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestLicenseReupload = async (doctor: Doctor) => {
    setIsProcessing(true);
    try {
      const notes = verificationNotes[doctor.id] || '';
      const { error } = await supabase.rpc('admin_request_doctor_license_reupload', {
        p_user_id: doctor.user_id,
        p_reupload_reason: notes || null,
      });

      if (error) throw error;

      toast({
        title: 'Re-upload requested',
        description: `Dr. ${doctor.full_name} has been asked to upload a clearer medical license.`,
      });

      setShowVerificationDialog(false);
      setSelectedDoctor(null);
      setVerificationNotes({});
      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-registration', doctor.user_id] });
      setTimeout(() => {
        refetch();
      }, 400);
    } catch (error) {
      console.error('Error requesting medical license re-upload:', error);
      toast({
        title: 'Error',
        description: 'Failed to request re-upload. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const markLicenseReuploadAsSeen = async (doctor: Doctor) => {
    if (!hasUnreadLicenseReupload(doctor)) return;
    const { error } = await supabase.rpc('admin_mark_license_reupload_seen', {
      p_user_id: doctor.user_id,
    });

    if (error) {
      console.error('Error marking re-upload notification as seen:', error);
      return;
    }

    setSelectedDoctor((prev) => (prev && prev.user_id === doctor.user_id
      ? { ...prev, medical_license_reupload_seen_by_admin: true }
      : prev));
    queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
  };

  const markRateChangeAsSeen = async (doctor: Doctor) => {
    if (!hasUnreadRateChangeRequest(doctor)) return;
    const { error } = await supabase.rpc('admin_mark_rate_change_seen', {
      p_user_id: doctor.user_id,
    });

    if (error) {
      console.error('Error marking rate-change notification as seen:', error);
      return;
    }

    setSelectedDoctor((prev) => (prev && prev.user_id === doctor.user_id
      ? { ...prev, rate_change_seen_by_admin: true }
      : prev));
    queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
  };

  const handleReviewRateChange = async (doctor: Doctor, action: 'approve' | 'reject') => {
    setIsProcessing(true);
    try {
      const note = (verificationNotes[doctor.id] || '').trim();
      const { error } = await supabase.rpc('admin_review_doctor_rate_change', {
        p_user_id: doctor.user_id,
        p_action: action,
        p_admin_note: note || null,
      });

      if (error) throw error;

      toast({
        title: action === 'approve' ? 'Rate update approved' : 'Rate update rejected',
        description: `Dr. ${doctor.full_name}'s specialist rate request has been ${action}d.`,
      });

      queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-registration', doctor.user_id] });
      setTimeout(() => {
        refetch();
      }, 300);
    } catch (error) {
      console.error('Error reviewing rate change:', error);
      toast({
        title: 'Error',
        description: 'Failed to review specialist rate change request.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/10 text-success border-success/20 gap-1"><CheckCircle className="w-3 h-3" /> Approved</Badge>;
      case 'pending':
        return <Badge className="bg-warning/10 text-warning border-warning/20 gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
      case 'incomplete':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1"><AlertCircle className="w-3 h-3" /> Incomplete Registration</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAppointmentStatusBadge = (status: string | null | undefined) => {
    const normalized = normalizeAppointmentStatus(status);
    switch (normalized) {
      case 'pending_payment':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-300">Pending Payment</Badge>;
      case 'pending_approval':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">Pending Approval</Badge>;
      case 'confirmed':
        return <Badge className="bg-sky-100 text-sky-700 border-sky-300">Confirmed</Badge>;
      case 'in_progress':
        return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-slate-200 text-slate-700 border-slate-300">Cancelled</Badge>;
      case 'no_show':
        return <Badge className="bg-rose-100 text-rose-700 border-rose-300">No Show</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  const buildCsv = (rows: Array<Record<string, unknown>>) => {
    if (rows.length === 0) return '';
    const headers = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set<string>()),
    );

    const escapeCsvValue = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const text =
        typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
    ];
    return lines.join('\n');
  };

  const downloadCsvFile = (filename: string, rows: Array<Record<string, unknown>>) => {
    const csv = buildCsv(rows);
    if (!csv) {
      toast({ title: 'No data', description: `No records found for ${filename}.` });
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchAllPages = async <T,>(fetchPage: (from: number, to: number) => Promise<T[]>) => {
    const pageSize = 1000;
    let from = 0;
    const all: T[] = [];

    while (true) {
      const page = await fetchPage(from, from + pageSize - 1);
      all.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    return all;
  };

  const fetchAllDoctorsForExport = async () =>
    fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('doctor_registrations')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data || []) as Array<Record<string, unknown>>;
    });

  const fetchAllPatientsForExport = async () =>
    fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('patient_registrations')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data || []) as Array<Record<string, unknown>>;
    });

  const fetchAllAppointmentsForExport = async () =>
    fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data || []) as Array<Record<string, unknown>>;
    });

  const fetchAllClerkingForExport = async () =>
    fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('doctor_consultation_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return (data || []) as Array<Record<string, unknown>>;
    });

  const getNameDirectory = (
    doctorsRows: Array<Record<string, unknown>>,
    patientsRows: Array<Record<string, unknown>>,
  ) => {
    const doctorMap = new Map<string, { full_name?: string; email?: string; phone_number?: string }>();
    const patientMap = new Map<string, { full_name?: string; email?: string; phone_number?: string }>();

    doctorsRows.forEach((row) => {
      const userId = String(row.user_id || '');
      if (!userId) return;
      doctorMap.set(userId, {
        full_name: String(row.full_name || ''),
        email: String(row.email || ''),
        phone_number: String(row.phone_number || ''),
      });
    });

    patientsRows.forEach((row) => {
      const userId = String(row.user_id || '');
      if (!userId) return;
      patientMap.set(userId, {
        full_name: String(row.full_name || ''),
        email: String(row.email || ''),
        phone_number: String(row.phone_number || ''),
      });
    });

    return { doctorMap, patientMap };
  };

  const getExportDateSuffix = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${mi}`;
  };

  const exportDoctors = async () => {
    setIsExporting('doctors');
    try {
      const doctorsRows = await fetchAllDoctorsForExport();
      downloadCsvFile(`doctors_${getExportDateSuffix()}.csv`, doctorsRows);
      toast({ title: 'Download started', description: `Exported ${doctorsRows.length} doctors.` });
    } catch (error: any) {
      toast({ title: 'Export failed', description: error?.message || 'Could not export doctors.', variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  const exportPatients = async () => {
    setIsExporting('patients');
    try {
      const patientsRows = await fetchAllPatientsForExport();
      downloadCsvFile(`patients_${getExportDateSuffix()}.csv`, patientsRows);
      toast({ title: 'Download started', description: `Exported ${patientsRows.length} patients.` });
    } catch (error: any) {
      toast({ title: 'Export failed', description: error?.message || 'Could not export patients.', variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  const exportAppointments = async () => {
    setIsExporting('appointments');
    try {
      const [appointmentsRows, doctorsRows, patientsRows] = await Promise.all([
        fetchAllAppointmentsForExport(),
        fetchAllDoctorsForExport(),
        fetchAllPatientsForExport(),
      ]);
      const { doctorMap, patientMap } = getNameDirectory(doctorsRows, patientsRows);
      const enrichedRows = appointmentsRows.map((row) => {
        const patientId = String(row.patient_id || '');
        const doctorId = String(row.doctor_id || '');
        const patient = patientMap.get(patientId);
        const doctor = doctorMap.get(doctorId);
        return {
          ...row,
          status: normalizeAppointmentStatus(String(row.status || '')),
          patient_name: row.patient_name || patient?.full_name || null,
          patient_email: patient?.email || null,
          patient_phone: patient?.phone_number || null,
          doctor_name: row.specialist_name || doctor?.full_name || null,
          doctor_email: doctor?.email || null,
          doctor_phone: doctor?.phone_number || null,
        };
      });
      downloadCsvFile(`appointments_${getExportDateSuffix()}.csv`, enrichedRows);
      toast({ title: 'Download started', description: `Exported ${enrichedRows.length} appointments.` });
    } catch (error: any) {
      toast({ title: 'Export failed', description: error?.message || 'Could not export appointments.', variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  const exportClerking = async () => {
    setIsExporting('clerking');
    try {
      const [clerkingRows, doctorsRows, patientsRows] = await Promise.all([
        fetchAllClerkingForExport(),
        fetchAllDoctorsForExport(),
        fetchAllPatientsForExport(),
      ]);
      const { doctorMap, patientMap } = getNameDirectory(doctorsRows, patientsRows);
      const enrichedRows = clerkingRows.map((row) => {
        const patientId = String(row.patient_id || '');
        const doctorId = String(row.doctor_id || '');
        const patient = patientMap.get(patientId);
        const doctor = doctorMap.get(doctorId);
        return {
          ...row,
          doctor_name: doctor?.full_name || null,
          doctor_email: doctor?.email || null,
          patient_name: patient?.full_name || null,
          patient_email: patient?.email || null,
        };
      });
      downloadCsvFile(`clerking_${getExportDateSuffix()}.csv`, enrichedRows);
      toast({ title: 'Download started', description: `Exported ${enrichedRows.length} clerking records.` });
    } catch (error: any) {
      toast({ title: 'Export failed', description: error?.message || 'Could not export clerking notes.', variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  const exportAllDatasets = async () => {
    setIsExporting('all');
    try {
      const [doctorsRows, patientsRows, appointmentsRows, clerkingRows] = await Promise.all([
        fetchAllDoctorsForExport(),
        fetchAllPatientsForExport(),
        fetchAllAppointmentsForExport(),
        fetchAllClerkingForExport(),
      ]);

      const { doctorMap, patientMap } = getNameDirectory(doctorsRows, patientsRows);

      const enrichedAppointments = appointmentsRows.map((row) => {
        const patientId = String(row.patient_id || '');
        const doctorId = String(row.doctor_id || '');
        const patient = patientMap.get(patientId);
        const doctor = doctorMap.get(doctorId);
        return {
          ...row,
          status: normalizeAppointmentStatus(String(row.status || '')),
          patient_name: row.patient_name || patient?.full_name || null,
          patient_email: patient?.email || null,
          patient_phone: patient?.phone_number || null,
          doctor_name: row.specialist_name || doctor?.full_name || null,
          doctor_email: doctor?.email || null,
          doctor_phone: doctor?.phone_number || null,
        };
      });

      const enrichedClerking = clerkingRows.map((row) => {
        const patientId = String(row.patient_id || '');
        const doctorId = String(row.doctor_id || '');
        const patient = patientMap.get(patientId);
        const doctor = doctorMap.get(doctorId);
        return {
          ...row,
          doctor_name: doctor?.full_name || null,
          doctor_email: doctor?.email || null,
          patient_name: patient?.full_name || null,
          patient_email: patient?.email || null,
        };
      });

      const suffix = getExportDateSuffix();
      downloadCsvFile(`doctors_${suffix}.csv`, doctorsRows);
      downloadCsvFile(`patients_${suffix}.csv`, patientsRows);
      downloadCsvFile(`appointments_${suffix}.csv`, enrichedAppointments);
      downloadCsvFile(`clerking_${suffix}.csv`, enrichedClerking);

      toast({
        title: 'Downloads started',
        description: `Doctors (${doctorsRows.length}), Patients (${patientsRows.length}), Appointments (${enrichedAppointments.length}), Clerkings (${enrichedClerking.length}).`,
      });
    } catch (error: any) {
      toast({ title: 'Export failed', description: error?.message || 'Could not export all datasets.', variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;

    const fullName = profileFormData.fullName.trim();
    const phone = profileFormData.phone.trim();
    const nextEmail = profileFormData.email.trim();
    const currentEmail = user.email || '';

    if (!fullName) {
      toast({ title: 'Missing name', description: 'Full name is required.', variant: 'destructive' });
      return;
    }
    if (!nextEmail) {
      toast({ title: 'Missing email', description: 'Email is required.', variant: 'destructive' });
      return;
    }

    setIsSavingProfile(true);
    try {
      const updatePayload: { data: Record<string, string>; email?: string } = {
        data: {
          full_name: fullName,
          phone,
        },
      };

      if (nextEmail !== currentEmail) {
        updatePayload.email = nextEmail;
      }

      const { error } = await supabase.auth.updateUser(updatePayload);
      if (error) throw error;

      toast({
        title: 'Profile updated',
        description:
          nextEmail !== currentEmail
            ? 'Profile updated. Check your email to confirm your new address.'
            : 'Admin profile updated successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.message || 'Could not update profile.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    const newPassword = passwordFormData.newPassword.trim();
    const confirmPassword = passwordFormData.confirmPassword.trim();

    if (!newPassword || !confirmPassword) {
      toast({ title: 'Missing fields', description: 'Enter and confirm your new password.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Weak password', description: 'Password must be at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setPasswordFormData({ newPassword: '', confirmPassword: '' });
      toast({ title: 'Success', description: 'Password changed successfully.' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to change password.',
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleUpdateDoctorSignupStatus = async () => {
    setIsUpdatingDoctorSignupStatus(true);
    try {
      const safeMessage =
        doctorSignupClosedMessage.trim()
        || 'Doctor sign up has been closed for this round and will resume soon. Please keep checking the site.';

      const { error } = await supabase.rpc('set_doctor_signup_status', {
        p_doctor_signup_open: doctorSignupOpen,
        p_doctor_signup_closed_message: safeMessage,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['admin-doctor-signup-status'] });

      toast({
        title: 'Success',
        description: doctorSignupOpen
          ? 'Doctor sign up has been reopened.'
          : 'Doctor sign up has been closed for this round.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update doctor sign up status.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingDoctorSignupStatus(false);
    }
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

            <div className="flex items-center gap-4">

              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{t('portal.centralAdmin', 'Central Admin')}</span>
              </div>

              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">AD</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 hidden sm:block">
                  <p className="text-sm font-medium truncate">Admin</p>
                  <p className="text-xs text-muted-foreground truncate">Central Admin</p>
                </div>
              </button>
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
                <nav className="space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto lg:max-h-none">
                  {[
                    { id: 'overview', label: t('common.dashboard', 'Dashboard'), icon: BarChart3 },
                    { id: 'appointments', label: 'Appointments', icon: Clock, badge: unreadAppointmentCount > 0 ? (unreadAppointmentCount > 99 ? '99+' : unreadAppointmentCount) : undefined, badgeTone: 'danger' as const },
                    { id: 'doctors', label: 'Doctors', icon: Users },
                    { id: 'patients', label: 'Patients', icon: Users },
                    { id: 'verification', label: 'Verification', icon: Award, badge: stats.pendingVerification },
                    { id: 'incomplete-doctors', label: 'Incomplete Doctors', icon: AlertCircle, badge: stats.incompleteDoctors },
                    { id: 'messages', label: 'Messages', icon: Mail, badge: (unreadInboxCount + unreadCooMessages) > 0 ? ((unreadInboxCount + unreadCooMessages) > 99 ? '99+' : unreadInboxCount + unreadCooMessages) : undefined, badgeTone: 'danger' as const },
                    { id: 'clerking', label: 'Clerking', icon: FileText },
                    { id: 'clinical', label: 'Clinical Activities', icon: FileText },
                    { id: 'quality', label: 'Quality Assurance', icon: Shield },
                    { id: 'payments', label: 'Payments', icon: BadgeIcon },
                    { id: 'pricing', label: 'Pricing', icon: TrendingUp },
                    { id: 'settings', label: t('common.settings', 'Settings'), icon: Settings },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.id === 'doctors') {
                          setSearchQuery('');
                          setStatusFilter('all');
                        } else if (item.id === 'verification') {
                          setSearchQuery('');
                          setStatusFilter('pending');
                        } else if (item.id === 'incomplete-doctors') {
                          setSearchQuery('');
                          setStatusFilter('incomplete');
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
                    onClick={async () => {
                      await signOut();
                      navigate('/');
                    }}
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
                    Welcome, Central Admin 👋
                  </h1>
                  <p className="text-xs sm:text-sm text-primary-foreground/80">
                    Medical Director Dashboard - System-wide monitoring and quality assurance
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-primary-foreground/80">Pending Approvals</p>
                  <p className="text-2xl font-bold">{stats.pendingVerification}</p>
                </div>
              </div>
            </motion.div>

            {activeTab === 'overview' && !isPwaInstalled && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-sm">
                    Install our mobile app for faster access. Click <span className="font-semibold">Download App</span> to install on your phone.
                  </p>
                  <Button size="sm" className="gap-2" onClick={handleInstallApp}>
                    <Download className="w-4 h-4" />
                    Install App
                  </Button>
                </CardContent>
              </Card>
            )}

            {activeTab === 'overview' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Data Exports</CardTitle>
                  <CardDescription>
                    Download all records for appointments, doctors, patients, and clerkings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={exportAllDatasets} disabled={isExporting !== null}>
                      {isExporting === 'all' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Download All
                    </Button>
                    <Button variant="outline" onClick={exportAppointments} disabled={isExporting !== null}>
                      {isExporting === 'appointments' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Appointments
                    </Button>
                    <Button variant="outline" onClick={exportDoctors} disabled={isExporting !== null}>
                      {isExporting === 'doctors' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Doctors
                    </Button>
                    <Button variant="outline" onClick={exportPatients} disabled={isExporting !== null}>
                      {isExporting === 'patients' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Patients
                    </Button>
                    <Button variant="outline" onClick={exportClerking} disabled={isExporting !== null}>
                      {isExporting === 'clerking' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Clerkings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
                {[
                  { key: 'total_doctors' as const, label: 'Total Doctors', value: stats.totalDoctors, icon: Users, color: 'bg-primary/10 text-primary' },
                  { key: 'total_patients' as const, label: 'Total Patients', value: stats.totalPatients, icon: Users, color: 'bg-blue-500/10 text-blue-500' },
                  { key: 'approved' as const, label: 'Approved', value: stats.approvedDoctors, icon: CheckCircle, color: 'bg-success/10 text-success' },
                  { key: 'pending' as const, label: 'Pending', value: stats.pendingVerification, icon: Clock, color: 'bg-warning/10 text-warning' },
                  { key: 'incomplete' as const, label: 'Incomplete Doctors', value: stats.incompleteDoctors, icon: AlertCircle, color: 'bg-destructive/10 text-destructive' },
                ].map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer transition-shadow hover:shadow-md"
                      onClick={() => handleOverviewStatClick(stat.key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleOverviewStatClick(stat.key);
                        }
                      }}
                    >
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
            )}

            {/* Tabs Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="hidden">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="appointments">Appointments</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="clerking">Clerking</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* System Statistics */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">System Overview</CardTitle>
                      <CardDescription>Key metrics and platform statistics</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium">Total Consultations</span>
                        <span className="text-xl font-bold">{stats.totalConsultations}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium">Active Doctors</span>
                        <span className="text-xl font-bold text-success">{stats.approvedDoctors}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium">Pending Verification</span>
                        <span className="text-xl font-bold text-warning">{stats.pendingVerification}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium">Incomplete Doctors</span>
                        <span className="text-xl font-bold text-destructive">{stats.incompleteDoctors}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium">Platform Average Rating</span>
                        <span className="text-xl font-bold text-accent">{stats.averageRating}★</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent Contact Messages */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Recent Contact Messages</CardTitle>
                      <CardDescription>Latest inquiries from the public contact form</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {contactMessagesLoading ? (
                        <p className="text-sm text-muted-foreground">Loading messages...</p>
                      ) : contactMessages.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No messages yet.</p>
                      ) : (
                        contactMessages.slice(0, 6).map((message: any) => (
                          <div key={message.id} className="p-3 rounded-lg border border-border bg-muted/30">
                            {(() => {
                              const parsedMessages = parseInboxThreadMessages(message);
                              const previewText = parsedMessages[0]?.content || 'No message content.';
                              return (
                                <>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">
                                  {formatInboxSenderName(message)}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {message.created_at ? formatDateTime(message.created_at) : ''}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 [overflow-wrap:anywhere]">
                              {previewText}
                            </p>
                                </>
                              );
                            })()}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  {/* Verification Workflow */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Verification Pipeline</CardTitle>
                      <CardDescription>Doctor onboarding status</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Pending Review</span>
                          <Badge variant="outline">{stats.pendingVerification}</Badge>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-warning"
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.totalDoctors > 0 ? (stats.pendingVerification / stats.totalDoctors) * 100 : 0}%` }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Approved & Active</span>
                          <Badge className="bg-success/10 text-success border-success/20">{stats.approvedDoctors}</Badge>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-success"
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.totalDoctors > 0 ? (stats.approvedDoctors / stats.totalDoctors) * 100 : 0}%` }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Rejected</span>
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20">{stats.rejectedDoctors}</Badge>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-destructive"
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.totalDoctors > 0 ? (stats.rejectedDoctors / stats.totalDoctors) * 100 : 0}%` }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Appointments Tab */}
              <TabsContent value="appointments" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle>Appointment Notifications</CardTitle>
                        <CardDescription>
                          View new and all appointments with patient/doctor names and booked timing.
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={exportAppointments} disabled={isExporting !== null}>
                        {isExporting === 'appointments' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Download CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg border border-border bg-muted/40">
                        <p className="text-xs text-muted-foreground">New (Unread)</p>
                        <p className="text-xl font-bold">{newAppointments.length}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-border bg-muted/40">
                        <p className="text-xs text-muted-foreground">All Tracked</p>
                        <p className="text-xl font-bold">{adminAppointments.length}</p>
                      </div>
                      <div className="p-3 rounded-lg border border-border bg-muted/40">
                        <p className="text-xs text-muted-foreground">Last Updated</p>
                        <p className="text-sm font-semibold">{formatDateTime(new Date().toISOString())}</p>
                      </div>
                    </div>

                    <div className="grid xl:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <p className="text-sm font-semibold mb-3">New Appointments</p>
                        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                          {adminAppointmentsLoading ? (
                            <p className="text-sm text-muted-foreground">Loading appointments...</p>
                          ) : newAppointments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No new appointments.</p>
                          ) : (
                            newAppointments.map((apt) => (
                              <div key={apt.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  {getAppointmentStatusBadge(apt.status)}
                                  <span className="text-xs text-muted-foreground">
                                    {apt.created_at ? formatDateTime(apt.created_at) : notAvailableLabel}
                                  </span>
                                </div>
                                <p className="text-sm"><span className="font-semibold">Patient:</span> {apt.patient_name}</p>
                                <p className="text-sm"><span className="font-semibold">Doctor:</span> Dr. {apt.doctor_name}</p>
                                <p className="text-sm">
                                  <span className="font-semibold">Timing:</span> {apt.date || notAvailableLabel} {apt.time || ''}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <p className="text-sm font-semibold mb-3">All Appointments</p>
                        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                          {adminAppointmentsLoading ? (
                            <p className="text-sm text-muted-foreground">Loading appointments...</p>
                          ) : adminAppointments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No appointments found.</p>
                          ) : (
                            adminAppointments.map((apt) => (
                              <div key={apt.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  {getAppointmentStatusBadge(apt.status)}
                                  <span className="text-xs text-muted-foreground">
                                    {apt.created_at ? formatDate(apt.created_at) : notAvailableLabel}
                                  </span>
                                </div>
                                <p className="text-sm"><span className="font-semibold">Patient:</span> {apt.patient_name}</p>
                                <p className="text-xs text-muted-foreground">{apt.patient_email || notAvailableLabel} • {apt.patient_phone || notAvailableLabel}</p>
                                <p className="text-sm"><span className="font-semibold">Doctor:</span> Dr. {apt.doctor_name}</p>
                                <p className="text-xs text-muted-foreground">{apt.doctor_email || notAvailableLabel} • {apt.doctor_phone || notAvailableLabel}</p>
                                <p className="text-sm">
                                  <span className="font-semibold">Timing:</span> {apt.date || notAvailableLabel} {apt.time || ''}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Messages Tab */}
              <TabsContent value="messages" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>COO Messages</CardTitle>
                    <CardDescription>Send and receive messages with the COO</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {user?.id && (
                      <CooThreadChat
                        threadId="admin"
                        threadType="admin"
                        userId={user.id}
                        senderRole="admin"
                        senderName={user.user_metadata?.full_name || user.email || 'Admin'}
                        label="COO — Chief Operations Officer"
                        onUnreadChange={(count) => {
                          if (activeTab !== 'messages') setUnreadCooMessages(count);
                          else setUnreadCooMessages(0);
                        }}
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Messages</CardTitle>
                    <CardDescription>Read incoming messages and send messages to any platform email</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Send New Message</p>
                        <p className="text-xs text-muted-foreground">
                          Search all platform users by email (including users who never messaged admin), then send.
                        </p>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search platform users by email or name..."
                          className="pl-10"
                          value={recipientSearch}
                          onChange={(event) => setRecipientSearch(event.target.value)}
                        />
                      </div>

                      {platformUserSearchLoading ? (
                        <p className="text-xs text-muted-foreground">Searching users...</p>
                      ) : recipientSearch.trim().length > 0 ? (
                        platformUserMatches.length > 0 ? (
                          <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                            {platformUserMatches.map((row) => (
                              <button
                                key={row.user_id}
                                type="button"
                                onClick={() => {
                                  setSelectedRecipientEmail(String(row.email || '').toLowerCase());
                                  setSelectedRecipientLabel(`${row.full_name || 'User'} (${row.email})`);
                                }}
                                className={`w-full text-left rounded-lg border p-2 text-xs transition ${
                                  selectedRecipientEmail === String(row.email || '').toLowerCase()
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/30 hover:bg-background'
                                }`}
                              >
                                <p className="font-medium">{row.full_name || 'User'}</p>
                                <p className="text-muted-foreground">{row.email}</p>
                                <p className="uppercase tracking-wide text-[10px] text-muted-foreground">{row.role_label || 'user'}</p>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No users found.</p>
                        )
                      ) : null}

                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Selected recipient</p>
                        <p className="text-sm font-medium">{selectedRecipientLabel || 'None selected'}</p>
                      </div>

                      <Input
                        value={newMessageSubject}
                        onChange={(e) => setNewMessageSubject(e.target.value)}
                        placeholder="Message subject"
                      />
                      <Textarea
                        value={newMessageBody}
                        onChange={(e) => setNewMessageBody(e.target.value)}
                        placeholder="Write message..."
                        className="min-h-[120px]"
                      />
                      <Button
                        size="sm"
                        onClick={handleSendPlatformMessage}
                        disabled={isSendingNewMessage || !selectedRecipientEmail}
                      >
                        {isSendingNewMessage ? 'Sending message...' : 'Send Message'}
                      </Button>
                    </div>

                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="relative w-full lg:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search name, email, subject, or message..."
                          className="pl-10"
                          value={inboxSearch}
                          onChange={(event) => {
                            setInboxSearch(event.target.value);
                            setInboxPage(1);
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: '7d', label: 'Last 7 days' },
                          { value: '30d', label: 'Last 30 days' },
                          { value: '90d', label: 'Last 90 days' },
                          { value: 'all', label: 'All time' },
                        ].map((item) => (
                          <Button
                            key={item.value}
                            size="sm"
                            variant={inboxRange === item.value ? 'default' : 'outline'}
                            onClick={() => {
                              setInboxRange(item.value as any);
                              setInboxPage(1);
                            }}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Total {inboxTotalCount} messages</span>
                        <span>•</span>
                        <span>Page {inboxPage} of {inboxTotalPages}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {[10, 20, 50].map((size) => (
                          <Button
                            key={size}
                            size="sm"
                            variant={inboxPageSize === size ? 'default' : 'outline'}
                            onClick={() => {
                              setInboxPageSize(size);
                              setInboxPage(1);
                            }}
                          >
                            {size} / page
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex h-[calc(100vh-15rem)] min-h-[520px] max-h-[820px] bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                      <div className={cn(
                        'flex flex-col border-r border-border bg-muted/10 w-full lg:w-[320px] lg:flex-shrink-0',
                        selectedMessage ? 'hidden lg:flex' : 'flex',
                      )}>
                        <div className="p-3 border-b border-border flex-shrink-0">
                          <p className="text-sm font-semibold text-muted-foreground">
                            Conversations ({inboxTotalCount})
                          </p>
                        </div>
                        <ScrollArea className="flex-1">
                          {inboxLoading ? (
                            <p className="p-3 text-sm text-muted-foreground">Loading messages...</p>
                          ) : inboxRows.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">No messages match your filters.</p>
                          ) : (
                            inboxRows.map((message: any) => {
                              const threadReadAtMs = getThreadReadState()[String(message.id || '')] || 0;
                              const body = String(message.message || '');
                              const createdAtMs = new Date(String(message.created_at || '')).getTime();
                              const adminInitiated = /\[portal:admin\]/i.test(body);
                              const rowUnread = !adminInitiated && !Number.isNaN(createdAtMs) && createdAtMs > threadReadAtMs ? 1 : 0;
                              const replyUnread = countUserReplyMarkersAfter(body, threadReadAtMs);
                              const threadUnreadCount = rowUnread + replyUnread;
                              const senderName = formatInboxSenderName(message);
                              const parsedMessages = parseInboxThreadMessages(message);
                              const previewText = parsedMessages[0]?.content || 'No message content.';
                              const isActive = selectedMessageId === message.id;

                              return (
                                <button
                                  key={message.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedMessageId(message.id);
                                    markAdminThreadRead(message);
                                  }}
                                  className={cn(
                                    'w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50 border-b border-border/50 last:border-0',
                                    isActive && 'bg-primary/5 border-l-4 border-l-primary',
                                  )}
                                >
                                  <Avatar className="w-9 h-9 flex-shrink-0">
                                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                      {senderName.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-sm font-medium truncate">{senderName}</span>
                                      {threadUnreadCount > 0 ? (
                                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px] flex-shrink-0">
                                          {threadUnreadCount > 99 ? '99+' : threadUnreadCount}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{previewText}</p>
                                    <div className="flex items-center justify-end mt-0.5">
                                      <span className="text-[10px] text-muted-foreground">
                                        {message.created_at ? formatDateTime(message.created_at) : ''}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </ScrollArea>
                        <div className="p-3 border-t border-border flex items-center justify-between">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setInboxPage((prev) => Math.max(1, prev - 1))}
                            disabled={inboxPage === 1}
                          >
                            Previous
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setInboxPage((prev) => Math.min(inboxTotalPages, prev + 1))}
                            disabled={inboxPage >= inboxTotalPages}
                          >
                            Next
                          </Button>
                        </div>
                      </div>

                      <div className={cn('flex flex-col flex-1 min-w-0 bg-background', selectedMessage ? 'flex' : 'hidden lg:flex')}>
                        {!selectedMessage ? (
                          <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-muted/5">
                            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                              <Send className="w-6 h-6 text-primary" />
                            </div>
                            <p className="font-semibold">Select a conversation</p>
                            <p className="text-sm text-muted-foreground mt-1">Choose a message thread to start replying.</p>
                          </div>
                        ) : (
                          <>
                            <div className="p-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSelectedMessageId(null)}>
                                <XCircle className="w-5 h-5" />
                              </Button>
                              <Avatar className="w-9 h-9">
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {formatInboxSenderName(selectedMessage).slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-semibold">{formatInboxSenderName(selectedMessage)}</p>
                                <Badge variant="outline" className="text-[10px]">
                                  Thread started {selectedMessage.created_at ? formatDateTime(selectedMessage.created_at) : ''}
                                </Badge>
                              </div>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                              {selectedThreadMessages.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center mt-8">No message content.</p>
                              ) : (
                                selectedThreadMessages.map((threadMsg, index) => {
                                  const isMine = threadMsg.sender === 'admin';
                                  return (
                                    <div key={`${selectedMessage.id}-${index}`} className={cn('flex gap-2 max-w-[80%]', isMine ? 'ml-auto flex-row-reverse' : '')}>
                                      {!isMine && (
                                        <Avatar className="w-7 h-7 flex-shrink-0">
                                          <AvatarFallback className="text-[10px] bg-muted">
                                            {threadMsg.senderName.slice(0, 2).toUpperCase()}
                                          </AvatarFallback>
                                        </Avatar>
                                      )}
                                      <div className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                                        {!isMine && (
                                          <span className="text-[10px] text-muted-foreground mb-0.5 px-1">{threadMsg.senderName}</span>
                                        )}
                                        <div className={cn(
                                          'rounded-2xl px-3 py-2 text-sm shadow-sm',
                                          isMine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm',
                                        )}>
                                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{threadMsg.content}</p>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                                          {threadMsg.timestamp ? formatDateTime(threadMsg.timestamp) : ''}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            <div className="p-3 border-t border-border bg-background flex-shrink-0 space-y-2">
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  handleSendInboxReply();
                                }}
                                className="flex items-center gap-2"
                              >
                                <Input
                                  value={replyBody}
                                  onChange={(e) => setReplyBody(e.target.value)}
                                  placeholder="Type a reply..."
                                  className="flex-1"
                                />
                                <Button
                                  type="submit"
                                  size="icon"
                                  disabled={isSendingReply || !selectedMessage?.email || !replyBody.trim()}
                                >
                                  <Send className="w-4 h-4" />
                                </Button>
                              </form>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Clerking Tab */}
              <TabsContent value="clerking" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Doctor Documentation / Clerking</CardTitle>
                    <CardDescription>
                      Review consultation documentation entered by each doctor.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="relative w-full max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search doctor, patient, diagnosis, treatment..."
                          className="pl-10"
                          value={clerkingSearch}
                          onChange={(e) => setClerkingSearch(e.target.value)}
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={exportClerking} disabled={isExporting !== null}>
                        {isExporting === 'clerking' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Download CSV
                      </Button>
                    </div>

                    <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                      {adminClerkingLoading ? (
                        <p className="text-sm text-muted-foreground">Loading clerking notes...</p>
                      ) : adminClerkingError ? (
                        <p className="text-sm text-destructive">Failed to load clerking notes. Please refresh or re-run 53_admin_clerking_notes_rpc.sql in Supabase.</p>
                      ) : clerkingRowsFiltered.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No clerking records found.</p>
                      ) : (
                        clerkingRowsFiltered.map((row) => (
                          <div key={row.id} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold">Dr. {row.doctor_name}</p>
                              <span className="text-xs text-muted-foreground">
                                {row.created_at ? formatDateTime(row.created_at) : notAvailableLabel}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Patient: {row.patient_name}</p>
                            <div className="grid md:grid-cols-2 gap-3 text-sm">
                              <div className="p-3 rounded-lg bg-background border border-border">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Diagnosis</p>
                                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{row.diagnosis || notAvailableLabel}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-background border border-border">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Treatment Plan</p>
                                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{row.treatment_plan || notAvailableLabel}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-background border border-border">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Prescriptions</p>
                                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{row.prescriptions || notAvailableLabel}</p>
                              </div>
                              <div className="p-3 rounded-lg bg-background border border-border">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Follow-up Notes</p>
                                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{row.follow_up_notes || notAvailableLabel}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Doctors Tab */}
              <TabsContent value="doctors" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Doctor Directory</CardTitle>
                      <CardDescription>All registered doctors on the platform</CardDescription>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 mt-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search by name, email, specialty..." 
                          className="pl-8"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={exportDoctors} disabled={isExporting !== null}>
                        {isExporting === 'doctors' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Download CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {doctorsLoading ? (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">Loading doctors...</p>
                        </div>
                      ) : filteredDoctors.length === 0 ? (
                        <div className="text-center py-8">
                          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">No doctors found</p>
                        </div>
                      ) : (
                        filteredDoctors.map((doctor) => (
                          <div key={doctor.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border hover:shadow-md transition-all">
                            <div className="flex items-center gap-4 mb-3 sm:mb-0">
                              <Avatar className="w-12 h-12">
                                <AvatarImage src={doctor.profile_picture_url} />
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {doctor.full_name?.split(' ').map(n => n[0]).join('') || 'DR'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold">Dr. {doctor.full_name}</p>
                                <p className="text-sm text-muted-foreground">{formatSpecialtyLabel(doctor.specialty)}</p>
                                <p className="text-xs text-muted-foreground">{doctor.email}</p>
                                <p className="text-xs text-muted-foreground">
                                  Location: {doctor.city || 'N/A'}, {(doctor as any).state || 'N/A'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Rate: {Number(doctor.rate_per_consultation || 0) > 0 ? formatCurrency(Number(doctor.rate_per_consultation)) : 'Not set'}
                                </p>
                                {hasUnreadLicenseReupload(doctor) && (
                                  <Badge className="mt-1 bg-destructive text-destructive-foreground">
                                    New License Re-upload
                                  </Badge>
                                )}
                                {hasUnreadRateChangeRequest(doctor) && (
                                  <Badge className="mt-1 bg-destructive text-destructive-foreground">
                                    New Rate Change Request
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                              <div className="text-left sm:text-right mb-2 sm:mb-0">
                                <p className="text-xs text-muted-foreground">Status</p>
                                {getStatusBadge(getDoctorReviewStatus(doctor))}
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedDoctor(doctor);
                                  setShowVerificationDialog(true);
                                  void markLicenseReuploadAsSeen(doctor);
                                  void markRateChangeAsSeen(doctor);
                                }}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                Review
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteDoctorId(doctor.user_id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="incomplete-doctors" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Doctors With Incomplete Registration</CardTitle>
                    <CardDescription>
                      Doctors missing required registration details (for example, medical license upload).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {doctorsLoading ? (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">Loading doctors...</p>
                        </div>
                      ) : doctors.filter((doctor) => getDoctorReviewStatus(doctor) === 'incomplete').length === 0 ? (
                        <div className="text-center py-8">
                          <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
                          <p className="text-muted-foreground">No incomplete doctor registrations.</p>
                        </div>
                      ) : (
                        doctors
                          .filter((doctor) => getDoctorReviewStatus(doctor) === 'incomplete')
                          .map((doctor) => (
                            <div key={doctor.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                <Avatar className="w-12 h-12">
                                  <AvatarImage src={doctor.profile_picture_url} />
                                  <AvatarFallback className="bg-primary/10 text-primary">
                                    {doctor.full_name?.split(' ').map((n) => n[0]).join('') || 'DR'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold">Dr. {doctor.full_name}</p>
                                  <p className="text-sm text-muted-foreground">{formatSpecialtyLabel(doctor.specialty)}</p>
                                  <p className="text-xs text-muted-foreground">{doctor.email || 'No email'}</p>
                                  <p className="text-xs text-muted-foreground">Phone: {doctor.phone_number || 'No phone'}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Location: {doctor.city || 'N/A'}, {(doctor as any).state || 'N/A'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                                <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                                  Incomplete Registration
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedDoctor(doctor);
                                    setShowVerificationDialog(true);
                                  }}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </Button>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Patients Tab */}
              <TabsContent value="patients" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle>Patient Directory</CardTitle>
                        <CardDescription>All registered patients and their appointment history</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={exportPatients} disabled={isExporting !== null}>
                        {isExporting === 'patients' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Download CSV
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PatientsTable />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Verification Tab */}
              <TabsContent value="verification" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Credential Verification</CardTitle>
                        <CardDescription>Review and approve doctor credentials</CardDescription>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => refetch()}
                        disabled={doctorsLoading}
                      >
                        {doctorsLoading ? 'Loading...' : 'Refresh'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {doctorsLoading ? (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">Loading...</p>
                        </div>
                      ) : filteredDoctors.filter((doctor) => {
                        const status = getDoctorReviewStatus(doctor);
                        return status === 'pending' || status === 'incomplete';
                      }).length === 0 ? (
                        <div className="text-center py-8">
                          <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
                          <p className="text-muted-foreground">All pending verifications have been processed</p>
                        </div>
                      ) : (
                        filteredDoctors
                          .filter((doctor) => {
                            const status = getDoctorReviewStatus(doctor);
                            return status === 'pending' || status === 'incomplete';
                          })
                          .map((doctor) => (
                            <div key={doctor.id} className="p-4 rounded-xl border border-warning/30 bg-warning/5">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <Avatar className="w-10 h-10">
                                    <AvatarImage src={doctor.profile_picture_url} />
                                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                      {doctor.full_name?.split(' ').map(n => n[0]).join('') || 'DR'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-semibold">Dr. {doctor.full_name}</p>
                                    <p className="text-sm text-muted-foreground">{formatSpecialtyLabel(doctor.specialty)} • License: {doctor.license_number}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Location: {doctor.city || 'N/A'}, {(doctor as any).state || 'N/A'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Rate: {Number(doctor.rate_per_consultation || 0) > 0 ? formatCurrency(Number(doctor.rate_per_consultation)) : 'Not set'}
                                    </p>
                                    {hasUnreadLicenseReupload(doctor) && (
                                      <Badge className="mt-1 bg-destructive text-destructive-foreground">
                                        New License Re-upload
                                      </Badge>
                                    )}
                                    {hasUnreadRateChangeRequest(doctor) && (
                                      <Badge className="mt-1 bg-destructive text-destructive-foreground">
                                        New Rate Change Request
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {getStatusBadge(getDoctorReviewStatus(doctor))}
                              </div>
                              <div className="space-y-2 my-3">
                                <p className="text-sm">
                                  <span className="font-medium">Experience:</span> {doctor.experience}
                                </p>
                                <p className="text-sm">
                                  <span className="font-medium">Registered:</span> {formatDate(doctor.created_at)}
                                </p>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  className="bg-success hover:bg-success/90"
                                  onClick={async () => {
                                    setSelectedDoctor(doctor);
                                    await handleApproveDoctor(doctor);
                                  }}
                                  disabled={isProcessing || !hasMedicalLicense(doctor)}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={async () => {
                                    setSelectedDoctor(doctor);
                                    await handleRejectDoctor(doctor);
                                  }}
                                  disabled={isProcessing}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedDoctor(doctor);
                                    setShowVerificationDialog(true);
                                    void markLicenseReuploadAsSeen(doctor);
                                    void markRateChangeAsSeen(doctor);
                                  }}
                                >
                                  <FileText className="w-4 h-4 mr-2" />
                                  View Details
                                </Button>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Clinical Activities Tab */}
              <TabsContent value="clinical" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Clinical Activities Monitoring</CardTitle>
                    <CardDescription>Track and monitor doctor clinical performance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {doctorsLoading ? (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">Loading...</p>
                        </div>
                      ) : (
                        filteredDoctors.map((doctor) => (
                          <div key={doctor.id} className="p-4 rounded-xl border border-border">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="w-10 h-10">
                                  <AvatarImage src={doctor.profile_picture_url} />
                                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                    {doctor.full_name?.split(' ').map(n => n[0]).join('') || 'DR'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold">Dr. {doctor.full_name}</p>
                                  <p className="text-sm text-muted-foreground">{formatSpecialtyLabel(doctor.specialty)}</p>
                                </div>
                              </div>
                              {getStatusBadge(getDoctorReviewStatus(doctor))}
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-sm">
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-muted-foreground text-xs">Total Consultations</p>
                                <p className="text-lg font-bold">{doctor.total_consultations || 0}</p>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-muted-foreground text-xs">Patient Rating</p>
                                <p className="text-lg font-bold flex items-center gap-1">
                                  {doctor.rating || notAvailableLabel}<Star className="w-3 h-3 text-warning fill-warning" />
                                </p>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-muted-foreground text-xs">Total Reviews</p>
                                <p className="text-lg font-bold">{doctor.total_reviews || 0}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Payments Tab */}
              <TabsContent value="payments" className="space-y-6">
                <PaymentsManagementPanel />
              </TabsContent>

              {/* Pricing Tab */}
              <TabsContent value="pricing" className="space-y-6">
                <PricingManagementPanel />
              </TabsContent>

              {/* Quality Assurance Tab */}
              <TabsContent value="quality" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Quality Assurance Dashboard</CardTitle>
                    <CardDescription>Platform performance and compliance metrics</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg border border-Success/30 bg-success/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Documentation Compliance</span>
                          <span className="text-2xl font-bold text-success">
                            {qaLoading ? '--' : `${qaMetrics.documentationCompliance}%`}
                          </span>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-success"
                            style={{ width: `${qaMetrics.documentationCompliance}%` }}
                          />
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Appointment Completion Rate</span>
                          <span className="text-2xl font-bold text-primary">
                            {qaLoading ? '--' : `${qaMetrics.completionRate}%`}
                          </span>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${qaMetrics.completionRate}%` }}
                          />
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-accent/30 bg-accent/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Patient Satisfaction Average</span>
                          <span className="text-2xl font-bold text-accent">
                            {qaLoading ? '--' : `${qaMetrics.averageRating || 0}/5`}
                          </span>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${Math.min(100, (qaMetrics.averageRating || 0) * 20)}%` }}
                          />
                        </div>
                      </div>
                      <div className="p-4 rounded-lg border border-warning/30 bg-warning/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Response Time Compliance</span>
                          <span className="text-2xl font-bold text-warning">
                            {qaLoading ? '--' : `${qaMetrics.responseTimeCompliance}%`}
                          </span>
                        </div>
                        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-warning"
                            style={{ width: `${qaMetrics.responseTimeCompliance}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-sm mb-1">Monitoring Alerts</p>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {qaAlerts.length === 0 ? (
                              <li>• No active alerts right now</li>
                            ) : (
                              qaAlerts.map((alert) => (
                                <li key={alert}>• {alert}</li>
                              ))
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Admin Profile</CardTitle>
                    <CardDescription>Manage your central admin account settings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <Avatar className="w-16 h-16">
                          <AvatarImage src="" />
                          <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                            {(profileFormData.fullName || 'Admin')
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-lg">{profileFormData.fullName || 'Central Admin'}</p>
                          <p className="text-sm text-muted-foreground">{profileFormData.email || user?.email}</p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Full Name</label>
                          <Input
                            value={profileFormData.fullName}
                            onChange={(e) => setProfileFormData({ ...profileFormData, fullName: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Email</label>
                          <Input
                            type="email"
                            value={profileFormData.email}
                            onChange={(e) => setProfileFormData({ ...profileFormData, email: e.target.value })}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Phone</label>
                          <Input
                            value={profileFormData.phone}
                            onChange={(e) => setProfileFormData({ ...profileFormData, phone: e.target.value })}
                            className="mt-1"
                            placeholder="+234..."
                          />
                        </div>
                      </div>

                      <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                        {isSavingProfile ? 'Saving...' : 'Save Profile'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Notification Alerts</CardTitle>
                    <CardDescription>Tune ring and vibration intensity for this device and test it immediately.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-w-md">
                      <div>
                        <label className="text-sm font-medium">Intensity</label>
                        <select
                          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={notificationAlertIntensity}
                          onChange={(e) => handleNotificationIntensityChange(e.target.value)}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <Button type="button" variant="outline" onClick={handleTestAlert}>
                        Test Alert
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Change Password</CardTitle>
                    <CardDescription>Update your admin account password</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-w-md">
                      <div>
                        <label className="text-sm font-medium">New Password</label>
                        <Input
                          type="password"
                          value={passwordFormData.newPassword}
                          onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
                          className="mt-1"
                          placeholder="At least 8 characters"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Confirm New Password</label>
                        <Input
                          type="password"
                          value={passwordFormData.confirmPassword}
                          onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                          className="mt-1"
                          placeholder="Re-enter new password"
                        />
                      </div>
                      <Button onClick={handleChangePassword} disabled={isChangingPassword}>
                        {isChangingPassword ? 'Updating...' : 'Update Password'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Doctor Sign Up Control</CardTitle>
                    <CardDescription>Close or reopen doctor registration rounds.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">Doctor sign up is {doctorSignupOpen ? 'open' : 'closed'}</p>
                          <p className="text-xs text-muted-foreground">
                            When closed, doctors will be informed that sign up has been closed for this round.
                          </p>
                        </div>
                        <Switch checked={doctorSignupOpen} onCheckedChange={setDoctorSignupOpen} />
                      </div>

                      {!doctorSignupOpen && (
                        <div>
                          <label className="text-sm font-medium">Closed message shown to doctors</label>
                          <Textarea
                            className="mt-1"
                            rows={3}
                            value={doctorSignupClosedMessage}
                            onChange={(e) => setDoctorSignupClosedMessage(e.target.value)}
                            placeholder="Doctor sign up has been closed for this round and will resume soon. Please keep checking the site."
                          />
                        </div>
                      )}

                      <Button onClick={handleUpdateDoctorSignupStatus} disabled={isUpdatingDoctorSignupStatus}>
                        {isUpdatingDoctorSignupStatus ? 'Updating...' : 'Save Doctor Sign Up Status'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      {/* Doctor Details Dialog */}
      <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Doctor Verification Details</DialogTitle>
            <DialogDescription>
              Review credentials and documentation
            </DialogDescription>
          </DialogHeader>
          {selectedDoctor && (
            <div className="space-y-6">
              {/* Profile Section */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-4 mb-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={selectedDoctor.profile_picture_url} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">
                      {selectedDoctor.full_name?.split(' ').map(n => n[0]).join('') || 'DR'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-xl">Dr. {selectedDoctor.full_name}</p>
                    <p className="text-sm text-muted-foreground">{formatSpecialtyLabel(selectedDoctor.specialty)}</p>
                    {getStatusBadge(getDoctorReviewStatus(selectedDoctor))}
                    {hasUnreadLicenseReupload(selectedDoctor) && (
                      <Badge className="mt-2 bg-destructive text-destructive-foreground">New License Re-upload</Badge>
                    )}
                    {hasUnreadRateChangeRequest(selectedDoctor) && (
                      <Badge className="mt-2 bg-destructive text-destructive-foreground">New Rate Change Request</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div>
                <h3 className="font-semibold mb-3">Personal Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Email</p>
                    <p className="font-medium">{selectedDoctor.email}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Phone Number</p>
                    <p className="font-medium">{(selectedDoctor as any).phone_number || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Gender</p>
                    <p className="font-medium capitalize">{(selectedDoctor as any).gender || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Age</p>
                    <p className="font-medium">{(selectedDoctor as any).age || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Marital Status</p>
                    <p className="font-medium capitalize">{(selectedDoctor as any).marital_status || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Registration Date</p>
                    <p className="font-medium">{formatDate(selectedDoctor.created_at)}</p>
                  </div>
                </div>
              </div>

              {/* Location Information */}
              <div>
                <h3 className="font-semibold mb-3">Location</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">City</p>
                    <p className="font-medium">{(selectedDoctor as any).city || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">State</p>
                    <p className="font-medium">{(selectedDoctor as any).state || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Country</p>
                    <p className="font-medium">{(selectedDoctor as any).country || notAvailableLabel}</p>
                  </div>
                </div>
              </div>

              {/* Professional Information */}
              <div>
                <h3 className="font-semibold mb-3">Professional Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Specialty</p>
                    <p className="font-medium">{formatSpecialtyLabel(selectedDoctor.specialty)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Hospital Affiliation</p>
                    <p className="font-medium">{(selectedDoctor as any).hospital_affiliation || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Experience</p>
                    <p className="font-medium">{selectedDoctor.experience || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">License Number</p>
                    <p className="font-medium">{selectedDoctor.license_number || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Current Specialist Rate</p>
                    <p className="font-medium">
                      {Number(selectedDoctor.rate_per_consultation || 0) > 0
                        ? formatCurrency(Number(selectedDoctor.rate_per_consultation))
                        : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Identification */}
              <div>
                <h3 className="font-semibold mb-3">Identification</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">ID Type</p>
                    <p className="font-medium capitalize">{(selectedDoctor as any).identification_type?.replace('_', ' ') || notAvailableLabel}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">ID Number</p>
                    <p className="font-medium">{(selectedDoctor as any).identification_number || notAvailableLabel}</p>
                  </div>
                </div>
              </div>

              {/* Medical License Document */}
              {getMedicalLicenseUrl(selectedDoctor) ? (
                <div>
                  <h3 className="font-semibold mb-3">Medical License / Registration Certificate</h3>
                  <div className="p-4 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        <span className="text-sm font-medium">License Document</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(getMedicalLicenseUrl(selectedDoctor), '_blank')}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Document
                      </Button>
                    </div>
                    <iframe
                      title="Medical License Preview"
                      src={withCacheBust(
                        getMedicalLicenseUrl(selectedDoctor),
                        String(
                          (selectedDoctor as any).medical_license_reuploaded_at
                          || (selectedDoctor as any).updated_at
                          || selectedDoctor.created_at
                          || ''
                        ),
                      )}
                      className="w-full h-96 rounded-lg border border-border bg-background"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      If preview does not load in-browser, use "View Document".
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                  <p className="text-sm font-medium text-destructive">Incomplete Registration</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Medical license / registration certificate has not been uploaded.
                  </p>
                </div>
              )}

              {(selectedDoctor as any).medical_license_reupload_required && (
                <div className="p-4 rounded-lg border border-warning/40 bg-warning/10">
                  <p className="text-sm font-medium text-warning">Re-upload Requested</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The doctor has been asked to upload a clearer medical license document.
                  </p>
                  {(selectedDoctor as any).medical_license_reupload_reason && (
                    <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                      <span className="font-medium text-foreground">Reason:</span>{' '}
                      {(selectedDoctor as any).medical_license_reupload_reason}
                    </p>
                  )}
                </div>
              )}

              {Number((selectedDoctor as any).proposed_rate_per_consultation || 0) > 0 && (
                <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
                  <p className="text-sm font-medium text-destructive">Specialist Rate Change Request</p>
                  <p className="text-sm">
                    <span className="font-medium">Current Rate:</span>{' '}
                    {Number(selectedDoctor.rate_per_consultation || 0) > 0
                      ? formatCurrency(Number(selectedDoctor.rate_per_consultation))
                      : 'Not set'}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Requested Rate:</span>{' '}
                    {formatCurrency(Number((selectedDoctor as any).proposed_rate_per_consultation))}
                  </p>
                  {(selectedDoctor as any).rate_change_requested_at && (
                    <p className="text-sm">
                      <span className="font-medium">Requested At:</span>{' '}
                      {formatDateTime((selectedDoctor as any).rate_change_requested_at)}
                    </p>
                  )}
                  {(selectedDoctor as any).rate_change_reason && (
                    <p className="text-sm whitespace-pre-wrap">
                      <span className="font-medium">Doctor Reason:</span>{' '}
                      {(selectedDoctor as any).rate_change_reason}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-success hover:bg-success/90"
                      onClick={() => handleReviewRateChange(selectedDoctor, 'approve')}
                      disabled={isProcessing}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve Rate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleReviewRateChange(selectedDoctor, 'reject')}
                      disabled={isProcessing}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject Rate
                    </Button>
                  </div>
                </div>
              )}

              {selectedDoctor.verification_status === 'pending' && (
                <>
                  <div>
                    <label className="text-sm font-medium">Verification Notes</label>
                    <Textarea 
                      placeholder="Add notes about the verification process..."
                      className="mt-2"
                      value={verificationNotes[selectedDoctor.id] || ''}
                      onChange={(e) => setVerificationNotes({
                        ...verificationNotes,
                        [selectedDoctor.id]: e.target.value
                      })}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-success hover:bg-success/90"
                      onClick={() => handleApproveDoctor(selectedDoctor)}
                      disabled={isProcessing || !hasMedicalLicense(selectedDoctor)}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve & Activate
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleRequestLicenseReupload(selectedDoctor)}
                      disabled={isProcessing}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Request Re-upload
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleRejectDoctor(selectedDoctor)}
                      disabled={isProcessing}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </>
              )}

              {selectedDoctor.verification_status !== 'pending' && (
                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm mb-2">
                      <span className="font-medium">Verification Date:</span> {formatDate(selectedDoctor.verification_date)}
                    </p>
                    {(selectedDoctor as any).verified_at && (
                      <p className="text-sm">
                        <span className="font-medium">Verified At:</span> {formatDateTime((selectedDoctor as any).verified_at)}
                      </p>
                    )}
                  </div>
                  {(selectedDoctor as any).verification_notes && (
                    <div className="p-4 rounded-lg bg-muted/50">
                      <h3 className="font-semibold mb-2">Verification Notes</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {(selectedDoctor as any).verification_notes}
                      </p>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => handleRequestLicenseReupload(selectedDoctor)}
                    disabled={isProcessing}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Request New License Upload
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Doctor Confirmation */}
      <AlertDialog open={!!deleteDoctorId} onOpenChange={(open) => !open && setDeleteDoctorId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Doctor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this doctor from the platform? This will delete their account and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDoctorId && handleDeleteDoctor(deleteDoctorId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remove Doctor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CentralAdmin;
