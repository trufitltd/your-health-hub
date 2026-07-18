import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Users, CalendarClock, Stethoscope, CreditCard, MessageSquare, Bell, Settings, Download, Gift } from 'lucide-react';
import { normalizeAppointmentStatus } from '@/services/marketplaceTypes';
import { useLocaleFormatter } from '@/lib/locale';
import { COOMessagesTab } from '@/components/coo/COOMessagesTab';
import { toast } from '@/components/ui/use-toast';
import {
  triggerNotificationAlert,
  getNotificationAlertIntensity,
  setNotificationAlertIntensity as persistNotificationAlertIntensity,
  type NotificationAlertIntensity,
} from '@/lib/notificationAlert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type AppointmentRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  updated_at?: string | null;
  date: string | null;
  patient_id: string | null;
  doctor_id: string | null;
  rating: number | null;
  review_comment: string | null;
};

type DoctorRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  city?: string | null;
  state?: string | null;
  verification_status: string | null;
  medical_license_url?: string | null;
  rate_per_consultation?: number | null;
  consultation_currency?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
};

type PatientRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  age?: number | null;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
};

type PaymentRow = {
  id: string;
  appointment_id?: string | null;
  patient_id?: string | null;
  amount: number | null;
  currency?: string | null;
  status: string | null;
  created_at: string | null;
  verified_at?: string | null;
  payment_method: string | null;
  provider: string | null;
  patient_name?: string | null;
  patient_email?: string | null;
  patient_phone?: string | null;
};

type PaymentAppointmentLookupRow = {
  id: string;
  created_at: string | null;
};

type AppointmentPaymentSummary = {
  appointment_id: string;
  status: string | null;
  created_at: string | null;
  verified_at: string | null;
};

type ContactInboxRow = {
  id: string;
  email: string | null;
  subject: string | null;
  message: string | null;
  created_at: string | null;
  name: string | null;
};

type OnlineDoctorPresence = {
  user_id: string;
  status: string;
  online_at: string;
};

type ProfileRow = {
  full_name: string | null;
};

type QuickMessageTarget = {
  id: string;
  type: 'doctor' | 'patient';
  name: string;
  email: string;
};

const isSuccessfulPayment = (status: string | null | undefined) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['completed', 'success', 'paid', 'succeeded'].includes(normalized);
};

const isFailedPayment = (status: string | null | undefined) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['failed', 'error', 'abandoned', 'cancelled'].includes(normalized);
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
  if (!csv) return;

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

import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useAppointmentReminders } from '@/hooks/useAppointmentReminders';

