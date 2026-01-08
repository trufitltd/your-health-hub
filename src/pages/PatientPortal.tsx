import { useState } from 'react';
import { motion } from 'framer-motion';
<<<<<<< HEAD
import {
  Calendar,
  Users,
  FileText,
  Bell,
  Plus,
  Clock,
  MapPin,
  Star,
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
    doctorName: 'Dr. Sarah Johnson',
    specialty: 'Cardiologist',
    date: 'Jan 15, 2025',
    time: '10:00 AM',
    status: 'Confirmed',
    avatar: '👨‍⚕️',
  },
  {
    id: 2,
    doctorName: 'Dr. Michael Chen',
    specialty: 'Dermatologist',
    date: 'Jan 20, 2025',
    time: '2:30 PM',
    status: 'Pending',
    avatar: '👨‍⚕️',
  },
];

const specialists = [
  {
    id: 1,
    name: 'Dr. Sarah Johnson',
    specialty: 'Cardiologist',
    rating: 4.9,
    patients: 1200,
    avatar: '👨‍⚕️',
    available: true,
  },
  {
    id: 2,
    name: 'Dr. Emily Davis',
    specialty: 'Neurologist',
    rating: 4.8,
    patients: 950,
    avatar: '👨‍⚕️',
    available: true,
  },
  {
    id: 3,
    name: 'Dr. James Wilson',
    specialty: 'Orthopedist',
    rating: 4.7,
    patients: 1100,
    avatar: '👨‍⚕️',
    available: false,
  },
];

const healthRecords = [
  {
    id: 1,
    type: 'Lab Results',
    date: 'Jan 10, 2025',
    description: 'Blood Test Results',
    status: 'Ready',
  },
  {
    id: 2,
    type: 'Prescription',
    date: 'Jan 5, 2025',
    description: 'Aspirin 500mg',
    status: 'Active',
  },
  {
    id: 3,
    type: 'Medical Report',
    date: 'Dec 28, 2024',
    description: 'Annual Checkup Report',
    status: 'Archived',
  },
];

