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
import { useAppointments } from '@/hooks/useAppointments';
import { useDoctors, useAvailableSlots, checkSlotAvailability } from '@/hooks/useAvailableSlots';
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
import { Label } from '@/components/ui/label';
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
import logoImage from '@/assets/MyE-DoctorLogo.png';

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const APPOINTMENT_STATUS_CALENDAR_STYLES = {
  pending: {
    dot: '#d97706',
    bg: '#d97706',
    text: '#ffffff'
  },
  confirmed: {
    dot: '#0f8f76',
    bg: '#0f8f76',
    text: '#ffffff'
  },
  completed: {
    dot: '#16a34a',
    bg: '#16a34a',
    text: '#ffffff'
  },
  rejected: {
    dot: '#dc2626',
    bg: '#dc2626',
    text: '#ffffff'
  },
  cancelled: {
    dot: '#6b7280',
    bg: '#6b7280',
    text: '#ffffff'
  },
  default: {
    dot: '#334155',
    bg: '#334155',
    text: '#ffffff'
  }
} as const;

interface PatientPrescription {
  id: string;
  noteId: string;
  medication: string;
  dosage: string;
  rawText: string;
  doctor: string;
  doctorId: string | null;
  sessionId: string | null;
  date: string;
  refillsRemaining: number;
  status: 'active' | 'past';
}

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
  const [isRequestingRefillId, setIsRequestingRefillId] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  
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
  const { data: recentConsultations = [], isLoading: consultationsLoading } = useRecentConsultations();
  const { data: notifications = [], isLoading: notificationsLoading } = useNotifications();
  const { data: patientRegistration } = usePatientRegistration();
  const { records: healthRecords, isLoading: recordsLoading, uploadRecord, deleteRecord } = useHealthRecords(user?.id);
  const queryClient = useQueryClient();
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

      // Parse prescriptions and format them
      const formatted: PatientPrescription[] = [];
      (notes || []).forEach((note: any) => {
        if (note.prescriptions) {
          try {
            // Try to parse as JSON if it's structured
            const parsed = typeof note.prescriptions === 'string'
              ? note.prescriptions.split(/\r?\n/).filter((line: string) => line.trim())
              : [note.prescriptions];
            
            parsed.forEach((line: string) => {
              // Simple parsing: expect format like "Medication - Dosage" or just the text
              const parts = line.split('-').map((p: string) => p.trim());
              const daysSincePrescription = Math.floor((Date.now() - new Date(note.created_at).getTime()) / (1000 * 60 * 60 * 24));
              const doctorId = note.consultation_sessions?.doctor_id ?? null;
              const resolvedDoctorName =
                (doctorId ? doctorNameMap.get(doctorId) : null) ||
                note.consultation_sessions?.appointments?.specialist_name ||
                'Doctor';
              formatted.push({
                id: `${note.id}-${formatted.length}-${line.trim().toLowerCase()}`,
                noteId: note.id,
                medication: parts[0] || line,
                dosage: parts[1] || 'As prescribed',
                rawText: line.trim(),
                doctor: resolvedDoctorName,
                doctorId,
                sessionId: note.consultation_sessions?.id ?? null,
                date: note.created_at,
                refillsRemaining: daysSincePrescription > 90 ? 0 : 3,
                status: daysSincePrescription > 90 ? 'past' : 'active'
              });
            });
          } catch (err) {
            console.error('Error parsing prescription:', err);
          }
        }
      });

      return formatted;
    },
    enabled: !!user?.id,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleRecordUpload = async (file: File) => {
    setIsUploadingRecord(true);
    try {
      await uploadRecord.mutateAsync({ file, notes: uploadNotes });
      setUploadNotes('');
      toast({ title: 'Success', description: 'Health record uploaded successfully!' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to upload health record.' });
    } finally {
      setIsUploadingRecord(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      await deleteRecord.mutateAsync(recordId);
      toast({ title: 'Success', description: 'Health record deleted successfully!' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete health record.' });
    }
  };

  const handleViewPrescriptionDetails = (prescription: PatientPrescription) => {
    setSelectedPrescription(prescription);
    setPrescriptionDetailsOpen(true);
  };

  const handleDownloadPrescription = (prescription: PatientPrescription) => {
    try {
      const content = [
        'MYE-DOCTOR PRESCRIPTION',
        `Patient: ${displayName}`,
        `Prescribed by: ${prescription.doctor}`,
        `Date: ${new Date(prescription.date).toLocaleString()}`,
        '',
        `Medication: ${prescription.medication}`,
        `Dosage: ${prescription.dosage}`,
        `Instructions: ${prescription.rawText}`,
        '',
        `Status: ${prescription.status}`,
      ].join('\n');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeMedication = prescription.medication.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      link.href = url;
      link.download = `prescription-${safeMedication || 'medication'}-${new Date(prescription.date).toISOString().split('T')[0]}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Prescription downloaded successfully.' });
    } catch (error) {
      console.error('Failed to download prescription:', error);
      toast({ title: 'Error', description: 'Failed to download prescription.', variant: 'destructive' });
    }
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
      const content = `Prescription refill request: ${prescription.medication} (${prescription.dosage}). Original prescription date: ${new Date(prescription.date).toLocaleDateString()}.`;
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

  const handleBookAppointment = () => {
    if (!requireAuthForBooking()) return;
    // TODO: Open booking modal or navigate to detailed booking flow
    toast({ title: 'Booking', description: 'Booking flow not implemented yet.' });
  };

  const handleNewAppointment = () => {
    if (!requireAuthForBooking()) return;
    navigate('/doctor-discovery');
  };

  // Booking modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [slotSelectionOpen, setSlotSelectionOpen] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [specialistName, setSpecialistName] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  // appointment type removed - all bookings are generic
  const [bookingNotes, setBookingNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState<string | null>(null);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<'pending' | 'confirmed' | 'completed' | 'rejected' | 'all'>('confirmed');
  const [appointmentViewMode, setAppointmentViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarDayDialogOpen, setCalendarDayDialogOpen] = useState(false);
  const [calendarEventDialogOpen, setCalendarEventDialogOpen] = useState(false);
  const [calendarDialogDate, setCalendarDialogDate] = useState<string | null>(null);
  const [calendarFocusedAppointmentId, setCalendarFocusedAppointmentId] = useState<string | null>(null);
  const lastHandledReviewAppointmentRef = useRef<string | null>(null);

  // Pricing logic (single uniform consultation price)
  const getPricing = (specialty: string) => {
    const isSpecialist = specialty && specialty.toLowerCase() !== 'general practice';
    return isSpecialist ? 8000 : 4000;
  };

  const formatPrice = (price: number) => `₦${price.toLocaleString()}`;

  // Handle external booking requests
  useEffect(() => {
    if (searchParams.get('action') === 'book') {
      setSlotSelectionOpen(true);
      // Clean up the URL without refreshing
      setSearchParams(params => {
        const newParams = new URLSearchParams(params);
        newParams.delete('action');
        return newParams;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const resetBookingState = () => {
    setSpecialistName('');
    setBookingDate('');
    setBookingTime('');
    setBookingNotes('');
    setSelectedDoctorId(null);
    setRescheduleAppointmentId(null);
    setRescheduleDoctorId(null);
    setBookingOpen(false);
  };

  // Fetch available slots and doctors
  const { data: allSlots = [], isLoading: slotsLoading } = useAvailableSlots();
  const { data: doctors = [], isLoading: doctorsLoading } = useDoctors();

  const openBooking = () => {
    if (!requireAuthForBooking()) return;
    navigate('/doctor-discovery');
  };

  const handleSlotSelect = async (doctor: { id: string; name: string }, date: string, time: string) => {
    // Check if slot is available (conflict check)
    try {
      const isAvailable = await checkSlotAvailability(doctor.id, date, time);
      if (!isAvailable) {
        toast({ title: 'Slot unavailable', description: 'This time slot has been booked. Please select another.' });
        return;
      }

      setSelectedDoctorId(doctor.id);
      setSpecialistName(doctor.name);
      setBookingDate(date);
      setBookingTime(time);
      setSlotSelectionOpen(false);
      setBookingOpen(true);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : 'Failed to check slot availability';
      toast({ title: 'Error', description: String(message) });
    }
  };

  const createBooking = async () => {
    if (!requireAuthForBooking()) return;
    if (!specialistName || !bookingDate || !bookingTime || !selectedDoctorId) {
      toast({ title: 'Missing fields', description: 'Please select a specialist, date and time.' });
      return;
    }

    setIsBooking(true);
    try {
      // Final conflict check before insertion
      const isAvailable = await checkSlotAvailability(selectedDoctorId, bookingDate, bookingTime);
      if (!isAvailable) {
        toast({ title: 'Slot unavailable', description: 'This time slot has been booked. Please select another.' });
        setIsBooking(false);
        return;
      }

      const payload: Record<string, unknown> = {
        patient_id: user?.id,
        patient_name: displayName,
        specialist_name: specialistName,
        doctor_id: selectedDoctorId,
        date: bookingDate,
        time: bookingTime,
        notes: bookingNotes,
        status: 'pending',
      };

      const { data, error } = await supabase.from('appointments').insert([payload]).select();
      if (error) {
        throw error;
      }

      toast({ title: 'Booked', description: 'Your appointment request has been submitted.' });
      resetBookingState();
      // Refresh appointments list
      invalidateAppointments();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({ title: 'Booking failed', description: message });
    } finally {
      setIsBooking(false);
    }
  };

  const initReschedule = (apt: unknown) => {
    if (!requireAuthForBooking()) return;
    const aptData = apt as unknown as { id?: string; doctor_id?: string };
    setRescheduleAppointmentId(aptData.id ?? null);
    setRescheduleDoctorId(aptData.doctor_id ?? null);
    // We don't pre-fill doctor/date/time because the user wants to CHANGE them.
    // But we could pre-fill the doctor if we wanted to restrict rescheduling to the same doctor.
    // For now, let's allow full flexibility as per the "Book Appointment" flow.
    setSlotSelectionOpen(true);
  };

  const rescheduleBooking = async () => {
    if (!requireAuthForBooking()) return;
    if (!specialistName || !bookingDate || !bookingTime || !selectedDoctorId || !rescheduleAppointmentId) {
      toast({ title: 'Missing fields', description: 'Please select a specialist, date and time.' });
      return;
    }

    setIsBooking(true);
    try {
      // Final conflict check before update
      const isAvailable = await checkSlotAvailability(selectedDoctorId, bookingDate, bookingTime);
      if (!isAvailable) {
        toast({ title: 'Slot unavailable', description: 'This time slot has been booked. Please select another.' });
        setIsBooking(false);
        return;
      }

      const payload = {
        doctor_id: selectedDoctorId,
        specialist_name: specialistName,
        date: bookingDate,
        time: bookingTime,
        notes: bookingNotes,
        status: 'pending', // Reset to pending on reschedule
      };

      const { error } = await supabase
        .from('appointments')
        .update(payload)
        .eq('id', rescheduleAppointmentId);

      if (error) {
        throw error;
      }

      toast({ title: 'Rescheduled', description: 'Your appointment has been rescheduled.' });
      resetBookingState();
      // Refresh appointments list
      invalidateAppointments();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({ title: 'Reschedule failed', description: message });
    } finally {
      setIsBooking(false);
    }
  };

  const cancelAppointment = async () => {
    if (!cancelAppointmentId) return;
    setIsBooking(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', cancelAppointmentId);

      if (error) throw error;

      toast({ title: 'Cancelled', description: 'Appointment has been cancelled.' });
      setCancelAppointmentId(null);
      invalidateAppointments();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? (err as { message?: string }).message : String(err);
      toast({ title: 'Cancellation failed', description: message });
    } finally {
      setIsBooking(false);
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
      toast({ title: 'Success', description: 'Profile updated successfully!' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update profile.' });
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-success/10 text-success border-success/20">Confirmed</Badge>;
      case 'pending':
        return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
      case 'completed':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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

  const filteredAppointmentsByStatus = useMemo(() => {
    if (!appointments) return [];
    const now = new Date();
    
    let filtered;
    switch (appointmentStatusFilter) {
      case 'pending':
        filtered = appointments.filter(apt => apt.status === 'pending');
        break;
      case 'confirmed':
        filtered = appointments.filter(apt => {
          const aptDateTime = new Date(`${apt.date}T${apt.time}`);
          return aptDateTime > now && apt.status === 'confirmed';
        });
        break;
      case 'completed':
        filtered = appointments.filter(apt => apt.status === 'completed');
        break;
      case 'rejected':
        filtered = appointments.filter(apt => apt.status === 'rejected');
        break;
      case 'all':
      default:
        filtered = appointments;
    }
    
    return filtered.sort((a, b) => {
      if (appointmentStatusFilter === 'pending') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (appointmentStatusFilter === 'confirmed') {
        const dateTimeA = new Date(`${a.date}T${a.time}`).getTime();
        const dateTimeB = new Date(`${b.date}T${b.time}`).getTime();
        return dateTimeA - dateTimeB;
      } else {
        const dateTimeA = new Date(`${a.date}T${a.time}`).getTime();
        const dateTimeB = new Date(`${b.date}T${b.time}`).getTime();
        return dateTimeB - dateTimeA;
      }
    });
  }, [appointments, appointmentStatusFilter]);

  useEffect(() => {
    if (appointmentViewMode !== 'calendar') return;

    if (filteredAppointmentsByStatus.length === 0) {
      setSelectedCalendarDate(null);
      return;
    }

    setSelectedCalendarDate(filteredAppointmentsByStatus[0].date);
  }, [appointmentStatusFilter, appointmentViewMode, filteredAppointmentsByStatus]);

  const appointmentsByDate = useMemo(() => {
    return filteredAppointmentsByStatus.reduce<Record<string, any[]>>((acc, apt) => {
      if (!acc[apt.date]) {
        acc[apt.date] = [];
      }
      acc[apt.date].push(apt);
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

  const calendarDialogDayAppointments = useMemo(() => {
    if (!calendarDialogDate) return [];
    return [...(appointmentsByDate[calendarDialogDate] || [])].sort((a, b) => a.time.localeCompare(b.time));
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
      const styles = APPOINTMENT_STATUS_CALENDAR_STYLES[apt.status as keyof typeof APPOINTMENT_STATUS_CALENDAR_STYLES] || APPOINTMENT_STATUS_CALENDAR_STYLES.default;
      const doctorName = getDoctorNameById((apt as { doctor_id?: string }).doctor_id, apt.specialist_name);
      return {
        id: apt.id,
        title: doctorName,
        start: `${apt.date}T${normalizeTime(apt.time)}`,
        allDay: false,
        backgroundColor: styles.bg,
        borderColor: styles.dot,
        textColor: styles.text,
        extendedProps: {
          status: apt.status,
          appointmentDate: apt.date
        }
      };
    });
  }, [filteredAppointmentsByStatus]);

  const calendarRenderKey = `${appointmentStatusFilter}-${filteredAppointmentsByStatus[0]?.date || 'empty'}`;
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
    const dateLabel = arg.date.toLocaleDateString('en-US', {
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
      ? arg.event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
    const eventStatus = String(arg.event.extendedProps.status || '').trim();
    const eventStatusLabel = eventStatus ? eventStatus[0].toUpperCase() + eventStatus.slice(1) : 'Appointment';
    arg.el.setAttribute('title', `${arg.event.title} • ${eventTime} • ${eventStatusLabel}`);
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
      ? new Date(`${calendarDialogDate}T00:00:00`).toLocaleDateString('en-US', {
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
                  <span className="capitalize">{status}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="patient-portal-calendar rounded-xl border border-border bg-card p-2 md:p-4">
          <FullCalendar
            key={calendarRenderKey}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={selectedCalendarDate || filteredAppointmentsByStatus[0]?.date}
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
                {calendarDialogDateLabel ? `Appointments on ${calendarDialogDateLabel}` : 'Appointments'}
              </DialogTitle>
              <DialogDescription>
                Review appointments for the selected day.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {calendarDialogDayAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No appointments on this date.</p>
              ) : (
                calendarDialogDayAppointments.map((apt) => (
                  <div key={apt.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{apt.time}</span>
                        {getStatusBadge(apt.status)}
                      </div>
                      <p className="text-sm font-semibold mt-1 truncate">
                        {getDoctorNameById((apt as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{apt.notes || 'No notes'}</p>
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
                      View
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
              <DialogTitle>Appointment Details</DialogTitle>
              <DialogDescription>Manage the selected appointment.</DialogDescription>
            </DialogHeader>
            {calendarFocusedAppointment && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/20 space-y-2">
                  <p className="text-sm font-semibold">
                    {getDoctorNameById((calendarFocusedAppointment as { doctor_id?: string }).doctor_id, calendarFocusedAppointment.specialist_name)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{new Date(calendarFocusedAppointment.date).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{calendarFocusedAppointment.time}</span>
                  </div>
                  <div>{getStatusBadge(calendarFocusedAppointment.status)}</div>
                  <p className="text-sm text-muted-foreground">{calendarFocusedAppointment.notes || 'No notes provided.'}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {calendarFocusedAppointment.status === 'confirmed' && (
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
                      Leave Review
                    </Button>
                  )}
                  {calendarFocusedAppointment.status === 'pending' && (
                    <>
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
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const pendingCount = appointments.filter(apt => apt.status === 'pending').length;

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
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search doctors, appointments..."
                  className="pl-10 w-48 sm:w-64 bg-muted/50"
                />
              </div>

              <Button variant="ghost" size="icon" className="relative" onClick={() => setActiveTab('overview')}>
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[10px] text-accent-foreground rounded-full flex items-center justify-center">
                    {notifications.filter(n => !n.read).length}
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
                      <p className="text-xs text-muted-foreground">Patient</p>
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
                    Profile Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
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
                      <p className="text-sm text-muted-foreground">Patient</p>
                    </div>
                  </div>
                </div>

                <nav className="space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto lg:max-h-none">
                  {[
                    { id: 'overview', label: 'Overview', icon: Activity },
                    { id: 'appointments', label: 'Appointments', icon: Calendar },
                    { id: 'prescriptions', label: 'Prescriptions', icon: Pill },
                    { id: 'messages', label: 'Messages', icon: MessageSquare, badge: unreadMessagesCount > 0 ? (unreadMessagesCount > 99 ? '99+' : unreadMessagesCount) : undefined, badgeTone: 'danger' as const },
                    { id: 'records', label: 'Health Records', icon: FileText },
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
                    Welcome back, {displayName.split(' ')[0]}! 👋
                  </h1>
                  <p className="text-xs sm:text-sm text-primary-foreground/80">
                    You have {appointments.filter(apt => {
                      const appointmentDate = new Date(apt.date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return appointmentDate >= today && (apt.status === 'confirmed' || apt.status === 'pending');
                    }).length} upcoming appointments.
                  </p>
                </div>
                <Button onClick={openBooking} variant="secondary" size="sm" className="gap-1 text-xs sm:text-sm">
                  <Plus className="w-4 sm:w-5 h-4 sm:h-5" />
                  <span className="hidden sm:inline">Book Appointment</span>
                  <span className="sm:hidden">Book</span>
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
            />

            {/* Booking Confirmation Modal */}
            <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{rescheduleAppointmentId ? 'Confirm Reschedule' : 'Confirm Appointment'}</DialogTitle>
                  <DialogDescription>Review and confirm your appointment details.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium">Selected Slot</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <div><span className="text-muted-foreground">Doctor:</span> {specialistName}</div>
                      <div><span className="text-muted-foreground">Date:</span> {new Date(bookingDate).toLocaleDateString()}</div>
                      <div><span className="text-muted-foreground">Time:</span> {bookingTime}</div>
                    </div>
                  </div>
                  <div>
                    <Label>Consultation Fee</Label>
                    <div className="p-2 text-sm">
                      {formatPrice(getPricing(doctors.find(d => d.id === selectedDoctorId)?.specialty || 'General Practice'))}
                    </div>
                  </div>
                  <div>
                    <Label>Additional Notes (Optional)</Label>
                    <textarea
                      className="w-full p-2 border rounded text-sm"
                      rows={3}
                      value={bookingNotes}
                      onChange={(e) => setBookingNotes(e.target.value)}
                      placeholder="Any additional information for the doctor..."
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setBookingOpen(false);
                    setSlotSelectionOpen(true);
                  }}>
                    Back
                  </Button>
                  <Button variant="outline" onClick={() => setBookingOpen(false)}>Cancel</Button>
                  <Button onClick={rescheduleAppointmentId ? rescheduleBooking : createBooking} disabled={isBooking}>
                    {isBooking ? 'Submitting...' : (rescheduleAppointmentId ? 'Confirm Reschedule' : 'Confirm Booking')}
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
                  <DialogDescription>Are you sure you want to cancel this appointment? This action cannot be undone.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCancelAppointmentId(null)}>No, Keep It</Button>
                  <Button variant="destructive" onClick={cancelAppointment} disabled={isBooking}>
                    {isBooking ? 'Cancelling...' : 'Yes, Cancel Appointment'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Tabs Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="hidden">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="appointments">Appointments</TabsTrigger>
                <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                {/* Upcoming Appointments */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Upcoming Appointments</CardTitle>
                      <CardDescription>Your scheduled consultations</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('appointments')}>
                      View All <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {appointmentsLoading ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Loading appointments...</p>
                      </div>
                    ) : appointments.filter(apt => {
                      const appointmentDate = new Date(apt.date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      return appointmentDate >= today && (apt.status === 'confirmed' || apt.status === 'pending');
                    }).length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">No upcoming appointments</p>
                        <Button onClick={openBooking} variant="outline" size="sm" className="mt-4 gap-2">
                          <Plus className="w-4 h-4" />
                          Book Now
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {appointments.filter(apt => {
                          const appointmentDate = new Date(apt.date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return appointmentDate >= today && (apt.status === 'confirmed' || apt.status === 'pending');
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
                                <p className="text-sm text-muted-foreground">Appointment</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm">{new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                <Clock className="w-4 h-4 text-muted-foreground ml-2" />
                                <span className="text-sm">{apt.time}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(apt.status)}
                              </div>
                              {apt.status === 'confirmed' && (
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
                      <CardTitle className="text-lg">Recent Consultations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {consultationsLoading ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">Loading consultations...</p>
                        </div>
                      ) : recentConsultations.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">No recent consultations</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {recentConsultations.slice(0, 2).map((consultation) => (
                            <div key={consultation.id} className="flex items-start justify-between">
                              <div>
                                <p className="font-medium text-sm">{consultation.doctor_name}</p>
                                <p className="text-xs text-muted-foreground">{consultation.diagnosis}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(consultation.date).toLocaleDateString()}
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
                                  <span className="text-xs text-muted-foreground">No rating</span>
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
                      <CardTitle className="text-lg">Notifications</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {notificationsLoading ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">Loading notifications...</p>
                        </div>
                      ) : notifications.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-muted-foreground text-sm">No new notifications</p>
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
                        <CardTitle>Appointments</CardTitle>
                        <CardDescription>Manage all your appointments in one place</CardDescription>
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
                            List
                          </Button>
                          <Button
                            size="sm"
                            variant={appointmentViewMode === 'calendar' ? 'default' : 'ghost'}
                            className="h-8 gap-1"
                            onClick={() => setAppointmentViewMode('calendar')}
                          >
                            <Calendar className="w-4 h-4" />
                            Calendar
                          </Button>
                        </div>
                        <Button onClick={openBooking} className="gap-2">
                          <Plus className="w-4 h-4" />
                          New Appointment
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Status Sub-tabs */}
                    <Tabs value={appointmentStatusFilter} onValueChange={(v) => setAppointmentStatusFilter(v as any)} className="w-full">
                      <TabsList className="grid w-full grid-cols-5 mb-6">
                        <TabsTrigger value="pending" className="relative">
                          Pending
                          {pendingCount > 0 && (
                            <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                              {pendingCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
                        <TabsTrigger value="completed">Completed</TabsTrigger>
                        <TabsTrigger value="rejected">Rejected</TabsTrigger>
                        <TabsTrigger value="all">All</TabsTrigger>
                      </TabsList>

                      {/* Pending Tab Content */}
                      <TabsContent value="pending" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar('No pending appointments', 'Pending appointments await doctor confirmation')
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No pending appointments</p>
                                <p className="text-sm text-muted-foreground mt-2">Pending appointments await doctor confirmation</p>
                              </div>
                            ) : (
                              filteredAppointmentsByStatus.map((apt) => (
                                <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-warning/30 bg-warning/5">
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
                                        {new Date(apt.date).toLocaleDateString()} at {apt.time}
                                      </p>
                                      <p className="text-sm text-muted-foreground mt-1">{apt.notes || 'No notes'}</p>
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                      Reschedule
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => setCancelAppointmentId((apt as unknown as { id?: string }).id ?? null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Confirmed Tab Content */}
                      <TabsContent value="confirmed" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar('No confirmed appointments')
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">No confirmed appointments</p>
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
                                    </div>
                                  </div>
                                  <JoinConsultationButton
                                    appointmentId={apt.id}
                                    participantName={getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                                    status={apt.status}
                                    variant="default"
                                    size="sm"
                                    className="gradient-primary"
                                  />
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Completed Tab Content */}
                      <TabsContent value="completed" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar('No completed consultations')
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
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
                                      Leave Review
                                    </Button>
                                  )}
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* Rejected Tab Content */}
                      <TabsContent value="rejected" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar('No rejected appointments')
                        ) : (
                          <>
                            {filteredAppointmentsByStatus.length === 0 ? (
                              <div className="text-center py-12">
                                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
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
                                  <Badge variant="destructive">Rejected</Badge>
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* All Tab Content */}
                      <TabsContent value="all" className="space-y-4">
                        {appointmentViewMode === 'calendar' ? (
                          renderAppointmentsCalendar('No appointments found')
                        ) : (
                          <>
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
                                      Leave Review
                                    </Button>
                                  )}
                                  {apt.status === 'pending' && (
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline" onClick={() => initReschedule(apt)}>
                                        Reschedule
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => setCancelAppointmentId((apt as unknown as { id?: string }).id ?? null)}>
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              ))
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
                    <CardTitle>My Prescriptions</CardTitle>
                    <CardDescription>Active and past prescriptions from your consultations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {prescriptionsLoading ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Loading prescriptions...</p>
                      </div>
                    ) : fetchedPrescriptions.length === 0 ? (
                      <div className="text-center py-12">
                        <Pill className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No prescriptions yet</p>
                        <p className="text-sm text-muted-foreground mt-2">Prescriptions from your doctor consultations will appear here</p>
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
                                  <p className="font-semibold">{prescription.medication}</p>
                                  <p className="text-sm text-muted-foreground">{prescription.dosage}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Prescribed by {prescription.doctor} • {new Date(prescription.date).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                {getStatusBadge(prescription.status)}
                                {prescription.status === 'active' && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {prescription.refillsRemaining} refills remaining
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-border flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleViewPrescriptionDetails(prescription)}>
                                View Details
                              </Button>
                              {prescription.status === 'active' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleRequestPrescriptionRefill(prescription)}
                                  disabled={isRequestingRefillId === prescription.id}
                                >
                                  {isRequestingRefillId === prescription.id ? 'Sending...' : 'Request Refill'}
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
                    <CardTitle>Health Records</CardTitle>
                    <CardDescription>Upload and manage your medical documents</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* Upload Section */}
                      <div className="border-2 border-dashed border-border rounded-lg p-6">
                        <div className="text-center">
                          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-sm text-muted-foreground mb-4">Upload medical records, lab results, prescriptions, etc.</p>
                          <div className="space-y-3">
                            <Input
                              placeholder="Add notes (optional)"
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
                              {isUploadingRecord ? 'Uploading...' : 'Upload Records'}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Records List */}
                      {recordsLoading ? (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">Loading records...</p>
                        </div>
                      ) : healthRecords.length === 0 ? (
                        <div className="text-center py-8">
                          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">No records uploaded yet</p>
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
                                    {new Date(record.uploaded_at).toLocaleDateString()}
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
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile Settings</CardTitle>
                    <CardDescription>Manage your account settings</CardDescription>
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
                              {isUploadingPhoto ? 'Uploading...' : 'Change Photo'}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Full Name</label>
                          <Input 
                            value={profileFormData.fullName || patientRegistration?.full_name || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, fullName: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Email</label>
                          <Input 
                            value={profileFormData.email || patientRegistration?.email || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, email: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Phone</label>
                          <Input 
                            value={profileFormData.phone || patientRegistration?.phone_number || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, phone: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Age</label>
                          <Input 
                            type="number"
                            value={profileFormData.age || patientRegistration?.age?.toString() || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, age: e.target.value})}
                            className="mt-1" 
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Blood Type</label>
                          <Input 
                            value={profileFormData.bloodType || patientRegistration?.blood_type || ''}
                            onChange={(e) => setProfileFormData({...profileFormData, bloodType: e.target.value})}
                            placeholder="e.g., A+, O-, B+"
                            className="mt-1" 
                          />
                        </div>
                      </div>

                      <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                        {isSavingProfile ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Change Password</CardTitle>
                    <CardDescription>Update your account password</CardDescription>
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
                    <span className="font-medium">Medication:</span> {selectedPrescription.medication}
                  </div>
                  <div>
                    <span className="font-medium">Dosage:</span> {selectedPrescription.dosage}
                  </div>
                  <div>
                    <span className="font-medium">Doctor:</span> {selectedPrescription.doctor}
                  </div>
                  <div>
                    <span className="font-medium">Date:</span> {new Date(selectedPrescription.date).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Status:</span> {selectedPrescription.status}
                  </div>
                  <div>
                    <span className="font-medium">Refills remaining:</span> {selectedPrescription.refillsRemaining}
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
                <Button variant="outline" onClick={() => handleDownloadPrescription(selectedPrescription)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button
                  onClick={() => handleRequestPrescriptionRefill(selectedPrescription)}
                  disabled={isRequestingRefillId === selectedPrescription.id}
                >
                  {isRequestingRefillId === selectedPrescription.id ? 'Sending...' : 'Request Refill'}
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setPrescriptionDetailsOpen(false)}>
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
                    <span className="font-medium">Date:</span> {new Date(selectedConsultation.date).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Status:</span> Completed
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
