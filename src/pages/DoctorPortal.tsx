import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar, Clock, Video, MessageSquare, FileText,
  User, Bell, Settings, LogOut, ChevronRight, Star,
  Heart, Activity, Users, Phone, Banknote,
  TrendingUp, CheckCircle, XCircle, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useAppointments } from '@/hooks/useAppointments';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { JoinConsultationButton } from '@/components/consultation';
import { ScheduleEditor } from '@/components/ScheduleEditor';
import { useDoctorStats } from '@/hooks/useDoctorStats';
import { useRecentReviews } from '@/hooks/useRecentReviews';

// Dummy Doctor Data
const doctorData = {
  name: 'Dr. Emily Chen',
  email: 'emily.chen@myedoctor.com',
  phone: '+1 (555) 987-6543',
  specialty: 'Cardiologist',
  experience: '12 years',
  rating: 4.9,
  totalReviews: 234,
  avatar: '',
  isAvailable: true,
};



const patientList = [
  {
    id: 1,
    name: 'Sarah Johnson',
    age: 35,
    lastVisit: '2025-12-20',
    condition: 'Hypertension',
    nextAppointment: '2026-01-08',
  },
  {
    id: 2,
    name: 'Michael Brown',
    age: 45,
    lastVisit: '2025-12-15',
    condition: 'Arrhythmia',
    nextAppointment: '2026-01-06',
  },
  {
    id: 3,
    name: 'Emma Wilson',
    age: 28,
    lastVisit: 'New Patient',
    condition: 'Palpitations',
    nextAppointment: '2026-01-06',
  },
  {
    id: 4,
    name: 'James Lee',
    age: 52,
    lastVisit: '2025-11-28',
    condition: 'Heart Failure',
    nextAppointment: '2026-01-06',
  },
  {
    id: 5,
    name: 'Lisa Martinez',
    age: 40,
    lastVisit: '2025-10-15',
    condition: 'Preventive Care',
    nextAppointment: '2026-01-06',
  },
];