export default function PatientPortal() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        {/* Header */}
        <div className="sticky top-16 z-40 bg-white border-b border-border/40 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  Welcome, {user?.user_metadata?.full_name || 'Patient'}
                </h1>
                <p className="text-muted-foreground mt-1">
                  Manage your health and appointments
                </p>
              </div>
              <Button variant="gradient" className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-2" />
                Book Appointment
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
                      Upcoming
                    </p>
                    <p className="text-2xl font-bold mt-2">2</p>
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
                      Specialists
                    </p>
                    <p className="text-2xl font-bold mt-2">5</p>
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
                      Records
                    </p>
                    <p className="text-2xl font-bold mt-2">12</p>
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
                      Messages
                    </p>
                    <p className="text-2xl font-bold mt-2">3</p>
                  </div>
                  <Bell className="w-10 h-10 text-primary/20" />
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Tabs Section */}
          <Tabs defaultValue="appointments" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="appointments">Appointments</TabsTrigger>
              <TabsTrigger value="specialists">Find Specialists</TabsTrigger>
              <TabsTrigger value="records">Health Records</TabsTrigger>
            </TabsList>

            {/* Appointments Tab */}
            <TabsContent value="appointments">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-6">Your Appointments</h2>
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
                              {apt.doctorName}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {apt.specialty}
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
                            View Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Specialists Tab */}
            <TabsContent value="specialists">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-6">
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold mb-4">Find a Specialist</h2>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by specialty..."
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {specialists
                      .filter(
                        (spec) =>
                          spec.name
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()) ||
                          spec.specialty
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase())
                      )
                      .map((specialist) => (
                        <div
                          key={specialist.id}
                          className="border border-border/40 rounded-lg p-4 hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="text-3xl">{specialist.avatar}</div>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                specialist.available
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {specialist.available ? 'Available' : 'Busy'}
                            </span>
                          </div>
                          <h3 className="font-semibold text-foreground mb-1">
                            {specialist.name}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-3">
                            {specialist.specialty}
                          </p>
                          <div className="flex items-center gap-4 text-sm mb-4">
                            <span className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              {specialist.rating}
                            </span>
                            <span className="text-muted-foreground">
                              {specialist.patients} patients
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            disabled={!specialist.available}
                          >
                            Book Now
                          </Button>
                        </div>
                      ))}
                  </div>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Health Records Tab */}
            <TabsContent value="records">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="p-6">
                  <h2 className="text-xl font-semibold mb-6">Medical Records</h2>
                  <div className="space-y-3">
                    {healthRecords.map((record) => (
                      <div
                        key={record.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-border/40 rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex-1 mb-4 sm:mb-0">
                          <h3 className="font-semibold text-foreground">
                            {record.type}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {record.description}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {record.date}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-medium ${
                              record.status === 'Ready'
                                ? 'bg-green-100 text-green-700'
                                : record.status === 'Active'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {record.status}
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
  Heart, Activity, Pill, Phone, Plus, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-success/10 text-success border-success/20">Confirmed</Badge>;
      case 'pending':
        return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search doctors, appointments..." 
                  className="pl-10 w-64 bg-muted/50"
                />
              </div>
              
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-[10px] text-accent-foreground rounded-full flex items-center justify-center">
                  2
                </span>
              </Button>

              <div className="flex items-center gap-3">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={patientData.avatar} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">SJ</AvatarFallback>
                </Avatar>
                <div className="hidden md:block">
                  <p className="text-sm font-medium">{patientData.name}</p>
                  <p className="text-xs text-muted-foreground">Patient</p>
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
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                        activeTab === item.id
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
                    Welcome back, {patientData.name.split(' ')[0]}! 👋
                  </h1>
                  <p className="text-primary-foreground/80">
                    You have {upcomingAppointments.length} upcoming appointments this week.
                  </p>
                </div>
                <Link to="/booking">
                  <Button variant="secondary" size="lg" className="gap-2">
                    <Plus className="w-5 h-5" />
                    Book Appointment
                  </Button>
                </Link>
              </div>
            </motion.div>

            {/* Quick Stats */}
            <div className="grid sm:grid-cols-3 gap-4">
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
                    <div className="space-y-4">
                      {upcomingAppointments.slice(0, 3).map((apt) => (
                        <div key={apt.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-4">
                            <Avatar>
                              <AvatarImage src={apt.avatar} />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {apt.doctor.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{apt.doctor}</p>
                              <p className="text-sm text-muted-foreground">{apt.specialty}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-2 mb-1">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{new Date(apt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                              <Clock className="w-4 h-4 text-muted-foreground ml-2" />
                              <span className="text-sm">{apt.time}</span>
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              {apt.type === 'Video Call' ? (
                                <Video className="w-4 h-4 text-primary" />
                              ) : (
                                <Phone className="w-4 h-4 text-primary" />
                              )}
                              {getStatusBadge(apt.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
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
                                  className={`w-3 h-3 ${
                                    i < consultation.rating
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
                    <Link to="/booking">
                      <Button className="gap-2">
                        <Plus className="w-4 h-4" />
                        New Appointment
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {upcomingAppointments.map((apt) => (
                        <div key={apt.id} className="flex items-center justify-between p-4 rounded-xl border border-border hover:shadow-md transition-all">
                          <div className="flex items-center gap-4">
                            <Avatar className="w-12 h-12">
                              <AvatarImage src={apt.avatar} />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {apt.doctor.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{apt.doctor}</p>
                              <p className="text-sm text-muted-foreground">{apt.specialty}</p>
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
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="flex items-center gap-2 mb-2">
                                {apt.type === 'Video Call' ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Video className="w-3 h-3" /> Video
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1">
                                    <Phone className="w-3 h-3" /> Audio
                                  </Badge>
                                )}
                              </div>
                              {getStatusBadge(apt.status)}
                            </div>
                            <Button size="sm" variant="outline">
                              Reschedule
                            </Button>
                            {apt.status === 'confirmed' && (
                              <Button size="sm" className="gradient-primary">
                                Join Call
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
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
                                    className={`w-4 h-4 ${
                                      i < consultation.rating
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
                <Card>
                  <CardHeader>
                    <CardTitle>Messages</CardTitle>
                    <CardDescription>Chat with your healthcare providers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No messages yet</p>
                      <p className="text-sm text-muted-foreground mt-1">Messages from your doctors will appear here</p>
                    </div>
                  </CardContent>
                </Card>
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
                          <AvatarFallback className="bg-primary text-primary-foreground text-2xl">SJ</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-lg">{patientData.name}</p>
                          <p className="text-muted-foreground">{patientData.email}</p>
                          <Button size="sm" variant="outline" className="mt-2">
                            Change Photo
                          </Button>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Full Name</label>
                          <Input defaultValue={patientData.name} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Email</label>
                          <Input defaultValue={patientData.email} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Phone</label>
                          <Input defaultValue={patientData.phone} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Date of Birth</label>
                          <Input type="date" defaultValue={patientData.dateOfBirth} className="mt-1" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Blood Type</label>
                          <Input defaultValue={patientData.bloodType} className="mt-1" />
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
>>>>>>> 18a84b69e2ce66b90473e8b40e9ac042d2c0aac5
