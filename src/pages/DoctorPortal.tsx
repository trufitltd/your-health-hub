import { useState } from 'react';
import { motion } from 'framer-motion';
<<<<<<< HEAD
import {
  Calendar,
  Users,
  FileText,
  TrendingUp,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layout } from '@/components/layout';
import { useAuth } from '@/hooks/useAuth';

const appointments = [
  {
    id: 1,
    patientName: 'John Doe',
    date: 'Jan 15, 2025',
    time: '10:00 AM',
    status: 'Confirmed',
    type: 'Consultation',
    avatar: '👤',
  },
  {
    id: 2,
    patientName: 'Jane Smith',
    date: 'Jan 15, 2025',
    time: '11:30 AM',
    status: 'Confirmed',
    type: 'Follow-up',
    avatar: '👤',
  },
  {
    id: 3,
    patientName: 'Robert Johnson',
    date: 'Jan 16, 2025',
    time: '2:00 PM',
    status: 'Pending',
    type: 'Consultation',
    avatar: '👤',
  },
];

const patients = [
  {
    id: 1,
    name: 'John Doe',
    age: 35,
    condition: 'Hypertension',
    lastVisit: 'Jan 10, 2025',
    status: 'Active',
    avatar: '👤',
  },
  {
    id: 2,
    name: 'Jane Smith',
    age: 28,
    condition: 'Diabetes Management',
    lastVisit: 'Jan 8, 2025',
    status: 'Active',
    avatar: '👤',
  },
  {
    id: 3,
    name: 'Robert Johnson',
    age: 52,
    condition: 'Cardiac Care',
    lastVisit: 'Dec 20, 2024',
    status: 'Inactive',
    avatar: '👤',
  },
  {
    id: 4,
    name: 'Emily Davis',
    age: 41,
    condition: 'General Checkup',
    lastVisit: 'Jan 5, 2025',
    status: 'Active',
    avatar: '👤',
  },
];

const prescriptions = [
  {
    id: 1,
    patientName: 'John Doe',
    medication: 'Lisinopril 10mg',
    dosage: 'Once daily',
    duration: '30 days',
    status: 'Issued',
    date: 'Jan 10, 2025',
  },
  {
    id: 2,
    patientName: 'Jane Smith',
    medication: 'Metformin 500mg',
    dosage: 'Twice daily',
    duration: '90 days',
    status: 'Issued',
    date: 'Jan 8, 2025',
  },
  {
    id: 3,
    patientName: 'Emily Davis',
    medication: 'Vitamin D 1000IU',
    dosage: 'Once daily',
    duration: '60 days',
    status: 'Pending',
    date: 'Jan 15, 2025',
  },
];

