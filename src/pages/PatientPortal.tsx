import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

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
  Heart, Activity, Pill, Phone, Plus, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessagesTab } from '@/components/patient-portal/MessagesTab';

// Dummy Patient Data
const patientData = {
  name: 'Sarah Johnson',
  email: 'sarah.johnson@email.com',
  phone: '+1 (555) 123-4567',
  dateOfBirth: '1990-05-15',
  bloodType: 'O+',
  avatar: '',
  memberSince: 'January 2024',
};

const upcomingAppointments = [
  {
    id: 1,
    doctor: 'Dr. Emily Chen',
    specialty: 'Cardiologist',
    date: '2026-01-08',
    time: '10:00 AM',
    type: 'Video Call',
    avatar: '',
    status: 'confirmed',
  },
  {
    id: 2,
    doctor: 'Dr. Michael Roberts',
    specialty: 'General Medicine',
    date: '2026-01-12',
    time: '2:30 PM',
    type: 'Audio Call',
    avatar: '',
    status: 'pending',
  },
  {
    id: 3,
    doctor: 'Dr. Lisa Wang',
    specialty: 'Dermatologist',
    date: '2026-01-15',
    time: '11:00 AM',
    type: 'Video Call',
    avatar: '',
    status: 'confirmed',
  },
];

const pastConsultations = [
  {
    id: 1,
    doctor: 'Dr. James Wilson',
    specialty: 'General Medicine',
    date: '2025-12-20',
    diagnosis: 'Seasonal Flu',
    prescription: true,
    rating: 5,
  },
  {
    id: 2,
    doctor: 'Dr. Emily Chen',
    specialty: 'Cardiologist',
    date: '2025-12-05',
    diagnosis: 'Routine Checkup',
    prescription: false,
    rating: 4,
  },
  {
    id: 3,
    doctor: 'Dr. Sarah Martinez',
    specialty: 'Nutritionist',
    date: '2025-11-28',
    diagnosis: 'Diet Plan Review',
    prescription: false,
    rating: 5,
  },
];

const prescriptions = [
  {
    id: 1,
    medication: 'Lisinopril 10mg',
    dosage: 'Once daily',
    doctor: 'Dr. Emily Chen',
    date: '2025-12-20',
    refillsRemaining: 2,
    status: 'active',
  },
  {
    id: 2,
    medication: 'Vitamin D3 1000IU',
    dosage: 'Once daily with food',
    doctor: 'Dr. James Wilson',
    date: '2025-12-20',
    refillsRemaining: 5,
    status: 'active',
  },
  {
    id: 3,
    medication: 'Amoxicillin 500mg',
    dosage: 'Three times daily',
    doctor: 'Dr. James Wilson',
    date: '2025-12-20',
    refillsRemaining: 0,
    status: 'completed',
  },
];

const healthMetrics = [
  { label: 'Blood Pressure', value: '120/80', unit: 'mmHg', trend: 'stable', icon: Heart },
  { label: 'Heart Rate', value: '72', unit: 'bpm', trend: 'stable', icon: Activity },
  { label: 'Weight', value: '65', unit: 'kg', trend: 'down', icon: User },
];

const notifications = [
  { id: 1, message: 'Reminder: Appointment with Dr. Emily Chen tomorrow', time: '2 hours ago', read: false },
  { id: 2, message: 'Your prescription for Vitamin D3 is ready for pickup', time: '1 day ago', read: false },
  { id: 3, message: 'Dr. James Wilson sent you a message', time: '2 days ago', read: true },
];

