import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, CalendarClock, FolderOpen, Stethoscope, CreditCard, AlertTriangle } from 'lucide-react';
import { normalizeAppointmentStatus } from '@/services/marketplaceTypes';
import { useLocaleFormatter } from '@/lib/locale';

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

type SessionRow = {
  id: string;
  status: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
};

type DoctorRow = {
  user_id: string;
  full_name: string | null;
  verification_status: string | null;
};

type PaymentRow = {
  id: string;
  amount: number | null;
  status: string | null;
  created_at: string | null;
  payment_method: string | null;
  provider: string | null;
};

type ContactInboxRow = {
  id: string;
  email: string | null;
  subject: string | null;
  message: string | null;
  created_at: string | null;
};

const isSuccessfulPayment = (status: string | null | undefined) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['completed', 'success', 'paid', 'succeeded'].includes(normalized);
};

const isFailedPayment = (status: string | null | undefined) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['failed', 'error', 'abandoned', 'cancelled'].includes(normalized);
};

const complaintKeywords = ['complaint', 'issue', 'bad', 'poor', 'refund', 'problem', 'failed', 'delay', 'angry', 'not happy'];

export default function COOPortal() {
  const { user, signOut } = useAuth();
  const { formatDateTime, formatCurrency } = useLocaleFormatter();

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
  const isAllowed = !!user && allowedEmails.includes(userEmail);

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

  const { data: endedSessions = [] } = useQuery({
    queryKey: ['coo-ended-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultation_sessions')
        .select('id, status, ended_at, duration_seconds')
        .eq('status', 'ended')
        .order('ended_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as SessionRow[];
    },
    enabled: isAllowed,
  });

  const { data: doctors = [] } = useQuery({
    queryKey: ['coo-doctors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_registrations')
        .select('user_id, full_name, verification_status');
      if (error) throw error;
      return (data || []) as DoctorRow[];
    },
    enabled: isAllowed,
  });

  const { data: availableDoctorIds = [] } = useQuery({
    queryKey: ['coo-available-doctors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_schedules')
        .select('doctor_id')
        .eq('is_available', true);
      if (error) throw error;
      const unique = Array.from(new Set((data || []).map((row: any) => String(row.doctor_id || '')).filter(Boolean)));
      return unique;
    },
    enabled: isAllowed,
  });

  const { data: healthRecordsCount = 0 } = useQuery({
    queryKey: ['coo-health-records-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('health_records')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
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
        .select('id, amount, status, created_at, payment_method, provider')
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
        limit_count: 200,
        offset_count: 0,
      });
      if (error) throw error;
      return (data || []) as ContactInboxRow[];
    },
    enabled: isAllowed,
  });

  if (!user) return <Navigate to="/coo/login" replace />;
  if (!isAllowed) return <Navigate to="/coo/login" replace />;

  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const appointmentOverview = (() => {
    const normalized = appointments.map((apt) => ({
      ...apt,
      normalizedStatus: normalizeAppointmentStatus(apt.status),
    }));
    const newAppointments = normalized.filter((apt) => {
      const created = apt.created_at ? new Date(apt.created_at).getTime() : 0;
      return Number.isFinite(created) && created >= sevenDaysAgo;
    }).length;
    const successfulConsultations = normalized.filter((apt) => apt.normalizedStatus === 'completed').length;
    const failedConsultations = normalized.filter((apt) => apt.normalizedStatus === 'cancelled' || apt.normalizedStatus === 'no_show').length;
    return {
      totalAppointments: normalized.length,
      newAppointments,
      existingAppointments: Math.max(normalized.length - newAppointments, 0),
      successfulConsultations,
      failedConsultations,
    };
  })();

  const patientFolderOverview = (() => {
    const ratings = appointments
      .map((apt) => apt.rating)
      .filter((rating): rating is number => typeof rating === 'number');
    const avgRating = ratings.length > 0
      ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2))
      : 0;

    const reviewFeedback = appointments
      .filter((apt) => typeof apt.review_comment === 'string' && apt.review_comment.trim().length > 0)
      .slice(0, 10)
      .map((apt) => ({
        source: 'appointment' as const,
        text: apt.review_comment || '',
        rating: apt.rating,
        created_at: apt.created_at,
        id: apt.id,
      }));

    const contactFeedback = contactInbox
      .map((msg) => ({
        source: 'contact' as const,
        text: `${msg.subject || ''} ${msg.message || ''}`.trim(),
        rating: null as number | null,
        created_at: msg.created_at,
        id: msg.id,
      }))
      .filter((msg) => msg.text.length > 0)
      .slice(0, 20);

    const combined = [...reviewFeedback, ...contactFeedback]
      .sort((a, b) => new Date(String(b.created_at || '')).getTime() - new Date(String(a.created_at || '')).getTime());

    const complaints = combined.filter((item) => {
      const text = item.text.toLowerCase();
      return complaintKeywords.some((keyword) => text.includes(keyword));
    });

    return {
      recordsCount: healthRecordsCount,
      avgRating,
      complaintsCount: complaints.length,
      latestFeedback: combined.slice(0, 8),
      latestComplaints: complaints.slice(0, 8),
    };
  })();

  const activeDoctorsOverview = (() => {
    const approved = doctors.filter((doc) => String(doc.verification_status || '').toLowerCase() === 'approved');
    const approvedIds = new Set(approved.map((doc) => doc.user_id));
    const activeAvailableCount = availableDoctorIds.filter((doctorId) => approvedIds.has(doctorId)).length;
    return {
      approvedDoctors: approved.length,
      activeAvailableCount,
    };
  })();

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
      latest: payments.slice(0, 12),
    };
  })();

  return (
    <div className="min-h-screen bg-muted/20 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">COO Monitoring Portal</h1>
            <p className="text-sm text-muted-foreground">Operational intelligence dashboard for platform performance</p>
          </div>
          <Button variant="outline" onClick={() => signOut()}>
            Sign Out
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Registered Patients</CardDescription>
              <CardTitle className="text-3xl">{patientCount}</CardTitle>
            </CardHeader>
            <CardContent><Users className="w-5 h-5 text-primary" /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Appointments (New / Existing)</CardDescription>
              <CardTitle className="text-3xl">{appointmentOverview.newAppointments} / {appointmentOverview.existingAppointments}</CardTitle>
            </CardHeader>
            <CardContent><CalendarClock className="w-5 h-5 text-primary" /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Patient e-Folder Records</CardDescription>
              <CardTitle className="text-3xl">{patientFolderOverview.recordsCount}</CardTitle>
            </CardHeader>
            <CardContent><FolderOpen className="w-5 h-5 text-primary" /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Active Doctors</CardDescription>
              <CardTitle className="text-3xl">{activeDoctorsOverview.activeAvailableCount}</CardTitle>
            </CardHeader>
            <CardContent><Stethoscope className="w-5 h-5 text-primary" /></CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Payment Success / Failed</CardDescription>
              <CardTitle className="text-3xl">{paymentOverview.successfulCount} / {paymentOverview.failedCount}</CardTitle>
            </CardHeader>
            <CardContent><CreditCard className="w-5 h-5 text-primary" /></CardContent>
          </Card>
        </div>

        <Tabs defaultValue="appointments" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="folders">Patient e-Folder</TabsTrigger>
            <TabsTrigger value="doctors">Doctors</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="sessions">Consultations</TabsTrigger>
          </TabsList>

          <TabsContent value="appointments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Appointment Overview</CardTitle>
                <CardDescription>
                  Total: {appointmentOverview.totalAppointments} | Successful: {appointmentOverview.successfulConsultations} | Failed: {appointmentOverview.failedConsultations}
                </CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>

          <TabsContent value="folders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Patient e-Folder Monitoring</CardTitle>
                <CardDescription>
                  Average satisfaction rating: {patientFolderOverview.avgRating} | Complaints / feedback flagged: {patientFolderOverview.complaintsCount}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {patientFolderOverview.latestFeedback.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No feedback records found.</p>
                ) : (
                  patientFolderOverview.latestFeedback.map((entry) => (
                    <div key={`${entry.source}-${entry.id}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={entry.source === 'contact' ? 'outline' : 'secondary'}>
                            {entry.source === 'contact' ? 'Contact' : 'Appointment Review'}
                          </Badge>
                          {typeof entry.rating === 'number' ? <Badge>{entry.rating}/5</Badge> : null}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at || null)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{entry.text || 'No message'}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="doctors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Doctor Availability</CardTitle>
                <CardDescription>
                  Approved doctors: {activeDoctorsOverview.approvedDoctors} | Available by schedule: {activeDoctorsOverview.activeAvailableCount}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {doctors.slice(0, 12).map((doctor) => (
                  <div key={doctor.user_id} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="text-sm font-medium">{doctor.full_name || 'Doctor'}</span>
                    <Badge variant={String(doctor.verification_status || '') === 'approved' ? 'default' : 'outline'}>
                      {doctor.verification_status || 'unknown'}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Monitoring</CardTitle>
                <CardDescription>
                  Successful value: {formatCurrency(paymentOverview.successfulValue)} | Failed value: {formatCurrency(paymentOverview.failedValue)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {paymentOverview.latest.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment records found.</p>
                ) : (
                  paymentOverview.latest.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{formatCurrency(Number(payment.amount || 0))}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(payment.created_at || null)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSuccessfulPayment(payment.status) ? (
                          <Badge className="bg-success/10 text-success border-success/20">Successful</Badge>
                        ) : isFailedPayment(payment.status) ? (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20">Failed</Badge>
                        ) : (
                          <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Consultation Session Monitoring</CardTitle>
                <CardDescription>
                  Successful consultations are tracked as completed appointments. Failed consultations are tracked as cancelled/no-show appointments.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {endedSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No ended sessions found.</p>
                ) : (
                  endedSessions.slice(0, 12).map((session) => (
                    <div key={session.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">Session {session.id.slice(0, 8)}...</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(session.ended_at || null)}</p>
                      </div>
                      <Badge variant="outline">{Math.round((session.duration_seconds || 0) / 60)} min</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {patientFolderOverview.complaintsCount > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-5 h-5" />
                Complaints / Feedback Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {patientFolderOverview.latestComplaints.map((entry) => (
                <div key={`complaint-${entry.source}-${entry.id}`} className="rounded-lg border border-warning/30 bg-background p-3">
                  <p className="text-sm">{entry.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDateTime(entry.created_at || null)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
