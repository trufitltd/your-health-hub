import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SlotSelectionModal } from '@/components/SlotSelectionModal';
import { useAvailableSlots } from '@/hooks/useAvailableSlots';
import { useToast } from '@/hooks/use-toast';
import {
  Star, Search, Filter, Clock, MapPin, Award, Heart,
  ChevronRight, Loader
} from 'lucide-react';

interface Doctor {
  id: string;
  user_id: string;
  full_name: string;
  specialty: string;
  hospital_affiliation: string;
  profile_picture_url?: string;
  age: number;
  verification_status: string;
  city: string;
  state: string;
  rating?: number;
  total_reviews?: number;
  experience_years?: number;
  bio?: string;
}

export default function DoctorDiscovery() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [appointmentType, setAppointmentType] = useState<'general' | 'specialist' | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [slotSelectionOpen, setSlotSelectionOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [filters, setFilters] = useState({
    specialty: '',
    minRating: 0,
    minExperience: 0,
    hospital: '',
  });

  // Fetch doctors
  const { data: doctors = [], isLoading: doctorsLoading } = useQuery({
    queryKey: ['doctors-discovery'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctor_registrations')
        .select(`
          id,
          user_id,
          full_name,
          specialty,
          hospital_affiliation,
          profile_picture_url,
          age,
          verification_status,
          city,
          state,
          bio
        `)
        .eq('verification_status', 'approved')
        .order('full_name');

      if (error) throw error;

      // Fetch ratings for each doctor
      const doctorsWithRatings = await Promise.all(
        (data || []).map(async (doctor) => {
          const { data: ratingData } = await supabase
            .from('appointments')
            .select('rating')
            .eq('doctor_id', doctor.user_id)
            .not('rating', 'is', null);

          const ratings = (ratingData || []).map(r => r.rating).filter(Boolean);
          const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b) / ratings.length : 0;

          return {
            ...doctor,
            rating: avgRating,
            total_reviews: ratings.length,
            experience_years: Math.floor((new Date().getFullYear() - new Date(doctor.created_at || 0).getFullYear()) || 5),
          };
        })
      );

      return doctorsWithRatings;
    }
  });

  // Fetch available slots
  const { data: allSlots = [] } = useAvailableSlots();

  // Filter doctors based on search and filters
  const filteredDoctors = useMemo(() => {
    if (!appointmentType) return [];

    return doctors.filter(doctor => {
      const matchesSearch = 
        doctor.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doctor.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doctor.hospital_affiliation.toLowerCase().includes(searchQuery.toLowerCase());

      const isGeneralOrMatchesType =
        appointmentType === 'general' ? doctor.specialty.toLowerCase() === 'general practice' :
        appointmentType === 'specialist' ? doctor.specialty.toLowerCase() !== 'general practice' : true;

      const matchesSpecialty = !filters.specialty || doctor.specialty.toLowerCase().includes(filters.specialty.toLowerCase());
      const matchesRating = !filters.minRating || (doctor.rating || 0) >= filters.minRating;
      const matchesExperience = !filters.minExperience || (doctor.experience_years || 0) >= filters.minExperience;
      const matchesHospital = !filters.hospital || doctor.hospital_affiliation.toLowerCase().includes(filters.hospital.toLowerCase());

      return matchesSearch && isGeneralOrMatchesType && matchesSpecialty && matchesRating && matchesExperience && matchesHospital;
    });
  }, [appointmentType, searchQuery, filters, doctors]);

  // Get unique specialties and hospitals for filter dropdowns
  const specialties = useMemo(() => 
    [...new Set(doctors.map(d => d.specialty))].sort(), [doctors]
  );

  const hospitals = useMemo(() =>
    [...new Set(doctors.map(d => d.hospital_affiliation))].sort(), [doctors]
  );

  const handleViewProfile = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setProfileOpen(true);
  };

  const handleBookNow = (doctor: Doctor) => {
    if (!user) {
      toast({ title: 'Please sign in', description: 'You must be signed in to book appointments.' });
      navigate('/auth');
      return;
    }
    setSelectedDoctor(doctor);
    setSlotSelectionOpen(true);
  };

  const handleSlotSelect = async (doctor: any, date: string, time: string) => {
    if (!user) {
      toast({ title: 'Error', description: 'User not authenticated' });
      return;
    }

    setIsBooking(true);
    try {
      // Create appointment record in database
      const { error } = await supabase
        .from('appointments')
        .insert([
          {
            patient_id: user.id,
            doctor_id: selectedDoctor?.user_id,
            date: date,
            time: time,
            status: 'pending',
            notes: `${appointmentType} appointment requested`,
          }
        ]);

      if (error) {
        console.error('Booking error:', error);
        toast({ 
          title: 'Booking failed', 
          description: error.message || 'Failed to create appointment. Please try again.' 
        });
        setIsBooking(false);
        return;
      }

      // Success
      toast({ 
        title: 'Appointment booked!', 
        description: `Your appointment with ${selectedDoctor?.full_name} on ${new Date(date).toLocaleDateString()} at ${time} has been requested.` 
      });
      
      // Close modal and redirect
      setSlotSelectionOpen(false);
      setProfileOpen(false);
      setSelectedDoctor(null);
      setAppointmentType(null);
      
      // Redirect to patient portal appointments tab
      navigate('/patient-portal?tab=appointments');
    } catch (error) {
      console.error('Booking error:', error);
      toast({ 
        title: 'Error', 
        description: 'An unexpected error occurred. Please try again.' 
      });
    } finally {
      setIsBooking(false);
    }
  };

  const renderStars = (rating: number, count: number = 5) => {
    return [...Array(count)].map((_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < Math.round(rating)
          ? 'text-warning fill-warning'
          : 'text-muted'
        }`}
      />
    ));
  };

  return (
    <Layout>
      <div className="min-h-screen bg-muted/30 py-8 md:py-12">
        <div className="container mx-auto px-4 my-12">
          {!appointmentType ? (
            // Step 1: Choose appointment type
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto"
            >
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4">Find the Right Doctor</h1>
                <p className="text-lg text-muted-foreground">Start by choosing what you need</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {[
                  {
                    type: 'general' as const,
                    title: 'General Checkup',
                    description: 'See a general practitioner for routine checkups and health advice',
                    icon: '👨‍⚕️'
                  },
                  {
                    type: 'specialist' as const,
                    title: 'Specialist Consultation',
                    description: 'Consult with specialists in specific medical fields',
                    icon: '🏥'
                  }
                ].map(option => (
                  <motion.button
                    key={option.type}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setAppointmentType(option.type)}
                    className="text-left"
                  >
                    <Card className="h-full cursor-pointer border-2 hover:border-primary transition-all">
                      <CardContent className="p-8">
                        <div className="text-5xl mb-4">{option.icon}</div>
                        <h3 className="text-xl font-bold mb-2">{option.title}</h3>
                        <p className="text-muted-foreground">{option.description}</p>
                      </CardContent>
                    </Card>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            // Step 2: Doctor discovery with filters
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">Find a {appointmentType === 'specialist' ? 'Specialist' : 'General Practitioner'}</h2>
                    <p className="text-muted-foreground text-sm">Fee: ₦{appointmentType === 'specialist' ? '10,000' : '5,000'}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAppointmentType(null)}
                  >
                    Change Type
                  </Button>
                </div>

                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        placeholder="Search doctors, specialties, hospitals..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  {appointmentType === 'specialist' && (
                    <select
                      value={filters.specialty}
                      onChange={(e) => setFilters({ ...filters, specialty: e.target.value })}
                      className="px-4 py-2 border rounded-lg bg-background"
                    >
                      <option value="">All Specialties</option>
                      {specialties.filter(s => s.toLowerCase() !== 'general practice').map(specialty => (
                        <option key={specialty} value={specialty}>{specialty}</option>
                      ))}
                    </select>
                  )}

                  <select
                    value={filters.minRating}
                    onChange={(e) => setFilters({ ...filters, minRating: parseFloat(e.target.value) })}
                    className="px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value={0}>All Ratings</option>
                    <option value={3}>3+ Stars</option>
                    <option value={4}>4+ Stars</option>
                    <option value={4.5}>4.5+ Stars</option>
                  </select>

                  <select
                    value={filters.minExperience}
                    onChange={(e) => setFilters({ ...filters, minExperience: parseFloat(e.target.value) })}
                    className="px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value={0}>All Experience</option>
                    <option value={5}>5+ Years</option>
                    <option value={10}>10+ Years</option>
                    <option value={15}>15+ Years</option>
                  </select>

                  <select
                    value={filters.hospital}
                    onChange={(e) => setFilters({ ...filters, hospital: e.target.value })}
                    className="px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="">All Hospitals</option>
                    {hospitals.map(hospital => (
                      <option key={hospital} value={hospital}>{hospital}</option>
                    ))}
                  </select>
                </div>

                {/* Results info */}
                <div className="flex items-center justify-between mb-6">
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredDoctors.length} {appointmentType === 'specialist' ? 'specialists' : 'doctors'}
                  </p>
                  {Object.values(filters).some(v => v) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilters({ specialty: '', minRating: 0, minExperience: 0, hospital: '' })}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              </div>

              {/* Doctor Cards */}
              {doctorsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredDoctors.length === 0 ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-semibold mb-2">No doctors found</p>
                    <p className="text-muted-foreground mb-4">Try adjusting your filters or search query</p>
                    <Button
                      variant="outline"
                      onClick={() => setFilters({ specialty: '', minRating: 0, minExperience: 0, hospital: '' })}
                    >
                      Clear All Filters
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-3 gap-6">
                  {filteredDoctors.map(doctor => (
                    <motion.div
                      key={doctor.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="h-full flex flex-col hover:shadow-lg transition-shadow">
                        <CardContent className="p-6 flex-1 flex flex-col">
                          <div className="flex items-start justify-between mb-4">
                            <Avatar className="w-16 h-16">
                              <AvatarImage src={doctor.profile_picture_url} />
                              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                                {doctor.full_name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex gap-2 flex-col">
                              <Badge variant="outline" className="text-xs">
                                {doctor.experience_years}y exp
                              </Badge>
                              <Badge className="text-xs bg-blue-100 text-blue-800">
                                {appointmentType === 'specialist' ? 'Specialist' : 'General'}
                              </Badge>
                            </div>
                          </div>

                          <h3 className="font-bold text-lg mb-1">{doctor.full_name}</h3>
                          <p className="text-sm text-primary font-medium mb-2">{doctor.specialty}</p>
                          {doctor.bio && (
                            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{doctor.bio}</p>
                          )}

                          <div className="space-y-2 mb-4 flex-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="w-4 h-4" />
                              {doctor.city}, {doctor.state}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Award className="w-4 h-4" />
                              {doctor.hospital_affiliation}
                            </div>
                          </div>

                          {doctor.rating !== undefined && (
                            <div className="flex items-center gap-2 mb-4">
                              <div className="flex gap-1">
                                {renderStars(doctor.rating)}
                              </div>
                              <span className="text-sm font-medium">{doctor.rating?.toFixed(1)}</span>
                              <span className="text-xs text-muted-foreground">({doctor.total_reviews})</span>
                            </div>
                          )}

                          <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20">
                            <p className="text-sm font-semibold text-success">₦{appointmentType === 'specialist' ? '10,000' : '5,000'}</p>
                            <p className="text-xs text-muted-foreground">Consultation Fee</p>
                          </div>

                          <div className="flex gap-2 pt-4 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleViewProfile(doctor)}
                            >
                              View Profile
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleBookNow(doctor)}
                            >
                              Book Now
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Doctor Profile Modal */}
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedDoctor && (
              <>
                <DialogHeader>
                  <DialogTitle>Doctor Profile</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Header */}
                  <div className="flex gap-6">
                    <Avatar className="w-24 h-24">
                      <AvatarImage src={selectedDoctor.profile_picture_url} />
                      <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                        {selectedDoctor.full_name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold mb-2">Dr. {selectedDoctor.full_name}</h2>
                      <p className="text-lg text-primary font-medium mb-3">{selectedDoctor.specialty}</p>

                      <div className="flex items-center gap-4 mb-4">
                        {selectedDoctor.rating !== undefined && (
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1">
                              {renderStars(selectedDoctor.rating)}
                            </div>
                            <span className="font-medium">{selectedDoctor.rating?.toFixed(1)}</span>
                            <span className="text-sm text-muted-foreground">({selectedDoctor.total_reviews} reviews)</span>
                          </div>
                        )}
                      </div>

                      <Badge className="bg-success/10 text-success border-success/20">Verified Doctor</Badge>
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Experience</p>
                      <p className="font-semibold">{selectedDoctor.experience_years} Years</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Age</p>
                      <p className="font-semibold">{selectedDoctor.age} Years Old</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Hospital</p>
                      <p className="font-semibold text-sm">{selectedDoctor.hospital_affiliation}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Location</p>
                      <p className="font-semibold">{selectedDoctor.city}, {selectedDoctor.state}</p>
                    </div>
                  </div>

                  {/* Biography */}
                  <div>
                    <h3 className="font-semibold mb-3">Professional Biography</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {selectedDoctor.bio || `Dr. ${selectedDoctor.full_name} is a highly skilled ${selectedDoctor.specialty} with ${selectedDoctor.experience_years} years of professional experience. Currently practicing at ${selectedDoctor.hospital_affiliation}, dedicated to providing excellent patient care and maintaining the highest standards of medical practice.`}
                    </p>
                  </div>

                  {/* Reviews Section */}
                  <div>
                    <h3 className="font-semibold mb-3">Recent Reviews</h3>
                    <div className="space-y-3">
                      <div className="p-4 rounded-lg border border-border">
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-medium">Patient Name</p>
                          <div className="flex gap-1">
                            {renderStars(5, 5)}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">Professional and caring doctor. Highly recommended.</p>
                        <p className="text-xs text-muted-foreground mt-2">2 weeks ago</p>
                      </div>
                      <p className="text-center text-sm text-muted-foreground py-4">View full reviews after booking</p>
                    </div>
                  </div>

                  {/* Availability */}
                  <div>
                    <h3 className="font-semibold mb-3">Availability</h3>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setProfileOpen(false);
                        setSlotSelectionOpen(true);
                      }}
                    >
                      Select Available Time Slot
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Slot Selection Modal */}
        {selectedDoctor && (
          <SlotSelectionModal
            open={slotSelectionOpen}
            onOpenChange={setSlotSelectionOpen}
            slots={allSlots}
            isLoading={isBooking}
            onSlotSelect={handleSlotSelect}
            doctorId={selectedDoctor.user_id}
          />
        )}
      </div>
    </Layout>
  );
}