export default function COOPortal() {
  const { user, signOut } = useAuth();

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery({
    queryKey: ['coo-appointments-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return (data || []) as AppointmentRow[];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Realtime notifications for COO
  useRealtimeNotifications(user?.id, 'coo', user?.email);
  useAppointmentReminders(appointments, user?.id);
  const { isInstalled: isPwaInstalled, promptInstall } = usePwaInstall();
  const { formatDateTime, formatCurrency } = useLocaleFormatter();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onlineDoctorIds, setOnlineDoctorIds] = useState<Record<string, OnlineDoctorPresence>>({});
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [notificationAlertIntensity, setNotificationAlertIntensityState] = useState<NotificationAlertIntensity>(() => getNotificationAlertIntensity());
  const [cooProfilePicture, setCooProfilePicture] = useState<string>('');
  const [passwordFormData, setPasswordFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [doctorEmailSearch, setDoctorEmailSearch] = useState('');
  const [activeDoctorEmailSearch, setActiveDoctorEmailSearch] = useState('');
  const [patientEmailSearch, setPatientEmailSearch] = useState('');
  const [patientFilter, setPatientFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [isExportingPatients, setIsExportingPatients] = useState(false);
  const [quickMessageTarget, setQuickMessageTarget] = useState<QuickMessageTarget | null>(null);
  const [quickMessageBody, setQuickMessageBody] = useState('');
  const [isSendingQuickMessage, setIsSendingQuickMessage] = useState(false);
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
      tag: `settings-test-alert-${user?.id || 'coo'}-${Date.now()}`,
      urgent: true,
      intensity: notificationAlertIntensity,
    });
  };

  const exportCompletePatients = () => {
    if (!patients.length) {
      toast({ title: 'No data', description: 'No completed patient registrations found to export.' });
      return;
    }

    setIsExportingPatients(true);
    try {
      const completedRows = patients
        .filter((patient) => patient.registration_complete)
        .map((patient) => ({
          name: patient.full_name || '',
          email: patient.email || '',
          phone: patient.phone_number || '',
          location: [patient.city, patient.state].filter(Boolean).join(', '),
        }));

      const filename = `completed_patients_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCsvFile(filename, completedRows);
      toast({ title: 'Download started', description: `Exported ${completedRows.length} completed patient registrations.` });
    } catch (error: any) {
      toast({ title: 'Export failed', description: error?.message || 'Could not export completed patients.', variant: 'destructive' });
    } finally {
      setIsExportingPatients(false);
    }
  };

  const allowedEmails = useMemo(() => {
    const cooRaw = (import.meta.env.VITE_COO_EMAILS as string | undefined) || '';
    const adminRaw = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) || '';
    const source = cooRaw.trim().length > 0 ? cooRaw : adminRaw;
    return source
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }, []);

  const userEmail = (user?.email || '').toLowerCase();
  const metadataRole = String(user?.user_metadata?.role || '').toLowerCase();
  const isAllowed = !!user && (metadataRole === 'coo' || allowedEmails.includes(userEmail));

  useEffect(() => {
    setCooProfilePicture((user?.user_metadata?.avatar as string) || '');
  }, [user?.user_metadata]);

  const { data: cooProfile } = useQuery({
    queryKey: ['coo-profile-name', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as ProfileRow | null;
    },
    enabled: isAllowed && !!user?.id,
  });

  const cooDisplayName = cooProfile?.full_name?.trim() || (user?.user_metadata?.full_name as string) || user?.email || 'COO';
  const cooDisplayEmail = user?.email || '';
  const cooInitials = cooDisplayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    if (!isAllowed) return;
    const ch = supabase.channel('doctors-presence', { config: { presence: { key: 'coo-observer' } } });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const map: Record<string, OnlineDoctorPresence> = {};
      Object.values(state).forEach((presences: any[]) => {
        presences.forEach((p) => {
          if (p.user_id) map[p.user_id] = { user_id: p.user_id, status: p.status || 'online', online_at: p.online_at || '' };
        });
      });
      setOnlineDoctorIds(map);
    }).subscribe();
    return () => { ch.unsubscribe(); };
  }, [isAllowed]);

  const { data: promoStats = { used: 0, limit: 126, remaining: 126 } } = useQuery({
    queryKey: ['coo-promo-stats'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('is_promotion', true)
        .eq('promotion_type', 'FIRST_126_FREE')
        .neq('status', 'cancelled');

      if (error) throw error;
      return {
        used: count || 0,
        limit: 126,
        remaining: Math.max(126 - (count || 0), 0)
      };
    },
    enabled: isAllowed,
    refetchInterval: 30000,
  });

  const { data: patientCount = 0 } = useQuery({
    queryKey: ['coo-patient-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('patient_registrations')
        .select('user_id', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
    enabled: isAllowed,
  });

  const { data: doctors = [] } = useQuery({
   queryKey: ['coo-doctors'],
   queryFn: async () => {
     const { data, error } = await supabase
       .from('doctor_registrations')
       .select('user_id, full_name, email, phone_number, city, state, verification_status, medical_license_url, rate_per_consultation, consultation_currency, bank_name, bank_account_name, bank_account_number')
       .order('created_at', { ascending: false });
     if (error) throw error;
     return (data || []) as DoctorRow[];
   },
   enabled: isAllowed,
  });
  const { data: patients = [] } = useQuery({
    queryKey: ['coo-patients-directory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_registrations')
        .select('user_id, full_name, email, phone_number, age, gender, city, state, post_auth_prompt_completed')
        .limit(5000);
      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        registration_complete: r.post_auth_prompt_completed === true,
      })) as (PatientRow & { registration_complete: boolean })[];
    },
    enabled: isAllowed,
  });


  const { data: payments = [] } = useQuery({
    queryKey: ['coo-payments'],
    queryFn: async () => {
      const rpc = await supabase.rpc('admin_list_payments', {
        p_status: null,
        p_provider: null,
        p_limit: 2000,
        p_offset: 0,
      });

      if (!rpc.error) {
        return (rpc.data || []) as PaymentRow[];
      }

      const { data, error } = await supabase
        .from('payments')
        .select('id, appointment_id, patient_id, amount, currency, status, created_at, verified_at, payment_method, provider')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as PaymentRow[];
    },
    enabled: isAllowed,
  });

  const { data: contactInbox = [] } = useQuery({
    queryKey: ['coo-contact-inbox'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_contact_messages_inbox', {
        search_term: null,
        start_date: null,
        limit_count: 500,
        offset_count: 0,
      });
      if (error) throw error;
      return (data || []) as ContactInboxRow[];
    },
    enabled: isAllowed,
    refetchInterval: 30000,
  });

  const newBookings = useMemo(() => {
    return appointments
      .filter((apt) => {
        const s = normalizeAppointmentStatus(apt.status);
        return s === 'confirmed' || s === 'pending' || s === 'pending_approval' || s === 'pending_payment' || s === 'payment_processing';
      })
      .slice(0, 50);
  }, [appointments]);

  const doctorById = useMemo(() => {
    return new Map(doctors.map((doctor) => [doctor.user_id, doctor]));
  }, [doctors]);

  const patientById = useMemo(() => {
    return new Map(patients.map((patient) => [patient.user_id, patient]));
  }, [patients]);

  const paymentAppointmentIds = useMemo(() => {
    return Array.from(
      new Set(
        payments
          .map((payment) => payment.appointment_id)
          .filter((value): value is string => Boolean(value))
      )
    );
  }, [payments]);

  const { data: paymentAppointmentRows = [] } = useQuery({
    queryKey: ['coo-payment-appointments-lookup', paymentAppointmentIds.join(',')],
    queryFn: async () => {
      if (paymentAppointmentIds.length === 0) return [] as PaymentAppointmentLookupRow[];
      const { data, error } = await supabase
        .from('appointments')
        .select('id, created_at')
        .in('id', paymentAppointmentIds);
      if (error) throw error;
      return (data || []) as PaymentAppointmentLookupRow[];
    },
    enabled: isAllowed && paymentAppointmentIds.length > 0,
    staleTime: 60_000,
  });

  const paymentAppointmentById = useMemo(() => {
    return new Map(paymentAppointmentRows.map((row) => [row.id, row]));
  }, [paymentAppointmentRows]);

  const paymentSummaryByAppointmentId = useMemo(() => {
    const next = new Map<string, AppointmentPaymentSummary>();
    for (const payment of payments) {
      const appointmentId = String(payment.appointment_id || '');
      if (!appointmentId) continue;
      const candidate = payment.verified_at || payment.created_at || null;
      const current = next.get(appointmentId);
      const candidateTime = candidate ? new Date(candidate).getTime() : -1;
      const currentActivity = current ? (current.verified_at || current.created_at) : null;
      const currentTime = currentActivity ? new Date(currentActivity).getTime() : -1;
      if (!current || candidateTime > currentTime) {
        next.set(appointmentId, {
          appointment_id: appointmentId,
          status: payment.status || null,
          created_at: payment.created_at || null,
          verified_at: payment.verified_at || null,
        });
      }
    }
    return next;
  }, [payments]);

  const formatExactDateTime = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };
  const formatBookedAt = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const renderAppointmentAuditTimestamps = (apt: AppointmentRow) => {
    const payment = paymentSummaryByAppointmentId.get(apt.id);
    const paymentStatus = String(payment?.status || '').trim().toLowerCase();
    const paymentMadeAt = payment?.verified_at
      || (['success', 'successful', 'succeeded', 'paid', 'completed'].includes(paymentStatus)
        ? payment?.created_at || null
        : null);
    
    const dates = [
      paymentMadeAt ? new Date(paymentMadeAt).getTime() : 0,
      apt.updated_at ? new Date(apt.updated_at).getTime() : 0,
      apt.created_at ? new Date(apt.created_at).getTime() : 0
    ].filter(t => t > 0);
    
    const activityDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;
    return (
      <div className="rounded-md bg-muted/40 p-2 space-y-1">
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Created:</span> {formatExactDateTime(apt.created_at)}</p>
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Verified:</span> {formatExactDateTime(payment?.verified_at || null)}</p>
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Booked at:</span> {formatBookedAt(apt.created_at)}</p>
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Payment made at:</span> {formatExactDateTime(paymentMadeAt)}</p>
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Activity date:</span> {formatExactDateTime(activityDate)}</p>
      </div>
    );
  };

  const activeDoctorsOverview = useMemo(() => {
    const onlineIds = Object.keys(onlineDoctorIds);
    const activeDoctors = doctors.filter((doc) =>
      String(doc.verification_status || '').toLowerCase() === 'approved' && onlineIds.includes(doc.user_id)
    );
    return {
      approvedDoctors: doctors.filter((d) => String(d.verification_status || '').toLowerCase() === 'approved').length,
      activeOnlineCount: activeDoctors.length,
      activeDoctorsList: activeDoctors,
    };
  }, [doctors, onlineDoctorIds]);

  const getDoctorListingStatus = (doctor: DoctorRow) => {
    if (!String(doctor.medical_license_url || '').trim()) return 'incomplete';
    return String(doctor.verification_status || 'pending').toLowerCase();
  };

  const appointmentOverview = useMemo(() => {
    const normalized = appointments.map((apt) => ({
      ...apt,
      normalizedStatus: normalizeAppointmentStatus(apt.status),
    }));
    const newAppointments = normalized.filter((apt) =>
      apt.normalizedStatus === 'confirmed' ||
      ['pending', 'pending_approval', 'pending_payment', 'payment_processing'].includes(String(apt.normalizedStatus || '')),
    ).length;
    const successfulConsultations = normalized.filter((apt) => apt.normalizedStatus === 'completed').length;
    const confirmedAppointments = normalized.filter((apt) => apt.normalizedStatus === 'confirmed').length;
    const inProgressAppointments = normalized.filter((apt) => apt.normalizedStatus === 'in_progress').length;
    const failedConsultations = normalized.filter((apt) => apt.normalizedStatus === 'cancelled' || apt.normalizedStatus === 'no_show').length;
    const pendingAppointments = normalized.filter(
      (apt) => ['pending', 'pending_approval', 'pending_payment', 'payment_processing'].includes(String(apt.normalizedStatus || '')),
    ).length;
    return {
      totalAppointments: normalized.length,
      newAppointments,
      existingAppointments: Math.max(normalized.length - newAppointments, 0),
      successfulConsultations,
      confirmedAppointments,
      inProgressAppointments,
      failedConsultations,
      pendingAppointments,
    };
  }, [appointments]);

  const appointmentStatusRows = useMemo(() => appointments.map((apt) => ({
    ...apt,
    normalizedStatus: normalizeAppointmentStatus(apt.status),
  })), [appointments]);

  const successfulAppointments = useMemo(() => appointmentStatusRows.filter(
    (apt) => apt.normalizedStatus === 'completed',
  ), [appointmentStatusRows]);

  const failedAppointments = useMemo(() => appointmentStatusRows.filter(
    (apt) => apt.normalizedStatus === 'cancelled' || apt.normalizedStatus === 'no_show',
  ), [appointmentStatusRows]);

  const confirmedAppointments = useMemo(() => appointmentStatusRows.filter(
    (apt) => apt.normalizedStatus === 'confirmed',
  ), [appointmentStatusRows]);

  const inProgressAppointments = useMemo(() => appointmentStatusRows.filter(
    (apt) => apt.normalizedStatus === 'in_progress',
  ), [appointmentStatusRows]);

  const pendingAppointments = useMemo(() => appointmentStatusRows.filter(
    (apt) => ['pending', 'pending_approval', 'pending_payment', 'payment_processing'].includes(String(apt.normalizedStatus || '')),
  ), [appointmentStatusRows]);

  const incompleteDoctors = useMemo(
    () => doctors.filter((doctor) => getDoctorListingStatus(doctor) === 'incomplete'),
    [doctors],
  );
  const incompleteDoctorIds = useMemo(
    () => new Set(incompleteDoctors.map((doctor) => doctor.user_id)),
    [incompleteDoctors],
  );

  const filteredDoctors = useMemo(() => {
    const q = doctorEmailSearch.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((doctor) => String(doctor.email || '').toLowerCase().includes(q));
  }, [doctors, doctorEmailSearch]);

  const filteredActiveDoctors = useMemo(() => {
    const q = activeDoctorEmailSearch.trim().toLowerCase();
    if (!q) return activeDoctorsOverview.activeDoctorsList;
    return activeDoctorsOverview.activeDoctorsList.filter((doctor) => String(doctor.email || '').toLowerCase().includes(q));
  }, [activeDoctorsOverview.activeDoctorsList, activeDoctorEmailSearch]);

  const filteredPatients = useMemo(() => {
    const q = patientEmailSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((patient) => String(patient.email || '').toLowerCase().includes(q));
  }, [patients, patientEmailSearch]);

  if (!user) return <Navigate to="/coo/login" replace />;
  if (!isAllowed) return <Navigate to="/coo/login" replace />;

  const paymentOverview = (() => {
    const successful = payments.filter((payment) => isSuccessfulPayment(payment.status));
    const failed = payments.filter((payment) => isFailedPayment(payment.status));
    const pending = payments.filter((payment) => !isSuccessfulPayment(payment.status) && !isFailedPayment(payment.status));
    const successfulValue = successful.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const failedValue = failed.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
      successfulCount: successful.length,
      failedCount: failed.length,
      pendingCount: pending.length,
      successfulValue,
      failedValue,
      totalCount: payments.length,
      rows: payments,
    };
  })();

  const cooNavItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'appointments', label: 'Appointments' },
    { id: 'patients', label: 'Patients' },
    { id: 'complete-patients', label: 'Complete Patients' },
    { id: 'incomplete-patients', label: 'Incomplete Patients' },
    { id: 'messages', label: 'Messages', badge: unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : unreadMessages) : undefined },
    { id: 'doctors', label: 'Doctors' },
    { id: 'active-doctors', label: 'Active Doctors', badge: activeDoctorsOverview.activeOnlineCount > 0 ? (activeDoctorsOverview.activeOnlineCount > 99 ? '99+' : activeDoctorsOverview.activeOnlineCount) : undefined },
    { id: 'incomplete-doctors', label: 'Incomplete Doctors', badge: incompleteDoctors.length > 0 ? (incompleteDoctors.length > 99 ? '99+' : incompleteDoctors.length) : undefined },
    { id: 'payments', label: 'Payments' },
    { id: 'settings', label: 'Settings' },
  ] as const;

  const handlePhotoUpload = async (file: File) => {
    if (!user?.id) return;
    setIsUploadingPhoto(true);

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const filePath = `coo/${user.id}/profile.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('doctor-files')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('doctor-files').getPublicUrl(filePath);
      const cacheBustUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar: cacheBustUrl },
      });
      if (updateError) throw updateError;

      setCooProfilePicture(cacheBustUrl);
      toast({ title: 'Success', description: 'Profile picture updated successfully.' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update profile picture.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPhoto(false);
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

  const openStatDetails = (tabId: (typeof cooNavItems)[number]['id']) => {
    setActiveTab(tabId);
  };

  const openQuickMessage = (target: QuickMessageTarget) => {
    if (target.type === 'doctor' && incompleteDoctorIds.has(target.id)) {
      toast({
        title: 'Messaging unavailable',
        description: 'You cannot message doctors with incomplete registration.',
        variant: 'destructive',
      });
      return;
    }
    setQuickMessageTarget(target);
    setQuickMessageBody('');
  };

  const handleSendQuickMessage = async () => {
    const content = quickMessageBody.trim();
    if (!content || !quickMessageTarget || !user?.id) return;

    try {
      setIsSendingQuickMessage(true);
      const { error } = await supabase.from('coo_messages').insert({
        thread_id: quickMessageTarget.id,
        thread_type: quickMessageTarget.type,
        sender_id: user.id,
        sender_role: 'coo',
        sender_name: cooDisplayName,
        content,
      });

      if (error) throw error;

      toast({
        title: 'Message sent',
        description: `Your message has been sent to ${quickMessageTarget.name}.`,
      });
      setQuickMessageTarget(null);
      setQuickMessageBody('');
    } catch (error: any) {
      toast({
        title: 'Failed to send message',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingQuickMessage(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg sm:text-xl font-bold">COO Monitoring Portal</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Operational intelligence dashboard</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={activeTab === 'settings' ? 'default' : 'outline'}
                onClick={() => setActiveTab('settings')}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarImage src={cooProfilePicture} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">{cooInitials || 'CO'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 hidden sm:block text-left">
                  <p className="text-sm font-medium truncate">{cooDisplayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{cooDisplayEmail || 'No email'}</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <aside className={`lg:col-span-1 ${sidebarOpen ? 'block' : 'hidden lg:block'} fixed lg:static inset-0 lg:inset-auto top-16 z-40 bg-background lg:bg-transparent p-2 lg:p-0 overflow-y-auto`}>
            <Card className="lg:sticky lg:top-24">
              <CardContent className="p-3 flex flex-col max-h-[calc(100vh-80px)] lg:max-h-none overflow-y-auto">
                <nav className="space-y-1">
                  {cooNavItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        activeTab === item.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
                <div className="mt-4 border-t pt-4">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={async () => {
                      await signOut();
                      navigate('/');
                    }}
                  >
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>

          <main className="lg:col-span-3 space-y-4">
            {!isPwaInstalled ? (
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
            ) : null}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="hidden">
                {cooNavItems.map((item) => (
                  <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>
                ))}
              </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-4">
              <Card className="border-purple-200 bg-purple-50/30">
                <CardHeader className="pb-2">
                  <CardDescription className="text-purple-700 font-medium">Free Consultation Promo</CardDescription>
                  <CardTitle className="text-2xl text-purple-900">{promoStats.used} / {promoStats.limit}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] uppercase font-bold text-purple-600 tracking-wider">
                    <span>Used</span>
                    <span>{promoStats.remaining} Left</span>
                  </div>
                  <div className="w-full bg-purple-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-600 rounded-full transition-all duration-1000" 
                      style={{ width: `${(promoStats.used / promoStats.limit) * 100}%` }}
                    />
                  </div>
                  <Gift className="w-4 h-4 text-purple-600 mt-1" />
                </CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => openStatDetails('patients')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStatDetails('patients');
                  }
                }}
                className="cursor-pointer transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <CardHeader className="pb-2">
                  <CardDescription>Total Registered Patients</CardDescription>
                  <CardTitle className="text-3xl">{patientCount}</CardTitle>
                </CardHeader>
                <CardContent><Users className="w-5 h-5 text-primary" /></CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => openStatDetails('complete-patients')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStatDetails('complete-patients');
                  }
                }}
                className="cursor-pointer transition hover:border-success/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/30"
              >
                <CardHeader className="pb-2">
                  <CardDescription>Complete Patient Registrations</CardDescription>
                  <CardTitle className="text-3xl">{patients.filter((p: any) => p.registration_complete).length}</CardTitle>
                </CardHeader>
                <CardContent><Users className="w-5 h-5 text-success" /></CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => openStatDetails('incomplete-patients')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStatDetails('incomplete-patients');
                  }
                }}
                className="cursor-pointer transition hover:border-orange-400/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/30"
              >
                <CardHeader className="pb-2">
                  <CardDescription>Incomplete Patient Registrations</CardDescription>
                  <CardTitle className="text-3xl">{patients.filter((p: any) => !p.registration_complete).length}</CardTitle>
                </CardHeader>
                <CardContent><Users className="w-5 h-5 text-orange-500" /></CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => openStatDetails('appointments')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStatDetails('appointments');
                  }
                }}
                className="cursor-pointer transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <CardHeader className="pb-2">
                  <CardDescription>Appointments (New / Existing)</CardDescription>
                  <CardTitle className="text-3xl">{appointmentOverview.newAppointments} / {appointmentOverview.existingAppointments}</CardTitle>
                </CardHeader>
                <CardContent><CalendarClock className="w-5 h-5 text-primary" /></CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => openStatDetails('active-doctors')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStatDetails('active-doctors');
                  }
                }}
                className="cursor-pointer transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <CardHeader className="pb-2">
                  <CardDescription>Active Doctors Online Now</CardDescription>
                  <CardTitle className="text-3xl">{activeDoctorsOverview.activeOnlineCount}</CardTitle>
                </CardHeader>
                <CardContent><Stethoscope className="w-5 h-5 text-primary" /></CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => openStatDetails('messages')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStatDetails('messages');
                  }
                }}
                className="cursor-pointer transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <CardHeader className="pb-2">
                  <CardDescription>Patient Messages</CardDescription>
                  <CardTitle className="text-3xl">{contactInbox.length}</CardTitle>
                </CardHeader>
                <CardContent><MessageSquare className="w-5 h-5 text-primary" /></CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => openStatDetails('payments')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStatDetails('payments');
                  }
                }}
                className="cursor-pointer transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <CardHeader className="pb-2">
                  <CardDescription>Payment Success / Failed</CardDescription>
                  <CardTitle className="text-3xl">{paymentOverview.successfulCount} / {paymentOverview.failedCount}</CardTitle>
                </CardHeader>
                <CardContent><CreditCard className="w-5 h-5 text-primary" /></CardContent>
              </Card>

              <Card
                role="button"
                tabIndex={0}
                onClick={() => openStatDetails('incomplete-doctors')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStatDetails('incomplete-doctors');
                  }
                }}
                className="cursor-pointer transition hover:border-destructive/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
              >
                <CardHeader className="pb-2">
                  <CardDescription>Incomplete Doctor Registrations</CardDescription>
                  <CardTitle className="text-3xl">{incompleteDoctors.length}</CardTitle>
                </CardHeader>
                <CardContent><Stethoscope className="w-5 h-5 text-destructive" /></CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Appointment Overview</CardTitle>
                <CardDescription className="break-words">
                  Total: {appointmentOverview.totalAppointments} | Successful: {appointmentOverview.successfulConsultations} | Confirmed: {appointmentOverview.confirmedAppointments} | In Progress: {appointmentOverview.inProgressAppointments} | Pending: {appointmentOverview.pendingAppointments} | Failed: {appointmentOverview.failedConsultations}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  New Booking Notifications
                </CardTitle>
                <CardDescription>{newBookings.length} new booking(s)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[360px] overflow-y-auto">
                {newBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No new bookings in the last 7 days.</p>
                ) : (
                  newBookings.map((apt) => (
                    <div key={apt.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {apt.patient_id ? (
                            <button
                              type="button"
                              onClick={() => openQuickMessage({
                                id: apt.patient_id!,
                                type: 'patient',
                                name: patientById.get(apt.patient_id || '')?.full_name || 'Patient',
                                email: patientById.get(apt.patient_id || '')?.email || '',
                              })}
                              className="text-left hover:underline"
                            >
                              {patientById.get(apt.patient_id || '')?.full_name || 'Unknown Patient'}
                            </button>
                          ) : (
                            'Unknown Patient'
                          )}
                        </p>
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                          {normalizeAppointmentStatus(apt.status)?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Doctor:{' '}
                        {apt.doctor_id ? (
                          <button
                            type="button"
                            onClick={() => openQuickMessage({
                              id: apt.doctor_id!,
                              type: 'doctor',
                              name: doctorById.get(apt.doctor_id || '')?.full_name || 'Doctor',
                              email: doctorById.get(apt.doctor_id || '')?.email || '',
                            })}
                            className="text-left hover:underline"
                          >
                            {doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}
                          </button>
                        ) : (
                          'N/A'
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Appointment date: {formatDateTime(apt.date)}
                      </p>
                      {renderAppointmentAuditTimestamps(apt)}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appointments" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Successful Appointments</CardTitle>
                  <CardDescription>All appointments completed successfully</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[420px] sm:max-h-[520px] overflow-y-auto">
                  {successfulAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No successful appointments found.</p>
                  ) : (
                    successfulAppointments.map((apt) => (
                      <div key={apt.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium break-all">Appointment {apt.id.slice(0, 8)}...</p>
                          <Badge className="bg-success/10 text-success border-success/20">Successful</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Date: {formatDateTime(apt.date)}
                        </p>
                        {renderAppointmentAuditTimestamps(apt)}
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.doctor_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.doctor_id!,
                                  type: 'doctor',
                                  name: doctorById.get(apt.doctor_id || '')?.full_name || 'Doctor',
                                  email: doctorById.get(apt.doctor_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.patient_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.patient_id!,
                                  type: 'patient',
                                  name: patientById.get(apt.patient_id || '')?.full_name || 'Patient',
                                  email: patientById.get(apt.patient_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {patientById.get(apt.patient_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Confirmed Appointments</CardTitle>
                  <CardDescription>All confirmed appointments awaiting consultation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[420px] sm:max-h-[520px] overflow-y-auto">
                  {confirmedAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No confirmed appointments found.</p>
                  ) : (
                    confirmedAppointments.map((apt) => (
                      <div key={apt.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium break-all">Appointment {apt.id.slice(0, 8)}...</p>
                          <Badge className="bg-primary/10 text-primary border-primary/20">Confirmed</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Date: {formatDateTime(apt.date)}
                        </p>
                        {renderAppointmentAuditTimestamps(apt)}
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.doctor_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.doctor_id!,
                                  type: 'doctor',
                                  name: doctorById.get(apt.doctor_id || '')?.full_name || 'Doctor',
                                  email: doctorById.get(apt.doctor_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.patient_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.patient_id!,
                                  type: 'patient',
                                  name: patientById.get(apt.patient_id || '')?.full_name || 'Patient',
                                  email: patientById.get(apt.patient_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {patientById.get(apt.patient_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>In Progress Appointments</CardTitle>
                  <CardDescription>All appointments currently in consultation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[420px] sm:max-h-[520px] overflow-y-auto">
                  {inProgressAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No in progress appointments found.</p>
                  ) : (
                    inProgressAppointments.map((apt) => (
                      <div key={apt.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium break-all">Appointment {apt.id.slice(0, 8)}...</p>
                          <Badge className="bg-sky-500/10 text-sky-700 border-sky-500/20">In Progress</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Date: {formatDateTime(apt.date)}
                        </p>
                        {renderAppointmentAuditTimestamps(apt)}
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.doctor_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.doctor_id!,
                                  type: 'doctor',
                                  name: doctorById.get(apt.doctor_id || '')?.full_name || 'Doctor',
                                  email: doctorById.get(apt.doctor_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.patient_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.patient_id!,
                                  type: 'patient',
                                  name: patientById.get(apt.patient_id || '')?.full_name || 'Patient',
                                  email: patientById.get(apt.patient_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {patientById.get(apt.patient_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pending Appointments</CardTitle>
                  <CardDescription>All appointments waiting for action or completion</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[420px] sm:max-h-[520px] overflow-y-auto">
                  {pendingAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pending appointments found.</p>
                  ) : (
                    pendingAppointments.map((apt) => (
                      <div key={apt.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium break-all">Appointment {apt.id.slice(0, 8)}...</p>
                          <Badge className="bg-warning/10 text-warning border-warning/20">
                            {String(apt.normalizedStatus || 'pending').replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Date: {formatDateTime(apt.date)}
                        </p>
                        {renderAppointmentAuditTimestamps(apt)}
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.doctor_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.doctor_id!,
                                  type: 'doctor',
                                  name: doctorById.get(apt.doctor_id || '')?.full_name || 'Doctor',
                                  email: doctorById.get(apt.doctor_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.patient_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.patient_id!,
                                  type: 'patient',
                                  name: patientById.get(apt.patient_id || '')?.full_name || 'Patient',
                                  email: patientById.get(apt.patient_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {patientById.get(apt.patient_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Failed Appointments</CardTitle>
                  <CardDescription>All appointments marked cancelled or no-show</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[420px] sm:max-h-[520px] overflow-y-auto">
                  {failedAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No failed appointments found.</p>
                  ) : (
                    failedAppointments.map((apt) => (
                      <div key={apt.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-medium break-all">Appointment {apt.id.slice(0, 8)}...</p>
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                            {apt.normalizedStatus === 'no_show' ? 'No Show' : 'Failed'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Date: {formatDateTime(apt.date)}
                        </p>
                        {renderAppointmentAuditTimestamps(apt)}
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.doctor_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.doctor_id!,
                                  type: 'doctor',
                                  name: doctorById.get(apt.doctor_id || '')?.full_name || 'Doctor',
                                  email: doctorById.get(apt.doctor_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.patient_id ? (
                              <button
                                type="button"
                                onClick={() => openQuickMessage({
                                  id: apt.patient_id!,
                                  type: 'patient',
                                  name: patientById.get(apt.patient_id || '')?.full_name || 'Patient',
                                  email: patientById.get(apt.patient_id || '')?.email || '',
                                })}
                                className="text-left hover:underline"
                              >
                                {patientById.get(apt.patient_id || '')?.full_name || 'N/A'}
                              </button>
                            ) : (
                              'N/A'
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="messages" forceMount className={activeTab !== 'messages' ? 'hidden' : ''}>
            <COOMessagesTab
              patients={patients}
              doctors={doctors.filter((doctor) => !incompleteDoctorIds.has(doctor.user_id))}
              cooUserId={user.id}
              cooName={cooDisplayName}
              onUnreadChange={(count) => {
                if (activeTab !== 'messages') setUnreadMessages(count);
              }}
            />
          </TabsContent>

          <TabsContent value="doctors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Doctor Directory</CardTitle>
                <CardDescription>
                  All doctors including approved, pending verification, and incomplete registration.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="pb-2">
                  <Input
                    type="email"
                    placeholder="Search doctor by email"
                    value={doctorEmailSearch}
                    onChange={(event) => setDoctorEmailSearch(event.target.value)}
                  />
                </div>
                {filteredDoctors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No doctors found.</p>
                ) : (
                  filteredDoctors.map((doctor) => {
                    const presence = onlineDoctorIds[doctor.user_id];
                    const listingStatus = getDoctorListingStatus(doctor);
                    return (
                      <div key={doctor.user_id} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3">
                        <div className="min-w-0">
                          {listingStatus === 'incomplete' ? (
                            <p className="text-sm font-medium">{doctor.full_name || 'Doctor'}</p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openQuickMessage({
                                id: doctor.user_id,
                                type: 'doctor',
                                name: doctor.full_name || 'Doctor',
                                email: doctor.email || '',
                              })}
                              className="text-sm font-medium text-left hover:underline"
                            >
                              {doctor.full_name || 'Doctor'}
                            </button>
                          )}
                          <p className="text-xs text-muted-foreground">{doctor.email || 'No email'}</p>
                          <p className="text-xs text-muted-foreground">{doctor.phone_number || 'No phone'}</p>
                          <p className="text-xs text-muted-foreground">Location: {doctor.city || 'N/A'}, {doctor.state || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">
                            Rate: {Number(doctor.rate_per_consultation || 0) > 0 ? formatCurrency(Number(doctor.rate_per_consultation), doctor.consultation_currency || 'NGN') : 'Not set'}
                          </p>
                          {(doctor.bank_name || doctor.bank_account_number) && (
                            <div className="mt-1 pt-1 border-t border-border/50">
                              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Bank Details</p>
                              <p className="text-xs text-muted-foreground">
                                {doctor.bank_name || 'N/A'} - {doctor.bank_account_number || 'N/A'}
                              </p>
                              {doctor.bank_account_name && (
                                <p className="text-[10px] text-muted-foreground italic">({doctor.bank_account_name})</p>
                              )}
                            </div>
                          )}
                          {presence?.online_at && (
                            <p className="text-xs text-muted-foreground">Online since: {formatDateTime(presence.online_at)}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 self-start sm:self-auto">
                          <Badge
                            className={
                              listingStatus === 'approved'
                                ? 'bg-success/10 text-success border-success/20'
                                : listingStatus === 'incomplete'
                                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                                  : 'bg-warning/10 text-warning border-warning/20'
                            }
                          >
                            {listingStatus === 'approved'
                              ? 'Approved'
                              : listingStatus === 'incomplete'
                                ? 'Incomplete Registration'
                                : 'Pending Verification'}
                          </Badge>
                          <Badge className={presence ? 'bg-green-500/10 text-green-700 border-green-500/20' : 'bg-muted text-muted-foreground border-border'}>
                            {presence ? 'Online' : 'Offline'}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active-doctors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Doctors Online Now</CardTitle>
                <CardDescription>
                  Showing only approved doctors currently online.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="pb-2">
                  <Input
                    type="email"
                    placeholder="Search active doctor by email"
                    value={activeDoctorEmailSearch}
                    onChange={(event) => setActiveDoctorEmailSearch(event.target.value)}
                  />
                </div>
                {filteredActiveDoctors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No doctors are currently online.</p>
                ) : (
                  filteredActiveDoctors.map((doctor) => {
                    const presence = onlineDoctorIds[doctor.user_id];
                    return (
                      <div key={doctor.user_id} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => openQuickMessage({
                              id: doctor.user_id,
                              type: 'doctor',
                              name: doctor.full_name || 'Doctor',
                              email: doctor.email || '',
                            })}
                            className="text-sm font-medium text-left hover:underline"
                          >
                            {doctor.full_name || 'Doctor'}
                          </button>
                          <p className="text-xs text-muted-foreground">{doctor.email || 'No email'}</p>
                          <p className="text-xs text-muted-foreground">{doctor.phone_number || 'No phone'}</p>
                          <p className="text-xs text-muted-foreground">Location: {doctor.city || 'N/A'}, {doctor.state || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">
                            Rate: {Number(doctor.rate_per_consultation || 0) > 0 ? formatCurrency(Number(doctor.rate_per_consultation), doctor.consultation_currency || 'NGN') : 'Not set'}
                          </p>
                          {(doctor.bank_name || doctor.bank_account_number) && (
                            <div className="mt-1 pt-1 border-t border-border/50">
                              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Bank Details</p>
                              <p className="text-xs text-muted-foreground">
                                {doctor.bank_name || 'N/A'} - {doctor.bank_account_number || 'N/A'}
                              </p>
                              {doctor.bank_account_name && (
                                <p className="text-[10px] text-muted-foreground italic">({doctor.bank_account_name})</p>
                              )}
                            </div>
                          )}
                          {presence?.online_at && (
                            <p className="text-xs text-muted-foreground">Online since: {formatDateTime(presence.online_at)}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 self-start sm:self-auto">
                          <Badge className="bg-success/10 text-success border-success/20">
                            Approved
                          </Badge>
                          <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                            Online
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incomplete-doctors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Doctors With Incomplete Registration</CardTitle>
                <CardDescription>
                  Doctors missing required registration details (for example, medical license upload).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {incompleteDoctors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No incomplete doctor registrations found.</p>
                ) : (
                  incompleteDoctors.map((doctor) => {
                    const presence = onlineDoctorIds[doctor.user_id];
                    return (
                      <div key={doctor.user_id} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{doctor.full_name || 'Doctor'}</p>
                          <p className="text-xs text-muted-foreground">{doctor.email || 'No email'}</p>
                          <p className="text-xs text-muted-foreground">{doctor.phone_number || 'No phone'}</p>
                          <p className="text-xs text-muted-foreground">Location: {doctor.city || 'N/A'}, {doctor.state || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">
                            Rate: {Number(doctor.rate_per_consultation || 0) > 0 ? formatCurrency(Number(doctor.rate_per_consultation), doctor.consultation_currency || 'NGN') : 'Not set'}
                          </p>
                          {(doctor.bank_name || doctor.bank_account_number) && (
                            <div className="mt-1 pt-1 border-t border-border/50">
                              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Bank Details</p>
                              <p className="text-xs text-muted-foreground">
                                {doctor.bank_name || 'N/A'} - {doctor.bank_account_number || 'N/A'}
                              </p>
                              {doctor.bank_account_name && (
                                <p className="text-[10px] text-muted-foreground italic">({doctor.bank_account_name})</p>
                              )}
                            </div>
                          )}
                          {presence?.online_at && (
                            <p className="text-xs text-muted-foreground">Online since: {formatDateTime(presence.online_at)}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 self-start sm:self-auto">
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
                            Incomplete Registration
                          </Badge>
                          <Badge className={presence ? 'bg-green-500/10 text-green-700 border-green-500/20' : 'bg-muted text-muted-foreground border-border'}>
                            {presence ? 'Online' : 'Offline'}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="patients" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Patient Directory</CardTitle>
                    <CardDescription>Total patients: {patients.length}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportCompletePatients} disabled={isExportingPatients}>
                    <Download className="w-4 h-4 mr-2" />
                    {isExportingPatients ? 'Preparing...' : 'Download Complete Patients'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="pb-2">
                  <Input
                    type="email"
                    placeholder="Search patient by email"
                    value={patientEmailSearch}
                    onChange={(event) => setPatientEmailSearch(event.target.value)}
                  />
                </div>
                {filteredPatients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No patient records found.</p>
                ) : (
                  filteredPatients.map((patient) => {
                    const p = patient as PatientRow & { registration_complete?: boolean };
                    const isComplete = p.registration_complete !== false;
                    return (
                      <div key={p.user_id} className={`rounded-lg border p-3 ${!isComplete ? 'border-destructive/30 bg-destructive/5' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {isComplete ? (
                              <button type="button" onClick={() => openQuickMessage({ id: p.user_id, type: 'patient', name: p.full_name || 'Patient', email: p.email || '' })} className="text-sm font-medium text-left hover:underline">
                                {p.full_name || 'Patient'}
                              </button>
                            ) : (
                              <p className="text-sm font-medium">{p.full_name || 'Patient'}</p>
                            )}
                            <p className="text-xs text-muted-foreground">{p.email || 'No email'}</p>
                            <p className="text-xs text-muted-foreground">{p.phone_number || 'No phone'}</p>
                            {isComplete && (
                              <>
                                <p className="text-xs text-muted-foreground">Age: {(p as any).age ?? 'N/A'}</p>
                                <p className="text-xs text-muted-foreground">Sex: {(p as any).gender || 'N/A'}</p>
                                <p className="text-xs text-muted-foreground">Location: {(p as any).city || 'N/A'}, {(p as any).state || 'N/A'}</p>
                              </>
                            )}
                          </div>
                          {!isComplete && (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/20 shrink-0">Incomplete Registration</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="complete-patients" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Complete Patient Registrations</CardTitle>
                <CardDescription>Patients who have fully completed registration: {patients.filter((p: any) => p.registration_complete).length}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {patients.filter((p: any) => p.registration_complete).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No complete patient registrations found.</p>
                ) : (
                  patients.filter((p: any) => p.registration_complete).map((patient) => {
                    const p = patient as PatientRow & { registration_complete?: boolean };
                    return (
                      <div key={p.user_id} className="rounded-lg border p-3">
                        <button type="button" onClick={() => openQuickMessage({ id: p.user_id, type: 'patient', name: p.full_name || 'Patient', email: p.email || '' })} className="text-sm font-medium text-left hover:underline">
                          {p.full_name || 'Patient'}
                        </button>
                        <p className="text-xs text-muted-foreground">{p.email || 'No email'}</p>
                        <p className="text-xs text-muted-foreground">{p.phone_number || 'No phone'}</p>
                        <p className="text-xs text-muted-foreground">Age: {(p as any).age ?? 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">Sex: {(p as any).gender || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">Location: {(p as any).city || 'N/A'}, {(p as any).state || 'N/A'}</p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incomplete-patients" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Incomplete Patient Registrations</CardTitle>
                <CardDescription>Patients who signed up but did not complete registration: {patients.filter((p: any) => !p.registration_complete).length}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {patients.filter((p: any) => !p.registration_complete).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No incomplete patient registrations found.</p>
                ) : (
                  patients.filter((p: any) => !p.registration_complete).map((patient) => {
                    const p = patient as PatientRow & { registration_complete?: boolean };
                    return (
                      <div key={p.user_id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{p.full_name || 'Patient'}</p>
                            <p className="text-xs text-muted-foreground">{p.email || 'No email'}</p>
                            <p className="text-xs text-muted-foreground">{p.phone_number || 'No phone'}</p>
                          </div>
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20 shrink-0">Incomplete Registration</Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Monitoring</CardTitle>
                <CardDescription>
                  Total payments: {paymentOverview.totalCount} | Successful value: {formatCurrency(paymentOverview.successfulValue)} | Failed value: {formatCurrency(paymentOverview.failedValue)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[520px] overflow-y-auto">
                {paymentOverview.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment records found.</p>
                ) : (
                  paymentOverview.rows.map((payment) => {
                    const patient = payment.patient_id ? patientById.get(payment.patient_id) : null;
                    const appointment = payment.appointment_id ? paymentAppointmentById.get(payment.appointment_id) : null;
                    const messageTargetPatientId = patient?.user_id || payment.patient_id || null;
                    const patientName = patient?.full_name || payment.patient_name || 'Unknown Patient';
                    const patientEmail = patient?.email || payment.patient_email || 'N/A';
                    const patientPhone = patient?.phone_number || payment.patient_phone || 'N/A';
                    const paymentMadeAt = payment.verified_at || payment.created_at;

                    return (
                    <div key={payment.id} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">{formatCurrency(Number(payment.amount || 0), payment.currency || 'NGN')}</p>
                        <p className="text-xs text-muted-foreground">{formatExactDateTime(payment.created_at || null)}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Booked at:</span>{' '}
                          {formatExactDateTime(appointment?.created_at || null)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Payment made at:</span>{' '}
                          {formatExactDateTime(paymentMadeAt || null)}
                        </p>
                        <p className="text-xs">
                          <span className="font-medium">Patient:</span>{' '}
                          {messageTargetPatientId ? (
                            <button
                              type="button"
                              onClick={() => openQuickMessage({
                                id: messageTargetPatientId,
                                type: 'patient',
                                name: patientName,
                                email: patientEmail === 'N/A' ? '' : patientEmail,
                              })}
                              className="font-medium hover:underline"
                            >
                              {patientName}
                            </button>
                          ) : (
                            patientName
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Email:</span> {patientEmail}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Phone:</span> {patientPhone}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        {isSuccessfulPayment(payment.status) ? (
                          <Badge className="bg-success/10 text-success border-success/20">Successful</Badge>
                        ) : isFailedPayment(payment.status) ? (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20">Failed</Badge>
                        ) : (
                          <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>
                        )}
                      </div>
                    </div>
                  )})
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Change your COO profile picture and account password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={cooProfilePicture} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{cooInitials || 'CO'}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <p className="font-semibold text-lg">{cooDisplayName}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                    <input
                      type="file"
                      accept="image/*"
                      id="coo-photo-upload"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handlePhotoUpload(file);
                        event.currentTarget.value = '';
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUploadingPhoto}
                      onClick={() => document.getElementById('coo-photo-upload')?.click()}
                    >
                      {isUploadingPhoto ? 'Uploading...' : 'Change Photo'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your COO account password.</CardDescription>
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
          </TabsContent>


        </Tabs>

        <Dialog
          open={!!quickMessageTarget}
          onOpenChange={(open) => {
            if (!open) {
              setQuickMessageTarget(null);
              setQuickMessageBody('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Message</DialogTitle>
              <DialogDescription>
                {quickMessageTarget
                  ? `Send a direct message to ${quickMessageTarget.name} (${quickMessageTarget.email || 'No email'}).`
                  : 'Send a direct message.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Textarea
                placeholder="Type your message..."
                value={quickMessageBody}
                onChange={(event) => setQuickMessageBody(event.target.value)}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                This sends immediately to the selected {quickMessageTarget?.type || 'user'} thread.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setQuickMessageTarget(null);
                  setQuickMessageBody('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSendQuickMessage}
                disabled={isSendingQuickMessage || !quickMessageBody.trim() || !quickMessageTarget}
              >
                {isSendingQuickMessage ? 'Sending...' : 'Send Message'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </main>
        </div>


      </div>
    </div>
  );
}
