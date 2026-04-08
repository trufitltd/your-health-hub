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
import { Users, CalendarClock, Stethoscope, CreditCard, MessageSquare, Bell, Settings, Download } from 'lucide-react';
import { normalizeAppointmentStatus } from '@/services/marketplaceTypes';
import { useLocaleFormatter } from '@/lib/locale';
import { COOMessagesTab } from '@/components/coo/COOMessagesTab';
import { toast } from '@/components/ui/use-toast';
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
  status: string | null;
  created_at: string | null;
  payment_method: string | null;
  provider: string | null;
  patient_name?: string | null;
  patient_email?: string | null;
  patient_phone?: string | null;
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

export default function COOPortal() {
  const { user, signOut } = useAuth();
  const { isInstalled: isPwaInstalled, promptInstall } = usePwaInstall();
  const { formatDateTime, formatCurrency } = useLocaleFormatter();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onlineDoctorIds, setOnlineDoctorIds] = useState<Record<string, OnlineDoctorPresence>>({});
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [cooProfilePicture, setCooProfilePicture] = useState<string>('');
  const [passwordFormData, setPasswordFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [doctorEmailSearch, setDoctorEmailSearch] = useState('');
  const [activeDoctorEmailSearch, setActiveDoctorEmailSearch] = useState('');
  const [patientEmailSearch, setPatientEmailSearch] = useState('');
  const [quickMessageTarget, setQuickMessageTarget] = useState<QuickMessageTarget | null>(null);
  const [quickMessageBody, setQuickMessageBody] = useState('');
  const [isSendingQuickMessage, setIsSendingQuickMessage] = useState(false);

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

  const { data: appointments = [] } = useQuery({
    queryKey: ['coo-appointments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, status, created_at, date, patient_id, doctor_id, rating, review_comment')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as AppointmentRow[];
    },
    enabled: isAllowed,
  });

  const { data: doctors = [] } = useQuery({
    queryKey: ['coo-doctors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_registrations')
        .select('user_id, full_name, email, phone_number, city, state, verification_status, medical_license_url, rate_per_consultation')
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
        .select('user_id, full_name, email, phone_number, age, gender, city, state')
        .limit(5000);
      if (error) throw error;
      return (data || []) as PatientRow[];
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
        .select('id, appointment_id, patient_id, amount, status, created_at, payment_method, provider')
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
          <aside className={`lg:col-span-1 ${sidebarOpen ? 'block' : 'hidden lg:block'} fixed lg:static inset-0 lg:inset-auto top-16 z-40 bg-background lg:bg-transparent p-2 lg:p-0`}>
            <Card className="lg:sticky lg:top-24">
              <CardContent className="p-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
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
                    <div key={apt.id} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {patientById.get(apt.patient_id || '')?.full_name || 'Unknown Patient'}
                        </p>
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                          {normalizeAppointmentStatus(apt.status)?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Doctor: {doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Appointment: {formatDateTime(apt.date)} · Booked: {formatDateTime(apt.created_at)}
                      </p>
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
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.full_name || 'N/A'}</p>
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
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.full_name || 'N/A'}</p>
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
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.full_name || 'N/A'}</p>
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
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.full_name || 'N/A'}</p>
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
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Doctor</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.full_name || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.email || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">{doctorById.get(apt.doctor_id || '')?.phone_number || 'N/A'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-2">
                          <p className="text-xs font-medium">Patient</p>
                          <p className="text-xs text-muted-foreground">{patientById.get(apt.patient_id || '')?.full_name || 'N/A'}</p>
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
              doctors={doctors}
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
                            Rate: {Number(doctor.rate_per_consultation || 0) > 0 ? formatCurrency(Number(doctor.rate_per_consultation)) : 'Not set'}
                          </p>
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
                            Rate: {Number(doctor.rate_per_consultation || 0) > 0 ? formatCurrency(Number(doctor.rate_per_consultation)) : 'Not set'}
                          </p>
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
                            Rate: {Number(doctor.rate_per_consultation || 0) > 0 ? formatCurrency(Number(doctor.rate_per_consultation)) : 'Not set'}
                          </p>
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
                <CardTitle>Patient Directory</CardTitle>
                <CardDescription>
                  Total registered patients: {patients.length}
                </CardDescription>
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
                  filteredPatients.map((patient) => (
                    <div key={patient.user_id} className="rounded-lg border p-3">
                      <button
                        type="button"
                        onClick={() => openQuickMessage({
                          id: patient.user_id,
                          type: 'patient',
                          name: patient.full_name || 'Patient',
                          email: patient.email || '',
                        })}
                        className="text-sm font-medium text-left hover:underline"
                      >
                        {patient.full_name || 'Patient'}
                      </button>
                      <p className="text-xs text-muted-foreground">{patient.email || 'No email'}</p>
                      <p className="text-xs text-muted-foreground">{patient.phone_number || 'No phone'}</p>
                      <p className="text-xs text-muted-foreground">Age: {patient.age ?? 'N/A'}</p>
                      <p className="text-xs text-muted-foreground">Sex: {patient.gender || 'N/A'}</p>
                      <p className="text-xs text-muted-foreground">Location: {patient.city || 'N/A'}, {patient.state || 'N/A'}</p>
                    </div>
                  ))
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
                    const patientName = patient?.full_name || payment.patient_name || 'Unknown Patient';
                    const patientEmail = patient?.email || payment.patient_email || 'N/A';
                    const patientPhone = patient?.phone_number || payment.patient_phone || 'N/A';

                    return (
                    <div key={payment.id} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">{formatCurrency(Number(payment.amount || 0))}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(payment.created_at || null)}</p>
                        <p className="text-xs">
                          <span className="font-medium">Patient:</span> {patientName}
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
