import { useState } from 'react';
import { motion } from 'framer-motion';
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