const DoctorPortal = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAvailable, setIsAvailable] = useState(doctorData.isAvailable);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  // Fetch doctor statistics
  const { data: doctorStats, isLoading: statsLoading } = useDoctorStats(user?.id);

  // Fetch recent reviews
  const { data: recentReviews = [], isLoading: reviewsLoading } = useRecentReviews(user?.id);

  // Fetch appointments for this doctor
  const { data: fetchedAppointments = [], isLoading: appointmentsLoading, refetch } = useQuery({
    queryKey: ['doctor-appointments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('doctor_id', user.id)
        .order('date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleAcceptRequest = async (appointmentId: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appointmentId);
      if (error) throw error;
      toast({ title: 'Accepted', description: 'Appointment has been confirmed.' });
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to accept appointment.' });
    }
  };

  const handleDeclineRequest = async (appointmentId: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'rejected' })
        .eq('id', appointmentId);
      if (error) throw error;
      toast({ title: 'Declined', description: 'Appointment has been declined.' });
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to decline appointment.' });
    }
  };

  // Calculate today's appointments and next appointment
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  
  const todaysAppointments = (fetchedAppointments || []).filter(apt => 
    apt.date === today && (apt.status === 'confirmed' || apt.status === 'pending')
  );
  
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
    age: 'N/A',
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
    earnings: 12450, // Keep static for now as we don't have earnings data
    rating: doctorStats?.rating || 0,
  };

  const displayName = user?.user_metadata?.full_name ?? user?.email ?? doctorData.name;
  const displayInitials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
        return <Badge className="bg-success/10 text-success border-success/20">Completed</Badge>;
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
              {/* Availability Toggle */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted">
                <span className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className="text-sm font-medium">{isAvailable ? 'Available' : 'Unavailable'}</span>
                <Switch
                  checked={isAvailable}
                  onCheckedChange={setIsAvailable}
                  className="ml-1"
                />
              </div>

              <Button variant="ghost" size="icon" className="relative" onClick={() => setActiveTab('requests')}>
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[10px] text-accent-foreground rounded-full flex items-center justify-center">
                  {stats.pendingRequests}
                </span>
              </Button>

              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Avatar className="w-9 h-9">
                  <AvatarImage src={user?.user_metadata?.avatar ?? doctorData.avatar} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">{displayInitials}</AvatarFallback>
                </Avatar>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium">{role === 'doctor' ? `Dr. ${displayName}` : displayName}</p>
                  <p className="text-xs text-muted-foreground">{user?.user_metadata?.specialty ?? doctorData.specialty}</p>
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
                    { id: 'schedule', label: 'My Appointments', icon: Calendar },
                    { id: 'requests', label: 'Requests', icon: Bell, badge: stats.pendingRequests },
                    { id: 'declined', label: 'Declined Appointments', icon: XCircle },
                    { id: 'patients', label: 'My Patients', icon: Users },
                    { id: 'availability', label: 'Availability', icon: Clock },
                    { id: 'earnings', label: 'Earnings', icon: Banknote },
                    { id: 'reviews', label: 'Reviews', icon: Star },
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
            {/* Welcome Banner */}
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
                    You have {todaysAppointments.length} consultations scheduled today.
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
                  {/* Today's Schedule Preview */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-lg">Today's Schedule</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('schedule')}>
                        View All <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {todaysAppointments.length === 0 ? (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground">No appointments scheduled for today</p>
                          </div>
                        ) : (
                          todaysAppointments.slice(0, 4).map((apt) => (
                            <div key={apt.id} className={`flex items-center justify-between p-3 rounded-lg ${
                              apt.status === 'confirmed' ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'
                            }`}>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-10 h-10">
                                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                    {apt.patient_name ? apt.patient_name.split(' ').map(n => n[0]).join('') : 'P'}
                                  </AvatarFallback>
                                </Avatar>
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
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('requests')}>
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
              <TabsContent value="schedule" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>My Appointments</CardTitle>
                    <CardDescription>All your confirmed and completed appointments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {fetchedAppointments.filter(apt => apt.status === 'confirmed' || apt.status === 'completed').map((apt) => (
                        <div key={apt.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border ${apt.status === 'in-progress'
                          ? 'border-primary bg-primary/5'
                          : apt.status === 'completed'
                            ? 'border-success/30 bg-success/5'
                            : 'border-border'
                          }`}>
                          <div className="flex items-center gap-4 mb-3 sm:mb-0">
                            <div className="text-center w-20">
                              <p className="text-sm font-semibold">{apt.time}</p>
                              <p className="text-xs text-muted-foreground">{new Date(apt.date).toLocaleDateString()}</p>
                            </div>
                            <div className="w-px h-12 bg-border" />
                            <Avatar className="w-12 h-12">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {apt.patient_name ? apt.patient_name.split(' ').map(n => n[0]).join('') : 'P'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{apt.patient_name}</p>
                              <p className="text-sm text-muted-foreground">{apt.notes || 'No notes'}</p>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="text-left sm:text-right">
                              {(() => {
                                const t = (apt.type || '').toString().toLowerCase();
                                if (t.includes('video')) {
                                  return (
                                    <Badge variant="outline" className="gap-1 mb-2">
                                      <Video className="w-3 h-3" /> Video
                                    </Badge>
                                  );
                                }
                                if (t.includes('chat')) {
                                  return (
                                    <Badge variant="outline" className="gap-1 mb-2">
                                      <MessageSquare className="w-3 h-3" /> Chat
                                    </Badge>
                                  );
                                }
                                return (
                                  <Badge variant="outline" className="gap-1 mb-2">
                                    <Phone className="w-3 h-3" /> Audio
                                  </Badge>
                                );
                              })()}
                              <div>{getStatusBadge(apt.status)}</div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              {apt.status === 'confirmed' && (
                                <JoinConsultationButton
                                  appointmentId={apt.id}
                                  consultationType={apt.type}
                                  participantName={apt.patient_name || ''}
                                  status={apt.status}
                                  variant="default"
                                  size="sm"
                                  className="gradient-primary w-full sm:w-auto"
                                />
                              )}
                              {apt.status === 'completed' && (
                                <Button size="sm" variant="outline" className="w-full sm:w-auto">
                                  View Notes
                                </Button>
                              )}
                              {apt.status === 'completed' && (apt as any).rating && (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground mr-1">Rated:</span>
                                  {[...Array(5)].map((_, i) => (
                                    <Star
                                      key={i}
                                      className={`w-3 h-3 ${i < (apt as any).rating
                                        ? 'text-warning fill-warning'
                                        : 'text-muted'
                                        }`}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Requests Tab */}
              <TabsContent value="requests" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Appointment Requests</CardTitle>
                    <CardDescription>Pending approval from patients</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pendingRequests.length === 0 ? (
                      <div className="text-center py-12">
                        <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No pending appointment requests</p>
                        <p className="text-sm text-muted-foreground mt-2">New requests will appear here when patients book appointments</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pendingRequests.map((request) => (
                          <div key={request.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border">
                            <div className="flex items-center gap-4 mb-3 sm:mb-0">
                              <Avatar className="w-12 h-12">
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {request.patient.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold">{request.patient}</p>
                                  {getPriorityBadge(request.priority)}
                                </div>
                                <p className="text-sm text-muted-foreground">{request.age} years old</p>
                                <p className="text-sm text-muted-foreground">{request.reason}</p>
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                              <div className="text-left sm:text-right">
                                <p className="text-sm font-medium">
                                  {new Date(request.requestedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </p>
                                <p className="text-sm text-muted-foreground">{request.requestedTime}</p>
                              </div>
                              <div className="flex flex-col gap-2 w-full sm:w-auto">
                                <Button size="sm" className="bg-success hover:bg-success/90 w-full" onClick={() => handleAcceptRequest(request.id)}>
                                  Accept
                                </Button>
                                <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 w-full" onClick={() => handleDeclineRequest(request.id)}>
                                  Decline
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Patients Tab */}
              <TabsContent value="declined" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Declined Appointments</CardTitle>
                    <CardDescription>A list of all appointments you have declined.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {fetchedAppointments.filter(apt => apt.status === 'rejected').map((apt) => (
                        <div key={apt.id} className="flex items-center justify-between p-4 rounded-xl border border-destructive/20 bg-destructive/5">
                          <div className="flex items-center gap-4">
                            <Avatar className="w-12 h-12">
                              <AvatarFallback className="bg-destructive/10 text-destructive">
                                {apt.patient_name ? apt.patient_name.split(' ').map(n => n[0]).join('') : 'P'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{apt.patient_name}</p>
                              <p className="text-sm text-muted-foreground">{apt.notes || 'No notes'}</p>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-medium text-destructive">Declined</p>
                            <p className="text-muted-foreground">{new Date(apt.date).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
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
                      {patientList.map((patient) => (
                        <div key={patient.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border hover:shadow-md transition-all">
                          <div className="flex items-center gap-4 mb-3 sm:mb-0">
                            <Avatar className="w-12 h-12">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {patient.name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{patient.name}</p>
                              <p className="text-sm text-muted-foreground">{patient.age} years old • {patient.condition}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Last visit: {patient.lastVisit === 'New Patient' ? patient.lastVisit : new Date(patient.lastVisit).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                            <div className="text-left sm:text-right mb-2 sm:mb-0">
                              <p className="text-xs text-muted-foreground">Next appointment</p>
                              <p className="text-sm font-medium">{new Date(patient.nextAppointment).toLocaleDateString()}</p>
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
                      ))}
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
                              <p className="text-2xl font-bold">₦{stats.earnings.toLocaleString()}</p>
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
                              <p className="text-2xl font-bold">+12%</p>
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
                              <p className="text-2xl font-bold">{stats.consultationsThisMonth}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Earnings History</CardTitle>
                        <CardDescription>Your consultation earnings over time</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64 flex items-center justify-center text-muted-foreground">
                          <BarChart3 className="w-12 h-12 mr-3" />
                          <span>Earnings chart coming soon</span>
                        </div>
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
                                <span className="text-3xl font-bold">{doctorData.rating}</span>
                              </div>
                              <p className="text-sm text-muted-foreground">{doctorData.totalReviews} reviews</p>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
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
                      </CardContent>
                    </Card>
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
                              <AvatarImage src={user?.user_metadata?.avatar ?? doctorData.avatar} />
                              <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{displayInitials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-lg">{role === 'doctor' ? `Dr. ${displayName}` : displayName}</p>
                              <p className="text-muted-foreground">{user?.user_metadata?.specialty ?? doctorData.specialty}</p>
                              <Button size="sm" variant="outline" className="mt-2">
                                Change Photo
                              </Button>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium">Full Name</label>
                              <Input defaultValue={user?.user_metadata?.full_name ?? doctorData.name} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Email</label>
                              <Input defaultValue={user?.email ?? doctorData.email} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Phone</label>
                              <Input defaultValue={user?.user_metadata?.phone ?? doctorData.phone} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Specialty</label>
                              <Input defaultValue={user?.user_metadata?.specialty ?? doctorData.specialty} className="mt-1" />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Experience</label>
                              <Input defaultValue={user?.user_metadata?.experience ?? doctorData.experience} className="mt-1" />
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

export default DoctorPortal;