const PatientPortal = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { appointments, isLoading: appointmentsLoading, invalidateAppointments } = useAppointments();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const displayName = user?.user_metadata?.full_name ?? user?.email ?? patientData.name;
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
    navigate('/booking');
  };

  // Booking modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [slotSelectionOpen, setSlotSelectionOpen] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [specialistName, setSpecialistName] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingType, setBookingType] = useState<'Video' | 'Audio' | 'Chat'>('Video');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [rescheduleDoctorId, setRescheduleDoctorId] = useState<string | null>(null);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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
    resetBookingState();
    setSlotSelectionOpen(true);
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
        type: bookingType,
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
        type: bookingType,
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-success/10 text-success border-success/20">Confirmed</Badge>;
      case 'pending':
        return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
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
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <Heart className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">
                MyE<span className="text-primary">Doctor</span>
              </span>
            </Link>

            <div className="flex items-center gap-4">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search doctors, appointments..."
                  className="pl-10 w-48 sm:w-64 bg-muted/50"
                />
              </div>

              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[10px] text-accent-foreground rounded-full flex items-center justify-center">
                  2
                </span>
              </Button>

              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Avatar className="w-9 h-9">
                  <AvatarImage src={user?.user_metadata?.avatar ?? patientData.avatar} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">Patient</p>
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
                    { id: 'overview', label: 'Overview', icon: Activity },
                    { id: 'appointments', label: 'Appointments', icon: Calendar },
                    { id: 'consultations', label: 'Consultations', icon: Video },
                    { id: 'prescriptions', label: 'Prescriptions', icon: Pill },
                    { id: 'messages', label: 'Messages', icon: MessageSquare },
                    { id: 'records', label: 'Health Records', icon: FileText },
                    { id: 'settings', label: 'Settings', icon: Settings },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm font-medium transition-all ${activeTab === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.label}
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
                    <Label>Type</Label>
                    <select className="w-full p-2 border rounded" value={bookingType} onChange={(e) => setBookingType(e.target.value as 'Video' | 'Audio' | 'Chat')}>
                      <option value="Video">Video Call</option>
                      <option value="Audio">Audio Call</option>
                      <option value="Chat">Chat Consultation</option>
                    </select>
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

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {healthMetrics.map((metric, index) => (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{metric.label}</p>
                          <p className="text-2xl font-bold mt-1">
                            {metric.value} <span className="text-sm font-normal text-muted-foreground">{metric.unit}</span>
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <metric.icon className="w-6 h-6 text-primary" />
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
                <TabsTrigger value="appointments">Appointments</TabsTrigger>
                <TabsTrigger value="consultations">Consultations</TabsTrigger>
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
                              <Avatar>
                                <AvatarImage src="" />
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}</p>
                                <p className="text-sm text-muted-foreground">{apt.type}</p>
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
                              {(apt.status === 'confirmed' || apt.status === 'pending') && (
                                <JoinConsultationButton
                                  appointmentId={apt.id}
                                  consultationType={apt.type}
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
                      <div className="space-y-4">
                        {pastConsultations.slice(0, 2).map((consultation) => (
                          <div key={consultation.id} className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{consultation.doctor}</p>
                              <p className="text-xs text-muted-foreground">{consultation.diagnosis}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(consultation.date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3 h-3 ${i < consultation.rating
                                    ? 'text-warning fill-warning'
                                    : 'text-muted'
                                    }`}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Notifications */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Notifications</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Appointments Tab */}
              <TabsContent value="appointments" className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>All Appointments</CardTitle>
                      <CardDescription>Manage your scheduled appointments</CardDescription>
                    </div>
                    <Button onClick={openBooking} className="gap-2">
                      <Plus className="w-4 h-4" />
                      New Appointment
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {appointmentsLoading ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Loading appointments...</p>
                      </div>
                    ) : appointments.length === 0 ? (
                      <div className="text-center py-12">
                        <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No appointments yet</p>
                        <Button onClick={openBooking} className="mt-4 gap-2">
                          <Plus className="w-4 h-4" />
                          Book Your First Appointment
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {appointments.map((apt) => (
                          <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border hover:shadow-md transition-all">
                            <div className="flex items-center gap-4 mb-3 sm:mb-0">
                              <Avatar className="w-12 h-12">
                                <AvatarImage src="" />
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
                                <p className="text-sm text-muted-foreground">{apt.type}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(apt.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </span>
                                  <span className="text-xs flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {apt.time}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3">
                              <div className="text-left sm:text-right">
                                <div className="flex items-center gap-2 mb-2">
                                  {(apt as unknown as { type?: string }).type === 'Video' ? (
                                    <Badge variant="outline" className="gap-1">
                                      <Video className="w-3 h-3" /> Video
                                    </Badge>
                                  ) : (apt as unknown as { type?: string }).type === 'Chat' ? (
                                    <Badge variant="outline" className="gap-1">
                                      <MessageSquare className="w-3 h-3" /> Chat
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="gap-1">
                                      <Phone className="w-3 h-3" /> Audio
                                    </Badge>
                                  )}
                                </div>
                                {getStatusBadge(apt.status)}
                              </div>
                              <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <Button size="sm" variant="outline" onClick={() => initReschedule(apt)} className="w-full">
                                  Reschedule
                                </Button>
                                {apt.status === 'pending' && (
                                  <Button size="sm" variant="destructive" onClick={() => setCancelAppointmentId((apt as unknown as { id?: string }).id ?? null)} className="w-full">
                                    Cancel
                                  </Button>
                                )}
                                {(apt.status === 'confirmed' || apt.status === 'pending') && (
                                  <JoinConsultationButton
                                    appointmentId={apt.id}
                                    consultationType={apt.type}
                                    participantName={getDoctorNameById((apt as unknown as { doctor_id?: string }).doctor_id, apt.specialist_name)}
                                    status={apt.status}
                                    variant="default"
                                    size="sm"
                                    className="w-full"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Consultations Tab */}
              <TabsContent value="consultations" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Consultation History</CardTitle>
                    <CardDescription>View your past consultations and diagnoses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {pastConsultations.map((consultation) => (
                        <div key={consultation.id} className="p-4 rounded-xl border border-border">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-semibold">{consultation.doctor}</p>
                              <p className="text-sm text-muted-foreground">{consultation.specialty}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">{new Date(consultation.date).toLocaleDateString()}</p>
                              <div className="flex items-center gap-1 mt-1">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-4 h-4 ${i < consultation.rating
                                      ? 'text-warning fill-warning'
                                      : 'text-muted'
                                      }`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm"><span className="text-muted-foreground">Diagnosis:</span> {consultation.diagnosis}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {consultation.prescription && (
                                <Badge variant="outline" className="gap-1">
                                  <Pill className="w-3 h-3" /> Prescription
                                </Badge>
                              )}
                              <Button size="sm" variant="ghost">
                                View Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Prescriptions Tab */}
              <TabsContent value="prescriptions" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>My Prescriptions</CardTitle>
                    <CardDescription>Active and past prescriptions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {prescriptions.map((prescription) => (
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
                          {prescription.status === 'active' && (
                            <div className="mt-3 pt-3 border-t border-border flex justify-end gap-2">
                              <Button size="sm" variant="outline">
                                View Details
                              </Button>
                              <Button size="sm">
                                Request Refill
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Messages Tab */}
              <TabsContent value="messages" className="space-y-6">
                <MessagesTab />
              </TabsContent>

              {/* Records Tab */}
              <TabsContent value="records" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Health Records</CardTitle>
                    <CardDescription>Your medical history and documents</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No records uploaded yet</p>
                      <Button className="mt-4">Upload Records</Button>
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
                          <AvatarImage src={user?.user_metadata?.avatar ?? patientData.avatar} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-lg">{displayName}</p>
                          <p className="text-muted-foreground">{user?.email ?? patientData.email}</p>
                          <Button size="sm" variant="outline" className="mt-2">
                            Change Photo
                          </Button>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Full Name</label>
                          <Input defaultValue={user?.user_metadata?.full_name ?? patientData.name} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Email</label>
                          <Input defaultValue={user?.email ?? patientData.email} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Phone</label>
                          <Input defaultValue={user?.user_metadata?.phone ?? patientData.phone} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Date of Birth</label>
                          <Input type="date" defaultValue={user?.user_metadata?.dateOfBirth ?? patientData.dateOfBirth} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Blood Type</label>
                          <Input defaultValue={user?.user_metadata?.bloodType ?? patientData.bloodType} className="mt-1" />
                        </div>
                      </div>

                      <Button>Save Changes</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </div>
  );
};

export default PatientPortal;
