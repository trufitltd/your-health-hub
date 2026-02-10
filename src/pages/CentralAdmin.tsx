import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3, Users, FileText, CheckCircle, XCircle, Clock,
  AlertCircle, LogOut, ChevronRight, Search, Filter, Download,
  Star, TrendingUp, Shield, Award, Eye, Trash2, Mail,
  Badge as BadgeIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { PatientsTable } from '@/components/admin/PatientsTable';

interface Doctor {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  specialty: string;
  experience: string;
  verification_status: 'pending' | 'approved' | 'rejected';
  credentials_verified: boolean;
  profile_picture_url: string;
  license_number: string;
  license_file_url: string;
  verification_date: string;
  created_at: string;
  total_consultations: number;
  rating: number;
  total_reviews: number;
}

interface VerificationNotes {
  [key: string]: string;
}

const CentralAdmin = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState<VerificationNotes>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxRange, setInboxRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxPageSize, setInboxPageSize] = useState(10);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [deleteDoctorId, setDeleteDoctorId] = useState<string | null>(null);

  const adminEmails = useMemo(() => {
    const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;
    return raw ? raw.split(',').map((value) => value.trim().toLowerCase()) : [];
  }, []);

  const adminEmail = (user?.email || user?.user_metadata?.email || '').toLowerCase();
  const isAdmin = !!adminEmail && adminEmails.includes(adminEmail);

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
          const { count: consultationCount } = await supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('doctor_id', doc.user_id)
            .eq('status', 'completed');

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

  // Fetch all patients
  const { data: patients = [] } = useQuery({
    queryKey: ['admin-patients-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_registrations')
        .select('user_id');
      
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

  const { data: contactMessages = [], isLoading: contactMessagesLoading } = useQuery({
    queryKey: ['admin-contact-messages'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_contact_messages', { limit_count: 20 });
      if (error) {
        console.error('Error fetching contact messages:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!user && isAdmin,
    refetchInterval: 30000,
  });

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

  // Check admin access - now after hooks
  if (!user) {
    navigate('/admin/login');
    return null;
  }

  if (!isAdmin) {
    navigate('/admin/login');
    return null;
  }

  // Calculate statistics
  const stats = {
    totalDoctors: doctors.length,
    totalPatients: patients.length,
    approvedDoctors: doctors.filter(d => d.verification_status === 'approved').length,
    pendingVerification: doctors.filter(d => d.verification_status === 'pending').length,
    rejectedDoctors: doctors.filter(d => d.verification_status === 'rejected').length,
    totalConsultations: doctors.reduce((sum, d) => sum + (d.total_consultations || 0), 0),
    averageRating: doctors.length > 0 
      ? (doctors.reduce((sum, d) => sum + (d.rating || 0), 0) / doctors.length).toFixed(2)
      : 0,
  };

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

  // Filter doctors
  const filteredDoctors = doctors.filter(doctor => {
    const matchesSearch = doctor.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          doctor.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          doctor.specialty?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || doctor.verification_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleApproveDoctor = async (doctor: Doctor) => {
    if (!selectedDoctor) return;
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/10 text-success border-success/20 gap-1"><CheckCircle className="w-3 h-3" /> Approved</Badge>;
      case 'pending':
        return <Badge className="bg-warning/10 text-warning border-warning/20 gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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
                <span className="text-sm font-medium">Medical Director</span>
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
                    { id: 'overview', label: 'Dashboard', icon: BarChart3 },
                    { id: 'doctors', label: 'Doctors', icon: Users },
                    { id: 'patients', label: 'Patients', icon: Users },
                    { id: 'verification', label: 'Verification', icon: Award, badge: stats.pendingVerification },
                    { id: 'inbox', label: 'Inbox', icon: Mail },
                    { id: 'clinical', label: 'Clinical Activities', icon: FileText },
                    { id: 'quality', label: 'Quality Assurance', icon: Shield },
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
                          ? 'bg-primary-foreground text-primary'
                          : 'bg-accent text-accent-foreground'
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
                    Sign Out
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

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              {[
                { label: 'Total Doctors', value: stats.totalDoctors, icon: Users, color: 'bg-primary/10 text-primary' },
                { label: 'Total Patients', value: stats.totalPatients, icon: Users, color: 'bg-blue-500/10 text-blue-500' },
                { label: 'Approved', value: stats.approvedDoctors, icon: CheckCircle, color: 'bg-success/10 text-success' },
                { label: 'Pending', value: stats.pendingVerification, icon: Clock, color: 'bg-warning/10 text-warning' },
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
                <TabsTrigger value="overview">Overview</TabsTrigger>
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
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">
                                  {message.first_name} {message.last_name}
                                </p>
                                <p className="text-xs text-muted-foreground">{message.email}</p>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {message.created_at ? new Date(message.created_at).toLocaleDateString() : ''}
                              </span>
                            </div>
                            <p className="text-sm font-medium mt-2">{message.subject}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{message.message}</p>
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

              {/* Inbox Tab */}
              <TabsContent value="inbox" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Inbox</CardTitle>
                    <CardDescription>Manage incoming messages from the public contact form</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
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

                    <div className="grid lg:grid-cols-3 gap-4">
                      <div className="lg:col-span-2 space-y-3">
                        {inboxLoading ? (
                          <p className="text-sm text-muted-foreground">Loading inbox...</p>
                        ) : inboxRows.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No messages match your filters.</p>
                        ) : (
                          inboxRows.map((message: any) => (
                            <button
                              key={message.id}
                              type="button"
                              onClick={() => setSelectedMessageId(message.id)}
                              className={`w-full text-left p-4 rounded-xl border transition ${
                                selectedMessageId === message.id
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/30 hover:bg-muted/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-sm">
                                    {message.first_name} {message.last_name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{message.email}</p>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {message.created_at ? new Date(message.created_at).toLocaleDateString() : ''}
                                </span>
                              </div>
                              <p className="text-sm font-medium mt-2">{message.subject}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{message.message}</p>
                            </button>
                          ))
                        )}

                        <div className="flex items-center justify-between pt-2">
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

                      <div className="lg:col-span-1">
                        <div className="p-4 rounded-xl border border-border bg-muted/30 h-full">
                          {!selectedMessage ? (
                            <p className="text-sm text-muted-foreground">Select a message to view details.</p>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm font-semibold">From</p>
                                <p className="text-sm">{selectedMessage.first_name} {selectedMessage.last_name}</p>
                                <p className="text-xs text-muted-foreground">{selectedMessage.email}</p>
                                {selectedMessage.phone && (
                                  <p className="text-xs text-muted-foreground">{selectedMessage.phone}</p>
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-semibold">Subject</p>
                                <p className="text-sm">{selectedMessage.subject}</p>
                              </div>
                              <div>
                                <p className="text-sm font-semibold">Received</p>
                                <p className="text-xs text-muted-foreground">
                                  {selectedMessage.created_at ? new Date(selectedMessage.created_at).toLocaleString() : ''}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-semibold">Message</p>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {selectedMessage.message}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
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
                      <Button variant="outline" size="icon">
                        <Download className="w-4 h-4" />
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
                                <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                                <p className="text-xs text-muted-foreground">{doctor.email}</p>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                              <div className="text-left sm:text-right mb-2 sm:mb-0">
                                <p className="text-xs text-muted-foreground">Status</p>
                                {getStatusBadge(doctor.verification_status || 'pending')}
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => {
                                  setSelectedDoctor(doctor);
                                  setShowVerificationDialog(true);
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

              {/* Patients Tab */}
              <TabsContent value="patients" className="space-y-6">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Patient Directory</CardTitle>
                      <CardDescription>All registered patients and their appointment history</CardDescription>
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
                      ) : filteredDoctors.filter(d => d.verification_status === 'pending').length === 0 ? (
                        <div className="text-center py-8">
                          <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
                          <p className="text-muted-foreground">All pending verifications have been processed</p>
                        </div>
                      ) : (
                        filteredDoctors
                          .filter(d => d.verification_status === 'pending')
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
                                    <p className="text-sm text-muted-foreground">{doctor.specialty} • License: {doctor.license_number}</p>
                                  </div>
                                </div>
                                <Badge className="bg-warning/10 text-warning border-warning/20">Pending Review</Badge>
                              </div>
                              <div className="space-y-2 my-3">
                                <p className="text-sm">
                                  <span className="font-medium">Experience:</span> {doctor.experience}
                                </p>
                                <p className="text-sm">
                                  <span className="font-medium">Registered:</span> {new Date(doctor.created_at).toLocaleDateString()}
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
                                  disabled={isProcessing}
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
                                  <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                                </div>
                              </div>
                              {getStatusBadge(doctor.verification_status || 'pending')}
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-sm">
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-muted-foreground text-xs">Total Consultations</p>
                                <p className="text-lg font-bold">{doctor.total_consultations || 0}</p>
                              </div>
                              <div className="p-2 rounded-lg bg-muted/50">
                                <p className="text-muted-foreground text-xs">Patient Rating</p>
                                <p className="text-lg font-bold flex items-center gap-1">
                                  {doctor.rating || 'N/A'}<Star className="w-3 h-3 text-warning fill-warning" />
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
                    <p className="text-sm text-muted-foreground">{selectedDoctor.specialty}</p>
                    {getStatusBadge(selectedDoctor.verification_status || 'pending')}
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
                    <p className="font-medium">{(selectedDoctor as any).phone_number || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Gender</p>
                    <p className="font-medium capitalize">{(selectedDoctor as any).gender || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Age</p>
                    <p className="font-medium">{(selectedDoctor as any).age || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Marital Status</p>
                    <p className="font-medium capitalize">{(selectedDoctor as any).marital_status || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Registration Date</p>
                    <p className="font-medium">{new Date(selectedDoctor.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Location Information */}
              <div>
                <h3 className="font-semibold mb-3">Location</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">City</p>
                    <p className="font-medium">{(selectedDoctor as any).city || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">State</p>
                    <p className="font-medium">{(selectedDoctor as any).state || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Country</p>
                    <p className="font-medium">{(selectedDoctor as any).country || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Professional Information */}
              <div>
                <h3 className="font-semibold mb-3">Professional Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Specialty</p>
                    <p className="font-medium">{selectedDoctor.specialty}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Hospital Affiliation</p>
                    <p className="font-medium">{(selectedDoctor as any).hospital_affiliation || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">Experience</p>
                    <p className="font-medium">{selectedDoctor.experience || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">License Number</p>
                    <p className="font-medium">{selectedDoctor.license_number || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Identification */}
              <div>
                <h3 className="font-semibold mb-3">Identification</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">ID Type</p>
                    <p className="font-medium capitalize">{(selectedDoctor as any).identification_type?.replace('_', ' ') || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-muted-foreground text-xs mb-1">ID Number</p>
                    <p className="font-medium">{(selectedDoctor as any).identification_number || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Medical License Document */}
              {(selectedDoctor as any).medical_license_url && (
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
                        onClick={() => window.open((selectedDoctor as any).medical_license_url, '_blank')}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Document
                      </Button>
                    </div>
                    {(selectedDoctor as any).medical_license_url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                      <img 
                        src={(selectedDoctor as any).medical_license_url} 
                        alt="Medical License"
                        className="w-full max-h-96 object-contain rounded-lg border border-border"
                      />
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-sm">Click "View Document" to open the license file</p>
                      </div>
                    )}
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
                      disabled={isProcessing}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve & Activate
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
                      <span className="font-medium">Verification Date:</span> {new Date(selectedDoctor.verification_date).toLocaleDateString()}
                    </p>
                    {(selectedDoctor as any).verified_at && (
                      <p className="text-sm">
                        <span className="font-medium">Verified At:</span> {new Date((selectedDoctor as any).verified_at).toLocaleString()}
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