export default function DoctorPortal() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50">
        {/* Header */}
        <div className="sticky top-16 z-40 bg-white border-b border-border/40 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  Dr. {user?.user_metadata?.full_name || 'Doctor'}
                </h1>
                <p className="text-muted-foreground mt-1">
                  Manage your patients and schedule
                </p>
              </div>
              <Button variant="gradient" className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                New Appointment
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Today's Appointments
                    </p>
                    <p className="text-2xl font-bold mt-2">4</p>
                  </div>
                  <Calendar className="w-10 h-10 text-primary/20" />
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Active Patients
                    </p>
                    <p className="text-2xl font-bold mt-2">28</p>
                  </div>
                  <Users className="w-10 h-10 text-primary/20" />
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Pending Prescriptions
                    </p>
                    <p className="text-2xl font-bold mt-2">3</p>
                  </div>
                  <FileText className="w-10 h-10 text-primary/20" />
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Patient Satisfaction
                    </p>
                    <p className="text-2xl font-bold mt-2">4.8/5</p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-primary/20" />
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Tabs Section */}
          <Tabs defaultValue="appointments" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="appointments">Appointments</TabsTrigger>
              <TabsTrigger value="patients">Patients</TabsTrigger>
              <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
            </TabsList>

            {/* Appointments Tab */}
            <TabsContent value="appointments">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-6">Upcoming Appointments</h2>
                  <div className="space-y-4">
                    {appointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-border/40 rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex items-start gap-4 mb-4 sm:mb-0">
                          <div className="text-3xl">{apt.avatar}</div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground">
                              {apt.patientName}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {apt.type}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {apt.date}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {apt.time}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-sm font-medium text-center ${
                              apt.status === 'Confirmed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {apt.status}
                          </span>
                          <Button variant="outline" size="sm" className="w-full sm:w-auto">
                            Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Patients Tab */}
            <TabsContent value="patients">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-6">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold mb-4">My Patients</h2>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search patients..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th className="text-left font-semibold py-3 px-3">Name</th>
                          <th className="text-left font-semibold py-3 px-3">Age</th>
                          <th className="text-left font-semibold py-3 px-3">Condition</th>
                          <th className="text-left font-semibold py-3 px-3">Last Visit</th>
                          <th className="text-left font-semibold py-3 px-3">Status</th>
                          <th className="text-left font-semibold py-3 px-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patients
                          .filter(
                            (patient) =>
                              patient.name
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()) ||
                              patient.condition
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase())
                          )
                          .map((patient) => (
                            <tr
                              key={patient.id}
                              className="border-b border-border/40 hover:bg-primary/5 transition-colors"
                            >
                              <td className="py-3 px-3 font-medium">{patient.name}</td>
                              <td className="py-3 px-3">{patient.age}</td>
                              <td className="py-3 px-3 text-muted-foreground">
                                {patient.condition}
                              </td>
                              <td className="py-3 px-3 text-muted-foreground">
                                {patient.lastVisit}
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                    patient.status === 'Active'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {patient.status}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <Button variant="ghost" size="sm">
                                  <ChevronRight className="w-4 h-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Prescriptions Tab */}
            <TabsContent value="prescriptions">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-6">Prescriptions</h2>
                  <div className="space-y-4">
                    {prescriptions.map((rx) => (
                      <div
                        key={rx.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-border/40 rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex-1 mb-4 sm:mb-0">
                          <h3 className="font-semibold text-foreground">
                            {rx.patientName}
                          </h3>
                          <p className="text-sm font-medium mt-1">{rx.medication}</p>
                          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-2 text-sm text-muted-foreground">
                            <span>{rx.dosage}</span>
                            <span>{rx.duration}</span>
                            <span>{rx.date}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-1 ${
                              rx.status === 'Issued'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {rx.status === 'Issued' ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <AlertCircle className="w-4 h-4" />
                            )}
                            {rx.status}
                          </span>
                          {rx.status === 'Pending' && (
                            <Button size="sm" variant="outline">
                              Issue
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
=======
import { Link } from 'react-router-dom';
import { 
  Calendar, Clock, Video, MessageSquare, FileText, 
  User, Bell, Settings, LogOut, ChevronRight, Star,
  Heart, Activity, Users, Phone, DollarSign, 
  TrendingUp, CheckCircle, XCircle, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

// Dummy Doctor Data
const doctorData = {
  name: 'Dr. Emily Chen',
  email: 'emily.chen@myedoctoronline.com',
  phone: '+1 (555) 987-6543',
  specialty: 'Cardiologist',
  experience: '12 years',
  rating: 4.9,
  totalReviews: 234,
  avatar: '',
  isAvailable: true,
};

const todaySchedule = [
  {
    id: 1,
    patient: 'Sarah Johnson',
    age: 35,
    time: '09:00 AM',
    endTime: '09:30 AM',
    type: 'Video Call',
    reason: 'Follow-up checkup',
    status: 'completed',
  },
  {
    id: 2,
    patient: 'Michael Brown',
    age: 45,
    time: '10:00 AM',
    endTime: '10:30 AM',
    type: 'Video Call',
    reason: 'Chest pain consultation',
    status: 'in-progress',
  },
  {
    id: 3,
    patient: 'Emma Wilson',
    age: 28,
    time: '11:00 AM',
    endTime: '11:30 AM',
    type: 'Audio Call',
    reason: 'First consultation',
    status: 'upcoming',
  },
  {
    id: 4,
    patient: 'James Lee',
    age: 52,
    time: '02:00 PM',
    endTime: '02:30 PM',
    type: 'Video Call',
    reason: 'Blood pressure review',
    status: 'upcoming',
  },
  {
    id: 5,
    patient: 'Lisa Martinez',
    age: 40,
    time: '03:30 PM',
    endTime: '04:00 PM',
    type: 'Video Call',
    reason: 'Annual checkup',
    status: 'upcoming',
  },
];

const pendingRequests = [
  {
    id: 1,
    patient: 'Robert Taylor',
    age: 55,
    requestedDate: '2026-01-10',
    requestedTime: '10:00 AM',
    reason: 'Heart palpitations',
    priority: 'high',
  },
  {
    id: 2,
    patient: 'Anna White',
    age: 32,
    requestedDate: '2026-01-11',
    requestedTime: '02:30 PM',
    reason: 'General checkup',
    priority: 'normal',
  },
  {
    id: 3,
    patient: 'David Kim',
    age: 48,
    requestedDate: '2026-01-12',
    requestedTime: '11:00 AM',
    reason: 'ECG review',
    priority: 'normal',
  },
];

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

const weeklySchedule = [
  { day: 'Monday', slots: ['09:00 AM - 12:00 PM', '02:00 PM - 05:00 PM'], enabled: true },
  { day: 'Tuesday', slots: ['09:00 AM - 12:00 PM', '02:00 PM - 05:00 PM'], enabled: true },
  { day: 'Wednesday', slots: ['09:00 AM - 12:00 PM'], enabled: true },
  { day: 'Thursday', slots: ['09:00 AM - 12:00 PM', '02:00 PM - 05:00 PM'], enabled: true },
  { day: 'Friday', slots: ['09:00 AM - 12:00 PM'], enabled: true },
  { day: 'Saturday', slots: [], enabled: false },
  { day: 'Sunday', slots: [], enabled: false },
];

const stats = {
  totalPatients: 156,
  consultationsThisMonth: 48,
  pendingRequests: 3,
  earnings: 12450,
  rating: 4.9,
};

const recentReviews = [
  {
    id: 1,
    patient: 'Sarah J.',
    rating: 5,
    comment: 'Dr. Chen is amazing! Very thorough and took time to explain everything.',
    date: '2025-12-20',
  },
  {
    id: 2,
    patient: 'Michael B.',
    rating: 5,
    comment: 'Excellent doctor. Highly recommend for any heart-related concerns.',
    date: '2025-12-18',
  },
  {
    id: 3,
    patient: 'Jennifer K.',
    rating: 4,
    comment: 'Very professional and knowledgeable. The wait was a bit long.',
    date: '2025-12-15',
  },
];

const DoctorPortal = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [isAvailable, setIsAvailable] = useState(doctorData.isAvailable);

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
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                <Heart className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">
                MyE<span className="text-primary">Doctor</span>Online
              </span>
            </Link>

            <div className="flex items-center gap-4">
              {/* Availability Toggle */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted">
                <span className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className="text-sm font-medium">{isAvailable ? 'Available' : 'Unavailable'}</span>
                <Switch 
                  checked={isAvailable} 
                  onCheckedChange={setIsAvailable}
                  className="ml-1"
                />
              </div>
              
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[10px] text-accent-foreground rounded-full flex items-center justify-center">
                  {stats.pendingRequests}
                </span>
              </Button>

              <div className="flex items-center gap-3">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={doctorData.avatar} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">EC</AvatarFallback>
                </Avatar>
                <div className="hidden md:block">
                  <p className="text-sm font-medium">{doctorData.name}</p>
                  <p className="text-xs text-muted-foreground">{doctorData.specialty}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-4">
                <nav className="space-y-1">
                  {[
                    { id: 'overview', label: 'Dashboard', icon: BarChart3 },
                    { id: 'schedule', label: 'Today\'s Schedule', icon: Calendar },
                    { id: 'requests', label: 'Requests', icon: Bell, badge: stats.pendingRequests },
                    { id: 'patients', label: 'My Patients', icon: Users },
                    { id: 'availability', label: 'Availability', icon: Clock },
                    { id: 'earnings', label: 'Earnings', icon: DollarSign },
                    { id: 'reviews', label: 'Reviews', icon: Star },
                    { id: 'settings', label: 'Settings', icon: Settings },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        activeTab === item.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="w-5 h-5" />
                        {item.label}
                      </div>
                      {item.badge && (
                        <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${
                          activeTab === item.id 
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
                  <Link to="/">
                    <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground">
                      <LogOut className="w-5 h-5" />
                      Sign Out
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3 space-y-6">
            {/* Welcome Banner */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl gradient-primary p-6 md:p-8 text-primary-foreground"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold mb-2">
                    Good morning, Dr. Chen! 👋
                  </h1>
                  <p className="text-primary-foreground/80">
                    You have {todaySchedule.filter(s => s.status === 'upcoming').length} consultations scheduled today.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-primary-foreground/80">Next appointment in</p>
                    <p className="text-2xl font-bold">25 min</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Quick Stats */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Patients', value: stats.totalPatients, icon: Users, color: 'bg-primary/10 text-primary' },
                { label: 'This Month', value: stats.consultationsThisMonth, icon: Calendar, color: 'bg-success/10 text-success' },
                { label: 'Pending', value: stats.pendingRequests, icon: Bell, color: 'bg-warning/10 text-warning' },
                { label: 'Rating', value: stats.rating, icon: Star, color: 'bg-accent/10 text-accent' },
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
                        {todaySchedule.slice(0, 4).map((apt) => (
                          <div key={apt.id} className={`flex items-center justify-between p-3 rounded-lg ${
                            apt.status === 'in-progress' ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'
                          }`}>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                  {apt.patient.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{apt.patient}</p>
                                <p className="text-xs text-muted-foreground">{apt.time}</p>
                              </div>
                            </div>
                            {getStatusBadge(apt.status)}
                          </div>
                        ))}
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
                        {pendingRequests.map((request) => (
                          <div key={request.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{request.patient}</p>
                                {getPriorityBadge(request.priority)}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{request.reason}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                                <XCircle className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-success">
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
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
                      <span className="font-bold">{doctorData.rating}</span>
                      <span className="text-muted-foreground text-sm">({doctorData.totalReviews} reviews)</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-3 gap-4">
                      {recentReviews.map((review) => (
                        <div key={review.id} className="p-4 rounded-xl bg-muted/50">
                          <div className="flex items-center gap-1 mb-2">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating
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
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Schedule Tab */}
              <TabsContent value="schedule" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Today's Appointments</CardTitle>
                    <CardDescription>January 6, 2026</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {todaySchedule.map((apt) => (
                        <div key={apt.id} className={`flex items-center justify-between p-4 rounded-xl border ${
                          apt.status === 'in-progress' 
                            ? 'border-primary bg-primary/5' 
                            : apt.status === 'completed'
                            ? 'border-success/30 bg-success/5'
                            : 'border-border'
                        }`}>
                          <div className="flex items-center gap-4">
                            <div className="text-center w-20">
                              <p className="text-sm font-semibold">{apt.time}</p>
                              <p className="text-xs text-muted-foreground">{apt.endTime}</p>
                            </div>
                            <div className="w-px h-12 bg-border" />
                            <Avatar className="w-12 h-12">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {apt.patient.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{apt.patient}</p>
                              <p className="text-sm text-muted-foreground">{apt.age} years old</p>
                              <p className="text-sm text-muted-foreground">{apt.reason}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              {apt.type === 'Video Call' ? (
                                <Badge variant="outline" className="gap-1 mb-2">
                                  <Video className="w-3 h-3" /> Video
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 mb-2">
                                  <Phone className="w-3 h-3" /> Audio
                                </Badge>
                              )}
                              <div>{getStatusBadge(apt.status)}</div>
                            </div>
                            {apt.status === 'upcoming' && (
                              <Button size="sm" className="gradient-primary">
                                Start Call
                              </Button>
                            )}
                            {apt.status === 'in-progress' && (
                              <Button size="sm" className="bg-success hover:bg-success/90">
                                Continue
                              </Button>
                            )}
                            {apt.status === 'completed' && (
                              <Button size="sm" variant="outline">
                                View Notes
                              </Button>
                            )}
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
                    <div className="space-y-4">
                      {pendingRequests.map((request) => (
                        <div key={request.id} className="flex items-center justify-between p-4 rounded-xl border border-border">
                          <div className="flex items-center gap-4">
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
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                {new Date(request.requestedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </p>
                              <p className="text-sm text-muted-foreground">{request.requestedTime}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                                Decline
                              </Button>
                              <Button size="sm" className="bg-success hover:bg-success/90">
                                Accept
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Patients Tab */}
              <TabsContent value="patients" className="space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>My Patients</CardTitle>
                      <CardDescription>All patients under your care</CardDescription>
                    </div>
                    <Input placeholder="Search patients..." className="w-64" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {patientList.map((patient) => (
                        <div key={patient.id} className="flex items-center justify-between p-4 rounded-xl border border-border hover:shadow-md transition-all">
                          <div className="flex items-center gap-4">
                            <Avatar className="w-12 h-12">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {patient.name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{patient.name}</p>
                              <p className="text-sm text-muted-foreground">{patient.age} years old • {patient.condition}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right text-sm">
                              <p className="text-muted-foreground">Last visit</p>
                              <p className="font-medium">{patient.lastVisit === 'New Patient' ? patient.lastVisit : new Date(patient.lastVisit).toLocaleDateString()}</p>
                            </div>
                            <Button size="sm" variant="outline">
                              View Profile
                            </Button>
                            <Button size="sm" variant="ghost">
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Availability Tab */}
              <TabsContent value="availability" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Weekly Availability</CardTitle>
                    <CardDescription>Set your consultation hours</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {weeklySchedule.map((day) => (
                        <div key={day.day} className="flex items-center justify-between p-4 rounded-xl border border-border">
                          <div className="flex items-center gap-4">
                            <Switch checked={day.enabled} />
                            <div>
                              <p className="font-semibold">{day.day}</p>
                              {day.enabled && day.slots.length > 0 ? (
                                <div className="flex gap-2 mt-1">
                                  {day.slots.map((slot, i) => (
                                    <Badge key={i} variant="secondary">{slot}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">Not available</p>
                              )}
                            </div>
                          </div>
                          {day.enabled && (
                            <Button size="sm" variant="outline">
                              Edit Slots
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Earnings Tab */}
              <TabsContent value="earnings" className="space-y-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
                          <DollarSign className="w-6 h-6 text-success" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">This Month</p>
                          <p className="text-2xl font-bold">${stats.earnings.toLocaleString()}</p>
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

              {/* Reviews Tab */}
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
                                  className={`w-4 h-4 ${
                                    i < review.rating
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

              {/* Settings Tab */}
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
                          <AvatarFallback className="bg-primary text-primary-foreground text-2xl">EC</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-lg">{doctorData.name}</p>
                          <p className="text-muted-foreground">{doctorData.specialty}</p>
                          <Button size="sm" variant="outline" className="mt-2">
                            Change Photo
                          </Button>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Full Name</label>
                          <Input defaultValue={doctorData.name} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Email</label>
                          <Input defaultValue={doctorData.email} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Phone</label>
                          <Input defaultValue={doctorData.phone} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Specialty</label>
                          <Input defaultValue={doctorData.specialty} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Experience</label>
                          <Input defaultValue={doctorData.experience} className="mt-1" />
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
>>>>>>> 18a84b69e2ce66b90473e8b40e9ac042d2c0aac5
