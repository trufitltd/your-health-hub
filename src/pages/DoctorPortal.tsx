import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, Video, MessageSquare, FileText,
  User, Bell, Settings, LogOut, ChevronRight, Star,
  Heart, Activity, Users, Phone, Banknote,
  TrendingUp, CheckCircle, XCircle, BarChart3, Menu, X
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useAppointments } from '@/hooks/useAppointments';
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
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { DoctorMessagesTab } from '@/components/doctor-portal/DoctorMessagesTab';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    treatment_plan: string | null;
    prescriptions: string | null;
    follow_up_notes: string | null;
  }>>([]);
  const [doctorNamesById, setDoctorNamesById] = useState<Record<string, string>>({});
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<'pending' | 'upcoming' | 'completed' | 'rejected' | 'all'>('pending');
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Track doctor presence
  useEffect(() => {
    if (user?.id) {
      console.log('[DoctorPortal] Tracking presence for doctor:', user.id, 'role:', role);
    }
  }, [user?.id, role]);
  
  useTrackUserPresence(user?.id, 'doctor');
  
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
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [profileFormData, setProfileFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    specialty: '',
    experience: '',
    bio: '',
  });

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

  const formatFolderFieldLabel = (field: string) =>
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
    return date.toLocaleString();
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
    return formatted.trim();
  };

  const handleViewPatientFolder = async (apt: any) => {
    setSelectedAppointmentForFolder(apt);
    setViewFolderOpen(true);
    setIsLoadingPatientFolder(true);
    setPatientFolder(null);
    setPatientFolderNotes([]);

    try {
      const [{ data: folder, error: folderError }, { data: notes, error: notesError }] = await Promise.all([
        supabase
          .from('patient_folders')
          .select('*')
          .eq('patient_id', apt.patient_id)
          .maybeSingle(),
        supabase
          .from('doctor_consultation_notes')
          .select('id, created_at, doctor_id, diagnosis, treatment_plan, prescriptions, follow_up_notes')
          .eq('patient_id', apt.patient_id)
          .eq('doctor_id', user?.id)
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      if (folderError) throw folderError;
      if (notesError) throw notesError;

      setPatientFolder((folder as Record<string, any> | null) ?? null);
      const typedNotes = ((notes as any) ?? []) as Array<{
        id: string;
        created_at: string;
        doctor_id: string | null;
        diagnosis: string | null;
        treatment_plan: string | null;
        prescriptions: string | null;
        follow_up_notes: string | null;
      }>;
      setPatientFolderNotes(typedNotes);

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
      setProfileFormData({
        fullName: doctorRegistration.full_name || '',
        email: doctorRegistration.email || '',
        phone: doctorRegistration.phone_number || '',
        specialty: doctorRegistration.specialty || '',
        experience: doctorRegistration.experience || '',
        bio: doctorRegistration.bio || '',
      });
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
      
      if (patientIds.length === 0) return appointments.map(apt => ({ ...apt, patient_age: null }));
      
      const { data: patientData, error: patientError } = await supabase
        .from('patient_registrations')
        .select('user_id, age, full_name, profile_picture_url')
        .in('user_id', patientIds);
      
      console.log('Patient data:', patientData, 'Error:', patientError);
      
      // Merge the data
      const patientDataMap = new Map(patientData?.map(p => [p.user_id, { age: p.age, full_name: p.full_name, profile_picture_url: p.profile_picture_url }]) || []);
      return appointments.map(apt => ({
        ...apt,
        patient_age: patientDataMap.get(apt.patient_id)?.age || null,
        patient_name: patientDataMap.get(apt.patient_id)?.full_name || null,
        patient_profile_picture: patientDataMap.get(apt.patient_id)?.profile_picture_url || null
      }));
    },
    enabled: !!user?.id,
  });

  const handleAcceptRequest = async (appointmentId: string) => {
    try {
      console.log('Accepting appointment:', appointmentId, 'User ID:', user?.id);
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appointmentId);
      
      if (error) {
        console.error('Error accepting appointment:', error);
        throw error;
      }
      
      console.log('Appointment accepted successfully:', data);
      toast({ title: 'Accepted', description: 'Appointment has been confirmed.' });
      refetch();
    } catch (error) {
      console.error('Failed to accept appointment:', error);
      toast({ title: 'Error', description: 'Failed to accept appointment.' });
    }
  };

  const handleDeclineRequest = async (appointmentId: string) => {
    try {
      console.log('Declining appointment:', appointmentId, 'User ID:', user?.id);
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'rejected' })
        .eq('id', appointmentId);
      
      if (error) {
        console.error('Error declining appointment:', error);
        throw error;
      }
      
      console.log('Appointment declined successfully:', data);
      toast({ title: 'Declined', description: 'Appointment has been declined.' });
      refetch();
    } catch (error) {
      console.error('Failed to decline appointment:', error);
      toast({ title: 'Error', description: 'Failed to decline appointment.' });
    }
  };

  // Calculate upcoming appointments (next 24 hours) and next appointment
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  const upcomingSchedule = (fetchedAppointments || []).filter(apt => {
    const aptDateTime = new Date(`${apt.date}T${apt.time}`);
    return aptDateTime >= now && aptDateTime <= next24Hours && (apt.status === 'confirmed' || apt.status === 'pending');
  }).sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Find next appointment
  const upcomingAppointments = (fetchedAppointments || [])
    .filter(apt => {
      const aptDate = new Date(`${apt.date}T${apt.time}`);
      return aptDate > now && (apt.status === 'confirmed' || apt.status === 'pending');
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
    
    if (diffMins < 60) return `${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Filter pending requests for the current doctor
  const pendingRequests = (fetchedAppointments || []).filter(apt => {
    console.log('Checking appointment:', apt.id, 'Status:', apt.status);
    return apt.status === 'pending' || apt.status === 'requested' || apt.status === 'awaiting_approval';
    }).map(apt => ({
    id: apt.id,
    patient: apt.patient_name || 'Unknown Patient',
    age: apt.patient_age || 'N/A',
    requestedDate: apt.date,
    requestedTime: apt.time,
    reason: apt.notes || 'No reason provided',
    priority: 'normal',
  }));
  
  console.log('Final pending requests:', pendingRequests);

  // Move stats calculation after pendingRequests
  const stats = {
    totalPatients: doctorStats?.totalPatients || 0,
    consultationsThisMonth: doctorStats?.consultationsThisMonth || 0,
    pendingRequests: pendingRequests.length,
    earnings: earningsData?.thisMonthEarnings || 0,
    rating: doctorStats?.rating || 0,
  };

  const filteredAppointmentsByStatus = useMemo(() => {
    if (!fetchedAppointments) return [];
    const now = new Date();
    
    let filtered;
    switch (appointmentStatusFilter) {
      case 'pending':
        filtered = fetchedAppointments.filter(apt => apt.status === 'pending');
        break;
      case 'upcoming':
        filtered = fetchedAppointments.filter(apt => {
          const aptDateTime = new Date(`${apt.date}T${apt.time}`);
          return aptDateTime > now && apt.status === 'confirmed';
        });
        break;
      case 'completed':
        filtered = fetchedAppointments.filter(apt => apt.status === 'completed');
        break;
      case 'rejected':
        filtered = fetchedAppointments.filter(apt => apt.status === 'rejected');
        break;
      case 'all':
      default:
        filtered = fetchedAppointments;
    }
    
    // Sort: pending by created_at desc, upcoming by date asc, completed by date desc
    return filtered.sort((a, b) => {
      if (appointmentStatusFilter === 'pending') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (appointmentStatusFilter === 'upcoming') {
        const dateTimeA = new Date(`${a.date}T${a.time}`).getTime();
        const dateTimeB = new Date(`${b.date}T${b.time}`).getTime();
        return dateTimeA - dateTimeB;
      } else {
        const dateTimeA = new Date(`${a.date}T${a.time}`).getTime();
        const dateTimeB = new Date(`${b.date}T${b.time}`).getTime();
        return dateTimeB - dateTimeA;
      }
    });
  }, [fetchedAppointments, appointmentStatusFilter]);

  // Derive patients list from appointments
  const patientsList = useMemo(() => {
    const patientsMap = new Map<string, any>();
    
    (fetchedAppointments || []).forEach(apt => {
      if (apt.patient_id && apt.patient_name) {
        if (!patientsMap.has(apt.patient_id)) {
          patientsMap.set(apt.patient_id, {
            id: apt.patient_id,
            name: apt.patient_name,
            age: apt.patient_age || 'N/A',
            lastVisit: apt.date,
            appointments: []
          });
        }
        const patient = patientsMap.get(apt.patient_id);
        patient.appointments.push({
          date: apt.date,
          time: apt.time,
          status: apt.status
        });
      }
    });

    // Sort appointments for each patient to get the latest one
    patientsMap.forEach(patient => {
      patient.appointments.sort((a: any, b: any) => {
        const dateA = new Date(`${a.date}T${a.time}`).getTime();
        const dateB = new Date(`${b.date}T${b.time}`).getTime();
        return dateB - dateA;
      });
      if (patient.appointments.length > 0) {
        patient.lastVisit = patient.appointments[0].date;
      }
    });

    return Array.from(patientsMap.values());
  }, [fetchedAppointments]);

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

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setIsSavingProfile(true);
    
    try {
      const { error } = await supabase
        .from('doctor_registrations')
        .update({
          full_name: profileFormData.fullName,
          email: profileFormData.email,
          phone_number: profileFormData.phone,
          specialty: profileFormData.specialty,
          experience: profileFormData.experience,
          bio: profileFormData.bio,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['doctor-registration'] });
      toast({ title: 'Success', description: 'Profile updated successfully!' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update profile.' });
    } finally {
      setIsSavingProfile(false);
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
        title: 'Success',
        description: newAvailability ? 'You are now available for consultations' : 'You are now unavailable for new consultations',
      });
    } catch (error) {
      console.error('Failed to update availability:', error);
      toast({
        title: 'Error',
        description: 'Failed to update availability status. Please try again.',
        variant: 'destructive',
      });
      // Revert the toggle if update failed
      setIsAvailable(!newAvailability);
    }
  };

  const requireAuth = () => {
    if (!user) {
      toast({ title: 'Please sign in', description: 'You must be signed in to access this feature.' });
      navigate('/auth');
      return false;
    }
    return true;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Completed</Badge>;
      case 'in-progress':
        return <Badge className="bg-primary/10 text-primary border-primary/20">In Progress</Badge>;
      case 'upcoming':
        return <Badge variant="outline">Upcoming</Badge>;
      case 'cancelled':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Urgent</Badge>;
      case 'normal':
        return <Badge variant="outline">Normal</Badge>;
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
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>

              {/* Availability Toggle */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted">
                <span className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className="text-sm font-medium">{isAvailable ? 'Available' : 'Unavailable'}</span>
                <Switch
                  checked={isAvailable}
                  onCheckedChange={handleAvailabilityToggle}
                  className="ml-1"
                />
              </div>

              <Button variant="ghost" size="icon" className="relative" onClick={() => setActiveTab('appointments')}>
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[10px] text-accent-foreground rounded-full flex items-center justify-center">
                  {stats.pendingRequests}
                </span>
              </Button>

              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden lg:flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarImage src={profilePicture} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">{displayInitials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 hidden sm:block">
                  <p className="text-sm font-medium truncate">{role === 'doctor' ? `Dr. ${displayName}` : displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{doctorRegistration?.specialty || 'General Practice'}</p>
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
                {/* User Profile Section - Visible on mobile when sidebar is open */}
                <div className="lg:hidden mb-4 pb-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={profilePicture} />
                      <AvatarFallback className="bg-primary text-primary-foreground">{displayInitials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{role === 'doctor' ? `Dr. ${displayName}` : displayName}</p>
                      <p className="text-sm text-muted-foreground truncate">{doctorRegistration?.specialty || 'General Practice'}</p>
                    </div>
                  </div>
                </div>

                <nav className="space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto lg:max-h-none">
                  {[
                    { id: 'overview', label: 'Dashboard', icon: BarChart3 },
                    { id: 'appointments', label: 'Appointments', icon: Calendar, badge: stats.pendingRequests },
                    { id: 'patients', label: 'My Patients', icon: Users },
                    { id: 'availability', label: 'Availability', icon: Clock },
                    { id: 'earnings', label: 'Earnings', icon: Banknote },
                    { id: 'reviews', label: 'Reviews', icon: Star },
                    { id: 'messages', label: 'Messages', icon: MessageSquare },
                    { id: 'settings', label: 'Settings', icon: Settings },
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
                      Welcome back, Dr {displayName.split(' ')[0]}! 👋
                    </h1>
                    <p className="text-xs sm:text-sm text-primary-foreground/80">
                      You have {upcomingSchedule.length} consultations scheduled in the next 24 hours.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {nextAppointment ? (
                        <>
                          <p className="text-sm text-primary-foreground/80">Next appointment in</p>
                          <p className="text-2xl font-bold">{getTimeUntilNext()}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-primary-foreground/80">No upcoming</p>
                          <p className="text-2xl font-bold">appointments</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

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
                    <h3 className="font-semibold text-warning mb-1">Welcome to MyE-Doctor! 🎉</h3>
                    <p className="text-sm text-muted-foreground">
                      Thank you for joining our platform! Your doctor account is currently under review by our medical director. We're excited to have you on board and will notify you once your credentials have been verified and your account is activated. This process typically takes 24-48 hours.
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
                    <h3 className="font-semibold text-success mb-1">Account Approved ✓</h3>
                    <p className="text-sm text-muted-foreground">
                      Congratulations! Your doctor account has been verified and approved. You can now accept appointments and provide consultations to patients.
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
                    <h3 className="font-semibold text-destructive mb-1">Account Not Approved</h3>
                    <p className="text-sm text-muted-foreground">
                      Unfortunately, your doctor account application was not approved. Please contact our support team for more information or to resubmit your credentials.
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
                { label: 'Pending', value: stats.pendingRequests, icon: Bell, color: 'bg-warning/10 text-warning' },
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
                <TabsTrigger value="overview">Overview</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Upcoming Schedule Preview */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-lg">Upcoming Schedule</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('appointments')}>
                        View All <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {upcomingSchedule.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">No appointments scheduled for the next 24 hours</p>
                          </div>
                        ) : (
                          upcomingSchedule.slice(0, 4).map((apt) => (
                            <div key={apt.id} className={`flex items-center justify-between p-3 rounded-lg ${
                              apt.status === 'confirmed' ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'
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
                                  <p className="text-xs text-muted-foreground">{apt.time}</p>
                                </div>
                              </div>
                              {getStatusBadge(apt.status)}
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pending Requests Preview */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-lg">Pending Requests</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('appointments')}>
                        View All <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {pendingRequests.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">No pending requests</p>
                          </div>
                        ) : (
                          pendingRequests.map((request) => (
                            <div key={request.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm">{request.patient}</p>
                                  {getPriorityBadge(request.priority)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{request.reason}</p>
                              </div>
                              <div className="flex gap-2">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeclineRequest(request.id)}>
                                  <XCircle className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-success" onClick={() => handleAcceptRequest(request.id)}>
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
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
                      <CardTitle className="text-lg">Recent Reviews</CardTitle>
                      <CardDescription>What your patients are saying</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-warning fill-warning" />
                      <span className="font-bold">{statsLoading ? '...' : (doctorStats?.rating || 'N/A')}</span>
                      <span className="text-muted-foreground text-sm">({recentReviews.length} reviews)</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {reviewsLoading ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Loading reviews...</p>
                      </div>
                    ) : recentReviews.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">No reviews yet</p>
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
                              <span>{new Date(review.date).toLocaleDateString()}</span>
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
                    <CardTitle>Appointments</CardTitle>
                    <CardDescription>Manage all your appointments in one place</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Status Sub-tabs */}
                    <Tabs value={appointmentStatusFilter} onValueChange={(v) => setAppointmentStatusFilter(v as any)} className="w-full">
                      <TabsList className="grid w-full grid-cols-5 mb-6">
                        <TabsTrigger value="pending" className="relative">
                          Pending
                          {stats.pendingRequests > 0 && (
                            <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                              {stats.pendingRequests}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                        <TabsTrigger value="completed">Completed</TabsTrigger>
                        <TabsTrigger value="rejected">Rejected</TabsTrigger>
                        <TabsTrigger value="all">All</TabsTrigger>
                      </TabsList>

                      {/* Pending Tab Content */}
                      <TabsContent value="pending" className="space-y-4">
                        {filteredAppointmentsByStatus.length === 0 ? (
                          <div className="text-center py-12">
                            <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No pending requests</p>
                            <p className="text-sm text-muted-foreground mt-2">New requests will appear here when patients book appointments</p>
                          </div>
                        ) : (
                          filteredAppointmentsByStatus.map((apt) => (
                            <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-warning/30 bg-warning/5">
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
                                    {new Date(apt.date).toLocaleDateString()} at {apt.time}
                                  </p>
                                  <p className="text-sm text-muted-foreground mt-1">{apt.notes || 'No notes'}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {apt.patient_id && (
                                  <Button size="sm" variant="outline" onClick={() => handleViewPatientFolder(apt)}>
                                    View Folder
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => handleDeclineRequest(apt.id)}>
                                  Decline
                                </Button>
                                <Button size="sm" className="bg-success hover:bg-success/90" onClick={() => handleAcceptRequest(apt.id)}>
                                  Accept
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </TabsContent>

                      {/* Upcoming Tab Content */}
                      <TabsContent value="upcoming" className="space-y-4">
                        {filteredAppointmentsByStatus.length === 0 ? (
                          <div className="text-center py-12">
                            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No upcoming appointments</p>
                          </div>
                        ) : (
                          filteredAppointmentsByStatus.map((apt) => (
                            <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-primary/30 bg-primary/5">
                              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                <div className="text-center w-20">
                                  <p className="text-sm font-semibold">{apt.time}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
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
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <JoinConsultationButton
                                  appointmentId={apt.id}
                                  participantName={apt.patient_name || ''}
                                  status={apt.status}
                                  variant="default"
                                  size="sm"
                                  className="gradient-primary"
                                />
                                {apt.patient_id && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleViewPatientFolder(apt)}
                                  >
                                    View Folder
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </TabsContent>

                      {/* Rejected Tab Content */}
                      <TabsContent value="rejected" className="space-y-4">
                        {filteredAppointmentsByStatus.length === 0 ? (
                          <div className="text-center py-12">
                            <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No rejected appointments</p>
                          </div>
                        ) : (
                          filteredAppointmentsByStatus.map((apt) => (
                            <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                <div className="text-center w-20">
                                  <p className="text-sm font-semibold">{apt.time}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
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
                                  <p className="text-sm text-muted-foreground">{apt.patient_age ? `${apt.patient_age} years old` : 'Age N/A'}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{apt.notes || 'No notes'}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {apt.patient_id && (
                                  <Button size="sm" variant="outline" onClick={() => handleViewPatientFolder(apt)}>
                                    View Folder
                                  </Button>
                                )}
                                <Badge variant="destructive">Rejected</Badge>
                              </div>
                            </div>
                          ))
                        )}
                      </TabsContent>

                      {/* Completed Tab Content */}
                      <TabsContent value="completed" className="space-y-4">
                        {filteredAppointmentsByStatus.length === 0 ? (
                          <div className="text-center py-12">
                            <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No completed consultations</p>
                          </div>
                        ) : (
                          filteredAppointmentsByStatus.map((apt) => (
                            <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-success/30 bg-success/5">
                              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                <div className="text-center w-20">
                                  <p className="text-sm font-semibold">{apt.time}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
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
                                  <p className="text-sm text-muted-foreground">{apt.patient_age ? `${apt.patient_age} years old` : 'Age N/A'}</p>
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
                              {apt.patient_id && (
                                <Button size="sm" variant="outline" onClick={() => handleViewPatientFolder(apt)}>
                                  View Folder
                                </Button>
                              )}
                            </div>
                          ))
                        )}
                      </TabsContent>

                      {/* All Tab Content */}
                      <TabsContent value="all" className="space-y-4">
                        {filteredAppointmentsByStatus.length === 0 ? (
                          <div className="text-center py-12">
                            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No appointments found</p>
                          </div>
                        ) : (
                          filteredAppointmentsByStatus.map((apt) => (
                            <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border">
                              <div className="flex items-center gap-4 mb-3 sm:mb-0">
                                <div className="text-center w-20">
                                  <p className="text-sm font-semibold">{apt.time}</p>
                                  <p className="text-xs text-muted-foreground">{new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
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
                                  <p className="text-sm text-muted-foreground">{apt.patient_age ? `${apt.patient_age} years old` : 'Age N/A'}</p>
                                  <Badge className="mt-1" variant={
                                    apt.status === 'pending' ? 'default' :
                                    apt.status === 'confirmed' ? 'outline' :
                                    apt.status === 'completed' ? 'secondary' : 'destructive'
                                  }>
                                    {apt.status}
                                  </Badge>
                                </div>
                              </div>
                              {apt.status === 'confirmed' && (
                                <JoinConsultationButton
                                  appointmentId={apt.id}
                                  participantName={apt.patient_name || ''}
                                  status={apt.status}
                                  variant="default"
                                  size="sm"
                                />
                              )}
                              {apt.patient_id && (
                                <Button size="sm" variant="outline" onClick={() => handleViewPatientFolder(apt)}>
                                  View Folder
                                </Button>
                              )}
                              {apt.status === 'pending' && (
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleDeclineRequest(apt.id)}>
                                    Decline
                                  </Button>
                                  <Button size="sm" className="bg-success" onClick={() => handleAcceptRequest(apt.id)}>
                                    Accept
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))
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
                      <CardTitle>My Patients</CardTitle>
                      <CardDescription>All patients under your care</CardDescription>
                    </div>
                    <Input placeholder="Search patients..." className="w-full sm:w-64" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {patientsList.length === 0 ? (
                        <div className="text-center py-12">
                          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">No patients yet</p>
                          <p className="text-sm text-muted-foreground mt-2">Patients will appear here once they book appointments with you</p>
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
                                <p className="text-sm text-muted-foreground">{patient.age} {typeof patient.age === 'number' ? 'years old' : ''}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Last visit: {new Date(patient.lastVisit).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                              <div className="text-left sm:text-right mb-2 sm:mb-0">
                                <p className="text-xs text-muted-foreground">Total appointments</p>
                                <p className="text-sm font-medium">{patient.appointments.length}</p>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <Button size="sm" variant="outline" className="w-full sm:w-auto">
                                  View Profile
                                </Button>
                                <Button size="sm" variant="ghost" className="w-full sm:w-auto">
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  Message
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
                      <p className="text-muted-foreground">Please sign in to manage your schedule.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>


                  <TabsContent value="earnings" className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                              <Banknote className="w-6 h-6 text-success" />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">This Month</p>
                              <p className="text-2xl font-bold">
                                {earningsLoading ? '...' : `₦${stats.earnings.toLocaleString()}`}
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
                              <p className="text-sm text-muted-foreground">Growth</p>
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
                              <p className="text-sm text-muted-foreground">Consultations</p>
                              <p className="text-2xl font-bold">
                                {earningsLoading ? '...' : earningsData?.thisMonthConsultations || 0}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Earnings History</CardTitle>
                        <CardDescription>Your consultation earnings over the last 6 months</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {earningsLoading ? (
                          <div className="h-64 flex items-center justify-center text-muted-foreground">
                            <p>Loading earnings data...</p>
                          </div>
                        ) : !earningsData?.monthlyData || earningsData.monthlyData.length === 0 ? (
                          <div className="h-64 flex items-center justify-center text-muted-foreground">
                            <BarChart3 className="w-12 h-12 mr-3" />
                            <span>No earnings data available yet</span>
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
                                      <span className="font-bold">₦{month.earnings.toLocaleString()}</span>
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
                            <CardTitle>Patient Reviews</CardTitle>
                            <CardDescription>Feedback from your consultations</CardDescription>
                          </div>
                          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted">
                            <div className="text-center">
                              <div className="flex items-center gap-1">
                                <Star className="w-6 h-6 text-warning fill-warning" />
                                <span className="text-3xl font-bold">{statsLoading ? '...' : (doctorStats?.rating || 'N/A')}</span>
                              </div>
                              <p className="text-sm text-muted-foreground">{recentReviews.length} reviews</p>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {reviewsLoading ? (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">Loading reviews...</p>
                          </div>
                        ) : recentReviews.length === 0 ? (
                          <div className="text-center py-8">
                            <Star className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No reviews yet</p>
                            <p className="text-sm text-muted-foreground mt-2">Reviews from patients will appear here after consultations</p>
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
                                  {new Date(review.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="messages" className="space-y-6">
                    <DoctorMessagesTab />
                  </TabsContent>

                  <TabsContent value="settings" className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Profile Settings</CardTitle>
                        <CardDescription>Manage your doctor profile</CardDescription>
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
                              <p className="text-muted-foreground">{doctorRegistration?.specialty ?? 'General Practice'}</p>
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
                                  {isUploadingPhoto ? 'Uploading...' : 'Change Photo'}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium">Full Name</label>
                              <Input 
                                value={profileFormData.fullName || doctorRegistration?.full_name || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, fullName: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Email</label>
                              <Input 
                                value={profileFormData.email || doctorRegistration?.email || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, email: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Phone</label>
                              <Input 
                                value={profileFormData.phone || doctorRegistration?.phone_number || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, phone: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Specialty</label>
                              <Input 
                                value={profileFormData.specialty || doctorRegistration?.specialty || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, specialty: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Experience</label>
                              <Input 
                                value={profileFormData.experience || doctorRegistration?.experience || ''} 
                                onChange={(e) => setProfileFormData({...profileFormData, experience: e.target.value})}
                                className="mt-1" 
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-sm font-medium">Bio</label>
                            <Textarea 
                              value={profileFormData.bio || doctorRegistration?.bio || ''} 
                              onChange={(e) => setProfileFormData({...profileFormData, bio: e.target.value})}
                              placeholder="Tell patients about yourself, your experience, and approach to healthcare..."
                              className="mt-1 min-h-[100px]" 
                            />
                          </div>

                          <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                            {isSavingProfile ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </main>
            </div>
        </div>
        
        {/* View Folder Modal */}
        <Dialog open={viewFolderOpen} onOpenChange={setViewFolderOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
            <DialogHeader className="pr-10">
              <DialogTitle>Patient Folder</DialogTitle>
              <DialogDescription>
                Folder for {selectedAppointmentForFolder?.patient_name}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-medium">Patient:</span> {selectedAppointmentForFolder?.patient_name}</div>
                  <div><span className="font-medium">Date:</span> {selectedAppointmentForFolder?.date}</div>
                  <div><span className="font-medium">Time:</span> {selectedAppointmentForFolder?.time}</div>
                  <div><span className="font-medium">Last Updated:</span> {patientFolder?.updated_at ? new Date(patientFolder.updated_at).toLocaleString() : 'N/A'}</div>
                </div>
              </div>

              {isLoadingPatientFolder ? (
                <div className="text-sm text-muted-foreground">Loading patient folder...</div>
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
                                patientFolder[field],
                                `No ${formatFolderFieldLabel(field).toLowerCase()} recorded.`
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No patient folder found yet.</p>
                  )}
                  <div>
                    <label className="text-sm font-medium">Recent Consultation Entries</label>
                    <div className="mt-2 space-y-2">
                      {patientFolderNotes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No consultation entries found.</p>
                      ) : (
                        patientFolderNotes.map((note) => (
                          <div key={note.id} className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-1">{new Date(note.created_at).toLocaleString()}</p>
                            <p className="text-sm"><span className="font-medium">Assessment:</span> {note.diagnosis || 'Not recorded'}</p>
                            <p className="text-sm"><span className="font-medium">Plan:</span> {note.treatment_plan || 'Not recorded'}</p>
                            <p className="text-sm"><span className="font-medium">E-Prescription:</span> {note.prescriptions || 'Not recorded'}</p>
                            <p className="text-sm whitespace-pre-wrap">
                              <span className="font-medium">Full Clerking Note:</span>{' '}
                              {formatFolderEntryText(note.follow_up_notes, 'Not recorded')}
                            </p>
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
                    Folder access is limited to patients you have consulted with.
                  </p>
                </div>
              </div>
            </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewFolderOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
    </div>
  );
};

export default DoctorPortal;
