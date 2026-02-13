import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useDoctorPresence } from '@/hooks/useDoctorPresence';
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
  is_active?: boolean;
  online_status?: 'online' | 'away' | 'offline';
}

export default function DoctorDiscovery() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { presenceMap } = useDoctorPresence();
  const [doctorTypeFilter, setDoctorTypeFilter] = useState<'all' | 'general' | 'specialist'>('all');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    specialty: '',
    minRating: 0,
    minExperience: 0,
    hospital: '',
  });
  const [availabilityMode, setAvailabilityMode] = useState<'none' | 'now' | 'exact' | 'range'>('none');
  const [availabilityFilters, setAvailabilityFilters] = useState({
    date: '',
    time: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Handle scroll to show/hide filters
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY < 50) {
        setShowFilters(true);
      } else if (currentScrollY > lastScrollY) {
        // Scrolling down
        setShowFilters(false);
      } else {
        // Scrolling up
        setShowFilters(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Helper: Get current date/time in correct format
  const getNowDatetime = () => {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().slice(0, 5);
    return { date, time };
  };

  // Fetch doctors who have an available schedule based on mode
  const { data: availableDoctorIds = [] } = useQuery({
    queryKey: ['available-doctors', availabilityMode, availabilityFilters],
    queryFn: async () => {
      let checkTimes: Array<{ date: string; time: string; dayIndex: number }> = [];

      if (availabilityMode === 'now') {
        const { date, time } = getNowDatetime();
        const dayIndex = new Date(date).getDay();
        checkTimes.push({ date, time, dayIndex });
      } else if (availabilityMode === 'exact') {
        if (!availabilityFilters.date || !availabilityFilters.time) return [];
        const dayIndex = new Date(availabilityFilters.date).getDay();
        checkTimes.push({ 
          date: availabilityFilters.date, 
          time: availabilityFilters.time, 
          dayIndex 
        });
      } else if (availabilityMode === 'range') {
        if (!availabilityFilters.startDate || !availabilityFilters.startTime) return [];
        const endD = availabilityFilters.endDate || availabilityFilters.startDate;
        const endT = availabilityFilters.endTime || '23:59';
        
        let current = new Date(availabilityFilters.startDate);
        const end = new Date(endD);
        
        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          const dayIndex = current.getDay();
          checkTimes.push({ date: dateStr, time: availabilityFilters.startTime, dayIndex });
          checkTimes.push({ date: dateStr, time: endT, dayIndex });
          current.setDate(current.getDate() + 1);
        }
      }

      if (checkTimes.length === 0) return [];

      const doctorSet = new Set<string>();

      for (const { dayIndex, time } of checkTimes) {
        const { data: schedules, error } = await supabase
          .from('doctor_schedules')
          .select('doctor_id')
          .eq('day_of_week', dayIndex)
          .eq('is_available', true)
          .lte('start_time', time)
          .gt('end_time', time);
        
        if (error) throw error;
        (schedules || []).forEach(s => doctorSet.add(s.doctor_id));
      }

      return Array.from(doctorSet);
    },
    enabled: availabilityMode !== 'none',
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
          bio,
          experience
        `)
        .eq('verification_status', 'approved')
        .order('full_name');

      if (error) throw error;

      // Fetch ratings for each doctor
      const doctorsWithRatings = await Promise.all(
        (data || []).map(async (doctor) => {
          // Fetch doctor availability status
          const { data: doctorStatus } = await supabase
            .from('doctors')
            .select('is_active')
            .eq('id', doctor.user_id)
            .single();

          // Check if doctor has any available schedules
          const { data: schedules } = await supabase
            .from('doctor_schedules')
            .select('id')
            .eq('doctor_id', doctor.user_id)
            .eq('is_available', true)
            .limit(1);

          // Fetch ratings
          const { data: ratingData } = await supabase
            .from('appointments')
            .select('rating')
            .eq('doctor_id', doctor.user_id)
            .not('rating', 'is', null);

          const ratings = (ratingData || []).map(r => r.rating).filter(Boolean);
          const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b) / ratings.length : 0;

          const hasAvailableSchedules = (schedules || []).length > 0;
          const isActive = doctorStatus?.is_active !== false;

          return {
            ...doctor,
            rating: avgRating,
            total_reviews: ratings.length,
            experience_years: doctor.experience || 5,
            is_active: isActive && hasAvailableSchedules, // Only active if both conditions are true
          };
        })
      );

      return doctorsWithRatings.filter(doctor => doctor.is_active !== false);
    }
  });

  // Merge presence data with doctors
  const doctorsWithPresence = useMemo(() => {
    console.log('[DoctorDiscovery] Current presence map:', presenceMap);
    console.log('[DoctorDiscovery] Doctors:', doctors.map(d => ({ user_id: d.user_id, auth_user_id: d.auth_user_id, name: d.full_name })));
    return doctors.map(doctor => {
      // Use user_id which matches the auth user ID
      const status = presenceMap[doctor.user_id] || 'offline';
      console.log(`[DoctorDiscovery] Doctor ${doctor.full_name} (user_id: ${doctor.user_id}): ${status}`);
      return {
        ...doctor,
        online_status: status as 'online' | 'away' | 'offline',
      };
    });
  }, [doctors, presenceMap]);

  // Real-time subscription for doctor schedules and availability
  useEffect(() => {
    const channel = supabase
      .channel('doctor-discovery-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctor_schedules' },
        (payload) => {
          console.log('Doctor schedule changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['doctors-discovery'] });
          queryClient.invalidateQueries({ queryKey: ['available-doctors'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'doctors' },
        (payload) => {
          console.log('Doctor status changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['doctors-discovery'] });
          queryClient.invalidateQueries({ queryKey: ['available-doctors'] });
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Filter doctors based on search and filters
  const filteredDoctors = useMemo(() => {
    return doctorsWithPresence.filter(doctor => {
      const matchesSearch = 
        doctor.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doctor.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doctor.hospital_affiliation.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesDoctorType =
        doctorTypeFilter === 'all' ? true :
        doctorTypeFilter === 'general' ? doctor.specialty.toLowerCase() === 'general practice' :
        doctorTypeFilter === 'specialist' ? doctor.specialty.toLowerCase() !== 'general practice' : true;

      const matchesSpecialty = !filters.specialty || doctor.specialty.toLowerCase().includes(filters.specialty.toLowerCase());
      const matchesRating = !filters.minRating || (doctor.rating || 0) >= filters.minRating;
      const matchesExperience = !filters.minExperience || (doctor.experience_years || 0) >= filters.minExperience;
      const matchesHospital = !filters.hospital || doctor.hospital_affiliation.toLowerCase().includes(filters.hospital.toLowerCase());
      const matchesAvailability = availabilityMode === 'none' || availableDoctorIds.includes(doctor.user_id);

      return matchesSearch && matchesDoctorType && matchesSpecialty && matchesRating && matchesExperience && matchesHospital && matchesAvailability;
    });
  }, [searchQuery, filters, doctorsWithPresence, availabilityMode, availableDoctorIds, doctorTypeFilter]);

  // Get unique specialties and hospitals for filter dropdowns
  const specialties = useMemo(() => 
    [...new Set(doctorsWithPresence.map(d => d.specialty))].sort(), [doctorsWithPresence]
  );

  const hospitals = useMemo(() =>
    [...new Set(doctorsWithPresence.map(d => d.hospital_affiliation))].sort(), [doctorsWithPresence]
  );

  const handleViewProfile = (doctor: Doctor) => {
    setSelectedDoctor(doctor);
    setProfileOpen(true);
  };

  // Helper: Get consultation fee based on specialty
  const getConsultationFee = (specialty: string) => {
    const isSpecialist = specialty && specialty.toLowerCase() !== 'general practice';
    return isSpecialist ? 10000 : 5000;
  };

  // Helper: Get status color and label
  const getStatusColor = (status?: 'online' | 'away' | 'offline') => {
    switch (status) {
      case 'online':
        return { bg: 'bg-green-500', text: 'Online', ring: 'ring-green-500' };
      case 'away':
        return { bg: 'bg-amber-500', text: 'Away', ring: 'ring-amber-500' };
      case 'offline':
      default:
        return { bg: 'bg-gray-400', text: 'Offline', ring: 'ring-gray-400' };
    }
  };

  // Helper: Format date for display
  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Helper: Format time for display
  const formatTimeForDisplay = (timeStr: string) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Helper: Get availability filter display text
  const getAvailabilityFilterText = () => {
    if (availabilityMode === 'now') {
      return 'Available now';
    } else if (availabilityMode === 'exact' && availabilityFilters.date && availabilityFilters.time) {
      return `${formatDateForDisplay(availabilityFilters.date)} at ${formatTimeForDisplay(availabilityFilters.time)}`;
    } else if (availabilityMode === 'range' && availabilityFilters.startDate && availabilityFilters.startTime) {
      const startText = `${formatDateForDisplay(availabilityFilters.startDate)} ${formatTimeForDisplay(availabilityFilters.startTime)}`;
      if (availabilityFilters.endDate && availabilityFilters.endTime) {
        const endText = `${formatDateForDisplay(availabilityFilters.endDate)} ${formatTimeForDisplay(availabilityFilters.endTime)}`;
        return `${startText} - ${endText}`;
      }
      return `From ${startText}`;
    }
    return null;
  };

  const handleBookNow = (doctor: Doctor) => {
    if (!user) {
      toast({ title: 'Please sign in', description: 'You must be signed in to book appointments.' });
      navigate('/auth');
      return;
    }
    if (!doctor.is_active) {
      toast({ 
        title: 'Doctor Unavailable', 
        description: `${doctor.full_name} is currently unavailable. Please choose another doctor.` 
      });
      return;
    }
    // Navigate to slot selection page
    navigate('/slot-selection', {
      state: {
        doctorId: doctor.user_id,
        doctorName: doctor.full_name,
        specialty: doctor.specialty,
        profilePicture: doctor.profile_picture_url,
      }
    });
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
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-4xl font-bold mb-2">Find a Doctor</h1>
              <p className="text-lg text-muted-foreground">Browse our network of qualified healthcare professionals</p>
            </div>

            {/* Sticky Filter Bar */}
            <div className={`sticky top-12 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-y border-border py-4 mb-6 -mx-4 px-4 transition-transform duration-300 ${showFilters ? 'translate-y-0' : '-translate-y-full'}`}>
              <div className="space-y-4">
                {/* Primary Filters */}
                <div className="flex flex-wrap gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search doctors, specialties..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  <select
                    value={doctorTypeFilter}
                    onChange={(e) => setDoctorTypeFilter(e.target.value as 'all' | 'general' | 'specialist')}
                    className="px-4 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer"
                  >
                    <option value="all">All Doctors</option>
                    <option value="general">General Practice</option>
                    <option value="specialist">Specialists</option>
                  </select>

                  <select
                    value={filters.specialty}
                    onChange={(e) => setFilters({ ...filters, specialty: e.target.value })}
                    className="px-4 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer"
                  >
                    <option value="">All Specialties</option>
                    {specialties.map(specialty => (
                      <option key={specialty} value={specialty}>{specialty}</option>
                    ))}
                  </select>

                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={availabilityMode === 'now'}
                      onChange={(e) => setAvailabilityMode(e.target.checked ? 'now' : 'none')}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm font-medium">Available Now</span>
                  </label>

                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => setShowAvailabilityDialog(true)}
                    className="gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    {getAvailabilityFilterText() || 'Availability'}
                  </Button>
                </div>

                {/* Secondary Filters */}
                <div className="flex flex-wrap gap-3 items-center">
                  <select
                    value={filters.minRating}
                    onChange={(e) => setFilters({ ...filters, minRating: parseFloat(e.target.value) })}
                    className="px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                  >
                    <option value={0}>Any Rating</option>
                    <option value={3}>3+ ⭐</option>
                    <option value={4}>4+ ⭐</option>
                    <option value={4.5}>4.5+ ⭐</option>
                  </select>

                  <select
                    value={filters.minExperience}
                    onChange={(e) => setFilters({ ...filters, minExperience: parseFloat(e.target.value) })}
                    className="px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                  >
                    <option value={0}>Any Experience</option>
                    <option value={5}>5+ Years</option>
                    <option value={10}>10+ Years</option>
                    <option value={15}>15+ Years</option>
                  </select>

                  <select
                    value={filters.hospital}
                    onChange={(e) => setFilters({ ...filters, hospital: e.target.value })}
                    className="px-3 py-2 border rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer text-sm"
                  >
                    <option value="">All Hospitals</option>
                    {hospitals.map(hospital => (
                      <option key={hospital} value={hospital}>{hospital}</option>
                    ))}
                  </select>

                  {(availabilityMode === 'exact' || availabilityMode === 'range') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAvailabilityMode('none');
                        setAvailabilityFilters({ date: '', time: '', startDate: '', startTime: '', endDate: '', endTime: '' });
                      }}
                      className="gap-1"
                    >
                      <span>Clear Date Filter</span>
                      <span className="text-lg">✕</span>
                    </Button>
                  )}

                  {(Object.values(filters).some(v => v) || searchQuery || doctorTypeFilter !== 'all' || availabilityMode !== 'none') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFilters({ specialty: '', minRating: 0, minExperience: 0, hospital: '' });
                        setSearchQuery('');
                        setDoctorTypeFilter('all');
                        setAvailabilityMode('none');
                        setAvailabilityFilters({ date: '', time: '', startDate: '', startTime: '', endDate: '', endTime: '' });
                      }}
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <Filter className="w-4 h-4" />
                      Clear All
                    </Button>
                  )}
                </div>

                {/* Results Count */}
                <div className="flex items-center justify-between text-sm">
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{filteredDoctors.length}</span> doctors found
                  </p>
                </div>
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
                    <Card className={`h-full flex flex-col hover:shadow-lg transition-shadow ${!doctor.is_active ? 'opacity-60' : ''}`}>
                      <CardContent className="p-6 flex-1 flex flex-col">
                        <div className="flex items-start justify-between mb-4">
                            <div className="relative">
                              <Avatar className="w-16 h-16">
                                <AvatarImage src={doctor.profile_picture_url} />
                                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                                  {doctor.full_name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full ${getStatusColor(doctor.online_status).bg} ring-2 ring-white`} title={getStatusColor(doctor.online_status).text} />
                            </div>
                            <div className="flex gap-2 flex-col">
                              <Badge variant="outline" className="text-xs">
                                {doctor.experience_years}y exp
                              </Badge>
                              <Badge className="text-xs bg-blue-100 text-blue-800">
                                {doctor.specialty.toLowerCase() === 'general practice' ? 'General' : 'Specialist'}
                              </Badge>
                              {!doctor.is_active && (
                                <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                                  Unavailable
                                </Badge>
                              )}
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
                            <p className="text-sm font-semibold text-success">₦{getConsultationFee(doctor.specialty).toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">Consultation Fee</p>
                          </div>

                          <div className="flex gap-2 pt-4 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleViewProfile(doctor)}
                              disabled={!doctor.is_active}
                            >
                              View Profile
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleBookNow(doctor)}
                              disabled={!doctor.is_active}
                            >
                              {doctor.is_active ? 'Book Now' : 'Unavailable'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
          </motion.div>
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
                    <div className="relative">
                      <Avatar className="w-24 h-24">
                        <AvatarImage src={selectedDoctor.profile_picture_url} />
                        <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                          {selectedDoctor.full_name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute bottom-0 right-0 w-5 h-5 rounded-full ${getStatusColor(selectedDoctor.online_status).bg} ring-2 ring-white`} title={getStatusColor(selectedDoctor.online_status).text} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-2xl font-bold">Dr. {selectedDoctor.full_name}</h2>
                        <Badge variant="outline" className="text-xs">{getStatusColor(selectedDoctor.online_status).text}</Badge>
                      </div>
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
                        handleBookNow(selectedDoctor!);
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

        {/* Availability Selection Dialog */}
        <Dialog open={showAvailabilityDialog} onOpenChange={setShowAvailabilityDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Select Date & Time</DialogTitle>
              <DialogDescription>
                Choose when you'd like to see a doctor
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Specific Date & Time */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={availabilityMode === 'exact'}
                    onChange={() => setAvailabilityMode('exact')}
                    className="w-4 h-4"
                  />
                  <span className="font-medium">Specific date & time</span>
                </label>
                {availabilityMode === 'exact' && (
                  <div className="ml-7">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                        <Input
                          type="date"
                          value={availabilityFilters.date}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, date: e.target.value })}
                          className="px-3 py-2"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                        <Input
                          type="time"
                          step={1800}
                          value={availabilityFilters.time}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, time: e.target.value })}
                          className="px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Date & Time Range */}
              <div className="space-y-3 pt-4 border-t">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={availabilityMode === 'range'}
                    onChange={() => setAvailabilityMode('range')}
                    className="w-4 h-4"
                  />
                  <span className="font-medium">Date & time range</span>
                </label>
                {availabilityMode === 'range' && (
                  <div className="ml-7 space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">From</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={availabilityFilters.startDate}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, startDate: e.target.value })}
                          className="px-3 py-2 flex-1"
                        />
                        <Input
                          type="time"
                          step={1800}
                          value={availabilityFilters.startTime}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, startTime: e.target.value })}
                          className="px-3 py-2 flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">To (optional)</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={availabilityFilters.endDate}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, endDate: e.target.value })}
                          className="px-3 py-2 flex-1"
                        />
                        <Input
                          type="time"
                          step={1800}
                          value={availabilityFilters.endTime}
                          onChange={(e) => setAvailabilityFilters({ ...availabilityFilters, endTime: e.target.value })}
                          className="px-3 py-2 flex-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAvailabilityDialog(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => setShowAvailabilityDialog(false)}
                disabled={
                  (availabilityMode === 'exact' && (!availabilityFilters.date || !availabilityFilters.time)) ||
                  (availabilityMode === 'range' && (!availabilityFilters.startDate || !availabilityFilters.startTime))
                }
              >
                Apply Filter
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
