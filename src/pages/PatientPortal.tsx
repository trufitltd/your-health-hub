import { useState } from 'react';
import { motion } from 'framer-motion';
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
